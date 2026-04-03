import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  exportContacts,
  Contact,
  updateContact,
  startHealthCheck as apiStartHealthCheck,
  getHealthCheckProgress,
  getHealthStats,
  HealthCheckProgress,
  HealthStats,
  bulkSuppressContacts,
  bulkDeleteFiltered,
  deleteSuppressedContacts,
  ContactFilterParams,
} from '../api/contacts.api';
import { createSmartList, ContactList } from '../api/lists.api';
import { useQueryClient } from '@tanstack/react-query';
import { useContactsList, useCreateContact, useDeleteContact, useBulkDeleteContacts, useBulkUpdateContacts, useUpdateContact } from '../hooks/useContacts';
import { useListsList } from '../hooks/useLists';
import { useContactFilters } from '../hooks/useFilters';
import { useCustomVariables, useCreateCustomVariable } from '../hooks/useCustomVariables';
import { CustomVariable } from '../api/customVariables.api';
import { TableSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import AdminPasswordModal from '../components/ui/AdminPasswordModal';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─── Inline Editable Cell ─── */
/* InlineEditCell removed — contacts table now navigates to detail on click */

/* ─── Edit Contact Modal (reused for per-row edit) ─── */
function EditContactModal({
  contact,
  customVariables,
  onClose,
  onSaved,
}: {
  contact: Contact;
  customVariables: CustomVariable[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editName, setEditName] = useState(contact.name || '');
  const [editEmail, setEditEmail] = useState(contact.email);
  const [editStatus, setEditStatus] = useState(contact.status);
  const [editState, setEditState] = useState(contact.state || '');
  const [editDistrict, setEditDistrict] = useState(contact.district || '');
  const [editBlock, setEditBlock] = useState(contact.block || '');
  const [editCategory, setEditCategory] = useState(contact.category || '');
  const [editManagement, setEditManagement] = useState(contact.management || '');
  const [editClasses, setEditClasses] = useState(contact.classes || '');
  const [editAddress, setEditAddress] = useState(contact.address || '');
  const [editMetadata, setEditMetadata] = useState<Record<string, string>>(() => {
    const meta: Record<string, string> = {};
    for (const cv of customVariables) {
      meta[cv.key] = (contact.metadata?.[cv.key] as string) || '';
    }
    return meta;
  });
  const [saving, setSaving] = useState(false);
  const [showCreateVar, setShowCreateVar] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<'text' | 'number' | 'date' | 'select'>('text');
  const createVarMut = useCreateCustomVariable();

  async function handleCreateVar() {
    if (!newVarName.trim()) return;
    try {
      await createVarMut.mutateAsync({ name: newVarName, type: newVarType });
      setShowCreateVar(false);
      setNewVarName('');
      setNewVarType('text');
    } catch { /* handled by mutation */ }
  }

  async function handleSave() {
    if (!editEmail.trim()) return;
    setSaving(true);
    try {
      const mergedMetadata = { ...(contact.metadata || {}), ...editMetadata };
      for (const key of Object.keys(mergedMetadata)) {
        if (mergedMetadata[key] === '') delete mergedMetadata[key];
      }
      await updateContact(contact.id, {
        email: editEmail,
        name: editName || null,
        status: editStatus,
        metadata: mergedMetadata,
      } as Partial<Contact>);
      toast.success('Contact updated');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to update contact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Edit Contact</h3>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none">
              <option value="active">Active</option>
              <option value="bounced">Bounced</option>
              <option value="complained">Complained</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">School Fields</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
              <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">District</label>
              <input type="text" value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Block</label>
              <input type="text" value={editBlock} onChange={(e) => setEditBlock(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <input type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Management</label>
              <input type="text" value={editManagement} onChange={(e) => setEditManagement(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Classes</label>
              <input type="text" value={editClasses} onChange={(e) => setEditClasses(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
            <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
          </div>

          {customVariables.length > 0 && (
            <>
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custom Fields</p>
              </div>
              {customVariables.map((cv) => (
                <div key={cv.id}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {cv.name}{cv.required && ' *'} <span className="text-xs text-gray-400">{'{{' + cv.key + '}}'}</span>
                  </label>
                  {cv.type === 'select' ? (
                    <select
                      value={editMetadata[cv.key] || ''}
                      onChange={(e) => setEditMetadata({ ...editMetadata, [cv.key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                    >
                      <option value="">-- Select --</option>
                      {cv.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
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

          {/* Inline Create Variable */}
          <div className="border-t border-gray-200 pt-3">
            {!showCreateVar ? (
              <button onClick={() => setShowCreateVar(true)}
                className="text-xs font-medium text-primary-600 hover:text-primary-800">
                + Create new custom variable
              </button>
            ) : (
              <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-700">New Custom Variable</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="Variable name (e.g. Principal Name)" value={newVarName}
                    onChange={(e) => setNewVarName(e.target.value)}
                    className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateVar(); }} />
                  <select value={newVarType} onChange={(e) => setNewVarType(e.target.value as 'text' | 'number' | 'date' | 'select')}
                    className="rounded-lg border px-2 py-1.5 text-sm">
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Select</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateVar} disabled={!newVarName.trim() || createVarMut.isPending}
                    className="rounded-lg bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50">
                    {createVarMut.isPending ? 'Creating...' : 'Create & Add Field'}
                  </button>
                  <button onClick={() => { setShowCreateVar(false); setNewVarName(''); }}
                    className="rounded-lg border px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || !editEmail.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Bulk Edit Modal ─── */
function BulkEditModal({
  selectedCount,
  selectedIds,
  customVariables,
  onClose,
  onSubmit,
}: {
  selectedCount: number;
  selectedIds: string[];
  customVariables: CustomVariable[];
  onClose: () => void;
  onSubmit: (contactIds: string[], updates: Record<string, unknown>) => Promise<void>;
}) {
  const [enabledFields, setEnabledFields] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({
    status: 'active',
    state: '',
    district: '',
    block: '',
    category: '',
    management: '',
  });
  const [metadataValues, setMetadataValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function toggleField(field: string) {
    setEnabledFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function handleSubmit() {
    const updates: Record<string, unknown> = {};
    const standardFields = ['status', 'state', 'district', 'block', 'category', 'management'];
    for (const f of standardFields) {
      if (enabledFields.has(f)) updates[f] = values[f];
    }
    const meta: Record<string, string> = {};
    for (const cv of customVariables) {
      if (enabledFields.has(`meta_${cv.key}`)) {
        meta[cv.key] = metadataValues[cv.key] || '';
      }
    }
    if (Object.keys(meta).length > 0) updates.metadata = meta;

    if (Object.keys(updates).length === 0) {
      toast.error('Select at least one field to update');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(selectedIds, updates);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const checkedCount = enabledFields.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Bulk Edit Contacts</h3>
        <p className="mt-1 text-sm text-gray-500">
          Apply changes to <span className="font-semibold text-primary-600">{selectedCount}</span> selected contact{selectedCount !== 1 ? 's' : ''}.
          Check the fields you want to update.
        </p>

        <div className="mt-4 space-y-3">
          {/* Standard fields */}
          {[
            { key: 'status', label: 'Status', type: 'select', options: ['active', 'bounced', 'complained', 'unsubscribed'] },
            { key: 'state', label: 'State', type: 'text' },
            { key: 'district', label: 'District', type: 'text' },
            { key: 'block', label: 'Block', type: 'text' },
            { key: 'category', label: 'Category', type: 'text' },
            { key: 'management', label: 'Management', type: 'text' },
          ].map(({ key, label, type, options }) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabledFields.has(key)}
                onChange={() => toggleField(key)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
                {type === 'select' ? (
                  <select
                    value={values[key] || ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    disabled={!enabledFields.has(key)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[key] || ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    disabled={!enabledFields.has(key)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  />
                )}
              </div>
            </div>
          ))}

          {/* Custom variable fields */}
          {customVariables.length > 0 && (
            <>
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custom Fields</p>
              </div>
              {customVariables.map((cv) => {
                const fieldKey = `meta_${cv.key}`;
                return (
                  <div key={cv.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enabledFields.has(fieldKey)}
                      onChange={() => toggleField(fieldKey)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-gray-700">{cv.name}</label>
                      {cv.type === 'select' ? (
                        <select
                          value={metadataValues[cv.key] || ''}
                          onChange={(e) => setMetadataValues({ ...metadataValues, [cv.key]: e.target.value })}
                          disabled={!enabledFields.has(fieldKey)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <option value="">-- Select --</option>
                          {cv.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          type={cv.type === 'number' ? 'number' : cv.type === 'date' ? 'date' : 'text'}
                          value={metadataValues[cv.key] || ''}
                          onChange={(e) => setMetadataValues({ ...metadataValues, [cv.key]: e.target.value })}
                          disabled={!enabledFields.has(fieldKey)}
                          placeholder={cv.default_value || ''}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">{checkedCount} field{checkedCount !== 1 ? 's' : ''} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || checkedCount === 0}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
              {submitting ? 'Updating...' : `Apply to ${selectedCount} contact${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Set Variable Modal ─── */
function SetVariableModal({
  selectedCount,
  selectedIds,
  customVariables,
  onClose,
  onSubmit,
}: {
  selectedCount: number;
  selectedIds: string[];
  customVariables: CustomVariable[];
  onClose: () => void;
  onSubmit: (contactIds: string[], updates: Record<string, unknown>) => Promise<void>;
}) {
  const [selectedVar, setSelectedVar] = useState(customVariables[0]?.key || '');
  const [varValue, setVarValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeVar = customVariables.find((cv) => cv.key === selectedVar);

  async function handleSubmit() {
    if (!selectedVar) {
      toast.error('Select a variable');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(selectedIds, { metadata: { [selectedVar]: varValue } });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Set Variable Value</h3>
        <p className="mt-1 text-sm text-gray-500">
          Set a custom variable for <span className="font-semibold text-primary-600">{selectedCount}</span> selected contact{selectedCount !== 1 ? 's' : ''}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Variable</label>
            <select
              value={selectedVar}
              onChange={(e) => { setSelectedVar(e.target.value); setVarValue(''); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            >
              {customVariables.map((cv) => (
                <option key={cv.key} value={cv.key}>{cv.name} ({cv.key})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Value</label>
            {activeVar?.type === 'select' ? (
              <select
                value={varValue}
                onChange={(e) => setVarValue(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="">-- Select --</option>
                {activeVar.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                type={activeVar?.type === 'number' ? 'number' : activeVar?.type === 'date' ? 'date' : 'text'}
                value={varValue}
                onChange={(e) => setVarValue(e.target.value)}
                placeholder={activeVar?.default_value || `Enter ${activeVar?.name || 'value'}...`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting || !selectedVar}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Applying...' : `Set for ${selectedCount} contact${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Contacts Content ─── */
function ContactsContent() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [listFilter, setListFilter] = useState('');

  // School filters
  const [stateFilter, setStateFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [managementFilter, setManagementFilter] = useState('');

  // Engagement filters
  const [engagementMin, setEngagementMin] = useState('');
  const [engagementMax, setEngagementMax] = useState('');

  // Health status filter
  const [healthStatusFilter, setHealthStatusFilter] = useState('');

  // Health check state
  const [healthProgress, setHealthProgress] = useState<HealthCheckProgress | null>(null);
  const [healthStats, setHealthStatsState] = useState<HealthStats | null>(null);
  const [healthCheckRunning, setHealthCheckRunning] = useState(false);

  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContact, setNewContact] = useState<Record<string, string>>({ email: '', name: '', state: '', district: '', block: '', classes: '', category: '', management: '', address: '' });
  const [newMetadata, setNewMetadata] = useState<Record<string, string>>({});
  const [newListId, setNewListId] = useState('');
  const [emailError, setEmailError] = useState('');
  const [showInlineCreateVar, setShowInlineCreateVar] = useState(false);
  const [inlineVarName, setInlineVarName] = useState('');
  const [inlineVarType, setInlineVarType] = useState<'text' | 'number' | 'date' | 'select'>('text');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ type: 'single' | 'bulk'; id?: string } | null>(null);
  const [deleteSuppressedModal, setDeleteSuppressedModal] = useState(false);
  const [deleteFilteredModal, setDeleteFilteredModal] = useState<{ healthStatus: string; count: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Bulk edit modals
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showSetVariableModal, setShowSetVariableModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const navigate = useNavigate();

  // React Query hooks
  const { data: contactsData, isLoading, isError } = useContactsList({
    page,
    limit: pageSize,
    search: search || undefined,
    status: statusFilter || undefined,
    listId: listFilter || undefined,
    state: stateFilter || undefined,
    district: districtFilter || undefined,
    block: blockFilter || undefined,
    category: categoryFilter || undefined,
    management: managementFilter || undefined,
    sortBy: sortBy || undefined,
    sortDir: sortBy ? sortDir : undefined,
    engagementMin: engagementMin || undefined,
    engagementMax: engagementMax || undefined,
    healthStatus: healthStatusFilter || undefined,
  });

  const { data: lists = [] } = useListsList();
  const { data: filters } = useContactFilters({
    state: stateFilter || undefined,
    district: districtFilter || undefined,
  });
  const { data: customVariables = [] } = useCustomVariables();

  const queryClient = useQueryClient();
  const createContactMutation = useCreateContact();
  const createVarMutation = useCreateCustomVariable();
  const deleteContactMutation = useDeleteContact();
  const bulkDeleteMutation = useBulkDeleteContacts();
  const bulkUpdateMutation = useBulkUpdateContacts();
  const updateContactMutation = useUpdateContact();

  const contacts: Contact[] = contactsData?.data || [];
  const total = contactsData?.pagination?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Clear selection when page/filters change
  useEffect(() => { setSelectedIds(new Set()); setSelectAllMatching(false); }, [page, search, statusFilter, listFilter, stateFilter, districtFilter, blockFilter, categoryFilter, managementFilter]);

  // Reset cascading filters
  useEffect(() => { setDistrictFilter(''); setBlockFilter(''); }, [stateFilter]);
  useEffect(() => { setBlockFilter(''); }, [districtFilter]);

  // Fetch health stats on mount and after health check completes
  useEffect(() => {
    getHealthStats().then(setHealthStatsState).catch(() => {});
  }, [healthCheckRunning]);

  // Poll health check progress while running
  useEffect(() => {
    if (!healthCheckRunning) return;
    const interval = setInterval(async () => {
      try {
        const progress = await getHealthCheckProgress();
        setHealthProgress(progress);
        if (progress.status === 'completed' || progress.status === 'idle') {
          setHealthCheckRunning(false);
          toast.success(
            `Health check done: ${progress.checked.toLocaleString()} checked -- ${progress.good.toLocaleString()} good, ${progress.risky.toLocaleString()} risky, ${progress.invalid.toLocaleString()} invalid, ${progress.suppressed.toLocaleString()} suppressed`
          );
          getHealthStats().then(setHealthStatsState).catch(() => {});
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [healthCheckRunning]);

  async function handleStartHealthCheck() {
    try {
      await apiStartHealthCheck();
      setHealthCheckRunning(true);
      toast.success('Health check started');
    } catch {
      toast.error('Failed to start health check');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  }

  // Build current filter params for bulk operations
  function getCurrentFilterParams(): ContactFilterParams {
    const fp: ContactFilterParams = {};
    if (search) fp.search = search;
    if (statusFilter) fp.status = statusFilter;
    if (listFilter) fp.listId = listFilter;
    if (stateFilter) fp.state = stateFilter;
    if (districtFilter) fp.district = districtFilter;
    if (blockFilter) fp.block = blockFilter;
    if (categoryFilter) fp.category = categoryFilter;
    if (managementFilter) fp.management = managementFilter;
    if (engagementMin) fp.engagement_min = engagementMin;
    if (engagementMax) fp.engagement_max = engagementMax;
    if (healthStatusFilter) fp.health_status = healthStatusFilter;
    return fp;
  }

  const effectiveCount = selectAllMatching ? total : selectedIds.size;

  function resetAddForm() {
    setNewContact({ email: '', name: '', state: '', district: '', block: '', classes: '', category: '', management: '', address: '' });
    setNewMetadata({});
    setNewListId('');
    setEmailError('');
    setShowInlineCreateVar(false);
    setInlineVarName('');
    setInlineVarType('text');
  }

  async function handleAdd() {
    if (!newContact.email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!isValidEmail(newContact.email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    try {
      // Build metadata from custom variable values
      const meta: Record<string, string> = {};
      for (const [k, v] of Object.entries(newMetadata)) {
        if (v.trim()) meta[k] = v;
      }
      await createContactMutation.mutateAsync({
        email: newContact.email,
        name: newContact.name || undefined,
        state: newContact.state || undefined,
        district: newContact.district || undefined,
        block: newContact.block || undefined,
        classes: newContact.classes || undefined,
        category: newContact.category || undefined,
        management: newContact.management || undefined,
        address: newContact.address || undefined,
        metadata: Object.keys(meta).length > 0 ? meta : undefined,
        listIds: newListId ? [newListId] : undefined,
      });
      setShowAddModal(false);
      resetAddForm();
    } catch {
      // error toast handled by mutation
    }
  }

  async function handleInlineCreateVar() {
    if (!inlineVarName.trim()) return;
    try {
      await createVarMutation.mutateAsync({ name: inlineVarName, type: inlineVarType });
      setShowInlineCreateVar(false);
      setInlineVarName('');
      setInlineVarType('text');
    } catch {
      // handled by mutation
    }
  }

  async function handleDeleteConfirm(password: string) {
    if (!deleteModal) return;

    if (deleteModal.type === 'single' && deleteModal.id) {
      await deleteContactMutation.mutateAsync({ id: deleteModal.id, adminPassword: password });
    } else if (deleteModal.type === 'bulk') {
      if (selectAllMatching) {
        // Delete all matching contacts using filter-based endpoint
        const result = await bulkDeleteFiltered(getCurrentFilterParams(), password);
        toast.success(`${result.deleted.toLocaleString()} contact(s) deleted`);
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      } else {
        const ids = Array.from(selectedIds);
        await bulkDeleteMutation.mutateAsync({ ids, adminPassword: password });
      }
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    }

    setDeleteModal(null);
  }

  async function handleDeleteSuppressedConfirm(password: string) {
    const result = await deleteSuppressedContacts(password);
    toast.success(`${result.deleted} suppressed contact(s) deleted`);
    setDeleteSuppressedModal(false);
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    getHealthStats().then(setHealthStatsState).catch(() => {});
  }

  async function handleDeleteFilteredConfirm(password: string) {
    if (!deleteFilteredModal) return;
    const filters: ContactFilterParams = { health_status: deleteFilteredModal.healthStatus };
    const result = await bulkDeleteFiltered(filters, password);
    toast.success(`${result.deleted.toLocaleString()} contact(s) deleted`);
    setDeleteFilteredModal(null);
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    getHealthStats().then(setHealthStatsState).catch(() => {});
  }

  async function handleBulkSuppress() {
    try {
      if (selectAllMatching) {
        const result = await bulkSuppressContacts({ filters: getCurrentFilterParams() });
        toast.success(`${result.suppressed.toLocaleString()} contact(s) added to suppression list`);
      } else {
        const ids = Array.from(selectedIds);
        const result = await bulkSuppressContacts({ contactIds: ids });
        toast.success(`${result.suppressed.toLocaleString()} contact(s) added to suppression list`);
      }
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      getHealthStats().then(setHealthStatsState).catch(() => {});
    } catch {
      toast.error('Failed to suppress contacts');
    }
  }

  async function handleSuppressHealthStatus(healthStatus: string) {
    try {
      const result = await bulkSuppressContacts({ filters: { health_status: healthStatus } });
      toast.success(`${result.suppressed.toLocaleString()} contact(s) added to suppression list`);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      getHealthStats().then(setHealthStatsState).catch(() => {});
    } catch {
      toast.error('Failed to suppress contacts');
    }
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortDir('ASC');
    }
    setPage(1);
  }

  function SortIndicator({ column }: { column: string }) {
    if (sortBy !== column) return <span className="ml-1 text-gray-300">&#8597;</span>;
    return <span className="ml-1">{sortDir === 'ASC' ? '\u2191' : '\u2193'}</span>;
  }

  const activeFilterCount = [stateFilter, districtFilter, blockFilter, categoryFilter, managementFilter].filter(Boolean).length;

  function clearAllFilters() {
    setStateFilter('');
    setDistrictFilter('');
    setBlockFilter('');
    setCategoryFilter('');
    setManagementFilter('');
    setPage(1);
  }

  async function handleCreateSmartList() {
    const filterCriteria: Record<string, unknown> = {};
    if (stateFilter) filterCriteria.state = stateFilter.split(',');
    if (districtFilter) filterCriteria.district = districtFilter.split(',');
    if (blockFilter) filterCriteria.block = blockFilter.split(',');
    if (categoryFilter) filterCriteria.category = categoryFilter.split(',');
    if (managementFilter) filterCriteria.management = managementFilter.split(',');

    const name = prompt('Enter a name for this smart list:');
    if (!name) return;

    try {
      await createSmartList({
        name,
        description: `Auto-generated smart list with ${activeFilterCount} filter(s)`,
        filterCriteria,
      });
      toast.success('Smart list created');
    } catch {
      toast.error('Failed to create smart list');
    }
  }

  // Bulk update handler (shared between BulkEdit and SetVariable modals)
  async function handleBulkUpdate(contactIds: string[], updates: Record<string, unknown>) {
    // Note: for selectAllMatching, we still use the contactIds approach —
    // server-side filtered bulk update would require a new endpoint.
    // For now, use the IDs of the visible page when selectAllMatching is not set.
    await bulkUpdateMutation.mutateAsync({
      contactIds,
      updates: updates as { status?: string; state?: string; district?: string; block?: string; category?: string; management?: string; metadata?: Record<string, string> },
    });
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              {customVariables.length > 0 && !selectAllMatching && (
                <button
                  onClick={() => setShowSetVariableModal(true)}
                  className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
                >
                  Set Variable ({selectedIds.size})
                </button>
              )}
              {!selectAllMatching && (
                <button
                  onClick={() => setShowBulkEditModal(true)}
                  className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
                >
                  Bulk Edit ({selectedIds.size})
                </button>
              )}
              <button
                onClick={handleBulkSuppress}
                className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-700 hover:bg-orange-100"
              >
                Suppress ({effectiveCount.toLocaleString()})
              </button>
              <button
                onClick={() => setDeleteModal({ type: 'bulk' })}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete Selected ({effectiveCount.toLocaleString()})
              </button>
            </>
          )}
          <button
            onClick={handleStartHealthCheck}
            disabled={healthCheckRunning}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {healthCheckRunning && healthProgress
              ? `Checking... ${healthProgress.checked.toLocaleString()} / ${healthProgress.total.toLocaleString()} (${healthProgress.total > 0 ? Math.round((healthProgress.checked / healthProgress.total) * 100) : 0}%)`
              : 'Run Health Check'}
          </button>
          <button onClick={() => exportContacts(listFilter || undefined)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Export CSV</button>
          <button onClick={() => navigate('/import')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Import CSV</button>
          <button onClick={() => setShowAddModal(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">Add Contact</button>
        </div>
      </div>

      {/* Search + Status + List filters */}
      <div className="mt-4 flex gap-3">
        <input
          type="text"
          placeholder="Search email or name..."
          autoComplete="off" autoCorrect="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="bounced">Bounced</option>
          <option value="complained">Complained</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <select
          value={healthStatusFilter}
          onChange={(e) => { setHealthStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Health</option>
          <option value="good">Good</option>
          <option value="risky">Risky</option>
          <option value="invalid">Invalid</option>
          <option value="suppressed">Suppressed</option>
          <option value="unchecked">Unchecked</option>
        </select>
        <select
          value={listFilter}
          onChange={(e) => { setListFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Lists</option>
          {lists.map((l: ContactList) => <option key={l.id} value={l.id}>{l.name}{l.is_smart ? ' (Smart)' : ''}</option>)}
        </select>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${
            activeFilterCount > 0
              ? 'border-primary-300 bg-primary-50 text-primary-700'
              : 'border-gray-300 hover:bg-gray-50'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* School Filter Bar */}
      {showFilters && filters && (
        <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">School Filters</h3>
            <div className="flex gap-2">
              {activeFilterCount > 0 && (
                <button onClick={handleCreateSmartList} className="text-xs text-primary-600 hover:text-primary-800">
                  Create Smart List from Filters
                </button>
              )}
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-gray-700">
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">State</label>
              <select
                value={stateFilter}
                onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All States</option>
                {filters.states.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">District</label>
              <select
                value={districtFilter}
                onChange={(e) => { setDistrictFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All Districts</option>
                {filters.districts.map((d: string) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Block</label>
              <select
                value={blockFilter}
                onChange={(e) => { setBlockFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All Blocks</option>
                {filters.blocks.map((b: string) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All Categories</option>
                {filters.categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Management</label>
              <select
                value={managementFilter}
                onChange={(e) => { setManagementFilter(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All Management</option>
                {filters.managements.map((m: string) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Engagement Score Filter */}
          <div className="mt-3 border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Engagement Score</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Min</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={engagementMin}
                  onChange={(e) => { setEngagementMin(e.target.value); setPage(1); }}
                  placeholder="0"
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Max</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={engagementMax}
                  onChange={(e) => { setEngagementMax(e.target.value); setPage(1); }}
                  placeholder="100"
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEngagementMin('70'); setEngagementMax(''); setPage(1); }} className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-200">Hot 70+</button>
                <button onClick={() => { setEngagementMin('40'); setEngagementMax('69'); setPage(1); }} className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700 hover:bg-yellow-200">Warm 40-69</button>
                <button onClick={() => { setEngagementMin(''); setEngagementMax('39'); setPage(1); }} className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200">Cold &lt;40</button>
              </div>
              {(engagementMin || engagementMax) && (
                <button onClick={() => { setEngagementMin(''); setEngagementMax(''); setPage(1); }} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
              )}
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stateFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  State: {stateFilter}
                  <button onClick={() => setStateFilter('')} className="ml-0.5 hover:text-primary-900">&times;</button>
                </span>
              )}
              {districtFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  District: {districtFilter}
                  <button onClick={() => setDistrictFilter('')} className="ml-0.5 hover:text-primary-900">&times;</button>
                </span>
              )}
              {blockFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  Block: {blockFilter}
                  <button onClick={() => setBlockFilter('')} className="ml-0.5 hover:text-primary-900">&times;</button>
                </span>
              )}
              {categoryFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  Category: {categoryFilter}
                  <button onClick={() => setCategoryFilter('')} className="ml-0.5 hover:text-primary-900">&times;</button>
                </span>
              )}
              {managementFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  Management: {managementFilter}
                  <button onClick={() => setManagementFilter('')} className="ml-0.5 hover:text-primary-900">&times;</button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Health Stats Summary */}
      {healthStats && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-4 py-2 shadow-sm text-xs">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-600">Health:</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500"></span>
              Good: {healthStats.good.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-500"></span>
              Risky: {healthStats.risky.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500"></span>
              Invalid: {healthStats.invalid.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400"></span>
              Suppressed: {healthStats.suppressed.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-200"></span>
              Unchecked: {healthStats.unchecked.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {healthStats.invalid > 0 && (
              <button
                onClick={() => setDeleteFilteredModal({ healthStatus: 'invalid', count: healthStats.invalid })}
                className="text-red-600 hover:text-red-800 font-medium"
              >
                Delete {healthStats.invalid.toLocaleString()} invalid
              </button>
            )}
            {healthStats.risky > 0 && (
              <button
                onClick={() => handleSuppressHealthStatus('risky')}
                className="text-orange-600 hover:text-orange-800 font-medium"
              >
                Suppress {healthStats.risky.toLocaleString()} risky
              </button>
            )}
            {healthStats.suppressed > 0 && (
              <button
                onClick={() => setDeleteSuppressedModal(true)}
                className="text-gray-500 hover:text-gray-700 font-medium"
              >
                Delete {healthStats.suppressed.toLocaleString()} suppressed
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contact count summary */}
      <div className="mt-3 text-sm text-gray-500">
        {total.toLocaleString()} contact{total !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="mt-2">
          <TableSkeleton rows={8} columns={9} />
        </div>
      ) : isError ? (
        <div className="mt-2 rounded-xl bg-red-50 p-6 text-center">
          <p className="text-red-700 font-medium">Failed to load contacts</p>
          <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
        </div>
      ) : (
        <>
          {/* Select All Matching Banner */}
          {selectedIds.size === contacts.length && contacts.length > 0 && total > contacts.length && (
            <div className="mt-2 rounded-lg bg-primary-50 border border-primary-200 px-4 py-2 text-sm text-primary-800">
              {selectAllMatching ? (
                <span>
                  All <strong>{total.toLocaleString()}</strong> matching contacts are selected.{' '}
                  <button
                    onClick={() => { setSelectAllMatching(false); setSelectedIds(new Set()); }}
                    className="font-medium text-primary-600 underline hover:text-primary-800"
                  >
                    Clear selection
                  </button>
                </span>
              ) : (
                <span>
                  {contacts.length} contacts on this page selected.{' '}
                  <button
                    onClick={() => setSelectAllMatching(true)}
                    className="font-medium text-primary-600 underline hover:text-primary-800"
                  >
                    Select all {total.toLocaleString()} matching contacts
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="mt-2 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={contacts.length > 0 && selectedIds.size === contacts.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="w-[18%] px-3 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('name')}>
                      Name<SortIndicator column="name" />
                    </th>
                    <th className="w-[22%] px-3 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('email')}>
                      Email<SortIndicator column="email" />
                    </th>
                    <th className="w-[10%] px-3 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 hidden lg:table-cell" onClick={() => handleSort('state')}>
                      State<SortIndicator column="state" />
                    </th>
                    <th className="w-[10%] px-3 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 hidden xl:table-cell" onClick={() => handleSort('district')}>
                      District<SortIndicator column="district" />
                    </th>
                    <th className="w-[14%] px-3 py-3 text-left font-medium text-gray-600 hidden xl:table-cell">Category</th>
                    <th className="w-[8%] px-3 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('status')}>
                      Status<SortIndicator column="status" />
                    </th>
                    <th className="w-[5%] px-3 py-3 text-center font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('send_count')}>
                      Sent<SortIndicator column="send_count" />
                    </th>
                    <th className="w-[8%] px-3 py-3 text-center font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('engagement_score')}>
                      Score<SortIndicator column="engagement_score" />
                    </th>
                    <th className="w-[8%] px-3 py-3 text-center font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('health_status')}>
                      Health<SortIndicator column="health_status" />
                    </th>
                    <th className="w-[10%] px-3 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center">
                        <div className="text-gray-400">
                          <p className="text-lg font-medium">No contacts found</p>
                          <p className="mt-1 text-sm">
                            {search || statusFilter || listFilter || activeFilterCount > 0
                              ? 'Try adjusting your search filters'
                              : 'Get started by adding your first contact or importing a CSV file'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : contacts.map((c) => (
                    <tr key={c.id} className={`hover:bg-gray-50 ${selectedIds.has(c.id) ? 'bg-primary-50' : ''}`}>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-3 py-3 cursor-pointer truncate" onClick={() => navigate(`/contacts/${c.id}`)} title={c.name || ''}>
                        <span className="font-medium text-gray-900">{c.name || <span className="text-gray-400 italic">No name</span>}</span>
                      </td>
                      <td className="px-3 py-3 cursor-pointer truncate text-xs text-gray-600" onClick={() => navigate(`/contacts/${c.id}`)} title={c.email}>
                        {c.email}
                      </td>
                      <td className="px-3 py-3 text-xs cursor-pointer hidden lg:table-cell truncate" onClick={() => navigate(`/contacts/${c.id}`)}>
                        {c.state || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-xs cursor-pointer hidden xl:table-cell truncate" onClick={() => navigate(`/contacts/${c.id}`)}>
                        {c.district || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-xs cursor-pointer hidden xl:table-cell truncate" onClick={() => navigate(`/contacts/${c.id}`)} title={c.category || ''}>
                        {c.category || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                          c.status === 'active' ? 'bg-green-100 text-green-700' :
                          c.status === 'bounced' ? 'bg-red-100 text-red-700' :
                          c.status === 'complained' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-3 py-3 text-center cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>{c.send_count}</td>
                      <td className="px-3 py-3 text-center cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        {(() => {
                          const score = c.engagement_score ?? 50;
                          if (score >= 70) return <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Hot</span>;
                          if (score >= 40) return <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Warm</span>;
                          return <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Cold</span>;
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        {(() => {
                          const hs = c.health_status || 'unchecked';
                          if (hs === 'good') return <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">good</span>;
                          if (hs === 'risky') return <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">risky</span>;
                          if (hs === 'invalid') return <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">invalid</span>;
                          if (hs === 'suppressed') return <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">suppressed</span>;
                          return <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400">unchecked</span>;
                        })()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingContact(c); }}
                            className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 hover:text-primary-800"
                            title="Edit contact"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteModal({ type: 'single', id: c.id }); }}
                            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-3">
              <span>{total.toLocaleString()} contacts found</span>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                  {total <= 5000 && <option value={total}>All ({total.toLocaleString()})</option>}
                </select>
                <span className="text-gray-400">per page</span>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded border px-2 py-1 disabled:opacity-50 hover:bg-gray-50">First</button>
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50 hover:bg-gray-50">Prev</button>
                <span className="px-2 py-1">Page {page} of {totalPages.toLocaleString()}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50 hover:bg-gray-50">Next</button>
                <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded border px-2 py-1 disabled:opacity-50 hover:bg-gray-50">Last</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <AdminPasswordModal
          title={
            deleteModal.type === 'single'
              ? 'Delete contact?'
              : `Delete ${effectiveCount.toLocaleString()} contact(s)?`
          }
          description={
            selectAllMatching
              ? `This will permanently delete ALL ${total.toLocaleString()} contacts matching your current filters. This action cannot be undone.`
              : 'This action cannot be undone. The contact(s) will be permanently removed. Historical send data will be preserved.'
          }
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {/* Delete Suppressed Contacts Modal */}
      {deleteSuppressedModal && (
        <AdminPasswordModal
          title="Delete suppressed contacts?"
          description={`This will permanently delete all contacts whose email is on the suppression list (${healthStats?.suppressed.toLocaleString() || 0} contacts). This action cannot be undone.`}
          confirmLabel="Delete Suppressed"
          onConfirm={handleDeleteSuppressedConfirm}
          onCancel={() => setDeleteSuppressedModal(false)}
        />
      )}

      {/* Delete Filtered Contacts Modal (for health status quick actions) */}
      {deleteFilteredModal && (
        <AdminPasswordModal
          title={`Delete ${deleteFilteredModal.count.toLocaleString()} ${deleteFilteredModal.healthStatus} contacts?`}
          description={`This will permanently delete all contacts with health status "${deleteFilteredModal.healthStatus}". This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteFilteredConfirm}
          onCancel={() => setDeleteFilteredModal(null)}
        />
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowAddModal(false); resetAddForm(); }}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Add Contact</h3>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Email *</label>
                <input type="email" placeholder="contact@school.com" value={newContact.email}
                  onChange={(e) => { setNewContact({ ...newContact, email: e.target.value }); setEmailError(''); }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${emailError ? 'border-red-300' : ''} focus:border-primary-500 focus:outline-none`} />
                {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
                <input type="text" placeholder="School name" value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {['state', 'district', 'block', 'classes', 'category', 'management'].map((field) => (
                  <div key={field}>
                    <label className="mb-1 block text-xs font-medium text-gray-600 capitalize">{field}</label>
                    <input type="text" placeholder={field} value={newContact[field] || ''}
                      onChange={(e) => setNewContact({ ...newContact, [field]: e.target.value })}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Address</label>
                <textarea placeholder="Full address" value={newContact.address}
                  onChange={(e) => setNewContact({ ...newContact, address: e.target.value })}
                  rows={2} className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Add to List</label>
                <select value={newListId} onChange={(e) => setNewListId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">No list</option>
                  {lists.filter((l: ContactList) => !l.is_smart).map((l: ContactList) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            {/* Custom Variables */}
            {customVariables.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700">Custom Variables</h4>
                <div className="mt-2 space-y-2">
                  {customVariables.map((cv: CustomVariable) => (
                    <div key={cv.id}>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        {cv.name} <span className="text-gray-400">{'{{' + cv.key + '}}'}</span>
                        {cv.required && <span className="text-red-500"> *</span>}
                      </label>
                      {cv.type === 'select' ? (
                        <select value={newMetadata[cv.key] || ''} onChange={(e) => setNewMetadata({ ...newMetadata, [cv.key]: e.target.value })}
                          className="w-full rounded-lg border px-3 py-2 text-sm">
                          <option value="">Select...</option>
                          {(cv.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={cv.type === 'number' ? 'number' : cv.type === 'date' ? 'date' : 'text'}
                          placeholder={cv.default_value || cv.name} value={newMetadata[cv.key] || ''}
                          onChange={(e) => setNewMetadata({ ...newMetadata, [cv.key]: e.target.value })}
                          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline Create Variable */}
            <div className="mt-3 border-t pt-3">
              {!showInlineCreateVar ? (
                <button onClick={() => setShowInlineCreateVar(true)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-800">
                  + Create new custom variable
                </button>
              ) : (
                <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-700">New Custom Variable</p>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Variable name (e.g. Principal Name)" value={inlineVarName}
                      onChange={(e) => setInlineVarName(e.target.value)}
                      className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleInlineCreateVar(); }} />
                    <select value={inlineVarType} onChange={(e) => setInlineVarType(e.target.value as 'text' | 'number' | 'date' | 'select')}
                      className="rounded-lg border px-2 py-1.5 text-sm">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="select">Select</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleInlineCreateVar} disabled={!inlineVarName.trim() || createVarMutation.isPending}
                      className="rounded-lg bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50">
                      {createVarMutation.isPending ? 'Creating...' : 'Create & Add Field'}
                    </button>
                    <button onClick={() => { setShowInlineCreateVar(false); setInlineVarName(''); }}
                      className="rounded-lg border px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowAddModal(false); resetAddForm(); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleAdd} disabled={createContactMutation.isPending}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
                {createContactMutation.isPending ? 'Adding...' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal (per-row) */}
      {editingContact && (
        <EditContactModal
          contact={editingContact}
          customVariables={customVariables}
          onClose={() => setEditingContact(null)}
          onSaved={() => {
            // Invalidate contacts query to refresh data
            updateContactMutation.reset();
          }}
        />
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <BulkEditModal
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          customVariables={customVariables}
          onClose={() => setShowBulkEditModal(false)}
          onSubmit={handleBulkUpdate}
        />
      )}

      {/* Set Variable Modal */}
      {showSetVariableModal && customVariables.length > 0 && (
        <SetVariableModal
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          customVariables={customVariables}
          onClose={() => setShowSetVariableModal(false)}
          onSubmit={handleBulkUpdate}
        />
      )}
    </div>
  );
}

export default function Contacts() {
  return (
    <ErrorBoundary>
      <ContactsContent />
    </ErrorBoundary>
  );
}
