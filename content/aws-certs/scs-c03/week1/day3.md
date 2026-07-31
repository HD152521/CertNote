# Day 3 - IAM 정책 심화: Identity vs Resource 정책, 조건 키, 최소 권한 설계

어제 정책 평가 알고리즘을 익혔다면, 오늘은 그 알고리즘에 입력되는 정책 자체를 정밀하게 다룬다. SCS-C03이 IAM에서 진짜 변별력을 두는 지점은 "정책을 쓸 줄 아는가"가 아니라 **"같은 결과를 내는 여러 통제 중 가장 정확하고 최소 권한인 것을 고를 수 있는가"**다. Identity 정책으로 풀 일을 Resource 정책으로 풀면 동작은 해도 함정 보기가 되고, Condition 키 하나로 끝낼 일을 별도 역할로 분리하면 과설계가 된다.

오늘은 세 가지를 판다. 첫째, Identity 정책과 Resource 정책이 언제 어떻게 갈라지는가. 둘째, Condition 키로 IP·MFA·암호화·태그 기반 정밀 통제를 거는 법. 셋째, Permissions Boundary와 ABAC을 동원해 최소 권한을 **확장 가능하게** 설계하는 법.

## Identity-based vs Resource-based: 결정 기준

| 구분 | Identity-based | Resource-based |
|------|---------------|----------------|
| 붙는 위치 | User/Group/Role | 리소스(S3, KMS, SQS, SNS, Lambda 등) |
| Principal 요소 | 없음 | **필수** |
| 주 용도 | "이 주체가 무엇을 할 수 있나" | "누가 이 리소스에 접근하나" |
| cross-account | 단독 불가(상대 리소스 정책 필요) | **단독으로 다른 계정 허용 가능** |
| 대표 예 | 관리형/인라인 정책 | S3 버킷 정책, KMS 키 정책, IAM Role의 trust policy |

선택 기준은 명확하다.

- **"같은 계정 안에서 주체에게 권한을 준다"** → Identity 정책
- **"다른 계정/서비스가 내 리소스에 접근한다"** → Resource 정책 (cross-account의 핵심 도구)
- **"리소스에 누가 접근하든 일괄 규칙을 강제한다"**(예: 모든 PutObject에 암호화 강제) → Resource 정책

이 세 줄을 판정 트리로 그리면 시험장에서 훨씬 빠르다.

```
[ 어느 쪽 정책으로 풀 것인가 ]

  요구사항을 한 문장으로 읽는다
        │
        ├─ 주어가 "이 팀은 / 이 애플리케이션은 …할 수 있어야"
        │      → **Identity 정책**  (주체 쪽에서 부여)
        │
        ├─ 주어가 "이 버킷은 / 이 키는 … 만 받아야"
        │      → **Resource 정책**  (리소스 쪽에서 통제)
        │
        ├─ "다른 계정이 접근해야 한다"
        │      ├─ 대상 서비스가 리소스 정책 지원  → 양쪽 정책 (AND)
        │      └─ 지원하지 않음(EC2·DynamoDB 등) → **역할을 맡는 방식**
        │
        ├─ "누가 오든 예외 없이 강제해야 한다"
        │      → **Resource 정책의 Deny**  (주체 목록을 관리할 필요가 없다)
        │
        └─ "조직의 모든 계정에 강제해야 한다"
               → **SCP**  (계정 단위 상한, Day 5·Week 2에서 심화)
```

네 번째 갈래가 실무에서 특히 중요하다. "미암호화 업로드 금지" 같은 규칙을 Identity 정책으로 걸면 **주체를 하나도 빠뜨리지 않고 전부 커버해야** 성립한다. 새 역할이 하나 생기는 순간 구멍이 뚫린다. 반면 리소스 정책의 Deny로 걸면 그 리소스에 오는 **모든 요청**이 걸러지므로 주체 목록을 관리할 필요가 없다. **"예외 없이"라는 요구는 리소스 쪽에서 거는 것**이 원칙이다.

### 어떤 서비스가 리소스 정책을 지원하는가

| 서비스 | 리소스 정책 | 이름 | 교차 계정에서의 특징 |
|--------|-------------|------|----------------------|
| S3 | O | 버킷 정책 | 가장 흔한 교차 계정 경로 |
| KMS | O | 키 정책 | **키 정책이 없으면 IAM만으로 못 씀** |
| SQS / SNS | O | 큐·토픽 정책 | 서비스 주체 신뢰 시 출처 조건 필수 |
| Lambda | O | 함수 정책(리소스 기반) | 다른 서비스가 함수를 호출하게 열 때 |
| Secrets Manager | O | 시크릿 정책 | 교차 계정 시크릿 공유 |
| IAM Role | O | **신뢰 정책** | 역할을 맡을 주체를 정의 |
| EFS / API Gateway / ECR | O | 각각의 리소스 정책 | — |
| EC2 인스턴스 | X | — | 역할을 맡는 방식으로 해결 |
| DynamoDB 테이블 | X | — | 역할을 맡는 방식으로 해결 |
| RDS 인스턴스 | X | — | 역할·네트워크·DB 자체 인증으로 해결 |

