# Codex Gesture Dock 代码结构

本文是代码导航与模块边界的入口。产品行为、安全边界和验收要求分别以
`docs/product-spec.md`、`docs/architecture.md` 和 `docs/test-matrix.md` 为准。

## 运行时总览

```text
摄像头 / 麦克风 / 固定语音口令
        │
        ▼
React renderer ── 本机视觉 / OCR / 图像处理
        │ 固定类型 IPC
        ▼
Electron preload ── Electron main ── Codex App Server
                                    ├─ Windows 固定动作 / 指针 helper
                                    └─ Windows System.Speech 固定语法 helper
```

- Renderer 负责界面、媒体生命周期和本机算法，不直接访问 Node API。
- Preload 只暴露固定、可退订、可类型检查的 IPC 接口。
- Main 负责窗口、权限、协议、参数验证、审计和子进程生命周期。
- PowerShell helper 只接收 main 已验证的固定动作或受限指针协议；语音 helper 只加载随包固定语法并输出白名单动作。

## 顶层目录

```text
src/                    React renderer、hooks、纯业务逻辑与组件测试
  App.tsx               应用壳层、跨功能状态和模式路由
  components/           可见 UI；重型工具面板按模式动态加载
  hooks/                摄像头、音频、姿态、手势和扫码生命周期
  lib/                  可独立测试的算法、验证器与运行时加载边界
electron/               Main、preload、桌面控制 helper 与 Node 测试
public/                 随包分发的模型、WASM、OCR worker 和字体
scripts/                构建、资源复制、发布、签名与检查脚本
tests/e2e/               Playwright/axe 浏览器验收
tests/fixtures/          无真实个人信息的视觉与 OCR 样本
docs/                    产品、架构、设计、测试、发布与用户文档
build/                  Electron 打包输入
third_party_licenses/    生产依赖许可证归档
artifacts/               可重建的安装包输出，不是源码权威
work/                    可清理的本机测试与审计证据
```

`docs/workspace-layout.md` 维护重要文件的逐项索引；本文维护稳定的模块边界，
不随每个新增工具重复扩张。

## Renderer 模块职责

| 区域 | 主要职责 | 新代码应放置的位置 |
|---|---|---|
| 应用壳层 | 视图模式、当前工具、跨面板媒体状态、桌面桥接 | `src/App.tsx`；复杂流程应下沉而不是继续堆入壳层 |
| 通用组件 | 模式切换、摄像头预览、设置、状态指标 | `src/components/` |
| 工具面板 | OCR、文档、人脸、背景、物体和图片工具 | `src/components/*Panel.tsx`，从 `App.tsx` 动态加载 |
| 媒体 hooks | 单一摄像头/麦克风流和可取消推理循环 | `src/hooks/` |
| 纯算法 | 校验、几何、序列化、像素或姿态计算 | `src/lib/`，优先配同名单元测试 |
| 重型运行时 | MediaPipe、Tesseract、OpenCV、PDF.js、ZXing | 统一动态导入边界或 worker，不在模块顶层启动 |

## 加载与性能边界

启动时只加载应用壳层、当前监测视图和轻量公共控件。OCR、文档、人脸隐私、
面具设置、背景、物体、图片比较和颜色分析等工具面板在用户切换模式后才加载。
MediaPipe、Tesseract、OpenCV、PDF.js 与 ZXing 继续在功能内部按需加载。

所有持续循环必须遵守以下约束：

- 页面隐藏时暂停不可见的视觉或音频采样工作。
- 最小占屏时保留摄像头会话，但停止隐藏的扫码与面具推理，并降低姿态频率。
- 高频坐标、帧时间和中间值保存在 `ref`，只有用户可感知变化才进入 React state。
- 切换模式、取消任务或卸载组件时，必须终止 worker、动画帧、对象 URL 和媒体轨道。
- 批量图像/OCR 默认串行并限制输入、像素和结果数量，避免峰值内存叠加。

## Electron 模块职责

| 文件/区域 | 职责 |
|---|---|
| `electron/main.cjs` | 应用生命周期、窗口、IPC 注册、更新与恢复策略 |
| `electron/preload.cjs` | Renderer 可调用的最小桌面 API |
| `electron/windows-control.cjs` | 固定 Windows 动作、验证与 helper 生命周期 |
| `electron/windows-powershell.cjs` | 固定本机 System32 PowerShell 绝对路径策略 |
| `electron/pointer-command.cjs` | 指针命令的纯校验、节流和显示器坐标映射 |
| `electron/windows-voice-control.cjs` | 本次会话开关、helper 超时/回收、输出验证、双层限流与状态 |
| `electron/windows-voice-control.ps1` | 按需启动的 System.Speech 中英文固定语法识别器 |
| `electron/windows-*.ps1` | 固定参数或固定行协议的 Windows 实现 |
| `electron/*.test.js` | IPC、窗口与 helper 的 Node 回归测试 |

新增桌面能力时，先定义固定动作和参数边界，再更新 preload 类型与 main 验证；
不得把任意命令、脚本、路径或按键透传给 helper。

## 修改路径

- 新增纯算法：先写 `src/lib/<feature>.ts` 与同名测试，再接入面板。
- 新增工具模式：更新 `cameraTools.ts`、模式切换器，并用 `React.lazy` 接入面板。
- 新增持续媒体处理：放入 hook，提供明确 `active`/取消边界和隐藏页节流。
- 新增 IPC：同步修改 renderer 类型、preload、main 验证和 Electron 测试。
- 改变用户行为：同步更新产品、架构和测试矩阵，必要时更新中文用户指南。

## 验证入口

```text
npm run lint             静态规范
npm run typecheck        TypeScript 边界
npm run test:unit        renderer 与纯逻辑单元/组件测试
npm run test:electron    全部 Electron 与 helper 测试
npm test                 上述全部 Vitest + 发布脚本测试
npm run build            生产构建和按需 chunk 复核
npm run test:a11y        Chromium/axe 验收（需本机浏览器）
```

提交前还应运行 `.website-sop.yml` 配置的 `web-sop check --mode fast`；若本机未安装
CLI，应明确记录该工具缺失，并仍执行上面的项目原生命令。

## 后续拆分优先级

以下文件承担较多编排职责，新增功能时优先抽离，不做无收益的整文件搬迁：

1. `src/App.tsx`：把工具路由、桌面事件和监测会话拆为独立边界。
2. `electron/main.cjs`：按窗口、Codex runtime、更新和 IPC 域拆分。
3. `DocumentToolPanel.tsx`：按导入、页面复核、OCR 与导出工作流拆分。
4. `TaskPicker.tsx`：把查询状态、任务列表和详情交互拆分。
