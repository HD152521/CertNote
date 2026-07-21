# P2 개인화 · 학습분석 마일스톤

> 작성: 2026-07-21
> 목표: 콘텐츠 중심 → **개인 맞춤 학습 경험**으로 전환.
> **전제:** 실제 코드 분석 기반. 아래 "이미 있는 것"을 재사용하고, "빈틈"만 채운다.

---

## 0. 실제 코드 현황 (검증됨 — 착수 전제)

sub-agent 분석은 "개인화 0%"라 했으나, **실제로는 데이터·인프라가 상당수 존재**한다.
진짜 문제는 **"수집한 데이터를 활용/예측에 쓰지 않는다"**는 점.

| 영역 | 이미 있는 것 | 실제 빈틈 |
|------|------------|----------|
| **프로필** | `users`: name, birthdate, occupation, target_cert, purpose, experience_level (온보딩 수집) | 수집만 하고 **학습 경로에 반영 안 함** |
| **SRS** | Leitner `schedule.ts` (box 0→1→3→7→14→30), `review_items` | 개인 난이도 보정(EF) 없음, 오답 이유 미기록 |
| **스트릭** | `daily_activity` + `getStreak()` (연속일 계산) | 프리즈·마일스톤 축하·전용 알림·캘린더 시각화 없음 |
| **알림** | `push_subscriptions` + web-push + `cron/reminders`(매시 KST) + `notify_review/notify_inactive/reminder_hour` | 진도 미달·마일스톤·합격위기 알림 없음 |
| **대시보드** | `dashboardService.ts`: 정답률, 커버리지, 자격증별 진행, **도메인별 약점(정답률 낮은순)**, 최근활동 | 예측(합격확률)·추이(시계열)·필요학습량 없음 |
| **학습계획** | `study_plans`(exam_date) + `computeToday()`(선형 분배) | 목표 정확도·일일시간 목표·동적 재계산 없음 |
| **추천** | 없음 | 약점 드릴·다음 학습 추천 전무 (**진짜 0%**) |

**결론:** 새로 짜기보다 **기존 배선에 얹기**가 대부분. 아래 마일스톤은 이 사실을 반영한다.

---

## 마일스톤 개요

| # | 마일스톤 | 우선순위 | 기간 | 의존성 |
|---|---------|---------|------|--------|
| **M0** | 기반 정비 (프로필 활용 배선 + 도메인 통계 확장) | P0 | 3-4일 | 없음 |
| **M1** | 개인화 추천 (약점 드릴 · 다음 학습) | P0 | 1.5주 | M0 |
| **M2** | 학습 분석 & 합격 예측 | P0 | 2주 | M0 |
| **M3** | 고급 SRS (SM-2 + 오답 이유) | P1 | 1.5주 | 없음(병렬 가능) |
| **M4** | 목표 설정 고도화 | P1 | 1.5주 | M2 |
| **M5** | 스트릭 강화 + 스마트 알림 | P1 | 1.5주 | M1, M2 |

**총 기간:** 약 8-9주 (M3는 병렬 가능 → 실질 7주)

---

## M0 — 기반 정비 (P0, 3-4일)

> 뒤 마일스톤 전부가 얹힐 토대. 작지만 먼저.

### 목표
1. 온보딩에서 수집만 하던 프로필(occupation/purpose/experience_level)을 **서버에서 읽어 쓰는 통로** 마련.
2. 도메인 통계를 **모의고사 문제 외 일반 문제(week/day)에도** 확장 — 현재 `q.domain` 있는 문제만 집계되어 약점 분석 범위가 좁음.

### 작업 항목
- `src/lib/profile/profileService.ts` (신규): `getLearnerProfile(userId)` → `{ occupation, purpose, experienceLevel, targetCert }`. 순수 조회.
- `src/lib/questions.ts` 확인: 일반 문제에 `domain`/topic 태그가 있는지 점검. 없으면 week 기준의 임시 도메인 매핑(`weekToDomain(slug, week)`) 추가.
- `src/lib/dashboard/dashboardService.ts`: `domainAgg`에 일반 문제도 포함하도록 확장(현재 `if (q.domain)`만 → week 기반 fallback).
- 단위 테스트: `profileService`, `weekToDomain`.

