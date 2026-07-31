# Day 1 - 정책 평가 로직 완전 정복: Explicit Deny가 모든 것을 이긴다

SCS-C03 시험에서 가장 많이 틀리는 단 하나의 주제를 꼽으라면 단연 **IAM 정책 평가 로직**이다. "이 요청은 허용될까, 거부될까?"라는 질문은 도메인 전반에 흩어져 출제되는데, 보기 네 개가 모두 그럴듯해 보이고 정답은 하나뿐이다. 그 이유는 IAM이 단순한 ON/OFF 스위치가 아니라, **여섯 종류의 정책이 동시에 평가되는 다층 의사결정 엔진**이기 때문이다.

Associate 수준에서는 "IAM 정책에서 Allow하면 허용된다"는 단순 모델로 충분했다. 하지만 Specialty에서는 SCP, Permission Boundary, Session Policy, Resource-based Policy, VPC Endpoint Policy까지 동시에 작동하는 환경에서 "왜 권한을 줬는데 막혔는가?"를 추적할 수 있어야 한다. 오늘은 AWS가 공식 문서에 명시한 **평가 흐름(evaluation flow)**을 한 줄도 빠짐없이 손에 익힌다.

이 능력을 한 문장으로 정의하면 이렇다. **"정책 문서 여러 장을 받아 들고, 특정 요청 하나가 통과하는지 손으로 계산할 수 있는가."** SCS-C03의 IAM 문항은 거의 예외 없이 이 계산을 요구한다. 서비스 이름을 외우는 문제가 아니라, 주어진 JSON 조각들을 겹쳐 놓고 교집합을 구하는 문제다. 그래서 오늘의 목표는 지식이 아니라 *절차*다.

## 평가 엔진의 입력: 요청 컨텍스트

정책 평가를 계산하려면 먼저 **엔진에 무엇이 들어가는지**를 알아야 한다. AWS로 들어오는 모든 API 호출은 서명과 함께 다음 네 덩어리로 분해되어 평가 엔진에 전달된다. 이것을 **요청 컨텍스트(request context)**라 부른다.

```
[ 요청 컨텍스트 = 정책 평가의 입력값 ]

  ① Principal   누가 요청했나
                 arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc
                 (임시 자격증명이면 assumed-role 형태로 나타난다)

  ② Action      무엇을 하려 하나
                 s3:GetObject

  ③ Resource    무엇에 대해서
                 arn:aws:s3:::prod-logs/2026/07/29/app.log

  ④ Context     그 밖의 모든 것 — 조건(Condition)이 검사하는 대상
                 aws:SourceIp          = 203.0.113.45
                 aws:PrincipalTag/Team = payments
                 aws:RequestedRegion   = ap-northeast-2
                 aws:SecureTransport   = true
                 aws:PrincipalOrgID    = o-exampleorgid
                 aws:ViaAWSService     = false
                 ...
```

정책의 `Principal`/`Action`/`Resource`/`Condition` 네 요소는 각각 이 네 덩어리와 대조된다. 여기서 시험에 직결되는 성질이 하나 나온다. **Condition에서 검사하는 컨텍스트 키가 그 요청에 아예 존재하지 않으면, 그 조건은 "일치하지 않음"으로 처리되어 Statement 전체가 무시된다.** 뒤에서 볼 `...IfExists` 연산자의 존재 이유가 바로 이것이다.

| 컨텍스트 키 부류 | 대표 키 | 어디서 오나 |
|------------------|---------|-------------|
| 프린시펄 신원 | `aws:PrincipalArn`, `aws:PrincipalAccount`, `aws:PrincipalOrgID`, `aws:userid` | 자격증명 자체 |
| 프린시펄 속성 | `aws:PrincipalTag/*` | 롤·사용자 태그, 세션 태그 |
| 요청 내용 | `aws:RequestTag/*`, `aws:TagKeys`, `aws:RequestedRegion` | API 파라미터 |
| 리소스 속성 | `aws:ResourceTag/*`, `aws:ResourceOrgID` | 대상 리소스 |
| 네트워크 | `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce`, `aws:VpcSourceIp` | 호출 경로 |
| 인증 강도 | `aws:MultiFactorAuthPresent`, `aws:MultiFactorAuthAge`, `aws:SecureTransport` | 세션 발급 시점 |
| 서비스 대리 호출 | `aws:ViaAWSService`, `aws:PrincipalIsAWSService`, `aws:SourceArn`, `aws:SourceAccount` | AWS 서비스가 대신 부를 때 |

