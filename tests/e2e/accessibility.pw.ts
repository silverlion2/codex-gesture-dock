import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

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

test('expanded dashboard meets automated accessibility rules', async ({ page }) => {
  await page.goto('/?mockTasks=1')
  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 控制面板' }),
  ).toBeVisible()
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
  await expect(page.getByRole('button', { name: '姿态' })).toBeVisible()
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
  await expectAccessible(page)
})

test('compact camera dock meets automated accessibility rules', async ({ page }) => {
  await page.setViewportSize({ width: 348, height: 360 })
  await page.goto('/?widget=collapsed')

  await expect(
    page.getByRole('region', { name: 'Codex Gesture Dock 迷你摄像头' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '打开完整控制面板' })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始监测' })).toBeVisible()
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
