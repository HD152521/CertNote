# P0 구현 계획서 — 구독형 전환 (결제 제외) · rev2

> 작성 2026-06-11 (rev2: 코드 검증 후 게이팅 방식·유출경로·범위 수정).
> **정책:** 무료 = 각 자격증 **Week 1** 전체 / 유료(Pro) = Week 2~ 전체 + 모의고사 + 무제한 SRS.
> **결제 연동은 범위 밖** — 대기자 명단 + 관리자 수동 Pro 부여로 MVP 완성. 결제는 나중에 `entitlement` 어댑터만 추가하면 끼워짐.

## 결정 사항 (2026-06-11)
- **게이팅 방식 = (B)**: 페이지 껍데기는 SSG 유지, **잠긴 본문은 인증 API로만 로드**(초기 HTML에 미포함 → 우회 불가).
- **업그레이드 경로**: 랜딩 CTA → 대기자 명단(이메일 수집) + 관리자 수동 `grant:pro`.
- **이메일**: **비밀번호 재설정만 P0**. 가입 이메일 인증은 P1.

---

## 0. 검증된 현재 상태 (계획 전제)

- 구현됨: 인증(JWT 7일·bcrypt), 퀴즈 서버채점, Leitner SRS, 오답노트, 대시보드, 모의고사(미푸시 `f43d26a`).
- `users`: `id, email, password_hash, role, created_at` — **plan 개념 없음**.
- `middleware.ts` = `/admin`만 보호. 그 외 전부 공개.
- **day 페이지 415개 전부 `generateStaticParams()`로 SSG** → 본문이 정적 HTML에 박혀 빌드됨. 단순 컴포넌트 교체식 페이월은 우회됨(그래서 방식 B 채택).
- `/api/search`의 `buildSearchBodyIndex`는 **전 주차 본문 발췌**를 내려줌 → 별도 게이팅 필요.
- 6개 자격증(리눅스마스터 포함) 모두 `week1..weekN` 일관 → `FREE_WEEK=1` 규칙이 전 트랙 적용됨.
- `questions.json`(정답)은 클라이언트에 import 안 됨 / 모의고사 API는 정답 서버보존 — OK.
- **테스트 인프라 0개**(vitest/jest/playwright 전무) → 셋업이 별도 작업.

---

## 1. 권한 경계 (정책 → 코드 규칙)

| 사용자 | 접근 |
|---|---|
| 비로그인 | 랜딩/가격, **Week1** 본문 읽기 + Week1 퀴즈(기록 X) |
| 무료 로그인 | + 진도 저장, 대시보드, **Week1** 한정 SRS/오답노트 |
| Pro | 전체 Week 본문 + 모의고사 + 무제한 SRS/오답노트/통계 |

**순수 함수(policy.ts):** `canAccessWeek(plan, week) = week <= FREE_WEEK || plan==='pro'` · `canTakeExam(plan)=plan==='pro'`. 경계 변경은 `FREE_WEEK` 상수 1줄.

---

## 2. 작업 항목 (파일 단위)

### 2-1. DB 마이그레이션 — `scripts/db-migrate.mjs`에 멱등 ALTER 추가
```
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan               TEXT NOT NULL DEFAULT 'free',  -- 'free'|'pro'
  ADD COLUMN IF NOT EXISTS plan_status        TEXT,
  ADD COLUMN IF NOT EXISTS plan_since         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;                   -- null=무기한(수동부여)

CREATE TABLE IF NOT EXISTS waitlist (            -- 업그레이드 대기자
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (     -- 비번 재설정 토큰(해시 저장)
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
```

### 2-2. 엔티틀먼트 도메인 (신규, `auth/`·`review/` 구조 미러링)
```
src/lib/entitlement/
  types.ts              # Plan, Entitlement{plan,isPro,periodEnd}, EntitlementRepository(DIP)
  policy.ts             # FREE_WEEK=1, canAccessWeek, canTakeExam, isPro  (순수, 테스트 대상)
  entitlementRepository.ts  # Pg: getByUserId / grantPro(userId,until) / revoke(userId)
  entitlementService.ts # getEntitlement, assertWeekAccess(userId,week), assertExamAccess(userId)
  factory.ts            # getEntitlementService()
```
- 권한 없으면 `AppError(403,'plan_required',...)` throw (기존 `auth/errors.ts`).
- 만료 강등: `getEntitlement`에서 `current_period_end < now` → `free`로 강등(읽기 시 판정, cron 불필요).

### 2-3. 게이팅 — 방식 (B): 본문을 API로 분리

> 핵심: **잠긴 본문이 초기 HTML/RSC 페이로드에 절대 안 실리게** 한다.

| 위치 | 변경 |
|---|---|
| `app/[category]/[slug]/[week]/[day]/page.tsx` | week1 또는 Pro면 기존대로 서버에서 본문 SSG. **week>1 & 비Pro면 `getDay`의 body를 렌더하지 않고** `<LockedDay>`(미리보기 N줄 + Paywall)만 정적 출력. (generateStaticParams 유지) |
| `src/lib/content.ts` | day 본문 일부를 "미리보기 발췌"로 잘라주는 헬퍼(`previewOf(body)`) 추가. 정적 페이지엔 발췌만. |
| `app/api/day/[...]/route.ts` (신규) | 로그인+`assertWeekAccess` 통과 시에만 **전체 본문 마크다운** 반환. 클라가 잠금해제 후 fetch. |
| `src/components/LockedDay.tsx` (신규) | 발췌 표시 + (Pro면) API에서 본문 로드해 `<Article>` 렌더 / (무료면) Paywall CTA. |
| `app/api/search/route.ts` | **본문 인덱스 게이팅**: 비Pro에는 `week<=1` 본문만 또는 제목만. (AppShell의 제목-only `buildSearchIndex`는 그대로 둬도 됨.) |
| `app/api/quiz/attempt/route.ts` | 기록 전 `assertWeekAccess(userId, question.week)`. |
| `app/api/review/*` (route/due/notebook/stats) | 문제별 `assertWeekAccess`. 무료는 week1 문제만 큐/표시. |
| `app/api/exam/start`·`submit` | `assertExamAccess` — Pro 전용. |
| `src/middleware.ts` | matcher에 `/dashboard,/review,/notebook,/exam` 추가 → **로그인만** 강제(plan 판정은 서버/라우트에서). |

