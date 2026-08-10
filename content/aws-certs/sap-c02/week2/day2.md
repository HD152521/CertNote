# Day 2 - Service Control Policy: 천장(Ceiling)이라는 사고 도구

SCP를 "권한 부여 정책"으로 이해하고 시험에 들어가는 사람의 90%는 도메인 1을 놓친다. SCP의 본질을 한 문장으로 표현하면 이렇다 — **"SCP는 권한을 절대 부여하지 않는다. 오직 허용될 수 있는 권한의 최대 한계(ceiling)만 정한다."** 이 한 문장을 제대로 이해하지 못하면 Pro 시험의 "SCP 보기 4개 중 옳은 것" 시나리오에서 매번 헷갈린다.

SCP가 등장하기 전, 멀티 계정 환경에서 "모든 계정의 root 사용자가 X를 못 하게" 강제할 방법이 없었다. IAM 정책은 어차피 계정 안의 IAM User/Role에만 적용되고 root는 통과시킨다. AWS Config Rule은 사후 탐지일 뿐 차단이 아니다. 그래서 보안팀은 Lambda + Config + 알람 + 자동 정리라는 복잡한 자동화를 직접 만들어야 했다. 2017년 Organizations와 함께 SCP가 등장하며 이게 단순해졌다. **OU 또는 계정에 SCP를 부착하면, 그 안의 모든 Principal(root 포함)이 SCP가 허용하지 않는 액션을 못 한다.**

오늘은 SCP의 본질, 평가 순서, Allow-list vs Deny-list 전략, 자주 쓰이는 6가지 패턴, 디버깅 기법, 그리고 2024년 출시된 신기능 **Resource Control Policy(RCP)**까지 본다.

## SCP의 본질: 권한 부여가 아니라 천장

다음 두 가지 사실이 가장 중요하다.

1. **SCP는 권한을 부여하지 않는다.** 빈 SCP(`{"Statement": []}`)를 부착하면 모든 액션이 묵시적 Deny가 된다.
2. **IAM 정책이 Allow를 줘도 SCP가 그 액션을 빠뜨리면 결과적으로 거부된다.**

```
실제 권한 = SCP의 천장 ∩ Permission Boundary ∩ IAM Identity Policy ∩ Resource Policy ∩ ...
```

