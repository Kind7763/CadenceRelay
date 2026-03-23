import { UploadState, formatFileSize, formatEta, getFileTypeIcon } from '../../lib/uploadHelper';

/** Icon component for different file types */
function FileTypeIcon({ type }: { type: string }) {
  const iconColors: Record<string, string> = {
    pdf: 'text-red-500',
    word: 'text-blue-600',
    excel: 'text-green-600',
    powerpoint: 'text-orange-500',
    image: 'text-purple-500',
    archive: 'text-yellow-600',
    video: 'text-pink-500',
    audio: 'text-indigo-500',
    text: 'text-gray-500',
    file: 'text-gray-400',
  };

  const color = iconColors[type] || 'text-gray-400';

  if (type === 'pdf') {
    return (
      <svg className={`h-5 w-5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (type === 'image') {
    return (
      <svg className={`h-5 w-5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (type === 'excel') {
    return (
      <svg className={`h-5 w-5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }
  // Default file icon
  return (
    <svg className={`h-5 w-5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export interface FileUploadProgress {
  file: File;
  state: UploadState;
  id: string; // unique key
}

interface UploadProgressProps {
  /** List of files with their upload states */
  files: FileUploadProgress[];
  /** Called when user clicks cancel on a specific file */
  onCancel?: (id: string) => void;
  /** Called when user clicks remove on a completed/errored file */
  onRemove?: (id: string) => void;
  /** Show total progress across all files */
  showTotal?: boolean;
}

function getBarColorClass(status: UploadState['status']): string {
  switch (status) {
    case 'uploading':
    case 'processing':
      return 'bg-blue-500';
    case 'complete':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-300';
  }
}

function getStatusLabel(status: UploadState['status'], error?: string): string {
  switch (status) {
    case 'idle':
      return 'Waiting...';
    case 'uploading':
      return 'Uploading...';
    case 'processing':
      return 'Processing...';
    case 'complete':
      return 'Complete';
    case 'error':
      return error || 'Upload failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return '';
  }
}

function getStatusBadgeClass(status: UploadState['status']): string {
  switch (status) {
    case 'uploading':
      return 'bg-blue-100 text-blue-700';
    case 'processing':
      return 'bg-yellow-100 text-yellow-700';
    case 'complete':
      return 'bg-green-100 text-green-700';
    case 'error':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-gray-100 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

/** Single file progress row */
function FileProgressRow({
  item,
  onCancel,
  onRemove,
}: {
  item: FileUploadProgress;
  onCancel?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const { file, state, id } = item;
  const iconType = getFileTypeIcon(file.name);
  const isActive = state.status === 'uploading' || state.status === 'processing';
  const isDone = state.status === 'complete' || state.status === 'error' || state.status === 'cancelled';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-3">
        {/* File icon */}
        <div className="flex-shrink-0">
          <FileTypeIcon type={iconType} />
        </div>

        {/* File info + progress */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(state.status)}`}>
                {getStatusLabel(state.status, state.error)}
              </span>
              {isActive && onCancel && (
                <button
                  onClick={() => onCancel(id)}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  title="Cancel upload"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {isDone && onRemove && (
                <button
                  onClick={() => onRemove(id)}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Dismiss"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Size and speed info */}
          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
            <span>{formatFileSize(file.size)}</span>
            {state.status === 'uploading' && state.speed > 0 && (
              <>
                <span>{formatFileSize(state.speed)}/s</span>
                <span>{formatEta(state.eta)}</span>
              </>
            )}
            {state.status === 'uploading' && (
              <span>
                {formatFileSize(state.loaded)} / {formatFileSize(state.total)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {(state.status === 'uploading' || state.status === 'processing' || state.status === 'complete' || state.status === 'error') && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColorClass(state.status)}`}
                style={{
                  width: `${state.status === 'processing' ? 100 : state.status === 'complete' ? 100 : state.progress}%`,
                }}
              />
            </div>
          )}
          {state.status === 'uploading' && (
            <div className="mt-1 text-right text-xs font-medium text-blue-600">
              {state.progress}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Total progress bar across all files */
function TotalProgress({ files }: { files: FileUploadProgress[] }) {
  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const loadedBytes = files.reduce((sum, f) => {
    if (f.state.status === 'complete') return sum + f.file.size;
    if (f.state.status === 'uploading') return sum + f.state.loaded;
    return sum;
  }, 0);
  const totalProgress = totalBytes > 0 ? Math.round((loadedBytes * 100) / totalBytes) : 0;

  const completedCount = files.filter((f) => f.state.status === 'complete').length;
  const allDone = completedCount === files.length;
  const hasError = files.some((f) => f.state.status === 'error');

  const barColor = hasError ? 'bg-red-500' : allDone ? 'bg-green-500' : 'bg-blue-500';

  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">
          Total: {completedCount}/{files.length} files
        </span>
        <span className="text-gray-500">
          {formatFileSize(loadedBytes)} / {formatFileSize(totalBytes)} ({totalProgress}%)
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${totalProgress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Reusable upload progress component.
 * Shows per-file progress bars with speed, ETA, cancel/remove buttons.
 * Optionally shows total progress across all files.
 */
export default function UploadProgress({ files, onCancel, onRemove, showTotal = false }: UploadProgressProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {showTotal && files.length > 1 && <TotalProgress files={files} />}
      {files.map((item) => (
        <FileProgressRow
          key={item.id}
          item={item}
          onCancel={onCancel}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
