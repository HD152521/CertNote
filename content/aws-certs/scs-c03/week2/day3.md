# Day 3 - AWS Organizations와 SCP: 계정 단위 가드레일 설계

수백 개 계정을 가진 조직에서 "모든 계정이 절대 하면 안 되는 일"을 어떻게 강제할까? 계정마다 IAM 정책을 일일이 배포하면 새 계정이 추가될 때마다 누락이 생기고, root 사용자는 IAM 정책으로 제어조차 안 된다. 이 문제의 정답이 **AWS Organizations의 SCP(Service Control Policy)**다.

SCP는 day1·day2에서 본 "권한의 상한선"의 최상위 층이다. 계정 전체에, root 사용자까지 포함해 가드레일을 친다. Specialty 시험 도메인 1(보안 거버넌스)의 핵심이며, OU 설계·SCP 평가·상속 규칙을 정확히 이해해야 한다.

SCP를 제대로 이해하려면 관점을 한 번 뒤집어야 한다. IAM 정책은 "무엇을 할 수 있게 할까"를 쓰는 문서지만, SCP는 **"무엇이 절대 일어나서는 안 되는가"**를 쓰는 문서다. 전자는 개별 업무를 가능하게 만드는 도구이고, 후자는 조직의 불변식(invariant)을 선언하는 도구다. "CloudTrail은 어떤 계정에서도 꺼지지 않는다", "우리 데이터는 승인된 리전을 벗어나지 않는다" 같은 문장이 SCP가 표현하는 것이다. 이 차이를 놓치면 SCP를 IAM처럼 쓰다가 관리 불가능한 상태에 빠진다.

## Organizations의 구조: 계층적 트리

Organizations는 계정들을 트리로 조직한다.

```
Root (조직 루트, 단 하나)
 │
 ├── 관리 계정 (Management Account, payer)
 │
 ├── OU: Security
 │    ├── Log Archive 계정
 │    └── Audit 계정
 │
 ├── OU: Production
 │    ├── prod-app-1 계정
 │    └── prod-app-2 계정
 │
 └── OU: Sandbox
      └── dev-1 계정
```

SCP는 이 트리의 **Root, OU, 또는 개별 계정**에 부착할 수 있다. 그리고 상위에 부착한 SCP는 **하위 모든 노드에 상속**된다.

> ⚠️ **함정**: **관리 계정(Management Account)에는 SCP가 적용되지 않는다.** 트리상 SCP를 관리 계정에 붙여도 효과가 없다. 그래서 보안 모범 사례는 관리 계정에 워크로드를 절대 두지 않고, 결제·조직 관리 전용으로만 쓰는 것이다. 관리 계정이 손상되면 조직 전체가 위험해진다. 시험 단골 함정이다.

### SCP가 닿는 곳과 닿지 않는 곳

가드레일을 설계하기 전에 **가드레일이 물리적으로 닿지 않는 영역**을 먼저 확정해야 한다. 여기서 착각하면 "막았다고 생각했는데 안 막힌" 구멍이 남는다.

```
[ SCP 적용 범위 지도 ]

  ✅ 적용된다
     · 멤버 계정의 모든 IAM 사용자·롤
     · 멤버 계정의 **root 사용자**
     · 멤버 계정에서 AssumeRole로 얻은 모든 임시 세션
     · 페더레이션으로 들어온 세션(Identity Center 포함)

  ❌ 적용되지 않는다
     · 관리 계정(Management Account)의 모든 주체
     · **서비스 연결 롤(service-linked role)**
     · 조직 밖 계정의 프린시펄
       └ 우리 리소스를 외부 계정이 부르는 경로는 SCP 밖이다
     · 리소스 기반 정책이 조직 밖에 열어 준 접근
       └ 이 사각지대를 메우는 것이 RCP
```

이 지도에서 세 번째·네 번째 항목이 핵심이다. SCP는 **"우리 계정의 프린시펄이 무엇을 할 수 있는가"**만 통제한다. 반대 방향, 즉 **"우리 리소스에 누가 닿을 수 있는가"**는 SCP의 사정권 밖이다. 개발자가 버킷 정책에 외부 계정을 열어 주면 SCP는 그것을 막지 못한다. 이 방향을 통제하려고 나온 것이 **RCP(Resource Control Policy)** 이고, 그래서 두 정책은 경쟁 관계가 아니라 서로의 뒷면이다.

