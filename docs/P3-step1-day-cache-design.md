# P3 Step 1 — 2주차 이상 본문 캐시 전환 설계

작성일: 2026-10-14 · 기준 커밋: `0e563c2` (브랜치 `feat/p3-adsense-readiness`) · Next.js 16.2.6 (Turbopack)

상위 계획: `docs/P3-adsense-readiness-plan.md` Step 1. 이 문서는 설계만 다루고, 코드 변경은 Step 2에서 한다.

표기: **[실측]** 은 이 문서를 쓰며 로컬(Windows 11, 논리 코어 22, Node 22.20)에서 직접 잰 값,
**[문서]** 는 `node_modules/next/dist/docs/` 또는 Vercel 공식 문서 근거, **[추정]** 은 확인하지 못한 것이다.

## 결론

**선택지 B를 고른다.** `[week]/[day]/page.tsx` 에서 `force-dynamic` 을 지우고 빈 배열을 돌려주는
`generateStaticParams` 를 둔다. 빌드 때는 한 장도 만들지 않고, 각 day 는 첫 요청 때 한 번 렌더되어
다음 배포까지 캐시된다.

근거:

1. 빌드 시간이 늘지 않는다. A는 로컬에서 빌드 자체가 실패했다(아래 실측).
2. 콘텐츠가 레포의 md 파일이라 "배포 = 무효화" 로 끝난다. 재검증 주기도, 무효화 API도 필요 없다.
3. 같은 proxy matcher 아래에서 week1 이 이미 정적 캐시와 404 검증을 함께 쓰고 있고, B를 임시 적용한
   빌드에서도 캐시 HIT·진짜 404·영어판 noindex 가 모두 유지됐다.

## 1. 선택지 비교

### 실측

대상 규모: 2주차 이상 day 파일 1,257개(한국어 687 + 영어 570). 현재 빌드의 정적 페이지는 200개.

| 빌드 | 전체 시간 | 정적 생성 단계 | 비고 |
|---|---|---|---|
| 현재(`force-dynamic`) 1회차 | 280초 | 200장 2.0분 | 40장이 60초 제한에 걸려 재시도 |
| 현재 2회차 | 213초 | 200장 78초 | 40장 재시도 |
| B 임시 적용 1회차 | 161초 | 200장 53초 | 재시도 0 |
| B 임시 적용 2회차 | 176초 | 200장 63초 | 재시도 0 |
| A 임시 적용 | **실패**(278초에 중단) | 143/1,457장에서 중단 | 60초 초과 318건, 워커 exit code 1 |

모두 `.next` 를 지우고 `npm run build` 를 잰 값이다(prebuild 포함). 같은 구성에서도 161~280초로
흔들리므로 현재와 B의 차이는 측정 오차로 본다. **B는 빌드 시간을 늘리지 않는다**가 확인된 사실이다.

현재 빌드도 week1 120장을 만들면서 60초 제한에 걸려 재시도한다. A는 이 상태에 1,257장을 더 얹는
것이다. A가 실패한 정확한 원인(워커 메모리인지, 워커당 동시 처리 수인지)은 진단하지 않았다.

요청 지연(`next start`, 로컬):

| 상황 | TTFB |
|---|---|
| B, 프로세스 첫 렌더(MISS) | 5.6초 |
| B, 이후 다른 day 의 첫 요청(MISS) 7건 | 0.32~0.78초 |
| B, 두 번째 요청부터(HIT) | 0.011~0.023초 |
| 현재, 프로세스 첫 렌더 | 4.9초 |
| 현재, 이후 요청 | TTFB 0.04~0.23초, 전체 0.12~0.31초 |

로컬에서는 현재 방식도 데워진 뒤에는 빠르다. 운영에서 이득이 얼마나 되는지는 재지 못했다 [추정:
함수 콜드 스타트와 요청마다의 함수 실행이 사라지는 만큼 이득].

캐시 1장 크기: HTML 440KB + RSC 308KB + segments 628KB ≈ 1.4MB(압축 전) [실측, `saa-c03/week2/day1`].

### 비교표

