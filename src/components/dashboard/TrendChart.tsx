import type { TrendPoint } from '@/lib/analytics/trend';
import type { Language } from '@/lib/i18n-client';

interface TrendChartProps {
  trend: TrendPoint[];
  lang: Language;
}

// viewBox 좌표계(고정). 실제 렌더 크기는 CSS가 결정 → 반응형.
const W = 320;
const H = 96;
const PAD = { top: 8, right: 8, bottom: 16, left: 8 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const mmdd = (ymd: string) => ymd.slice(5).replace('-', '/');

// 최근 N일 정답률(선) + 활동량(막대) 시계열. 경량 SVG 자작(번들 예산 준수).
export function TrendChart({ trend, lang }: TrendChartProps) {
  const en = lang === 'en';
  const n = trend.length;
  const totalAttempts = trend.reduce((s, p) => s + p.attempts, 0);

  if (n === 0 || totalAttempts === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-elevated p-5">
        <h2 className="mb-2 text-sm font-medium text-fg-muted">{en ? 'Trend' : '학습 추이'}</h2>
        <p className="text-sm text-fg-faint">
          {en ? 'Practice over a few days to see your accuracy and activity trend.' : '며칠 풀이가 쌓이면 정답률·활동량 추이가 여기에 그려집니다.'}
        </p>
      </div>
    );
  }

  const maxAttempts = Math.max(1, ...trend.map((p) => p.attempts));
  const xFor = (i: number) => PAD.left + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yForAcc = (acc: number) => PAD.top + (1 - acc / 100) * PLOT_H;
  const barW = Math.max(2, (PLOT_W / n) * 0.5);

  // 정답률 선: null(풀이 없는 날)에서 끊어 여러 세그먼트로.
  const segments: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const acc = trend[i].accuracy;
    if (acc === null) {
      if (cur.length > 1) segments.push(cur.join(' '));
      cur = [];
    } else {
      cur.push(`${xFor(i)},${yForAcc(acc)}`);
    }
  }
  if (cur.length > 1) segments.push(cur.join(' '));

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg-muted">{en ? 'Trend' : '학습 추이'}</h2>
        <span className="text-[11px] text-fg-faint">{en ? `Last ${n} days` : `최근 ${n}일`}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={en ? 'Accuracy and activity trend' : '정답률·활동량 추이'}>
        {/* 기준선 0/50/100% */}
        {[0, 50, 100].map((g) => (
          <line
            key={g}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yForAcc(g)}
            y2={yForAcc(g)}
            stroke="var(--color-border, #e5e5e5)"
            strokeWidth={0.5}
            strokeDasharray={g === 0 ? '0' : '2 3'}
          />
        ))}

        {/* 활동량 막대(배경, 옅게) */}
        {trend.map((p, i) => {
          if (p.attempts === 0) return null;
          const h = (p.attempts / maxAttempts) * PLOT_H;
          return (
            <rect
              key={`bar-${p.date}`}
              x={xFor(i) - barW / 2}
              y={PAD.top + PLOT_H - h}
              width={barW}
              height={h}
              rx={1}
              fill="var(--color-accent, #4f7cff)"
              opacity={0.15}
            />
          );
        })}

        {/* 정답률 선 */}
        {segments.map((pts, i) => (
          <polyline key={`seg-${i}`} points={pts} fill="none" stroke="var(--color-accent, #4f7cff)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* 정답률 점 */}
        {trend.map((p, i) =>
          p.accuracy === null ? null : (
            <circle key={`dot-${p.date}`} cx={xFor(i)} cy={yForAcc(p.accuracy)} r={2.5} fill="var(--color-accent, #4f7cff)" />
          ),
        )}

        {/* x축 라벨: 처음/끝 */}
        <text x={PAD.left} y={H - 4} fontSize={9} className="fill-fg-faint">{mmdd(trend[0].date)}</text>
        <text x={W - PAD.right} y={H - 4} fontSize={9} textAnchor="end" className="fill-fg-faint">{mmdd(trend[n - 1].date)}</text>
      </svg>

      <div className="mt-1 flex items-center gap-3 text-[11px] text-fg-faint">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded-full bg-accent" />{en ? 'Accuracy' : '정답률'}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-accent/20" />{en ? 'Activity' : '활동량'}</span>
      </div>
    </div>
  );
}
