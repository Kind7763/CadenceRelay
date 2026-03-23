import { useState, useEffect, FormEvent } from 'react';
import toast from 'react-hot-toast';
import {
  getSettings,
  updateProvider,
  updateGmailConfig,
  updateSesConfig,
  updateThrottleDefaults,
  sendTestEmail,
} from '../api/settings.api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<'gmail' | 'ses'>('ses');
  const [gmail, setGmail] = useState({ host: 'smtp.gmail.com', port: 587, user: '', pass: '' });
  const [ses, setSes] = useState({ region: 'ap-south-1', accessKeyId: '', secretAccessKey: '', fromEmail: '' });
  const [throttle, setThrottle] = useState({ perSecond: 5, perHour: 5000 });
  const [testTo, setTestTo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const settings = await getSettings();
      if (settings.email_provider) setProvider(settings.email_provider);
      if (settings.gmail_config) setGmail(settings.gmail_config);
      if (settings.ses_config) setSes(settings.ses_config);
      if (settings.throttle_defaults) setThrottle(settings.throttle_defaults);
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderSwitch(p: 'gmail' | 'ses') {
    setProvider(p);
    try {
      await updateProvider(p);
      toast.success(`Switched to ${p.toUpperCase()}`);
    } catch {
      toast.error('Failed to switch provider');
    }
  }

  async function handleSaveGmail(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateGmailConfig(gmail);
      toast.success('Gmail config saved');
    } catch {
      toast.error('Failed to save Gmail config');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSes(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSesConfig(ses);
      toast.success('SES config saved');
    } catch {
      toast.error('Failed to save SES config');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveThrottle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateThrottleDefaults(throttle);
      toast.success('Throttle defaults saved');
    } catch {
      toast.error('Failed to save throttle config');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail(e: FormEvent) {
    e.preventDefault();
    try {
      await sendTestEmail(testTo);
      toast.success(`Test email sent to ${testTo}`);
    } catch {
      toast.error('Failed to send test email');
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Provider Toggle */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Email Provider</h2>
        <p className="mt-1 text-sm text-gray-500">Choose which provider to use for sending emails</p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => handleProviderSwitch('gmail')}
            className={`rounded-lg px-6 py-2 text-sm font-medium transition-colors ${
              provider === 'gmail'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Gmail SMTP
          </button>
          <button
            onClick={() => handleProviderSwitch('ses')}
            className={`rounded-lg px-6 py-2 text-sm font-medium transition-colors ${
              provider === 'ses'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            AWS SES
          </button>
        </div>
      </div>

      {/* Gmail Config */}
      {provider === 'gmail' && (
        <form onSubmit={handleSaveGmail} className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Gmail SMTP Configuration</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">SMTP Host</label>
              <input
                type="text"
                value={gmail.host}
                onChange={(e) => setGmail({ ...gmail, host: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Port</label>
              <input
                type="number"
                value={gmail.port}
                onChange={(e) => setGmail({ ...gmail, port: parseInt(e.target.value) })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Gmail Address</label>
              <input
                type="email"
                value={gmail.user}
                onChange={(e) => setGmail({ ...gmail, user: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">App Password</label>
              <input
                type="password"
                value={gmail.pass}
                onChange={(e) => setGmail({ ...gmail, pass: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Gmail Config'}
          </button>
        </form>
      )}

      {/* SES Config */}
      {provider === 'ses' && (
        <form onSubmit={handleSaveSes} className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">AWS SES Configuration</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">AWS Region</label>
              <input
                type="text"
                value={ses.region}
                onChange={(e) => setSes({ ...ses, region: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">From Email</label>
              <input
                type="email"
                value={ses.fromEmail}
                onChange={(e) => setSes({ ...ses, fromEmail: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Access Key ID</label>
              <input
                type="text"
                value={ses.accessKeyId}
                onChange={(e) => setSes({ ...ses, accessKeyId: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Secret Access Key</label>
              <input
                type="password"
                value={ses.secretAccessKey}
                onChange={(e) => setSes({ ...ses, secretAccessKey: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save SES Config'}
          </button>
        </form>
      )}

      {/* Throttle Defaults */}
      <form onSubmit={handleSaveThrottle} className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Throttle Defaults</h2>
        <p className="mt-1 text-sm text-gray-500">Default rate limits for new campaigns</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Emails per Second</label>
            <input
              type="number"
              value={throttle.perSecond}
              onChange={(e) => setThrottle({ ...throttle, perSecond: parseInt(e.target.value) })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Emails per Hour</label>
            <input
              type="number"
              value={throttle.perHour}
              onChange={(e) => setThrottle({ ...throttle, perHour: parseInt(e.target.value) })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Throttle Defaults'}
        </button>
      </form>

      {/* Test Email */}
      <form onSubmit={handleTestEmail} className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Send Test Email</h2>
        <p className="mt-1 text-sm text-gray-500">Verify your email provider is configured correctly</p>
        <div className="mt-4 flex gap-3">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="recipient@example.com"
            required
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
            Send Test
          </button>
        </div>
      </form>
    </div>
  );
}