| | SCP | RCP |
|---|-----|-----|
| 통제 방향 | **나가는 쪽** — 우리 프린시펄의 행동 | **들어오는 쪽** — 우리 리소스로의 접근 |
| 막는 것 | 우리 직원이 금지된 API를 부르는 것 | 조직 밖 프린시펄이 우리 리소스를 쓰는 것 |
| 적용 대상 | 멤버 계정의 프린시펄 | 멤버 계정의 리소스 |
| 대표 조건 키 | `aws:RequestedRegion`, `aws:PrincipalArn` | `aws:PrincipalOrgID`, `aws:PrincipalIsAWSService` |
| 지원 서비스 | 대부분의 AWS 서비스 | **일부 서비스로 한정** |
| 권한 부여 | 안 함 | 안 함 |

> ⚠️ **함정**: "SCP로 데이터 반출을 막았다"는 서술은 절반만 맞다. SCP는 *우리 직원이 외부 버킷으로 복사하는 것*(`aws:ResourceOrgID` 조건으로)은 막을 수 있지만, *외부 주체가 우리 버킷을 읽어 가는 것*은 막지 못한다. 후자는 버킷 정책 또는 RCP의 영역이다. 시험에서 "조직 밖 프린시펄의 접근을 조직 차원에서 일괄 차단"이라는 요구가 나오면 SCP가 아니라 RCP 쪽을 봐야 하고, 다만 RCP는 지원 서비스가 한정적이라는 단서가 함께 붙는다.

### Organizations의 정책은 SCP만이 아니다

Organizations는 여러 정책 타입을 제공하고, 각각 성격이 다르다. 시험에서 "이 요구에 맞는 정책 타입은?"으로 직접 묻는다.

| 정책 타입 | 하는 일 | 성격 |
|-----------|---------|------|
| SCP | 프린시펄이 부를 수 있는 API의 상한 | **예방(차단)** |
| RCP | 리소스에 접근할 수 있는 프린시펄의 상한 | **예방(차단)** |
| Tag policy | 태그 키의 표기·허용값 표준화 | 표준화·리포팅 중심 |
| Backup policy | 조직 차원 백업 계획 배포 | 설정 배포 |
| AI services opt-out policy | AI 서비스의 데이터 활용 거부 | 설정 배포 |

여기서 반드시 구분해야 할 것이 **태그 정책은 차단 수단이 아니라는 점**이다. 태그 정책은 비준수 태그를 *리포팅*하고 일부 작업을 제한할 수 있을 뿐, "태그 없이는 리소스를 만들 수 없다"는 강제는 SCP의 `aws:RequestTag`·`Null` 조건으로 만들어야 한다. day1에서 본 `Null` 연산자가 여기서 쓰인다.

```bash
# 조직에 SCP 기능을 켠다 (all features 활성화가 선행되어야 한다)
aws organizations enable-policy-type \
  --root-id r-abcd \
  --policy-type SERVICE_CONTROL_POLICY

# SCP 생성
aws organizations create-policy \
  --name deny-region-and-org-exit \
  --type SERVICE_CONTROL_POLICY \
  --description "리전 제한 + 조직 이탈 차단" \
  --content file://scp-guardrail.json

# OU에 부착
aws organizations attach-policy \
  --policy-id p-examplepolicyid \
  --target-id ou-abcd-11111111

# 특정 대상에 실제로 붙어 있는 SCP 목록 (트러블슈팅의 시작점)
aws organizations list-policies-for-target \
  --target-id 111122223333 \
  --filter SERVICE_CONTROL_POLICY

# 반대로 이 정책이 어디에 붙어 있는지 역조회
aws organizations list-targets-for-policy --policy-id p-examplepolicyid

# 계정이 속한 부모(OU) 사슬을 거슬러 올라가며 상속 경로를 확인
aws organizations list-parents --child-id 111122223333
```

> ⚠️ **함정**: `aws organizations describe-effective-policy`는 **SCP를 지원하지 않는다.** 태그 정책·백업 정책·AI 옵트아웃 정책의 병합 결과는 이 명령으로 볼 수 있지만, SCP의 "최종 유효 상한"을 한 방에 보여 주는 API는 없다. 그래서 SCP 디버깅은 `list-parents`로 계정 → OU → Root 경로를 거슬러 올라가며 `list-policies-for-target`을 각 단계마다 호출해 **손으로 합성**해야 한다. "SCP 유효 정책을 조회하는 명령"을 고르는 보기가 나오면 함정이다.

## SCP는 권한을 주지 않는다: 오직 필터

day1·day2에서 반복했듯, SCP는 **권한을 부여하지 않는다.** 계정이 사용할 수 있는 권한의 **최대 범위(maximum available permissions)**만 정한다. 실제 권한을 받으려면 여전히 계정 내부의 IAM 정책이 Allow해야 한다.

```
계정 내 주체의 유효 권한 = SCP가 허용한 범위 ∩ IAM 정책이 허용한 범위
```

