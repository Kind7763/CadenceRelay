import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getCampaign, pauseCampaign, resumeCampaign, getCampaignRecipients, scheduleCampaign, sendCampaign, updateCampaign, Campaign } from '../api/campaigns.api';
import { getRecipientEvents } from '../api/analytics.api';
import { listTemplates, Template } from '../api/templates.api';
import { listLists } from '../api/lists.api';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

interface Recipient {
  id: string;
  email: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  error_message: string | null;
  open_count?: number;
  click_count?: number;
  last_opened_at?: string | null;
  last_clicked_at?: string | null;
}

interface RecipientEvent {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientFilter, setRecipientFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedRecipient, setExpandedRecipient] = useState<string | null>(null);
  const [recipientEvents, setRecipientEvents] = useState<RecipientEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  // Draft editing state
  const [showEditDraft, setShowEditDraft] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTemplateId, setEditTemplateId] = useState('');
  const [editListId, setEditListId] = useState('');
  const [editProvider, setEditProvider] = useState<'gmail' | 'ses'>('ses');
  const [editThrottlePerSecond, setEditThrottlePerSecond] = useState(5);
  const [editThrottlePerHour, setEditThrottlePerHour] = useState(5000);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load templates and lists for edit dropdowns
  useEffect(() => {
    if (campaign?.status === 'draft' || campaign?.status === 'scheduled') {
      listTemplates().then(setTemplates).catch(() => {});
      listLists().then((res) => setLists(res)).catch(() => {});
    }
  }, [campaign?.status]);

  // Populate edit form when campaign loads
  useEffect(() => {
    if (campaign && (campaign.status === 'draft' || campaign.status === 'scheduled')) {
      setEditName(campaign.name);
      setEditTemplateId(campaign.template_id || '');
      setEditListId(campaign.list_id || '');
      setEditProvider((campaign.provider as 'gmail' | 'ses') || 'ses');
      setEditThrottlePerSecond(campaign.throttle_per_second || 5);
      setEditThrottlePerHour(campaign.throttle_per_hour || 5000);
    }
  }, [campaign]);

  async function handleSaveDraftEdits() {
    if (!id || !editName.trim()) return;
    setSavingDraft(true);
    try {
      await updateCampaign(id, {
        name: editName,
        templateId: editTemplateId || undefined,
        listId: editListId || undefined,
        provider: editProvider,
        throttlePerSecond: editThrottlePerSecond,
        throttlePerHour: editThrottlePerHour,
      });
      toast.success('Campaign updated');
      setShowEditDraft(false);
      fetchCampaign();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleSendNow() {
    if (!id) return;
    if (!editTemplateId || !editListId) {
      toast.error('Template and list are required before sending');
      return;
    }
    if (!confirm('Send this campaign now? This will start sending immediately.')) return;
    setSendingNow(true);
    try {
      // Save any pending edits first
      await updateCampaign(id, {
        name: editName,
        templateId: editTemplateId,
        listId: editListId,
        provider: editProvider,
        throttlePerSecond: editThrottlePerSecond,
        throttlePerHour: editThrottlePerHour,
      });
      await sendCampaign(id);
      toast.success('Campaign sending started!');
      fetchCampaign();
    } catch {
      toast.error('Failed to send campaign');
    } finally {
      setSendingNow(false);
    }
  }

  async function handleScheduleDraft() {
    if (!id || !scheduleAt) return;
    if (!editTemplateId || !editListId) {
      toast.error('Template and list are required before scheduling');
      return;
    }
    try {
      // Save edits first
      await updateCampaign(id, {
        name: editName,
        templateId: editTemplateId,
        listId: editListId,
        provider: editProvider,
        throttlePerSecond: editThrottlePerSecond,
        throttlePerHour: editThrottlePerHour,
      });
      await scheduleCampaign(id, new Date(scheduleAt).toISOString());
      toast.success('Campaign scheduled!');
      setShowScheduleModal(false);
      fetchCampaign();
    } catch {
      toast.error('Failed to schedule — time must be in the future');
    }
  }

  async function handleReschedule() {
    if (!id || !newScheduledAt) return;
    setRescheduling(true);
    try {
      await scheduleCampaign(id, new Date(newScheduledAt).toISOString());
      toast.success('Campaign rescheduled');
      setShowReschedule(false);
      fetchCampaign();
    } catch {
      toast.error('Failed to reschedule — time must be in the future');
    } finally {
      setRescheduling(false);
    }
  }

  async function toggleRecipientEvents(recipientId: string) {
    if (expandedRecipient === recipientId) {
      setExpandedRecipient(null);
      setRecipientEvents([]);
      return;
    }
    setExpandedRecipient(recipientId);
    setEventsLoading(true);
    try {
      const res = await getRecipientEvents(recipientId);
      setRecipientEvents(res.events);
    } catch {
      toast.error('Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  }

  const fetchCampaign = useCallback(async () => {
    if (!id) return;
    try {
      const c = await getCampaign(id);
      setCampaign(c);
    } catch {
      toast.error('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchRecipients = useCallback(async () => {
    if (!id) return;
    const params: Record<string, string> = { page: String(recipientPage), limit: '50' };
    if (recipientFilter) params.status = recipientFilter;
    try {
      const res = await getCampaignRecipients(id, params);
      setRecipients(res.data);
      setRecipientTotal(res.pagination.total);
    } catch { /* ignore */ }
  }, [id, recipientPage, recipientFilter]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);
  useEffect(() => { fetchRecipients(); }, [fetchRecipients]);

  // Auto-refresh while sending - fixed interval cleanup
  useEffect(() => {
    if (campaign?.status === 'sending') {
      intervalRef.current = setInterval(() => { fetchCampaign(); fetchRecipients(); }, 5000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [campaign?.status, fetchCampaign, fetchRecipients]);

  function handleExportRecipients() {
    if (!recipients.length) {
      toast.error('No recipients to export');
      return;
    }
    const header = 'Email,Status,Sent At,Opened At,Clicked At,Bounced At,Error\n';
    const rows = recipients.map((r) =>
      [r.email, r.status, r.sent_at || '', r.opened_at || '', r.clicked_at || '', r.bounced_at || '', r.error_message || '']
        .map((v) => `"${v}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipients-${campaign?.name || id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Recipients exported');
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-gray-500">Loading...</div>;
  if (!campaign) return <div className="p-6">Campaign not found</div>;

  const progress = campaign.total_recipients > 0
    ? Math.round(((Number(campaign.sent_count) + Number(campaign.failed_count)) / Number(campaign.total_recipients)) * 100)
    : 0;

  const sentCount = Number(campaign.sent_count) || 0;
  const failedCount = Number(campaign.failed_count) || 0;
  const bounceCount = Number(campaign.bounce_count) || 0;
  const openCount = Number(campaign.open_count) || 0;
  const clickCount = Number(campaign.click_count) || 0;
  const complaintCount = Number(campaign.complaint_count) || 0;
  const totalRecipients = Number(campaign.total_recipients) || 0;

  const openRate = sentCount > 0 ? ((openCount / sentCount) * 100).toFixed(1) : '0';
  const clickRate = sentCount > 0 ? ((clickCount / sentCount) * 100).toFixed(1) : '0';

  async function handlePause() {
    try { await pauseCampaign(id!); toast.success('Paused'); fetchCampaign(); } catch { toast.error('Failed'); }
  }
  async function handleResume() {
    try { await resumeCampaign(id!); toast.success('Resumed'); fetchCampaign(); } catch { toast.error('Failed'); }
  }

  return (
    <div className="p-6">
      <button onClick={() => navigate('/campaigns')} className="mb-4 text-sm text-primary-600">&larr; Back</button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[campaign.status] || ''}`}>{campaign.status}</span>
        </div>
        <div className="flex gap-2">
          {campaign.status === 'sending' && <button onClick={handlePause} className="rounded-lg border border-orange-300 px-4 py-2 text-sm text-orange-600">Pause</button>}
          {campaign.status === 'paused' && <button onClick={handleResume} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white">Resume</button>}
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <>
              <button onClick={() => setShowEditDraft(!showEditDraft)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {showEditDraft ? 'Hide Editor' : 'Edit Campaign'}
              </button>
              {campaign.status === 'draft' && (
                <>
                  <button onClick={() => setShowScheduleModal(true)} className="rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">Schedule</button>
                  <button onClick={handleSendNow} disabled={sendingNow} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
                    {sendingNow ? 'Sending...' : 'Send Now'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      {campaign.status === 'sending' && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{sentCount + failedCount} / {totalRecipients}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Draft/Scheduled Edit Panel */}
      {showEditDraft && (campaign.status === 'draft' || campaign.status === 'scheduled') && (
        <div className="mt-4 rounded-xl bg-white p-6 shadow-sm border-2 border-primary-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Campaign</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Campaign Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Template *</label>
              <select
                value={editTemplateId}
                onChange={(e) => setEditTemplateId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="">Select a template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Contact List *</label>
              <select
                value={editListId}
                onChange={(e) => setEditListId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="">Select a list</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Provider</label>
              <select
                value={editProvider}
                onChange={(e) => setEditProvider(e.target.value as 'gmail' | 'ses')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="ses">AWS SES</option>
                <option value="gmail">Gmail SMTP</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Throttle (per second)</label>
              <input
                type="number"
                value={editThrottlePerSecond}
                onChange={(e) => setEditThrottlePerSecond(Number(e.target.value))}
                min={1}
                max={50}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Throttle (per hour)</label>
              <input
                type="number"
                value={editThrottlePerHour}
                onChange={(e) => setEditThrottlePerHour(Number(e.target.value))}
                min={10}
                max={50000}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
            <button
              onClick={handleSaveDraftEdits}
              disabled={savingDraft || !editName.trim()}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {savingDraft ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setShowEditDraft(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            {(!editTemplateId || !editListId) && (
              <span className="text-xs text-amber-600">⚠ Template and list are required to send/schedule</span>
            )}
          </div>
        </div>
      )}

      {/* Schedule Modal for Draft */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Schedule Campaign</h3>
            <p className="mt-1 text-sm text-gray-500">Choose when to send "{editName}"</p>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Send Date & Time</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowScheduleModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleScheduleDraft}
                disabled={!scheduleAt}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Info Card */}
      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 text-sm">
          <div>
            <span className="text-xs text-gray-500">Provider</span>
            <p className="font-medium capitalize">{campaign.provider}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Template</span>
            <p className="font-medium">{campaign.template_name || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">List</span>
            <p className="font-medium">{campaign.list_name || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Created</span>
            <p className="font-medium">{new Date(campaign.created_at).toLocaleString()}</p>
          </div>
          {campaign.started_at && (
            <div>
              <span className="text-xs text-gray-500">Started</span>
              <p className="font-medium">{new Date(campaign.started_at).toLocaleString()}</p>
            </div>
          )}
          {campaign.completed_at && (
            <div>
              <span className="text-xs text-gray-500">Completed</span>
              <p className="font-medium">{new Date(campaign.completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Scheduled info */}
        {(campaign.status === 'scheduled' || campaign.scheduled_at) && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 p-3">
            <div className="text-blue-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">
                {campaign.status === 'scheduled' ? 'Scheduled to send' : 'Was scheduled for'}
              </p>
              <p className="text-lg font-bold text-blue-900">
                {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
              </p>
              {campaign.status === 'scheduled' && campaign.scheduled_at && (
                <p className="text-xs text-blue-600">
                  {(() => {
                    const diff = new Date(campaign.scheduled_at).getTime() - Date.now();
                    if (diff <= 0) return 'Starting soon...';
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    if (hours > 24) return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
                    if (hours > 0) return `in ${hours}h ${mins}m`;
                    return `in ${mins} minutes`;
                  })()}
                </p>
              )}
            </div>
            {campaign.status === 'scheduled' && (
              <div className="flex gap-2">
                {!showReschedule ? (
                  <button
                    onClick={() => { setShowReschedule(true); setNewScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : ''); }}
                    className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Reschedule
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={newScheduledAt}
                      onChange={(e) => setNewScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="rounded border border-blue-300 px-2 py-1 text-xs"
                    />
                    <button onClick={handleReschedule} disabled={rescheduling || !newScheduledAt} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
                      {rescheduling ? '...' : 'Save'}
                    </button>
                    <button onClick={() => setShowReschedule(false)} className="text-xs text-gray-500">Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: 'Sent', value: sentCount, color: 'text-blue-600' },
          { label: 'Failed', value: failedCount, color: 'text-red-600' },
          { label: 'Bounced', value: bounceCount, color: 'text-orange-600' },
          { label: 'Opens', value: `${openCount} (${openRate}%)`, color: 'text-green-600' },
          { label: 'Clicks', value: `${clickCount} (${clickRate}%)`, color: 'text-purple-600' },
          { label: 'Complaints', value: complaintCount, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-4 shadow-sm">
            <span className="text-xs text-gray-500">{s.label}</span>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recipients */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recipients</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleExportRecipients} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Export Recipients</button>
            <select value={recipientFilter} onChange={(e) => { setRecipientFilter(e.target.value); setRecipientPage(1); }} className="rounded border px-2 py-1 text-sm">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Sent</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Opens</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Clicks</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Last Opened</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recipients.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">No recipients</td></tr>
              ) : recipients.map((r) => (
                <React.Fragment key={r.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleRecipientEvents(r.id)}
                  >
                    <td className="px-3 py-2">
                      <span className="mr-1 text-gray-400">{expandedRecipient === r.id ? '▼' : '▶'}</span>
                      {r.email}
                    </td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[r.status] || 'bg-gray-100'}`}>{r.status}</span></td>
                    <td className="px-3 py-2 text-xs">{r.sent_at ? new Date(r.sent_at).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-center">
                      {(r.open_count || 0) > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">{r.open_count}</span>
                      ) : <span className="text-xs text-gray-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {(r.click_count || 0) > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">{r.click_count}</span>
                      ) : <span className="text-xs text-gray-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.last_opened_at ? new Date(r.last_opened_at).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs text-red-500">{r.error_message || '-'}</td>
                  </tr>
                  {expandedRecipient === r.id && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 px-6 py-3">
                        {eventsLoading ? (
                          <p className="text-sm text-gray-400">Loading events...</p>
                        ) : recipientEvents.length === 0 ? (
                          <p className="text-sm text-gray-400">No events recorded</p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="pb-1 text-left font-medium">Event</th>
                                  <th className="pb-1 text-left font-medium">Timestamp</th>
                                  <th className="pb-1 text-left font-medium">IP Address</th>
                                  <th className="pb-1 text-left font-medium">Details</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {recipientEvents.map((ev) => (
                                  <tr key={ev.id}>
                                    <td className="py-1.5">
                                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                        ev.event_type === 'opened' ? 'bg-green-100 text-green-700' :
                                        ev.event_type === 'clicked' ? 'bg-purple-100 text-purple-700' :
                                        ev.event_type === 'sent' ? 'bg-blue-100 text-blue-700' :
                                        ev.event_type === 'bounced' ? 'bg-orange-100 text-orange-700' :
                                        ev.event_type === 'failed' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>{ev.event_type}</span>
                                    </td>
                                    <td className="py-1.5">{new Date(ev.created_at).toLocaleString()}</td>
                                    <td className="py-1.5 font-mono">{ev.ip_address || '-'}</td>
                                    <td className="py-1.5 truncate max-w-[200px]">
                                      {ev.event_type === 'clicked' && ev.metadata?.url ? String(ev.metadata.url) : ev.user_agent ? ev.user_agent.substring(0, 60) + '...' : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {recipientTotal > 50 && (
          <div className="mt-3 flex justify-end gap-2">
            <button disabled={recipientPage <= 1} onClick={() => setRecipientPage(recipientPage - 1)} className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-gray-50">Prev</button>
            <span className="px-2 py-1 text-xs">{recipientPage}/{Math.ceil(recipientTotal / 50)}</span>
            <button disabled={recipientPage >= Math.ceil(recipientTotal / 50)} onClick={() => setRecipientPage(recipientPage + 1)} className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-gray-50">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