> 인라인 퀴즈 정답: week2+ 본문이 API 게이팅되면 그 안의 퀴즈 정답도 함께 보호됨(같은 경로). 별도 처리 불필요.

### 2-4. 관리자 수동 Pro 부여 + 대기자
- `scripts/grant-pro.mjs` 신규 + `package.json` `"grant:pro"`: `node --env-file=.env scripts/grant-pro.mjs <email> [months]`.
- `app/api/waitlist/route.ts` 신규: 이메일 적재(중복 무시). 랜딩 CTA가 호출.
- `app/admin/page.tsx`: 사용자 검색 + Pro 부여/해지 버튼 + 대기자 목록(admin 가드).

### 2-5. 세션 plan 반영 (UI 힌트용)
- `auth/session.ts` `SessionPayload`에 `plan` 추가, 로그인·`/api/auth/me`에서 발급.
- **권위 판정은 항상 서버 DB**(JWT plan은 버튼 노출용). `/api/auth/me`는 매 호출 DB로 최신 plan 반환 → 수동 grant가 재로그인 없이 UI 반영.

### 2-6. 랜딩 + 가격 + Paywall
- `app/page.tsx`: 비로그인 → 마케팅 랜딩(히어로 / 무료 vs Pro 비교표 / 가격 / 신뢰요소(2,696문항·6트랙) / **대기자 CTA**). 로그인 → 기존 그리드.
- `app/pricing/page.tsx` 신규: 플랜 비교표. 결제 버튼 대신 **대기자 등록**.
- `src/components/Paywall.tsx` 신규: 잠금 자리 표시 → `/pricing`/대기자.
- `src/components/AuthNav.tsx`: Free/Pro 배지 + Free면 업그레이드 링크.
- 디자인: `~/.claude/rules/web/design-quality.md` 준수(템플릿 티 금지).

### 2-7. 비밀번호 재설정 (P0로 당김)
- `app/api/auth/forgot/route.ts`: 이메일 받고 `password_resets`에 토큰 해시 저장 + 메일 발송(존재여부 노출 안 함).
- `app/api/auth/reset/route.ts`: 토큰 검증(만료·사용) → 비번 갱신 → 토큰 소비.
- `app/forgot/page.tsx`, `app/reset/page.tsx`.
- 메일 발송기: **Resend** 권장(`RESEND_API_KEY` env). 인터페이스 뒤로 추상화(`lib/mail/`) — 로컬은 콘솔 출력 어댑터.

### 2-8. 테스트 인프라 (신규 — 선행 작업)
- **Vitest** 도입(단위/서비스) + **Playwright**(E2E). package.json 스크립트·설정 추가.
- 이게 없으면 아래 4장 커버리지 목표 불가 → P0 1단계로.

---

## 3. 구현 순서

1. **테스트 인프라**(2-8) — vitest/playwright 셋업
2. **마이그레이션**(2-1) → `npm run db:migrate`
3. **엔티틀먼트 도메인**(2-2) — policy 순수함수 + 단위테스트 먼저
4. **본문 API 게이팅**(2-3: day API·search·quiz·review·exam) — 우회 불가 확인(curl로 week2 본문/검색 차단 검증)
5. **LockedDay/Paywall + 페이지 게이팅**(2-3, 2-6 일부)
6. **세션 plan / AuthNav**(2-5)
7. **수동 부여 + 대기자**(2-4)
8. **랜딩 + 가격**(2-6)
9. **비번 재설정**(2-7)

---

## 4. 테스트 (인프라 구축 후)

- **순수함수:** `policy.canAccessWeek`(week1 허용 / week2+free 차단 / pro 허용), 만료 강등.
- **서비스:** `assertWeekAccess`·`assertExamAccess` 403, grantPro→isPro.
- **API 통합:** free가 week2 day-API/검색/quiz-attempt/exam-start 호출 → 403·본문없음. grant 후 통과.
- **E2E(Playwright):** 가입→week2 LockedDay→(curl로 본문 미노출 확인)→admin grant→week2 본문 로드→모의고사 진입. 비번재설정 플로우.

---

## 5. 주의·결정

- **Next.js 16은 평소와 다름**(`AGENTS.md`): 코딩 전 `node_modules/next/dist/docs/` 확인. 미들웨어 matcher·라우트 핸들러 시그니처 검증.
- **유출 차단이 게이팅의 본질**: 잠긴 본문/검색 발췌가 정적 HTML·API 응답에 안 실리는지 항상 검증.
- **JWT plan 스테일**: 게이팅은 DB 권위, `/api/auth/me` DB 조회로 UI 동기화.
- **multi-select 미지원**(`correctness.ts`)은 P1지만 모의고사 정확도 직결 → P0 직후 1순위.

## 6. 결제 연동 시 (범위 밖, 참고)
- `entitlement` 뒤 결제 어댑터: 성공 webhook→`grantPro(userId,periodEnd)`, 해지/만료 webhook→`current_period_end` 갱신. 게이팅 코드 그대로 재사용. `subscriptions` 이력 테이블·인보이스 추가.