SCP가 `s3:*`를 허용해도, IAM 정책이 없으면 아무것도 못 한다. 반대로 IAM이 `ec2:*`를 줘도 SCP가 ec2를 허용 안 하면 못 쓴다.

## 두 가지 SCP 전략: Allow List vs Deny List

SCP를 설계하는 방식은 두 가지다.

### 1) Deny List 전략 (가장 흔함)

기본 정책 `FullAWSAccess`(모든 것 허용)를 그대로 두고, **금지할 액션만 명시적으로 Deny**한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeaveOrg",
      "Effect": "Deny",
      "Action": ["organizations:LeaveOrganization"],
      "Resource": "*"
    },
    {
      "Sid": "RestrictRegions",
      "Effect": "Deny",
      "NotAction": ["iam:*", "sts:*", "cloudfront:*", "route53:*", "support:*"],
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

이 정책은 (1) 계정이 조직을 이탈하는 것을 막고, (2) `ap-northeast-2`와 `us-east-1` 외 리전에서의 작업을 차단한다. 단 글로벌 서비스(IAM, STS, CloudFront 등)는 `NotAction`으로 예외 처리했다. 글로벌 서비스는 특정 리전 엔드포인트에 묶이지 않으므로 리전 제한에서 빼야 한다.

> 🔍 **더 깊이**: 리전 제한 SCP를 쓸 때 IAM·STS·CloudFront·Route 53·Support·Organizations 같은 글로벌 서비스를 `NotAction`으로 예외하지 않으면, 콘솔 로그인이나 STS 토큰 발급이 막혀 **계정 전체가 사용 불능**이 될 수 있다. 글로벌 서비스 API는 내부적으로 `us-east-1`로 라우팅되거나 리전 무관하게 동작하기 때문이다. 이 예외 처리를 빠뜨린 사례가 실무·시험 모두에서 흔하다.

### 2) Allow List 전략

`FullAWSAccess`를 떼고, **허용할 액션만 명시**한다. 더 엄격하지만 관리가 어렵다. 새 서비스를 쓸 때마다 SCP를 수정해야 하기 때문이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:*", "ec2:*", "lambda:*", "logs:*"],
    "Resource": "*"
  }]
}
```

> 💡 **관련 이론**: Deny List는 블랙리스트, Allow List는 화이트리스트에 해당한다. 보안 원칙상 화이트리스트(Allow List)가 더 안전하지만, 운영 민첩성과 충돌한다. AWS는 실무에서 **Deny List + 핵심 금지 사항**(Region 제한, root 사용 차단, 보안 서비스 비활성화 차단 등)을 권장한다. 절대 깨지면 안 되는 가드레일만 Deny로 강하게 박고, 나머지는 IAM과 Permission Boundary로 세밀하게 통제하는 다층 전략이다.

## SCP 평가 규칙: 상속과 교집합

여러 계층에 SCP가 걸려 있을 때 평가는 다음과 같다.

```
한 액션이 허용되려면, Root → OU → 계정 경로상의
모든 계층에서 그 액션이 허용되어야 한다 (AND/교집합).

단, 어느 한 계층이라도 명시적 Deny하면 → 차단.
```

즉 SCP 상속은 **누적적으로 좁아진다(점점 빼기)**. 상위 OU가 `s3:*`만 허용하면, 하위 OU에서 `ec2:*`를 추가로 허용해도 소용없다. 상위에서 이미 ec2를 빼버렸기 때문이다.

```
Root SCP:    FullAWSAccess (모두 허용)
  └ Prod OU SCP:  Deny ec2:*   (EC2 금지)
      └ app-1 계정 SCP: Allow ec2:RunInstances 시도
        → 결과: 차단. 상위 OU의 Deny가 이김.
```

> ⚠️ **함정**: "하위 계정에서 SCP로 권한을 다시 열 수 있는가?"라는 질문에 "예"라고 답하면 틀린다. SCP는 상속을 통해 **점점 제한만 강해진다.** 상위에서 막은 것을 하위에서 풀 수 없다. 권한을 "주는" 것은 오직 IAM 정책이며, SCP는 그 IAM이 발휘할 수 있는 천장만 낮춘다.

상속을 계산할 때 헷갈리는 지점은 **Allow 리스트 전략과 Deny 리스트 전략이 상속에서 다르게 동작한다**는 점이다. 그림으로 정리하면 이렇다.

```
[ SCP 상속 계산 — 두 전략의 차이 ]

