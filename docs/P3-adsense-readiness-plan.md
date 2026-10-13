# P3 — 애드센스 대비 고도화 계획

작성일: 2026-10-13 · 기준 커밋: `877edc7` (PR #6 구독제 보류, PR #7 정책 페이지 머지 후)

## 배경

구독제를 보류하고 전 주차를 공개했다(`policy.ts` `PAYWALL_ENABLED = false`). 수익 모델은 구글 애드센스로 바꾼다.
애드센스 심사는 루트 도메인(`juganlab.com`) 허브가 준비된 뒤 신청하며, 그 전에 CertNote를 "광고 코드만 넣으면 되는 상태"로 만든다.

## 현재 측정값 (2026-10-13, 운영)

| 항목 | 값 |
|---|---|
| 1주차 본문 캐시 | `X-Vercel-Cache: HIT` (정적 생성) |
| 2주차 이상 본문 캐시 | `Cache-Control: private, no-store` (요청마다 서버 렌더) |
| 본문 HTML 크기 | 약 500KB (압축 후 약 80KB) |
| 홈 첫 응답(TTFB) | 3.3초 (배포 직후 1회 측정, 재측정 필요) |
| 사이트맵 URL | 846 |
| 린트 오류 | 29건 (10개 파일) |

얇은 트랙(12KB 미만 day 수 / 전체):

| 트랙 | day 수 | 평균 크기 | 12KB 미만 |
|---|---|---|---|
| linux-master-2 | 55 | 8.6KB | 55 |
| dea-c01 | 50 | 10.1KB | 38 |
| aif-c01 | 30 | 10.5KB | 25 |

나머지 10개 트랙은 평균 17~36KB이고 12KB 미만은 linux-master-1의 2개뿐이다.

## 전체 범위 밖

- `juganlab.com` 허브 사이트 제작(별도 계획).
- 구독·결제 코드 삭제. 페이월은 스위치로 꺼 둔 상태를 유지한다.
- 게시자 ID(`ca-pub-...`)가 필요한 실제 광고 송출. ID는 애드센스 계정 생성 후 환경변수로 넣는다.

## 우선순위

1. 본문 페이지 속도와 캐시 (Step 1~3)
2. 얇은 콘텐츠 보강 (Step 4~8)
3. 광고 자리 준비 (Step 9~10)
4. 남은 정리 (Step 11~14)

Step 4~8은 코드와 무관하므로 Step 1~3과 병행할 수 있다. Step 10은 Step 9에, Step 2는 Step 1에 의존한다.

---

## Step 1 — 2주차 이상 본문 캐시 전환 방식 설계

`src/app/[category]/[slug]/[week]/[day]/page.tsx`는 `force-dynamic`이라 2주차 이상 본문 약 1,100개가 요청마다 서버에서 렌더된다. 페이월이 꺼져 이 라우트는 더 이상 쿠키를 읽지 않으므로 캐시할 수 있다. 어떤 방식으로 캐시할지 평가해 선택한다.

검토할 선택지:

- A. `generateStaticParams`로 전 day를 빌드 때 프리렌더. 빌드 시간이 크게 늘 수 있다.
- B. 빌드 때는 만들지 않고 첫 요청 때 생성해 캐시(ISR). 빌드 시간은 그대로다.
- C. 라우트는 동적으로 두고 CDN 캐시 헤더만 부여.

설계에 포함할 것:

- 선택지별 빌드 시간, 첫 요청 지연, 콘텐츠 수정 시 캐시 무효화 방법.
- 페이월을 다시 켤 때의 되돌림 절차. `[week]/[day]/page.tsx`와 `week1/[day]/page.tsx` 주석에 적힌 `DYNAMIC_SERVER_USAGE` 500 위험(Next.js 16.2.6, `docs/SEO-indexing-fix-plan.md` Step5)을 어떻게 막는지.
- `src/proxy.ts`의 콘텐츠 존재 검증(소프트 404 방지)과 충돌하지 않는지.

완료 기준:

- 선택한 방식과 근거, 되돌림 절차가 `docs/`에 설계 문서로 남는다.
- 빌드 시간 예상치와 캐시 무효화 방법이 문서에 명시된다.

범위 밖: 코드 변경(Step 2에서 한다).

## Step 2 — 2주차 이상 본문 캐시 전환 구현

Step 1에서 고른 방식을 구현한다. `DayView`의 계약(요청별 동적 API 호출 금지)은 그대로 지킨다.

완료 기준:

- 운영과 같은 빌드에서 2주차 이상 본문 응답이 `no-store`가 아니고, 두 번째 요청이 캐시에서 나온다.
- 존재하지 않는 주차·일차 URL은 여전히 404를 낸다.
- `PAYWALL_ENABLED`를 `true`로 바꿨을 때 500이 나지 않도록 막는 가드 테스트가 추가된다.
- `tsc --noEmit`, vitest, `npm run build`가 통과한다.

범위 밖: 본문 HTML 크기 줄이기(Step 3).

## Step 3 — 홈·허브 응답 속도와 본문 HTML 크기 개선

홈 첫 응답이 3.3초로 측정됐고 본문 HTML이 500KB다. 먼저 여러 번 재측정해 평소 수치를 확인하고, 원인을 찾아 고친다. 후보: 홈·허브가 매 요청 DB나 콘텐츠 파일을 읽는지, 사이드바가 전 자격증의 day 트리를 모든 페이지 HTML에 싣는지(`AppShell`의 `certTrees`).

완료 기준:

- 홈, `/aws`, `/aws/saa-c03`의 첫 응답 시간을 5회 이상 측정한 전후 수치가 PR에 기록된다.
- 캐시된 상태의 홈 첫 응답이 1초 미만이다.
- 본문 HTML 크기 전후 수치가 기록되고, 줄이지 못했다면 이유가 적힌다.

## Step 4 — linux-master-2 콘텐츠 보강 (week1~6)

`content/aws-certs/linux-master-2/week1`~`week6`의 day 문서를 `docs/content-format.md` 규격과 `RECIPE.md` 방식으로 깊이 보강한다. 현재 전부 12KB 미만이다.

완료 기준:

- 대상 day 문서가 각각 12KB 이상이다.
- `## 📝 연습 문제` 양식이 유지되어 퀴즈가 정상 파싱된다(`npm run questions:build` 통과).
- 사실 오류를 막기 위해 KAIT 출제기준(`docs/linux-master-2-curriculum.md`)과 대조한다.

범위 밖: 문항 수 변경, 다른 트랙 수정.

## Step 5 — linux-master-2 콘텐츠 보강 (week7~11)

`content/aws-certs/linux-master-2/week7`~`week11`을 Step 4와 같은 기준으로 보강한다.

완료 기준:

- 대상 day 문서가 각각 12KB 이상이다.
- `npm run questions:build`와 `npm run build`가 통과한다.

범위 밖: 문항 수 변경, 다른 트랙 수정.

## Step 6 — dea-c01 콘텐츠 보강 (week1~5)

`content/aws-certs/dea-c01/week1`~`week5`에서 12KB 미만인 day 문서를 보강한다.

완료 기준:

- 대상 주차에 12KB 미만 day 문서가 없다.
- `npm run questions:build`가 통과한다.
- AWS 서비스 사양(한도, 요금 구조, 기능 지원 여부)은 공식 문서와 대조한다.

범위 밖: 영어판(`content/en/dea-c01`) 수정.

## Step 7 — dea-c01 콘텐츠 보강 (week6~10)

`content/aws-certs/dea-c01/week6`~`week10`을 Step 6과 같은 기준으로 보강한다.

완료 기준:

- dea-c01 전체에 12KB 미만 day 문서가 없다.
- `npm run questions:build`와 `npm run build`가 통과한다.

범위 밖: 영어판(`content/en/dea-c01`) 수정.

## Step 8 — aif-c01 콘텐츠 보강

`content/aws-certs/aif-c01`에서 12KB 미만인 day 문서 25개를 보강한다.

완료 기준:

- aif-c01 전체에 12KB 미만 day 문서가 없다.
- `npm run questions:build`와 `npm run build`가 통과한다.

범위 밖: 영어판(`content/en/aif-c01`) 수정.

## Step 9 — 광고 로더와 광고 슬롯 컴포넌트 구현

게시자 ID를 환경변수(`NEXT_PUBLIC_ADSENSE_CLIENT`)로 받는 애드센스 로더와 `AdSlot` 컴포넌트를 만든다. 값이 없으면 스크립트도 슬롯도 렌더하지 않는다. `ads.txt`는 같은 값에서 생성한다. 로그인 전용 화면(`/dashboard`, `/exam`, `/review`, `/notebook`, `/account`, `/admin`)과 로그인·가입 화면에는 광고 스크립트를 싣지 않는다.

완료 기준:

- 환경변수가 없을 때 어떤 페이지 HTML에도 `adsbygoogle`·`pagead2`가 없다.
- 환경변수가 있을 때 공개 페이지에만 로더가 한 번 실리고 `/ads.txt`가 200으로 올바른 줄을 낸다.
- 단위 테스트가 두 경우를 모두 덮는다.

범위 밖: 광고를 실제 페이지에 배치하는 일(Step 10), 쿠키 동의 배너(구글 제공 동의 메시지로 대체할지 승인 후 결정).

## Step 10 — 광고 위치 배치와 레이아웃 밀림 방지

`AdSlot`을 본문 페이지(`DayView`)와 자격증 허브에 배치한다. 위치 후보: 요약 카드 아래, 연습 문제 섹션 앞, 이전/다음 내비게이션 위. 광고가 늦게 떠도 본문이 밀리지 않게 슬롯 높이를 미리 확보한다. 퀴즈 선택지처럼 누르는 요소 바로 옆에는 두지 않는다(오클릭 유도 금지 정책).

완료 기준:

- 광고 슬롯이 있는 페이지에서 누적 레이아웃 이동(CLS)이 0.1 미만이다.
- 320·768·1440 폭에서 가로 넘침이 없다.
- 환경변수가 없을 때 화면이 현재와 동일하다.

범위 밖: 영어판 본문 중 noindex 주차의 광고 배치.

## Step 11 — 옛 유료 문구와 린트 오류 정리

`src/app/roadmap/page.tsx` 설명의 "Week 1 무료 학습" 문구를 현재 정책에 맞게 고친다. 린트 오류 29건을 정리한다(`react-hooks/set-state-in-effect` 7건, `CheckoutForm.tsx`의 `no-html-link-for-pages` 20건 등).

완료 기준:

- `npx eslint`가 오류 0건으로 끝난다.
- 공개 페이지 HTML에 "Week 1 무료", "Pro 전용" 문구가 없다.
- vitest와 `npm run build`가 통과한다.

범위 밖: 구독·결제 화면의 동작 변경(리다이렉트로 가려진 코드는 문구·동작을 그대로 둔다).

## Step 12 — AI 튜터 이메일 인증 게이트

AI 튜터가 로그인만으로 열려, 인증하지 않은 계정을 여러 개 만들어 하루 3회 한도를 우회할 수 있다. `/api/tutor`에서 `email_verified`가 아닌 계정은 막고 인증 안내를 돌려준다. 구글 로그인 계정은 이미 인증된 것으로 본다.

완료 기준:

- 미인증 계정의 `/api/tutor` 호출이 403과 인증 안내 메시지를 받는다.
- 인증 계정과 구글 로그인 계정은 기존대로 동작한다.
- 미인증·인증·한도 초과 경우를 덮는 테스트가 추가된다.

범위 밖: 가입 자체에 대한 추가 제한(캡차 등).

## Step 13 — 로그인 흐름 E2E 검증

PR #6에서 미실행으로 남은 항목을 검증한다. `e2e/gating.spec.ts`를 실행하고, 무료 계정의 모의고사 응시, AI 튜터 3회 후 차단, 실패 시 횟수 환불을 테스트로 확인한다. 테스트용 DB가 필요하다.

완료 기준:

- `npm run test:e2e`가 통과한다.
- 위 세 흐름이 각각 테스트로 존재한다.

범위 밖: 운영 DB를 대상으로 한 테스트.

## Step 14 — 영어판 2주차 이상 번역 상태 감사

영어판 2주차 이상은 `EN_INDEXABLE_WEEK = 1` 때문에 noindex다. 자격증별로 한국어가 남은 파일 수를 세어, 색인을 열 수 있는 트랙과 번역이 더 필요한 트랙을 나눈다.

완료 기준:

- 자격증별 "2주차 이상 파일 수 / 한국어가 남은 파일 수" 표가 문서로 남는다.
- 색인을 트랙별로 열 수 있게 `isIndexableDay`를 바꿀지에 대한 권고가 적힌다.

범위 밖: 번역 작업 자체, `isIndexableDay` 코드 변경.
