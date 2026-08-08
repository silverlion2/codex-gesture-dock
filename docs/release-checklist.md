# Codex Gesture Dock 发布清单

## 候选源码

- [ ] 工作树仅包含本次发布文件且已提交。
- [ ] 候选提交已推送到受保护的 `main`，本地不落后于远端。
- [ ] `package.json`、lockfile、文件元数据和 tag 版本一致。
- [ ] 版本严格高于最新公开 Release，tag 和 Release 均不存在。

## 自动门禁

- [ ] `web-sop check --mode release` 通过。
- [ ] 类型、lint、53+ 应用测试和发布 helper 测试通过。
- [ ] Chromium E2E 与 axe 无障碍检查通过。
- [ ] 官方 npm audit 为 0 个 high/critical，许可证清单为最新。
- [ ] CodeQL、Dependency Review 和固定 SHA 的 Actions 通过。
- [ ] Windows 打包目录已清理，不存在旧版本残留产物。

## Windows 签名与供应链

- [ ] `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD` 已配置为 Actions Secrets。
- [ ] `WIN_CSC_SUBJECT` 已配置为精确 Actions Variable。
- [ ] NSIS、portable、安装后主程序、卸载器和项目自带 executable 均为 `Status=Valid`。
- [ ] 签名主体与 `WIN_CSC_SUBJECT` 完全一致，且存在可信 RFC 3161 时间戳证书。
- [ ] `latest.yml` 的文件名、大小和 SHA-512 与签名后的 setup 完全一致。
- [ ] SHA256 清单、CycloneDX SBOM 和 provenance subjects 覆盖精确资产白名单。

## 安装、升级与自动更新

- [ ] 在隔离 Windows runner 完成干净安装、启动冒烟和静默卸载。
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

发布证据保存版本、候选 commit、CI/Security URL、签名主体、资产 digest、验证时间和回滚版本。
