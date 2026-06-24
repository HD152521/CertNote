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

## 정리하며

Week 2는 IAM을 "Allow 한 줄로 끝나는 스위치"에서 "여섯 층이 교집합으로 맞물린 의사결정 엔진"으로 다시 보는 여정이었다. 시험장에서 IAM 문제를 만나면 항상 이 순서로 추적하라: (1) explicit deny가 있나? → (2) 어느 가드레일 층(SCP/Boundary)이 막나? → (3) 크로스 계정이면 양쪽 다 Allow했나? → (4) 권한 부여는 Identity/Resource 정책이 하고, 나머지는 깎기만 한다. 그리고 "운영 부담 최소화 + 멀티 계정 표준화"가 키워드면 Control Tower를, 크로스 계정 위임이면 AssumeRole + ExternalId를 떠올려라.

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
