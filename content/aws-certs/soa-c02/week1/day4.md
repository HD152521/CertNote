# Day 4 - AWS Organizations & 멀티 계정 거버넌스

📅 날짜: Week 1 (Day 4)
🎯 주제: Organizations로 멀티 계정 환경을 안전하게 운영하는 법
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Organizations의 OU 구조와 SCP 동작을 이해한다
- Control Tower, Landing Zone 패턴을 알아본다
- 멀티 계정 환경의 결제 통합과 비용 분배 방식을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Tenant Isolation**: 멀티 테넌트 시스템에서 테넌트 간 데이터·권한 분리. 멀티 계정 = 가장 강한 격리
- **Blast Radius Reduction**: 사고가 미칠 범위를 줄이는 설계 원칙. 계정 분리가 핵심
- **Centralized vs Decentralized**: 중앙 집중식 운영 vs 분산 운영. AWS는 "거버넌스 중앙 + 자율성 부서별" 패턴 권장
- **Chargeback / Showback**: 비용을 부서에 청구/표시. Cost Allocation Tag로 구현

---

## 📖 이론 내용

### 1. AWS Organizations - 멀티 계정 통합 관리

#### 핵심 개념
- **Management Account (구 Master)**: 결제 통합, OU/SCP 관리. 보통 다른 워크로드 운영 X
- **Member Account**: 실제 워크로드 운영 계정
- **Organizational Unit (OU)**: 계정을 그룹핑하는 폴더 (중첩 가능)
- **Root**: OU 트리의 최상위 — 모든 OU와 계정이 그 아래 위치

#### 멀티 계정의 이점
1. **Blast Radius 축소**: 한 계정 사고가 다른 계정에 영향 X
2. **권한 격리**: 개발/스테이징/프로덕션 IAM 완전 분리
3. **결제 통합**: 모든 계정 비용을 Management Account가 통합 청구
4. **볼륨 할인 공유**: RI/Savings Plans을 조직 전체에 공유 가능
5. **규정 준수**: 감사/규제 요건 충족 (예: PCI 워크로드를 별도 계정)

### 2. OU 설계 패턴 (AWS 권장)

```
Root
├── Security OU              ← 감사/로그/Security Hub 중앙
│   ├── Log Archive Account
│   └── Audit Account
├── Infrastructure OU        ← 공유 네트워크, DNS
│   ├── Shared Services Account
│   └── Network Account
├── Workloads OU
│   ├── Production OU
│   │   ├── Prod-App1 Account
│   │   └── Prod-App2 Account
│   └── Non-Production OU
│       ├── Dev Account
│       └── Stage Account
├── Sandbox OU               ← 개인/실험용 계정
└── Suspended OU             ← 폐쇄 진행 중 계정
```

### 3. SCP (Service Control Policy)

#### 핵심 동작
- OU 또는 계정에 적용
- **권한 상한**만 정함 (Allow 한다고 권한 부여 X)
- IAM 정책과 **교집합**으로 최종 권한 결정
- Management Account에는 **적용 안 됨**

#### 자주 쓰이는 SCP 패턴

