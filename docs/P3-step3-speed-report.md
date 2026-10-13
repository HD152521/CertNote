# P3 Step 3 — 홈·허브 응답 속도와 본문 HTML 크기

작성일: 2026-10-14 · 브랜치 `feat/p3-adsense-readiness` · Next.js 16.2.6 (Turbopack)

상위 계획: `docs/P3-adsense-readiness-plan.md` Step 3. 직전 단계: `docs/P3-step1-day-cache-design.md`.

표기: **[실측]** 은 이 문서를 쓰며 직접 잰 값, **[문서]** 는 `node_modules/next/dist/docs/` 근거,
**[미검증]** 은 확인하지 못한 것이다. 로컬은 Windows 11, `npm run build && npx next start -p 3921`.

## 결론

| | 변경 전 | 변경 후 |
|---|---|---|
| 홈 렌더 방식 | 요청마다 렌더(`ƒ`, `Cache-Control: no-store`) | 정적 프리렌더(`○`, `x-nextjs-cache: HIT`) |
| 홈 HTML | 344KB (gzip 65KB) | 191KB (gzip 51KB) |
| 모든 페이지 HTML | 사이드바 트리 269KB 포함 | 트리 116KB (−152KB) |

1. 홈이 느렸던 원인은 `src/app/page.tsx` 의 `getCurrentUser()`(`cookies()`) 한 줄이다. 홈 전체가
   동적 라우트가 되어 캐시가 없었고, 운영에서는 함수 콜드 스타트가 그대로 첫 응답에 실렸다.
2. HTML 이 컸던 원인은 `AppShell` 이 넘기는 사이드바 트리다. day 1,377개가 `DayRef` 객체 그대로
   RSC 페이로드에 실려 모든 페이지에서 269KB 를 차지했다(홈 HTML 의 78%).
3. `/aws`, `/aws/saa-c03` 은 원래 정적 캐시였다. 응답 속도는 바뀐 것이 없고 HTML 만 줄었다.

## 1. 첫 응답 시간 (TTFB)

`curl -s -o /dev/null -w "%{time_starttransfer}"`, 연속 6회, 단위 초 [실측].

### 운영 (변경 전, https://cert.juganlab.com)

| URL | 1 | 2 | 3 | 4 | 5 | 6 | 헤더 |
|---|---|---|---|---|---|---|---|
| `/` | **4.115** | 0.539 | 0.203 | 0.344 | 0.217 | 0.191 | `Cache-Control: private, no-cache, no-store`, `X-Vercel-Cache: MISS` |
| `/aws` | 1.678 | 0.186 | 0.196 | 0.205 | 0.203 | 0.182 | `X-Vercel-Cache: HIT` |
| `/aws/saa-c03` | 0.188 | 0.214 | 0.256 | 0.197 | 0.183 | 0.176 | `X-Vercel-Cache: HIT` |

- 홈 3.3초(계획서 측정값)는 평소 수치가 아니라 **함수가 식었을 때의 첫 응답**이다. 이번에도 첫 요청이
  4.1초였고, 데워진 뒤에는 0.2~0.5초다. 홈은 캐시가 없어서 함수가 식을 때마다 이 지연이 방문자에게 간다.
- `/aws` 의 첫 요청 1.7초는 원인을 확인하지 못했다 [미검증: 캐시 HIT 응답이라 함수 실행은 아니다.
  측정 지점 DNS·TLS 또는 해당 엣지의 첫 조회로 추정]. 이후 5회는 0.2초다.

### 로컬 `next start`

| URL | 변경 전 (6회) | 변경 후 (6회) |
|---|---|---|
| `/` | **1.026**, 0.034, 0.023, 0.026, 0.036, 0.017 | 0.037, 0.011, 0.010, 0.009, 0.008, 0.012 |
| `/aws` | 0.051, 0.011, 0.029, 0.012, 0.011, 0.013 | 0.047, 0.013, 0.010, 0.013, 0.010, 0.012 |
| `/aws/saa-c03` | 0.034, 0.010, 0.010, 0.009, 0.008, 0.009 | 0.037, 0.011, 0.011, 0.009, 0.007, 0.012 |

| URL | 변경 전 헤더 | 변경 후 헤더 |
|---|---|---|
| `/` | `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` | `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=31536000` |
| `/aws`, `/aws/saa-c03` | `x-nextjs-cache: HIT` | 동일 |

홈의 첫 요청이 1.03초 → 0.04초가 됐다. 변경 전 1.03초는 서버 프로세스가 홈을 처음 렌더한 시간이고,
변경 후에는 빌드 때 만든 HTML 을 그대로 내보낸다. 운영 수치는 배포 뒤에 다시 재야 한다 [미검증].

## 2. 본문 HTML 크기

