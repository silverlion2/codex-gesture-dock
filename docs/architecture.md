# Codex Gesture Dock 架构

## 系统边界

| 组件 | 职责 | 信任级别 |
|---|---|---|
| React renderer | 摄像头 UI、姿态/手势状态、任务与审批交互 | 沙箱渲染器，不具备 Node 权限 |
| Electron preload | 暴露固定类型的 IPC 方法和事件退订器 | 最小桥接层 |
| Electron main | 窗口、权限、协议、IPC 验证、更新、审计 | 本机受信任进程 |
| MediaPipe WASM/models | 本机视频推理 | 本地静态资源，不联网取模型 |
| Tesseract.js / PDF.js | 文件与名片 OCR、PDF 文本层读取和扫描页渲染 | 本地 worker、WASM 与语言数据，不联网取模型 |
| Codex App Server | 本机任务、通知、逐次审批和 turn 操作 | 本机子进程，所有输入仍做边界验证 |
| PowerShell helpers | Codex 身份检查和 Windows 固定快捷动作 | 固定脚本与固定参数白名单 |
| GitHub Releases | 安装版更新源 | 仅接受 electron-builder 固定仓库配置 |

## 关键数据流

### 摄像头工具模式

主面板复用同一个 `HTMLVideoElement` 与摄像头流，不为不同工具重复申请权限。姿态模式运行 MediaPipe 姿态与可选手势识别；扫码模式按需动态加载 MIT 许可的 `@zxing/browser`，直接从现有视频元素解码 QR、Data Matrix 和常见一维条码；文档模式仅在用户点击拍摄时把当前帧绘制到临时 canvas。扫码值只保留在 React 内存中，文档帧只在用户确认“保存 PNG”后由浏览器下载机制写盘，两个模式都不发送网络请求。

`useMediaDevices` 监听本机设备变化并提供摄像头/麦克风选择；所选设备 ID、镜像和填满/完整取景方式保存在 renderer 的版本化 `localStorage`。切换摄像头会取消旧推理帧、停止旧视频轨道并用指定 `deviceId` 重启同一姿态会话。麦克风由独立的 `useAudioInput` 流管理，默认关闭；用户明确开启后使用 Web Audio `AnalyserNode` 计算本机输入电平，不连接扬声器、不录制、不转写，关闭或切换设备时立即停止旧音频轨道。

文件 OCR 与名片 OCR 不要求摄像头权限。构建前 `scripts/copy-ocr-assets.mjs` 把 Tesseract worker、兼容的 LSTM core、轻量 `best_int` 英文/简中/繁中语言数据和 PDF.js worker 复制到 `public/ocr/`，由 Vite 一并打包。图像直接交给一次性 OCR worker；PDF 先读取文本层，只有缺少有效文本层的页面才以 2× canvas 渲染后 OCR。单文件上限 35 MB，PDF 上限 20 页。worker 在完成、错误、取消或切换工具时终止，原文件与识别结果不进入 IPC 或持久存储。

名片解析是本机确定性后处理：从 OCR 文本中提取常见联系人字段并显示为可编辑表单。只有用户确认并点击导出后才生成 `.vcf`；原始 OCR 结果不会自动写入联系人系统。

模式切换时扫码循环立即停止，手势循环只在姿态模式运行，避免与扫码争用主线程。姿态流继续拥有摄像头生命周期，因此结束会话仍能统一停止所有视频轨道；独立音频轨道只由用户可见的麦克风开关管理。

折叠与展开只改变 Electron 主窗口边界和 React 布局，不卸载 `HTMLVideoElement`，因此摄像头流、姿态会话和当前工具模式在 `348 × 360` 迷你 Dock 与默认 `1120 × 760` 完整面板之间连续保留。迷你位置与展开位置/尺寸分别写入 Electron `userData`；展开面板可调整到不小于 `980 × 760`，恢复时会限制在当前显示器工作区内。摄像头运行时迷你控制条仅在鼠标移入、键盘聚焦或设备菜单打开时显示。

### 摄像头与手势

`getUserMedia(video only)` → HTML video → 本地 Pose/Gesture 模型 → 状态机保持确认 → 固定动作标识 → IPC 白名单 → Codex 或 Windows helper。

