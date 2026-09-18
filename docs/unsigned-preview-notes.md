## 未签名预览版 / Unsigned preview

这是未签名的 Windows 发布，不是已获得可信 Authenticode 签名的正式发布。Windows 可能显示“未知发布者”或 SmartScreen 提示；如果你的设备策略禁止运行未签名程序，请不要绕过该策略。

- 安装版：下载 `setup.exe`；无需安装的便携版：下载 `portable.exe`。
- 本次默认选择 Windows 手势，提供一键极简入口、窗口切换/最小化/最大化、动作 callback 反馈、原生输入 ABI 修复和依赖安全补丁。保留之后明确选择的其他模式；不会启动时自动打开摄像头。
- MediaPipe 手势识别在独立 Worker 中推理（不包含姿态等其他工具），连续帧确认减少间断采样误触，空中鼠标使用 One Euro 自适应滤波；这些改进不等于已完成真人准确率标定。
- 增加中英文各 25 条本机语音命令。点击顶部麦克风后可说“助手 切换窗口”“助手 最小化窗口”“助手 最大化窗口”“助手 暂停控制”；“助手 缩小悬浮窗”只缩小 Dock。语音每次启动默认关闭，不上传录音，极简浮钮显示监听标记。
- GitHub Windows runner 执行测试、构建、资产摘要验证、打包启动、安装、从旧版升级及卸载验证。真人摄像头手势准确率、真实麦克风口音/噪声效果和所有权限场景仍需实机验收，自动测试不代替这些验证。
- 附带 SBOM、SHA-256 校验清单和构建来源记录；这些证明不等于可信 Authenticode 签名。
- 按用户要求，新安装版接收本仓库全部较新发布（包括预览标记），自动下载并在退出时安装；不自动降级。发布包含已验证的 `latest.yml` 和 blockmap，不禁用内置文件校验或签名验证。旧 v0.5.0/v0.6.0 客户端仍只接收正式版，需要先手动安装修复版一次。便携版仍需手动更新。
- GitHub 的 prerelease 标记仅区分尚未获得可信签名，不阻止新安装版接收更新；GitHub 稳定 Latest 保持不变。
- 本版本资产不覆盖。遇到问题请卸载预览版，按需从既有正式 Release 手动安装；备份个人配置，并勿依赖自动降级。

This is an **unsigned release**, not a trusted Authenticode release. Windows may display an unknown-publisher or SmartScreen warning. Do not bypass organization/device security policy. New installed builds accept newer releases including prereleases; legacy stable-only clients need one manual upgrade. Portable builds remain manual-update only. CI smoke tests do not establish real-camera gesture accuracy or verify every permission scenario. Checksums and GitHub build provenance establish integrity/origin, not Windows publisher trust. Built-in checksum and signature verification are not disabled.
