import changelogData from '../../../content/changelog.json';

// 수정 기록(docs/P4-trust-quality-plan.md Step 5b). 제보·검수로 고친 오류를 공개하는 /changelog 의 데이터.
// 데이터: content/changelog.json — 배열. 항목 하나가 고친 것 하나다. JSON 을 정적 import 해 번들에 싣는다.

export const CHANGELOG_KINDS = ['fact', 'exam', 'quiz', 'copy'] as const;
export type ChangelogKind = (typeof CHANGELOG_KINDS)[number];

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  cert?: string; // 자격증 slug(선택). 여러 자격증에 걸치거나 사이트 문구면 생략.
  kind: ChangelogKind;
  summary: string;
}

export interface ChangelogDay {
  date: string;
  entries: ChangelogEntry[];
}

export const CHANGELOG_KIND_LABELS: Record<ChangelogKind, string> = {
  fact: '사실 정정',
  exam: '시험 정보',
  quiz: '문항 수정',
  copy: '표현 수정',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isKind(v: unknown): v is ChangelogKind {
  return typeof v === 'string' && (CHANGELOG_KINDS as readonly string[]).includes(v);
}

function isChangelogEntry(v: unknown): v is ChangelogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  if (typeof e.date !== 'string' || !DATE_RE.test(e.date) || Number.isNaN(Date.parse(e.date))) return false;
  if (typeof e.summary !== 'string' || e.summary.trim() === '') return false;
  if (!isKind(e.kind)) return false;
  if (e.cert !== undefined && (typeof e.cert !== 'string' || e.cert === '')) return false;
  return true;
}

// 형식이 틀린 항목은 버리고, 날짜 역순(최신이 위)으로 정렬한다. 같은 날짜 안에서는 파일 순서를 지킨다.
export function parseChangelog(raw: unknown): ChangelogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isChangelogEntry)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date === b.e.date ? a.i - b.i : a.e.date < b.e.date ? 1 : -1))
    .map(({ e }) => e);
}

// 날짜별로 묶는다(입력 순서 유지 — parseChangelog 결과를 넣으면 최신 날짜가 먼저).
export function groupChangelogByDate(entries: readonly ChangelogEntry[]): ChangelogDay[] {
  const days: ChangelogDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) {
      days[days.length - 1] = { date: last.date, entries: [...last.entries, entry] };
    } else {
      days.push({ date: entry.date, entries: [entry] });
    }
  }
  return days;
}

export function getChangelog(): ChangelogEntry[] {
  return parseChangelog(changelogData as unknown);
}
