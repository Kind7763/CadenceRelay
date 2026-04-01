import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template } from '../api/templates.api';
import { useTemplatesList, useDeleteTemplate } from '../hooks/useTemplates';
import { useProjectsList, useMoveItems } from '../hooks/useProjects';
import { Project } from '../api/projects.api';
import { GridCardSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';

function TemplateCardMenu({ templateId, projects, onDelete }: {
  templateId: string;
  projects: Project[];
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const moveMutation = useMoveItems();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
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

function TemplatesContent() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState('');
  const { data: projectsData = [] } = useProjectsList();
  const { data: templates = [], isLoading, isError } = useTemplatesList(
    projectFilter ? { project_id: projectFilter } : undefined
  );
  const deleteTemplateMutation = useDeleteTemplate();

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
            ) : templates.map((t: Template & { project_id?: string }) => {
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
                    <TemplateCardMenu templateId={t.id} projects={projectsData} onDelete={() => handleDelete(t.id)} />
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
            })}
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
