import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { useDashboard } from '../hooks/useDashboard';
import { useSesQuota, useSesStats } from '../hooks/useSettings';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { exportAnalytics } from '../api/analytics.api';
import { listCampaigns } from '../api/campaigns.api';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#f59e0b', '#6b7280'];

function num(val: string | number | undefined | null): string {
  return (Number(val) || 0).toLocaleString();
}
function toNum(val: string | number | undefined | null): number {
  return Number(val) || 0;
}
function rate(val: string | number | undefined | null): string {
  return (Number(val) || 0).toFixed(1);
}

// Date presets
const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All Time', days: 0 },
];

function DashboardContent() {
  const navigate = useNavigate();
  const { data: sesQuotaData } = useSesQuota(true);
  const [sesStatsEnabled, setSesStatsEnabled] = useState(false);
  const { data: sesStatsData, isLoading: sesStatsLoading } = useSesStats(sesStatsEnabled);
  const [datePreset, setDatePreset] = useState(30);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [campaignFilterMode, setCampaignFilterMode] = useState<'include' | 'exclude'>('include');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Load campaign list for filter dropdown
  useEffect(() => {
    listCampaigns({ page: '1', limit: '200' }).then((res) => {
      setCampaigns(res.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  // Build filter params
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (datePreset > 0 && !fromDate && !toDate) {
      const d = new Date();
      d.setDate(d.getDate() - datePreset);
      f.from = d.toISOString().slice(0, 10);
    }
    if (fromDate) f.from = fromDate;
    if (toDate) f.to = toDate;
    if (campaignFilter.length > 0) {
      if (campaignFilterMode === 'exclude') {
        f.excludeCampaignIds = campaignFilter.join(',');
      } else {
        f.campaignIds = campaignFilter.join(',');
      }
    }
    if (statusFilter) f.status = statusFilter;
    if (providerFilter) f.provider = providerFilter;
    return f;
  }, [datePreset, fromDate, toDate, campaignFilter, campaignFilterMode, statusFilter, providerFilter]);

  const { data, isLoading, isError, error } = useDashboard(filters);

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return (
    <div className="p-6">
      <div className="rounded-xl bg-red-50 p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load dashboard</p>
        <p className="mt-1 text-sm text-red-500">{(error as Error)?.message}</p>
      </div>
    </div>
  );
  if (!data) return <div className="p-6">No data available</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { stats, volume, topCampaigns, providerStats, bounceDomains, contactStats, statusBreakdown, dailyUsage, engagementTiers } = data as any;

  const volumeData = (volume || []).map((v: Record<string, string>) => ({
    date: v.date,
    sent: toNum(v.sent),
    opened: toNum(v.opened),
    clicked: toNum(v.clicked),
    bounced: toNum(v.bounced),
    failed: toNum(v.failed),
  }));

  const statusPieData = (statusBreakdown || []).map((s: { status: string; count: string }) => ({
    name: s.status,
    value: toNum(s.count),
  }));

  const providerPieData = (providerStats || []).map((p: { provider: string; sent: string }) => ({
    name: p.provider.toUpperCase(),
    value: toNum(p.sent),
  }));

  function handleExportCSV() {
    exportAnalytics(filters);
    toast.success('Downloading CSV report');
  }

  function handleExportPDF() {
    // Generate a printable HTML report and trigger browser print
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Please allow popups'); return; }

    const html = `<!DOCTYPE html><html><head><title>CadenceRelay Analytics Report</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
      h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
      h2 { color: #374151; margin-top: 30px; }
      .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
      .stat-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center; }
      .stat-value { font-size: 24px; font-weight: bold; }
      .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
      th { background: #f3f4f6; padding: 8px 12px; text-align: left; border-bottom: 2px solid #d1d5db; }
      td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
      .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <h1>CadenceRelay Analytics Report</h1>
    <p style="color: #6b7280;">Generated: ${new Date().toLocaleString()}${fromDate ? ` | From: ${fromDate}` : ''}${toDate ? ` | To: ${toDate}` : ''}</p>

    <h2>Overview</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value" style="color:#3b82f6">${num(stats.total_sent)}</div><div class="stat-label">Total Sent</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#22c55e">${rate(stats.open_rate)}%</div><div class="stat-label">Open Rate</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#a855f7">${rate(stats.click_rate)}%</div><div class="stat-label">Click Rate</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444">${rate(stats.bounce_rate)}%</div><div class="stat-label">Bounce Rate</div></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${rate(stats.delivery_rate)}%</div><div class="stat-label">Delivery Rate</div></div>
      <div class="stat-card"><div class="stat-value">${rate(stats.ctor)}%</div><div class="stat-label">Click-to-Open (CTOR)</div></div>
      <div class="stat-card"><div class="stat-value">${rate(stats.unsub_rate)}%</div><div class="stat-label">Unsubscribe Rate</div></div>
      <div class="stat-card"><div class="stat-value">${rate(stats.complaint_rate)}%</div><div class="stat-label">Complaint Rate</div></div>
    </div>

    <h2>Detailed Metrics</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Campaigns</td><td>${num(stats.total_campaigns)}</td></tr>
      <tr><td>Total Sent</td><td>${num(stats.total_sent)}</td></tr>
      <tr><td>Total Opens</td><td>${num(stats.total_opens)}</td></tr>
      <tr><td>Total Clicks</td><td>${num(stats.total_clicks)}</td></tr>
      <tr><td>Total Bounced</td><td>${num(stats.total_bounced)}</td></tr>
      <tr><td>Total Failed</td><td>${num(stats.total_failed)}</td></tr>
      <tr><td>Total Complaints</td><td>${num(stats.total_complaints)}</td></tr>
      <tr><td>Total Unsubscribes</td><td>${num(stats.total_unsubscribes)}</td></tr>
    </table>

    ${(topCampaigns || []).length > 0 ? `
    <h2>Campaign Performance</h2>
    <table>
      <tr><th>Campaign</th><th>Status</th><th>Provider</th><th>Sent</th><th>Opens</th><th>Clicks</th><th>Bounced</th><th>Open Rate</th><th>Click Rate</th></tr>
      ${(topCampaigns || []).map((c: Record<string, unknown>) => `<tr>
        <td>${c.name}</td><td>${c.status}</td><td>${c.provider}</td>
        <td>${c.sent_count}/${c.total_recipients}</td>
        <td>${c.open_count}</td><td>${c.click_count}</td><td>${c.bounce_count}</td>
        <td>${c.open_rate}%</td><td>${c.click_rate}%</td>
      </tr>`).join('')}
    </table>` : ''}

    ${(bounceDomains || []).length > 0 ? `
    <h2>Top Bouncing Domains</h2>
    <table>
      <tr><th>Domain</th><th>Bounce Count</th></tr>
      ${(bounceDomains || []).map((d: { domain: string; bounce_count: string }) => `<tr><td>${d.domain}</td><td>${d.bounce_count}</td></tr>`).join('')}
    </table>` : ''}

    <h2>Contact Health</h2>
    <table>
      <tr><th>Status</th><th>Count</th></tr>
      <tr><td>Total</td><td>${num(contactStats?.total)}</td></tr>
      <tr><td>Active</td><td>${num(contactStats?.active)}</td></tr>
      <tr><td>Bounced</td><td>${num(contactStats?.bounced)}</td></tr>
      <tr><td>Complained</td><td>${num(contactStats?.complained)}</td></tr>
      <tr><td>Unsubscribed</td><td>${num(contactStats?.unsubscribed)}</td></tr>
    </table>

    <div class="footer">Generated by CadenceRelay | ${window.location.origin}</div>
    <script>window.onload = function() { window.print(); }</script>
    </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    toast.success('PDF report opening...');
  }

  function clearFilters() {
    setDatePreset(30);
    setFromDate('');
    setToDate('');
    setCampaignFilter([]);
    setStatusFilter('');
    setProviderFilter('');
  }

  const hasActiveFilters = campaignFilter.length > 0 || statusFilter || providerFilter || fromDate || toDate;

  return (
    <div className="p-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => { setDatePreset(p.days); setFromDate(''); setToDate(''); }}
                className={`px-3 py-1.5 text-xs font-medium border-r last:border-r-0 ${
                  datePreset === p.days && !fromDate && !toDate
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              hasActiveFilters ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Filters {hasActiveFilters ? '•' : ''}
          </button>

          {/* Export buttons */}
          <button onClick={handleExportCSV} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Export CSV
          </button>
          <button onClick={handleExportPDF} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Export PDF
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setDatePreset(0); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">To Date</label>
              <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setDatePreset(0); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-medium text-gray-500">Campaigns</label>
                  {campaignFilter.length > 0 && (
                    <div className="flex rounded border border-gray-300 text-[10px]">
                      <button
                        onClick={() => setCampaignFilterMode('include')}
                        className={`px-2 py-0.5 ${campaignFilterMode === 'include' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                      >Include</button>
                      <button
                        onClick={() => setCampaignFilterMode('exclude')}
                        className={`px-2 py-0.5 ${campaignFilterMode === 'exclude' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                      >Exclude</button>
                    </div>
                  )}
                </div>
                {campaignFilter.length > 0 && (
                  <button onClick={() => setCampaignFilter([])} className="text-[10px] text-primary-600 hover:text-primary-800">
                    Clear all ({campaignFilter.length})
                  </button>
                )}
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-300 bg-white">
                {campaigns.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No campaigns</p>
                ) : campaigns.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${
                      campaignFilter.includes(c.id) ? 'bg-primary-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={campaignFilter.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCampaignFilter([...campaignFilter, c.id]);
                        } else {
                          setCampaignFilter(campaignFilter.filter((id) => id !== c.id));
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="sending">Sending</option>
                <option value="scheduled">Scheduled</option>
                <option value="draft">Draft</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Provider</label>
              <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
                <option value="">All Providers</option>
                <option value="ses">AWS SES</option>
                <option value="gmail">Gmail SMTP</option>
              </select>
            </div>
            <div className="flex items-end">
              {hasActiveFilters && (
                <button onClick={clearFilters} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Sent', value: num(stats.total_sent), sub: `${num(stats.total_campaigns)} campaigns`, color: 'text-blue-600' },
          { label: 'Open Rate', value: `${rate(stats.open_rate)}%`, sub: `${num(stats.total_opens)} opens`, color: 'text-green-600' },
          { label: 'Click Rate', value: `${rate(stats.click_rate)}%`, sub: `${num(stats.total_clicks)} clicks`, color: 'text-purple-600' },
          { label: 'Bounce Rate', value: `${rate(stats.bounce_rate)}%`, sub: `${num(stats.total_bounced)} bounced`, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-5 shadow-sm">
            <span className="text-sm text-gray-500">{s.label}</span>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <span className="text-xs text-gray-400">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Secondary KPI cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Delivery Rate', value: `${rate(stats.delivery_rate)}%`, color: 'text-teal-600' },
          { label: 'Click-to-Open (CTOR)', value: `${rate(stats.ctor)}%`, color: 'text-indigo-600' },
          { label: 'Unsubscribe Rate', value: `${rate(stats.unsub_rate)}%`, color: 'text-amber-600' },
          { label: 'Complaint Rate', value: `${rate(stats.complaint_rate)}%`, color: 'text-rose-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-white p-3 shadow-sm text-center">
            <span className="text-xs text-gray-500">{s.label}</span>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Daily Send Usage */}
      {dailyUsage && (
        <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Daily Send Usage (UTC)</h3>
          <p className="text-xs text-gray-500 mt-1">Emails sent today vs. configured daily limits. Campaigns auto-pause when limits are reached.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: 'Gmail (Legacy)', current: toNum(dailyUsage.gmail?.current), limit: toNum(dailyUsage.gmail?.limit), color: 'bg-blue-500' },
              { label: 'AWS SES (Legacy)', current: toNum(dailyUsage.ses?.current), limit: toNum(dailyUsage.ses?.limit), color: 'bg-orange-500' },
              ...((dailyUsage.accounts || []) as Array<{ id: string; label: string; provider_type: string; current: number; limit: number }>).map((a) => ({
                label: a.label,
                current: toNum(a.current),
                limit: toNum(a.limit),
                color: a.provider_type === 'gmail' ? 'bg-indigo-500' : 'bg-amber-500',
              })),
            ].map((p) => {
              const pct = p.limit > 0 ? Math.min(100, (p.current / p.limit) * 100) : 0;
              const isNearLimit = pct >= 80;
              return (
                <div key={p.label} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{p.label}</span>
                    <span className={`text-sm font-bold ${isNearLimit ? 'text-red-600' : 'text-gray-900'}`}>
                      {p.current.toLocaleString()} / {p.limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-2.5 rounded-full transition-all ${isNearLimit ? 'bg-red-500' : p.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="mt-1 block text-xs text-gray-400">{pct.toFixed(1)}% used</span>
                </div>
              );
            })}
          </div>
          {/* SES Quota from AWS */}
          {sesQuotaData && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              {sesQuotaData.sandbox && (
                <div className="flex items-center gap-1.5 rounded bg-yellow-100 border border-yellow-300 px-2 py-1 text-xs font-medium text-yellow-800 mb-2">
                  <span>&#9888;</span> SES Sandbox Mode
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-blue-700">
                <span>AWS SES quota (24h): {sesQuotaData.sentLast24Hours.toLocaleString()} / {sesQuotaData.max24HourSend.toLocaleString()}</span>
                <span>Max rate: {sesQuotaData.maxSendRate}/sec</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AWS SES Account Statistics */}
      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">AWS SES Account Statistics</h3>
            <p className="text-xs text-gray-500 mt-0.5">Aggregated send statistics from your AWS SES account (all time, 15-min intervals)</p>
          </div>
          {!sesStatsEnabled && (
            <button
              onClick={() => setSesStatsEnabled(true)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Load SES Stats
            </button>
          )}
        </div>
        {sesStatsLoading && <p className="mt-3 text-sm text-gray-400">Loading SES statistics...</p>}
        {sesStatsData && (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {[
                { label: 'Sent', value: num(sesStatsData.sent), color: 'text-blue-600' },
                { label: 'Delivered', value: num(sesStatsData.delivered), sub: `${rate(sesStatsData.deliveryRate)}%`, color: 'text-green-600' },
                { label: 'Complaints', value: num(sesStatsData.complaints), sub: `${rate(sesStatsData.complaintRate)}%`, color: 'text-orange-600' },
                { label: 'Transient Bounces', value: sesStatsData.transientBounces ? num(sesStatsData.transientBounces) : '—', sub: sesStatsData.transientBounces ? `${rate(sesStatsData.transientBounceRate)}%` : 'Classify to see', color: 'text-amber-600' },
                { label: 'Permanent Bounces', value: sesStatsData.permanentBounces ? num(sesStatsData.permanentBounces) : '—', sub: sesStatsData.permanentBounces ? `${rate(sesStatsData.permanentBounceRate)}%` : 'Classify to see', color: 'text-red-600' },
                { label: 'Opens', value: num(sesStatsData.opens), sub: `${rate(sesStatsData.openRate)}%`, color: 'text-emerald-600' },
                { label: 'Clicks', value: num(sesStatsData.clicks), sub: `${rate(sesStatsData.clickRate)}%`, color: 'text-purple-600' },
                { label: 'Total Bounces', value: num(sesStatsData.bounces), sub: `${rate(sesStatsData.bounceRate)}%`, color: 'text-red-500' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-200 p-3 text-center">
                  <span className="text-[10px] text-gray-500 leading-tight block">{s.label}</span>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  {s.sub && <span className="text-xs text-gray-400">{s.sub}</span>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              {sesStatsData.quota && (
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>24h quota: {num(sesStatsData.quota.sentLast24Hours)} / {num(sesStatsData.quota.max24HourSend)}</span>
                  <span>Max rate: {sesStatsData.quota.maxSendRate}/sec</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                {sesStatsData.bounces > 0 && !sesStatsData.permanentBounces && !sesStatsData.transientBounces && (
                  <a href="/bounces" className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                    ⚠ {num(sesStatsData.bounces)} unclassified bounces — Click "Classify & Import" on Bounces page
                  </a>
                )}
                <a href="/bounces" className="text-xs text-primary-600 hover:text-primary-800">
                  Manage Bounced Contacts →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Send Volume</h3>
          <div className="mt-4 h-64">
            {volumeData.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="sent" fill="#3b82f6" name="Sent" />
                  <Bar dataKey="bounced" fill="#ef4444" name="Bounced" />
                  <Bar dataKey="failed" fill="#f59e0b" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-gray-400">No data yet</div>}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Engagement</h3>
          <div className="mt-4 h-64">
            {volumeData.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="opened" stroke="#22c55e" name="Opens" strokeWidth={2} />
                  <Line type="monotone" dataKey="clicked" stroke="#a855f7" name="Clicks" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-gray-400">No data yet</div>}
          </div>
        </div>
      </div>

      {/* Charts row 2: Pie charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Campaign Status Breakdown */}
        {statusPieData.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900">Campaign Status Breakdown</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusPieData.map((_: unknown, index: number) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Provider Breakdown */}
        {providerPieData.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900">Provider Breakdown</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={providerPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {providerPieData.map((_: unknown, index: number) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Bounce domains */}
      {(bounceDomains || []).length > 0 && (
        <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Top Bouncing Domains</h3>
          <p className="text-xs text-gray-500 mt-1">Domains with the highest bounce rates — consider removing these from your lists</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(bounceDomains || []).map((d: { domain: string; bounce_count: string }, i: number) => (
              <div key={i} className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-sm font-mono font-medium text-red-700 truncate">{d.domain}</p>
                <p className="text-lg font-bold text-red-600">{d.bounce_count}</p>
                <span className="text-xs text-red-400">bounces</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact Health + Engagement */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Contact Health</h3>
          <div className="mt-3 grid grid-cols-5 gap-3 text-center text-sm">
            <div><p className="text-2xl font-bold text-gray-900">{num(contactStats?.total)}</p><span className="text-gray-500">Total</span></div>
            <div><p className="text-2xl font-bold text-green-600">{num(contactStats?.active)}</p><span className="text-gray-500">Active</span></div>
            <div><p className="text-2xl font-bold text-red-600">{num(contactStats?.bounced)}</p><span className="text-gray-500">Bounced</span></div>
            <div><p className="text-2xl font-bold text-orange-600">{num(contactStats?.complained)}</p><span className="text-gray-500">Complained</span></div>
            <div><p className="text-2xl font-bold text-gray-500">{num(contactStats?.unsubscribed)}</p><span className="text-gray-500">Unsubscribed</span></div>
          </div>
        </div>

        {/* Contact Engagement Tiers */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">Contact Engagement</h3>
          {engagementTiers && engagementTiers.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
              {(() => {
                const tierMap: Record<string, number> = {};
                for (const t of engagementTiers) tierMap[t.tier] = toNum(t.count);
                return (
                  <>
                    <div className="rounded-lg bg-green-50 p-4">
                      <p className="text-2xl font-bold text-green-600">{num(tierMap.hot || 0)}</p>
                      <span className="text-green-700 font-medium">Hot</span>
                      <p className="text-xs text-green-500 mt-0.5">Score 70+</p>
                    </div>
                    <div className="rounded-lg bg-yellow-50 p-4">
                      <p className="text-2xl font-bold text-yellow-600">{num(tierMap.warm || 0)}</p>
                      <span className="text-yellow-700 font-medium">Warm</span>
                      <p className="text-xs text-yellow-500 mt-0.5">Score 40-69</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-4">
                      <p className="text-2xl font-bold text-red-600">{num(tierMap.cold || 0)}</p>
                      <span className="text-red-700 font-medium">Cold</span>
                      <p className="text-xs text-red-500 mt-0.5">Score &lt;40</p>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="mt-3 text-center text-gray-400 text-sm">No engagement data yet</div>
          )}
        </div>
      </div>

      {/* Top Campaigns */}
      {(topCampaigns || []).length > 0 && (
        <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Campaign Performance</h3>
            <button onClick={() => navigate('/campaigns')} className="text-sm text-primary-600">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Campaign</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Provider</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Sent</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Opens</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Clicks</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Bounce %</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Open Rate</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Click Rate</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">CTOR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(topCampaigns || []).map((c: any) => {
                  const ctor = toNum(c.open_count) > 0 ? ((toNum(c.click_count) / toNum(c.open_count)) * 100).toFixed(1) : '0';
                  const bounceRateVal = toNum(c.sent_count) > 0 ? ((toNum(c.bounce_count) / toNum(c.sent_count)) * 100) : 0;
                  const bounceRateStr = bounceRateVal.toFixed(1);
                  const bounceColor = bounceRateVal > 5 ? 'text-red-600 font-medium' : bounceRateVal > 2 ? 'text-yellow-600' : 'text-green-600';
                  return (
                    <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[c.status] || ''}`}>{c.status}</span></td>
                      <td className="px-3 py-2 text-xs uppercase">{c.provider}</td>
                      <td className="px-3 py-2 text-right">{toNum(c.sent_count)}/{toNum(c.total_recipients)}</td>
                      <td className="px-3 py-2 text-right">{toNum(c.open_count)}</td>
                      <td className="px-3 py-2 text-right">{toNum(c.click_count)}</td>
                      <td className={`px-3 py-2 text-right ${bounceColor}`}>{bounceRateStr}%</td>
                      <td className="px-3 py-2 text-right font-medium text-green-600">{c.open_rate}%</td>
                      <td className="px-3 py-2 text-right font-medium text-purple-600">{c.click_rate}%</td>
                      <td className="px-3 py-2 text-right text-indigo-600">{ctor}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
