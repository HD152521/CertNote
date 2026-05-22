# Day 8 - AWS Control Tower와 Landing Zone

📅 날짜: Week 2 (Day 3)
🎯 주제: 멀티 계정 거버넌스 자동화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Landing Zone의 정의와 구성 요소를 안다
- Control Tower 가드레일(Preventive·Detective·Proactive)을 구분한다
- Account Factory의 자동 배포 흐름을 안다
- AFT(Account Factory for Terraform)와 Customizations(CfCT)의 차이를 안다

---

## 🧩 사전 지식 (CS 기초)

- **Guardrail (가드레일)**: 자동차 차선처럼 일정 범위 내에서만 움직이게 강제하는 정책.
- **Drift Detection**: 표준 설정에서 벗어난 변경 탐지 (IaC와 유사 개념).
- **Day 0 / Day 1 / Day 2 운영**: 초기 구축(0) - 운영 시작(1) - 지속 운영(2). Landing Zone은 Day 0~1.

---

## 📖 이론 내용

### 1. Landing Zone이란?

- **AWS 멀티 계정 환경의 기준점 구축물**
- Organizations + 공통 OU + SCP + 로깅 + ID 통합 + 가드레일 패키지
- 직접 구축하면 수개월. **Control Tower**가 자동화.

### 2. Control Tower 구성 요소

| 구성 | 역할 |
|------|------|
| **Management Account** | Org·Control Tower 본부 |
| **Log Archive Account** | CloudTrail Org Trail + Config Aggregator 적재 |
| **Audit Account** | Security Hub Master, GuardDuty Master, SNS 알림 허브 |
| **Core OU** | 위 두 계정 포함 |
| **Custom OU** | 사용자 정의 워크로드 OU |
| **Account Factory** | 신규 계정 자동 생성 + 가드레일 부착 |
| **AWS IAM Identity Center** | SSO 자동 활성화 |

### 3. 가드레일 3종 (⭐ 시험 빈출)

| 종류 | 메커니즘 | 예 |
|------|----------|-----|
| **Preventive** (예방) | SCP 기반, 위반 시 거부 | "S3 퍼블릭 ACL 금지" |
| **Detective** (탐지) | AWS Config Rule 기반, 위반 사실 감지 | "암호화 안 된 EBS 발견" |
| **Proactive** (사전 차단) | CloudFormation Hook으로 배포 전 차단 | "비암호화 EBS 배포 거부" |

또 다른 분류:
- **Mandatory**: 항상 켜짐 (해제 불가)
- **Strongly Recommended**: 강력 권장 (해제 가능)
- **Elective**: 선택

### 4. Account Factory 흐름

```
사용자가 Account Factory에서 신청
   │
   ▼
신규 AWS 계정 생성 (자동 이메일·OU 배치)
   │
   ▼
Baseline 적용 (CloudTrail, Config, IAM Identity Center 권한 세트)
   │
   ▼
가드레일 자동 부착 (SCP + Config Rule)
   │
   ▼
IDC에 권한 세트 자동 매핑 (예: AWSAdministratorAccess)
```

### 5. AFT (Account Factory for Terraform)

- **Terraform 기반 IaC**로 계정 생성 자동화.
- 계정 단위 커스터마이징 (네트워킹 stub, 태그, 추가 IAM Role).
- GitOps 워크플로우와 잘 맞음.

### 6. CfCT (Customizations for Control Tower)

- CloudFormation 기반 확장.
- 라이프사이클 이벤트(예: 계정 등록)에 트리거되어 StackSet·SCP 추가 배포.

### 7. 직접 구축 vs Control Tower

| 항목 | 직접 구축 | Control Tower |
|------|-----------|---------------|
| 구축 시간 | 수개월 | 1시간 |
| 유지보수 | 자체 | AWS 업데이트 |
| 커스터마이징 | 자유 | AFT/CfCT 필요 |
| 비용 | 무료 | Config·CT 가드레일 비용 |

> 💡 **Pro 정답**: "100개 계정·표준화·신규 계정 자동" → **Control Tower**.
> "이미 운영 중인 Org에 Landing Zone 적용" → **Control Tower** 가 기존 Org 흡수 가능.

---

## 🧠 알아두면 좋은 심화 이론

### Drift Detection

Control Tower는 표준 baseline에서 벗어난 변경 감지:
- OU 외부에서 SCP 변경
- Log Archive S3 정책 변경
- IDC 권한 세트 변경

탐지 시 콘솔 알림 + Lambda 자동 복구 가능.

