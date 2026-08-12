import { useEffect, useState } from 'react'
import { Check, Menu, PencilLine, Plus } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import { ActivitiesView, ProjectsView, ReportCenter, TemplatesView } from './components/Views'
import { AddActivityModal, GenerateReportModal, ImportModal, ProjectUpdateModal, SettingsModal } from './components/Modals'
import { seedActivities, seedProjects, seedProjectUpdates } from './data'
import { buildReport } from './report'

function loadLocal(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function getDateContext() {
  const date = new Date()
  const full = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date)
  const [datePart, weekday = ''] = full.split('星期')
  return `${datePart.trim()} · 星期${weekday}`
}

const dateLabel = getDateContext()
const seedReportContent = buildReport({
  type: 'weekly', activities: seedActivities, projects: seedProjects, projectUpdates: seedProjectUpdates,
  notes: { title: '汇报流研发第30周工作周报', project: '', summary: '', achievements: '', ongoing: '', blockers: '', next: '' }, dateLabel,
})
const seedReports = [{ id: 100, type: 'weekly', typeLabel: '周报', title: '汇报流研发第30周工作周报', content: seedReportContent, createdAt: '7月18日 18:30' }]

const viewMeta = {
  overview: { title: '下午好，林默', subtitle: dateLabel },
  reports: { title: '报告中心', subtitle: '自主填写报告内容，也可引用项目进度和活动记录' },
  activities: { title: '活动记录', subtitle: '可选记录 GitHub、Issue 或其他工作活动，作为报告补充' },
  projects: { title: '项目', subtitle: '自主更新进度、阶段成果、下一步、里程碑和风险状态' },
  templates: { title: '报告模板', subtitle: '为不同汇报节奏选择清晰、稳定的信息结构' },
}

