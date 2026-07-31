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

## 정책 평가 순서: 무엇이 무엇을 이기는가

SCS 시험에서 가장 배점이 높은 사고 능력은 "여러 정책이 겹쳐 있을 때 이 요청이 통과하는가"를 흔들림 없이 판정하는 것이다. AWS는 하나의 API 요청을 평가할 때 적용 가능한 모든 정책 유형을 동시에 모아 놓고, 정해진 규칙으로 결론을 낸다.

```
[ 요청 하나가 ALLOW에 도달하기까지 ]

요청 = (Principal, Action, Resource, Condition Context)
   │
   ├─① 명시적 Deny 검사 ── 어느 정책 유형이든 Deny가 하나라도 있으면 ▶ DENY (즉시 종료)
   │
   ├─② SCP(조직 권한 경계) ── 프린시펄 계정의 유효 SCP가 허용하지 않으면 ▶ DENY
   │
   ├─③ RCP(조직 리소스 경계) ── 리소스 측 조직 상한이 허용하지 않으면 ▶ DENY
   │
   ├─④ 리소스 기반 정책 ── 동일 계정 + 프린시펄 ARN을 직접 지정한 Allow면
   │                        아이덴티티 정책 없이도 통과 가능(유일한 예외 경로)
   │
   ├─⑤ 권한 경계(Permissions Boundary) ── 경계가 허용하지 않으면 ▶ DENY
   │
   ├─⑥ 세션 정책(AssumeRole 시 전달) ── 세션 정책이 허용하지 않으면 ▶ DENY
   │
   └─⑦ 아이덴티티 기반 정책 ── Allow가 없으면 ▶ 암묵적 DENY(기본 거부)
                                   │
                                   ▼
                                 ALLOW
```

여기서 반드시 붙잡아야 할 세 가지 원칙이 있다.

**원칙 1 — 명시적 Deny는 항상 최종이다.** SCP, 아이덴티티 정책, 리소스 정책, 권한 경계, 세션 정책 어디에 있든 Deny 하나면 끝이다. "상위 OU에서 Deny했지만 계정에 FullAWSAccess가 있으니 통과한다"는 오답의 원형이다.

**원칙 2 — Allow는 곱셈, Deny는 덧셈이다.** 여러 제한 유형은 교집합(AND)으로 좁혀지고, 거부는 합집합(OR)으로 넓어진다.

```
유효 권한 = (SCP ∩ RCP ∩ 권한경계 ∩ 세션정책) ∩ (IAM Allow ∪ 리소스정책 Allow) − (모든 Deny)
```

**원칙 3 — 교차 계정은 양쪽 다 필요하다.** 계정 A의 역할이 계정 B의 S3 버킷을 읽으려면, A의 아이덴티티 정책도 Allow, B의 버킷 정책도 Allow여야 한다. 한쪽만 열면 통과하지 않는다. 동일 계정 안에서만 리소스 정책 단독 Allow가 성립한다.

| 정책 유형 | 붙는 대상 | 권한 부여 | 권한 제한 | 관리 계정에 적용 | 대표 용도 |
|---|---|---|---|---|---|
| **SCP** | Root / OU / 계정 | ✗ | ○ (프린시펄 상한) | **✗ 적용 안 됨** | 리전 잠금, 보안 서비스 보호, 루트 차단 |
| **RCP** | Root / OU / 계정 | ✗ | ○ (리소스 접근 상한) | ✗ 적용 안 됨 | 조직 외부로의 데이터 노출 차단 |
| **아이덴티티 기반 IAM** | 사용자 / 그룹 / 역할 | ○ | ○ | ○ | 실제 권한 부여의 본체 |
| **리소스 기반 정책** | S3·KMS·SQS·Lambda 등 리소스 | ○ (교차계정 포함) | ○ | ○ | 교차 계정 공유, 서비스 프린시펄 허용 |
| **권한 경계** | IAM 사용자 / 역할 | ✗ | ○ (개별 주체 상한) | ○ | 위임 관리자에게 안전하게 IAM 생성 권한 부여 |
| **세션 정책** | AssumeRole 세션 | ✗ | ○ (일시적 상한) | ○ | 페더레이션·임시 자격증명 축소 |

> ⚠️ **함정**: "SCP와 권한 경계 중 무엇을 쓰나"를 묻는 상황에서 판단 기준은 *적용 범위*다. **계정·OU 전체의 천장**이면 SCP, **특정 IAM 주체 하나의 천장**(예: 개발자가 만든 역할이 관리자 권한을 갖지 못하게)이면 권한 경계다. SCP는 IAM 주체를 골라 붙일 수 없고, 권한 경계는 계정 전체에 자동 상속되지 않는다. 둘을 바꿔 답하게 만드는 보기가 거의 매 세트에 나온다.

