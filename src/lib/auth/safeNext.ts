// 로그인·가입·온보딩 뒤에 돌아갈 경로(?next=)의 단일 검증 지점.
//
// `startsWith('/') && !startsWith('//')` 만으로는 부족하다. 브라우저와 URL 파서는 `\`를 `/`로
// 읽으므로 `/\evil.com` 이 `//evil.com`(외부 호스트)이 된다 — new URL('/\\evil.com', origin) 실측.
// 그래서 문자열 규칙 대신 실제로 같은 출처로 해석되는지를 본다.

const PROBE_ORIGIN = 'https://internal.invalid';

/** 같은 사이트 안의 경로면 정규화한 경로(+쿼리·해시)를, 아니면 fallback 을 돌려준다. */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.includes('\\')) return fallback;
  // 제어 문자(탭·개행)는 URL 파서가 지워 버려 `/\t/evil.com` 같은 우회가 된다.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  // `/exam/..//evil.com` 은 `..` 정규화 뒤 pathname 이 `//evil.com` 이 된다. 이 값을 router.push 하면
  // 브라우저가 프로토콜 상대 URL(외부 호스트)로 읽으므로, 정규화된 결과도 `//` 로 시작하면 거절한다.
  if (url.pathname.startsWith('//')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
