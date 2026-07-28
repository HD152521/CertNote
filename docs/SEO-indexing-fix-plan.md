# SEO 색인 오류 수정 계획 (GSC 2026-07-28 기준)

## 배경 — Search Console 실측

| GSC 항목 | 페이지 수 | 진단 |
|---|---|---|
| 크롤링됨 - 현재 색인이 생성되지 않음 | 602 | 페이월 얇은 페이지 대량 크롤 |
| 중복 페이지, Google에서 다른 표준 선택 | 75 | 루트 canonical 누수 |
| NOINDEX 태그에 의해 제외 | 4 | 정상 |
| 찾을 수 없음(404) | 4 | 사이트맵 외부 URL |
| robots.txt에 의해 차단됨 | 2 | 의도된 동작 |

라이브 사이트(`https://cert.juganlab.com`) curl 실측:

- `/aws-certs/saa-c03/week2/day1` 응답에 `<meta name="robots" content="noindex, nofollow">` 와
  `<link rel="canonical" href="https://cert.juganlab.com"/>` 가 **동시에** 존재.
- 같은 페이지가 `hreflang ko=/ , en=/en , x-default=/` 선언 — 전부 홈페이지 기준.
- 이 상태인 URL이 약 860개(ko 450 + en 410).
- 크롤러가 보는 텍스트: week1(무료) 15,244자 vs week2/3(유료) 2,946 / 2,906자.
- 사이트맵 URL 142개 전수 검사 결과 전부 200. 404 4건은 사이트맵 밖.
- TTFB: 홈 0.25s / day 0.51s / 자격증 허브 1.0s.

## 현재 자산 (이미 되어 있는 것 — 중복 작업 금지)

- 구글 소유확인 `public/google1d1b2401090fca6e.html`, 네이버 `public/naverff6aff88c5b578bbe5d8b1ad081ae03f.html`
- `layout.tsx` 전역 Organization + WebSite JSON-LD
- `[category]/page.tsx` ItemList JSON-LD
- `[category]/[slug]/page.tsx` Course JSON-LD (`isAccessibleForFree: false` + `hasPart` 로 페이월 정직 선언)
- `next.config.ts` 에서 `cert-note.vercel.app` → `cert.juganlab.com` 301 통합
- 파일 기반 OG 이미지 (`opengraph-image.tsx` 루트/자격증별)

## 감사로 새로 발견한 결함

- day 페이지에 JSON-LD 가 **0개**. 색인 대상 142개의 대부분이 무료 day 인데 구조화 데이터 없음.
- `BreadcrumbList` 가 사이트 전역에 없음. URL 이 4단(`/aws-certs/saa-c03/week1/day1`)인데 계층 신호 부재.
- `sitemap.ts` 의 홈·카테고리·pricing·자격증 허브 `lastModified` 가 `new Date()` — 매 빌드마다 갱신되어
  Google 이 lastmod 신호를 불신하게 된다. day 페이지만 `getDayMtime` 을 쓴다.
- 홈(2,953자)과 `/aws-certs`(2,118자)가 둘 다 자격증 12종을 나열해 역할이 겹친다.

## 이번 범위

**A안(신호 정리)만 수행한다.** week2+ 유료 콘텐츠는 noindex 를 유지하되, 잘못된 canonical·hreflang
신호를 제거하고 구조화 데이터를 채우고 크롤 예산을 무료 142페이지로 몰아준다.

Out of scope: 페이월 콘텐츠를 색인 대상으로 전환하는 B안(미리보기 분량 확대 + day 페이지
`isAccessibleForFree` 전환). 콘텐츠 노출 정책 변경이라 별도 의사결정 후 진행한다.
홈/허브 역할 분리를 위한 카피 재작성도 이번 범위 밖(코드가 아닌 콘텐츠 작업).

---

## Step 1. week2+ day 페이지의 canonical/hreflang 누수 차단

`src/app/[category]/[slug]/[week]/[day]/page.tsx:45-49` 의 `generateMetadata` 가 유료 주차에서
`{ robots: 'noindex, nofollow' }` 만 반환한다. `alternates` 를 지정하지 않아 루트 레이아웃
(`src/app/layout.tsx:25-32`)의 `canonical: '/'` 와 `languages` 가 그대로 상속된다.

약 860개 URL 이 홈페이지를 자기 canonical 로 선언 중이다. `noindex` 와 타 URL canonical 의
동시 선언은 Google 이 금지하는 충돌 조합이며, 최악의 경우 noindex 가 canonical 대상인
홈페이지로 전파되어 홈이 색인에서 빠질 수 있다. **최우선 항목.**

구현: 유료 주차 분기에서도 자기참조 canonical 을 반환하고 상속된 `languages` 를 확실히 덮어쓴다.
Next.js 메타데이터 병합에서 `alternates` 지정 시 부모의 `languages` 가 남는지 반드시 실제 렌더
HTML 로 검증할 것(추측 금지).

수용 기준:
- `/aws-certs/saa-c03/week2/day1` 의 canonical 이 자기 자신 URL.
- 같은 응답에 홈페이지를 가리키는 `hreflang` 링크가 존재하지 않음.
- `robots` 는 여전히 `noindex, nofollow`.
- 무료 week1 day 페이지의 기존 canonical/hreflang 이 회귀하지 않음.

## Step 2. 루트 canonical 상속 제거 및 미지정 라우트 보강

루트 레이아웃의 전역 `canonical: '/'` 는 canonical 을 명시하지 않은 모든 하위 라우트로 샌다.
현재 명시한 라우트는 `/`, `/en`, `/pricing`, `/privacy`, `/[category]`, `/[category]/[slug]`,
day 페이지뿐이다. `/checkout` 은 robots.txt 에 차단되어 있지 않은데 canonical 도 없어 홈을 상속한다.

구현: 루트 레이아웃에서 전역 `canonical` 상속을 걷어내고 홈 canonical 은 홈 페이지 쪽에서 명시한다.
공개 크롤 가능한 잔여 라우트에 자기참조 canonical 을 부여한다.

