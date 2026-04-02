import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getContact, updateContact, deleteContact, Contact } from '../api/contacts.api';
import { getContactAnalytics } from '../api/analytics.api';
import { useCustomVariables } from '../hooks/useCustomVariables';
import { SortableHeader, SortState, sortItems, toggleSort } from '../components/ui/SortableHeader';

interface SendHistoryItem {
  campaign_id: string;
  campaign_name: string;
  status: string;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
}

interface ContactAnalyticsData {
  campaigns: Array<{
    recipient_id: string;
    campaign_id: string;
    campaign_name: string;
    status: string;
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    bounced_at: string | null;
    open_count: number;
    click_count: number;
    last_opened_at: string | null;
    last_clicked_at: string | null;
    error_message: string | null;
  }>;
  stats: {
    total_campaigns: string;
    delivered: string;
    opened: string;
    clicked: string;
    bounced: string;
    failed: string;
    total_opens: string;
    total_clicks: string;
  };
  events: Array<{
    event_type: string;
    metadata: Record<string, unknown>;
    ip_address: string;
    user_agent: string;
    created_at: string;
    campaign_name: string;
  }>;
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [history, setHistory] = useState<SendHistoryItem[]>([]);
  const [analytics, setAnalytics] = useState<ContactAnalyticsData | null>(null);
  const [showEventTimeline, setShowEventTimeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editMetadata, setEditMetadata] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [historySort, setHistorySort] = useState<SortState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editState, setEditState] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editBlock, setEditBlock] = useState('');
  const [editClasses, setEditClasses] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editManagement, setEditManagement] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const navigate = useNavigate();
  const { data: customVariables = [] } = useCustomVariables();

  function loadContact() {
    if (!id) return;
    getContact(id)
      .then((res) => {
        setContact(res.contact);
        setHistory(res.sendHistory);
      })
      .catch(() => toast.error('Failed to load contact'))
      .finally(() => setLoading(false));
    // Also load analytics
    getContactAnalytics(id)
      .then((res) => setAnalytics(res))
      .catch(() => { /* analytics optional */ });
  }

  useEffect(() => { loadContact(); }, [id]);

  function openEditModal() {
    if (!contact) return;
    setEditName(contact.name || '');
    setEditEmail(contact.email);
    setEditStatus(contact.status);
    setEditState(contact.state || '');
    setEditDistrict(contact.district || '');
    setEditBlock(contact.block || '');
    setEditClasses(contact.classes || '');
    setEditCategory(contact.category || '');
    setEditManagement(contact.management || '');
    setEditAddress(contact.address || '');
    // Populate metadata values from contact
    const meta: Record<string, string> = {};
    for (const cv of customVariables) {
      meta[cv.key] = (contact.metadata?.[cv.key] as string) || '';
    }
    setEditMetadata(meta);
    setShowEditModal(true);
  }

  async function handleDelete() {
    if (!id || !deletePassword) return;
    setDeleting(true);
    try {
      await deleteContact(id, deletePassword);
      toast.success('Contact deleted');
      navigate('/contacts');
    } catch {
      toast.error('Failed to delete — check admin password');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveEdit() {
    if (!id || !editEmail.trim()) return;
    setSaving(true);
    try {
      // Merge existing metadata with custom variable edits
      const mergedMetadata = { ...(contact?.metadata || {}), ...editMetadata };
      // Remove empty values
      for (const key of Object.keys(mergedMetadata)) {
        if (mergedMetadata[key] === '') delete mergedMetadata[key];
      }
      await updateContact(id, {
        email: editEmail,
        name: editName || null,
        status: editStatus,
        state: editState || null,
        district: editDistrict || null,
        block: editBlock || null,
        classes: editClasses || null,
        category: editCategory || null,
        management: editManagement || null,
        address: editAddress || null,
        metadata: mergedMetadata,
      } as Partial<Contact>);
      toast.success('Contact updated');
      setShowEditModal(false);
      loadContact();
    } catch {
      toast.error('Failed to update contact');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-gray-500">Loading...</div>;
  if (!contact) return <div className="p-6 text-gray-500">Contact not found</div>;

  return (
    <div className="p-6">
      <button onClick={() => navigate('/contacts')} className="mb-4 text-sm text-primary-600 hover:text-primary-800">&larr; Back to Contacts</button>

      {/* Basic Info */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{contact.name || contact.email}</h1>
            <p className="text-gray-500">{contact.email}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openEditModal}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span className="text-sm text-gray-500">Status</span>
            <p className={`font-medium ${contact.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>{contact.status}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Emails Sent</span>
            <p className="font-medium">{contact.send_count}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Bounces</span>
            <p className="font-medium">{contact.bounce_count}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Last Sent</span>
            <p className="font-medium">{contact.last_sent_at ? new Date(contact.last_sent_at).toLocaleDateString() : 'Never'}</p>
          </div>
        </div>

        {/* Engagement Score Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Engagement Score</span>
            <span className={`text-sm font-semibold ${
              (contact.engagement_score ?? 50) >= 70 ? 'text-green-600' :
              (contact.engagement_score ?? 50) >= 40 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {contact.engagement_score ?? 50}/100
              {' '}
              ({(contact.engagement_score ?? 50) >= 70 ? 'Hot' : (contact.engagement_score ?? 50) >= 40 ? 'Warm' : 'Cold'})
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full rounded-full bg-gray-200">
            <div
              className={`h-2.5 rounded-full transition-all ${
                (contact.engagement_score ?? 50) >= 70 ? 'bg-green-500' :
                (contact.engagement_score ?? 50) >= 40 ? 'bg-yellow-500' :
                'bg-red-500'
              }`}
              style={{ width: `${contact.engagement_score ?? 50}%` }}
            />
          </div>
        </div>
      </div>

      {/* School Information */}
      {(contact.state || contact.district || contact.block || contact.classes || contact.category || contact.management || contact.address) && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">School Information</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contact.state && (
              <div>
                <span className="text-sm text-gray-500">State</span>
                <p className="font-medium">{contact.state}</p>
              </div>
            )}
            {contact.district && (
              <div>
                <span className="text-sm text-gray-500">District</span>
                <p className="font-medium">{contact.district}</p>
              </div>
            )}
            {contact.block && (
              <div>
                <span className="text-sm text-gray-500">Block</span>
                <p className="font-medium">{contact.block}</p>
              </div>
            )}
            {contact.classes && (
              <div>
                <span className="text-sm text-gray-500">Classes</span>
                <p className="font-medium">{contact.classes}</p>
              </div>
            )}
            {contact.category && (
              <div>
                <span className="text-sm text-gray-500">Category</span>
                <p className="font-medium">{contact.category}</p>
              </div>
            )}
            {contact.management && (
              <div>
                <span className="text-sm text-gray-500">Management</span>
                <p className="font-medium">{contact.management}</p>
              </div>
            )}
            {contact.address && (
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="text-sm text-gray-500">Address</span>
                <p className="font-medium">{contact.address}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Variables Data */}
      {customVariables.length > 0 && customVariables.some(cv => contact.metadata?.[cv.key]) && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Custom Data</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customVariables.map((cv) => {
              const val = contact.metadata?.[cv.key];
              if (!val) return null;
              return (
                <div key={cv.id}>
                  <span className="text-sm text-gray-500">{cv.name}</span>
                  <p className="font-medium">{String(val)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lists */}
      {contact.lists && contact.lists.length > 0 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Lists</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {contact.lists.map((l) => (
              <span
                key={l.id}
                onClick={() => navigate(`/lists/${l.id}`)}
                className="cursor-pointer rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700 hover:bg-primary-200"
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Engagement Analytics */}
      {analytics && analytics.stats && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Engagement Analytics</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              { label: 'Campaigns', value: analytics.stats.total_campaigns, color: 'text-blue-600' },
              { label: 'Delivered', value: analytics.stats.delivered, color: 'text-green-600' },
              { label: 'Unique Opens', value: analytics.stats.opened, color: 'text-emerald-600' },
              { label: 'Total Opens', value: analytics.stats.total_opens, color: 'text-green-700' },
              { label: 'Total Clicks', value: analytics.stats.total_clicks, color: 'text-purple-600' },
              { label: 'Bounced', value: analytics.stats.bounced, color: 'text-orange-600' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-gray-50 p-3 text-center">
                <span className="text-xs text-gray-500">{s.label}</span>
                <p className={`text-lg font-bold ${s.color}`}>{s.value || 0}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign History with Open/Click Counts */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Campaign History</h2>
          {analytics?.events && analytics.events.length > 0 && (
            <button
              onClick={() => setShowEventTimeline(!showEventTimeline)}
              className="text-sm text-primary-600 hover:text-primary-800"
            >
              {showEventTimeline ? 'Show Table' : 'Show Event Timeline'}
            </button>
          )}
        </div>

        {!showEventTimeline ? (
          /* Table view */
          analytics?.campaigns && analytics.campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="mt-4 w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableHeader label="Campaign" field="campaign_name" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} />
                    <SortableHeader label="Status" field="status" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} />
                    <SortableHeader label="Sent" field="sent_at" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} />
                    <SortableHeader label="Opens" field="open_count" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="text-center" />
                    <SortableHeader label="Clicks" field="click_count" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="text-center" />
                    <SortableHeader label="Last Opened" field="last_opened_at" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} />
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortItems(analytics.campaigns, historySort, (c, field) => {
                    switch (field) {
                      case 'campaign_name': return c.campaign_name;
                      case 'status': return c.status;
                      case 'sent_at': return c.sent_at || '';
                      case 'open_count': return c.open_count;
                      case 'click_count': return c.click_count;
                      case 'last_opened_at': return c.last_opened_at || '';
                      default: return null;
                    }
                  }).map((c) => (
                    <tr key={c.recipient_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/campaigns/${c.campaign_id}`)}>
                      <td className="px-3 py-2 font-medium text-primary-600">{c.campaign_name}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          c.status === 'opened' || c.status === 'clicked' ? 'bg-green-100 text-green-700' :
                          c.status === 'sent' || c.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
                          c.status === 'bounced' ? 'bg-orange-100 text-orange-700' :
                          c.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{c.sent_at ? new Date(c.sent_at).toLocaleString() : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        {c.open_count > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">{c.open_count}</span>
                        ) : <span className="text-xs text-gray-400">0</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.click_count > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">{c.click_count}</span>
                        ) : <span className="text-xs text-gray-400">0</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{c.last_opened_at ? new Date(c.last_opened_at).toLocaleString() : '-'}</td>
                      <td className="px-3 py-2 text-xs text-red-500">{c.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : history.length === 0 ? (
            <p className="mt-4 text-center text-gray-400">No emails sent to this contact yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-4 w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableHeader label="Campaign" field="campaign_name" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="px-4" />
                    <SortableHeader label="Status" field="status" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="px-4" />
                    <SortableHeader label="Sent" field="sent_at" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="px-4" />
                    <SortableHeader label="Opened" field="opened_at" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="px-4" />
                    <SortableHeader label="Clicked" field="clicked_at" currentSort={historySort} onSort={(f) => setHistorySort(toggleSort(historySort, f))} className="px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortItems(history, historySort, (h, field) => {
                    switch (field) {
                      case 'campaign_name': return h.campaign_name;
                      case 'status': return h.status;
                      case 'sent_at': return h.sent_at || '';
                      case 'opened_at': return h.opened_at || '';
                      case 'clicked_at': return h.clicked_at || '';
                      default: return null;
                    }
                  }).map((h, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{h.campaign_name}</td>
                      <td className="px-4 py-2">{h.status}</td>
                      <td className="px-4 py-2">{h.sent_at ? new Date(h.sent_at).toLocaleString() : '-'}</td>
                      <td className="px-4 py-2">{h.opened_at ? new Date(h.opened_at).toLocaleString() : '-'}</td>
                      <td className="px-4 py-2">{h.clicked_at ? new Date(h.clicked_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Event Timeline view */
          <div className="mt-4 max-h-96 overflow-y-auto">
            {analytics?.events && analytics.events.length > 0 ? (
              <div className="space-y-2">
                {analytics.events.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                    <span className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${
                      ev.event_type === 'opened' ? 'bg-green-100 text-green-700' :
                      ev.event_type === 'clicked' ? 'bg-purple-100 text-purple-700' :
                      ev.event_type === 'sent' ? 'bg-blue-100 text-blue-700' :
                      ev.event_type === 'bounced' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{ev.event_type}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ev.campaign_name}</p>
                      <p className="text-xs text-gray-500">{new Date(ev.created_at).toLocaleString()}</p>
                      {ev.event_type === 'clicked' && ev.metadata?.url ? (
                        <p className="text-xs text-purple-600 truncate">{String(ev.metadata.url as string)}</p>
                      ) : null}
                    </div>
                    {ev.ip_address && <span className="text-xs font-mono text-gray-400">{ev.ip_address}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400">No events recorded</p>
            )}
          </div>
        )}
      </div>

      {/* Edit Contact Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">Edit Contact</h3>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none">
                  <option value="active">Active</option>
                  <option value="bounced">Bounced</option>
                  <option value="complained">Complained</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
              </div>

              {/* School Information */}
              <div className="border-t border-gray-200 pt-3 mt-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">School Information</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
                  <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">District</label>
                  <input type="text" value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Block</label>
                  <input type="text" value={editBlock} onChange={(e) => setEditBlock(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Classes</label>
                  <input type="text" value={editClasses} onChange={(e) => setEditClasses(e.target.value)} placeholder="e.g. 1-12" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <input type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Management</label>
                  <input type="text" value={editManagement} onChange={(e) => setEditManagement(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
                <textarea value={editAddress} onChange={(e) => setEditAddress(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
              </div>

              {/* Custom Variables */}
              {customVariables.length > 0 && (
                <>
                  <div className="border-t border-gray-200 pt-3 mt-1">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custom Fields</p>
                  </div>
                  {customVariables.map((cv) => (
                    <div key={cv.id}>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {cv.name}{cv.required && ' *'}
                      </label>
                      {cv.type === 'select' ? (
                        <select
                          value={editMetadata[cv.key] || ''}
                          onChange={(e) => setEditMetadata({ ...editMetadata, [cv.key]: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                        >
                          <option value="">-- Select --</option>
                          {cv.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={cv.type === 'number' ? 'number' : cv.type === 'date' ? 'date' : 'text'}
                          value={editMetadata[cv.key] || ''}
                          onChange={(e) => setEditMetadata({ ...editMetadata, [cv.key]: e.target.value })}
                          placeholder={cv.default_value || ''}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowEditModal(false)} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving || !editEmail.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold text-red-600">Delete Contact</h3>
            <p className="mt-2 text-sm text-gray-600">This will permanently delete <strong>{contact.name || contact.email}</strong> and all associated data. Enter admin password to confirm.</p>
            <input
              type="password"
              placeholder="Admin password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }} disabled={deleting} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting || !deletePassword} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