> 🔍 **더 깊이**: `aws:SourceIp`와 `aws:VpcSourceIp`를 혼동하면 정책이 조용히 무력화된다. 요청이 **VPC 엔드포인트를 경유**하면 퍼블릭 IP가 아니라 프라이빗 경로로 들어오므로 `aws:SourceIp`는 원하는 값과 맞지 않는다. 이 경우 `aws:SourceVpce`(엔드포인트 ID)나 `aws:SourceVpc`(VPC ID)로 검사해야 한다. "사무실 IP에서만 접근 허용" 정책을 걸었는데 VPC 안 EC2에서 호출이 막히거나, 반대로 엔드포인트 경유 요청이 IP 조건을 우회하는 증상이 여기서 나온다. 시험에서 "온프레미스·사무실 IP 제한"이면 `aws:SourceIp`, "VPC 내부에서만"이면 `aws:SourceVpc`/`aws:SourceVpce`가 정답 신호다.

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

여기에 실무에서는 한 층이 더 얹힌다. **VPC 엔드포인트 정책**은 그 엔드포인트를 *경유하는* 요청에만 적용되는 리소스 기반 정책으로, "이 VPC에서 나가는 S3 요청은 우리 조직 버킷만 대상으로 할 수 있다" 같은 데이터 반출(exfiltration) 통제를 만든다. IAM·SCP와는 다른 축이지만 최종 판정에는 똑같이 참여한다.

각 층을 "누가 관리하는가"로 다시 보면 왜 층이 이렇게 많은지 이해된다.

| 층 | 관리 주체 | 통제하는 질문 | 이 층만으로는 못 하는 것 |
|----|-----------|---------------|--------------------------|
| SCP | 조직 관리 계정 | "이 **계정**이 애초에 할 수 있는 일의 최대치는?" | 개인별 차등, 권한 부여 |
| Permission Boundary | 계정의 IAM 관리자 | "이 **주체**가 가질 수 있는 권한의 천장은?" | 계정 전체 통제, 권한 부여 |
| Identity 정책 | 계정의 IAM 관리자 | "이 주체에게 실제로 **무엇을 줄까**?" | 상한 강제 |
| Resource 정책 | **리소스 소유 계정** | "이 리소스에 **누구를 들일까**?" | 호출자 계정 내부 통제 |
| Session 정책 | AssumeRole을 **호출하는 코드** | "이번 **세션**만 얼마나 좁힐까?" | 영구 통제 |
| RCP | 조직 관리 계정 | "우리 **리소스**에 조직 밖 주체가 닿을 수 있나?" | 권한 부여, 전 서비스 커버 |

이 표에서 읽어야 할 핵심은 **관리 주체가 서로 다르다**는 점이다. 층이 많은 이유는 복잡해서가 아니라, *권한을 주는 사람*과 *상한을 정하는 사람*과 *리소스를 소유한 사람*이 조직에서 서로 다른 사람이기 때문이다. 각 역할이 다른 사람의 실수를 덮어 줄 수 있어야 다층 방어가 성립한다.

> ⚠️ **함정**: RCP는 SCP의 "리소스 쪽 쌍둥이"지만 **모든 서비스에 적용되지는 않는다.** 지원 서비스가 한정되어 있으므로 "RCP로 조직 전체 리소스를 한 번에 잠근다"는 식의 보기는 조심해야 한다. 반대로 SCP는 *프린시펄이 우리 조직 계정에 속할 때*만 작동하므로, **조직 밖 주체가 우리 리소스에 접근하는 경로는 SCP로 막히지 않는다.** 이 빈틈을 메우려고 나온 것이 RCP이고, 그래서 두 정책은 대체재가 아니라 서로의 사각지대를 메우는 짝이다.

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

같은 흐름을 "요청이 통과해야 하는 관문"의 그림으로 다시 그리면, 각 층이 무엇을 들고 서 있는지가 눈에 들어온다. 시험장에서 손으로 그려야 할 그림이 바로 이것이다.

```
[ 하나의 API 요청이 통과해야 하는 관문들 ]

   요청  s3:GetObject  on  arn:aws:s3:::prod-logs/app.log
   프린시펄  arn:aws:sts::111122223333:assumed-role/DevRole/alice
     │
     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 0. 명시적 Deny 스캔 — 모든 층을 한꺼번에 훑는다          │
  │    SCP·RCP·Boundary·Session·Identity·Resource·VPCE      │
  │    어디든 Deny 한 줄 → ❌ 즉시 종료, 나머지 평가 안 함   │
  └────────────────────────────────────────────────────────┘
     │ Deny 없음
     ▼
  ┌─ ① SCP (조직 가드레일) ────────────────────────────────┐
  │    Root → OU → 계정 경로의 SCP가 **모두** 허용해야 통과 │
  │    · 관리 계정에는 적용 안 됨                           │
  │    · 서비스 연결 롤(service-linked role)에는 적용 안 됨 │
  │    · 멤버 계정의 root 사용자에게도 적용됨               │
  └────────────────────────────────────────────────────────┘
     │ 허용
     ▼
  ┌─ ② 리소스 기반 정책 (버킷 정책 / 키 정책 / 신뢰 정책) ─┐
  │    같은 계정  : 여기서 Allow면 Identity 없이도 통과 가능│
  │    교차 계정  : 여기 Allow는 **필수 조건**(생략 불가)   │
  └────────────────────────────────────────────────────────┘
     │
     ▼
  ┌─ ③ Identity 정책 (Permission Set / 인라인 / 관리형) ───┐
  │    "이 주체에게 실제로 부여된 권한"                     │
  └────────────────────────────────────────────────────────┘
     │ 허용
     ▼
  ┌─ ④ Permission Boundary (부착된 경우) ──────────────────┐
  │    ③이 아무리 넓어도 여기 없는 액션은 탈락              │
  └────────────────────────────────────────────────────────┘
     │ 허용
     ▼
  ┌─ ⑤ Session Policy (AssumeRole 시 전달된 경우) ─────────┐
  │    이 세션에 한해 추가로 좁힌 범위                      │
  └────────────────────────────────────────────────────────┘
     │ 허용
     ▼
  ┌─ ⑥ 조건(Condition) 최종 평가 ─────────────────────────┐
  │    MFA · IP · 리전 · 태그 · OrgID · 암호화 전송 …      │
  │    조건 하나라도 불일치 → 그 Statement는 없는 셈        │
  └────────────────────────────────────────────────────────┘
     │
     ▼   ✅ ALLOW
```