> 🔍 **더 깊이**: SCP는 프린시펄이 *멤버 계정에 속할 때만* 평가된다. 그래서 서비스 연결 역할(SLR)처럼 AWS 서비스가 자기 이름으로 수행하는 호출, 그리고 관리 계정의 프린시펄은 SCP 평가 대상에서 빠진다. 반대로 RCP는 *리소스가 속한 계정*을 기준으로 평가되므로, 조직 외부의 프린시펄이 조직 내 S3 버킷에 접근하려는 흐름을 막을 수 있다. 즉 SCP는 "우리 사람이 밖으로 나가는 문", RCP는 "밖의 사람이 우리 리소스로 들어오는 문"을 각각 잠근다. RCP는 출시 시점 기준 S3·STS·KMS·SQS·Secrets Manager 등 일부 서비스만 지원하므로, "모든 서비스에 대해 조직 경계를 강제한다"는 서술은 틀린 보기다.

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

루트 차단 정책에서 자주 놓치는 지점은 **완전 차단이 아니라 예외 설계**다. AWS 계정에는 루트만 할 수 있는 작업이 존재한다(계정 해지, 지원 플랜 변경, 일부 S3 버킷 정책 복구, 특정 결제 설정). 그래서 실무에서는 `Action: "*"` 전면 Deny 대신, 워크로드 액션만 거부하고 계정 복구용 경로는 남기거나, 루트 자격증명 자체를 물리적으로 봉인(MFA 하드웨어 토큰 + 비밀번호 분할 보관)하는 방식을 병행한다. 시험은 "루트 사용 자체를 SCP로 막을 수 있는가"를 물으면 **멤버 계정 루트는 막을 수 있고, 관리 계정 루트는 막을 수 없다**가 정답 축이다.

태그 강제 SCP에서도 조건 연산자를 정확히 골라야 한다.

| 목적 | 조건 키·연산자 | 의미 |
|---|---|---|
| 태그가 아예 없으면 차단 | `"Null": {"aws:RequestTag/CostCenter": "true"}` | 요청에 해당 태그 키가 없음 |
| 태그 값이 허용 목록 밖이면 차단 | `"StringNotEquals": {"aws:RequestTag/Env": ["prod","stg","dev"]}` | 값 화이트리스트 |
| 지정한 키 외의 태그를 못 붙이게 | `"ForAnyValue:StringNotEquals": {"aws:TagKeys": [...]}` | 키 집합 통제 |
| 이미 붙은 리소스 태그로 접근 통제 | `"StringNotEquals": {"aws:ResourceTag/Owner": "${aws:PrincipalTag/Team}"}` | ABAC |

`aws:RequestTag/*`는 **생성 요청에 담긴 태그**를, `aws:ResourceTag/*`는 **이미 리소스에 붙어 있는 태그**를 본다. 이 둘을 바꿔 쓰면 정책이 조용히 무력화된다 — 생성 시점 강제인데 `ResourceTag`를 쓰면 아직 리소스가 없으므로 조건이 성립하지 않는다.

## 조직 경계 SCP: 데이터가 조직 밖으로 나가지 못하게

