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
  await expectAccessible(page)

  await page.getByRole('button', { name: '扫码' }).click()
  await expect(page.getByRole('region', { name: '扫码结果' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '文档' }).click()
  await expect(page.getByRole('region', { name: '文档扫描' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '文字' }).click()
  await expect(page.getByRole('region', { name: '文件 OCR' })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: '名片' }).click()
  await expect(page.getByRole('region', { name: '名片 OCR' })).toBeVisible()
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
