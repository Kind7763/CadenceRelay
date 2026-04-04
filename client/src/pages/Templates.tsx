import { useState, useRef, useEffect, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template, toggleArchiveTemplate } from '../api/templates.api';
import { useTemplatesList, useDeleteTemplate } from '../hooks/useTemplates';
import { useProjectsList, useMoveItems } from '../hooks/useProjects';
import { Project } from '../api/projects.api';
import { GridCardSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { SortableHeader, SortState, sortItems, toggleSort } from '../components/ui/SortableHeader';
import { GroupBy, groupByDate, groupByProject } from '../utils/grouping';

/* ─── Fixed-position 3-dot menu ─── */

function TemplateCardMenu({ templateId, projects, onDelete, isArchived, onArchiveToggle }: {
  templateId: string;
  projects: Project[];
  onDelete: () => void;
  isArchived?: boolean;
  onArchiveToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const moveMutation = useMoveItems();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = 250;
        setDropdownStyle({
          position: 'fixed' as const,
          top: spaceBelow > dropdownHeight ? rect.bottom + 4 : undefined,
          bottom: spaceBelow > dropdownHeight ? undefined : window.innerHeight - rect.top + 4,
          right: window.innerWidth - rect.right,
          zIndex: 9999,
        });
      }
    }
    setOpen(!open);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div style={dropdownStyle} className="w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {projects.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase">Move to Project</div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveMutation.mutate({ projectId: p.id, items: { templateIds: [templateId] } });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                  {p.name}
                </button>
              ))}
              <hr className="my-1 border-gray-100" />
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onArchiveToggle(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {isArchived ? 'Restore' : 'Archive'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Group section header ─── */

function GroupHeader({ label, color, count }: { label: string; color?: string | null; count: number }) {
  return (
    <div className="flex items-center gap-2 py-2">
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{count}</span>
    </div>
  );
}

/* ─── Main page ─── */

type TemplateWithProject = Template & { project_id?: string };

function TemplatesContent() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState('');
  const [viewTab, setViewTab] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('templates-view') as ViewMode) || 'grid');
  const [sort, setSort] = useState<SortState | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  const { data: projectsData = [] } = useProjectsList();
  const queryParams: Record<string, string> = {};
  if (projectFilter) queryParams.project_id = projectFilter;
  if (viewTab === 'archived') queryParams.archived = 'true';
  const { data: templates = [], isLoading, isError, refetch } = useTemplatesList(
    Object.keys(queryParams).length > 0 ? queryParams : undefined
  );
  const deleteTemplateMutation = useDeleteTemplate();

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('templates-view', mode);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template permanently?')) return;
    deleteTemplateMutation.mutate(id);
  }

  async function handleArchiveToggle(id: string) {
    try {
      const res = await toggleArchiveTemplate(id);
      const { default: toast } = await import('react-hot-toast');
      toast.success(res.is_active ? 'Template restored' : 'Template archived');
      refetch();
    } catch {
      const { default: toast } = await import('react-hot-toast');
      toast.error('Failed to update template');
    }
  }

  function handleSort(field: string) {
    setSort((prev) => toggleSort(prev, field));
  }

  const getField = (t: TemplateWithProject, field: string): string | number | null => {
    switch (field) {
      case 'name': return t.name;
      case 'subject': return t.subject;
      case 'version': return t.version;
      case 'updated_at': return t.updated_at;
      default: return null;
    }
  };

  const sorted = sortItems(templates as TemplateWithProject[], sort, getField);

  /* ─── Render helpers ─── */

  function renderCard(t: TemplateWithProject) {
    const project = projectsData.find((p) => p.id === t.project_id);
    return (
      <div key={t.id} className="cursor-pointer rounded-xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow" onClick={() => navigate(`/templates/${t.id}/edit`)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
            {project && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${project.color || '#6366f1'}15`, color: project.color || '#6366f1' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color || '#6366f1' }} />
                {project.name}
              </span>
            )}
          </div>
          <TemplateCardMenu templateId={t.id} projects={projectsData} onDelete={() => handleDelete(t.id)} isArchived={!t.is_active} onArchiveToggle={() => handleArchiveToggle(t.id)} />
        </div>
        <p className="mt-2 text-sm text-gray-500 truncate">{t.subject}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>v{t.version}</span>
          <span>{new Date(t.updated_at).toLocaleDateString()}</span>
        </div>
        {t.variables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {t.variables.map((v: string) => (
              <span key={v} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">{`{{${v}}}`}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderRow(t: TemplateWithProject) {
    const project = projectsData.find((p) => p.id === t.project_id);
    return (
      <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/templates/${t.id}/edit`)}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{t.name}</span>
            {project && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${project.color || '#6366f1'}15`, color: project.color || '#6366f1' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color || '#6366f1' }} />
                {project.name}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-gray-500 max-w-[200px] truncate">{t.subject}</td>
        <td className="px-3 py-2.5 text-gray-500">v{t.version}</td>
        <td className="px-3 py-2.5 text-gray-500">{new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <TemplateCardMenu templateId={t.id} projects={projectsData} onDelete={() => handleDelete(t.id)} isArchived={!t.is_active} onArchiveToggle={() => handleArchiveToggle(t.id)} />
        </td>
      </tr>
    );
  }

  function renderGridItems(items: TemplateWithProject[]) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(renderCard)}
      </div>
    );
  }

  function renderListItems(items: TemplateWithProject[]) {
    return (
      <div className="rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader label="Name" field="name" currentSort={sort} onSort={handleSort} />
                <SortableHeader label="Subject" field="subject" currentSort={sort} onSort={handleSort} />
                <SortableHeader label="Version" field="version" currentSort={sort} onSort={handleSort} />
                <SortableHeader label="Updated" field="updated_at" currentSort={sort} onSort={handleSort} />
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">No templates found</td></tr>
              ) : items.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderGrouped(items: TemplateWithProject[]) {
    if (groupBy === 'date') {
      const groups = groupByDate(items, (t) => t.updated_at);
      return Array.from(groups.entries()).map(([label, groupItems]) => (
        <div key={label}>
          <GroupHeader label={label} count={groupItems.length} />
          {viewMode === 'grid' ? renderGridItems(groupItems) : renderListItems(groupItems)}
        </div>
      ));
    }
    if (groupBy === 'project') {
      const groups = groupByProject(items, (t) => t.project_id, projectsData);
      return Array.from(groups.entries()).map(([label, { color, items: groupItems }]) => (
        <div key={label}>
          <GroupHeader label={label} color={color} count={groupItems.length} />
          {viewMode === 'grid' ? renderGridItems(groupItems) : renderListItems(groupItems)}
        </div>
      ));
    }
    // No grouping
    if (items.length === 0) {
      return <p className="text-gray-400">No templates yet. Create your first email template.</p>;
    }
    return viewMode === 'grid' ? renderGridItems(items) : renderListItems(items);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <button onClick={() => navigate('/templates/new')} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Template
        </button>
      </div>

      {/* Active / Archived tabs */}
      <div className="mt-4 flex items-center gap-1">
        <button
          onClick={() => setViewTab('active')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === 'active' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >Active</button>
        <button
          onClick={() => setViewTab('archived')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === 'archived' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >Archived</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All Projects</option>
          <option value="none">No Project</option>
          {projectsData.map((p) => (
            <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
          ))}
        </select>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="none">No Grouping</option>
          <option value="date">Group by Date</option>
          <option value="project">Group by Project</option>
        </select>

        <div className="ml-auto">
          <ViewToggle mode={viewMode} onChange={handleViewChange} />
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          viewMode === 'grid' ? <GridCardSkeleton count={6} /> : <TableSkeleton rows={5} columns={5} />
        ) : isError ? (
          <div className="rounded-xl bg-red-50 p-6 text-center">
            <p className="text-red-700 font-medium">Failed to load templates</p>
            <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {renderGrouped(sorted)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Templates() {
  return (
    <ErrorBoundary>
      <TemplatesContent />
    </ErrorBoundary>
  );
}