用户点击打开麦克风 → `getUserMedia(audio only)` → 本地 `AnalyserNode` → 0–100 输入电平 UI；音频不进入视频元素、IPC、文件或网络。

视频帧只存在于渲染器内存和画布中，不写盘、不进入 IPC、不发送到网络。
姿态推理在渲染器中限制为 10 FPS；每次动画帧先安排下一次检查，因此摄像头启动或恢复期间短暂缺少可用帧不会永久终止监测。手势推理维持 135 ms 间隔，两个识别器都只处理新视频帧。

### Codex 控制

Electron main 启动 `codex app-server`，通过 JSONL 请求任务和 turn。任务 ID、筛选器、动作、审批决定和最近文件 ID 均在 IPC 边界验证。最近文件路径只保留在 main 进程，renderer 仅获得不可逆的短哈希 ID。

### Windows 控制

Renderer 只能请求 `WINDOWS_ACTIONS` 中的枚举值。Main 使用 `execFile` 调用固定 PowerShell 文件，不经过 shell 字符串拼接；helper 返回的动作和后端字段必须与请求完全匹配。紧急停止在 helper 启动之前检查。

## 安全边界

- `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`。
- 生产环境只加载 `app://codex-gesture-dock/`；开发服务器只允许固定的 `127.0.0.1:5173` origin。
- 所有新窗口和外部导航默认拒绝；视频/音频媒体权限只授予主窗口，麦克风仍需用户在 renderer 中明确点击开启。
- Electron Fuses 禁用 RunAsNode、NODE_OPTIONS 和 inspector，并要求 ASAR 完整性。
- 发布凭证只存在于 GitHub Actions Secrets；仓库不存储 PFX 或密码。

## 故障模式与恢复

| 故障 | 用户影响 | 检测 | 恢复 |
|---|---|---|---|
| 摄像头拒绝/占用 | 无实时监测 | `getUserMedia` 错误态 | 显示可操作错误并允许重试 |
| 麦克风拒绝/断开 | 无输入电平 | 独立音频流错误态/设备变化 | 显示错误、停止旧轨道并允许选择其他设备 |
| OCR 文件过大/页数过多 | 文件不处理 | 读取前限制检查 | 显示 35 MB / 20 页边界并允许重选 |
| OCR worker 初始化失败 | 当前文件无法识别 | worker 创建或本地资源加载异常 | 终止 worker、显示错误并允许重选；不回退网络模型 |
| GPU 模型初始化失败 | 首次推理失败 | MediaPipe 初始化异常 | 姿态模型回退 CPU；错误可见 |
| 视频帧暂时未就绪 | 画面启动或恢复稍慢 | `readyState` / 新帧时间检查 | 保持低成本帧调度，可用帧到达后自动恢复 |
| Codex App Server 不可用 | 任务和审批不可用 | runtime 状态与超时 | 保留 UI、显示错误、下次请求重连 |
| Helper 输出无效 | 动作不执行 | JSON/字段严格验证 | 失败关闭并写隐私安全审计 |
| Renderer 崩溃/无响应 | 窗口暂时不可用 | Electron 进程事件 | 一分钟最多恢复两次，超限关闭/退出 |
| 更新下载失败 | 保持当前版本 | updater error 事件 | 显示清理后的错误，可稍后重试 |

## 本地数据

- 姿态日统计：浏览器 localStorage，仅保存当天秒数计数。
- 手势模式：浏览器 localStorage。
- 摄像头/麦克风设备 ID、取景与镜像偏好：浏览器 localStorage；不保存媒体内容。
- 迷你与展开窗口边界：Electron userData JSON。
- Codex 任务绑定与 Windows 控制开关：Electron userData JSON。
- Windows 控制审计：按天 JSONL，只记录动作、结果、时间和必要的进程标识，不记录提示词、文件内容或摄像头数据。

## 运维与回滚

- GitHub Actions 执行测试、安全扫描、Windows 打包、签名验证、SBOM、来源证明和隔离安装测试。
- Release 资产不可覆盖；错误版本通过发布更高补丁版本回滚，不能替换既有 tag 资产。
- 自动更新只支持签名 NSIS 安装版；便携版保持手动更新。
