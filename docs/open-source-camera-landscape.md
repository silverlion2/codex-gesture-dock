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

在已采用的 [hOCR 1.2](https://github.com/kba/hocr-spec/blob/master/1.2/spec.md) 与 [ALTO 4.4](https://github.com/altoxml/schema) 无依赖导出子集上，现在还支持扫描文档级多页输出。hOCR 保留页序、源页文件名和跨页唯一 ID；ALTO 在一个 Layout 中保留多个 Page、页尺寸和 `PHYSICAL_IMG_NR`。该实现仍不伪造字体、段落语义、复杂区域或 METS 包装，且任一页缺少词框时禁止整体导出。

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
| [ZXing Browser](https://github.com/zxing-js/browser) | 采用。MIT、TypeScript、可直接解码现有 video 元素与图片对象 URL，并覆盖 QR、Data Matrix 与常见一维码；只在扫码模式动态加载。项目外层增加 2–20 图串行批量、单文件失败隔离、取消、对象 URL 释放和防公式注入 CSV，不自动打开识别到的网址。现有依赖还提供 `BrowserQRCodeSvgWriter`，因此无需新增包即可离线生成文字、HTTP(S)、Wi-Fi 与 vCard QR，并导出 SVG/PNG。 |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 暂不采用。功能完整且自带 UI，但项目声明处于维护模式；本项目已有摄像头生命周期和界面系统。 |
| [jscanify](https://github.com/puffinsoft/jscanify) | 已评估但未直接采用。其纸张检测、透视矫正和滤镜方向与需求吻合；当前 npm 默认依赖还会带入面向 Node 的 `canvas` / `jsdom` 路径，不适合本 Electron renderer 的轻量、严格 CSP 资产边界。 |
| [OpenCV.js](https://github.com/opencv/opencv) | 已采用。Canny、轮廓筛选、透视变换和自适应阈值在同源隔离 worker 中运行；worker 复用运行时，renderer 继续只允许 `wasm-unsafe-eval` 而不开放一般 `unsafe-eval`。 |
| [MediaPipe Samples Web](https://github.com/google-ai-edge/mediapipe-samples-web) / [BlazeFace](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_detection.md) | 已采用人脸检测任务方向。复用现有 `@mediapipe/tasks-vision` 与本地 WASM，只新增官方 short-range 模型；检测框必须人工复核，最终效果由 canvas 烧录，不做身份识别。 |
| [MediaPipe Face Landmarker](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/web/vision) / [MediaPipe Samples Web worker](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/face-landmarker.worker.ts) | 已采用表情面具方向。官方任务直接提供关键点、blendshape 与面部变换；本项目复用已有 Tasks Vision/WASM，随包分发官方模型并独立实现三种 Canvas 面具。相比 [WebAR.rocks.face](https://github.com/WebAR-rocks/WebAR.rocks.face) 与 [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter)，避免新增第二套摄像头/WebGL 运行时；不复制其源码或演示资产。 |
| [exifr](https://github.com/MikeKovarik/exifr) | 已采用照片隐私元数据检查。MIT、零依赖、支持浏览器 `File`/`Blob` 与按标签解析；当前只对 JPEG/PNG 挑选常见 EXIF/GPS 隐私字段，不把 WebP/BMP 或未知元数据误报为已检查。所有支持的输入仍通过 canvas 重新编码 PNG，源元数据不复制。 |
| [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js) / [SelfieSegmenter](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite) | 已采用人物背景方向。官方 square float16 模型随包分发，生成前景置信度蒙版；透明、模糊和纯色效果由本机 canvas 合成，并可用保留/移除软边画笔手动修正 alpha。原图对照与边缘告警保留人工复核，不把自动或手动分割描述为精确抠图。 |
| [HivisionIDPhotos](https://github.com/Zeyi-Lin/HivisionIDPhotos) | 参考其“抠图→换底→尺寸→打印排版”的完整证件照链路。上游是 Apache-2.0 Python/Gradio 工程，包含人脸检测、对齐、自定义毫米/DPI 与多种打印版式；本项目不引入其模型或服务端栈，只在既有本机 SelfieSegmenter 结果上增加四种固定 300 DPI 像素画布、人工垂直构图和固定 4 × 6 inch 多张排版，并明确不做脸部对齐、合规检测或受理保证。 |
| [MediaPipe Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js) / [EfficientDet-Lite0](https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite) | 已采用照片物体识别方向。官方推荐 uint8 模型随包分发，覆盖 80 类 COCO 标签；同时支持在内存中验证和运行带任务元数据的自定义 TFLite，以及可选索引标签 TXT。置信度筛选、逐框复核、JSON 和标注 PNG 都在本机完成，不把结果连接到自动化或安全判断。 |
| [Pixelmatch](https://github.com/mapbox/pixelmatch) | 已采用图片差异核心。ISC、浏览器 typed array API、感知色差和抗锯齿过滤适合本机截图/照片比较；本项目在外层增加文件限制、有界共同画布、尺寸不一致警告、包围框、滑动人工复核与明确 PNG 导出。 |
| [blockhash-js](https://github.com/commonsmachinery/blockhash-js) / [dhash](https://github.com/benhoyt/dhash) / [imghash](https://github.com/pwlmc/imghash) | 已采用感知哈希与 Hamming 距离方向，但不引入其 Node/Python 解码依赖。项目在浏览器 canvas 中实现 128 位水平+垂直 dHash，串行处理最多 20 张图片，并用 Web Crypto SHA-256 区分字节完全相同与近重复候选。dHash 项目明确提示旋转、大幅裁切和一般语义相似不属于其强项，因此界面不自动删除文件，也不把候选描述为语义等价。 |
| [React Compare Slider](https://github.com/nerdyman/react-compare-slider) | 已评估。MIT、零依赖且原生支持键盘和屏幕阅读器，但本项目只需单一图片 wipe，直接使用原生 range 与小型 CSS clip 可以避免再增加 UI 依赖。 |
| [Resemble.js](https://github.com/rsmbl/Resemble.js) | 已评估。MIT、功能完整，但仓库声明低频维护，浏览器/Node 双路径也比当前有界 typed-array 需求更宽；不采用。 |
| [Color Thief](https://github.com/lokesh/color-thief) | 已采用颜色实验室核心。当前 v3 为 TypeScript、MIT、零运行时依赖，浏览器 API 支持 OKLCH 量化、颜色占比、AbortSignal 与 WCAG 黑白对比；本项目在外层增加 35 MB/有界 canvas、白底透明合成、精确点取样、任意颜色对 WCAG 阈值和 CSS/JSON 明确复制。 |
| [libDaltonLens](https://github.com/DaltonLens/libDaltonLens) / [DaltonLens 方法综述](https://daltonlens.org/opensource-cvd-simulation/) | 采用公共领域预计算常数和推荐组合：红/绿色觉缺失使用较快的 Viénot 1999，蓝色觉缺失使用更适合该轴的 Brettel 1997。TypeScript 适配在线性 sRGB 中保留 alpha、支持 0%–100% 插值、400 万像素协作分块/取消、对象 URL 释放和明确 PNG 导出；不引入 Python/C/OpenGL 运行时，也不把近似模拟描述为个体真实视觉、诊断或完整无障碍验证。 |
| [Squoosh](https://github.com/GoogleChromeLabs/squoosh) / [Compressor.js](https://github.com/fengyuanchen/compressorjs) / [Canvas `toBlob()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) | 已评估图片优化方向。Squoosh 的 Apache-2.0 多编解码器能力强但明显超出当前单图基础需求；Compressor.js 为 MIT，核心同样使用浏览器原生 `toBlob()`。本项目采用其本机处理、尺寸/品质/格式与导出前指标交互原则，直接使用已有 Canvas 能力并增加 35 MB、8192 边、2400 万像素、MIME 回退验证、对象 URL 释放和透明转 JPEG 白底约束，不增加运行时依赖。 |
| [react-image-crop](https://github.com/dominictobias/react-image-crop) | 已采用裁剪选择器。ISC、零依赖、小于 5 kB gzip，支持响应式百分比坐标、触控、自由/固定比例和键盘无障碍调整。本项目只复用选择交互与比例 helper；旋转、安全工作栅格、百分比到源栅格映射、8 像素下限、PNG/JPEG/WebP 编码、MIME 验证和对象 URL 生命周期由本机代码控制。 |
| [OpenRV Web](https://github.com/lifeart/openrv-web) / [OpenCV Laplace Operator](https://docs.opencv.org/4.12.0/d5/db5/tutorial_laplace_operator.html) / [Canvas `getImageData()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData) | 已采用图片检查方向。OpenRV Web 证明浏览器内直方图/示波器适合专业人工检查；OpenCV 文档给出拉普拉斯二阶边缘响应的标准解释；Canvas API 可直接读取本机 RGBA。项目不引入其 WebGL/VFX 栈或主观模型，只实现有界 64 档直方图、曝光/透明/边缘诊断、公开阈值和版本化 JSON，并明确不把启发值称作质量或对焦结论。 |
| [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor) / [Excalidraw](https://github.com/excalidraw/excalidraw) | 已采用其标注工具、撤销和明确导出的交互方向。前者包含裁剪、滤镜及 Fabric.js 等依赖，后者是完整无限白板，均明显宽于 Dock 的单图复核需求；本项目因此实现无新增运行时依赖的有界矩形、箭头、编号、文字、局部模糊、撤销/重做和扁平 PNG，不嵌入整套编辑器，也不持久化标注工程。 |
| [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor) / [signature extraction reference](https://gist.github.com/princemaple/bfd80a6b8e9bc6a5926f99ba2a9fe464) / [ImageMagick 背景处理讨论](https://github.com/ImageMagick/ImageMagick/discussions/6791) | 已评估签名、印章与线稿透明提取方向。TOAST UI 提供完整编辑器和 RemoveWhite 滤镜；参考 gist 展示深色阈值及裁边工作流但没有清晰许可证，因此只参考流程、不复制源码；ImageMagick 讨论也显示阈值、连通背景和阴影之间存在语义歧义。本项目不新增编辑器、ImageMagick 或 AI 依赖，独立实现浅/深背景、亮度阈值、柔化、源 alpha、透明 RGB 清零、原色/纯色、裁边留白、有界分块取消与明确 PNG 导出，并持续说明这不是签名身份、真实性或法律效力验证。 |
| [PNG Background Remover](https://gist.github.com/saulm314/985a47c7683d0cd9429f8a2938457562) / [addyosmani/bg-remove](https://github.com/addyosmani/bg-remove) / [remove.bg Node wrapper](https://github.com/EddyVerbruggen/remove.bg) | 已评估色彩抠图边界。MIT PNG 示例验证完全透明像素同时清空 RGB 的隐私细节，但逐 RGB 完全匹配不耐 JPEG 噪点；bg-remove 展示本机 AI 蒙版但需要 Transformers.js 与模型；remove.bg 文档指出优质边缘还需要 RGB 去溢色且其方案为云 API。本项目不复制实现、不新增模型或网络调用，独立用 OKLab 感知色距、alpha 加权取样、容差/柔化、分块取消与有界透明 PNG 填补简单纯色背景场景，并明确不提供语义分割。 |
| [OBS Chroma Key shader](https://github.com/obsproject/obs-studio/blob/master/plugins/obs-filters/data/chroma_key_filter.effect) / [FFmpeg despill](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_despill.c) / [Natron OpenFX misc](https://github.com/NatronGitHub/openfx-misc) | 已评估边缘溢色处理。OBS 把 alpha 平滑与靠近色键的去饱和作为独立参数，FFmpeg 以可调 spill map 修改绿/蓝通道，Natron 也把 Despill 作为独立合成步骤；三者说明色键 alpha 不等于真实前景颜色重建。项目不复制其 GPL/LGPL 源码或 shader，而以独立确定性规则只处理中间-alpha 边缘：按 alpha 损失和用户强度向 Rec.709 等亮中性色混合，完整主体保持不变。界面明确提示彩色细边可能变灰，不能称为物理重建或专业合成。 |
| [BrainDeadBackgroundRemover](https://github.com/BizaNator/BrainDeadBackgroundRemover) / [JS Paint](https://github.com/1j01/jspaint) / [node-canvas ImageData notes](https://github.com/Automattic/node-canvas) | 已采用“透明抠图后进入贴纸描边”的工作流方向。BrainDeadBackgroundRemover 把 Sticker Mode、自动裁边和透明/黑/白背景列为背景移除后的成品步骤，但其 Python/多模型桌面栈明显宽于当前 renderer；JS Paint 验证透明图片编辑和移动端复核需求；node-canvas 文档明确浏览器式 ImageData 是非预乘 RGBA。项目不复制实现、不引入模型或完整画板，独立使用 alpha 扫描、线性两遍 3-4 chamfer 距离、百分比描边/留白和三底色复核，并明确结果不是矢量刀模或印刷校准。 |
| [image-collage](https://github.com/mtblc/image-collage) / [SnapSheet](https://github.com/kritxnshu/SnapSheet) | 已采用其多图网格、顺序、适配和明确导出的交互方向。image-collage 面向 Node Canvas/Buffer，SnapSheet 包含 React Konva、jsPDF 与高 DPI 打印编排，均宽于当前本机复核需求；本项目以浏览器原生 Canvas 实现 2–20 图固定联系表、逐张解码、contain/cover、标签与 8192 边/2400 万像素预算，不增加运行时依赖或持久化工程。 |
| [nocoo/image-stitch](https://github.com/nocoo/image-stitch) / [macshot](https://github.com/sw33tLie/macshot) / [OpenCV template matching](https://docs.opencv.org/4.x/de/da9/tutorial_template_matching.html) | 已采用有序滚动截图、自动重叠去除、纵横方向、置信度门禁和输出复核的产品方向，但未照搬 ORB/Apple Vision/单应性流程。前两者分别已归档或为 GPL 原生 macOS 工程；本项目以无新增运行时的有界灰度归一化匹配实现 5%–50% 接缝搜索与有限交叉轴偏移，只自动应用纹理、匹配和候选优势都达标的结果，低置信度失败关闭并保留 1% 手动裁切。重复纹理、悬浮元素、动画和不同缩放仍须人工复核。 |
| [miniPaint](https://github.com/viliusle/miniPaint) / [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor) / [Pixi Image Editor](https://github.com/Pettor/app-pixi-image-editor) / [Matte](https://github.com/rishn/Matte) | 已评估图片调整方向。miniPaint 与 TOAST UI 覆盖亮度、对比度、色相/饱和度、锐化及完整编辑器交互，Pixi 方案依赖 WebGL 滤镜栈，Matte 还包含更广的 AI 编辑流程；它们都明显宽于 Dock 的单图快速复核需求。本项目仅采用预设、数值滑杆、前后 wipe、预览后确认导出的交互原则，以原生 Canvas 实现固定顺序的曝光/对比度/色温/色相/饱和度/灰度/五点锐化、分块取消和有界输出，不引入图层工程、AI 模型或新增运行时依赖。 |
| [Watermark Pro](https://github.com/kdippan/watermark-pro) / [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor) / [Canvas `globalAlpha`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalAlpha) | 已采用其浏览器本机批处理、文字/Logo、平铺、透明度、首图复核和明确导出的产品方向。Watermark Pro 的 Fabric.js/JSZip/FileSaver、拖放图层、历史和预设宽于当前需求，TOAST UI 同样是完整编辑器；本项目以原生 Canvas 实现 1–12 图确定性九宫格/平铺绘制、逐张有界编码和对象 URL 释放，不保存工程或批量 Blob。界面明确区分可见水印与隐形水印、密码学签名和内容来源认证。 |
| [Converseen](https://github.com/Faster3ck/Converseen) / [imgp](https://github.com/jarun/imgp) / [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression) | 采用批量选择、统一缩放/格式、批量命名和本机处理的工作流方向。Converseen/imgp 依赖桌面 ImageMagick/Pillow 且为 GPL，browser-image-compression 引入额外压缩运行时；本项目不复制其代码，复用已有原生 Canvas 有界管线，增加 1–20 图顺序复核、碰撞安全编号与逐张下载，不引入 ZIP 或同时积压结果 Blob。 |
| [Capso](https://github.com/lzhgus/Capso) / [macshot](https://github.com/sw33tLie/macshot) / [BrowseryTools](https://github.com/aghyad97/browserytools) | 采用截图背景、留白、圆角、阴影和窗口装饰的分享型工作流。Capso/macshot 为原生 macOS 工程且许可边界不同，BrowseryTools 是大型多工具站；本项目不复制实现或引入 Fabric.js，以固定 Canvas 布局独立实现六背景、四画布比例、窗口栏和有界预览/导出，并明确装饰不等于来源认证。 |
| [incluud/color-contrast-checker](https://github.com/incluud/color-contrast-checker) | 已评估其 WCAG 2.2 文字化结果、键盘交互和设计令牌导出流程；本项目只复用交互原则，使用小型确定性亮度公式与现有界面实现，不引入整套 Astro 应用。 |
| [addyosmani/bg-remove](https://github.com/addyosmani/bg-remove) / [IMG.LY background-removal-js](https://github.com/imgly/background-removal-js) | 已采用“本机人物蒙版后选择自定义颜色或图片背景”的工作流方向。前者为 MIT React/Vite 示例，后者为 AGPL-3.0 且带独立 ONNX 模型栈；本项目不复制实现或引入其模型/许可，而是在既有 Apache-2.0 MediaPipe 人像蒙版上用原生 Canvas 增加 35 MB/8000 万像素门禁、cover/contain、双轴焦点、留边色、手动蒙版修正与明确 PNG 导出。 |
| [withoutbg](https://github.com/withoutbg/withoutbg) / [PlainRemover](https://github.com/plainlab/plainremover) | 已采用其批量复用模型、逐项进度、自定义背景和本机处理的工作流方向；两者默认 Python/ONNX 或跨平台桌面栈明显宽于当前 Electron renderer。本项目不引入其运行时，只在已有 MediaPipe 单例上实现 2–12 图、160 MB、1200px 预览复核、部分失败、取消及确认后最高 4096px 逐张导出。 |
| [jsPDF](https://github.com/parallax/jsPDF) / [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) | 已采用。仅在用户导出时动态加载，在本机把内存扫描页生成多页 PDF；全部页面有 OCR 词框时，还可用哈希固定的 OFL 中文 TTF 写入不可见 Unicode 层。真实回归由 PDF.js 重新打开并读回中英文/数字，字体只嵌入使用字形。 |
| [PaddleOCR KIE](https://github.com/PaddlePaddle/PaddleOCR/tree/main/ppstructure/kie) | 已评估。支持票据、表单和证件的关键字段提取及字段关系，准确率上限高；默认技术栈和模型明显重于当前离线 Electron 包，暂不进入基础安装。 |
| [docTR](https://github.com/mindee/doctr) | 已评估。Apache-2.0，提供文档层级输出和 KIE predictor；目前依赖 Python 与 PyTorch/TensorFlow，更适合作为未来可选本机服务，而不是 renderer 依赖。 |
| [doc_redaction](https://github.com/seanpedrick-case/doc_redaction) | 已评估。其检测后人工复核/修改流程验证了“自动建议不能替代导出前目视确认”；本项目采用更轻量的 Tesseract 坐标与本机确定性规则提示疑似 PII，仍复用可调整的手动遮盖编辑器，不引入其 Python/云端可选路径。 |
| [MuPDF.js redaction example](https://github.com/ArtifexSoftware/mupdf.js) | 已评估。适合未来对原生 PDF 页面内容应用真正的 PDF redaction；当前扫描器输出的是栅格页，因此直接烧录黑色像素更小、更容易验证且不会留下可移除覆盖层。 |
| [react-image-annotation](https://github.com/Secretmapper/react-image-annotation) | 已评估。矩形标注交互可借鉴，但仓库已归档；本项目用小型无依赖编辑器实现拖动与键盘操作，不增加停更依赖。 |
| [Tesseract.js](https://github.com/naptha/tesseract.js) / [hOCR 1.2](https://github.com/kba/hocr-spec/blob/master/1.2/spec.md) | 已采用。Apache-2.0 的 worker、WASM core 与英/简中/繁中语言数据随应用离线打包，只在文件、单张/批量名片或扫描页 OCR 时动态加载；图像识别返回的词级分数与 bbox 用于本机置信度复核，既可低分优先，也可按阅读顺序分页检查高分词。名片批次与文件批次共用严格串行、短生命周期 worker，但每条联系人字段独立保存。用户可逐词明确修正或删除误检，应用保留首次识别来源、原 bbox 和引擎评分，并把修正文字同步到 TXT、名片解析、版面 JSON/CSV/hOCR/ALTO 与扫描页可搜索 PDF；整段自由编辑不会伪称重排原始词框。 |
| [ALTO XML 4.4 schema](https://github.com/altoxml/schema) / [Library of Congress ALTO structure](https://www.loc.gov/standards/alto/techcenter/structure.html) | 已采用无依赖导出子集。按官方 v4 命名空间生成独立 ALTO XML，把单页像素坐标组织为 PrintSpace / TextBlock / TextLine / String，保留 0–1 `WC` 引擎置信度、`CS` 人工修正状态和原识别 `ALTERNATIVE`；不伪造字体、段落语义、复杂区域或 METS 包装。 |
| [img2table](https://github.com/xavctn/img2table) / [PaddleOCR PP-Structure table recognition](https://github.com/PaddlePaddle/PaddleOCR/blob/main/ppstructure/table/README.md) | 已评估边界。img2table 展示了图像/PDF、OCR、无边框表格、合并单元格和 Excel 结构输出的完整 Python/OpenCV 路线；PP-Structure 则用独立表格结构与单元格坐标模型恢复 HTML。两者都明显宽于当前离线 Electron renderer。项目不复制实现、不引入 Python/Pandas/Paddle 模型，只在已有 Tesseract 词框上独立实现至少 3 行、重复对齐间隔的简单表格候选与逐格人工复核 CSV，并明确不支持合并单元格、跨页结构、嵌套表格和语义。 |
| [PDF.js](https://github.com/mozilla/pdf.js) | 已采用。Apache-2.0；文件 OCR 优先读取 PDF 文本层，对扫描页本地渲染后交给 Tesseract.js；文档模式另提供有明确语义警告的逐页栅格导入，复用扫描、遮盖与再导出链路；测试中还作为独立消费者验证新生成 Unicode OCR 层确实可读。 |
| [cheminfo/mrz](https://github.com/cheminfo/mrz) | 已采用。MIT、无运行时依赖；解析 ICAO TD1/TD2/TD3，提供字段级有效性、校验位和受约束的 OCR 易混字符修正。只作为本机 OCR 后的人工复核助手，不作为证件真实性验证。 |

当前阶段包含姿态、实时/单图/批量 QR/条码识别与 QR 生成、自动纸张边缘与透视矫正、页面方向旋转、原图拍摄质量建议、照片/PDF 栅格导入、多页文档/PDF与可搜索 Unicode OCR 层、手动永久隐私遮盖、扫描页 OCR、本机文字 PII 建议、票据字段、TD1/TD2/TD3 MRZ 复核、批量文件 OCR、单张/批量名片 OCR 与多联系人 VCF、词级置信度与逐词来源保留复核、版面 JSON/CSV/hOCR/ALTO 与简单表格逐格复核 CSV、人脸与常见照片元数据隐私、人物背景、内置/自定义模型物体识别、图片滑动/像素差异对比、批量近重复查找、图片优化、裁剪旋转、图片直方图/像素检查、图片标注、批量联系表、带置信度门禁的滚动截图重叠检测、长图拼接/拆分、带色相与锐化的图片调整、批量可见水印、批量缩放/转换/重命名、截图美化、签名/印章/线稿透明提取、绿幕/纯色背景色彩抠图、透明图贴纸描边、颜色分析、三类色觉近似预览和镜像切换。文档处理已迁移到隔离 worker，避免阻塞 UI 或削弱 renderer CSP；保留原 PDF 结构的原生 redaction、模型级复杂表格/版面恢复、特征级全景配准、专业绿幕去溢色、矢量刀模/印刷校准、可验证内容来源签名与虚拟摄像头仍需要不同或进一步验证的架构，留在后续阶段。

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
