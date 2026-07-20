const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { spawn } = require('node:child_process')
const { version: APP_VERSION } = require('../package.json')

const REQUEST_TIMEOUT_MS = 12_000
const TASK_PAGE_SIZE = 12
const MAX_COMPLETED_SCAN_PAGES = 10

const ACTION_PROMPTS = {
  continue:
    '继续处理这个任务。先检查当前状态和未完成项，然后完成下一步；如需危险或不可逆操作，请先向我确认。',
  summary:
    '请只读检查当前任务，简要总结：已完成、未完成、风险和下一步。不要修改文件。',
  review:
    '请审查当前任务相关改动，重点检查正确性、回归风险和缺失测试。先只报告发现，不要修改文件。',
  test_fix:
    '请检查当前任务状态，运行相关测试并修复失败；在执行危险或不可逆操作前先向我确认。',
}

function resolveCodexCommand() {
  const candidates = [
    process.env.CODEX_CLI_PATH,
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin', 'codex.exe'),
  ].filter(Boolean)

  return candidates.find((candidate) => fs.existsSync(candidate)) || 'codex'
}

function sourceName(source) {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object') return Object.keys(source)[0] || 'unknown'
  return 'unknown'
}

function runtimeStatus(thread, archived, latestTurn) {
  if (archived) return 'archived'
  if (thread.status?.type === 'active') return 'active'
  if (latestTurn?.status === 'completed') return 'completed'
  if (latestTurn?.status === 'failed') return 'failed'
  if (latestTurn?.status === 'interrupted') return 'interrupted'
  return 'idle'
}

function cleanTitle(thread) {
  const candidate = String(thread.name || thread.preview || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!candidate) return '未命名任务'
  return candidate.length > 64 ? `${candidate.slice(0, 63)}…` : candidate
}

class CodexAppServerClient {
  constructor({ onServerRequest, onServerRequestsCleared } = {}) {
    this.process = null
    this.reader = null
    this.nextId = 1
    this.pending = new Map()
    this.serverRequests = new Map()
    this.startPromise = null
    this.lastError = ''
    this.onServerRequest =
      typeof onServerRequest === 'function' ? onServerRequest : null
    this.onServerRequestsCleared =
      typeof onServerRequestsCleared === 'function'
        ? onServerRequestsCleared
        : null
  }

  async ensureStarted() {
    if (this.process && !this.process.killed) return
    if (this.startPromise) return this.startPromise

    this.startPromise = new Promise((resolve, reject) => {
      const command = resolveCodexCommand()
      this.lastError = ''
      const child = spawn(command, ['app-server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      this.process = child

      child.once('error', (error) => {
        this.lastError = error.message
        this.failAll(error)
        if (this.process === child) this.process = null
        this.reader?.close()
        this.reader = null
        reject(error)
      })

      child.on('exit', (code) => {
        const error = new Error(
          this.lastError || `Codex App Server 已退出（${code ?? 'unknown'}）`,
        )
        this.failAll(error)
        if (this.process === child) this.process = null
        this.reader?.close()
        this.reader = null
        this.serverRequests.clear()
        this.onServerRequestsCleared?.()
      })

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => {
        const text = String(chunk).trim()
        if (text) this.lastError = text.slice(-600)
      })

      this.reader = readline.createInterface({ input: child.stdout })
      this.reader.on('line', (line) => this.handleLine(line))

      this.requestRaw('initialize', {
        clientInfo: {
          name: 'codex_gesture_dock',
          title: 'Codex Gesture Dock',
          version: APP_VERSION,
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [
            'item/agentMessage/delta',
            'item/reasoning/textDelta',
            'item/reasoning/summaryTextDelta',
          ],
        },
      })
        .then(() => {
          this.notify('initialized', {})
          resolve()
        })
        .catch((error) => {
          if (this.process === child) this.process = null
          this.reader?.close()
          this.reader = null
          if (!child.killed && child.exitCode === null) child.kill()
          reject(error)
        })
    }).finally(() => {
      this.startPromise = null
    })

    return this.startPromise
  }

  handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }

    if (message.id === undefined || message.id === null) return
    const requestId = String(message.id)
    const pending = this.pending.get(requestId)
    if (!pending) {
      if (typeof message.method === 'string') {
        this.serverRequests.set(requestId, message.id)
        this.onServerRequest?.({
          id: requestId,
          method: message.method,
          params: message.params ?? {},
        })
      }
      return
    }
    this.pending.delete(requestId)
    clearTimeout(pending.timer)

