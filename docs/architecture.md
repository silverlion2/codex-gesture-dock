# Codex Gesture Dock 架构

## 系统边界

| 组件 | 职责 | 信任级别 |
|---|---|---|
| React renderer | 摄像头 UI、姿态/手势状态、任务与审批交互 | 沙箱渲染器，不具备 Node 权限 |
| Electron preload | 暴露固定类型的 IPC 方法和事件退订器 | 最小桥接层 |
| Electron main | 窗口、权限、协议、IPC 验证、更新、审计 | 本机受信任进程 |
| MediaPipe WASM/models | 本机视频推理 | 本地静态资源，不联网取模型 |
| Tesseract.js / PDF.js | 文件与名片 OCR、PDF 文本层读取、OCR 扫描页渲染，以及文档模式 PDF 栅格导入 | 本地 worker、WASM 与语言数据，不联网取模型 |
| OpenCV.js / jsPDF | 文档边缘检测、透视矫正、图像增强和多页 PDF 生成 | OpenCV 仅在隔离 worker 中运行；输入与输出只走可转移像素缓冲区，PDF 在 renderer 内按用户操作生成 |
| cheminfo/mrz | 文件/扫描页 OCR 后的 ICAO TD1、TD2、TD3 MRZ 解析、字段级 OCR 易混字符修正与校验位检查 | 依赖为空、MIT；仅处理 renderer 内存文本，必须人工复核后才能导出结构化 JSON |
| exifr | 用户选择 JPEG/PNG 的常见 EXIF/GPS 隐私字段检查 | MIT、无运行时依赖；只挑选位置、设备、序列号、时间、作者、软件和描述字段，结果只留 renderer 内存；WebP/BMP 不声称已检查 |
| MediaPipe FaceDetector / BlazeFace | 用户选择照片的本机人脸框检测 | 复用本地 WASM；模型随包分发，结果只在 renderer 内存中用于人工复核和栅格隐私处理 |
| MediaPipe ImageSegmenter / SelfieSegmenter | 用户选择人物照片的本机前景分割 | 复用本地 WASM；置信度蒙版和处理预览只留在 renderer 内存，透明/模糊/纯色结果由用户明确导出 |
| MediaPipe ObjectDetector / EfficientDet-Lite0 / 用户导入 TFLite | 用户明确捕获的一帧摄像头画面或选择照片的本机物体定位 | 复用本地 WASM；内置模型或经过格式、大小和兼容性验证的临时模型、标签、置信度和归一化框只在 renderer 内存中供筛选、复核和明确导出 |
| Pixelmatch | 两张用户选择图片的感知像素差异、抗锯齿过滤与差异蒙版 | ISC；在 renderer 的有界 RGBA typed array 上运行，图片和结果不联网、不持久化 |
| Color Thief | 用户选择图片的 OKLCH 代表色、颜色占比与黑白文字建议 | MIT、零运行时依赖；只读取 renderer 内的有界 canvas，调色板与取样点不联网、不持久化 |
| Codex App Server | 本机任务、通知、逐次审批和 turn 操作 | 本机子进程，所有输入仍做边界验证 |
| PowerShell helpers | Codex 身份检查和 Windows 固定快捷动作 | 固定脚本与固定参数白名单 |
| GitHub Releases | 安装版更新源 | 仅接受 electron-builder 固定仓库配置 |

## 关键数据流

### 摄像头工具模式

主面板复用同一个 `HTMLVideoElement` 与摄像头流，不为不同工具重复申请权限。姿态模式运行 MediaPipe 姿态与可选手势识别；扫码模式按需动态加载 MIT 许可的 `@zxing/browser`，直接从现有视频元素解码 QR、Data Matrix 和常见一维条码，也可在不申请摄像头权限时从用户选择的最大 35 MB PNG/JPEG/WebP/BMP 对象 URL 做一次性解码；对象 URL 在成功或失败后都立即撤销。文档模式在用户拍摄、选择照片或导入 PDF 后，把像素发送给同源 classic worker 内的 OpenCV.js。PDF.js 在 renderer 中按页顺序渲染最多 20 页、35 MB 的 PDF，每页最长边限制为 2200 像素；渲染结果故意不携带原 PDF 文本层、表单、链接或批注，再走与照片相同的人工复核、增强与遮盖链路。worker 在最长边 1200 像素的检测图上执行灰度、模糊、Canny、四边形轮廓筛选，再对原图执行最高 2200 像素的透视变换和所选增强，最后只传回 RGBA 像素缓冲区。`documentQuality.ts` 同时对原始缩放页最多约 60000 个采样点计算亮度均值/方差、拉普拉斯边缘响应、阴影/高光比例和 4×4 高光集中度；由阈值生成低分辨率、偏暗、过亮、低对比、模糊或疑似反光建议。质量结果是可见的启发式人工复核信号，不阻止 OCR/导出，也不声称证明页面可读。这样既不阻塞主线程，也不需要为 Emscripten 运行时放宽 renderer 的 `script-src` CSP。扫码值、扫描页和质量指标只保留在 React 内存中；只有用户明确复制、导出 PNG 或由 jsPDF 生成多页 PDF 时图像才离开工具状态，质量指标不写入导出文件，两个模式都不发送网络请求。

