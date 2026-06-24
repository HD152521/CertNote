# Day 1 - AWS Organizations 보안 거버넌스: SCP 설계, 위임 관리자, 중앙 보안 계정 모델

단일 계정의 보안은 IAM 정책과 리소스 정책의 곱집합으로 끝난다. 그러나 수십~수백 개 계정이 모인 조직에서는 "각 계정 관리자가 무엇을 할 수 있는가"의 상한선을 누가, 어떻게, 어디서 강제하느냐가 핵심이 된다. AWS Organizations는 이 상한선을 정의하는 *거버넌스 평면*이고, 그 중심 도구가 SCP(Service Control Policy)다. 보안 시험에서 Organizations는 "권한의 천장"을 다루는 영역이며, IAM이 "권한의 부여"라면 SCP는 "권한의 최대 경계(permission boundary at scale)"라고 이해해야 한다.

## 조직 구조: Root, OU, 계정

AWS Organizations는 트리 구조다. 최상단에 **Root**가 있고, 그 아래 **OU(Organizational Unit)**가 중첩되며, 최하단에 **계정(Account)**이 놓인다. 정책은 Root, OU, 계정 어느 노드에나 붙일 수 있고, 노드에 붙은 정책은 그 하위 전체로 **상속**된다.

```
Root
├── SCP: DenyRootUser, DenyRegionLockdown (전체 적용)
├── OU: Security
│   ├── 계정: Audit (중앙 로그/탐지)
│   └── 계정: Log Archive (불변 로그 보관)
├── OU: Infrastructure
│   └── 계정: Networking, SharedServices
├── OU: Workloads
│   ├── OU: Prod  ── SCP: DenyDisableGuardDuty
│   └── OU: NonProd ── SCP: AllowSandboxRegions
└── OU: Suspended ── SCP: DenyAll (격리용)
```

관리 계정(Management Account, 구 마스터 계정)은 조직을 생성한 결제·통제의 정점이다. **관리 계정에는 워크로드를 두지 말고 SCP도 적용되지 않는다**는 점이 중요한 함정이다 — SCP는 관리 계정의 멤버를 통제하지 못하므로 관리 계정에서 워크로드를 돌리면 거버넌스 구멍이 된다.

> 💡 **관련 이론**: 이것은 *최소 권한*을 조직 규모로 끌어올린 *권한 경계의 계층화*다. 운영체제의 capability model에서 부모 프로세스가 자식에게 자신이 가진 권한의 부분집합만 위임할 수 있는 것과 같다. SCP는 "내려보내는 권한의 상한"을 정의하고, IAM은 "그 안에서 실제 부여하는 권한"을 정의한다. 둘의 **교집합**만이 유효 권한이 된다.

## SCP의 본질: 허용이 아니라 경계

SCP에 대한 가장 흔한 오해는 "SCP가 권한을 부여한다"는 것이다. **SCP는 권한을 부여하지 않는다.** SCP는 IAM이 부여할 수 있는 권한의 *최대 경계*를 정의할 뿐이다. 어떤 액션이 실제로 허용되려면 다음이 모두 만족해야 한다:

1. SCP가 그 액션을 허용(또는 명시적으로 거부하지 않음)
2. IAM 정책(아이덴티티/리소스)이 그 액션을 명시적으로 Allow
3. 어떤 정책에도 명시적 Deny가 없음

```
유효 권한 = SCP 경계 ∩ IAM Allow − (모든 Deny)
```

SCP에는 두 전략이 있다. **Allow list 전략**은 `FullAWSAccess`를 떼고 명시적으로 허용한 서비스만 통과시킨다(positive). **Deny list 전략**은 `FullAWSAccess`를 유지한 채 위험한 액션만 거부한다(negative). 실무 대다수는 Deny list가 운영하기 쉽다 — 새 서비스가 나올 때마다 allow를 추가할 필요가 없기 때문이다.

## 핵심 SCP 패턴: 리전 잠금

