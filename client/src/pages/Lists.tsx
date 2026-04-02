import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SmartFilterCriteria, ContactList } from '../api/lists.api';
import { useListsList, useCreateList, useCreateSmartList, useDeleteList } from '../hooks/useLists';
import { useContactFilters } from '../hooks/useFilters';
import { useProjectsList } from '../hooks/useProjects';
import { GridCardSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { SortableHeader, SortState, sortItems, toggleSort } from '../components/ui/SortableHeader';

type ListWithProject = ContactList & { project_id?: string };

function ListsContent() {
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateSmart, setShowCreateSmart] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('lists-view') as ViewMode) || 'grid');
  const [sort, setSort] = useState<SortState | null>(null);
  const navigate = useNavigate();

  const { data: allLists = [], isLoading, isError } = useListsList();
  const { data: projects = [] } = useProjectsList();

  const lists = projectFilter
    ? allLists.filter((l: ListWithProject) =>
        projectFilter === 'none' ? !l.project_id : l.project_id === projectFilter
      )
    : allLists;

  const createListMutation = useCreateList();
  const deleteListMutation = useDeleteList();

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('lists-view', mode);
  }

  function handleSort(field: string) {
    setSort((prev) => toggleSort(prev, field));
  }

  async function handleCreate() {
    try {
      await createListMutation.mutateAsync({ name: newName, description: newDesc || undefined });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    } catch {
      // error toast handled by mutation
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this list? Contacts will not be deleted.')) return;
    deleteListMutation.mutate(id);
  }

  const getField = (l: ContactList, field: string): string | number | null => {
    switch (field) {
      case 'name': return l.name;
      case 'type': return l.is_smart ? 'Smart' : 'Regular';
      case 'contact_count': return l.contact_count;
      case 'created_at': return l.created_at;
      default: return null;
    }
  };

  const sorted = sortItems(lists as ContactList[], sort, getField);

  function renderCard(list: ContactList) {
    return (
      <div key={list.id} className="cursor-pointer rounded-xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow" onClick={() => navigate(`/lists/${list.id}`)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{list.name}</h3>
            {list.is_smart && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Smart</span>
            )}
          </div>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(list.id); }} className="text-xs text-red-500 hover:text-red-700">Delete</button>
        </div>
        {list.description && <p className="mt-1 text-sm text-gray-500">{list.description}</p>}
        {list.is_smart && list.filter_criteria && (
          <div className="mt-2 flex flex-wrap gap-1">
            {list.filter_criteria.state && list.filter_criteria.state.length > 0 && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {list.filter_criteria.state.join(', ')}
              </span>
            )}
            {list.filter_criteria.category && list.filter_criteria.category.length > 0 && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {list.filter_criteria.category.length} categories
              </span>
            )}
            {list.filter_criteria.management && list.filter_criteria.management.length > 0 && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {list.filter_criteria.management.length} management types
              </span>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-1 text-sm text-gray-600">
          <span className="font-medium">{list.contact_count?.toLocaleString()}</span> contacts
          {list.is_smart && <span className="text-xs text-purple-500">(dynamic)</span>}
        </div>
      </div>
    );
  }

  function renderRow(list: ContactList) {
    const project = projects.find((p) => p.id === (list as ListWithProject).project_id);
    return (
      <tr key={list.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/lists/${list.id}`)}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{list.name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5">
          {list.is_smart ? (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Smart</span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Regular</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-gray-500">{list.contact_count?.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-gray-500">
          {project ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${project.color || '#6366f1'}15`, color: project.color || '#6366f1' }}>
              {project.name}
            </span>
          ) : (
            <span className="text-gray-400">{'\u2014'}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-gray-500">
          {new Date(list.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleDelete(list.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Lists</h1>
        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="">All Projects</option>
              <option value="none">No Project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowCreateSmart(true)} className="rounded-lg border border-primary-300 px-4 py-2 text-sm text-primary-700 hover:bg-primary-50">
            Create Smart List
          </button>
          <button onClick={() => setShowCreate(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">Create List</button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="ml-auto">
          <ViewToggle mode={viewMode} onChange={handleViewChange} />
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          viewMode === 'grid' ? <GridCardSkeleton count={6} /> : <TableSkeleton rows={5} columns={6} />
        ) : isError ? (
          <div className="rounded-xl bg-red-50 p-6 text-center">
            <p className="text-red-700 font-medium">Failed to load lists</p>
            <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.length === 0 ? (
              <p className="text-gray-400">No lists yet. Create your first list to organize contacts.</p>
            ) : sorted.map(renderCard)}
          </div>
        ) : (
          <div className="rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableHeader label="Name" field="name" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="Type" field="type" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="Contacts" field="contact_count" currentSort={sort} onSort={handleSort} />
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Project</th>
                    <SortableHeader label="Created" field="created_at" currentSort={sort} onSort={handleSort} />
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No lists found</td></tr>
                  ) : sorted.map(renderRow)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Regular List Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Create List</h3>
            <div className="mt-4 space-y-3">
              <input type="text" placeholder="List name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              <textarea placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" rows={3} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!newName} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Smart List Modal */}
      {showCreateSmart && (
        <SmartListModal
          onClose={() => setShowCreateSmart(false)}
          onCreated={() => { setShowCreateSmart(false); }}
        />
      )}
    </div>
  );
}

function SmartListModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<SmartFilterCriteria>({
    state: [],
    district: [],
    block: [],
    category: [],
    management: [],
  });

  const { data: filters } = useContactFilters({
    state: criteria.state && criteria.state.length > 0 ? criteria.state.join(',') : undefined,
    district: criteria.district && criteria.district.length > 0 ? criteria.district.join(',') : undefined,
  });

  const createSmartListMutation = useCreateSmartList();

  function updateCriteria(field: keyof SmartFilterCriteria, value: string) {
    setCriteria((prev) => {
      const next = { ...prev };
      if (field === 'classes_min' || field === 'classes_max') {
        (next as Record<string, unknown>)[field] = value ? parseInt(value) : undefined;
      } else {
        (next as Record<string, string[]>)[field] = value ? [value] : [];
      }
      if (field === 'state') {
        next.district = [];
        next.block = [];
      }
      if (field === 'district') {
        next.block = [];
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      const cleanCriteria: SmartFilterCriteria = {};
      if (criteria.state && criteria.state.length > 0) cleanCriteria.state = criteria.state;
      if (criteria.district && criteria.district.length > 0) cleanCriteria.district = criteria.district;
      if (criteria.block && criteria.block.length > 0) cleanCriteria.block = criteria.block;
      if (criteria.category && criteria.category.length > 0) cleanCriteria.category = criteria.category;
      if (criteria.management && criteria.management.length > 0) cleanCriteria.management = criteria.management;
      if (criteria.classes_min != null) cleanCriteria.classes_min = criteria.classes_min;
      if (criteria.classes_max != null) cleanCriteria.classes_max = criteria.classes_max;

      await createSmartListMutation.mutateAsync({
        name,
        description: description || undefined,
        filterCriteria: cleanCriteria,
      });
      onCreated();
    } catch {
      // error toast handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">Create Smart List</h3>
        <p className="mt-1 text-sm text-gray-500">
          Smart lists automatically include contacts matching your filter criteria. They update dynamically as new contacts are imported.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input
              type="text"
              placeholder="e.g., Goa Private Schools"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <hr className="my-4" />
          <h4 className="text-sm font-semibold text-gray-700">Filter Criteria</h4>

          {filters && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500">State</label>
                <select
                  value={criteria.state?.[0] || ''}
                  onChange={(e) => updateCriteria('state', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">All States</option>
                  {filters.states.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">District</label>
                <select
                  value={criteria.district?.[0] || ''}
                  onChange={(e) => updateCriteria('district', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">All Districts</option>
                  {filters.districts.map((d: string) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Block</label>
                <select
                  value={criteria.block?.[0] || ''}
                  onChange={(e) => updateCriteria('block', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">All Blocks</option>
                  {filters.blocks.map((b: string) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Category</label>
                <select
                  value={criteria.category?.[0] || ''}
                  onChange={(e) => updateCriteria('category', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">All Categories</option>
                  {filters.categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Management</label>
                <select
                  value={criteria.management?.[0] || ''}
                  onChange={(e) => updateCriteria('management', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">All Management Types</option>
                  {filters.managements.map((m: string) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500">Classes Min</label>
                  <input
                    type="number"
                    placeholder="e.g., 1"
                    value={criteria.classes_min ?? ''}
                    onChange={(e) => updateCriteria('classes_min', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Classes Max</label>
                  <input
                    type="number"
                    placeholder="e.g., 12"
                    value={criteria.classes_max ?? ''}
                    onChange={(e) => updateCriteria('classes_max', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createSmartListMutation.isPending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {createSmartListMutation.isPending ? 'Creating...' : 'Create Smart List'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Lists() {
  return (
    <ErrorBoundary>
      <ListsContent />
    </ErrorBoundary>
  );
}
