import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useEmailAccounts } from '../hooks/useEmailAccounts';
import {
  createCampaign, getCampaign, updateCampaign, scheduleCampaign, sendCampaign,
  addAttachments as apiAddAttachments, addAttachmentsTracked, removeAttachment as apiRemoveAttachment,
  CampaignAttachment, Campaign, updateDynamicVariables as updateDynamicVariablesApi,
  estimateSendCount,
} from '../api/campaigns.api';
import { listTemplates, Template, checkSpamScore, SpamCheckResult } from '../api/templates.api';
import { listLists, ContactList } from '../api/lists.api';
import { listContacts, Contact, verifyListEmails } from '../api/contacts.api';
import EmailVerifyModal from '../components/EmailVerifyModal';
import { sendTestEmail } from '../api/settings.api';
import UploadProgress, { FileUploadProgress } from '../components/ui/UploadProgress';
import { UploadState, INITIAL_UPLOAD_STATE, formatFileSize, validateFileSize, getFileTypeIcon } from '../lib/uploadHelper';
import { useProjectsList } from '../hooks/useProjects';
import { SpamScoreModal } from './TemplateEditor';

/** Replace all {{key}} placeholders in html/text with values from a contact */
function replaceVariables(html: string, contact: Contact): string {
  let result = html;
  const fields: Record<string, string | null> = {
    name: contact.name,
    email: contact.email,
    state: contact.state,
    district: contact.district,
    block: contact.block,
    classes: contact.classes,
    category: contact.category,
    management: contact.management,
    address: contact.address,
    school_name: contact.name, // alias
  };
  for (const [key, value] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, value ?? '');
  }
  // Also replace any metadata keys
  if (contact.metadata && typeof contact.metadata === 'object') {
    for (const [key, value] of Object.entries(contact.metadata)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      result = result.replace(regex, String(value ?? ''));
    }
  }
  return result;
}

