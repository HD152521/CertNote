# CertNote 4-섹션 IA 재설계 (Design Doc)

> 작성: 2026-07-23 · 상태: 초안(설계 확정 전) · 목표: 코드 착수 전 청사진 합의
> 원칙: 사용자 검색 행동 + SEO + 리소스/아키텍처 최적화 + 무중단·무SEO유실 마이그레이션

---

## 0. 목표와 범위

**비전:** AWS 단일 주제 → **클라우드/PaaS를 아우르는 4섹션**으로 확장.

- 섹션(4): **AWS · Kubernetes · Terraform · Linux**
- 각 섹션 안에: 자격증 트랙(학습 공간) + **후기 1곳**(자격증 선택식) + **정보/로드맵 1곳**(직무별 순서)
- 자격증별: **간결하되 SEO에 충분한** 구조화 정보(응시료·도메인·FAQ)

**비목표(이번 설계 밖):** 결제구조 변경, 신규 자격증 학습 콘텐츠 제작(별도 비용), 앱화.

---

## 1. 현재 아키텍처 실사 (fact-based)

| 요소 | 현재 상태 | 함의 |
|------|----------|------|
| 카테고리 | `DEFAULT_CATEGORY='aws-certs'`, `EN_CATEGORY='en'` | **주제와 언어가 한 축에 혼재** ← 최대 문제 |
| Linux | `linux-master-1`이 **aws-certs 카테고리 안의 자격증** | 섹션 분리 시 이동 필요(URL 변경) |
| 콘텐츠 | `content/<category>/<slug>/week<N>/day<M>.md` + `meta.json`+`index.json`+`README.md` | 파일기반, 프로덕션 프로세스 메모이즈 |
| CertMeta.level | AWS 4티어(`foundational/associate/professional/specialty`) | **AWS 전용 택소노미** — K8s/TF/Linux엔 안 맞음 |
| 라우팅 | `/<category>/<slug>/week<N>/day<M>`, 허브 `/<category>`, `/<category>/<slug>` | 카테고리가 URL 최상위 세그먼트 |
| 시험정보 | `ExamInfoCard`(examInfo) 일부 존재 | 확장 대상(응시료·도메인·FAQ) |
| 후기 | **없음** (feedback/waitlist만 존재) | 신규 기능 |
| 언어 | en은 Week1만 번역, 문항 id 재사용 | 언어는 **콘텐츠 축이 아니라 표시 축** |

---

## 2. 핵심 설계 결정 (Design Decisions)

### D1. 두 축 분리 — Section(주제) × Language(언어)  ★가장 중요
현재 `category`가 두 가지를 겸함 → **명시적으로 분리**한다.

- **Section**: `aws | kubernetes | terraform | linux` (콘텐츠 최상위 축)
- **Language**: `ko`(기본) | `en` (표시/번역 축, 직교)

> 이 분리를 안 하면 "en-kubernetes" 같은 조합 폭발이 생기고 네비/사이트맵/대시보드가 계속 특수분기된다.

### D2. URL 체계 (SEO 핵심)
**결정:** `/{section}/{cert}/week{N}/day{M}` (ko 기본), 영어는 `/en/{section}/{cert}/...` 접두.

| 페이지 | URL | 색인 | 생성 |
|--------|-----|------|------|
| 섹션 허브(로드맵) | `/{section}` | index | SSG |
| 자격증 정보/학습 허브 | `/{section}/{cert}` | index | SSG |
| day 학습(무료 Week1) | `/{section}/{cert}/week1/day{M}` | index | SSG |
| day 학습(Week2+) | 동일 패턴 | **noindex**(프리미엄) | SSG(발췌만) |
| 후기 | `/{section}/reviews` (필터 `?cert=`) | index | ISR/동적 |
| 직무 로드맵 | `/roadmap/{role}` 또는 `/{section}#roadmap` | index | SSG |

**기존 URL 보존:** `/aws-certs/*` → `301` → `/aws/*`, `/aws-certs/linux-master-1/*` → `/linux/linux-master-1/*`. (Phase 1에서 next.config redirects + sitemap/canonical 갱신)

### D3. Level 택소노미 일반화
`CertMeta.level`을 **섹션별 티어**로 확장(문자열 + `order`로 정렬). AWS는 기존 4티어 유지, K8s/TF/Linux는 각자 티어 정의. `certLevelLabel`을 섹션-aware 매핑으로 교체.

