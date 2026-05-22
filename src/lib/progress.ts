'use client';

export interface ProgressEntry {
  week: number;
  day: number;
  title: string;
  href: string;
  at: number;
}

export interface ProgressState {
  [certSlug: string]: { lastVisited?: ProgressEntry };
}

const KEY = 'cert-notes:progress';
const EVT = 'cert-notes:progress-change';

export function readProgress(): ProgressState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProgressState) : {};
  } catch {
    return {};
  }
}

export function writeProgress(p: ProgressState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function markVisited(slug: string, entry: ProgressEntry) {
  const p = readProgress();
  p[slug] = { ...p[slug], lastVisited: entry };
  writeProgress(p);
}

export function onProgressChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener('storage', handler);
  };
}