수용 기준:
- `/checkout` 응답의 canonical 이 홈이 아님.
- 홈(`/`) 응답의 canonical 은 여전히 `https://cert.juganlab.com`.
- canonical 미지정 공개 라우트 0건.

## Step 3. ko/en hreflang 상호 참조 정리

`/` 와 `/aws-certs` 가 둘 다 `en: /en` 을 주장하고 `/en` 은 `ko: /` 만 되받는다.
`/aws-certs` ↔ `/en` 이 상호 참조가 아니라 Google 이 hreflang 클러스터를 통째로 무시하고
ko/en 페이지가 서로 중복 경쟁한다.

구현: 언어 쌍을 1:1 로 확정한다. `src/lib/i18n.ts` 의 기존 규약을 따르고
`src/lib/i18n.test.ts` 를 확장한다. `x-default` 는 정확히 한 URL 만 지목해야 한다.

수용 기준:
- 모든 hreflang 선언이 양방향 상호 참조를 만족.
- `x-default` 가 정확히 한 URL 만 가리킴.
- 영어판이 없는 자격증에서 깨진 hreflang 이 생성되지 않음.

## Step 4. 구조화 데이터 보강 — BreadcrumbList + day 페이지 (신규)

감사에서 발견한 결함. day 페이지에 JSON-LD 가 하나도 없고 사이트 전역에 `BreadcrumbList` 가 없다.
색인 대상 142개의 대부분이 무료 day 페이지이므로, 정작 색인되기를 바라는 페이지에 구조화 데이터가
없는 상태다.

구현:
- 무료 day 페이지에 `Article`(또는 `LearningResource`) JSON-LD 추가 — `headline`, `description`,
  `inLanguage`, `datePublished`/`dateModified`(`getDayMtime` 재사용), `isPartOf` 로 Course 연결,
  `author`/`publisher` 는 기존 Organization 과 일치시킬 것.
- 유료 day 페이지에는 구조화 데이터를 넣지 않는다(noindex 대상에 붙이면 신호 낭비이고,
  페이월 콘텐츠를 무료로 선언하면 구조화 데이터 스팸 위험 — `[slug]/page.tsx:70-72` 주석의 판단을 승계).
- 카테고리 허브 / 자격증 허브 / day 페이지에 `BreadcrumbList` 추가.
- 기존 Course JSON-LD 와 `@id` 로 상호 연결해 그래프가 끊기지 않게 한다.

수용 기준:
- 무료 day 페이지 응답에 Article 계열 + BreadcrumbList JSON-LD 존재.
- 유료 day 페이지에는 신규 JSON-LD 가 없음.
- 생성된 JSON-LD 가 schema.org 필수 속성을 만족하고 JSON 파싱 오류 없음.
- 기존 Course/ItemList/Organization JSON-LD 회귀 없음.

## Step 5. 크롤 예산 회수 (architect 설계 판단으로 범위 축소됨)

### 폐기된 항목 — 허브 유료 주차 링크 축소

당초 계획했으나 **실효가 없어 폐기**한다. architect 조사 결과:

- `rel="nofollow"` 는 2020년부터 지시가 아니라 힌트다. 크롤을 막지 못한다.
- `<details>` 로 접어도 링크는 HTML 에 그대로 남아 크롤러가 본다.
- robots.txt 로 week2+ 를 차단하면 **역효과**다. 크롤을 막으면 Google 이 그 페이지의 `noindex` 를
  읽을 수 없어, 현재의 "noindex 제외" 상태가 "robots.txt 차단됐으나 색인됨"으로 악화된다.
- 로그인 여부로 렌더를 분기하면 허브가 이미 SSG 라 `cookies()` 호출이 500 을 낸다.
- 602건은 *이미 크롤된* URL 보고다. 링크를 지워도 알려진 URL 은 수개월간 재방문된다.
- 무료 week1/day5 의 next 링크가 week2/day1 을 가리켜 발견 경로도 끊기지 않는다.
- 총 ~1,000 URL 규모에서 크롤 속도를 제한하는 건 링크 그래프가 아니라 **호스트 응답시간**이다.

### GSC 수치 해석 (중요)

noindex URL 이 약 860개인데 "NOINDEX 태그에 의해 제외" 버킷은 4건뿐이다. 이는 Google 이 그
페이지들의 noindex 를 **처리하지 못하고 있다**는 뜻이고, 원인은 Step 1 이 고친 canonical 충돌이다.
즉 **Step 1 이 602건의 실질적 해결책**이며, Step 5 는 부수적 개선이다.

### 유효한 항목 — 무료 week1 정적 렌더 분리

`[week]/[day]` 라우트에 `generateStaticParams` 를 추가하면 과거 500 이 그대로 재현된다.
메커니즘이 Next.js 16.2.6 소스로 확정되었다:

`build/templates/app-page.js:350` 에서 `generateStaticParams` 존재 시 세그먼트 전체가 SSG 판정 →
`:357` 에서 목록에 없는 param 요청까지 `supportsDynamicResponse=false` →
`server/async-storage/work-store.js:33` 에서 `isStaticGeneration=true` →
`server/app-render/dynamic-rendering.js:238` 에서 `cookies()` 가 `DynamicServerError` throw →
`app-render.js:1991` 에서 500. 동적 렌더로 재시도하는 핸들러는 존재하지 않는다.
현재 `export const dynamic = 'force-dynamic'` 이 `dynamic-rendering.js:226` 의
`store.forceDynamic` 조기 return 으로 이 throw 를 막는 **유일한 방어**다.

따라서 리터럴 `week1` 세그먼트를 신설해 무료 경로에서 `cookies()` 를 코드 경로상 도달 불가로
만든다. `shared/lib/router/utils/sorted-routes.js:43-48` 에 따라 리터럴 세그먼트가 `[week]` 보다
항상 먼저 매칭되며 specificity 가 달라 라우트 충돌도 없다.

