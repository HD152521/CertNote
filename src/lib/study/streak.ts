// 스트릭 계산(순수). 활동일 집합만 받아 현재/최장 연속일과 프리즈 사용 여부를 계산한다.
// 모든 날짜는 'YYYY-MM-DD'(KST). IO(activity.ts)와 분리해 단위테스트 가능.

const DAY_MS = 24 * 60 * 60 * 1000;

export function prevDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function nextDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export interface StreakFreeze {
  tokensAvailable: boolean; // 소비 가능한 프리즈 토큰 보유 여부
  frozenDate: string | null; // 이미 프리즈로 메운 날짜(중복 소비 방지·유지)
}

export interface StreakResult {
  current: number; // 현재 연속 학습일(프리즈 반영)
  longest: number; // 역대 최장 연속 학습일(원본, 프리즈 미반영)
  activeToday: boolean;
  freezeUsedOn: string | null; // 이번 계산에서 '새' 토큰으로 메운 날짜(IO가 차감). 없으면 null
}

// 활동일 집합에서 가장 긴 연속 구간(원본).
export function longestRunOf(set: Set<string>): number {
  let best = 0;
  for (const d of set) {
    if (set.has(prevDate(d))) continue; // 구간 시작점만.
    let len = 1;
    let c = nextDate(d);
    while (set.has(c)) {
      len += 1;
      c = nextDate(c);
    }
    if (len > best) best = len;
  }
  return best;
}

// 현재 스트릭: 오늘(미활동이면 어제)부터 거꾸로 세되, 프리즈로 '한 번' 공백을 메울 수 있다.
export function computeStreak(dates: Iterable<string>, today: string, freeze: StreakFreeze): StreakResult {
  const set = dates instanceof Set ? (dates as Set<string>) : new Set(dates);
  const activeToday = set.has(today);
  const longest = longestRunOf(set);

  let cursor = activeToday ? today : prevDate(today);
  let current = 0;
  let bridged = false;
  let freezeUsedOn: string | null = null;

  for (;;) {
    if (set.has(cursor)) {
      current += 1;
      cursor = prevDate(cursor);
      continue;
    }
    // 공백일 — 프리즈로 한 번만 메운다.
    if (!bridged) {
      const alreadyFrozen = freeze.frozenDate === cursor;
      if (alreadyFrozen || freeze.tokensAvailable) {
        bridged = true;
        if (!alreadyFrozen) freezeUsedOn = cursor; // 새 토큰 소비.
        cursor = prevDate(cursor); // 메운 날은 세지 않고 건너뛴다.
        continue;
      }
    }
    break;
  }

  return { current, longest, activeToday, freezeUsedOn };
}
