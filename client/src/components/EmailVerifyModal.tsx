import { useState, useEffect } from 'react';
import { verifyEmails, EmailVerificationResult } from '../api/contacts.api';

const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const checkColors: Record<string, string> = {
  pass: 'text-green-600',
  fail: 'text-red-600',
  warning: 'text-yellow-600',
  unknown: 'text-gray-400',
};

interface EmailVerifyModalProps {
  emails: string[];
  onClose: () => void;
  onRemoveHighRisk?: (cleanEmails: string[]) => void;
}

export default function EmailVerifyModal({ emails, onClose, onRemoveHighRisk }: EmailVerifyModalProps) {
  const [results, setResults] = useState<EmailVerificationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError('');
      try {
        // Verify in batches of 100
        const allResults: EmailVerificationResult[] = [];
        for (let i = 0; i < emails.length; i += 100) {
          const batch = emails.slice(i, i + 100);
          const res = await verifyEmails(batch);
          allResults.push(...res.results);
        }
        setResults(allResults);
      } catch {
        setError('Failed to verify emails');
      } finally {
        setLoading(false);
      }
    }
    if (emails.length > 0) run();
  }, [emails]);

  const passCount = results.filter((r) => r.risk === 'low').length;
  const riskCount = results.filter((r) => r.risk === 'medium').length;
  const invalidCount = results.filter((r) => r.risk === 'high' || !r.valid).length;

  function handleRemoveHighRisk() {
    const clean = results.filter((r) => r.risk !== 'high' && r.valid).map((r) => r.email);
    onRemoveHighRisk?.(clean);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">Email Verification Results</h3>
            {!loading && (
              <p className="mt-0.5 text-sm text-gray-500">
                <span className="font-medium text-green-600">{passCount} pass</span>
                {', '}
                <span className="font-medium text-yellow-600">{riskCount} at risk</span>
                {', '}
                <span className="font-medium text-red-600">{invalidCount} invalid</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
              <span className="ml-3 text-gray-500">Verifying {emails.length} emails...</span>
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Syntax</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">MX</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Suppressed</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Bounced</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Disposable</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.email} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{r.email}</td>
                    <td className="px-3 py-2 text-center">
                      <CheckIcon status={r.checks.syntax} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckIcon status={r.checks.mx} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckIcon status={r.checks.previouslyBounced === 'fail' ? 'fail' : 'pass'} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckIcon status={r.checks.previouslyBounced} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckIcon status={r.checks.disposable} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskColors[r.risk]}`}>
                        {r.risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-3">
          {!loading && invalidCount > 0 && onRemoveHighRisk && (
            <button
              onClick={handleRemoveHighRisk}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Remove High Risk ({invalidCount})
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ status }: { status: string }) {
  const color = checkColors[status] || checkColors.unknown;
  if (status === 'pass') {
    return (
      <svg className={`mx-auto h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg className={`mx-auto h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg className={`mx-auto h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return <span className="text-xs text-gray-400">--</span>;
}
