# Codex Gesture Dock

一个隐私优先的 Windows Codex 控制系统。它通过本地摄像头手势、Codex App Server 和安全快捷键桥控制核心 Codex 工作流；“端正”坐姿监测是同一悬浮 Dock 中的辅助模块。平时只显示桌面角落的小按钮，点击后展开紧凑控制面板。MediaPipe 全程在本机分析画面，不录制或上传视频。

本工作区由 Codex 任务“探索摄像头开源方案”迁移而来。原对话中的需求、决策、版本演进和验证结论见 [迁移档案](docs/imported-chat-exploration.md)，最初调研的开源项目见 [电脑摄像头开源方案地图](docs/open-source-camera-landscape.md)。当前源码版本为 0.5.0，正式构建从 [GitHub Releases](https://github.com/silverlion2/codex-gesture-dock/releases) 下载。

这是一个非官方社区项目，与 OpenAI 没有隶属或背书关系。Codex 是其各自权利人的商标。

## Codex 控制系统

- 78 × 78 像素无边框置顶悬浮按钮，可拖动位置
- 点击展开 700 × 680 像素双栏监测台，首次展开会启动摄像头，收起后继续保持会话
- 可在 Codex / Windows 两套独立手势模式间切换；Windows 模式提供显示桌面、任务视图、资源管理器和音量控制
- 摄像头、实时识别状态和完整 6 项手势手册在主面板中始终可见
- 文件与任务操作使用更宽的独立窗口；优先列出刚完成但尚未查看的文件，也可切换最近、已完成和已归档任务，不遮挡实时画面
- 任务可打开、继续处理、只读总结、审查、测试修复或归档，执行前二次确认
- 活跃任务使用 `turn/steer` 安全追加指令，避免与正在运行的回合冲突
- 自动连接 Codex Desktop 最新版本化 App Server 运行时，绑定当前工作区任务并同步线程、回合和文件事件
- 主面板分别显示 Codex Adapter、Windows Control Core、只读 UI Automation、实时窗口事件和当前绑定任务的状态
- Codex 请求执行命令或修改文件时，Dock 会自动展开并显示逐次审批；只提供“仅允许本次”和“拒绝”
- 快捷键发送前验证 `OpenAI.Codex` MSIX 包名、Publisher、安装目录、进程与前台窗口，避免把动作发送给伪装窗口
- `SetWinEventHook` 实时监听已验证 Codex 进程的前台、显示、隐藏、焦点、位置和名称事件，进程变化后自动重新绑定
- 主面板可一键暂停或恢复全部 Windows 动作；暂停状态会持久化，动作结果写入不含正文的本机按日审计日志
- Windows 安装版启动后自动检查 GitHub Releases、后台下载更新，并在用户确认后重启安装；portable 版保留为手动更新备用
- 手势必须稳定保持 0.85 秒，松手后才能再次触发

## 摄像头与坐姿辅助

- 4 秒个人坐姿校准、实时评分与骨架叠加
- 本次时长、离席次数与最近坐姿趋势
- 可调灵敏度的坐姿提醒和 30–60 分钟休息提醒
- 统计仅保存在本机 `localStorage`

## Codex 手势

在提醒设置的“手势控制模式”中选择 `Codex` 或 `Windows`；选择会保存在本机。两种模式共用 0.85 秒保持与松手复位机制，但动作映射完全独立。

| 手势 | Codex 动作 | 官方快捷键 |
| --- | --- | --- |
| ✌ 胜利手势 | 打开快速对话 | `Ctrl + Alt + N` |
| ☝ 食指向上 | 激活 Codex 话筒 | `Ctrl + Shift + D` |
| ✋ 张开手掌 | 打开任务选择器 | 本机 App Server |
| 👍 竖起拇指 | 打开代码审查 | `Ctrl + Shift + G` |
| 🤟 I Love You | 切换集成终端 | `Ctrl + 反引号` |
| ✊ 握拳 | 切换任务侧栏 | `Ctrl + B` |

## Windows 手势

| 手势 | Windows 动作 | 固定系统组合键 |
| --- | --- | --- |
| ✌ 胜利手势 | 打开任务视图 | `Win + Tab` |
| ☝ 食指向上 | 提高系统音量 | 音量增大键 |
| ✋ 张开手掌 | 显示桌面 | `Win + D` |
| 👍 竖起拇指 | 打开文件资源管理器 | `Win + E` |
| 🤟 I Love You | 降低系统音量 | 音量减小键 |
| ✊ 握拳 | 静音 / 恢复声音 | 静音键 |

Windows 模式只执行上述固定动作，不接收任意组合键、文字、坐标、命令或脚本。打开文件与任务窗口后，上下文手势仍优先控制该窗口；审批出现时，👍 / ✌ 仍优先用于本次允许 / 拒绝。

文件与任务窗口打开后，手势会进入上下文模式：☝ 选择上一项、✊ 选择下一项、👍 打开或确认、✌ 返回、✋ 从文件进入任务或切换任务分类、🤟 刷新列表。任务操作必须在确认页再次 👍 才会执行；文件打开后会在本机标记为已查看。

当 Codex 发出命令或文件修改审批时，控制面板会切换到审批模式：👍 仅允许本次操作，✌ 拒绝。系统不会通过手势授予整次会话的持续权限。

快捷键桥接只允许固定白名单，并会在发送快捷键前确认前台窗口确实属于 Codex。任务历史通过 Codex App Server 的 `thread/list` 与 `thread/turns/list` 读取；如果接口暂时不可用，可以回退到 Codex 自带的 `Ctrl + G` 历史搜索。

系统明确分为两个完成的 v1 层级：Codex Adapter 自主管理 App Server 生命周期以及任务、事件、审批和程序能力；Windows Control Core 负责 Codex 可信应用身份、实时窗口事件、两套语义动作白名单、急停和审计。Codex 动作要求身份与前台复核；通用 Windows 动作只允许 6 个固定系统组合键。Windows UI Automation 只执行有上限、脱敏的只读结构检查，不点击控件、不读取编辑框或对话正文。完整边界见 [Windows 桌面控制设计](docs/windows-desktop-control.md)。

## 直接运行桌面版

第一次使用请先阅读 [中文使用说明书](docs/user-guide-zh.md)。

```powershell
npm install
npm run desktop
```

开发时使用热更新：

```powershell
npm run dev:desktop
```

第一次展开主面板或点击“开始监测”时，Windows 会请求摄像头权限。应用只申请视频权限，不申请麦克风权限。

## 构建 Windows 安装版与便携版

```powershell
npm run dist:win
```

产物会生成在 `artifacts/`，包括可自动更新的 NSIS `setup.exe`、portable 版、`latest.yml` 和差分更新 blockmap。自动更新只适用于安装版；旧 portable 用户需要先手动下载安装版。当前构建没有代码签名，首次安装及更新时 Windows SmartScreen 可能显示提示。

## 发布版本

每次推送 `v*` 标签时，GitHub Actions 会在干净的 Windows 环境中核对标签与包版本、运行测试和 lint，同时构建 NSIS 安装版与 portable 版，并发布 `latest.yml`、blockmap 和 `SHA256SUMS.txt`。安装版据此自动发现与下载新版本。发布前可先做无副作用检查：

```powershell
npm run release -- patch --dry-run
```

确认后执行 `npm run release -- patch`（也可用 `minor`、`major` 或明确的 `x.y.z`）。脚本拒绝脏工作区、错误分支、落后远端、重复标签和版本降级，并在修改版本、提交、打标签或推送前要求输入精确确认文本。使用 `--no-push` 可只创建本地提交和标签。

当前发行包尚未配置 Windows Authenticode 证书。更新器会核对 electron-builder 元数据中的 SHA-512，但它不能替代可信发布者签名；生产级可信更新仍需在 GitHub Actions 配置 `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD`。portable 版不会自动更新。

### Code signing policy

项目正在申请 SignPath Foundation 的开源项目 HSM 托管 Authenticode 签名。批准前发行包仍明确标记为未签名；批准后只有 GitHub 托管 Release Workflow 产生并经人工批准的项目二进制可以签名。角色、隐私、签名范围和失败关闭规则见 [Code signing policy](docs/code-signing-policy.md)。

## 验证

```powershell
npm test
npm run lint
npm run build
npm run desktop:smoke
npm run desktop:smoke:tasks
```

桌面冒烟测试会检查打包态页面加载、窗口置顶状态和折叠窗口尺寸；多窗口测试还会确认摄像头区域、6 项手势手册和独立任务选择器同时存在，并验证 Windows 控制暂停后动作被拒绝、恢复后状态正常。结果写入 `work/electron-smoke.json` 与 `work/electron-task-window-smoke.json`。自动测试还覆盖 App Server 运行时发现、任务分页、实时事件、当前任务绑定、活跃回合控制、审批响应、两层状态隔离、桌面动作白名单、实时窗口事件和 UI Automation 内容脱敏。

## 隐私与限制

- 姿态、手势模型和 WebAssembly 文件都在 `public/`，推理不依赖云端服务。
- 不保存图像、视频或人体关键点，只保存按天累计的良好坐姿秒数和有效检测秒数。
- 任务标题、路径和状态只在悬浮面板中临时显示，不写入应用存储。
- Windows 控制审计只记录时间、动作名、目标进程、结果和身份验证状态，不记录任务正文、按键内容、窗口文本或摄像头数据。
- 安装版只向本项目公开的 GitHub Releases 检查更新，不允许界面传入自定义更新地址。
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
- `docs/windows-desktop-control.md`：Windows 桌面控制边界与演进路线
- `docs/user-guide-zh.md`：安装、手势、任务、审批、急停与故障排查说明

## 第三方组件

项目自身使用 [MIT 许可证](LICENSE)。MediaPipe Tasks 使用 Apache-2.0 许可，Lucide 使用 ISC 许可；完整清单和随发行包附带的许可文本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `third_party_licenses/`。