── Deny 리스트 전략 (FullAWSAccess 유지) ─────────────────
   Root      : FullAWSAccess + Deny(organizations:LeaveOrganization)
   Prod OU   : FullAWSAccess + Deny(비승인 리전)
   계정      : FullAWSAccess + Deny(ec2:TerminateInstances)
                        │
                        ▼
   유효 상한 = 전부 허용 − (조직 이탈 ∪ 비승인 리전 ∪ 인스턴스 종료)
   → 금지 목록이 **합쳐진다(합집합)**. 계층이 늘수록 더 많이 막힌다.

── Allow 리스트 전략 (FullAWSAccess 제거) ────────────────
   Root      : Allow(s3:*, ec2:*, lambda:*, iam:*, sts:*)
   Prod OU   : Allow(s3:*, lambda:*)
   계정      : Allow(s3:*, lambda:*, dynamodb:*)
                        │
                        ▼
   유효 상한 = s3:* ∩ lambda:*  (dynamodb는 상위에 없어 탈락)
   → 허용 목록이 **깎인다(교집합)**. 하위에서 추가해도 소용없다.

  ※ 두 전략이 섞여 있으면: 각 계층에서 "허용되고, 어디서도 Deny되지
    않은" 액션만 남는다. 결국 판정 규칙은 하나다 —
    "경로상 모든 계층에서 허용 + 어느 계층에도 Deny 없음".
```

Allow 리스트 전략이 관리하기 어려운 진짜 이유가 여기 있다. 하위 OU에서 새 서비스를 쓰려면 **그 계정만 고치는 것으로는 안 되고 Root까지 거슬러 올라가 전 계층을 수정해야 한다.** 조직이 커질수록 이 비용이 기하급수로 커지므로, 실무는 거의 항상 Deny 리스트를 택한다.

> 🔍 **더 깊이**: `FullAWSAccess`를 떼는 순간 되돌리기 어려운 상황이 만들어질 수 있다. 상위 OU에서 `FullAWSAccess`를 제거하고 좁은 Allow 리스트만 남기면, 그 순간부터 하위 모든 계정에서 목록 밖 API가 전부 죽는다. 여기에는 **조직을 관리하는 API 자체**도 포함될 수 있어, 상황을 되돌릴 작업조차 막히는 경우가 생긴다. 그래서 Allow 리스트로 전환할 때는 반드시 (1) 가장 하위의 시험용 OU에서 먼저 적용하고, (2) `organizations:*`·`iam:*`·`sts:*` 같은 복구 경로를 목록에 남기며, (3) 관리 계정에서 되돌릴 수 있음을 확인한 뒤 위로 올린다. SCP 사고의 대부분은 공격이 아니라 이 순서를 건너뛴 배포에서 나온다.

> 🎯 **시나리오**: "Prod OU에 `Deny ec2:*` SCP가 걸려 있는데, Auto Scaling이 계속 인스턴스를 띄우고 종료한다. SCP가 동작하지 않는 것인가?" → SCP는 **서비스 연결 롤에 적용되지 않는다.** Auto Scaling이 자기 서비스 연결 롤로 수행하는 EC2 작업은 SCP 밖에 있다. 여기서 판단해야 할 것은 "SCP가 고장났다"가 아니라 "SCP는 *사람과 워크로드 롤*을 통제하는 도구이고, AWS 서비스가 자기 기능을 수행하는 경로는 대상이 아니다"라는 성질이다. 그 경로까지 통제하려면 Auto Scaling 그룹 자체의 구성을 제한하거나(예: 시작 템플릿·인스턴스 타입 제한), 서비스 자체를 못 쓰게 막아야 한다.

## OU 설계 패턴: 기능별 분리

성숙한 조직의 표준 OU 구조(AWS Landing Zone / Control Tower 권장)는 다음과 같다.

| OU | 용도 | 대표 SCP |
|----|------|----------|
| Security | 로그·감사 계정 격리 | CloudTrail 비활성화 차단 |
| Infrastructure | 공유 네트워크·DNS | 네트워크 변경 제한 |
| Workloads/Prod | 프로덕션 워크로드 | 리전 제한, root 차단 |
| Workloads/SDLC | 개발·스테이징 | 비용 상한, 인스턴스 타입 제한 |
| Sandbox | 실험 계정 | 예산 가드레일, 분리된 결제 |
| Suspended | 폐기 예정 계정 | Deny 거의 전부 |

핵심 설계 원칙은 **"블래스트 반경(blast radius) 격리"**다. prod와 dev를 다른 OU에 두면, dev 계정에 적용할 느슨한 SCP가 prod에 새어나가지 않는다.

> 🔍 **더 깊이**: AWS Control Tower는 이 OU 구조와 SCP·CloudTrail·Config를 자동으로 세팅하는 매니지드 랜딩 존이다. Control Tower의 "guardrails"는 내부적으로 SCP(예방적 통제)와 AWS Config Rules(탐지적 통제)의 조합으로 구현된다. 예방적 가드레일 = SCP(차단), 탐지적 가드레일 = Config(위반 감지·알림). 시험에서 "예방 vs 탐지"를 구분하는 문제가 나온다.

## SCP로 막아야 할 필수 가드레일

실무에서 거의 항상 거는 SCP들이다.

1. **조직 이탈 차단**: `organizations:LeaveOrganization` Deny
2. **CloudTrail 비활성화 차단**: `cloudtrail:StopLogging`, `cloudtrail:DeleteTrail` Deny
3. **보안 서비스 비활성화 차단**: GuardDuty, Config, Security Hub 비활성화 Deny
4. **루트 사용자 사용 제한**: `Condition`에 `aws:PrincipalArn`이 root면 Deny
5. **리전 제한**: 데이터 주권 규제 대응
6. **IAM 사용자 생성 차단**: Identity Center를 강제하려면 `iam:CreateUser` Deny

> 💡 **관련 이론**: 이 가드레일들은 보안 통제 분류상 **예방적 통제(preventive control)**에 속한다. NIST의 통제 분류(예방/탐지/교정)에서 예방적 통제가 가장 비용 효율적인데, 사건이 발생하기 전에 차단하기 때문이다. SCP는 AWS에서 가장 강력한 예방적 통제 수단이며, "막을 수 있는 것은 탐지보다 막는 게 낫다"는 원칙을 구현한다.

### 가드레일 SCP 실물

위 여섯 항목을 실제 정책 문서로 옮기면 다음과 같다. 각 문장이 정확히 어떤 우회를 겨냥하는지 함께 읽는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenySecurityServiceTampering",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "config:DeleteDeliveryChannel",
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector",
        "securityhub:DisableSecurityHub",
        "ec2:DeleteFlowLogs"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdmin"
        }
      }
    },
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
      "Sid": "DenyPublicAccessBlockRemoval",
      "Effect": "Deny",
      "Action": [
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteAccountPublicAccessBlock"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdmin"
        }
      }
    },
    {
      "Sid": "RequireIMDSv2OnLaunch",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": { "ec2:MetadataHttpTokens": "required" }
      }
    },
    {
      "Sid": "DenyResourceCreationWithoutOwnerTag",
      "Effect": "Deny",
      "Action": ["ec2:RunInstances", "rds:CreateDBInstance", "s3:CreateBucket"],
      "Resource": "*",
      "Condition": {
        "Null": { "aws:RequestTag/Owner": "true" }
      }
    },
    {
      "Sid": "DenyLeavingOrganization",
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization",
        "account:CloseAccount"
      ],
      "Resource": "*"
    }
  ]
}
```