> ⚠️ **함정**: 리소스 정책을 지원하지 않는 서비스에 "리소스 정책을 붙인다"는 보기는 그 자체로 오답이다. 특히 **EC2와 DynamoDB**가 자주 등장한다. 교차 계정으로 DynamoDB 테이블을 읽어야 한다면 답은 "테이블에 정책을 붙인다"가 아니라 "테이블이 있는 계정에 역할을 만들고, 상대 계정이 그 역할을 맡게 한다"이다. 서비스마다 리소스 정책 지원 여부가 다르다는 사실 자체가 시험 포인트다.

> 🔍 **더 깊이**: 리소스 정책의 진짜 강점은 **"기본 거부를 리소스 쪽에서 다시 한 번 세운다"**는 데 있다. Identity 정책은 그 주체를 관리하는 계정의 관리자가 언제든 넓힐 수 있지만, 리소스 정책은 **리소스 소유 계정만** 고칠 수 있다. 그래서 민감 데이터 버킷에는 "우리 조직 프린시펄만", "HTTPS로만", "이 VPC 엔드포인트를 통해서만" 같은 조건을 리소스 쪽에 박아 둔다. 호출자 계정에서 무슨 일이 일어나든 이 조건은 유지된다. 정책의 관리 주체가 누구인지를 따지는 습관이 다층 방어의 핵심이다.

> 💡 **관련 이론**: KMS 키 정책은 특별하다. **모든 KMS 키는 키 정책이 1차 권위(authoritative)**라서, 키 정책에서 IAM 위임을 허용(`"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` + IAM에 권한)하지 않으면 IAM 정책만으로는 키를 쓸 수 없다. S3·SQS는 IAM 정책 또는 리소스 정책 둘 중 하나로 충분하지만, KMS는 키 정책이 게이트를 연 다음에야 IAM 정책이 작동한다. cross-account KMS 사용 시 키 정책에 상대 계정을 반드시 명시해야 하는 이유다.

> 🔍 **더 깊이**: IAM Role의 **trust policy도 리소스 기반 정책**이다. Role이라는 리소스에 "누가 이 역할을 맡을 수 있나(`sts:AssumeRole`)"를 정의하는 Principal 포함 정책이기 때문이다. 그래서 cross-account AssumeRole은 ① 대상 계정 Role의 trust policy(Principal에 호출 계정 명시) ② 호출 측 신원 정책의 `sts:AssumeRole` Allow — 양쪽이 필요하다(Day 4에서 깊이).

## Condition 키: 정밀 통제의 핵심

Condition은 정책에 "추가 제약"을 거는 절이다. 보안 엔지니어가 가장 많이 쓰는 키들을 유형별로 정리한다.

| Condition 키 | 의미 | 대표 용도 |
|-------------|------|----------|
| `aws:SourceIp` | 요청 출발 IP | 사내 IP에서만 허용 |
| `aws:MultiFactorAuthPresent` | MFA 인증 여부 | 민감 작업에 MFA 강제 |
| `aws:SecureTransport` | HTTPS 여부 | 평문 HTTP 거부 |
| `aws:RequestedRegion` | 대상 리전 | 특정 리전 외 작업 차단 |
| `aws:PrincipalTag` / `aws:ResourceTag` | 주체·리소스 태그 | ABAC(태그 기반 접근제어) |
| `aws:SourceArn` / `aws:SourceAccount` | 호출 서비스 출처 | **Confused Deputy 방지** |
| `s3:x-amz-server-side-encryption` | 업로드 암호화 헤더 | 미암호화 업로드 차단 |
| `kms:ViaService` | KMS 호출 경유 서비스 | 특정 서비스 통한 키 사용만 허용 |

### 예시 1: 미암호화 S3 업로드를 강제로 차단

```json
{
  "Sid": "DenyUnencryptedUploads",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::secure-bucket/*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": "aws:kms"
    }
  }
}
```

이 버킷 정책은 KMS 암호화 헤더 없이 올라오는 모든 업로드를 거부한다. 데이터 보호(도메인 5)와 거버넌스 강제의 전형이다.

### 예시 2: MFA 없이는 민감 작업 금지

```json
{
  "Sid": "DenySensitiveWithoutMFA",
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "ec2:TerminateInstances"],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
  }
}
```