扫描页把 `rotation` 作为 0/90/180/270 的显式页面状态。左右旋转只读取未遮盖 `baseDataUrl`，在 canvas 上交换宽高并做 90° 栅格变换；每个归一化遮盖框按 `(x,y,w,h)` 同步转换，再调用同一永久遮盖路径重新烧录，避免旋转已遮盖位图导致框状态与像素脱节。旋转后清除 OCR、PII、票据和 MRZ 派生状态。重新应用滤镜或手动角点时，系统先从原始页重建，再恢复保存的旋转角度，最后按旋转坐标重放遮盖，确保方向与隐私处理不会静默丢失。

构建前 `scripts/copy-vision-assets.mjs` 把 OpenCV.js 和受控 worker 包装器复制到被忽略的 `public/vision/`。扫描器保留原始页、源尺寸与所用角点，以支持彩色、灰度、黑白文档效果的重复处理和手动四角修正；手动角点在 worker 内重新排序、限制到图像边界，并拒绝小于源图 2% 的无效多边形。多页缩略图、删除和当前页 OCR 都使用内存对象。单张导入图最大 35 MB，进入 worker 前最长边限制为 3200 像素以控制峰值内存；未检测到可信四边形时明确回退到整图轻微内缩增强，不伪称已自动拉正。

隐私遮盖使用相对当前矫正页的归一化矩形坐标。用户可拖动画框，也可用键盘移动或调整大小；应用确认时在 canvas 上把矩形烧录为不透明黑色像素，随后 PNG、jsPDF 和 OCR 只读取这张已遮盖栅格，而不是仅绘制可移除的视觉覆盖层。未遮盖的基础页只在 renderer 内存中用于复核、修改或清除遮盖，不进入导出。重新应用滤镜或四角矫正时会自动把已有遮盖重新烧录，避免处理操作静默恢复敏感像素。此功能是栅格遮盖，不声称具备 PDF 原生批注能力。

扫描页图像 OCR 会请求 Tesseract 返回文字块坐标。`localOcr.ts` 把 word bbox 转成带行号的内存区域，`piiSuggestions.ts` 再按同一行的最多六个连续词执行保守的确定性匹配：邮箱、中国大陆身份证号、格式化电话以及通过 Luhn 校验的 13–19 位金融卡号。匹配框经边界归一化和重叠去重后只作为 `DocumentRedactionEditor` 的初始建议；OCR 文本、坐标和建议不进入 IPC 或持久化。系统不会自动应用建议，用户必须逐项调整、删除或确认并点击“应用遮盖”，且仍需目视检查漏检和误检。

同一组 `OcrRegion` 还供非破坏性的词级置信度复核使用。`ocrConfidence.ts` 以纯函数限制阈值、分数和像素框，过滤无文字/非有限数据，按低分优先归一化到 0–1 坐标并最多保留 100 项；`OcrConfidenceReview` 在原图上同步显示框、列表和阈值 50–95 的摘要。文件与名片通过短生命周期对象 URL 展示原图并在卸载时撤销，扫描页直接复用当前 data URL 和已知尺寸。选择词框只改变临时 UI 状态，不改写识别文本或导出数据。直接从 PDF 内嵌文本层得到的结果没有 Tesseract 词框，因而不提供此复核入口。

`useMediaDevices` 监听本机设备变化并提供摄像头/麦克风选择；所选设备 ID、镜像和填满/完整取景方式保存在 renderer 的版本化 `localStorage`。切换摄像头会取消旧推理帧、停止旧视频轨道并用指定 `deviceId` 重启同一姿态会话。麦克风由独立的 `useAudioInput` 流管理，默认关闭；用户明确开启后使用 Web Audio `AnalyserNode` 计算本机输入电平，不连接扬声器、不录制、不转写，关闭或切换设备时立即停止旧音频轨道。

