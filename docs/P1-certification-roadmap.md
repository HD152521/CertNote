# 자격증 확장 로드맵 (P1+)

> CertNote의 자격증 추가 계획 및 우선순위.
> 작성: 2026-07-14
> 현재: AWS 11 + Linux Master 1 = 12개 자격증

---

## 현재 상태

### 보유 자격증 (12개)

#### AWS (11개) ✓ 콘텐츠 + 영어 Week1
| # | 자격증 | 레벨 | 주차 | 일차 | 모의고사 | 영어 |
|---|--------|------|-----|-----|---------|------|
| 1 | CLF-C02 (Cloud Practitioner) | Foundational | 6 | 30 | 65 | ✓ Week1 |
| 2 | AIF-C01 (AI Practitioner) | Foundational | 6 | 30 | 65 | ✓ Week1 |
| 3 | DVA-C02 (Developer) | Associate | 13 | 65 | 68 | ✓ Week1~13 (진행중) |
| 4 | MLA-C01 (ML Engineer) | Associate | 10 | 50 | 65 | ✓ Week1 |
| 5 | DEA-C01 (Data Engineer) | Associate | 10 | 50 | 65 | ✓ Week1 |
| 6 | SAA-C03 (Solutions Architect) | Associate | 12 | 60 | 68 | ✓ Week1~12 (진행중) |
| 7 | SOA-C02 (CloudOps Engineer) | Associate | 12 | 60 | 68 | ✓ Week1 |
| 8 | SAP-C02 (Solutions Architect Pro) | Professional | 16 | 80 | 72 | ✓ Week1 |
| 9 | DOP-C02 (DevOps Engineer) | Professional | 16 | 80 | 72 | ✓ Week1 |
| 10 | SCS-C03 (Security Specialty) | Specialty | 12 | 60 | 65 | ✓ Week1 |
| 11 | MLS-C01 (Machine Learning) | Specialty | 12 | 60 | 65 | ✓ Week1 |

#### 비AWS (1개)
| # | 자격증 | 시장 | 주차 | 일차 | 모의고사 |
|---|--------|------|-----|-----|---------|
| 12 | Linux Master 1급 | 한국 | 12 | 60 | 65 |

**통계**: 
- 총 콘텐츠: 12개 자격증 × 평균 9주 = **108주**
- 일차 단위: **615일**
- 모의고사 문항: **788개**

---

## 예정된 자격증 (계획 중)

### Phase A: AWS 보완 (3개, 권장)
이미 AWS 공식에서 제공하는 자격증 중 미보유

| # | 자격증 | 레벨 | 이유 | 난이도 | 수요 |
|---|--------|------|-----|--------|------|
| **1** | **ANS-C01** (Advanced Networking) | Specialty | - | 높음 | 중간 |
| **2** | **PAS-C01** (Certified Specialist - ML) | Specialty | - | 높음 | 낮음 |

**상태**: 
- ANS-C01은 **2026-08-25 폐지 예정** → 제외 ✗
- PAS-C01은 수요 낮음 → 보류

**결론**: AWS는 현재 **전종 보유 완료** (ANS 제외)

---

### Phase B: 관련 기술 자격증 (권장 우선순위)

#### Tier 1: 높은 수요 (2~3개월)
| 자격증 | 시장 | 난이도 | 일차 | 이유 |
|--------|------|--------|-----|-----|
| **GCP Associate Cloud Engineer** | 글로벌 | 중간 | ~40 | AWS 다음 클라우드, 한국 수요 증가 |
| **Azure AZ-900** | 글로벌 | 낮음 | ~20 | 글로벌 수요 높음, 영어권 타겟 |
| **Kubernetes (CKAD)** | 글로벌 | 높음 | ~50 | DevOps/Cloud Native 필수 |

**작업량**: 110일 콘텐츠 (AWS SAA-C03 규모)

#### Tier 2: 중간 수요 (3~6개월)
| 자격증 | 시장 | 일차 | 이유 |
|--------|------|-----|-----|
| **Terraform Associate** | 글로벌 | 30 | IaC 필수, AWS/GCP/Azure 공통 |
| **HashiCorp Vault Associate** | 글로벌 | 20 | 보안 운영 필수 |
| **Google Cloud Associate Cloud Architect** | 글로벌 | 50 | GCP 심화 |
| **Azure Administrator (AZ-104)** | 글로벌 | 50 | Azure 심화 |

**작업량**: 150일 콘텐츠

#### Tier 3: 장기 (6개월+)
| 자격증 | 시장 |
|--------|------|
| Databricks Certified Associate | 글로벌 (ML) |
| Snowflake University | 글로벌 (Data) |
| Salesforce Admin | 한국 (기업 CRM) |
| ServiceNow Certified Associate | 글로벌 (IT Ops) |

---