> ⚠️ **함정**: `Bool`과 `BoolIfExists`의 차이가 시험 단골이다. 일부 요청(서비스 간 호출, STS 세션)에는 `aws:MultiFactorAuthPresent` 키 자체가 **없다**. `Bool`로 `"false"`를 검사하면 키가 없는 정상 요청까지 막혀버린다. `BoolIfExists`는 "키가 있으면 false인지 검사, 없으면 통과"라서 의도대로 동작한다. 또 `aws:SourceIp`는 **VPC 엔드포인트 경유 트래픽엔 적용 안 됨** — 그 경우 `aws:VpcSourceIp` 또는 `aws:SourceVpc`를 써야 한다.

> 🔍 **더 깊이**: `aws:SourceArn`과 `aws:SourceAccount`는 **Confused Deputy(혼동된 대리인)** 공격 방지의 핵심이다. 예를 들어 S3가 SNS로 이벤트를 보낼 때, SNS 토픽 정책에 `aws:SourceArn`으로 "오직 이 버킷에서 온 호출만 허용"을 명시하지 않으면, 다른 사람의 버킷이 내 토픽을 트리거하도록 악용될 수 있다. 서비스 주체(`Service` principal)를 신뢰할 때는 거의 항상 `aws:SourceArn`/`aws:SourceAccount` 조건을 함께 건다(Day 4에서 STS 맥락으로 재등장).

### 예시 3: 사무실 IP에서만 민감 작업 허용

```json
{
  "Sid": "DenyOutsideCorporateNetwork",
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "s3:DeleteBucket"],
  "Resource": "*",
  "Condition": {
    "NotIpAddress": {
      "aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"]
    },
    "Bool": { "aws:ViaAWSService": "false" }
  }
}
```

두 조건이 함께 걸린 이유가 중요하다. 첫 번째 줄만 쓰면 **AWS 서비스가 우리를 대신해 호출하는 요청까지** 막힌다. 예를 들어 CloudFormation이 스택을 만들며 IAM 역할을 생성할 때, 그 호출의 출발 IP는 사무실이 아니다. `aws:ViaAWSService`가 `false`일 때만(즉 사람이 직접 부를 때만) IP를 따지도록 좁혀야 정책이 실무에서 살아남는다.

### 예시 4: 승인된 리전 밖 작업 차단

```json
{
  "Sid": "DenyUnapprovedRegions",
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "sts:*", "organizations:*",
    "cloudfront:*", "route53:*", "support:*",
    "waf:*", "shield:*", "budgets:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
    }
  }
}
```

이 문서에 오늘까지 배운 것이 압축돼 있다. **금지 요구이므로 `Deny`**로 쓰고, **`NotAction`을 Deny와 결합**해 새 서비스가 나와도 안전한 방향으로 실패하게 했으며, **글로벌 서비스를 예외 처리**했다. 마지막 항목이 없으면 IAM 역할 생성도 콘솔 로그인도 막혀 조직이 마비된다 — 실제로 자주 일어나는 자해 사고다.

### 조건 연산자를 고르는 최소 기준

조건은 "어떤 키를 볼 것인가"만큼 "어떤 연산자로 볼 것인가"가 중요하다. 지금은 아래 네 갈래만 확실히 하고, 연산자 전체 지도와 `ForAllValues`·`Null` 같은 정밀 연산자는 **Week 2에서 다룬다.**

| 상황 | 써야 할 형태 | 이유 |
|------|---------------|------|
| 값이 정확히 일치해야 함 | `StringEquals` | 대소문자까지 구분하는 완전 일치 |
| 값이 목록에 없으면 막아야 함 | `Deny` + `StringNotEquals` | Allow와 결합하면 다른 Allow에 뚫린다 |
| 키가 없을 수도 있음 | `...IfExists` 계열 | 키 부재로 정상 요청이 막히는 것을 방지 |
| IP 대역 검사 | `IpAddress` / `NotIpAddress` | 문자열 비교로는 CIDR을 못 다룬다 |

핵심 원칙 하나만 지금 못 박아 둔다. **금지를 표현할 때는 반드시 `Deny`를 쓴다.** "MFA가 있을 때만 허용"이라고 `Allow` + 조건으로 쓰면, 다른 곳에 조건 없는 Allow가 하나라도 있으면 그쪽으로 통과한다. 반면 "MFA가 없으면 거부"라고 `Deny` + 조건으로 쓰면 다른 어떤 Allow가 있어도 잘라 낸다. 가드레일은 언제나 Deny 쪽에서 만든다.

> ⚠️ **함정**: 조건이 여러 개 들어 있을 때의 결합 규칙을 헷갈리면 정책이 정반대로 동작한다. **서로 다른 조건 연산자 블록끼리는 AND**(모두 참이어야 Statement 적용), **같은 블록 안의 여러 키도 AND**, 그러나 **하나의 키에 값이 여러 개면 OR**이다. 위의 리전 예시에서 `["ap-northeast-2", "us-east-1"]`은 "둘 중 하나와 같으면 참"이므로, `StringNotEquals`와 결합해 "둘 다 아니면 거부"가 된다. 이 규칙을 반대로 알면 리전 하나만 허용될 줄 알았던 정책이 전부 허용하거나 전부 차단하는 사고가 난다.

