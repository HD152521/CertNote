# Day 3 - 자격증명 유출 대응: 액세스 키 노출, 루트 침해, IAM 무력화·회전 플레이북

자격증명 유출은 클라우드 침해의 가장 흔한 진입점이다. GitHub에 무심코 커밋된 액세스 키, 피싱으로 탈취된 루트 비밀번호, 침해된 인스턴스에서 빠져나간 STS 토큰 — 공격자는 취약점을 뚫기보다 *유효한 자격증명으로 정문으로 들어온다*. 대응의 본질은 *"노출된 자격증명을 얼마나 빨리 무력화하고, 그것으로 무엇이 일어났는지 추적하며, 안전하게 재발급하느냐"*다. 시험은 자격증명 유형(IAM 사용자 키 / 루트 / 임시 STS / 페더레이션)별로 *무력화 메커니즘이 다르다*는 점을 집요하게 묻는다.

핵심 원칙 세 가지: ① **무력화는 삭제보다 비활성화·폐기가 우선**(증거·복구 여지 보존), ② **유형마다 회수 메커니즘이 다름**, ③ **무력화 후 반드시 활동 추적(CloudTrail)과 회전**.

## 유형별 무력화 메커니즘 (가장 중요)

| 자격증명 유형 | 무력화 방법 | 추적 |
|---------------|-------------|------|
| IAM 사용자 액세스 키 | `update-access-key Status=Inactive`(즉시), 추후 `delete-access-key` | CloudTrail accessKeyId |
| IAM 사용자 콘솔 비밀번호 | `delete-login-profile` 또는 비밀번호 재설정 + MFA 강제 | CloudTrail userIdentity |
| STS 임시 자격증명(역할) | 역할에 `aws:TokenIssueTime` Deny(세션 폐기), 인스턴스/역할 격리 | sts AssumeRole 이벤트 |
| 루트 계정 | 비밀번호 재설정, 루트 액세스 키 삭제, 루트 MFA 재설정, AWS Support | 루트 userIdentity |
| 페더레이션(IdP) | IdP에서 세션 무효화 + IAM 역할 신뢰 정책 제한 | SAML/OIDC 이벤트 |

> 💡 **관련 이론**: 자격증명은 *long-term*(IAM 사용자 키·비밀번호 — 명시적 폐기 필요)과 *short-term*(STS 토큰 — 폐기 API 없음, 시점 기반 거부로 무력화)으로 갈린다. 이 구분이 "왜 액세스 키는 비활성화하는데 STS 토큰은 TokenIssueTime으로 거부하는가"의 근거다. zero-trust 원칙에서 모든 자격증명은 언제든 폐기 가능해야 하지만(revocability), AWS의 임시 자격증명은 성능을 위해 *서명만 검증하고 중앙 폐기 목록을 두지 않으므로*, 폐기는 토큰을 받는 역할 측 정책으로 구현된다.

### 유형별 대응이 어떻게 달라지는가

무력화 API만 다른 것이 아니다. **폭발 반경, 시간 압박, 추적 축, 재발 방지책이 전부 다르다.** 시험은 이 표의 어느 한 칸을 바꿔 놓고 오답을 만든다.

| 축 | IAM 사용자 액세스 키 유출 | 루트 계정 침해 | 역할 세션(STS) 탈취 |
|---|---|---|---|
| 폭발 반경 | 그 사용자의 권한 범위 | **계정 전체 — IAM 정책도 SCP도 온전히 막지 못함** | 그 역할의 권한 범위 |
| 1순위 조치 | `update-access-key --status Inactive` | 비밀번호·MFA 재설정, 루트 액세스 키 삭제 | `aws:TokenIssueTime` Deny |
| 신규 발급 차단 | 키 비활성화가 곧 차단 | 자격증명 재설정 + MFA 재등록 | 프로파일 분리·신뢰 정책 축소 |
| 시간 압박 | 높음(분) | **최고(초) — 백도어가 즉시 심어짐** | 높음(토큰 만료까지) |
| 추적 키 | `userIdentity.accessKeyId` | `userIdentity.type = Root` | `userIdentity.arn`의 세션 이름·`accessKeyId`(ASIA…) |
| 자동화 적합성 | **높음(가역·기계적)** | 낮음 — 사람 판단·조직 대응 필요 | 높음 |
| 특유의 함정 | 정상 워크로드가 같은 키를 쓰면 즉시 장애 | IAM 정책으로는 루트를 제한할 수 없음 | 같은 역할을 쓰는 정상 세션도 함께 끊김 |
| 근본 대책 | 장기 키 제거(역할·OIDC·Secrets Manager) | 루트 봉인 + 하드웨어 MFA + 사용 탐지 알람 | IMDSv2 강제, 세션 수명 단축 |

세 열을 가르는 한 문장은 이것이다. **키는 "끄면" 되고, 세션은 "거부해야" 하며, 루트는 "되찾아야" 한다.** 액세스 키에는 끌 수 있는 스위치가 있고, STS 토큰에는 스위치가 없어 조건으로 거부할 수밖에 없으며, 루트는 무력화 대상이 아니라 *통제권 자체를 되찾는 문제*라 기술 조치만으로 끝나지 않는다.

