import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listCampaigns, deleteCampaign, bulkDeleteCampaigns, Campaign } from '../api/campaigns.api';
import AdminPasswordModal from '../components/ui/AdminPasswordModal';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ type: 'single' | 'bulk'; id?: string } | null>(null);
  const navigate = useNavigate();

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      const res = await listCampaigns(params);
      setCampaigns(res.data);
      setTotal(res.pagination.total);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // Clear selection when page/filter changes
  useEffect(() => { setSelectedIds(new Set()); }, [page, statusFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === campaigns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(campaigns.map((c) => c.id)));
    }
  }

  async function handleDeleteConfirm(password: string) {
    if (!deleteModal) return;

    if (deleteModal.type === 'single' && deleteModal.id) {
      await deleteCampaign(deleteModal.id, password);
      toast.success('Campaign deleted');
    } else if (deleteModal.type === 'bulk') {
      const ids = Array.from(selectedIds);
      await bulkDeleteCampaigns(ids, password);
      toast.success(`${ids.length} campaign(s) deleted`);
      setSelectedIds(new Set());
    }

    setDeleteModal(null);
    fetchCampaigns();
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setDeleteModal({ type: 'bulk' })}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            >
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button onClick={() => navigate('/campaigns/new')} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
            New Campaign
          </button>
        </div>
      </div>

      <div className="mt-4">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sending">Sending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={campaigns.length > 0 && selectedIds.size === campaigns.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Sent</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Opens</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Clicks</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Bounced</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No campaigns found</td></tr>
            ) : campaigns.map((c) => (
              <tr key={c.id} className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(c.id) ? 'bg-primary-50' : ''}`}>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-3 font-medium" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.name}</td>
                <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.status] || ''}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 uppercase text-xs" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.provider}</td>
                <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.sent_count}/{c.total_recipients}</td>
                <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.open_count}</td>
                <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.click_count}</td>
                <td className="px-4 py-3" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.bounce_count}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteModal({ type: 'single', id: c.id }); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{total} campaigns total</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Prev</button>
            <span className="px-3 py-1">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {deleteModal && (
        <AdminPasswordModal
          title={
            deleteModal.type === 'single'
              ? 'Delete campaign?'
              : `Delete ${selectedIds.size} campaign(s)?`
          }
          description="This action cannot be undone. All associated recipients, email events, and attachments will be permanently removed."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}
