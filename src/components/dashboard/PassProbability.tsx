import type { PassPrediction, Verdict } from '@/lib/analytics/passPredictor';
import type { Language } from '@/lib/i18n-client';

interface PassProbabilityProps {
  prediction: PassPrediction;
  dday: number | null;
  examDate: string | null;
  lang: Language;
}

const VERDICT: Record<Verdict, { color: string; ko: string; en: string }> = {
  on_track: { color: '#22c55e', ko: '순조로움', en: 'On track' },
  behind: { color: '#f59e0b', ko: '분발 필요', en: 'Behind' },
  at_risk: { color: '#ef4444', ko: '위기', en: 'At risk' },
};

// 반원 게이지(경량 SVG, 외부 차트 라이브러리 없음). 0~100%를 180° 호로 표현.
function Gauge({ value, color }: { value: number; color: string }) {
  const r = 52;
  const cx = 60;
  const cy = 60;
  // 반원 호 길이 = π·r. 값 비율만큼만 채운다.
  const arc = Math.PI * r;
  const filled = (value / 100) * arc;
  const describe = (angleDeg: number) => {
    const a = (Math.PI * (180 - angleDeg)) / 180;
    return `${cx + r * Math.cos(a)},${cy - r * Math.sin(a)}`;
  };
  const trackPath = `M ${describe(0)} A ${r} ${r} 0 0 1 ${describe(180)}`;
  return (
    <svg viewBox="0 0 120 68" className="w-full max-w-[220px]" role="img" aria-label={`${value}%`}>
      <path d={trackPath} fill="none" stroke="var(--color-bg-subtle, #eee)" strokeWidth={10} strokeLinecap="round" />
      <path
        d={trackPath}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${arc}`}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-fg" fontSize={24} fontWeight={700}>
        {value}%
      </text>
    </svg>
  );
}

export function PassProbability({ prediction, dday, examDate, lang }: PassProbabilityProps) {
  const v = VERDICT[prediction.verdict];
  const en = lang === 'en';

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-bg-elevated p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-fg-muted">
          {en ? 'Pass Probability' : '합격 가능성'}
          <span className="ml-1.5 rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] font-normal text-fg-faint">
            {en ? 'estimate' : '추정'}
          </span>
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ color: v.color, backgroundColor: `${v.color}1a` }}
        >
          {en ? v.en : v.ko}
        </span>
      </div>

      <div className="flex flex-col items-center">
        <Gauge value={prediction.probability} color={v.color} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-bg-subtle px-3 py-2">
          <p className="text-[11px] text-fg-muted">{en ? 'Exam' : '시험'}</p>
          <p className="text-sm font-semibold tabular-nums text-fg">
            {prediction.hasSchedule && dday !== null
              ? dday >= 0
                ? `D-${dday}`
                : en ? `${-dday}d ago` : `${-dday}일 지남`
              : en ? 'Not set' : '미설정'}
          </p>
          {examDate && <p className="text-[10px] text-fg-faint">{examDate}</p>}
        </div>
        <div className="rounded-lg bg-bg-subtle px-3 py-2">
          <p className="text-[11px] text-fg-muted">{en ? 'Daily target' : '하루 권장'}</p>
          <p className="text-sm font-semibold tabular-nums text-fg">
            {prediction.hasSchedule && prediction.requiredDailyQuestions > 0
              ? en
                ? `${prediction.requiredDailyQuestions} Q · ${prediction.requiredDailyMinutes}m`
                : `${prediction.requiredDailyQuestions}문제 · ${prediction.requiredDailyMinutes}분`
              : '—'}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">
        {en
          ? 'Estimated from coverage, accuracy, and time left — not a guarantee. Improves as you practice.'
          : '커버리지·정답률·남은 기간으로 추정한 값이며 보장이 아닙니다. 풀이가 쌓일수록 정확해집니다.'}
      </p>
    </div>
  );
}
