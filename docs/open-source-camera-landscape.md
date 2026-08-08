# 电脑摄像头开源方案地图

本页迁移自 Codex 任务“探索摄像头开源方案”（2026-07-20）。它记录了项目立项时调查过的方向、候选开源组件和已知限制，便于后续继续选型。

| 能力方向 | 候选开源方案 | 成熟度 | 主要限制 |
| --- | --- | --- | --- |
| 会议画面、虚拟背景、字幕和画面叠加 | [OBS Studio](https://github.com/obsproject/obs-studio)、[OBS Background Removal](https://github.com/royshil/obs-backgroundremoval)、[pyvirtualcam](https://github.com/letmaik/pyvirtualcam) | 很成熟 | 背景分割消耗 CPU/GPU；部分会议软件对虚拟摄像头兼容性不同 |
| 头部控制游戏视角 | [opentrack](https://github.com/opentrack/opentrack) | 很成熟 | 光线和帧率影响延迟；60 FPS 摄像头体验更好 |
| 手势控制鼠标、音量、翻页或快捷键 | [MediaPipe](https://github.com/google-ai-edge/mediapipe)、[OpenCV](https://github.com/opencv/opencv) | 底层成熟，应用需定制 | 必须设计连续帧确认、保持时间和冷却机制来防误触 |
| 姿势识别、健身计数和坐姿提醒 | MediaPipe Pose、[BatesPosture](https://github.com/wtbates99/batesposture) | 坐姿提醒较成熟；动作纠正中等 | 单目摄像头没有真实深度，容易受侧身、遮挡和衣物影响 |
| 视线追踪、眼睛控制网页 | [WebGazer.js](https://github.com/brownhci/WebGazer) | 可用但偏实验 | 需要校准，不能替代红外眼动仪；原任务调研时已进入有限维护状态 |
| VTuber、表情与虚拟形象驱动 | [OpenSeeFace](https://github.com/emilianavt/OpenSeeFace)、[Kalidokit](https://github.com/yeemachine/kalidokit) | 较成熟 | 分别偏追踪和骨骼解算，不是完整直播产品 |
| 安防、宠物监控和录像管理 | [Motion](https://github.com/Motion-Project/motion)、[Frigate](https://github.com/blakeblackshear/frigate) | 成熟 | Frigate 更适合 Linux/Docker/NVR；USB 摄像头可能需要 FFmpeg 转流 |
| QR、条码和设备标签 | [ZXing Browser](https://github.com/zxing-js/browser) | 很成熟 | 普通笔记本摄像头近距离对焦可能弱于手机 |
| OCR、纸张和屏幕文字转文本 | [OpenCV](https://github.com/opencv/opencv)、[Tesseract](https://github.com/tesseract-ocr/tesseract) | 成熟 | 光照、反光、透视和自动对焦是主要瓶颈 |
| 通用物体识别和自动化触发 | OpenCV、MediaPipe、[Ultralytics YOLO](https://github.com/ultralytics/ultralytics) | 技术成熟 | Ultralytics 默认 AGPL-3.0，商业集成前需检查许可证 |
| 摄像头估算心率 | [pyVHR](https://github.com/phuselab/pyVHR)、[rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox) | 研究级 | 对运动、光线和自动曝光敏感；不能用于医疗诊断 |
| 多视角拍摄重建 3D | [COLMAP](https://github.com/colmap/colmap) | 算法成熟，门槛较高 | 需要移动摄像头或物体并保持大量重叠；固定单目摄像头无法可靠恢复深度 |
| Linux 人脸登录 | [Howdy](https://github.com/boltgolt/howdy) | 可用但安全敏感 | 不应作为唯一认证方式，普通照片可能造成欺骗 |

## 当时筛出的三个产品方向

1. 本地桌面健康助手：坐姿、离席、连续用屏和提醒，只保存事件与统计，不保存视频。
2. “把东西拿给电脑看”：扫码、OCR、翻译、搜索和表单填写。
3. 智能虚拟摄像头：自动构图、背景移除、画质增强，以及手势控制会议或 OBS。

最终选择了第一个方向，并在后续版本中叠加了 Codex 手势控制与任务选择器。

## 2026-08-08 同类项目复查

| 项目 | 可借鉴点 | 与本项目的差异 / 结论 |
| --- | --- | --- |
| [BatesPosture](https://github.com/wtbates99/batesposture) | 托盘常驻、个人校准、会话统计、可选本地日志，以及低性能设备上的自适应负载 | 最接近本项目的坐姿模块；本项目继续坚持不保存关键点，并优先降低持续推理负载 |
| [Pose Nudge](https://github.com/DDULDDUCK/pose-nudge) | 前伸头部检测、提醒间隔、分析频率、灵敏度和统计面板 | Tauri + React，健康提醒更聚焦；本项目需要同时为手势控制保留摄像头会话，因此恢复能力比自动退出更重要 |
| [postured](https://github.com/vadi2/postured) | 低干扰托盘交互、仅在需要时提醒、低 CPU 目标 | 面向 Linux 且功能更窄；验证了“后台轻量、异常时提示”的产品方向 |
| [GestureX](https://gesturex.app/) | 手势到媒体、演示与桌面动作的明确映射 | 更偏通用控制；本项目保留固定白名单、保持确认和松手复位，避免误触及任意命令执行 |

Google 的 [MediaPipe Web Gesture Recognizer 指南](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js) 明确指出视频识别会同步阻塞主线程。基于这次复查，姿态循环采用 10 FPS 上限，并在视频暂时未就绪时继续调度以自动恢复；手势循环继续使用独立的 135 ms 间隔和保持状态机。后续若实测仍有明显卡顿，再将两个识别器迁移到 Web Worker，而不是继续提高主线程采样率。

### 多功能摄像头扩展选型

| 项目 | 结论 |
| --- | --- |
| [ZXing Browser](https://github.com/zxing-js/browser) | 采用。MIT、TypeScript、可直接解码现有 video 元素，并覆盖 QR、Data Matrix 与常见一维码；只在扫码模式动态加载。 |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 暂不采用。功能完整且自带 UI，但项目声明处于维护模式；本项目已有摄像头生命周期和界面系统。 |
| [jscanify](https://github.com/puffinsoft/jscanify) | 后续候选。MIT，可用 OpenCV.js 标出并透视提取纸张；当前先交付零额外 WASM 的明确拍摄/预览/保存闭环。 |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 已采用。Apache-2.0；worker、WASM core 与英/简中/繁中语言数据随应用离线打包，只在文件或名片 OCR 时动态加载。 |
| [PDF.js](https://github.com/mozilla/pdf.js) | 已采用。Apache-2.0；优先读取 PDF 文本层，对扫描页本地渲染后交给 Tesseract.js。 |

当前阶段包含姿态、QR/条码、文档快照、文件 OCR、名片 OCR 和镜像切换。自动纸张边缘矫正、背景移除与虚拟摄像头仍留在后续阶段，避免同时运行多个高负载推理管线。

### 悬浮窗与媒体控制复查

| 项目 | 借鉴 / 决策 |
| --- | --- |
| [Flobro](https://github.com/flobro/flobro-app) | 借鉴无边框置顶内容窗和 hover 后出现的轻量工具条；本项目据此让运行中的迷你控制条退场，同时保留键盘 `focus-within` 和菜单打开状态。 |
| [AirPlayServer](https://github.com/xenos1337/AirPlayServer) | 借鉴恢复前一窗口位置/尺寸、保持可见工作区和 hover 控件；本项目分别保存迷你与展开边界，展开窗口保持安全最小尺寸。 |
| [OpenScreen](https://github.com/getopenscreen/openscreen) | 活跃 MIT 社区延续版提供可拖动 webcam PiP、镜像和形状选项；作为 Electron 摄像头叠加参考，不引入其录屏时间线。 |
| [tCamView](https://github.com/augamvio/tCamView) | 填满/适应、翻转、透明度和设备/分辨率选择是有效摄像头控制参考；代码为 GPLv3 且较旧，本项目只独立实现交互概念。 |
| [Posture Guardian](https://github.com/marisombra-dev/Posture-Guardian) | 系统级坐姿覆盖提醒与本项目健康场景相近，但仓库规模小且许可不明确，只作为提醒概念参考。 |
| [Microsoft Windows-Camera](https://github.com/microsoft/Windows-Camera) | 后续若需要 Windows Studio Effects、曝光/对焦或原生相机状态，优先参考官方 MIT 样例；当前 Web MediaDevices 已足够。 |

没有发现一个可直接替换本项目、同时覆盖小型 Windows 置顶 Dock、姿态/手势、扫码/OCR、文档和隐私音频控制的成熟仓库。因此采用“专用项目提取交互模式、现有 MediaPipe/ZXing/Tesseract 管线继续保留”的组合方案。本次实现设备选择、填满/完整取景、明确的麦克风开关/本机电平，以及分别记忆迷你/展开窗口边界；不复制 GPL 或许可不明确的源码。

## 技术与产品原则

- 摄像头、姿态和手势推理默认在本机完成。
- 原始图像、视频和人体关键点不落盘。
- 手势识别必须有状态机、保持时间、松手复位与冷却机制。
- 普通二维摄像头的评分只能是相对个人校准姿势的启发式结果。
- 不做从脸部推断情绪、撒谎或工作认真程度的功能。
- 发布前优先核查 Apache-2.0、MIT、BSD、GPL 和 AGPL 组件的义务。
