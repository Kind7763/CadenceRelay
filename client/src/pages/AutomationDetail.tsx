import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAutomation,
  useActivateAutomation,
  usePauseAutomation,
  useEnrollContacts,
  useEnrollments,
} from '../hooks/useAutomations';
import { listLists, ContactList } from '../api/lists.api';
import { FormSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { useEffect } from 'react';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  archived: 'bg-gray-100 text-gray-500',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDelay(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : 'Immediately';
}

function triggerLabel(triggerType: string, triggerConfig: Record<string, unknown>): string {
  switch (triggerType) {
    case 'manual':
      return 'Manual enrollment';
    case 'contact_added':
      return 'When contact is added';
    case 'list_join':
      return `When contact joins "${(triggerConfig?.listName as string) || 'a list'}"`;
    case 'email_opened':
      return 'When email is opened';
    case 'link_clicked':
      return 'When link is clicked';
    default:
      return triggerType;
  }
}

const enrollmentStatusColors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
};

type DetailTab = 'steps' | 'enrollments';

function EnrollModal({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const [mode, setMode] = useState<'list' | 'emails'>('list');
  const [listId, setListId] = useState('');
  const [emailText, setEmailText] = useState('');
  const [lists, setLists] = useState<ContactList[]>([]);
  const enrollMutation = useEnrollContacts();

  useEffect(() => {
    listLists().then(setLists).catch(() => {});
  }, []);

  function handleEnroll() {
    if (mode === 'list' && listId) {
      enrollMutation.mutate({ id: automationId, data: { listId } }, { onSuccess: () => onClose() });
    } else if (mode === 'emails' && emailText.trim()) {
      // Parse emails - in real implementation this would search contacts by email
      // For now we pass the text as contactIds (backend can handle lookup)
      const emails = emailText.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean);
      enrollMutation.mutate({ id: automationId, data: { contactIds: emails } }, { onSuccess: () => onClose() });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900">Enroll Contacts</h3>
        <p className="mt-1 text-sm text-gray-500">Add contacts to this automation sequence.</p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setMode('list')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === 'list' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            From List
          </button>
          <button
            onClick={() => setMode('emails')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === 'emails' ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            By Email
          </button>
        </div>

        {mode === 'list' ? (
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">Select List</label>
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Choose a list...</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.contact_count} contacts)
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">Email Addresses</label>
            <textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder="Paste email addresses, one per line or comma-separated"
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleEnroll}
            disabled={enrollMutation.isPending || (mode === 'list' ? !listId : !emailText.trim())}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {enrollMutation.isPending ? 'Enrolling...' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutomationDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: automation, isLoading, isError } = useAutomation(id);
  const activateMutation = useActivateAutomation();
  const pauseMutation = usePauseAutomation();
  const [tab, setTab] = useState<DetailTab>('steps');
  const [enrollPage, setEnrollPage] = useState(1);
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const { data: enrollData } = useEnrollments(tab === 'enrollments' ? id : undefined, { page: enrollPage });
  const enrollments = enrollData?.data || [];
  const enrollTotal = enrollData?.pagination?.total || 0;

  if (isLoading) {
    return (
      <div className="p-6">
        <FormSkeleton fields={4} />
      </div>
    );
  }

  if (isError || !automation) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">Failed to load automation</p>
        </div>
      </div>
    );
  }

  const steps = automation.steps || [];
  const stepCount = automation.step_count ?? steps.length;

  const tabClasses = (t: DetailTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? 'bg-primary-100 text-primary-700'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/automations')}
            className="mb-2 text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Automations
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{automation.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[automation.status] || ''}`}>
              {automation.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {triggerLabel(automation.trigger_type, automation.trigger_config)}
          </p>
        </div>
        <div className="flex gap-2">
          {automation.status === 'active' ? (
            <button
              onClick={() => pauseMutation.mutate(automation.id)}
              disabled={pauseMutation.isPending}
              className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => activateMutation.mutate(automation.id)}
              disabled={activateMutation.isPending}
              className="rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
            >
              Activate
            </button>
          )}
          <button
            onClick={() => setShowEnrollModal(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            Enroll Contacts
          </button>
          <button
            onClick={() => navigate(`/automations/${automation.id}/edit`)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Enrolled</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{automation.total_enrolled}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Active</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {automation.total_enrolled - automation.total_completed}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Completed</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{automation.total_completed}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Provider</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 uppercase">{automation.provider}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1">
        <button className={tabClasses('steps')} onClick={() => setTab('steps')}>
          Steps ({stepCount})
        </button>
        <button className={tabClasses('enrollments')} onClick={() => setTab('enrollments')}>
          Enrollments
        </button>
      </div>

      {/* Tab content */}
      {tab === 'steps' && (
        <div className="mt-4 rounded-xl bg-white p-6 shadow-sm">
          {steps.length === 0 ? (
            <p className="text-sm text-gray-500">No steps configured for this automation.</p>
          ) : (
            <div>
              {/* Trigger node */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {triggerLabel(automation.trigger_type, automation.trigger_config)}
                </span>
              </div>

              {steps.map((step, idx) => (
                <div key={step.id || idx} className="relative ml-4">
                  <div className="absolute left-0 top-0 h-full w-px bg-gray-200" style={{ marginLeft: '11px' }} />
                  <div className="relative flex items-center gap-2 py-3 pl-8">
                    <div className="absolute left-2.5 h-2 w-2 rounded-full border-2 border-gray-300 bg-white" />
                    <span className="text-xs font-medium text-gray-400">
                      {idx === 0 ? 'Immediately' : `Wait ${formatDelay(step.delay_days, step.delay_hours, step.delay_minutes)}`}
                    </span>
                  </div>
                  <div className="relative ml-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="absolute -left-5 top-6 h-px w-5 bg-gray-200" />
                    <h4 className="text-sm font-semibold text-gray-700">Step {idx + 1}</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Template: {step.template_name || step.template_id}
                    </p>
                    {step.subject_override && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        Subject: {step.subject_override}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'enrollments' && (
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Current Step</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Enrolled At</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Next Step At</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Completed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No enrollments yet. Enroll contacts to start the automation.
                    </td>
                  </tr>
                ) : (
                  enrollments.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium">{e.contact_email || e.contact_id}</span>
                          {e.contact_name && (
                            <span className="ml-1 text-gray-400">{e.contact_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        Step {e.current_step} of {stepCount}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${enrollmentStatusColors[e.status] || 'bg-gray-100 text-gray-700'}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(e.enrolled_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(e.next_step_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(e.completed_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {enrollTotal > 20 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
              <span>{enrollTotal} enrollments total</span>
              <div className="flex gap-2">
                <button
                  disabled={enrollPage <= 1}
                  onClick={() => setEnrollPage(enrollPage - 1)}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="px-3 py-1">Page {enrollPage}</span>
                <button
                  disabled={enrollPage >= Math.ceil(enrollTotal / 20)}
                  onClick={() => setEnrollPage(enrollPage + 1)}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showEnrollModal && (
        <EnrollModal automationId={automation.id} onClose={() => setShowEnrollModal(false)} />
      )}
    </div>
  );
}

export default function AutomationDetail() {
  return (
    <ErrorBoundary>
      <AutomationDetailContent />
    </ErrorBoundary>
  );
}