### DB 변경
없음 (기존 컬럼 재사용).

### 완료 기준
- [ ] `getLearnerProfile()`가 온보딩 입력값을 정확히 반환.
- [ ] 대시보드 도메인 약점이 모의고사 없이도(week 문제만 풀어도) 채워짐.
- [ ] 기존 대시보드 회귀 없음.

---

## M1 — 개인화 추천 (P0, 1.5주)

> 진짜 0%였던 영역. 사용자의 "다음 뭐 하지?"를 없앤다.

### 목표
- **약점 드릴**: 정답률 낮은 도메인의 문제를 우선 큐잉.
- **다음 학습 추천**: 프로필(target_cert) + 진도 기반으로 "오늘 이거 하세요" 카드.

### 작업 항목
- `src/lib/recommend/recommendService.ts` (신규):
  - `weakDomainDrill(userId, limit)`: `dashboardService`의 domains(약점순) → 해당 도메인 미마스터 문제 N개.
  - `nextUp(userId)`: target_cert의 `computeToday()` 분량 + 미완료 최근 지점 → 추천 1~3개.
- `src/app/api/recommend/route.ts` (신규): 로그인 필요, 위 둘 반환.
- `src/components/study/RecommendCard.tsx` (신규): 대시보드 상단 + day 페이지 완료 후 노출.
- 대시보드(`app/dashboard/page.tsx`)에 "오늘의 추천" 섹션 삽입 (StudyPlanWidget 아래).
- `app/review/page.tsx`에 "약점부터 복습" 필터 버튼 추가.

### DB 변경
없음 (기존 `quiz_attempts`, `review_items` 집계 재사용).

### 완료 기준
- [ ] 모의고사에서 IAM 40% 기록 → 대시보드에 "IAM 약점 드릴 5문제" 노출.
- [ ] 추천 문제가 이미 마스터한 문제를 제외.
- [ ] 복습 페이지에서 "약점부터" 선택 시 약점 도메인 우선 정렬.
- [ ] Pro 게이팅 준수(무료는 week1 문제만 추천).

---

## M2 — 학습 분석 & 합격 예측 (P0, 2주)

> "정말 합격할까?" 불안을 데이터로 해소. 경쟁사 전무 영역.

### 목표
- **합격 확률 예측**: 진도 + 도메인 정답률 + 남은 기간 → "5주 내 87%".
- **필요 일일 학습량**: exam_date 역산 → "하루 3.5시간 / 12문제 필요".
- **진도 추이 차트**: 최근 N일 정답률·활동량 시계열.

### 작업 항목
- `src/lib/analytics/passPredictor.ts` (신규, 순수함수 + 테스트):
  - 입력: 커버리지, 도메인별 정답률(가중), exam까지 D-day, 최근 정답률 추세.
  - 출력: `{ probability: 0~100, requiredDailyQuestions, requiredDailyMinutes, verdict: 'on_track'|'behind'|'at_risk' }`.
  - **주의:** 초기엔 실측 합격 데이터가 없으므로 **휴리스틱 모델**(커버리지×정답률×시간여유)로 시작. 문서에 "추정치" 명시. 향후 실측 쌓이면 로지스틱 회귀로 교체.
- `src/lib/analytics/trend.ts` (신규): `daily_activity` + `quiz_attempts` → 일자별 집계.
- `src/app/api/analytics/route.ts` (신규).
- `src/components/dashboard/PassProbability.tsx` (신규): 확률 게이지 + verdict 배지 + 필요 학습량.
- `src/components/dashboard/TrendChart.tsx` (신규): 경량 SVG 라인차트(외부 차트 라이브러리 지양, 번들 예산).
- 대시보드 통합.

