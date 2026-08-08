# Codex Gesture Dock 测试矩阵

| 场景 | 预期结果 | 类型 | 自动化 |
|---|---|---|---|
| 姿态计算与阈值 | 特征、评分和状态转换稳定 | Unit | 是 |
| 姿态视频循环 | 暂时无可用帧后自动恢复，推理不超过 10 FPS | Hook unit | 是 |
| 摄像头工具切换 | 姿态、扫码、文档按钮具有可读名称与明确选中状态 | Component | 是 |
| 文档快照 | 未就绪时拒绝捕获，镜像选择与输出文件名正确 | Unit | 是 |
| QR/条码实机 | 常见 QR、Data Matrix、EAN、UPC、Code 128 能从真实镜头识别 | Manual hardware QA | 发布前人工执行 |
| 手势保持/释放 | 0.85 秒后触发，回中前不重复 | Unit | 是 |
| Codex/Windows 动作白名单 | 任意未知输入在启动 helper 前被拒绝 | Unit | 是 |
| 紧急停止 | 两层桌面动作都失败关闭 | Unit + packaged smoke | 是 |
| Codex App Server 生命周期 | 连接、通知、审批、关闭竞态正确 | Unit | 是 |
| 活跃 Codex turn | steer 当前 turn，不创建冲突 turn | Unit | 是 |
| 最近文件 | 去重、按完成时间排序、不向 renderer 暴露绝对路径 | Unit + smoke | 是 |
| 任务筛选竞态 | 旧请求晚返回时不能覆盖新筛选结果 | Component | 是 |
| 自动更新状态 | 仅安装版启用、进度有界、下载后才能安装 | Unit | 是 |
| Renderer 恢复限流 | 一分钟最多自动恢复两次 | Unit | 是 |
| 主面板无障碍 | 展开布局 0 axe violation | Chromium E2E | 是 |
| 文件/任务/动作/确认 | 每一层 0 axe violation，Escape 正确返回 | Chromium E2E | 是 |
| 打包主窗口 | app 协议加载、置顶、`348 × 360` 迷你摄像头尺寸及 `700 × 680` 展开尺寸正确 | Packaged smoke | 是 |
| 打包任务窗口 | 摄像头区域可见、六手势可见、独立窗口、安全开关有效 | Packaged smoke | 是 |
| 安装与卸载 | 版本、注册表、主程序、卸载器与清理正确 | Windows CI | 是 |
| N→N+1 升级 | 旧签名安装版可升级到新签名安装版 | Release verification | 需要真实发布 |
| 签名自动更新 | `latest.yml` 与签名安装器大小/SHA-512 一致 | Release verification | 需要真实发布 |
| 摄像头实机 | 权限、真实画面、断开重连、设备占用错误 | Manual hardware QA | 发布前人工执行 |

## 固定命令

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:a11y`
- `npm run build`
- `npm audit --audit-level=high --registry=https://registry.npmjs.org`
- `npm run desktop:smoke:packaged`
- `npm run codex:smoke`
- `npm run verify:win-artifacts`
- `npm run readiness:audit`
- `web-sop check --mode release`

每个缺陷修复必须增加能复现原问题的自动测试；硬件、证书或真实发布链路无法本地模拟时，必须留下结构化验证报告。
