# Day 1 - 정책 평가 로직 완전 정복: Explicit Deny가 모든 것을 이긴다

SCS-C03 시험에서 가장 많이 틀리는 단 하나의 주제를 꼽으라면 단연 **IAM 정책 평가 로직**이다. "이 요청은 허용될까, 거부될까?"라는 질문은 도메인 전반에 흩어져 출제되는데, 보기 네 개가 모두 그럴듯해 보이고 정답은 하나뿐이다. 그 이유는 IAM이 단순한 ON/OFF 스위치가 아니라, **여섯 종류의 정책이 동시에 평가되는 다층 의사결정 엔진**이기 때문이다.

Associate 수준에서는 "IAM 정책에서 Allow하면 허용된다"는 단순 모델로 충분했다. 하지만 Specialty에서는 SCP, Permission Boundary, Session Policy, Resource-based Policy, VPC Endpoint Policy까지 동시에 작동하는 환경에서 "왜 권한을 줬는데 막혔는가?"를 추적할 수 있어야 한다. 오늘은 AWS가 공식 문서에 명시한 **평가 흐름(evaluation flow)**을 한 줄도 빠짐없이 손에 익힌다.

## IAM 평가의 대원칙 세 가지

모든 평가는 다음 세 원칙 위에서 돌아간다. 이 세 가지만 정확히 알면 절반은 풀린다.

1. **기본은 묵시적 거부(Implicit Deny)** — 명시적으로 Allow되지 않은 모든 요청은 거부된다.
2. **명시적 거부(Explicit Deny)가 무조건 이긴다** — 어떤 정책이 Allow해도, 단 하나의 정책이라도 Deny하면 최종 결과는 Deny다.
3. **여러 정책 타입은 AND 관계(교집합)** — SCP·Boundary·Identity 정책이 모두 걸려 있으면, **모두가 동시에 Allow해야** 통과한다. 하나라도 빠지면 막힌다.

> 💡 **관련 이론**: 이 모델을 보안 공학에서는 **default-deny(기본 거부)** 또는 **deny-by-default** 정책이라 부른다. 화이트리스트 방식의 접근 제어로, 블랙리스트(default-allow)보다 훨씬 안전하다. 블랙리스트는 "금지 목록에 없으면 허용"이라 새 공격 표면이 생길 때마다 구멍이 뚫리지만, 화이트리스트는 "허용 목록에 없으면 차단"이라 미지의 행위를 자동으로 막는다. IAM은 철저히 default-deny이며, 이 때문에 "권한을 안 줬는데 됐다"는 상황은 거의 발생하지 않는다.

## 여섯 종류의 정책과 평가 순서

요청 하나가 들어오면 IAM은 다음 정책들을 모두 모아 평가한다.

| 정책 타입 | 부착 대상 | 역할 | 권한 부여 가능? |
|-----------|-----------|------|-----------------|
| Identity-based | User/Group/Role | 주체가 무엇을 할 수 있나 | O |
| Resource-based | S3 버킷, KMS 키 등 | 누가 이 리소스에 접근하나 | O |
| Permission Boundary | User/Role | 주체 권한의 상한선 | X (상한만) |
| SCP | OU/Account | 계정 전체의 최대 권한 가드레일 | X (상한만) |
| Session Policy | AssumeRole 시 전달 | 세션 단위 권한 축소 | X (상한만) |
| RCP (Resource Control Policy) | OU/Account | 리소스 접근의 조직 차원 가드레일 | X (상한만) |

평가 순서는 다음과 같다. AWS 공식 흐름도를 그대로 따른다.

