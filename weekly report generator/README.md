# 汇报流

一个本地优先的日报、周报、月报与项目报告生成器和追踪器。你可以直接填写项目进度和报告内容；GitHub 活动与其他工作记录只是可选补充。应用会在浏览器中保存项目更新、工作轨迹与报告历史。

## 已实现

- 日报、周报、月报、项目报告四种生成模式
- 自主填写项目完成事项、下一步、风险、状态、进度和里程碑
- 报告以自主填写内容为准，项目更新自动补全，活动记录仅作可选素材
- 从 GitHub 公共仓库导入最近提交
- 手工补充会议、评审、沟通等其他工作记录
- 项目进度、负责人、里程碑与风险追踪
- 报告完整度、14 天活动趋势和待跟进事项
- Markdown 实时预览、复制、下载与本地归档
- 报告中心、活动记录、项目和模板工作区
- 桌面与移动端响应式布局

当前版本不需要后端，数据保存在浏览器 `localStorage` 中。生产化时可继续接入私有 GitHub OAuth、数据库、定时任务、PDF 导出及企业消息渠道。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 参考方案

产品结构综合了这些外部方案中的成熟做法：

- [OpenAURA](https://openaura.org/)：从提交、PR、Issue、CI 等信号生成有证据支持的 Markdown 周报。
- [Dayflow](https://github.com/JerryZLiu/Dayflow)：用本地优先的时间线还原工作过程，并生成日报和周度回顾。
- [GitHub Projects 状态更新](https://github.blog/changelog/2024-01-18-github-issues-projects-project-status-updates-issues-side-panel/)：在项目上下文中记录状态、时间、风险及变更历史。
- [GitHub Weekly Reporter](https://blog.deariary.com/news/2026-04-05-github-weekly-reporter)：用 GitHub Actions 定时收集活动并发布周报。

这里没有直接复制任何项目代码，只借鉴了数据证据、时间线、风险追踪、定时节奏和版本化报告等产品模式。

## 关键文件

- `src/App.jsx`：应用状态、页面导航与本地持久化
- `src/components/Modals.jsx`：项目更新、活动导入、手工记录、报告生成与设置
- `src/report.js`：报告组装和 Markdown 导出
- `src/data.js`：示例活动、项目与模板数据
- `src/styles.css`：完整设计系统和响应式布局
- `design/dashboard-concept.png`：视觉概念稿
- `design/dashboard-render.png`：最终桌面验收图
