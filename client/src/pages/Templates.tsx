import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template } from '../api/templates.api';
import { useTemplatesList, useDeleteTemplate } from '../hooks/useTemplates';
import { useProjectsList, useMoveItems } from '../hooks/useProjects';
import { GridCardSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';

function TemplatesContent() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState('');
  const { data: projectsData = [] } = useProjectsList();
  const { data: templates = [], isLoading, isError } = useTemplatesList(
    projectFilter ? { project_id: projectFilter } : undefined
  );
  const deleteTemplateMutation = useDeleteTemplate();
  const moveMutation = useMoveItems();

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    deleteTemplateMutation.mutate(id);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <button onClick={() => navigate('/templates/new')} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Template
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
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
      </div>

      <div className="mt-4">
        {isLoading ? (
          <GridCardSkeleton count={6} />
        ) : isError ? (
          <div className="rounded-xl bg-red-50 p-6 text-center">
            <p className="text-red-700 font-medium">Failed to load templates</p>
            <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.length === 0 ? (
              <p className="text-gray-400">No templates yet. Create your first email template.</p>
            ) : templates.map((t: Template) => (
              <div key={t.id} className="cursor-pointer rounded-xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow" onClick={() => navigate(`/templates/${t.id}/edit`)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 truncate flex-1">{t.name}</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {projectsData.length > 0 && (
                      <select
                        defaultValue=""
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (e.target.value) {
                            moveMutation.mutate({ projectId: e.target.value, items: { templateIds: [t.id] } });
                            e.target.value = '';
                          }
                        }}
                        className="rounded border px-1.5 py-0.5 text-xs text-gray-500"
                      >
                        <option value="" disabled>Move to...</option>
                        {projectsData.map((p) => <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>)}
                      </select>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500 truncate">{t.subject}</p>
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
            ))}
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
