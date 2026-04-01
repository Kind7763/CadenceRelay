import { useState, useEffect } from 'react';
import { listCampaigns, Campaign } from '../../api/campaigns.api';
import { listTemplates, Template } from '../../api/templates.api';
import { listLists, ContactList } from '../../api/lists.api';
import { moveItemsToProject } from '../../api/projects.api';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

type TabType = 'campaigns' | 'templates' | 'lists';

interface AddExistingModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  initialTab?: TabType;
}

interface UnassignedItem {
  id: string;
  name: string;
  detail: string;
  date: string;
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'templates', label: 'Templates' },
  { key: 'lists', label: 'Lists' },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AddExistingModal({
  projectId,
  projectName,
  onClose,
  initialTab = 'campaigns',
}: AddExistingModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [items, setItems] = useState<UnassignedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchItems() {
      setLoading(true);
      setSelected(new Set());
      try {
        let mapped: UnassignedItem[] = [];

        if (activeTab === 'campaigns') {
          const result = await listCampaigns({ project_id: 'none' });
          // listCampaigns returns { data: [...], pagination: {...} }
          const campaigns: Campaign[] = result.data ?? result;
          mapped = campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            detail: c.status,
            date: formatDate(c.created_at),
          }));
        } else if (activeTab === 'templates') {
          const templates: Template[] = await listTemplates({ project_id: 'none' });
          mapped = templates.map((t) => ({
            id: t.id,
            name: t.name,
            detail: `v${t.version}`,
            date: formatDate(t.created_at),
          }));
        } else {
          const lists: ContactList[] = await listLists({ project_id: 'none' });
          mapped = lists.map((l) => ({
            id: l.id,
            name: l.name,
            detail: `${l.contact_count} contacts`,
            date: formatDate(l.created_at),
          }));
        }

        if (!cancelled) setItems(mapped);
      } catch {
        if (!cancelled) {
          toast.error(`Failed to load ${activeTab}`);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchItems();
    return () => { cancelled = true; };
  }, [activeTab]);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSubmitting(true);

    const ids = Array.from(selected);
    const payload: { campaignIds?: string[]; templateIds?: string[]; listIds?: string[] } = {};
    if (activeTab === 'campaigns') payload.campaignIds = ids;
    else if (activeTab === 'templates') payload.templateIds = ids;
    else payload.listIds = ids;

    try {
      await moveItemsToProject(projectId, payload);
      toast.success(`Added ${selected.size} ${activeTab} to ${projectName}`);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      onClose();
    } catch {
      toast.error('Failed to add items to project');
    } finally {
      setSubmitting(false);
    }
  }

  const emptyMessage = `All ${activeTab} are already assigned to projects`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Add to {projectName}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`mr-4 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span className="ml-3 text-sm text-gray-500">Loading...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              {emptyMessage}
            </div>
          ) : (
            <>
              {/* Select All */}
              <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.size === items.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({items.length})
                </span>
              </label>

              {/* Scrollable list */}
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {items.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {item.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.detail} &middot; {item.date}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0 || submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? 'Adding...'
              : selected.size > 0
                ? `Add ${selected.size} item${selected.size !== 1 ? 's' : ''} to project`
                : 'Add to project'}
          </button>
        </div>
      </div>
    </div>
  );
}