**예시 1: 리전 제한 (한국·미국 동부만 허용)**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
      }
    }
  }]
}
```

**예시 2: 루트 사용자 차단**
```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:root"
    }
  }
}
```

**예시 3: 특정 EC2 인스턴스 유형 차단**
```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringNotEquals": {
      "ec2:InstanceType": ["t3.micro", "t3.small", "m5.large"]
    }
  }
}
```

#### SCP 함정 - 시험 빈출

1. **SCP는 Allow를 명시해도 권한 부여 X**. 사용자가 별도 IAM 권한 가져야 동작
2. **명시적 Deny가 최우선** — IAM Allow가 있어도 SCP Deny면 차단
3. **Management Account엔 SCP 미적용**
4. **`FullAWSAccess`가 기본 적용** — 이를 분리하지 않은 OU에선 모든 권한 허용 후 추가 SCP로 제한
5. **Service-Linked Role**은 SCP의 영향을 받지 않을 수 있음 (특정 서비스)

### 4. AWS Control Tower & Landing Zone

#### Control Tower
- Organizations + Identity Center + Config + CloudTrail + 모범 사례 SCP 자동 설정
- "Landing Zone"이라는 안전한 멀티 계정 환경을 클릭 몇 번에 생성
- **Account Factory**: 새 계정 자동 프로비저닝 (사용자 정의 가능)
- **Guardrails**: SCP 또는 Config Rule로 자동 강제되는 거버넌스 규칙
  - **Mandatory** (강제, 변경 불가)
  - **Strongly Recommended**
  - **Elective** (선택)

#### Landing Zone 표준 컴포넌트

| 구성 | 역할 |
|------|------|
| **Management Account** | Organizations, 결제 |
| **Log Archive Account** | 모든 계정의 CloudTrail/Config 로그 중앙 보관 |
| **Audit Account** | Security Hub, GuardDuty 마스터, 감사자 접근 |
| **Shared Services Account** | DNS, AD, Image Builder, 공통 도구 |
| **Network Account** | Transit Gateway, VPC 공유 |

### 5. 결제 통합 (Consolidated Billing)

#### 동작 방식
- Member Account의 사용 요금이 Management Account로 통합
- **볼륨 할인이 조직 전체에 적용**됨 (S3 PUT 요청 단가, 데이터 전송 등)
- **RI/Savings Plans 공유**: 한 계정의 RI를 다른 계정 인스턴스에 적용 (Sharing 활성화 시)

#### Cost Allocation Tag
- 모든 계정에서 일관된 태그 정책 적용 (예: `Project`, `Environment`, `Owner`)
- AWS Cost Explorer에서 태그별 비용 분석
- **Tag Policies**: Organizations 기능. 태그 키/값 표준 강제

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **AWS RAM (Resource Access Manager)** | 계정 간 리소스 공유 (VPC, Transit Gateway, License) | 멀티 계정 네트워크 공유에 필수 |
| **Service Quotas** | 서비스별 한도 통합 관리 (구 Service Limits) | Organizations와 연동해 일괄 관리 |
| **AWS Budgets in Organizations** | 조직/OU/계정별 예산 알람 | 비용 거버넌스 |
| **Tag Policies** | 태그 키/값 표준 강제 | 비용 분석 정확도 향상 |
| **Backup Policies** | 조직 전체 AWS Backup 정책 일괄 적용 | 컴플라이언스 |
| **Delegated Administrator** | 특정 서비스 관리를 Member 계정에 위임 | Audit Account에 Security Hub 위임 등 |

> ⚠️ **함정 1**: SCP는 Allow만 있는 정책으로 권한을 줄 수 없음. 권한은 IAM에서.
>
> ⚠️ **함정 2**: 새 OU 생성 직후 자동으로 `FullAWSAccess` SCP 붙음 → 명시적 Deny 추가하지 않으면 가드레일 효과 0.
>
> 💡 **암기 팁**: "Organizations는 거버넌스, Identity Center는 SSO, Control Tower는 자동 설정". 서로 보완 관계.

### 관련 서비스 Cross-Reference

- **Organizations → Week 4 CloudTrail/Config** (Organization Trail, Aggregator)
- **Organizations → Week 9 Security Hub/GuardDuty** (조직 단위 보안 통합)
- **Organizations → Week 10 AWS Backup** (조직 단위 백업 정책)
- **Organizations → Week 11 Cost Explorer** (조직 단위 비용 분석)

---

## 🏗️ 아키텍처 다이어그램

```
Landing Zone 표준 아키텍처
=======================================================

   Management Account (Organizations Root)
   ├── 결제 통합 + SCP 관리
   └── Identity Center
   │
   ├── Security OU
   │    ├── Log Archive Acct    ← 모든 CloudTrail/Config 중앙
   │    └── Audit Acct          ← Security Hub Delegated Admin
   │
   ├── Infrastructure OU
   │    ├── Network Acct        ← Transit Gateway, Route 53 Resolver
   │    └── Shared Services     ← AD, Image Builder, ECR
   │
   ├── Workloads OU
   │    ├── Production OU
   │    │   └── prod-payment, prod-web, ...
   │    └── Non-Production OU
   │        └── dev, stage, qa
   │
   └── Sandbox OU
        └── individual sandboxes
            (SCP로 비싼 인스턴스 차단, 자동 회수)

SCP가 위에서 아래로 상속:
   Root SCP → OU SCP → 계정 SCP
   각 단계에서 명시적 Deny 누적
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **SCP는 권한 상한 (가드레일)만 정함, 권한 부여 X** — 권한은 IAM에서
2. ⭐ **Management Account에는 SCP 미적용** — 그래서 워크로드 운영 비추천
3. ⭐ **OU 생성 직후 `FullAWSAccess`가 기본** — 별도 Deny SCP를 추가해야 가드레일 효과
4. ⭐ **Log Archive + Audit 계정 분리는 모범 사례** — 권한 격리, 변조 방지
5. ⭐ **AWS RAM으로 VPC/Transit Gateway 공유** — 네트워크 중앙화 핵심

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Organization 생성 (이미 있으면 skip)
aws organizations create-organization --feature-set ALL

# 2. OU 생성
aws organizations create-organizational-unit \
  --parent-id r-abcd \
  --name "Workloads"

# 3. Member 계정 생성 (자동 프로비저닝)
aws organizations create-account \
  --email aws-prod-payment@company.com \
  --account-name "Prod-Payment" \
  --role-name OrganizationAccountAccessRole

# 4. SCP 적용 - 리전 제한
cat > region-restrict.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyAllOutsideAllowedRegions",
    "Effect": "Deny",
    "NotAction": [
      "iam:*",
      "organizations:*",
      "route53:*",
      "cloudfront:*",
      "support:*",
      "sts:*",
      "waf:*",
      "globalaccelerator:*"
    ],
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
      }
    }
  }]
}
EOF

aws organizations create-policy \
  --name RegionRestrict \
  --type SERVICE_CONTROL_POLICY \
  --content file://region-restrict.json

