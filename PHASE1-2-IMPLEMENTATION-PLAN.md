# CertNote Phase 1, 2: 다국어 UI 지원 상세 구현 계획

**작성일:** 2026-07-14
**상태:** 계획 수립 완료
**범위:** Phase 1 (UI 영어화) + Phase 2 (API 언어 파라미터)

---

## 현재 상황 정리

### 이미 구현된 것 ✅
- AI 튜터: `prompt.ts`에 ko/en 완전 지원
- TutorPanel.tsx: `usePathname()` → `/en` 감지 → API에 `language` 전달
- 헤더: `LangToggle` 컴포넌트로 KO/EN 토글 기능
- 라우팅: `/` (한국어) vs `/en/...` (영어) 구조 확립
- 홈페이지: `/en/page.tsx` 영문화 완료

### 아직 구현 안 된 것 ❌
- Phase 1: 다른 모든 페이지의 UI 텍스트 영어화
- Phase 2: API 라우트에서 `language` 파라미터 처리 및 응답 메시지 지역화
- 레이아웃: `<html lang="ko">` 하드코딩

### 라우팅 구조
```
/                          → 한국어 (기본 카테고리)
/exam, /dashboard, /pricing, ...   → 한국어 페이지들

/en                        → 영어 홈 (특수 페이지)
/en/[cert]/week1/day[1-5]  → 영어 콘텐츠 (현재 유일하게 지원)

다른 페이지의 영어판은?    → /en으로 리다이렉트 또는 영어 UI만 표시
```

---

## Phase 1: UI 영어화 (모든 페이지)

### 전략: 최소 변경, 조건부 렌더링

**원칙:**
- 새 라이브러리 금지 (next-intl, i18next 등)
- `usePathname()` → `/en` 감지 → 조건부 렌더링
- 언어 문자열은 컴포넌트 최상단 또는 공용 함수에서 관리
- 기존 코드 변경 최소화

### 구현 패턴

#### 패턴 1: 간단한 문자열 (권장)
```tsx
'use client';
import { usePathname } from 'next/navigation';

function detectLanguage(pathname: string): 'ko' | 'en' {
  return pathname.startsWith('/en') ? 'en' : 'ko';
}

export function MyComponent() {
  const pathname = usePathname();
  const lang = detectLanguage(pathname);
  
  return (
    <button>
      {lang === 'en' ? 'Get Started' : '시작하기'}
    </button>
  );
}
```

#### 패턴 2: 상수 객체 (많은 텍스트)
```tsx
'use client';
import { usePathname } from 'next/navigation';

const STRINGS = {
  ko: {
    title: '모의고사',
    description: '실제 시험처럼 풀고 제출 후 한 번에 채점받으세요.',
  },
  en: {
    title: 'Mock Exam',
    description: 'Take the full exam like the real test, then submit for instant scoring.',
  },
};

function detectLanguage(pathname: string): 'ko' | 'en' {
  return pathname.startsWith('/en') ? 'en' : 'ko';
}

export function ExamHeader() {
  const pathname = usePathname();
  const lang = detectLanguage(pathname);
  const s = STRINGS[lang];
  
  return (
    <header>
      <h1>{s.title}</h1>
      <p>{s.description}</p>
    </header>
  );
}
```

#### 패턴 3: 공용 유틸 함수 (재사용성)
`src/lib/i18n.ts` 생성:
```typescript
import { headers } from 'next/headers';

export type Language = 'ko' | 'en';

export function detectLanguage(pathname: string): Language {
  return pathname.startsWith('/en') ? 'en' : 'ko';
}

// 서버 컴포넌트에서도 사용 가능
export async function detectLanguageServer(): Promise<Language> {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '/';
  return detectLanguage(pathname);
}

export const STRINGS = {
  ko: { /* ... */ },
  en: { /* ... */ },
} as const;

// 명시적 선택
export function t(lang: Language, key: keyof typeof STRINGS.ko): string {
  return STRINGS[lang][key] as string;
}
```

**클라이언트에서 사용:**
```tsx
'use client';
import { usePathname } from 'next/navigation';
import { detectLanguage, t } from '@/lib/i18n';

export function Component() {
  const pathname = usePathname();
  const lang = detectLanguage(pathname);
  
  return <h1>{t(lang, 'title')}</h1>;
}
```

---

## Phase 1 상세: 파일별 수정 목록

### 🔴 우선도 1: 네비게이션 (Header + Sidebar)

