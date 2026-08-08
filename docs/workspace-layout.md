# Codex Gesture Dock 工作区结构

```text
src/                    React UI、MediaPipe hooks、状态机和组件测试
electron/               Electron main/preload、Codex/Windows 控制和单元测试
public/models/           本地 MediaPipe 模型
public/wasm/             本地 MediaPipe WASM runtime
tests/e2e/               Playwright Chromium 与 axe 测试
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
- MediaPipe 模型和 WASM 必须随包分发，运行时不得从 CDN 下载。
- `artifacts/` 与 `work/` 不是源码权威；每次打包前清理产物并验证版本边界。
- 密钥、PFX、token、用户视频、提示词和文件内容不得进入仓库或审计日志。
- 无关的并列项目不属于本应用范围，不得由本项目命令暂存、移动或删除。
