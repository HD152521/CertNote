// 노트 안에서 "어디까지 읽었는지"를 브라우저에 저장한다(로그인 불필요).
// progress.ts 의 lastVisited 가 "어느 Day 를 봤는지"라면, 이건 그 Day 안의 위치다.
//
// 위치는 픽셀이 아니라 "화면 맨 위를 지난 마지막 소제목(id)"으로 저장한다. 폰트 로딩·광고·
// 화면 폭에 따라 픽셀 위치는 달라지지만 소제목 id(rehype-slug)는 같은 문서에서 변하지 않는다.
// 진행률(ratio)은 "거의 처음"·"다 읽음"을 걸러 이어 보기를 권할지 정하는 데만 쓴다.
// within 은 그 소제목 구간(다음 소제목 또는 문서 끝까지) 안에서 내려간 비율이다. 소제목 사이가 길어도
// 읽던 문단 근처로 돌아가게 한다. 픽셀이 아니라 비율이라 화면 폭·글꼴이 달라져도 크게 어긋나지 않는다.

export interface ReadingPosition {
  headingId: string;
  headingText: string;
  ratio: number; // 0~1, 문서 전체에서 스크롤한 비율
  within?: number; // 0~1, 소제목 구간 안에서 내려간 비율(예전 기록에는 없다)
  at: number; // 저장 시각(ms)
}

type Store = Record<string, ReadingPosition>;

const KEY = 'cert-notes:reading-position';
// "이어 보기" 링크를 눌렀다는 표시(href). 같은 #소제목이라도 목차로 온 경우엔 구간 안 위치를 적용하지 않는다.
const INTENT_KEY = 'cert-notes:resume-intent';
// pickCurrentHeading 의 화면 위 여백과 같은 값 — 저장과 복원이 같은 기준을 써야 같은 자리로 돌아온다.
export const HEADING_OFFSET = 96;
// 오래된 항목부터 지운다. 노트 하나당 50바이트 남짓이라 저장 공간 부담은 없지만 끝없이 쌓이지 않게 한다.
export const MAX_ENTRIES = 30;
// 이 범위 밖이면 이어 보기를 권하지 않는다(막 읽기 시작했거나 끝까지 읽은 경우).
export const RESUME_MIN_RATIO = 0.1;
export const RESUME_MAX_RATIO = 0.95;

export function shouldOfferResume(pos: ReadingPosition | undefined): pos is ReadingPosition {
  return !!pos && pos.headingId.length > 0 && pos.ratio >= RESUME_MIN_RATIO && pos.ratio <= RESUME_MAX_RATIO;
}

// 저장소에 한 항목을 넣고, 넘치면 오래된 것부터 버린 새 객체를 돌려준다(입력은 바꾸지 않는다).
export function putPosition(store: Store, href: string, pos: ReadingPosition, max = MAX_ENTRIES): Store {
  const entries = Object.entries({ ...store, [href]: pos }).sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, max));
}

// 소제목들의 문서 기준 top(px)과 현재 스크롤 위치로 "지금 읽는 소제목"을 고른다.
// 화면 위쪽 여백(offset) 안으로 들어온 마지막 소제목이다. 아직 첫 소제목 전이면 null.
export function pickCurrentHeading<T extends { top: number }>(headings: readonly T[], scrollY: number, offset = HEADING_OFFSET): T | null {
  let current: T | null = null;
  for (const h of headings) {
    if (h.top - offset <= scrollY) current = h;
    else break;
  }
  return current;
}

// index 번째 소제목 구간 안에서 화면 위 기준선이 내려간 비율(0~1). 마지막 소제목은 문서 끝(docEnd)까지가 구간이다.
export function sectionWithin<T extends { top: number }>(headings: readonly T[], index: number, scrollY: number, docEnd: number, offset = HEADING_OFFSET): number {
  const start = headings[index]?.top ?? 0;
  const end = headings[index + 1]?.top ?? docEnd;
  const span = end - start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (scrollY + offset - start) / span));
}

// 저장한 비율로 돌아갈 스크롤 위치. sectionWithin 의 역함수.
export function resumeScrollY(headingTop: number, sectionEnd: number, within: number, offset = HEADING_OFFSET): number {
  return Math.max(0, Math.round(headingTop + (sectionEnd - headingTop) * within - offset));
}

// 이어 보기 링크를 누를 때 표시하고, 노트 페이지가 한 번 꺼내 쓴다(탭 안에서만 유효).
export function markResumeIntent(href: string): void {
  try {
    window.sessionStorage.setItem(INTENT_KEY, href);
  } catch {
    // 저장이 막혀 있으면 소제목까지만 이동한다.
  }
}

export function takeResumeIntent(href: string): boolean {
  try {
    const hit = window.sessionStorage.getItem(INTENT_KEY) === href;
    if (hit) window.sessionStorage.removeItem(INTENT_KEY);
    return hit;
  } catch {
    return false;
  }
}

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function readPosition(href: string): ReadingPosition | undefined {
  if (typeof window === 'undefined') return undefined;
  return readStore()[href];
}

export function savePosition(href: string, pos: ReadingPosition): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(putPosition(readStore(), href, pos)));
  } catch {
    // 저장 공간이 막혀 있으면(사생활 보호 모드 등) 조용히 포기한다 — 읽기 자체에는 영향이 없다.
  }
}

// 이어 보기 링크용: 저장된 위치가 의미 있으면 소제목 앵커를 붙인다.
export function resumeHref(href: string, pos: ReadingPosition | undefined): string {
  return shouldOfferResume(pos) ? `${href}#${encodeURIComponent(pos.headingId)}` : href;
}
