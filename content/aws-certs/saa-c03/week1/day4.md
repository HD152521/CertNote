# Day 4 - AWS Organizations, SCP, Control Tower

📅 날짜: Week 1 (Day 4)
🎯 주제: 멀티 계정 거버넌스
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Organizations로 멀티 계정 구조를 설계할 수 있다
- SCP의 역할과 한계를 이해한다
- Control Tower / Landing Zone / IAM Identity Center를 구분한다

---

## 🧩 사전 지식 (CS 기초)

- **거버넌스(Governance)**: 조직 전체에 일관된 규칙/가드레일을 두는 것.
- **블래스트 래디우스(Blast Radius)**: 장애나 침해 시 영향이 미치는 범위. 계정 분리는 BR을 줄임.
- **연합 인증(Federated SSO)**: 한 번 로그인으로 여러 계정에 접근.
- **결제 통합(Consolidated Billing)**: 여러 계정의 청구서를 하나로 모으면 볼륨 디스카운트 / RI 공유가 가능.

---

## 📖 이론 내용

### 1. AWS Organizations 구조

```
  Management Account (Payer)
    └─ Root
         ├─ OU: Security
         │     └─ Log Archive Account
         │     └─ Audit Account
         ├─ OU: Production
         │     ├─ Prod-Web Account
         │     └─ Prod-Data Account
         └─ OU: Sandbox
               └─ Dev1 Account
```

- **Management(=Payer) 계정**은 모든 청구 통합·SCP 관리·계정 생성.
- 일반 워크로드는 Management 계정에서 돌리지 않는다(블래스트 래디우스 ↓).

### 2. SCP (Service Control Policy)

| 특징 | 내용 |
|------|------|
| 적용 단위 | Root / OU / 계정 |
| 영향 | 그 계정의 모든 사용자 + Role (루트 포함) |
| 동작 | 천장(가드레일) — Allow 자체를 부여하지 않음 |
| 기본값 | `FullAWSAccess` 자동 적용 (Allow-list 모드 가능) |
| 예외 | 청구·Organizations·일부 글로벌 API는 영향 못 줌 |

### 3. Consolidated Billing 혜택

- **볼륨 디스카운트** (S3, 데이터 전송 등) 자동 합산
- **RI / Savings Plans 공유** (계정 간 자동 매칭)
- **하나의 청구서** + 계정별 분리 가시성

### 4. Control Tower

- Organizations 위에 얹는 **Landing Zone 자동화**.
- 다중 계정 모범 패턴(Log Archive / Audit / Sandbox OU) 자동 구축.
- **Account Factory**로 신규 계정 표준화.
- **Guardrails** = 사전 정의된 SCP/Config Rule. Mandatory / Strongly Recommended / Elective.

### 5. IAM Identity Center (구 AWS SSO)

- **단일 로그인 → 여러 계정 / 앱**.
- 외부 IdP(Okta, AzureAD) 또는 내장 디렉터리 사용 가능.
- **Permission Set** = 어떤 Role을 어느 계정에 적용할지의 템플릿.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **SCP는 결제 정보엔 영향 없음** | Org 청구·Management 계정 작업 일부는 SCP로 못 막음 | 함정 |
| **SCP는 service-linked role 일부 제외** | AWS가 만든 SLR은 SCP가 일부 보호 | 함정 |
| **RAM (Resource Access Manager)** | VPC 서브넷, Transit Gateway, License 등을 계정 간 공유 | "동일 VPC를 OU에 공유" 시나리오 |
| **Service Catalog** | 승인된 IaC 템플릿 카탈로그. 셀프 서비스로 표준 인프라 배포 | 거버넌스 + 셀프서비스 |
| **Cost Allocation Tag** | 청구서를 태그로 쪼개기. Org 단위 활성화 | "팀별 비용 추적" 시나리오 |

> ⚠️ **함정**: "SCP로 루트 계정의 작업까지 막을 수 있나?" → 일반 계정 루트는 가능. **Management 계정 자체는 SCP가 적용 불가**.

> 💡 **암기 팁**: 멀티 계정 = "**Management + Security(Log Archive/Audit) + Workload(Prod/Dev) + Sandbox**" 4종 세트.

### 관련 서비스 Cross-Reference

