// 구글 애드센스 설정값(docs/P3-adsense-readiness-plan.md Step 9).
//
// 게시자 ID 는 NEXT_PUBLIC_ADSENSE_CLIENT 하나에서만 온다. 로더 스크립트, 광고 슬롯, /ads.txt 가
// 전부 이 파일을 거치므로 값이 없거나 형식이 틀리면 세 곳이 함께 꺼진다 — 일부만 켜진 상태
// (스크립트는 없는데 슬롯만 남아 빈 상자가 보이는 등)가 생기지 않는다.

const ADSENSE_CLIENT_PATTERN = /^ca-pub-\d{16}$/;
const AD_SLOT_PATTERN = /^\d+$/;
const ADSENSE_SCRIPT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
// ads.txt 의 구글 인증기관 ID. 게시자와 무관하게 모든 애드센스 계정이 같은 값을 쓴다.
const GOOGLE_CERTIFICATION_AUTHORITY_ID = 'f08c47fec0942fa0';

/**
 * 게시자 ID 형식 검증의 단일 지점. `ca-pub-` + 숫자 16자리만 통과시킨다.
 * 이 값은 스크립트 src 와 ads.txt 에 그대로 들어가므로 형식 밖의 문자는 한 글자도 허용하지 않는다.
 */
export function parseAdSenseClient(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  return ADSENSE_CLIENT_PATTERN.test(value) ? value : null;
}

/**
 * 빌드에 실린 게시자 ID. 없거나 형식이 틀리면 null.
 * NEXT_PUBLIC_* 는 빌드 때 번들에 인라인되므로 값을 바꾸면 다시 빌드해야 한다.
 * `process.env.NEXT_PUBLIC_ADSENSE_CLIENT` 를 통째로 적어야 인라인된다(구조분해·동적 키 금지).
 */
export function getAdSenseClient(): string | null {
  return parseAdSenseClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);
}

/** 광고 단위(슬롯) ID 검증. 애드센스가 발급하는 값은 숫자뿐이다. */
export function parseAdSlotId(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  return AD_SLOT_PATTERN.test(value) ? value : null;
}

/** 애드센스 로더 주소. `client` 는 parseAdSenseClient 를 통과한 값이어야 한다. */
export function buildAdSenseScriptSrc(client: string): string {
  return `${ADSENSE_SCRIPT_URL}?client=${client}`;
}

/**
 * /ads.txt 본문. ads.txt 는 `ca-` 접두사를 뗀 `pub-…` 를 쓴다.
 * 게시자 ID 가 없으면 null — 라우트가 404 를 낸다(빈 200 은 "판매자 없음" 선언으로 읽힌다).
 */
export function buildAdsTxt(client: string | null): string | null {
  if (!client) return null;
  return `google.com, ${client.replace(/^ca-/, '')}, DIRECT, ${GOOGLE_CERTIFICATION_AUTHORITY_ID}`;
}