| Sid | 겨냥하는 우회 | 빠뜨렸을 때 |
|-----|---------------|-------------|
| `DenySecurityServiceTampering` | 침해자가 흔적을 지우려 로깅·탐지를 끄는 것 | 사고 조사에 필요한 증거가 사라진다 |
| `DenyRootUserActions` | MFA·감사 밖에 있는 root 사용자의 임의 행위 | 계정별 root 자격증명이 통제 사각지대로 남는다 |
| `DenyPublicAccessBlockRemoval` | 퍼블릭 차단 설정을 풀어 버킷을 노출 | 설정 하나로 전체 버킷이 인터넷에 열린다 |
| `RequireIMDSv2OnLaunch` | IMDSv1로 인스턴스를 띄워 SSRF 표면을 남기는 것 | 메타데이터 탈취 경로가 계속 재생산된다 |
| `DenyResourceCreationWithoutOwnerTag` | 소유자 없는 리소스 양산 | 비용·책임 귀속이 불가능해진다 |
| `DenyLeavingOrganization` | 계정이 조직에서 빠져나가 가드레일을 벗는 것 | 통제 전체가 한 번의 API 호출로 무효화된다 |

`RequireIMDSv2OnLaunch`는 day1의 Capital One 계열 공격을 정면으로 겨냥하는 문장이라 특히 눈여겨볼 만하다. IMDSv2는 인스턴스 메타데이터를 읽기 전에 PUT 요청으로 토큰을 먼저 받도록 요구하므로, 단순 SSRF(서버가 대신 GET 요청을 보내게 만드는 공격)로는 자격증명에 닿기 어려워진다. **아키텍처 수준의 취약 패턴을 조직 전체에서 한 번에 봉쇄한다**는 점이 SCP의 진짜 위력이다.