```
                    자격증명이 유출됐다는 신호
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      키 문자열이 AKIA… 로 시작?          ASIA… 로 시작 / 세션 ARN?
      = 장기 액세스 키                    = 임시 STS 자격증명
              │                               │
              ▼                               ▼
   update-access-key Inactive        역할에 aws:TokenIssueTime Deny
              │                               │
              │                     ┌─────────┴─────────┐
              │                     ▼                   ▼
              │            인스턴스 프로파일?      페더레이션(SSO/SAML)?
              │            → 프로파일 분리        → IdP에서 세션 폐기가 근본,
              │                                     AWS는 신뢰 정책 축소로 보조
              ▼
    사용 주체가 루트인가?  ──예──▶ 비밀번호·MFA 재설정, 루트 키 삭제,
              │                    조직 관리 계정이면 즉시 최고 등급 에스컬레이션
              아니오
              ▼
    ── 공통 후속 ────────────────────────────────────────────
    CloudTrail 전수 추적 → 백도어 근절 → 회전 → 구조 개선
```

이 결정 트리의 첫 분기(`AKIA` vs `ASIA`)가 실전에서 가장 빠른 판별법이다. 접두사만 봐도 어느 무력화 경로로 갈지가 결정된다.

## 시나리오 1: 액세스 키가 공개 저장소에 노출됐다

가장 흔한 케이스. AWS는 공개 노출된 키를 자동 탐지해 `AWSCompromisedKeyQuarantineV3` 정책을 자동 부착하는 경우도 있지만, *이에 의존하지 말고* 즉시 대응한다.

```bash
# 1) 즉시 비활성화 (삭제 아님 — 추적·복구 여지)
aws iam update-access-key --user-name app-user \
  --access-key-id AKIAEXAMPLE --status Inactive

# 2) 이 키로 무슨 일이 있었는지 추적
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLE \
  --start-time 2026-06-20T00:00:00Z

# 3) (영향 분석 후) 새 키 발급 → 앱 갱신 → 기존 키 삭제
aws iam create-access-key --user-name app-user
aws iam delete-access-key --user-name app-user --access-key-id AKIAEXAMPLE

# 4) 노출된 비밀은 Secrets Manager로 이관 + 자동 회전 설정
```

**플레이북 순서**: 비활성화(봉쇄) → CloudTrail로 영향 추적 → 회전(새 키 발급·앱 갱신) → 기존 키 삭제 → 근본 원인(왜 코드에 키가 있었나 — Secrets Manager·IAM 역할로 전환).

> ⚠️ **함정 — 키를 즉시 삭제**: 노출 키를 곧장 `delete`하면 공격자 활동 추적이 어려워지고(이미 무력화됐으니), 정상 워크로드가 같은 키를 쓰던 경우 즉시 장애가 난다. 비활성화 → 추적 → 회전 → 삭제 순서가 안전하다. 단, 명백한 활성 침해라면 비활성화 자체가 봉쇄이므로 지체 없이 실행한다.

### AWS의 자동 격리 정책을 믿으면 안 되는 이유

AWS는 공개 저장소 등에서 노출된 액세스 키를 탐지하면 계정에 알림을 보내고, 해당 IAM 사용자에게 `AWSCompromisedKeyQuarantine` 계열의 관리형 정책을 부착하는 경우가 있다. 이 정책은 권한 상승·리소스 생성 계열 액션을 광범위하게 `Deny`해 피해를 줄이려는 **응급 처치**다. 하지만 대응자가 여기에 기대면 안 되는 이유가 셋이다.

1. **탐지가 항상 즉시는 아니다.** 노출과 격리 사이의 시간은 보장되지 않으며, 공개 저장소가 아닌 경로(유출된 노트북, 잘못 공유된 문서, 침해된 CI 로그)로 새어 나간 키는 아예 탐지되지 않는다.
2. **격리 정책은 모든 액션을 막지 않는다.** 데이터 읽기처럼 격리 대상에서 벗어난 액션이 남아 있을 수 있다 — *데이터 유출은 계속될 수 있다*는 뜻이다.
3. **정책 부착은 무력화가 아니다.** 키는 여전히 유효하다. 정책이 제거되거나 우회되면 그대로 다시 살아난다. 확실한 봉쇄는 키 자체를 `Inactive`로 만드는 것뿐이다.

즉 AWS의 격리는 *대응 시간을 벌어 주는 장치*이지 대응의 대체물이 아니다. 시험 보기에서 "AWS의 자동 격리를 기다린다"는 선택지는 언제나 오답으로 배치된다.

### 노출 키 대응 플레이북과 각 단계의 근거

