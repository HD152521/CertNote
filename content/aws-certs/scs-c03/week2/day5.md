# Day 5 - Week 2 종합: 멀티계정 IAM 거버넌스 시나리오 통합

Week 2의 네 날을 통과하며 우리는 IAM의 네 기둥을 세웠다. day1의 **정책 평가 로직**(여섯 층의 교집합과 explicit deny 우선), day2의 **Permission Boundary**(개인 권한의 천장과 안전한 위임), day3의 **SCP**(계정 전체의 가드레일), day4의 **페더레이션·ABAC**(임시 자격증명과 태그 기반 확장). 오늘은 이 넷이 따로 노는 지식이 아니라 **하나의 거버넌스 기계**로 맞물리는 모습을 본다.

Specialty 시험의 진짜 난이도는 "SCP가 뭐냐"가 아니라 "SCP·Boundary·IAM·Resource 정책이 동시에 걸린 환경에서 이 요청이 왜 막혔는가"를 추적하는 데 있다. 오늘은 통합 시나리오로 그 추적 근육을 단련한다.

## 네 기둥을 한 장의 그림으로

한 직원이 멀티 계정 환경에서 S3 객체 하나를 읽으려 할 때, 그 요청은 다음 관문을 모두 통과해야 한다.

```
[직원] alice — IdP에서 SAML 로그인 (day4)
   │  PrincipalTag: Team=payments 전달
   ▼
[STS] AssumeRoleWithSAML → 임시 자격증명 발급 (day4)
   │  Session Policy로 세션 권한 추가 축소 가능
   ▼
┌──────────── 평가 엔진 (day1) ────────────┐
│ 0. Explicit Deny 어디든 있나? → 있으면 끝   │
│ 1. SCP가 허용? (계정 가드레일, day3)        │
│ 2. Resource Policy(버킷 정책)가 허용?       │
│ 3. Identity Policy(Permission Set)가 허용?  │
│ 4. Permission Boundary가 허용? (day2)       │
│ 5. Session Policy가 허용? (day4)            │
│ 6. ABAC 조건: 태그 일치? (day4)             │
└─────────────────────────────────────────┘
   │ 모두 통과(교집합) → ✅ 접근 허용
   ▼
[S3 객체 읽기 성공]
```

이 그림이 Week 2의 전부다. 어느 한 층이라도 막으면 Deny다. 시험 문제는 본질적으로 "이 그림의 어느 층이 범인인가?"를 묻는다.

> 💡 **관련 이론**: 이 다층 구조는 보안 공학의 **심층 방어(defense in depth)**의 교과서적 구현이다. 단일 통제점이 아니라 여러 독립적 통제 계층을 두어, 한 층이 실수로 열려도 다른 층이 막는다. 동시에 모든 층이 **default-deny**이고 **교집합**으로 결합되므로, 권한은 의도적으로 부여한 만큼만 정확히 흐른다. AWS IAM은 이 두 원칙(심층 방어 + 최소 권한)을 정책 평가 알고리즘 자체에 박아 넣었다.

## 유효 권한 계산 워크시트

시험장에서 필요한 것은 개념이 아니라 **계산 절차**다. 정책 조각 여러 개가 주어졌을 때 다음 표를 머릿속에 그리고 한 칸씩 채운다.

```
[ 유효 권한 계산 워크시트 — 액션 하나씩 채운다 ]

 대상 액션: s3:DeleteObject   프린시펄: AWSReservedSSO_Dev_xxxx / alice

 ┌────────────────────┬────────┬──────────────────────────────┐
 │ 층                 │ 판정   │ 근거                          │
 ├────────────────────┼────────┼──────────────────────────────┤
 │ ⓪ 어디든 Deny?     │  없음  │ 있으면 즉시 종료               │
 │ ① SCP (경로 전체)  │ Allow  │ Root·OU·계정 모두 통과해야     │
 │ ② 리소스 정책      │  무언  │ 없음 = 같은 계정이면 문제없음  │
 │ ③ Identity 정책    │ Allow  │ Permission Set 내용            │
 │ ④ 권한 경계        │  ✗     │ 경계에 s3:Delete* 가 없다      │
 │ ⑤ 세션 정책        │  해당X │ 전달 안 됨                     │
 │ ⑥ 조건             │  해당X │                               │
 └────────────────────┴────────┴──────────────────────────────┘

  판정: ④에서 탈락 → ❌ DENY
  오답 유도: "Permission Set에 s3:* 가 있으니 가능하다"
```

이 워크시트를 쓸 때 지켜야 할 규칙이 세 가지다.