> 💡 **관련 이론**: 이 모델은 수학에서 **upper bound + intersection** 구조다. SCP는 lattice의 supremum(상한)을 정의하고, 실제 권한은 그 supremum과 아래 정책들의 교집합. 이걸 형식적으로 분석하는 게 AWS IAM Access Analyzer의 **Zelkova** 엔진이다. Zelkova는 Microsoft Research가 만든 SMT(Satisfiability Modulo Theories) 솔버 기반 정형 검증 시스템으로, IAM 정책의 "이 정책이 외부 Principal에게 접근을 허용하는가"를 수학적으로 증명한다. [AWS re:Inforce 2019 발표](https://aws.amazon.com/blogs/security/protect-sensitive-data-in-the-cloud-with-advanced-hsm-and-access-controls/).

> 🔍 **더 깊이**: SCP 평가는 IAM 평가의 **상위 게이트**다. 요청이 들어오면 (1) SCP 통과? → N이면 Deny, (2) Permission Boundary 통과? → N이면 Deny, (3) Identity Policy + Resource Policy + Session Policy 종합 평가. SCP는 가장 먼저, 가장 빠르게 차단할 수 있는 layer다. 그래서 회사 차원의 "절대 안 됨" 규칙(예: us-east-1 외 리전 금지)을 SCP에 두면 모든 멤버 계정·모든 IAM Role에 강제 적용된다.

> ⚠️ **함정**: "SCP는 Management 계정에도 적용된다"는 보기는 함정이다. Management 계정은 SCP 적용 대상이 아니다(의도된 동작). Management의 IAM User는 SCP 없이 모든 권한 사용 가능. 그래서 워크로드를 Management에 두면 안 된다 — 침해되면 SCP 보호가 안 됨.

## FullAWSAccess vs 빈 SCP: 묵시적 Deny의 함정

- **FullAWSAccess** (기본): 모든 액션 Allow — 즉 SCP에 의한 제한 없음.
- **빈 SCP** (`{"Statement": []}`): 모든 액션 Deny — 계정 작동 불가.

새 OU를 만들면 FullAWSAccess가 기본으로 부착되어 있다. 이걸 떼고 직접 만든 Allow-list SCP만 두면, **그 OU 안의 계정은 명시된 액션 외에는 모두 묵시적 Deny**가 된다.

> ⚠️ **함정**: "Allow-list SCP에서 EC2만 허용했더니 S3가 안 됩니다"라는 시나리오에서 답은 **"SCP에 S3 Allow가 없어서"**다. IAM 정책이 S3 Allow를 줘도 SCP 차단이 우선. 이 함정을 Pro 시험에서 자주 본다.

## Allow-list vs Deny-list 전략

| 전략 | 동작 | 사용처 |
|------|------|--------|
| **Deny-list** (권장) | FullAWSAccess + Deny 규칙 추가 | 일반 워크로드, 유연함 |
| **Allow-list** | FullAWSAccess 제거 + Allow 규칙만 | 엄격 격리, 제한적 OU (Sandbox 일부) |

대부분의 조직은 **Deny-list 전략**을 사용한다. 새 AWS 서비스 출시 시 자동 허용되기 때문이다.

> 🔍 **더 깊이**: AWS는 매년 100개 이상의 새 서비스를 출시한다. Allow-list로 운영하면 새 서비스가 나올 때마다 SCP를 업데이트해야 한다. Deny-list는 "위험한 액션만 Deny"라 새 서비스는 자동 허용. 다만 Deny-list는 "공격자가 새 서비스를 악용할 위험"이 존재 → 회사 정책으로 새 서비스 사용 시 사전 검토 의무화하는 보완책이 필요.

> 💡 **관련 이론**: 보안 정책의 **default-deny vs default-allow** 사이의 trade-off는 1970년대부터 논의된 주제다. NIST SP 800-53 AC-3 (Access Enforcement)는 "principle of fail-safe defaults"로 default-deny를 권장한다. 하지만 클라우드처럼 빠르게 진화하는 환경에서는 default-allow + targeted-deny가 운영 부담을 낮춘다. AWS 자체 권장도 Deny-list.

## 자주 쓰이는 SCP 패턴 6가지

### 패턴 1: 리전 제한 (데이터 주권)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "NotAction": [
      "iam:*", "organizations:*", "route53:*",
      "support:*", "trustedadvisor:*", "cloudfront:*",
      "globalaccelerator:*", "waf:*", "shield:*"
    ],
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
      }
    }
  }]
}
```

> ⚠️ **함정**: 글로벌 서비스(IAM, Organizations, Route 53, CloudFront, GA, WAF, Shield)는 us-east-1에서 처리되거나 region이 글로벌이다. `NotAction`으로 예외 처리하지 않으면 `iam:CreateRole`도 차단되어 OU 전체가 작동 불능.

### 패턴 2: 루트 사용자 작업 차단

```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {"aws:PrincipalArn": "arn:aws:iam::*:root"}
  }
}
```

### 패턴 3: MFA 미사용 시 민감 액션 차단

```json
{
  "Effect": "Deny",
  "Action": [
    "ec2:TerminateInstances",
    "rds:DeleteDBInstance",
    "s3:DeleteBucket"
  ],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
  }
}
```

> 🔍 **더 깊이**: `Bool`을 쓰면 MFA 키 자체가 없는 요청은 `null`이라 Deny가 작동 안 한다. `BoolIfExists`는 키가 있으면 평가하고 없으면 매칭 안 함 — 두 경우 모두 Deny. 이 미묘한 차이를 모르면 SCP가 작동 안 하는 함정에 빠진다.

### 패턴 4: CloudTrail·GuardDuty 비활성화 차단

```json
{
  "Effect": "Deny",
  "Action": [
    "cloudtrail:StopLogging",
    "cloudtrail:DeleteTrail",
    "cloudtrail:UpdateTrail",
    "guardduty:DeleteDetector",
    "guardduty:StopMonitoringMembers",
    "config:DeleteConfigurationRecorder",
    "config:StopConfigurationRecorder"
  ],
  "Resource": "*"
}
```

> 📚 **사례**: 2017년 Equifax 사고에서 공격자는 Apache Struts CVE를 통해 침입한 후 일부 보안 로그를 우회했다. AWS Organizations + 이런 SCP가 있었다면 침입 후에도 로그 변조 시도가 차단됐을 것이다. 사고 후 NIST CSF와 PCI-DSS v4.0(2022)이 "log immutability"를 명시적으로 강제하기 시작했다.

### 패턴 5: 비싼 인스턴스 패밀리 금지 (Sandbox)

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "*",
  "Condition": {
    "ForAnyValue:StringLike": {
      "ec2:InstanceType": ["p4*", "p5*", "x2*", "u-*", "trn1*"]
    }
  }
}
```

### 패턴 6: 특정 서비스 전체 금지