文件 OCR 与名片 OCR 不要求摄像头权限。构建前 `scripts/copy-ocr-assets.mjs` 把 Tesseract worker、兼容的 LSTM core、轻量 `best_int` 英文/简中/繁中语言数据和 PDF.js worker 复制到 `public/ocr/`，由 Vite 一并打包。图像直接交给本机 OCR worker；PDF 先读取文本层，只有缺少有效文本层的页面才以 2× canvas 渲染后 OCR。单文件上限 35 MB，PDF 上限 20 页。单文件入口创建一次性会话；多文件批次和“未识别扫描页”创建固定语言、严格单飞的短生命周期会话，同一会话按顺序复用一个懒加载 worker。会话在完成、取消、异常或工具卸载后确定性终止，原文件与识别结果不进入 IPC 或持久存储。

文件 OCR 的批次队列最多接收 20 个混合图像/PDF，并在一个 `withLocalOcrSession` 中严格串行，避免并发 WASM worker、语言模型或 PDF canvas 造成峰值内存叠加，也避免每个文件重复初始化相同语言模型。每个文件独立记录等待、处理中、成功、失败或取消状态；普通无文字错误保留健康 worker，运行时错误会丢弃并在后续项懒重建，单项失败不阻断后续文件。取消通过同一个 `AbortController` 终止并丢弃当前 worker、标记未完成项目，已经完成的结果继续留在内存供复核。合并 TXT 只包含成功项，使用原文件名分隔且保持用户选择顺序。

MRZ 提取只在用户从完成的文件 OCR 或扫描页 OCR 结果中明确触发。预处理只保留大写 `A-Z`、数字和 `<` 分隔符，按 TD1（3×30）、TD2（2×36）和 TD3（2×44）窗口寻找候选；只有不含校验位的姓名行允许补齐被 OCR 丢弃的末尾 `<` 填充符，证件号码、日期与综合校验所在数据行必须保持精确长度。候选再交给 `mrz` 以 `autocorrect` 模式做字段类型约束的 `O/0` 等易混字符修正与所有校验位验证。界面同时保留原始行、字段修正数、补齐填充数、无效字段和可编辑结果；复制/导出在用户勾选对照原件前失败关闭。导出的 JSON 不包含原始 MRZ 行，并固定标记 `authenticityVerified: false`，避免把字符完整性误报为证件真实性。

名片解析是本机确定性后处理：从 OCR 文本中提取常见联系人字段并显示为可编辑表单。只有用户确认并点击导出后才生成 `.vcf`；原始 OCR 结果不会自动写入联系人系统。

票据/发票解析同样是本机确定性后处理：`receiptFields.ts` 从当前矫正页的 OCR 行中匹配中英文总额、小计、税额、日期、单据号与币种，并以首个可信文本行预填商户。该规则不依赖云端 KIE 模型，适合常见清晰票据，但不承诺税务合规或复杂版面准确率；字段始终可编辑，用户明确复制 JSON 或导出 CSV 前不写盘。若未来需要表格坐标、字段关系或多版式模型，优先在独立可选组件中评估 PaddleOCR KIE/docTR，而不是把 Python/PyTorch 运行时塞进默认 Electron renderer。

人脸与照片隐私模式动态加载 `FaceDetector` 与随包分发的 BlazeFace short-range TFLite 模型，直接对用户已加载的本机图像运行一次静态推理，再把返回的像素坐标按原图尺寸归一化为可复核的人脸框。漏检时，用户可添加归一化手动隐私区，以指针拖动，或用方向键/Shift 移动、Alt + 方向键缩放和 Delete 删除；自动框与手动框都经过相同的边界限制、启停复核、保护范围外扩和永久像素处理。`imageMetadata.ts` 同时按需动态加载无依赖的 `exifr`：JPEG/PNG 只解析常见的 GPS、设备型号/序列号、拍摄时间、作者、软件与描述字段，并把位置和序列号标为高风险；WebP/BMP 明确显示检查范围受限。用户可选择模糊、像素化或黑色遮盖，并用 10%/18%/30% 外扩范围覆盖头发与脸部边缘；`facePrivacy.ts` 无论是否检测到人脸都把原像素重新绘制到最长边不超过 4096 像素的 PNG canvas。该路径不复制源文件的 EXIF/GPS/XMP/IPTC/ICC 数据，也不保留可移除覆盖层。它不是隐藏内容或隐写取证；自动检测仍可能漏掉侧脸、遮挡、小人脸或可见敏感信息，因此 UI 明示人工复核且不声称保证匿名。模型来自 MediaPipe 官方 [Tasks-format short-range BlazeFace asset](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite)，仓库内 SHA-256 为 `B4578F35940BF5A1A655214A1CCE5CAB13EBA73C1297CD78E1A04C2380B0152F`。