### DB 변경
- `quiz_attempts`에 인덱스 점검(`user_id, attempted_at`) — 추이 쿼리 성능. 없으면 추가.

### 완료 기준
- [ ] exam_date 설정 + 풀이 기록 있으면 합격확률 게이지 표시.
- [ ] "하루 X문제 필요" 계산이 D-day 변화에 반응.
- [ ] 추이 차트가 최근 14/30일 토글.
- [ ] 예측이 "추정" 라벨과 함께 표시(과신 방지).
- [ ] `passPredictor` 순수함수 단위테스트(경계: D-day 0, 미시작, 100% 커버리지).

---

## M3 — 고급 SRS: SM-2 + 오답 이유 (P1, 1.5주 · 병렬 가능)

> Leitner → SM-2로. 개인 난이도 반영. 다른 M과 독립이라 병렬 착수 OK.

### 목표
- SM-2 알고리즘(난이도계수 EF)으로 복습 간격 개인화.
- 오답 시 이유 수집("개념부족/실수/기억안남") → 약점 분석 정밀화.

### 작업 항목
- `src/lib/review/schedule.ts` 확장 or `sm2.ts` 신규:
  - `nextScheduleSM2(item, quality)`: quality 0~5 → EF 갱신, interval 계산.
  - 기존 Leitner와 호환 위해 `review_items`에 `ef`, `interval`, `reps` 추가.
- `src/lib/review/types.ts`: `ReviewItem`에 `ef`, `interval`, `reps`, `lastReason` 추가.
- `reviewService.review()`: quality 매핑(정답+빠름=5, 정답=4, 오답=2 등) — 초기엔 정답/오답 이진 → quality 근사.
- 오답 이유 UI: `src/components/review/WrongReasonPicker.tsx` (복습/퀴즈 오답 직후 3버튼).
- 마이그레이션: `review_items ADD COLUMN ef REAL DEFAULT 2.5, interval INT DEFAULT 0, reps INT DEFAULT 0, last_reason TEXT`.

### DB 변경
```sql
ALTER TABLE review_items
  ADD COLUMN IF NOT EXISTS ef REAL NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS interval INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reps INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reason TEXT;
```

### 완료 기준
- [ ] 같은 문제라도 사용자 정답 이력에 따라 다음 복습 간격이 달라짐.
- [ ] 오답 이유가 저장되고 대시보드 약점 분석에 반영(예: "IAM은 개념부족 60%").
- [ ] 기존 Leitner 데이터 무손실 마이그레이션(box→reps/interval 근사 초기화).
- [ ] SM-2 순수함수 단위테스트.

---

## M4 — 목표 설정 고도화 (P1, 1.5주)

> 현재 exam_date뿐. 목표 정확도·일일시간·동적 재계산 추가.

### 목표
- 목표 정확도(기본 70%), 일일 학습시간 목표 설정.
- 뒤처지면 일정 자동 재계산(강도 +20%).
- Account에 "학습 목표" 탭.

### 작업 항목
- 마이그레이션: `study_plans`에 `target_accuracy INT DEFAULT 70`, `daily_minutes_goal INT`.
- `src/lib/study/plan.ts` `computeToday()` 확장: 뒤처짐(scheduledIndex vs 실제 진도) 감지 → perDay 동적 상향.
- M2 `passPredictor`와 연동: 목표 정확도를 합격확률 임계값으로 사용.
- `src/app/account/` 에 학습목표 편집 섹션 + `api/study/plan` 확장(PATCH).
- `StudyPlanWidget` 확장: 목표 대비 현황 표시.

### DB 변경
```sql
ALTER TABLE study_plans
  ADD COLUMN IF NOT EXISTS target_accuracy INT NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS daily_minutes_goal INT;
```