수용 기준:
- 무료 week1 day 페이지가 빌드 출력에서 SSG(`●`)로 표시되고 TTFB 가 0.51s 대비 유의미하게 개선.
- **유료 day 페이지가 Googlebot UA 포함 모든 요청에서 200** (500 회귀 없음), `noindex, nofollow` 유지.
- 유료 day 페이지가 Pro 로그인 쿠키로 요청 시 전체 본문 반환.
- 무료 day 의 canonical/hreflang/JSON-LD (Step 1~4 결과) 회귀 없음.
- 사이트맵의 week1 URL 집합이 `generateStaticParams()` 출력에 전부 포함.

## Step 6. 사이트맵 정합성 + 소프트 404 수정

### 소프트 404 (Step 5 작업 중 발견, 실측 확진)

존재하지 않는 모든 URL 이 **HTTP 200** 을 반환한다. 로컬 프로덕션 빌드에서 확인:

```
/aws-certs/nope/week1/day1        200
/aws-certs/nope/week2/day1        200
/aws-certs/saa-c03/week99/day1    200
/aws-certs/nonexistent-cert       200
/totally-bogus-path               200
```

원인: `src/app/loading.tsx` 가 존재해 앱 전역 스트리밍이 켜져 있고, `not-found.tsx` 는 어디에도 없다.
Next.js 문서(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`)에
"Next.js will return a 200 HTTP status code for streamed responses, and 404 for non-streamed responses"
라고 명시되어 있다. 따라서 코드 곳곳의 `notFound()` 호출이 전부 200 으로 나간다.

더 나쁜 건 응답 본문이다. 소프트 404 페이지가 홈페이지 title(`Cert Notes — AWS 자격증 · 클라우드
네이티브 학습`)과 전역 Organization/WebSite JSON-LD 를 그대로 싣고 나간다. Google 이 이를 홈의
중복으로 처리할 수 있다 — "중복 페이지, Google 에서 다른 표준 선택" 75건의 일부일 가능성이 있다.

구현: 최소한 `src/app/not-found.tsx` 를 만들고, 스트리밍 환경에서도 실제 404 상태코드가 나가도록
처리한다. `loading.tsx` 를 지우는 건 UX 후퇴이므로 다른 해법을 먼저 찾을 것.
`notFound()` 를 호출하는 모든 경로를 전수 조사해 일관되게 동작하는지 확인한다.

수용 기준(소프트 404):
- 위 5개 URL 이 전부 **404** 반환.
- 404 응답에 홈페이지 title 과 전역 JSON-LD 가 실리지 않음.
- 정상 URL(사이트맵 142개)은 여전히 200.
- `noindex` 가 404 페이지에 적용됨.

### 사이트맵 정합성

`/privacy` 가 사이트맵에 없다. 그리고 홈·카테고리·pricing·자격증 허브의 `lastModified` 가
`new Date()` 라서 매 빌드마다 갱신된다 — Google 이 lastmod 를 신뢰하지 않게 만드는 대표 패턴이다.
404 4건은 사이트맵 142개 전수 검사에서 재현되지 않아 GSC 에서 실제 URL 확인이 필요하다.

구현:
- 공개 정적 페이지 누락분을 사이트맵에 추가.
- 허브/홈의 `lastModified` 를 실제 콘텐츠 변경 시각에서 도출(예: 하위 day 파일 mtime 의 최대값,
  자격증 `meta.json` mtime)하도록 바꿔 빌드마다 흔들리지 않게 한다.
- GSC 404 4건 URL 확인 후 301 리다이렉트 또는 방치를 결정·문서화.

수용 기준:
- 사이트맵에 공개 정적 페이지 누락 0건.
- 동일 커밋을 두 번 빌드했을 때 사이트맵의 `lastmod` 값이 동일.
- 404 4건의 URL 과 처리 방침이 문서에 기록.
- 사이트맵 전 URL 이 여전히 200.

### Step 6 완료 기록 (실측 확인)

**소프트 404 — 진짜 원인(가설 재검증 결과)**

가설(`not-found.tsx` 만 만들면 된다)은 **틀렸다**. 실측 확인 순서:

1. `not-found.tsx` 만 추가하고 재빌드 → 5개 URL 전부 여전히 200. loading.md "Status Codes" 절의
   "스트리밍 시작 후엔 상태코드를 바꿀 수 없다"가 문자 그대로 적용됨을 실측으로 확인 — root
   `loading.tsx` 가 모든 라우트를 `<Suspense>` 로 감싸 놓아서, `params` 를 `await` 하는 순간(단
   1회의 `await` 만으로도) 그 세그먼트가 스트리밍 대상으로 확정되고 헤더가 200으로 먼저 나간다.
   `notFound()` 가 이후에 호출돼도 상태코드는 못 바꾼다.
2. 반면 **완전히 매칭되는 라우트가 없는** URL(`/aws-certs/saa-c03/bogus`, 3세그먼트 — 이 앱엔 3
   세그먼트 라우트가 없음)은 이미 진짜 404를 반환했다 — Next 가 이 경우는 빌드타임에 프리렌더한
   `_not-found` 를 그대로 내보내 스트리밍 자체가 발생하지 않기 때문. **핵심 발견**: 5개 타깃
   URL 은 전부 "라우트는 매칭되지만(동적 세그먼트) 콘텐츠가 없어 런타임에 `notFound()` 를 호출하는"
   케이스였다 — 이게 진짜 원인이다. `loading.tsx` 자체가 근본 원인이 아니라, "매칭된 동적 라우트의
   런타임 `notFound()`" 라는 Next.js 스트리밍 아키텍처의 구조적 한계가 원인.

**채택한 해법과 이유**

1. `src/proxy.ts` 에 콘텐츠 존재 검증(`src/lib/contentExists.ts`) 추가 — 렌더 시작 "전"(proxy
   단계)에 category/slug/week/day 존재 여부를 판정해, 없으면 라우트 매칭 자체가 안 되는 3세그먼트
   마커(`/__not-found__/__nf__/__nf__`)로 `NextResponse.rewrite()`. rewrite 는 브라우저 URL을
   바꾸지 않으면서 내부적으로 "라우트 없음" 경로를 타게 만들어 스트리밍이 시작되지 않고 진짜 404가
   나간다(위 3세그먼트 실측과 동일 메커니즘). day 존재 여부는 week1 한정으로 검증하지 않는다 —
   `week1/[day]/page.tsx` 의 `dynamicParams=true` 주석과 같은 이유(신규 day 콘텐츠가 재배포 전에도
   즉시 열람 가능해야 함). 매처를 `/aws-certs/:path*`, `/en/:path*` 로 좁혀 다른 정적 페이지
   (`/checkout`, `/opengraph-image` 등)와 절대 충돌하지 않게 했다(전수 확인 — 이 두 접두사 아래엔
   콘텐츠 라우트만 존재).
2. `[category]/page.tsx` 에 `dynamicParams = false` 추가(1세그먼트 잘못된 category, 예
   `/totally-bogus-path`) — category 는 코드 상수(`SUPPORTED_CATEGORIES`)라 콘텐츠 동기화만으로는
   늘지 않으므로 day 페이지와 달리 안전하게 잠글 수 있다. 1세그먼트는 proxy 매처로 다루면 `/public`
   정적 파일(`/google....html` 등)·`/opengraph-image` 등 다른 1세그먼트 라우트와 충돌 위험이 커서
   proxy 대신 이 방법을 택했다.
3. `next.config.ts` 에 `experimental.globalNotFound: true` + `src/app/global-not-found.tsx` 신설
   — 세그먼트 `not-found.tsx` 는 루트 레이아웃 하위에서 렌더되므로 `layout.tsx` 의 전역
   Organization/WebSite JSON-LD 를 피할 수 없다(실측: `not-found.tsx` 만 있을 때도 JSON-LD 2개
   그대로 노출). `global-not-found.tsx` 는 레이아웃을 아예 거치지 않는 새 Next 16 기능이라 이
   문제를 구조적으로 없앤다. rewrite 로 만든 3세그먼트 마커는 "완전히 매칭되는 라우트가 없는" 케이스
   그대로라 global-not-found 가 정확히 이 경로를 받는다(실측 확인).
4. `src/app/not-found.tsx` 도 유지 — proxy 검사를 안 거치는 다른 `notFound()` 호출(현재 4곳:
   `[category]/[slug]/page.tsx`, `[category]/[slug]/[week]/[day]/page.tsx`,
   `[category]/[slug]/week1/[day]/page.tsx`, `[category]/page.tsx`)에 대한 방어선. 이 경로들은
   여전히 200으로 나갈 수 있지만(레이아웃 JSON-LD 는 안 붙더라도) 최소한 브랜드에 맞는 UI 를 보여준다.

**`loading.tsx` 를 건드렸는가 — 아니오.** 원본 그대로다. proxy 사전 차단 + `dynamicParams=false`
+ `global-not-found` 조합으로 스트리밍 자체를 애초에 발생시키지 않는 방식으로 해결했다.

**실측 검증 결과(전부 통과)**

- 소프트 404 URL 5개: 전부 **404**.
- 404 응답 본문: 홈 title 없음(커스텀 "페이지를 찾을 수 없음 | Cert Notes"), JSON-LD **0개**,
  `noindex` 메타 태그 존재.
- 사이트맵 143개 URL(privacy 추가 후) 전부 **200**.
- `/privacy` 사이트맵 포함 확인, 200.
- 동일 커밋 2회 `npm run build` 후 `sitemap.xml` 바이트 단위 `diff` 결과 **0**(완전 동일).
- Step 1~5 회귀 없음(실측): `/aws-certs/saa-c03/week1/day1` canonical 자기참조 + ko/en hreflang
  + `["LearningResource","Article"]`/`BreadcrumbList`/`Course` JSON-LD 정상. `/aws-certs/saa-c03/
  week2/day1` `noindex, nofollow` + canonical 자기참조 + hreflang 0개 정상. Googlebot UA로 유료
  day 페이지 200 확인. 빌드 출력에서 `week1/[day]` 는 여전히 `●`(SSG).

**사이트맵 lastmod 결정성 구현**: 실제 콘텐츠 변경 시각(파일 mtime)에서 도출한다.
- day 페이지: 기존 `getDayMtime`(변경 없음).
- 자격증 허브: 신설 `getCertMetaMtime`(`meta.json` mtime).
- 카테고리 허브(`/aws-certs`, `/en`): 산하 전 자격증 `meta.json` mtime 중 최댓값.
- 홈: 카테고리 허브와 동일 로직 + `src/app/page.tsx` 자체 mtime 중 최댓값.
- pricing/privacy(콘텐츠 디렉터리 대응 파일 없는 순수 정적 페이지): 신설
  `getSourceFileMtime`(`src/lib/fileMtime.ts`)로 해당 페이지의 실제 소스 파일(`page.tsx` 또는
  본문이 있는 `PrivacyContent.tsx`) mtime 사용. mtime 조회 실패 시(극히 예외적) `new Date()`
  대신 고정 상수(`2025-01-01T00:00:00Z`)로 폴백해 어떤 경우에도 결정성을 깨지 않는다.

**사이트맵에 추가한 URL**: `/privacy` (1건). 다른 공개 정적 페이지(`/`, `/aws-certs`, `/en`,
`/pricing`, 자격증 허브, 무료 day)는 이미 포함돼 있었다. `/checkout` 은 의도적으로 미포함 —
비로그인 시 `/login` 으로 redirect 되는 인증 필수 페이지라 색인 대상 콘텐츠가 아니다(robots.txt
로는 차단하지 않음 — Step 2 에서 이미 자기참조 canonical 부여, sitemap 제출 대상은 아님).

### Step 6 후속 수정 — 프로덕션 사이트맵 lastmod 무력화 (2026-07-28)

**증상(배포본 실측)**: 사이트맵 143개 URL 전부 `lastmod`가 배포 시각(`2026-07-28T07:27`)로
동일하게 찍혔다. "매 빌드마다 lastmod가 바뀌어 Google이 신호를 불신한다"는 원래 문제가
그대로 재현된 상태.

**근본 원인**: git은 파일 mtime을 보존하지 않는다. Vercel이 체크아웃하면 모든 파일의 mtime이
체크아웃(=빌드) 시각으로 리셋되고, `getDayMtime`/`getCertMetaMtime`/`getSourceFileMtime`이
`fs.stat`으로 그 mtime을 읽어 결국 빌드 시각이 나왔다. 로컬 검증("같은 커밋 2회 빌드 diff")은
로컬이 mtime을 유지하므로 이 문제를 못 잡았다 — git 체크아웃 환경을 시뮬레이션하지 않은 것이
검증 공백이었다.

**해법(A안 — 커밋되는 콘텐츠 매니페스트)**: 파일별 마지막 변경 시각을 `git log`(전체 커밋
히스토리 보유한 로컬에서만 신뢰 가능)로 미리 뽑아 `src/data/content-manifest.json`으로
git에 커밋하고, 런타임은 파일시스템 대신 이 매니페스트를 읽는다. 빌드 환경의 mtime과
완전히 무관해진다.

- `scripts/build-content-manifest.mjs`(신규): `git log --format=%H %cI --name-only`를
  **1회**만 호출해(1346개 대상 파일 전체를 훑어도 156ms) 파일→최신 커밋 시각 맵을 만든다.
  git 히스토리가 없는 파일(신규/미커밋)만 `fs.stat` 폴백 + 경고 로그. 결정론적 직렬화(키
  정렬, `generatedAt` 같은 휘발성 필드 없음)로 재생성해도 데이터가 그대로면 바이트 단위로
  동일한 파일이 나온다(실측 확인).
- `src/lib/contentManifest.ts`(신규): 매니페스트를 읽는 단일 출처. 매니페스트가 없거나
  해당 경로가 없으면 `undefined`를 반환한다 — **가짜 날짜(`new Date()`, 고정 폴백 상수)를
  대신 반환하지 않는다.** 기존 `FALLBACK_LASTMOD = new Date('2025-01-01...')`도 "틀린 날짜를
  내보낸다"는 점에서 같은 안티패턴이라 완전히 제거했다.
- `src/lib/content.ts`(`getDayMtime`/`getCertMetaMtime`)와 `src/lib/fileMtime.ts`
  (`getSourceFileMtime`)는 함수 시그니처를 유지한 채 내부 구현만 매니페스트 조회로 교체했다
  — `getDayMtime`은 day 페이지 Article JSON-LD의 `dateModified`에도 쓰이는 렌더 경로 함수라
  (`src/lib/day/structuredData.ts`), 삭제하지 않고 데이터 소스만 고쳐 두 사용처(사이트맵 +
  구조화 데이터) 모두 한 번에 바로잡았다.
- `src/app/sitemap.ts`: `maxMtime`이 값이 없으면 `undefined`를 반환하도록 바꾸고, 각 엔트리를
  `lastModified`가 있을 때만 그 키를 포함하도록 조건부 생성(`sitemapEntry` 헬퍼)했다 —
  `MetadataRoute.Sitemap`의 `lastModified`는 선택 필드라 생략이 유효하다.
- **`prebuild`에 넣지 않았다.** Vercel은 얕은 클론이라 빌드 중엔 `git log`로 파일별 히스토리를
  못 구한다. 매니페스트는 로컬에서 `npm run content:manifest`로 명시적으로 갱신하고 커밋하는
  산출물이다. `scripts/sync-content.mjs`에도 자동으로 붙이지 않았다 — sync 스크립트는 콘텐츠를
  git에 커밋하기 **전**에 실행되므로, 그 시점엔 방금 만들 커밋의 시각을 아직 알 수 없다
  (닭과 달걀 문제). 대신 `RECIPE.md`의 콘텐츠 배포 절차에 "콘텐츠 커밋 → `content:manifest`
  → 매니페스트 커밋" 순서를 문서화했다.

**핵심 검증 — Vercel 체크아웃 시뮬레이션(실측)**:
1. `npm run build` → `/sitemap.xml` 저장(143 URL, lastmod 5종 고유값 — `1.` 값 그대로).
2. `find content src -type f -exec touch {} +`로 전체 파일 mtime을 현재 시각으로 리셋
   (git 체크아웃이 하는 일과 동일).
3. 재빌드 → `/sitemap.xml` 재저장.
4. `diff` 결과: **완전히 동일(바이트 단위 0 diff)**. mtime 리셋 전후로 사이트맵이 전혀
   흔들리지 않음을 확인 — 매니페스트가 fs mtime을 완전히 대체했다는 직접 증거.

**그 외 검증(전부 통과)**:
- 사이트맵 143개 URL 전수 200.
- lastmod 고유값 5개(전부 동일하지 않음 — 실제 콘텐츠 변경 시점 5개 커밋 날짜에 대응).
- `node scripts/verify-seo.mjs http://localhost:3124`: **26/26 통과**(Step1~6 회귀 없음).
- 매니페스트 파일(`src/data/content-manifest.json`)을 일시적으로 지우고 재빌드 → 143개 URL
  전부 `<lastmod>` 태그 자체가 없음(0개) 확인 — 가짜 값 유출 없이 안전하게 생략됨. 확인 후
  매니페스트 복구(재생성 결과가 백업과 바이트 단위로 동일함을 diff로 재확인).

**회귀 테스트(신규 9개)**:
- `src/lib/contentManifest.test.ts`(6개) — 매니페스트 존재/부재/손상/경로 미스매치/Windows
  경로 구분자 정규화/모듈 캐시(1회 로드) 단위 검증.
- `src/app/sitemap.manifest-absence.test.ts`(1개) — `@/lib/contentManifest`를 목킹해
  매니페스트 부재 시 143개 엔트리 전부 `lastModified` 키 자체가 없음을 통합 검증(별도 파일
  — `vi.mock` 파일 단위 호이스팅이 `sitemap.test.ts`의 정상 경로 테스트를 오염시키지
  않도록 격리).
- `src/app/sitemap.test.ts`(기존에 2개 추가) — day/홈 `lastModified`가 매니페스트 값과
  정확히 일치하는지 검증.

`npx tsc --noEmit`: 0 오류. `npm test`: **242/242 통과**(기존 233 + 신규 9).

**예상과 달랐던 점**: `getDayMtime`이 사이트맵뿐 아니라 day 페이지 Article JSON-LD의
`dateModified`에도 쓰이고 있어(`src/lib/day/structuredData.ts`), 이번 사고가 사이트맵만이
아니라 **day 페이지 구조화 데이터의 `dateModified`도 똑같이 프로덕션에서 빌드 시각으로
뭉개지고 있었다**는 뜻이었다. 사용자가 측정한 건 사이트맵뿐이었지만 함수를 공유 구조로
고치면서 이 렌더 경로 버그도 함께 해결됐다(별도 이슈로 보고하지 않고 이번 수정에 포함).

**GSC 에서 확인해야 할 항목(코드로 해결 불가)**

- "찾을 수 없음(404)" 4건: 사이트맵 143개 URL 전수 curl 검사에서 재현되지 않는다 — 사이트맵 밖의
  URL(과거 링크, 외부 백링크, 오타 URL 등)로 추정된다. GSC 콘솔 > 색인 생성 > 페이지 > "찾을 수
  없음(404)" 목록에서 실제 URL 을 확인하고, 오타/구조 변경으로 실존했던 URL 이면 301 리다이렉트,
  그 외엔 방치(정상적인 404) 여부를 결정해야 한다.
- **6-A 를 고친 뒤 이 수치가 바뀔 수 있다**: 이번 수정 전에는 소프트 404(200 + noindex)였던 URL
  들이 이제 진짜 404 를 반환한다. Google 이 이 URL 들을 재크롤하면 "크롤링됨 - 현재 색인이 생성되지
  않음"(602건) 이나 "중복 페이지"(75건) 버킷에서 "찾을 수 없음(404)" 버킷으로 옮겨갈 수 있다 —
  이는 예상된 정상 동작이다(소프트 404가 진짜 404로 정직해진 것). GSC 404 카운트가 일시적으로
  올라가도 회귀가 아니다.

**추가한 회귀 테스트**
- `src/lib/contentExists.test.ts`(10개) — 존재 검증 로직 단위 테스트(1/2/4세그먼트, week1 day
  미검증 특례, 유효/무효 week 등).
- `src/app/sitemap.test.ts`(6개) — `/privacy` 포함, robots.txt 차단 라우트 미포함, Week2+ 제외,
  **2회 호출 lastModified 동일(결정성)**, `new Date()` 미사용(모든 값이 "지금" 이전) 검증.
- `src/app/[category]/page.test.ts`(2개) — `dynamicParams=false` 가드 + `generateStaticParams`
  가 `SUPPORTED_CATEGORIES` 전부 포함하는지 검증.
- `e2e/not-found.spec.ts` — 5개 소프트 404 URL 의 실제 HTTP 404, 홈 title 미노출, JSON-LD 0개,
  noindex, 정상 URL 회귀 없음을 Playwright 로 검증(로컬엔 `certnote_dev` DB 가 없어 이번 세션에선
  실행하지 못했다 — `e2e/global-setup.ts` 가 DB 시드를 요구한다. CI/DB 있는 환경에서 `npm run
  test:e2e` 로 실행 필요).

`npx tsc --noEmit`: 0 오류. `npm test`: **230/230 통과**(기존 212 + 신규 18).

**알려진 잔여 갭(이번 범위 밖, 투명하게 기록)**: `/aws-certs`·`/en` 접두가 아닌 임의의 2세그먼트
경로(예: `/foo/bar`, `/foo/bar/week1/day1`)는 여전히 소프트 404(200)다. `[category]/[slug]/
page.tsx`(2세그먼트)에도 `dynamicParams=false`를 걸면 이 케이스까지 막을 수 있지만, 자격증 slug는
`scripts/sync-content.mjs`로 콘텐츠 레포에서 동기화되는 데이터라 day 콘텐츠와 동일한 "재배포 전
갱신" 가능성을 배제할 근거가 부족해 이번엔 건드리지 않았다(week1/[day]의 `dynamicParams=true`
결정과 같은 원칙 적용). proxy 매처를 2/4세그먼트 전체로 넓히는 대안은 `/account/subscription`
(2세그먼트)·`/api/auth/google/callback`(4세그먼트) 같은 실제 라우트와 충돌해 실측으로 기각했다
(`getCertMeta('account','subscription')`가 throw → 오탐 404). 이번 5개 필수 타깃 URL은 전부
`aws-certs`/`en` 접두이거나 순수 1세그먼트라 이 갭의 영향을 받지 않는다. 필요하면 별도 이슈로
`[category]/[slug]/page.tsx`의 콘텐츠 동기화 방식을 확인한 뒤 처리 방침을 정할 것.

