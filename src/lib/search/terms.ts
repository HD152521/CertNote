// 본문 전체를 검색 가능하게 하는 컴팩트 표현: day 마크다운의 "중복 제거된 소문자 단어 집합".
// 앞부분 발췌(이전 방식)와 달리 문서 끝의 용어도 찾을 수 있다. 코드 블록·표·링크 텍스트의 용어도 포함한다
// (mysqld, kustomize 같은 명령어·제품명은 대개 코드/표에 있다).
//
// 크기를 줄이는 두 가지(측정값은 docs 가 아니라 build.test.ts 의 예산 테스트가 지킨다):
//  - 한국어 단어의 끝 조사(을/를/에서/으로 …)를 떼어 같은 어간을 한 항목으로 합친다.
//  - 단어 사전 + day 별 사전 인덱스(델타·36진수)로 저장해 같은 단어를 day 마다 반복하지 않는다.
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}_.+#-]*/gu;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const TRAILING_PUNCT = /[._+#-]+$/;
const HANGUL_ONLY = /^[가-힣]+$/;
// 긴 조사부터 먼저 걸리도록 정렬된 목록.
const KO_PARTICLES = /(에서는|으로는|에서의|에서|으로|에게|에는|과의|와의|입니다|하는|하고|한다|된다|이며|이고|이다|은|는|이|가|을|를|에|의|로|도|과|와|만|께|며|고|서)$/;
const MIXED_PARTICLE_TAIL = new RegExp(`^([^\uAC00-\uD7A3]+)${KO_PARTICLES.source.replace(/\$$/, '')}$`);
export const MIN_TERM_LENGTH = 2;
export const MAX_TERM_LENGTH = 24; // 해시·긴 URL 조각 같은 검색 불가능한 토큰 제외

// 한글 단어의 끝 조사를 뗀다. 떼고 남는 글자가 2자 미만이면 그대로 둔다.
export function stripKoreanParticle(word: string): string {
  if (word.length <= MIN_TERM_LENGTH) return word;
  if (!HANGUL_ONLY.test(word)) {
    // 영문·숫자 뒤에 조사만 붙은 혼합 토큰('EC2는', 'S3에서')은 조사를 뗀다.
    const m = MIXED_PARTICLE_TAIL.exec(word);
    return m && m[1].length >= MIN_TERM_LENGTH ? m[1] : word;
  }
  const stripped = word.replace(KO_PARTICLES, '');
  return stripped.length >= MIN_TERM_LENGTH ? stripped : word;
}

// 색인과 검색어가 함께 쓰는 단 하나의 토크나이저: 소문자화 → 단어 추출(경로의 '/', 플래그의 '--' 같은 구분 기호는
// 단어가 아니다) → 끝 구두점·조사 제거 → 길이·숫자 필터 → 중복 제거(처음 나온 순서 유지).
// 색인 쪽(extractSearchTerms)과 검색어 쪽(searcher)이 이 함수를 같이 쓰므로 둘이 어긋나지 않는다.
export function tokenizeTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const m of text.toLowerCase().matchAll(TOKEN)) {
    const t = stripKoreanParticle(m[0].replace(TRAILING_PUNCT, ''));
    if (t.length < MIN_TERM_LENGTH || t.length > MAX_TERM_LENGTH) continue;
    if (/^[\d.,-]+$/.test(t)) continue; // 숫자만인 토큰(버전·포트 번호 등)은 제외
    terms.add(t);
  }
  return [...terms];
}

// day 하나의 정렬된 고유 단어 목록.
export function extractSearchTerms(raw: string): string[] {
  return tokenizeTerms(raw.replace(FRONTMATTER, '')).sort();
}

export interface EncodedTerms {
  dict: string; // 정렬된 고유 단어를 공백으로 이은 문자열
  ids: string[]; // day 마다: 사전 인덱스의 오름차순 델타를 36진수로, 쉼표로 이은 문자열
}

export function encodeTerms(perDay: string[][]): EncodedTerms {
  const dict = [...new Set(perDay.flat())].sort();
  const index = new Map(dict.map((t, i) => [t, i]));
  const ids = perDay.map((terms) => {
    let prev = 0;
    return terms.map((t) => index.get(t)!).sort((a, b) => a - b).map((i) => {
      const delta = i - prev;
      prev = i;
      return delta.toString(36);
    }).join(',');
  });
  return { dict: dict.join(' '), ids };
}

export function decodeIds(encoded: string): Int32Array {
  if (encoded === '') return new Int32Array(0);
  const parts = encoded.split(',');
  const out = new Int32Array(parts.length);
  let prev = 0;
  for (let i = 0; i < parts.length; i++) {
    prev += parseInt(parts[i], 36);
    out[i] = prev;
  }
  return out;
}