1. **⓪을 먼저 훑는다.** Deny를 찾으면 나머지 칸은 채울 필요가 없다.
2. **빈칸(정책 없음)은 층마다 의미가 다르다.** SCP가 없으면 통과(FullAWSAccess), 리소스 정책이 없으면 같은 계정에서는 무해하지만 교차 계정에서는 **탈락**, 권한 경계가 없으면 통과, 세션 정책이 없으면 통과다. "정책이 없다 = 통과"가 항상 참은 아니다.
3. **조건은 마지막에, 그러나 모든 층에 대해** 검사한다. 어느 층의 문장이든 조건이 어긋나면 그 문장은 없는 셈이 된다.

| 층 | 정책이 **없을 때** | 정책이 있는데 그 액션이 **없을 때** |
|----|--------------------|--------------------------------------|
| SCP | 통과 (`FullAWSAccess` 기본) | 탈락 (Allow 리스트 전략일 때) |
| 리소스 정책 | 같은 계정: 무해 / **교차 계정: 탈락** | 같은 계정: 무해 / 교차 계정: 탈락 |
| Identity 정책 | **탈락** (권한의 원천이 없음) | 탈락 |
| 권한 경계 | 통과 (경계 미부착) | **탈락** |
| 세션 정책 | 통과 (전달 안 됨) | **탈락** |

> ⚠️ **함정**: 시험 문항이 "Permission Boundary가 부착되어 있다"고 명시하지 않았다면 경계는 계산에서 빼야 한다. 반대로 "이 롤에는 경계가 붙어 있다"는 한 줄이 지문에 있으면 그것이 정답의 열쇠일 가능성이 매우 높다. **지문에 굳이 언급된 층은 대개 범인이다** — 출제자가 불필요한 정보를 넣는 경우는 드물다.

## 통합 시나리오 1: "관리자인데 왜 막히는가" 추적

> 한 회사가 Organizations로 50개 계정을 운영한다. prod 계정의 한 사용자에게 `AdministratorAccess` Permission Set이 할당되어 있다. 그런데 이 사용자가 `eu-west-1`에서 EC2를 시작하려 하자 거부된다. CloudTrail에는 `explicitDeny`로 기록되어 있다.

추적 순서(day1의 평가 흐름 역추적):

1. **Explicit Deny 검색** → CloudTrail이 `explicitDeny`라 했으니 명시적 Deny가 어딘가 있다.
2. **출처 후보**: AdministratorAccess(Identity)는 Allow다. 그렇다면 Deny는 SCP, Boundary, 또는 Resource 정책에서 온다.
3. **단서**: `eu-west-1`이라는 리전 + EC2. day3에서 본 **리전 제한 SCP**가 가장 유력하다.
4. **결론**: prod OU에 "허용 리전 외 Deny" SCP가 걸려 있다. AdministratorAccess조차 SCP를 못 뚫는다.

핵심 교훈: **AdministratorAccess는 Identity 정책일 뿐, SCP·Boundary·Resource 정책의 천장을 못 넘는다.** "관리자인데 막힌다"는 거의 항상 상위 가드레일 또는 explicit deny다.

> ⚠️ **함정**: 이런 문제에서 "IAM 정책을 더 넓게 주면 된다"를 고르면 틀린다. SCP Deny는 IAM Allow로 풀 수 없다. 정답은 "SCP를 수정하거나, 허용 리전에서 작업하라"이다.

## 통합 시나리오 2: 안전한 개발자 위임 + 조직 가드레일

> 보안팀이 dev 계정의 개발자들에게 직접 Lambda 실행 롤을 만들게 하되, (1) 권한 상승을 막고, (2) 조직 차원에서 특정 리전만 쓰게 하고, (3) 팀별로 리소스를 격리하려 한다. 어떻게 설계하는가?

네 기둥을 모두 동원한 통합 설계:

```
[SCP — day3] dev OU에 적용
  - 허용 리전 외 Deny (글로벌 서비스는 NotAction 예외)
  - cloudtrail:StopLogging Deny
  - iam:CreateUser Deny (Identity Center 강제)

[Permission Boundary — day2] 개발자가 만드는 롤에 강제
  - 허용 서비스 상한: s3, dynamodb, lambda, logs
  - iam:*, ec2:* 제외 → 권한 상승 차단

[Identity Policy — day2] 개발자에게 부착
  - iam:CreateRole 허용, 단 Condition으로 Boundary 부착 강제
  - Resource를 role/dev-* 로 제한 (네임스페이스 격리)
  - iam:DeleteRolePermissionsBoundary Deny

[ABAC — day4] 팀 격리
  - PrincipalTag/Team == ResourceTag/Team 조건
  - RequestTag로 생성 시 팀 태그 강제
```

이 네 층이 동시에 작동할 때, 개발자는 (1) 자기 권한을 넘는 롤을 못 만들고, (2) 지정 리전 밖에서 작업 못 하고, (3) 다른 팀 리소스를 못 건드린다. **어느 한 층만으로는 불완전하다** — SCP만 있으면 권한 상승을 못 막고, Boundary만 있으면 리전·팀 격리가 안 된다.

