import {
  Activity,
  BarChart3,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings,
} from 'lucide-react'

const navigation = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'reports', label: '报告中心', icon: FileText },
  { id: 'activities', label: '活动记录', icon: Activity },
  { id: 'projects', label: '项目', icon: FolderKanban },
  { id: 'templates', label: '模板', icon: BarChart3 },
]

export default function Sidebar({ view, onNavigate, onSettings }) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('overview')} aria-label="返回总览">
        <span>汇报流</span>
      </button>

      <nav className="nav-list" aria-label="主导航">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={onSettings}>
          <Settings size={19} strokeWidth={1.8} />
          <span>设置</span>
        </button>
        <div className="profile-row">
          <span className="avatar avatar-dark">林</span>
          <span className="profile-copy"><strong>林默</strong></span>
          <span className="online-dot" title="在线" />
        </div>
      </div>
    </aside>
  )
}
