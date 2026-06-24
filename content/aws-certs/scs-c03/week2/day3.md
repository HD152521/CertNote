# Day 3 - AWS Organizations와 SCP: 계정 단위 가드레일 설계

수백 개 계정을 가진 조직에서 "모든 계정이 절대 하면 안 되는 일"을 어떻게 강제할까? 계정마다 IAM 정책을 일일이 배포하면 새 계정이 추가될 때마다 누락이 생기고, root 사용자는 IAM 정책으로 제어조차 안 된다. 이 문제의 정답이 **AWS Organizations의 SCP(Service Control Policy)**다.

SCP는 day1·day2에서 본 "권한의 상한선"의 최상위 층이다. 계정 전체에, root 사용자까지 포함해 가드레일을 친다. Specialty 시험 도메인 1(보안 거버넌스)의 핵심이며, OU 설계·SCP 평가·상속 규칙을 정확히 이해해야 한다.

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

## 정리하며

SCP는 멀티 계정 거버넌스의 척추다. 핵심은 (1) 권한을 주지 않고 상한만 정한다, (2) 관리 계정에는 적용 안 된다, (3) 상속은 누적적으로 좁아질 뿐 하위에서 다시 열 수 없다, (4) 리전 제한 시 글로벌 서비스를 예외해야 한다, (5) OU는 blast radius 격리 기준으로 설계한다 — 이 다섯이다. Permission Boundary가 개인의 천장이라면 SCP는 계정의 천장이고, 둘이 함께 다층 가드레일을 이룬다.

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
