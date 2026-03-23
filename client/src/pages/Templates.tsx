import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listTemplates, deleteTemplate, Template } from '../api/templates.api';

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function fetchTemplates() {
    try {
      const data = await listTemplates();
      setTemplates(data);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTemplates(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteTemplate(id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch {
      toast.error('Failed to delete');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <button onClick={() => navigate('/templates/new')} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          New Template
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : templates.length === 0 ? (
          <p className="text-gray-400">No templates yet. Create your first email template.</p>
        ) : templates.map((t) => (
          <div key={t.id} className="cursor-pointer rounded-xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow" onClick={() => navigate(`/templates/${t.id}/edit`)}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{t.name}</h3>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-xs text-red-500 hover:text-red-700">Delete</button>
            </div>
            <p className="mt-1 text-sm text-gray-500 truncate">{t.subject}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
              <span>v{t.version}</span>
              <span>{new Date(t.updated_at).toLocaleDateString()}</span>
            </div>
            {t.variables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.variables.map((v) => (
                  <span key={v} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">{`{{${v}}}`}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
