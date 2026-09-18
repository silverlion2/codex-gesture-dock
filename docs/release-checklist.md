# Codex Gesture Dock 发布清单

## 用户授权的未签名预览发布

2026-09-19 最新授权：用户在要求默认 Windows 手势及加入语音后明确要求“更新后 push to main 并 publish 安装”。按此授权重新执行源码门禁、真实摄像头 Worker 探针及 CI 安装升级验证后发布和安装；保留真人准确率未验收、无可信签名的限制。下方此前“不推送/安装”的候选状态是历史记录，不代表新的发布结果。

后续验收修订：用户要求所有较新发布都更新，且完成实机验收后才推送、安装。新客户端允许 prerelease 但不降级；发布 bundle 升至七项（增加经验证的 `latest.yml`、setup blockmap），新 tag 为裸 semver，避免旧带斜杠 tag 不兼容更新器。以下五项、manual-only 是已发布 `preview/v0.6.0` 的历史策略，保留历史资产不覆盖。正式签名流程不变，未签名渠道不会绕过内置签名验证或冒充可信发布者。

2026-09-18 用户在获知无可信签名与未签名预览替代方案后要求直接发布。独立 `preview-release.yml` 仅允许从 main 手动运行；以 `preview/v<package version>` 命名且拒绝覆盖。它发布明确标注的 GitHub prerelease，`latest=false`，不上传 updater metadata 或 blockmap。签名正式发布门禁不变；预览不满足正式签名、保护规则或实机验收条件。

预览精确五项资产为 setup、portable、SBOM、`preview-release.json`、`SHA256SUMS.txt`，由 GitHub Windows runner 构建并验证安装/升级/卸载后发布。发布后复核目标 commit、prerelease 标志、五项资产及 GitHub SHA-256 digest，确认正式 Latest 未变化。失败不覆盖资产；发现问题停止使用预览并手动回到既有正式版。

## 2026-09-18 桌面手势候选状态

本节覆盖下方既有候选的历史勾选状态，不能把旧 CI/安装验证当作本次新增代码的证据。

- 本地 `web-sop check --mode release` 已通过：类型、lint、394 项应用/Electron 测试、10 项发布 helper 测试、构建、5 项 Chromium E2E/无障碍检查及 npm audit（0 漏洞）。版本、许可证和 Windows 版本比较检查通过。
- 最新源码 Electron smoke 通过：极简 78×78 且不可聚焦，恢复后可聚焦，急停阻断；本地报告 `work/electron-task-window-smoke.json`。这不是签名安装包或摄像头实机验收。
- 已修正 SendInput 的原生 INPUT 联合体布局，并增加 Windows DryRun ABI 回归；DryRun 不代表真实键盘输入或摄像头手势已验证。
- Windows 指令分类不再依赖六个手势绑定，保留音量和资源管理器语音命令；执行器拒绝把 DryRun 回执当作真实动作成功。
- 正式发布仍被签名配置阻断：GitHub 仓库 Secrets/Variables 查询均为空，缺少 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、`WIN_CSC_SUBJECT`。
- GitHub `main` 和 `v*` 尚无保护规则；实机摄像头、真实前台窗口动作和签名更新验证仍待完成。
- 不创建发布 tag，不覆盖既有 Release，不降级为未签名正式安装包。最近公开版本仍为 v0.5.0。
- 用户本地未跟踪的 `optimization_plan.md` 不属于本次提交，保留不动。

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
