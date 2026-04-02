import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  listBouncedEmails,
  BouncedEmail,
  BounceStats,
} from '../api/contacts.api';
import { listCampaigns } from '../api/campaigns.api';
import { classifyAndImportBounces } from '../api/settings.api';
import apiClient from '../api/client';

const bounceTypeColors: Record<string, string> = {
  permanent: 'bg-red-100 text-red-700',
  transient: 'bg-orange-100 text-orange-700',
  undetermined: 'bg-gray-100 text-gray-700',
};

type TabKey = 'all' | 'permanent' | 'transient' | 'failed';

export default function BounceManagement() {
  const navigate = useNavigate();
  const [data, setData] = useState<BouncedEmail[]>([]);
  const [stats, setStats] = useState<BounceStats>({ total: 0, permanent: 0, transient: 0, undetermined: 0, suppressed: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load campaigns for filter
  useEffect(() => {
    listCampaigns().then((res) => {
      setCampaigns((res.data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(pagination.page),
        limit: String(pagination.limit),
      };
      if (tab === 'permanent') params.bounceType = 'permanent';
      else if (tab === 'transient') params.bounceType = 'transient';
      else if (tab === 'failed') params.bounceType = 'undetermined';
      if (search.trim()) params.search = search.trim();
      if (campaignId) params.campaignId = campaignId;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await listBouncedEmails(params);
      setData(res.data);
      setStats(res.stats);
      setPagination(res.pagination);
    } catch {
      toast.error('Failed to load bounced emails');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, tab, search, campaignId, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleTabChange(newTab: TabKey) {
    setTab(newTab);
    setPagination((p) => ({ ...p, page: 1 }));
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === data.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map((d) => d.id)));
    }
  }

  async function handleAddToSuppression(emails: string[]) {
    if (emails.length === 0) return;
    setActionLoading(true);
    try {
      await apiClient.post('/suppression', { emails });
      toast.success(`${emails.length} email(s) added to suppression list`);
      fetchData();
      setSelected(new Set());
    } catch {
      toast.error('Failed to add to suppression list');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkSuppression() {
    const emails = data.filter((d) => selected.has(d.id)).map((d) => d.email);
    await handleAddToSuppression(emails);
  }

  async function handleDeleteContact(contactId: string) {
    // Navigate to contact for deletion (deletion requires admin password)
    navigate(`/contacts/${contactId}`);
  }

  function handleCreateCampaign() {
    const emails = data.filter((d) => selected.has(d.id)).map((d) => d.email);
    // Store in sessionStorage and navigate to campaign create
    sessionStorage.setItem('bounceManagement_selectedEmails', JSON.stringify(emails));
    navigate('/campaigns/new?fromBounces=true');
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'permanent', label: 'Permanent', count: stats.permanent },
    { key: 'transient', label: 'Transient', count: stats.transient },
    { key: 'failed', label: 'Failed', count: stats.undetermined },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bounce Management</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor and manage bounced emails across all campaigns</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                toast.loading('Classifying bounces...', { id: 'classify' });
                const result = await classifyAndImportBounces();
                toast.success(
                  `Classified ${result.classified.permanent} permanent, ${result.classified.transient} transient, ${result.classified.undetermined} undetermined. ${result.suppressed} added to suppression list.`,
                  { id: 'classify', duration: 8000 }
                );
                fetchData();
              } catch {
                toast.error('Failed to classify bounces', { id: 'classify' });
              }
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            Classify & Import Bounces
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Bounced" value={stats.total} color="text-gray-900" bg="bg-white" />
        <StatCard label="Permanent" value={stats.permanent} color="text-red-700" bg="bg-red-50" />
        <StatCard label="Transient" value={stats.transient} color="text-orange-700" bg="bg-orange-50" />
        <StatCard label="Suppressed" value={stats.suppressed} color="text-blue-700" bg="bg-blue-50" />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search email or contact name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-64"
        />
        <select
          value={campaignId}
          onChange={(e) => { setCampaignId(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          title="To date"
        />
        {(search || campaignId || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setCampaignId(''); setDateFrom(''); setDateTo(''); setPagination((p) => ({ ...p, page: 1 })); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-primary-50 px-4 py-2">
          <span className="text-sm font-medium text-primary-700">{selected.size} selected</span>
          <button
            onClick={handleBulkSuppression}
            disabled={actionLoading}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Add to Suppression ({selected.size})
          </button>
          <button
            onClick={handleCreateCampaign}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            Create Campaign for Selected
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">
            Deselect all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="mt-4 rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={data.length > 0 && selected.size === data.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Email</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Contact Name</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Bounce Type</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Campaign</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Error</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Bounced At</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No bounced emails found</td></tr>
            ) : data.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-3 font-medium">{row.email}</td>
                <td className="px-3 py-3 text-gray-600">{row.contact_name || '-'}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bounceTypeColors[row.bounce_type] || bounceTypeColors.undetermined}`}>
                    {row.bounce_type || 'undetermined'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {row.campaign_name ? (
                    <button
                      onClick={() => navigate(`/campaigns/${row.campaign_id}`)}
                      className="text-primary-600 hover:text-primary-800 text-xs"
                    >
                      {row.campaign_name}
                    </button>
                  ) : '-'}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500 max-w-xs truncate" title={row.error_message || ''}>
                  {row.error_message || '-'}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500">
                  {row.bounced_at ? new Date(row.bounced_at).toLocaleString() : '-'}
                </td>
                <td className="px-3 py-3 relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === row.id ? null : row.id); }}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {menuOpen === row.id && (
                    <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg bg-white shadow-lg border" onClick={() => setMenuOpen(null)}>
                      {row.contact_id && (
                        <button
                          onClick={() => navigate(`/contacts/${row.contact_id}`)}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          View Contact
                        </button>
                      )}
                      <button
                        onClick={() => handleAddToSuppression([row.email])}
                        className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Add to Suppression
                      </button>
                      {row.contact_id && (
                        <button
                          onClick={() => handleDeleteContact(row.contact_id!)}
                          className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete Contact
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} results)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Close menu on outside click */}
      {menuOpen && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm ${bg}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