> 🎯 **시나리오**: "감사 로그 버킷은 (1) HTTPS로만, (2) 우리 조직 계정만, (3) 객체 삭제는 누구도 못 하게 하라." → 요구 세 개가 전부 **금지형**이다. 그러므로 버킷 정책에 Deny 문장 세 개를 쓴다. `aws:SecureTransport`가 false일 때 Deny, 조직 식별자 조건이 맞지 않을 때 Deny, `s3:DeleteObject`·`s3:DeleteObjectVersion`을 전면 Deny. 여기에 리소스 자체 기능(버전 관리 + Object Lock)을 얹으면 정책을 고칠 수 있는 관리자조차 객체를 지울 수 없게 된다. **정책과 리소스 기능을 함께 거는 것이 "예외 없이"라는 요구의 완성형**이다.

## Permissions Boundary: 위임의 최소 권한

Permissions Boundary는 "이 주체가 가질 수 있는 **최대 권한의 상한**"을 정의하는 정책이다. 신원 정책이 권한을 주고, boundary가 그 상한을 깎는다. **실효 권한 = 신원 정책 ∩ Permissions Boundary**(교집합).

가장 강력한 용도는 **권한 위임의 안전한 제한**이다. 개발자에게 "IAM 역할을 만들 수 있는 권한"을 주되, 그가 만드는 역할이 admin이 되지 못하게 막고 싶을 때.

```json
// 개발자에게 부여: 역할 생성은 허용하되 boundary 부착을 강제
{
  "Effect": "Allow",
  "Action": "iam:CreateRole",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/DevBoundary"
    }
  }
}
```

이러면 개발자는 역할을 만들 수 있지만, 반드시 `DevBoundary`를 boundary로 붙여야만 한다. 그 역할의 실효 권한은 boundary를 넘지 못한다 — 권한 상승(privilege escalation)을 구조적으로 차단한다.

교집합이라는 말을 그림으로 보면 왜 boundary가 "권한을 주지 못하는지"가 분명해진다.

```
[ 실효 권한은 언제나 교집합이다 ]

   ┌──────────────────────────────────────────┐
   │  SCP 허용 범위 (조직이 정한 계정 상한)      │
   │  ┌────────────────────────────────────┐  │
   │  │ 권한 경계 (이 주체가 가질 수 있는 최대) │  │
   │  │   ┌──────────────────────────┐     │  │
   │  │   │  Identity 정책 (실제 부여) │     │  │
   │  │   │                          │     │  │
   │  │   │   ███ 실효 권한 ███       │     │  │
   │  │   │                          │     │  │
   │  │   └──────────────────────────┘     │  │
   │  └────────────────────────────────────┘  │
   └──────────────────────────────────────────┘
        ✂ 그리고 어느 층에든 명시적 Deny가 있으면
          그 액션은 위 그림 어디에 있든 잘려 나간다

   ── 자주 틀리는 지점 ──────────────────────────
   · Identity 정책이 경계 밖으로 삐져나오면 → 그 부분은 **무효**
   · 경계만 넓고 Identity 정책이 비어 있으면 → 권한은 **0**
     (경계는 천장이지 바닥이 아니다)
   · SCP가 허용해도 Identity 정책이 없으면 → 권한은 **0**
```

이 그림의 마지막 두 줄이 시험 단골이다. "SCP에 `s3:*` Allow를 넣었는데 왜 사용자가 S3를 못 쓰는가"라는 문항의 답은 **"SCP는 권한을 주지 않기 때문"**이다. SCP·경계·세션 정책은 전부 천장이고, 바닥을 만드는 것은 Identity 정책(또는 리소스 정책)뿐이다.

| 정책 | 권한을 **부여**하나 | 상한을 **정하나** | 관리 주체 |
|------|---------------------|--------------------|-----------|
| Identity 정책 | O | X | 계정의 IAM 관리자 |
| Resource 정책 | O | X (조건으로 좁힐 수는 있음) | 리소스 소유 계정 |
| 권한 경계 | **X** | O | 계정의 IAM 관리자 |
| SCP | **X** | O | 조직 관리 계정 |
| 세션 정책 | **X** | O | 역할을 맡는 코드 |

> ⚠️ **함정**: 권한 경계를 붙이는 것만으로 권한 위임이 안전해지지는 않는다. 개발자가 `iam:CreateRole`을 쓸 수 있다면 `iam:PutRolePolicy`·`iam:AttachRolePolicy`도 통제해야 하고, 무엇보다 **`iam:DeleteRolePermissionsBoundary`를 막아야** 한다. 경계를 뗄 수 있는 권한이 남아 있으면 경계는 장식이다. 그래서 실무 위임 정책은 "역할 생성 허용 + 경계 부착 강제 + 경계 수정·삭제 금지 + 특정 경로(path) 아래에서만 생성 가능"이 한 묶음으로 간다. 시험에서 권한 상승을 묻는 문항은 이 묶음의 어느 한 조각이 빠진 상황을 제시한다.

