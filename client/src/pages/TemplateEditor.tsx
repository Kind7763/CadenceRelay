import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import toast from 'react-hot-toast';
import { getTemplate, createTemplate, updateTemplate, getTemplateVersions } from '../api/templates.api';

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

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState(DEFAULT_HTML);
  const [versions, setVersions] = useState<{ version: number; created_at: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [variables, setVariables] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isNew && id) {
      getTemplate(id).then((t) => {
        setName(t.name);
        setSubject(t.subject);
        setHtmlBody(t.html_body);
        setVariables(t.variables || []);
      }).catch(() => toast.error('Failed to load template'));
      getTemplateVersions(id).then(setVersions).catch(() => {});
    }
  }, [id, isNew]);

  useEffect(() => {
    // Detect variables
    const regex = /\{\{(\w+)\}\}/g;
    const vars = new Set<string>();
    let match;
    while ((match = regex.exec(htmlBody)) !== null) vars.add(match[1]);
    setVariables(Array.from(vars));

    // Update preview
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlBody);
        doc.close();
      }
    }
  }, [htmlBody]);

  async function handleSave() {
    if (!name || !subject || !htmlBody) {
      toast.error('Name, subject, and HTML body are required');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const t = await createTemplate({ name, subject, htmlBody });
        toast.success('Template created');
        navigate(`/templates/${t.id}/edit`, { replace: true });
      } else {
        await updateTemplate(id!, { name, subject, htmlBody });
        toast.success('Template saved');
        getTemplateVersions(id!).then(setVersions).catch(() => {});
      }
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={() => navigate('/templates')} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
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
          <span className="text-xs text-gray-400">v{versions[0]?.version || 1}</span>
        )}
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
          <div className="mb-2 text-xs font-medium text-gray-500">Preview</div>
          <iframe
            ref={iframeRef}
            className="h-full w-full rounded-lg border bg-white"
            title="Template Preview"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