이 그림에서 세 가지를 기억한다.

1. **0단계는 순서가 아니라 전역 스캔이다.** "어느 층에서 Deny했는가"는 중요하지 않다. 하나라도 있으면 끝이다.
2. **①~⑤는 전부 AND다.** 위에서 아래로 내려가는 것처럼 그렸지만, 실제로는 *모두 동시에 참이어야* 통과한다. 그래서 "순서를 외우는 것"보다 "전부 통과해야 한다"가 훨씬 중요한 사실이다. 순서를 조금 다르게 기억해도 답은 같게 나온다.
3. **②만 유일하게 '지름길'이 있다.** 같은 계정 안에서 리소스 정책이 프린시펄을 직접 허용하면 Identity 정책 없이도 통과할 수 있다. 이 비대칭이 다음 절의 주제다.

> ⚠️ **함정**: 시험에서 가장 흔한 함정은 "관리자가 `AdministratorAccess`를 붙여줬는데 왜 S3 객체를 못 읽는가?"이다. 답은 십중팔구 **버킷 정책의 explicit deny**, **SCP 차단**, 또는 **KMS 키 정책 미허용** 중 하나다. AdministratorAccess는 Identity 정책일 뿐, 다른 다섯 층을 뚫지 못한다.

> ⚠️ **함정**: SCP는 **서비스 연결 롤(service-linked role)에는 적용되지 않는다.** 그래서 "SCP로 `autoscaling:*`을 전부 Deny했는데 Auto Scaling이 계속 인스턴스를 띄운다"는 상황이 실제로 발생한다. 서비스 연결 롤은 AWS 서비스가 자기 기능을 수행하기 위해 쓰는 특수한 롤이라 조직 가드레일 밖에 있다. 반대로 **멤버 계정의 root 사용자에게는 SCP가 적용된다** — 이 둘을 반대로 외우는 실수가 잦다.

> 🎯 **시나리오**: "회사가 `ap-northeast-2` 외 리전 사용을 금지하는 SCP를 배포했다. 그런데 감사 결과 `us-east-1`에 CloudFront 배포와 IAM 롤이 계속 만들어지고 있다. 통제가 실패한 것인가?" → 아니다. IAM·CloudFront·Route 53 같은 **글로벌 서비스는 API 엔드포인트가 `us-east-1`로 라우팅**되므로 리전 제한 SCP에서 의도적으로 예외 처리되는 것이 정상이다(day3에서 다룬다). 여기서 판단해야 할 것은 "SCP가 뚫렸다"가 아니라 "리전 제한이라는 통제가 애초에 글로벌 서비스에는 적용될 수 없는 성질"이라는 점이다. 통제의 *한계*를 아는 것도 통제 설계의 일부다.

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

```
[ 같은 계정 vs 교차 계정 — 결합 규칙이 다르다 ]

── 같은 계정 (OR / 합집합) ──────────────────────────────
   계정 111122223333
   ┌──────────────┐            ┌──────────────────┐
   │ role/Reader  │  ──요청──▶ │ s3://logs (같은 계정) │
   │  IAM: Allow  │            │  버킷 정책: 없음      │
   └──────────────┘            └──────────────────┘
        → 통과 ✅  (IAM만으로 충분)

   ┌──────────────┐            ┌──────────────────┐
   │ role/Reader  │  ──요청──▶ │ s3://logs         │
   │  IAM: 없음   │            │ 버킷 정책이 이 롤을 │
   │              │            │ Principal로 Allow │
   └──────────────┘            └──────────────────┘
        → 통과 ✅  (리소스 정책만으로도 충분)

── 교차 계정 (AND / 교집합) ─────────────────────────────
   계정 A 111122223333            계정 B 444455556666
   ┌──────────────┐               ┌──────────────────┐
   │ role/Reader  │  ──요청──────▶│ s3://b-logs      │
   │ IAM: Allow   │               │ 버킷 정책: A 허용 │
   │  (B의 ARN)   │               │                  │
   └──────────────┘               └──────────────────┘
        A의 IAM Allow  ✅  AND  B의 버킷 정책 Allow ✅  → 통과

        한쪽만 있으면 → ❌  (예외 없음)
```

