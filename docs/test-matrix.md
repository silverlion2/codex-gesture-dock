# Codex Gesture Dock 测试矩阵

| 场景 | 预期结果 | 类型 | 自动化 |
|---|---|---|---|
| 姿态计算与阈值 | 特征、评分和状态转换稳定 | Unit | 是 |
| 姿态视频循环 | 暂时无可用帧后自动恢复，推理不超过 10 FPS | Hook unit | 是 |
| 媒体设备与偏好 | 精确摄像头约束、设备切换、镜像与填充偏好持久化且无效数据安全回退 | Unit + Hook + Component | 是 |
| 麦克风输入 | 默认关闭；明确开启后使用指定设备并显示本机电平；关闭/拒绝/断开会停止轨道并显示状态 | Hook + Component + Manual hardware QA | 是 / 实机复核 |
| 悬浮控制条 | 摄像头待命时可见；运行时在 hover/focus/menu-open 状态出现，键盘仍可到达 | Browser + axe | 是 |
| 视觉工具切换 | 姿态、扫码、文档、文字、名片按钮具有可读名称与明确选中状态 | Component | 是 |
| 文档快照 | 未就绪时拒绝捕获，镜像选择与输出文件名正确 | Unit | 是 |
| 名片解析与 VCF | 中英文常见字段可提取、字段可编辑、vCard 转义和安全文件名正确 | Unit + Component | 是 |
| 文件 OCR | 本地 worker、三套语言数据和 PDF worker 随构建生成；图像与 PDF 可识别且不发起模型网络请求 | Build + Browser/manual | 是 / 发布前样本复核 |
| OCR 限制与取消 | 35 MB、20 页限制可见；取消后 worker 终止并可重选 | Unit + Component | 部分自动化 |
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
| 打包主窗口 | app 协议加载、置顶、`348 × 360` 迷你摄像头尺寸及 `1120 × 760` 展开尺寸正确 | Packaged smoke | 是 |
| 窗口边界恢复 | 迷你与展开边界分别保存，展开不小于 `980 × 760`，断开显示器后回到可见工作区 | Unit + Packaged manual | 是 / 实机复核 |
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