> 🔍 **더 깊이**: 이 설계가 바로 AWS Control Tower가 자동화하는 것의 본질이다. Control Tower는 OU별 SCP 가드레일을 매니지드로 제공하고, Account Factory로 새 계정 생성 시 표준 Boundary와 Identity Center 매핑을 자동 적용한다. 시험에서 "운영 부담을 최소화하면서 멀티 계정 가드레일을 표준화하라"가 나오면 Control Tower가 정답인 경우가 많다. 직접 SCP·Boundary를 손으로 거는 것은 운영 부담이 크기 때문이다.

## 통합 시나리오 3: 크로스 계정 데이터 접근

> Audit 계정의 보안팀이 모든 prod 계정의 S3 로그 버킷을 읽어야 한다. 어떻게 안전하게 권한을 부여하는가?

day1의 크로스 계정 규칙(양쪽 AND) + day4의 AssumeRole이 결합한다.

```
방법 A — AssumeRole 패턴:
  각 prod 계정에 "AuditReadRole" 생성
  → 신뢰 정책: Audit 계정의 보안팀 롤만 AssumeRole 허용
  → 권한 정책: s3:GetObject (로그 버킷만)
  보안팀이 sts:AssumeRole로 각 계정의 롤로 전환

방법 B — Resource Policy 패턴:
  각 prod 계정의 버킷 정책에 Audit 계정 Principal 허용
  + Audit 계정의 IAM 정책도 그 버킷 허용 (양쪽 AND, day1)
```

방법 A(AssumeRole)가 일반적으로 선호된다. 이유: 임시 자격증명을 쓰고, CloudTrail에 AssumeRole 추적이 남으며, 신뢰 정책에 `ExternalId`나 MFA 조건을 걸어 confused deputy 문제를 막을 수 있다.

> 💡 **관련 이론**: **confused deputy problem**은 1988년 Norm Hardy가 명명한 보안 취약점으로, 권한 있는 주체(deputy)가 권한 없는 제3자에게 속아 그 권한을 대신 행사하는 문제다. AWS 크로스 계정에서 `sts:ExternalId`는 이 문제의 표준 해법이다. 서드파티 SaaS에 롤 접근을 줄 때, 추측 불가능한 ExternalId를 신뢰 정책 조건에 넣으면, 그 ID를 모르는 다른 고객이 같은 롤을 전환하지 못한다.

## 통합 시나리오 4: 데이터 반출을 양방향으로 막기

> 규제 감사에서 "우리 데이터가 조직 밖으로 나갈 수 있는 경로를 전부 통제하고 있는가"라는 질문을 받았다. 어떤 층에 무엇을 걸어야 하는가?

이 질문이 어려운 이유는 **경로가 두 방향**이기 때문이다. day1에서 본 `aws:PrincipalOrgID`와 `aws:ResourceOrgID`의 구분이 여기서 실전 설계가 된다.

```
[ 데이터 반출의 두 방향과 각각의 통제 지점 ]

── 방향 A: 밖에서 안으로 (외부 주체가 우리 리소스를 읽음) ──
   외부 계정 ──GetObject──▶ 우리 S3 버킷
     통제: 버킷 정책의 Deny + aws:PrincipalOrgID 조건
           RCP (조직 차원 일괄, 지원 서비스 한정)
           S3 Block Public Access
     ※ SCP는 이 방향을 막지 못한다 (외부 프린시펄이므로)

── 방향 B: 안에서 밖으로 (우리 직원이 외부로 복사) ──
   우리 롤 ──PutObject──▶ 외부 계정 S3 버킷
     통제: SCP의 Deny + aws:ResourceOrgID 조건
           VPC 엔드포인트 정책 (경로 자체를 좁힘)
     ※ 버킷 정책은 이 방향을 막지 못한다 (남의 버킷이므로)

── 방향 C: 네트워크 우회 (엔드포인트를 안 쓰고 인터넷으로) ──
     통제: 라우팅·보안 그룹, 그리고
           버킷 정책의 aws:SourceVpce 조건으로 경로 강제
```

세 방향에 대응하는 정책 문장을 실물로 보면 이렇다.

```json
// [방향 A] 버킷 정책 — 조직 밖 프린시펄 차단
{
  "Sid": "DenyAccessFromOutsideOrg",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::sensitive-data", "arn:aws:s3:::sensitive-data/*"],
  "Condition": {
    "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
    "Bool": { "aws:PrincipalIsAWSService": "false" }
  }
}
```

```json
// [방향 B] SCP — 우리 프린시펄이 조직 밖 리소스로 데이터를 보내는 것 차단
{
  "Sid": "DenyWritingToForeignBuckets",
  "Effect": "Deny",
  "Action": ["s3:PutObject", "s3:PutObjectAcl"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:ResourceOrgID": "${aws:PrincipalOrgID}" }
  }
}
```

