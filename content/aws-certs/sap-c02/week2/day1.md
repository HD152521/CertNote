# Day 6 - AWS Organizations 구조와 OU 설계

📅 날짜: Week 2 (Day 1)
🎯 주제: 멀티 계정 전략의 출발점 — Organizations·OU·계정 분리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 멀티 계정 전략의 핵심 동기 4가지를 안다 (격리·청구·규제·운영)
- OU 설계 표준 패턴(AWS SRA)을 이해한다
- Master/Management 계정과 Member 계정의 차이를 안다
- 계정 분리 단위 결정 기준을 설명할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **Blast Radius (폭발 반경)**: 사고·실수가 영향을 미치는 범위. 계정 분리의 핵심 동기.
- **Tenant Isolation**: 멀티 테넌시에서 테넌트 간 데이터·자원 격리. 계정이 가장 강한 경계.
- **Chargeback / Showback**: 부서별 비용 청구·표시. 계정 단위가 자연스러운 단위.
- **Bounded Context (DDD)**: 도메인 경계를 코드·인프라에 일치시키는 패턴. 계정이 자연스러운 경계.

---

## 📖 이론 내용

### 1. 왜 멀티 계정인가? (4가지 동기)

| 동기 | 단일 계정의 문제 | 멀티 계정의 효과 |
|------|-------------------|-------------------|
| **격리** | 한 워크로드 실수가 전체 영향 | 폭발 반경 차단 |
| **청구** | 부서·프로젝트 비용 추적 어려움 | 계정 = 자연스런 청구 단위 |
| **규제·감사** | 데이터 혼재 | 감사 범위 좁힘 (PCI·HIPAA) |
| **운영** | IAM 정책 복잡도 폭증 | 계정 단위로 단순화 |

### 2. AWS Organizations 구조

```
Root
 ├── Management Account (결제·Org 관리, 워크로드 X)
 ├── OU: Security
 │    ├── Log Archive (CloudTrail S3 적재)
 │    └── Audit (Security Hub, GuardDuty Master)
 ├── OU: Infrastructure
 │    ├── Network (TGW, DNS, Direct Connect)
 │    └── Shared Services (CI/CD, ECR, AD)
 ├── OU: Workloads
 │    ├── OU: Prod (계정 N개)
 │    └── OU: Non-Prod (계정 N개)
 └── OU: Sandbox (자유로운 실험)
```

- **Management Account**: Organizations 생성한 결제 계정. 워크로드 배포 금지 (보안·격리).
- **Member Account**: OU 안에 들어가는 일반 계정.

### 3. OU 설계 표준 — AWS SRA (Security Reference Architecture)

AWS 공식 SRA가 권장하는 OU:
- **Security** — 감사·로그·보안 도구 마스터 (필수)
- **Infrastructure** — 네트워크·공유 서비스
- **Workloads** — 실제 비즈니스 (Prod/Non-Prod 분리)
- **Sandbox** — 개발자 실험 (제한된 SCP로 격리)
- **PolicyStaging** — SCP 시험용 (선택)
- **Suspended** — 폐쇄 예정 계정

> 💡 **암기 팁**: OU는 "조직도"가 아니라 **"공통 정책 단위"** 로 묶는다. 같은 SCP가 적용될 계정끼리.

### 4. 계정 분리 단위 결정

언제 계정을 나눌까?

| 기준 | 분리 권장? |
|------|------------|
| 환경 (Prod/Stg/Dev) | ✅ 강력 권장 — 폭발 반경 |
| 비즈니스 유닛 | ✅ 청구·거버넌스 |
| 데이터 분류 (PII·PCI) | ✅ 규제 격리 |
| 마이크로서비스 (5개) | ❌ 과도 — 같은 계정 가능 |
| 마이크로서비스 (100개) | ⚠️ 일부 분리 — 도메인 단위 |
| 리전 | ❌ 계정으로 분리 X (계정은 글로벌) |

### 5. Management Account의 특별한 역할

- 결제(Consolidated Billing) 마스터
- Organizations 정책(SCP) 작성·적용 가능
- Service Control Policy 자체는 Management 계정엔 적용 안 됨 (의도된 동작)
- **워크로드 절대 배포 금지** — 침해되면 모든 멤버 계정 위험

### 6. 신규 계정 자동 생성 옵션

| 방법 | 특징 |
|------|------|
| **Org Console로 수동 생성** | 작은 조직 |
| **Account Factory (Control Tower)** | 표준 가드레일·로깅 자동 설정 |
| **AFT (Account Factory for Terraform)** | IaC 기반 |
| **API: `CreateAccount`** | 사용자 정의 자동화 |

---

## 🧠 알아두면 좋은 심화 이론

### Consolidated Billing 효과

- **볼륨 할인 합산** — 모든 계정 사용량 합쳐 단계별 할인
- **RI·Savings Plans 공유** — Management/Org 단위 공유 가능
- **단일 청구서** — CFO/회계 단순화

> ⚠️ **함정**: SCP는 Management 계정에 적용 안 됨. 결제는 Management로 합산되지만 정책은 멤버에만.