> ⚠️ **함정**: `DenyRootUserActions`처럼 `"Action": "*"`에 root를 통째로 막는 문장은 강력하지만, **root만 할 수 있는 작업**이 존재한다는 점을 함께 고려해야 한다. 계정 복구, 일부 지원 절차, 특정 계정 설정 변경은 root가 필요하다. 그래서 실무에서는 이 문장을 `NotAction`으로 최소한의 예외를 두거나, 예외가 필요할 때 관리 계정에서 SCP를 잠시 분리하는 절차를 문서화해 둔다. 통제를 걸 때는 **통제를 푸는 절차도 함께 설계**하는 것이 원칙이다.

> 🔍 **더 깊이**: `ArnNotLike`로 특정 관리 롤을 예외 처리하는 패턴(`aws:PrincipalARN`)은 편리하지만 **그 롤 이름을 만들 수 있는 사람이 곧 예외를 만들 수 있는 사람**이 된다는 위험이 있다. 어느 계정에서든 `OrgSecurityAdmin`이라는 이름의 롤을 만들면 예외에 걸리기 때문이다. 그래서 이 패턴을 쓸 때는 반드시 짝이 되는 방어를 함께 건다 — 그 이름 규칙의 롤을 *만들거나 수정하는* 액션을 SCP로 다시 Deny하거나, `aws:PrincipalArn`을 계정 번호까지 못 박은 정확한 ARN으로 지정하는 것이다. 예외 조건은 언제나 그 예외를 획득하는 경로까지 함께 잠가야 완성된다.

### SCP를 안전하게 배포하는 순서

SCP는 잘못 붙이면 조직 전체를 멈출 수 있는 유일한 정책이다. 그래서 내용만큼 **배포 절차**가 중요하다.

```
[ SCP 롤아웃 5단계 ]

① 초안 작성 + 정적 검증
   · 문법 검증, 리전 제한이면 글로벌 서비스 NotAction 예외 확인
   · 복구 경로(organizations/iam/sts)가 살아 있는지 확인
        │
        ▼
② 영향 분석 — 로그로 예측한다
   · CloudTrail을 조회해 "이 정책이 있었다면 막혔을 호출"을 집계
   · 특히 배치·CI/CD·서비스 롤처럼 사람이 없는 경로를 확인
        │
        ▼
③ 가장 좁은 대상에 먼저 부착
   · Sandbox OU 또는 시험용 계정 하나
   · 최소 며칠 관찰 — 주기 잡(월간·분기) 누락에 주의
        │
        ▼
④ 단계적 확대
   · Sandbox → SDLC → Prod 순
   · 각 단계에서 AccessDenied 급증 여부를 모니터링
        │
        ▼
⑤ 되돌릴 준비를 유지
   · detach-policy 절차와 권한자를 사전 지정
   · 관리 계정에서 수행 가능함을 확인 (SCP는 관리 계정에 적용 안 됨)
```

②단계가 실무에서 가장 큰 차이를 만든다. **CloudTrail에는 이미 "누가 어떤 API를 어느 리전에서 불렀는가"가 전부 남아 있으므로**, 새 SCP가 무엇을 막을지는 배포 전에 계산할 수 있다. 이 계산을 건너뛰고 배포하는 것이 조직을 멈추는 사고의 거의 유일한 원인이다.

### "SCP가 범인인가" 판정하기

day1의 진단 절차를 SCP에 특화하면 다음과 같다.

| 신호 | 해석 |
|------|------|
| 오류 메시지에 `explicit deny in a service control policy` | SCP 확정. 즉시 `list-policies-for-target`으로 경로 추적 |
| `AdministratorAccess`인데도 막힘 + 리전·서비스가 특정됨 | 리전 제한 또는 서비스 금지 SCP 유력 |
| 시뮬레이터는 `allowed`인데 실제 호출은 실패 | SCP는 시뮬레이터가 평가하지 않는다 — 1순위 용의자 |
| 같은 액션이 A 계정에서는 되고 B 계정에서는 안 됨 | 두 계정의 **OU 경로가 다르다**. `list-parents`로 비교 |
| 관리 계정에서는 되는데 멤버 계정에서만 안 됨 | SCP 확정(관리 계정에는 적용되지 않으므로) |

마지막 행이 특히 실용적이다. **관리 계정에서 같은 호출을 해 보면 SCP 여부가 한 번에 갈린다** — 관리 계정에서 성공하고 멤버 계정에서 실패하면 SCP가 범인일 가능성이 매우 높다.

## 정리하며