aws organizations attach-policy \
  --policy-id p-abcd1234 \
  --target-id ou-rootid-abcd

# 5. Tag Policy 적용 - 모든 리소스에 Project 태그 강제
cat > tag-policy.json <<'EOF'
{
  "tags": {
    "Project": {
      "tag_key": { "@@assign": "Project" },
      "tag_value": { "@@assign": ["Payment", "Web", "Mobile"] },
      "enforced_for": { "@@assign": ["ec2:instance", "s3:bucket"] }
    }
  }
}
EOF

aws organizations create-policy \
  --name MandatoryTags \
  --type TAG_POLICY \
  --content file://tag-policy.json

# 6. Cross-Account 작업용 OrganizationAccountAccessRole로 Assume
aws sts assume-role \
  --role-arn arn:aws:iam::TARGET-ACCOUNT-ID:role/OrganizationAccountAccessRole \
  --role-session-name "ops-admin-2026"
```

---

## 📝 연습 문제

**문제 1.** 한 회사가 새 OU를 만들고 SCP `Deny ec2:RunInstances`를 적용했지만, OU 내 계정 사용자가 여전히 EC2 인스턴스를 만들 수 있다. 가능한 원인은?

A) SCP 동기화 지연
B) OU에 `FullAWSAccess`가 같이 적용돼 있고, IAM 정책이 허용
C) Management Account의 사용자라서 SCP 미적용
D) B와 C 모두 가능

**정답: D**
해설: 두 가지 모두 흔한 원인. `FullAWSAccess`가 그대로면 명시적 Deny 외 모든 작업 허용. 그리고 Management Account는 SCP 미적용. SCP를 적용하려면 명시적 Deny SCP가 OU에 부여돼야 하고, 사용자가 Management Account 아닌 Member 계정에 있어야 함.

---

**문제 2.** AWS Control Tower를 도입한 회사가 모든 계정의 CloudTrail 로그를 한 곳에 모으려고 한다. 가장 적절한 구성은?

A) 각 계정마다 별도 S3 버킷
B) Log Archive Account의 중앙 S3 버킷 + Organization Trail
C) Management Account에 로그 저장
D) Audit Account에 로그 저장

**정답: B**
해설: Landing Zone 표준 패턴. **Log Archive Account에 중앙 S3 버킷**을 두고 Organization Trail로 모든 계정의 이벤트를 자동 수집. Management Account에 로그 저장은 권한 분리 위배. Audit Account는 분석/감사용, Log Archive는 저장용으로 분리.

---

**문제 3.** 회사가 RI/Savings Plans 할인을 멀티 계정 환경 전체에 적용하고 싶다. 어떻게 설정하나?

A) 각 계정에서 별도 RI 구매
B) Management Account에서 Consolidated Billing + RI Sharing 활성화
C) 모든 계정을 Management Account로 통합
D) SCP로 강제

**정답: B**
해설: Consolidated Billing은 기본 활성화돼 있고, **RI Sharing 옵션**을 켜면 한 계정의 RI 할인이 다른 계정 인스턴스에 자동 적용. 계정마다 RI 구매하면 할인 효율 ↓.

---

**문제 4.** 회사가 모든 리소스에 `Project`, `Environment` 태그를 강제하고 싶다. 가장 효과적인 방법은?

A) IAM 정책의 Condition으로 강제
B) Organizations Tag Policy 적용
C) CloudFormation 템플릿에만 추가
D) Lambda로 주기적 스캔

**정답: B**
해설: Organizations Tag Policy가 표준. 조직 전체에 태그 키 표준 강제. (단, Tag Policy는 기본적으로 "비표준 태그를 막지 않고 보고만 함" — `enforced_for`를 명시한 서비스에서만 강제 차단)

---

**문제 5.** 회사가 멀티 계정에서 공유 VPC를 사용해 네트워크 비용을 줄이고 싶다. 가장 적절한 도구는?

A) AWS Organizations만 사용
B) AWS RAM (Resource Access Manager)으로 서브넷 공유
C) VPC Peering을 모든 계정 간 설정
D) Transit Gateway 없이 NAT 사용

**정답: B**
해설: **AWS RAM**으로 VPC 서브넷, Transit Gateway, License 등을 다른 계정과 공유. 공유받은 계정은 자기 ENI/EC2를 그 서브넷에 띄울 수 있음 → NAT/네트워크 비용 절감. VPC Peering은 N×N 관리 부담.

---

## 📌 오늘의 요약

1. AWS Organizations: 멀티 계정 통합 관리. Management Account 1개 + Member 계정 다수
2. OU 설계 표준: Security / Infrastructure / Workloads / Sandbox / Suspended
3. SCP는 권한 상한만. Allow가 있어도 권한 부여 X — IAM이 별도로 허용해야 동작
4. Control Tower로 Landing Zone(Log Archive + Audit + 기타 OU + 기본 SCP)을 클릭 몇 번에 구성
5. AWS RAM으로 VPC/Transit Gateway 공유, Tag Policy로 비용 태그 강제 — 멀티 계정 거버넌스 도구
