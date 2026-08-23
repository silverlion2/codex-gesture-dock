# Codex Gesture Dock 工作区结构

稳定的运行时分层、模块职责、性能边界和新增功能入口见根目录
`CODE_STRUCTURE.md`；本页保留重要文件的细粒度索引。

```text
src/                    React UI、MediaPipe hooks、状态机和组件测试
src/lib/visionRuntime.ts MediaPipe Tasks 的单一可重试动态导入边界，供姿态、手势、面具、人脸、背景与物体工具共享
src/lib/pointerGestures.ts 空中鼠标的食指平滑、捏合单击复位、张掌滚动和纯状态机边界
src/lib/voiceControl.ts 语音状态/动作类型、状态摘要与 19 条中英文固定口令展示源
src/lib/piiSuggestions.ts 扫描页 OCR 坐标的本机敏感信息建议与遮盖框生成
src/lib/ocrConfidence.ts OCR 词级置信度摘要、低分排序、坐标限制与归一化
src/lib/ocrCorrections.ts OCR 逐词修正的顺序精确匹配、来源保留、空值删除与失败关闭边界
src/lib/businessCard.ts 单张/批量名片的确定性字段解析、vCard 3.0 转义、安全文件名与 1–20 联系人合并
src/lib/ocrLayoutExport.ts OCR 当前词框的版本化 JSON、公式安全 CSV、来源字段、转义单页/多页 hOCR 与 ALTO 4.4 页面/行/词结构及安全文件名
src/lib/ocrTable.ts OCR 词框的保守行列间隔聚类、最大简单表格候选、可编辑矩形 CSV 与公式安全文件名
src/lib/searchableDocumentPdf.ts 扫描栅格、逐词复核文字及原坐标、混合中英文 run 与离线子集字体生成可搜索 PDF
src/components/OcrLayoutExportActions.tsx 版面 JSON/CSV 动作及简单表格模态逐格复核、失败关闭和明确导出
src/lib/documentScanner.ts 照片/PDF 栅格导入、OpenCV 扫描、永久遮盖与 PNG/PDF 导出
src/lib/documentQuality.ts 扫描原图的有界亮度、对比度、清晰度、分辨率与局部高光启发式分析
src/lib/mrzExtraction.ts 文件/扫描页 OCR 的 TD1/TD2/TD3 候选提取、字段校验与复核 JSON
src/lib/codeImageScanner.ts 用户选择图片的一次性本机 QR/条码解码与资源释放
src/lib/qrCodeCreator.ts 文字/HTTP(S)/Wi-Fi/vCard QR payload 校验、转义与本机 ZXing SVG writer
src/components/QrCodeCreatorPanel.tsx QR 类型表单、可撤销 SVG 预览与显式 SVG/PNG/剪贴板输出
src/lib/imageMetadata.ts  用户选择照片的常见 EXIF/GPS 隐私字段检查与无元数据导出文件名
src/lib/imageComparison.ts 两张本机图片的有界归一化、Pixelmatch 差异指标、热图与安全导出文件名
src/lib/imageSimilarity.ts 批量图片的 128 位双方向 dHash、SHA-256 精确摘要、Hamming 距离与候选排序
src/lib/imageOptimizer.ts 单图有界等比例缩放、PNG/JPEG/WebP 原生 Canvas 编码、MIME 验证与安全导出文件名
src/lib/imageCrop.ts 单图安全工作栅格、原图派生 90° 旋转、裁剪坐标限制和 PNG/JPEG/WebP 输出
src/lib/imageInspection.ts 单图有界 RGBA 检查、64 档直方图、曝光/透明/拉普拉斯诊断信号和 schema v1 JSON
src/lib/imageAnnotation.ts 单图归一化标注模型、边界/顺序验证、模糊优先扁平渲染和安全 PNG 文件名
src/lib/imageContactSheet.ts 2–20 图联系表验证、contain/cover 几何、有界网格布局、逐张 Canvas 合成和安全 PNG 文件名
src/lib/imageLongLayout.ts 2–12 图纵横拼接、手动起始裁去、连续等分拆图、逐项有界 Canvas 渲染和安全 PNG 文件名
src/lib/imageAdjustment.ts 单图确定性曝光/对比度/色温/饱和度/灰度、分块处理、有界预览与 PNG/JPEG/WebP 导出
src/lib/imageWatermark.ts 1–12 图文字/Logo 九宫格或平铺水印、有界逐张 Canvas 渲染与安全 PNG/JPEG/WebP 文件名
src/lib/imageBatchProcessor.ts 1–20 图批量缩放/格式转换、碰撞安全编号命名、合计体积门禁与逐张处理适配
src/lib/screenshotBeautifier.ts 截图渐变/纯色背景、比例扩展、留白、圆角、阴影、窗口装饰与有界 PNG/JPEG/WebP 渲染
src/lib/imageInkExtraction.ts 浅/深背景亮度 alpha、柔化、透明 RGB 清理、裁边留白、分块取消与有界透明 PNG 输出
src/components/ImageInkExtractionPanel.tsx 签名/印章/线稿源图与棋盘格预览、参数门禁、复核边界和明确透明 PNG 导出
src/lib/imageColorKey.ts OKLab 感知色距、alpha 加权取样、色键柔化、中间-alpha 等亮溢色中和、透明 RGB 清理、分块取消与有界透明 PNG 输出
src/components/ImageColorKeyPanel.tsx 绿幕/纯色背景取样、棋盘格预览、全局同色风险和明确透明 PNG 导出
src/lib/imageStickerOutline.ts 透明边界扫描、两遍 3-4 chamfer 距离描边、主体裁边、百分比留白、分行取消与安全透明 PNG
src/components/ImageStickerOutlinePanel.tsx 人物/Logo/线稿贴纸描边、棋盘格/白/黑底复核、参数门禁和明确透明 PNG 导出
src/lib/colorAnalysis.ts 用户图片的有界白底归一化、OKLCH 调色板、点取样、WCAG 对比与 CSS/JSON 序列化
src/lib/colorVisionSimulation.ts 公共领域 Viénot/Brettel 线性 sRGB 色觉近似、分块取消与 PNG 输出
src/components/ColorVisionSimulatorPanel.tsx 原图/模拟图复核、类型/强度控制、方法边界与明确 PNG 导出
electron/               Electron main/preload、Codex/Windows 控制和单元测试
electron/pointer-command.cjs 归一化手部坐标到当前显示器工作区的纯验证与映射边界
electron/windows-pointer-control.ps1 按需常驻且只接受 move/click/scroll 固定行协议的 Windows 指针 helper
electron/windows-voice-control.cjs 语音 helper 生命周期、白名单二次验证、限流、10 秒启动超时与元数据审计
electron/windows-voice-control.ps1 用户明确开启后运行的 System.Speech 中英文固定语法 helper
public/models/           本地 MediaPipe 姿态、手势、BlazeFace 人脸检测、SelfieSegmenter 人物分割与 EfficientDet-Lite0 物体检测模型
public/wasm/             本地 MediaPipe WASM runtime
public/fonts/            可搜索 PDF 明确导出时按需载入的哈希固定 OFL 字体
tests/e2e/               Playwright Chromium 与 axe 测试
tests/fixtures/          不含真实个人信息的本机 OCR/视觉回归样本
scripts/                 构建、发布、签名、安装和审计脚本
docs/                    产品、架构、设计、测试和用户文档
PROJECT_DESCRIPTION.md  面向贡献者与产品评估的英文项目定位、能力、隐私边界与技术概览
docs/project-description-zh.md 中文项目定位、能力、隐私边界与技术概览
docs/development-log.md  版本之间的提交级实现里程碑、架构决策与验证证据
third_party_licenses/    生产依赖许可证归档
build/                   应用图标等打包输入
artifacts/               可清理、可重建的 Windows 打包输出
work/                    本地测试报告、截图和临时验证证据
.github/workflows/       CI、Security 与签名 Release 流水线
```

