import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';
import { getTemplate, createTemplate, updateTemplate, getTemplateVersions, getTemplateVersion, restoreTemplateVersion, updateVersionLabel, checkSpamScore, SpamCheckResult } from '../api/templates.api';
import { sendTestEmail } from '../api/settings.api';
import { useCustomVariables } from '../hooks/useCustomVariables';
import EmailVisualBuilder, { EmailBlock, blocksToHtml, htmlToBlocks } from '../components/EmailVisualBuilder';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: #2563eb; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .footer { padding: 20px 30px; text-align: center; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Organization</h1>
    </div>
    <div class="content">
      <p>Dear {{school_name}},</p>
      <p>We are pleased to invite you to our programme.</p>
      <p>Best regards,<br>Your Team</p>
    </div>
    <div class="footer">
      <p>You are receiving this because you are registered as {{email}}</p>
    </div>
  </div>
</body>
</html>`;

/** Client-side HTML to plain text conversion */
function htmlToText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  // Remove style/script elements
  temp.querySelectorAll('style, script').forEach((el) => el.remove());
  return temp.textContent || temp.innerText || '';
}

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState(DEFAULT_HTML);
  const [textBody, setTextBody] = useState(() => htmlToText(DEFAULT_HTML));
  const [versions, setVersions] = useState<{ version: number; subject: string; label?: string; created_at: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [variables, setVariables] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [showVariablesPanel, setShowVariablesPanel] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState<number | null>(null);
  const [previewVersionHtml, setPreviewVersionHtml] = useState('');
  const [editingLabel, setEditingLabel] = useState<number | null>(null);
  const [labelText, setLabelText] = useState('');
  const [showSpamModal, setShowSpamModal] = useState(false);
  const [spamResult, setSpamResult] = useState<SpamCheckResult | null>(null);
  const [spamChecking, setSpamChecking] = useState(false);
  const [editorMode, setEditorMode] = useState<'code' | 'visual' | 'plaintext'>('code');
  const [visualBlocks, setVisualBlocks] = useState<EmailBlock[]>([]);

  const { data: customVariables = [] } = useCustomVariables();

  const STANDARD_VARIABLES = [
    { key: 'name', label: 'Contact Name' },
    { key: 'email', label: 'Email Address' },
    { key: 'state', label: 'State' },
    { key: 'district', label: 'District' },
    { key: 'block', label: 'Block' },
    { key: 'classes', label: 'Classes' },
    { key: 'category', label: 'Category' },
    { key: 'management', label: 'Management' },
    { key: 'address', label: 'Address' },
    { key: 'unsubscribe_url', label: 'Unsubscribe Link URL' },
  ];

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const savedStateRef = useRef({ name: '', subject: '', htmlBody: DEFAULT_HTML, textBody: htmlToText(DEFAULT_HTML) });

  useEffect(() => {
    if (!isNew && id) {
      getTemplate(id).then((t) => {
        setName(t.name);
        setSubject(t.subject);
        setHtmlBody(t.html_body);
        setTextBody(t.text_body || htmlToText(t.html_body));
        setVariables(t.variables || []);
        savedStateRef.current = { name: t.name, subject: t.subject, htmlBody: t.html_body, textBody: t.text_body || htmlToText(t.html_body) };
      }).catch(() => toast.error('Failed to load template'));
      getTemplateVersions(id).then(setVersions).catch(() => {});
    }
  }, [id, isNew]);

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const autoSaveDraftRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftKey = `cadencerelay-template-draft-${id || 'new'}`;

  // Check for saved draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && draft.htmlBody && draft.savedAt) {
          const savedAgo = Date.now() - draft.savedAt;
          // Only show draft if less than 7 days old
          if (savedAgo < 7 * 24 * 60 * 60 * 1000) {
            setShowDraftBanner(true);
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      }
    } catch { /* ignore corrupt data */ }
  }, [draftKey]);

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.name) setName(draft.name);
        if (draft.subject) setSubject(draft.subject);
        if (draft.htmlBody) setHtmlBody(draft.htmlBody);
        if (draft.textBody) setTextBody(draft.textBody);
        toast.success('Draft restored');
      }
    } catch { /* ignore */ }
    setShowDraftBanner(false);
  }

  function dismissDraft() {
    localStorage.removeItem(draftKey);
    setShowDraftBanner(false);
  }

  // Track unsaved changes
  useEffect(() => {
    const saved = savedStateRef.current;
    const changed = name !== saved.name || subject !== saved.subject || htmlBody !== saved.htmlBody || textBody !== saved.textBody;
    setHasUnsavedChanges(changed);
  }, [name, subject, htmlBody, textBody]);

  // Auto-save draft to localStorage every 30 seconds when there are unsaved changes
  useEffect(() => {
    if (autoSaveDraftRef.current) clearInterval(autoSaveDraftRef.current);
    autoSaveDraftRef.current = setInterval(() => {
      if (hasUnsavedChanges && (name || subject || htmlBody !== DEFAULT_HTML)) {
        try {
          localStorage.setItem(draftKey, JSON.stringify({
            name, subject, htmlBody, textBody, savedAt: Date.now(),
          }));
        } catch { /* localStorage full or unavailable */ }
      }
    }, 30000); // 30 seconds
    return () => { if (autoSaveDraftRef.current) clearInterval(autoSaveDraftRef.current); };
  }, [hasUnsavedChanges, name, subject, htmlBody, textBody, draftKey]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const updatePreview = useCallback(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlBody);
        doc.close();
      }
    }
  }, [htmlBody]);

  useEffect(() => {
    // Detect variables
    const regex = /\{\{(\w+)\}\}/g;
    const vars = new Set<string>();
    let match;
    while ((match = regex.exec(htmlBody)) !== null) vars.add(match[1]);
    setVariables(Array.from(vars));

    // Update preview with a small delay for iframe readiness
    const timer = setTimeout(updatePreview, 100);
    return () => clearTimeout(timer);
  }, [htmlBody, updatePreview]);

  // Also update preview when iframe loads
  function handleIframeLoad() {
    updatePreview();
  }

  async function handleSave() {
    if (!name || !subject || !htmlBody) {
      toast.error('Name, subject, and HTML body are required');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const projectFromUrl = searchParams.get('project') || undefined;
        const t = await createTemplate({ name, subject, htmlBody, textBody, projectId: projectFromUrl });
        toast.success('Template created');
        savedStateRef.current = { name, subject, htmlBody, textBody };
        setHasUnsavedChanges(false);
        // Clear draft on successful save
        localStorage.removeItem(draftKey);
        navigate(`/templates/${t.id}/edit`, { replace: true });
      } else {
        await updateTemplate(id!, { name, subject, htmlBody, textBody });
        toast.success('Template saved');
        savedStateRef.current = { name, subject, htmlBody, textBody };
        setHasUnsavedChanges(false);
        // Clear draft on successful save
        localStorage.removeItem(draftKey);
        getTemplateVersions(id!).then(setVersions).catch(() => {});
      }
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    if (!testEmail.trim()) {
      toast.error('Please enter a test email address');
      return;
    }
    setSendingTest(true);
    try {
      await sendTestEmail(testEmail, { subject: subject || 'Test Email from CadenceRelay', html: htmlBody });
      toast.success(`Test email sent to ${testEmail}`);
      setShowTestModal(false);
      setTestEmail('');
    } catch {
      toast.error('Failed to send test email. Check your email provider settings.');
    } finally {
      setSendingTest(false);
    }
  }

  async function handlePreviewVersion(version: number) {
    if (!id) return;
    if (previewingVersion === version) {
      setPreviewingVersion(null);
      setPreviewVersionHtml('');
      return;
    }
    try {
      const v = await getTemplateVersion(id, version);
      setPreviewingVersion(version);
      setPreviewVersionHtml(v.html_body);
    } catch {
      toast.error('Failed to load version');
    }
  }

  async function handleRestoreVersion(version: number) {
    if (!id) return;
    if (!confirm(`Restore to v${version}? This creates a new version with that content.`)) return;
    try {
      const res = await restoreTemplateVersion(id, version);
      toast.success(res.message);
      // Reload template and versions
      const t = await getTemplate(id);
      setName(t.name);
      setSubject(t.subject);
      setHtmlBody(t.html_body);
      setTextBody(t.text_body || htmlToText(t.html_body));
      setVariables(t.variables || []);
      savedStateRef.current = { name: t.name, subject: t.subject, htmlBody: t.html_body, textBody: t.text_body || htmlToText(t.html_body) };
      setHasUnsavedChanges(false);
      getTemplateVersions(id).then(setVersions).catch(() => {});
      setPreviewingVersion(null);
      setPreviewVersionHtml('');
    } catch {
      toast.error('Failed to restore version');
    }
  }

  async function handleSaveLabel(version: number) {
    if (!id) return;
    try {
      await updateVersionLabel(id, version, labelText);
      toast.success('Label saved');
      setEditingLabel(null);
      getTemplateVersions(id).then(setVersions).catch(() => {});
    } catch {
      toast.error('Failed to save label');
    }
  }

  async function handleSpamCheck() {
    setSpamChecking(true);
    try {
      const result = await checkSpamScore({ subject, html: htmlBody, hasPlainText: !!textBody.trim() });
      setSpamResult(result);
      setShowSpamModal(true);
    } catch {
      toast.error('Failed to check spam score');
    } finally {
      setSpamChecking(false);
    }
  }

  function handleBack() {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to leave?')) return;
    }
    navigate('/templates');
  }

  function handleImportHtml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm') && file.type !== 'text/html') {
      toast.error('Please select an HTML file (.html or .htm)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        if (hasUnsavedChanges && !confirm('This will replace your current template content. Continue?')) return;
        setHtmlBody(content);
        toast.success(`Imported ${file.name}`);
      }
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsText(file);
    // Reset input so same file can be imported again
    e.target.value = '';
  }

  // Store the HTML before switching to visual, so we can restore if parsing fails
  const preVisualHtmlRef = useRef<string | null>(null);

  function handleSwitchMode(mode: 'code' | 'visual' | 'plaintext') {
    if (mode === editorMode) return;

    // Switching away from visual -> code: generate HTML from blocks
    // But ONLY if we actually used the visual editor (not if parsing failed and we preserved original)
    if (editorMode === 'visual' && mode !== 'visual') {
      if (preVisualHtmlRef.current !== null && visualBlocks.length <= 1 && visualBlocks[0]?.props?.content?.includes('Start adding blocks')) {
        // User switched to visual but parsing failed and they didn't add any blocks — restore original HTML
        setHtmlBody(preVisualHtmlRef.current);
      } else {
        const generatedHtml = blocksToHtml(visualBlocks);
        setHtmlBody(generatedHtml);
      }
      preVisualHtmlRef.current = null;
    }

    // Switching to visual from code/plaintext: try to parse HTML into blocks
    if (mode === 'visual') {
      const parsed = htmlToBlocks(htmlBody);
      if (parsed) {
        setVisualBlocks(parsed);
        preVisualHtmlRef.current = null;
      } else {
        // HTML can't be parsed — warn user with a confirmation dialog
        const proceed = window.confirm(
          'Your custom HTML cannot be automatically converted to visual blocks.\n\n' +
          'If you proceed, you\'ll start with a blank visual canvas. Your code will be safely preserved — switching back to Code mode will restore it.\n\n' +
          'Alternatively, click Cancel to stay in Code mode.'
        );
        if (!proceed) return; // Stay in code mode

        // Save current HTML so we can restore when they switch back
        preVisualHtmlRef.current = htmlBody;
        setVisualBlocks([{
          id: crypto.randomUUID(),
          type: 'text',
          props: { content: 'Start adding blocks to build your email visually.', fontSize: '16', color: '#333333' },
        }]);
      }
    }

    setEditorMode(mode);
  }

  function handleAutoGenerateText() {
    const generated = htmlToText(htmlBody);
    setTextBody(generated);
    toast.success('Plain text auto-generated from HTML');
  }

  const handleVisualBlocksChange = useCallback((newBlocks: EmailBlock[]) => {
    setVisualBlocks(newBlocks);
  }, []);

  const handleVisualHtmlChange = useCallback((html: string) => {
    setHtmlBody(html);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Draft Recovery Banner */}
      {showDraftBanner && (
        <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span className="text-amber-500 text-lg">&#x1f4dd;</span>
            <span>You have an unsaved draft from a previous session.</span>
          </div>
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700">
              Restore Draft
            </button>
            <button onClick={dismissDraft} className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={handleBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
        <input
          type="text"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="text"
          placeholder="Email subject line"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 rounded border px-2 py-1 text-sm"
        />
        {versions.length > 0 && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            v{versions[0]?.version || 1}
            {versions[0]?.label && <span className="ml-1 text-gray-400">({versions[0].label})</span>}
          </span>
        )}
        {hasUnsavedChanges && (
          <span className="text-xs text-orange-500 font-medium" title="Changes auto-saved as draft every 30s">Unsaved (draft auto-saving)</span>
        )}
        {/* Editor Mode Toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => handleSwitchMode('code')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              editorMode === 'code'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Code
          </button>
          <button
            onClick={() => handleSwitchMode('visual')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
              editorMode === 'visual'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => handleSwitchMode('plaintext')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
              editorMode === 'plaintext'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Plain Text
          </button>
        </div>
        <button
          onClick={() => setShowVariablesPanel(!showVariablesPanel)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${showVariablesPanel ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-300 hover:bg-gray-50'}`}
        >
          Variables
        </button>
        {!isNew && versions.length > 1 && (
          <button
            onClick={() => { setShowVersionHistory(!showVersionHistory); setShowVariablesPanel(false); }}
            className={`rounded-lg border px-3 py-1.5 text-sm ${showVersionHistory ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-300 hover:bg-gray-50'}`}
          >
            History ({versions.length})
          </button>
        )}
        <button
          onClick={handleSpamCheck}
          disabled={spamChecking || (!subject && !htmlBody)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {spamChecking ? 'Checking...' : 'Spam Score'}
        </button>
        <button onClick={() => htmlFileInputRef.current?.click()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Import HTML
        </button>
        <input ref={htmlFileInputRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={handleImportHtml} />
        <button onClick={() => setShowTestModal(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Send Test
        </button>
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Variables bar */}
      {variables.length > 0 && (
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <span className="text-xs text-gray-500">Variables:</span>
          {variables.map((v) => (
            <span key={v} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-mono">{`{{${v}}}`}</span>
          ))}
        </div>
      )}

      {/* Editor + Preview split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Available Variables Panel */}
        {showVariablesPanel && (
          <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Available Variables</h3>
              <button onClick={() => setShowVariablesPanel(false)} className="text-gray-400 hover:text-gray-600 text-xs">&times;</button>
            </div>
            <p className="mb-3 text-xs text-gray-400">Click to copy. Use in templates as {'{{key}}'}.</p>

            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium text-gray-500">Standard</h4>
              <div className="space-y-1">
                {STANDARD_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${v.key}}}`);
                      toast.success(`Copied {{${v.key}}}`);
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
                    title={`Click to copy {{${v.key}}}`}
                  >
                    <code className="text-blue-600 font-mono">{`{{${v.key}}}`}</code>
                    <span className="ml-1 text-gray-400">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {customVariables.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">Custom</h4>
                <div className="space-y-1">
                  {customVariables.map((cv) => (
                    <button
                      key={cv.id}
                      onClick={() => {
                        navigator.clipboard.writeText(`{{${cv.key}}}`);
                        toast.success(`Copied {{${cv.key}}}`);
                      }}
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
                      title={`Click to copy {{${cv.key}}}`}
                    >
                      <code className="text-purple-600 font-mono">{`{{${cv.key}}}`}</code>
                      <span className="ml-1 text-gray-400">{cv.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Version History Panel */}
        {showVersionHistory && (
          <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
            <div className="sticky top-0 z-10 border-b bg-white px-3 py-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Version History</h3>
                <button onClick={() => { setShowVersionHistory(false); setPreviewingVersion(null); setPreviewVersionHtml(''); }} className="text-gray-400 hover:text-gray-600 text-xs">&times;</button>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {versions.map((v, i) => (
                <div
                  key={v.version}
                  className={`px-3 py-3 ${previewingVersion === v.version ? 'bg-primary-50 border-l-2 border-primary-500' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800">v{v.version}</span>
                      {i === 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Current</span>}
                    </div>
                    <span className="text-[10px] text-gray-400">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Label / nickname */}
                  {editingLabel === v.version ? (
                    <div className="mt-1.5 flex gap-1">
                      <input
                        type="text"
                        value={labelText}
                        onChange={(e) => setLabelText(e.target.value)}
                        placeholder="e.g. Final version"
                        className="flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-primary-500 focus:outline-none"
                        maxLength={100}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLabel(v.version); if (e.key === 'Escape') setEditingLabel(null); }}
                      />
                      <button onClick={() => handleSaveLabel(v.version)} className="text-xs text-primary-600 hover:text-primary-800">Save</button>
                    </div>
                  ) : (
                    <div className="mt-0.5 flex items-center gap-1">
                      {v.label ? (
                        <span className="text-xs text-primary-600 font-medium">{v.label}</span>
                      ) : null}
                      <button
                        onClick={() => { setEditingLabel(v.version); setLabelText(v.label || ''); }}
                        className="text-[10px] text-gray-400 hover:text-gray-600"
                      >
                        {v.label ? 'edit' : '+ label'}
                      </button>
                    </div>
                  )}

                  <p className="mt-1 text-xs text-gray-500 truncate">{v.subject}</p>
                  <p className="text-[10px] text-gray-400">{new Date(v.created_at).toLocaleTimeString()}</p>

                  {/* Actions */}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handlePreviewVersion(v.version)}
                      className={`text-xs ${previewingVersion === v.version ? 'text-primary-700 font-medium' : 'text-primary-600 hover:text-primary-800'}`}
                    >
                      {previewingVersion === v.version ? 'Hide Preview' : 'Preview'}
                    </button>
                    {i !== 0 && (
                      <button
                        onClick={() => handleRestoreVersion(v.version)}
                        className="text-xs text-orange-600 hover:text-orange-800"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editorMode === 'visual' ? (
          /* Visual Builder -- takes the full remaining width */
          <div className="flex flex-1 overflow-hidden">
            <EmailVisualBuilder
              blocks={visualBlocks}
              onChange={handleVisualBlocksChange}
              onHtmlChange={handleVisualHtmlChange}
            />
          </div>
        ) : editorMode === 'plaintext' ? (
          /* Plain Text Editor */
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Plain Text Version</span>
                  <span className="text-xs text-gray-400">
                    This is sent as the text/plain alternative for email clients that don't render HTML.
                  </span>
                </div>
                <button
                  onClick={handleAutoGenerateText}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Auto-generate from HTML
                </button>
              </div>
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                className="flex-1 resize-none bg-white p-4 font-mono text-sm text-gray-800 focus:outline-none"
                placeholder="Plain text version of your email..."
              />
            </div>
          </div>
        ) : (
          /* Code Editor + Preview (original layout) */
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 border-r border-gray-200">
              <Editor
                height="100%"
                defaultLanguage="html"
                value={htmlBody}
                onChange={(val) => setHtmlBody(val || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
            <div className="w-1/2 bg-gray-100 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  {previewingVersion ? `Preview -- v${previewingVersion}` : 'Preview'}
                </span>
                {previewingVersion && (
                  <button onClick={() => { setPreviewingVersion(null); setPreviewVersionHtml(''); }} className="text-xs text-primary-600">
                    Back to current
                  </button>
                )}
              </div>
              {previewingVersion && previewVersionHtml ? (
                <iframe
                  className="h-full w-full rounded-lg border bg-white"
                  title="Version Preview"
                  sandbox="allow-same-origin"
                  srcDoc={previewVersionHtml}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  className="h-full w-full rounded-lg border bg-white"
                  title="Template Preview"
                  sandbox="allow-same-origin"
                  onLoad={handleIframeLoad}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Send Test Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">Send Test Email</h3>
            <p className="mt-1 text-sm text-gray-500">
              Send a test email using your current provider settings. The template will be sent as-is (variables will not be replaced).
            </p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Recipient Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowTestModal(false); setTestEmail(''); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleSendTest} disabled={sendingTest || !testEmail.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
                {sendingTest ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spam Score Modal */}
      {showSpamModal && spamResult && (
        <SpamScoreModal result={spamResult} onClose={() => setShowSpamModal(false)} />
      )}
    </div>
  );
}

function gradeColor(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'text-green-600';
  if (grade === 'C') return 'text-yellow-600';
  return 'text-red-600';
}

function gradeBgColor(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'bg-green-50 border-green-200';
  if (grade === 'C') return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

function gradeLabel(grade: string): string {
  switch (grade) {
    case 'A': return 'Excellent';
    case 'B': return 'Good';
    case 'C': return 'Fair -- review recommended';
    case 'D': return 'Poor -- likely spam filtered';
    case 'F': return 'Very poor -- will be spam';
    default: return '';
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'error': return '\u26D4';
    case 'warning': return '\u26A0\uFE0F';
    case 'info': return '\u2139\uFE0F';
    default: return '';
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'error': return 'text-red-700 bg-red-50';
    case 'warning': return 'text-yellow-800 bg-yellow-50';
    case 'info': return 'text-blue-700 bg-blue-50';
    default: return '';
  }
}

export function SpamScoreModal({ result, onClose }: { result: SpamCheckResult; onClose: () => void }) {
  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');
  const sortedIssues = [...errors, ...warnings, ...infos];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Spam Score Analysis</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Score header */}
        <div className={`rounded-lg border p-4 mb-4 ${gradeBgColor(result.grade)}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className={`text-3xl font-bold ${gradeColor(result.grade)}`}>{result.score}/100</span>
              <span className={`ml-3 text-lg font-semibold ${gradeColor(result.grade)}`}>Grade: {result.grade}</span>
            </div>
          </div>
          <p className={`mt-1 text-sm ${gradeColor(result.grade)}`}>{gradeLabel(result.grade)}</p>
        </div>

        {/* Issues list */}
        {sortedIssues.length > 0 ? (
          <div className="space-y-2 mb-4">
            {sortedIssues.map((issue, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-sm ${severityColor(issue.severity)}`}>
                <span className="mr-1">{severityIcon(issue.severity)}</span>
                <span className="font-medium uppercase text-xs mr-2">{issue.severity}:</span>
                {issue.message}
                {issue.points > 0 && <span className="ml-1 opacity-70">(+{issue.points})</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-4">No issues found.</p>
        )}

        {/* Recommendations */}
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="rounded-lg bg-gray-50 p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Recommendations</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              {errors.some(i => i.rule === 'subject-all-caps') && <li>Use mixed case in your subject line</li>}
              {errors.some(i => i.rule === 'body-hidden-text') && <li>Remove hidden text from the email body</li>}
              {warnings.some(i => i.rule === 'subject-spammy-word') && <li>Remove or rephrase promotional words in the subject</li>}
              {warnings.some(i => i.rule === 'subject-excessive-punctuation') && <li>Reduce excessive punctuation in the subject</li>}
              {warnings.some(i => i.rule === 'subject-fake-reply') && <li>Remove misleading "Re:" or "Fwd:" prefix from subject</li>}
              {warnings.some(i => i.rule === 'body-image-heavy') && <li>Add more text content to balance the image-to-text ratio</li>}
              {warnings.some(i => i.rule === 'body-excessive-links') && <li>Reduce the number of links in the email body</li>}
              {warnings.some(i => i.rule === 'body-no-unsubscribe') && <li>Add visible "unsubscribe" text to the email body</li>}
              {warnings.some(i => i.rule === 'body-all-caps') && <li>Use mixed case for body text instead of all caps</li>}
            </ul>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">Close</button>
        </div>
      </div>
    </div>
  );
}