거버넌스에서 가장 값비싼 사고는 권한 오설정이 아니라 **조직 경계 밖으로의 데이터 이동**이다. 탈취된 자격증명으로 스냅샷을 외부 계정과 공유하거나, S3 데이터를 외부 계정 버킷으로 복사하는 흐름은 IAM Allow만 보면 정상적인 API 호출로 보인다. `aws:PrincipalOrgID`와 `aws:ResourceOrgID`가 이 경계를 그리는 조건 키다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenySharingSnapshotsOutsideOrg",
      "Effect": "Deny",
      "Action": [
        "ec2:ModifySnapshotAttribute",
        "ec2:ModifyImageAttribute",
        "rds:ModifyDBSnapshotAttribute",
        "rds:ModifyDBClusterSnapshotAttribute"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
      }
    },
    {
      "Sid": "DenyLeavingOrganization",
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization",
        "organizations:DeleteOrganization",
        "account:CloseAccount"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyDisablingBlockPublicAccess",
      "Effect": "Deny",
      "Action": [
        "s3:PutAccountPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "ec2:DisableImageBlockPublicAccess"
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

`DenyLeavingOrganization`은 자주 간과되는 통제다. 멤버 계정 관리자가 조직을 탈퇴하면 그 순간 모든 SCP·조직 CloudTrail·중앙 탐지가 함께 사라진다. 거버넌스를 벗어나는 가장 빠른 경로를 먼저 잠가야 한다.

> 🎯 **시나리오**: 한 개발 계정에서 EBS 스냅샷이 외부 AWS 계정 ID로 공유된 흔적이 CloudTrail에 남았다. 해당 사용자의 IAM 정책에는 `ec2:*`가 있었고, 이 호출은 정상적으로 성공했다. 조직 전체에서 이 유형의 반복을 구조적으로 막으려면 무엇을 해야 하는가. → IAM 정책을 계정마다 고치는 것은 확장되지 않는다. `aws:PrincipalOrgID`(또는 스냅샷 공유 대상 계정 조건)를 쓴 **SCP를 Root/OU에 부착**해 조직 밖 공유 액션 자체를 상한에서 잘라내야 한다. 여기에 GuardDuty의 스냅샷 공유 관련 발견 유형과 EventBridge 자동 대응을 얹으면 예방+탐지가 겹친다. "IAM 정책 수정"만 고른 보기는 거버넌스 평면을 이해하지 못한 답이다.

## SCP 운영의 현실: 쿼터, 상속, 디버깅

SCP는 문서상 개념보다 운영이 까다롭다. 시험도 이 운영 제약을 묻는다.

- **크기 제한**: 하나의 SCP 문서는 최대 5,120바이트다. 공백·주석이 없는 JSON이므로 실제로는 금방 찬다. 통제를 목적별로 쪼개 여러 정책으로 나누는 이유다.
- **부착 개수 제한**: Root·OU·계정 각 엔터티에 부착할 수 있는 SCP는 최대 5개다(`FullAWSAccess` 포함). 그래서 "정책 1개에 다 넣기"와 "잘게 쪼개기" 사이에서 균형을 잡아야 한다.
- **상속은 교집합**: Root에 붙은 SCP와 OU에 붙은 SCP, 계정에 붙은 SCP는 모두 **동시에** 적용된다. 상위에서 Deny된 것을 하위에서 Allow로 되살릴 수 없다.
- **Allow list 전략의 함정**: `FullAWSAccess`를 떼고 Allow 목록만 남기면, 상위와 하위 양쪽에서 모두 명시적으로 허용해야 통과한다. 상위 OU에서 `s3:*`만 허용했는데 하위에서 `ec2:*`를 허용해도 EC2는 열리지 않는다.

```
Root SCP:  Allow [s3:*, iam:*, cloudwatch:*]
  └ OU SCP: Allow [s3:*, ec2:*]
        └ 유효 경계 = 교집합 = [s3:*]   ← ec2도 iam도 통과 못 함
```

디버깅은 다음 순서로 한다. ① IAM Policy Simulator로 아이덴티티 정책 자체를 확인, ② CloudTrail의 `errorCode`가 `AccessDenied`이면서 메시지에 조직 정책 관련 문구가 있는지 확인, ③ `describe-effective-policy`로 계정에 실제 적용 중인 유효 정책을 조회.

> ⚠️ **함정**: SCP 변경은 **즉시 전파되지만 이미 발급된 임시 자격증명의 유효성 자체를 취소하지는 않는다.** SCP는 요청 시점에 평가되므로 새 요청부터 막히지만, "SCP를 붙였으니 진행 중인 세션이 즉시 종료된다"는 서술은 틀리다. 세션을 실제로 무력화하려면 역할 신뢰 정책 변경, `aws:TokenIssueTime` 조건을 이용한 Deny, 또는 자격증명 폐기가 필요하다. 침해 대응 시나리오에서 이 구분이 정답을 가른다.

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

전체 그림을 하나로 그리면 다음과 같다.

```
                        ┌──────────────────────────────┐
                        │  관리 계정 (Management)       │
                        │  · 조직 생성/결제/SCP 부착     │
                        │  · 워크로드 없음 (SCP 미적용)  │
                        │  · 루트 자격증명 물리 봉인     │
                        └───────────┬──────────────────┘
                                    │ register-delegated-administrator
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ OU: Security   │        │ OU: Infrastructure│        │ OU: Workloads    │
│                │        │                   │        │  ├ OU: Prod      │
│ ┌────────────┐ │        │ ┌───────────────┐ │        │  └ OU: NonProd   │
│ │ Audit 계정  │ │◀───findings────────────────────────────┐         │
│ │ GuardDuty  │ │        │ │ Network 계정   │ │        │  │ App 계정들│
│ │ SecurityHub│ │        │ │ TGW/NFW/DNS   │ │        │  │          │
│ │ Config 집계 │ │        │ └───────────────┘ │        │  └──────────┘
│ │ AuditMgr   │ │        │ ┌───────────────┐ │        │       │
│ │ FMS Admin  │ │        │ │ SharedServices│ │        │       │
│ └────────────┘ │        │ └───────────────┘ │        │       │
│ ┌────────────┐ │        └──────────────────┘        │       │
│ │ Log Archive│ │◀───── 조직 CloudTrail / Config / Flow Logs ┘
│ │ S3 ObjLock │ │        (멤버 계정은 쓰기만, 삭제·중지 불가)
│ │ 전용 KMS    │ │
│ └────────────┘ │
└────────────────┘

핵심 비대칭: 워크로드 계정은 로그를 "보낼 수만" 있고, 읽거나 지울 수 없다.
```

이 비대칭이 거버넌스의 본질이다. 침해자가 워크로드 계정을 완전히 장악해도 Log Archive 계정의 증거를 지울 수 없으면, 사후 추적과 법적 증거 능력이 살아남는다.

> 📚 **사례**: 2014년 6월, 영국의 코드 호스팅 업체 **Code Spaces**는 공격자가 회사의 AWS 콘솔 제어판에 접근한 뒤 금전을 요구했고, 회사가 통제권을 되찾으려 하자 공격자가 EBS 스냅샷·S3 버킷·AMI·인스턴스를 대량 삭제했다. 백업이 동일한 AWS 계정 안에 있었기 때문에 데이터와 백업이 함께 사라졌고, 회사는 사업을 중단했다. 이 사건은 "백업·로그를 *운영 계정과 다른 신뢰 경계*에 두어야 한다"는 원칙이 왜 선택이 아니라 생존 조건인지 보여 준다. 오늘날의 대응은 별도 Log Archive 계정 + S3 Object Lock + MFA Delete + 계정 간 권한 분리이며, `organizations:LeaveOrganization`·`s3:DeleteBucket` 같은 파괴적 액션을 SCP로 잘라내는 것이다.

> 🎯 **시나리오**: 보안 팀이 조직 전역 GuardDuty·Security Hub·Config를 운영해야 하지만, 결제 정보 접근과 조직 구조 변경 권한은 절대 받으면 안 된다는 감사 요구가 있다. 또한 보안 팀이 자신에게 관리자 권한을 스스로 부여하는 경로도 차단해야 한다. 어떻게 설계하는가. → ① Audit 계정을 각 보안 서비스의 **위임 관리자**로 등록해 관리 계정 권한 없이 조직 전역 운영을 가능하게 한다. ② 보안 팀이 Audit 계정 안에서 IAM 역할을 만들 수는 있되 그 역할이 특정 상한을 넘지 못하도록 **권한 경계**를 필수 부착하는 SCP(`iam:CreateRole` 시 `iam:PermissionsBoundary` 조건)를 건다. ③ 관리 계정에는 사람 사용자를 두지 않고 IAM Identity Center로만 접근한다. 위임 관리자만 답으로 고르면 ②의 자기 권한 상승 경로가 열린 채 남는다.

## CLI로 이해 굳히기

```bash
# 1) 조직 구조 확인
aws organizations describe-organization
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-exam
aws organizations list-accounts-for-parent --parent-id ou-exam-prod

# 2) SCP 생성 (리전 잠금)
aws organizations create-policy \
  --name "RegionLockdown-APNE2" \
  --type SERVICE_CONTROL_POLICY \
  --description "ap-northeast-2 및 글로벌 서비스 외 차단" \
  --content file://region-lockdown-scp.json

# 3) OU에 부착
aws organizations attach-policy \
  --policy-id p-exampleid \
  --target-id ou-exam-prod

# 4) 특정 계정에 실제로 걸려 있는 정책 목록
aws organizations list-policies-for-target \
  --target-id 111122223333 \
  --filter SERVICE_CONTROL_POLICY

# 5) 상속까지 반영된 "유효 정책" 조회 (태그 정책/백업 정책 등)
aws organizations describe-effective-policy \
  --policy-type TAG_POLICY \
  --target-id 111122223333

# 6) 위임 관리자 등록 — 보안 서비스별로 반복
for SVC in guardduty securityhub config-multiaccountsetup \
           access-analyzer macie detective fms auditmanager; do
  aws organizations register-delegated-administrator \
    --account-id 222233334444 \
    --service-principal ${SVC}.amazonaws.com
done

aws organizations list-delegated-administrators

# 7) 조직 전역 CloudTrail (관리 계정에서 1회)
aws cloudtrail create-trail \
  --name org-trail \
  --s3-bucket-name org-log-archive-bucket \
  --is-organization-trail \
  --is-multi-region-trail \
  --enable-log-file-validation \
  --kms-key-id arn:aws:kms:ap-northeast-2:333344445555:key/xxxx

# 8) 계정을 격리 OU로 이동 (침해 대응 시)
aws organizations move-account \
  --account-id 111122223333 \
  --source-parent-id ou-exam-prod \
  --destination-parent-id ou-exam-quarantine
```

8번의 "격리 OU로 이동"은 실전 대응에서 강력한 카드다. `DenyAll` SCP가 걸린 Suspended/Quarantine OU를 미리 만들어 두면, 침해 계정을 그 OU로 옮기는 단 한 번의 호출로 계정 전체의 API 액션을 상한에서 차단할 수 있다. 계정 안의 IAM 정책을 하나씩 회수하는 것보다 훨씬 빠르고 확실하다.

> 🔍 **더 깊이**: `enable-log-file-validation`은 CloudTrail이 로그 파일의 SHA-256 해시와 서명이 담긴 다이제스트 파일을 함께 남기게 한다. 감사·포렌식에서 "이 로그가 조작되지 않았다"를 증명하는 근거이며, Control Tower의 필수 컨트롤에도 포함된다. Log Archive 버킷을 KMS로 암호화할 때는 키 정책에서 CloudTrail 서비스 프린시펄의 `kms:GenerateDataKey*`를 허용해야 하는데, 이를 빠뜨리면 로그가 아예 기록되지 않고 조용히 실패한다 — "로그가 안 쌓인다"는 증상의 단골 원인이다.

## 함정 정리

- SCP는 권한을 *부여하지 않는다*. IAM Allow가 없으면 SCP가 허용해도 액세스 불가.
- SCP는 *관리 계정 멤버*에 적용되지 않는다 → 관리 계정에 워크로드 금지.
- 리전 잠금 SCP에서 글로벌 서비스와 `us-east-1`을 예외하지 않으면 콘솔이 깨진다.
- 보안 서비스 비활성화 방지 SCP는 *유지보수 역할 예외*를 빼먹으면 자동화가 막힌다.
- 보안 운영은 *위임 관리자*로 옮기고 관리 계정은 결제·조직에만 쓴다.
- Allow list 전략에서는 *상위와 하위 모두* 허용해야 통과한다(교집합). 하위만 허용하면 열리지 않는다.
- `aws:RequestTag`(생성 요청 태그)와 `aws:ResourceTag`(기존 리소스 태그)를 바꿔 쓰면 정책이 조용히 무력화된다.
- SCP는 요청 시점 평가다 — 붙였다고 *이미 발급된 임시 자격증명 세션이 끊기지는 않는다*.
- SCP는 프린시펄 상한, RCP는 리소스 접근 상한. 방향이 반대다.
- 조직 이탈(`organizations:LeaveOrganization`)을 막지 않으면 거버넌스 전체가 한 번의 API로 무효화된다.

## 한 줄 요약 체크리스트

- [ ] 관리 계정에 워크로드·사람 사용자가 없고, 루트 자격증명이 물리적으로 봉인돼 있는가
- [ ] SCP가 *권한 부여가 아니라 상한*임을 전제로, IAM Allow와 교집합으로 유효 권한을 계산했는가
- [ ] 리전 잠금 SCP에 글로벌 서비스 `NotAction` 예외와 `us-east-1`이 포함돼 있는가
- [ ] 보안 서비스 비활성화 방지 SCP에 유지보수 역할 `Condition` 예외가 있는가
- [ ] 조직 이탈·계정 폐쇄·퍼블릭 액세스 차단 해제를 SCP로 막았는가
- [ ] 스냅샷·AMI 외부 공유를 `aws:PrincipalOrgID` 조건으로 차단했는가
- [ ] GuardDuty·Security Hub·Config·Audit Manager·FMS를 모두 Audit 계정에 위임했는가
- [ ] 조직 CloudTrail이 다중 리전 + 로그 파일 검증 + 전용 KMS로 Log Archive에 쌓이는가
- [ ] Log Archive 버킷에 Object Lock·MFA Delete·최소 권한 버킷 정책이 걸려 있는가
- [ ] `DenyAll` SCP가 걸린 격리 OU를 미리 만들어 두어 침해 계정을 즉시 옮길 수 있는가

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
