import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  PaperAirplaneIcon,
  BoltIcon,
  UsersIcon,
  QueueListIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ArrowUpTrayIcon,
  FolderIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useProjectsList } from '../../hooks/useProjects';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Campaigns', href: '/campaigns', icon: PaperAirplaneIcon },
  { name: 'Automations', href: '/automations', icon: BoltIcon },
  { name: 'Contacts', href: '/contacts', icon: UsersIcon },
  { name: 'Bounces', href: '/bounces', icon: ExclamationTriangleIcon },
  { name: 'Import', href: '/import', icon: ArrowUpTrayIcon },
  { name: 'Lists', href: '/lists', icon: QueueListIcon },
  { name: 'Templates', href: '/templates', icon: DocumentTextIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

const SIDEBAR_COLLAPSED_KEY = 'cadencerelay-sidebar-collapsed';

interface SidebarProps {
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { data: projects = [] } = useProjectsList();
  const isMobile = !!onClose;

  return (
    <div className={`flex h-full flex-col bg-gray-900 transition-all duration-200 ${isMobile ? 'w-64' : collapsed ? 'w-16' : 'w-64'}`}>
      <div className={`flex h-16 items-center ${collapsed && !isMobile ? 'justify-center px-2' : 'justify-between px-6'}`}>
        {(!collapsed || isMobile) && (
          <h1 className="text-xl font-bold text-white">CadenceRelay</h1>
        )}
        {collapsed && !isMobile && (
          <span className="text-lg font-bold text-white">CR</span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white lg:hidden"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className={`flex-1 space-y-1 overflow-y-auto ${collapsed && !isMobile ? 'px-1.5' : 'px-3'} py-4`}>
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            onClick={onClose}
            title={collapsed && !isMobile ? item.name : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed && !isMobile ? 'justify-center' : 'gap-3'} rounded-lg ${collapsed && !isMobile ? 'px-2' : 'px-3'} py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {(!collapsed || isMobile) && item.name}
          </NavLink>
        ))}

        {/* Project shortcuts - hidden when collapsed */}
        {(!collapsed || isMobile) && projects.length > 0 && (
          <div className="mt-4 border-t border-gray-800 pt-3">
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Projects
            </p>
            {projects.slice(0, 8).map((p) => (
              <NavLink
                key={p.id}
                to={`/projects/${p.id}`}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate">{p.icon ? `${p.icon} ` : ''}{p.name}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* Collapse toggle button - only on desktop */}
      {!isMobile && onToggleCollapse && (
        <div className={`border-t border-gray-800 ${collapsed ? 'px-1.5' : 'px-3'} py-3`}>
          <button
            onClick={onToggleCollapse}
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRightIcon className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeftIcon className="h-5 w-5" />
                <span className="ml-2 text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export { SIDEBAR_COLLAPSED_KEY };