SCP는 멀티 계정 거버넌스의 척추다. 핵심은 (1) 권한을 주지 않고 상한만 정한다, (2) 관리 계정에는 적용 안 된다, (3) 상속은 누적적으로 좁아질 뿐 하위에서 다시 열 수 없다, (4) 리전 제한 시 글로벌 서비스를 예외해야 한다, (5) OU는 blast radius 격리 기준으로 설계한다 — 이 다섯이다. Permission Boundary가 개인의 천장이라면 SCP는 계정의 천장이고, 둘이 함께 다층 가드레일을 이룬다. 여기에 (6) 서비스 연결 롤에는 적용되지 않는다, (7) 조직 밖에서 들어오는 접근은 SCP가 아니라 RCP·리소스 정책의 영역이다 — 두 가지 사각지대를 더해야 지도가 완성된다.

> 📚 **사례**: 2014년 Code Spaces는 침해자가 AWS 콘솔 접근 권한을 확보한 뒤 인스턴스·스토리지·스냅샷·백업을 삭제하면서 사업 자체를 접었다. 데이터가 아니라 **데이터를 되살릴 수단이 통째로 지워진** 사건이다. 이 사례가 SCP 설계에 주는 교훈은 직접적이다. 침해가 시작된 뒤 방어자가 기댈 수 있는 것은 "침해자도 넘지 못하는 상한"뿐이며, 그 상한은 침해된 계정 *바깥*에 있어야 한다. 계정 안의 IAM 정책은 침해자가 관리자 권한을 잡는 순간 함께 무력화되지만, SCP는 관리 계정에서 관리되므로 멤버 계정을 장악한 침해자가 풀 수 없다. 그래서 백업·로그 저장소를 별도 계정에 두고, 그 계정을 삭제 권한이 봉쇄된 OU에 넣는 구조가 표준이 됐다. **"관리자도 지울 수 없는 사본"을 만드는 유일한 방법이 계정 경계와 SCP의 조합**이다.

> 📚 **사례**: 실제 조직에서 가장 자주 일어나는 SCP 사고는 공격이 아니라 **배포 실수**다. 리전 제한 SCP를 배포하면서 IAM·STS를 `NotAction`으로 예외하지 않아 전 계정의 콘솔 로그인과 토큰 발급이 동시에 죽는 사고, `FullAWSAccess`를 떼고 좁은 Allow 리스트를 상위 OU에 붙였다가 복구 API까지 막혀 관리 계정에서만 되돌릴 수 있었던 사고가 대표적이다. 두 사고 모두 CloudTrail을 먼저 조회해 "이 정책이 있었다면 막혔을 호출"을 집계하는 단계를 건너뛴 데서 나왔다. SCP는 조직 전체에 한 번에 적용되는 유일한 통제이므로, **적용 범위가 넓다는 사실 자체가 위험**이라는 점을 배포 절차에 반영해야 한다.

## 한 줄 요약

SCP는 계정 단위의 **상한**이며 권한을 부여하지 않는다. 멤버 계정의 root에는 적용되지만 **관리 계정과 서비스 연결 롤에는 적용되지 않고**, 조직 밖 프린시펄이 우리 리소스에 접근하는 방향은 SCP가 아니라 RCP·리소스 정책의 영역이다. 상속은 Root → OU → 계정 경로의 모든 계층이 허용해야 통과하는 교집합이고 하위에서 다시 열 수 없으며, Deny 리스트 전략은 금지가 합집합으로 누적되고 Allow 리스트 전략은 허용이 교집합으로 깎인다. 필수 가드레일은 조직 이탈 차단, 보안 서비스 비활성화 차단, root 사용 제한, 퍼블릭 차단 해제 금지, IMDSv2 강제, 태그 없는 생성 금지이고, 리전 제한에는 글로벌 서비스 `NotAction` 예외가 반드시 따라붙는다. `describe-effective-policy`는 SCP를 지원하지 않으므로 `list-parents` + `list-policies-for-target`으로 손수 합성해 디버깅하며, "관리 계정에서는 되는데 멤버 계정에서만 안 된다"가 SCP를 특정하는 가장 빠른 신호다. 배포는 CloudTrail 기반 영향 분석 → 좁은 OU 선적용 → 단계적 확대 → 되돌리기 준비 순으로 한다.

다음 글에서는 권한을 "주는" 쪽으로 시선을 옮긴다. IAM Identity Center와 페더레이션으로 멀티 계정 환경에서 사람들에게 어떻게 안전하게 접근을 부여하는지, 그리고 ABAC로 태그 기반 접근 제어를 어떻게 확장하는지 다룬다.

---

## 📝 연습 문제

**문제 1.** 한 보안팀이 조직의 모든 계정에서 CloudTrail이 절대 비활성화되지 않도록 강제하려 한다. 가장 적절한 방법은?