export default function App() {
  const [view, setView] = useState('overview')
  const [reportType, setReportType] = useState('daily')
  const [activities, setActivities] = useState(() => loadLocal('huibaoliu.activities', seedActivities))
  const [projects, setProjects] = useState(() => loadLocal('huibaoliu.projects', seedProjects))
  const [projectUpdates, setProjectUpdates] = useState(() => loadLocal('huibaoliu.projectUpdates', seedProjectUpdates))
  const [reports, setReports] = useState(() => loadLocal('huibaoliu.reports', seedReports))
  const [selectedReportId, setSelectedReportId] = useState(() => reports[0]?.id)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [projectTargetId, setProjectTargetId] = useState(seedProjects[0]?.id)

  useEffect(() => localStorage.setItem('huibaoliu.activities', JSON.stringify(activities)), [activities])
  useEffect(() => localStorage.setItem('huibaoliu.projects', JSON.stringify(projects)), [projects])
  useEffect(() => localStorage.setItem('huibaoliu.projectUpdates', JSON.stringify(projectUpdates)), [projectUpdates])
  useEffect(() => localStorage.setItem('huibaoliu.reports', JSON.stringify(reports)), [reports])
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 2400); return () => window.clearTimeout(timer) }, [toast])

  const header = viewMeta[view]
  const navigate = (nextView) => { setView(nextView); setMobileNav(false) }
  const addActivity = (form) => {
    const now = new Date()
    const tone = form.status === '有阻塞' ? 'orange' : form.status === '进行中' ? 'blue' : 'green'
    setActivities((current) => [{ id: Date.now(), time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), title: form.title, detail: form.detail || '手工补充的工作记录', project: form.project, source: 'manual', status: form.status, tone, date: now.toISOString().slice(0, 10) }, ...current])
    setModal(null)
    setToast('工作进展已记录')
  }
  const importActivities = (items) => { setActivities((current) => [...items, ...current]); setToast(`已导入 ${items.length} 条 GitHub 活动`) }
  const openProjectUpdate = (projectId = projects[0]?.id) => {
    setProjectTargetId(projectId)
    setModal('project')
  }
  const saveProjectUpdate = (form) => {
    const projectId = Number(form.projectId)
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    const now = new Date()
    const tone = form.status === '有风险' || form.status === '已阻塞' ? 'orange' : form.status === '未开始' ? 'blue' : 'green'
    const update = {
      id: Date.now(),
      projectId,
      projectName: project.name,
      progress: Number(form.progress),
      status: form.status,
      completed: form.completed.trim(),
      next: form.next.trim(),
      blockers: form.blockers.trim(),
      milestoneName: form.milestoneName.trim(),
      milestone: form.milestone,
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      date: now.toISOString().slice(0, 10),
      updatedAt: now.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    }
    setProjects((current) => current.map((item) => item.id === projectId ? {
      ...item,
      progress: update.progress,
      status: update.status,
      tone,
      milestoneName: update.milestoneName || item.milestoneName,
      milestone: update.milestone || item.milestone,
      lastUpdated: update.updatedAt,
    } : item))
    setProjectUpdates((current) => [update, ...current])
    setModal(null)
    setToast(`${project.name}进度已更新`)
  }
  const saveReport = (report) => {
    setReports((current) => [report, ...current])
    setSelectedReportId(report.id)
    setModal(null)
    setView('reports')
    setToast(`${report.typeLabel}已保存并归档`)
  }
  const useTemplate = (type) => { setReportType(type); setModal('generate') }
  const timelineItems = [
    ...projectUpdates.map((update) => ({
      id: `project-${update.id}`,
      sortId: update.id,
      time: update.time,
      title: `更新了 ${update.projectName} 项目进度至 ${update.progress}%`,
      detail: update.completed || update.next || '自主填写的项目进度更新',
      project: update.projectName,
      source: 'project',
      status: update.status,
      tone: update.status === '有风险' || update.status === '已阻塞' ? 'orange' : 'green',
      date: update.date,
    })),
    ...activities.map((activity) => ({ ...activity, sortId: activity.id })),
  ].sort((a, b) => b.sortId - a.sortId)

  return (
    <div className="app-shell">
      <div className={`mobile-nav-wrap ${mobileNav ? 'open' : ''}`}><Sidebar view={view} onNavigate={navigate} onSettings={() => setModal('settings')} /></div>
      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="关闭导航" />}
      <main className="app-main">
        <header className="top-header">
          <button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="打开导航"><Menu size={21} /></button>
          <span className="header-copy"><h1>{header.title}</h1><p>{header.subtitle}</p></span>
          <span className="header-actions"><button className="button secondary" onClick={() => openProjectUpdate()}><PencilLine size={17} /> 更新项目</button><button className="button primary" onClick={() => setModal('generate')}><Plus size={18} /> 生成报告</button></span>
        </header>

        <div className="page-content">
          {view === 'overview' && <Dashboard activities={timelineItems} rawActivities={activities} projectUpdates={projectUpdates} projects={projects} reportType={reportType} onReportType={setReportType} onAdd={() => setModal('activity')} onProjectUpdate={openProjectUpdate} onGenerate={() => setModal('generate')} onNavigate={navigate} />}
          {view === 'reports' && <ReportCenter reports={reports} selectedId={selectedReportId} onSelect={setSelectedReportId} onGenerate={() => setModal('generate')} />}
          {view === 'activities' && <ActivitiesView activities={timelineItems} onAdd={() => setModal('activity')} onImport={() => setModal('import')} />}
          {view === 'projects' && <ProjectsView projects={projects} onUpdate={openProjectUpdate} />}
          {view === 'templates' && <TemplatesView onUse={useTemplate} />}
        </div>
      </main>

      {modal === 'activity' && <AddActivityModal projects={projects} onClose={() => setModal(null)} onSave={addActivity} />}
      {modal === 'project' && <ProjectUpdateModal projects={projects} initialProjectId={projectTargetId} onClose={() => setModal(null)} onSave={saveProjectUpdate} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} onImport={importActivities} />}
      {modal === 'generate' && <GenerateReportModal initialType={reportType} activities={activities} projects={projects} projectUpdates={projectUpdates} dateLabel={dateLabel} onClose={() => setModal(null)} onSave={saveReport} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}
