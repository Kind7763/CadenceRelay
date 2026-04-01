import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useProject, useUpdateProject, useUnlinkItems } from '../hooks/useProjects';
import { listCampaigns, Campaign } from '../api/campaigns.api';
import { listTemplates, Template } from '../api/templates.api';
import { listLists, ContactList } from '../api/lists.api';
import { useDuplicateCampaign, useDeleteCampaign } from '../hooks/useCampaigns';
import { useDeleteTemplate } from '../hooks/useTemplates';
import { useDeleteList } from '../hooks/useLists';
import ItemCardMenu from '../components/ui/ItemCardMenu';
import AddExistingModal from '../components/projects/AddExistingModal';
import ErrorBoundary from '../components/ErrorBoundary';

const COLOR_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

type Tab = 'campaigns' | 'templates' | 'lists' | 'analytics';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNumber(n: number | undefined): string {
  return (n || 0).toLocaleString();
}

function ProjectDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading, isError } = useProject(id);
  const updateMutation = useUpdateProject();
  const unlinkMutation = useUnlinkItems();
  const duplicateCampaignMutation = useDuplicateCampaign();
  const deleteCampaignMutation = useDeleteCampaign();
  const deleteTemplateMutation = useDeleteTemplate();
  const deleteListMutation = useDeleteList();

  const [tab, setTab] = useState<Tab>('campaigns');
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');
  const [editingColor, setEditingColor] = useState(false);

  // All data loaded upfront
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Existing modal
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [addExistingTab, setAddExistingTab] = useState<'campaigns' | 'templates' | 'lists'>('campaigns');

  // Admin password modal for campaign delete
  const [deleteModalCampaignId, setDeleteModalCampaignId] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');

  // Load all data upfront
  const loadAllData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      listCampaigns({ project_id: id, limit: '100' }).then((r) => r.data || []),
      listTemplates({ project_id: id }),
      listLists({ project_id: id }),
    ])
      .then(([c, t, l]) => {
        setCampaigns(c);
        setTemplates(t);
        setLists(l);
      })
      .catch(() => {
        toast.error('Failed to load project items');
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (project) {
      setNameVal(project.name);
      setDescVal(project.description || '');
    }
  }, [project]);

  function saveName() {
    if (id && nameVal.trim()) {
      updateMutation.mutate({ id, data: { name: nameVal } });
    }
    setEditingName(false);
  }

  function saveDesc() {
    if (id) {
      updateMutation.mutate({ id, data: { description: descVal } });
    }
    setEditingDesc(false);
  }

  function saveColor(color: string) {
    if (id) {
      updateMutation.mutate({ id, data: { color } });
    }
    setEditingColor(false);
  }

  function handleUnlink(type: 'campaign' | 'template' | 'list', itemId: string) {
    if (!id) return;
    const items: { campaignIds?: string[]; templateIds?: string[]; listIds?: string[] } = {};
    if (type === 'campaign') items.campaignIds = [itemId];
    else if (type === 'template') items.templateIds = [itemId];
    else items.listIds = [itemId];

    unlinkMutation.mutate(
      { projectId: id, items },
      {
        onSuccess: () => {
          if (type === 'campaign') setCampaigns((prev) => prev.filter((c) => c.id !== itemId));
          else if (type === 'template') setTemplates((prev) => prev.filter((t) => t.id !== itemId));
          else setLists((prev) => prev.filter((l) => l.id !== itemId));
        },
      },
    );
  }

  function handleDeleteCampaign() {
    if (!deleteModalCampaignId || !adminPassword) return;
    deleteCampaignMutation.mutate(
      { id: deleteModalCampaignId, adminPassword },
      {
        onSuccess: () => {
          setCampaigns((prev) => prev.filter((c) => c.id !== deleteModalCampaignId));
          setDeleteModalCampaignId(null);
          setAdminPassword('');
        },
        onError: () => {
          setAdminPassword('');
        },
      },
    );
  }

  function handleDeleteTemplate(templateId: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    deleteTemplateMutation.mutate(templateId, {
      onSuccess: () => setTemplates((prev) => prev.filter((t) => t.id !== templateId)),
    });
  }

  function handleDeleteList(listId: string) {
    if (!confirm('Delete this list? This cannot be undone.')) return;
    deleteListMutation.mutate(listId, {
      onSuccess: () => setLists((prev) => prev.filter((l) => l.id !== listId)),
    });
  }

  function openAddExisting(initialTab: 'campaigns' | 'templates' | 'lists') {
    setAddExistingTab(initialTab);
    setShowAddExisting(true);
  }

  // Stats computed from loaded data
  const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + (c.open_count || 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.click_count || 0), 0);
  const totalBounces = campaigns.reduce((sum, c) => sum + (c.bounce_count || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '0.0';

  if (projectLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">Project not found</p>
          <button
            onClick={() => navigate('/projects')}
            className="mt-2 text-sm text-primary-600 hover:underline"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const tabClasses = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? 'bg-primary-100 text-primary-700'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`;

  const contextualTab = tab === 'campaigns' || tab === 'templates' || tab === 'lists' ? tab : 'campaigns';

  return (
    <div className="p-6">
      {/* Back link */}
      <button
        onClick={() => navigate('/projects')}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Projects
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative">
          <button
            onClick={() => setEditingColor(!editingColor)}
            className="h-10 w-10 rounded-full transition-transform hover:scale-110"
            style={{ backgroundColor: project.color }}
            title="Change color"
          />
          {editingColor && (
            <div className="absolute left-0 top-12 z-10 flex gap-1 rounded-lg border bg-white p-2 shadow-lg">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => saveColor(c)}
                  className={`h-7 w-7 rounded-full ${
                    project.color === c ? 'ring-2 ring-gray-400 ring-offset-1' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {project.icon && <span className="text-2xl">{project.icon}</span>}
            {editingName ? (
              <input
                type="text"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') {
                    setNameVal(project.name);
                    setEditingName(false);
                  }
                }}
                className="rounded border px-2 py-1 text-2xl font-bold"
                autoFocus
              />
            ) : (
              <h1
                className="cursor-pointer text-2xl font-bold text-gray-900 hover:text-primary-600"
                onClick={() => setEditingName(true)}
                title="Click to edit"
              >
                {project.name}
              </h1>
            )}
          </div>
          {editingDesc ? (
            <textarea
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDescVal(project.description || '');
                  setEditingDesc(false);
                }
              }}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              rows={2}
              autoFocus
            />
          ) : (
            <p
              className="mt-1 cursor-pointer text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setEditingDesc(true)}
              title="Click to edit"
            >
              {project.description || 'Add a description...'}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Campaigns</p>
          <p className="text-lg font-semibold">{campaigns.length}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Templates</p>
          <p className="text-lg font-semibold">{templates.length}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Lists</p>
          <p className="text-lg font-semibold">{lists.length}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Total Sent</p>
          <p className="text-lg font-semibold">{formatNumber(totalSent)}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Open Rate</p>
          <p className="text-lg font-semibold">{openRate}%</p>
        </div>
      </div>

      {/* Tabs + Action buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button className={tabClasses('campaigns')} onClick={() => setTab('campaigns')}>
            Campaigns ({campaigns.length})
          </button>
          <button className={tabClasses('templates')} onClick={() => setTab('templates')}>
            Templates ({templates.length})
          </button>
          <button className={tabClasses('lists')} onClick={() => setTab('lists')}>
            Lists ({lists.length})
          </button>
          <button className={tabClasses('analytics')} onClick={() => setTab('analytics')}>
            Analytics
          </button>
        </div>
        {tab !== 'analytics' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAddExisting(contextualTab)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Add Existing
            </button>
            {tab === 'campaigns' && (
              <button
                onClick={() => navigate(`/campaigns/new?project=${id}`)}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700"
              >
                New Campaign
              </button>
            )}
            {tab === 'templates' && (
              <button
                onClick={() => navigate(`/templates/new/edit?project=${id}`)}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700"
              >
                New Template
              </button>
            )}
            {tab === 'lists' && (
              <button
                onClick={() => navigate('/lists')}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700"
              >
                Manage Lists
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          </div>
        ) : (
          <>
            {/* ── Campaigns Tab ── */}
            {tab === 'campaigns' && (
              <>
                {campaigns.length === 0 ? (
                  <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                    <p className="text-gray-400">No campaigns in this project yet</p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => navigate(`/campaigns/new?project=${id}`)}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
                      >
                        Create New Campaign
                      </button>
                      <button
                        onClick={() => openAddExisting('campaigns')}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Add Existing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {campaigns.map((c) => {
                      const sent = c.sent_count || 0;
                      const opens = c.open_count || 0;
                      const clicks = c.click_count || 0;
                      const cOpenRate = sent > 0 ? Math.round((opens / sent) * 100) : 0;
                      const cClickRate = sent > 0 ? Math.round((clicks / sent) * 100) : 0;
                      const statusClass = STATUS_COLORS[c.status] || STATUS_COLORS.draft;

                      return (
                        <div
                          key={c.id}
                          className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                          onClick={() => navigate(`/campaigns/${c.id}`)}
                        >
                          <div className="flex items-start justify-between">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                            >
                              {c.status}
                            </span>
                            <div onClick={(e) => e.stopPropagation()}>
                              <ItemCardMenu
                                sections={[
                                  {
                                    items: [
                                      {
                                        label: 'Edit',
                                        onClick: () => navigate(`/campaigns/${c.id}`),
                                      },
                                      {
                                        label: 'Duplicate',
                                        onClick: () => duplicateCampaignMutation.mutate(c.id),
                                      },
                                      {
                                        label: 'Remove from Project',
                                        onClick: () => handleUnlink('campaign', c.id),
                                      },
                                    ],
                                  },
                                  {
                                    items: [
                                      {
                                        label: 'Delete',
                                        variant: 'danger',
                                        onClick: () => setDeleteModalCampaignId(c.id),
                                      },
                                    ],
                                  },
                                ]}
                              />
                            </div>
                          </div>
                          <h3 className="mt-2 font-semibold text-gray-900 truncate">{c.name}</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {formatNumber(sent)} sent
                            {sent > 0 && (
                              <>
                                {' '}&middot; {cOpenRate}% opens &middot; {cClickRate}% clicks
                              </>
                            )}
                          </p>
                          <p className="mt-2 text-xs text-gray-400">
                            {formatDate(c.created_at)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── Templates Tab ── */}
            {tab === 'templates' && (
              <>
                {templates.length === 0 ? (
                  <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                    <p className="text-gray-400">No templates in this project yet</p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => navigate(`/templates/new/edit?project=${id}`)}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
                      >
                        Create New Template
                      </button>
                      <button
                        onClick={() => openAddExisting('templates')}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Add Existing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                        onClick={() => navigate(`/templates/${t.id}/edit`)}
                      >
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">
                            {t.name}
                          </h3>
                          <div onClick={(e) => e.stopPropagation()}>
                            <ItemCardMenu
                              sections={[
                                {
                                  items: [
                                    {
                                      label: 'Edit',
                                      onClick: () => navigate(`/templates/${t.id}/edit`),
                                    },
                                    {
                                      label: 'Remove from Project',
                                      onClick: () => handleUnlink('template', t.id),
                                    },
                                  ],
                                },
                                {
                                  items: [
                                    {
                                      label: 'Delete',
                                      variant: 'danger',
                                      onClick: () => handleDeleteTemplate(t.id),
                                    },
                                  ],
                                },
                              ]}
                            />
                          </div>
                        </div>
                        <p className="mt-1 truncate text-sm text-gray-500">
                          {t.subject || 'No subject'}
                        </p>
                        <p className="mt-2 text-xs text-gray-400">
                          v{t.version} &middot; {formatDate(t.created_at)}
                        </p>
                        {t.variables && t.variables.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.variables.slice(0, 4).map((v) => (
                              <span
                                key={v}
                                className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-500"
                              >
                                {`{{${v}}}`}
                              </span>
                            ))}
                            {t.variables.length > 4 && (
                              <span className="text-[10px] text-gray-400">
                                +{t.variables.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Lists Tab ── */}
            {tab === 'lists' && (
              <>
                {lists.length === 0 ? (
                  <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                    <p className="text-gray-400">No lists in this project yet</p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => navigate('/lists')}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
                      >
                        Create New List
                      </button>
                      <button
                        onClick={() => openAddExisting('lists')}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Add Existing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {lists.map((l) => (
                      <div
                        key={l.id}
                        className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                        onClick={() => navigate(`/lists/${l.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">
                            {l.name}
                          </h3>
                          <div onClick={(e) => e.stopPropagation()}>
                            <ItemCardMenu
                              sections={[
                                {
                                  items: [
                                    {
                                      label: 'View',
                                      onClick: () => navigate(`/lists/${l.id}`),
                                    },
                                    {
                                      label: 'Remove from Project',
                                      onClick: () => handleUnlink('list', l.id),
                                    },
                                  ],
                                },
                                {
                                  items: [
                                    {
                                      label: 'Delete',
                                      variant: 'danger',
                                      onClick: () => handleDeleteList(l.id),
                                    },
                                  ],
                                },
                              ]}
                            />
                          </div>
                        </div>
                        {l.description && (
                          <p className="mt-1 truncate text-sm text-gray-500">{l.description}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">
                            {(l.contact_count || 0).toLocaleString()}
                          </span>{' '}
                          contacts
                          {l.is_smart && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                              Smart
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Analytics Tab ── */}
            {tab === 'analytics' && (
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">Project Analytics</h3>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Sent</p>
                    <p className="mt-1 text-2xl font-bold">{formatNumber(totalSent)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Opens</p>
                    <p className="mt-1 text-2xl font-bold">{formatNumber(totalOpens)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Clicks</p>
                    <p className="mt-1 text-2xl font-bold">{formatNumber(totalClicks)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Bounce Rate</p>
                    <p className="mt-1 text-2xl font-bold">
                      {totalSent > 0 ? ((totalBounces / totalSent) * 100).toFixed(1) : '0.0'}%
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Open Rate</p>
                    <p className="mt-1 text-2xl font-bold">{openRate}%</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Click Rate</p>
                    <p className="mt-1 text-2xl font-bold">
                      {totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : '0.0'}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Avg Opens / Campaign</p>
                    <p className="mt-1 text-2xl font-bold">
                      {campaigns.length > 0 ? Math.round(totalOpens / campaigns.length) : 0}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Existing Modal */}
      {showAddExisting && id && (
        <AddExistingModal
          projectId={id}
          projectName={project.name}
          onClose={() => {
            setShowAddExisting(false);
            loadAllData();
          }}
          initialTab={addExistingTab}
        />
      )}

      {/* Admin Password Modal for Campaign Delete */}
      {deleteModalCampaignId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setDeleteModalCampaignId(null);
            setAdminPassword('');
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">Delete Campaign</h3>
            <p className="mt-2 text-sm text-gray-500">
              Enter admin password to confirm deletion. This cannot be undone.
            </p>
            <input
              type="password"
              placeholder="Admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDeleteCampaign();
              }}
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
              autoComplete="off"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteModalCampaignId(null);
                  setAdminPassword('');
                }}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCampaign}
                disabled={!adminPassword || deleteCampaignMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteCampaignMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  return (
    <ErrorBoundary>
      <ProjectDetailContent />
    </ErrorBoundary>
  );
}