```
① 키 비활성화                → 봉쇄. 삭제가 아닌 이유: accessKeyId가 남아 있어야 CloudTrail
                               조회 축이 유지되고, 오판이었을 때 즉시 되살릴 수 있다.
② 사용 이력 즉시 확인          → get-access-key-last-used 로 "언제·어디서·무엇을" 한 줄 요약.
                               전수 조사 전에 심각도를 30초 만에 가늠하는 단계.
③ CloudTrail/Athena 전수 조사  → 정상 사용과 공격자 사용을 소스 IP·리전·User-Agent로 분리한다.
                               여기서 사고의 실제 크기와 백도어 존재 여부가 정해진다.
④ 백도어 근절                 → 공격자가 만든 사용자·키·역할·신뢰 정책·Lambda를 제거.
                               ③ 없이 ④를 하면 반드시 놓친다.
⑤ 회전                        → 새 키 발급 → 워크로드 갱신 → 검증. 이 순서를 지켜야 무중단이다.
⑥ 기존 키 삭제                → 회전이 끝나고 조사 산출물을 확보한 뒤 마지막에.
⑦ 구조 개선                   → 왜 코드에 키가 있었는가. 역할·OIDC·Secrets Manager로 전환.
                               이 단계를 건너뛰면 같은 사고가 반복된다.
```

②와 ③의 분리가 실무적으로 중요하다. 전수 조사는 시간이 걸리지만 `get-access-key-last-used`는 즉시 답한다 — **"이 키가 실제로 쓰였는가, 우리가 쓰지 않는 리전에서 쓰였는가"** 한 줄이 초기 심각도 판단을 좌우한다.

```bash
# ② 30초 심각도 판단
aws iam get-access-key-last-used --access-key-id AKIAEXAMPLE

# 사용자의 모든 키 상태를 한눈에 (미사용·오래된 키 색출에도 쓰인다)
aws iam list-access-keys --user-name app-user

# 계정 전체 자격증명 위생 점검 — 루트 키 존재, MFA 미설정, 미회전 키를 한 번에
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d

# ⑤ 회전: 새 키를 먼저 만들고, 워크로드가 새 키로 도는 것을 확인한 뒤에 지운다
aws iam create-access-key --user-name app-user
aws iam update-access-key --user-name app-user --access-key-id AKIAEXAMPLE --status Inactive
aws iam delete-access-key --user-name app-user --access-key-id AKIAEXAMPLE
```

```json
// 노출 사용자에게 즉시 붙이는 자체 격리 정책 — 조사 시간을 벌되 데이터 유출은 막는다
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyEverythingExceptFromCorporateNetwork",
      "Effect": "Deny",
      "NotAction": ["iam:GetUser", "iam:ListAccessKeys"],
      "Resource": "*",
      "Condition": {
        "NotIpAddress": { "aws:SourceIp": ["203.0.113.0/24"] },
        "Bool": { "aws:ViaAWSService": "false" }
      }
    },
    {
      "Sid": "DenyPersistenceAndExfiltration",
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser", "iam:CreateAccessKey", "iam:AttachUserPolicy", "iam:PutUserPolicy",
        "iam:CreateRole", "iam:UpdateAssumeRolePolicy", "iam:CreateLoginProfile",
        "s3:GetObject", "s3:PutBucketPolicy", "ec2:RunInstances", "lambda:CreateFunction",
        "cloudtrail:StopLogging", "cloudtrail:DeleteTrail"
      ],
      "Resource": "*"
    }
  ]
}
```

두 Statement의 역할이 다르다. 첫째는 *출처*로 잘라 "우리 네트워크 밖에서는 아무것도 못 한다"를 만들고, 둘째는 *행위*로 잘라 지속성 확보와 데이터 유출을 막는다. `aws:ViaAWSService` 조건이 없으면 AWS 서비스가 사용자를 대신해 호출하는 경로까지 막혀 정상 워크로드가 통째로 깨진다 — 격리 정책을 쓸 때 반드시 따라붙는 짝이다.

> 📚 **사례**: 2016년 **Uber**의 대규모 데이터 유출은 "키가 코드 곁에 놓여 있었다"는 이 단원의 명제를 가장 널리 알려진 형태로 보여 준다. 공격자는 엔지니어들이 쓰던 **비공개 GitHub 저장소**에 접근해 그 안에 있던 AWS 자격증명을 찾아냈고, 그 자격증명으로 사용자 데이터가 담긴 S3에 접근했다. 세 가지가 이 사건을 교재로 만든다. ① **"비공개 저장소니까 괜찮다"는 가정이 통제가 아니다** — 저장소 접근 권한은 계정 탈취·내부자·서드파티 통합 등 여러 경로로 새고, 그 순간 저장소 안의 모든 비밀이 함께 샌다. 그래서 근본 대책은 저장소 권한 강화가 아니라 *저장소에 비밀을 두지 않는 것*이다. ② 유출된 것은 취약점이 아니라 **정상적으로 발급된 유효 자격증명**이었고, 그것을 쓴 호출은 로그에서 정상 호출처럼 보인다 — 최소 권한과 이상 행위 탐지가 함께 있어야 잡힌다. ③ 이후 회사가 사고를 **공개하지 않고 처리하려 한 대응 방식**이 법적 책임 문제로 번졌다. 기술적 봉쇄만이 인시던트 대응이 아니라는 사실은 Day 4에서 다시 다룬다.

## 시나리오 2: 루트 계정 침해 (최악)

루트 계정은 *모든 IAM 정책을 무시*하고 *SCP로도 일부 제한만 가능*하며, 일부 작업(계정 폐쇄, 지원 플랜 변경 등)은 루트만 할 수 있다. 침해 시 폭발 반경이 계정 전체다.

