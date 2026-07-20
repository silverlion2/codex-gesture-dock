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

## 技术与产品原则

- 摄像头、姿态和手势推理默认在本机完成。
- 原始图像、视频和人体关键点不落盘。
- 手势识别必须有状态机、保持时间、松手复位与冷却机制。
- 普通二维摄像头的评分只能是相对个人校准姿势的启发式结果。
- 不做从脸部推断情绪、撒谎或工作认真程度的功能。
- 发布前优先核查 Apache-2.0、MIT、BSD、GPL 和 AGPL 组件的义务。