```json
// [방향 C] 버킷 정책 — 지정한 VPC 엔드포인트 경유만 허용
{
  "Sid": "RequireVpcEndpointPath",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::sensitive-data/*",
  "Condition": {
    "StringNotEquals": { "aws:SourceVpce": "vpce-0abc123def456789a" }
  }
}
```

> ⚠️ **함정**: 방향 A의 정책에서 `aws:PrincipalIsAWSService` 예외를 빠뜨리면, **AWS 서비스가 우리 대신 버킷에 쓰는 정상 흐름까지 끊긴다.** CloudTrail이 로그 버킷에 쓰거나, Config·ELB가 로그를 배달하는 경로가 대표적이다. 이런 서비스 호출은 조직 ID 컨텍스트를 갖지 않을 수 있어 `StringNotEquals`에 걸린다. "조직 밖 차단 정책을 걸었더니 로그가 안 쌓인다"는 증상의 원인이 이것이며, 실무 정책에는 서비스 프린시펄 예외가 거의 항상 함께 들어간다.

> 🎯 **시나리오**: "보안팀이 방향 B의 SCP를 배포하려 한다. 배포 전에 반드시 확인해야 할 것은?" → **정상적인 교차 조직 데이터 전달이 있는지**다. 파트너사 버킷으로 정산 파일을 보내는 배치, 서드파티 백업 서비스로의 업로드, 오픈소스 아티팩트 게시 같은 흐름이 조직 밖 리소스를 대상으로 한다. day3의 롤아웃 절차대로 CloudTrail에서 `PutObject`의 대상 버킷 계정을 집계해 조직 밖 대상이 있는지 먼저 확인하고, 있다면 그 대상만 예외로 허용하는 문장을 함께 넣어야 한다. **가드레일 배포에서 가장 흔한 실패는 정책이 틀린 것이 아니라 예외를 조사하지 않은 것이다.**

## 통합 시나리오 5: 자격증명 탈취 대응

> GuardDuty가 "평소와 다른 지역에서 EC2 인스턴스 역할의 자격증명이 사용됨"을 알렸다. Week 2의 도구로 무엇을 할 수 있는가?

이 시나리오가 Week 2의 마지막 통합 훈련인 이유는, **예방 도구가 사고 대응에서 어떻게 쓰이는지**를 보여 주기 때문이다.

```
[ 탈취 대응 — 넓은 차단에서 좁은 조사로 ]

  즉시(분 단위)
   ① 해당 롤의 신뢰 정책을 비워 신규 전환 차단
      → 이미 발급된 세션은 유효하다는 점이 함정
   ② 이미 발급된 세션까지 무효화하려면
      → 롤에 "발급 시각 이전 세션 거부" 인라인 Deny를 붙인다
        (aws:TokenIssueTime 조건 활용)
      → 또는 롤의 권한 정책 자체를 비운다
   ③ 인스턴스 격리 — 보안 그룹 교체, 스냅샷 확보

  단기(시간 단위)
   ④ CloudTrail에서 그 세션(aws:userid / RoleSessionName)의
      전체 행적을 시계열로 추출
   ⑤ 권한 상승 시퀀스 탐색 — day2의 세 갈래
      CreateRole / AttachRolePolicy / CreatePolicyVersion
      UpdateAssumeRolePolicy / CreateAccessKey / PassRole+RunInstances
   ⑥ 새로 만들어진 신원·키를 전부 목록화하고 제거

  구조 개선(일 단위)
   ⑦ 그 롤에 권한 경계를 부착해 천장을 낮춘다        (day2)
   ⑧ SCP로 IMDSv2를 강제해 같은 경로를 봉쇄한다      (day3)
   ⑨ 버킷 정책에 aws:SourceVpce·PrincipalOrgID 추가  (day1)
   ⑩ 장기 키가 남아 있다면 페더레이션으로 전환       (day4)
```

②가 실무에서 가장 자주 놓치는 지점이다. **신뢰 정책을 고쳐도 이미 발급된 임시 자격증명은 만료까지 계속 유효하다.** 신뢰 정책은 "새로 전환하려는 시도"를 막을 뿐이기 때문이다. 그래서 즉시 차단이 필요하면 신뢰 정책이 아니라 **권한 쪽**을 건드려야 한다.

| 조치 | 이미 발급된 세션에 효과 | 새 전환 차단 | 되돌리기 |
|------|-------------------------|--------------|----------|
| 신뢰 정책 비우기 | **없음** | 있음 | 쉬움 |
| 권한 정책 제거·Deny 부착 | **있음(즉시)** | 실질적으로 있음 | 쉬움 |
| `aws:TokenIssueTime` 조건 Deny | 특정 시점 이전 세션만 무효화 | 신규는 정상 | 쉬움 |
| 롤 삭제 | 있음 | 있음 | **어려움(의존 워크로드 파손)** |
| SCP로 해당 계정 전체 차단 | 있음 | 있음 | 쉬움(광범위 영향) |

