// 가입 권유 카드를 닫은 기록. 한 번 닫으면 모든 자리의 카드를 일정 기간 숨긴다(같은 사람에게 반복해서 묻지 않는다).
// localStorage 는 막혀 있을 수 있으므로(시크릿 모드 등) 읽기·쓰기 모두 try/catch — 실패하면 "닫지 않음"으로 본다.
export const DISMISS_KEY = 'certnote:signup-prompt-dismissed-at';
export const SNOOZE_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isDismissed(now: number = Date.now(), storage: StorageLike | null = defaultStorage()): boolean {
  try {
    const raw = storage?.getItem(DISMISS_KEY);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) && now - at < SNOOZE_DAYS * DAY_MS && now >= at;
  } catch {
    return false;
  }
}

export function recordDismissal(now: number = Date.now(), storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(DISMISS_KEY, String(now));
  } catch {
    // 저장 불가 — 이번 방문에서만 닫힌 채로 둔다.
  }
}

// 같은 탭의 여러 카드가 닫힘을 바로 알도록 하는 구독(localStorage 'storage' 이벤트는 다른 탭에만 온다).
const listeners = new Set<() => void>();

export function subscribeDismissal(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyDismissal(): void {
  for (const cb of listeners) cb();
}