```
루트 침해 대응 플레이북
1. 루트 비밀번호 즉시 재설정 (이메일 접근이 살아있다면)
2. 루트 액세스 키 존재 시 즉시 삭제 (루트 키는 애초에 없어야 함)
3. 루트 MFA 재설정 (탈취된 MFA 무효화 — 가상/하드웨어 재등록)
4. CloudTrail로 루트 활동 전수 조사 (새 IAM 사용자/역할 생성? SCP 변경? 키 발급?)
5. 공격자가 만든 백도어(IAM 사용자/역할/키/신뢰 정책) 제거
6. 이메일·전화 등 계정 복구 채널까지 침해됐다면 즉시 AWS Support/Abuse 에스컬레이션
7. Organizations 관리 계정이면 SCP로 멤버 계정 피해 차단
```

**예방이 대응보다 중요**: 루트는 *일상 사용 금지, 액세스 키 없음, 하드웨어 MFA, 사용 시 CloudWatch 알람*. EventBridge로 `userIdentity.type = Root` 이벤트를 탐지해 즉시 알림하는 통제가 핵심이다.

```json
// 루트 사용 탐지 EventBridge 패턴
{
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "userIdentity": { "type": ["Root"] }
  }
}
```

> 💡 **관련 이론**: 루트는 *break-glass(비상 유리 깨기) 계정*의 전형이다. 평상시 봉인하고, 사용 자체가 이벤트가 되도록 감시한다. 루트가 SCP를 우회하는 단 하나의 예외(관리 계정 루트는 SCP 미적용)라는 점이, 루트 보호를 다른 어떤 자격증명보다 우선시해야 하는 구조적 이유다.

루트 대응이 다른 자격증명과 근본적으로 다른 지점은 **순서의 근거**에 있다. 왜 비밀번호보다 MFA를, MFA보다 백도어 제거를 먼저 해야 하는지가 아니라 — 세 가지가 사실상 동시에 진행되어야 하고, 그중 **계정 복구 채널(이메일·전화)의 통제권 확인이 실질적 0단계**라는 점이다.

```
0단계  계정 복구 채널이 아직 내 것인가?
       루트 이메일 주소·전화번호가 바뀌지 않았는지 먼저 확인한다.
       ← 왜 먼저인가: 이것이 이미 바뀌었다면 비밀번호 재설정 자체가 불가능하다.
         그 순간부터는 기술 대응이 아니라 AWS Support/Abuse 에스컬레이션이 유일한 경로다.
1단계  루트 비밀번호 재설정 + MFA 재등록(기존 MFA 장치 제거 후 새로 등록)
       ← 왜 함께인가: 비밀번호만 바꾸면 공격자가 등록해 둔 MFA 장치로 재설정 흐름을 다시 탄다.
2단계  루트 액세스 키 존재 여부 확인 → 있으면 즉시 삭제
       ← 루트 액세스 키는 애초에 존재해서는 안 되는 자산이다. 있다는 것 자체가 사고다.
3단계  CloudTrail로 루트 활동 전수 조사
       ← 루트로 무엇을 만들었는지(사용자·역할·키·신뢰 정책·SCP 변경)를 확인하기 전에는
         "되찾았다"고 말할 수 없다. 백도어가 남아 있으면 통제권은 여전히 공유 상태다.
4단계  백도어 제거 + 조직 차원 봉쇄(관리 계정이면 SCP로 멤버 계정 피해 차단)
5단계  루트 봉인 재구축: 하드웨어 MFA, 액세스 키 없음, 루트 사용 탐지 알람, 복구 채널 이중화
```

```json
// 루트 사용을 "이벤트"로 만드는 탐지 패턴 — 콘솔 로그인까지 잡는다
{
  "detail-type": ["AWS API Call via CloudTrail", "AWS Console Sign In via CloudTrail"],
  "detail": {
    "userIdentity": { "type": ["Root"] }
  }
}
```

```json
// 멤버 계정 루트의 위험 행위를 조직 차원에서 원천 차단하는 SCP
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyRootUserActionsInMemberAccounts",
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
    }
  }]
}
```

이 SCP에는 결정적인 단서가 붙는다. **SCP는 조직 관리 계정의 프린시펄에는 적용되지 않으므로, 관리 계정 루트는 이 정책으로 막을 수 없다.** 그래서 관리 계정 루트는 정책이 아니라 *물리적 통제*(하드웨어 MFA, 자격증명 분리 보관, 사용 시 즉시 알람)로 보호해야 한다. "루트를 IAM 정책이나 SCP로 제한하면 된다"는 보기가 오답인 이유가 여기에 있다 — 멤버 계정에는 부분적으로 통하고, 정작 가장 위험한 관리 계정에는 통하지 않는다.

구조적 해법도 있다. AWS Organizations의 **중앙 루트 액세스 관리**를 활성화하면 멤버 계정의 루트 자격증명(비밀번호·MFA·액세스 키) 자체를 제거할 수 있고, 루트만 수행할 수 있는 소수의 작업이 필요할 때는 관리 계정 쪽에서 단기 루트 세션을 얻는 방식으로 대체한다. **무력화할 루트 자격증명이 계정마다 존재하지 않게 만드는 것**이 이 유형 사고에 대한 가장 강한 예방이다.

