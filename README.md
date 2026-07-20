# Codex Gesture Dock

一个隐私优先的 Windows Codex 控制系统。它通过本地摄像头手势、Codex App Server 和安全快捷键桥控制核心 Codex 工作流；“端正”坐姿监测是同一悬浮 Dock 中的辅助模块。平时只显示桌面角落的小按钮，点击后展开紧凑控制面板。MediaPipe 全程在本机分析画面，不录制或上传视频。

本工作区由 Codex 任务“探索摄像头开源方案”迁移而来。原对话中的需求、决策、版本演进和验证结论见 [迁移档案](docs/imported-chat-exploration.md)，最初调研的开源项目见 [电脑摄像头开源方案地图](docs/open-source-camera-landscape.md)。当前源码版本为 0.4.0，正式构建从 [GitHub Releases](https://github.com/silverlion2/codex-gesture-dock/releases) 下载。

这是一个非官方社区项目，与 OpenAI 没有隶属或背书关系。Codex 是其各自权利人的商标。

## Codex 控制系统

- 78 × 78 像素无边框置顶悬浮按钮，可拖动位置
- 点击展开 420 × 700 像素监测菜单，收起后继续保持会话
- 6 个 Codex 核心手势，控制快速对话、语音输入、任务选择、代码审查、终端和侧栏
- Codex 任务选择器，可列出最近、已完成和已归档任务
- 任务可打开、继续处理、只读总结、审查、测试修复或归档，执行前二次确认
- 活跃任务使用 `turn/steer` 安全追加指令，避免与正在运行的回合冲突
- Codex 请求执行命令或修改文件时，Dock 会自动展开并显示逐次审批；只提供“仅允许本次”和“拒绝”
- 快捷键发送前锁定并复核真实 Codex 桌面进程，避免误操作标题中包含 ChatGPT/Codex 的浏览器窗口
- 手势必须稳定保持 0.85 秒，松手后才能再次触发

## 摄像头与坐姿辅助

- 4 秒个人坐姿校准、实时评分与骨架叠加
- 本次时长、离席次数与最近坐姿趋势
- 可调灵敏度的坐姿提醒和 30–60 分钟休息提醒
- 统计仅保存在本机 `localStorage`

## Codex 手势

| 手势 | Codex 动作 | 官方快捷键 |
| --- | --- | --- |
| ✌ 胜利手势 | 打开快速对话 | `Ctrl + Alt + N` |
| ☝ 食指向上 | 开始语音输入 | `Ctrl + Shift + D` |
| ✋ 张开手掌 | 打开任务选择器 | 本机 App Server |
| 👍 竖起拇指 | 打开代码审查 | `Ctrl + Shift + G` |
| 🤟 I Love You | 切换集成终端 | `Ctrl + 反引号` |
| ✊ 握拳 | 切换任务侧栏 | `Ctrl + B` |

任务选择器打开后，手势会进入上下文模式：☝ 选择上一项、✊ 选择下一项、👍 确认、✌ 返回、✋ 切换任务分类、🤟 刷新列表。任务操作必须在确认页再次 👍 才会执行。

当 Codex 发出命令或文件修改审批时，控制面板会切换到审批模式：👍 仅允许本次操作，✌ 拒绝。系统不会通过手势授予整次会话的持续权限。

快捷键桥接只允许固定白名单，并会在发送快捷键前确认前台窗口确实属于 Codex。任务历史通过 Codex App Server 的 `thread/list` 与 `thread/turns/list` 读取；如果接口暂时不可用，可以回退到 Codex 自带的 `Ctrl + G` 历史搜索。

## 直接运行桌面版

```powershell
npm install
npm run desktop
```

开发时使用热更新：

```powershell
npm run dev:desktop
```

第一次点击“开始监测”时，Windows 会请求摄像头权限。应用只申请视频权限，不申请麦克风权限。

## 构建 Windows 便携版

```powershell
npm run dist:win
```

产物会生成在 `artifacts/`。当前构建没有代码签名，首次启动时 Windows SmartScreen 可能显示提示。

## 发布版本

每次推送 `v*` 标签时，GitHub Actions 会在干净的 Windows 环境中核对标签与包版本、运行测试和 lint、构建便携版，并发布可执行文件与 `SHA256SUMS.txt`。发布前可先做无副作用检查：

```powershell
npm run release -- patch --dry-run
```

确认后执行 `npm run release -- patch`（也可用 `minor`、`major` 或明确的 `x.y.z`）。脚本拒绝脏工作区、错误分支、落后远端、重复标签和版本降级，并在修改版本、提交、打标签或推送前要求输入精确确认文本。使用 `--no-push` 可只创建本地提交和标签。

便携版目前未做 Windows Authenticode 代码签名，也没有自动更新器；SHA-256 校验只能验证下载完整性，不能替代平台签名。

## 验证

```powershell
npm test
npm run lint
npm run build
npm run desktop:smoke
```

桌面冒烟测试会检查打包态页面加载、窗口置顶状态和折叠窗口尺寸，并把结果写入 `work/electron-smoke.json`。App Server 客户端测试覆盖任务分页、活跃回合控制和审批响应。

## 隐私与限制

- 姿态、手势模型和 WebAssembly 文件都在 `public/`，推理不依赖云端服务。
- 不保存图像、视频或人体关键点，只保存按天累计的良好坐姿秒数和有效检测秒数。
- 任务标题、路径和状态只在悬浮面板中临时显示，不写入应用存储。
- 普通二维摄像头对遮挡、光线和前后位移较敏感，评分是相对于个人校准姿势的启发式结果。
- 这是健康习惯提醒工具，不提供医疗建议。

## 设计与实现预览

- `docs/design-floating-concept.png`：悬浮形态概念稿
- `docs/implementation-floating-expanded.png`：展开菜单实装
- `docs/implementation-floating-collapsed.png`：折叠按钮实装
- `docs/implementation-codex-gesture-expanded.png`：Codex 手势开关实装
- `docs/implementation-codex-gesture-guide.png`：手势表实装
- `docs/implementation-task-picker-list.png`：任务列表实装
- `docs/implementation-task-picker-actions.png`：任务操作菜单实装
- `docs/implementation-task-picker-confirm.png`：二次确认页实装

## 第三方组件

项目自身使用 [MIT 许可证](LICENSE)。MediaPipe Tasks 使用 Apache-2.0 许可，Lucide 使用 ISC 许可；完整清单和随发行包附带的许可文本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `third_party_licenses/`。