> 💡 **관련 이론**: 여기서 드러나는 것이 **취소(revocation)의 어려움**이라는 분산 인증의 고전적 문제다. 토큰 기반 시스템은 검증을 위해 발급자에게 매번 묻지 않아도 되기에 확장성이 좋지만, 그 대가로 "이미 나간 토큰을 회수할 수 없다"는 성질을 갖는다. AWS는 토큰 자체를 무효화하는 대신 *권한 쪽을 즉시 비우는* 우회로를 제공해 이 문제를 실무적으로 해결한다. 시험에서 "임시 자격증명이 유출됐다, 즉시 차단하려면"이 나오면 답은 "토큰 폐기"가 아니라 **정책 변경**이다.

> ⚠️ **함정**: 사고 대응에서 "롤을 삭제한다"를 고르면 대개 오답이다. 롤 삭제는 그 롤에 의존하는 정상 워크로드를 전부 죽이고, 조사에 필요한 구성 정보를 없애며, 되돌리기도 어렵다. 정답은 언제나 **가역적이고 즉시 효력이 있는 조치**(권한 정책 제거·Deny 부착) 쪽이다. 이 원칙은 KMS에서 "삭제가 아니라 disable"인 것과 정확히 같은 논리다.

## Week 2 핵심 요약표

| 도구 | 한 줄 정의 | 권한 부여? | 적용 범위 | 주 용도 |
|------|-----------|-----------|-----------|---------|
| Identity 정책 | 주체가 할 수 있는 것 | O | 개별 주체 | 기본 권한 부여 |
| Resource 정책 | 누가 이 리소스에 접근하나 | O | 리소스 | 크로스 계정 접근 |
| Permission Boundary | 주체 권한의 천장 | X | 개별 주체 | 위임 시 권한 상승 차단 |
| SCP | 계정 전체의 천장 | X | OU/계정 | 조직 가드레일 |
| Session Policy | 세션 단위 축소 | X | STS 세션 | 임시 권한 최소화 |
| 페더레이션 | 외부 ID로 임시 자격증명 | (롤 통해) | 사용자 | IAM 사용자 제거 |
| ABAC | 태그 일치 시 허용 | (정책 통해) | 동적 | 역할 폭발 방지 |

이 표의 "권한 부여?" 열이 시험의 핵심이다. **X 표시된 것들은 절대 권한을 만들지 못한다 — 오직 깎는다.** 이걸 헷갈리면 절반을 틀린다.

## 조건 키 치트시트

Week 2에서 나온 조건 키를 "무엇을 통제하는가"로 묶어 둔다. 시험에서 요구 문장을 읽고 바로 키를 떠올릴 수 있어야 한다.

| 요구 문장 | 조건 키 | 주의점 |
|-----------|---------|--------|
| "우리 조직 계정만 접근" | `aws:PrincipalOrgID` | 서비스 프린시펄 예외 필요할 수 있음 |
| "조직 밖 리소스로 반출 금지" | `aws:ResourceOrgID` | 방향이 반대. `Principal`과 혼동 금물 |
| "특정 OU 하위만" | `aws:PrincipalOrgPaths` | 경로 문자열 형식 주의 |
| "승인된 리전에서만" | `aws:RequestedRegion` | 글로벌 서비스 `NotAction` 예외 필수 |
| "MFA 없으면 금지" | `aws:MultiFactorAuthPresent` | 키 부재 대비해 `BoolIfExists` |
| "MFA 인증 후 N초 이내만" | `aws:MultiFactorAuthAge` | 민감 작업에 재인증 강제 |
| "HTTPS만" | `aws:SecureTransport` | 버킷 정책의 기본 문장 |
| "사무실 IP에서만" | `aws:SourceIp` | VPC 엔드포인트 경유 시 안 맞음 |
| "이 VPC 엔드포인트 경유만" | `aws:SourceVpce` / `aws:SourceVpc` | 경로 강제의 핵심 |
| "생성 시 태그 강제" | `aws:RequestTag/*` + `Null` | `ForAllValues`만으로는 강제 안 됨 |
| "태그가 일치할 때만"(ABAC) | `aws:ResourceTag/*` = `${aws:PrincipalTag/*}` | 태그 변경 권한을 반드시 잠글 것 |
| "이 경계가 붙어야 생성 허용" | `iam:PermissionsBoundary` | 제거·교체 Deny와 한 쌍 |
| "이 서비스에만 롤 전달 허용" | `iam:PassedToService` | 리소스 제한과 함께 |
| "서드파티 위임" | `sts:ExternalId` | 추측 불가능한 값 |
| "AWS 서비스의 대리 호출 제한" | `aws:SourceArn` / `aws:SourceAccount` | 서비스 프린시펄용. ExternalId와 구분 |
| "이 시점 이전 세션 무효화" | `aws:TokenIssueTime` | 사고 대응에서 사용 |
| "IdP가 AWS에 보낸 Assertion만" | `SAML:aud` | 재사용 공격 차단 |
| "이 레포·환경의 워크플로우만" | `<issuer>:sub` + `:aud` | 와일드카드 금지 |

