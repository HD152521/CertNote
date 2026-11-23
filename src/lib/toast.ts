// 짧은 상태 알림(토스트) 스토어. 외부 의존성 없이 useSyncExternalStore 로 구독한다.
// 정답·오답 해설, 폼 필드 옆 오류, 결제 모달처럼 맥락이 화면 안에 있는 알림은 여기로 보내지 않는다.
import type { ComponentType } from 'react';

export type ToastTone = 'info' | 'error';
type IconComponent = ComponentType<{ className?: string }>;

export interface ToastAction {
  label: string;
  onAction: () => void;
  icon?: IconComponent;
}

export interface ToastItem {
  id: number;
  message: string;
  /** 있으면 message 뒤에 흐린 글씨로 이어 붙이고 한 줄로 말줄임한다(예: 소제목). */
  detail?: string;
  tone: ToastTone;
  /** 0 이면 자동으로 닫히지 않고 수동으로만 닫는다. */
  durationMs: number;
  action?: ToastAction;
  icon?: IconComponent;
}

export interface ToastInput {
  message: string;
  detail?: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: ToastAction;
  icon?: IconComponent;
}

export const DEFAULT_TOAST_MS = 4000;
// 오류는 읽을 시간이 더 필요하다(WCAG 2.2.1). 서버 메시지처럼 길면 호출부가 0(수동 닫기)을 준다.
export const DEFAULT_ERROR_TOAST_MS = 10_000;
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
// hover·focus 로 멈춘 토스트와, 광고 겹침으로 전체가 멈춘 상태는 서로 따로 센다.
// 둘 중 하나라도 켜져 있으면 타이머를 돌리지 않는다.
const hoverHeld = new Set<number>();
let adHeld = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function isHeld(id: number): boolean {
  return adHeld || hoverHeld.has(id);
}

function clearTimer(id: number): void {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
}

// 남은 시간만 기록해 두고, 멈춘 상태가 아니면 바로 돌린다.
function armTimer(id: number, remainingMs: number): void {
  const previous = timers.get(id);
  if (previous?.handle) clearTimeout(previous.handle);
  if (isHeld(id)) {
    timers.set(id, { handle: null, remainingMs, startedAt: 0 });
    return;
  }
  const handle = setTimeout(() => dismissToast(id), remainingMs);
  timers.set(id, { handle, remainingMs, startedAt: Date.now() });
}

function freezeTimer(id: number): void {
  const timer = timers.get(id);
  if (!timer?.handle) return;
  clearTimeout(timer.handle);
  const remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  timers.set(id, { handle: null, remainingMs, startedAt: 0 });
}

function thawTimer(id: number): void {
  const timer = timers.get(id);
  if (!timer || timer.handle || isHeld(id)) return;
  armTimer(id, timer.remainingMs);
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

/** 알림을 띄우고 id 를 돌려준다(서버에서 불리면 무시하고 0). 같은 문구·종류가 떠 있으면 시간만 다시 채운다. */
export function showToast(input: ToastInput): number {
  if (typeof window === 'undefined') return 0;
  const tone = input.tone ?? 'info';
  const durationMs = input.durationMs ?? (tone === 'error' ? DEFAULT_ERROR_TOAST_MS : DEFAULT_TOAST_MS);
  const existing = toasts.find((x) => x.message === input.message && x.detail === input.detail && x.tone === tone);
  if (existing) {
    const refreshed: ToastItem = { ...existing, durationMs, action: input.action ?? existing.action };
    toasts = toasts.map((x) => (x.id === existing.id ? refreshed : x));
    clearTimer(existing.id);
    if (durationMs > 0) armTimer(existing.id, durationMs);
    emit();
    return existing.id;
  }
  const item: ToastItem = {
    id: nextId++, message: input.message, detail: input.detail, tone, durationMs, action: input.action, icon: input.icon,
  };
  const merged = [...toasts, item];
  const overflow = merged.slice(0, Math.max(0, merged.length - MAX_TOASTS));
  for (const old of overflow) {
    clearTimer(old.id);
    hoverHeld.delete(old.id);
  }
  toasts = merged.slice(overflow.length);
  if (durationMs > 0) armTimer(item.id, durationMs);
  emit();
  return item.id;
}

export function dismissToast(id: number): void {
  if (!toasts.some((x) => x.id === id)) return;
  clearTimer(id);
  hoverHeld.delete(id);
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

/** hover·focus 중에는 사라지지 않게 남은 시간을 멈춘다. */
export function pauseToast(id: number): void {
  hoverHeld.add(id);
  freezeTimer(id);
}

export function resumeToast(id: number): void {
  hoverHeld.delete(id);
  thawTimer(id);
}

/** 광고와 겹쳐 감춘 동안 모든 토스트를 멈추고, 풀리면 hover·focus 중이 아닌 것만 이어서 돌린다. */
export function setToastsAdPaused(paused: boolean): void {
  if (adHeld === paused) return;
  adHeld = paused;
  for (const id of timers.keys()) {
    if (paused) freezeTimer(id);
    else thawTimer(id);
  }
}

/** 시험 전용: 모든 상태와 타이머를 비운다. */
export function resetToasts(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  hoverHeld.clear();
  adHeld = false;
  toasts = EMPTY;
  nextId = 1;
  emit();
}
