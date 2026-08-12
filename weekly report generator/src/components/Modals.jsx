import { useMemo, useState } from 'react'
import {
  Check,
  Clipboard,
  Download,
  ExternalLink,
  Github,
  LoaderCircle,
  PencilLine,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { reportTypes } from '../data'
import { buildReport, downloadMarkdown } from '../report'

function ModalShell({ title, subtitle, onClose, size = '', children }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header"><span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</span><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
        {children}
      </section>
    </div>
  )
}

export function AddActivityModal({ projects, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', detail: '', project: projects[0]?.name || '', status: '已完成' })
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = (event) => {
    event.preventDefault()
    if (!form.title.trim()) return
    onSave(form)
  }
  return (
    <ModalShell title="记录工作进展" subtitle="手工补充无法从代码或项目状态中捕获的工作。" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label><span>进展标题</span><input autoFocus value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：完成客户评审并确认下一步" /></label>
        <label><span>补充说明</span><textarea value={form.detail} onChange={(event) => update('detail', event.target.value)} placeholder="补充影响、结果或相关背景" rows="4" /></label>
        <div className="form-grid"><label><span>所属项目</span><select value={form.project} onChange={(event) => update('project', event.target.value)}>{projects.map((project) => <option key={project.id}>{project.name}</option>)}</select></label><label><span>状态</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option>已完成</option><option>进行中</option><option>有阻塞</option><option>已记录</option></select></label></div>
        <footer className="modal-footer"><button type="button" className="button ghost" onClick={onClose}>取消</button><button className="button primary">保存记录</button></footer>
      </form>
    </ModalShell>
  )
}

export function ImportModal({ onClose, onImport }) {
  const [repo, setRepo] = useState('openai/openai-cookbook')
  const [state, setState] = useState({ loading: false, error: '', count: 0 })
  const importActivity = async () => {
    const normalized = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(normalized)) {
      setState({ loading: false, error: '请输入 owner/repository 或完整 GitHub 仓库地址。', count: 0 })
      return
    }
    setState({ loading: true, error: '', count: 0 })
    try {
      const response = await fetch(`https://api.github.com/repos/${normalized}/commits?per_page=5`, { headers: { Accept: 'application/vnd.github+json' } })
      if (!response.ok) throw new Error(response.status === 403 ? 'GitHub 访问频率受限，请稍后再试。' : '未找到该公开仓库。')
      const commits = await response.json()
      const now = new Date()
      const items = commits.map((commit, index) => ({
        id: Date.now() + index,
        time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        title: commit.commit.message.split('\n')[0],
        detail: `${commit.sha.slice(0, 7)} · ${commit.commit.author?.name || 'GitHub contributor'}`,
        project: normalized.split('/')[1],
        source: 'github',
        status: '已导入',
        tone: 'blue',
        date: now.toISOString().slice(0, 10),
      }))
      onImport(items)
      setState({ loading: false, error: '', count: items.length })
    } catch (error) {
      setState({ loading: false, error: error.message || '导入失败，请稍后重试。', count: 0 })
    }
  }
  return (
    <ModalShell title="导入 GitHub 活动" subtitle="从公开仓库拉取最近提交，作为报告的可追溯证据。" onClose={onClose}>
      <div className="integration-banner"><span className="integration-icon"><Github size={24} /></span><span><strong>GitHub 公共仓库</strong><small>当前版本无需令牌；私有仓库连接可在后续接入。</small></span><ExternalLink size={16} /></div>
      <div className="modal-form"><label><span>仓库地址</span><input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="owner/repository" /></label>{state.error && <p className="form-error">{state.error}</p>}{state.count > 0 && <p className="form-success"><Check size={15} /> 已导入 {state.count} 条提交活动</p>}<footer className="modal-footer"><button className="button ghost" onClick={onClose}>完成</button><button className="button primary" onClick={importActivity} disabled={state.loading}>{state.loading ? <LoaderCircle className="spin" size={16} /> : <Github size={16} />} {state.loading ? '正在导入' : '开始导入'}</button></footer></div>
    </ModalShell>
  )
}