#### 1.1 `src/app/layout.tsx`
**수정:**
- `<html lang="ko">` → `<html lang={lang}>`
- 클라이언트 컴포넌트가 아니므로 pathname 직접 불가
- **해결:** `usePathname()` 필요한 부분을 클라이언트 컴포넌트로 분리

**구체 수정:**
```diff
- <html lang="ko" suppressHydrationWarning ...>
+ <html lang="isEnPath ? 'en' : 'ko'}" suppressHydrationWarning ...>
```
(pathname 감지는 클라이언트 컴포넌트 필요)

**대안:** 현재는 ko만 유지하되, Phase 1 완료 후 수정

#### 1.2 `src/components/Header.tsx`
**이미 구현:** LangToggle이 있으므로 추가 작업 불필요

#### 1.3 `src/components/Sidebar.tsx` (또는 SidebarNav.tsx)
**확인 필요:** 사이드바 텍스트 (예: "Week 1", "Day 1" 등) 확인

---

### 🟡 우선도 2: 주요 페이지 (13+개)

#### 2.1 `/dashboard`
**파일:** `src/app/dashboard/page.tsx`
**내용:** 
- 대시보드 제목, 설명
- 통계 라벨 (예: "정답률", "학습 진도")
- 버튼 텍스트

**패턴:** 상수 객체 패턴 사용
```tsx
const DASHBOARD_STRINGS = {
  ko: {
    title: '대시보드',
    stats: '통계',
    correctRate: '정답률',
  },
  en: {
    title: 'Dashboard',
    stats: 'Statistics',
    correctRate: 'Correct Rate',
  },
};
```

#### 2.2 `/exam`
**파일:** `src/app/exam/page.tsx`
**내용:**
- "모의고사" → "Mock Exam"
- 설명문
- 버튼 ("응시하기" → "Start Exam")

#### 2.3 `/pricing`
**파일:** `src/app/pricing/page.tsx` (가장 많은 텍스트)
**내용:**
- FREE_FEATURES 배열
- PRO_FEATURES 배열
- 가격표 텍스트
- 버튼 ("무료로 시작" → "Get Started Free")
- 메타데이터

**구체 예:**
```typescript
const PRICING_STRINGS = {
  ko: {
    title: '필요한 만큼만, 합리적으로',
    free: 'Free',
    pro: 'Pro',
    freeFeatures: ['각 자격증 Week 1 전체...', ...],
    proFeatures: ['6개 트랙 전체...', ...],
    startFree: '무료로 시작',
  },
  en: {
    title: 'Pay only for what you need',
    free: 'Free',
    pro: 'Pro',
    freeFeatures: ['Full Week 1 study...', ...],
    proFeatures: ['All 6 tracks...', ...],
    startFree: 'Get Started Free',
  },
};
```

#### 2.4 `/checkout`
**파일:** `src/app/checkout/page.tsx`
**내용:**
- 결제 단계 ("1단계", "2단계")
- 입력 필드 레이블
- 버튼 텍스트
- 에러 메시지

#### 2.5 `/account`
**파일:** `src/app/account/page.tsx`
**내용:**
- 계정 설정 제목
- 폼 필드 라벨 (예: "이메일", "비밀번호")
- 버튼 ("저장", "변경")

#### 2.6 `/account/subscription`
**파일:** `src/app/account/subscription/page.tsx`
**내용:**
- 구독 상태 메시지
- "Plan details", "Cancel subscription"

#### 2.7 `/notebook`
**파일:** `src/app/notebook/page.tsx`
**내용:**
- 오답노트 제목
- 필터 옵션 ("전체", "오답", "복습")
- 테이블 헤더 (문제, 정답 상태, 날짜 등)

#### 2.8 `/review`
**파일:** `src/app/review/page.tsx`
**내용:**
- 복습 페이지 제목, 설명
- 카드 텍스트

#### 2.9 `/login`
**파일:** `src/app/login/page.tsx`
**내용:**
- "로그인" → "Sign In"
- 폼 라벨, 버튼
- "계정이 없으신가요?" → "Don't have an account?"

#### 2.10 `/signup`
**파일:** `src/app/signup/page.tsx`
**내용:**
- "회원가입" → "Sign Up"
- 폼 라벨, 약관 텍스트
- 링크 텍스트

#### 2.11 `/forgot` & `/reset` & `/verify`
**파일:** `src/app/forgot/page.tsx` 등
**내용:**
- 비밀번호 재설정 안내
- "이메일을 확인해 주세요" → "Check your email"

