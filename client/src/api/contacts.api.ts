import apiClient from './client';
import { UploadState, createTrackedUpload } from '../lib/uploadHelper';

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  metadata: Record<string, unknown>;
  status: string;
  bounce_count: number;
  send_count: number;
  last_sent_at: string | null;
  created_at: string;
  state: string | null;
  district: string | null;
  block: string | null;
  classes: string | null;
  category: string | null;
  management: string | null;
  address: string | null;
  engagement_score?: number;
  health_status?: string;
  health_checked_at?: string | null;
  lists?: { id: string; name: string }[];
}

export interface ContactFilters {
  states: string[];
  districts: string[];
  blocks: string[];
  categories: string[];
  managements: string[];
  stateCounts?: Record<string, number>;
  districtCounts?: Record<string, number>;
  blockCounts?: Record<string, number>;
  categoryCounts?: Record<string, number>;
  managementCounts?: Record<string, number>;
}

export interface CSVPreviewResult {
  headers: string[];
  autoMapping: Record<string, string>;
  previewRows: string[][];
  totalRows: number;
}

export interface CSVImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
  total: number;
  errors: string[];
  detectedColumns: string[];
}

export async function listContacts(params: Record<string, string> = {}) {
  const res = await apiClient.get('/contacts', { params });
  return res.data;
}

export async function getContact(id: string) {
  const res = await apiClient.get(`/contacts/${id}`);
  return res.data;
}

export async function createContact(data: {
  email: string;
  name?: string;
  state?: string;
  district?: string;
  block?: string;
  classes?: string;
  category?: string;
  management?: string;
  address?: string;
  metadata?: Record<string, unknown>;
  listIds?: string[];
}) {
  const res = await apiClient.post('/contacts', data);
  return res.data;
}

export async function updateContact(id: string, data: Partial<Contact>) {
  const res = await apiClient.put(`/contacts/${id}`, data);
  return res.data;
}

export async function deleteContact(id: string, adminPassword: string) {
  const res = await apiClient.delete(`/contacts/${id}`, { data: { adminPassword } });
  return res.data;
}

export async function bulkDeleteContacts(ids: string[], adminPassword: string) {
  const res = await apiClient.delete('/contacts/bulk', { data: { ids, adminPassword } });
  return res.data;
}

export async function deleteSuppressedContacts(adminPassword: string) {
  const res = await apiClient.delete('/contacts/suppressed', { data: { adminPassword } });
  return res.data;
}

export async function importContacts(file: File, listId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (listId) formData.append('listId', listId);
  const res = await apiClient.post('/contacts/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// Column name mapping: CSV header -> DB column (mirrors server-side COLUMN_MAP)
const COLUMN_MAP: Record<string, string> = {
  email: 'email',
  name: 'name',
  school_name: 'name',
  state: 'state',
  district: 'district',
  block: 'block',
  classes: 'classes',
  category: 'category',
  management: 'management',
  address: 'address',
};

/** Parse a single CSV line handling quoted fields with commas/newlines */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Preview CSV **client-side** — reads only the first ~64KB of the file
 * to extract headers + first 10 rows. Works instantly even for 65MB+ files.
 */
export async function previewCSV(file: File): Promise<CSVPreviewResult> {
  // Read only the first 64KB — more than enough for header + 10 rows
  const CHUNK_SIZE = 64 * 1024;
  const slice = file.slice(0, CHUNK_SIZE);
  const text = await slice.text();

  // Split into lines (handle \r\n and \n)
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim());

  if (rawLines.length < 1) {
    throw new Error('CSV file is empty');
  }

  const headers = parseCSVLine(rawLines[0]).map((h) => h.trim());

  // Auto-detect column mapping
  const autoMapping: Record<string, string> = {};
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (COLUMN_MAP[lower]) {
      autoMapping[header] = COLUMN_MAP[lower];
    }
  }

  // Get first 10 data rows
  const previewRows: string[][] = [];
  for (let i = 1; i < Math.min(rawLines.length, 11); i++) {
    previewRows.push(parseCSVLine(rawLines[i]));
  }

  // Count total lines by scanning for newlines in the entire file
  // For very large files, estimate from file size and avg line length
  let totalRows: number;
  if (file.size <= CHUNK_SIZE) {
    totalRows = rawLines.length - 1; // exact count for small files
  } else {
    // Estimate: (file_size / avg_bytes_per_line_in_sample) - 1 header
    const sampleBytes = new Blob([rawLines.slice(0, 11).join('\n')]).size;
    const avgBytesPerLine = sampleBytes / Math.min(rawLines.length, 11);
    totalRows = Math.round(file.size / avgBytesPerLine) - 1;
  }

  return { headers, autoMapping, previewRows, totalRows };
}

/**
 * Import contacts from CSV with tracked upload progress and cancellation support.
 * Returns an object with the promise and an abort function.
 */