### Landing Zone 업데이트

새 가드레일이나 베이스라인 변경 시 "Update Landing Zone" 실행. 멀티 계정 일괄 업데이트.

### Cross-Reference

- **Day 9**: IAM Identity Center 본격
- **Day 10**: 통합 결제 + 자동화 종합
- **Week 11**: Security Hub Master = Audit 계정

---

## 🏗️ 아키텍처 다이어그램 — Control Tower Landing Zone

```
Management Account (Control Tower 본부)
│   ├── Organizations Root
│   └── IAM Identity Center 인스턴스
│
├── Core OU
│   ├── Log Archive Account
│   │     └── S3 (Object Lock) ← CloudTrail Org Trail
│   │     └── S3 ← Config Aggregator
│   └── Audit Account
│         └── Security Hub Master + GuardDuty Master
│         └── SNS: 알림 허브
│
├── Custom OU: Workloads
│   ├── Account Factory 신규 생성 →
│   │     CloudTrail·Config·SCP 자동
│   └── App-A-Prod / App-A-Dev
│
└── Custom OU: Sandbox
      └── 제한적 가드레일 + 예산 알림
```

---

## ⭐ 핵심 포인트

1. ⭐ **Control Tower = Landing Zone 자동 구축**
2. ⭐ Log Archive·Audit 계정은 **Core OU** 표준
3. ⭐ 가드레일 3종: **Preventive(SCP) / Detective(Config) / Proactive(CFN Hook)**
4. ⭐ 신규 계정 = **Account Factory** (또는 AFT for Terraform)
5. ⭐ Mandatory 가드레일은 해제 불가, **Strongly Recommended는 켜는 게 정답**

---

## 💻 실제 예시 - Account Factory 신청

콘솔에서 신청 시:
- 계정 이메일, 이름
- OU 선택
- IDC 권한 세트 매핑

이후 자동:
- 계정 생성 → OU 배치 → CloudTrail 활성화 → Config Rule 적용 → IDC SSO 설정

---

## 📝 연습 문제

**문제 1.** "S3 버킷이 퍼블릭이 되는 것을 사전 차단" — 어떤 가드레일?

A) Detective
B) Preventive (SCP)
C) Proactive (CFN Hook)
D) 둘 다 (Preventive + Proactive)

**정답: D**
해설: SCP로 액션 차단 + CFN Hook으로 배포 전 차단. 둘 다 적용이 가장 강력.

---

**문제 2.** 100개 계정 표준화·신규 계정 자동 생성·SCP 일괄. 가장 적절한?

A) CloudFormation StackSets만
B) Control Tower + Account Factory
C) Service Catalog
D) Systems Manager

**정답: B**
해설: Control Tower가 멀티 계정 거버넌스 표준.

---

**문제 3.** 기존 Org가 이미 운영 중. Landing Zone 도입하려면?

A) Org를 새로 만들어야 함
B) Control Tower가 기존 Org 흡수 가능
C) AFT만 사용
D) StackSets로만

**정답: B**
해설: Control Tower는 기존 Org에 set-up 가능.

---

**문제 4.** Terraform IaC 기반으로 신규 계정 + 커스텀 리소스 자동 배포. 어떤 도구?

A) CfCT
B) AFT (Account Factory for Terraform)
C) Account Factory만
D) CDK

**정답: B**
해설: AFT가 Terraform 기반. CfCT는 CloudFormation 기반.

---

**문제 5.** Landing Zone에서 표준 설정에서 벗어난 변경이 발생. 무엇이 감지?

A) GuardDuty
B) Drift Detection (Control Tower)
C) Security Hub
D) Trusted Advisor

**정답: B**
해설: Control Tower Drift Detection.

---

**문제 6.** Control Tower의 Detective 가드레일은 어떤 서비스 기반?

A) SCP
B) AWS Config Rule
C) CloudFormation Hook
D) WAF Rule

**정답: B**
해설: Detective = Config Rule, Preventive = SCP, Proactive = CFN Hook.

---

## 📌 오늘의 요약

1. Landing Zone = 멀티 계정 거버넌스 기준점
2. Control Tower가 Landing Zone을 자동 구축 (Log/Audit 계정 + 가드레일)
3. 가드레일 3종: Preventive(SCP) / Detective(Config) / Proactive(CFN Hook)
4. Account Factory = 신규 계정 자동 생성, AFT는 Terraform 기반 확장
5. 100개 계정·표준화 = Control Tower 정답