## Step 7. 메타데이터·구조화 데이터 회귀 테스트

canonical/robots/hreflang/JSON-LD 는 화면에 보이지 않아 조용히 회귀한다. 이번 사고 자체가 그렇게 났다.

구현: 대표 URL 집합(홈, 카테고리 허브, 자격증 허브, 무료 day, 유료 day, en day, `/checkout`)에 대해
렌더된 메타 태그와 JSON-LD 를 검증하는 테스트를 추가한다. 단위 레벨은 `generateMetadata` 직접 호출,
E2E 레벨은 `e2e/` 의 Playwright 로 응답 HTML 을 검사한다.

수용 기준:
- 유료 day 가 홈 canonical 을 상속하면 실패하는 테스트가 존재.
- hreflang 상호 참조 위반을 잡는 테스트가 존재.
- day 페이지 JSON-LD 누락을 잡는 테스트가 존재.
- `npm test` 전체 통과.

### Step 7 완료 기록 (실측 확인)

**7-A-1. `/foo/bar`류 소프트 404 — 고쳤다.**

`scripts/sync-content.mjs`를 조사한 결과, 자격증 slug 목록(`CERTS` 배열)은 코드에 하드코딩돼
있고, 콘텐츠 배포는 항상 `sync-content.mjs 실행 → git add content/ → git commit → git push →
Vercel 자동 재빌드`(RECIPE.md/PROGRESS.md에 명시된 유일한 절차) 순서를 따른다. 즉
`content/<category>/index.json`은 git에 커밋되며, "이 빌드가 서빙하는 content/"와 "이
빌드의 `generateStaticParams`가 읽은 content/"가 항상 동일한 스냅샷이다 — day 콘텐츠
(week1/[day]가 `dynamicParams=true`인 이유)와 달리 자격증 slug가 재배포 없이 갱신될 별도
경로가 없다. 따라서 `[category]/[slug]/page.tsx`에 `dynamicParams=false`를 걸어도 "존재하는데
404" 케이스가 생길 수 없다고 판단해 적용했다.

