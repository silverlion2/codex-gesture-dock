import { Activity, CalendarDays, CheckCircle2, ChevronRight, FileText, Github, PencilLine, Search, SlidersHorizontal } from 'lucide-react'
import { reportTypes, templates } from '../data'

export function ReportCenter({ reports, selectedId, onSelect, onGenerate }) {
  const selected = reports.find((report) => report.id === selectedId) || reports[0]
  return (
    <div className="workspace-view report-center">
      <aside className="report-list-panel panel">
        <div className="view-toolbar"><div className="search-box"><Search size={16} /><input aria-label="搜索报告" placeholder="搜索报告" /></div><button className="icon-button"><SlidersHorizontal size={17} /></button></div>
        <div className="section-label">报告历史 · {reports.length}</div>
        <div className="report-history-list">
          {reports.map((report) => (
            <button key={report.id} className={`history-item ${selected?.id === report.id ? 'active' : ''}`} onClick={() => onSelect(report.id)}>
              <span className="history-icon"><FileText size={17} /></span>
              <span><strong>{report.title}</strong><small>{report.typeLabel} · {report.createdAt}</small></span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      </aside>
      <section className="report-preview panel">
        {selected ? (
          <><div className="preview-header"><span><small>{selected.typeLabel}</small><h2>{selected.title}</h2></span><span className="archive-state"><CheckCircle2 size={15} /> 已归档</span></div><pre>{selected.content}</pre></>
        ) : (
          <div className="empty-state"><FileText size={36} /><h2>还没有历史报告</h2><p>从活动记录生成第一份可追溯的工作报告。</p><button className="button primary" onClick={onGenerate}>生成报告</button></div>
        )}
      </section>
    </div>
  )
}

export function ActivitiesView({ activities, onAdd, onImport }) {
  return (
    <section className="workspace-view single-view panel activity-view">
      <div className="view-toolbar"><div className="search-box"><Search size={16} /><input aria-label="搜索记录" placeholder="搜索项目更新或活动记录" /></div><div className="toolbar-spacer" /><button className="button secondary" onClick={onImport}><Github size={16} /> 导入 GitHub</button><button className="button primary" onClick={onAdd}>记录工作</button></div>
      <div className="activity-date-group"><div className="date-rail"><strong>7月22日</strong><small>星期三</small></div><div className="activity-ledger">
        {activities.map((item) => <article className="ledger-row" key={item.id}><span className={`ledger-source ${item.source}`}><Activity size={16} /></span><time>{item.time}</time><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="project-tag">{item.project}</span><span className={`status-text ${item.tone}`}>{item.status}</span></article>)}
      </div></div>
    </section>
  )
}

export function ProjectsView({ projects, onUpdate }) {
  return (
    <section className="workspace-view single-view panel management-table">
      <div className="view-toolbar"><div className="search-box"><Search size={16} /><input aria-label="搜索项目" placeholder="搜索项目" /></div><div className="toolbar-spacer" /><button className="button secondary"><SlidersHorizontal size={16} /> 视图</button><button className="button primary" onClick={() => onUpdate()}><PencilLine size={16} /> 更新项目进度</button></div>
      <div className="management-row management-header"><span>项目</span><span>状态</span><span>负责人</span><span>进度</span><span>下个里程碑</span><span>更新</span></div>
      {projects.map((project) => <div className="management-row" key={project.id}><span><strong>{project.name}</strong><small>{project.detail}</small></span><span className="project-status"><i className={`status-dot ${project.tone}`} />{project.status}</span><span className="owner"><span className="avatar">{project.initials}</span>{project.owner}</span><span className="project-progress view-progress"><small>{project.progress}%</small><span className="mini-progress"><i style={{ width: `${project.progress}%` }} /></span></span><span><strong>{project.milestoneName}</strong><small>{project.milestone}</small></span><button className="table-action" onClick={() => onUpdate(project.id)}>更新进度</button></div>)}
    </section>
  )
}

export function TemplatesView({ onUse }) {
  return (
    <section className="workspace-view single-view templates-view">
      <div className="template-intro"><span><h2>选择一种汇报结构</h2><p>模板只定义信息结构。你可以完全自主填写，项目进度和活动记录只是可选辅助。</p></span><button className="button secondary">管理模板</button></div>
      <div className="template-list">
        {templates.map((template, index) => <article className="template-row panel" key={template.id}><span className={`template-index index-${index}`}><CalendarDays size={20} /></span><span className="template-copy"><small>{template.cadence}</small><h3>{template.name}</h3><p>{template.description}</p><span className="section-chips">{template.sections.map((section) => <i key={section}>{section}</i>)}</span></span><button className="button secondary" onClick={() => onUse(template.id)}>使用模板 <ChevronRight size={15} /></button></article>)}
      </div>
    </section>
  )
}

export function EmptyReports() {
  return reportTypes.map((type) => ({ id: type.id, title: type.label }))
}
