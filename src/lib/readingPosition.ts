// 노트 안에서 "어디까지 읽었는지"를 브라우저에 저장한다(로그인 불필요).
// progress.ts 의 lastVisited 가 "어느 Day 를 봤는지"라면, 이건 그 Day 안의 위치다.
//
// 위치는 픽셀이 아니라 "화면 맨 위를 지난 마지막 소제목(id)"으로 저장한다. 폰트 로딩·광고·
// 화면 폭에 따라 픽셀 위치는 달라지지만 소제목 id(rehype-slug)는 같은 문서에서 변하지 않는다.
// 진행률(ratio)은 "거의 처음"·"다 읽음"을 걸러 이어 보기를 권할지 정하는 데만 쓴다.

export interface ReadingPosition {
  headingId: string;
  headingText: string;
  ratio: number; // 0~1, 문서 전체에서 스크롤한 비율
  at: number; // 저장 시각(ms)
}

type Store = Record<string, ReadingPosition>;

const KEY = 'cert-notes:reading-position';
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
export function pickCurrentHeading<T extends { top: number }>(headings: readonly T[], scrollY: number, offset = 96): T | null {
  let current: T | null = null;
  for (const h of headings) {
    if (h.top - offset <= scrollY) current = h;
    else break;
  }
  return current;
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
