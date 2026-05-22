# Day 7 - SCP (Service Control Policy) 패턴

📅 날짜: Week 2 (Day 2)
🎯 주제: SCP 작성 패턴과 함정 — Pro의 단골 주제
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SCP의 본질(권한 부여 X, 최대 한계 O)을 명확히 안다
- Allow-list vs Deny-list 전략을 구분한다
- 자주 쓰이는 SCP 패턴 6가지를 외운다
- SCP의 흔한 함정과 디버깅 방법을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Whitelist vs Blacklist (Allow-list vs Deny-list)**: 화이트는 허용 명시, 블랙은 거부 명시.
- **Default Allow vs Default Deny**: 기본값에 따라 SCP 전략 달라짐.
- **Intersection (교집합)**: SCP는 모든 상위 OU의 SCP와 IAM 정책의 **교집합** 안에서만 동작.

---

## 📖 이론 내용

### 1. SCP의 본질 (⭐⭐ 가장 중요)

- SCP는 **권한을 부여하지 않는다**. 오직 "허용할 수 있는 최대 범위(ceiling)"만 제한한다.
- IAM 정책이 Allow를 줘도 SCP가 그 액션을 빠뜨리면 결과적으로 거부된다.
- **Management 계정에는 적용되지 않는다** (의도된 동작).
- 적용 단위: Root, OU, Account.

### 2. FullAWSAccess vs 빈 SCP

- **FullAWSAccess** (기본): 모든 액션 Allow — 즉 SCP에 의한 제한 없음.
- **빈 SCP** (`{"Statement": []}`): 모든 액션 Deny — 계정 작동 불가.

> ⚠️ **함정**: 새 OU에 SCP를 만들 때 FullAWSAccess를 분리해두지 않고 직접 Allow만 쓰면 다른 모든 액션이 묵시적 거부됨.

### 3. Allow-list vs Deny-list 전략

| 전략 | 동작 | 사용처 |
|------|------|--------|
| **Deny-list** (권장) | FullAWSAccess + Deny 규칙 추가 | 일반 워크로드, 유연함 |
| **Allow-list** | FullAWSAccess 제거 + Allow 규칙만 | 엄격 격리, 제한적 OU (Sandbox 일부) |

대부분의 조직은 **Deny-list 전략** 을 사용. 새 AWS 서비스 출시 시 자동 허용되기 때문.

### 4. 자주 쓰이는 SCP 패턴 6가지

#### 패턴 1: 리전 제한 (데이터 주권)
```json
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "organizations:*", "route53:*",
                "support:*", "trustedadvisor:*"],
  "Resource": "*",
  "Condition": {"StringNotEquals":
    {"aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]}}
}
```
> ⚠️ 글로벌 서비스(IAM, Org, Route53 등)는 `NotAction` 으로 예외.

#### 패턴 2: 루트 사용자 작업 차단
```json
{"Effect": "Deny", "Action": "*", "Resource": "*",
 "Condition": {"StringLike": {"aws:PrincipalArn": "arn:aws:iam::*:root"}}}
```

#### 패턴 3: MFA 미사용 시 민감 액션 차단
```json
{"Effect": "Deny",
 "Action": ["ec2:TerminateInstances", "rds:DeleteDBInstance"],
 "Resource": "*",
 "Condition": {"BoolIfExists":
   {"aws:MultiFactorAuthPresent": "false"}}}
```

#### 패턴 4: CloudTrail·GuardDuty 비활성화 차단
```json
{"Effect": "Deny",
 "Action": ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail",
            "guardduty:DeleteDetector", "guardduty:StopMonitoringMembers"],
 "Resource": "*"}
```

#### 패턴 5: 비싼 인스턴스 패밀리 금지 (Sandbox)
```json
{"Effect": "Deny", "Action": "ec2:RunInstances", "Resource": "*",
 "Condition": {"ForAnyValue:StringLike":
   {"ec2:InstanceType": ["p4*", "x2*", "u-*"]}}}
```

#### 패턴 6: 특정 서비스 전체 금지
```json
{"Effect": "Deny",
 "Action": ["macie2:*", "iotwireless:*"], "Resource": "*"}
```

### 5. SCP 디버깅 — "왜 안 되는지" 찾는 법

1. **CloudTrail의 errorCode** 확인 — `AccessDenied`와 함께 SCP 인지 IAM인지 표시 (`Service Control Policy`).
2. **IAM Policy Simulator** — Org SCP까지 시뮬레이션 가능.
3. **임시로 SCP를 PolicyStaging OU에서 테스트** 후 본 OU에 부착.

### 6. SCP 평가 순서

```
요청
 │
 ▼
Org Root SCP ─ 통과? ─ N → Deny
 │
 ▼
모든 상위 OU SCP ─ 통과? ─ N → Deny
 │
 ▼
계정 직접 SCP ─ 통과? ─ N → Deny
 │
 ▼
IAM Identity Policy + Resource Policy + Boundary
 │
 ▼
최종 Allow
```

상위 OU의 SCP가 더 엄격하면 하위 OU에서 풀 수 없다 (상속).

---

## 🧠 알아두면 좋은 심화 이론

