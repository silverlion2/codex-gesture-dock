import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// The .pw.ts suffix keeps this browser suite out of Vitest collection.
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations,
    JSON.stringify(
      results.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
      })),
      null,
      2,
    ),
  ).toEqual([])
}

test('QR generation exports the current content without media access and recovers from clipboard denial', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    let mediaRequests = 0
    Object.defineProperty(window, '__qrMediaRequests', { get: () => mediaRequests })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => {
      mediaRequests += 1
      throw new Error('QR workflow must not request media')
    } })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {
      throw new DOMException('Blocked in test', 'NotAllowedError')
    } } })
  })
  await page.goto('/?mockTasks=1')
  await page.getByText('摄像头、画面与麦克风电平设置', { exact: true }).click()
  await page.getByText('更多镜头工具', { exact: true }).click()
  await page.getByRole('button', { name: '扫码', exact: true }).click()
  const panel = page.getByRole('region', { name: '扫码结果' })
  await panel.getByRole('button', { name: '生成 QR', exact: true }).click()
  await panel.getByLabel('二维码文字内容').fill('QR regression fixture 2026')
  await panel.getByRole('button', { name: '生成二维码', exact: true }).click()
  await expect(panel.getByRole('img', { name: '生成的文字二维码' })).toBeVisible()
  await panel.getByRole('button', { name: '联系人', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('region', { name: '二维码预览' })).toBeFocused()
  await panel.getByRole('button', { name: '复制原始内容', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('剪贴板')
  await expectAccessible(page)

  const svgDownload = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出 SVG', exact: true }).click()
  const svg = await svgDownload
  expect(svg.suggestedFilename()).toBe('qr-text.svg')
  const svgBytes = await readFile((await svg.path())!, 'utf8')
  expect(svgBytes).toContain('<svg')
  expect(svgBytes).toContain('width="512"')

  const pngDownload = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出 PNG', exact: true }).click()
  const png = await pngDownload
  expect(png.suggestedFilename()).toBe('qr-text.png')
  const pngBytes = await readFile((await png.path())!)
  expect(pngBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(pngBytes.readUInt32BE(16)).toBe(512)
  expect(pngBytes.readUInt32BE(20)).toBe(512)
  await expect(panel.getByRole('alert')).toHaveCount(0)

  await panel.getByLabel('二维码文字内容').fill('Updated fixture')
  await expect(panel.getByRole('img')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '导出 SVG', exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: '生成二维码', exact: true }).click()
  await expect(panel.getByRole('img')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expectAccessible(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(pageErrors).toEqual([])
  expect(await page.evaluate(() => Reflect.get(window, '__qrMediaRequests'))).toBe(0)
})

test('expanded dashboard meets automated accessibility rules', async ({ page }) => {
  await page.goto('/?mockTasks=1')
  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 控制面板' }),
  ).toBeVisible()
  await page.getByText('摄像头、画面与麦克风电平设置', { exact: true }).click()
  await expect(
    page.getByRole('region', { name: '摄像头与麦克风控制' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '完整' }).click()
  await expect(page.getByRole('button', { name: '完整' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const gestureLayout = await page.locator('.gesture-book').evaluate((book) => {
    const cards = Array.from(book.querySelectorAll('.gesture-book-grid article'))
    const footer = book.querySelector('footer')
    const lastCard = cards.at(-1)
    if (!footer || !lastCard) return null
    return {
      cardCount: cards.length,
      lastCardBottom: lastCard.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
    }
  })
  expect(gestureLayout?.cardCount).toBe(6)
  expect(gestureLayout?.lastCardBottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    gestureLayout?.footerTop ?? Number.NEGATIVE_INFINITY,
  )
  await expectAccessible(page)

  await page.getByText('更多镜头工具', { exact: true }).click()
  await page.getByRole('button', { name: '面具' }).click()
  await expect(page.getByRole('region', { name: '表情动态面具' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /霓虹狐/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expectAccessible(page)

  await page.getByRole('button', { name: '扫码' }).click()
  await expect(page.getByRole('region', { name: '扫码结果' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '文档' }).click()
  await expect(page.getByRole('region', { name: '智能文档扫描' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '文字' }).click()
  await expect(page.getByRole('region', { name: '文件 OCR' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '名片' }).click()
  await expect(page.getByRole('region', { name: '名片 OCR' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '隐私' }).click()
  await expect(
    page.getByRole('region', { name: '人脸与照片隐私处理' }),
  ).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '背景' }).click()
  await expect(page.getByRole('region', { name: '人物背景处理' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '物体' }).click()
  await expect(page.getByRole('region', { name: '本机物体识别' })).toBeVisible()
  await expectAccessible(page)
})

test('expanded dashboard stays within a narrow web viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?mockTasks=1')

  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 控制面板' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '用手势，操作桌面' })).toBeVisible()
  await expect(
    page.locator('.window-actions').getByRole('button', {
      name: '暂停 Windows 控制',
    }),
  ).toBeVisible()

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    contentColumns: getComputedStyle(
      document.querySelector<HTMLElement>('.widget-content')!,
    ).gridTemplateColumns.split(' ').length,
  }))
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.contentColumns).toBe(1)
  const sections = await page.locator('.is-windows-workspace').evaluate((workspace) => {
    const guide = workspace.querySelector('.windows-controls')!.getBoundingClientRect()
    const camera = workspace.querySelector('.dashboard-monitor')!.getBoundingClientRect()
    return { guideBottom: guide.bottom, cameraTop: camera.top }
  })
  expect(sections.cameraTop).toBeGreaterThanOrEqual(sections.guideBottom)
  await expectAccessible(page)
})

test('camera stays usable at the small Windows runner work area', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/?mockTasks=1')
  const camera = await page.locator('.compact-camera').boundingBox()
  expect(camera?.width ?? 0).toBeGreaterThan(300)
  expect(camera?.height ?? 0).toBeGreaterThan(240)
  await expect(page.getByRole('button', { name: '一键启动极简 Windows 桌面手势控制' })).toBeVisible()
  await expectAccessible(page)
})

test('compact camera dock meets automated accessibility rules', async ({ page }) => {
  await page.setViewportSize({ width: 348, height: 360 })
  await page.goto('/?widget=collapsed')

  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 迷你摄像头' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '打开完整控制面板' })).toBeVisible()
  await expect(page.getByRole('button', { name: '开启摄像头' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开麦克风' })).toBeVisible()
  await expectAccessible(page)

  await page.locator('.mini-media-menu > summary').click()
  await expect(page.getByRole('combobox', { name: '选择摄像头' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '选择麦克风' })).toBeVisible()
  await expectAccessible(page)
  await page.locator('.mini-media-menu > summary').click()

  await page.getByRole('button', { name: '面具' }).click()
  await expect(page.getByRole('region', { name: '迷你动态面具控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '扫码' }).click()
  await expect(page.getByRole('region', { name: '迷你扫码控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '文档' }).click()
  await expect(page.getByRole('region', { name: '迷你文档拍摄控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '文字' }).click()
  await expect(page.getByRole('region', { name: '迷你文件 OCR 控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '名片' }).click()
  await expect(page.getByRole('region', { name: '迷你名片 OCR 控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '隐私' }).click()
  await expect(page.getByRole('region', { name: '迷你人脸隐私控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '背景' }).click()
  await expect(page.getByRole('region', { name: '迷你人物背景控制' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '物体' }).click()
  await expect(page.getByRole('region', { name: '迷你物体识别控制' })).toBeVisible()
  await expectAccessible(page)
})

test('minimal screen-share mode keeps one accessible restore control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 78, height: 78 })
  await page.goto('/?widget=minimal')

  const restore = page.getByRole('button', { name: '恢复迷你摄像头 Dock' })
  await expect(restore).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 迷你摄像头' }),
  ).toBeHidden()
  await expect(page.getByLabel('实时摄像头画面')).toHaveCount(1)
  await expect(page.locator('.widget-root')).toHaveClass(/is-minimal/)
  await expectAccessible(page)

  await restore.click()
  await page.setViewportSize({ width: 348, height: 360 })
  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 迷你摄像头' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '最小化占屏，适合屏幕共享' }),
  ).toBeVisible()
})

test('file, task, action, and confirmation flows remain accessible', async ({
  page,
}) => {
  await page.goto('/?view=tasks&mockTasks=1')
  await expect(page.getByRole('button', { name: /未查看文件/ })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Codex 任务' }).click()
  await expect(
    page.getByRole('button', { name: /完善 Codex 手势控制/ }),
  ).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: /完善 Codex 手势控制/ }).click()
  await expect(
    page.getByRole('button', {
      name: /打开查看 在 Codex 桌面应用中打开任务/,
    }),
  ).toBeVisible()
  await expectAccessible(page)

  await page
    .getByRole('button', {
      name: /打开查看 在 Codex 桌面应用中打开任务/,
    })
    .click()
  await expect(page.getByRole('button', { name: '确认执行' })).toBeVisible()
  await expectAccessible(page)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /打开查看/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '确认执行' }),
  ).not.toBeVisible()
  await expectAccessible(page)
})