```json
{
  "Effect": "Deny",
  "Action": ["macie2:*", "iotwireless:*", "honeycode:*"],
  "Resource": "*"
}
```

## SCP 평가 순서: 위에서 아래로

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
계정 직접 부착 SCP ─ 통과? ─ N → Deny
 │
 ▼
IAM Identity Policy + Resource Policy + Boundary
 │
 ▼
최종 Allow
```

> 🔍 **더 깊이**: 상위 OU의 SCP가 더 엄격하면 하위 OU에서 풀 수 없다(상속). 예: Root에 "ap-northeast-2 외 Deny"가 있으면 하위 OU에서 "us-east-1 Allow"를 줘도 못 풀린다. SCP는 oneway intersect — 위에서 아래로만 좁아진다. 이 사상은 Unix file permission의 umask와 비슷하다 — umask가 닫은 권한은 chmod로 풀어도 다시 닫힌다.

## SCP 디버깅: "왜 안 되는지" 찾는 법

1. **CloudTrail의 errorCode** 확인 — `AccessDenied`와 함께 SCP인지 IAM인지 표시. SCP 차단이면 `errorMessage`에 "explicit deny in a service control policy" 명시.
2. **IAM Policy Simulator** — Org SCP까지 시뮬레이션 가능 (2020년 추가).
3. **임시로 SCP를 PolicyStaging OU에서 테스트** 후 본 OU에 부착.
4. **AWS Access Analyzer + Policy Generation** — CloudTrail 90일 데이터를 분석해 실제 사용 액션만 추출, 최소 권한 IAM 정책 생성.

> 🎯 **시나리오**: "한 회사가 SCP 적용 후 일부 Lambda 함수가 동작 안 한다. 원인을 빠르게 찾으려면?" — 답: **CloudTrail의 errorMessage 필터링 + IAM Policy Simulator로 SCP 포함 시뮬레이션**. CloudTrail은 SCP 차단 시 명시적으로 "service control policy"를 errorMessage에 포함하므로 grep만으로 찾을 수 있다. Lambda 실행 Role을 Simulator에 입력 → SCP 통과 여부 확인.

## Resource Control Policy(RCP): 2024년 신기능

2024년 11월 출시. SCP는 Principal(아이덴티티) 측 제한, **RCP는 리소스 측 제한**.

| 정책 | 적용 측 | 예 |
|------|----------|------|
| **SCP** | Principal (IAM User/Role) | "이 OU의 어떤 IAM Role도 us-east-1 외 못 씀" |
| **RCP** | Resource (S3 bucket, SQS, KMS, etc.) | "이 OU의 어떤 S3 버킷도 회사 외부 Principal이 못 봄" |

> 🔍 **더 깊이**: RCP는 **confused deputy** 공격을 OU 차원에서 차단한다. 예: 한 멤버 계정의 개발자가 실수로 S3 버킷 Resource Policy에 `Principal: "*"`를 넣으면 외부 누구나 접근 가능. RCP에 `"Condition": {"StringNotEquals": {"aws:PrincipalOrgID": "o-xxxx"}}` Deny를 두면, 해당 OU의 모든 S3 버킷에서 회사 Org 외 Principal 접근 차단. 한 줄로 전 계정 외부 노출 방지.

> 📚 **사례**: 2017년 Verizon, Booz Allen Hamilton, Accenture가 S3 버킷 public 설정 실수로 데이터 유출. 2018년 GoDaddy가 비슷한 사고. 매년 같은 패턴이 반복되는 이유는 IAM 정책과 Resource Policy를 모든 버킷에서 검증하기 어렵기 때문이다. RCP는 OU 한 곳에서 정책을 정하면 자동으로 모든 리소스에 적용 — 이런 사고를 구조적으로 차단.

## Declarative Policies, Backup Policies, Tag Policies

Organizations는 SCP 외에도 다양한 정책 타입을 제공한다.

| 정책 종류 | 용도 |
|-----------|------|
| **Tag Policy** | 태그 키·값 표준화 강제 (예: `Environment=prod\|dev\|stg`) |
| **Backup Policy** | AWS Backup 표준 강제 (예: 매일 백업, 35일 보존) |
| **AI Services Opt-out** | AI 서비스가 고객 데이터를 학습에 사용하지 못하게 |
| **Chatbot Policy** | Slack/Teams 통합 제한 |
| **Declarative Policy** (2024) | EC2 IMDSv2 강제, EBS 암호화 강제 등 선언적 |

## CLI로 직접 보기

```bash
# SCP 생성
aws organizations create-policy \
  --name DenyRegions \
  --type SERVICE_CONTROL_POLICY \
  --content file://deny-regions.json

