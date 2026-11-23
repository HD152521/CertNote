// 짧은 상태 알림(토스트) 스토어. 외부 의존성 없이 useSyncExternalStore 로 구독한다.
// 정답·오답 해설, 폼 필드 옆 오류, 결제 모달처럼 맥락이 화면 안에 있는 알림은 여기로 보내지 않는다.
export type ToastTone = 'info' | 'error';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
  action?: ToastAction;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: ToastAction;
}

export const DEFAULT_TOAST_MS = 4000;
export const MAX_TOASTS = 3;

interface TimerState {
  handle: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  startedAt: number;
}

const EMPTY: readonly ToastItem[] = Object.freeze([]);
let toasts: readonly ToastItem[] = EMPTY;
let nextId = 1;
const timers = new Map<number, TimerState>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function clearTimer(id: number): void {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
}

function startTimer(id: number, remainingMs: number): void {
  const previous = timers.get(id);
  if (previous?.handle) clearTimeout(previous.handle);
  const handle = setTimeout(() => dismissToast(id), remainingMs);
  timers.set(id, { handle, remainingMs, startedAt: Date.now() });
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastSnapshot(): readonly ToastItem[] {
  return toasts;
}

export function getServerToastSnapshot(): readonly ToastItem[] {
  return EMPTY;
}

/** 알림을 띄우고 id 를 돌려준다. 같은 문구·종류가 이미 떠 있으면 새로 만들지 않고 시간만 다시 채운다. */
export function showToast(input: ToastInput): number {
  const tone = input.tone ?? 'info';
  const durationMs = input.durationMs ?? DEFAULT_TOAST_MS;
  const existing = toasts.find((x) => x.message === input.message && x.tone === tone);
  if (existing) {
    const refreshed: ToastItem = { ...existing, durationMs, action: input.action ?? existing.action };
    toasts = toasts.map((x) => (x.id === existing.id ? refreshed : x));
    startTimer(existing.id, durationMs);
    emit();
    return existing.id;
  }
  const item: ToastItem = { id: nextId++, message: input.message, tone, durationMs, action: input.action };
  const merged = [...toasts, item];
  const overflow = merged.slice(0, Math.max(0, merged.length - MAX_TOASTS));
  for (const old of overflow) clearTimer(old.id);
  toasts = merged.slice(overflow.length);
  startTimer(item.id, durationMs);
  emit();
  return item.id;
}

export function dismissToast(id: number): void {
  if (!toasts.some((x) => x.id === id)) return;
  clearTimer(id);
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

/** hover·focus 중에는 사라지지 않게 남은 시간을 멈춘다. */
export function pauseToast(id: number): void {
  const timer = timers.get(id);
  if (!timer?.handle) return;
  clearTimeout(timer.handle);
  const remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  timers.set(id, { handle: null, remainingMs, startedAt: 0 });
}

export function resumeToast(id: number): void {
  const timer = timers.get(id);
  if (!timer || timer.handle) return;
  startTimer(id, timer.remainingMs);
}

export function pauseAllToasts(): void {
  for (const id of timers.keys()) pauseToast(id);
}

export function resumeAllToasts(): void {
  for (const id of timers.keys()) resumeToast(id);
}

/** 시험 전용: 모든 상태와 타이머를 비운다. */
export function resetToasts(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  toasts = EMPTY;
  nextId = 1;
  emit();
}