## 시나리오 3: 임시 자격증명·페더레이션 유출

EC2/Lambda 역할의 STS 토큰이나 SSO 페더레이션 세션이 탈취된 경우. 액세스 키처럼 비활성화할 키가 없다.

```json
// 역할에 인라인 정책: 시점 이전 발급 세션 전부 거부 (= Revoke active sessions)
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" }
  }
}
```

- **역할 세션**: 위 `aws:TokenIssueTime` Deny로 기존 세션 무력화. 새 발급은 역할 신뢰 정책을 좁히거나 역할을 일시 비활성화(신뢰 정책 비우기)해 차단.
- **페더레이션**: 근본 무력화는 *IdP 측에서* 사용자 세션·자격증명을 폐기해야 한다. AWS 쪽은 역할 신뢰 정책 제한·세션 폐기로 보조.
- **STS GetSessionToken/AssumeRole로 파생된 키**: 원 자격증명(IAM 사용자/역할)을 무력화하면 *새 파생*은 막히지만, 이미 발급된 파생 토큰은 만료 또는 TokenIssueTime Deny로 무효화.

> ⚠️ **함정**: "역할을 삭제하면 토큰이 즉시 무효화된다"는 흔한 오해. 역할 삭제·정책 변경은 *그 시점 이후의 권한 평가*에 적용되므로 토큰 무력화에 쓸 수 있지만, 운영 중인 워크로드를 망가뜨린다. 정석은 역할을 유지하되 TokenIssueTime Deny로 *기존 세션만* 끊는 것이다.

## 무력화 후: 추적과 회전

무력화는 출혈을 멈추는 것일 뿐, 대응의 절반이다.

1. **활동 추적 (CloudTrail / Athena)**: 유출 자격증명이 한 모든 호출을 시간순으로. 새로 만든 IAM 엔티티, 발급한 키, 변경한 정책, 접근한 데이터(S3 GetObject 등), 생성한 리소스(채굴 인스턴스 등)를 전수 파악.

```sql
-- Athena로 CloudTrail에서 유출 키의 활동 조회
SELECT eventtime, eventname, awsregion, sourceipaddress, errorcode
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
  AND eventtime > '2026-06-20'
ORDER BY eventtime;
```

2. **회전(rotation)**: 새 자격증명 발급, 의존 워크로드 갱신. 장기적으로는 *장기 키 제거 → IAM 역할/IRSA/인스턴스 프로파일/Secrets Manager 자동 회전*으로 구조 전환.

3. **백도어 제거**: 공격자가 만든 지속성(persistence) 메커니즘 — 새 IAM 사용자, 추가 액세스 키, 넓힌 신뢰 정책, Lambda 백도어, 변조된 SCP — 를 추적 결과 기반으로 모두 제거.

```
자격증명 유출 통합 플레이북
[봉쇄] 비활성화/세션 폐기 (유형별 메커니즘)
   ▼
[추적] CloudTrail/Athena로 영향 범위·백도어 식별
   ▼
[근절] 공격자가 만든 엔티티·키·정책·리소스 제거
   ▼
[회전] 새 자격증명 발급, 워크로드 갱신
   ▼
[강화] 장기 키 → 역할/Secrets Manager, MFA 강제, 탐지 통제 추가
```

> 🔍 **더 깊이**: 자격증명 유출 대응은 *부분 자동화*가 매우 효과적인 영역이다. GuardDuty의 `UnauthorizedAccess:IAMUser/*`, `CredentialAccess:*` 핀딩 → EventBridge → Lambda로 즉시 키 비활성화·세션 폐기를 자동화하면(Day 1) 평균 대응 시간(MTTR)을 분 단위에서 초 단위로 줄인다. 다만 *추적·근절·회전*은 영향 분석이 필요해 사람의 판단이 들어가는 경우가 많다 — 자동화(즉시 봉쇄)와 사람(영향 분석·복구)의 경계 설정이 핵심이다(Day 4). 또한 근본 해법은 *장기 자격증명을 아예 없애는 것*이다: 사람은 IAM Identity Center(SSO)로 임시 자격증명, 워크로드는 역할/IRSA로, 머신 비밀은 Secrets Manager 자동 회전. 무력화할 장기 키가 없으면 이 유형의 사고 자체가 줄어든다.

### 백도어 헌팅: 무엇을 찾아야 하는지 알아야 찾는다

"백도어를 제거하라"는 지시는 무엇을 찾을지 목록이 없으면 실행 불가능하다. 공격자가 AWS에서 지속성(persistence)을 확보하는 방법은 정형화돼 있고, 대응 런북에는 그 목록이 체크리스트로 들어가야 한다.