`curl -s <URL> | wc -c`, gzip 은 `gzip -c | wc -c` [실측, 로컬]. 운영의 변경 전 크기는 로컬과 같다
(홈 344,174 / `/aws` 338,102 / `/aws/saa-c03` 464,912바이트).

| URL | 변경 전 | 변경 후 | 차이 | gzip 전 → 후 |
|---|---|---|---|---|
| `/` | 344,168 | 191,460 | −44% | 64,635 → 50,973 |
| `/aws` | 338,102 | 185,703 | −45% | 63,507 → 49,912 |
| `/aws/saa-c03` | 464,869 | 312,470 | −33% | 77,818 → 63,564 |
| `/aws/saa-c03/week1/day1` | 439,643 | 287,244 | −35% | 91,407 → 77,613 |
| `/aws/saa-c03/week2/day1` | 448,378 | 295,979 | −34% | 91,932 → 77,201 |

사이트맵 846개 URL 의 변경 후 HTML 중앙값은 293KB, 최대 510KB 다 [실측].

### 구성 (변경 전 홈, 344KB)

| 구성 | 바이트 | 비고 |
|---|---|---|
| RSC 페이로드(인라인 `__next_f` 스크립트) | 314,106 | 그중 **사이드바 day 객체 1,377개가 268,605** |
| 실제 마크업 | 24,754 | `<aside>` 는 1,349 |
| JSON-LD | 2,686 | |
| 그 밖의 인라인·외부 스크립트 태그 | 2,622 | |

- 트리는 `Header`(→`MobileNav`)와 `Sidebar` 두 곳으로 넘어가지만 페이로드에는 **한 번만** 실린다.
  React 가 같은 객체 참조를 중복 제거한다. "두 번 전달이 원인" 이라는 가설은 틀렸다.
- 사이드바가 실제로 그리는 마크업은 작다. 접힌 자격증의 day 는 HTML 로 나오지 않는다. 용량은 전부
  "클라이언트 컴포넌트에 props 로 넘긴 데이터" 에서 나왔다.
- day 하나가 약 195바이트였다. `category`·`slug`·`href` 가 day 마다 반복됐고, 제목만 합치면 107KB 다.

### 고친 방법

`DayRef[]` 대신 `[주차, [[day, 제목], …]]` 튜플로 넘긴다(`src/lib/navTree.ts`). `href` 는 클라이언트에서
`/섹션/slug/weekN/dayM` 으로 복원한다. 메타도 사이드바가 쓰는 5개 필드만 남겼다.

- 트리 269KB → 116KB. 남은 116KB 의 대부분은 제목 문자열(107KB)이다.
- 서버가 내보내는 마크업은 바뀌지 않았다. 스크립트·에셋 경로를 뺀 HTML 이 `/aws`, `/aws/saa-c03`,
  week1 day 에서 변경 전과 바이트 단위로 같다 [실측]. 홈과 week2 day 는 Sentry trace 메타만 다르다
  (요청마다 달라지는 값).

### 더 줄이지 않은 이유

제목 107KB 를 없애려면 트리를 지연 로드해야 한다(자격증을 펼칠 때 받아오기). 그러면 홈 HTML 이
약 75KB 까지 내려가지만, 지금은 서버 HTML 에 들어 있는 "현재 자격증의 전체 day 링크" 가 빠진다.

- 루트 레이아웃은 현재 경로를 알 수 없다(`cookies()`/`headers()` 금지, 레이아웃은 pathname 을 받지
  않는다). "현재 자격증 트리만 서버에서 싣기" 는 parallel route 로 사이드바를 옮겨야 가능하다.
- 지연 로드로 가면 day·허브 페이지의 원본 HTML 에서 형제 day 내부 링크 약 60개가 사라지고, 데스크탑에서
  사이드바가 하이드레이션 뒤에 채워지며 밀린다.

색인 문제를 고치는 중이라 내부 링크가 줄어드는 변경은 넣지 않았다. 결정이 필요하다.

## 3. 홈을 정적으로 바꾼 방법

```
요청 /  ──► proxy ──┬─ 세션 쿠키 없음/무효 ──► 정적 홈(src/app/page.tsx, 캐시 HIT)
                    └─ JWT 서명·만료 통과 ──► rewrite /home(src/app/home/page.tsx, 동적)
```

- `src/app/page.tsx` 는 랜딩만 그린다. 쿠키·세션·DB 를 읽지 않는다.
- 로그인 사용자의 학습 홈(이어 읽기 카드, 시험일 안내, 자격증 그리드)은 `src/app/home/page.tsx` 로
  그대로 옮겼다. `getCurrentUser()` 와 `getStarterDay()` 호출도 같다.
