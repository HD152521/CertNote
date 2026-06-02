# Day 26 - 7R 마이그레이션 전략

📅 날짜: Week 6 (Day 1)
🎯 주제: Retire, Retain, Rehost, Relocate, Repurchase, Replatform, Refactor
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 7R 전략 각각의 의미와 사용 시나리오를 안다
- 시나리오에 따라 어떤 R을 선택할지 판단할 수 있다
- 마이그레이션 평가(Discovery → Assess → Mobilize → Migrate) 흐름을 안다

---

## 🧩 사전 지식 (CS 기초)

- **TCO (Total Cost of Ownership)**: 총 소유 비용. 마이그레이션 ROI 핵심.
- **Lift-and-Shift**: 변경 없이 옮기기 = Rehost.
- **Strangler Fig Pattern**: 레거시를 조금씩 신시스템으로 대체.

---

## 📖 이론 내용

### 1. 7R 개요

| R | 의미 | 노력 | ROI |
|---|------|------|-----|
| **Retire** | 폐기 | 매우 적음 | 즉시 절감 |
| **Retain** | 그대로 (이전 보류) | 0 | 0 |
| **Relocate** | 호스팅 위치만 옮김 (VMware on AWS) | 적음 | 빠른 통합 |
| **Rehost** | Lift-and-Shift, OS·App 유지 | 적음 | 빠른 클라우드 진입 |
| **Repurchase** | SaaS 전환 (Salesforce 등) | 중 | 운영 부담 ↓ |
| **Replatform** | 부분 변경 (RDS, OS 업데이트) | 중 | 운영 효율 ↑ |
| **Refactor** | 클라우드 네이티브 재설계 (Serverless·MSA) | 큼 | 장기 ROI 최대 |

### 2. 시나리오별 정답

| 시나리오 | R |
|---------|---|
| 더 이상 안 쓰는 시스템 | Retire |
| 마이그레이션 ROI 부족 | Retain |
| 1000대 VM을 빠르게 옮기기 | Rehost (MGN) |
| Oracle DB → Aurora PostgreSQL | Replatform |
| CRM을 Salesforce로 | Repurchase |
| 모놀리식 앱을 MSA·Lambda | Refactor |
| VMware 환경을 AWS에 그대로 | Relocate (VMware Cloud on AWS) |

### 3. 마이그레이션 프로세스

```
1. Discovery   ─── ADS, Migration Evaluator
2. Assess      ─── TCO·Right-Size·종속성
3. Mobilize    ─── Landing Zone, Org, IAM, Network
4. Migrate     ─── MGN, DMS, App2Container, DataSync
5. Modernize   ─── Refactor·Cloud-Native
```

### 4. 주요 도구 매핑

| 단계 | 도구 |
|------|------|
| Discovery | **AWS Application Discovery Service (ADS)**, Migration Evaluator (구 TSO Logic) |
| 서버 마이그 | **AWS Application Migration Service (MGN)** |
| DB 마이그 | **AWS DMS + SCT** |
| 컨테이너화 | **App2Container** |
| 데이터 전송 | DataSync, Snow Family |
| 통합 추적 | **Migration Hub** |

### 5. AWS MAP (Migration Acceleration Program)

- AWS의 마이그레이션 자금 지원·전문가 가이드 프로그램
- 3단계: Assess → Mobilize → Migrate & Modernize
- Pro 시험에서 "큰 마이그레이션 프로그램, 자금 지원" → MAP

### 6. Strangler Fig Pattern

- 레거시 API 앞에 API Gateway·ALB 두고
- 점진적으로 일부 엔드포인트를 신규(Lambda) 라우팅
- 마이그 위험 최소화

---

## 🧠 알아두면 좋은 심화 이론

### Pace-Layer Strategy

- 빠르게 변하는 계층(혁신 앱) Refactor
- 느리게 변하는 계층(ERP) Rehost
- 합리적 우선순위

### Cross-Reference

- **Day 27**: MGN
- **Day 28**: DMS
- **Day 29**: App2Container·MAP

---

## 🏗️ 아키텍처 다이어그램 — 7R 결정 트리

```
시스템 평가
   │
   ├── 사용 안 함? ──► Retire
   ├── 이전 부담 큼·ROI 낮음? ──► Retain
   ├── VMware 그대로? ──► Relocate
   ├── 빠르게 옮길 것? ──► Rehost (MGN)
   ├── SaaS 대체? ──► Repurchase
   ├── 일부 변경 ROI 큼? ──► Replatform (RDS·OS)
   └── 완전 재설계? ──► Refactor (Serverless·MSA)
```

---

## ⭐ 핵심 포인트

1. ⭐ **7R 의미·노력·ROI 외우기**
2. ⭐ **대량 서버 lift-and-shift = MGN (Rehost)**
3. ⭐ **Oracle → Aurora = Replatform** (DMS + SCT)
4. ⭐ Discovery = **ADS** + Migration Evaluator
5. ⭐ 대규모 프로그램 + AWS 자금 = **MAP**

---

## 💻 실제 예시 - 의사결정 표

| 시스템 | 결정 | 이유 |
|--------|------|------|
| 레거시 메일 서버 | Retire | 신규 Workspaces 사용 |
| ERP (Oracle) | Replatform | Aurora PostgreSQL + DMS |
| 미들웨어 EC2 100대 | Rehost | MGN (빠른 lift) |
| 신규 API | Refactor | Lambda + DynamoDB |
| CRM | Repurchase | Salesforce SaaS |

---

## 📝 연습 문제

**문제 1.** 1000대 VM을 6개월 내 빠르게 AWS로. Best?

A) Refactor 전부
B) Rehost (MGN)
C) Replatform
D) Retire

**정답: B**
해설: 빠른 대량 = Rehost.

---

**문제 2.** Oracle DB를 비용 절감 + 운영 부담↓. Best?

A) Rehost EC2 Oracle
B) Replatform → Aurora PostgreSQL (DMS+SCT)
C) Retain
D) Repurchase

**정답: B**
해설: 부분 변경 = Replatform.

---

**문제 3.** 사용 거의 안 하는 시스템 5개. Best?

A) Rehost
B) Retire
C) Refactor
D) Repurchase

**정답: B**
해설: 폐기 = Retire.

---

**문제 4.** Discovery 단계 도구는?

A) MGN
B) DMS
C) Application Discovery Service
D) Migration Hub

**정답: C**
해설: ADS = Discovery.

---

**문제 5.** VMware 환경 그대로 AWS에. Best?

A) Rehost
B) Relocate (VMware Cloud on AWS)
C) Refactor
D) Repurchase

**정답: B**
해설: VMware 그대로 = Relocate.

---

**문제 6.** 큰 마이그레이션 프로그램, AWS 자금 지원 + 전문가. Best?

A) AWS MAP
B) Trusted Advisor
C) Control Tower
D) IAM

**정답: A**
해설: MAP = 자금·가이드 프로그램.

---

## 📌 오늘의 요약

1. 7R: Retire/Retain/Relocate/Rehost/Repurchase/Replatform/Refactor
2. 대량 lift = Rehost(MGN), DB 변경 = Replatform(DMS+SCT)
3. Discovery = ADS, 통합 추적 = Migration Hub
4. MAP = 대규모 프로그램·자금 지원
5. Strangler Fig로 위험 최소화