```
요청 도착
  │
  ▼
1. 명시적 Deny가 어디든 하나라도 있나?
     YES → ❌ DENY (즉시 종료, 다른 평가 무시)
     NO  ↓
2. SCP가 해당 액션을 Allow하나? (계정 = Organizations 멤버일 때)
     NO  → ❌ DENY
     YES ↓
3. Resource-based 정책이 명시적으로 Allow하나?
     YES → ✅ ALLOW (일부 경우 Identity 정책 없이도 통과)
     NO  ↓
4. Identity-based 정책이 Allow하나?
     NO  → ❌ DENY
     YES ↓
5. Permission Boundary가 Allow하나? (설정된 경우)
     NO  → ❌ DENY
     YES ↓
6. Session Policy가 Allow하나? (AssumeRole 세션일 때)
     NO  → ❌ DENY
     YES → ✅ ALLOW
```

핵심은 **1번이 가장 먼저, 무조건 우선**이라는 점이다. SCP가 Allow하고 Identity 정책이 Allow해도, Resource Policy에 단 한 줄 `"Effect": "Deny"`가 있으면 끝난다.

> ⚠️ **함정**: 시험에서 가장 흔한 함정은 "관리자가 `AdministratorAccess`를 붙여줬는데 왜 S3 객체를 못 읽는가?"이다. 답은 십중팔구 **버킷 정책의 explicit deny**, **SCP 차단**, 또는 **KMS 키 정책 미허용** 중 하나다. AdministratorAccess는 Identity 정책일 뿐, 다른 다섯 층을 뚫지 못한다.

## 교집합의 시각화: 권한은 깎이기만 한다

가드레일 정책(SCP, Boundary, Session, RCP)은 권한을 **부여하지 않는다**. 오직 상한선을 정할 뿐이다. 실제 유효 권한(effective permissions)은 모든 층의 **교집합**이다.

```
유효 권한 = SCP허용 ∩ Boundary허용 ∩ Identity허용 ∩ Session허용
           (단, 어느 곳에든 Explicit Deny가 있으면 그 액션은 제외)
```

예를 들어 다음 상황을 보자.

```json
// SCP: s3:* 와 ec2:* 허용
{ "Effect": "Allow", "Action": ["s3:*", "ec2:*"], "Resource": "*" }

// Permission Boundary: s3:* 만 허용
{ "Effect": "Allow", "Action": "s3:*", "Resource": "*" }

// Identity Policy: s3:GetObject, ec2:RunInstances 허용
{ "Effect": "Allow", "Action": ["s3:GetObject", "ec2:RunInstances"], "Resource": "*" }
```

이 사용자가 실제로 할 수 있는 것은 무엇인가? 세 층의 교집합을 구한다.

- `s3:GetObject` → SCP(O) ∩ Boundary(O) ∩ Identity(O) = **허용**
- `ec2:RunInstances` → SCP(O) ∩ Boundary(**X**, Boundary에 ec2 없음) ∩ Identity(O) = **거부**

Identity 정책이 `ec2:RunInstances`를 명시적으로 Allow해도, Permission Boundary가 ec2를 포함하지 않아 교집합에서 빠진다. **상한선을 못 넘는다**는 것이 이런 의미다.

> 💡 **관련 이론**: 이것은 보안의 **최소 권한 원칙(Principle of Least Privilege, PoLP)**을 구조적으로 강제하는 메커니즘이다. Jerome Saltzer와 Michael Schroeder가 1975년 논문 "The Protection of Information in Computer Systems"에서 정립한 8대 보안 설계 원칙 중 하나다. 여러 층의 가드레일을 두면, 한 층의 정책을 실수로 과하게 열어도 다른 층이 상한을 막아준다. 이를 **defense in depth(심층 방어)**라고 부른다.

## Resource-based 정책의 특수성: 크로스 계정에서의 평가

같은 계정 내에서는 Identity 정책 **또는** Resource 정책 중 하나만 Allow해도 통과한다(둘은 합집합처럼 작동). 하지만 **크로스 계정**에서는 다르다.

```
크로스 계정 접근 시:
  - 호출자 계정의 Identity 정책: Allow 필요 (AND)
  - 리소스 계정의 Resource 정책: Allow 필요 (AND)
  → 양쪽 모두 Allow해야 통과
```