### D4. 콘텐츠 폴더 구조
```
content/
  aws/<cert>/{meta.json, index.json, README.md, exam.json, week<N>/day<M>.md}
  kubernetes/<cert>/...
  terraform/<cert>/...
  linux/linux-master-1/...
  aws/<cert>/en/week1/day<M>.md   ← 언어는 cert 내부 하위(권장) 또는 기존 en 트리 유지(Phase 후순위)
```
`exam.json`(신규): 자격증 시험정보(응시료·시간·문항·도메인·유효기간·접수링크·난이도).

### D5. 후기(리뷰) — 섹션당 1곳, 자격증 선택식
- **DB 테이블 신설** `reviews(id, user_id, section, cert_slug, rating, passed, title, body, created_at)`.
- 쓰기 UI: 섹션 후기 페이지에서 **자격증 드롭다운 선택** 후 작성.
- 표시: 섹션 후기 목록 + `?cert=` 필터(자격증별 후기 SEO 확보). 초기 밀도 위해 섹션 단위 집약.

### D6. 정보 & 로드맵
- **자격증별 정보**(cert 허브): `exam.json` 렌더 + **FAQ JSON-LD** → "SAA-C03 응시료" 등 롱테일·featured snippet.
- **직무 로드맵**: `roadmaps.json`(직무→자격증 순서). "클라우드 엔지니어 자격증 순서" 등 광범위 키워드. 섹션 교차 가능(예: DevOps = AWS+K8s+TF).

---

## 3. 사용자 행동 & 정보구조 (검색 행동 반영)

**검색 유입 유형별 랜딩(퍼널 상단→하단):**
```
"직무별 자격증 순서/로드맵"  → /roadmap/{role}         (최상단, 최대 볼륨)
"자격증 종류/순서"           → /{section}               (섹션 허브)
"{cert} 응시료/난이도/도메인" → /{section}/{cert}         (자격증 정보, 롱테일)
"{cert} 후기/합격"           → /{section}/reviews?cert=  (사회적 증거)
"{cert} 공부/문제"           → /{section}/{cert}/week1/… (학습 진입, 무료)
```
**전환 퍼널:** 로드맵/정보(비로그인 SEO) → "Week1 무료 시작" → 가입 → 학습·복습·예측 → 구독.

**네비게이션 트리(글로벌 헤더):**
```
[섹션 ▾ AWS · Kubernetes · Terraform · Linux]  [로드맵]  [검색]  [대시보드/로그인]
  섹션 클릭 → 섹션 허브(로드맵+자격증 목록+후기 링크)
```
좌측 사이드바(lg+)는 **선택된 섹션 범위**의 자격증만 노출(현재 전체 나열 → 섹션 스코프로 축소, 인지부하↓).

---

## 4. SEO 아키텍처

| 페이지 | 타깃 키워드 | 스키마(JSON-LD) |
|--------|-------------|-----------------|
| /roadmap/{role} | "직무 자격증 순서/로드맵" | `ItemList`, `BreadcrumbList` |
| /{section} | "aws 자격증 종류/순서" | `ItemList`, `Breadcrumb` |
| /{section}/{cert} | "{cert} 응시료/난이도/도메인/후기" | `Course`(paywall 표기), `FAQPage`, `Breadcrumb` |
| /{section}/reviews | "{cert} 후기" | `Review`/`AggregateRating`(실데이터만) |
| week1/day | 개념 키워드(무료) | `Course.hasPart` |

**규칙:** ① 정보는 **공식 시험가이드 기준 정확성**(허위 금지 — 기존 정직카피 원칙). ② Week2+는 noindex 유지. ③ canonical=`cert.juganlab.com`. ④ 기존 `/aws-certs/*`는 301로 자산 이전(랭킹 유실 방지).

---

## 5. 데이터 모델 변경

**CertMeta 확장(하위호환, 신규 필드는 옵셔널):**
```
+ section: 'aws'|'kubernetes'|'terraform'|'linux'   // Phase0 기본값 유도
  level: string (섹션별 티어 라벨)                    // 의미 일반화
+ exam?: ExamInfo                                    // exam.json → 정보페이지·예측
```
`ExamInfo = { costUSD, minutes, questions, passingScore, domains: {name, weight}[], validityYears, registerUrl, difficulty, faq: {q,a}[] }`

**신규 DB(마이그레이션 멱등):**
```sql
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL, cert_slug TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  passed BOOLEAN, title TEXT, body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_cert ON reviews (section, cert_slug, created_at DESC);
```
`roadmaps.json`(정적): `{ role, title, steps: {section, slug, note}[] }[]`.

---

## 6. 리소스 & 아키텍처 최적화

