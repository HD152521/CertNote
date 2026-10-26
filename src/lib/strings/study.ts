import type { Dict } from './dict';

/**
 * Shared formatting helpers (fmt, fmtRich) and the dashboard trend chart strings.
 *
 * Counts and dates are interpolated with `{name}` placeholders rather than being
 * concatenated from translated fragments — Korean puts the unit after the number
 * and English usually puts it before, so a template per language is the only way
 * both read naturally.
 */

/** Replace `{name}` placeholders. Unknown placeholders are left untouched. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
  );
}

/** One run of a rich template: `bold` marks text that was wrapped in `*…*`. */
export interface RichPart {
  text: string;
  bold: boolean;
}

/**
 * Format a template whose emphasised runs are marked with `*asterisks*`.
 *
 * 문장 중간의 <b> 위치가 언어마다 다르다. 조각을 이어붙이면 어순이 깨지므로
 * 강조 구간을 번역문 안에 표시해 두고 렌더 시점에 잘라 쓴다.
 */
export function fmtRich(template: string, values: Record<string, string | number>): RichPart[] {
  return fmt(template, values)
    .split('*')
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}

type TrendKey =
  | 'title'
  | 'emptyHint'
  | 'lastNDays'
  | 'avgAccuracy'
  | 'solved'
  | 'activeDays'
  | 'chartAria'
  | 'legendAccuracy'
  | 'legendActivity';

export const trendChartStrings: Dict<TrendKey> = {
  ko: {
    title: '학습 추이',
    emptyHint: '며칠 풀이가 쌓이면 정답률·활동량 추이가 여기에 그려집니다.',
    lastNDays: '최근 {n}일',
    avgAccuracy: '평균 정답률',
    solved: '푼 문제',
    activeDays: '학습한 날',
    chartAria: '정답률·활동량 추이',
    legendAccuracy: '정답률',
    legendActivity: '활동량',
  },
  en: {
    title: 'Trend',
    emptyHint: 'Practice over a few days to see your accuracy and activity trend.',
    lastNDays: 'Last {n} days',
    avgAccuracy: 'Avg accuracy',
    solved: 'Solved',
    activeDays: 'Active days',
    chartAria: 'Accuracy and activity trend',
    legendAccuracy: 'Accuracy',
    legendActivity: 'Activity',
  },
};
