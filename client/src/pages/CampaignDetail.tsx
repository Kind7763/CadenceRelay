import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignRecipients,
  scheduleCampaign,
  updateCampaign,
  duplicateCampaign,
  toggleStar,
  toggleArchive,
  updateCampaignLabel,
  resendToNonOpeners,
  resendTransientBounced,
  exportCampaignRecipients,
  // suppressPermanentBounces removed — auto-suppression worker handles this
  Campaign,
} from '../api/campaigns.api';
import { bulkSuppressContacts } from '../api/contacts.api';
import { getRecipientEvents } from '../api/analytics.api';
import { listContacts, Contact } from '../api/contacts.api';
import LabelPicker from '../components/ui/LabelPicker';
import { SortableHeader, SortState, sortItems, toggleSort } from '../components/ui/SortableHeader';

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
  bounce_type?: string | null;
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
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; filename: string } | null>(null);
  const [previewContacts, setPreviewContacts] = useState<Contact[]>([]);
  const [selectedPreviewContact, setSelectedPreviewContact] = useState<Contact | null>(null);
  const [recipientSort, setRecipientSort] = useState<SortState | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Load preview contacts from campaign's list
  useEffect(() => {
    if (campaign?.list_id) {
      listContacts({ listId: campaign.list_id, limit: '10' })
        .then((res) => setPreviewContacts(res.data || []))
        .catch(() => {});
    }
  }, [campaign?.list_id]);

  function replaceVars(html: string, contact: Contact): string {
    const vars: Record<string, string> = {
      name: contact.name || '',
      school_name: contact.name || '',
      email: contact.email || '',
      state: contact.state || '',
      district: contact.district || '',
      block: contact.block || '',
      classes: contact.classes || '',
      category: contact.category || '',
      management: contact.management || '',
      address: contact.address || '',
    };
    if (contact.metadata && typeof contact.metadata === 'object') {
      for (const [k, v] of Object.entries(contact.metadata)) {
        if (typeof v === 'string' || typeof v === 'number') vars[k] = String(v);
      }
    }
    let result = html;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), val);
    }
    return result;
  }

  // Inline edit states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Bounce type filter
  const [bounceTypeFilter, setBounceTypeFilter] = useState('');

  // Resend to Non-Openers state
  const [showResendModal, setShowResendModal] = useState(false);
  const [resendSubject, setResendSubject] = useState('');
  const [resending, setResending] = useState(false);

  // Bounce action states
  const [resendingTransient, setResendingTransient] = useState(false);
  // suppressingPermanent removed — auto-suppression worker handles permanent bounces
  const [showMoreActions, setShowMoreActions] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);

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
    const params: Record<string, string> = { page: String(recipientPage), limit: String(pageSize) };
    if (recipientFilter) params.status = recipientFilter;
    if (bounceTypeFilter) params.bounceType = bounceTypeFilter;
    try {
      const res = await getCampaignRecipients(id, params);
      setRecipients(res.data);
      setRecipientTotal(res.pagination.total);
    } catch { /* ignore */ }
  }, [id, recipientPage, pageSize, recipientFilter, bounceTypeFilter]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);
  useEffect(() => { fetchRecipients(); }, [fetchRecipients]);

  // Close "More Actions" dropdown on outside click
  useEffect(() => {
    if (!showMoreActions) return;
    function handleClick(e: MouseEvent) {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) setShowMoreActions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreActions]);

  // Auto-refresh while sending
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

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [recipientPage, pageSize, recipientFilter, bounceTypeFilter]);

  function toggleRecipientSelect(rid: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });
    setSelectAllMatching(false);
  }

  function toggleSelectAllVisible() {
    if (selectedIds.size === recipients.length && recipients.length > 0) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedIds(new Set(recipients.map((r) => r.id)));
    }
  }

  const effectiveSelectedCount = selectAllMatching ? recipientTotal : selectedIds.size;

  function handleExportRecipients() {
    // If selectAllMatching, use server-side export
    if (selectAllMatching && id) {
      const params: Record<string, string> = {};
      if (recipientFilter) params.status = recipientFilter;
      if (bounceTypeFilter) params.bounceType = bounceTypeFilter;
      exportCampaignRecipients(id, params);
      toast.success('Exporting all matching recipients...');
      return;
    }

    const toExport = selectedIds.size > 0
      ? recipients.filter((r) => selectedIds.has(r.id))
      : recipients;

    if (!toExport.length) {
      toast.error('No recipients to export');
      return;
    }
    const header = 'Email,Name,Status,Bounce Type,Sent At,Opened At,Clicked At,Bounced At,Open Count,Click Count,Last Opened,Last Clicked,AB Variant,Error Message\n';
    const rows = toExport.map((r) =>
      [
        r.email, '', r.status, r.bounce_type || '', r.sent_at || '', r.opened_at || '',
        r.clicked_at || '', r.bounced_at || '', String(r.open_count || 0), String(r.click_count || 0),
        r.last_opened_at || '', r.last_clicked_at || '', '', r.error_message || '',
      ].map((v) => `"${v}"`).join(',')
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

  async function handleSuppressSelected() {
    if (effectiveSelectedCount === 0) return;
    try {
      if (selectAllMatching && id) {
        // Suppress all matching via filter
        const filterParams: Record<string, string> = { campaignId: id };
        if (recipientFilter) filterParams.status = recipientFilter;
        if (bounceTypeFilter) filterParams.bounceType = bounceTypeFilter;
        const result = await bulkSuppressContacts({ filters: filterParams });
        toast.success(`${result.suppressed.toLocaleString()} contact(s) suppressed`);
      } else {
        const emails = recipients.filter((r) => selectedIds.has(r.id)).map((r) => r.email);
        const result = await bulkSuppressContacts({ contactIds: emails });
        toast.success(`${result.suppressed.toLocaleString()} contact(s) suppressed`);
      }
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } catch {
      toast.error('Failed to suppress contacts');
    }
  }

  async function handleStarToggle() {
    if (!id) return;
    try {
      const updated = await toggleStar(id);
      setCampaign(updated);
    } catch {
      toast.error('Failed to toggle star');
    }
  }

  async function handleArchiveToggle() {
    if (!id) return;
    try {
      const updated = await toggleArchive(id);
      setCampaign(updated);
      toast.success(updated.is_archived ? 'Campaign archived' : 'Campaign unarchived');
    } catch {
      toast.error('Failed to update archive status');
    }
  }

  async function handleDuplicate() {
    if (!id) return;
    setDuplicating(true);
    try {
      const newCampaign = await duplicateCampaign(id);
      toast.success('Campaign duplicated');
      if (newCampaign?.id) navigate(`/campaigns/${newCampaign.id}`);
    } catch {
      toast.error('Failed to duplicate campaign');
    } finally {
      setDuplicating(false);
    }
  }

  async function handleNameSave() {
    if (!id || !nameValue.trim()) return;
    try {
      const updated = await updateCampaign(id, { name: nameValue.trim() });
      setCampaign(updated);
      setEditingName(false);
      toast.success('Name updated');
    } catch {
      toast.error('Failed to update name');
    }
  }

  async function handleDescriptionSave() {
    if (!id) return;
    try {
      const updated = await updateCampaign(id, { description: descriptionValue.trim() });
      setCampaign(updated);
      setEditingDescription(false);
      toast.success('Description updated');
    } catch {
      toast.error('Failed to update description');
    }
  }

  async function handleLabelSelect(label: { name: string; color: string } | null) {
    if (!id) return;
    try {
      const updated = await updateCampaignLabel(id, label || { name: '', color: '' });
      setCampaign(updated);
    } catch {
      toast.error('Failed to update label');
    }
    setShowLabelPicker(false);
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Campaign name - inline editable */}
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
                  className="rounded border border-gray-300 px-2 py-1 text-2xl font-bold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  autoFocus
                />
                <button onClick={handleNameSave} className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700">Save</button>
                <button onClick={() => setEditingName(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <h1
                className="group flex cursor-pointer items-center gap-2 text-2xl font-bold"
                onClick={() => { setNameValue(campaign.name); setEditingName(true); }}
              >
                {campaign.name}
                <svg className="h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </h1>
            )}

            {/* Star button */}
            <button
              onClick={handleStarToggle}
              className="text-xl leading-none transition-colors"
              title={campaign.is_starred ? 'Unstar' : 'Star'}
            >
              {campaign.is_starred
                ? <span className="text-yellow-400">{'\u2605'}</span>
                : <span className="text-gray-300 hover:text-yellow-400">{'\u2606'}</span>
              }
            </button>
          </div>

          {/* Label */}
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[campaign.status] || ''}`}>{campaign.status}</span>
            <div className="relative">
              <button
                onClick={() => setShowLabelPicker(!showLabelPicker)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                {campaign.label_color ? (
                  <>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: campaign.label_color }} />
                    <span>{campaign.label_name || 'Label'}</span>
                  </>
                ) : (
                  <span>+ Label</span>
                )}
              </button>
              {showLabelPicker && (
                <div className="absolute left-0 top-full mt-1">
                  <LabelPicker
                    currentColor={campaign.label_color}
                    currentName={campaign.label_name}
                    onSelect={handleLabelSelect}
                    onClose={() => setShowLabelPicker(false)}
                  />
                </div>
              )}
            </div>
            {campaign.is_archived && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Archived</span>
            )}
          </div>

          {/* Description - editable */}
          <div className="mt-2">
            {editingDescription ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDescriptionSave(); if (e.key === 'Escape') setEditingDescription(false); }}
                  placeholder="Add a description..."
                  className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  autoFocus
                />
                <button onClick={handleDescriptionSave} className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700">Save</button>
                <button onClick={() => setEditingDescription(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <p
                className="group cursor-pointer text-sm text-gray-500 hover:text-gray-700"
                onClick={() => { setDescriptionValue(campaign.description || ''); setEditingDescription(true); }}
              >
                {campaign.description || 'Click to add description...'}
                <svg className="ml-1 inline h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-shrink-0 gap-2">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {duplicating ? 'Duplicating...' : 'Duplicate'}
          </button>
          <button
            onClick={handleArchiveToggle}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {campaign.is_archived ? 'Unarchive' : 'Archive'}
          </button>
          {campaign.status === 'sending' && <button onClick={handlePause} className="rounded-lg border border-orange-300 px-4 py-2 text-sm text-orange-600">Pause</button>}
          {campaign.status === 'paused' && <button onClick={handleResume} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white">Resume</button>}
          {campaign.status === 'completed' && (
            <div className="relative" ref={moreActionsRef}>
              <button
                onClick={() => setShowMoreActions(!showMoreActions)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                More Actions ▾
              </button>
              {showMoreActions && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg" style={{ position: 'fixed', top: moreActionsRef.current ? moreActionsRef.current.getBoundingClientRect().bottom + 4 : 0, right: moreActionsRef.current ? window.innerWidth - moreActionsRef.current.getBoundingClientRect().right : 0 }}>
                  <button
                    onClick={() => { setResendSubject(`Re: ${campaign.template_snapshot_subject || campaign.template_subject || campaign.name}`); setShowResendModal(true); setShowMoreActions(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span className="text-green-500">↻</span> Resend to Non-Openers
                  </button>
                  <button
                    onClick={async () => {
                      setShowMoreActions(false);
                      if (!id) return;
                      setResendingTransient(true);
                      try {
                        const newCamp = await resendTransientBounced(id);
                        toast.success('Resend campaign created for transient bounces');
                        if (newCamp?.id) navigate(`/campaigns/${newCamp.id}`);
                      } catch (err) {
                        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
                        const msg = axiosErr?.response?.data?.error || axiosErr?.response?.data?.message || 'Failed to create resend campaign';
                        if (msg.toLowerCase().includes('no transient')) {
                          toast('No transient bounced contacts found in this campaign', { icon: 'ℹ️' });
                        } else {
                          toast.error(msg);
                        }
                      } finally { setResendingTransient(false); }
                    }}
                    disabled={resendingTransient}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="text-orange-500">↻</span> {resendingTransient ? 'Creating...' : 'Resend Transient Bounces'}
                  </button>
                  <hr className="my-1 border-gray-100" />
                  <div className="px-4 py-2 text-xs text-gray-400">
                    Permanent bounces are automatically suppressed by the system every 10 minutes.
                  </div>
                </div>
              )}
            </div>
          )}
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <button onClick={() => navigate(`/campaigns/${id}/edit`)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
              Edit & Send
            </button>
          )}
        </div>
      </div>

      {/* Daily limit pause banner */}
      {campaign.pause_reason && campaign.pause_reason.startsWith('Daily') && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-sm font-medium text-amber-800">{campaign.pause_reason}</span>
          </div>
          <p className="mt-1 text-xs text-amber-600">This campaign was automatically paused. It will resume when the daily send quota resets (midnight UTC).</p>
        </div>
      )}

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
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Sent', value: sentCount, color: 'text-blue-600' },
          { label: 'Failed', value: failedCount, color: 'text-red-600' },
          { label: 'Opens', value: `${openCount} (${openRate}%)`, color: 'text-green-600' },
          { label: 'Clicks', value: `${clickCount} (${clickRate}%)`, color: 'text-purple-600' },
          { label: 'Complaints', value: complaintCount, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-4 shadow-sm">
            <span className="text-xs text-gray-500">{s.label}</span>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
        {/* Bounce breakdown card */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <span className="text-xs text-gray-500">Bounced</span>
          <p className="text-xl font-bold text-orange-600">
            {bounceCount} {sentCount > 0 && <span className="text-sm font-normal text-gray-400">({((bounceCount / sentCount) * 100).toFixed(1)}%)</span>}
          </p>
          {campaign.bounceBreakdown && (bounceCount > 0) && (
            <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
              {campaign.bounceBreakdown.permanent > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-600">Permanent</span>
                  <span className="font-medium text-red-600">
                    {campaign.bounceBreakdown.permanent}
                    {sentCount > 0 && <span className="ml-1 text-gray-400">({((campaign.bounceBreakdown.permanent / sentCount) * 100).toFixed(1)}%)</span>}
                  </span>
                </div>
              )}
              {campaign.bounceBreakdown.transient > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-orange-600">Transient</span>
                  <span className="font-medium text-orange-600">
                    {campaign.bounceBreakdown.transient}
                    {sentCount > 0 && <span className="ml-1 text-gray-400">({((campaign.bounceBreakdown.transient / sentCount) * 100).toFixed(1)}%)</span>}
                  </span>
                </div>
              )}
              {campaign.bounceBreakdown.undetermined > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">Undetermined</span>
                  <span className="font-medium text-gray-600">
                    {campaign.bounceBreakdown.undetermined}
                    {sentCount > 0 && <span className="ml-1 text-gray-400">({((campaign.bounceBreakdown.undetermined / sentCount) * 100).toFixed(1)}%)</span>}
                  </span>
                </div>
              )}
              {campaign.bounceBreakdown.suppressed > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Suppressed</span>
                  <span className="font-medium text-gray-500">
                    {campaign.bounceBreakdown.suppressed}
                    {sentCount > 0 && <span className="ml-1 text-gray-400">({((campaign.bounceBreakdown.suppressed / sentCount) * 100).toFixed(1)}%)</span>}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* A/B Test Results */}
      {campaign.ab_test?.enabled && (() => {
        const ab = campaign.ab_test;
        const aStats = ab.variantAStats || { sent: 0, opens: 0, clicks: 0 };
        const bStats = ab.variantBStats || { sent: 0, opens: 0, clicks: 0 };
        const aOpenRate = aStats.sent > 0 ? ((aStats.opens / aStats.sent) * 100).toFixed(1) : '0.0';
        const bOpenRate = bStats.sent > 0 ? ((bStats.opens / bStats.sent) * 100).toFixed(1) : '0.0';
        const aClickRate = aStats.sent > 0 ? ((aStats.clicks / aStats.sent) * 100).toFixed(1) : '0.0';
        const bClickRate = bStats.sent > 0 ? ((bStats.clicks / bStats.sent) * 100).toFixed(1) : '0.0';
        const isWinnerA = ab.winnerVariant === 'A';
        const isWinnerB = ab.winnerVariant === 'B';

        const statusLabel: Record<string, string> = {
          pending: 'Pending',
          testing: 'Testing',
          winner_picked: 'Winner Picked',
          completed: 'Completed',
        };
        const statusColor: Record<string, string> = {
          pending: 'bg-gray-100 text-gray-700',
          testing: 'bg-yellow-100 text-yellow-700',
          winner_picked: 'bg-blue-100 text-blue-700',
          completed: 'bg-green-100 text-green-700',
        };

        return (
          <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">A/B Test Results</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[ab.status] || ''}`}>
                {statusLabel[ab.status] || ab.status}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-gray-500">
                    <th className="pb-2 pr-4">Variant</th>
                    <th className="pb-2 pr-4">Subject</th>
                    <th className="pb-2 pr-4 text-right">Sent</th>
                    <th className="pb-2 pr-4 text-right">Opens</th>
                    <th className="pb-2 pr-4 text-right">Open Rate</th>
                    <th className="pb-2 pr-4 text-right">Clicks</th>
                    <th className="pb-2 text-right">Click Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b ${isWinnerA ? 'bg-green-50' : ''}`}>
                    <td className="py-2 pr-4 font-medium">
                      A {isWinnerA && <span className="text-yellow-500" title="Winner">&#9733;</span>}
                    </td>
                    <td className="py-2 pr-4 max-w-[200px] truncate text-gray-600" title={campaign.template_snapshot_subject || campaign.template_subject || ''}>
                      {campaign.template_snapshot_subject || campaign.template_subject || 'Original subject'}
                    </td>
                    <td className="py-2 pr-4 text-right">{aStats.sent}</td>
                    <td className="py-2 pr-4 text-right">{aStats.opens}</td>
                    <td className="py-2 pr-4 text-right font-medium">{aOpenRate}%</td>
                    <td className="py-2 pr-4 text-right">{aStats.clicks}</td>
                    <td className="py-2 text-right font-medium">{aClickRate}%</td>
                  </tr>
                  <tr className={isWinnerB ? 'bg-green-50' : ''}>
                    <td className="py-2 pr-4 font-medium">
                      B {isWinnerB && <span className="text-yellow-500" title="Winner">&#9733;</span>}
                    </td>
                    <td className="py-2 pr-4 max-w-[200px] truncate text-gray-600" title={ab.variantB?.subject || ''}>
                      {ab.variantB?.subject || 'Variant B subject'}
                    </td>
                    <td className="py-2 pr-4 text-right">{bStats.sent}</td>
                    <td className="py-2 pr-4 text-right">{bStats.opens}</td>
                    <td className="py-2 pr-4 text-right font-medium">{bOpenRate}%</td>
                    <td className="py-2 pr-4 text-right">{bStats.clicks}</td>
                    <td className="py-2 text-right font-medium">{bClickRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {ab.winnerVariant && (
              <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                <strong>Winner: Variant {ab.winnerVariant}</strong>
                {ab.winnerMetric === 'open_rate'
                  ? ` (Open Rate: ${isWinnerA ? aOpenRate : bOpenRate}% vs ${isWinnerA ? bOpenRate : aOpenRate}%)`
                  : ` (Click Rate: ${isWinnerA ? aClickRate : bClickRate}% vs ${isWinnerA ? bClickRate : aClickRate}%)`}
                {ab.status === 'completed' && (
                  <span className="ml-2 text-green-600">
                    — Holdout group sent with winning variant
                  </span>
                )}
              </div>
            )}

            {ab.status === 'testing' && (
              <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                Test in progress. Winner will be picked after {ab.testDurationHours} hour{ab.testDurationHours > 1 ? 's' : ''} based on {ab.winnerMetric === 'open_rate' ? 'open rate' : 'click rate'}.
                Remaining {100 - (ab.splitPercentage || 20)}% of contacts ({totalRecipients - aStats.sent - bStats.sent} emails) are waiting.
              </div>
            )}

            <div className="mt-3 text-xs text-gray-400">
              Split: {(ab.splitPercentage || 20) / 2}% A + {(ab.splitPercentage || 20) / 2}% B + {100 - (ab.splitPercentage || 20)}% holdout
              {' | '}Duration: {ab.testDurationHours}h{' | '}Metric: {ab.winnerMetric === 'open_rate' ? 'Open Rate' : 'Click Rate'}
            </div>
          </div>
        );
      })()}

      {/* Email Preview */}
      {(() => {
        const previewSubject = campaign.template_snapshot_subject || campaign.template_subject || '';
        const previewHtml = campaign.template_snapshot_html || campaign.template_html_body || '';
        return (previewSubject || previewHtml || (campaign.attachments && campaign.attachments.length > 0)) ? (
        <div className="mt-6 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">Email Preview</h2>
              {campaign.template_version && campaign.started_at && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Template v{campaign.template_version} — as sent on {new Date(campaign.started_at).toLocaleString()}
                </p>
              )}
            </div>
            {previewContacts.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Preview as:</span>
                <select
                  value={selectedPreviewContact?.email || ''}
                  onChange={(e) => {
                    const contact = previewContacts.find(c => c.email === e.target.value);
                    setSelectedPreviewContact(contact || null);
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none"
                >
                  <option value="">Raw template (no variables)</option>
                  {previewContacts.map((c) => (
                    <option key={c.id} value={c.email}>
                      {c.name ? `${c.name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
                {selectedPreviewContact && (
                  <button onClick={() => setSelectedPreviewContact(null)} className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
                )}
              </div>
            )}
          </div>

          {/* Subject line */}
          {previewSubject && (
            <div className="border-b border-gray-100 px-6 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Subject</span>
              <p className="mt-1 text-sm font-semibold text-gray-800">
                {selectedPreviewContact ? replaceVars(previewSubject, selectedPreviewContact) : previewSubject}
              </p>
            </div>
          )}

          {/* Email body preview */}
          {previewHtml && (
            <div className="px-6 py-4">
              <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white shadow-inner">
                <iframe
                  ref={iframeRef}
                  sandbox="allow-same-origin"
                  title="Email body preview"
                  srcDoc={selectedPreviewContact ? replaceVars(previewHtml, selectedPreviewContact) : previewHtml}
                  className="w-full border-0"
                  style={{ minHeight: '400px' }}
                  onLoad={() => {
                    const iframe = iframeRef.current;
                    if (iframe?.contentDocument?.body) {
                      const height = iframe.contentDocument.body.scrollHeight;
                      iframe.style.height = Math.min(Math.max(height + 32, 200), 800) + 'px';
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Attachments */}
          {campaign.attachments && campaign.attachments.length > 0 && (
            <div className="border-t border-gray-100 px-6 py-4">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Attachments ({campaign.attachments.length})
              </span>
              <div className="mt-3 flex flex-wrap gap-3">
                {campaign.attachments.map((att, idx) => {
                  const isImage = att.contentType.startsWith('image/');
                  const isPdf = att.contentType === 'application/pdf';
                  const canPreview = isImage || isPdf;
                  const icon = isPdf ? '\u{1F4C4}' : isImage ? '\u{1F5BC}' : '\u{1F4CE}';
                  const sizeStr = att.size < 1024
                    ? `${att.size} B`
                    : att.size < 1024 * 1024
                      ? `${(att.size / 1024).toFixed(1)} KB`
                      : `${(att.size / (1024 * 1024)).toFixed(1)} MB`;

                  const previewUrl = `/api/v1/campaigns/${id}/attachments/${idx}?inline=true`;
                  const downloadUrl = `/api/v1/campaigns/${id}/attachments/${idx}`;

                  return (
                    <div
                      key={idx}
                      className="flex w-64 flex-col rounded-lg border border-gray-200 bg-gray-50 p-3"
                    >
                      {/* Thumbnail for images */}
                      {isImage && (
                        <div className="mb-2 flex items-center justify-center overflow-hidden rounded bg-white" style={{ height: 80 }}>
                          <img
                            src={previewUrl}
                            alt={att.filename}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800" title={att.filename}>
                            {att.filename}
                          </p>
                          <p className="text-xs text-gray-400">{sizeStr}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {canPreview && (
                          <button
                            onClick={() => setPreviewAttachment({ url: previewUrl, filename: att.filename })}
                            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          >
                            Preview
                          </button>
                        )}
                        <a
                          href={downloadUrl}
                          download={att.filename}
                          className="flex-1 rounded border border-primary-300 px-2 py-1 text-center text-xs font-medium text-primary-600 hover:bg-primary-50"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null;
      })()}

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="relative flex h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="truncate text-sm font-semibold text-gray-800">{previewAttachment.filename}</h3>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={previewAttachment.url}
                title={`Preview: ${previewAttachment.filename}`}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Recipients */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recipients</h2>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleExportRecipients}
                  className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-sm text-primary-700 hover:bg-primary-100"
                >
                  Export Selected ({effectiveSelectedCount.toLocaleString()})
                </button>
                <button
                  onClick={handleSuppressSelected}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
                >
                  Suppress Selected ({effectiveSelectedCount.toLocaleString()})
                </button>
              </>
            )}
            {selectedIds.size === 0 && (
              <button onClick={handleExportRecipients} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Export Recipients</button>
            )}
            <select value={recipientFilter} onChange={(e) => { setRecipientFilter(e.target.value); setRecipientPage(1); }} className="rounded border px-2 py-1 text-sm">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
            </select>
            <select value={bounceTypeFilter} onChange={(e) => { setBounceTypeFilter(e.target.value); setRecipientPage(1); }} className="rounded border px-2 py-1 text-sm">
              <option value="">All Bounce Types</option>
              <option value="permanent">Permanent</option>
              <option value="transient">Transient</option>
              <option value="undetermined">Undetermined</option>
            </select>
          </div>
        </div>

        {/* Select All Matching Banner */}
        {selectedIds.size === recipients.length && recipients.length > 0 && recipientTotal > recipients.length && (
          <div className="mt-2 rounded-lg bg-primary-50 border border-primary-200 px-4 py-2 text-sm text-primary-800">
            {selectAllMatching ? (
              <span>
                All <strong>{recipientTotal.toLocaleString()}</strong> matching recipients are selected.{' '}
                <button
                  onClick={() => { setSelectAllMatching(false); setSelectedIds(new Set()); }}
                  className="font-medium text-primary-600 underline hover:text-primary-800"
                >
                  Clear selection
                </button>
              </span>
            ) : (
              <span>
                {recipients.length} recipients on this page are selected.{' '}
                <button
                  onClick={() => setSelectAllMatching(true)}
                  className="font-medium text-primary-600 underline hover:text-primary-800"
                >
                  Select all {recipientTotal.toLocaleString()} matching recipients
                </button>
              </span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={recipients.length > 0 && selectedIds.size === recipients.length}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <SortableHeader label="Email" field="email" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} />
                <SortableHeader label="Status" field="status" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} />
                <SortableHeader label="Bounce Type" field="bounce_type" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} />
                <SortableHeader label="Sent" field="sent_at" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} />
                <SortableHeader label="Opens" field="open_count" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} className="text-center" />
                <SortableHeader label="Clicks" field="click_count" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} className="text-center" />
                <SortableHeader label="Last Opened" field="last_opened_at" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} />
                <SortableHeader label="Error" field="error_message" currentSort={recipientSort} onSort={(f) => setRecipientSort(toggleSort(recipientSort, f))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recipients.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400">No recipients</td></tr>
              ) : sortItems(recipients, recipientSort, (r: Recipient, field: string) => {
                switch (field) {
                  case 'email': return r.email;
                  case 'status': return r.status;
                  case 'bounce_type': return r.bounce_type || '';
                  case 'sent_at': return r.sent_at || '';
                  case 'open_count': return r.open_count || 0;
                  case 'click_count': return r.click_count || 0;
                  case 'last_opened_at': return r.last_opened_at || '';
                  case 'error_message': return r.error_message || '';
                  default: return null;
                }
              }).map((r) => (
                <React.Fragment key={r.id}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(r.id) ? 'bg-primary-50' : ''}`}
                    onClick={() => toggleRecipientEvents(r.id)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleRecipientSelect(r.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="mr-1 text-gray-400">{expandedRecipient === r.id ? '\u25BC' : '\u25B6'}</span>
                      {r.email}
                    </td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[r.status] || 'bg-gray-100'}`}>{r.status}</span></td>
                    <td className="px-3 py-2">
                      {r.bounce_type ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.bounce_type === 'permanent' ? 'bg-red-100 text-red-700' :
                          r.bounce_type === 'transient' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{r.bounce_type}</span>
                      ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
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
                      <td colSpan={9} className="bg-gray-50 px-6 py-3">
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
        {/* Pagination + page size */}
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Show</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setRecipientPage(1); }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
            <span className="text-gray-400">per page</span>
          </div>
          <span>{recipientTotal.toLocaleString()} recipients total</span>
          {Math.ceil(recipientTotal / pageSize) > 1 && (
            <div className="flex gap-2">
              <button disabled={recipientPage <= 1} onClick={() => setRecipientPage(recipientPage - 1)} className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-gray-50">Prev</button>
              <span className="px-2 py-1 text-xs">Page {recipientPage} of {Math.ceil(recipientTotal / pageSize)}</span>
              <button disabled={recipientPage >= Math.ceil(recipientTotal / pageSize)} onClick={() => setRecipientPage(recipientPage + 1)} className="rounded border px-3 py-1 text-xs disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Resend to Non-Openers Modal */}
      {showResendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowResendModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Resend to Non-Openers</h3>
            <p className="mt-2 text-sm text-gray-600">
              Create a new campaign targeting recipients who did not open this email.
            </p>

            {/* Non-opener count from campaign stats */}
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total recipients</span>
                <span className="font-medium">{totalRecipients}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-500">Opened</span>
                <span className="font-medium text-green-600">{openCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-500">Non-openers (estimated)</span>
                <span className="font-bold text-orange-600">{Math.max(0, sentCount - openCount)}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Subject Line</label>
              <input
                type="text"
                value={resendSubject}
                onChange={(e) => setResendSubject(e.target.value)}
                placeholder="Subject for the resend campaign"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">The new campaign will use the same template. You can edit it before sending.</p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowResendModal(false)}
                disabled={resending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!id) return;
                  setResending(true);
                  try {
                    const newCampaign = await resendToNonOpeners(id, { subject: resendSubject || undefined });
                    toast.success('Resend campaign created');
                    setShowResendModal(false);
                    if (newCampaign?.id) navigate(`/campaigns/${newCampaign.id}`);
                  } catch (err) {
                    toast.error((err as Error).message || 'Failed to create resend campaign');
                  } finally {
                    setResending(false);
                  }
                }}
                disabled={resending}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {resending ? 'Creating...' : 'Create Resend Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