# OU에 부착
aws organizations attach-policy \
  --policy-id p-xxxx --target-id ou-yyyy

# OU에 부착된 SCP 목록
aws organizations list-policies-for-target \
  --target-id ou-yyyy \
  --filter SERVICE_CONTROL_POLICY

# 효과 시뮬레이션 (IAM Policy Simulator API)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/MyRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/*
```

## SCP가 적용되지 않는 4가지 예외

"SCP는 OU 안의 모든 것을 막는다"는 문장은 정확하지 않다. SCP가 **닿지 못하는 영역**이 명확히 존재하고, Pro 시험은 이 빈틈을 집요하게 묻는다.

| 예외 | 왜 적용 안 되는가 | 실무에서의 보완 |
|------|-------------------|------------------|
| **Management 계정의 모든 Principal** | Org 자체를 관리해야 하므로 의도적으로 제외 | 워크로드 배포 금지 + root 봉인 + CloudTrail 알림 |
| **서비스 연결 역할(Service-Linked Role)** | AWS 서비스가 자기 기능을 수행하기 위해 쓰는 역할 | SLR 자체를 만들지 못하게 `iam:CreateServiceLinkedRole` 제한 |
| **AWS 서비스 주체(Service Principal)가 대신 호출하는 요청** | 요청자가 IAM Principal이 아니라 서비스 | 해당 서비스를 쓰지 못하게 서비스 단위 Deny |
| **Org 외부 Principal의 리소스 정책 경유 접근** | SCP는 Org **안의** Principal만 제약 | **RCP** 또는 리소스 정책 조건 |

> ⚠️ **함정**: 네 번째 예외가 특히 자주 틀린다. "우리 OU에 S3 외부 공유 금지 SCP를 걸었으니 안전하다"는 문장은 틀렸다. SCP는 **내 계정의 IAM Principal이 무엇을 할 수 있는가**만 정한다. 외부 계정의 Principal이 우리 버킷 정책의 `Principal: "*"`를 타고 들어오는 경로는 SCP 밖이다. 이 구멍을 메우는 게 2024년의 **RCP**다. 시험에서 "외부 공유 차단"이 나오면 SCP가 아니라 RCP·버킷 정책·S3 Block Public Access를 먼저 떠올려야 한다.

## SCP 문법의 숨은 제약: Allow 문은 조건을 못 쓴다

SCP는 IAM 정책과 문법이 같아 보이지만 **의도적으로 좁혀진 방언**이다. 이 차이를 모르고 IAM 정책을 그대로 복사해 붙이면 정책 생성 자체가 실패하거나, 더 나쁘게는 의도와 다르게 동작한다.

| 항목 | IAM Identity Policy | SCP |
|------|----------------------|-----|
| `Allow` 문의 `Condition` | 사용 가능 | **사용 불가** |
| `Allow` 문의 `NotAction`/`NotResource` | 사용 가능 | **사용 불가** |
| `Allow` 문의 `Resource` | ARN 지정 가능 | **`"*"`만 가능** |
| `Deny` 문의 `Condition` | 사용 가능 | 사용 가능 |
| `Deny` 문의 `NotAction` | 사용 가능 | 사용 가능 |
| `Principal` 필드 | 없음(Identity Policy) | 없음 |
| 정책 문서 최대 크기 | 6,144자(관리형 기준) | **5,120자** |
| 한 대상(Root/OU/계정)에 부착 가능 개수 | — | **최대 5개** |

여기서 나오는 실무 규칙이 하나 있다. **"조건부 제한은 반드시 Deny로 표현하라."** "ap-northeast-2에서만 EC2를 허용"을 Allow + Condition으로 쓰고 싶어도 SCP에서는 불가능하다. 반드시 "그 조건이 **아닐 때** Deny"라는 뒤집힌 형태로 써야 한다. 앞의 패턴 1(리전 제한)이 `Deny` + `StringNotEquals` 형태인 이유가 정확히 이것이다.

> ⚠️ **함정**: 정책 문서 5,120자 제한과 대상당 5개 제한이 합쳐지면, 대규모 조직에서 "SCP를 더 못 붙이는" 벽에 부딪힌다. 이때 흔한 잘못된 해법이 **OU를 더 깊게 파는 것**이다(상위 OU에 5개 + 하위 OU에 5개). 깊이를 늘리면 상속 경로가 복잡해져 디버깅이 어려워진다. 올바른 해법은 (1) 여러 Deny 문을 하나의 정책 문서로 병합, (2) `Action` 배열에 와일드카드를 써서 문자 수 압축, (3) 정말 다른 성격의 규칙만 별도 정책으로 분리다.

## 트레이드오프 비교표: 권한을 좁히는 5가지 수단

같은 "권한을 제한하라"는 요구에도 수단이 다섯 가지다. Pro 시험은 이 다섯을 나란히 놓고 **한정어**로 하나를 고르게 한다.

| 수단 | 적용 대상 | 권한을 부여하는가 | 적용 범위 | 운영 부담 | 대표 용도 |
|------|-----------|-------------------|-----------|-----------|-----------|
| **SCP** | OU·계정 안의 모든 Principal(root 포함) | ❌ 천장만 | Org 전체를 한 곳에서 | **가장 낮음** (한 번 부착) | 회사 차원 "절대 금지" |
| **RCP** | OU·계정 안의 모든 **리소스** | ❌ 천장만 | Org 전체를 한 곳에서 | 낮음 | 외부 노출 구조적 차단 |
| **Permission Boundary** | 특정 IAM User/Role 하나 | ❌ 천장만 | 그 아이덴티티만 | 중간 (부착 관리 필요) | 권한 위임 시 안전장치 |
| **IAM Identity Policy** | 특정 IAM User/Role 하나 | ✅ 부여함 | 그 아이덴티티만 | 높음 (수가 많음) | 실제 업무 권한 |
| **Resource Policy** | 특정 리소스 하나 | ✅ 부여함 | 그 리소스만 | 높음 (리소스마다) | 크로스 계정 공유 |

> 💡 **암기 팁**: **"부여하는 둘, 좁히는 셋"**. 권한을 실제로 주는 건 Identity Policy와 Resource Policy 둘뿐이다. SCP·RCP·Permission Boundary는 셋 다 천장만 낮춘다. 그래서 "SCP로 개발자에게 S3 권한을 주자"는 보기는 언제나 오답이다.

> 🎯 **시나리오**: "한 회사가 각 팀 리드에게 자기 팀의 IAM Role을 직접 만들 권한을 주려 한다. 단, 팀 리드가 만든 Role이 관리자 권한을 갖는 것은 막아야 한다." — 답: **Permission Boundary**. `iam:CreateRole`을 허용하되 `iam:PermissionsBoundary` 조건으로 특정 Boundary 부착을 강제한다. SCP로는 "관리자 권한 Role 생성"만 골라 막기 어렵고, 팀별로 다른 상한을 주기도 어렵다. 권한 **위임**의 안전장치는 Boundary가 정답이다.

## 아키텍처 다이어그램: SCP 상속이 실제로 좁혀지는 모습

```
                     [Org Root]
                SCP-A: FullAWSAccess
                SCP-B: Deny (비승인 리전)
                SCP-C: Deny (CloudTrail 중지)
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
   [OU: Security]   [OU: Workloads]     [OU: Sandbox]
   SCP: FullAccess  SCP: FullAccess      SCP: FullAccess
                    SCP-D: Deny          SCP-E: Deny (p*/x2*/u-* 인스턴스)
                    (보안도구 삭제)       SCP-F: Deny (Org 탈퇴·계정 생성)
                          │
             ┌────────────┴────────────┐
        [OU: Prod]                [OU: Non-Prod]
        SCP-G: Deny               (추가 SCP 없음)
        (MFA 없는 삭제 작업)
                │
        [계정 111111111111]
        직접 부착 SCP: 없음

  ▼ 이 계정에서 실제로 가능한 액션의 천장
  FullAWSAccess
    ─ (비승인 리전)         ← Root에서 상속
    ─ (CloudTrail 중지)      ← Root에서 상속
    ─ (보안도구 삭제)         ← Workloads에서 상속
    ─ (MFA 없는 삭제)        ← Prod에서 상속
  = 4단계에 걸쳐 좁혀진 교집합

  ※ Sandbox의 SCP-E/F는 이 계정에 전혀 영향 없음
     (형제 OU의 정책은 상속되지 않는다)
