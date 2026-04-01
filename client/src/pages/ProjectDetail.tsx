import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject, useUpdateProject, useMoveItems } from '../hooks/useProjects';
import { useProjectsList } from '../hooks/useProjects';
import { listCampaigns, Campaign } from '../api/campaigns.api';
import { listTemplates as fetchTemplates, Template } from '../api/templates.api';
import { listLists as fetchLists, ContactList } from '../api/lists.api';
import ErrorBoundary from '../components/ErrorBoundary';

const COLOR_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

type Tab = 'campaigns' | 'templates' | 'lists' | 'analytics';

function ProjectDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError } = useProject(id);
  const updateMutation = useUpdateProject();
  const moveMutation = useMoveItems();
  const { data: allProjects = [] } = useProjectsList();

  const [tab, setTab] = useState<Tab>('campaigns');
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');
  const [editingColor, setEditingColor] = useState(false);

  // Data for tabs
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);

  // Move to project state
  const [moveTarget] = useState<string>('');

  useEffect(() => {
    if (project) {
      setNameVal(project.name);
      setDescVal(project.description || '');
    }
  }, [project]);

  useEffect(() => {
    if (!id) return;
    setLoadingTab(true);
    if (tab === 'campaigns') {
      listCampaigns({ project_id: id }).then((res) => {
        setCampaigns(res.data || []);
      }).catch(() => {}).finally(() => setLoadingTab(false));
    } else if (tab === 'templates') {
      fetchTemplates({ project_id: id }).then((data) => {
        setTemplates(data);
      }).catch(() => {}).finally(() => setLoadingTab(false));
    } else if (tab === 'lists') {
      fetchLists({ project_id: id }).then((data) => {
        setLists(data);
      }).catch(() => {}).finally(() => setLoadingTab(false));
    } else {
      setLoadingTab(false);
    }
  }, [id, tab]);

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

  if (isLoading) {
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
          <button onClick={() => navigate('/projects')} className="mt-2 text-sm text-primary-600 hover:underline">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const totalSent = Number(project.total_sent) || 0;
  const totalOpens = Number(project.total_opens) || 0;
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '0.0';

  const tabClasses = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`;

  // Filter other projects for move-to dropdown
  const otherProjects = allProjects.filter((p) => p.id !== id);

  return (
    <div className="p-6">
      {/* Header */}
      <button
        onClick={() => navigate('/projects')}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Projects
      </button>

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
                  className={`h-7 w-7 rounded-full ${project.color === c ? 'ring-2 ring-gray-400 ring-offset-1' : ''}`}
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
                  if (e.key === 'Escape') { setNameVal(project.name); setEditingName(false); }
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
          <p className="text-lg font-semibold">{project.campaign_count}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Templates</p>
          <p className="text-lg font-semibold">{project.template_count}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Lists</p>
          <p className="text-lg font-semibold">{project.list_count}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Total Sent</p>
          <p className="text-lg font-semibold">{totalSent.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">Open Rate</p>
          <p className="text-lg font-semibold">{openRate}%</p>
        </div>
      </div>

      {/* Tabs + Create buttons */}
      <div className="mt-6 flex items-center justify-between">
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
        <div>
          {tab === 'campaigns' && (
            <button onClick={() => navigate(`/campaigns/new?project=${id}`)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700">
              New Campaign
            </button>
          )}
          {tab === 'templates' && (
            <button onClick={() => navigate('/templates/new/edit')} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700">
              New Template
            </button>
          )}
          {tab === 'lists' && (
            <button onClick={() => navigate('/lists')} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700">
              Manage Lists
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {loadingTab ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          </div>
        ) : (
          <>
            {tab === 'campaigns' && (
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Sent</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Opens</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Move to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {campaigns.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center">
                          <p className="text-gray-400">No campaigns in this project</p>
                          <button onClick={() => navigate(`/campaigns/new?project=${id}`)} className="mt-2 text-sm text-primary-600 hover:text-primary-800">
                            Create your first campaign
                          </button>
                        </td>
                      </tr>
                    ) : (
                      campaigns.map((c) => (
                        <tr key={c.id} className="cursor-pointer hover:bg-gray-50">
                          <td
                            className="px-4 py-3 font-medium"
                            onClick={() => navigate(`/campaigns/${c.id}`)}
                          >
                            {c.name}
                          </td>
                          <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
                            {c.sent_count}
                          </td>
                          <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
                            {c.open_count}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={moveTarget}
                              onChange={(e) => {
                                const targetId = e.target.value;
                                if (targetId) {
                                  moveMutation.mutate({
                                    projectId: targetId,
                                    items: { campaignIds: [c.id] },
                                  });
                                  e.target.value = '';
                                }
                              }}
                              className="rounded border px-2 py-1 text-xs"
                            >
                              <option value="">Move to...</option>
                              {otherProjects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'templates' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.length === 0 ? (
                  <p className="text-gray-400">No templates in this project</p>
                ) : (
                  templates.map((t) => (
                    <div
                      key={t.id}
                      className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                      onClick={() => navigate(`/templates/${t.id}/edit`)}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{t.name}</h3>
                        <select
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const targetId = e.target.value;
                            if (targetId) {
                              moveMutation.mutate({
                                projectId: targetId,
                                items: { templateIds: [t.id] },
                              });
                              e.target.value = '';
                            }
                          }}
                          className="rounded border px-2 py-1 text-xs"
                          defaultValue=""
                        >
                          <option value="">Move to...</option>
                          {otherProjects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-500">{t.subject}</p>
                      <div className="mt-3 text-xs text-gray-400">v{t.version}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'lists' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lists.length === 0 ? (
                  <p className="text-gray-400">No lists in this project</p>
                ) : (
                  lists.map((l) => (
                    <div
                      key={l.id}
                      className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                      onClick={() => navigate(`/lists/${l.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{l.name}</h3>
                        <select
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const targetId = e.target.value;
                            if (targetId) {
                              moveMutation.mutate({
                                projectId: targetId,
                                items: { listIds: [l.id] },
                              });
                              e.target.value = '';
                            }
                          }}
                          className="rounded border px-2 py-1 text-xs"
                          defaultValue=""
                        >
                          <option value="">Move to...</option>
                          {otherProjects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {l.description && (
                        <p className="mt-1 text-sm text-gray-500">{l.description}</p>
                      )}
                      <div className="mt-3 text-sm text-gray-600">
                        <span className="font-medium">{l.contact_count?.toLocaleString()}</span>{' '}
                        contacts
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'analytics' && (
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">Project Analytics</h3>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Campaigns</p>
                    <p className="mt-1 text-2xl font-bold">{project.campaign_count}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Emails Sent</p>
                    <p className="mt-1 text-2xl font-bold">{totalSent.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Total Opens</p>
                    <p className="mt-1 text-2xl font-bold">{totalOpens.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Open Rate</p>
                    <p className="mt-1 text-2xl font-bold">{openRate}%</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Templates</p>
                    <p className="mt-1 text-2xl font-bold">{project.template_count}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Contact Lists</p>
                    <p className="mt-1 text-2xl font-bold">{project.list_count}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Avg Opens / Campaign</p>
                    <p className="mt-1 text-2xl font-bold">
                      {project.campaign_count > 0
                        ? Math.round(totalOpens / project.campaign_count)
                        : 0}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
