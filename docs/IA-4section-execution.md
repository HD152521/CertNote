# CertNote 4-섹션 IA 재설계 — 실행 청사진

> 생성: 2026-07-24 · 9개 영역 에이전트 스코핑 + 총괄 합성 (읽기전용 분석, 10 agents / ~1.07M tokens)
> 원문 설계: [IA-4section-plan.md](./IA-4section-plan.md)

---

# CertNote 4-섹션 IA 재설계 — 통합 실행 청사진

> 저장소 루트: `C:\Users\안용식\CertNote-repo\` (이하 경로는 루트 기준 상대표기).
> 배포: Vercel git-push(원자적). DB: `npm run db:migrate`(수동, append-only 멱등). 도메인: `cert.juganlab.com`(불변).
> 9개 영역 스펙을 하나의 순서화된 실행안으로 통합했고, 영역 간 모순·중복은 §0에서 조정했다.

---

## 0. 조정 결정 (영역 간 모순·중복 해소)

| # | 충돌/중복 | 관련 영역 | 결정 | 근거 |
|---|-----------|-----------|------|------|
| C1 | `reviews` 테이블 SQL이 3벌 존재(후기/SEO/시퀀싱), `hidden` 유무·인덱스 조건 상이 | 후기, SEO, 시퀀싱 | **단일 통합 SQL(§3)**. `hidden` 컬럼 포함 + **부분 인덱스 `WHERE hidden=false`** 채택. 소유=후기 영역, 실행지=`scripts/db-migrate.mjs` 말미 1블록 | 후기 스펙이 hidden+관리자 토글까지 설계해 가장 완전. SEO 스펙의 무조건 인덱스는 노출대상만 인덱싱하는 부분인덱스로 흡수(집계 비용↓) |
| C2 | exam 필드명: 문서 §5 `costUSD/minutes/questions` vs 기존 스키마 `costUsd/durationMin/questionCount` | 시험정보, SEO | **기존 이름 유지**. 문서 필드명은 예시로 간주 | 11개 JSON + `isExamInfo` 타입가드 + 카드 렌더가 기존 이름에 결합. 개명 시 전부 파손. 두 영역 모두 동일 결론 |
| C3 | 섹션→콘텐츠 디렉터리 매핑 헬퍼가 영역마다 다른 이름(`contentDirOfSection` vs `contentCategory` vs `sectionCertHref`) | 콘텐츠, i18n, 로드맵 | **단일 소스 `contentDirOfSection(section, lang)`** in `src/lib/category.ts`. URL 조립은 `sectionCertHref(section, slug)` 한 함수로 별도 캡슐화. 로드맵은 Phase1까지 자기 내부 임시 어댑터→Phase1 랜딩 시 이관 | fs-free인 `category.ts`가 이미 클라이언트 import 안전. 매핑 지점을 한 곳에 가둬 Phase3 en 재편 시 1곳만 수정 |
| C4 | `CertMeta` 인터페이스를 콘텐츠(`section?` 추가)와 D3(`level`을 string 확장)가 동시 편집 | 콘텐츠, D3 | **한 번의 편집으로 `section?`+`level:string` 동시 반영**. `src/lib/content.ts:15` CertLevel 유니온→string, CertMeta에 `section?:Section` | 같은 파일·같은 타입 편집. 순차 편집 시 머지 충돌. Phase0 단일 PR로 묶음 |
| C5 | `next.config.ts` 경로 리다이렉트를 D2·SEO 양쪽이 소유 주장 | D2, SEO | **소유=D2**, SEO는 검증 런북만. 배열 순서: linux 전용 규칙 4개 중 특수→일반. `permanent:true` | 첫 매치 승리 규칙상 linux 규칙을 aws 일반보다 먼저. 두 영역 결론 동일 |
| C6 | "301" vs 실제 308 | D2, SEO, 시퀀싱 | **`permanent:true`(=308) 채택**, 문서/런북에 "308, 구글은 301과 동등 취급" 명시. `statusCode:301` 강제 금지 | Next 16.2.6 `redirects.md` L30-32. 308은 메서드 보존+자산 통합. 3개 영역 합의 |
| C7 | `sitemap.ts`를 D2·SEO·i18n 모두 편집 | SEO(주), D2, i18n | **소유=SEO**. 섹션 순회+`contentDirOfSection` 매핑+en `/en/{section}` 스킴을 SEO가 통합 구현. D2/i18n은 요구사항만 제공 | 단일 파일 다중 편집 방지. SEO가 canonical/robots와 원자 배포를 총괄 |
| C8 | linux `level='professional'` 재분류 | D2, D3, 콘텐츠 | **`professional`→`grade-1`**. `meta.json`+`index.json` 동시 수정(level 중복). D3 레지스트리에 linux 티어(grade-2/grade-1) 정의 | AWS 4티어가 linux에 의미 부적합. D3가 재분류 소유, 콘텐츠가 데이터 반영 |
| C9 | 후기 URL 스킴: `?cert=` 파라미터 vs 경로기반 | 후기, SEO | **목록=`/{section}/reviews`(base canonical), 자격증별 색인=경로 `/{section}/reviews/{cert}`(self-canonical)**. `?cert=`는 base로 canonical 통합, N건 미만 자격증은 noindex | SEO가 파라미터 씬/중복색인 위험 판정. 후기 영역의 `?cert=` 필터는 UX용, 색인은 경로용 |
| C10 | `opengraph-image.tsx`의 `aws-certs` 하드코딩 폴백 버그 | D2, SEO, D3 | **실제 section 세그먼트로 `getCertMeta` 호출** + 레벨 배지는 `certLevelLabel(level, section)`(D3). 3영역 동일 수정을 Phase1 단일 편집으로 | 동일 버그를 3영역이 지적. 중복 작업 방지 |
| C11 | `langOfCategory`(category==='en') 언어 판정 | i18n | **폐기(1릴리스 deprecated 별칭 유지)**, 언어는 URL 접두(`/en`)/`x-language` 헤더에서 `getServerLanguage` 헬퍼로 단일 산출 | category가 주제+언어 겸용을 끊는 것이 IA 재설계 핵심. 페이지별 판정 드리프트 방지 |
| C12 | `en` 축: SECTIONS 편입 여부 | D2, 콘텐츠, i18n | **`en`은 SECTIONS 제외**, `SUPPORTED_CATEGORIES`에만 유지(Phase1). en 콘텐츠 재편(D4)은 **Phase3**로 연기 | en은 언어축이지 섹션 아님. Phase1은 URL 스킴만 `/en/{section}`으로, 콘텐츠 트리는 현행 유지 |

---

## 1. 페이즈별 태스크 보드

### Phase 0 — 하위호환 준비 (무라우팅 변경, 기존 URL 전수 200 유지)

| ID | 태스크 | 담당영역 | 변경파일(요약) | 규모 | 선행의존 |
|----|--------|----------|----------------|------|----------|
| P0-1 | Section 타입·상수·매핑 헬퍼 도입 | 콘텐츠 모델 | `src/lib/category.ts`(Section 타입, SECTIONS, `contentDirOfSection`, `sectionOfCategory`, `sectionLabel`; 기존 상수 유지) | S | 없음 |
| P0-2 | CertMeta에 `section?`+`level:string` 동시 확장 **[C4]** | 콘텐츠+D3 | `src/lib/content.ts`(CertLevel→string, CertMeta.section?, DayRef/SearchEntry/CategoryIndex.certs Pick) | S | P0-1 |
| P0-3 | Level 택소노미 일반화 모듈 | D3 | 신규 `src/lib/levels.ts`(SECTION_TIERS, `certLevelLabel(level,section)`, `isHighlightLevel`, `groupCertsByLevel`); `category.ts`/`content.ts` re-export | M | P0-2 |
| P0-4 | 하드코딩 LEVEL_ORDER·이진배지 제거 | D3 | `src/app/page.tsx`, `src/app/[category]/page.tsx`, `src/components/CertCard.tsx`, `src/components/DayMeta.tsx`, `src/app/[category]/[slug]/page.tsx`, `src/components/SidebarNav.tsx`, `src/app/en/page.tsx`, `src/app/[category]/[slug]/opengraph-image.tsx`(LEVEL_EN 제거) | M | P0-3 |
| P0-5 | 콘텐츠 데이터에 `section` 주입 | 콘텐츠 모델 | `content/aws-certs/index.json`(+11 cert), `content/aws-certs/<11 AWS>/meta.json`(`section:"aws"`), `content/aws-certs/linux-master-1/meta.json`(`section:"linux"`), `content/en/index.json`+`content/en/<11>/meta.json`(`section:"aws"`) | M | P0-1 |
| P0-6 | linux `level` 재분류 **[C8]** | D3+콘텐츠 | `content/aws-certs/linux-master-1/meta.json`+`index.json` 엔트리(`professional`→`grade-1`, order 6/7 불일치 동시 정정) | S | P0-3, P0-5 |
| P0-7 | ExamInfo 스키마 하위호환 확장 | 시험정보 | `src/lib/examInfo.ts`(level→string, `ExamFaq{q,a}`, `faq?/difficulty?/source?/syncedAt?`, `isExamInfo` 옵셔널 검증, `getExamTips(section)` 래핑) | S | P0-2 |
| P0-8 | questions 인덱스 section 스탬프 | 콘텐츠 모델 | `scripts/build-questions-index.mjs`(section 파생), `src/lib/questions.ts`(IndexedQuestion.section?) → 재빌드 | S | P0-5 |
| P0-9 | 무중단 검증 스모크 + 런북 | 시퀀싱 | 신규 `scripts/verify-migration.mjs`, 신규 `docs/IA-migration-runbook.md` | M | 없음(병렬) |

**Phase 0 진입 게이트:** `npm run build` 성공 + 기존 URL(`/aws-certs`, `/aws-certs/{cert}`, 무료 Week1 day, `/en/*`) 전수 200 + `tsc --noEmit` 통과.

---

### Phase 1 — 섹션축 + 301 + 언어 스킴 (단일 원자 커밋)

| ID | 태스크 | 담당영역 | 변경파일(요약) | 규모 | 선행의존 |
|----|--------|----------|----------------|------|----------|
| P1-1 | 섹션 활성화 스위치 | D2/URL | `src/lib/category.ts`(SUPPORTED_CATEGORIES=`[...SECTIONS, EN]`, `aws-certs` 제거, DEFAULT→`aws`) | S | Phase0 완료 |
| P1-2 | linux 폴더 물리 이동 | 콘텐츠 모델 | `git mv content/aws-certs/linux-master-1 → content/linux/linux-master-1`; 신규 `content/linux/index.json`; `aws-certs/index.json`에서 linux 제거 | M | P1-1 |
| P1-3 | 캐시키 section+lang 재정의 **[C3]** | 콘텐츠 모델 | `src/lib/content.ts`(metaCache/daysCache/indexCache 키에 section+lang 포함, CONTENT_ROOT 조립을 `contentDirOfSection` 경유) | M | P1-1 |
| P1-4 | generateStaticParams 섹션×cert 확장 | D2/URL | `src/app/[category]/page.tsx`(SECTIONS map), `src/app/[category]/[slug]/page.tsx`(section×cert 순회, 실패 skip), `[slug]/opengraph-image.tsx` **[C10]** | M | P1-1, P1-3 |
| P1-5 | 경로 301 리다이렉트 **[C5][C6]** | D2/URL | `next.config.ts`(linux 특수→aws 일반 순서 4규칙, `permanent:true`, 기존 VERCEL_HOST 유지) | S | P1-2 |
| P1-6 | sitemap 섹션화 **[C7]** | SEO | `src/app/sitemap.ts`(섹션 순회 `/{section}/{slug}`, 허브+무료 Week1만, `/aws-certs/*` 미포함, Week2+ 제외, en `/en/{section}`) | M | P1-1, P1-3 |
| P1-7 | 언어 URL 축 분리 **[C11]** | i18n | `src/lib/i18n.ts`(PUBLIC_KO_PREFIXES 4섹션+레거시, `stripLangPrefix`/`withLangPrefix`, `getServerLanguage`), 신규 `src/lib/language.ts`(선택), `src/lib/category.ts` `contentDirOfSection(section,lang)` | L | P1-1 |
| P1-8 | LangToggle 스킴 재작성 | i18n | `src/components/LangToggle.tsx`(`/en/{section}/{cert}/...` ↔ `/{section}/...`, week2+ EN→en 허브 폴백) | M | P1-7 |
| P1-9 | 동적 라우트 3종 lang 산출 전환 | i18n | `src/app/[category]/[slug]/[week]/[day]/page.tsx`, `[slug]/page.tsx`, `[category]/page.tsx`(langOfCategory 제거, hreflang 신 스킴, Week1 BreadcrumbList) | M | P1-7 |
| P1-10 | en 홈→`/en/{section}` 허브 | i18n+SEO | `src/app/en/page.tsx`(`contentCategory(section,'en')`, canonical/hreflang `/en/{section}`), en 레거시 301(`/en`→`/en/aws`) | M | P1-7 |
| P1-11 | JSON-LD 공통 빌더 + Breadcrumb 배선 | SEO | 신규 `src/lib/seo/jsonld.ts`, 신규 `src/lib/seo/canonical.ts`; 허브/cert/day에 BreadcrumbList 추가 | M | P1-4 |
| P1-12 | fmt 중복 통합 | i18n | `src/lib/strings/dict.ts`(fmtRich/RichPart 승격), `src/lib/strings/study.ts`(re-export만) | S | 없음(병렬) |

**Phase 1 원자성 규칙:** P1-1~P1-11을 **하나의 커밋**으로 배포. 라우트 활성화·301·sitemap·canonical·robots가 동시에 나가야 `/aws`↔`/aws-certs` 동시 200 창(중복색인) 또는 `/aws` 404 창이 생기지 않는다.

**Phase 1 진입 게이트:** Phase0 게이트 통과 + Phase0가 프로덕션에 선(先)배포되어 안정. **DB 변경 없음.**

---

### Phase 2 — 정보·후기·로드맵 (DB migrate 선행)

| ID | 태스크 | 담당영역 | 변경파일(요약) | 규모 | 선행의존 |
|----|--------|----------|----------------|------|----------|
| P2-0 | **reviews 통합 마이그레이션 실행** **[C1]** | 시퀀싱+후기 | `scripts/db-migrate.mjs` 말미 append(§3 SQL) → 사용자 `npm run db:migrate` | S | Phase1 배포 |
| P2-1 | 후기 데이터 레이어 | 후기 | 신규 `src/lib/reviews/types.ts`, `src/lib/reviews/reviewsRepository.ts` | M | P2-0 |
| P2-2 | 후기 쓰기/조회 API | 후기 | 신규 `src/app/api/reviews/route.ts`(로그인 401·미검증 403·rating·section내 cert 검증·rateLimit), `src/app/api/admin/reviews/route.ts` | M | P2-1 |
| P2-3 | 후기 페이지 + 폼 **[C9]** | 후기 | 신규 `src/app/[category]/reviews/page.tsx`(ISR 60s, 경로 `/{section}/reviews/{cert}` self-canonical), `src/components/reviews/{ReviewForm,ReviewList}.tsx`(dynamic import), `src/app/admin/reviews/page.tsx` | L | P2-2 |
| P2-4 | 후기 i18n + 내부링크 | 후기+i18n | 신규 `src/lib/strings/reviews.ts`(=certReviews), `src/app/[category]/page.tsx`(후기 링크), `src/app/admin/page.tsx` | S | P2-3 |
| P2-5 | Review/AggregateRating JSON-LD(실데이터 only) | SEO | `src/lib/seo/jsonld.ts` 확장, 후기 페이지 배선(count≥1일 때만) | S | P2-3, P1-11 |
| P2-6 | exam FAQ 데이터 오써링 | 시험정보 | `content/exam-info/<11 slug>.json`(faq/difficulty/source/syncedAt, 공식 가이드 대조), 신규 `content/exam-info/linux-master-1.json` | M | P0-7 |
| P2-7 | ExamInfoCard FAQ 렌더 + FAQPage JSON-LD | 시험정보+SEO | `src/components/ExamInfoCard.tsx`(`<details>` 아코디언, `getExamTips(section)`), `src/app/[category]/[slug]/page.tsx`(faq>0일 때 FAQPage, 화면 텍스트와 1:1) | M | P2-6, P1-11 |
| P2-8 | 로드맵 데이터+로더 | 로드맵 | 신규 `content/roadmaps.json`, `src/lib/roadmap.ts`(스키마검증, enrich, `sectionCertHref` 어댑터, graceful skip) | M | Phase1(어댑터로 선행 가능) |
| P2-9 | 로드맵 페이지 SSG | 로드맵 | 신규 `src/app/roadmap/page.tsx`, `src/app/roadmap/[role]/page.tsx`(ItemList+BreadcrumbList) | M | P2-8, P1-11 |
| P2-10 | 로드맵 네비/사이트맵 편입 | 로드맵+SEO | `src/components/Header.tsx`(로드맵 링크), `src/app/sitemap.ts`(`/roadmap/{role}`), `src/app/robots.ts` 확인 | S | P2-9 |
| P2-11 | 후기/exam 강건성 유닛테스트 | 후기·시험·로드맵 | `src/lib/reviews/reviewsRepository.test.ts`, `src/lib/examInfo.test.ts`, `src/lib/roadmap.test.ts` | M | 각 영역 |

**Phase 2 게이트:** P2-0(migrate) 완료가 후기 코드 배포의 하드 선행. 정보/로드맵(DB 무의존)은 후기와 분리 배포 가능(부분 롤백 용이). 후기 API에 **테이블 부재 graceful degrade** 방어코드 필수.

---

### Phase 3 — 신규 콘텐츠 투입 (구조 완성 후 데이터만)

| ID | 태스크 | 담당영역 | 변경파일(요약) | 규모 | 선행의존 |
|----|--------|----------|----------------|------|----------|
| P3-1 | K8s/TF 섹션 콘텐츠 | 콘텐츠 | `content/kubernetes/**`, `content/terraform/**`(meta.json+day) → generateStaticParams 자동 노출 | 사업 | Phase2 |
| P3-2 | 신규 섹션 exam.json | 시험정보 | `content/<section>/<cert>/exam.json` 또는 `content/exam-info/*` | 사업 | P3-1 |
| P3-3 | en 콘텐츠 트리 재편(D4) **[C12]** | i18n+콘텐츠 | `content/{section}/en/**`로 이동 → `contentDirOfSection` 1곳만 스위치 | L | Phase2 |
| P3-4 | 빈 섹션 '준비중' placeholder | D2+시퀀싱 | 섹션 허브 notFound 대신 placeholder, sitemap/네비 제외 조건 | S | Phase1 |

---

## 2. 의존성 그래프

```
Phase 0 (병렬 3레인, 무라우팅변경)
  레인A(타입/코드): P0-1 → P0-2 → P0-3 → P0-4
                                  └─→ P0-7 (examInfo level string)
  레인B(데이터):    P0-1 → P0-5 → P0-6(∧P0-3) → P0-8
  레인C(도구):      P0-9  ────────────────────────────(독립·병렬)
        ▼  게이트: build 성공 + 기존 URL 200 + tsc
Phase 1 (★단일 원자 커밋 — 분리배포 금지)
  P1-1 ┬→ P1-2 → P1-3 ┐
       ├→ P1-4(∧P1-3) ┤
       ├→ P1-5(∧P1-2) ┤→ [원자 배포] → P1-11
       ├→ P1-6(∧P1-3) ┤
       └→ P1-7 → {P1-8, P1-9, P1-10}
  P1-12 ──(독립·병렬, 언제든)
        ▼  게이트: 301/200/canonical 검증(verify --phase=1)
Phase 2 (DB migrate가 후기 게이트)
  P2-0(migrate) → P2-1 → P2-2 → P2-3 → {P2-4, P2-5}
  P0-7 → P2-6 → P2-7                    ┐(DB 무의존, 분리배포 가능)
  Phase1 → P2-8 → P2-9 → P2-10          ┘
        ▼
Phase 3 (콘텐츠·데이터, 배포리스크 아님)
  P3-1 → P3-2 ;  P3-3(en재편, contentDirOfSection 1곳 스위치) ;  P3-4
```

**순서 충돌(반드시 지킬 것):**
- **D3 레벨 일반화(P0-3)는 Phase0 필수.** Phase1 라우트가 K8s/TF 새 티어 문자열을 만나기 전 CertLevel이 string으로 넓어져 있어야 빌드가 안 깨진다. Phase1로 밀리면 빌드 실패.
- **301(P1-5)과 새 라우트(P1-1/P1-4)는 같은 커밋.** 분리 시 404창 또는 중복색인창.
- **linux 이동(P1-2)은 301(P1-5)과 동시.** 데이터만 먼저 옮기면 구 URL 404.
- **migrate(P2-0)는 후기 코드(P2-1~)보다 먼저.** 안 하면 배포 즉시 프로덕션 500.
- **canonical/href의 section 전환(P1-3/P1-9)이 sitemap(P1-6)과 짝.** href가 옛 경로를 방출하면 301과 신호 충돌.

**병렬 가능 구간:**
- Phase0 레인A/B/C 상호 병렬(P0-1 완료 후).
- Phase1의 `fmt 통합(P1-12)`은 완전 독립.
- Phase2에서 **정보(P2-6·7) / 로드맵(P2-8·9·10) / 후기(P2-1~5)** 는 서로 독립 → 3병렬. 단 후기만 P2-0 선행.
- Phase3 P3-1/P3-3/P3-4 상호 독립.

---

## 3. 통합 DB 마이그레이션 (단일 멱등 블록) **[C1]**

이 프로젝트 전체에서 **유일한 DB 변경**. `scripts/db-migrate.mjs` 말미(`tutor_explanations` 블록 뒤)에 append. append-only·멱등이므로 재실행 안전. Phase2 진입 전 사용자가 프로덕션 `DATABASE_URL`로 실행.

```sql
-- ── reviews (사용자 합격 후기; SRS '복습' review와 무관) ──────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section    TEXT   NOT NULL,          -- aws | kubernetes | terraform | linux
  cert_slug  TEXT   NOT NULL,
  rating     INT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  passed     BOOLEAN,
  title      TEXT,
  body       TEXT   NOT NULL,
  hidden     BOOLEAN NOT NULL DEFAULT false,   -- 관리자 숨김
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 표 선존재 시에도 hidden 보장(멱등)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- 목록/필터/AggregateRating 집계 O(log n): 노출 대상(hidden=false)만 인덱싱 [C1: 부분인덱스 채택]
CREATE INDEX IF NOT EXISTS idx_reviews_cert
  ON reviews (section, cert_slug, created_at DESC) WHERE hidden = false;

-- (선택·결정필요) 1인 1자격증 1후기 강제. 문서 미명시 → 도입 여부 결정 필요.
-- CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_cert_uq
--   ON reviews (user_id, section, cert_slug);
```

**주의:** `reviews`는 **언어 컬럼을 두지 않는다**(i18n 영역 권고). 본문은 작성자 언어 그대로 저장, UI 라벨만 i18n. 언어를 행에 넣으면 조합 폭발 재발.
**나머지(`meta.json`의 `section`, `exam-info/*.json`, `roadmaps.json`)는 전부 정적 파일 → DB 마이그레이션 대상 아님.**

---

## 4. 사용자가 직접 해야 할 것 (자동화 불가)

| 시점 | 작업 | 정확한 명령/절차 |
|------|------|------------------|
| **Phase 2 진입 전(필수)** | reviews 테이블 생성 | 프로덕션 `DATABASE_URL`로 `npm run db:migrate` 실행. 로그에 reviews 준비 완료 확인 후 **재실행해 멱등 검증**(에러 0). 이걸 잊고 후기 코드가 배포되면 프로덕션 500 |
| Phase 1 배포 직후 | Search Console 신 sitemap 재제출 | GSC에서 새 `sitemap.xml` 제출 + 구 sitemap 제거. **Change of Address 도구 사용 금지**(도메인 변경 전용, 경로변경엔 오용) |
| Phase 1 배포 직후 | 대표 URL 색인 재요청 | 상위 10~20개 신 URL(`/aws`, `/aws/saa-c03`, `/linux/linux-master-1` 등) URL Inspection→'Request indexing' |
| Phase 1 후 상시 | 커버리지 모니터 | 구 `/aws-certs/*`가 'Page with redirect'(정상), 신 URL이 'Crawled not indexed'/soft-404 아닌지 감시. **301은 최소 1년 유지** |
| Phase 1 전 | SEO 베이스라인 캡처 | GSC Performance(질의/페이지) export + 색인 페이지수 + 상위 랭킹 URL 스크린샷 = 유실 판정 기준선 |
| Phase 2 후 | 시험정보 정확성 대조 | 각 `exam-info/*.json`의 응시료·합격점수·도메인 비중(합=100)·유효기간을 공식 가이드(`source` URL)와 대조 후 커밋 |
| 배포 전 상시 | 실제 status 확인 | `curl -sI`로 `permanent:true`가 실제 308 반환·단일홉·루프없음 확인 |

> 참고: 이 프로젝트는 **CI/Vercel 빌드에 마이그레이션 훅이 없다.** migrate는 100% 수동. 런북(`docs/IA-migration-runbook.md`)에 '후기 배포 전 migrate 먼저'를 명문화.

---

## 5. 최상위 리스크 5개 + 완화

| # | 리스크 | 영향 | 완화 |
|---|--------|------|------|
| R1 | **301과 새 라우트 분리 배포** → `/aws` 404창 또는 `/aws-certs` 중복색인창 → 랭킹 유실 | CRITICAL | Phase1을 **단일 원자 커밋**으로(Vercel 원자 배포 활용). 배포 직후 `verify-migration.mjs --phase=1`로 301/200 즉시 검증 |
| R2 | **DB migrate 누락** → 후기 참조 코드 배포 순간 프로덕션 500 | CRITICAL | 런북에 'migrate 먼저' 하드 게이트 + 후기 API·페이지에 **테이블 부재 graceful degrade**(빈 목록/작성 비활성) 방어코드 요구 |
| R3 | **리다이렉트 순서 오류** → `/aws-certs/linux-master-1/*`가 존재하지 않는 `/aws/linux-master-1/*`로 흡수 → 404 대량 | HIGH | `next.config` 배열에서 **linux 특수규칙을 aws 일반규칙보다 앞**에 고정 + verify 스크립트 회귀 테스트(`curl -sI` linux→`/linux/...` 단언) |
| R4 | **캐시키 충돌**(en/ko가 같은 section+cert 키로 뭉개짐) 또는 category→section 전환 시 콜드스타트 N+1 | HIGH | Phase1 캐시키에 **lang 필수 포함**(P1-3). Phase0 별칭은 category 키 보존, 섹션은 조회 표면에서만 매핑. 콜드/웜 동일결과 유닛테스트 |
| R5 | **구조화데이터 스팸**(후기 0건 AggregateRating, 빈 FAQPage, 화면 미노출 JSON-LD) → 구글 수동조치 | HIGH | Review/AggregateRating은 **count≥1일 때만**, FAQPage는 **faq.length>0일 때만**, JSON-LD Q/A는 화면 `<details>` 렌더 텍스트와 **1:1 동일 소스**. Rich Results Test 게이트 |

> 차순위(HIGH): Week2+ noindex 분기가 라우팅 리팩터 중 유실되면 유료 콘텐츠 색인 → P1-9에 보존 명시+검증 케이스 고정. sitemap에 301된 `/aws-certs` 실으면 GSC 경고+크롤예산 낭비 → 미포함 강제.

---

## 6. 권장 시작점 (가장 먼저 안전하게 착수할 Phase 0 태스크)

전부 **무라우팅 변경·기존 URL 200 유지·롤백 불요(append-only/옵셔널)** 이라 리스크 없이 착수 가능. 순서대로:

1. **P0-1 — Section 축 상수/헬퍼 도입** (`src/lib/category.ts`)
   `Section` 타입, `SECTIONS=['aws','linux']`, `contentDirOfSection(section,lang)`(aws→`'aws-certs'`, linux→`'linux'`, en→`'en'`), `sectionOfCategory`, `sectionLabel` 추가. **기존 `DEFAULT_CATEGORY`/`EN_CATEGORY`/`SUPPORTED_CATEGORIES`는 그대로 유지**(별칭 레이어). fs-free 유지로 `SidebarNav` 등 클라이언트 import 안전. → 다른 모든 Phase0 태스크의 뿌리.

2. **P0-2 — CertMeta 단일 확장** **[C4]** (`src/lib/content.ts`)
   `CertLevel` 유니온을 `string`으로 넓히고 `CertMeta.section?:Section` 동시 추가. DayRef/SearchEntry/CategoryIndex.certs Pick 반영. `certLevelLabel` re-export 유지. **콘텐츠·D3 두 영역의 CertMeta 편집을 한 번에** 처리해 머지 충돌 원천 차단.

3. **P0-3 — 레벨 택소노미 일반화 모듈** (신규 `src/lib/levels.ts`)
   `SECTION_TIERS`(aws 4티어=회귀0, linux=grade-2/grade-1, k8s/tf 예시), `certLevelLabel(level, section='aws')`(미등록→title-case 폴백), `isHighlightLevel`, `groupCertsByLevel`(order 정렬+first-seen 그룹, 하드코딩 LEVEL_ORDER 제거). `category.ts`/`content.ts`가 re-export. **section 미도입 구간에도 기본값 `'aws'`로 폴백**해 회귀 방지. → **시퀀싱 영역이 Phase0 필수로 못박은 항목**(Phase1 빌드 안전의 전제).

4. **P0-5 — 콘텐츠 `section` 일괄 주입** (`content/**` 26개 meta.json + 3개 index.json)
   스크립트로 일괄 주입 후 검증(수동 편집 드리프트 방지). aws 11종+en 11종→`"section":"aws"`, linux→`"section":"linux"`. index.json↔meta.json 값 일치 검증. **P0-6(linux level 재분류)·기존 order 6/7 불일치 정정 동반**. 옵셔널 필드라 기존 파서 무해.

5. **P0-9 — 검증 스모크 + 런북** (신규 `scripts/verify-migration.mjs`, `docs/IA-migration-runbook.md`)
   페이즈별 읽기전용 스모크(Phase0: 기존 URL 전수 200 / Phase1: 301·200·canonical·Week2+ noindex 부재)와 순서형 체크리스트(진입조건→원자 배포 단위→사용자 수동작업 정확한 명령→검증→롤백). **완전 독립·병렬**로 1~4와 동시 진행 가능하며, 이후 모든 페이즈의 게이트 도구가 된다.

> 이 5개 완료 후 게이트(`npm run build` + 기존 URL 200 + `tsc --noEmit`)를 통과하면, Phase0 나머지(P0-4/P0-7/P0-8)를 마치고 **Phase0를 프로덕션에 선배포**해 안정화한 뒤 Phase1 원자 커밋을 준비한다.