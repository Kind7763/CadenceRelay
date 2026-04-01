import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../api/projects.api';
import {
  useProjectsList,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useToggleArchiveProject,
} from '../hooks/useProjects';
import { GridCardSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import ItemCardMenu from '../components/ui/ItemCardMenu';

const COLOR_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
];

function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('');
  const createMutation = useCreateProject();

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await createMutation.mutateAsync({
        name,
        description: description || undefined,
        color,
        icon: icon || undefined,
      });
      onCreated();
    } catch {
      // error toast handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900">Create Project</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input
              type="text"
              placeholder="e.g., March Campaign"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Color</label>
            <div className="mt-1 flex gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Icon (emoji)</label>
            <input
              type="text"
              placeholder="e.g., \uD83D\uDCE7"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              className="mt-1 w-20 rounded-lg border px-3 py-2 text-sm text-center"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createMutation.isPending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectsContent() {
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const navigate = useNavigate();

  const { data: projects = [], isLoading, isError } = useProjectsList({
    archived: showArchived ? 'true' : undefined,
  });
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const archiveMutation = useToggleArchiveProject();

  function startEdit(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
  }

  function saveEdit(id: string) {
    if (editName.trim()) {
      updateMutation.mutate({ id, data: { name: editName } });
    }
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this project? Items will be unlinked but not deleted.')) return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
        >
          Create Project
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Show archived
        </label>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <GridCardSkeleton count={6} />
        ) : isError ? (
          <div className="rounded-xl bg-red-50 p-6 text-center">
            <p className="font-medium text-red-700">Failed to load projects</p>
            <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.length === 0 ? (
              <p className="text-gray-400">
                {showArchived ? 'No archived projects.' : 'No projects yet. Create your first project to organize campaigns.'}
              </p>
            ) : (
              projects.map((p: Project) => {
                const totalSent = Number(p.total_sent) || 0;
                const totalOpens = Number(p.total_opens) || 0;
                const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '0.0';

                return (
                  <div
                    key={p.id}
                    className={`cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                      p.is_archived ? 'opacity-60' : ''
                    }`}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.icon && <span className="text-lg">{p.icon}</span>}
                        {editingId === p.id ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => saveEdit(p.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(p.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border px-2 py-0.5 text-sm font-semibold"
                            autoFocus
                          />
                        ) : (
                          <h3 className="font-semibold text-gray-900">{p.name}</h3>
                        )}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <ItemCardMenu
                          sections={[
                            {
                              items: [
                                {
                                  label: 'Edit',
                                  onClick: () => startEdit(p),
                                },
                                {
                                  label: p.is_archived ? 'Unarchive' : 'Archive',
                                  onClick: () => archiveMutation.mutate(p.id),
                                },
                              ],
                            },
                            {
                              items: [
                                {
                                  label: 'Delete',
                                  variant: 'danger',
                                  onClick: () => handleDelete(p.id),
                                },
                              ],
                            },
                          ]}
                        />
                      </div>
                    </div>
                    {p.description && (
                      <p className="mt-1 truncate text-sm text-gray-500">{p.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>{p.campaign_count} campaigns</span>
                      <span>{p.template_count} templates</span>
                      <span>{p.list_count} lists</span>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-gray-400">
                      <span>{totalSent.toLocaleString()} sent</span>
                      <span>{openRate}% open rate</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

export default function Projects() {
  return (
    <ErrorBoundary>
      <ProjectsContent />
    </ErrorBoundary>
  );
}