이 규칙에는 이름이 붙어 있다. 같은 계정에서 리소스 정책이 프린시펄을 직접 지정해 허용하는 경우를 AWS는 **principal-in-resource-policy** 경로라 부르고, 이 경로로 들어온 요청은 Identity 정책의 Allow 없이도 통과할 수 있다. 반대로 교차 계정에서는 이 지름길이 사라진다. **"내 계정의 관리자가 다른 계정 리소스에 대한 권한을 나 몰래 얻을 수 없다"**는 신뢰 경계를 지키기 위한 설계다. 즉 교차 계정 AND 규칙은 불편함이 아니라 *계정이라는 격리 단위를 의미 있게 만드는 장치*다.

> 🔍 **더 깊이**: 이 비대칭 때문에 KMS가 특히 까다롭다. KMS 키 정책은 IAM 정책과 달리, **키 정책이 IAM에 위임(delegation)을 명시하지 않으면 IAM 정책만으로는 키를 못 쓴다.** 기본 키 정책의 `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` 한 줄이 "이 계정의 IAM 정책에게 권한 판단을 위임한다"는 의미다. 이 줄이 없으면 AdministratorAccess라도 KMS 키를 못 쓴다. 시험 단골 함정이다.

> 🔍 **더 깊이**: 교차 계정 접근에는 **두 가지 서로 다른 모양**이 있고, 시험은 이 둘을 구분시킨다. 하나는 지금 본 *리소스 정책 방식*으로, 계정 A의 프린시펄이 **A의 자격증명 그대로** B의 리소스를 부른다 — CloudTrail의 `userIdentity`는 여전히 A의 롤이고, B의 트레일에는 "외부 계정이 내 리소스를 썼다"로 남는다. 다른 하나는 *AssumeRole 방식*으로, A의 프린시펄이 B의 롤로 **신원을 갈아입은 뒤** B 안에서 로컬 요청을 한다 — 이때는 B의 로그에 B 소속 롤로 기록되고, 세션 이름으로 원래 사람을 역추적한다. 감사 요구가 "누가 우리 계정에서 무엇을 했는지 우리 로그만으로 완결되게 보고 싶다"면 AssumeRole 방식이, "버킷 하나만 열어 주면 되고 롤 관리 부담을 늘리고 싶지 않다"면 리소스 정책 방식이 맞다.

교차 계정 접근을 여는 순간 생기는 위험은 "얼마나 넓게 열었는가"다. 계정 번호만으로 여는 대신 조직 단위로 제한하는 조건이 실무 표준이다.

```json
{
  "Sid": "AllowOrgAccountsOnly",
  "Effect": "Allow",
  "Principal": "*",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::central-logs/*",
  "Condition": {
    "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
    "Bool": { "aws:SecureTransport": "true" }
  }
}
```

`"Principal": "*"`만 보고 "퍼블릭 버킷"이라 판단하면 오답이다. `aws:PrincipalOrgID` 조건이 붙는 순간 이 문장은 **"우리 조직에 속한 계정의 프린시펄만"**으로 좁혀진다. 계정이 새로 만들어져 조직에 편입되어도 정책을 고칠 필요가 없다는 것이 이 패턴의 장점이고, 반대로 **조직에서 계정이 빠지면 즉시 접근이 끊긴다**는 것이 안전장치다.

> ⚠️ **함정**: `aws:PrincipalOrgID`와 `aws:ResourceOrgID`를 바꿔 쓰면 통제 방향이 정반대가 된다. `PrincipalOrgID`는 "**호출하는 쪽**이 우리 조직인가"를 묻고, `ResourceOrgID`는 "**대상 리소스**가 우리 조직 것인가"를 묻는다. 데이터 반출을 막으려면(우리 직원이 외부 버킷으로 데이터를 빼내는 것) `aws:ResourceOrgID`가 필요하고, 외부 침입을 막으려면(외부 계정이 우리 버킷을 읽는 것) `aws:PrincipalOrgID`가 필요하다. 두 방향은 별개의 통제이며, 둘 다 필요한 경우가 대부분이다.

## 세션 정책과 롤 체이닝: 여섯 번째 층 실물로 보기

Session Policy는 여섯 층 중에서 가장 덜 알려졌지만, **AssumeRole을 호출하는 코드가 그 자리에서 권한을 더 좁히는** 유일한 수단이다. 정책을 미리 만들어 두지 않아도 되고, 호출 순간에 만들어 넘긴다.