    if (message.error) {
      pending.reject(
        new Error(message.error.message || 'Codex App Server 请求失败'),
      )
      return
    }
    pending.resolve(message.result)
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  send(message) {
    if (!this.process?.stdin?.writable) {
      throw new Error('Codex App Server 尚未连接')
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  notify(method, params) {
    this.send({ method, params })
  }

  respondToServerRequest(requestId, result) {
    const responseId = this.serverRequests.get(String(requestId))
    if (responseId === undefined) {
      throw new Error('Codex 审批请求已失效')
    }
    this.send({ id: responseId, result })
    this.serverRequests.delete(String(requestId))
  }

  rejectServerRequest(requestId, message = '当前控制器不支持此请求') {
    const responseId = this.serverRequests.get(String(requestId))
    if (responseId === undefined) return false
    this.send({
      id: responseId,
      error: { code: -32601, message },
    })
    this.serverRequests.delete(String(requestId))
    return true
  }

  requestRaw(method, params) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id))
        reject(new Error(`Codex 请求超时：${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(String(id), { reject, resolve, timer })
      try {
        this.send({ method, id, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(String(id))
        reject(error)
      }
    })
  }

  async request(method, params) {
    await this.ensureStarted()
    return this.requestRaw(method, params)
  }

  async latestTurn(threadId) {
    try {
      const response = await this.request('thread/turns/list', {
        threadId,
        limit: 1,
        sortDirection: 'desc',
        itemsView: 'notLoaded',
      })
      return response?.data?.[0] || null
    } catch {
      return null
    }
  }

  async listTasks(filter) {
    const archived = filter === 'archived'
    const tasks = []
    let cursor = null
    let pageCount = 0

    do {
      const response = await this.request('thread/list', {
        archived,
        cursor,
        limit: TASK_PAGE_SIZE,
        sortKey: 'updated_at',
        sortDirection: 'desc',
      })
      const threads = Array.isArray(response?.data) ? response.data : []
      const latestTurns = archived
        ? threads.map(() => null)
        : await Promise.all(threads.map((thread) => this.latestTurn(thread.id)))

      for (const [index, thread] of threads.entries()) {
        const cwd = String(thread.cwd || '')
        const task = {
          archived,
          createdAt: Number(thread.createdAt || 0),
          cwd,
          id: String(thread.id),
          preview: String(thread.preview || ''),
          project: path.basename(cwd) || os.hostname(),
          source: sourceName(thread.source),
          status: runtimeStatus(thread, archived, latestTurns[index]),
          title: cleanTitle(thread),
          updatedAt: Number(thread.updatedAt || 0),
        }
        if (filter !== 'completed' || task.status === 'completed') tasks.push(task)
      }

      cursor = typeof response?.nextCursor === 'string' ? response.nextCursor : null
      pageCount += 1
    } while (
      filter === 'completed' &&
      tasks.length < TASK_PAGE_SIZE &&
      cursor &&
      pageCount < MAX_COMPLETED_SCAN_PAGES
    )

    return tasks.slice(0, TASK_PAGE_SIZE)
  }

  async archiveTask(threadId) {
    await this.request('thread/archive', { threadId })
  }

  async startTaskAction(threadId, action) {
    const prompt = ACTION_PROMPTS[action]
    if (!prompt) throw new Error('不支持的 Codex 任务操作')
    const input = [{ type: 'text', text: prompt }]

    const resumed = await this.request('thread/resume', {
      threadId,
      excludeTurns: true,
    })
    const resumedThreadId = String(resumed?.thread?.id || threadId)

    if (resumed?.thread?.status?.type === 'active') {
      const activeTurn = await this.latestTurn(resumedThreadId)
      if (!activeTurn?.id || activeTurn.status !== 'inProgress') {
        throw new Error('任务正在运行，但无法确定当前回合；请先在 Codex 中打开查看')
      }
      await this.request('turn/steer', {
        threadId: resumedThreadId,
        expectedTurnId: activeTurn.id,
        input,
      })
      return resumedThreadId
    }

    await this.request('turn/start', {
      threadId: resumedThreadId,
      input,
    })
    return resumedThreadId
  }

  close() {
    this.failAll(new Error('Codex App Server 连接已关闭'))
    this.serverRequests.clear()
    this.onServerRequestsCleared?.()
    this.reader?.close()
    this.reader = null
    if (this.process && !this.process.killed) this.process.kill()
    this.process = null
  }
}

module.exports = {
  ACTION_PROMPTS,
  CodexAppServerClient,
}