| 지속성 기법 | 남는 CloudTrail 이벤트 | 확인 방법 |
|---|---|---|
| 새 IAM 사용자·키 생성 | `CreateUser`, `CreateAccessKey` | 자격증명 보고서에서 최근 생성 사용자 |
| 기존 사용자에 콘솔 로그인 부여 | `CreateLoginProfile`, `UpdateLoginProfile` | 프로그래매틱 전용 사용자에 로그인 프로파일이 생겼는지 |
| 역할 신뢰 정책에 외부 계정 추가 | `UpdateAssumeRolePolicy` | **IAM Access Analyzer의 외부 접근 핀딩** |
| 정책에 새 버전 삽입 후 기본 지정 | `CreatePolicyVersion`, `SetDefaultPolicyVersion` | 정책 버전 이력 비교 |
| Lambda·EventBridge 백도어 | `CreateFunction`, `PutRule`, `AddPermission` | 최근 생성 함수와 그 실행 역할 |
| S3·KMS 리소스 정책 개방 | `PutBucketPolicy`, `PutKeyPolicy`, `CreateGrant` | Access Analyzer + 퍼블릭 액세스 상태 |
| 스냅샷·AMI 외부 공유 | `ModifySnapshotAttribute`, `ModifyImageAttribute` | 공유 대상 계정 목록 |
| EC2 키 페어 등록 | `ImportKeyPair`, `CreateKeyPair` | 최근 키 페어 목록 |
| **로깅 무력화** | `StopLogging`, `DeleteTrail`, `PutEventSelectors`, `DeleteFlowLogs` | 로그의 *공백 구간* 자체가 신호 |
| MFA 무력화 | `DeactivateMFADevice`, `DeleteVirtualMFADevice` | MFA 미설정 사용자 목록 |

마지막에서 두 번째 행이 조사에서 가장 중요하다. **공격자가 CloudTrail을 끄면, 그 사실 자체가 CloudTrail의 마지막 기록으로 남는다.** 그래서 조사는 "무엇이 기록됐는가"뿐 아니라 **"어디에 기록이 없는가"**를 함께 봐야 한다. 조직 차원 CloudTrail(Organization Trail)을 관리 계정에서 만들고 멤버 계정이 끄지 못하게 SCP로 잠그는 이유가 정확히 이것이다.

```sql
-- 유출 자격증명이 지속성을 만들었는지: 생성·권한 변경 계열만 추려 본다
SELECT eventtime, eventname, useridentity.arn, sourceipaddress,
       requestparameters, errorcode
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
  AND eventname IN (
    'CreateUser','CreateAccessKey','CreateLoginProfile','AttachUserPolicy',
    'PutUserPolicy','CreateRole','UpdateAssumeRolePolicy','CreatePolicyVersion',
    'CreateFunction','PutBucketPolicy','StopLogging','DeleteTrail')
ORDER BY eventtime;

-- 정상 사용과 공격자 사용을 가르는 가장 빠른 축: 소스 IP와 리전 분포
SELECT sourceipaddress, awsregion, count(*) AS calls,
       min(eventtime) AS first_seen, max(eventtime) AS last_seen
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
GROUP BY sourceipaddress, awsregion
ORDER BY calls DESC;

-- 공격자가 만든 "2차 자격증명"으로 번진 활동까지 따라간다
SELECT eventtime, eventname, awsregion, requestparameters
FROM cloudtrail_logs
WHERE useridentity.username = 'backup-svc-2'   -- ①에서 발견한 공격자 생성 사용자
ORDER BY eventtime;
```

세 번째 쿼리가 조사에서 자주 빠지는 단계다. **유출된 키의 활동만 보면 조사가 절반에서 끝난다.** 공격자가 그 키로 새 사용자를 만들었다면, 이후 활동은 *새 사용자의 자격증명*으로 이뤄져 원래 키를 축으로 한 조회에 잡히지 않는다. 조사는 발견한 엔티티마다 다시 한 바퀴 도는 **재귀적 작업**이며, Amazon Detective가 엔티티 간 연관 그래프로 이 반복을 줄여 주는 도구다.

```bash
# 신뢰 정책이 외부로 열렸는지 한 번에 확인 — 백도어 헌팅의 표준 도구
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:ap-northeast-2:111122223333:analyzer/org-analyzer \
  --filter '{"status":{"eq":["ACTIVE"]},"resourceType":{"eq":["AWS::IAM::Role"]}}'

# 로그의 공백 구간을 만드는 행위 자체를 감시한다
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StopLogging
```

> 🎯 **시나리오**: 금요일 저녁, 보안 채널에 "GitHub 공개 저장소에서 우리 회사 액세스 키를 봤다"는 외부 제보가 들어왔다. 확인해 보니 커밋은 6일 전이고, 그 키는 배치 작업 서버 세 대가 매시간 사용 중인 운영 키다. 무엇을 어떤 순서로 하는가. → ① **비활성화가 먼저다.** "운영이 멈춘다"는 이유로 회전이 끝날 때까지 살려 두자는 판단은 6일치 노출을 계속 연장하는 선택이다. 배치 중단은 복구 가능하지만 데이터 유출은 복구 불가능하다 — 가역성으로 우선순위를 가르는 원칙이 여기서도 적용된다. ② `get-access-key-last-used`와 CloudTrail의 소스 IP 분포로 **우리 배치 서버 IP 외의 호출이 있었는지**를 30초 안에 확인한다. 이것이 "노출은 됐지만 사용은 안 됐다"와 "이미 침해됐다"를 가르는 단일 판단이다. ③ 외부 IP 호출이 있었다면 즉시 사고 등급을 올리고 위 백도어 체크리스트를 전수 실행한다 — 특히 `CreateUser`·`UpdateAssumeRolePolicy`·`StopLogging`. ④ 병행해 새 키로 회전하고 배치 서버를 갱신한 뒤, ⑤ 기존 키를 삭제한다. ⑥ 마지막이 진짜 대응이다 — **왜 배치 서버가 장기 키를 쓰고 있었는가.** EC2라면 인스턴스 역할로, CI라면 GitHub OIDC 페더레이션으로, 온프레미스라면 IAM Roles Anywhere로 전환한다. 이 단계를 하지 않으면 다음 분기에 같은 사고가 다시 온다.