## 진단 CLI 한 묶음

막혔을 때 순서대로 두드릴 명령들이다. 전부 읽기 전용이라 프로덕션에서도 안전하다.

```bash
# 1) 내가 정말 그 주체인가
aws sts get-caller-identity

# 2) 그 롤에 경계가 붙어 있나 (day2)
aws iam get-role --role-name DevRole --query 'Role.PermissionsBoundary'

# 3) IAM·경계 층에서 통과하는가 (day1)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/DevRole \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::prod-logs/x.log

# 4) 시뮬레이터가 allowed인데 막힌다 → SCP 경로 추적 (day3)
aws organizations list-parents --child-id 111122223333
aws organizations list-policies-for-target \
  --target-id ou-abcd-11111111 --filter SERVICE_CONTROL_POLICY
aws organizations describe-policy --policy-id p-examplepolicyid

# 5) 리소스 쪽이 열려 있나 (교차 계정이면 필수)
aws s3api get-bucket-policy --bucket b-logs
aws kms get-key-policy --key-id alias/app --policy-name default

# 6) 페더레이션 신뢰 관계 확인 (day4)
aws iam get-role --role-name AuditReadRole --query 'Role.AssumeRolePolicyDocument'
aws sso-admin list-account-assignments \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --account-id 444455556666 \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-...

# 7) 정책을 고치기 전에 권한 확대 여부를 검증
aws accessanalyzer check-no-new-access \
  --existing-policy-document file://current.json \
  --new-policy-document file://proposed.json \
  --policy-type IDENTITY_POLICY
```

## 오답 패턴: 이 보기가 보이면 의심하라

Week 2 범위에서 반복적으로 등장하는 함정 보기들이다. 정답을 고르는 것만큼 오답을 빨리 지우는 것이 시간 관리에 결정적이다.

| 보기 표현 | 왜 오답인가 |
|-----------|-------------|
| "IAM 정책을 더 넓게 부여한다" | SCP·경계·리소스 정책이 막는 상황은 IAM으로 못 푼다 |
| "SCP로 권한을 부여한다" | SCP는 권한을 만들지 못한다 |
| "하위 계정 SCP로 상위 OU 제한을 해제한다" | 상속은 좁아지기만 한다 |
| "관리 계정에 SCP를 적용한다" | 관리 계정에는 적용되지 않는다 |
| "IAM 사용자를 만들고 access key를 공유한다" | 장기 자격증명. 현대 설계에서 거의 항상 오답 |
| "버킷을 퍼블릭으로 만든다" | 어떤 문항에서도 정답이 아니다 |
| "CloudTrail로 모니터링한다"(예방이 요구될 때) | 탐지는 차단이 아니다. 요구가 "막아라"면 오답 |
| "롤을 삭제한다"(사고 대응) | 비가역적이고 정상 워크로드를 파괴한다 |
| "Config Rule로 차단한다" | Config는 탐지·평가이지 예방이 아니다 |
| "권한 경계로 권한을 부여한다" | 경계는 천장일 뿐이다 |
| "각 계정에 수동으로 설정을 배포한다" | "운영 부담 최소화" 요구와 정면 충돌 |
| "`iam:PassRole`을 `Resource: *`로 준다" | 사실상 관리자 권한 부여 |
| "`GetFederationToken`을 쓴다" | IAM 사용자 전제. 페더레이션 문항에서는 대개 오답 |

> 🎯 **시나리오**: "규제 감사에서 '누가 언제 어떤 프로덕션 데이터에 접근했는지 개인 단위로 증명하라'는 요구를 받았다. 현재는 팀 공용 IAM 사용자 한 개를 여러 명이 공유한다. 무엇을 바꿔야 하는가?" → 공용 IAM 사용자는 **개인 귀속이 원천적으로 불가능**하다는 것이 핵심이다. CloudTrail을 아무리 정교하게 파도 그 사용자 뒤에 누가 있었는지는 나오지 않는다. 답은 로깅 강화가 아니라 **신원 구조의 변경**이다 — IdP를 원천으로 삼는 Identity Center로 옮기고, 세션 이름과 `sts:SourceIdentity`에 직원 식별자를 싣고, 기존 공용 사용자는 SCP로 신규 생성을 봉쇄한 뒤 제거한다. "감사 요구가 나오면 로그를 더 켠다"는 반사적 대응이 통하지 않는 대표 사례다.

## 정리하며

