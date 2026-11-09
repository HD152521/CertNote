// IndexNow 제출용 순수 함수. 실행은 scripts/indexnow.mjs 가 맡는다.
//
// IndexNow 는 빙·네이버·얀덱스 등이 함께 쓰는 "이 URL 이 바뀌었다" 알림 규약이다(구글은 참여하지 않는다).
// 소유 확인은 public/<KEY>.txt 를 사이트 루트에 두는 것으로 끝난다. 키는 공개 파일이라 비밀이 아니다.

export const INDEXNOW_KEY = '0448a22584f47eeae004976fc469e54c';

// 한 번에 보낼 수 있는 최대 URL 수(규약 상한 10,000). 넉넉히 낮춰 둔다.
export const INDEXNOW_BATCH = 5000;

// 참여 엔진끼리 서로 공유하지만, 국내 유입이 큰 네이버는 직접 한 번 더 보낸다.
export const INDEXNOW_ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'];

/** sitemap.xml 에서 <url> 항목의 loc·lastmod 를 뽑는다. */
export function parseSitemap(xml) {
  const entries = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    const lastmod = m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] ?? null;
    entries.push({ loc, lastmod });
  }
  return entries;
}

/**
 * 보낼 URL 을 고른다. since(YYYY-MM-DD)가 있으면 lastmod 가 그 날 이후인 것만,
 * 호스트가 다른 URL 은 규약상 거부되므로 뺀다.
 * @param {{ loc: string, lastmod: string | null }[]} entries
 * @param {{ host: string, since?: string | null }} options
 * @returns {string[]}
 */
export function selectUrls(entries, { host, since = null }) {
  const sinceMs = since ? Date.parse(since) : null;
  if (since && Number.isNaN(sinceMs)) throw new Error(`since 날짜를 읽을 수 없음: ${since}`);
  return entries
    .filter((e) => new URL(e.loc).host === host)
    .filter((e) => sinceMs === null || (e.lastmod !== null && Date.parse(e.lastmod) >= sinceMs))
    .map((e) => e.loc);
}

/** URL 목록을 배치별 요청 본문으로 나눈다. */
export function buildPayloads(urls, { host, key = INDEXNOW_KEY, batch = INDEXNOW_BATCH }) {
  const payloads = [];
  for (let i = 0; i < urls.length; i += batch) {
    payloads.push({
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList: urls.slice(i, i + batch),
    });
  }
  return payloads;
}
