export const reportTypes = [
  { id: 'daily', label: '日报', hint: '今日待生成' },
  { id: 'weekly', label: '周报', hint: '本周待生成' },
  { id: 'monthly', label: '月报', hint: '本月待生成' },
  { id: 'project', label: '项目报告', hint: '按项目生成' },
]

export const seedActivities = [
  {
    id: 1,
    time: '10:24',
    title: '提交了 3 次代码到 feature/export-report 分支',
    detail: 'a1b2c3d · 更新报告导出接口与字段映射',
    project: '汇报流后端',
    source: 'github',
    status: '已完成',
    tone: 'green',
    date: '2026-07-22',
  },
  {
    id: 2,
    time: '11:15',
    title: '创建了 Pull Request #128',
    detail: 'feat: 支持日报导出为 PDF 和 Markdown',
    project: '汇报流后端',
    source: 'github',
    status: '进行中',
    tone: 'orange',
    date: '2026-07-22',
  },
  {
    id: 3,
    time: '14:02',
    title: '关联 Issue #256 并添加评论',
    detail: '补充接口错误码说明与示例',
    project: '汇报流后端',
    source: 'issue',
    status: '已评论',
    tone: 'blue',
    date: '2026-07-22',
  },
  {
    id: 4,
    time: '15:30',
    title: '添加了手动记录',
    detail: '与设计评审日报模块的交互细节，确定字段与状态',
    project: '产品设计',
    source: 'manual',
    status: '已记录',
    tone: 'green',
    date: '2026-07-22',
  },
]

export const seedProjects = [
  { id: 1, name: '汇报流后端', detail: '后端服务与 API', progress: 68, status: '进行中', tone: 'green', owner: '林默', initials: '林', milestone: '2026-08-05', milestoneName: '报表导出优化' },
  { id: 2, name: '汇报流前端', detail: 'Web 应用与页面', progress: 54, status: '进行中', tone: 'green', owner: '苏晴', initials: '苏', milestone: '2026-07-31', milestoneName: '日报模块完整交付' },
  { id: 3, name: '数据分析服务', detail: '数据处理与分析', progress: 35, status: '有风险', tone: 'orange', owner: '陈宇', initials: '陈', milestone: '2026-08-10', milestoneName: '性能优化上线' },
]

export const seedProjectUpdates = [
  {
    id: 201,
    projectId: 1,
    projectName: '汇报流后端',
    progress: 68,
    status: '进行中',
    completed: '完成报告导出接口和字段映射，联调结果符合预期。',
    next: '完成导出性能优化并推进接口验收。',
    blockers: '',
    milestoneName: '报表导出优化',
    milestone: '2026-08-05',
    time: '16:20',
    date: '2026-07-22',
    updatedAt: '7月22日 16:20',
  },
]

export const activityBars = [58, 36, 49, 25, 27, 46, 52, 38, 57, 53, 31, 44, 42, 70]

export const templates = [
  { id: 'daily', name: '敏捷站会日报', cadence: '日报', description: '昨日成果、今日计划、阻塞事项，适合研发站会。', sections: ['成果', '计划', '阻塞'] },
  { id: 'weekly', name: '研发团队周报', cadence: '周报', description: '交付成果、关键数据、风险与下周重点。', sections: ['本周成果', '数据', '风险', '下周重点'] },
  { id: 'monthly', name: '管理层月度简报', cadence: '月报', description: '跨项目进展、资源投入、趋势与决策事项。', sections: ['摘要', '项目组合', '趋势', '决策'] },
  { id: 'project', name: '项目状态报告', cadence: '项目', description: '围绕单一项目的进度、里程碑、风险和依赖。', sections: ['状态', '里程碑', '风险', '下一步'] },
]