```bash
# ① 인라인 세션 정책 — 이 세션에 한해 버킷 하나로 범위를 좁힌다
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/DataProcessor \
  --role-session-name alice@example.com \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::tenant-acme/*"
    }]
  }'

# ② 관리형 정책 ARN을 세션 정책으로 지정 (최대 10개까지)
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/DataProcessor \
  --role-session-name batch-2026q3 \
  --policy-arns arn=arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# ③ 세션 태그 + 원본 신원 — ABAC와 감사 추적을 위해 함께 넘긴다
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/AuditReadRole \
  --role-session-name audit-run \
  --external-id 7f3c9a2b-e1d4-4a88-9c6f-2b0d5e91a4c7 \
  --tags Key=Team,Value=payments Key=Env,Value=prod \
  --transitive-tag-keys Team \
  --source-identity alice@example.com
```

세션 정책의 결정적 성질은 **권한을 추가할 수 없다**는 것이다. 위 ②에서 `AmazonS3ReadOnlyAccess`를 세션 정책으로 넘겼다고 해서 롤이 원래 갖지 않은 S3 권한이 생기지 않는다. 롤 정책과 세션 정책의 **교집합**만 남는다.

| 파라미터 | 하는 일 | 보안적 의미 |
|----------|---------|-------------|
| `--policy` / `--policy-arns` | 이 세션의 권한 상한 축소 | 넓은 롤 하나를 여러 용도로 안전하게 재사용 |
| `--external-id` | 신뢰 정책의 `sts:ExternalId` 조건과 대조 | 서드파티 위임에서 confused deputy 차단 |
| `--tags` | 세션 태그 부여 → `aws:PrincipalTag/*` | ABAC의 속성 주입 경로 |
| `--transitive-tag-keys` | 롤 체이닝 시에도 태그 유지 | 다단 전환에서 속성이 사라지는 것 방지 |
| `--source-identity` | 원본 신원 기록(`aws:SourceIdentity`) | 롤을 갈아타도 **최초 사람**을 추적 |
| `--serial-number` / `--token-code` | MFA 제시 | `aws:MultiFactorAuthPresent` 참으로 만듦 |

> 💡 **관련 이론**: `--source-identity`가 세션 이름(`RoleSessionName`)과 다른 점은 **변조 가능성**이다. 세션 이름은 AssumeRole 호출자가 매번 자유롭게 지정할 수 있어 "누가 그 일을 했는지"의 증거로는 약하다. 반면 `sts:SourceIdentity`는 한 번 설정되면 **이후 롤 체이닝 전 과정에서 바뀌지 않고 따라붙으며**, 신뢰 정책에서 `sts:SetSourceIdentity` 권한을 요구하도록 강제할 수 있다. 여러 계정을 건너뛰며 롤을 갈아타는 환경에서 "결국 최초의 사람은 누구였나"를 잃지 않으려면 세션 이름이 아니라 이 키에 의존해야 한다.

> ⚠️ **함정**: **롤 체이닝(role chaining)** — 롤 A로 얻은 임시 자격증명으로 다시 롤 B를 AssumeRole하는 것 — 을 하면 **세션 최대 지속 시간이 1시간으로 잘린다.** 롤의 `MaxSessionDuration`을 12시간으로 늘려 놨더라도 체이닝 경로에서는 적용되지 않는다. "장시간 배치 잡이 정확히 1시간마다 죽는다"는 증상의 대표 원인이며, 해결은 자격증명 갱신 로직을 넣거나 체이닝을 없애는 것이다.

## AccessDenied를 진단하는 순서

시험 문항의 절반은 결국 "왜 막혔는가"다. 실무에서도 마찬가지이므로, 층을 좁혀 가는 **고정된 절차**를 손에 익혀야 한다. 무작정 정책을 넓히는 것이 아니라, 어느 층이 범인인지 먼저 특정한다.

```
[ AccessDenied 진단 순서 — 위에서부터 배제해 나간다 ]

① 오류 메시지 원문을 먼저 읽는다
   "with an explicit deny in a service control policy"   → SCP 확정
   "with an explicit deny in an identity-based policy"   → IAM 정책 Deny
   "with an explicit deny in a resource-based policy"    → 버킷/키 정책 Deny
   "with an explicit deny in a permissions boundary"     → 권한 경계
   "with an explicit deny in a VPC endpoint policy"      → 엔드포인트 정책
   메시지에 explicit이 없다  → 묵시적 거부(아무도 Allow 안 함)
        │
        ▼
② CloudTrail에서 그 이벤트를 찾는다
   errorCode / errorMessage / userIdentity.arn / sourceIPAddress
   awsRegion / requestParameters / resources
        │
        ▼
③ 프린시펄 신원을 정확히 확정한다
   aws sts get-caller-identity
   ← 여기서 "내가 생각한 그 롤이 아니었다"가 자주 드러난다
        │
        ▼
④ 정책 시뮬레이터로 IAM·Boundary 층을 검증한다
   aws iam simulate-principal-policy ...
        │
        ▼
⑤ 시뮬레이터가 Allow인데도 막힌다 → SCP · 리소스 정책 · VPCE 정책 의심
   (시뮬레이터는 SCP를 평가하지 않는다)
        │
        ▼
⑥ 교차 계정이면 양쪽을 각각 확인한다
   호출자 계정 IAM  /  리소스 계정 리소스 정책
```

