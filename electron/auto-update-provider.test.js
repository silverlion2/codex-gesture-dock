import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider')
const { AppUpdater } = require('electron-updater/out/AppUpdater')
const semver = require('electron-updater/node_modules/semver')

const OWNER = 'silverlion2'
const REPO = 'codex-gesture-dock'
const BASE = `https://github.com/${OWNER}/${REPO}/releases`

function atom(tags) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  ${tags.map((tag) => `<entry><title>${tag.title}</title><link href="${BASE}/tag/${tag.tag}"/><content>${tag.note || ''}</content></entry>`).join('')}
</feed>`
}

function latestYaml(version, installer) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${installer}`,
    '    sha512: mock-checksum',
    'path: ' + installer,
    'sha512: mock-checksum',
  ].join('\n')
}

function createProvider({ feed, metadata }) {
  const requests = []
  const executor = {
    request: async (options) => {
      const url = new URL(`${options.protocol}//${options.hostname}${options.path}`).href
      requests.push(url)
      if (url.endsWith('/releases.atom')) return feed
      if (url.endsWith('/latest.yml')) return metadata
      throw new Error(`unexpected mocked request: ${url}`)
    },
  }
  const updater = {
    allowPrerelease: true,
    allowDowngrade: false,
    channel: null,
    currentVersion: { raw: '0.6.0' },
    fullChangelog: false,
  }
  return {
    provider: new GitHubProvider({ provider: 'github', owner: OWNER, repo: REPO }, updater, {
      executor,
      platform: 'win32',
    }),
    requests,
    updater,
  }
}

describe('electron-updater GitHub provider integration', () => {
  it('resolves a preview-tagged release for a stable current version', async () => {
    const installer = 'Codex-Gesture-Dock-0.6.1-setup.exe'
    const { provider, requests } = createProvider({
      feed: atom([
        { tag: '0.6.1', title: 'Preview 0.6.1' },
        { tag: 'v0.6.0', title: 'Stable 0.6.0' },
      ]),
      metadata: latestYaml('0.6.1', installer),
    })

    const info = await provider.getLatestVersion()
    const files = provider.resolveFiles(info)

    expect(info).toMatchObject({ tag: '0.6.1', version: '0.6.1' })
    expect(files[0].url.href).toBe(`${BASE}/download/0.6.1/${installer}`)
    expect(requests).toEqual([`${BASE}.atom`, `${BASE}/download/0.6.1/latest.yml`])
  })

  it('keeps stable metadata and exact blockmap paths resolvable', async () => {
    const installer = 'Codex-Gesture-Dock-0.6.2-setup.exe'
    const { provider, updater } = createProvider({
      feed: atom([{ tag: 'v0.6.2', title: 'Stable 0.6.2' }]),
      metadata: latestYaml('0.6.2', installer),
    })

    const info = await provider.getLatestVersion()
    const files = provider.resolveFiles(info)
    const blockmaps = provider.getBlockMapFiles(
      files[0].url,
      '0.6.0',
      info.version,
    )

    expect(info).toMatchObject({ tag: 'v0.6.2', version: '0.6.2' })
    expect(files[0].info.sha512).toBe('mock-checksum')
    expect(files[0].url.href).toBe(`${BASE}/download/v0.6.2/${installer}`)
    expect(blockmaps.map((url) => url.href)).toEqual([
      `${BASE}/download/v0.6.0/Codex-Gesture-Dock-0.6.0-setup.exe.blockmap`,
      `${BASE}/download/v0.6.2/${installer}.blockmap`,
    ])
    expect(updater.allowDowngrade).toBe(false)

    const policy = Object.create(AppUpdater.prototype)
    policy.currentVersion = semver.parse('0.6.0')
    policy.allowDowngrade = updater.allowDowngrade
    policy._isUpdateSupported = () => true
    policy._isUserWithinRollout = () => true
    await expect(policy.isUpdateAvailable({ version: '0.5.9' })).resolves.toBe(false)
    await expect(policy.isUpdateAvailable({ version: '0.6.0' })).resolves.toBe(false)
    await expect(policy.isUpdateAvailable({ version: '0.6.2' })).resolves.toBe(true)
  })

  it('rejects the legacy preview/v0.6.0 tag when a preview channel is explicit', async () => {
    const { provider, updater } = createProvider({
      feed: atom([{ tag: 'preview/v0.6.0', title: 'Legacy preview' }]),
      metadata: latestYaml('0.6.0', 'Codex-Gesture-Dock-0.6.0-setup.exe'),
    })
    updater.channel = 'preview'
    await expect(provider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
    })
  })
})