> ⚠️ **함정**: 회전을 "새 키를 만들고 곧바로 옛 키를 지우는 것"으로 이해하면 반드시 장애가 난다. 안전한 회전은 **① 새 키 발급 → ② 워크로드에 배포 → ③ 새 키로 실제 호출되는지 검증 → ④ 옛 키 비활성화 → ⑤ 관측 기간 후 삭제**의 5단계이며, ④와 ⑤ 사이의 간격이 롤백 여지다. 다만 **명백한 활성 침해에서는 이 순서가 뒤집힌다** — 봉쇄가 가용성보다 우선이므로 비활성화를 먼저 하고 회전을 뒤에 한다. 시험 보기에서 "정상 워크로드가 사용 중"이라는 단서가 붙으면 회전 우선, "공격자가 이미 사용한 정황"이 있으면 비활성화 우선으로 갈린다. 이 단서 한 줄이 정답을 바꾼다.

## 함정 정리

- 노출 키를 곧바로 `delete`하면 CloudTrail 조회 축(accessKeyId)을 잃고 정상 워크로드도 즉시 멈춘다.
- AWS의 자동 격리 정책은 응급 처치일 뿐 — 탐지가 늦을 수 있고, 모든 액션을 막지도 않는다.
- `AKIA`(장기 키)와 `ASIA`(임시 세션)를 구분하지 못하면 무력화 방법 자체를 틀린다.
- STS 토큰에는 폐기 API가 없다 — 비활성화할 대상이 없으므로 `aws:TokenIssueTime` 조건 거부가 유일한 수단이다.
- `TokenIssueTime` Deny는 같은 역할을 쓰는 **정상 세션까지 함께 끊는다** — 영향 범위를 먼저 파악한다.
- 역할을 삭제해 토큰을 무효화하려 하면 운영 워크로드가 함께 무너진다.
- 페더레이션 세션은 IdP에서 폐기하지 않으면 근본 무력화가 아니다 — AWS 측 조치는 보조다.
- 루트는 IAM 정책으로 제한할 수 없고, **SCP는 관리 계정 프린시펄에 적용되지 않는다**.
- 루트 비밀번호만 재설정하고 MFA 장치를 정리하지 않으면 공격자가 재설정 흐름을 다시 탄다.
- 계정 복구 채널(이메일·전화)이 이미 변경됐다면 기술 대응이 아니라 AWS 에스컬레이션이 유일한 경로다.
- 유출된 키의 활동만 조사하고 **공격자가 만든 2차 자격증명의 활동을 따라가지 않는다**.
- 로그의 *공백 구간*(StopLogging·DeleteTrail)을 신호로 읽지 않는다.
- 회전을 "새 키 발급 후 즉시 옛 키 삭제"로 이해해 검증·롤백 여지 없이 장애를 만든다.
- 봉쇄·회전만 하고 "왜 장기 키가 거기 있었는가"라는 구조 문제를 고치지 않아 사고가 반복된다.

## 한 줄 요약 체크리스트

- [ ] 자격증명 유형(사용자 키/비밀번호/STS/루트/페더레이션)별 무력화 메커니즘을 정확히 골랐는가
- [ ] 키 접두사(`AKIA`/`ASIA`)로 장기·임시를 구분해 대응 경로를 갈랐는가
- [ ] 기존 세션 무효화와 신규 발급 차단을 **한 쌍으로** 수행했는가
- [ ] AWS 자동 격리에 기대지 않고 직접 봉쇄했는가
- [ ] 백도어 헌팅 체크리스트(사용자·키·신뢰 정책·정책 버전·Lambda·로깅 무력화)를 전수 확인했는가
- [ ] 공격자가 만든 2차 엔티티를 축으로 조사를 한 바퀴 더 돌렸는가
- [ ] 회전을 5단계(발급→배포→검증→비활성화→삭제)로 안전하게 수행했는가
- [ ] 루트 사용을 탐지 이벤트로 만들고, 복구 채널까지 이중화했는가
- [ ] 액세스 키는 삭제가 아니라 먼저 비활성화(봉쇄)했는가 — 추적·복구 여지 보존
- [ ] STS·역할 세션은 aws:TokenIssueTime Deny로 폐기했는가(삭제 아님)
- [ ] 루트 침해 시 비밀번호·키·MFA 재설정 + 루트 활동 전수 조사 + 백도어 제거를 했는가
- [ ] CloudTrail/Athena로 유출 자격증명의 전체 활동·백도어를 추적했는가
- [ ] 새 자격증명으로 회전하고 의존 워크로드를 갱신했는가
- [ ] 페더레이션은 IdP 측 세션 폐기가 근본 무력화임을 반영했는가
- [ ] 장기적으로 장기 키 제거(역할/SSO/Secrets Manager) + 루트 사용 탐지 알람을 적용했는가