人物背景模式动态加载 `ImageSegmenter` 与官方 square SelfieSegmenter float16 模型，对用户选择的本机照片生成背景/人物置信度蒙版。`backgroundRemoval.ts` 把人物通道复制到 renderer 内存，以可调阈值和柔化范围生成 alpha；归一化的“保留人物/移除背景”画笔笔划可在合成前以软边圆刷覆盖 alpha，单次最多 200 笔、每笔最多 500 点，原始照片像素不被涂改。随后在最长边不超过 4096 像素的 canvas 上合成透明、模糊或纯色背景。画笔支持撤销、清空、取消回滚和明确应用，且只留在当前 renderer 内存。原图对照和人物覆盖率用于导出前复核；低于 1% 的人物区域会被拒绝，细发丝、透明饰物和运动边缘仍可能遗漏。模型来自 MediaPipe 官方 [SelfieSegmenter asset](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite)，仓库内 SHA-256 为 `191AC9529AE506EE0BEEFA6B2C945A172DAB9D07D1E802A290A4E4038226658B`。

扫描页顺序以 `DocumentToolPanel` 的 `pages` 数组为唯一来源。前移/后移会重排完整 `ScannedDocumentPage` 对象并同步更新活动索引，因此当前页面的永久遮盖、旋转、质量信息与当前 OCR 复核状态不会被错误清空或附着到另一页；缩略图编号、预览和 `downloadScannedPdf` 都直接读取同一新顺序。

扫描页 OCR 复核以页面 `id` 为键保存在 renderer 内存，同时保存识别原文、当前人工复核文本和原始坐标建议。编辑文字不会重算坐标建议；复制、票据/MRZ 提取和 TXT 使用当前文本，“恢复识别文本”则只回滚文字。切换或重排页面只更换活动键；旋转、重新拉正、滤镜重处理、永久遮盖和删除页面会只使对应键失效，避免旧坐标继续用于新像素。`OCR 未识别页` 按当前 `pages` 顺序串行调用本机 OCR，并在取消或单页失败时保留已经成功的页面。合并 TXT 同样读取当前页序，逐页写入原文件名；尚未 OCR 与人工复核后为空使用不同占位符，不把部分结果伪装成完整文档。

`ocrLayoutExport.ts` 将文件、名片和扫描页共有的原始 Tesseract 词框转换为版本化 `ocr-word-layout` 文档。纯函数先验证原图尺寸、过滤空文本/非有限值/零面积框、把坐标限制在图像边界，再按首次出现的 `lineId` 分组并同时写出左上角像素 bbox 与六位小数的 0–1 归一化 bbox。文件 OCR 只在用户点击导出时通过短生命周期对象 URL 解码原图尺寸；扫描页复用已知栅格尺寸。JSON 使用稳定 schema v1，UTF-8 CSV 带 BOM、所有单元格加引号，并在可能被表格软件当作公式的文本前加单引号。两种路径都净化下载文件名、立即撤销对象 URL，且不把人工修正文本映射回旧坐标；只有用户明确点击才写盘。

物体识别模式动态加载 `ObjectDetector` 与官方推荐的 EfficientDet-Lite0 uint8 模型，对用户明确点击捕获的一帧摄像头画面或选择的本机照片执行一次静态推理，不持续分析视频。用户也可导入最大 100 MB 的可信 `.tflite` 文件；`objectDetection.ts` 先验证扩展名、大小与 `TFL3` FlatBuffer 标识，再用 `modelAssetBuffer` 创建 ObjectDetector，只有包含 MediaPipe 所需检测元数据与受支持张量的模型才能替换当前模型。可选 UTF-8 标签 TXT 限制为 256 KB、10000 个索引行；模型、标签和实例只留本次 renderer/WASM 内存，恢复内置模型或离开工具时关闭并释放，不写入配置。检测结果最多保留 30 个不低于 25% 的候选；界面再以 25%–80% 阈值筛选，并允许逐框启用或跳过。复制 JSON 和最长边不超过 4096 像素的标注 PNG 都只包含当前可见且已启用的复核结果。任何内置或自定义模型都可能只覆盖有限标签，不用于身份、安全、无障碍或自动化判断。内置模型来自 MediaPipe 官方 [Object Detector web guide asset](https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite)，仓库内 SHA-256 为 `2E04C53BFEAC0AC2A30C057C7E2A777594CE39BAAAC35A92F74FB1E8C4FC4E0B`。