A) 각 계정에 IAM 정책으로 CloudTrail 보호를 배포한다  
B) Root 또는 상위 OU에 `cloudtrail:StopLogging`과 `cloudtrail:DeleteTrail`을 Deny하는 SCP를 적용한다  
C) AWS Config Rule로 CloudTrail 상태를 모니터링한다  
D) 관리 계정에만 SCP를 적용한다  

**정답: B**  
해설: SCP는 OU/Root에 한 번 적용하면 하위 모든 계정에 상속되는 예방적 통제다. CloudTrail 비활성화 액션을 Deny하면 어떤 계정에서도, root조차도 끄지 못한다. IAM 배포는 새 계정 누락 위험이 있고, Config는 사후 탐지일 뿐 차단하지 못한다. 관리 계정에는 SCP가 적용되지 않으므로 D는 틀리다.

---

**문제 2.** Prod OU에 `Deny ec2:*` SCP가 걸려 있다. Prod OU 하위의 한 계정에서 IAM 관리자가 `Allow ec2:*` IAM 정책을 만들고, 그 계정에 추가 SCP로 `Allow ec2:RunInstances`도 적용했다. EC2 인스턴스를 시작할 수 있는가?

A) 가능하다, 하위 SCP가 상위 OU SCP를 덮어쓰므로  
B) 가능하다, IAM 정책이 Allow하므로  
C) 불가능하다, 상위 OU의 명시적 Deny가 상속되어 이기므로  
D) 조건에 따라 다르다  

**정답: C**  
해설: SCP 상속은 누적적으로 제한이 강해진다. 상위 OU의 명시적 Deny는 하위로 상속되며, 하위에서 SCP나 IAM으로 다시 열 수 없다. 명시적 Deny는 모든 Allow를 이긴다. 하위 SCP가 상위를 덮어쓰지 않으며, IAM Allow도 SCP Deny를 뚫지 못한다.

---

**문제 3.** 리전 제한 SCP를 적용한 직후 사용자들이 콘솔 로그인과 STS 토큰 발급에 실패하기 시작했다. 가장 가능성 높은 원인은?

A) SCP가 관리 계정에 적용되었다  
B) IAM·STS 같은 글로벌 서비스를 `NotAction` 예외로 처리하지 않아 함께 차단되었다  
C) 리전 제한은 원래 로그인을 막는다  
D) MFA가 활성화되지 않았다  

**정답: B**  
해설: 글로벌 서비스(IAM, STS, CloudFront, Route 53 등)는 특정 리전 엔드포인트에 묶이지 않고 내부적으로 us-east-1 등으로 라우팅된다. 리전 제한 Deny에서 이들을 `NotAction`으로 예외하지 않으면 로그인과 토큰 발급까지 막혀 계정이 사용 불능이 된다. 이는 리전 제한 SCP의 대표적 실수다.

---

**문제 4.** SCP의 예방적 통제(preventive control)와 AWS Config Rule의 탐지적 통제(detective control)의 차이로 옳은 것은?

A) SCP는 위반을 사후 감지하고, Config는 위반을 사전 차단한다  
B) SCP는 위반 행위를 사전에 차단하고, Config는 위반 상태를 사후 감지·알림한다  
C) 둘 다 동일하게 작동한다  
D) Config가 SCP보다 항상 강력하다  

**정답: B**  
해설: SCP는 액션 자체를 거부해 사건 발생 전에 차단하는 예방적 통제다. Config Rule은 이미 만들어진 리소스의 준수 여부를 평가해 위반을 감지·알림하는 탐지적 통제다. 막을 수 있으면 막는 SCP가 비용 효율적이며, 탐지가 필요한 영역을 Config가 보완한다.

---

**문제 5.** 한 조직이 관리 계정(Management Account)에서 프로덕션 워크로드를 운영하고 있다. 보안 관점에서 이것이 문제인 이유로 가장 적절한 것은?

A) 관리 계정은 비용이 더 비싸다  
B) 관리 계정에는 SCP가 적용되지 않아 가드레일로 보호할 수 없고, 손상 시 조직 전체가 위험해진다  
C) 관리 계정에서는 EC2를 띄울 수 없다  
D) 관리 계정은 CloudTrail을 지원하지 않는다  

**정답: B**  
해설: SCP는 멤버 계정에만 적용되고 관리 계정에는 효과가 없다. 따라서 관리 계정에 워크로드를 두면 SCP 가드레일의 보호를 받지 못하며, 조직 전체를 통제하는 계정이 손상될 경우 모든 멤버 계정이 위험에 노출된다. 모범 사례는 관리 계정을 결제·조직 관리 전용으로만 사용하는 것이다.