규제·데이터 주권 요구로 특정 리전 외 사용을 막는 가장 빈출하는 패턴이다. 글로벌 서비스(IAM, Organizations, CloudFront, Route 53 등)는 잠그면 안 되므로 `NotAction`으로 예외 처리한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideApprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "organizations:*", "sts:*",
        "cloudfront:*", "route53:*", "waf:*", "wafv2:*",
        "shield:*", "support:*", "globalaccelerator:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

`us-east-1`을 허용 리전에 포함시키는 이유는 다수의 글로벌 서비스 API 엔드포인트가 거기서 호출되기 때문이다. 이를 빠뜨리면 CloudFront·ACM(글로벌) 같은 콘솔 작업이 깨진다 — 시험 단골 함정이다.

## 핵심 SCP 패턴: 보안 통제 비활성화 방지

조직의 보안 베이스라인(GuardDuty, CloudTrail, Config, Security Hub)을 계정 관리자가 끄지 못하게 막는다. "탐지를 끄고 나쁜 짓을 한다"는 공격 시나리오를 차단하는 핵심이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectSecurityServices",
      "Effect": "Deny",
      "Action": [
        "guardduty:DeleteDetector",
        "guardduty:DisassociateFromMasterAccount",
        "guardduty:StopMonitoringMembers",
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "securityhub:DisableSecurityHub"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdminRole"
        }
      }
    }
  ]
}
```

`Condition`으로 지정한 보안 관리 역할만 예외를 두어, 유지보수 자동화는 가능하되 일반 사용자는 못 끄게 한다.

## 핵심 SCP 패턴: 루트 사용자·태그 강제

루트 사용자 자격증명 사용 차단과 필수 태그 강제도 빈출이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRootUserActions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
      }
    },
    {
      "Sid": "RequireCostCenterTagOnEC2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "Null": { "aws:RequestTag/CostCenter": "true" }
      }
    }
  ]
}
```

## SCP가 통제하지 못하는 것

시험은 SCP의 *한계*를 반드시 묻는다. SCP는 다음을 통제하지 못한다:

- **관리 계정의 멤버**: 위에서 언급. 관리 계정은 SCP에서 자유롭다.
- **서비스 연결 역할(Service-Linked Role)**: AWS 서비스가 자동 생성·사용하는 SLR은 SCP의 영향을 받지 않는다.
- **리소스 기반 정책의 외부 교차계정 부여**: SCP는 조직 내 *프린시펄*의 권한 상한이므로, 외부에서 들어오는 액세스(리소스 정책으로 허용한)는 별개로 다뤄야 한다.
- **권한 부여**: 거듭 강조 — SCP는 천장일 뿐 바닥(부여)이 아니다.

또한 SCP는 **RCP(Resource Control Policy)**와 짝을 이룬다. SCP가 "이 조직의 프린시펄이 무엇을 할 수 있나"의 상한이라면, RCP는 "이 조직의 리소스에 누가 접근할 수 있나"의 상한이다. 예컨대 S3 버킷이 조직 외부 프린시펄에게 노출되는 것을 RCP로 조직 전역에서 막을 수 있다.

## 위임 관리자(Delegated Administrator)

관리 계정에 모든 보안 운영을 몰아넣는 것은 안티패턴이다. 관리 계정은 결제·조직 통제만 담당하고, 실제 보안 서비스 운영은 별도의 **위임 관리자 계정**(통상 Audit/Security 계정)으로 위임한다.

```bash
# GuardDuty 위임 관리자 지정 (관리 계정에서 실행)
aws organizations register-delegated-administrator \
  --account-id 222233334444 \
  --service-principal guardduty.amazonaws.com

# Security Hub, Config, Macie, IAM Access Analyzer, Detective,
# Firewall Manager 등도 동일 패턴으로 위임 가능
```

위임 관리자 모델의 이점:
- 관리 계정의 공격 표면을 줄인다(blast radius 최소화).
- 보안 팀이 관리 계정의 결제·조직 권한 없이도 보안 서비스를 운영한다(직무 분리).
- 각 보안 서비스가 조직 전역 멤버를 자동 등록·관리하는 허브가 된다.