图片对比模式只接受用户明确选择的最大 35 MB PNG/JPEG/WebP/BMP。`imageComparison.ts` 解码两图后保持共同缩放比例、按左上角放置到白色公共画布；任一边不超过 2400 像素且总像素不超过 400 万，尺寸和裁切差异因此保持可见而不会无界占用内存。Pixelmatch 在固定容差下忽略常见抗锯齿噪声，返回差异像素数并写入红/蓝差异蒙版；本机代码再计算最小包围框并生成淡化背景热图。原图、归一化 RGBA、滑动预览和差异图只留 renderer 内存，只有用户明确点击才导出重新编码的 PNG。像素相似度不能证明功能正确、视觉质量、语义等价或可访问性，界面始终要求滑动复核关键区域。

同一图片分析入口的批量查重工作区最多接收 20 张、合计 200 MB 的图片。`imageSimilarity.ts` 严格串行解码每一项，把白底缩放后的 9×9 亮度样本分别做 8×8 水平与垂直梯度比较，组合为 128 位 dHash；同时生成最长 240×150 的内存 JPEG 预览，并在 Web Crypto 可用时对源字节计算 SHA-256。最多 190 个文件对在 renderer 内用 Hamming 距离比较，精确摘要一致的文件不受感知阈值排除，其他候选按 2/8/16 位阈值和距离排序。单项解码失败保留其他结果，取消会停止当前对象 URL/后续摘要；原文件、摘要、预览和结果不进入 IPC、持久化或文件操作。dHash 对旋转、大幅裁切和拼图不稳，也不理解语义，因此界面只提供人工候选而不自动删除或合并。

单图优化作为图片分析的第三个独立工作区，使用 `imageOptimizer.ts` 与浏览器原生 `HTMLCanvasElement.toBlob()`，不引入额外编解码运行时。输入先做类型与 35 MB 限制；尺寸函数合并用户最长边、8192 像素单边和 2400 万总像素三重比例，并在缩放时向下取整保证不越界且不放大。Canvas 使用高质量插值，PNG/WebP 保留 alpha，JPEG 先铺白底；返回 Blob 的 MIME 必须与请求格式完全一致，防止浏览器回退 PNG 后仍使用错误扩展名。结果 Blob 与对象 URL 只在当前 renderer 会话保留，切换设置、重置或卸载时撤销；重新编码不会复制源 EXIF/GPS/XMP/IPTC/ICC，只有明确下载才写盘。品质参数只传给 JPEG/WebP，体积可能变大，界面不声称专业无损优化。

裁剪旋转工作区使用 ISC 许可、零依赖的 `react-image-crop` 提供响应式百分比选择、触控和键盘交互，但像素处理仍由 `imageCrop.ts` 控制。每次 0/90/180/270° 方向变化都从用户原始 `File` 重新解码，在最长边 8192 像素/2400 万像素限制内生成新的内存 PNG 工作栅格，避免对上一次旋转结果累计损失。UI 始终保留 `PercentCrop` 作为裁剪真值；生成预览时直接按百分比映射到工作栅格，所以窗口或面板在选择后改变尺寸也不会留下过期的显示像素坐标，再向边界限制并拒绝小于 8×8 像素的区域。最终 canvas 只绘制该区域，并按 PNG/JPEG/WebP、JPEG 白底、40%–100% 品质和严格 MIME 验证重新编码。工作栅格、结果 Blob 与两个对象 URL 在替换、返回或卸载时释放；只有结果页明确下载才写盘，源文件不覆盖。

