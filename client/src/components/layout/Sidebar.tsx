import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  PaperAirplaneIcon,
  UsersIcon,
  QueueListIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ArrowUpTrayIcon,
  FolderIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useProjectsList } from '../../hooks/useProjects';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Campaigns', href: '/campaigns', icon: PaperAirplaneIcon },
  { name: 'Contacts', href: '/contacts', icon: UsersIcon },
  { name: 'Import', href: '/import', icon: ArrowUpTrayIcon },
  { name: 'Lists', href: '/lists', icon: QueueListIcon },
  { name: 'Templates', href: '/templates', icon: DocumentTextIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const { data: projects = [] } = useProjectsList();

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center justify-between px-6">
        <h1 className="text-xl font-bold text-white">CadenceRelay</h1>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white lg:hidden"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </NavLink>
        ))}

        {/* Project shortcuts */}
        {projects.length > 0 && (
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
    </div>
  );
}