즉 계정 A의 사용자가 계정 B의 S3 버킷에 접근하려면, A의 IAM 정책이 그 버킷을 허용하고 **동시에** B의 버킷 정책이 A를 허용해야 한다. 한쪽만으로는 안 된다.

> 🔍 **더 깊이**: 이 비대칭 때문에 KMS가 특히 까다롭다. KMS 키 정책은 IAM 정책과 달리, **키 정책이 IAM에 위임(delegation)을 명시하지 않으면 IAM 정책만으로는 키를 못 쓴다.** 기본 키 정책의 `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` 한 줄이 "이 계정의 IAM 정책에게 권한 판단을 위임한다"는 의미다. 이 줄이 없으면 AdministratorAccess라도 KMS 키를 못 쓴다. 시험 단골 함정이다.

## 조건(Condition)이 평가를 바꾼다

각 Statement의 `Condition` 블록은 평가의 마지막 필터다. 조건이 거짓이면 그 Statement는 무시된다(Allow든 Deny든).

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": "*",
  "Condition": {
    "Bool": { "aws:MultiFactorAuthPresent": "false" }
  }
}
```

이 Deny는 "MFA가 없을 때만" 작동한다. MFA로 인증한 세션이면 조건이 거짓이 되어 Deny가 무시되고, MFA 없는 세션이면 Deny가 발동한다. 이런 조건부 Deny는 SCP나 Identity 정책에서 강력한 가드레일로 쓰인다.

> ⚠️ **함정**: `aws:MultiFactorAuthPresent`는 **AssumeRole로 얻은 임시 자격증명에는 존재하지 않을 수 있다.** EC2 인스턴스 프로파일이나 서비스 롤로 호출하면 이 키 자체가 없어, `Bool` 비교가 의도와 다르게 작동할 수 있다. 그래서 정밀한 정책은 `BoolIfExists`를 써서 "키가 있을 때만 검사"하도록 한다.

## 정리하며

IAM 평가 로직은 외우는 것이 아니라 **흐름도를 손으로 그릴 수 있어야** 한다. 시험장에서 "이 요청 허용될까?"가 나오면 머릿속에서 (1) explicit deny 검색 → (2) SCP → (3) resource → (4) identity → (5) boundary → (6) session 순서로 6칸을 차례로 통과시켜라. 단 하나라도 막히면 Deny다. 그리고 가드레일은 권한을 주지 않고 깎기만 한다는 것, 크로스 계정은 양쪽 AND라는 것, KMS는 키 정책이 위임을 명시해야 한다는 것 — 이 세 가지가 day1의 핵심이다.

다음 글에서는 이 평가 로직의 한 축인 **Permission Boundary**를 깊이 다룬다. 개발자에게 IAM 권한을 위임하면서도 그들이 자기 권한을 넘는 롤을 만들지 못하게 막는 실전 패턴이다.

---

## 📝 연습 문제

**문제 1.** 한 사용자에게 `AdministratorAccess` Identity 정책이 부착되어 있다. 그런데 이 사용자가 특정 S3 버킷의 객체를 읽으려 하자 `AccessDenied`가 발생한다. CloudTrail에는 SCP 차단 기록이 없다. 가장 가능성 높은 원인은?

A) IAM 정책이 우선순위에서 밀렸기 때문  
B) 버킷 정책에 해당 주체를 대상으로 한 명시적 Deny가 있기 때문  
C) S3는 Identity 정책을 지원하지 않기 때문  
D) AdministratorAccess는 S3를 포함하지 않기 때문  

**정답: B**  
해설: 명시적 Deny는 모든 Allow를 이긴다. SCP 차단이 아니라면, 리소스 기반 정책인 버킷 정책의 explicit deny가 가장 유력하다. 우선순위가 밀린 게 아니라 평가 1단계에서 Deny가 즉시 최종 결정을 내린 것이다. S3는 Identity 정책을 지원하며, AdministratorAccess(`*:*`)는 S3를 포함하므로 나머지 보기는 틀리다.

---

**문제 2.** Permission Boundary가 `s3:*`만 허용하도록 설정된 롤이 있다. 이 롤의 Identity 정책은 `ec2:RunInstances`와 `s3:GetObject`를 Allow한다. 이 롤이 실제로 수행할 수 있는 액션은?

A) `ec2:RunInstances`와 `s3:GetObject` 모두  
B) `s3:GetObject`만  
C) `ec2:RunInstances`만  
D) 아무것도 못 함  

**정답: B**  
해설: 유효 권한은 Permission Boundary와 Identity 정책의 교집합이다. Boundary가 `s3:*`만 허용하므로 `ec2:RunInstances`는 상한을 넘어 거부되고, `s3:GetObject`만 양쪽이 모두 허용하여 통과한다. Boundary는 권한을 부여하지 않고 상한만 정한다는 핵심 원리를 묻는 문제다.

---

**문제 3.** 계정 A의 IAM 사용자가 계정 B의 S3 버킷에 객체를 업로드해야 한다. 동작하게 하려면 무엇이 반드시 필요한가?

A) 계정 A의 IAM 정책에 `s3:PutObject` Allow만 있으면 된다  
B) 계정 B의 버킷 정책에 계정 A를 허용하는 Allow만 있으면 된다  
C) 계정 A의 IAM 정책과 계정 B의 버킷 정책이 모두 Allow해야 한다  
D) 두 계정을 같은 Organizations에 두기만 하면 된다  

**정답: C**  
해설: 크로스 계정 접근은 호출자 계정의 Identity 정책과 리소스 계정의 Resource 정책이 모두 Allow해야 하는 AND 관계다. 한쪽만으로는 통과하지 못한다. 같은 Organizations 소속이라는 사실만으로 권한이 생기지는 않으며, SCP는 오히려 상한을 더 제한할 뿐이다.

---

**문제 4.** 한 보안 엔지니어가 SCP로 `Deny ec2:*`를 OU에 적용했다. 그런데 해당 OU의 한 계정에서 관리자가 IAM 정책으로 `Allow ec2:*`를 부여했다. 이 계정의 사용자는 EC2 인스턴스를 시작할 수 있는가?

A) 가능하다, IAM 정책이 SCP보다 구체적이므로  
B) 가능하다, 계정 관리자 권한이 SCP를 무시하므로  
C) 불가능하다, SCP의 명시적 Deny가 IAM Allow를 이기므로  
D) 조건에 따라 다르다  

**정답: C**  
해설: SCP의 명시적 Deny는 평가 1단계에서 즉시 최종 결정을 내린다. IAM 정책이 아무리 구체적이거나 관리자급이어도, 명시적 Deny를 뚫을 수 없다. 가드레일은 계정 내부의 어떤 Allow보다 우선하며, 이것이 SCP를 조직 차원 통제 수단으로 쓰는 이유다.

---

**문제 5.** 어떤 IAM 정책의 Statement에 `"Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "true" } }`가 붙어 있다. `Bool` 대신 `BoolIfExists`를 쓴 이유로 가장 적절한 것은?

A) MFA 키가 존재하지 않는 호출(예: 서비스 롤)에서 의도치 않은 결과를 막기 위해  
B) `BoolIfExists`가 더 빠르게 평가되기 때문  
C) `Bool`은 SCP에서만 동작하기 때문  
D) MFA를 더 강하게 강제하기 위해  

**정답: A**  
해설: AssumeRole로 얻은 임시 자격증명이나 서비스 롤 호출에는 `aws:MultiFactorAuthPresent` 키가 아예 없을 수 있다. 이때 `Bool`은 키 부재를 다르게 처리해 정책이 의도와 어긋날 수 있으므로, `BoolIfExists`로 "키가 존재할 때만 비교"하게 만들어 안전하게 처리한다. 성능이나 SCP 전용 여부와는 무관하다.