```

> 🔍 **더 깊이**: 위 그림에서 중요한 건 **"한 번 닫힌 문은 아래에서 열 수 없다"**는 방향성이다. Prod OU에 `Allow: ec2:*`를 아무리 넣어도 Root의 리전 Deny는 그대로 살아 있다. 이유는 명시적 Deny가 IAM 평가 전체에서 최우선이기 때문이다. 반대로 Allow-list 전략에서는 **각 층이 모두 Allow해야** 통과한다 — Root에서 `s3:*`를 Allow하고 하위 OU에서 `ec2:*`만 Allow하면, 그 하위 OU 계정에서는 S3가 안 된다(교집합이 비었다). 이 두 방향의 비대칭이 SCP 디버깅을 어렵게 만드는 근본 원인이다.

## 무중단 SCP 도입 순서: 운영 중인 Org에 Deny-list를 얹기

이미 수십 개 계정이 돌아가는 조직에 SCP를 처음 도입할 때, 곧바로 Root에 붙이면 반드시 사고가 난다. 표준은 5단계다.

```
1단계  관측(Observe) — 차단하지 않고 데이터부터
   ├── Organization Trail로 전 계정 CloudTrail을 Log Archive에 집결
   ├── Athena로 "지난 90일간 실제로 호출된 리전·서비스·액션" 집계
   └── 근거: 무엇이 실제 사용 중인지 모르면 어떤 Deny도 안전하지 않다