- proxy 가 `/` 요청에서 세션 쿠키의 JWT 서명·만료를 보고 `/home` 으로 rewrite 한다. 주소창은 `/` 다.
- **깜빡임이 없다.** 서버가 처음부터 맞는 화면을 내보낸다. 클라이언트에서 세션을 확인해 바꾸는 방식이
  아니다.
- `/home` 을 직접 열면 proxy 가 `/` 로 307 한다. rewrite 된 요청은 proxy 를 다시 타지 않는다.
- proxy 는 `token_version` 을 확인할 수 없다(DB 조회 없음). 비밀번호 변경으로 무효화된 세션은
  `/home` 의 `getCurrentUser()` 가 걸러 랜딩을 보여준다. 변경 전 홈과 같은 동작이다.
- `/home` 의 메타데이터는 홈과 같은 title·description·canonical(`/`)에 `noindex, follow` 를 더했다.
  검색엔진은 쿠키가 없어 이 라우트에 닿지 않는다.

proxy 가 캐시된 정적 페이지 앞에서 요청마다 도는 구조는 week1·2주차 이상 본문이 이미 쓰고 있다
[문서: proxy.md "Execution order" — proxy 가 파일시스템 라우트보다 먼저 실행된다].

### 검증

| 항목 | 결과 |
|---|---|
| 쿠키 없는 `/` | 200, `x-nextjs-cache: HIT`, `no-store` 없음, TTFB 0.008~0.037초 [실측] |
| 위조 쿠키(`cn_session=garbage`)를 붙인 `/` | 200, `x-nextjs-cache: HIT` [실측] |
| 유효한 JWT 쿠키를 붙인 `/` | 200, `x-middleware-rewrite: /home`, `Cache-Control: private, no-store`, TTFB 0.023~0.030초 [실측] |
| 같은 쿠키로 RSC 요청(`RSC: 1`) | 200, `x-nextjs-rewritten-path: /home` [실측] |
| 브라우저에서 다른 페이지 → 헤더 로고 클릭으로 홈 복귀 | RSC 응답이 `/home` 으로 rewrite 됨, 콘솔·하이드레이션 오류 없음 [실측, Playwright] |
| `/home` 직접 요청 | 307 → `/` [실측] |
| 홈 title·description·canonical·FAQ JSON-LD | 변경 전과 같음(본문 마크업 동일) [실측] |
| 로그인 사용자의 학습 홈 화면 | 구현 시점에는 **[미검증]**(아래 참고). 이후 총괄 평가에서 임시 Postgres 에 계정을 만들어 실제 로그인으로 확인: 쿠키를 붙인 `/` 가 `x-middleware-rewrite: /home`, `private, no-store` 로 학습 홈을 렌더한다 |

유효한 JWT 는 로컬 서버에 임시 `JWT_SECRET` 을 주고 같은 값으로 서명해 만들었다. 로컬에 DB 가 없어
`getCurrentUser()` 가 `token_version` 조회에 실패하고 `null` 을 돌려주므로, 이 요청에서 실제로 그려진
화면은 랜딩이다. 즉 **"세션이 있으면 `/home` 라우트가 렌더된다" 까지 확인했고, 그 라우트가 학습 홈
화면(이어 읽기 카드·자격증 그리드)을 그리는 것은 보지 못했다.** 그 부분의 코드는 예전 `page.tsx` 의
로그인 분기를 옮긴 것이다.

### 알려진 차이

1. **로그인 직후 랜딩이 잠깐 보일 수 있다 [총괄 평가에서 1회 실측: 재현되지 않음 — `/login` 에서 홈이 프리페치된 상태로 로그인하면 309ms 에 로딩 스켈레톤, 668ms 에 학습 홈이 뜨고 랜딩은 나타나지 않았다. 느린 네트워크에서는 미확인].** `AuthForm` 은 로그인 뒤 `router.push('/')` →
   `router.refresh()` 를 부른다. 로그인 전에 헤더 로고 링크가 정적 홈을 프리페치해 뒀다면 `push` 가 그
   캐시(랜딩)를 먼저 보여주고 `refresh` 가 학습 홈으로 바꾼다. 예전에는 홈이 동적이라 이 자리에 로딩
   화면이 보였다. DB 가 없어 로그인 흐름을 돌려보지 못했다. 실제로 보이면 `AuthForm.goNext` 에서 목적지가
   `/` 일 때 `window.location.assign('/')` 으로 바꾸면 된다(로그아웃이 이미 같은 방식을 쓴다).
   구글 로그인은 전체 페이지 이동이라 해당이 없다.
2. **홈 요청마다 proxy 가 한 번 돈다.** 쿠키가 없으면 JWT 검증 없이 바로 통과한다.
3. **`/home` 이라는 경로가 생겼다.** 사이트맵·내부 링크에는 없다.

