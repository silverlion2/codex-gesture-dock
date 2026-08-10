# Codex Gesture Dock 测试矩阵

| 场景 | 预期结果 | 类型 | 自动化 |
|---|---|---|---|
| 姿态计算与阈值 | 特征、评分和状态转换稳定 | Unit | 是 |
| 姿态视频循环 | 暂时无可用帧后自动恢复，推理不超过 10 FPS | Hook unit | 是 |
| 媒体设备与偏好 | 精确摄像头约束、设备切换、镜像与填充偏好持久化且无效数据安全回退 | Unit + Hook + Component | 是 |
| 麦克风输入 | 默认关闭；明确开启后使用指定设备并显示本机电平；关闭/拒绝/断开会停止轨道并显示状态 | Hook + Component + Manual hardware QA | 是 / 实机复核 |
| 悬浮控制条 | 摄像头待命时可见；运行时在 hover/focus/menu-open 状态出现，键盘仍可到达 | Browser + axe | 是 |
| 视觉工具切换 | 姿态、扫码、文档、文字、名片、隐私、背景、物体、对比按钮具有可读名称与明确选中状态 | Component | 是 |
| 智能文档扫描 | 未就绪时拒绝摄像头捕获但允许照片/PDF 导入；角点排序、尺寸限制、35 MB 边界、处理状态和错误回退正确；原图质量分析区分清晰、暗、亮、低对比、模糊、局部反光和低分辨率，警告可见但不禁用 OCR/导出 | Unit + Component + Browser/manual | 是 / 发布前真实拍摄复核 |
| 扫描页方向 | 左右 90° 旋转交换宽高；遮盖框坐标正反变换可逆；旋转清除旧 OCR/PII/票据/MRZ；滤镜/角点重处理先恢复方向再重放遮盖；预览、PNG/PDF 和 OCR 使用相同方向 | Unit + Component + Browser/manual | 是 / 发布前带遮盖页复核 |
| 文档 PDF 栅格导入 | 最多 20 页、35 MB；PDF.js 顺序渲染并限制最长边 2200 像素；每页进入现有扫描工作台，显示栅格语义警告且原文本层/批注不被误称保留 | Unit + Component + Browser/manual | 是 / 发布前真实 PDF 复核 |
| 手动四角矫正 | 四个角点可拖动、可用键盘/Shift 微调；面积过小被 worker 拒绝，应用后显示“手动拉正”并保留后续滤镜重处理 | Component + Browser/manual | 是 |
| 永久隐私遮盖 | 越界框被限制、微小框被拒绝；鼠标/键盘可添加修改；应用后黑色像素写入栅格，PNG/PDF/OCR 使用遮盖页，滤镜重处理保留遮盖 | Unit + Component + Browser/manual | 是 / 发布前像素复核 |
| OCR 敏感信息建议 | 同行拆分邮箱/电话可合并定位；中国大陆身份证与 Luhn 有效卡号可识别；普通订单号不误报；建议框只能在人工编辑器明确确认后永久应用 | Unit + Component + Browser/manual | 是 / 发布前坐标与像素复核 |
| 票据/发票字段 | 中英文商户、日期、单据号、小计、税额、总额、币种可预填；字段可编辑，CSV 引号安全且只有明确操作才导出 | Unit + Component | 是 |
| 证件 MRZ | TD1/TD2/TD3 从混合 OCR 文本中提取；只允许姓名行补齐丢失的末尾填充符，校验数据行保持精确长度；空白和字段型 O/0 易混字符可修正；校验错误可见；普通文本不误报；字段可编辑且未确认原件复核时复制/JSON 导出禁用，输出固定声明非真实性验证 | Unit + Component + Browser/manual | 是 / 发布前合成证件样本复核 |
| 文档真实处理 | 本地 OpenCV worker 在严格 renderer CSP 下完成边缘检测、透视拉正、彩色/灰度/黑白重处理和 worker 复用 | Build + Browser/manual | 是 / 发布前真实票据复核 |
| 文档多页与导出 | 页面选择、添加、删除、PNG、不同方向页面的多页 PDF，以及当前页 OCR 交接正确 | Component + Browser/manual | 部分自动化 / 发布前导出复核 |
| 扫描页排序 | 首尾前移/后移禁用；移动完整页面对象并保持活动页、OCR、遮盖与旋转状态；缩略图重新编号，PDF 接收新顺序 | Component + Browser/manual | 是 / 发布前多页导出复核 |
| 扫描页多页 OCR | OCR 原文、人工复核文本与 PII 建议按页缓存；编辑/恢复、复制和结构化提取使用当前文本；切换/排序保留，像素变化只使目标页失效；未识别页在一个固定语言会话内严格串行复用 worker，取消/失败保留完成项且结束后释放；合并 TXT 遵循当前页序并区分未识别与人工留空 | Unit + Component + Browser/manual | 是 / 发布前混合质量页面复核 |
| 名片解析与 VCF | 中英文常见字段可提取、字段可编辑、vCard 转义和安全文件名正确 | Unit + Component | 是 |
| 文件 OCR | 本地 worker、三套语言数据和 PDF worker 随构建生成；图像与 PDF 可识别且不发起模型网络请求 | Build + Browser/manual | 是 / 发布前样本复核 |
| 批量文件 OCR | 最多 20 个文件在一个固定语言会话内严格串行并只加载一个健康 worker；无文字结果不触发重载，运行时失败/取消丢弃 worker，结束始终终止；单项失败继续；取消标记未完成项且保留完成结果；逐项查看与合并 TXT 顺序稳定 | Unit + Component + Browser/manual | 是 / 发布前混合样本复核 |
| 人脸与照片隐私 | 本地模型检测多个框；自动/手动框归一化与外扩有界；手动框可添加、拖动、键盘移动/缩放和删除；逐框启停、三种烧录效果和保护范围正确；合成 EXIF JPEG 可提取 GPS/设备/序列号/时间；无脸照片仍走空框 canvas 重编码并可导出无元数据 PNG；WebP/BMP 检查范围提示、安全文件名和敏感字段展示正确 | Unit + Component + Browser/manual | 是 / 发布前带 EXIF、漏检手动框与多人照片复核 |
| 人物背景 | 本地模型生成前景置信度蒙版；透明、模糊、纯色合成数据不同；阈值/柔化、原图对照、低覆盖率拒绝和安全文件名正确；保留/移除软边画笔有界插值，预览坐标与照片一致，画笔大小、撤销、清空、取消回滚和应用后重合成正确 | Unit + Component + Browser/manual | 是 / 发布前人像边缘与触控画笔复核 |
| 物体识别 | 本机模型返回有界框与标签；置信度筛选、逐框启停、无结果禁导出、JSON 选择、标注 PNG 和安全文件名正确；自定义 TFLite 的扩展名、100 MB、TFL3、MediaPipe 兼容性、UTF-8 标签索引、失败保留、内存释放和恢复内置模型受控 | Unit + Component + Browser/manual | 是 / 发布前内置与自定义模型多物体复核 |
| 图片对比 | 文件类型/35 MB 限制；共同缩放受 2400 边长与 400 万像素限制；尺寸不同左上角对齐并补白；相同/差异/容差、红蓝热图、包围框和安全文件名正确；滑动分界可键盘调整，重算与 PNG 导出受控 | Unit + Component + Browser/manual | 是 / 发布前真实截图与异尺寸照片复核 |
| OCR 限制与取消 | 35 MB、20 页限制可见；会话固定语言且禁止并发；取消后 worker 终止、会话可安全关闭并可重选 | Unit + Component | 是 |
| QR/条码实机 | 常见 QR、Data Matrix、EAN、UPC、Code 128 能从真实镜头识别 | Manual hardware QA | 发布前人工执行 |
| QR/条码图片 | 未启动摄像头仍可导入 PNG/JPEG/WebP/BMP；35 MB/类型限制、ZXing 格式和值、无代码错误、对象 URL 释放、复制与继续扫描正确；不自动打开 URL | Unit + Component + Browser/manual | 是 / 官方 ZXing 黑盒图复核 |
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