- SCP 평가 → **Day 3**
- 계정 간 리소스 공유 → **Week 2 VPC 공유**
- Cost Explorer → **Week 10**
- CloudTrail Organization Trail → **Week 9**

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 Landing Zone 패턴 ]

   Management Account (Payer)
      ├─ Organizations 관리
      ├─ Control Tower
      ├─ IAM Identity Center
      └─ Consolidated Billing

   OU: Security
     ├─ Log Archive (CloudTrail/Config 로그 S3)
     └─ Audit (GuardDuty/SecurityHub Master)

   OU: Workload
     ├─ Prod
     │   └─ VPC + EC2 + RDS
     └─ Dev
         └─ ...

   OU: Sandbox
     └─ 예산 한도 SCP / 자동 클린업
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **워크로드는 Management 계정에 두지 말 것.** 청구·거버넌스 전용.
2. ⭐ **SCP는 가드레일(천장)**, Allow 부여 아님.
3. ⭐ **Consolidated Billing은 자동 볼륨 디스카운트 + RI/SP 공유**.
4. ⭐ **Control Tower = 자동 Landing Zone**, Account Factory로 표준 계정 발급.
5. ⭐ **IAM Identity Center**가 멀티 계정 로그인의 표준. (구 AWS SSO)

---

## 💻 실제 예시 - AWS CLI

```bash
# OU 생성
aws organizations create-organizational-unit \
  --parent-id r-abcd --name Sandbox

# 계정 생성 (이메일 별칭 사용)
aws organizations create-account \
  --account-name "Sandbox-Dev1" \
  --email "aws+sandbox-dev1@example.com"

# SCP 부착 (S3 삭제 Deny 예시)
cat > deny-s3-delete.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": ["s3:DeleteBucket","s3:DeleteObject"],
    "Resource": "*"
  }]
}
EOF

aws organizations create-policy \
  --name DenyS3Delete --type SERVICE_CONTROL_POLICY \
  --content file://deny-s3-delete.json
```

---

## 📝 연습 문제

**문제 1.** 회사가 멀티 계정으로 운영하면서 RI(Reserved Instance) 비용을 최대한 활용하려고 한다. 어떤 기능이 필요한가?

A) IAM Identity Center
B) Consolidated Billing
C) Control Tower
D) Service Catalog

**정답: B**
해설: 통합 결제는 RI/SP를 조직 내 계정 간 자동 공유한다.

---

**문제 2.** 신규 AWS 계정을 표준 패턴으로 빠르게 만들고 가드레일을 자동 적용하려면?

A) CloudFormation StackSets
B) Control Tower Account Factory
C) Organizations API + IAM 정책
D) Service Catalog

**정답: B**
해설: Control Tower의 Account Factory가 표준 계정 발급 + 가드레일 자동 적용. CloudFormation/Service Catalog는 보조 도구.

---

**문제 3.** 한 OU 내 모든 계정에서 S3 객체 삭제를 차단하려면?

A) S3 버킷 정책 일괄 적용
B) IAM 사용자별 정책 작성
C) 해당 OU에 Deny SCP 부착
D) Block Public Access

**정답: C**
해설: 조직 가드레일에는 SCP. 버킷/사용자 단위로 일일이 처리할 필요 없음.

---

**문제 4.** 다중 계정 SSO 로그인을 외부 IdP(Okta)와 연동하는 가장 적합한 도구는?

A) Cognito User Pool
B) IAM 사용자
C) IAM Identity Center
D) Directory Service Simple AD

**정답: C**
해설: 다중 계정 + 외부 IdP 연동 = IAM Identity Center(SAML/SCIM).

---

**문제 5.** 멀티 계정 환경에서 동일 VPC 서브넷을 여러 계정이 공유해서 사용하고 싶다. 어떤 서비스를 사용하나?

A) VPC Peering
B) RAM (Resource Access Manager)
C) Transit Gateway
D) Direct Connect

**정답: B**
해설: RAM이 서브넷·TGW·License를 조직 계정에 공유한다. Peering/TGW는 별도 연결 개념.

---

## 📌 오늘의 요약

1. Organizations = 청구 통합 + SCP + 멀티 계정 거버넌스의 기초.
2. SCP는 천장(가드레일). Allow가 아니라 제한.
3. Control Tower는 Organizations 위의 자동 Landing Zone + Account Factory.
4. IAM Identity Center가 멀티 계정 SSO의 표준.
5. 계정 간 리소스 공유는 RAM. 네트워크 연결은 Peering/TGW.