## 4. 직전 단계 회귀 확인

변경 후 빌드에서 [실측]:

| 항목 | 결과 |
|---|---|
| `/aws/saa-c03/week1/day1` | 200, `x-nextjs-cache: HIT` |
| `/aws/saa-c03/week2/day1` 첫 요청 | 200 (프로세스 첫 렌더 2.06초), 두 번째부터 `HIT` 0.007~0.014초 |
| 같은 URL 에 쿠키를 붙인 요청 | `HIT` |
| `/aws/saa-c03/week99/day1`, `/week2/day9`, `/aws/nope/week2/day1`, `/linux/saa-c03/week2/day1` | 전부 404 |
| `/en/saa-c03/week2/day1` | `<meta name="robots" content="noindex, nofollow"/>` |
| 빌드 출력 | `○ /`, `ƒ /home`, `● /[category]/[slug]/[week]/[day]`, `● …/week1/[day]` |
| 사이트맵 846개 URL(동시 6개) | 전부 200 |

브라우저 확인 [실측, Playwright Chromium, 임시 스크립트로 돌리고 삭제함]:

- 데스크탑 사이드바: 현재 자격증 트리 표시, 다른 자격증 펼치기 → 주차 → day 이동, 활성 표시.
- `/linux/…` 섹션 링크, `/en/…` 에서 영어 트리 링크(`/en/saa-c03/week1/day2`)만 나오는지.
- 모바일(375px) 드로어: 열기 → AWS → SAA-C03 펼치기 → day 이동.
- 검색(Ctrl+K): 검색어 입력 → 결과 클릭 → day 이동. 검색은 `/api/search` 를 쓰며 트리와 무관하다.

`npx tsc --noEmit` 통과, `npx vitest run` 43개 파일 386개 통과(1개 skip), `npm run build` 통과.

## 5. 바꾼 파일

| 파일 | 내용 |
|---|---|
| `src/app/page.tsx` | 랜딩만 렌더. `getCurrentUser()` 제거 |
| `src/app/home/page.tsx` (신규) | 로그인 사용자의 학습 홈. 예전 `page.tsx` 의 로그인 분기 |
| `src/components/marketing/HomeLanding.tsx` (신규) | 두 라우트가 같이 쓰는 랜딩 래퍼(집계 상수 포함) |
| `src/proxy.ts` | `/` 분기(`handleHome`), `/home` 직접 접근 307, matcher 에 `/`, `/home` 추가 |
| `src/lib/navTree.ts` (신규) | 사이드바 트리 전송 형식과 `buildCertTree`, `navDayHref` |
| `src/components/AppShell.tsx` | `buildCertTree` 로 트리 생성 |
| `src/components/SidebarNav.tsx` | 튜플 트리를 읽고 href 를 복원 |
| `src/proxy.test.ts` (신규) | 홈 분기 5건 |
| `src/lib/navTree.test.ts` (신규) | 트리 변환·href 복원 8건 |
| `src/app/home/page.test.ts` (신규) | 학습 홈 메타데이터 3건 |
| `src/app/page.test.ts` | 홈·랜딩이 쿠키·세션·DB 모듈을 import 하지 않는지 감시 4건 추가 |

## 6. 이번에 발견했지만 고치지 않은 것

1. **동시 요청이 몰리면 서버가 메모리 부족으로 죽는다.** 사이트맵 846개 URL 을 한꺼번에 요청하자
   `next start` 가 `JavaScript heap out of memory` 로 종료됐다 [실측]. 캐시에 없는 2주차 이상 본문 약
   690장이 동시에 렌더된 경우다. 동시 6개로 나눠 보내면 전부 200 이다. 이번 변경 전 빌드에서는 같은
   시험을 하지 않아, 직전 단계(첫 요청 때 생성)에서 생긴 것인지는 확인하지 못했다 [미검증]. Vercel 에서
   같은 일이 나는지도 모른다.
2. **`e2e/seo-smoke.spec.ts` 가 3건 실패한다.**
   - 2건은 `/aws-certs/…` 를 canonical 로 기대한다. 섹션 URL(`/aws/…`) 전환 뒤 갱신되지 않은 기대값이다.
   - 1건(`사이트맵의 모든 URL이 200`)은 위 1번 때문에 서버가 죽어 실패한다. 테스트 주석은 URL 143개를
     전제하는데 지금은 846개다.
   - 나머지 8건(홈 canonical, 소프트 404, noindex day, JSON-LD)은 통과한다.
3. **운영 수치는 배포 뒤 다시 재야 한다.** 홈이 `X-Vercel-Cache: HIT` 인지, `no-store` 가 없는지,
   로그인한 브라우저에서 학습 홈이 나오는지.