### Trusted Access

특정 AWS 서비스(예: CloudFormation StackSets, GuardDuty, Security Hub, Config 등)가 Org 단위로 작동하려면 "Trusted Access"를 활성화해야 함. 이 후 위임 관리자(Delegated Admin) 계정으로 권한 분리 가능.

### Cross-Reference

- **Day 7**: SCP 본격
- **Day 8**: Control Tower
- **Day 9**: IAM Identity Center

---

## 🏗️ 아키텍처 다이어그램 — 권장 OU 구조

```
Root
 ├── Management (결제·Org 관리만, 워크로드 X)
 ├── Security OU
 │    ├── Log Archive (불변 S3 + CloudTrail Org Trail)
 │    └── Audit (Security Hub Master, GuardDuty)
 ├── Infrastructure OU
 │    ├── Network (TGW, Route53 Hosted Zone, DX)
 │    └── Shared Services (ECR, CodeArtifact, AD)
 ├── Workloads OU
 │    ├── Prod OU
 │    │    ├── App-A-Prod
 │    │    └── App-B-Prod
 │    └── Non-Prod OU
 │         ├── App-A-Dev
 │         └── App-B-Dev
 └── Sandbox OU (제한적 SCP, 개발자 실험)
```

---

## ⭐ 핵심 포인트

1. ⭐ **Management 계정은 결제·Org 관리만**, 워크로드 절대 배포 X
2. ⭐ **OU = 공통 정책 단위**, 조직도 그대로 옮기지 말 것
3. ⭐ **Prod/Non-Prod는 반드시 계정 분리** (폭발 반경)
4. ⭐ **Log Archive 계정의 S3는 불변(Object Lock)**, CloudTrail Org Trail 수집
5. ⭐ Consolidated Billing은 **RI/SP 공유**·볼륨 할인 자동

---

## 💻 실제 예시 - Organizations CLI

```bash
# Org 생성 (Management 계정에서 단 1회)
aws organizations create-organization --feature-set ALL

# OU 생성
aws organizations create-organizational-unit \
  --parent-id r-xxxx --name Workloads

# 신규 계정 생성
aws organizations create-account \
  --email prod-app-a@example.com \
  --account-name "App-A-Prod"

# OU로 이동
aws organizations move-account \
  --account-id 111111111111 \
  --source-parent-id r-xxxx \
  --destination-parent-id ou-yyyy
```

---

## 📝 연습 문제

**문제 1.** Management 계정에 대한 설명으로 옳은 것은?

A) 모든 워크로드를 배포해야 한다
B) SCP가 자동으로 강하게 적용된다
C) 결제 마스터이며 워크로드 배포는 금지가 권장 사항이다
D) Member 계정과 동일하다

**정답: C**
해설: Management는 결제·Org 관리 전용. 워크로드는 멤버 계정에.

---

**문제 2.** Prod와 Dev를 같은 계정에 두면 발생하는 가장 큰 위험은?

A) 비용 증가
B) Dev 실수가 Prod에 영향 (폭발 반경)
C) IAM 정책 단순화 불가
D) Region 분리 불가

**정답: B**
해설: 계정 = 강한 격리 경계. Dev/Prod는 계정 분리 표준.

---

**문제 3.** 100개 계정의 CloudTrail 로그를 단일 위치에 불변 저장. 어떤 구조?

A) 각 계정 S3에 보관
B) Log Archive 계정 + S3 Object Lock + Org Trail
C) 각 계정 CloudWatch Logs
D) Athena 직접 쿼리

**정답: B**
해설: Log Archive 계정 + Object Lock = 표준 패턴.

---

**문제 4.** OU를 어떻게 나누어야 하는가?

A) 조직도 그대로
B) 리전별로
C) 공통 정책(SCP) 단위로
D) 개발자 그룹별로

**정답: C**
해설: OU는 공통 정책이 적용될 계정 묶음.

---

**문제 5.** Consolidated Billing의 가장 큰 이점은?

A) 보안 강화
B) RI·Savings Plans 공유 + 볼륨 할인 합산
C) IAM 단순화
D) DR 자동화

**정답: B**
해설: 모든 계정 사용량 합산 → RI/SP 공유, 단계 할인.

---

**문제 6.** 개발자가 자유롭게 실험할 OU 설계 가이드라인은?

A) Workloads OU에 포함
B) Sandbox OU + 제한적 SCP(고비용 서비스 금지) + 예산 알람
C) Management 계정에 IAM User
D) Security OU에 포함

**정답: B**
해설: Sandbox OU 패턴 — 격리 + 비용 제어 SCP.

---

## 📌 오늘의 요약

1. 멀티 계정 = 격리·청구·규제·운영 4가지 동기
2. Management 계정은 결제·Org 관리만, 워크로드 금지
3. OU = 공통 SCP 단위. AWS SRA의 Security/Infrastructure/Workloads/Sandbox가 표준
4. Prod/Non-Prod는 계정 분리 필수
5. Account Factory(Control Tower) 또는 AFT로 신규 계정 자동화
