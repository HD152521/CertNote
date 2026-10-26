import type { ReadinessState } from '@/lib/analytics/readiness';

// 준비도 상태별 색. 구분이 색에만 기대지 않도록 화면에는 상태 이름도 함께 쓴다.
export const READINESS_TONE: Record<ReadinessState, { text: string; chip: string; bar: string }> = {
  pending: { text: 'text-fg-muted', chip: 'bg-bg-subtle text-fg-muted', bar: 'bg-border-strong' },
  on_track: { text: 'text-accent', chip: 'bg-accent/10 text-accent', bar: 'bg-accent' },
  behind: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500',
  },
  at_risk: {
    text: 'text-orange-700 dark:text-orange-400',
    chip: 'border border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
    bar: 'bg-orange-500',
  },
};
