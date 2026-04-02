import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAutomation, useCreateAutomation, useUpdateAutomation, useActivateAutomation } from '../hooks/useAutomations';
import { listTemplates, Template } from '../api/templates.api';
import { listLists, ContactList } from '../api/lists.api';
import { listCampaigns, Campaign } from '../api/campaigns.api';
import { FormSkeleton } from '../components/ui/Skeleton';
import ErrorBoundary from '../components/ErrorBoundary';

interface StepForm {
  templateId: string;
  templateName: string;
  subjectOverride: string;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
}

function emptyStep(): StepForm {
  return { templateId: '', templateName: '', subjectOverride: '', delayDays: 0, delayHours: 0, delayMinutes: 0 };
}

function formatDelay(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : 'Immediately';
}

function AutomationBuilderContent() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: existing, isLoading: loadingExisting } = useAutomation(id);
  const createMutation = useCreateAutomation();
  const updateMutation = useUpdateAutomation();
  const activateMutation = useActivateAutomation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [provider, setProvider] = useState('gmail');
  const [steps, setSteps] = useState<StepForm[]>([emptyStep()]);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [saving, setSaving] = useState(false);

  // Load templates, lists, and campaigns
  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => {});
    listLists().then(setLists).catch(() => {});
    listCampaigns({ limit: '100' }).then((res) => setCampaigns(res.data || [])).catch(() => {});
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (existing && isEdit) {
      setName(existing.name);
      setDescription(existing.description || '');
      setTriggerType(existing.trigger_type);
      setTriggerConfig(existing.trigger_config || {});
      setProvider(existing.provider);
      if (existing.steps && existing.steps.length > 0) {
        setSteps(
          existing.steps.map((s) => ({
            templateId: s.template_id,
            templateName: s.template_name || '',
            subjectOverride: s.subject_override || '',
            delayDays: s.delay_days,
            delayHours: s.delay_hours,
            delayMinutes: s.delay_minutes,
          }))
        );
      }
    }
  }, [existing, isEdit]);

  function updateStep(index: number, updates: Partial<StepForm>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function buildPayload() {
    return {
      name,
      description: description || undefined,
      triggerType,
      triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
      provider,
      steps: steps.map((s) => ({
        templateId: s.templateId,
        subjectOverride: s.subjectOverride || undefined,
        delayDays: s.delayDays,
        delayHours: s.delayHours,
        delayMinutes: s.delayMinutes,
      })),
    };
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (steps.some((s) => !s.templateId)) return;
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateMutation.mutateAsync({ id, data: buildPayload() });
        navigate(`/automations/${id}`);
      } else {
        const automation = await createMutation.mutateAsync(buildPayload());
        navigate(`/automations/${automation.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndActivate() {
    if (!name.trim()) return;
    if (steps.some((s) => !s.templateId)) return;
    setSaving(true);
    try {
      let automationId: string;
      if (isEdit && id) {
        await updateMutation.mutateAsync({ id, data: buildPayload() });
        automationId = id;
      } else {
        const automation = await createMutation.mutateAsync(buildPayload());
        automationId = automation.id;
      }
      await activateMutation.mutateAsync(automationId);
      navigate(`/automations/${automationId}`);
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6">
        <FormSkeleton fields={4} />
      </div>
    );
  }

  const selectedListName = lists.find((l) => l.id === (triggerConfig.listId as string))?.name;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/automations')}
            className="mb-2 text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Automations
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Automation' : 'New Automation'}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || steps.some((s) => !s.templateId)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            onClick={handleSaveAndActivate}
            disabled={saving || !name.trim() || steps.some((s) => !s.templateId)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Activate'}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Section 1: Details */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Welcome Drip Sequence"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="gmail">Gmail</option>
                <option value="ses">Amazon SES</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Trigger Type</label>
              <select
                value={triggerType}
                onChange={(e) => {
                  setTriggerType(e.target.value);
                  setTriggerConfig({});
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="manual">Manual (enroll contacts manually)</option>
                <option value="contact_added">When contact is added</option>
                <option value="list_join">When contact joins a list</option>
                <option value="email_opened">When email is opened</option>
                <option value="email_clicked">When link is clicked</option>
              </select>
            </div>
            {triggerType === 'list_join' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Select List</label>
                <select
                  value={(triggerConfig.listId as string) || ''}
                  onChange={(e) => {
                    const listId = e.target.value;
                    const listName = lists.find((l) => l.id === listId)?.name || '';
                    setTriggerConfig({ listId, listName });
                  }}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Choose a list...</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.contact_count} contacts)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(triggerType === 'email_opened' || triggerType === 'email_clicked') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Filter by Campaign <span className="text-gray-400 font-normal">(optional — leave empty to trigger on any campaign)</span>
                </label>
                <select
                  value={(triggerConfig.campaignId as string) || ''}
                  onChange={(e) => {
                    const campaignId = e.target.value;
                    const campaignName = campaigns.find((c) => c.id === campaignId)?.name || '';
                    setTriggerConfig(campaignId ? { campaignId, campaignName } : {});
                  }}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Any campaign</option>
                  {campaigns.filter(c => c.status === 'completed' || c.status === 'sending').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  {triggerType === 'email_opened'
                    ? 'When a contact opens an email from the selected campaign, they will be enrolled in this automation.'
                    : 'When a contact clicks a link in the selected campaign, they will be enrolled in this automation.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Steps */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Steps</h2>
          <p className="mt-1 text-sm text-gray-500">
            Build your drip sequence. Each step sends an email after a specified delay.
          </p>

          <div className="mt-6">
            {/* Trigger node */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div className="text-sm font-medium text-gray-700">
                Trigger: {triggerType === 'manual' && 'Manual enrollment'}
                {triggerType === 'contact_added' && 'When contact is added'}
                {triggerType === 'list_join' && `When contact joins "${selectedListName || '...'}" list`}
                {triggerType === 'email_opened' && 'When email is opened'}
                {triggerType === 'link_clicked' && 'When link is clicked'}
              </div>
            </div>

            {/* Steps */}
            {steps.map((step, idx) => (
              <div key={idx} className="relative ml-4">
                {/* Connector line */}
                <div className="absolute left-0 top-0 h-full w-px bg-gray-200" style={{ marginLeft: '11px' }} />

                {/* Delay label */}
                <div className="relative flex items-center gap-2 py-3 pl-8">
                  <div className="absolute left-2.5 h-2 w-2 rounded-full border-2 border-gray-300 bg-white" />
                  <span className="text-xs font-medium text-gray-400">
                    {step.delayDays === 0 && step.delayHours === 0 && step.delayMinutes === 0
                      ? 'Immediately'
                      : `Wait ${formatDelay(step.delayDays, step.delayHours, step.delayMinutes)}`}
                  </span>
                </div>

                {/* Step card */}
                <div className="relative ml-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="absolute -left-5 top-6 h-px w-5 bg-gray-200" />
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Step {idx + 1}</h4>
                    {steps.length > 1 && (
                      <button
                        onClick={() => removeStep(idx)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Template</label>
                      <select
                        value={step.templateId}
                        onChange={(e) => {
                          const tmpl = templates.find((t) => t.id === e.target.value);
                          updateStep(idx, {
                            templateId: e.target.value,
                            templateName: tmpl?.name || '',
                          });
                        }}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">Choose a template...</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Subject Override (optional)</label>
                      <input
                        type="text"
                        value={step.subjectOverride}
                        onChange={(e) => updateStep(idx, { subjectOverride: e.target.value })}
                        placeholder="Leave blank to use template subject"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        {idx === 0 ? 'Delay after trigger' : 'Delay before sending'}
                        {idx === 0 && <span className="text-gray-400 font-normal"> (0 = send immediately)</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={step.delayDays}
                            onChange={(e) => updateStep(idx, { delayDays: parseInt(e.target.value) || 0 })}
                            className="w-16 rounded-lg border px-2 py-1.5 text-sm"
                          />
                          <span className="text-xs text-gray-500">days</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={23}
                            value={step.delayHours}
                            onChange={(e) => updateStep(idx, { delayHours: parseInt(e.target.value) || 0 })}
                            className="w-16 rounded-lg border px-2 py-1.5 text-sm"
                          />
                          <span className="text-xs text-gray-500">hours</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={59}
                            value={step.delayMinutes}
                            onChange={(e) => updateStep(idx, { delayMinutes: parseInt(e.target.value) || 0 })}
                            className="w-16 rounded-lg border px-2 py-1.5 text-sm"
                          />
                          <span className="text-xs text-gray-500">min</span>
                        </div>
                      </div>
                    </div>
                </div>
              </div>
            ))}

            {/* Add step button */}
            <div className="relative ml-4">
              <div className="absolute left-0 top-0 h-6 w-px bg-gray-200" style={{ marginLeft: '11px' }} />
              <div className="pt-6 pl-8">
                <button
                  onClick={addStep}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Step
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AutomationBuilder() {
  return (
    <ErrorBoundary>
      <AutomationBuilderContent />
    </ErrorBoundary>
  );
}