Week 2는 IAM을 "Allow 한 줄로 끝나는 스위치"에서 "여섯 층이 교집합으로 맞물린 의사결정 엔진"으로 다시 보는 여정이었다. 시험장에서 IAM 문제를 만나면 항상 이 순서로 추적하라: (1) explicit deny가 있나? → (2) 어느 가드레일 층(SCP/Boundary)이 막나? → (3) 크로스 계정이면 양쪽 다 Allow했나? → (4) 권한 부여는 Identity/Resource 정책이 하고, 나머지는 깎기만 한다. 그리고 "운영 부담 최소화 + 멀티 계정 표준화"가 키워드면 Control Tower를, 크로스 계정 위임이면 AssumeRole + ExternalId를 떠올려라.

> 📚 **사례**: 2019년 Capital One 침해는 Week 2의 네 기둥이 각각 어디에서 작동했어야 했는지를 한 사건 안에서 모두 보여 준다. 공격자는 잘못 구성된 WAF를 통한 SSRF로 EC2 인스턴스 메타데이터에 접근해 그 인스턴스 역할의 임시 자격증명을 얻었고, 그 자격증명으로 S3 버킷 목록을 조회한 뒤 데이터를 내려받았다. 미국·캐나다 신용카드 신청자 약 1억 명 규모의 정보가 영향을 받았다. 네 기둥으로 되짚으면 이렇다 — **day3(SCP)**: IMDSv2를 조직 차원에서 강제했다면 자격증명 탈취 경로 자체가 좁아졌다. **day2(권한 경계)**: 인스턴스 롤에 경계가 있었다면 `ListBucket`·`GetObject`의 범위가 천장에 걸렸다. **day1(조건)**: 버킷 정책에 `aws:SourceVpce`나 `aws:PrincipalOrgID` 조건이 있었다면 예상 밖 경로의 호출이 걸러졌다. **day4(신원)**: 워크로드 신원의 권한을 최소화하고 사용 패턴을 세션 단위로 관찰했다면 이상 징후가 더 빨리 드러났다. 어느 하나가 만능이 아니라, **네 층이 각자 조금씩 피해를 깎는 구조**가 심층 방어의 실제 모습이다.

> 📚 **사례**: 2014년 Code Spaces는 침해자가 AWS 콘솔 접근 권한을 확보한 뒤 인스턴스·스토리지·스냅샷·백업을 삭제하면서 사업 자체를 접었다. 데이터가 아니라 데이터를 되살릴 수단이 통째로 지워진 사건이다. Week 2의 관점에서 이 사례의 교훈은 **"통제는 침해된 계정 밖에 있어야 한다"**는 것 하나다. 계정 안의 IAM 정책은 침해자가 관리자 권한을 잡는 순간 함께 무력화되지만, SCP는 관리 계정에서 관리되므로 멤버 계정을 장악한 침해자가 풀 수 없다. 그래서 로그·백업 계정을 별도 OU에 격리하고, 파괴적 액션을 SCP로 봉쇄하고, 그 SCP를 바꿀 수 있는 관리 계정에는 워크로드를 두지 않는 구조가 표준이 됐다. 멀티 계정 설계가 "관리 편의"가 아니라 **보안 통제 그 자체**인 이유다.

## 한 줄 요약

Week 2의 전부는 **"유효 권한 = 여섯 층의 교집합, 단 어느 층의 명시적 Deny 하나가 전부를 이긴다"**는 한 문장이다. 권한을 *만드는* 층은 Identity 정책과 리소스 정책 둘뿐이고, SCP·권한 경계·세션 정책·RCP는 오직 깎기만 하므로 `AdministratorAccess`도 상한을 넘지 못한다. 같은 계정에서는 Identity 또는 리소스 정책 하나면 되지만 교차 계정은 양쪽 모두 Allow해야 하고, 서드파티에는 `sts:ExternalId`·AWS 서비스에는 `aws:SourceArn`으로 confused deputy를 막는다. 위임은 `iam:PermissionsBoundary` 강제 + 경계 변경 Deny + 네임스페이스 격리 + `iam:PassRole` 제한이 한 세트여야 성립하고, 조직 가드레일은 관리 계정과 서비스 연결 롤에 닿지 않으며 조직 밖에서 들어오는 접근은 RCP·리소스 정책의 몫이다. 신원은 IAM 사용자를 버리고 페더레이션·Identity Center로 옮기되 SCP로 신규 IAM 사용자 생성을 봉쇄해야 실효가 있고, ABAC는 태그가 곧 신원이므로 태그 변경 권한을 잠그지 않으면 그 자체가 권한 상승 경로가 된다. 막혔을 때는 오류 메시지 → CloudTrail → `get-caller-identity` → 시뮬레이터 → SCP 경로 순으로 좁히되 **시뮬레이터가 SCP를 평가하지 않는다**는 한계를 잊지 않고, 사고 대응에서는 비가역 조치(삭제) 대신 가역적이고 즉시 효력이 있는 조치(권한 정책 제거)를 고른다.

Week 3부터는 이 위에서 작동하는 탐지·로깅(CloudTrail, GuardDuty, Security Hub)으로 넘어간다. IAM이 "누가 무엇을 할 수 있는가"의 예방이라면, Week 3은 "실제로 무슨 일이 일어났는가"의 탐지다.

