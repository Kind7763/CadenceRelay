import { useState, useEffect, useRef, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Campaign } from '../api/campaigns.api';
import {
  useCampaignsList,
  useDeleteCampaign,
  useBulkDeleteCampaigns,
  useToggleStar,
  useToggleArchive,
  useDuplicateCampaign,
  useUpdateCampaignLabel,
  useCampaignLabels,
} from '../hooks/useCampaigns';
import { useProjectsList, useMoveItems } from '../hooks/useProjects';
import { TableSkeleton, GridCardSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import AdminPasswordModal from '../components/ui/AdminPasswordModal';
import LabelPicker from '../components/ui/LabelPicker';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { SortableHeader, SortState, sortItems, toggleSort } from '../components/ui/SortableHeader';
import { GroupBy, groupByDate, groupByProject } from '../utils/grouping';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

type ViewTab = 'active' | 'archived' | 'starred';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Fixed-position ActionsDropdown ─── */

function ActionsDropdown({
  campaign,
  onDuplicate,
  onToggleStar,
  onToggleArchive,
  onDelete,
  onLabelOpen,
  onMoveToProject,
  projects,
}: {
  campaign: Campaign;
  onDuplicate: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onLabelOpen: () => void;
  onMoveToProject: (projectId: string) => void;
  projects: Array<{ id: string; name: string; icon?: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = 300;
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
        <div style={dropdownStyle} className="w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="w-4 text-center text-xs">&#x2398;</span> Duplicate
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleStar(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="w-4 text-center">{campaign.is_starred ? '\u2605' : '\u2606'}</span>
            {campaign.is_starred ? 'Unstar' : 'Star'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleArchive(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="w-4 text-center text-xs">{campaign.is_archived ? '\u21A9' : '\u2193'}</span>
            {campaign.is_archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onLabelOpen(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="w-4 text-center text-xs">{campaign.label_color ? '\u25CF' : '\u25CB'}</span>
            {campaign.label_name ? 'Change Label' : 'Add Label'}
          </button>
          {projects.length > 0 && (
            <>
              <hr className="my-1 border-gray-100" />
              <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase">Move to Project</div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); onMoveToProject(p.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  {p.icon ? `${p.icon} ` : ''}{p.name}
                </button>
              ))}
            </>
          )}
          <hr className="my-1 border-gray-100" />
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

function CampaignsContent() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ type: 'single' | 'bulk'; id?: string } | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [labelPickerCampaignId, setLabelPickerCampaignId] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('campaigns-view') as ViewMode) || 'list');
  const [sort, setSort] = useState<SortState | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const navigate = useNavigate();

  const { data: projects = [] } = useProjectsList();

  const { data, isLoading, isError } = useCampaignsList({
    page,
    status: statusFilter || undefined,
    search: search || undefined,
    archived: viewTab === 'archived' ? 'true' : undefined,
    starred: viewTab === 'starred' ? 'true' : undefined,
    project_id: projectFilter || undefined,
  });

  const deleteMutation = useDeleteCampaign();
  const bulkDeleteMutation = useBulkDeleteCampaigns();
  const starMutation = useToggleStar();
  const archiveMutation = useToggleArchive();
  const duplicateMutation = useDuplicateCampaign();
  const labelMutation = useUpdateCampaignLabel();
  const moveMutation = useMoveItems();
  const { data: labelsData } = useCampaignLabels();

  const allCampaigns: Campaign[] = data?.data || [];

  const campaigns = allCampaigns.filter((c) => {
    if (viewTab === 'archived' && !c.is_archived) return false;
    if (viewTab === 'active' && c.is_archived) return false;
    if (viewTab === 'starred' && !c.is_starred) return false;
    if (labelFilter && c.label_color !== labelFilter) return false;
    return true;
  });

  const total = data?.pagination?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const uniqueLabels: { name: string; color: string }[] = [];
  const seenColors = new Set<string>();
  for (const c of allCampaigns) {
    if (c.label_color && c.label_name && !seenColors.has(c.label_color)) {
      seenColors.add(c.label_color);
      uniqueLabels.push({ name: c.label_name, color: c.label_color });
    }
  }
  if (labelsData) {
    for (const l of labelsData) {
      if (!seenColors.has(l.color)) {
        seenColors.add(l.color);
        uniqueLabels.push({ name: l.name, color: l.color });
      }
    }
  }

  useEffect(() => { setSelectedIds(new Set()); }, [page, statusFilter, search, viewTab]);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('campaigns-view', mode);
  }

  function handleSort(field: string) {
    setSort((prev) => toggleSort(prev, field));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === campaigns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(campaigns.map((c) => c.id)));
    }
  }

  async function handleDeleteConfirm(password: string) {
    if (!deleteModal) return;
    if (deleteModal.type === 'single' && deleteModal.id) {
      await deleteMutation.mutateAsync({ id: deleteModal.id, adminPassword: password });
    } else if (deleteModal.type === 'bulk') {
      const ids = Array.from(selectedIds);
      await bulkDeleteMutation.mutateAsync({ ids, adminPassword: password });
      setSelectedIds(new Set());
    }
    setDeleteModal(null);
  }

  function handleDuplicate(id: string) {
    duplicateMutation.mutate(id, {
      onSuccess: (newCampaign) => {
        if (newCampaign?.id) navigate(`/campaigns/${newCampaign.id}`);
      },
    });
  }

  function handleLabelSelect(campaignId: string, label: { name: string; color: string } | null) {
    if (label) {
      labelMutation.mutate({ id: campaignId, label });
    } else {
      labelMutation.mutate({ id: campaignId, label: { name: '', color: '' } });
    }
    setLabelPickerCampaignId(null);
  }

  const getField = (c: Campaign, field: string): string | number | null => {
    switch (field) {
      case 'name': return c.name;
      case 'status': return c.status;
      case 'created_at': return c.created_at;
      case 'total_recipients': return c.total_recipients;
      case 'open_rate': {
        const sent = Number(c.sent_count) || 0;
        const opens = Number(c.open_count) || 0;
        return sent > 0 ? opens / sent : 0;
      }
      case 'click_rate': {
        const sentC = Number(c.sent_count) || 0;
        const clicks = Number(c.click_count) || 0;
        return sentC > 0 ? clicks / sentC : 0;
      }
      case 'bounce_rate': {
        const sentB = Number(c.sent_count) || 0;
        const bounces = Number(c.bounce_count) || 0;
        return sentB > 0 ? bounces / sentB : 0;
      }
      default: return null;
    }
  };

  const sorted = sortItems(campaigns, sort, getField);

  const tabClasses = (tab: ViewTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      viewTab === tab
        ? 'bg-primary-100 text-primary-700'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`;

  /* ─── Shared action props builder ─── */
  function actionProps(c: Campaign) {
    return {
      campaign: c,
      onDuplicate: () => handleDuplicate(c.id),
      onToggleStar: () => starMutation.mutate(c.id),
      onToggleArchive: () => archiveMutation.mutate(c.id),
      onDelete: () => setDeleteModal({ type: 'single', id: c.id }),
      onLabelOpen: () => setLabelPickerCampaignId(c.id),
      onMoveToProject: (projectId: string) => moveMutation.mutate({ projectId, items: { campaignIds: [c.id] } }),
      projects,
    };
  }

  /* ─── Grid card ─── */
  function renderCard(c: Campaign) {
    const sentCount = Number(c.sent_count) || 0;
    const openCount = Number(c.open_count) || 0;
    const bounceCountCard = Number(c.bounce_count) || 0;
    const openRate = sentCount > 0 ? ((openCount / sentCount) * 100).toFixed(1) : '0.0';
    const bounceRateCard = sentCount > 0 ? ((bounceCountCard / sentCount) * 100).toFixed(1) : '0.0';
    const project = projects.find((p) => p.id === (c as Campaign & { project_id?: string }).project_id);

    return (
      <div
        key={c.id}
        className={`cursor-pointer rounded-xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow ${c.is_archived ? 'opacity-60' : ''}`}
        onClick={() => navigate(`/campaigns/${c.id}`)}
      >
        <div className="flex items-start justify-between">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.status] || ''}`}>{c.status}</span>
          <div onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown {...actionProps(c)} />
            {labelPickerCampaignId === c.id && (
              <LabelPicker
                currentColor={c.label_color}
                currentName={c.label_name}
                onSelect={(label) => handleLabelSelect(c.id, label)}
                onClose={() => setLabelPickerCampaignId(null)}
              />
            )}
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-center gap-2">
            {c.label_color && (
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.label_color }} title={c.label_name || ''} />
            )}
            <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {sentCount > 0 ? sentCount.toLocaleString() : c.total_recipients.toLocaleString()} sent
            {sentCount > 0 && (
              <>
                {' '}<span className="text-gray-400">&middot; {openRate}% opens</span>
                {' '}<span className={Number(bounceRateCard) > 5 ? 'text-red-500' : 'text-gray-400'}>&middot; {bounceRateCard}% bounced</span>
              </>
            )}
          </p>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            {c.is_starred && <span className="text-yellow-400">{'\u2605'}</span>}
            <span>{formatDate(c.created_at)}</span>
          </div>
          {project && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${project.color || '#6366f1'}15`, color: project.color || '#6366f1' }}>
              {project.name}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ─── List table row ─── */
  function renderRow(c: Campaign) {
    const sentCount = Number(c.sent_count) || 0;
    const openCount = Number(c.open_count) || 0;
    const bounceCountRow = Number(c.bounce_count) || 0;
    const openRate = sentCount > 0 ? ((openCount / sentCount) * 100).toFixed(1) : '0.0';
    const bounceRateRow = sentCount > 0 ? ((bounceCountRow / sentCount) * 100).toFixed(1) : '0.0';
    const isArchived = !!c.is_archived;

    return (
      <tr
        key={c.id}
        className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(c.id) ? 'bg-primary-50' : ''} ${isArchived ? 'opacity-60' : ''}`}
      >
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.has(c.id)}
            onChange={() => toggleSelect(c.id)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </td>
        <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
          <div className="flex items-center gap-2">
            {c.label_color && (
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: c.label_color }}
                title={c.label_name || ''}
              />
            )}
            <span className="font-medium">{c.name}</span>
            {c.label_name && (
              <span className="text-xs text-gray-400">{c.label_name}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.status] || ''}`}>{c.status}</span>
        </td>
        <td className="px-4 py-3 text-gray-500" onClick={() => navigate(`/campaigns/${c.id}`)}>
          {formatDate(c.created_at)}
        </td>
        <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
          {c.total_recipients}
        </td>
        <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
          {openRate}%
        </td>
        <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
          <span className={Number(bounceRateRow) > 5 ? 'text-red-600 font-medium' : ''}>{bounceRateRow}%</span>
        </td>
        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => starMutation.mutate(c.id)}
            className="text-lg leading-none transition-colors"
            title={c.is_starred ? 'Unstar' : 'Star'}
          >
            {c.is_starred
              ? <span className="text-yellow-400">{'\u2605'}</span>
              : <span className="text-gray-300 hover:text-yellow-400">{'\u2606'}</span>
            }
          </button>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <ActionsDropdown {...actionProps(c)} />
            {labelPickerCampaignId === c.id && (
              <LabelPicker
                currentColor={c.label_color}
                currentName={c.label_name}
                onSelect={(label) => handleLabelSelect(c.id, label)}
                onClose={() => setLabelPickerCampaignId(null)}
              />
            )}
          </div>
        </td>
      </tr>
    );
  }

  function renderGridItems(items: Campaign[]) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(renderCard)}
      </div>
    );
  }

  function renderListItems(items: Campaign[]) {
    return (
      <div className="rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={campaigns.length > 0 && selectedIds.size === campaigns.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <SortableHeader label="Name" field="name" currentSort={sort} onSort={handleSort} className="px-4" />
                <SortableHeader label="Status" field="status" currentSort={sort} onSort={handleSort} className="px-4" />
                <SortableHeader label="Date" field="created_at" currentSort={sort} onSort={handleSort} className="px-4" />
                <SortableHeader label="Recipients" field="total_recipients" currentSort={sort} onSort={handleSort} className="px-4" />
                <SortableHeader label="Open Rate" field="open_rate" currentSort={sort} onSort={handleSort} className="px-4" />
                <SortableHeader label="Bounce %" field="bounce_rate" currentSort={sort} onSort={handleSort} className="px-4" />
                <th className="w-10 px-4 py-3 text-center font-medium text-gray-600">
                  <span title="Star">{'\u2606'}</span>
                </th>
                <th className="w-10 px-4 py-3 text-center font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No campaigns found</td></tr>
              ) : items.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderGrouped(items: Campaign[]) {
    if (groupBy === 'date') {
      const groups = groupByDate(items, (c) => c.created_at);
      return Array.from(groups.entries()).map(([label, groupItems]) => (
        <div key={label}>
          <GroupHeader label={label} count={groupItems.length} />
          {viewMode === 'grid' ? renderGridItems(groupItems) : renderListItems(groupItems)}
        </div>
      ));
    }
    if (groupBy === 'project') {
      const groups = groupByProject(
        items,
        (c) => (c as Campaign & { project_id?: string }).project_id,
        projects,
      );
      return Array.from(groups.entries()).map(([label, { color, items: groupItems }]) => (
        <div key={label}>
          <GroupHeader label={label} color={color} count={groupItems.length} />
          {viewMode === 'grid' ? renderGridItems(groupItems) : renderListItems(groupItems)}
        </div>
      ));
    }
    if (items.length === 0) {
      return <p className="text-gray-400">No campaigns found</p>;
    }
    return viewMode === 'grid' ? renderGridItems(items) : renderListItems(items);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              {projects.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      moveMutation.mutate({ projectId: e.target.value, items: { campaignIds: Array.from(selectedIds) } });
                      setSelectedIds(new Set());
                      e.target.value = '';
                    }
                  }}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="" disabled>Move to Project ({selectedIds.size})</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>)}
                </select>
              )}
              <button
                onClick={() => setDeleteModal({ type: 'bulk' })}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete Selected ({selectedIds.size})
              </button>
            </>
          )}
          <button onClick={() => navigate('/campaigns/new')} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
            New Campaign
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="mt-4 flex items-center gap-1">
        <button className={tabClasses('active')} onClick={() => { setViewTab('active'); setPage(1); }}>
          Active
        </button>
        <button className={tabClasses('starred')} onClick={() => { setViewTab('starred'); setPage(1); }}>
          Starred
        </button>
        <button className={tabClasses('archived')} onClick={() => { setViewTab('archived'); setPage(1); }}>
          Archived
        </button>
      </div>

      {/* Search, filters, view toggle */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search campaigns..."
          autoComplete="off" autoCorrect="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-lg border px-3 py-2 text-sm w-64"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sending">Sending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">All Projects</option>
          <option value="none">No Project</option>
          {projects.map((p) => (
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

      {/* Label filter chips */}
      {uniqueLabels.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Labels:</span>
          {uniqueLabels.map((l) => (
            <button
              key={l.color}
              onClick={() => setLabelFilter(labelFilter === l.color ? null : l.color)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                labelFilter === l.color
                  ? 'border-gray-400 bg-gray-100 text-gray-800'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </button>
          ))}
          {labelFilter && (
            <button onClick={() => setLabelFilter(null)} className="text-xs text-gray-400 hover:text-gray-600">
              Clear
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4">
          {viewMode === 'grid' ? <GridCardSkeleton count={6} /> : <TableSkeleton rows={5} columns={8} />}
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-xl bg-red-50 p-6 text-center">
          <p className="text-red-700 font-medium">Failed to load campaigns</p>
          <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {renderGrouped(sorted)}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>{total} campaigns total</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Prev</button>
                <span className="px-3 py-1">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {deleteModal && (
        <AdminPasswordModal
          title={
            deleteModal.type === 'single'
              ? 'Delete campaign?'
              : `Delete ${selectedIds.size} campaign(s)?`
          }
          description="This action cannot be undone. All associated recipients, email events, and attachments will be permanently removed."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}

export default function Campaigns() {
  return (
    <ErrorBoundary>
      <CampaignsContent />
    </ErrorBoundary>
  );
}