구현 시 실측으로 발견한 위험: 이 라우트의 `generateStaticParams`가 원래 `DEFAULT_CATEGORY`
(aws-certs)만 순회하고 `EN_CATEGORY`(en)를 빠뜨리고 있었다 — `/en/<slug>` 자격증 허브는
`src/app/en/page.tsx`(정적, `/en` 자체만 처리)가 아니라 이 동적 라우트가 서빙하는데, en을
빠뜨린 채 `dynamicParams=false`만 걸었다면 `/en/saa-c03` 등 실제 콘텐츠 11종이 즉시 404가
났을 것이다(로컬 빌드로 재현 후 발견 — 배포 전에 잡음). `SUPPORTED_CATEGORIES` 전체를
순회하도록 고친 뒤 `dynamicParams=false`를 적용했다.

실측 결과: `/foo/bar`, `/blog/hello` 모두 진짜 404. `/en/saa-c03`, `/en/saa-c03/week1/day1`
회귀 없이 200. 빌드 출력에서 `[category]/[slug]`가 `●`(SSG, 23개 경로 = aws-certs 12 + en 11).

**7-A-2. 404 페이지 robots 메타 중복 — 원인 규명 후 고쳤다.**

원인은 우리 코드가 아니라 Next.js 16.2.6 자체의 `NonIndex` 컴포넌트(
`node_modules/next/dist/server/app-render/app-render.js`)였다: statusCode가 400을 넘는 모든
응답에 `<meta name="robots" content="noindex"/>`를 **항상 자동으로** 주입한다(우리
metadata.robots 설정과 무관). `global-not-found.tsx`/`not-found.tsx`가 각자
`robots: { index: false, follow: false }`를 또 선언해 "noindex"(Next 자동) +
"noindex, nofollow"(우리 선언) 두 개가 동시에 나갔다. 두 파일에서 `robots` 필드 선언을
제거해 Next의 자동 주입 하나만 남겼다(실측: `/aws-certs/nope/week1/day1` robots 메타 1개로
축소, content="noindex").

