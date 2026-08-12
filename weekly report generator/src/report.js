const typeLabels = { daily: '日报', weekly: '周报', monthly: '月报', project: '项目报告' }

function formatManualList(value) {
  const lines = value?.split('\n').map((line) => line.trim()).filter(Boolean) || []
  return lines.map((line) => line.startsWith('- ') ? line : `- ${line}`).join('\n')
}

export function buildReport({ type, activities = [], projects = [], projectUpdates = [], notes = {}, dateLabel }) {
  const completed = activities.filter((item) => item.status === '已完成' || item.status === '已记录')
  const ongoing = activities.filter((item) => !completed.includes(item))
  const riskProjects = projects.filter((project) => project.status.includes('风险'))
  const relevantUpdates = type === 'project' && notes.project
    ? projectUpdates.filter((update) => update.projectName === notes.project)
    : projectUpdates
  const title = notes.title?.trim() || `${dateLabel}工作${typeLabels[type]}`
  const projectScope = type === 'project' && notes.project ? `\n> 项目：${notes.project}` : ''
  const manualAchievements = formatManualList(notes.achievements)
  const manualOngoing = formatManualList(notes.ongoing)
  const manualBlockers = formatManualList(notes.blockers)
  const manualNext = formatManualList(notes.next)

  const updateAchievements = relevantUpdates
    .filter((update) => update.completed?.trim())
    .map((update) => `- ${update.projectName}：${update.completed.trim()}`)
    .join('\n')
  const activityAchievements = completed.map((item) => `- ${item.title}（${item.project}）`).join('\n')
  const updateOngoing = relevantUpdates
    .filter((update) => update.next?.trim())
    .map((update) => `- ${update.projectName}：${update.next.trim()}`)
    .join('\n')
  const activityOngoing = ongoing.map((item) => `- ${item.title}｜${item.status}`).join('\n')
  const updateBlockers = relevantUpdates
    .filter((update) => update.blockers?.trim())
    .map((update) => `- ${update.projectName}：${update.blockers.trim()}`)
    .join('\n')

  return `# ${title}

> 报告周期：${typeLabels[type]} · ${dateLabel}${projectScope}
> 内容来源：自主填写、项目进度${activities.length ? '；活动记录为可选补充' : ''}

## 摘要

${notes.summary?.trim() || `本周期已更新 ${relevantUpdates.length} 次项目进度，当前跟踪 ${projects.length} 个项目。报告内容可由你直接填写，不依赖活动记录。`}

## 主要成果

${manualAchievements || updateAchievements || activityAchievements || '- 请填写本期完成事项'}

## 正在推进

${manualOngoing || updateOngoing || activityOngoing || '- 请填写正在推进的事项'}

## 项目进度

${projects.map((project) => `- **${project.name}**：${project.progress}% · ${project.status} · 下一里程碑 ${project.milestoneName}（${project.milestone}）`).join('\n')}

## 风险与阻塞

${manualBlockers || updateBlockers || (riskProjects.length ? riskProjects.map((project) => `- ${project.name}：${project.milestoneName} 存在延期风险，需跟进资源与依赖。`).join('\n') : '- 当前无明确阻塞')}

## 下一步计划

${manualNext || updateOngoing || '- 请填写下一步计划'}

---
由汇报流生成 · 以自主填写和项目进度为主，活动记录仅作补充
`
}

export function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
