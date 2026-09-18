## 未签名预览版 / Unsigned preview

这是供手动下载测试的 Windows 预览版，不是已签名的正式发布。Windows 可能显示“未知发布者”或 SmartScreen 提示；如果你的设备策略禁止运行未签名程序，请不要绕过该策略。

- 安装版：下载 `setup.exe`；无需安装的便携版：下载 `portable.exe`。
- 本次包含极简 Windows 手势入口、窗口切换/最小化/最大化、动作 callback 反馈、原生输入 ABI 修复和依赖安全补丁。
- GitHub Windows runner 执行测试、构建、资产摘要验证、打包启动、安装、从旧版升级及卸载验证。真实摄像头手势、前台窗口操作和所有权限场景仍需实机验收，自动测试不代替这些验证。
- 附带 SBOM、SHA-256 校验清单和构建来源记录；这些证明不等于可信 Authenticode 签名。
- 不设为 Latest，不发布 `latest.yml` 或 blockmap，不向正式自动更新渠道推送。原有正式版保持不变。
- 本版本资产不覆盖。遇到问题请卸载预览版，按需从既有正式 Release 手动安装；备份个人配置，并勿依赖自动降级。

This is an **unsigned, manual-download prerelease**, not a trusted Authenticode release. Windows may display an unknown-publisher or SmartScreen warning. Do not bypass organization/device security policy. CI smoke tests do not establish real-camera gesture accuracy or verify every foreground-window/permission scenario. Checksums and GitHub build provenance establish artifact integrity/origin, not Windows publisher trust. Stable auto-updates remain unchanged.
