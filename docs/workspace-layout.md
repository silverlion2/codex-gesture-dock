# Codex Gesture Dock 工作区结构

```text
src/                    React UI、MediaPipe hooks、状态机和组件测试
src/lib/piiSuggestions.ts 扫描页 OCR 坐标的本机敏感信息建议与遮盖框生成
src/lib/documentScanner.ts 照片/PDF 栅格导入、OpenCV 扫描、永久遮盖与 PNG/PDF 导出
src/lib/documentQuality.ts 扫描原图的有界亮度、对比度、清晰度、分辨率与局部高光启发式分析
src/lib/mrzExtraction.ts 文件/扫描页 OCR 的 TD1/TD2/TD3 候选提取、字段校验与复核 JSON
src/lib/codeImageScanner.ts 用户选择图片的一次性本机 QR/条码解码与资源释放
src/lib/imageMetadata.ts  用户选择照片的常见 EXIF/GPS 隐私字段检查与无元数据导出文件名
src/lib/imageComparison.ts 两张本机图片的有界归一化、Pixelmatch 差异指标、热图与安全导出文件名
electron/               Electron main/preload、Codex/Windows 控制和单元测试
public/models/           本地 MediaPipe 姿态、手势、BlazeFace 人脸检测、SelfieSegmenter 人物分割与 EfficientDet-Lite0 物体检测模型
public/wasm/             本地 MediaPipe WASM runtime
tests/e2e/               Playwright Chromium 与 axe 测试
tests/fixtures/          不含真实个人信息的本机 OCR/视觉回归样本
scripts/                 构建、发布、签名、安装和审计脚本
docs/                    产品、架构、设计、测试和用户文档
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
- PowerShell helper 只接受枚举参数，不接收 renderer 提供的命令、路径或任意文本。
- 内置 MediaPipe 模型和 WASM 必须随包分发，运行时不得从 CDN 下载。用户明确导入的自定义物体模型只保留在 renderer/WASM 内存，不复制到 `public/models/` 或应用数据目录。
- `artifacts/` 与 `work/` 不是源码权威；每次打包前清理产物并验证版本边界。
- 密钥、PFX、token、用户视频、提示词和文件内容不得进入仓库或审计日志。
- 无关的并列项目不属于本应用范围，不得由本项目命令暂存、移动或删除。
