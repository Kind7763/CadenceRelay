import apiClient from '../api/client';
import { AxiosRequestConfig, AxiosProgressEvent } from 'axios';

export interface UploadState {
  progress: number; // 0-100
  loaded: number;   // bytes
  total: number;    // bytes
  speed: number;    // bytes/sec
  eta: number;      // seconds remaining
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

export const INITIAL_UPLOAD_STATE: UploadState = {
  progress: 0,
  loaded: 0,
  total: 0,
  speed: 0,
  eta: 0,
  status: 'idle',
};

export interface UploadOptions {
  url: string;
  formData: FormData;
  onProgress?: (state: UploadState) => void;
  signal?: AbortSignal;
  retries?: number;
}

export interface UploadResult<T = unknown> {
  data: T;
  abort: () => void;
}

/**
 * Format bytes into human-readable string (e.g., "2.3 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format seconds into human-readable ETA (e.g., "~12s remaining")
 */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `~${mins}m ${secs}s remaining`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `~${hrs}h ${remainMins}m remaining`;
}

/**
 * Get a file type icon name based on extension
 */
export function getFileTypeIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mapping: Record<string, string> = {
    pdf: 'pdf',
    doc: 'word', docx: 'word',
    xls: 'excel', xlsx: 'excel', csv: 'excel',
    ppt: 'powerpoint', pptx: 'powerpoint',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
    mp4: 'video', avi: 'video', mov: 'video', mkv: 'video',
    mp3: 'audio', wav: 'audio', flac: 'audio',
    txt: 'text', md: 'text', rtf: 'text',
  };
  return mapping[ext] || 'file';
}

/**
 * Create a tracked upload with progress, speed, ETA, and cancellation support.
 * Wraps axios with onUploadProgress that calculates speed and ETA.
 * Includes 1 retry on network error by default.
 */
export function createTrackedUpload<T = unknown>(options: UploadOptions): {
  promise: Promise<T>;
  abort: () => void;
} {
  const { url, formData, onProgress, signal, retries = 1 } = options;
  const controller = new AbortController();

  // Link external signal to our controller
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let lastLoaded = 0;
  let lastTime = Date.now();
  let smoothSpeed = 0;

  const progressCallback = (event: AxiosProgressEvent) => {
    if (!onProgress) return;

    const now = Date.now();
    const timeDelta = (now - lastTime) / 1000; // seconds
    const loadedDelta = event.loaded - lastLoaded;

    // Calculate instantaneous speed and smooth it
    if (timeDelta > 0.1) {
      const instantSpeed = loadedDelta / timeDelta;
      // Exponential moving average for smooth speed display
      smoothSpeed = smoothSpeed === 0 ? instantSpeed : smoothSpeed * 0.7 + instantSpeed * 0.3;
      lastLoaded = event.loaded;
      lastTime = now;
    }

    const total = event.total || 0;
    const progress = total > 0 ? Math.round((event.loaded * 100) / total) : 0;
    const remaining = total - event.loaded;
    const eta = smoothSpeed > 0 ? remaining / smoothSpeed : 0;

    onProgress({
      progress,
      loaded: event.loaded,
      total,
      speed: smoothSpeed,
      eta,
      status: 'uploading',
    });
  };

  const makeRequest = async (attempt: number): Promise<T> => {
    try {
      const config: AxiosRequestConfig = {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: progressCallback,
        signal: controller.signal,
      };

      const res = await apiClient.post(url, formData, config);
      return res.data as T;
    } catch (err: unknown) {
      // Check if it was cancelled
      if (controller.signal.aborted) {
        onProgress?.({ ...INITIAL_UPLOAD_STATE, status: 'cancelled' });
        throw err;
      }

      // Retry on network error (not on 4xx/5xx)
      const isNetworkError =
        err instanceof Error &&
        'code' in err &&
        ((err as { code?: string }).code === 'ERR_NETWORK' ||
          (err as { code?: string }).code === 'ECONNABORTED');

      if (isNetworkError && attempt < retries) {
        // Reset progress tracking for retry
        lastLoaded = 0;
        lastTime = Date.now();
        smoothSpeed = 0;
        return makeRequest(attempt + 1);
      }

      const message =
        err instanceof Error ? err.message : 'Upload failed';
      onProgress?.({
        ...INITIAL_UPLOAD_STATE,
        status: 'error',
        error: message,
      });
      throw err;
    }
  };

  const promise = makeRequest(0);

  return {
    promise,
    abort: () => controller.abort(),
  };
}

/** Max file size constant: 25MB */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Validate file size and return error message or null */
export function validateFileSize(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} exceeds the 25MB limit (${formatFileSize(file.size)})`;
  }
  return null;
}