2단계  초안 작성 — Deny 대상을 좁게 시작
   ├── 1단계 집계에서 "0회 호출된 리전"만 Deny 목록에 넣는다
   ├── 글로벌 서비스는 NotAction 예외로 반드시 제외
   └── 근거: 사용 이력이 0인 것부터 막으면 회귀 위험이 0에 가깝다

3단계  PolicyStaging OU에서 검증
   ├── 실제 워크로드 복제본이 있는 테스트 계정 1개를 이 OU에 배치
   ├── 배포 파이프라인·배치 잡·야간 작업을 한 사이클(최소 1주) 돌린다
   └── 근거: 주간 트래픽만 보면 월말 배치·분기 리포트를 놓친다

4단계  Non-Prod OU → Prod OU 순으로 점진 부착
   ├── Non-Prod에 부착 후 최소 1~2주 관찰
   ├── CloudTrail errorMessage에 "service control policy" 필터 상시 알람
   └── 근거: 폭발 반경을 단계적으로 넓혀야 롤백 비용이 작다

5단계  Root로 승격 + 예외 관리 체계 수립
   ├── 모든 OU에서 문제없음이 확인되면 Root로 올리고 하위 중복 제거
   ├── 예외 요청은 티켓 → 승인 → IaC PR → 정책 갱신으로 고정
   └── 근거: 예외가 콘솔 수작업으로 들어가면 drift가 시작된다
```

> ⚠️ **함정**: 3단계를 "며칠"로 줄이는 게 가장 흔한 실수다. SCP 사고의 대부분은 **주기가 긴 작업**에서 터진다 — 월말 정산 배치, 분기 감사 스크립트, 연 1회 갱신되는 인증서 자동화. 이런 작업은 평일 낮 트래픽에는 전혀 나타나지 않는다. 최소 한 번의 월간 주기를 관찰하는 게 안전하다.

> 📚 **사례**: 리전 제한 SCP를 도입한 조직들이 공통으로 겪는 사고 유형이 있다. us-east-1을 승인 리전에서 빼면 CloudFront용 ACM 인증서 발급이 함께 막힌다 — CloudFront의 인증서는 반드시 us-east-1의 ACM에 있어야 하기 때문이다. 그래서 리전 제한 SCP의 승인 목록에는 주 운영 리전과 함께 **us-east-1을 거의 항상 포함**시키고, 대신 us-east-1에서의 EC2·RDS 생성은 별도 Deny로 막는 이중 구조를 쓴다.

## 실물 정책: 조직 경계를 강제하는 2종 세트

### 1. SCP — Org 탈퇴·계정 폐쇄 차단 (나가는 문을 잠근다)

멤버 계정이 스스로 Org를 떠나면 그 순간 모든 SCP가 무력화된다. 거버넌스의 근간을 지키는 정책이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyLeaveOrganization",
    "Effect": "Deny",
    "Action": [
      "organizations:LeaveOrganization",
      "organizations:DeleteOrganization",
      "account:CloseAccount"
    ],
    "Resource": "*"
  }]
}
```

### 2. RCP — 외부 Principal의 진입 차단 (들어오는 문을 잠근다)