export function ProjectUpdateModal({ projects, initialProjectId, onClose, onSave }) {
  const selected = projects.find((project) => project.id === Number(initialProjectId)) || projects[0]
  const [form, setForm] = useState({
    projectId: selected?.id || '',
    progress: selected?.progress || 0,
    status: selected?.status || '进行中',
    completed: '',
    next: '',
    blockers: '',
    milestoneName: selected?.milestoneName || '',
    milestone: selected?.milestone || '',
  })
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const chooseProject = (value) => {
    const project = projects.find((item) => item.id === Number(value))
    if (!project) return
    setForm((current) => ({
      ...current,
      projectId: project.id,
      progress: project.progress,
      status: project.status,
      milestoneName: project.milestoneName,
      milestone: project.milestone,
    }))
  }
  const submit = (event) => {
    event.preventDefault()
    onSave(form)
  }
  return (
    <ModalShell title="更新项目进度" subtitle="直接填写真实进展，不需要先创建活动记录或提交证据。" onClose={onClose} size="modal-project-update">
      <form className="modal-form project-update-form" onSubmit={submit}>
        <div className="form-grid">
          <label><span>项目</span><select value={form.projectId} onChange={(event) => chooseProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label><span>项目状态</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option>未开始</option><option>进行中</option><option>有风险</option><option>已阻塞</option><option>已完成</option></select></label>
        </div>
        <label className="progress-field"><span>整体进度 <strong>{form.progress}%</strong></span><span className="progress-controls"><input type="range" min="0" max="100" step="1" value={form.progress} onChange={(event) => update('progress', event.target.value)} /><input className="progress-number" aria-label="整体进度百分比" type="number" min="0" max="100" value={form.progress} onChange={(event) => update('progress', event.target.value)} /></span></label>
        <label><span>本阶段完成</span><textarea autoFocus rows="3" value={form.completed} onChange={(event) => update('completed', event.target.value)} placeholder="例如：完成需求评审，确认范围并交付第一版方案" /></label>
        <label><span>下一步计划</span><textarea rows="3" value={form.next} onChange={(event) => update('next', event.target.value)} placeholder="例如：7月25日前完成客户确认并进入开发" /></label>
        <label><span>风险与阻塞 <small>没有可留空</small></span><textarea rows="2" value={form.blockers} onChange={(event) => update('blockers', event.target.value)} placeholder="填写依赖、资源、时间或决策风险" /></label>
        <div className="form-grid">
          <label><span>下一里程碑</span><input value={form.milestoneName} onChange={(event) => update('milestoneName', event.target.value)} placeholder="里程碑名称" /></label>
          <label><span>计划日期</span><input type="date" value={form.milestone} onChange={(event) => update('milestone', event.target.value)} /></label>
        </div>
        <footer className="modal-footer"><button type="button" className="button ghost" onClick={onClose}>取消</button><button className="button primary">保存项目更新</button></footer>
      </form>
    </ModalShell>
  )
}

export function GenerateReportModal({ initialType, activities, projects, projectUpdates, onClose, onSave, dateLabel }) {
  const [type, setType] = useState(initialType)
  const [notes, setNotes] = useState({ title: '', project: projects[0]?.name || '', summary: '', achievements: '', ongoing: '', blockers: '', next: '' })
  const [copied, setCopied] = useState(false)
  const content = useMemo(() => buildReport({
    type,
    activities,
    projects: type === 'project' ? projects.filter((project) => project.name === notes.project) : projects,
    projectUpdates,
    notes,
    dateLabel,
  }), [type, activities, projects, projectUpdates, notes, dateLabel])
  const update = (key, value) => setNotes((current) => ({ ...current, [key]: value }))
  const copy = async () => { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  const save = () => {
    const typeLabel = reportTypes.find((item) => item.id === type)?.label || '报告'
    const title = notes.title.trim() || `${dateLabel}工作${typeLabel}`
    onSave({ id: Date.now(), type, typeLabel, title, content, createdAt: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
  }
  return (
    <ModalShell title="生成工作报告" subtitle="自主填写为主，项目进度和活动记录仅作为可选辅助。" onClose={onClose} size="modal-wide">
      <div className="generator-layout">
        <div className="generator-form">
          <div className="compact-tabs">{reportTypes.map((item) => <button className={type === item.id ? 'active' : ''} key={item.id} onClick={() => setType(item.id)}>{item.label}</button>)}</div>
          <label><span>报告标题 <small>可选</small></span><input value={notes.title} onChange={(event) => update('title', event.target.value)} placeholder="自动使用周期与报告类型" /></label>
          {type === 'project' && <label><span>项目范围</span><select value={notes.project} onChange={(event) => update('project', event.target.value)}>{projects.map((project) => <option key={project.id}>{project.name}</option>)}</select></label>}
          <label><span>管理摘要 <small>可选</small></span><textarea value={notes.summary} onChange={(event) => update('summary', event.target.value)} rows="3" placeholder="本周期最重要的结果与影响" /></label>
          <label><span>本期完成事项</span><textarea value={notes.achievements} onChange={(event) => update('achievements', event.target.value)} rows="3" placeholder="每行一项；不填写时可引用最近的项目更新" /></label>
          <label><span>正在推进</span><textarea value={notes.ongoing} onChange={(event) => update('ongoing', event.target.value)} rows="3" placeholder="填写仍在推进中的重点工作" /></label>
          <label><span>风险与阻塞 <small>可选</small></span><textarea value={notes.blockers} onChange={(event) => update('blockers', event.target.value)} rows="3" placeholder="不填写时将引用项目更新或风险状态" /></label>
          <label><span>下一步计划</span><textarea value={notes.next} onChange={(event) => update('next', event.target.value)} rows="3" placeholder="每行一个计划；你的输入会覆盖自动建议" /></label>
          <div className="evidence-note"><PencilLine size={16} /><span><strong>以你的输入为准</strong><small>已同步 {projectUpdates.length} 条项目更新；另有 {activities.length} 条活动记录可选引用。</small></span></div>
        </div>
        <div className="generator-preview"><div className="preview-toolbar"><strong>Markdown 预览</strong><span><button className="icon-button" onClick={copy} title="复制">{copied ? <Check size={17} /> : <Clipboard size={17} />}</button><button className="icon-button" onClick={() => downloadMarkdown(`${notes.title || '汇报流报告'}.md`, content)} title="下载"><Download size={17} /></button></span></div><pre>{content}</pre></div>
      </div>
      <footer className="modal-footer generator-footer"><span>保存后可在“报告中心”继续查看</span><button className="button ghost" onClick={onClose}>取消</button><button className="button primary" onClick={save}>保存并归档</button></footer>
    </ModalShell>
  )
}

export function SettingsModal({ onClose }) {
  return (
    <ModalShell title="工作区设置" subtitle="配置报告节奏与本地数据偏好。" onClose={onClose}>
      <div className="settings-list"><div><span className="settings-icon"><Sparkles size={18} /></span><span><strong>自动生成</strong><small>每周四 09:00 生成研发团队周报</small></span><button className="toggle active" aria-label="自动生成已开启"><i /></button></div><div><span className="settings-icon"><Github size={18} /></span><span><strong>GitHub 数据源</strong><small>已启用公共仓库活动导入</small></span><span className="settings-state">已连接</span></div><div><span className="settings-icon"><Settings size={18} /></span><span><strong>本地优先存储</strong><small>活动和报告保存在当前浏览器中</small></span><button className="toggle active" aria-label="本地存储已开启"><i /></button></div></div>
      <footer className="modal-footer"><button className="button primary" onClick={onClose}>完成</button></footer>
    </ModalShell>
  )
}