- **정적 우선(SSG):** 섹션 허브·자격증 정보·로드맵·무료 day는 **DB 0회**, 빌드시 정적 생성 → 최고 SEO·최저 비용. `generateStaticParams`를 (section, cert)로 확장.
- **콘텐츠 메모이즈 확장:** 기존 프로세스 캐시 키를 `section/cert`로. 로드맵/섹션 허브는 **전 섹션 meta 1회 로드 후 캐시**(N+1 방지).
- **동적 최소화:** 후기만 DB. 후기 페이지는 **ISR/revalidate**(예: 60s) — 매 요청 DB 조회 회피. 자격증별 집계(AggregateRating)는 캐시.
- **번들:** 후기 작성 폼·에디터는 **동적 import**(정보 열람자에겐 안 실림). 커스텀 `Select` 재사용.
- **DB:** `reviews`는 `(section, cert_slug, created_at)` 인덱스로 목록·필터 O(log n).
- **이미지/OG:** 섹션·자격증 OG는 기존 `opengraph-image` 패턴 확장(정적 생성, 한글은 라틴 카드 유지).
- **개인화 재사용:** 대시보드 `loadStudyContext`는 이미 섹션 무관하게 attempts 기반 → 섹션 추가해도 그대로 동작(자격증 slug만 늘어남).

---

## 7. 마이그레이션 계획 (단계별 · 무중단 · SEO 보존)

**Phase 0 — 데이터 준비(무無라우팅 변경, 하위호환)**
- `meta.json`에 `section` 추가(기존 aws-certs 자격증→`aws`, `linux-master-1`→`linux`).
- `content.ts`에 section 인지 추가하되 기존 `category` 경로도 계속 동작(별칭).
- 검증: 기존 URL 전부 200 유지.

**Phase 1 — 섹션 축 도입 + 301(핵심 SEO 단계)**
- 라우트 `/{section}/...` 활성화. `next.config` 301: `/aws-certs/*`→`/aws/*`, linux 분리.
- sitemap/canonical/OG/네비 갱신. Search Console 재제출.
- 검증: 리다이렉트·canonical·색인 상태.

**Phase 2 — 정보·로드맵·후기**
- `exam.json` + 자격증 정보 페이지(FAQ 스키마).
- `roadmaps.json` + `/roadmap/{role}`.
- `reviews` 테이블 + 섹션 후기 페이지(작성/필터). ISR.

**Phase 3 — 신규 섹션 콘텐츠(진짜 비용)**
- Kubernetes(CKA/CKAD/CKS), Terraform(Associate/Pro) 커리큘럼을 **점진 투입**. 구조는 이미 완성돼 있으므로 콘텐츠만 채우면 자동 노출.

---

## 8. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| URL 변경으로 랭킹 유실 | 높음 | 전건 **301** + canonical + sitemap 재제출, 점진 배포 |
| `level` 4티어 가정 붕괴 | 중간 | Phase0에서 섹션별 티어로 일반화, 라벨 매핑 교체 |
| 신규 콘텐츠 제작 지연 | 높음(사업) | 구조/콘텐츠 **분리 배포** — 빈 섹션은 "준비중"으로 숨김 |
| 후기 스팸/저품질 | 중간 | 로그인 필수 + rating 범위 검증 + 관리자 숨김 플래그(후속) |
| 시험정보 부정확 | 높음(신뢰·SEO) | 공식 가이드 출처 명시, `syncedAt`로 최신성 관리 |
| en 축 재편 범위 확대 | 중간 | 언어 재편은 **Phase 후순위**(현행 en 유지하며 병행) |

---

## 9. 열린 결정 (착수 전 확인 필요)

1. **섹션 slug**: `aws / kubernetes / terraform / linux` 확정? (URL·폴더에 고정됨)
2. **K8s/TF를 "자격증 트랙"으로** 갈지, "무자격 스킬 트랙"도 병행할지?
3. **로드맵 위치**: 독립 `/roadmap/{role}` vs 섹션 허브 내 섹션? (교차섹션 로드맵이면 독립 권장)
4. **언어(en) 재편**을 이번에 포함할지, Phase 후순위로 미룰지?
5. **후기 표시 단위**: 섹션 통합 목록 + 필터로 충분한지, 자격증별 전용 URL도 필요한지?

---

## 10. 권장 착수 순서 요약
```
Phase 0 (데이터/하위호환)  →  Phase 1 (섹션+301, SEO 핵심)  →  Phase 2 (정보·로드맵·후기)  →  Phase 3 (신규 콘텐츠)
```
구조(0~2)는 저비용·고효과이고, 실제 비용은 Phase 3 콘텐츠에 집중된다. **Phase 0~1을 먼저 안전하게 확정**한 뒤 정보/후기(2)로 트래픽을 키우고, 콘텐츠(3)는 병렬로 채운다.
