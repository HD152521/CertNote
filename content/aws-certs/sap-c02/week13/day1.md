# Day 61 - Well-Architected Framework 개요·Tool

📅 Week 13 (Day 1)
🎯 주제: 6 기둥 개요
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Well-Architected 6 기둥의 정의와 핵심 질문
- WA Tool·Lens·Review 절차
- Pro 시험에서 키워드가 어느 기둥인지 즉답

---

## 🧩 사전 지식 (CS 기초)

- **NFR**: Non-Functional Requirement — 성능·가용성·보안 등
- **SLA/SLO/SLI**: 서비스 약속·목표·지표
- **MTBF·MTTR**: 평균 장애 간격·복구 시간

---

## 📖 이론 내용

### 1. 6 기둥

| 기둥 | 핵심 질문 |
|------|----------|
| **Operational Excellence** | 운영을 어떻게 관리·자동화·개선? |
| **Security** | 어떻게 보호·탐지·대응? |
| **Reliability** | 어떻게 장애 견디고 복구? |
| **Performance Efficiency** | 자원을 어떻게 효율적으로? |
| **Cost Optimization** | 어떻게 가치 대비 비용 최소? |
| **Sustainability** (2021 추가) | 환경 영향 최소? |

### 2. WA Tool

- 콘솔에서 워크로드 정의 → 질문 답변 → HRI(High Risk Issues) 도출
- **Milestone** = 시간 스냅샷
- **Lens** = 도메인 특화 (Serverless, SaaS, ML, Data Analytics, FTR, Financial Services 등)
- Trusted Advisor·Service Catalog와 연동

### 3. Lens 예

- **Serverless Lens** — Lambda·API GW 모범 사례
- **SaaS Lens** — 멀티 테넌시
- **ML Lens** — MLOps
- **Data Analytics Lens** — 데이터 레이크
- **HPC Lens** — 고성능 컴퓨팅
- **Financial Services·Healthcare Lens**

### 4. Pro 시험 키워드 → 기둥 매핑

| 키워드 | 기둥 |
|--------|------|
| 자동화·IaC·CI/CD·관측성 | Operational Excellence |
| 최소 권한·암호화·감사 | Security |
| 다중 AZ·DR·RTO/RPO | Reliability |
| 캐싱·Right-sizing·이벤트 기반 | Performance Efficiency |
| SP·RI·Spot·태그 | Cost Optimization |
| 탄소·Graviton·리전 선택 | Sustainability |

### 5. 설계 원칙(공통)

- **자동화** 우선
- **장애 가정** (Design for Failure)
- **확장성** — 수평 확장 우선
- **Loose Coupling**
- **Managed > Self-managed**

---

## 🧠 심화 이론

### Trusted Advisor와의 관계

- Trusted Advisor 체크가 WA 점검의 일부 (특히 비용·안정성)
- WA Tool은 광범위 질문, TA는 자동 체크

### Pro 함정

- "운영 부담 최소" = Operational Excellence + Managed
- "감사·규제" = Security + Compliance
- "장애에도 가용" = Reliability

---

## 🏗️ WA Review 프로세스

```
워크로드 등록 → 기둥별 질문 답변 → HRI/MRI 도출
       │
       ▼
   개선 계획·Milestone
       │
       ▼
  재평가 (분기·반기)
```

---

## ⭐ 핵심 포인트

1. ⭐ 6 기둥: 운영·보안·안정성·성능·비용·지속가능성
2. ⭐ WA Tool에서 HRI 도출
3. ⭐ Lens로 도메인 특화 평가
4. ⭐ 시험 키워드 → 기둥 직답
5. ⭐ Sustainability 2021 추가

---

## 💻 CLI 예시

```bash
# 워크로드 생성
aws wellarchitected create-workload \
  --workload-name "app" \
  --description "prod web app" \
  --environment PRODUCTION \
  --review-owner "owner@example.com" \
  --lenses wellarchitected
```

---

## 📝 연습 문제

**문제 1.** "운영 부담 최소·자동화" 키워드 → 어느 기둥?

A) Reliability
B) Operational Excellence
C) Performance
D) Security

**정답: B**

---

**문제 2.** Sustainability 기둥 항목.

A) RI 구매
B) Graviton·리전 선택·우상향 효율성
C) WAF
D) Multi-AZ

**정답: B**

---

**문제 3.** WA Tool에서 분기별 추적.

A) Lens
B) Milestone
C) Tag
D) Review

**정답: B**

---

**문제 4.** 서버리스 워크로드 평가용 Lens.

A) HPC
B) Serverless Lens
C) SaaS
D) ML

**정답: B**

---

**문제 5.** HRI 의미.

A) High Reliability Index
B) High Risk Issue
C) Hourly Recurring Item
D) Host Resource Identifier

**정답: B**

---

**문제 6.** "다중 AZ + RTO 1시간" 키워드 → 기둥?

A) Reliability
B) Cost
C) Security
D) Performance

**정답: A**

---

## 📌 오늘의 요약

1. 6 기둥 + Sustainability
2. WA Tool · Lens · Milestone · HRI
3. 키워드 → 기둥 매핑