SCP가 "우리 Principal이 무엇을 할 수 있는가"를 정한다면, RCP는 "누가 우리 리소스에 닿을 수 있는가"를 정한다. 두 방향을 모두 닫아야 조직 경계가 완성된다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyExternalPrincipalAccess",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": "*",
    "Condition": {
      "StringNotEqualsIfExists": {
        "aws:PrincipalOrgID": "o-exampleorgid"
      },
      "BoolIfExists": {
        "aws:PrincipalIsAWSService": "false"
      }
    }
  }]
}
```

> 🔍 **더 깊이**: RCP에는 SCP와 달리 `Principal` 필드가 있다. 리소스 정책 계열이기 때문이다. 그리고 `aws:PrincipalIsAWSService` 예외가 반드시 필요하다 — CloudTrail이 S3에 로그를 쓰거나, Config가 스냅샷을 저장하는 것도 "Org 밖 Principal"로 평가되기 때문이다. 이 조건을 빼면 로깅 파이프라인 전체가 조용히 죽는다. `StringNotEqualsIfExists`를 쓰는 이유도 같다 — 익명 요청처럼 키 자체가 없는 경우까지 안전하게 다루기 위해서다.

## 한정어가 바뀌면 답이 달라진다

같은 시나리오에 **한정어만 바꾼 4가지 변형**을 보자. "모든 멤버 계정에서 승인되지 않은 리전 사용을 막아라"라는 요구다.

| 한정어 | 정답 방향 | 왜 |
|--------|-----------|-----|
| **LEAST operational overhead** | Root에 리전 제한 **SCP** 1개 | 한 번 부착으로 전 계정·전 Role·root까지 커버. 계정이 늘어도 추가 작업 0 |
| **MOST secure / 우회 불가** | SCP + **Control Tower Region Deny 컨트롤** 병행 | 관리형 컨트롤은 drift 감지까지 포함. 수동 변경이 자동 탐지됨 |
| **MOST cost-effective (도구 비용 0)** | **SCP만** | SCP·Organizations 자체는 추가 과금이 없다. Config Rule은 규칙 평가 건당 과금 |
| **기존 리소스도 찾아내야 함 / DETECT** | **AWS Config + Config Aggregator** | SCP는 앞으로의 API 호출만 막는다. 이미 만들어진 리소스는 못 본다 |

> 💡 **암기 팁**: **"SCP는 미래만, Config는 과거까지."** SCP를 부착해도 이미 비승인 리전에 떠 있는 EC2는 계속 돌아간다. 문제 지문에 "already running", "existing resources", "identify"가 있으면 SCP 단독은 오답이고 Config·Security Hub·Resource Explorer 계열이 필요하다. 반대로 "prevent", "block", "must not be able to"면 SCP다.

> 🎯 **시나리오**: "규제 감사에서 '비승인 리전에 리소스가 없음을 증명하라'는 요구를 받았다. 앞으로의 생성도 막고, 현재 상태도 보고서로 제출해야 한다. MOST comprehensive한 방법은?" — 답: **SCP(예방) + Config Aggregator + Conformance Pack(증적)**. SCP만으로는 "지금 없다"를 증명할 수 없고, Config만으로는 "앞으로도 없을 것"을 보장할 수 없다. 감사 요구가 예방과 증적을 동시에 요구하면 두 축을 모두 답에 넣어야 한다.

> ⚠️ **함정**: `aws organizations update-policy`는 **부착된 상태 그대로 본문을 교체**한다. 즉 잘못된 정책을 push하면 별도 승인 없이 즉시 전 계정으로 퍼진다(전파에는 수 분이 걸릴 수 있다). 그래서 SCP는 반드시 Git에 두고, PR 리뷰 → PolicyStaging 적용 → 승격이라는 파이프라인을 거치게 만든다. 콘솔에서 직접 편집하는 조직은 예외 없이 사고를 겪는다.

## 정리하며

오늘 본 그림은 셋이다. 첫째, SCP는 **권한 부여가 아니라 천장**이다. Allow-list로 EC2만 허용하면 IAM 정책이 S3 Allow를 줘도 결과는 Deny. 둘째, **Deny-list가 표준 전략**이고, 자주 쓰이는 6가지 패턴(리전 제한·root 차단·MFA 강제·CloudTrail 비활성화 차단·인스턴스 패밀리 제한·서비스 전체 금지)을 머리에 박아야 한다. 셋째, **RCP**(2024)가 리소스 측 제한을 추가했으므로 회사 외부 노출 방지를 OU 한 곳에서 일괄 처리할 수 있다.

다음 글에서는 SCP를 자동으로 부착해주는 **AWS Control Tower와 Landing Zone**을 본다. 100개 계정 환경에서 SCP를 손으로 부착하는 건 운영 부담이 크고, Control Tower의 Mandatory·Strongly Recommended 가드레일이 그 부담을 줄여준다.

---

## 📝 연습 문제

**문제 1.** SCP에 대한 설명으로 옳은 것은?

A) IAM 권한을 부여한다
B) Management 계정에도 적용된다
C) 권한 부여가 아니라 최대 한계(ceiling)를 설정한다
D) Region마다 다른 SCP를 적용한다

**정답: C**
해설: SCP는 ceiling. IAM 정책과 교집합. Management 계정에는 적용 안 됨(의도). 같은 SCP가 모든 리전에 동일 적용되며 리전별 차별화는 Condition(`aws:RequestedRegion`)으로 처리.

---

**문제 2.** 새 OU 생성 시 FullAWSAccess SCP를 제거하고 EC2만 Allow하는 정책을 부착하면?

A) 영향 없음
B) 그 OU 모든 계정에서 EC2만 가능, S3·DynamoDB 등 다른 액션은 묵시적 Deny
C) Management 계정만 Deny
D) Org가 삭제됨

**정답: B**
해설: SCP는 Allow가 명시되어야 동작. FullAWSAccess 없이는 명시된 Allow 외 모두 묵시적 Deny. IAM 정책이 S3 Allow를 줘도 SCP 차단이 우선.

---

**문제 3.** 한국 데이터 주권 규제로 ap-northeast-2만 허용. 어떤 SCP?

A) Allow `aws:RequestedRegion = ap-northeast-2`
B) Deny `aws:RequestedRegion != ap-northeast-2` + 글로벌 서비스(IAM, Org, Route53, CloudFront, GA, WAF) NotAction 예외
C) Resource Policy로 처리
D) NACL로 처리

**정답: B**
해설: Deny 패턴 + 글로벌 서비스 NotAction 예외가 정석. 글로벌 서비스는 us-east-1로 라우팅되거나 region이 글로벌이라 예외 처리 필수. 그렇지 않으면 `iam:CreateRole`도 차단되어 OU가 작동 불능.

---

**문제 4.** 공격자가 CloudTrail을 비활성화하지 못하게 하려면?

A) IAM 정책으로만
B) SCP에서 `cloudtrail:StopLogging`, `DeleteTrail`, `UpdateTrail` 명시적 Deny
C) Network ACL
D) WAF

**정답: B**
해설: SCP에 명시적 Deny — 어떤 IAM 정책도 SCP를 뚫지 못함. 같은 패턴이 PCI-DSS v4.0, NIST CSF에서 "log immutability"로 명시. 침입 후 흔적 지우기 차단.

---

**문제 5.** 새로 출시되는 AWS 서비스도 자동으로 허용하려면 어떤 SCP 전략?

A) Allow-list
B) Deny-list (FullAWSAccess + 특정 액션 Deny)
C) Resource Policy
D) Permission Boundary

**정답: B**
해설: Deny-list가 신규 서비스 자동 허용 효과. AWS는 매년 100개 이상 새 서비스 출시. Allow-list는 매번 업데이트 필요해 운영 부담. Trade-off: 새 서비스 공격면 노출 위험 → 회사 정책으로 사전 검토 의무화 보완.

---

**문제 6.** SCP가 의도대로 동작하는지 사전 검증하려면?

A) 운영 OU에 바로 부착하고 모니터링
B) PolicyStaging OU(테스트 계정 1개)에 부착 후 검증 + IAM Policy Simulator
C) IAM User 추가
D) Permission Boundary로 우회

**정답: B**
해설: Staging OU 패턴이 표준 검증 방식. IAM Policy Simulator도 2020년부터 Org SCP 시뮬레이션 지원. AWS Access Analyzer Policy Generation으로 CloudTrail 90일 데이터 분석도 함께.

---

**문제 7.** 한 SaaS가 회사 외부 Principal이 OU 안의 모든 S3 버킷에 접근하지 못하게 하려고 한다. 가장 효율적인 방법은?

A) 각 버킷에 Bucket Policy 일일이 작성
B) Lambda 모니터링
C) Resource Control Policy(RCP)로 OU 차원에서 일괄 적용
D) GuardDuty 알람

**정답: C**
해설: RCP(2024년 출시)는 리소스 측 제한. 한 곳에서 정책을 정의하면 OU 안 모든 리소스에 자동 적용. 2017년 Verizon·Accenture S3 public 사고 같은 구조적 사고를 OU 차원에서 방지. SCP가 Principal 측이라면 RCP는 Resource 측, 둘이 보완 관계.

---

**문제 8.** MFA 강제 SCP에서 `Bool` 대신 `BoolIfExists`를 쓰는 이유는?

A) 성능
B) MFA 키 자체가 요청에 없으면 `Bool`은 매칭 안 함 → Deny 효과 없음. `BoolIfExists`는 키 없음도 매칭
C) 비용
D) Multi-region 호환성

**정답: B**
해설: 미묘한 차이지만 SCP 작동 여부를 결정. SAML이나 일부 인증 경로에서 `aws:MultiFactorAuthPresent` 키 자체가 없을 수 있다. `Bool`은 키 없으면 평가 자체를 건너뜀. `BoolIfExists`로 두 경우 모두 Deny.