시뮬레이터는 정책을 실제로 실행하지 않고 평가만 하므로, 프로덕션에서도 안전하게 돌릴 수 있는 진단 도구다.

```bash
# 특정 롤이 특정 객체를 읽을 수 있는지 계산 (실제 호출은 하지 않는다)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/DevRole \
  --action-names s3:GetObject s3:PutObject \
  --resource-arns arn:aws:s3:::prod-logs/2026/07/app.log \
  --context-entries \
      ContextKeyName=aws:PrincipalTag/Team,ContextKeyType=string,ContextKeyValues=payments \
      ContextKeyName=aws:SecureTransport,ContextKeyType=boolean,ContextKeyValues=true

# 권한 경계를 함께 얹어 시뮬레이션 (경계가 범인인지 확인)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/DevRole \
  --action-names iam:CreateRole \
  --resource-arns "*" \
  --permissions-boundary-policy-input-list file://dev-boundary.json

# 아직 배포하지 않은 정책 초안을 미리 검증
aws iam simulate-custom-policy \
  --policy-input-list file://draft-policy.json \
  --action-names s3:DeleteObject \
  --resource-arns "arn:aws:s3:::prod-logs/*"
```

응답의 `EvalDecision` 값이 진단의 핵심이다.

| `EvalDecision` | 의미 | 다음 행동 |
|----------------|------|-----------|
| `allowed` | IAM 층에서는 통과 | 그래도 막힌다면 SCP·리소스 정책·VPCE 정책을 본다 |
| `explicitDeny` | 어떤 Statement가 명시적으로 Deny | `MatchedStatements`에서 범인 문장을 특정 |
| `implicitDeny` | 아무도 Allow하지 않음 | 권한 자체가 없다 — 정책을 추가해야 한다 |

> ⚠️ **함정**: **IAM 정책 시뮬레이터는 SCP를 평가하지 않는다.** 그래서 "시뮬레이터는 allowed라는데 실제로는 AccessDenied"라는 상황이 조직 환경에서 흔하다. 이때 정답은 IAM 정책을 더 넓히는 것이 아니라 **SCP를 확인하는 것**이다. 마찬가지로 시뮬레이터는 리소스 기반 정책의 모든 뉘앙스나 VPC 엔드포인트 정책을 완전히 반영하지 못하므로, "시뮬레이터 = 최종 판정"으로 믿으면 안 된다. 시뮬레이터는 *IAM·경계 층을 배제하기 위한 도구*로 쓴다.

정책을 **쓰기 전에** 막는 도구도 함께 알아 둔다. IAM Access Analyzer는 정책 문법·과대 권한을 검증하고, 외부 접근이 가능한 리소스를 찾아내며, 실제로 쓰이지 않는 권한을 알려 준다.

```bash
# 정책 문법·보안 경고 검증 (배포 전 게이트로 CI에 넣기 좋다)
aws accessanalyzer validate-policy \
  --policy-document file://new-policy.json \
  --policy-type IDENTITY_POLICY

# "새 정책이 기존보다 권한을 넓히지 않는가" 비교 검사
aws accessanalyzer check-no-new-access \
  --existing-policy-document file://current.json \
  --new-policy-document file://proposed.json \
  --policy-type IDENTITY_POLICY

# "이 정책이 금지 액션에 접근을 주지 않는가" 검사
aws accessanalyzer check-access-not-granted \
  --policy-document file://new-policy.json \
  --access actions=s3:DeleteBucket,iam:CreateAccessKey \
  --policy-type IDENTITY_POLICY
```

> 💡 **관련 이론**: 이 흐름은 보안 공학에서 **shift-left**라 부르는 접근이다. 잘못된 정책을 배포한 뒤 CloudTrail로 탐지하는 것보다, 배포 전에 정책 문서를 정적 분석해 막는 편이 훨씬 싸다. `check-no-new-access`는 특히 강력한데, "이번 변경이 권한을 넓히는가"라는 **차분(delta) 검사**이기 때문이다. 절대적 안전성을 증명하기는 어려워도 "적어도 더 나빠지지 않았다"는 불변식은 자동으로 강제할 수 있다. 시험에서 "정책 변경이 의도치 않게 권한을 확대하는 것을 배포 전에 막고 싶다"가 나오면 Access Analyzer의 custom policy check가 정답 방향이다.

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

### 연산자를 고르는 기준