**7-B. 회귀 테스트 마감**

*현재 SEO 관련 테스트 전수(리팩터 후, vitest 26개 파일 중 SEO 관련 12개 파일)*:
`src/app/page.test.ts`(홈 canonical/hreflang, layout 전역 alternates 부재),
`src/app/checkout/page.test.ts`(자기참조 canonical), `src/app/hreflang.test.ts`(최상위·자격증
허브·day 페이지 상호 hreflang, x-default 유일성), `src/app/[category]/page.test.ts`
(dynamicParams 가드), `src/app/[category]/[slug]/page.test.ts`(신규 — dynamicParams 가드 +
ko/en 양쪽 slug 포함), `src/app/[category]/[slug]/[week]/[day]/page.test.ts`(유료/무료 주차
canonical·robots·hreflang), `.../structuredData.test.ts`(day Article/BreadcrumbList 생성·계층·
그래프 연결·JSON 라운드트립), `src/app/[category]/[slug]/week1/[day]/page.test.ts`
(FREE_WEEK↔week1 폴더명 결합, 사이트맵 포함 관계), `src/app/sitemap.test.ts`(포함 누락·차단
라우트 제외·Week2+ 제외·lastModified 결정성), `src/lib/structuredData.test.ts`(JSON-LD 빌더
단위 — XSS 이스케이프·Organization/WebSite·Course·BreadcrumbList·Article 각 필드),
`src/lib/i18n.test.ts`(언어 판정·hreflangPair 상호참조), `src/lib/contentExists.test.ts`
(proxy 콘텐츠 존재 판정 로직).