图片检查工作区由 `imageInspection.ts` 直接读取用户选择的本机图片，不增加模型或图像运行时。输入先限制为 35 MB 的 PNG/JPEG/WebP/BMP，再等比例缩到最长边 2400 像素、总计 400 万像素的透明 canvas。单次 RGBA 遍历把所有非全透明像素累计为 64 档亮度/R/G/B 直方图、均值、标准差和近黑/近白比例，同时单独统计全透明与半透明覆盖；完全透明像素不进入曝光数据。边缘响应在最多约 60000 个采样中心上使用 OpenCV 文档同形的十字 3×3 拉普拉斯核，只在中心及四邻域均可见时计算。复核信号是公开阈值的诊断提示而非质量分数，JSON 固定为 `local-image-inspection` schema v1。原图对象 URL、预览 Blob 与像素数组只留 renderer 内存；只有明确导出 JSON 才写盘。

图片标注工作区由 `ImageAnnotationPanel` 和无额外运行时依赖的 `imageAnnotation.ts` 组成。输入复用裁剪工作区的 35 MB 类型检查与最长边 8192 像素/2400 万像素安全工作栅格；编辑状态只保存最多 100 个归一化、边界受限的矩形、箭头、编号、文字或模糊区域，以及不可变的内存撤销历史。指针坐标在离开画布时仍会夹紧，框和箭头拒绝小于 8 像素；键盘中心添加和列表方向键微调覆盖无指针流程。扁平渲染固定先从原工作像素重绘模糊区域，再绘制可见标注，输出严格验证的元数据无关 PNG。源 Blob、历史与结果对象 URL 在重置或卸载时释放；不保存可编辑工程，只有结果页明确下载才写盘。

联系表工作区由 `ImageContactSheetPanel` 和 `imageContactSheet.ts` 组成，不增加图片运行时。组件保留用户明确选择的 2–20 个 `File`、临时缩略对象 URL、顺序与布局设置；每个文件限制 35 MB、合计 200 MB。纯布局函数根据列数、单格比例、间距、标签和请求宽度计算稳定网格，再以最长边 8192 像素、总计 2400 万像素两重预算等比缩放整个输出。渲染器只创建一个不透明 Canvas，按当前顺序逐张创建短生命周期对象 URL、解码、按 contain 或中心 cover 规则绘制并立即释放 URL，避免同时保留所有解码位图；标签使用序号和按测量宽度截断的文件名。结果严格验证为 PNG，并通过安全文件名明确下载；重置或卸载撤销所有缩略/结果 URL，不复制源元数据、不改写源图片、不持久化布局工程。

长图工作区由 `ImageLongLayoutPanel` 和 `imageLongLayout.ts` 组成，不引入自动特征匹配或新增运行时。拼接模式保存 2–12 个 `File`、对象 URL、顺序、后续图片 0%–50% 的手动起始裁去比例、方向/间距/背景；纯布局函数以全部图片最小宽度（纵向）或最小高度（横向）为公共交叉轴，避免放大小图，再把整体限制到 8192 边长和 2400 万像素。渲染分尺寸读取与绘制两遍，均按顺序只保留一个短生命周期解码对象。拆分模式只解码一个输入，通过舍入后的相邻边界把源主轴完整覆盖为 2–12 个无缺口、无重复区间，并按最大单份预算统一计算安全缩放；每份 Canvas 编码后立即进入结果列表。两种模式都拒绝解码后超过 8000 万像素的源图，严格输出 PNG，释放预览/结果 URL，不复制元数据或保存工程。

图片调整工作区由 `ImageAdjustmentPanel` 和 `imageAdjustment.ts` 组成，不增加编辑器或 WebGL 运行时。纯像素函数严格验证设置并按曝光、对比度、色温、饱和度、灰度顺序处理 RGBA，alpha 字节保持不变；预设只是这些公开参数的固定组合。准备阶段仅保留原始 `File`、最长边 1600 像素/240 万像素的预览栅格及目标输出尺寸；最终导出时才重新解码原文件，按 8192 边长/2400 万像素预算生成工作栅格，并以 20 万像素为一批主动让出事件循环和检查取消信号。PNG/WebP 保留透明度，JPEG 先铺白底，返回 Blob 必须严格匹配请求 MIME。预览或结果对象 URL 在替换、重置和卸载时撤销；重新编码不复制源元数据，也不声称具备 RAW 处理、ICC 色彩管理或专业校色能力。

