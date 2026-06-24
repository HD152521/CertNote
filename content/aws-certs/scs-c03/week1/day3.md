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

내일은 STS와 임시 자격 증명으로 넘어간다. AssumeRole이 정확히 어떻게 동작하고, 페더레이션·역할 체이닝이 무엇이며, 오늘 잠깐 만난 Confused Deputy를 `ExternalId`와 `aws:SourceArn`으로 어떻게 막는지를 깊이 다룬다. 오늘 배운 trust policy와 Condition 키가 그 모든 것의 재료가 된다.

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