export function importContactsCSVTracked(
  file: File,
  listId?: string,
  columnMapping?: Record<string, string>,
  onProgress?: (state: UploadState) => void,
  signal?: AbortSignal,
): { promise: Promise<CSVImportResult>; abort: () => void } {
  const formData = new FormData();
  formData.append('file', file);
  if (listId) formData.append('listId', listId);
  if (columnMapping) formData.append('columnMapping', JSON.stringify(columnMapping));

  return createTrackedUpload<CSVImportResult>({
    url: '/contacts/import-csv',
    formData,
    onProgress,
    signal,
  });
}

/** Legacy wrapper kept for backward compatibility */
export async function importContactsCSV(
  file: File,
  listId?: string,
  columnMapping?: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<CSVImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (listId) formData.append('listId', listId);
  if (columnMapping) formData.append('columnMapping', JSON.stringify(columnMapping));
  const res = await apiClient.post('/contacts/import-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
      }
    },
  });
  return res.data;
}

export interface BulkUpdatePayload {
  contactIds: string[];
  updates: {
    status?: string;
    state?: string;
    district?: string;
    block?: string;
    category?: string;
    management?: string;
    name?: string;
    classes?: string;
    address?: string;
    metadata?: Record<string, string>;
  };
}

export async function bulkUpdateContacts(payload: BulkUpdatePayload): Promise<{ updated: number }> {
  const res = await apiClient.put('/contacts/bulk-update', payload);
  return res.data;
}

export async function exportContacts(listId?: string) {
  const params = listId ? { listId } : {};
  const res = await apiClient.get('/contacts/export', { params, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'contacts.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function getContactFilters(params: Record<string, string> = {}): Promise<ContactFilters> {
  const res = await apiClient.get('/contacts/filters', { params });
  return res.data;
}

export async function getFilteredContactCount(criteria: Record<string, unknown>): Promise<number> {
  const res = await apiClient.post('/contacts/count-filtered', criteria);
  return res.data.count;
}

// ── Bounce Management ──

export interface BouncedEmail {
  id: string;
  email: string;
  status: string;
  bounce_type: string;
  error_message: string | null;
  bounced_at: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_status: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
}

export interface BounceStats {
  total: number;
  permanent: number;
  transient: number;
  undetermined: number;
  suppressed: number;
}

export async function listBouncedEmails(params: Record<string, string> = {}) {
  const res = await apiClient.get('/contacts/bounced', { params });
  return res.data as {
    data: BouncedEmail[];
    stats: BounceStats;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
}

// ── Email Verification ──

export interface EmailVerificationResult {
  email: string;
  valid: boolean;
  checks: {
    syntax: 'pass' | 'fail';
    mx: 'pass' | 'fail' | 'unknown';
    disposable: 'pass' | 'fail';
    roleBased: 'pass' | 'warning';
    previouslyBounced: 'pass' | 'fail';
  };
  risk: 'low' | 'medium' | 'high';
  suggestion: string | null;
}

export async function verifyEmails(emails: string[]): Promise<{ results: EmailVerificationResult[] }> {
  const res = await apiClient.post('/contacts/verify-emails', { emails });
  return res.data;
}

export async function verifyListEmails(listId: string) {
  const res = await apiClient.post(`/contacts/verify-list/${listId}`);
  return res.data as {
    results: EmailVerificationResult[];
    summary: { total: number; valid: number; invalid: number; risky: number };
  };
}

// ── Contact Health Check ──

export interface HealthCheckProgress {
  total: number;
  checked: number;
  good: number;
  risky: number;
  invalid: number;
  suppressed: number;
  status: 'running' | 'completed' | 'idle';
  startedAt: string | null;
}

export interface HealthStats {
  good: number;
  risky: number;
  invalid: number;
  suppressed: number;
  unchecked: number;
}

export async function startHealthCheck(): Promise<{ message: string; totalUnchecked: number }> {
  const res = await apiClient.post('/contacts/health-check');
  return res.data;
}

export async function getHealthCheckProgress(): Promise<HealthCheckProgress> {
  const res = await apiClient.get('/contacts/health-check');
  return res.data;
}

export async function getHealthStats(): Promise<HealthStats> {
  const res = await apiClient.get('/contacts/health-stats');
  return res.data;
}

// ── Bulk Filtered Operations ──

export interface ContactFilterParams {
  search?: string;
  status?: string;
  listId?: string;
  state?: string;
  district?: string;
  block?: string;
  category?: string;
  management?: string;
  engagement_min?: string;
  engagement_max?: string;
  health_status?: string;
}

export async function bulkSuppressContacts(payload: { contactIds?: string[]; filters?: ContactFilterParams; reason?: string }): Promise<{ suppressed: number; message: string }> {
  const res = await apiClient.post('/contacts/bulk-suppress', payload);
  return res.data;
}

export async function bulkDeleteFiltered(filters: ContactFilterParams, adminPassword: string): Promise<{ deleted: number; message: string }> {
  const res = await apiClient.delete('/contacts/bulk-delete-filtered', { data: { filters, adminPassword } });
  return res.data;
}
