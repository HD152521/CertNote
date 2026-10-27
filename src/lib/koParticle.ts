// 시험 코드(예: 'DOP-C01', 'SAP-C03') 뒤에 붙일 조사를 고른다. 끝 글자를 한국어로 읽은 소리 기준이다.
// 숫자는 읽는 소리로(일·이·삼…), 알파벳은 대부분 받침 없이 읽혀(에이·비·시…) 받침 없음으로 본다.
// 받침 있게 읽히는 L(엘)·M(엠)·N(엔)·R(알)만 예외로 둔다.
type Final = 'none' | 'rieul' | 'other';

const DIGIT_FINAL: Record<string, Final> = {
  '0': 'other', // 영
  '1': 'rieul', // 일
  '2': 'none', // 이
  '3': 'other', // 삼
  '4': 'none', // 사
  '5': 'none', // 오
  '6': 'other', // 육
  '7': 'rieul', // 칠
  '8': 'rieul', // 팔
  '9': 'none', // 구
};
const LETTER_FINAL: Record<string, Final> = { L: 'rieul', M: 'other', N: 'other', R: 'rieul' };

function finalOf(code: string): Final {
  const last = code.slice(-1).toUpperCase();
  return DIGIT_FINAL[last] ?? LETTER_FINAL[last] ?? 'none';
}

// 과/와: 받침이 있으면 '과'(ㄹ 받침 포함).
export function withAnd(code: string): string {
  return code + (finalOf(code) === 'none' ? '와' : '과');
}

// 으로/로: ㄹ 이외의 받침이 있을 때만 '으로'.
export function withTo(code: string): string {
  return code + (finalOf(code) === 'other' ? '으로' : '로');
}
