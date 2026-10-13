// 영어판 허브·랜딩의 "영어로 읽을 수 있는 범위" 문구. 숫자는 항상 presentable 한도(파일에서 도출)에서 온다.
export function enWeeksLabel(presentableWeek: number): string | null {
  if (presentableWeek < 1) return null;
  return presentableWeek === 1 ? 'Week 1' : `Weeks 1–${presentableWeek}`;
}

// 자격증 허브 설명(메타 description 과 본문 안내 공용 문장). 숨겨진 주차를 광고하지 않는다.
export function enAvailabilitySentence(presentableWeek: number, totalWeeks: number): string {
  const label = enWeeksLabel(presentableWeek);
  if (!label) return 'This course is currently available in Korean only.';
  return presentableWeek >= totalWeeks
    ? `The whole course (${label}) is available in English.`
    : `${label} ${presentableWeek === 1 ? 'is' : 'are'} available in English; the remaining weeks are in Korean.`;
}