#### 2.12 `/privacy`
**파일:** `src/app/privacy/page.tsx`
**내용:**
- 정책 제목 (주로 HTML, 메타데이터만)

#### 2.13 `/onboarding` (if exists)
**파일:** `src/app/onboarding/profile/page.tsx`
**내용:**
- 온보딩 단계 텍스트
- 입력 필드 라벨

#### 2.14 `/admin`
**파일:** `src/app/admin/page.tsx`, `src/app/admin/users/page.tsx`
**내용:**
- 어드민 패널 제목
- 테이블 헤더, 버튼

---

### 🟢 우선도 3: 컴포넌트 (공용 UI)

모든 컴포넌트에서 사용되는 텍스트:
- 에러 메시지: "로드 중...", "오류가 발생했습니다"
- 버튼: "확인", "취소", "저장"
- 상태: "로딩 중", "성공", "실패"

**중앙 관리:** `src/lib/i18n.ts`에 `COMMON_STRINGS` 정의
```typescript
export const COMMON_STRINGS = {
  ko: {
    loading: '로드 중...',
    error: '오류가 발생했습니다',
    confirm: '확인',
    cancel: '취소',
    save: '저장',
    delete: '삭제',
    back: '뒤로가기',
  },
  en: {
    loading: 'Loading...',
    error: 'An error occurred',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    back: 'Back',
  },
};
```

**사용:**
```tsx
import { COMMON_STRINGS, detectLanguage } from '@/lib/i18n';

export function DeleteButton() {
  const lang = detectLanguage(usePathname());
  return <button>{COMMON_STRINGS[lang].delete}</button>;
}
```

---

## Phase 2: API 언어 파라미터 지원

### 전략: 요청에서 `language` 수신 → 응답 메시지 지역화

### 2.1 AI 튜터 API 수정

#### `src/app/api/tutor/route.ts`
**변경:**
```diff
  const body = await req.json().catch(() => null);
  if (!body || typeof body.questionId !== 'string') {
-   throw new AppError(400, 'invalid_body', '문제 ID가 필요합니다.');
+   const lang: Language = body.language === 'en' ? 'en' : 'ko';
+   throw new AppError(400, 'invalid_body', getErrorMessage(lang, 'invalid_body'));
  }
```

**에러 메시지 함수 생성:** `src/lib/tutor/errors.ts`
```typescript
import type { Language } from '@/lib/i18n';

export function getErrorMessage(lang: Language, code: string): string {
  const messages: Record<Language, Record<string, string>> = {
    ko: {
      invalid_body: '문제 ID가 필요합니다.',
      question_not_found: '문제를 찾을 수 없습니다.',
      pro_required: 'AI 오답 튜터는 Pro 전용 기능입니다.',
      tutor_unavailable: 'AI 튜터가 아직 설정되지 않았습니다.',
      rate_limited: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
      daily_limit: '오늘 AI 설명 한도를 모두 사용했어요. 내일 다시 이용해 주세요.',
    },
    en: {
      invalid_body: 'Question ID is required.',
      question_not_found: 'Question not found.',
      pro_required: 'AI tutor is Pro-only.',
      tutor_unavailable: 'AI tutor is not yet configured.',
      rate_limited: 'Too many requests. Please try again later.',
      daily_limit: 'Daily limit reached. Come back tomorrow.',
    },
  };
  return messages[lang][code] || 'Unknown error';
}
```

**수정된 route.ts:**
```typescript
import type { Language } from '@/lib/i18n';
import { getErrorMessage as getTutorErrorMessage } from '@/lib/tutor/errors';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const lang: Language = body?.language === 'en' ? 'en' : 'ko';
    
    // ... 기존 검증 ...
    
    if (!body || typeof body.questionId !== 'string') {
      throw new AppError(400, 'invalid_body', getTutorErrorMessage(lang, 'invalid_body'));
    }
    
    // streamTutor에 language 전달
    const sdkStream = streamTutor(question, selected, history, lang);
    
    // ...
  } catch (err) {
    return errorResponse(err);
  }
}
```