| | A. 전량 프리렌더 | B. 첫 요청 때 생성 | C. 동적 + CDN 헤더 |
|---|---|---|---|
| 빌드 시간 | 로컬 실패. 통과시키려면 `staticPageGenerationTimeout`·동시성 조정 필요. 통과 시 6~15분 추가 [추정: 200장 53~120초 비례] | 변화 없음 [실측] | 변화 없음 |
| 첫 요청 지연 | 없음 | day 마다 배포 후 첫 1회만 렌더 | 리전마다, CDN 캐시가 비워질 때마다 렌더 |
| 무효화 | 배포 | 배포 | 배포 |
| 존재하지 않는 URL | `dynamicParams = false` 로 Next 가 직접 404 가능 | proxy 가 404 (현재와 동일) | proxy 가 404 (현재와 동일) |
| 함수 실행 | 0 | day 당 배포마다 1회 | 캐시 미스마다 |
| 페이월 복귀 시 | 라우트 구조를 되돌려야 함 | 라우트 구조를 되돌려야 함 | 헤더만 제거 |

무효화: Vercel ISR 캐시는 배포 단위다. "each new deployment uses its own ISR cache and does not reuse
the cache from a previous deployment" [문서: vercel.com/docs/incremental-static-regeneration].
콘텐츠는 `content/**.md` 를 `process.cwd()/content` 에서 읽으므로(`src/lib/content.ts`) 수정하려면
배포해야 하고, 배포하면 캐시가 새로 시작된다. `revalidate` 를 선언하지 않으면 재검증이 없고 응답은
`Cache-Control: s-maxage=31536000` 이다 [실측, 문서: cdn-caching.md].

비용(Vercel): 캐시된 페이지는 CDN 이 내보내고 함수가 돌지 않는다. ISR 저장소 읽기·쓰기는 8KB 단위로
과금되고, 31일간 접근이 없으면 지워진다 [문서: limits-and-pricing]. B는 방문된 day 만 쓰기가
생기고 A는 배포마다 1,457장 전부를 쓴다. 전량 방문 시 저장량은 약 1.7GB(압축 전) [추정: 1.4MB ×
1,257]. proxy 는 캐시 여부와 관계없이 요청마다 실행된다(week1 과 동일) [문서: proxy.md 실행 순서].
현재 요금제와 무료 한도 대비 여유는 확인하지 않았다.

