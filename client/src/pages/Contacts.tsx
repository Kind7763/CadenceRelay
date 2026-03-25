import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  exportContacts,
  Contact,
  updateContact,
} from '../api/contacts.api';
import { createSmartList, ContactList } from '../api/lists.api';
import { useContactsList, useCreateContact, useDeleteContact, useBulkDeleteContacts, useBulkUpdateContacts, useUpdateContact } from '../hooks/useContacts';
import { useListsList } from '../hooks/useLists';
import { useContactFilters } from '../hooks/useFilters';
import { useCustomVariables } from '../hooks/useCustomVariables';
import { CustomVariable } from '../api/customVariables.api';
import { TableSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import AdminPasswordModal from '../components/ui/AdminPasswordModal';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─── Inline Editable Cell ─── */
function InlineEditCell({
  value,
  contactId,
  field,
  onSave,
  className = '',
}: {
  value: string;
  contactId: string;
  field: string;
  onSave: (id: string, field: string, value: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  function commit() {
    setEditing(false);
    if (editValue.trim() !== value) {
      onSave(contactId, field, editValue.trim());
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
        }}
        className={`w-full rounded border border-primary-300 bg-white px-1.5 py-0.5 text-sm focus:border-primary-500 focus:outline-none ${className}`}
      />
    );
  }

  return (
    <span
      className={`group/cell inline-flex cursor-pointer items-center gap-1 rounded px-1 -mx-1 hover:bg-gray-100 ${className}`}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit"
    >
      {value || '-'}
      <svg className="h-3 w-3 flex-shrink-0 text-gray-300 opacity-0 group-hover/cell:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </span>
  );
}

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
                    {cv.name}{cv.required && ' *'}
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [listFilter, setListFilter] = useState('');

  // School filters
  const [stateFilter, setStateFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [managementFilter, setManagementFilter] = useState('');

  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newListId, setNewListId] = useState('');
  const [emailError, setEmailError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ type: 'single' | 'bulk'; id?: string } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Bulk edit modals
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showSetVariableModal, setShowSetVariableModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const navigate = useNavigate();

  // React Query hooks
  const { data: contactsData, isLoading, isError } = useContactsList({
    page,
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
  });

  const { data: lists = [] } = useListsList();
  const { data: filters } = useContactFilters({
    state: stateFilter || undefined,
    district: districtFilter || undefined,
  });
  const { data: customVariables = [] } = useCustomVariables();

  const createContactMutation = useCreateContact();
  const deleteContactMutation = useDeleteContact();
  const bulkDeleteMutation = useBulkDeleteContacts();
  const bulkUpdateMutation = useBulkUpdateContacts();
  const updateContactMutation = useUpdateContact();

  const contacts: Contact[] = contactsData?.data || [];
  const total = contactsData?.pagination?.total || 0;
  const totalPages = Math.ceil(total / 50);

  // Clear selection when page/filters change
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, statusFilter, listFilter, stateFilter, districtFilter, blockFilter, categoryFilter, managementFilter]);

  // Reset cascading filters
  useEffect(() => { setDistrictFilter(''); setBlockFilter(''); }, [stateFilter]);
  useEffect(() => { setBlockFilter(''); }, [districtFilter]);

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
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  }

  async function handleAdd() {
    if (!newEmail.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!isValidEmail(newEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    try {
      await createContactMutation.mutateAsync({
        email: newEmail,
        name: newName || undefined,
        listIds: newListId ? [newListId] : undefined,
      });
      setShowAddModal(false);
      setNewEmail('');
      setNewName('');
      setNewListId('');
      setEmailError('');
    } catch {
      // error toast handled by mutation
    }
  }

  async function handleDeleteConfirm(password: string) {
    if (!deleteModal) return;

    if (deleteModal.type === 'single' && deleteModal.id) {
      await deleteContactMutation.mutateAsync({ id: deleteModal.id, adminPassword: password });
    } else if (deleteModal.type === 'bulk') {
      const ids = Array.from(selectedIds);
      await bulkDeleteMutation.mutateAsync({ ids, adminPassword: password });
      setSelectedIds(new Set());
    }

    setDeleteModal(null);
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

  // Inline edit save handler
  const handleInlineSave = useCallback((contactId: string, field: string, value: string) => {
    updateContactMutation.mutate({
      id: contactId,
      data: { [field]: value || null },
    });
  }, [updateContactMutation]);

  // Bulk update handler (shared between BulkEdit and SetVariable modals)
  async function handleBulkUpdate(contactIds: string[], updates: Record<string, unknown>) {
    await bulkUpdateMutation.mutateAsync({
      contactIds,
      updates: updates as { status?: string; state?: string; district?: string; block?: string; category?: string; management?: string; metadata?: Record<string, string> },
    });
    setSelectedIds(new Set());
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              {customVariables.length > 0 && (
                <button
                  onClick={() => setShowSetVariableModal(true)}
                  className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
                >
                  Set Variable ({selectedIds.size})
                </button>
              )}
              <button
                onClick={() => setShowBulkEditModal(true)}
                className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
              >
                Bulk Edit ({selectedIds.size})
              </button>
              <button
                onClick={() => setDeleteModal({ type: 'bulk' })}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete Selected ({selectedIds.size})
              </button>
            </>
          )}
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
          <div className="mt-2 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={contacts.length > 0 && selectedIds.size === contacts.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('name')}>
                      Name<SortIndicator column="name" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('email')}>
                      Email<SortIndicator column="email" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('state')}>
                      State<SortIndicator column="state" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('district')}>
                      District<SortIndicator column="district" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('status')}>
                      Status<SortIndicator column="status" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" onClick={() => handleSort('send_count')}>
                      Sent<SortIndicator column="send_count" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center">
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <InlineEditCell value={c.name || ''} contactId={c.id} field="name" onSave={handleInlineSave} className="truncate" />
                      </td>
                      <td className="px-4 py-3">
                        <InlineEditCell value={c.email} contactId={c.id} field="email" onSave={handleInlineSave} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <InlineEditCell value={c.state || ''} contactId={c.id} field="state" onSave={handleInlineSave} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <InlineEditCell value={c.district || ''} contactId={c.id} field="district" onSave={handleInlineSave} />
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[150px]">
                        <InlineEditCell value={c.category || ''} contactId={c.id} field="category" onSave={handleInlineSave} className="truncate" />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === 'active' ? 'bg-green-100 text-green-700' :
                          c.status === 'bounced' ? 'bg-red-100 text-red-700' :
                          c.status === 'complained' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>{c.send_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingContact(c); }}
                            className="text-primary-600 hover:text-primary-800 text-xs"
                            title="Edit contact"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteModal({ type: 'single', id: c.id }); }}
                            className="text-red-600 hover:text-red-800 text-xs"
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
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>{total.toLocaleString()} contacts total</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50 hover:bg-gray-50">Prev</button>
                <span className="px-3 py-1">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <AdminPasswordModal
          title={
            deleteModal.type === 'single'
              ? 'Delete contact?'
              : `Delete ${selectedIds.size} contact(s)?`
          }
          description="This action cannot be undone. The contact(s) will be permanently removed. Historical send data will be preserved."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Add Contact</h3>
            <div className="mt-4 space-y-3">
              <div>
                <input
                  type="email"
                  placeholder="Email *"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${emailError ? 'border-red-300 focus:border-red-500' : 'focus:border-primary-500'} focus:outline-none`}
                />
                {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}
              </div>
              <input type="text" placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
              <select value={newListId} onChange={(e) => setNewListId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">No list</option>
                {lists.filter((l: ContactList) => !l.is_smart).map((l: ContactList) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowAddModal(false); setEmailError(''); setNewEmail(''); setNewName(''); setNewListId(''); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleAdd} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white">Add</button>
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