> 💡 **관련 이론**: 네 가지 정책 유형의 평가 관계를 한 그림으로 정리하면 — **SCP(조직 상한) ∩ Permissions Boundary(주체 상한) ∩ Identity 정책(부여) → 그리고 명시적 Deny는 어디서든 우선**. SCP와 Boundary는 권한을 "주는" 게 아니라 "깎는" 필터다. Session policy(AssumeRole 시 전달)도 같은 교집합 필터로 작동한다.

## ABAC: 태그로 확장 가능한 최소 권한

RBAC(역할 기반)은 역할이 늘수록 정책이 폭증한다. ABAC(Attribute-Based Access Control)은 **태그**로 권한을 표현해 정책 수를 일정하게 유지한다.

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```

이 단 하나의 정책으로 "주체의 `Project` 태그와 리소스의 `Project` 태그가 같을 때만 허용"이 표현된다. 프로젝트가 100개여도 정책은 1개. 새 팀이 생겨도 정책 변경 없이 태그만 부여하면 된다.

`${aws:PrincipalTag/Project}` 부분이 **정책 변수(policy variable)**다. 평가 시점에 요청 컨텍스트의 값으로 치환되므로, 정적인 문자열로는 표현할 수 없는 "같은지 비교"가 가능해진다. 자주 쓰이는 변수는 다음과 같다.

| 변수 | 치환되는 값 | 대표 용도 |
|------|-------------|-----------|
| `${aws:username}` | IAM 사용자 이름 | 사용자별 홈 디렉터리 격리 |
| `${aws:userid}` | 고유 주체 식별자 | 세션 단위 격리 |
| `${aws:PrincipalTag/키}` | 주체에 붙은 태그 값 | ABAC의 좌변 |
| `${aws:PrincipalOrgID}` | 조직 식별자 | 조직 범위 제한 |

```json
// 사용자마다 자기 이름의 접두사 아래에서만 객체를 다루게 한다
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::team-workspace/home/${aws:username}/*"
}
```

RBAC과 ABAC은 대체 관계가 아니라 **조합**이다. 어느 쪽이 맞는지는 요구의 모양이 결정한다.

| 축 | RBAC(역할 기반) | ABAC(속성 기반) |
|----|------------------|------------------|
| 권한의 근거 | "어떤 역할을 맡았는가" | "어떤 속성을 갖는가" |
| 조직이 커질 때 | 역할·정책 수가 함께 증가 | 정책 수는 **일정** |
| 새 팀 추가 시 | 역할·정책 신규 생성 | 태그만 부여 |
| 감사 질문 "누가 이걸 볼 수 있나" | 답하기 쉬움(역할 목록) | 답하기 어려움(태그를 다 훑어야) |
| 전제 조건 | 없음 | **태그 규율이 강제돼야 함** |
| 잘 맞는 상황 | 직무가 뚜렷하고 개수가 적을 때 | 팀·프로젝트가 계속 늘어날 때 |

> ⚠️ **함정**: ABAC의 실패는 대부분 정책이 아니라 **태그 관리**에서 온다. 리소스에 태그를 붙이지 않은 채 만들면 조건이 매칭되지 않아 접근이 끊기고, 반대로 **사용자가 자기 리소스 태그를 마음대로 바꿀 수 있으면 스스로 권한을 넓힐 수 있다.** 그래서 ABAC을 쓰려면 ① 생성 시 태그를 필수로 강제하고 ② `aws:TagKeys`·`aws:RequestTag`로 태그 변경 자체를 통제하는 정책이 함께 있어야 한다. "ABAC을 도입하면 정책이 하나로 줄어든다"는 문장만 보고 고르면, 태그 통제가 빠진 보기를 정답으로 잘못 집는다.

> 🔍 **더 깊이**: 페더레이션 사용자에게 ABAC을 적용하는 경로는 **세션 태그**다. 외부 IdP가 보내는 속성(부서, 프로젝트, 직무)을 역할을 맡는 시점에 세션 태그로 주입하면 그대로 `aws:PrincipalTag/*`로 읽힌다. IAM Identity Center도 같은 원리로 속성을 전달한다. 즉 ABAC은 IAM 안에서 끝나는 이야기가 아니라 **기업 디렉터리의 속성 품질에 의존하는 설계**다. 디렉터리의 부서 정보가 부정확하면 AWS 권한도 부정확해진다. 세션 태그의 실제 전달 방법은 Day 4에서 다룬다.

> 🎯 **시나리오**: "수십 개 팀이 각자 EC2를 운영하는데, 팀이 늘 때마다 IAM 정책을 추가하는 게 한계에 왔다." 정답은 팀별 역할·정책 양산이 아니라 **ABAC 전환**이다. 주체에 `team` 태그, 리소스에 `team` 태그를 부여하고 `aws:PrincipalTag/team == aws:ResourceTag/team` 조건 하나로 통일. IAM Identity Center의 session tag, SAML/OIDC의 attribute를 PrincipalTag로 매핑하면 페더레이션 사용자에게도 그대로 적용된다.

## 최소 권한을 "발견"하는 도구

최소 권한은 직관으로 쓰는 게 아니라 **실제 사용 데이터에서 도출**한다.

```bash
# Access Analyzer: CloudTrail 로그 기반으로 실사용 권한만 추린 정책 생성
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::111122223333:role/AppRole"}' \
  --cloud-trail-details '{...}'

# 마지막 사용 시점으로 미사용 권한 식별 (Access Advisor)
aws iam get-service-last-accessed-details \
  --job-id <job-id>
```

IAM Access Analyzer의 정책 생성 기능은 CloudTrail에 기록된 실제 호출만으로 정책을 만들어준다. Access Advisor(service-last-accessed)는 "최근 N개월간 한 번도 안 쓴 권한"을 보여줘 과도한 권한을 깎는 근거가 된다.

실무에서 쓰는 순서는 다음과 같다. 이 절차 자체가 시험의 "어떻게 최소 권한에 도달하는가" 문항의 정답 골격이다.

```
[ 최소 권한을 데이터로 도출하는 절차 ]

  ① 넓은 권한으로 일단 동작시킨다 (개발·스테이징에서만)
        │   목적은 "실제로 어떤 API를 부르는지" 관찰
        ▼
  ② CloudTrail로 일정 기간 실사용을 수집한다
        │   짧으면 월말 배치·분기 작업 같은 드문 호출을 놓친다
        ▼
  ③ Access Analyzer 정책 생성으로 초안을 뽑는다
        │   실제 호출된 액션만 담긴 정책 초안
        ▼
  ④ 초안을 사람이 검토해 리소스 범위를 좁힌다
        │   Analyzer는 액션은 좁혀 주지만 리소스는 넓게 두는 경우가 있다
        ▼
  ⑤ 정책 검증 도구로 문법·과대 권한을 점검한다
        │   배포 전 게이트 (CI에 넣는다)
        ▼
  ⑥ 배포 후 AccessDenied를 모니터링하며 필요한 것만 되돌려 추가한다
        │   "좁게 주고 넓히기" — 반대 방향은 보안 부채가 된다
        ▼
  ⑦ Access Advisor로 주기적으로 미사용 권한을 재검토한다
```

```bash
# 어떤 서비스를 마지막으로 언제 썼는지 조사 작업을 만든다
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::111122223333:role/AppRole

# 그 결과를 조회 — 오래 안 쓴 서비스가 곧 깎을 후보다
aws iam get-service-last-accessed-details --job-id <job-id>

# 계정 전체의 자격 증명 현황 보고서 (사용자·키·MFA·마지막 사용)
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text

# 배포 전 정책 문법·보안 경고 검증
aws accessanalyzer validate-policy \
  --policy-document file://new-policy.json \
  --policy-type IDENTITY_POLICY
```

> 💡 **관련 이론**: ①에서 "넓게 시작한다"는 것이 최소 권한 원칙과 모순처럼 들리지만 그렇지 않다. 핵심은 **어디서 넓게 시작하는가**다. 격리된 개발 환경에서 관찰 목적으로 넓게 열고, 그 관찰 결과를 **운영에는 좁혀서** 적용한다. 운영에서 넓게 시작해 좁혀 가는 방식은 "언젠가 좁히자"가 영원히 오지 않아 실패한다. 보안 부채도 기술 부채와 같아서, 갚을 계획이 없는 부채는 부채가 아니라 손실이다.

> 📚 **사례**: 권한을 깎는 작업에서 가장 흔한 사고는 **드물게 실행되는 경로를 못 본 것**이다. 2주치 CloudTrail로 정책을 만들면 월말 정산 배치, 분기 감사 작업, 장애 시에만 도는 복구 스크립트가 통째로 빠진다. 그리고 그것들은 하필 가장 중요한 순간에 실패한다. 그래서 실무에서는 ① 관찰 기간을 최소 한 분기 이상 잡고 ② 배포 직후 며칠은 `AccessDenied` 경보를 사람이 지켜보며 ③ 되돌릴 수 있는 형태(정책 버전 롤백)로 배포한다. 권한 축소는 기능 변경과 똑같이 취급해야 하는 배포 작업이지, 안전하니까 그냥 해도 되는 정리 작업이 아니다.

> 📚 **사례**: 많은 조직이 처음에 `*:*`에 가까운 정책으로 시작했다가, 사고 후에야 최소 권한으로 줄인다. 모범 사례는 반대로 **"필요한 권한이 거부되면 추가하는" 점진적 방식**이다. Access Analyzer로 생성한 정책을 출발점으로 삼고, CloudTrail의 `AccessDenied`를 모니터링하며 정말 필요한 권한만 더한다. "넓게 주고 좁히기"보다 "좁게 주고 넓히기"가 보안 부채를 만들지 않는다.

## 정책 충돌과 우선순위 종합

여러 정책이 얽혔을 때 결과를 빠르게 판정하는 체크리스트.

1. 어디든 **명시적 Deny**가 있나? → 있으면 끝, Deny.
2. **SCP**가 Action을 허용하나? → 아니면 Deny.
3. **Permissions Boundary**가 허용하나? → 아니면 Deny.
4. (cross-account면) **양쪽** 계정이 허용하나? → 한쪽이라도 빠지면 Deny.
5. **명시적 Allow**가 있나? → 없으면 암묵적 Deny.
6. 모두 통과 → Allow.

> 💡 **관련 이론**: 이 순서에서 2~4번(SCP, Boundary, cross-account 양쪽)은 모두 "**상한을 깎는 필터**"이고, 5번(Identity/Resource Allow)만 "권한을 주는" 단계다. 이 구분을 명확히 하면, "권한이 있는데 왜 안 되나"라는 문제의 답이 거의 항상 필터(2~4) 어딘가에서 막힌 것임을 빠르게 짚을 수 있다.

## 정리하며 — 정밀함이 곧 보안

오늘의 핵심 세 가지. 첫째, **Identity 정책은 "주체가 무엇을", Resource 정책은 "누가 이 리소스에"**를 다루며, cross-account와 KMS 키 정책은 Resource 정책의 영역이다. 둘째, **Condition 키**로 IP·MFA·암호화·태그 기반 정밀 통제를 걸되 `BoolIfExists`·`aws:SourceArn` 같은 함정을 피해야 한다. 셋째, **Permissions Boundary와 ABAC**은 최소 권한을 "확장 가능하게" 설계하는 도구이고, 최소 권한은 직관이 아니라 Access Analyzer·Access Advisor의 데이터로 도출한다.

내일은 STS와 임시 자격 증명으로 넘어간다. AssumeRole이 정확히 어떻게 동작하고, 페더레이션·역할 체이닝이 무엇이며, 오늘 잠깐 만난 Confused Deputy를 `ExternalId`와 `aws:SourceArn`으로 어떻게 막는지를 깊이 다룬다. 오늘 배운 trust policy와 Condition 키가 그 모든 것의 재료가 된다. 그리고 여섯 종류의 정책이 한꺼번에 얽힌 상태에서 요청 하나를 손으로 계산하는 정밀 훈련은 **Week 2 첫날**에 이어진다.

## 한 줄 요약

정책은 붙는 위치로 갈린다 — **Identity 정책은 "주체가 무엇을", Resource 정책은 "누가 이 리소스에"**를 다루며 후자에만 `Principal`이 있다. 리소스 정책은 **일부 서비스만 지원**하므로(EC2·DynamoDB는 미지원) 그런 서비스의 교차 계정 접근은 역할을 맡는 방식으로 푼다. "예외 없이 강제하라"는 요구는 주체를 빠짐없이 커버해야 하는 Identity 정책이 아니라 **리소스 정책의 Deny**로 거는 것이 원칙이다. Condition은 **서로 다른 블록끼리 AND, 한 키의 여러 값은 OR**로 결합하며, 금지는 반드시 `Deny`로 표현해야 다른 Allow에 뚫리지 않는다. `NotAction`은 Deny와만 결합하고, IP 조건에는 `aws:ViaAWSService`를 함께 걸어 서비스 대리 호출을 살려 둔다. **권한 경계·SCP·세션 정책은 천장일 뿐 바닥을 만들지 못하므로** SCP에 Allow를 넣어도 권한은 생기지 않고, 경계를 위임할 때는 경계를 떼는 권한(`iam:DeleteRolePermissionsBoundary`)까지 막아야 한다. ABAC은 정책 수를 일정하게 유지하지만 **태그 통제가 함께 있어야** 성립한다. 최소 권한은 직관이 아니라 CloudTrail → Access Analyzer 정책 생성 → 사람 검토 → 배포 전 검증 → `AccessDenied` 관찰의 절차로 **도출**한다.

---

## 📝 연습 문제

**문제 1.** 계정 A의 Lambda 함수가 계정 B에서 관리하는 KMS 키로 암호화된 데이터를 복호화해야 한다. 반드시 설정해야 하는 것은?

A) 계정 A의 Lambda 실행 역할에 `kms:Decrypt` 권한만 추가하면 된다  
B) 계정 B의 KMS 키 정책에 계정 A의 역할을 허용하고, 계정 A 역할에도 `kms:Decrypt`를 부여한다  
C) 계정 B의 IAM 사용자 정책에만 `kms:Decrypt`를 추가한다  
D) 두 계정이 같은 리전이면 별도 설정 없이 자동 허용된다  

**정답: B**  
해설: KMS는 키 정책이 1차 권위를 가지므로, cross-account 사용 시 키 소유 계정(B)의 키 정책이 호출 계정(A)의 주체를 명시적으로 허용해야 하고, 동시에 A 측 신원 정책에도 `kms:Decrypt` Allow가 있어야 한다. 한쪽만으로는 부족하며, 같은 리전이라는 사실은 권한 부여와 무관하다.

---

**문제 2.** 다음 조건 중 "MFA가 없으면 거부"를 의도했지만, 서비스 간 호출처럼 MFA 키가 아예 없는 정상 요청까지 차단해버릴 위험이 있는 것은?

A) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`  
B) `"Bool": {"aws:MultiFactorAuthPresent": "false"}`  
C) `"Null": {"aws:MultiFactorAuthPresent": "true"}`  
D) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "true"}`  

**정답: B**  
해설: `Bool`은 키가 반드시 존재한다고 가정하고 값을 평가하므로, MFA 컨텍스트 키가 없는 서비스 호출에서도 조건이 의도치 않게 매칭돼 정상 요청을 막을 수 있다. `BoolIfExists`는 키가 있을 때만 값을 평가하고 없으면 통과시켜 이런 부작용을 피한다. 이 차이가 MFA 강제 정책 작성의 단골 함정이다.

---

**문제 3.** 한 조직이 팀이 늘 때마다 IAM 정책을 추가하는 운영 부담에 직면했다. 정책 수를 폭증시키지 않고 "주체와 리소스의 팀 태그가 일치할 때만 허용"을 구현하는 가장 적절한 접근은?

A) 팀마다 별도 역할과 전용 정책을 만든다  
B) 모든 사용자에게 동일한 admin 정책을 주고 신뢰로 운영한다  
C) `aws:PrincipalTag`와 `aws:ResourceTag`를 비교하는 ABAC 조건으로 정책을 통일한다  
D) 팀별로 별도 AWS 계정을 만들어 물리적으로 분리한다  

**정답: C**  
해설: ABAC은 주체 태그와 리소스 태그의 일치를 조건으로 표현해 정책 하나로 임의 개수의 팀을 처리하므로, 팀이 늘어도 정책 변경 없이 태그만 부여하면 된다. 팀별 역할·정책 양산은 RBAC의 정책 폭증 문제를 그대로 안고, admin 일괄 부여는 최소 권한 위반이며, 팀별 계정 분리는 과도하고 본 문제의 의도와 다르다.

---

**문제 4.** 개발자에게 IAM 역할 생성 권한을 주되, 그가 만든 역할이 부여받은 상한을 넘지 못하게 강제하려 한다. 가장 적절한 메커니즘은?

A) SCP로 `iam:CreateRole` 자체를 Deny한다  
B) `iam:CreateRole` 허용 시 특정 Permissions Boundary 부착을 조건으로 강제한다  
C) 개발자에게 `ReadOnlyAccess`만 부여한다  
D) 생성된 역할을 매일 사람이 검토해 과도하면 삭제한다  

**정답: B**  
해설: `iam:PermissionsBoundary` 조건으로 역할 생성 시 지정한 boundary 부착을 강제하면, 생성된 역할의 실효 권한이 boundary와의 교집합으로 제한돼 권한 상승을 구조적으로 차단한다. CreateRole을 아예 막으면 위임 자체가 불가능하고, ReadOnly만 주면 역할을 만들 수 없으며, 사람의 사후 검토는 누락과 지연 위험이 크다.

---

**문제 5.** S3 버킷에 올라오는 모든 객체가 KMS로 암호화되도록 강제하려 한다. 가장 직접적이고 누락 없는 방법은?

A) 업로드하는 모든 애플리케이션 코드에 암호화 헤더를 넣도록 개발 가이드를 배포한다  
B) 버킷 정책에 `s3:x-amz-server-side-encryption` 조건으로 암호화 헤더가 없는 PutObject를 Deny한다  
C) GuardDuty로 미암호화 객체를 탐지해 알림을 보낸다  
D) IAM 사용자별로 암호화 권한을 따로 부여한다  

**정답: B**  
해설: 버킷 정책에서 `s3:x-amz-server-side-encryption` 조건으로 암호화 헤더 없는 PutObject를 명시적으로 Deny하면, 어떤 주체가 올리든 미암호화 업로드가 차단되는 예방 통제가 된다. 개발 가이드는 강제력이 없어 누락되고, GuardDuty 탐지는 사후 알림일 뿐 업로드를 막지 못하며, 사용자별 권한 부여는 암호화 강제와 직접 관련이 없다.

---