C를 버리는 이유: CDN 캐시는 리전별이고 보존이 보장되지 않는다("ephemeral with no guaranteed
retention"). `Cache-Control` 만으로는 요청 합치기·영속 저장을 쓸 수 없다 [문서: 같은 Vercel 문서].
`force-dynamic` 라우트의 기본 헤더(`private, no-store`)를 덮어쓰는 설정도 별도로 유지해야 한다.

A를 버리는 이유: 빌드가 실패했고, 통과시키더라도 콘텐츠 한 줄 수정에 전 페이지를 다시 만든다.
Step 4~8 의 콘텐츠 보강이 배포를 자주 만든다.

일부만 프리렌더하는 변형은 채택하지 않는다. 지금도 빌드가 60초 제한에 닿아 있어 장수를 늘릴 여유가 없다.

## 2. 선택한 방식 — 구현 지시(Step 2)

근거 문서: `generate-static-params.md` "All paths at runtime" — 빈 배열을 돌려주면 빌드 때 아무것도
만들지 않고 첫 방문 때 정적 렌더한다. `dynamicParams.md` — 기본값 `true` 는 목록에 없는 param 을
요청 시점에 생성한다.

### 2-1. `src/app/[category]/[slug]/[week]/[day]/page.tsx`

`export const dynamic = 'force-dynamic';` 한 줄을 아래로 바꾼다. 나머지 본문은 그대로 둔다.

```ts
import { PAYWALL_ENABLED } from '@/lib/entitlement/policy';

export async function generateStaticParams(): Promise<{ category: string; slug: string; week: string; day: string }[]> {
  if (PAYWALL_ENABLED) {
    throw new Error(
      'PAYWALL_ENABLED=true 인데 [week]/[day] 가 정적 캐시 라우트다. ' +
        'docs/P3-step1-day-cache-design.md 3장의 되돌림 절차를 먼저 수행할 것.',
    );
  }
  return [];
}

export const dynamicParams = true;
```

- `dynamic` 은 선언하지 않는다. `force-static` 을 쓰면 `cookies()` 가 예외 없이 빈 값을 돌려줘
  (`server/request/cookies.js:35`), 페이월을 되살렸을 때 구독자가 조용히 잠긴다. week1 라우트가
  `force-static` 을 쓰지 않는 이유와 같다.
- `revalidate` 는 선언하지 않는다.
- 상단 주석(11~19행)을 새 동작과 이 문서 경로로 바꿔 쓴다.

### 2-2. 주석만 고치는 파일

- `src/lib/contentExists.ts` 16~17행: "force-dynamic(캐시 없음)이라 신선도 문제가 없다" → 4장의 새 근거로 교체.
- `src/app/[category]/[slug]/week1/[day]/page.tsx` 14~16행: `[week]/[day]` 를 "cookies() 호출 경로" 로
  설명한 부분을 현재 상태에 맞게 수정.
- `src/lib/entitlement/policy.ts` `PAYWALL_ENABLED` 주석: 되살릴 때 이 문서 3장을 따르라는 한 줄 추가.

### 2-3. 가드 테스트 — `src/app/[category]/[slug]/[week]/[day]/cacheContract.test.ts` (신규)

`page.tsx` 소스 문자열과 `PAYWALL_ENABLED` 값을 함께 검사한다. `noDynamicApiImports.test.ts` 와 같은
소스 스캔 방식이다.

| 조건 | 검사 |
|---|---|
| `PAYWALL_ENABLED === false` | `generateStaticParams` export 가 있다 |
| | `generateStaticParams()` 가 빈 배열을 돌려준다 |
| | `dynamic = 'force-dynamic'`·`'force-static'` 선언이 없다 |
| | `next/headers`, `@/lib/auth/currentUser`, `@/lib/entitlement/factory` 를 import 하지 않는다 |
| `PAYWALL_ENABLED === true` | `dynamic = 'force-dynamic'` 선언이 있고 `generateStaticParams` export 가 없다 |
| 항상 | policy 를 `PAYWALL_ENABLED: true` 로 모킹하고 page 를 다시 import 했을 때, `generateStaticParams` 가 있으면 호출이 reject 된다 |

실패 메시지에는 이 문서 3장 경로를 적는다.

### 2-4. 완료 확인

6장의 절차로 확인하고, `tsc --noEmit`·vitest·`npm run build` 를 통과시킨다. 빌드 출력에서
`/[category]/[slug]/[week]/[day]` 가 `ƒ` 에서 `●` 로 바뀌고 하위 경로가 0개인 것이 정상이다.

## 3. 페이월을 다시 켤 때

### 위험 재확인

B를 적용한 라우트에 `cookies()` 호출만 되살린 빌드를 만들어 확인했다 [실측].

- `npm run build` 는 **exit 0 으로 통과**한다. 빌드 때 만드는 페이지가 없어 `cookies()` 에 닿지 않는다.
- `next start` 에서 `/aws/saa-c03/week2/day1` 은 **매 요청 500**, 서버 로그 digest 는 `DYNAMIC_SERVER_USAGE`.
- 원인은 `docs/SEO-indexing-fix-plan.md` Step5 가 적은 그대로다. `prerender-manifest.json` 의
  `dynamicRoutes` 에 이 라우트가 등록돼(`fallback: null`) `app-page.js` 의 `isSSG` 가 참이 된다.

### 가드

| 가드 | 잡는 상황 | 동작 |
|---|---|---|
| `generateStaticParams` 안의 throw (2-1) | 스위치만 켜고 라우트를 그대로 둠 | 빌드가 "Collecting page data" 단계에서 실패 |
| `cacheContract.test.ts` (2-3) | 위와 같음 + 스위치는 그대로 두고 정적 라우트에 쿠키·권한 import 를 추가함 | vitest 실패 |

첫 번째 가드는 `PAYWALL_ENABLED = true` 와 2-1 의 코드를 함께 넣어 실제로 돌려봤다. 92초 만에
`Error: Failed to collect page data for /[category]/[slug]/[week]/[day]` 로 exit 1 [실측].
Vercel 배포는 빌드만 돌리므로 배포를 실제로 막는 것은 이 가드다. 가드가 위험의 원인인
`generateStaticParams` 안에 있어서, 절차대로 그 함수를 지우면 가드도 함께 사라진다.

### 되돌림 절차

1과 2는 **한 커밋**으로 한다. 2만 하면 빌드가 실패하고, 1만 하면 동적 렌더로 돌아갈 뿐 해가 없다.

1. `[week]/[day]/page.tsx`
   - `generateStaticParams`, `dynamicParams`, `PAYWALL_ENABLED` import 를 지운다.
   - `export const dynamic = 'force-dynamic';` 을 되살린다.
   - 게이팅 블록을 되살린다. 원본은 `git show 5db7107^:"src/app/[category]/[slug]/[week]/[day]/page.tsx"`.
     주차 판정은 `w > FREE_WEEK` 대신 `isPaidWeek(w)` 를 쓴다.
2. `src/lib/entitlement/policy.ts` 의 `PAYWALL_ENABLED` 를 `true` 로.
3. `contentExists.ts` 주석을 원래 근거(force-dynamic)로 되돌린다.
4. vitest 실행 — `cacheContract.test.ts` 가 `true` 분기를 검사한다.
5. `npm run build` 후 `next start` 로 확인: 2주차 URL 이 쿠키 없이 200(미리보기)이고 500이 아니다.
   `Cache-Control` 이 `private, no-store` 다. 빌드 출력에서 라우트가 `ƒ` 다.
6. 배포. 새 배포는 자기 ISR 캐시를 쓰므로 이전에 캐시된 전체 본문은 운영 도메인에서 더 나가지 않는다.
7. `policy.ts` 주석이 안내하는 나머지(화면 문구, `next.config.ts` 의 `/pricing` 리다이렉트)를 되돌린다.

## 4. proxy 존재 검증과의 관계

충돌하지 않는다.

- proxy 는 파일시스템 라우트보다 먼저 실행된다 [문서: proxy.md "Execution order"]. 캐시된 페이지에도
  요청마다 돈다.
- B 임시 적용 빌드에서 확인 [실측]:

  | URL | 응답 |
  |---|---|
  | `/aws/saa-c03/week2/day1` (2회째) | 200, `x-nextjs-cache: HIT` |
  | `/aws/saa-c03/week99/day1` | 404 |
  | `/aws/saa-c03/week2/day9` | 404 |
  | `/aws/nope/week2/day1` | 404 |
  | `/linux/saa-c03/week2/day1` (교차 섹션) | 404 |

- `contentExists.ts` 주석의 전제("force-dynamic 이라 신선도 문제 없음")는 **근거가 바뀌지만 결론은
  유지된다.** proxy 의 `getAllDays` 와 캐시된 페이지는 같은 배포에 묶인 `content/` 에서 나오고,
  ISR 캐시도 배포 단위다. 한 배포 안에서 "캐시에는 있는데 proxy 는 없다고 판정" 하거나 그 반대가
  생길 수 없다. 주석은 이 근거로 고쳐 쓴다(2-2).
- 운영에서 week1 이 같은 matcher 아래 `X-Vercel-Cache: HIT` 와 404 검증을 함께 쓰고 있다는 점이
  Vercel 에서도 같으리라는 근거다. week2 이상을 운영에서 직접 확인하지는 않았다.

## 5. 영어판 noindex (metadata)

영향 없다. `buildDayMetadata` → `isIndexableDay(category, week)` 는 URL param 과 상수만 읽고 요청
헤더·쿠키를 읽지 않는다. 결과는 렌더된 HTML 에 함께 캐시된다.

B 임시 적용 빌드에서 확인 [실측]:

| URL | MISS | HIT |
|---|---|---|
| `/en/saa-c03/week2/day1` | `<meta name="robots" content="noindex, nofollow"/>`, canonical 자기 자신 | 동일 |
| `/aws/saa-c03/week2/day1` | robots 메타 없음, canonical 자기 자신 | 동일 |

`EN_INDEXABLE_WEEK` 를 바꾸면 배포가 따르므로 캐시도 새로 만들어진다.

## 6. 로컬 검증 방법

`X-Vercel-Cache` 는 로컬에 없다. `next start` 의 `x-nextjs-cache` 로 본다. 값은 `HIT`·`STALE`·`MISS`·
`REVALIDATED` [문서: incremental-static-regeneration.md "Caveats"].

```bash
npm run build
NEXT_PRIVATE_DEBUG_CACHE=1 npx next start -p 3457   # 캐시 조회 로그를 콘솔에 찍는다(선택)

curl -s -o /dev/null -D - http://localhost:3457/aws/saa-c03/week2/day1 | grep -i -E "^HTTP|cache-control|x-nextjs-cache"
```

기대값:

| 요청 | 기대 |
|---|---|
| 2주차 URL 첫 요청 | 200, `x-nextjs-cache: MISS`, `Cache-Control: s-maxage=31536000` |
| 같은 URL 두 번째 요청 | 200, `x-nextjs-cache: HIT` |
| 쿠키를 붙인 요청(`-H "Cookie: session=x"`) | 여전히 `HIT` |
| `/aws/saa-c03/week99/day1` | 404 |
| `/en/saa-c03/week2/day1` 본문 | `noindex, nofollow` 포함 |
| `.next/server/app/aws/saa-c03/week2/` | 요청 뒤 `day1.html` 이 생김 |

`npm run build` 의 prebuild 가 `src/data/*.json` 을 다시 쓰므로 끝나면 `git checkout -- src/data` 로 되돌린다.

배포 뒤 운영 확인: 같은 URL 을 두 번 요청해 두 번째가 `X-Vercel-Cache: HIT` 이고 `Cache-Control` 에
`no-store` 가 없는지 본다.

## 미해결 위험

1. **형식만 맞는 임의 URL 이 200 으로 캐시된다.** `/foo/bar/week2/day1`, `/a/b/c/d` 처럼 proxy matcher
   밖의 4세그먼트 URL 은 지금도 200 소프트 404 다(홈 title, `noindex`) [실측]. B 뒤에는 이 응답이
   URL 마다 약 300KB 로 캐시된다 [실측]. 함수 실행은 지금보다 늘지 않지만 ISR 쓰기가 생긴다.
   proxy 에서 미지원 category 를 404 마커로 보내면 막을 수 있으나, matcher 가 `/api/...` 등 다른
   4세그먼트 경로와 겹쳐 별도 설계가 필요하다. Step 2 범위에 넣을지 결정이 필요하다.
2. **Vercel 배포가 vitest 를 돌리지 않는다.** `.github/workflows` 에는 알림 크론뿐이다. "스위치는
   그대로인데 정적 라우트에 쿠키 읽기를 추가" 하는 실수는 빌드를 통과하고 테스트만 잡는다. 또 소스
   스캔은 `page.tsx` 와 `components/day`·`lib/day` 만 보므로 그 밖 모듈을 거친 간접 호출은 못 잡는다.
3. **운영 수치 미확인.** 첫 요청 지연, ISR 읽기·쓰기 사용량, 요금제 한도 대비 여유는 배포 뒤 재야 한다.
4. **빌드가 이미 60초 제한에 닿아 있다.** 현재 구성에서 week1 40장이 1차 시도에 시간 초과로 재시도된다
   [실측, 로컬 2회 모두]. B와 무관한 기존 문제이고 Vercel 빌드에서도 나는지는 확인하지 않았다.
5. **이전 배포의 고유 URL.** 페이월 복귀 뒤에도 이전 배포 주소로는 캐시된 전체 본문이 열린다
   [추정: Vercel 은 이전 배포의 캐시를 지우지 않는다고 문서에 적혀 있음]. 필요하면 이전 배포를 삭제한다.