---

## 📝 연습 문제

**문제 1.** prod 계정의 사용자에게 `AdministratorAccess`가 할당되어 있는데, `eu-west-1`에서 EC2 시작이 거부되고 CloudTrail에 `explicitDeny`가 기록된다. 가장 유력한 원인과 해결책은?

A) IAM 정책이 부족하므로 더 넓은 정책을 추가한다  
B) prod OU에 리전 제한 SCP가 걸려 있으므로, 허용 리전에서 작업하거나 SCP를 수정한다  
C) Permission Set을 다시 할당한다  
D) MFA를 활성화한다  

**정답: B**  
해설: AdministratorAccess는 Identity 정책일 뿐 SCP의 천장을 넘지 못한다. `eu-west-1` + EC2 + explicitDeny 조합은 리전 제한 SCP가 전형적 원인이다. SCP Deny는 IAM Allow로 풀 수 없으므로 정책을 더 넓혀도 소용없고, 허용 리전에서 작업하거나 SCP 자체를 수정해야 한다.

---

**문제 2.** 개발자에게 롤 생성을 위임하면서 (1) 권한 상승 차단, (2) 리전 제한, (3) 팀별 리소스 격리를 모두 달성하려 한다. 올바른 도구 조합은?

A) SCP 하나로 전부 해결한다  
B) Permission Boundary 하나로 전부 해결한다  
C) SCP(리전 제한) + Permission Boundary 강제(권한 상승 차단) + ABAC(팀 격리)를 함께 쓴다  
D) AdministratorAccess를 주고 CloudTrail로 감시한다  

**정답: C**  
해설: 세 요구사항은 각기 다른 층이 담당한다. 리전 제한은 SCP, 권한 상승 차단은 Boundary 강제 부착, 팀 격리는 ABAC가 푼다. 어느 한 도구만으로는 세 가지를 모두 충족할 수 없다. AdministratorAccess + 사후 감시는 예방이 아니라 탐지일 뿐이라 위임 보안에 부적합하다.

---

**문제 3.** Audit 계정의 보안팀이 여러 prod 계정의 S3 로그 버킷을 읽어야 한다. 임시 자격증명을 쓰고 감사 추적을 남기며 confused deputy를 방지하는 방법은?

A) prod 계정에 IAM 사용자를 만들어 access key를 공유한다  
B) 각 prod 계정에 읽기 전용 롤을 만들고, 신뢰 정책에서 Audit 계정만 AssumeRole 허용 + ExternalId 조건을 건다  
C) 모든 버킷을 퍼블릭으로 만든다  
D) Audit 계정에 AdministratorAccess를 준다  

**정답: B**  
해설: 크로스 계정 읽기는 각 계정에 최소 권한 롤을 만들고 신뢰 정책으로 Audit 계정만 AssumeRole하게 하는 것이 표준이다. 임시 자격증명을 쓰고 CloudTrail에 AssumeRole이 남으며, ExternalId 조건으로 confused deputy를 막는다. access key 공유는 장기 자격증명 유출 위험, 퍼블릭 버킷은 심각한 노출, AdministratorAccess는 최소 권한 위반이다.

---

**문제 4.** "운영 부담을 최소화하면서 50개 신규 계정에 표준 SCP 가드레일과 Identity Center 매핑을 일관되게 적용"하라는 시나리오에서 가장 적절한 솔루션은?

A) 계정마다 SCP와 Permission Set을 수동으로 설정한다  
B) AWS Control Tower로 OU 가드레일과 Account Factory 표준화를 적용한다  
C) 각 계정에 Lambda 자동화를 따로 배포한다  
D) 모든 계정을 하나로 합친다  

**정답: B**  
해설: "운영 부담 최소화 + 멀티 계정 표준화" 키워드는 Control Tower를 가리킨다. Control Tower는 OU별 SCP 가드레일을 매니지드로 제공하고 Account Factory로 새 계정 생성 시 표준 설정과 Identity Center 매핑을 자동 적용한다. 수동 설정과 계정별 Lambda는 운영 부담이 크고, 계정 통합은 blast radius 격리를 깨뜨린다.

---

**문제 5.** 다음 중 "권한을 부여하지 않고 오직 상한만 제한하는" 도구로만 묶인 것은?

A) Identity 정책, Resource 정책  
B) SCP, Permission Boundary, Session Policy  
C) Identity 정책, SCP  
D) Resource 정책, ABAC  

**정답: B**  
해설: SCP, Permission Boundary, Session Policy는 모두 권한을 부여하지 않고 상한(천장)만 정하는 가드레일이다. 실제 권한 부여는 Identity 정책과 Resource 정책이 담당한다. 따라서 부여 도구(Identity/Resource)가 섞인 보기는 모두 틀리며, 세 가드레일만 묶인 것이 정답이다.