## 规则

- `package.json` 是版本权威；lockfile 根版本必须一致。
- `src/` 不得访问 Node API；所有桌面能力通过 `preload.cjs` 的固定接口。
- `electron/main.cjs` 在每个 IPC 信任边界验证 sender 与参数。
- 固定动作 PowerShell helper 只接受枚举参数；空中鼠标 helper 只接受 main 验证后的整数坐标、单击和 ±1 滚动固定行协议；语音 helper 只加载随包 19 条固定语法并返回已知动作。这些边界都不接收 renderer 提供的命令、路径、脚本、按键或任意文本。
- 内置 MediaPipe 模型和 WASM 必须随包分发，运行时不得从 CDN 下载。用户明确导入的自定义物体模型只保留在 renderer/WASM 内存，不复制到 `public/models/` 或应用数据目录。
- 非首屏工具面板通过 `React.lazy` 按模式加载；重型模型、worker 和图片运行时继续在功能内部按需加载。
- 持续媒体循环在页面隐藏时暂停；最小占屏时停止不可见的扫码、面具和音频电平采样，仅保留降频后的姿态/手势会话。
- `artifacts/` 与 `work/` 不是源码权威；每次打包前清理产物并验证版本边界。
- 密钥、PFX、token、用户视频、提示词和文件内容不得进入仓库或审计日志。
- 无关的并列项目不属于本应用范围，不得由本项目命令暂存、移动或删除。