> 💡 **관련 이론**: 이것은 *직무 분리(Separation of Duties)*와 *최소 권한*의 조직 구현이다. NIST SP 800-53의 AC-5(직무 분리)는 단일 주체가 전 과정을 통제하지 못하게 하라고 요구한다. 관리 계정(결제·조직)과 위임 관리자(보안 운영)를 분리하면, 한 계정의 탈취가 전체 통제를 내주지 않는다.

## 중앙 보안 계정 모델

AWS의 권장 멀티계정 보안 아키텍처(SRA, Security Reference Architecture)는 보안 기능을 두 전용 계정에 집중시킨다:

- **Security Tooling(Audit) 계정**: GuardDuty·Security Hub·Config·Macie·Detective의 위임 관리자. 조직 전역 탐지 결과(findings)가 여기로 집계된다. 자동 대응(Lambda, EventBridge)도 여기서 오케스트레이션한다.
- **Log Archive 계정**: CloudTrail 조직 추적, Config 스냅샷, VPC Flow Logs, CloudWatch 로그가 흘러들어오는 **불변(immutable)** 로그 저장소. 객체 잠금(S3 Object Lock), MFA Delete, 별도 KMS 키, 엄격한 버킷 정책으로 보호한다.

```
워크로드 계정들 ──(조직 CloudTrail)──▶ Log Archive (불변 S3, Object Lock)
       │
       └──(GuardDuty/Config/SecurityHub 멤버)──▶ Audit (위임 관리자, 집계·대응)
```

조직 CloudTrail은 관리 계정에서 활성화하면 모든 멤버 계정에 자동 적용되고, 멤버 계정 관리자는 이를 끄거나 볼 수 없다(읽기 전용). 이것이 "탐지를 끄지 못하게" 만드는 거버넌스의 출발점이다.

## 함정 정리

- SCP는 권한을 *부여하지 않는다*. IAM Allow가 없으면 SCP가 허용해도 액세스 불가.
- SCP는 *관리 계정 멤버*에 적용되지 않는다 → 관리 계정에 워크로드 금지.
- 리전 잠금 SCP에서 글로벌 서비스와 `us-east-1`을 예외하지 않으면 콘솔이 깨진다.
- 보안 서비스 비활성화 방지 SCP는 *유지보수 역할 예외*를 빼먹으면 자동화가 막힌다.
- 보안 운영은 *위임 관리자*로 옮기고 관리 계정은 결제·조직에만 쓴다.

## 📝 연습 문제

**문제 1.** 한 OU에 `FullAWSAccess`가 그대로 붙어 있고, IAM 사용자에게 `s3:GetObject` Allow가 부여돼 있다. 그런데 상위 Root에 붙은 SCP가 `s3:*`를 Deny한다. 이 사용자는 S3 객체를 읽을 수 있는가?

A) 읽을 수 있다 — IAM Allow가 SCP보다 우선하므로  
B) 읽을 수 없다 — SCP의 명시적 Deny가 IAM Allow를 무력화하므로  
C) 읽을 수 있다 — OU에 FullAWSAccess가 있으므로  
D) 계정 관리자만 읽을 수 있다  

**정답: B**  
해설: 유효 권한은 SCP 경계와 IAM Allow의 교집합에서 모든 Deny를 뺀 것이다. 상위 노드의 SCP가 명시적으로 거부하면 하위 어디서 Allow가 있어도 액세스가 불가능하다. IAM Allow가 SCP보다 우선한다는 것은 오해이며, FullAWSAccess는 거부를 무력화하지 못한다. 계정 관리자라도 SCP Deny는 동일하게 적용된다(단 관리 계정 멤버는 예외).

---

**문제 2.** 규제 요구로 워크로드를 ap-northeast-2 외부에서 생성하지 못하게 SCP로 막으려 한다. 가장 올바른 설계는?