---

## 📝 연습 문제

**문제 1.** IAM 사용자의 액세스 키가 공개 GitHub 저장소에 노출된 것을 발견했다. 정상 운영 중인 워크로드도 같은 키를 쓰고 있다. 가장 적절한 첫 조치는?

A) 키를 즉시 delete-access-key로 삭제한다  
B) 키를 update-access-key로 Inactive 처리해 봉쇄한 뒤, CloudTrail로 영향을 추적하고 새 키로 회전한 후 기존 키를 삭제한다  
C) 사용자를 삭제한다  
D) 아무것도 하지 않고 AWS의 자동 격리를 기다린다  

**정답: B**  
해설: 즉시 삭제하면 공격자 활동 추적이 어렵고 정상 워크로드가 장애가 난다. 비활성화로 봉쇄(추적·복구 여지 유지) → CloudTrail 추적 → 새 키 회전·앱 갱신 → 기존 키 삭제 순서가 안전하다. 사용자 삭제는 과도하고, AWS 자동 격리에만 의존하는 것은 위험하다.

---

**문제 2.** 침해된 EC2 역할의 STS 임시 자격증명을 무력화하려 한다. 운영 중인 다른 정상 워크로드는 영향을 최소화하고 싶다. 올바른 방법은?

A) 역할을 삭제한다  
B) 액세스 키를 비활성화한다  
C) 역할에 aws:TokenIssueTime DateLessThan Deny 정책을 추가해 지정 시점 이전 발급 세션만 폐기한다  
D) MFA를 강제한다  

**정답: C**  
해설: 임시 자격증명은 폐기 API가 없으므로, 역할에 aws:TokenIssueTime 기반 Deny(콘솔의 Revoke active sessions)를 추가해 기존 세션만 무효화한다. 역할 삭제는 정상 워크로드를 망가뜨리고, STS 토큰에는 비활성화할 액세스 키가 없으며, MFA 강제는 이미 발급된 토큰을 무력화하지 못한다.

---

**문제 3.** 루트 계정이 피싱으로 침해됐다. 다음 중 루트 침해 대응에서 가장 우선순위가 낮거나 부적절한 것은?

A) 루트 비밀번호·MFA 재설정 및 루트 액세스 키 삭제  
B) CloudTrail로 루트가 만든 IAM 사용자·역할·키·SCP 변경 등 백도어 전수 조사  
C) IAM 사용자 정책만 수정하면 루트 권한도 함께 제한되므로 그것만 한다  
D) 계정 복구 채널까지 침해됐다면 AWS Support/Abuse로 에스컬레이션  

**정답: C**  
해설: 루트는 모든 IAM 정책을 무시하므로 IAM 사용자 정책 수정으로는 루트 권한을 제한할 수 없다 — 이 선택이 부적절하다. 루트 침해는 비밀번호·MFA·키 재설정, CloudTrail 백도어 조사, 복구 채널 침해 시 AWS 에스컬레이션이 정석이다.

---

**문제 4.** 자격증명을 무력화한 직후 반드시 수행해야 하는 후속 단계로 가장 적절한 묶음은?

A) 봉쇄만 했으면 대응 종료  
B) CloudTrail/Athena로 유출 자격증명의 전체 활동·백도어를 추적하고, 공격자가 만든 엔티티·키·정책을 근절한 뒤 새 자격증명으로 회전  
C) 비용 보고서를 확인한다  
D) 모든 IAM 사용자를 삭제한다  

**정답: B**  
해설: 무력화는 출혈을 멈춘 것일 뿐이다. CloudTrail/Athena로 유출 자격증명이 한 모든 행위와 심어둔 백도어(새 사용자·키·넓힌 신뢰 정책)를 추적·근절하고, 새 자격증명으로 회전해 워크로드를 복구해야 대응이 완결된다. 봉쇄만으로 종료하거나 무차별 삭제는 부적절하다.

---

**문제 5.** 자격증명 유출 사고의 재발을 구조적으로 줄이는 가장 효과적인 장기 전략은?

A) 액세스 키를 더 자주 백업한다  
B) 장기 자격증명을 제거하고 사람은 IAM Identity Center(SSO) 임시 자격증명, 워크로드는 IAM 역할/IRSA, 머신 비밀은 Secrets Manager 자동 회전으로 전환 + 루트 사용 탐지 알람  
C) 모든 키를 코드 주석으로 문서화한다  
D) 키 길이를 늘린다  

**정답: B**  
해설: 사고의 근본 원인은 무력화할 장기 자격증명의 존재다. 사람은 SSO 임시 자격증명, 워크로드는 역할/IRSA, 머신 비밀은 Secrets Manager 자동 회전으로 전환하면 노출될 장기 키 자체가 사라지고, 루트 사용 탐지 알람으로 최악의 경로를 감시한다. 키 백업·주석 문서화·길이 증가는 노출 위험을 오히려 키우거나 무관하다.

---