### Resource Control Policy (RCP) — 최신 기능

- 2024년 출시. SCP는 Principal(아이덴티티) 측 제한, **RCP는 리소스 측 제한**.
- 예: 회사 외부 Principal이 S3 버킷에 접근하지 못하게 일괄 적용.

### Declarative Policies, Backup Policies, Tag Policies

| 정책 종류 | 용도 |
|-----------|------|
| **Tag Policy** | 태그 키·값 표준화 강제 |
| **Backup Policy** | AWS Backup 표준 강제 |
| **AI Services Opt-out** | AI 서비스 데이터 활용 거부 |
| **Chatbot Policy** | Slack/Teams 통합 제한 |

### Cross-Reference

- **Day 8**: Control Tower가 표준 SCP를 가드레일로 자동 부착
- **Week 11**: Security Hub와 통합 모니터링
- **Week 13**: 운영 우수성·자동 거버넌스

---

## 🏗️ 아키텍처 다이어그램 — SCP 적용 흐름

```
Root SCP (Deny: 결제 변경, S3 퍼블릭)
 │
 ├── Workloads OU SCP (Deny: 비인가 리전)
 │    ├── Prod OU SCP (Deny: 대규모 인스턴스 외 패밀리)
 │    │    └── Account: App-Prod
 │    └── Non-Prod OU SCP (Deny: GPU 인스턴스)
 │         └── Account: App-Dev
 ├── Sandbox OU SCP (Allow-list: EC2 small만, S3, Lambda)
 │    └── Account: Sandbox-User
 └── Security OU (강한 SCP: 로그 무결성·CT 차단 금지)
```

---

## ⭐ 핵심 포인트

1. ⭐ **SCP는 권한 부여 X, 최대 한계만**
2. ⭐ **Deny-list가 표준** (새 서비스 자동 허용)
3. ⭐ **글로벌 서비스는 리전 제한 SCP에서 NotAction 예외**
4. ⭐ **CloudTrail·GuardDuty 비활성화 차단 SCP는 필수**
5. ⭐ **Management 계정은 SCP 적용 X**

---

## 💻 실제 예시 - SCP 적용

```bash
# SCP 정책 생성
aws organizations create-policy \
  --name DenyRegions \
  --type SERVICE_CONTROL_POLICY \
  --content file://deny-regions.json

# OU에 부착
aws organizations attach-policy \
  --policy-id p-xxxx --target-id ou-yyyy
```

---

## 📝 연습 문제

**문제 1.** SCP에 대한 설명으로 옳은 것은?

A) IAM 권한을 부여한다
B) Management 계정에도 적용된다
C) 권한 부여가 아니라 최대 한계를 설정한다
D) Region마다 다른 SCP를 적용한다

**정답: C**
해설: SCP는 ceiling. IAM 정책과 교집합.

---

**문제 2.** 새 OU 생성 시 FullAWSAccess SCP를 제거하면?

A) 영향 없음
B) 그 OU 모든 계정의 모든 액션이 묵시적 Deny
C) Management 계정만 Deny
D) Org가 삭제됨

**정답: B**
해설: SCP는 Allow가 명시되어야 동작. FullAWSAccess 없이는 Allow 0 → 모두 Deny.

---

**문제 3.** 한국 데이터 주권 규제로 ap-northeast-2만 허용. 어떤 SCP?

A) Allow `aws:RequestedRegion = ap-northeast-2`
B) Deny `aws:RequestedRegion != ap-northeast-2` + 글로벌 서비스 NotAction 예외
C) Resource Policy
D) NACL

**정답: B**
해설: Deny 패턴 + 글로벌 서비스 NotAction 예외가 정석.

---

**문제 4.** 공격자가 CloudTrail을 비활성화하지 못하게 하려면?

A) IAM 정책으로만
B) SCP에서 `cloudtrail:StopLogging`, `DeleteTrail` 등 Deny
C) Network ACL
D) WAF

**정답: B**
해설: SCP에 명시적 Deny — 어떤 IAM 정책도 SCP를 뚫지 못함.

---

**문제 5.** 새로 출시되는 AWS 서비스도 자동으로 허용하려면 어떤 SCP 전략?

A) Allow-list
B) Deny-list (FullAWSAccess + 특정 Deny)
C) Resource Policy
D) Permission Boundary

**정답: B**
해설: Deny-list가 신규 서비스 자동 허용 효과.

---

**문제 6.** SCP가 의도대로 동작하는지 사전 검증하려면?

A) 운영 OU에 바로 부착
B) PolicyStaging OU(테스트 계정 1개)에 부착 후 검증
C) IAM User 추가
D) Permission Boundary로 우회

**정답: B**
해설: Staging OU 패턴이 표준 검증 방식.

---

## 📌 오늘의 요약

1. SCP = ceiling. 권한 부여 X
2. Deny-list (FullAWSAccess + Deny)가 표준 전략
3. 리전 제한은 NotAction으로 글로벌 서비스 예외
4. CloudTrail·GuardDuty 비활성화 차단은 표준 SCP
5. 검증은 PolicyStaging OU에서, 적용 후 CloudTrail로 모니터링