#### `src/lib/tutor/tutorService.ts`
**변경:**
```typescript
import type { Language } from '@/lib/i18n';
import { buildSystemPrompt, buildUserPrompt } from './prompt';

export function streamTutor(
  q: IndexedQuestion, 
  selected: string, 
  history: TutorTurn[],
  language: Language = 'ko' // ← 추가
) {
  const messages = [
    { role: 'user' as const, content: buildUserPrompt(q, selected, language) },
    ...history.map((t) => ({ role: t.role, content: t.text })),
  ];
  
  return getClient().messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(language),
    ...(supportsEffort ? { output_config: { effort: 'medium' as const } } : {}),
    messages,
  });
}
```

#### TutorPanel.tsx 에러 메시지도 지역화
```diff
- const ERR: Record<string, string> = {
-   rate_limited: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
+ import { getTutorErrorMessage } from '@/lib/tutor/errors';
+ 
+ const ERR = {
+   ko: {
+     rate_limited: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
+     tutor_unavailable: 'AI 튜터가 아직 준비 중이에요.',
+     question_not_found: '문제 정보를 찾지 못했어요.',
+   },
+   en: {
+     rate_limited: 'Too many requests. Please try again soon.',
+     tutor_unavailable: 'AI tutor is not ready yet.',
+     question_not_found: 'Could not find question info.',
+   },
+ };
```

### 2.2 다른 API 라우트 (선택적)

현재 중요하지 않지만, 장기적으로 모든 API가 `language` 파라미터를 지원해야 함:

#### `src/app/api/exam/start/route.ts` (if 에러 반환)
#### `src/app/api/account/profile/route.ts` (if 에러 반환)
#### `src/app/api/auth/...` (인증 에러 메시지)

**패턴 (공통):**
```typescript
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const lang: Language = body?.language === 'en' ? 'en' : 'ko';
    
    // ... 비즈니스 로직 ...
    
    if (error) {
      throw new AppError(400, 'some_error', getErrorMessage(lang, 'some_error'));
    }
  } catch (err) {
    return errorResponse(err);
  }
}
```

---

## 구현 순서 (권장)

### Step 1: 기반 구성 (1-2시간)
1. `src/lib/i18n.ts` 생성
   - `detectLanguage()` 함수
   - `Language` 타입
   - `COMMON_STRINGS` 상수

2. `src/lib/tutor/errors.ts` 생성
   - 튜터 에러 메시지 지역화

### Step 2: Phase 1 - UI 영어화 (6-8시간)
**일괄 처리 권장:**

1. **네비게이션** (1시간)
   - Header.tsx 검토 (이미 완료)
   - Sidebar.tsx 수정

2. **홈 + 인증 페이지** (1.5시간)
   - `/page.tsx`
   - `/login`, `/signup`
   - `/forgot`, `/reset`, `/verify`

3. **메인 기능 페이지** (3시간)
   - `/dashboard`
   - `/exam`
   - `/notebook`
   - `/review`

4. **상품/계정 페이지** (2시간)
   - `/pricing`
   - `/checkout`
   - `/account`
   - `/account/subscription`

5. **기타 페이지** (0.5시간)
   - `/admin`, `/onboarding`, `/privacy`, `/welcome`

### Step 3: Phase 2 - API 언어 지원 (2-3시간)
1. **튜터 API** (1시간)
   - route.ts에 language 파라미터 처리
   - streamTutor에 language 전달
   - TutorPanel 에러 메시지 지역화

2. **다른 API** (1-2시간)
   - 주요 API부터 점진적 지원
   - 에러 메시지 일관성 유지

---

## 테스트 전략

### 테스트 체크리스트

#### Phase 1 테스트
- [ ] `/` (한국어 홈) 로드 → 모든 텍스트 한국어 확인
- [ ] `/en` (영어 홈) 로드 → 모든 텍스트 영어 확인
- [ ] `/en/[cert]/week1/day1` → 영어 콘텐츠 + 영어 UI
- [ ] 각 페이지에서 LangToggle 클릭 → 언어 전환 동작 확인
- [ ] 모바일 (lg 미만) → 햄버거 메뉴에서 언어 전환

#### Phase 2 테스트
- [ ] TutorPanel: "AI 설명 보기" 클릭 (한국어)
- [ ] TutorPanel: "Ask a follow-up question" 입력 (영어 페이지에서)
- [ ] API 에러 메시지:
  - Pro 아닌 사용자 → 한국어/영어 에러 메시지 확인
  - Rate limit 초과 → 한국어/영어 에러 메시지 확인
  - 일일 한도 초과 → 한국어/영어 에러 메시지 확인