A) 모든 액션을 ap-northeast-2 외에서 Deny하고 예외 없음  
B) `NotAction`으로 IAM·CloudFront·Route 53 등 글로벌 서비스를 예외하고 `aws:RequestedRegion`이 허용 리전이 아닐 때 Deny하며 us-east-1을 허용 목록에 포함  
C) 각 계정의 IAM 정책에서 리전을 제한  
D) NACL로 타 리전 트래픽을 차단  

**정답: B**  
해설: 리전 잠금 SCP는 글로벌 서비스를 `NotAction`으로 예외하고 `aws:RequestedRegion` 조건으로 비허용 리전을 거부하되, 다수 글로벌 API가 호출되는 us-east-1을 허용 목록에 넣어야 콘솔·ACM·CloudFront가 깨지지 않는다. 예외 없는 전면 Deny는 글로벌 서비스를 함께 죽인다. IAM 정책은 계정마다 분산돼 거버넌스로 부적합하고, NACL은 API 리전 통제와 무관하다.

---

**문제 3.** 보안 팀이 GuardDuty를 조직 전역에서 운영하되 관리 계정의 결제·조직 권한은 받지 않게 하려 한다. 올바른 방법은?

A) 관리 계정에 보안 팀 IAM 사용자를 만든다  
B) Audit 계정을 GuardDuty 위임 관리자로 등록(register-delegated-administrator)하고 보안 팀은 그 계정에서 운영  
C) 각 워크로드 계정에서 GuardDuty를 개별 운영  
D) 루트 사용자를 공유한다  

**정답: B**  
해설: 위임 관리자 모델은 관리 계정의 공격 표면을 줄이고 직무를 분리한다. Audit 계정을 GuardDuty 위임 관리자로 등록하면 보안 팀이 결제·조직 권한 없이 조직 전역 탐지를 운영할 수 있다. 관리 계정에 사용자를 두면 blast radius가 커지고, 계정별 개별 운영은 집계·일관성을 잃으며, 루트 공유는 직무 분리와 정면 충돌한다.

---

**문제 4.** 다음 중 SCP로 통제할 수 *없는* 대상은?

A) 워크로드 계정 관리자의 ec2:RunInstances 권한 상한  
B) 멤버 계정에서 CloudTrail 로깅 중지 시도  
C) 관리 계정에 속한 IAM 사용자의 액션  
D) 멤버 계정의 특정 리전 사용 차단  

**정답: C**  
해설: SCP는 관리 계정(Management Account)의 멤버에게는 적용되지 않는다. 따라서 관리 계정 IAM 사용자의 액션은 SCP로 제한할 수 없고, 이 때문에 관리 계정에 워크로드를 두지 말라는 원칙이 나온다. 나머지는 모두 SCP의 정상 통제 범위로, 권한 상한·보안 서비스 비활성화 방지·리전 차단은 SCP의 전형적 용도다.

---

**문제 5.** AWS SRA가 권장하는 중앙 보안 계정 모델에서 불변 로그 보관을 전담하는 계정과 그 보호 수단의 조합으로 가장 적절한 것은?

A) Audit 계정 — Security Hub로 로그를 보관  
B) Log Archive 계정 — S3 Object Lock, MFA Delete, 전용 KMS 키, 엄격한 버킷 정책으로 불변성 확보  
C) 관리 계정 — 모든 로그를 직접 저장  
D) 각 워크로드 계정 — 로컬에 로그 보관  

**정답: B**  
해설: SRA는 탐지 집계·대응을 담당하는 Audit(Security Tooling) 계정과, 변경 불가 로그를 보관하는 Log Archive 계정을 분리한다. Log Archive는 S3 Object Lock(WORM), MFA Delete, 전용 KMS 키, 최소 권한 버킷 정책으로 로그의 위·변조·삭제를 막는다. Audit 계정은 보관이 아니라 분석·대응 허브이고, 관리 계정은 결제·조직 전용이며, 워크로드 로컬 보관은 탈취 시 함께 삭제될 위험이 있어 부적합하다.

---
