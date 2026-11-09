#!/usr/bin/env node
// 배포된 사이트맵의 URL 을 IndexNow(빙·네이버 등)에 알린다. 구글은 IndexNow 를 쓰지 않는다.
//
// 사용법:
//   node scripts/indexnow.mjs                      # 보낼 목록만 출력(기본은 미리보기)
//   node scripts/indexnow.mjs --send               # 사이트맵 전체 제출
//   node scripts/indexnow.mjs --since 2026-11-09 --send   # 그 날 이후 바뀐 URL 만
//
// 배포가 끝난 뒤에 돌린다. 키 파일(public/<KEY>.txt)이 운영에서 열려야 엔진이 받아 준다.

import { INDEXNOW_ENDPOINTS, INDEXNOW_KEY, buildPayloads, parseSitemap, selectUrls } from '../src/lib/seo/indexnow.mjs';

const BASE = 'https://cert.juganlab.com';
const HOST = new URL(BASE).host;

const args = process.argv.slice(2);
const send = args.includes('--send');
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

async function main() {
  const keyRes = await fetch(`${BASE}/${INDEXNOW_KEY}.txt`);
  const keyBody = keyRes.ok ? (await keyRes.text()).trim() : '';
  if (keyBody !== INDEXNOW_KEY) {
    throw new Error(`운영 키 파일 확인 실패(${keyRes.status}). 배포가 끝났는지 확인하세요.`);
  }

  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml 응답 ${res.status}`);
  const urls = selectUrls(parseSitemap(await res.text()), { host: HOST, since });
  const payloads = buildPayloads(urls, { host: HOST });
  console.log(`보낼 URL ${urls.length}개, 요청 ${payloads.length}건${since ? ` (since ${since})` : ''}`);

  if (!send) {
    urls.slice(0, 10).forEach((u) => console.log(`  ${u}`));
    console.log('미리보기만 했습니다. 실제로 보내려면 --send 를 붙이세요.');
    return;
  }

  let failed = 0;
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    for (const payload of payloads) {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      // 200(받음)·202(키 확인 대기)는 성공이다. 그 밖은 본문을 보여 준다.
      const ok = r.status === 200 || r.status === 202;
      if (!ok) failed++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.status} ${endpoint} (${payload.urlList.length}개)${ok ? '' : ` ${await r.text()}`}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
