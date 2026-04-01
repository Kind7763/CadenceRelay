import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Automation } from '../api/automations.api';
import {
  useAutomationsList,
  useDeleteAutomation,
  useActivateAutomation,
  usePauseAutomation,
} from '../hooks/useAutomations';
import { GridCardSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  archived: 'bg-gray-100 text-gray-500',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function triggerLabel(triggerType: string, triggerConfig: Record<string, unknown>): string {
  switch (triggerType) {
    case 'manual':
      return 'Manual enrollment';
    case 'contact_added':
      return 'When contact is added';
    case 'list_join':
      return `When contact joins ${(triggerConfig?.listName as string) || 'a list'}`;
    case 'email_opened':
      return 'When email is opened';
    case 'link_clicked':
      return 'When link is clicked';
    default:
      return triggerType;
  }
}

function ActionsDropdown({
  automation,
  onActivate,
  onPause,
  onEdit,
  onDelete,
}: {
  automation: Automation;
  onActivate: () => void;
  onPause: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          {automation.status === 'draft' || automation.status === 'paused' ? (
            <button
              onClick={(e) => { e.stopPropagation(); onActivate(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Activate
            </button>
          ) : automation.status === 'active' ? (
            <button
              onClick={(e) => { e.stopPropagation(); onPause(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Pause
            </button>
          ) : null}
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

function AutomationsContent() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading, isError } = useAutomationsList({
    page,
    status: statusFilter || undefined,
  });

  const deleteMutation = useDeleteAutomation();
  const activateMutation = useActivateAutomation();
  const pauseMutation = usePauseAutomation();

  const automations: Automation[] = data?.data || [];
  const total = data?.pagination?.total || 0;
  const totalPages = Math.ceil(total / 20);

  useEffect(() => { setPage(1); }, [statusFilter]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
        <button
          onClick={() => navigate('/automations/new')}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
        >
          New Automation
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="mt-4">
          <GridCardSkeleton count={6} />
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-xl bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">Failed to load automations</p>
          <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
        </div>
      ) : automations.length === 0 ? (
        <div className="mt-8 rounded-xl bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No automations yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Create your first drip sequence to automatically engage contacts.
          </p>
          <button
            onClick={() => navigate('/automations/new')}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            Create Automation
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {automations.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/automations/${a.id}`)}
                className="cursor-pointer rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[a.status] || ''}`}>
                    {a.status}
                  </span>
                  <ActionsDropdown
                    automation={a}
                    onEdit={() => navigate(`/automations/${a.id}/edit`)}
                    onActivate={() => activateMutation.mutate(a.id)}
                    onPause={() => pauseMutation.mutate(a.id)}
                    onDelete={() => {
                      if (window.confirm('Are you sure you want to delete this automation?')) {
                        deleteMutation.mutate(a.id);
                      }
                    }}
                  />
                </div>
                <h3 className="mt-2 text-base font-semibold text-gray-900">{a.name}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {triggerLabel(a.trigger_type, a.trigger_config)}
                </p>
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                  <span>{a.step_count ?? 0} steps</span>
                  <span className="text-gray-200">|</span>
                  <span>{a.total_enrolled} enrolled</span>
                  <span className="text-gray-200">|</span>
                  <span>{a.total_completed} completed</span>
                </div>
                <p className="mt-2 text-xs text-gray-400">Created {formatDate(a.created_at)}</p>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>{total} automations total</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Prev</button>
                <span className="px-3 py-1">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Automations() {
  return (
    <ErrorBoundary>
      <AutomationsContent />
    </ErrorBoundary>
  );
}
