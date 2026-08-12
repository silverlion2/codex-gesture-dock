import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Github,
  GitPullRequest,
  MessageSquareText,
  PencilLine,
  Plus,
} from 'lucide-react'
import { activityBars, reportTypes } from '../data'

const sourceIcons = {
  github: Github,
  issue: MessageSquareText,
  manual: FileText,
  project: PencilLine,
}

export function ReportSwitcher({ selected, onChange }) {
  return (
    <div className="report-switcher" aria-label="报告类型">
      {reportTypes.map((item) => {
        const Icon = item.id === 'project' ? FileText : CalendarDays
        return (
          <button
            key={item.id}
            className={`report-choice ${selected === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <Icon size={21} strokeWidth={1.7} />
            <span><strong>{item.label}</strong><small>{item.hint}</small></span>
          </button>
        )
      })}
    </div>
  )
}

export function ActivityTimeline({ activities, onAdd, onShowAll }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-heading">
        <h2>今日进展</h2>
        <button className="text-button" onClick={onShowAll}>查看全部 <ChevronRight size={15} /></button>
      </div>
      <div className="timeline-list">
        {activities.slice(0, 4).map((item) => {
          const Icon = sourceIcons[item.source] || FileText
          return (
            <article className="timeline-row" key={item.id}>
              <time>{item.time}</time>
              <span className={`source-icon source-${item.source}`}><Icon size={17} /></span>
              <span className="activity-copy">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <span className="project-tag">{item.project}</span>
              <span className={`status-text ${item.tone}`}>{item.status}</span>
            </article>
          )
        })}
      </div>
      <button className="add-row-button" onClick={onAdd}><Plus size={16} /> 记录进展</button>
    </section>
  )
}

export function CompletionPanel({ activities, projectUpdates }) {
  const hasUpdates = projectUpdates.length > 0
  const hasCompleted = projectUpdates.some((item) => item.completed?.trim())
  const hasNext = projectUpdates.some((item) => item.next?.trim())
  const hasBlockers = projectUpdates.some((item) => item.blockers?.trim())
  const score = hasUpdates ? 82 : 58
  const items = [
    { label: '成果', value: hasCompleted ? '已填写' : '待填写', done: hasCompleted },
    { label: '计划', value: hasNext ? '已填写' : '待填写', done: hasNext },
    { label: '阻塞', value: hasBlockers ? '已说明' : '待确认', done: hasBlockers },
    { label: '活动', value: `${activities.length} 条可选`, done: true },
  ]
  return (
    <section className="panel completion-panel">
      <div className="panel-heading completion-title"><h2>报告完整度</h2><strong>{score}%</strong></div>
      <div className="progress-track"><span style={{ width: `${score}%` }} /></div>
      <div className="completion-list">
        {items.map((item) => (
          <div className="completion-row" key={item.label}>
            <span className={`check-circle ${item.done ? 'done' : 'warn'}`}>{item.done ? <Check size={14} /> : <CircleAlert size={14} />}</span>
            <span>{item.label}</span><small>{item.value}</small><ChevronRight size={14} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function ScheduledReport({ onGenerate }) {
  return (
    <section className="panel schedule-panel">
      <div className="panel-heading"><h3>即将生成的报告</h3><CalendarDays size={17} /></div>
      <div className="schedule-body">
        <span className="date-block"><strong>7月23日</strong><small>星期四</small></span>
        <span><strong>周报 · 第30周</strong><small>汇报流后端 等 2 个项目</small><small>明天 09:00 自动生成</small></span>
      </div>
      <button className="panel-link" onClick={onGenerate}>提前生成 <ChevronRight size={15} /></button>
    </section>
  )
}

export function ProjectTable({ projects, onShowAll, onUpdate }) {
  return (
    <section className="panel projects-panel">
      <div className="panel-heading"><h2>项目状态</h2></div>
      <div className="project-table" role="table">
        <div className="project-row project-header" role="row">
          <span>项目</span><span>整体进度</span><span>状态</span><span>负责人</span><span>下个里程碑</span><span />
        </div>
        {projects.map((project, index) => (
          <div className="project-row" role="row" key={project.id}>
            <span className="project-name">
              <span className={`project-symbol symbol-${index}`}>&lt;/&gt;</span>
              <span><strong>{project.name}</strong><small>{project.detail}</small></span>
            </span>
            <span className="project-progress"><small>{project.progress}%</small><span className="mini-progress"><i style={{ width: `${project.progress}%` }} /></span></span>
            <span className="project-status"><i className={`status-dot ${project.tone}`} />{project.status}</span>
            <span className="owner"><span className={`avatar avatar-${index}`}>{project.initials}</span>{project.owner}</span>
            <span className="milestone"><strong>{project.milestone}</strong><small>{project.milestoneName}</small></span>
            <button className="icon-button" onClick={() => onUpdate(project.id)} aria-label={`更新${project.name}项目进度`} title="更新项目进度"><PencilLine size={17} /></button>
          </div>
        ))}
      </div>
      <button className="panel-link" onClick={onShowAll}>查看全部项目 <ChevronRight size={15} /></button>
    </section>
  )
}

export function ActivityInsights({ onOpenActivities }) {
  const max = Math.max(...activityBars)
  const followUps = [
    { icon: GitPullRequest, text: 'Review PR #128', project: '汇报流后端', due: '今天' },
    { icon: MessageSquareText, text: 'Issue #255 等待处理', project: '汇报流后端', due: '明天' },
    { icon: FileText, text: '补充月报中的数据图表', project: '产品设计', due: '7月24日' },
  ]
  return (
    <section className="panel insights-panel">
      <div className="panel-heading"><h3>近14天活动</h3><span className="trend-up">+18%</span></div>
      <div className="bar-chart" aria-label="近14天活动柱状图">
        {activityBars.map((value, index) => <span key={index} className={index === activityBars.length - 1 ? 'current' : ''} style={{ height: `${Math.round((value / max) * 100)}%` }} />)}
      </div>
      <div className="chart-labels"><span>7/9</span><span>7/13</span><span>7/17</span><span>7/22</span></div>
      <div className="follow-heading">待跟进</div>
      <div className="follow-list">
        {followUps.map(({ icon: Icon, text, project, due }) => (
          <div className="follow-row" key={text}><Icon size={15} /><span>{text}</span><small>{project}</small><time>{due}</time></div>
        ))}
      </div>
      <button className="panel-link" onClick={onOpenActivities}>查看全部待跟进 <ChevronRight size={15} /></button>
    </section>
  )
}

export default function Dashboard({ activities, rawActivities, projectUpdates, projects, reportType, onReportType, onAdd, onProjectUpdate, onGenerate, onNavigate }) {
  return (
    <>
      <ReportSwitcher selected={reportType} onChange={onReportType} />
      <div className="dashboard-grid">
        <div className="dashboard-main"><ActivityTimeline activities={activities} onAdd={onAdd} onShowAll={() => onNavigate('activities')} /><ProjectTable projects={projects} onShowAll={() => onNavigate('projects')} onUpdate={onProjectUpdate} /></div>
        <div className="dashboard-rail"><CompletionPanel activities={rawActivities} projectUpdates={projectUpdates} /><ScheduledReport onGenerate={onGenerate} /><ActivityInsights onOpenActivities={() => onNavigate('activities')} /></div>
      </div>
    </>
  )
}