조건 연산자를 잘못 고르면 정책이 의도와 정반대로 동작한다. 시험에서 반복해 나오는 구분만 추린다.

| 연산자 | 하는 일 | 대표 함정 |
|--------|---------|-----------|
| `StringEquals` | 대소문자 구분 **완전 일치** | 값이 하나라도 다르면 Statement 무시 |
| `StringLike` | `*`·`?` 와일드카드 허용 | 범위가 의도보다 넓어지기 쉬움 |
| `StringNotEquals` | 불일치일 때 참 | **Deny와 결합할 때만 안전하다**(아래 함정 참고) |
| `ArnLike` / `ArnNotLike` | ARN 구조를 이해하는 비교 | 계정·리전 자리에 `*`를 무심코 넣는 실수 |
| `...IfExists` | 키가 **있을 때만** 비교, 없으면 통과 | 없을 때 통과시키므로 Deny에 쓰면 구멍이 생길 수 있음 |
| `Null` | 키의 **존재 여부** 자체를 검사 | "키가 반드시 있어야 한다"를 강제하는 유일한 수단 |
| `ForAllValues:` | 요청의 **모든** 값이 목록 안에 있어야 참 | 값이 하나도 없으면 참이 되어 버림 |
| `ForAnyValue:` | 요청 값 중 **하나라도** 목록에 있으면 참 | 화이트리스트 용도로 쓰면 뚫린다 |
| `Bool` | true/false | 키 부재 시 의도와 어긋남 → `BoolIfExists` |

> ⚠️ **함정**: `ForAllValues:`를 화이트리스트로 쓰는 것은 자주 보는 실수다. 이 연산자는 "요청에 들어온 값이 전부 허용 목록 안에 있는가"를 검사하는데, **요청에 그 키가 아예 없으면 '모든 값이 만족'으로 판정되어 참**이 된다. 즉 태그를 하나도 붙이지 않고 요청하면 조건이 통과한다. "반드시 태그가 있어야 한다"까지 강제하려면 `Null` 연산자로 키 존재를 별도 요구하거나, 요구 태그를 `StringEquals`로 직접 못 박아야 한다. 반대로 `ForAnyValue:`는 "하나라도 맞으면 통과"라 금지 목록(Deny) 쪽에 어울린다.

`Null` 연산자는 "값이 무엇인지"가 아니라 "키가 있는지"를 묻기 때문에, 다른 연산자로는 표현할 수 없는 통제를 만든다.

```json
{
  "Sid": "DenyResourceCreationWithoutOwnerTag",
  "Effect": "Deny",
  "Action": ["ec2:RunInstances", "rds:CreateDBInstance"],
  "Resource": "*",
  "Condition": {
    "Null": { "aws:RequestTag/Owner": "true" }
  }
}
```

`"aws:RequestTag/Owner": "true"`는 "이 키가 **없으면** 참"이라는 뜻이므로, 전체 문장은 "Owner 태그 없이 리소스를 만들면 거부"가 된다. 비용 귀속·소유자 추적을 조직 차원에서 강제할 때 쓰는 전형적 패턴이다.

조건을 Deny와 결합할 때는 방향을 특히 조심해야 한다. 다음 두 문장은 겉보기에 비슷하지만 완전히 다르다.

```json
// ⓐ "MFA가 없으면 거부" — 의도대로 동작한다
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
}
```

```json
// ⓑ "MFA가 있을 때만 허용" — 다른 Allow가 있으면 무력하다
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*",
  "Condition": { "Bool": { "aws:MultiFactorAuthPresent": "true" } }
}
```

ⓐ는 **다른 어떤 정책이 Allow하든 상관없이** MFA 없는 세션을 잘라 낸다. ⓑ는 단지 "이 문장으로는 MFA가 있을 때만 허용한다"일 뿐이라, 다른 곳에 MFA 조건 없는 Allow가 하나라도 있으면 그쪽으로 통과한다. **가드레일은 언제나 Deny로 쓴다** — 이것이 day3의 SCP 설계 원칙으로 그대로 이어진다.

> ⚠️ **함정**: `StringNotEquals`를 **Allow와 결합**하면 거의 항상 의도와 다르게 동작한다. "우리 조직이 아닌 곳은 Allow하지 않는다"는 생각으로 `Allow` + `StringNotEquals`를 쓰면, 그 문장이 허용하지 않을 뿐 *금지하지는 않는다.* 다른 Allow가 있으면 그대로 통과한다. 부정 조건은 `Deny` + `StringNotEquals`("허용 목록에 없으면 거부") 형태로 써야 통제가 성립한다. day3에서 볼 리전 제한 SCP가 정확히 이 형태다.