*발견한 갭과 처리*: 위 vitest 테스트는 전부 `generateMetadata`/빌더 함수를 직접 호출하는
단위 테스트라, Next의 실제 라우팅·프록시·스트리밍·**Next 자체가 주입하는 자동 메타**(7-A-2가
바로 이 경우)는 원천적으로 검증 범위 밖이다. 사이트맵 URL 전수가 실제로 200인지, 404 응답의
robots 메타가 정말 1개인지는 실제 HTTP 레벨 검증 없이는 잡을 수 없는 회귀였다(이번 세션에서
실제로 이 방식으로만 7-A-2를 발견했다). 이 갭을 메우려고 `e2e/seo-smoke.spec.ts`를 신설했다.

*`src/app/page.test.ts`의 grep 방식 재검토*: `layout.tsx`가 `next/font/google`을 로드해
vitest(node 환경)에서 직접 import하면 폰트 로더가 실패해 소스 텍스트 grep으로 우회하고 있다.
대안(예: `next/font/google`을 목킹해 정식 import)도 가능하지만, 그러면 폰트 모듈 목킹 자체가
또 다른 실제와 다른 환경을 만들어 "레이아웃이 실제로 alternates를 안 내보내는지"는 여전히
간접 검증이 된다 — 오히려 e2e(`e2e/seo-smoke.spec.ts`의 홈 canonical/hreflang 테스트)가 이
사각지대의 실질 검증을 담당하므로, grep 테스트는 "소스에 alternates 키가 재도입되지 않았는가"
라는 좁은 회귀 가드로 남겨두고 그대로 유지했다.

