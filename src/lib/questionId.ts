// 콘텐츠 전반에서 퀴즈 문제를 가리키는 안정적 ID.
// 문제 번호(number)는 같은 day 안에서도 중복될 수 있으므로(예: week2/day5)
// 파싱된 위치 인덱스(1-based)를 사용해 항상 고유하게 만든다.
export function questionId(slug: string, week: number, day: number, index: number): string {
  return `${slug}-w${week}-d${day}-q${index}`;
}