### Phase C: 한국 특화 자격증 (선택)
| 자격증 | 시장 | 주차 | 이유 |
|--------|------|-----|-----|
| **정보보안기사** | 한국 | 12 | 국내 필수, 수요 높음 |
| **AWS 한국어 시험** | 한국 | 해당 | 한국 시장 진입 |
| **네트워크관리사 2급** | 한국 | 8 | 기초 인프라, 수요 중간 |

**주의**: Linux Master처럼 한국 로컬만 → 영어 버전 없음

---

## 전개 전략

### 현재 아키텍처 (이미 준비됨)
```
webapp/
├── src/lib/category.ts  ← DEFAULT_CATEGORY = 'aws-certs'
├── content/
│   ├── aws-certs/       ← 현재: 12개 자격증
│   ├── gcp-certs/       ← 미래: GCP 자격증
│   ├── azure-certs/     ← 미래: Azure 자격증
│   ├── other-certs/     ← 미래: Kubernetes 등
│   └── en/              ← 영어 버전 (AWS만 현재)
└── src/app/[category]/[slug]/weekN/dayM/page.tsx  ← 라우팅 준비됨
```

**의미**: 코드는 이미 멀티 카테고리 지원. **콘텐츠만 추가하면 됨**.

### 콘텐츠 생성 프로세스 (검증됨)
```
1. 자격증 메타 정의 (content/<cat>/<slug>/meta.json)
2. 커리큘럼 생성 (week1/dayN.md) → 에이전트 병렬
3. 모의고사 생성 (content/exams/<slug>.json) → 에이전트
4. 모의고사 검수 (qa/qa-report.md) → 에이전트
5. 빌드 + 커밋
```

**비용 (Haiku 3x)**: 
- AWS SAA-C03 (12주 60일): $2~3
- GCP Associate (6주 40일): $1.5~2

---

## 확장 로드맵 (Timeline)

### Q3 2026 (즉시~9월)
- [x] AWS 11 + Linux 완료
- [ ] 결제 통합 (Phase 1-2)
- [ ] 영어 Week2+ 확장 (인기 3종: SAA, DVA, SOA)
- **추가**: GCP Associate 기초 계획

### Q4 2026 (10월~12월)
- [ ] GCP Associate Cloud Engineer (40일)
- [ ] Azure AZ-900 (20일)
- [ ] Kubernetes CKAD 모의 버전 (30일)
- [ ] 결제 자동화 완료 (Phase 3)

### Q1 2027 (1월~3월)
- [ ] Terraform Associate (30일)
- [ ] Google Cloud Architect (50일)
- [ ] Azure Administrator (50일)
- [ ] 영어 전체 확장 (모든 자격증)

### Q2 2027+ (4월~)
- [ ] Data/ML 자격증 (Databricks, Snowflake)
- [ ] 한국 특화 (정보보안기사)
- [ ] 모바일 앱 (React Native / Flutter)

---

## 자격증별 실행 계획

### 추천 다음 추가: **GCP Associate Cloud Engineer**

**이유**:
1. AWS와 경쟁 관계 → 수요 높음
2. 난이도 중간 (AWS SAA 유사)
3. 일차 적당 (~40일)
4. 영어권 시장 진입

**예상 시간**: 
- 기획 + 커리큘럼: 1주
- 콘텐츠 생성: 2주
- 모의고사: 1주
- 검수: 3~5일
- **합계: 약 4주**

**비용**: ~$2 (Haiku 에이전트 병렬)

---

## 의사결정 체크리스트

새 자격증 추가 전에 확인:

- [ ] **시장 수요** 있는가? (Google Trends, 검색량 > AWS의 30%)
- [ ] **콘텐츠 가능성** 있는가? (공식 가이드 문서 > 300페이지)
- [ ] **모의고사 수집 가능**한가? (공식 실무 문제은행 또는 오픈소스)
- [ ] **영어 버전 필요**한가? (한국 전용 제외)
- [ ] **팀 역량** 있는가? (해당 자격증 경험자 필요)

---

## 요약: "지금은 AWS 주력, 앞으로 멀티 클라우드로 확장"

| 시점 | 전략 | 자격증 |
|-----|------|--------|
| 현재 (완료) | AWS 완전 보유 | 11개 |
| Q3-Q4 2026 | AWS 심화 + 클라우드 입문 | +GCP, +Azure |
| 2027 | 멀티 클라우드 표준화 | +Kubernetes, +IaC |
| 2027+ | 데이터/AI/보안 특화 | +Data, +Security |

---

## 다음 액션 아이템

1. **GCP Associate 제안서 작성** (사용자 승인 대기)
2. **콘텐츠 생성 웨이브 계획** (일정, 에이전트 배정)
3. **모의고사 소스 조사** (GCP 공식 리소스)
4. **영어 버전 정책 결정** (모든 자격증 영어화?)

