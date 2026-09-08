# Codex Gesture Dock 发布清单

## 候选源码

- [ ] 工作树仅包含本次发布文件且已提交。
- [x] 候选提交已严格快进推送到 `main`，本地提交不落后于远端。
- [ ] `main` 已受保护规则约束并要求候选 CI/Security 检查。
- [ ] `package.json`、lockfile、文件元数据和 tag 版本一致。
- [ ] 版本严格高于最新公开 Release，tag 和 Release 均不存在。

## 自动门禁

- [ ] `web-sop check --mode release` 通过。
- [x] 类型、lint、387 项应用/桌面测试和 10 项发布 helper 测试通过。
- [x] Chromium/Edge E2E 与 axe 无障碍检查通过。
- [x] 官方 npm audit 为 0 个 high/critical，许可证清单为最新。
- [x] CodeQL 与固定 SHA 的 Actions 通过；Dependency Review 在 push 事件按设计跳过，仍须在发布 PR 上通过。
- [x] Windows 打包目录已清理，不存在旧版本残留产物。
- [x] `release-assets.json` 是版本匹配的唯一发布白名单，五个主资产的大小/SHA-256 与 `SHA256SUMS.txt` 一致；`latest.yml` 的 setup 路径、大小和 SHA-512 已独立复核。

## Windows 签名与供应链

- [ ] `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD` 已配置为 Actions Secrets。
- [ ] `WIN_CSC_SUBJECT` 已配置为精确 Actions Variable。
- [ ] NSIS、portable、安装后主程序、卸载器和项目自带 executable 均为 `Status=Valid`。
- [ ] 签名主体与 `WIN_CSC_SUBJECT` 完全一致，且存在可信 RFC 3161 时间戳证书。
- [ ] `latest.yml` 的文件名、大小和 SHA-512 与签名后的 setup 完全一致。
- [ ] SHA256 清单、CycloneDX SBOM 和 provenance subjects 覆盖精确资产白名单。

## 安装、升级与自动更新

- [x] 在隔离 Windows runner 完成未签名候选的干净安装、v0.5.0→v0.6.0 覆盖升级、启动冒烟、静默卸载和注册表清理。
- [ ] 使用真实旧签名版本完成 N→N+1 升级。
- [ ] 从公开更新源完成一次真实签名自动更新，并保存结构化报告。
- [ ] 便携版明确显示不支持自动安装更新。

## 人工验证

- [ ] 摄像头实时画面、权限拒绝、设备占用和重试路径通过。
- [ ] 六个手势在常见光线/背景下逐个触发且没有连续误触。
- [ ] 主窗口、任务窗口、键盘、Escape、审批和紧急停止通过。
- [ ] 隐私、安全、签名和用户手册与候选版本一致。

## 发布与回滚

- [ ] 发布人确认 commits、版本、资产名单和 release notes。
- [ ] Release 资产设置为不可变，不允许覆盖同名 tag/资产。
- [ ] 发布后重新下载资产并执行校验和、签名、SBOM 和 provenance 验证。
- [ ] 若发现问题，停止推广并发布更高补丁版本；不得替换既有已发布资产。

本地证据生成失败时不得覆盖上一份 `release-assets.json` 或 `SHA256SUMS.txt`；先保留失败输入和日志用于诊断，再从干净 `artifacts/` 重建。此本地回滚证据只关闭资产清单生成器门禁。CI 34276985953 关闭未签名候选的隔离安装生命周期 smoke，但不关闭 Authenticode、真实旧签名版本 N→N+1、签名自动更新或生产 Release 门禁。

发布证据保存版本、候选 commit、CI/Security URL、签名主体、资产 digest、验证时间和回滚版本。