批量水印工作区由 `ImageWatermarkPanel` 和 `imageWatermark.ts` 组成，不引入 Fabric.js、图层工程或 ZIP 运行时。组件仅保留 1–12 个用户 `File`、可选 Logo、首图原始/结果预览 Blob、顺序与公开设置；每项 35 MB、合计 160 MB，Logo 10 MB。纯布局函数在九个锚点与平铺网格中使用相对短边的尺寸/边距，文字用反色描边；Logo 保持宽高比。首图在 1600 边长/240 万像素预算内预览；确认后才按当前顺序逐张重新解码，在 8192 边长/2400 万像素预算内绘制并立即触发该项下载与释放对象 URL，避免把整批高分辨率 Blob 同时留在内存。PNG/WebP 保留 alpha，JPEG 白底，MIME 严格匹配；取消或后续文件失败时明确报告此前已请求下载数量。可见像素叠加不提供隐形水印、密码学签名、C2PA 或不可移除性。

颜色实验室只接受用户明确选择的最大 35 MB PNG/JPEG/WebP/BMP。`colorAnalysis.ts` 把图像等比例限制到最长边 2400 像素、总计 400 万像素，先合成到白底 canvas，再由 Color Thief 3 以 OKLCH 空间提取并按 HEX 去重为最多 6 个代表色。canvas RGBA 同时用于用户点击位置的精确 sRGB 取样；前景/背景的相对亮度和 WCAG 2 对比比率由独立纯函数计算，阈值固定为 AA 正文 4.5、AA 大字 3、AAA 正文 7、AAA 大字 4.5。原图、像素、调色板、取样点和颜色对只留 renderer 内存，CSS/JSON 只在用户明确复制后离开状态。透明像素按白色合成；单一颜色对的数学结果不代表已定位图片文字、确定字号或完成整体无障碍审计。

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
| OpenCV worker 初始化/处理失败 | 当前扫描页不可用 | 隔离 worker 错误事件或结构化错误响应 | 拒绝当前请求、显示错误；下一次请求可重新创建 worker，不放宽 CSP、不回退网络处理 |
| GPU 模型初始化失败 | 首次推理失败 | MediaPipe 初始化异常 | 姿态模型回退 CPU；错误可见 |
| 视频帧暂时未就绪 | 画面启动或恢复稍慢 | `readyState` / 新帧时间检查 | 保持低成本帧调度，可用帧到达后自动恢复 |
| Codex App Server 不可用 | 任务和审批不可用 | runtime 状态与超时 | 保留 UI、显示错误、下次请求重连 |
| Helper 输出无效 | 动作不执行 | JSON/字段严格验证 | 失败关闭并写隐私安全审计 |
| Renderer 崩溃/无响应 | 窗口暂时不可用 | Electron 进程事件 | 一分钟最多恢复两次，超限关闭/退出 |
| 更新下载失败 | 保持当前版本 | updater error 事件 | 显示清理后的错误，可稍后重试 |

## 本地数据

### 批量图片转换

`ImageBatchProcessorPanel` 只保留最多 20 个用户选择的 `File`、公开转换设置和一个首图结果 Blob。`imageBatchProcessor.ts` 复用 `imageOptimizer.ts` 的原生 Canvas 解码、宽高比缩放、8192 边长/2400 万像素输出预算、JPEG 白底及严格 MIME 检查，并在其上增加 35 MB 单项/200 MB 合计门禁与 Windows 安全编号命名。首图复核后，组件按当前列表顺序逐张调用处理函数，立即触发下载并延迟释放对象 URL；取消或错误只报告已请求的下载，不缓存整批高分辨率结果。该路径不引入 ImageMagick、WASM 编解码器、ZIP 运行时或网络服务。

### 表情动态面具

面具模式复用主面板现有 `HTMLVideoElement`，不重新申请摄像头权限。`useFaceMask` 仅在面具模式且摄像头进入 monitoring 状态后，动态导入 `FaceLandmarker`，以 20 FPS 上限执行同步视频推理，并把官方模型输出的 478 个关键点与 52 个 blendshape 映射为张嘴、微笑、左右眨眼和抬眉五个平滑控制量。`faceMasks.ts` 在与视频同原始尺寸的透明 Canvas 上绘制三种面具，Canvas 和视频共享 cover/contain 与镜像变换，因此不复制视频像素。离开模式会取消动画帧并清空 Canvas；关键点、表情系数和画面不持久化、不进入 IPC、不上传。模型来自 MediaPipe 官方 [Face Landmarker float16 asset](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)，仓库内 SHA-256 为 `64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF`。

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
