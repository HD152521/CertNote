# P3 — 전 주차 공개 이후 수정 계획

작성일 2026-10-13 · 기준 브랜치 `feat/adsense-prep`(PR #7, PR #6 위에 쌓임)

구독제 보류(PR #6)와 정책 페이지(PR #7) 이후 남은 9개 항목의 수정 계획이다.
순서는 실행 권장 순서다 — 1단계가 나머지 단계의 검증 수단을 만든다.

## 공통 규칙

- 작업 위치: 워크트리 `C:\Users\안용식\CertNote-open`. 메인 레포(`CertNote-repo`)에서 브랜치를 바꾸지 않는다.
- 단계마다 브랜치 1개 · PR 1개. 이전 단계가 머지되지 않았으면 그 위에 쌓는다.
- 완료 판정: `npx tsc --noEmit` 0, `npx vitest run --testTimeout=60000` 전부 통과, `npm run build` 성공.
- `npm run build` 는 `src/data/questions.json`·`exam-questions.json` 에 CRLF 차이를 만든다. 커밋하지 말고 `git checkout --` 로 되돌린다.
- `scripts/sync-content.mjs` 실행 금지(day.md 를 외부 소스로 덮어쓴다).
- 접근 정책의 단일 출처는 `src/lib/entitlement/policy.ts`(PAYWALL_ENABLED), 색인 판정은 `src/lib/day/indexPolicy.ts`(isIndexableDay).

## Step 1. 로그인 흐름 검증 환경 복구와 E2E 수리

**문제**: 로컬에 `.env`(DATABASE_URL)가 없어 로그인 상태의 동작을 한 번도 실행해 보지 못했다. `e2e/gating.spec.ts` 는 새 정책으로 고쳤지만 미실행이고, `e2e/seo-smoke.spec.ts` 는 301되는 옛 주소(`/aws-certs/...`)와 그 canonical 을 단언하고 있어 깨져 있을 가능성이 높다.

**할 일**
- `.env.example` 기준으로 로컬 `.env` 를 구성한다. DB 는 Neon 의 `certnote_dev` 를 쓴다(global-setup 이 DATABASE_URL 에 `certnote_dev` 가 없으면 중단하는 가드를 유지).
- `e2e/seo-smoke.spec.ts` 의 URL·canonical 기대값을 섹션 URL(`/aws/...`)로 고치고, 한국어 week2 가 색인 대상(robots 없음, JSON-LD 있음)임을 단언하는 블록을 추가한다.
- `e2e/gating.spec.ts` 에 로그인 사용자 시나리오를 추가한다: 무료 계정 모의고사 시작·제출, AI 튜터 한도 초과 시 429 `daily_limit`, LLM 실패 시 횟수 환불.
- AI 튜터 시나리오는 실제 LLM 을 부르지 않도록 `streamTutor` 를 대체할 수 있는 테스트 경로를 둔다(환경변수로 켜는 가짜 스트림).

**완료 기준**
- `npm run test:e2e` 가 로컬에서 전부 통과한다.
- 무료 계정으로 `/api/exam/start` 200, 일일 한도 초과 요청은 429 를 반환함을 E2E 가 증명한다.
- 가짜 스트림 실패 후 `tutor_usage.count` 가 되돌아감을 테스트가 증명한다.

**범위 밖**: 운영 DB 접근, CI 파이프라인 신설.

## Step 2. AI 튜터 비용 방어

**문제**: 기본 모델이 `claude-opus-4-8`(max_tokens 2048)이고, 이메일 인증 없이 가입만 하면 하루 3회를 쓴다. 가입 제한은 인메모리 IP 레이트리밋(분당 5회)뿐이라 서버리스에서는 약하다. 계정을 새로 만들면 3회가 다시 생긴다.

**할 일**
- 기본 모델을 `claude-haiku-4-5` 로 낮춘다(`TUTOR_MODEL` 환경변수로 덮어쓰는 구조는 유지).
- 이메일 인증된 계정만 AI 튜터를 쓸 수 있게 한다. 미인증이면 403 `email_unverified` 와 인증 안내를 반환하고, `TutorPanel` 이 안내 문구와 인증 메일 재발송 링크를 보여준다. 소셜 로그인 가입자는 인증된 것으로 본다.
- `selected` 입력에 길이 상한을 두고 보기 문자 형식(A~E, 쉼표 구분)만 받는다.
- 전체 사용자 합산 일일 호출 상한(`TUTOR_GLOBAL_DAILY_LIMIT`)을 추가한다. 초과 시 503 과 안내 문구.

**완료 기준**
- 미인증 계정의 `/api/tutor` 요청은 LLM 호출 없이 403 을 반환한다(단위 테스트).
- 형식이 어긋난 `selected` 는 400 을 반환한다.
- 전역 상한 초과 시 LLM 을 부르지 않는다.

**범위 밖**: Upstash 등 외부 레이트리밋 저장소 도입, 결제 연동.

## Step 3. 랜딩 문구 정정

**문제**: `src/components/marketing/Landing.tsx` 의 HIGHLIGHTS 가 "12주 주차별 구조화된 학습"으로 고정돼 있으나 실제 트랙은 6~16주다. "한국어 유일의 체계적 커리큘럼"과 경쟁사 가격 비교표(Udemy·Coursera·Pluralsight)는 출처가 없다.

**할 일**
- 주차 수는 `certs` 메타에서 파생한다(이미 `weekSpan` 계산이 있다).
- "한국어 유일" 표현을 검증 가능한 서술로 바꾼다.
- 경쟁사 가격 비교표를 제거하고, 같은 자리에 CertNote 가 제공하는 것(노트·연습문제·모의고사·복습)의 실제 수치를 보여주는 섹션으로 바꾼다. 수치는 props(certCount·pageCount·questionCount)에서 온다.
- 홈 본문 길이가 줄지 않게 한다(홈 색인 회복 근거가 본문 분량이었다).

**완료 기준**
- 랜딩 렌더 결과에 하드코딩된 주차 수와 타사 가격이 없다.
- 홈 렌더 텍스트가 2,000자 이상이다.
- FAQ 렌더 텍스트와 FAQPage JSON-LD 가 계속 1:1 이다.

## Step 4. 2주차 이후 day 페이지 정적화

**문제**: `src/app/[category]/[slug]/[week]/[day]/page.tsx` 가 `force-dynamic` 이라 week2+ 약 1,250개 페이지가 요청마다 서버 렌더된다. 구독제 보류로 쿠키를 읽지 않게 됐으므로 정적 캐시가 가능하다.

**할 일**
- 설계 결정을 먼저 한다: (가) `generateStaticParams` 로 전량 프리렌더, (나) `generateStaticParams` 가 빈 배열을 반환하고 요청 시 렌더 후 캐시(ISR). 빌드 시간·Vercel 한도·콘텐츠 갱신 주기를 기준으로 고르고 근거를 주석에 남긴다.
- 선택한 방식으로 `force-dynamic` 을 제거한다. `week1/[day]` 라우트와의 역할 중복을 정리한다.
- 이 라우트와 `DayView` 에서 요청별 동적 API(cookies·headers)를 다시 쓰지 못하게 하는 가드 테스트를 확장한다(`src/lib/day/noDynamicApiImports.test.ts`).
- `policy.ts` 주석에 "페이월을 되살리려면 이 라우트를 다시 동적으로 돌려야 한다"를 남긴다.

**완료 기준**
- 프로덕션 빌드 후 `next start` 에서 week2+ 페이지의 두 번째 요청이 캐시에서 나간다(`x-nextjs-cache: HIT` 또는 프리렌더).
- 존재하지 않는 week·day 는 계속 진짜 404 를 반환한다.
- 빌드 시간 증가를 측정해 PR 본문에 적는다.

**범위 밖**: 페이월 재도입 설계.

## Step 5. 전체 본문 검색

**문제**: `buildSearchBodyIndex`(`src/lib/content.ts`)가 week1 만 본문을 싣고 나머지는 제목만 싣는다. 전 주차 본문을 그대로 실으면 인덱스가 1MB 를 넘는다.

**할 일**
- 인덱스 크기를 줄이는 방식을 고른다: 자격증별 분할 인덱스를 검색어 입력 시 지연 로드하거나, 본문 발췌 길이를 줄이고 제목·헤딩 가중치를 높인다.
- `SearchProvider`·`SearchDialog` 가 새 인덱스 형식을 쓰게 한다.
- 영어판 week2+ 는 본문 검색에서 제외한다(혼합 언어).

**완료 기준**
- week2+ 본문에만 있는 용어로 검색해 해당 day 가 결과에 나온다.
- 검색창 첫 오픈 시 내려받는 용량이 gzip 기준 300KB 이하다(측정값을 PR 에 기재).

## Step 6. 영어판 2주차 이후 처리

**문제**: `content/en` 의 week2+ day 570개에 한국어가 섞여 있다. 색인은 막았지만(`EN_INDEXABLE_WEEK=1`) 사이드바·이전/다음 링크로 누구나 들어간다.

**할 일**
- 영어판 내비게이션(사이드바 트리, 허브의 주차 목록, day 이전/다음)을 번역이 끝난 주차까지만 노출한다. 판정은 `EN_INDEXABLE_WEEK` 하나로 한다.
- 번역 안 된 영어 day URL 에 직접 들어오면 같은 day 의 한국어 페이지로 안내한다.
- 한글 0자인 주차가 생기면 `EN_INDEXABLE_WEEK` 대신 자격증별 값으로 올릴 수 있게 구조를 연다(SAA·CLF 는 전 주차 번역본이 있다는 기록이 있으므로 실측 후 반영).

**완료 기준**
- 영어판 사이드바와 허브에 번역 안 된 주차로 가는 링크가 없다.
- 색인 대상으로 올린 영어 day 는 한글(U+AC00–U+D7A3) 0자다(테스트로 고정).

**범위 밖**: 미번역 570개 파일의 번역 작업.

## Step 7. 리눅스마스터 2급 모의고사 문제은행

**문제**: 13개 자격증 중 2급만 `content/exams/linux-master-2.json` 이 없다.

**할 일**
- `content/exams/linux-master-1.json` 의 스키마를 따라 2급 문제은행을 만든다. 문항은 `docs/linux-master-2-curriculum.md` 의 과목·출제 비중을 따른다.
- 일일 퀴즈 295문항과 지문이 겹치지 않게 한다.
- 정답 분포를 A~D 고르게 배분하고, 해설은 보기 글자를 참조하지 않는다.
- `npm run prebuild`(build-exam-index)로 인덱스를 재생성하고 자격증 허브의 트랙 구성에 모의고사 줄이 나오는지 확인한다.

**완료 기준**
- 문제은행이 스키마 검증과 `build-exam-index` 를 통과한다.
- 정답 분포가 보기별 20~30% 범위다.
- 일일 퀴즈와 지문 중복 0건.

**범위 밖**: 실제 기출 문항의 복원·전재.

## Step 8. 쓰지 않는 구독 코드 제거

**문제**: 페이월·결제·구독 관리·프로모 모달 코드가 도달 불가 상태로 남아 있다(`Paywall`, `PromoModal`, `components/checkout`, `components/subscription`, `components/account/subscription`, `app/pricing`, `app/checkout`, `app/account/subscription`, `WaitlistForm`, 관련 strings).

**선행 결정(운영자)**: 구독제를 완전히 접는가. 접지 않고 "보류"라면 이 단계는 건너뛴다.

**할 일(접는 경우)**
- 위 컴포넌트·라우트·문자열을 삭제하고 `DayView` 의 `locked` 분기와 props 를 없앤다.
- `PAYWALL_ENABLED` 스위치와 플랜 판정 함수를 정리한다. DB 컬럼(users.plan 등)과 마이그레이션은 건드리지 않는다.
- `next.config.ts` 의 임시 307 을 영구 리다이렉트로 바꾼다.
- knip 등으로 고아 export 를 확인한다.

**완료 기준**
- 삭제 대상 경로가 저장소에 없다.
- `/pricing`·`/checkout` 은 308 로 홈에 간다.
- 관리자 화면이 계속 동작한다.

**범위 밖**: DB 스키마 변경, 관리자 화면의 Pro 부여 기능 제거.

## Step 9. 린트 오류 정리

**문제**: `npx eslint src e2e` 가 오류 29건·경고 6건을 낸다. 규칙별로 `@next/next/*` 20, `react-hooks/set-state-in-effect` 7, `@typescript-eslint/no-unused-vars` 5, `react-hooks/purity`·`refs`·`exhaustive-deps` 각 1.

**할 일**
- Step 8 을 먼저 하면 구독 컴포넌트의 오류가 함께 사라진다. 남은 것만 고친다.
- `set-state-in-effect` 는 파생 상태로 바꾸거나 이벤트 시점으로 옮긴다. 불가피한 곳만 사유 주석과 함께 비활성화한다.
- 오류 0 이 되면 린트를 PR 검증 단계에 넣는다.

**완료 기준**
- `npx eslint src e2e` 오류 0.
- 동작 변경이 없음을 기존 테스트와 E2E 로 확인한다.

**범위 밖**: 린트 규칙 완화.

## 운영자 결정이 필요한 것

| 항목 | 내용 |
|---|---|
| Step 2 | AI 튜터를 이메일 인증 계정으로 제한할지 |
| Step 4 | 전량 프리렌더와 요청 시 캐시 중 어느 쪽인지(계획 단계에서 근거 제시) |
| Step 8 | 구독제를 완전히 접을지, 보류로 둘지 |