> 🎯 **시나리오**: "S3 버킷에 대해 (1) 암호화되지 않은 HTTP 요청을 금지하고, (2) 우리 조직 밖 프린시펄의 접근을 금지하고, (3) KMS 암호화 없이 업로드하는 것을 금지하라." → 세 요구가 전부 **금지**이므로 버킷 정책에 Deny 문장 세 개를 쓴다. `aws:SecureTransport`가 `false`일 때 Deny, `aws:PrincipalOrgID`가 우리 조직과 다를 때 Deny, `s3:x-amz-server-side-encryption`이 요구값이 아닐 때 Deny. Allow로 표현하려 들면 "다른 Allow가 있으면 뚫린다"는 구멍이 남는다. 요구 문장이 "~하지 못하게 하라"면 답은 언제나 Deny 쪽에 있다.

## 정리하며

IAM 평가 로직은 외우는 것이 아니라 **흐름도를 손으로 그릴 수 있어야** 한다. 시험장에서 "이 요청 허용될까?"가 나오면 머릿속에서 (1) explicit deny 검색 → (2) SCP → (3) resource → (4) identity → (5) boundary → (6) session 순서로 6칸을 차례로 통과시켜라. 단 하나라도 막히면 Deny다. 그리고 가드레일은 권한을 주지 않고 깎기만 한다는 것, 크로스 계정은 양쪽 AND라는 것, KMS는 키 정책이 위임을 명시해야 한다는 것 — 이 세 가지가 day1의 핵심이다.

> 📚 **사례**: 2019년 공개된 Capital One 침해는 IAM 평가 로직이 왜 실무의 중심인지 보여 주는 사건이다. 공격자는 잘못 구성된 WAF(리버스 프록시)를 통해 SSRF로 EC2 인스턴스 메타데이터에 접근해 그 인스턴스 역할의 임시 자격증명을 얻었고, 그 자격증명으로 S3 버킷 목록을 조회한 뒤 데이터를 내려받았다. 미국·캐나다 신용카드 신청자 약 1억 명 규모의 정보가 영향을 받았다. 이 사건에서 뚫린 것은 암호화도, 네트워크 방화벽도 아니었다. **그 롤이 애초에 그 버킷을 읽을 권한을 갖고 있었다는 사실** 하나였다. 오늘 배운 층들이 이 빈틈을 정확히 겨눈다 — 권한 경계로 인스턴스 롤의 천장을 낮추고, 버킷 정책에 `aws:PrincipalOrgID`·`aws:SourceVpce` 조건을 걸어 경로를 좁히고, SCP로 계정 차원의 상한을 두고, `ListBucket` 급증을 CloudTrail로 탐지한다. 시험에서 "자격증명이 탈취된 뒤의 피해를 줄이려면"이라는 문항의 답은 언제나 *탈취를 막는 것*이 아니라 *탈취된 자격증명이 할 수 있는 일의 범위를 좁히는 것*이다.

> 📚 **사례**: 실무에서 훨씬 흔한 사고는 침해가 아니라 **자해**다. 리전 제한 SCP를 배포하면서 IAM·STS를 `NotAction` 예외에 넣지 않아 조직 전체가 콘솔 로그인조차 못 하게 되는 사고, 권한 경계를 붙이면서 CI/CD 배포 롤을 예외 처리하지 않아 파이프라인이 전부 멈추는 사고는 어느 조직에서나 한 번씩 겪는다. 두 사고의 공통 원인은 같다 — **정책을 배포하기 전에 "이 변경으로 무엇이 막히는가"를 계산하지 않았다는 것.** 그래서 오늘 배운 진단 절차는 사고 후 도구가 아니라 배포 전 도구다. `simulate-principal-policy`로 대표 프린시펄 몇 개를 미리 돌려 보고, `check-no-new-access`로 권한 확대 여부를 게이트로 걸고, SCP는 좁은 OU에 먼저 붙여 관찰한 뒤 위로 올린다.

## 한 줄 요약

IAM 평가는 여섯 층(SCP/RCP · 리소스 정책 · Identity · 권한 경계 · 세션 정책 · 조건)의 **교집합**이며, 어느 층이든 명시적 Deny 하나면 전역 종료다. 가드레일 층은 권한을 만들지 못하고 깎기만 하므로 `AdministratorAccess`도 상한을 넘지 못한다. 같은 계정 안에서는 Identity 또는 리소스 정책 하나만 Allow해도 되지만 **교차 계정은 양쪽 모두 Allow**해야 하고, KMS는 키 정책이 IAM에 위임을 명시하지 않으면 IAM만으로 못 쓴다. SCP는 관리 계정과 서비스 연결 롤에 적용되지 않고 멤버 계정 root에는 적용된다. 조건은 키가 없으면 불일치로 처리되므로 `...IfExists`·`Null`의 차이를 알아야 하고, 금지 요구는 반드시 `Deny`로 표현해야 다른 Allow에 뚫리지 않는다. 막혔을 때는 오류 메시지 → CloudTrail → `get-caller-identity` → `simulate-principal-policy` 순으로 층을 좁히되, **시뮬레이터가 SCP를 평가하지 않는다**는 한계를 기억한다.

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