### 완료 기준
- [ ] 목표 정확도/일일시간 설정·저장·표시.
- [ ] 3일 뒤처지면 "오늘 분량"이 자동 증가하고 그 이유 안내.
- [ ] 합격확률이 목표 정확도 기준으로 계산.

---

## M5 — 스트릭 강화 + 스마트 알림 (P1, 1.5주)

> 스트릭·알림 인프라는 있음. **프리즈·마일스톤·위기 알림**을 얹는다.

### 목표
- 스트릭 프리즈(주 1회), 마일스톤 축하, 캘린더 시각화.
- 진도 미달/합격 위기/마일스톤 알림을 기존 cron에 추가.

### 작업 항목
- 마이그레이션: `user_settings`(또는 기존 알림 컬럼 테이블)에 `streak_freeze_tokens INT DEFAULT 0`, `last_freeze_at`, `notify_progress BOOLEAN DEFAULT true`, `notify_milestone BOOLEAN DEFAULT true`.
- `src/lib/study/activity.ts` `getStreak()` 확장: 프리즈 토큰으로 1일 공백 메움. `longestStreak` 추가.
- `src/components/study/StreakCalendar.tsx` (신규): 최근 N주 히트맵(활동일/프리즈일 색 구분).
- `src/lib/push/reminders.ts` 확장: M2 verdict='at_risk'면 위기 알림, 진도 미달 저녁 알림, 마일스톤(7/30일, 50%/100% 커버리지) 축하.
- 마일스톤 중복발송 방지 플래그(`last_milestone_sent`).

### DB 변경
```sql
-- 알림/스트릭 설정 (기존 알림 컬럼이 붙은 테이블에 추가)
ADD COLUMN IF NOT EXISTS streak_freeze_tokens INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_freeze_at DATE,
ADD COLUMN IF NOT EXISTS notify_progress BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_milestone BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS last_milestone_sent TEXT;
```

### 완료 기준
- [ ] 하루 빠져도 프리즈 토큰 있으면 스트릭 유지.
- [ ] 7일 연속·50% 커버리지 도달 시 축하 알림 1회.
- [ ] at_risk 판정 시 위기 알림(스팸 방지: 주 1회 상한).
- [ ] 캘린더 히트맵이 활동/프리즈 구분 표시.

---

## 공통 규칙 (전 마일스톤)

- **TDD**: 순수함수(passPredictor, sm2, weekToDomain)는 테스트 먼저. 목표 커버리지 80%.
- **Pro 게이팅 준수**: 추천·분석·드릴 모두 무료는 week1 범위. `assertWeekAccess` 재사용.
- **번들 예산**: 차트는 경량 SVG 자작(외부 차트 라이브러리 금지 — landing 성능 규칙).
- **불변성·파일 크기**: 800줄 상한, 기능별 폴더(`recommend/`, `analytics/`, `profile/`).
- **마이그레이션 멱등**: 전부 `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`.
- **예측은 "추정" 라벨**: 실측 합격 데이터 없는 초기 모델은 과신 방지 문구 필수.
- **Next.js 16 주의**(`AGENTS.md`): 라우트 핸들러·미들웨어 시그니처 확인 후 작성.

---

## 착수 순서 (권장)

```
Week 1        : M0 (기반 정비)
Week 2-3      : M1 (개인화 추천)  +  M3 (SM-2) 병렬 착수
Week 3-5      : M2 (합격 예측)
Week 5-6      : M4 (목표 고도화)
Week 6-7      : M5 (스트릭·알림)
```

**첫 스프린트 = M0.** 작고, 나머지 전부의 토대라 여기서 시작한다.

---

## 지표 목표 (마일스톤 완료 후)

| 지표 | 현재(추정) | M1-M2 후 | 전체 후 |
|------|-----------|---------|--------|
| D1 retention | ~60% | 70% | 80% |
| 주간 재방문 | 낮음 | 중간 | 높음 |
| 세션당 문제풀이 | 기준 | +30% | +50% |
| Free→Pro 전환 | ~5% | 10% | 15% |
