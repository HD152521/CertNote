// 일자별 학습 추이(정답률·풀이량 시계열). 대시보드 경량 SVG 차트의 데이터원.

export interface TrendPoint {
  date: string; // 'YYYY-MM-DD' (KST)
  attempts: number;
  correct: number;
  accuracy: number | null; // 그날 풀이 없으면 null(0%와 구분)
}

// 풀이 항목을 KST 일자별로 집계해 window 전체(빈 날 포함)를 채운다(순수).
// items의 day는 호출측이 미리 KST 'YYYY-MM-DD'로 변환해 넘긴다(IO/시간대와 분리).
export function buildDailyTrend(items: { day: string; correct: boolean }[], orderedDays: string[]): TrendPoint[] {
  const window = new Set(orderedDays);
  const agg = new Map<string, { attempts: number; correct: number }>();
  for (const it of items) {
    if (!window.has(it.day)) continue; // window 밖은 무시.
    const cur = agg.get(it.day) ?? { attempts: 0, correct: 0 };
    cur.attempts += 1;
    if (it.correct) cur.correct += 1;
    agg.set(it.day, cur);
  }
  return orderedDays.map((date) => {
    const v = agg.get(date);
    return {
      date,
      attempts: v?.attempts ?? 0,
      correct: v?.correct ?? 0,
      accuracy: v && v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : null,
    };
  });
}