#### E2E 테스트 (Playwright)
```typescript
test('korean page loads in korean', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('h1')).toContainText('대시보드');
});

test('english page loads in english', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('h1')).toContainText('AWS certification prep');
});

test('language toggle switches correctly', async ({ page }) => {
  await page.goto('/exam');
  await page.click('[aria-label="Language"] a:has-text("EN")');
  // Should redirect to /en (since /en/exam doesn't exist)
});

test('tutor error messages are localized', async ({ page }) => {
  // Start tutor, trigger error
  // Verify error message language
});
```

---

## 파일 체크리스트 (Phase 1 완료)

### 생성할 파일
- [ ] `src/lib/i18n.ts` (새로 생성)
- [ ] `src/lib/tutor/errors.ts` (새로 생성)

### 수정할 파일
- [ ] `src/app/page.tsx`
- [ ] `src/app/dashboard/page.tsx`
- [ ] `src/app/exam/page.tsx`
- [ ] `src/app/pricing/page.tsx`
- [ ] `src/app/checkout/page.tsx`
- [ ] `src/app/account/page.tsx`
- [ ] `src/app/account/subscription/page.tsx`
- [ ] `src/app/notebook/page.tsx`
- [ ] `src/app/review/page.tsx`
- [ ] `src/app/login/page.tsx`
- [ ] `src/app/signup/page.tsx`
- [ ] `src/app/forgot/page.tsx`
- [ ] `src/app/reset/page.tsx`
- [ ] `src/app/verify/page.tsx`
- [ ] `src/app/privacy/page.tsx`
- [ ] `src/app/welcome/page.tsx`
- [ ] `src/app/onboarding/profile/page.tsx`
- [ ] `src/app/admin/page.tsx`
- [ ] `src/app/admin/users/page.tsx`
- [ ] `src/components/Header.tsx` (검토만)
- [ ] `src/components/Sidebar.tsx` (검토 필요)
- [ ] `src/components/AuthNav.tsx` (검토 필요)
- [ ] `src/components/MobileNav.tsx` (검토 필요)

### Phase 2 수정 파일
- [ ] `src/app/api/tutor/route.ts`
- [ ] `src/lib/tutor/tutorService.ts`
- [ ] `src/components/tutor/TutorPanel.tsx`

---

## 복잡도 추정

| Phase | 항목 | 파일 수 | 예상 시간 | 난이도 |
|-------|------|--------|---------|--------|
| 1 | 기반 구성 | 2 | 1-2h | 낮음 |
| 1 | 네비게이션 | 5 | 1h | 낮음 |
| 1 | 인증 페이지 | 5 | 1.5h | 낮음 |
| 1 | 주요 기능 | 4 | 3h | 중간 |
| 1 | 상품/계정 | 4 | 2h | 중간 |
| 1 | 기타 | 5 | 0.5h | 낮음 |
| 2 | 튜터 API | 3 | 1h | 중간 |
| 2 | 기타 API | N/A | 1-2h | 낮음~중간 |
| - | **총계** | **~30** | **10-14h** | 중간 |

---

## 주의사항

### ⚠️ 해야 할 일
- Phase 1: 모든 텍스트 UI가 영어화되어야 함
- Phase 2: API 에러 메시지도 일관되게 지역화
- 메타데이터: 페이지 title, description도 지역화 (선택사항이지만 권장)

### ❌ 하지 말아야 할 일
- 새로운 i18n 라이브러리 추가 금지
- 복잡한 번역 함수 생성 금지
- 과도한 추상화 금지

### 🔄 향후 개선
- Phase 2 후: 다른 API들도 점진적으로 language 지원 추가
- 메타데이터 지역화 (OG tags, 페이지 title)
- 폰트 최적화 (Korean vs. Latin)

---

## 참고: 기존 코드 패턴

### 이미 구현된 지역화 사례
```typescript
// src/components/tutor/TutorPanel.tsx
const ERR: Record<string, string> = {
  rate_limited: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
};

// src/lib/tutor/prompt.ts
export function buildSystemPrompt(lang: Language = 'ko'): string {
  if (lang === 'en') {
    return 'You are a friendly AWS certification tutor...';
  }
  return '당신은 AWS 자격증 학습을 돕는 친절하고 정확한 한국어 튜터입니다...';
}
```

이 패턴을 모든 페이지/컴포넌트에 확장하면 됨.

---

**다음 단계:** Phase 1 구현 시작 → 기반 구성 (i18n.ts, errors.ts) 먼저 완료