*E2E DB 분리 — 성공*. `e2e/global-setup.ts`(certnote_dev DB 시드)는 `playwright.config.ts`의
`globalSetup`이라 `--project`로 좁혀도 우회할 수 없다(프로젝트 필터와 무관하게 항상 먼저
실행). `playwright.seo.config.ts`를 신설해 `globalSetup` 자체를 선언하지 않고
`e2e/seo-smoke.spec.ts`만 실행하도록 분리했다(`npm run test:e2e:seo`). 기존
`e2e/not-found.spec.ts`(Step6에서 추가, DB 요구로 이번 세션 전엔 실행 못 함)는
`seo-smoke.spec.ts`가 완전히 상위집합으로 흡수해(같은 URL + robots 메타 중복 가드 +
JSON-LD 개수까지 추가 검증) 제거했다(중복 통합). `playwright.config.ts`에는
`testIgnore: /seo-smoke\.spec\.ts/`를 추가해 DB 의존 스위트와 중복 실행되지 않게 했다.

실제 실행 결과(`npm run build`로 만든 프로덕션 빌드 + `npx playwright test
--config=playwright.seo.config.ts`, DB 없이): **11/11 통과**, 38.3s. 검증 항목: 홈
canonical/hreflang 부재, `/aws-certs`↔`/en` hreflang 완전 동일, 무료 day
canonical/hreflang/robots 부재/JSON-LD 3개(Organization+WebSite+Article+BreadcrumbList
타입 포함), 유료 day canonical/`noindex, nofollow`/hreflang 0개/JSON-LD 1개(전역만),
존재하지 않는 URL 404 + robots 메타 1개 + JSON-LD 0개, `/foo/bar` 404, 사이트맵 143개 URL
전수 200(APIRequestContext로 병렬 조회 — 최초엔 `page.goto` 143회 순회로 30s 타임아웃을
넘겨 실패했고, API 요청 방식으로 바꿔 8.9s로 해결).

`npx tsc --noEmit`: 0 오류. `npm test`: **233/233 통과**(기존 230 + 신규 3,
`[category]/[slug]/page.test.ts`).

## Step 8. 배포 후 검증 및 재제출

### 검증 도구 (준비 완료)

`scripts/verify-seo.mjs` — Step 1~6 의 수용 기준 26개를 배포본에 직접 쳐서 검증한다.
실패가 하나라도 있으면 exit 1 이라 CI 게이트로도 쓸 수 있다.

```bash
npm run verify:seo                                  # 프로덕션(cert.juganlab.com)
node scripts/verify-seo.mjs https://staging.url     # 다른 호스트
```

로컬 프로덕션 빌드 기준으로 **26/26 통과**를 확인해 둔 상태다. 배포 후 같은 명령을 다시 돌려
CDN·리다이렉트·프록시가 끼어들어도 결과가 같은지 확인한다.

E2E 스모크(`e2e/seo-smoke.spec.ts`)는 DB 없이 돌아간다:

```bash
npm run test:e2e:seo        # 빌드 후 실행
npm run test:e2e:seo:only   # 빌드 생략
```

### 배포 순서

1. `npm run build` 성공 확인.
2. `npm test` (233개) 통과 확인.
3. `npm run test:e2e:seo` 통과 확인.
4. 배포.
5. `npm run verify:seo` 로 배포본 검증 — **26/26 이 아니면 롤백 검토.**

### 배포 후 콘솔 작업 (코드로 자동화 불가)

- **GSC**: 사이트맵 재제출. `/aws-certs/saa-c03/week2/day1`(유료)과
  `/aws-certs/saa-c03/week1/day1`(무료)를 URL 검사에서 "라이브 URL 테스트" 후 색인 생성 요청.
- **GSC 404 4건**: 실제 URL 을 확인한다. Step 6 에서 소프트 404 를 진짜 404 로 바꿨으므로
  이 수치가 늘어날 수 있는데, 이는 **정상이고 개선**이다(가짜 200 이 정직한 404 로 바뀐 것).
- **네이버 서치어드바이저**: 사이트맵 재제출.

### 4~8주 관찰 지표 (즉시 판정 금지)

- **"NOINDEX 태그에 의해 제외" 4 → 수백 단위 증가.** 이게 Step 1 이 작동했다는 가장 직접적인 증거다.
  noindex URL 이 860개인데 지금 버킷에 4건뿐인 건 Google 이 canonical 충돌 때문에 noindex 를
  처리하지 못하고 있다는 뜻이었다.
- **"크롤링됨 - 현재 색인이 생성되지 않음" 602 감소.** 위 수치가 오르면서 이쪽이 내려가야 정상이다.
- **"중복 페이지, Google 에서 다른 표준 선택" 75 감소.** Step 1(canonical 누수) + Step 6(소프트 404)의 효과.
- **크롤링 통계의 평균 응답시간 하락.** Step 5(무료 day SSG 115개 프리렌더)의 직접 효과.

### 남은 과제 (이번 범위 밖)

- **B안**: 페이월 콘텐츠 색인 전환(미리보기 분량 확대 + day 페이지 `isAccessibleForFree` 구조화 데이터).
  콘텐츠 노출 정책 변경이라 사업 판단이 필요하다. 위 관찰 지표가 안정된 뒤 검토.
- **홈/`/aws-certs` 역할 분리**: 홈 2,953자 / 허브 2,118자로 둘 다 얇고 자격증 12종을 함께 나열해
  역할이 겹친다. 카피 재작성이라 코드 작업이 아니다.
- **`e2e/` 본 스위트**: `certnote_dev` DB 시드를 요구해 로컬에서 미실행. CI 환경에서 확인 필요.