/** File type icon SVG component */
function FileIcon({ filename, contentType }: { filename: string; contentType?: string }) {
  const type = getFileTypeIcon(filename);
  const colors: Record<string, string> = {
    pdf: 'text-red-500', word: 'text-blue-600', excel: 'text-green-600',
    powerpoint: 'text-orange-500', image: 'text-purple-500', archive: 'text-yellow-600',
    video: 'text-pink-500', audio: 'text-indigo-500', text: 'text-gray-500', file: 'text-gray-400',
  };

  // Determine icon type from contentType if filename-based detection gives generic 'file'
  let effectiveType = type;
  if (type === 'file' && contentType) {
    if (contentType.startsWith('image/')) effectiveType = 'image';
    else if (contentType === 'application/pdf') effectiveType = 'pdf';
    else if (contentType.includes('word') || contentType.includes('document')) effectiveType = 'word';
    else if (contentType.includes('sheet') || contentType.includes('excel')) effectiveType = 'excel';
    else if (contentType.includes('presentation') || contentType.includes('powerpoint')) effectiveType = 'powerpoint';
    else if (contentType.startsWith('video/')) effectiveType = 'video';
    else if (contentType.startsWith('audio/')) effectiveType = 'audio';
    else if (contentType.startsWith('text/')) effectiveType = 'text';
    else if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('compress')) effectiveType = 'archive';
  }
  const color = colors[effectiveType] || 'text-gray-400';

  if (effectiveType === 'pdf') {
    return (
      <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        <text x="7.5" y="17" fontSize="6" fill="currentColor" fontWeight="bold">PDF</text>
      </svg>
    );
  }
  if (effectiveType === 'image') {
    return (
      <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (effectiveType === 'excel') {
    return (
      <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

/** Thumbnail preview for image attachments stored on server */
function AttachmentThumbnail({ campaignId, index, contentType, filename }: { campaignId: string; index: number; contentType: string; filename?: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const src = `/api/v1/campaigns/${campaignId}/attachments/${index}?inline=true`;
  const isImage = contentType.startsWith('image/');
  const isPdf = contentType === 'application/pdf';
  const canPreview = isImage || isPdf;

  return (
    <>
      {isImage ? (
        <img
          src={src}
          alt="preview"
          className="h-8 w-8 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
        />
      ) : canPreview ? (
        <button
          onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
          className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-primary-600 hover:bg-gray-200"
        >
          Preview
        </button>
      ) : null}

      {showPreview && canPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowPreview(false)}>
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-sm font-medium text-gray-700">{filename || 'Attachment'}</span>
              <div className="flex gap-2">
                <a href={src} download={filename} className="text-xs text-primary-600 hover:text-primary-800">Download</a>
                <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              </div>
            </div>
            {isImage ? (
              <img src={src} alt={filename || 'preview'} className="max-h-[80vh] max-w-full rounded" />
            ) : isPdf ? (
              <iframe src={src} className="h-[80vh] w-[70vw] rounded border" title={filename || 'PDF preview'} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

export default function CampaignCreate() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = !!editId;
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [editLoaded, setEditLoaded] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [listId, setListId] = useState('');
  const [provider, setProvider] = useState<'gmail' | 'ses'>('ses');
  const [emailAccountId, setEmailAccountId] = useState('');
  const { data: emailAccounts = [] } = useEmailAccounts();
  const [replyTo, setReplyTo] = useState('');
  const [throttlePerSecond, setThrottlePerSecond] = useState(5);
  const [throttlePerHour, setThrottlePerHour] = useState(5000);
  const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  // Existing attachments from the DB (already uploaded for this campaign)
  const [existingAttachments, setExistingAttachments] = useState<CampaignAttachment[]>([]);
  const [removingAttachmentIdx, setRemovingAttachmentIdx] = useState<number | null>(null);

  // Upload progress state for campaign creation
  const [campaignUploadState, setCampaignUploadState] = useState<UploadState>(INITIAL_UPLOAD_STATE);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [projectId, setProjectId] = useState('');
  const { data: projects = [] } = useProjectsList();

  const previewRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feature 1: Contact-based template preview
  const [previewContacts, setPreviewContacts] = useState<Contact[]>([]);
  const [selectedPreviewContactId, setSelectedPreviewContactId] = useState('');
  const [previewContactsLoading, setPreviewContactsLoading] = useState(false);

  // Feature 2: Send test email (tabbed — quick, from list, multiple)
  const [testEmailExpanded, setTestEmailExpanded] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testTab, setTestTab] = useState<'quick' | 'list' | 'multiple'>('quick');
  const [testListId, setTestListId] = useState('');
  const [testListContacts, setTestListContacts] = useState<Contact[]>([]);
  const [testListLoading, setTestListLoading] = useState(false);
  const [testSelectedIds, setTestSelectedIds] = useState<Set<string>>(new Set());
  const [testMultipleEmails, setTestMultipleEmails] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testProgress, setTestProgress] = useState({ sent: 0, total: 0 });

  // Spam score check
  const [spamResult, setSpamResult] = useState<SpamCheckResult | null>(null);
  const [spamChecking, setSpamChecking] = useState(false);
  const [showSpamModal, setShowSpamModal] = useState(false);

  // Email verification
  const [verifyResult, setVerifyResult] = useState<{ valid: number; risky: number; invalid: number } | null>(null);
  const [verifyChecking, setVerifyChecking] = useState(false);
  const [verifyEmails, setVerifyEmails] = useState<string[]>([]);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Feature 3: Dynamic variables
  interface DynVar {
    key: string;
    type: 'counter' | 'date' | 'pattern' | 'random' | 'text';
    startValue?: number;
    increment?: number;
    padding?: number;
    prefix?: string;
    suffix?: string;
    format?: string;
    values?: string[];
    value?: string;
  }
  const [dynamicVars, setDynamicVars] = useState<DynVar[]>([]);
  const [showAddDynVar, setShowAddDynVar] = useState(false);
  const [newDynVar, setNewDynVar] = useState<DynVar>({ key: '', type: 'counter' });

  // A/B Testing state
  const [subjectOverrideVal, setSubjectOverrideVal] = useState('');
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [abVariantBSubject, setAbVariantBSubject] = useState('');
  const [abSplitPercentage, setAbSplitPercentage] = useState(20);
  const [abTestDuration, setAbTestDuration] = useState(4);
  const [abWinnerMetric, setAbWinnerMetric] = useState<'open_rate' | 'click_rate'>('open_rate');

  // Send estimate state
  const [sendEstimate, setSendEstimate] = useState<{ total: number; suppressed: number; invalid: number; willSend: number } | null>(null);
  const [sendEstimateLoading, setSendEstimateLoading] = useState(false);

  // Combined count for the 10-file limit
  const totalAttachmentCount = existingAttachments.length + attachments.length;
  const totalAttachmentSize =
    existingAttachments.reduce((s, a) => s + (a.size || 0), 0) +
    attachments.reduce((s, f) => s + f.size, 0);

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => {});
    listLists().then(setLists).catch(() => {});

    // Auto-set project from URL query param (e.g. /campaigns/new?project=uuid)
    const projectFromUrl = searchParams.get('project');
    if (projectFromUrl && !projectId) {
      setProjectId(projectFromUrl);
    }

    // Load existing campaign data when editing a draft
    if (editId && !editLoaded) {
      getCampaign(editId).then((c) => {
        setName(c.name || '');
        setTemplateId(c.template_id || '');
        setListId(c.list_id || '');
        setProvider((c.provider as 'gmail' | 'ses') || 'ses');
        setEmailAccountId(c.email_account_id || '');
        setReplyTo(c.reply_to || '');
        setThrottlePerSecond(c.throttle_per_second || 5);
        setThrottlePerHour(c.throttle_per_hour || 5000);
        if ((c as Campaign & { project_id?: string }).project_id) {
          setProjectId((c as Campaign & { project_id?: string }).project_id || '');
        }
        setDraftId(c.id);
        // Load subject override
        if (c.subject_override) {
          setSubjectOverrideVal(c.subject_override);
        }
        // Load existing attachments from the campaign
        if (c.attachments && c.attachments.length > 0) {
          setExistingAttachments(c.attachments);
        }
        // Load existing dynamic variables
        if (c.dynamic_variables && Array.isArray(c.dynamic_variables) && c.dynamic_variables.length > 0) {
          setDynamicVars(c.dynamic_variables);
        }
        setEditLoaded(true);
      }).catch(() => toast.error('Failed to load campaign'));
    }
  }, [editId]);

  const selectedTemplate = (templates || []).find((t) => t.id === templateId);
  const selectedList = (lists || []).find((l) => l.id === listId);

  // Fetch contacts for preview when listId changes
  useEffect(() => {
    if (!listId) {
      setPreviewContacts([]);
      return;
    }
    let cancelled = false;
    async function fetchContacts() {
      setPreviewContactsLoading(true);
      try {
        const data = await listContacts({ listId, limit: '10' });
        if (!cancelled) {
          let contacts: Contact[] = [];
          if (Array.isArray(data)) {
            contacts = data;
          } else if (data && typeof data === 'object') {
            if (Array.isArray(data.data)) contacts = data.data;
            else if (Array.isArray(data.contacts)) contacts = data.contacts;
          }
          setPreviewContacts(contacts);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) {
          setPreviewContactsLoading(false);
        }
      }
    }
    fetchContacts();
    return () => { cancelled = true; };
  }, [listId]);

  // Update preview iframe when template or selected preview contact changes
  const selectedPreviewContact = previewContacts.find((c) => c.id === selectedPreviewContactId);
  useEffect(() => {
    if (previewRef.current && selectedTemplate && selectedTemplate.html_body) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        const html = selectedPreviewContact
          ? replaceVariables(selectedTemplate.html_body, selectedPreviewContact)
          : selectedTemplate.html_body;
        doc.write(html);
        doc.close();
      }
    }
  }, [selectedTemplate, selectedPreviewContact]);

  // Fetch send estimate when entering the Review step
  useEffect(() => {
    if (step === 5 && listId) {
      setSendEstimateLoading(true);
      const timer = setTimeout(() => {
        estimateSendCount(listId)
          .then((est) => setSendEstimate(est))
          .catch(() => setSendEstimate(null))
          .finally(() => setSendEstimateLoading(false));
      }, 300); // debounce
      return () => clearTimeout(timer);
    }
  }, [step, listId]);

  // Auto-run spam check when entering the Review step
  useEffect(() => {
    if (step === 5 && selectedTemplate) {
      setSpamChecking(true);
      checkSpamScore({ subject: selectedTemplate.subject, html: selectedTemplate.html_body, hasPlainText: !!selectedTemplate.text_body })
        .then(setSpamResult)
        .catch(() => {})
        .finally(() => setSpamChecking(false));
    }
  }, [step, selectedTemplate]);

  // Default testListId to campaign's listId
  useEffect(() => {
    if (listId && !testListId) setTestListId(listId);
  }, [listId]);

  // Load contacts when testListId changes (for "From List" tab)
  useEffect(() => {
    if (!testListId) { setTestListContacts([]); setTestSelectedIds(new Set()); return; }
    let cancelled = false;
    setTestListLoading(true);
    listContacts({ listId: testListId, limit: '20' })
      .then((res) => {
        if (cancelled) return;
        // Handle paginated response (data.data) or direct array
        const contacts: Contact[] = Array.isArray(res) ? res : (res.data || []);
        setTestListContacts(contacts);
        setTestSelectedIds(new Set(contacts.map((c: Contact) => c.id)));
      })
      .catch(() => { if (!cancelled) setTestListContacts([]); })
      .finally(() => { if (!cancelled) setTestListLoading(false); });
    return () => { cancelled = true; };
  }, [testListId]);

  async function handleVerifyEmailList() {
    if (!listId) return;
    setVerifyChecking(true);
    toast.loading('Verifying all contacts in list... this may take a minute', { id: 'verify-list' });
    try {
      // Use server-side list verification which checks ALL contacts (not just 100)
      const res = await verifyListEmails(listId);
      toast.dismiss('verify-list');

      const allEmails = (res.results || []).map((r: { email: string }) => r.email);
      setVerifyEmails(allEmails);

      const valid = res.summary?.valid || res.results.filter((r: { risk: string }) => r.risk === 'low').length;
      const risky = res.summary?.risky || res.results.filter((r: { risk: string }) => r.risk === 'medium' || r.risk === 'high').length;
      const invalid = res.summary?.invalid || res.results.filter((r: { valid: boolean }) => !r.valid).length;
      setVerifyResult({ valid, risky, invalid });

      if (invalid > 0 || risky > 0) {
        toast(`${valid} valid, ${risky} risky, ${invalid} invalid contacts found`, { icon: '⚠️', duration: 6000 });
      } else {
        toast.success(`All ${valid} contacts are valid!`);
      }
    } catch {
      toast.dismiss('verify-list');
      toast.error('Failed to verify emails');
    } finally {
      setVerifyChecking(false);
    }
  }

  const handleAddFiles = useCallback((files: File[]) => {
    const errors: string[] = [];
    const valid: File[] = [];

    for (const file of files) {
      const sizeError = validateFileSize(file);
      if (sizeError) {
        errors.push(sizeError);
      } else {
        valid.push(file);
      }
    }

    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err));
    }

    // Check total count including existing attachments
    const currentTotal = existingAttachments.length + attachments.length;
    const newTotal = currentTotal + valid.length;
    if (newTotal > 10) {
      toast.error(`Maximum 10 files allowed. You already have ${currentTotal}.`);
      const allowed = 10 - currentTotal;
      if (allowed > 0) {
        setAttachments((prev) => [...prev, ...valid.slice(0, allowed)]);
      }
      return;
    }

    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid]);
    }
  }, [attachments.length, existingAttachments.length]);

  /** Remove an existing (already-uploaded) attachment from the server */
  async function handleRemoveExistingAttachment(index: number) {
    if (!draftId) return;
    setRemovingAttachmentIdx(index);
    try {
      await apiRemoveAttachment(draftId, index);
      setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
      toast.success('Attachment removed');
    } catch {
      toast.error('Failed to remove attachment');
    } finally {
      setRemovingAttachmentIdx(null);
    }
  }

  function validateScheduleDate(): boolean {
    if (scheduleType === 'later') {
      if (!scheduledAt) {
        setScheduleError('Please select a date and time');
        return false;
      }
      const selected = new Date(scheduledAt);
      if (selected <= new Date()) {
        setScheduleError('Scheduled date must be in the future');
        return false;
      }
    }
    setScheduleError('');
    return true;
  }

  function handleGoToReview() {
    if (!validateScheduleDate()) return;
    setStep(5);
  }

  async function handleCreate() {
    if (scheduleType === 'later' && !validateScheduleDate()) return;

    setCreating(true);
    const hasNewAttachments = attachments.length > 0;

    if (hasNewAttachments) {
      setShowUploadProgress(true);
      setCampaignUploadState({ ...INITIAL_UPLOAD_STATE, status: 'uploading' });
    }

    try {
      const controller = new AbortController();
      abortRef.current = () => controller.abort();

      let campaignId: string;

      if (isEditing && draftId) {
        // Editing existing draft -- update fields
        await updateCampaign(draftId, {
          name, templateId, listId, provider, throttlePerSecond, throttlePerHour,
          replyTo: replyTo || null,
          emailAccountId: emailAccountId || null,
        });
        campaignId = draftId;

        // Upload new attachments to the existing campaign
        if (hasNewAttachments) {
          const { promise, abort } = addAttachmentsTracked(
            campaignId,
            attachments,
            (state) => setCampaignUploadState(state),
            controller.signal,
          );
          abortRef.current = abort;
          const updatedAttachments = await promise;
          setExistingAttachments(updatedAttachments);
          setAttachments([]);
        }
      } else {
        // Creating new campaign (includes attachments in the create call)
        const campaign = await createCampaign({
          name, templateId, listId, provider, throttlePerSecond, throttlePerHour,
          projectId: projectId || undefined,
          replyTo: replyTo || undefined,
          emailAccountId: emailAccountId || undefined,
          attachments: hasNewAttachments ? attachments : undefined,
          onProgress: hasNewAttachments ? (state) => setCampaignUploadState(state) : undefined,
          signal: controller.signal,
        });
        campaignId = campaign.id;
      }

      if (hasNewAttachments) {
        setCampaignUploadState((prev) => ({ ...prev, status: 'complete', progress: 100 }));
      }

      // Save dynamic variables if any were configured
      if (dynamicVars.length > 0 && campaignId) {
        try {
          await updateDynamicVariablesApi(campaignId, dynamicVars);
        } catch {
          toast.error('Warning: Failed to save dynamic variables');
        }
      }

      // Save custom subject line override if set
      if (subjectOverrideVal.trim() && campaignId) {
        try {
          await updateCampaign(campaignId, { subjectOverride: subjectOverrideVal.trim() });
        } catch {
          toast.error('Warning: Failed to save custom subject line');
        }
      }

      // Save A/B test configuration if enabled
      if (abTestEnabled && campaignId) {
        try {
          await updateCampaign(campaignId, {
            abTest: {
              enabled: true,
              variantB: { subject: abVariantBSubject || selectedTemplate?.subject || '' },
              splitPercentage: abSplitPercentage,
              testDurationHours: abTestDuration,
              winnerMetric: abWinnerMetric,
              status: 'pending',
              winnerVariant: null,
              variantAStats: { sent: 0, opens: 0, clicks: 0 },
              variantBStats: { sent: 0, opens: 0, clicks: 0 },
            },
          });
        } catch {
          toast.error('Warning: Failed to save A/B test config');
        }
      }

      if (scheduleType === 'later' && scheduledAt) {
        await scheduleCampaign(campaignId, new Date(scheduledAt).toISOString());
        toast.success('Campaign scheduled');
      } else {
        await sendCampaign(campaignId);
        toast.success('Campaign sending started');
      }

      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      const isCancelled = err instanceof Error && err.name === 'CanceledError';
      if (isCancelled) {
        setCampaignUploadState((prev) => ({ ...prev, status: 'cancelled' }));
        toast('Upload cancelled');
      } else {
        if (hasNewAttachments) {
          setCampaignUploadState((prev) => ({
            ...prev,
            status: 'error',
            error: 'Failed to create campaign',
          }));
        }
        toast.error('Failed to create campaign');
      }
    } finally {
      setCreating(false);
      setShowConfirm(false);
      abortRef.current = null;
    }
  }

  async function handleSaveDraft() {
    if (!name.trim()) {
      toast.error('Campaign name is required to save as draft');
      return;
    }
    setSavingDraft(true);
    try {
      if (draftId) {
        // Update existing draft
        const { updateCampaign: updateCampaignApi } = await import('../api/campaigns.api');
        await updateCampaignApi(draftId, {
          name,
          templateId: templateId || undefined,
          listId: listId || undefined,
          provider,
          throttlePerSecond,
          throttlePerHour,
          replyTo: replyTo || null,
          emailAccountId: emailAccountId || null,
        });

        // Upload any new file attachments to the existing draft
        if (attachments.length > 0) {
          try {
            const updatedAttachments = await apiAddAttachments(draftId, attachments);
            setExistingAttachments(updatedAttachments);
            setAttachments([]);
          } catch {
            toast.error('Draft saved but attachment upload failed');
          }
        }

        setLastSaved(new Date());
        toast.success('Draft saved');
      } else {
        // Create new draft with attachments if present
        const campaign = await createCampaign({
          name: name || 'Untitled Campaign',
          templateId: templateId || '',
          listId: listId || '',
          provider,
          throttlePerSecond,
          throttlePerHour,
          projectId: projectId || undefined,
          replyTo: replyTo || undefined,
          emailAccountId: emailAccountId || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        setDraftId(campaign.id);
        // Move new attachments into existing (they're now on the server)
        if (campaign.attachments && campaign.attachments.length > 0) {
          setExistingAttachments(campaign.attachments);
          setAttachments([]);
        }
        setLastSaved(new Date());
        toast.success('Saved as draft');
      }
    } catch {
      toast.error('Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  }

  // Auto-save draft every 30 seconds if there are unsaved changes and a name exists
  useEffect(() => {
    if (!name.trim()) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      // Only auto-save if user has entered meaningful data
      if (name.trim() && (templateId || listId)) {
        handleSaveDraft();
      }
    }, 30000); // 30 seconds

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [name, templateId, listId, provider, throttlePerSecond, throttlePerHour]);

  function handleCancelUpload() {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
  }

  const contactCount = selectedList?.contact_count || 0;

  // Estimate send time considering BOTH per-second and per-hour limits
  const perSecondMinutes = Math.ceil(contactCount / throttlePerSecond / 60);
  const perHourMinutes = throttlePerHour > 0 ? Math.ceil((contactCount / throttlePerHour) * 60) : perSecondMinutes;
  // The actual time is the SLOWER of the two limits
  const estimatedMinutes = Math.max(perSecondMinutes, perHourMinutes);
  const estimatedHours = Math.floor(estimatedMinutes / 60);
  const estimatedMinsRemainder = estimatedMinutes % 60;
  const isHourLimited = perHourMinutes > perSecondMinutes;

  // Build upload progress files for the UploadProgress component
  const uploadProgressFiles: FileUploadProgress[] = showUploadProgress && attachments.length > 0
    ? attachments.map((file, i) => ({
        file,
        state: campaignUploadState,
        id: `attachment-${i}`,
      }))
    : [];

  /** Render the combined attachment list (existing + new) for Step 1 */
  function renderAttachmentsList() {
    const hasAny = existingAttachments.length > 0 || attachments.length > 0;
    if (!hasAny) return null;

    return (
      <div className="mt-2 space-y-1">
        {/* Existing (already uploaded) attachments */}
        {existingAttachments.map((att, i) => (
          <div key={`existing-${i}`} className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <FileIcon filename={att.filename} contentType={att.contentType} />
              <span className="truncate">{att.filename}</span>
              <span className="text-xs text-gray-400">({formatFileSize(att.size)})</span>
              {draftId && (att.contentType?.startsWith('image/') || att.contentType === 'application/pdf') && (
                <AttachmentThumbnail campaignId={draftId} index={i} contentType={att.contentType} filename={att.filename} />
              )}
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">Uploaded</span>
            </div>
            <button
              onClick={() => handleRemoveExistingAttachment(i)}
              disabled={removingAttachmentIdx === i}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {removingAttachmentIdx === i ? 'Removing...' : 'Remove'}
            </button>
          </div>
        ))}
        {/* New (pending upload) attachments */}
        {attachments.map((file, i) => (
          <div key={`new-${i}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  className="h-8 w-8 rounded object-cover border border-gray-200"
                />
              ) : (
                <FileIcon filename={file.name} contentType={file.type} />
              )}
              <span className="truncate">{file.name}</span>
              <span className="text-xs text-gray-400">({formatFileSize(file.size)})</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">New</span>
            </div>
            <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:text-red-700">Remove</button>
          </div>
        ))}
        <p className="text-xs text-gray-400">
          {totalAttachmentCount} file(s), {formatFileSize(totalAttachmentSize)} total
        </p>
      </div>
    );
  }

  /** Render the attachments section in the Review step */
  function renderReviewAttachments() {
    const hasAny = existingAttachments.length > 0 || attachments.length > 0;
    if (!hasAny) return null;

    return (
      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        <span className="text-gray-500">Attachments:</span>
        <ul className="mt-1 space-y-0.5">
          {existingAttachments.map((att, i) => (
            <li key={`existing-${i}`} className="flex items-center gap-1">
              <FileIcon filename={att.filename} contentType={att.contentType} />
              <span className="font-medium">{att.filename}</span>
              <span className="text-gray-400">({formatFileSize(att.size)})</span>
              {draftId && (att.contentType?.startsWith('image/') || att.contentType === 'application/pdf') && (
                <AttachmentThumbnail campaignId={draftId} index={i} contentType={att.contentType} filename={att.filename} />
              )}
              <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-600">Uploaded</span>
            </li>
          ))}
          {attachments.map((f, i) => (
            <li key={`new-${i}`} className="flex items-center gap-1">
              <FileIcon filename={f.name} contentType={f.type} />
              <span className="font-medium">{f.name}</span>
              <span className="text-gray-400">({formatFileSize(f.size)})</span>
              <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-600">New</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-gray-400">
          Total: {formatFileSize(totalAttachmentSize)}
        </p>
      </div>
    );
  }

  /** Render attachment summary for the confirmation dialog */
  function renderConfirmAttachments() {
    if (totalAttachmentCount === 0) return null;
    return (
      <>
        <br />
        <strong>Attachments:</strong> {totalAttachmentCount} file(s), {formatFileSize(totalAttachmentSize)}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <button onClick={() => navigate('/campaigns')} className="mb-4 text-sm text-primary-600">&larr; Back</button>
      <h1 className="text-2xl font-bold">{isEditing ? 'Edit Campaign' : 'Create Campaign'}</h1>

      {/* Step indicators */}
      <div className="mt-6 flex gap-2">
        {['Details', 'Template', 'Variables', 'Schedule', 'Review'].map((label, i) => (
          <div key={label} className={`flex-1 rounded-lg py-2 text-center text-sm font-medium ${step === i + 1 ? 'bg-primary-600 text-white' : step > i + 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {label}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Goa Schools March Invite" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {projects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Project <span className="text-gray-400 font-normal">(optional)</span></label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ? `${p.icon} ` : ''}{p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">Contact List</label>
            <select value={listId} onChange={(e) => setListId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Select a list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.contact_count} contacts)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Account</label>
            <select
              value={emailAccountId}
              onChange={(e) => {
                const val = e.target.value;
                setEmailAccountId(val);
                if (val) {
                  const acct = emailAccounts.find((a) => a.id === val);
                  if (acct) setProvider(acct.provider_type);
                }
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Use Legacy Settings ({provider.toUpperCase()})</option>
              {emailAccounts.map((acct) => (
                <option key={acct.id} value={acct.id}>
                  {acct.label} ({acct.provider_type === 'gmail' ? (acct.config.user as string || 'Gmail') : (acct.config.fromEmail as string || 'SES')}) — {acct.provider_type.toUpperCase()}
                </option>
              ))}
            </select>
            {!emailAccountId && (
              <div className="mt-1 flex gap-2">
                <button onClick={() => setProvider('ses')} className={`rounded-lg px-3 py-1 text-xs ${provider === 'ses' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>AWS SES</button>
                <button onClick={() => setProvider('gmail')} className={`rounded-lg px-3 py-1 text-xs ${provider === 'gmail' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>Gmail</button>
              </div>
            )}
          </div>
          {/* Reply-To Override */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Reply-To Email (optional)</label>
            <p className="mt-0.5 text-xs text-gray-500">Override the global reply-to for this campaign. Leave blank to use the global setting.</p>
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="replies@example.com"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              autoComplete="off"
            />
          </div>
          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Attachments (optional)</label>
            <p className="mt-0.5 text-xs text-gray-500">Add files to send with every email (max 25MB each, up to 10 files)</p>
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  handleAddFiles(files);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={totalAttachmentCount >= 10}
                className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add Files
              </button>
            </div>
            {renderAttachmentsList()}
          </div>
          <button disabled={!name || !listId} onClick={() => setStep(2)} className="rounded-lg bg-primary-600 px-6 py-2 text-sm text-white disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Step 2: Template */}
      {step === 2 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm space-y-4">
          <label className="block text-sm font-medium text-gray-700">Select Template</label>
          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <div key={t.id} onClick={() => setTemplateId(t.id)} className={`cursor-pointer rounded-lg border-2 p-4 ${templateId === t.id ? 'border-primary-600 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <h4 className="font-medium">{t.name}</h4>
                <p className="text-sm text-gray-500 truncate">{t.subject}</p>
              </div>
            ))}
          </div>
          {/* Template Preview */}
          {selectedTemplate && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Template Preview</h4>
              <div className="rounded-lg border bg-gray-50 p-2">
                <div className="mb-2 text-xs text-gray-500">
                  <span className="font-medium">Subject:</span>{' '}
                  {selectedPreviewContact
                    ? replaceVariables(selectedTemplate.subject, selectedPreviewContact)
                    : selectedTemplate.subject}
                </div>
                <iframe
                  ref={previewRef}
                  className="h-64 w-full rounded border bg-white"
                  title="Template Preview"
                  sandbox="allow-same-origin"
                />
              </div>

              {/* Preview with Contact */}
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <h5 className="text-sm font-medium text-blue-800 mb-1">Preview with Contact</h5>
                <p className="text-xs text-blue-600 mb-2">Select a contact to see how the email will look for them</p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPreviewContactId}
                    onChange={(e) => setSelectedPreviewContactId(e.target.value)}
                    className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm"
                    disabled={previewContactsLoading || previewContacts.length === 0}
                  >
                    <option value="">
                      {previewContactsLoading
                        ? 'Loading contacts...'
                        : previewContacts.length === 0
                          ? listId ? 'No contacts in this list' : 'Select a list first (Step 1)'
                          : 'Preview with real contact data...'}
                    </option>
                    {previewContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Unnamed'} ({c.email})
                      </option>
                    ))}
                  </select>
                  {selectedPreviewContactId && (
                    <button
                      onClick={() => setSelectedPreviewContactId('')}
                      className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                    >
                      Reset Preview
                    </button>
                  )}
                </div>
                {selectedPreviewContact && (
                  <p className="mt-1.5 text-xs text-blue-600">
                    Previewing as: <strong>{selectedPreviewContact.name || selectedPreviewContact.email}</strong>
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-lg border px-6 py-2 text-sm">Back</button>
            <button disabled={!templateId} onClick={() => setStep(3)} className="rounded-lg bg-primary-600 px-6 py-2 text-sm text-white disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {/* Step 3: Dynamic Variables (optional) */}
      {step === 3 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Dynamic Variables</h3>
              <p className="text-sm text-gray-500">Add auto-generated values like counters, dates, or rotating text. These work alongside contact variables.</p>
            </div>
          </div>

          {/* Current dynamic variables */}
          {dynamicVars.length > 0 && (
            <div className="space-y-2">
              {dynamicVars.map((v, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-blue-50 px-2 py-0.5 text-sm font-mono text-blue-700">{`{{${v.key}}}`}</code>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{v.type}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {v.type === 'counter' && `Starts at ${v.startValue ?? 1}, increments by ${v.increment ?? 1}${v.padding ? `, padded to ${v.padding} digits` : ''}${v.prefix ? `, prefix: "${v.prefix}"` : ''}${v.suffix ? `, suffix: "${v.suffix}"` : ''}`}
                      {v.type === 'date' && `Format: ${v.format || 'YYYY-MM-DD'}${v.prefix ? ` prefix: "${v.prefix}"` : ''}`}
                      {v.type === 'pattern' && `Cycles: ${(v.values || []).join(' → ')}`}
                      {v.type === 'random' && `Random from: ${(v.values || []).join(', ')}`}
                      {v.type === 'text' && `Static: ${v.prefix || ''}${v.value || ''}${v.suffix || ''}`}
                    </p>
                  </div>
                  <button onClick={() => setDynamicVars(dynamicVars.filter((_, i) => i !== idx))} className="ml-2 text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* Preview table */}
          {dynamicVars.length > 0 && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">Preview — how variables resolve per recipient</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-1.5 text-left font-medium text-gray-500">Recipient #</th>
                      {dynamicVars.map((v) => (
                        <th key={v.key} className="px-3 py-1.5 text-left font-medium text-gray-500">{`{{${v.key}}}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2, 9, 49, 99].map((pos) => (
                      <tr key={pos} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-medium">#{pos + 1}</td>
                        {dynamicVars.map((v) => {
                          let resolved = '';
                          const now = new Date();
                          const pad2 = (n: number) => String(n).padStart(2, '0');
                          if (v.type === 'counter') {
                            const val = (v.startValue ?? 1) + pos * (v.increment ?? 1);
                            let f = String(val);
                            if (v.padding && v.padding > 0) f = f.padStart(v.padding, '0');
                            resolved = (v.prefix || '') + f + (v.suffix || '');
                          } else if (v.type === 'date') {
                            const fmt = v.format || 'YYYY-MM-DD';
                            resolved = (v.prefix || '') + fmt
                              .replace('YYYY', String(now.getFullYear()))
                              .replace('MM', pad2(now.getMonth() + 1))
                              .replace('DD', pad2(now.getDate()))
                              .replace('Month', now.toLocaleString('en', { month: 'long' }))
                              .replace('Day', now.toLocaleString('en', { weekday: 'long' })) + (v.suffix || '');
                          } else if (v.type === 'pattern') {
                            const vals = v.values || [];
                            resolved = vals.length > 0 ? vals[pos % vals.length] : '';
                          } else if (v.type === 'random') {
                            resolved = '(random)';
                          } else if (v.type === 'text') {
                            resolved = (v.prefix || '') + (v.value || '') + (v.suffix || '');
                          }
                          return <td key={v.key} className="px-3 py-1.5 font-mono text-blue-700">{resolved}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Add new dynamic variable */}
          {showAddDynVar ? (
            <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 space-y-3">
              <h4 className="text-sm font-medium">Add Dynamic Variable</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Variable Key</label>
                  <input type="text" value={newDynVar.key} onChange={(e) => setNewDynVar({ ...newDynVar, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="e.g. file_number" className="mt-1 w-full rounded border px-2 py-1.5 text-sm font-mono" />
                  <p className="mt-0.5 text-[10px] text-gray-400">Use as {`{{${newDynVar.key || 'key'}}}`} in template</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Type</label>
                  <select value={newDynVar.type} onChange={(e) => setNewDynVar({ ...newDynVar, type: e.target.value as DynVar['type'] })} className="mt-1 w-full rounded border px-2 py-1.5 text-sm">
                    <option value="counter">Counter (auto-increment)</option>
                    <option value="date">Date / Time</option>
                    <option value="pattern">Pattern (cycle through values)</option>
                    <option value="random">Random (pick from values)</option>
                    <option value="text">Static Text</option>
                  </select>
                </div>
              </div>

              {/* Type-specific options */}
              {newDynVar.type === 'counter' && (
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600">Start</label>
                    <input type="number" value={newDynVar.startValue ?? 1} onChange={(e) => setNewDynVar({ ...newDynVar, startValue: parseInt(e.target.value) || 1 })} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Increment</label>
                    <input type="number" value={newDynVar.increment ?? 1} onChange={(e) => setNewDynVar({ ...newDynVar, increment: parseInt(e.target.value) || 1 })} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Zero-pad digits</label>
                    <input type="number" value={newDynVar.padding ?? 0} onChange={(e) => setNewDynVar({ ...newDynVar, padding: parseInt(e.target.value) || 0 })} className="w-full rounded border px-2 py-1 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Prefix</label>
                    <input type="text" value={newDynVar.prefix ?? ''} onChange={(e) => setNewDynVar({ ...newDynVar, prefix: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" placeholder="YEB/" />
                  </div>
                </div>
              )}

              {newDynVar.type === 'date' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600">Format</label>
                    <select value={newDynVar.format || 'YYYY-MM-DD'} onChange={(e) => setNewDynVar({ ...newDynVar, format: e.target.value })} className="w-full rounded border px-2 py-1 text-sm">
                      <option value="YYYY-MM-DD">2026-03-30</option>
                      <option value="DD/MM/YYYY">30/03/2026</option>
                      <option value="MM/DD/YYYY">03/30/2026</option>
                      <option value="DD Month YYYY">30 March 2026</option>
                      <option value="Month DD, YYYY">March 30, 2026</option>
                      <option value="Day, DD Month YYYY">Monday, 30 March 2026</option>
                      <option value="DD-Mon-YYYY">30-Mar-2026</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Prefix</label>
                    <input type="text" value={newDynVar.prefix ?? ''} onChange={(e) => setNewDynVar({ ...newDynVar, prefix: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" placeholder="Date: " />
                  </div>
                </div>
              )}

              {(newDynVar.type === 'pattern' || newDynVar.type === 'random') && (
                <div>
                  <label className="block text-xs text-gray-600">Values (one per line)</label>
                  <textarea
                    value={(newDynVar.values || []).join('\n')}
                    onChange={(e) => setNewDynVar({ ...newDynVar, values: e.target.value.split('\n').filter(Boolean) })}
                    placeholder={newDynVar.type === 'pattern' ? "Hello\nHi\nHey\nGreetings" : "Value 1\nValue 2\nValue 3"}
                    rows={4}
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm font-mono"
                  />
                </div>
              )}

              {newDynVar.type === 'text' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600">Value</label>
                    <input type="text" value={newDynVar.value ?? ''} onChange={(e) => setNewDynVar({ ...newDynVar, value: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" placeholder="BITS Pilani, Goa Campus" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Prefix</label>
                    <input type="text" value={newDynVar.prefix ?? ''} onChange={(e) => setNewDynVar({ ...newDynVar, prefix: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowAddDynVar(false)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
                <button
                  onClick={() => {
                    if (!newDynVar.key.trim()) { toast.error('Variable key is required'); return; }
                    if (dynamicVars.some(v => v.key === newDynVar.key)) { toast.error('Key already exists'); return; }
                    setDynamicVars([...dynamicVars, { ...newDynVar }]);
                    setNewDynVar({ key: '', type: 'counter' });
                    setShowAddDynVar(false);
                    toast.success(`Added {{${newDynVar.key}}}`);
                  }}
                  disabled={!newDynVar.key.trim()}
                  className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Add Variable
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddDynVar(true)} className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 w-full">
              + Add Dynamic Variable
            </button>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(2)} className="rounded-lg border px-6 py-2 text-sm">Back</button>
            <button onClick={() => setStep(4)} className="rounded-lg bg-primary-600 px-6 py-2 text-sm text-white">
              {dynamicVars.length === 0 ? 'Skip & Next' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Schedule */}
      {step === 4 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">When to send?</label>
            <div className="mt-2 flex gap-3">
              <button onClick={() => { setScheduleType('now'); setScheduleError(''); }} className={`rounded-lg px-4 py-2 text-sm ${scheduleType === 'now' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>Send Now</button>
              <button onClick={() => setScheduleType('later')} className={`rounded-lg px-4 py-2 text-sm ${scheduleType === 'later' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>Schedule</button>
            </div>
          </div>
          {scheduleType === 'later' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Schedule Date & Time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => { setScheduledAt(e.target.value); setScheduleError(''); }}
                min={new Date().toISOString().slice(0, 16)}
                className={`mt-1 rounded-lg border px-3 py-2 text-sm ${scheduleError ? 'border-red-300' : ''}`}
              />
              {scheduleError && <p className="mt-1 text-xs text-red-500">{scheduleError}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Emails per Second</label>
              <input type="number" value={throttlePerSecond} onChange={(e) => setThrottlePerSecond(parseInt(e.target.value) || 1)} min={1} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Emails per Hour</label>
              <input type="number" value={throttlePerHour} onChange={(e) => setThrottlePerHour(parseInt(e.target.value) || 1)} min={1} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Estimated time - more visible */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-sm font-medium text-blue-800">Estimated send time</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-blue-900">
              {contactCount === 0
                ? 'No contacts in selected list'
                : estimatedHours > 0
                  ? `~${estimatedHours}h ${estimatedMinsRemainder}m for ${contactCount.toLocaleString()} emails`
                  : `~${estimatedMinutes} minute(s) for ${contactCount.toLocaleString()} emails`}
            </p>
            <p className="mt-0.5 text-xs text-blue-600">
              At {throttlePerSecond} emails/sec, {throttlePerHour.toLocaleString()}/hr
              {isHourLimited && <span className="ml-1 text-amber-600">(limited by hourly cap)</span>}
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="rounded-lg border px-6 py-2 text-sm">Back</button>
            <button onClick={handleGoToReview} className="rounded-lg bg-primary-600 px-6 py-2 text-sm text-white">Review</button>
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold">Campaign Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Name:</span> <span className="font-medium">{name}</span></div>
            <div><span className="text-gray-500">Account:</span> <span className="font-medium">{emailAccountId ? emailAccounts.find(a => a.id === emailAccountId)?.label || 'Selected Account' : `Legacy ${provider.toUpperCase()}`}</span></div>
            <div><span className="text-gray-500">Template:</span> <span className="font-medium">{selectedTemplate?.name}</span></div>
            <div><span className="text-gray-500">List:</span> <span className="font-medium">{selectedList?.name} ({selectedList?.contact_count} contacts)</span></div>
            <div><span className="text-gray-500">Schedule:</span> <span className="font-medium">{scheduleType === 'now' ? 'Send immediately' : new Date(scheduledAt).toLocaleString()}</span></div>
            <div><span className="text-gray-500">Throttle:</span> <span className="font-medium">{throttlePerSecond}/sec, {throttlePerHour}/hr</span></div>
            {replyTo && (
              <div className="col-span-2"><span className="text-gray-500">Reply-To:</span> <span className="font-medium text-primary-700">{replyTo}</span> <span className="text-xs text-gray-400">(campaign override)</span></div>
            )}
            {subjectOverrideVal && (
              <div className="col-span-2"><span className="text-gray-500">Subject Line:</span> <span className="font-medium text-primary-700">{subjectOverrideVal}</span> <span className="text-xs text-gray-400">(overrides template)</span></div>
            )}
            {dynamicVars.length > 0 && (
              <div className="col-span-2"><span className="text-gray-500">Dynamic Variables:</span> <span className="font-medium">{dynamicVars.map(v => `{{${v.key}}} (${v.type})`).join(', ')}</span></div>
            )}
          </div>

          {/* Send Estimate */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">Send Estimate</span>
            </div>
            {sendEstimateLoading ? (
              <p className="text-sm text-gray-500">Calculating send estimate...</p>
            ) : sendEstimate ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total in list</span>
                  <span className="font-medium">{sendEstimate.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Suppressed (will skip)</span>
                  <span className="font-medium text-orange-600">{sendEstimate.suppressed.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Invalid health</span>
                  <span className="font-medium text-red-600">{sendEstimate.invalid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Estimated delivery</span>
                  <span className="font-bold text-green-600">~{sendEstimate.willSend.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Unable to calculate send estimate</p>
            )}
          </div>

          {/* Spam Score Inline */}
          <div className="rounded-lg border border-gray-200 p-3 flex items-center justify-between">
            {spamChecking ? (
              <span className="text-sm text-gray-500">Checking spam score...</span>
            ) : spamResult ? (
              <>
                <div className="flex items-center gap-2">
                  {(spamResult.grade === 'A' || spamResult.grade === 'B') ? (
                    <span className="text-sm text-green-700 font-medium">Spam Score: {spamResult.grade} ({spamResult.grade === 'A' ? 'Excellent' : 'Good'})</span>
                  ) : spamResult.grade === 'C' ? (
                    <span className="text-sm text-yellow-700 font-medium">Spam Score: {spamResult.grade} (Fair) -- {spamResult.issues.filter(i => i.severity !== 'info').length} issue(s) found</span>
                  ) : (
                    <span className="text-sm text-red-700 font-medium">Spam Score: {spamResult.grade} ({spamResult.grade === 'D' ? 'Poor' : 'Very Poor'}) -- {spamResult.issues.filter(i => i.severity !== 'info').length} issue(s) found</span>
                  )}
                </div>
                <button onClick={() => setShowSpamModal(true)} className="text-sm text-primary-600 hover:text-primary-800 font-medium">View Details</button>
              </>
            ) : (
              <span className="text-sm text-gray-400">Spam score unavailable</span>
            )}
          </div>

          {/* Email List Verification */}
          <div className="rounded-lg border border-gray-200 p-3 flex items-center justify-between">
            {verifyChecking ? (
              <span className="text-sm text-gray-500">Verifying email list...</span>
            ) : verifyResult ? (
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-green-600">{verifyResult.valid} valid</span>
                    {verifyResult.risky > 0 && <span className="font-medium text-yellow-600">{verifyResult.risky} risky</span>}
                    {verifyResult.invalid > 0 && <span className="font-medium text-red-600">{verifyResult.invalid} invalid</span>}
                  </div>
                  <button onClick={() => setShowVerifyModal(true)} className="text-sm text-primary-600 hover:text-primary-800 font-medium">View Details</button>
                </div>
                {(verifyResult.invalid > 0 || verifyResult.risky > 0) && (
                  <div className="mt-2 flex items-center gap-2">
                    {verifyResult.invalid > 0 && (
                      <button
                        onClick={async () => {
                          try {
                            const { bulkSuppressContacts } = await import('../api/contacts.api');
                            await bulkSuppressContacts({ filters: { listId, health_status: 'invalid' } });
                            toast.success(`${verifyResult.invalid} invalid contacts suppressed`);
                            setVerifyResult({ ...verifyResult, invalid: 0 });
                          } catch { toast.error('Failed to suppress'); }
                        }}
                        className="rounded bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                      >
                        Suppress {verifyResult.invalid} invalid
                      </button>
                    )}
                    {verifyResult.risky > 0 && (
                      <button
                        onClick={async () => {
                          try {
                            const { bulkSuppressContacts } = await import('../api/contacts.api');
                            await bulkSuppressContacts({ filters: { listId, health_status: 'risky' } });
                            toast.success(`${verifyResult.risky} risky contacts suppressed`);
                            setVerifyResult({ ...verifyResult, risky: 0 });
                          } catch { toast.error('Failed to suppress'); }
                        }}
                        className="rounded bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-200"
                      >
                        Suppress {verifyResult.risky} risky
                      </button>
                    )}
                    <button
                      onClick={handleVerifyEmailList}
                      className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      Re-verify
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <span className="text-sm text-gray-500">Verify your email list before sending</span>
                <button
                  onClick={handleVerifyEmailList}
                  disabled={!listId}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Verify Email List
                </button>
              </>
            )}
          </div>

          {/* Attachments in review */}
          {renderReviewAttachments()}

          {/* Custom Subject Line Override */}
          <div className="rounded-lg border border-gray-200 p-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Custom Subject Line <span className="text-gray-400 font-normal">(optional — overrides template subject)</span>
            </label>
            <input
              type="text"
              value={subjectOverrideVal}
              onChange={(e) => setSubjectOverrideVal(e.target.value)}
              placeholder={selectedTemplate?.subject || 'Leave blank to use template subject'}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              autoComplete="off"
            />
            {subjectOverrideVal && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-green-600">Custom subject will be used instead of template subject</span>
                <button onClick={() => setSubjectOverrideVal('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-400">Supports variables: {'{{name}}'}, {'{{email}}'}, {'{{state}}'}, etc.</p>
          </div>

          {/* A/B Test Configuration */}
          <div className="rounded-lg border border-gray-200">
            <label className="flex cursor-pointer items-center gap-3 p-4">
              <input
                type="checkbox"
                checked={abTestEnabled}
                onChange={(e) => setAbTestEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Enable A/B Test</span>
                <p className="text-xs text-gray-500">Split your audience to test different subject lines and pick a winner automatically</p>
              </div>
            </label>

            {abTestEnabled && (
              <div className="border-t px-4 pb-4 pt-3 space-y-3">
                {/* Variant A (read-only) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Variant A (Original)</label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {selectedTemplate?.subject || 'No template selected'}
                  </div>
                </div>

                {/* Variant B subject */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Variant B Subject</label>
                  <input
                    type="text"
                    value={abVariantBSubject}
                    onChange={(e) => setAbVariantBSubject(e.target.value)}
                    placeholder="Enter a different subject line to test..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                {/* Split percentage */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Test Split: {abSplitPercentage}% ({abSplitPercentage / 2}% A + {abSplitPercentage / 2}% B + {100 - abSplitPercentage}% winner)
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={50}
                    step={2}
                    value={abSplitPercentage}
                    onChange={(e) => setAbSplitPercentage(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="mt-1 flex justify-between text-xs text-gray-400">
                    <span>10%</span>
                    <span>50%</span>
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Test Duration (hours)</label>
                  <select
                    value={abTestDuration}
                    onChange={(e) => setAbTestDuration(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  >
                    {[1, 2, 4, 6, 12, 24, 48].map((h) => (
                      <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Winner metric */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Winner Metric</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="abWinnerMetric"
                        checked={abWinnerMetric === 'open_rate'}
                        onChange={() => setAbWinnerMetric('open_rate')}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      Open Rate
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="abWinnerMetric"
                        checked={abWinnerMetric === 'click_rate'}
                        onChange={() => setAbWinnerMetric('click_rate')}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      Click Rate
                    </label>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                  <strong>How it works:</strong> {abSplitPercentage / 2}% of contacts receive the original subject (A),
                  another {abSplitPercentage / 2}% receive the test subject (B). After {abTestDuration} hour{abTestDuration > 1 ? 's' : ''},
                  the variant with the higher {abWinnerMetric === 'open_rate' ? 'open rate' : 'click rate'} wins,
                  and the remaining {100 - abSplitPercentage}% receive the winning version.
                </div>
              </div>
            )}
          </div>

          {/* Send Test Email — Tabbed: Quick / From List / Multiple */}
          <div className="rounded-lg border border-gray-200">
            <button
              onClick={() => setTestEmailExpanded(!testEmailExpanded)}
              className="flex w-full items-center justify-between p-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span>Send Test Email</span>
              <svg className={`h-4 w-4 transition-transform ${testEmailExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {testEmailExpanded && (
              <div className="border-t p-4 space-y-3">
                {/* Tabs */}
                <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
                  {([['quick', 'Quick Send'], ['list', 'From List'], ['multiple', 'Multiple']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTestTab(key)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        testTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Quick Send Tab */}
                {testTab === 'quick' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="Enter email address..."
                        autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      />
                      <button
                        disabled={!testEmailAddress || testEmailSending || !selectedTemplate}
                        onClick={async () => {
                          if (!selectedTemplate || !testEmailAddress) return;
                          setTestEmailSending(true);
                          try {
                            const sampleContact: Contact = {
                              id: '', email: testEmailAddress, name: 'Test User', metadata: {},
                              status: 'active', bounce_count: 0, send_count: 0, last_sent_at: null,
                              created_at: '', state: null, district: null, block: null,
                              classes: null, category: null, management: null, address: null,
                            };
                            const subj = subjectOverrideVal || selectedTemplate.subject;
                            const renderedSubject = replaceVariables(subj, sampleContact);
                            const renderedHtml = replaceVariables(selectedTemplate.html_body, sampleContact);
                            await sendTestEmail(testEmailAddress, { subject: renderedSubject, html: renderedHtml, campaignId: draftId || undefined, emailAccountId: emailAccountId || undefined });
                            toast.success(`Test sent to ${testEmailAddress}`);
                          } catch {
                            toast.error('Failed to send test email');
                          } finally {
                            setTestEmailSending(false);
                          }
                        }}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {testEmailSending ? 'Sending...' : 'Send Test'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
                      Variables like {'{{name}}'} will show as "Test User"{draftId && totalAttachmentCount > 0 ? '. Attachments included.' : '.'}
                    </p>
                  </div>
                )}

                {/* From List Tab */}
                {testTab === 'list' && (
                  <div className="space-y-3">
                    <select
                      value={testListId}
                      onChange={(e) => { setTestListId(e.target.value); setTestSelectedIds(new Set()); }}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">Select a list...</option>
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.id === listId ? ' (campaign list)' : ''}
                        </option>
                      ))}
                    </select>

                    {testListLoading && (
                      <p className="text-xs text-gray-400">Loading contacts...</p>
                    )}

                    {!testListLoading && testListContacts.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {testListContacts.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={testSelectedIds.has(c.id)}
                              onChange={() => {
                                setTestSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                  return next;
                                });
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="text-gray-700 truncate">{c.email}</span>
                            {c.name && <span className="text-gray-400 text-xs truncate">{c.name}</span>}
                          </label>
                        ))}
                      </div>
                    )}

                    {!testListLoading && testListId && testListContacts.length === 0 && (
                      <p className="text-xs text-gray-400">No contacts in this list.</p>
                    )}

                    {testProgress.total > 0 && testSending && (
                      <div className="text-xs text-gray-500">
                        Sending {testProgress.sent} of {testProgress.total}...
                      </div>
                    )}

                    <button
                      disabled={testSelectedIds.size === 0 || testSending || !selectedTemplate}
                      onClick={async () => {
                        if (!selectedTemplate) return;
                        const selected = testListContacts.filter((c) => testSelectedIds.has(c.id));
                        if (selected.length === 0) return;
                        setTestSending(true);
                        setTestProgress({ sent: 0, total: selected.length });
                        let sent = 0;
                        try {
                          for (const contact of selected) {
                            const subj = subjectOverrideVal || selectedTemplate.subject;
                            const renderedSubject = replaceVariables(subj, contact);
                            const renderedHtml = replaceVariables(selectedTemplate.html_body, contact);
                            await sendTestEmail(contact.email, { subject: renderedSubject, html: renderedHtml, campaignId: draftId || undefined, emailAccountId: emailAccountId || undefined });
                            sent++;
                            setTestProgress({ sent, total: selected.length });
                          }
                          toast.success(`Test sent to ${sent} contact${sent !== 1 ? 's' : ''}`);
                        } catch {
                          toast.error(`Failed after sending ${sent} of ${selected.length}`);
                        } finally {
                          setTestSending(false);
                          setTestProgress({ sent: 0, total: 0 });
                        }
                      }}
                      className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {testSending
                        ? `Sending ${testProgress.sent}/${testProgress.total}...`
                        : `Send to ${testSelectedIds.size} Selected`}
                    </button>
                  </div>
                )}

                {/* Multiple Tab */}
                {testTab === 'multiple' && (
                  <div className="space-y-2">
                    <textarea
                      placeholder="Paste emails, one per line..."
                      value={testMultipleEmails}
                      onChange={(e) => setTestMultipleEmails(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                    />
                    {(() => {
                      const emails = testMultipleEmails.split('\n').map((e) => e.trim()).filter((e) => e && e.includes('@'));
                      return (
                        <>
                          {testProgress.total > 0 && testSending && (
                            <div className="text-xs text-gray-500">
                              Sending {testProgress.sent} of {testProgress.total}...
                            </div>
                          )}
                          <button
                            disabled={emails.length === 0 || testSending || !selectedTemplate}
                            onClick={async () => {
                              if (!selectedTemplate || emails.length === 0) return;
                              setTestSending(true);
                              setTestProgress({ sent: 0, total: emails.length });
                              let sent = 0;
                              try {
                                for (const email of emails) {
                                  const sampleContact: Contact = {
                                    id: '', email, name: 'Test User', metadata: {},
                                    status: 'active', bounce_count: 0, send_count: 0, last_sent_at: null,
                                    created_at: '', state: null, district: null, block: null,
                                    classes: null, category: null, management: null, address: null,
                                  };
                                  const subj = subjectOverrideVal || selectedTemplate.subject;
                                  const renderedSubject = replaceVariables(subj, sampleContact);
                                  const renderedHtml = replaceVariables(selectedTemplate.html_body, sampleContact);
                                  await sendTestEmail(email, { subject: renderedSubject, html: renderedHtml, campaignId: draftId || undefined, emailAccountId: emailAccountId || undefined });
                                  sent++;
                                  setTestProgress({ sent, total: emails.length });
                                }
                                toast.success(`Test sent to ${sent} email${sent !== 1 ? 's' : ''}`);
                              } catch {
                                toast.error(`Failed after sending ${sent} of ${emails.length}`);
                              } finally {
                                setTestSending(false);
                                setTestProgress({ sent: 0, total: 0 });
                              }
                            }}
                            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {testSending
                              ? `Sending ${testProgress.sent}/${testProgress.total}...`
                              : `Send to ${emails.length} Email${emails.length !== 1 ? 's' : ''}`}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upload progress during campaign creation */}
          {showUploadProgress && uploadProgressFiles.length > 0 && (
            <div className="mt-4">
              <UploadProgress
                files={uploadProgressFiles}
                onCancel={handleCancelUpload}
                showTotal
              />
            </div>
          )}

          {/* Estimated time in review */}
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-500">Estimated time:</span>{' '}
            <span className="font-medium">
              {estimatedHours > 0
                ? `~${estimatedHours}h ${estimatedMinsRemainder}m`
                : `~${estimatedMinutes} minute(s)`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setStep(4)} className="rounded-lg border px-6 py-2 text-sm">Back</button>
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || creating || !name.trim()}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {savingDraft ? 'Saving...' : 'Save as Draft'}
            </button>
            <button onClick={() => setShowConfirm(true)} disabled={creating} className="rounded-lg bg-primary-600 px-6 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
              {creating ? 'Creating...' : scheduleType === 'now' ? 'Send Now' : 'Schedule Campaign'}
            </button>
            {lastSaved && (
              <span className="text-xs text-gray-400">
                Auto-saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Spam Score Modal */}
      {showSpamModal && spamResult && (
        <SpamScoreModal result={spamResult} onClose={() => setShowSpamModal(false)} />
      )}

      {showVerifyModal && verifyEmails.length > 0 && (
        <EmailVerifyModal emails={verifyEmails} onClose={() => setShowVerifyModal(false)} />
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {scheduleType === 'now' ? 'Confirm Send' : 'Confirm Schedule'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {scheduleType === 'now'
                ? `This will immediately start sending ${contactCount.toLocaleString()} emails using ${provider.toUpperCase()}. This action cannot be undone.`
                : `This will schedule ${contactCount.toLocaleString()} emails to be sent on ${new Date(scheduledAt).toLocaleString()} using ${provider.toUpperCase()}.`}
            </p>
            <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
              <strong>Campaign:</strong> {name}<br />
              <strong>Template:</strong> {selectedTemplate?.name}<br />
              <strong>List:</strong> {selectedList?.name} ({contactCount} contacts)
              {renderConfirmAttachments()}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
                {creating ? 'Processing...' : 'Yes, proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
