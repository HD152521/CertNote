# Day 4 - STS와 임시 자격 증명: AssumeRole, 페더레이션, 역할 체이닝, Confused Deputy 방지

지난 사흘 동안 "장기 자격 증명(IAM User access key)을 쓰지 말고 Role을 쓰라"는 말을 반복했다. 오늘은 그 Role이 실제로 어떻게 "맡아지는지", 그 메커니즘인 STS(Security Token Service)가 무엇을 발급하고, 외부 신원(페더레이션)이 어떻게 AWS 자격 증명으로 교환되는지를 판다. SCS-C03의 도메인 4에서 가장 깊은 변별력이 여기 있다 — AssumeRole의 trust 관계, 역할 체이닝의 제약, 그리고 cross-account 위임에서 반드시 막아야 하는 Confused Deputy 공격이다.

핵심 한 문장을 먼저: **STS는 만료되는 임시 자격 증명(AccessKeyId + SecretAccessKey + SessionToken)을 발급하고, "누가 이 역할을 맡을 수 있나"는 역할의 trust policy가 결정한다.**

## STS가 발급하는 것: 임시 자격 증명 3종

장기 IAM User 자격 증명은 키 2개(AccessKeyId, SecretAccessKey)지만, STS 임시 자격 증명은 **3개**다.

| 구성 | 역할 |
|------|------|
| AccessKeyId | 식별자 |
| SecretAccessKey | 서명 키 |
| **SessionToken** | 임시 세션 증명(장기 키엔 없음) |

이 자격 증명에는 **만료 시간**이 있다. AssumeRole은 기본 1시간, 최대 12시간(역할의 `MaxSessionDuration` 범위 내). 만료되면 다시 발급받아야 한다. **노출돼도 시간적으로 피해가 제한**되는 것이 장기 키보다 근본적으로 안전한 이유다.

주요 STS API:

| API | 용도 |
|-----|------|
| `AssumeRole` | 같은/다른 계정의 IAM Role 맡기 (가장 일반적) |
| `AssumeRoleWithSAML` | SAML 2.0 IdP(예: AD FS, Okta) 페더레이션 |
| `AssumeRoleWithWebIdentity` | OIDC(예: Cognito, Google, GitHub Actions) 페더레이션 |
| `GetSessionToken` | MFA 적용된 임시 자격 증명(IAM User용) |
| `GetFederationToken` | 레거시 페더레이션 |

각 API를 언제 쓰는지가 시험 포인트다. "누가 호출하는가"와 "무엇을 증거로 제시하는가"로 구분하면 헷갈리지 않는다.

| API | 호출하는 쪽 | 제시하는 증거 | 결과 신원 | 대표 상황 |
|-----|-------------|----------------|-----------|-----------|
| `AssumeRole` | AWS 자격 증명을 이미 가진 주체 | 자기 AWS 서명 | 대상 역할 | 교차 계정 접근, EC2·Lambda 실행 역할 |
| `AssumeRoleWithSAML` | 기업 IdP를 거친 사용자 | **SAML assertion** | 대상 역할 | AD FS·Okta 기반 워크포스 로그인 |
| `AssumeRoleWithWebIdentity` | OIDC 토큰을 가진 주체 | **OIDC ID 토큰** | 대상 역할 | GitHub Actions, EKS 파드, 모바일 앱 |
| `GetSessionToken` | IAM 사용자 본인 | 자기 키 (+ MFA 코드) | **같은 사용자** | MFA를 붙인 세션이 필요할 때 |
| `GetFederationToken` | IAM 사용자 또는 루트 | 자기 키 | 페더레이션 사용자 | 레거시 — 신규 설계에는 쓰지 않음 |

> ⚠️ **함정**: `GetSessionToken`과 `AssumeRole`을 바꿔 쓰는 실수가 잦다. `GetSessionToken`은 **역할을 바꾸지 않는다** — 같은 IAM 사용자의 신원 그대로, MFA가 반영된 임시 자격 증명을 받을 뿐이다. 그래서 "MFA를 요구하는 정책 조건을 만족시키고 싶다"면 `GetSessionToken`이고, "다른 권한 집합으로 갈아입고 싶다"면 `AssumeRole`이다. 또 하나 — `GetSessionToken`으로 받은 자격 증명으로는 대부분의 IAM·STS 호출이 제한된다는 제약이 있다.

임시 자격 증명이 어디서 오는지를 한 장으로 정리하면 이렇다. 세 경로 모두 끝은 같다.

```
[ 임시 자격 증명에 도달하는 세 갈래 ]

 ① 워크로드가 자동으로 받는 경로
    EC2 인스턴스 ──▶ IMDS(v2, 토큰 필요) ──▶ 인스턴스 프로파일의 역할
    Lambda 함수  ──▶ 실행 환경 변수      ──▶ 실행 역할
    ECS 태스크   ──▶ 태스크 자격 증명 엔드포인트 ──▶ 태스크 역할
    EKS 파드     ──▶ OIDC 서비스 계정 토큰 ──▶ 역할(IRSA)
                        └─ 공통점: **코드에 키가 없다**

 ② 사람이 로그인해 받는 경로
    사용자 ──▶ 기업 IdP 로그인 ──▶ SAML/OIDC 증명
           ──▶ IAM Identity Center 또는 STS ──▶ 역할 세션

 ③ 이미 가진 AWS 자격 증명으로 갈아입는 경로
    주체 ──▶ sts:AssumeRole ──▶ 다른 역할 세션 (같은 계정 또는 교차 계정)

  ── 세 경로의 산출물은 동일하다 ────────────────────────
     AccessKeyId(ASIA...) + SecretAccessKey + SessionToken + Expiration
```

이 그림에서 읽어야 할 것은 **"장기 키가 등장할 자리가 어디에도 없다"**는 사실이다. 워크로드도, 사람도, 교차 계정도 전부 임시 자격 증명으로 해결된다. 그러므로 시험에서 액세스 키가 등장하는 보기는 거의 항상 오답 후보다.

> 💡 **관련 이론**: EC2 인스턴스 프로파일, Lambda 실행 역할, ECS task role도 내부적으로 전부 STS AssumeRole이다. EC2의 경우 인스턴스 메타데이터 서비스(IMDS)가 임시 자격 증명을 자동 발급·갱신한다. 그래서 코드에 키를 넣을 필요가 없다. **IMDSv2(토큰 기반)**를 강제해야 SSRF로 메타데이터를 훔치는 공격(Capital One 사고의 핵심 벡터)을 막는다 — 시험 단골이다.

## AssumeRole: trust policy와 permission policy의 두 축

Role은 **두 개의 정책**을 가진다. 이 구분이 IAM에서 가장 헷갈리는 지점이다.

- **Trust policy(신뢰 정책)**: "**누가** 이 역할을 맡을 수 있나"(`sts:AssumeRole` 허용 대상). Principal 포함 = 리소스 기반 정책.
- **Permission policy(권한 정책)**: "이 역할을 맡으면 **무엇을** 할 수 있나". Identity 기반 정책.

```json
// Trust policy: 계정 111122223333의 주체가 이 역할을 맡을 수 있다
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111122223333:root"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-secret-2026"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

cross-account AssumeRole이 성공하려면 **양쪽**이 맞아야 한다.

1. **대상 역할의 trust policy**가 호출 계정/주체를 Principal로 허용
2. **호출 측 신원 정책**에 `sts:AssumeRole` Allow(대상 역할 ARN 지정)

이 "양쪽"이 실제로 어떻게 맞물리는지를 순서대로 그리면 다음과 같다. 화살표 하나하나가 실패할 수 있는 지점이고, 시험 문항은 대개 이 중 한 곳이 비어 있는 상황을 준다.

```
[ 교차 계정 AssumeRole 전 과정 ]

  계정 A (호출자) 111122223333          계정 B (대상) 444455556666
  ┌────────────────────────┐          ┌──────────────────────────────┐
  │ 주체: role/Auditor     │          │ 역할: role/CrossAccountRead  │
  │                        │          │                              │
  │ ① Identity 정책        │          │ ② 신뢰 정책 (리소스 기반)     │
  │   Allow sts:AssumeRole │          │   Principal: 계정 A          │
  │   Resource: B의 역할ARN│          │   Action: sts:AssumeRole     │
  └───────────┬────────────┘          │   Condition: ExternalId, MFA │
              │                       │                              │
              │                       │ ③ 권한 정책                  │
              │  (1) AssumeRole 호출  │   Allow s3:GetObject ...     │
              ├──────────────────────▶└──────────────┬───────────────┘
              │                                      │
              │            (2) STS가 ①과 ②를 모두 검사
              │                · A가 호출할 권한이 있나 (①)
              │                · B가 A를 받아들이나  (②)
              │                · 조건(ExternalId·MFA)이 맞나
              │                       │
              │  (3) 임시 자격 증명 발급 (기본 1시간)
              │◀──────────────────────┘
              │      ASIA... + SessionToken + Expiration
              │
              │  (4) 새 신원으로 B의 리소스 호출
              │      arn:aws:sts::444455556666:assumed-role/CrossAccountRead/audit-2026
              ▼
        ③ 권한 정책의 범위 안에서만 동작

  ── 실패 지점 진단표 ────────────────────────────────────────
  ①이 없다  → 호출 자체가 AccessDenied (계정 A에서 막힘)
  ②가 없다  → "not authorized to perform sts:AssumeRole" (계정 B가 거절)
  조건 불일치 → 같은 메시지가 나오지만 원인은 ExternalId·MFA·IP
  ③이 좁다  → 역할은 맡아지는데 이후 API가 막힌다
```

마지막 줄의 구분이 실무에서 특히 유용하다. **"역할을 맡을 수 없다"와 "맡았는데 아무것도 못 한다"는 완전히 다른 문제**다. 전자는 신뢰 정책, 후자는 권한 정책을 봐야 한다. `aws sts get-caller-identity`가 대상 역할의 ARN을 반환하면 이미 후자 단계에 와 있는 것이다.

신뢰 정책의 `Principal`은 무엇을 적느냐에 따라 신뢰 범위가 크게 달라진다.

| `Principal` 표기 | 의미 | 신뢰 범위 |
|-------------------|------|-----------|
| `{"AWS": "arn:aws:iam::111122223333:root"}` | 계정 111122223333 전체 | **그 계정의 IAM 관리자에게 위임** — 넓다 |
| `{"AWS": "arn:aws:iam::111122223333:role/Auditor"}` | 특정 역할만 | 좁다 (권장) |
| `{"Service": "ec2.amazonaws.com"}` | AWS 서비스 | 출처 조건 없으면 위험 |
| `{"Federated": "arn:aws:iam::...:oidc-provider/..."}` | OIDC 공급자 | `sub` 조건으로 반드시 좁혀야 함 |
| `{"AWS": "*"}` | **모든 AWS 계정** | 조건 없이 쓰면 치명적 |

> ⚠️ **함정**: `{"AWS": "*"}`가 든 신뢰 정책이 보기에 있으면 반사적으로 오답으로 걸러야 한다. 조건이 함께 걸려 있더라도 "누구나 시도해 볼 수 있는 역할"을 만드는 셈이라, 조건 하나만 잘못되면 전 세계에 열린다. IAM Access Analyzer가 외부 접근 발견 사항으로 잡아내는 대표 패턴이기도 하다. 신뢰는 **가장 좁게 시작해서 필요할 때 넓히는 것**이지, 넓게 열고 조건으로 막는 것이 아니다.

> ⚠️ **함정**: trust policy의 Principal에 `"arn:aws:iam::111122223333:root"`를 쓰면 "계정 111122223333 **전체**가 맡을 수 있다"는 뜻이지 root 사용자만이 아니다. 단, 실제로는 그 계정 안에서 `sts:AssumeRole` 권한을 받은 주체만 맡을 수 있다(2번 조건). "root을 Principal로 쓰면 위험"이라는 직관은 절반만 맞다 — 계정 위임은 정상 패턴이지만, 그 계정 내부의 권한 통제는 그 계정에 맡겨진다.

## 페더레이션: 외부 신원을 AWS 자격 증명으로

IAM User를 만들지 않고 기업 디렉터리(AD)나 소셜/OIDC 신원으로 AWS에 접근하는 것이 페더레이션이다.

### SAML 2.0 페더레이션 (기업 워크포스)

```
[ SAML 페더레이션 흐름 ]

  사용자 → 기업 IdP(AD FS/Okta) 로그인
         → IdP가 SAML assertion 발급(역할 ARN 포함)
         → AWS STS AssumeRoleWithSAML
         → 임시 자격 증명 발급
         → AWS 리소스 접근
```

조금 더 자세히 그리면, 페더레이션에서 **AWS는 사용자를 직접 인증하지 않는다**는 점이 드러난다. AWS가 하는 일은 IdP가 서명한 증명을 검증하고 그 안에 적힌 역할로 세션을 발급하는 것뿐이다.

```
[ SAML / OIDC 페더레이션 — 신뢰가 어디에 있는가 ]

  사용자                기업 IdP              AWS IAM              AWS STS
    │                     │                     │                    │
    │  (1) 로그인·MFA     │                     │                    │
    ├────────────────────▶│                     │                    │
    │                     │                     │                    │
    │  (2) 서명된 증명     │                     │                    │
    │◀────────────────────┤                     │                    │
    │   SAML assertion     │                     │                    │
    │   또는 OIDC 토큰     │                     │                    │
    │   · 누구인가(sub)    │                     │                    │
    │   · 어떤 역할(Role)  │                     │                    │
    │   · 속성(부서·팀)    │                     │                    │
    │                     │                     │                    │
    │  (3) 증명을 제시하며 AssumeRoleWith… 호출                        │
    ├──────────────────────────────────────────────────────────────▶│
    │                     │                     │                    │
    │                     │  (4) IAM에 등록된 IdP로 서명 검증          │
    │                     │◀────────────────────┤                    │
    │                     │   (SAML 메타데이터 / OIDC 지문·발급자)     │
    │                     │                     │                    │
    │                     │  (5) 대상 역할의 신뢰 정책 검사            │
    │                     │      Principal: Federated = 그 IdP        │
    │                     │      Condition: sub · aud · 속성 일치      │
    │                     │                     │                    │
    │  (6) 임시 자격 증명 발급                                         │
    │◀──────────────────────────────────────────────────────────────┤
    │      ASIA... + SessionToken (+ 세션 태그)                       │
    ▼
  AWS 리소스 접근 — CloudTrail에는 assumed-role 세션으로 기록된다

  ── 신뢰의 위치 ────────────────────────────────────────────
  · **인증**의 책임은 IdP에 있다 (비밀번호·MFA·계정 잠금 정책)
  · **인가**의 책임은 AWS에 있다 (어떤 역할, 어떤 권한)
  · 그래서 IdP가 뚫리면 AWS도 뚫린다 — IdP 보안이 AWS 보안의 전제다
```

마지막 줄이 시험과 실무 양쪽에서 중요하다. 페더레이션을 도입하면 AWS 쪽 자격 증명 관리 부담은 사라지지만, **IdP가 새로운 단일 실패 지점**이 된다. 그래서 IdP 측 MFA 강제, 관리자 계정 보호, 그리고 AWS 쪽에서 신뢰 정책 조건을 좁히는 작업이 함께 가야 한다.

오늘날 권장 방식은 **IAM Identity Center(구 AWS SSO)**다. 다계정 환경에서 permission set을 정의하고, 외부 IdP(Okta, Entra ID 등)와 연동해 사용자가 한 번 로그인하면 여러 계정·역할에 임시 자격 증명으로 접근한다. IAM User를 계정마다 만드는 안티패턴을 제거한다.

| 접근 방식 | 신원 저장 위치 | 계정이 40개일 때 | 권장도 |
|-----------|----------------|------------------|--------|
| 계정마다 IAM User | 각 계정 | 사용자 1명당 40개 계정 = 관리 불가 | 안티패턴 |
| 허브 계정 IAM User + 역할 체이닝 | 허브 계정 | 사용자 1명 + 역할 40개 | 개선이나 장기 키 잔존 |
| SAML 직접 페더레이션 | 기업 IdP | 계정마다 IdP·역할 등록 필요 | 가능하나 설정 부담 |
| **IAM Identity Center** | 기업 IdP(또는 자체 디렉터리) | permission set을 계정 그룹에 할당 | **표준** |

> 🔍 **더 깊이**: Identity Center가 계정마다 만드는 것도 결국은 **역할**이다. permission set을 계정에 할당하면 그 계정에 `AWSReservedSSO_...`로 시작하는 역할이 자동 생성되고, 사용자는 로그인 후 그 역할을 맡는다. 즉 Identity Center는 새로운 인증 메커니즘이 아니라 **역할 생성과 신뢰 관계 관리를 자동화한 계층**이다. 이 사실을 알면 "Identity Center를 쓰는데 왜 CloudTrail에 assumed-role이 찍히나", "왜 SCP가 여전히 적용되나" 같은 질문이 자연스럽게 풀린다. 아래층은 언제나 IAM이다.

### OIDC / Web Identity 페더레이션 (앱·CI/CD)

모바일 앱(Cognito), GitHub Actions, Kubernetes(EKS IRSA) 등은 OIDC로 `AssumeRoleWithWebIdentity`를 쓴다. 특히 **GitHub Actions의 OIDC**는 시험과 실무 모두 중요하다 — 장기 access key를 GitHub secret에 넣는 대신, GitHub의 OIDC 토큰으로 역할을 맡아 키 노출 위험을 없앤다.

> 🔍 **더 깊이**: GitHub Actions OIDC의 trust policy는 `token.actions.githubusercontent.com`을 OIDC provider로 두고, Condition에 `token.actions.githubusercontent.com:sub`로 **특정 repo·브랜치만** 허용한다. 이 sub 조건을 `repo:org/*`처럼 느슨하게 두면 조직의 아무 repo나 역할을 맡을 수 있어 위험하다. `repo:org/repo:ref:refs/heads/main`처럼 좁혀야 한다. EKS의 IRSA도 같은 OIDC 원리로 pod에 역할을 매핑한다.

## 역할 체이닝(Role Chaining)과 제약

역할을 맡은 상태에서 **또 다른 역할을 맡는** 것이 역할 체이닝이다. 계정 A → 역할 X 맡기 → 역할 X로 역할 Y 맡기.

핵심 제약 두 가지가 시험에 나온다.

1. **체이닝 시 최대 세션 시간은 1시간으로 고정**된다. 역할 X의 `MaxSessionDuration`이 12시간이어도, 체이닝으로 받은 세션은 1시간이 상한이다.
2. 체이닝된 세션으로는 다시 `GetSessionToken` 같은 일부 호출이 제한된다.

```
[ 역할 체이닝과 세션 수명 ]

  사람 또는 워크로드
        │
        │ AssumeRole  ──▶ 역할 X 세션
        │                 MaxSessionDuration 12시간 설정
        │                 → 실제로 **최대 12시간** 받을 수 있다  ✅
        │                        │
        │                        │ 이 세션의 자격 증명으로 다시 AssumeRole
        │                        ▼
        │                  역할 Y 세션  ◀── 여기가 "체이닝"
        │                  Y의 MaxSessionDuration 이 12시간이어도
        │                  → **1시간으로 잘린다**  ⚠️
        │                        │
        │                        │ 또 체이닝하면
        │                        ▼
        │                  역할 Z 세션 — 역시 1시간
        ▼

  ── 증상과 진단 ────────────────────────────────────────────
  "장시간 배치가 정확히 1시간마다 죽는다"
     → 거의 확실히 체이닝 경로다. duration-seconds 를 크게 줘도
       ValidationError 가 나거나 조용히 3600으로 잘린다.
  해결
     ① 자격 증명 갱신 로직을 넣는다 (SDK 자격 증명 공급자 사용)
     ② 체이닝을 없앤다 — 최초 신원에서 최종 역할을 **직접** 맡는다
     ③ 정말 다단이 필요하면 각 단계를 짧게 유지하고 재발급을 전제로 설계
```

체이닝이 만드는 진짜 문제는 시간이 아니라 **추적성**이다. 여러 역할을 갈아타면 CloudTrail의 각 이벤트는 직전 역할만 기록하므로, "결국 이 작업을 시킨 사람이 누구였나"를 잇는 데 여러 로그를 이어 붙여야 한다. 이 문제를 정면으로 푸는 것이 `sts:SourceIdentity`다 — 한 번 설정하면 이후 체이닝 전 과정에서 따라붙어 최초 신원을 잃지 않는다. 세션 이름(`RoleSessionName`)은 호출자가 매번 자유롭게 정할 수 있어 증거로는 약하다는 점과 대비된다.

| 식별 수단 | 설정 주체 | 체이닝 시 유지 | 증거로서의 강도 |
|-----------|-----------|-----------------|------------------|
| `RoleSessionName` | 호출하는 코드 | 유지되지 않음(매번 새로 지정) | 약함 — 자유롭게 바꿀 수 있음 |
| 세션 태그(전이 태그) | 호출하는 코드 | 전이 지정 시 유지 | 중간 — 속성 전달용 |
| `sts:SourceIdentity` | 최초 호출 시 1회 | **끝까지 유지, 변경 불가** | 강함 — 감사 추적의 기준 |

> 💡 **관련 이론**: 역할 체이닝은 권한 추적을 흐리게 만들 수 있어 가급적 피한다. 대신 **session policy**나 직접 AssumeRole이 권장된다. 다만 cross-account에서 "허브 계정의 역할을 거쳐 스포크 계정에 접근"하는 패턴은 정당한 체이닝이다. 추적성은 CloudTrail의 `assumedRole` 세션 이름으로 보완한다(`sts:RoleSessionName`을 의미 있게 설정).

## Confused Deputy 방지: ExternalId와 aws:SourceArn

오늘의 보안 핵심. **Confused Deputy(혼동된 대리인)**는 권한 있는 주체(대리인)가 속아서 제3자를 위해 권한을 행사하는 공격이다.

### 시나리오: 서드파티 SaaS의 cross-account 접근

모니터링 SaaS가 당신의 계정에 AssumeRole로 접근한다고 하자. SaaS는 **모든 고객**에 대해 같은 SaaS 계정으로 역할을 맡는다. 만약 trust policy가 "SaaS 계정이면 허용"만 검사하면, 악의적 사용자가 SaaS에게 "내 역할은 저 ARN이다"라고 남의 역할 ARN을 등록해 SaaS가 대신 그 역할을 맡게 만들 수 있다.

이 구도가 왜 위험한지는 **3자 그림**으로 봐야 이해된다. 공격의 주체는 SaaS가 아니라 SaaS를 속이는 제3자이고, SaaS는 "혼동된 대리인"으로서 자기 권한을 남을 위해 행사하게 된다.

```
[ Confused Deputy — 3자 구도 ]

 ── 방어 없는 상태 ────────────────────────────────────────────────────

   ① 정상 고객 (계정 111122223333)
      "우리 계정의 role/MonitorRole 을 모니터링해 주세요"
                    │  역할 ARN 등록
                    ▼
              ┌───────────────────────────────┐
              │  SaaS 벤더 (계정 999988887777) │  ◀── 이 쪽이 "대리인(deputy)"
              │  모든 고객에 대해              │
              │  같은 계정으로 AssumeRole 한다 │
              └───────────────┬───────────────┘
                    ▲         │
     ② 공격자        │         │ AssumeRole(등록된 ARN)
       "우리 계정의  │         ▼
        역할은 이거" │   ┌──────────────────────────────────┐
        ← 남의 역할  │   │ AWS STS                          │
          ARN을 등록 │   │ 신뢰 정책 검사:                   │
                    │   │  "Principal 이 SaaS 계정인가?" ✅ │
                    │   │  → 통과 (다른 검사 없음)          │
                    │   └───────────────┬──────────────────┘
                    │                   │ 임시 자격 증명 발급
                    │                   ▼
                    │        ┌───────────────────────────┐
                    └────────│ 피해자 계정의 리소스        │
                  데이터 유출 │ role/MonitorRole 권한으로   │
                             │ S3·로그·지표에 접근         │
                             └───────────────────────────┘

     ▲ 공격자는 AWS를 뚫지 않았다. SaaS의 **권한을 빌렸을 뿐**이다.
       SaaS는 자기가 누구를 위해 일하는지 구분할 방법이 없었다.


 ── ExternalId 방어를 넣은 상태 ────────────────────────────────────────

   고객마다 **SaaS가 발급한 고유 값**을 신뢰 정책 조건에 박아 둔다.

   고객 A 신뢰 정책:  sts:ExternalId == "a1b2c3-고객A전용"
   고객 B 신뢰 정책:  sts:ExternalId == "z9y8x7-고객B전용"

              ┌───────────────────────────────┐
              │  SaaS 벤더                     │
              │  고객A 작업 → ExternalId "a1b2c3" 전달
              │  고객B 작업 → ExternalId "z9y8x7" 전달
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌────────────────────────────────────────┐
              │ AWS STS 신뢰 정책 검사                  │
              │  "Principal 이 SaaS 계정인가?"     ✅   │
              │  "ExternalId 가 a1b2c3 인가?"          │
              │      · 고객A 작업이면            ✅ 통과 │
              │      · 공격자가 유도한 호출이면  ❌ 거부 │
              └────────────────────────────────────────┘

     ▲ 공격자가 남의 역할 ARN을 등록해도, SaaS는 **자기 고객의**
       ExternalId를 붙여 보내므로 피해자 역할의 조건과 맞지 않는다.
       → 고객 간 격리가 신뢰 정책 수준에서 성립한다.
```

여기서 핵심은 **누가 ExternalId를 정하는가**다. SaaS가 고객마다 다른 값을 발급하고, SaaS가 그 값을 자기 쪽에 저장해 호출 시 붙인다. 고객이 임의로 정하는 구조라면 공격자도 자기 계정에 같은 값을 넣어 등록할 수 있어 격리가 깨진다.

해법은 **ExternalId** — SaaS가 당신에게만 발급한 고유값을 trust policy의 Condition에 박아둔다.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::SAAS-ACCOUNT-ID:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "your-unique-external-id-xyz"}
  }
}
```

SaaS는 당신의 역할을 맡을 때 이 ExternalId를 함께 전달하고, 다른 고객의 ExternalId로는 당신 역할을 맡을 수 없다. 고객 간 격리가 보장된다.

### AWS 서비스가 대리인일 때: aws:SourceArn / aws:SourceAccount

서비스 주체(예: CloudWatch, S3, SNS)가 당신의 역할/리소스를 사용할 때도 같은 공격이 가능하다. 이때는 `aws:SourceArn`(또는 `aws:SourceAccount`)으로 "오직 이 특정 리소스가 트리거한 호출만 허용"을 강제한다.

```json
{
  "Effect": "Allow",
  "Principal": {"Service": "sns.amazonaws.com"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"aws:SourceAccount": "111122223333"},
    "ArnLike": {"aws:SourceArn": "arn:aws:sns:us-east-1:111122223333:my-topic"}
  }
}
```

둘은 같은 문제를 푸는 서로 다른 도구다. 대리인이 **다른 AWS 계정**이면 ExternalId, **AWS 서비스**면 출처 조건을 쓴다.

| 축 | `sts:ExternalId` | `aws:SourceArn` / `aws:SourceAccount` |
|----|------------------|----------------------------------------|
| 대리인의 정체 | 서드파티 AWS 계정 | AWS 서비스 주체(`*.amazonaws.com`) |
| 값을 정하는 쪽 | **서드파티가 고객마다 발급** | AWS가 요청에 자동으로 채움 |
| 붙는 위치 | 역할의 신뢰 정책 | 역할 신뢰 정책 또는 리소스 정책 |
| 전달 방법 | 호출 시 `--external-id`로 명시 | 호출자가 조작할 수 없음 |
| 막는 것 | 다른 고객이 내 역할을 맡는 것 | 남의 리소스가 내 리소스를 트리거하는 것 |
| 비밀값인가 | **아니다** — 추측돼도 방어가 성립 | 해당 없음 |
| 대표 상황 | 모니터링·백업·비용관리 SaaS 연동 | S3→SNS, CloudWatch→Lambda, 서비스 롤 전반 |

`aws:SourceAccount`와 `aws:SourceArn`을 함께 쓰는 이유도 짚어 둘 만하다. `SourceAccount`는 계정 단위로 넓게 거르고, `SourceArn`은 특정 리소스까지 좁힌다. 일부 서비스는 상황에 따라 `SourceArn`을 채우지 못하는 경우가 있어, 계정 조건을 함께 두면 최소한의 방어선이 남는다. **넓은 조건과 좁은 조건을 겹쳐 두는 것**이 이 패턴의 요령이다.

> ⚠️ **함정**: 서비스 주체를 신뢰하는 정책에서 출처 조건을 빼먹는 실수는 놀랄 만큼 흔하다. `{"Service": "s3.amazonaws.com"}`은 "**전 세계의 모든 S3**"를 의미하지 "내 S3"를 의미하지 않는다. 서비스 주체는 계정을 구분하지 않기 때문이다. 그래서 SNS 토픽·SQS 큐·Lambda 함수·KMS 키에 서비스 주체를 허용할 때는 거의 예외 없이 `aws:SourceArn` 또는 `aws:SourceAccount`가 따라붙어야 한다. 시험에서 `Service` 주체가 든 정책 조각이 보이면 **조건 절이 있는지부터** 확인하라.

> 🎯 **시나리오**: "서드파티 백업 벤더에게 우리 S3에 접근하는 cross-account 역할을 만들어 줘야 한다." 정답 패턴은 ① IAM User access key를 벤더에 주지 않고(절대 금지) ② IAM Role + trust policy에 벤더 계정 + **ExternalId** 명시 ③ permission policy는 필요한 버킷·Action만(최소 권한). ExternalId가 없으면 같은 벤더를 쓰는 다른 고객이 우리 자원에 접근할 수 있는 Confused Deputy 구멍이 남는다. 이 패턴은 Datadog·New Relic·PagerDuty 등 모든 서드파티 통합에 동일하다.

> ⚠️ **함정**: ExternalId는 "비밀번호"가 아니다 — 추측 가능해도 공격을 막는다. 핵심은 **고객이 스스로 ExternalId를 정하지 않고 서드파티가 발급**한다는 점이다. 고객이 임의로 정하면 다른 고객과 충돌하거나 예측돼 격리가 깨진다. 시험에서 "ExternalId를 고객이 자유롭게 설정"이라는 보기는 함정이다.

## CLI로 보는 AssumeRole

```bash
# 역할 맡기 — 임시 자격 증명 3종 반환
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name security-audit-2026 \
  --external-id your-unique-external-id-xyz \
  --duration-seconds 3600

# 반환된 자격 증명으로 후속 호출 (환경변수 설정 후)
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # 임시 자격 증명엔 SessionToken 필수
aws sts get-caller-identity    # 누구로 행동 중인지 확인
```

실무에서 자주 쓰는 변형들도 함께 익혀 둔다. 각 옵션이 어떤 보안 요구에 대응하는지가 시험 포인트다.

```bash
# ① MFA를 요구하는 신뢰 정책을 만족시키며 역할 맡기
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/BreakGlassRole \
  --role-session-name incident-2026-07 \
  --serial-number arn:aws:iam::111122223333:mfa/alice \
  --token-code 123456

# ② 세션 태그를 주입해 ABAC 조건이 걸리게 하기
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ProjectRole \
  --role-session-name alice@example.com \
  --tags Key=Project,Value=atlas Key=Env,Value=prod \
  --transitive-tag-keys Project

# ③ 최초 신원을 못 박아 체이닝 전 과정에서 추적되게 하기
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/AuditRole \
  --role-session-name audit-run \
  --source-identity alice@example.com

# ④ OIDC 토큰으로 역할 맡기 (CI 환경에서 쓰는 형태)
aws sts assume-role-with-web-identity \
  --role-arn arn:aws:iam::111122223333:role/GitHubDeployRole \
  --role-session-name gh-actions \
  --web-identity-token "$OIDC_TOKEN"

# ⑤ 프로파일에 역할을 등록해 두면 SDK·CLI가 알아서 갱신한다 (권장)
#   ~/.aws/config
#   [profile audit]
#   role_arn       = arn:aws:iam::444455556666:role/CrossAccountReadRole
#   source_profile = default
#   external_id    = your-unique-external-id
#   duration_seconds = 3600
aws s3 ls --profile audit
```

```bash
# 신뢰 정책만 따로 꺼내 확인 — "누가 이 역할을 맡을 수 있나"
aws iam get-role --role-name CrossAccountReadRole \
  --query 'Role.AssumeRolePolicyDocument'

# 역할의 최대 세션 시간 확인 (체이닝이면 어차피 1시간으로 잘린다)
aws iam get-role --role-name CrossAccountReadRole \
  --query 'Role.MaxSessionDuration'

# EC2에서 IMDSv2를 강제하도록 변경 (SSRF 방어의 핵심)
aws ec2 modify-instance-metadata-options \
  --instance-id i-0abc123 \
  --http-tokens required \
  --http-endpoint enabled \
  --http-put-response-hop-limit 1
```

> 🔍 **더 깊이**: 마지막 명령의 `--http-put-response-hop-limit 1`이 조용히 중요한 옵션이다. 메타데이터 응답이 몇 홉까지 전달될 수 있는지를 제한하는데, 값이 1이면 **인스턴스 자신만** 메타데이터를 읽을 수 있다. 컨테이너가 도는 호스트에서 이 값이 2 이상이면 컨테이너 안에서 호스트의 인스턴스 자격 증명을 읽을 수 있어, 컨테이너 하나가 뚫리면 인스턴스 역할 전체가 노출된다. `--http-tokens required`(IMDSv2 강제)와 홉 제한은 짝으로 걸어야 방어가 완성된다.

> ⚠️ **함정**: `--profile`로 역할을 등록해 쓰는 방식이 CLI에서는 편하지만, **`external_id`가 로컬 설정 파일에 평문으로 남는다**는 점을 인지해야 한다. ExternalId는 비밀값이 아니므로 그 자체가 치명적이지는 않으나, 같은 파일에 `aws_secret_access_key`가 함께 들어 있다면 그건 다른 문제다. 원칙은 하나다 — `~/.aws/credentials`에 장기 키를 두지 않는 것. 사람은 Identity Center 로그인으로, 워크로드는 인스턴스·태스크 역할로 자격 증명을 받게 하면 이 파일에 비밀이 남을 이유가 없다.

> 📚 **사례**: 2019년 Capital One 사고의 본질은 ① WAF(SSRF 방어 미흡) ② **IMDSv1으로 EC2의 임시 자격 증명 탈취** ③ 그 자격 증명으로 S3 접근. 임시 자격 증명 자체는 안전 장치지만, **그것을 훔치는 경로(SSRF → IMDS)**가 열려 있으면 무력화된다. 그래서 IMDSv2 강제 + 최소 권한 인스턴스 역할 + WAF가 한 묶음으로 시험에 나온다. 임시 자격 증명은 "노출 시 시간 제한"이라는 방어선일 뿐, 노출 경로를 막는 건 별개의 통제다.

## 정리하며 — 임시 자격 증명이 보안의 기본값

오늘의 핵심 세 가지. 첫째, **STS는 만료되는 임시 자격 증명(SessionToken 포함)**을 발급하고, EC2/Lambda/ECS/페더레이션이 모두 그 위에서 동작한다 — 장기 키를 코드·CI에 넣는 안티패턴을 OIDC·인스턴스 역할로 대체하라. 둘째, AssumeRole은 **trust policy(누가)와 permission policy(무엇을)**의 두 축이며 cross-account는 양쪽 허용이 필요하다. 셋째, cross-account 위임에서 **Confused Deputy를 ExternalId(서드파티)·aws:SourceArn(AWS 서비스)**으로 반드시 막아야 한다.

> 📚 **사례**: 임시 자격 증명이 유출됐을 때의 대응 순서도 알아 둘 만하다. "만료될 때까지 기다린다"는 답은 틀렸다 — 최대 12시간이 남아 있을 수 있고, 그 사이 공격자는 계속 갱신을 시도한다. 실제 순서는 ① 해당 역할의 권한 정책에 **즉시 전면 Deny 문장을 추가**해 세션을 무력화하고(발급된 세션도 매 요청마다 정책을 다시 평가받으므로 즉시 효과가 있다) ② 그 역할을 맡을 수 있는 경로(신뢰 정책·인스턴스 프로파일)를 차단한 뒤 ③ CloudTrail에서 그 세션이 무엇을 했는지 전수 조사하고 ④ 근본 원인(메타데이터 노출·토큰 유출 경로)을 고친다. **정책은 발급된 세션에도 소급 적용된다**는 성질이 여기서 결정적으로 쓰인다. 이것이 장기 키와의 또 하나의 차이다 — 장기 키는 비활성화가 필요하지만, 역할 세션은 정책 한 줄로 즉시 끌 수 있다.

> ⚠️ **함정**: "역할 세션을 취소하려면 세션을 삭제하는 API를 호출한다"는 보기는 오답이다. STS에는 개별 세션을 회수하는 API가 없다. 대신 역할의 정책에 발급 시각 기준 조건을 건 Deny를 추가해 **특정 시점 이전에 발급된 세션 전부를 무효화**하는 방식을 쓴다. 콘솔의 "세션 취소(revoke sessions)" 기능도 내부적으로 정확히 이 정책 문장을 자동으로 넣어 주는 것이다. 메커니즘을 알면 왜 그 기능이 역할 정책을 수정하는지 이해된다.

내일은 Week 1의 마무리로, 오늘까지 배운 IAM·STS·정책 평가를 종합 시나리오로 엮는다. "권한이 있는데 왜 거부되는가", "서드파티에 안전하게 권한을 위임하라", "장기 키를 임시 자격 증명으로 전환하라" 같은 실전 상황을 통해 Week 1의 사고 프레임을 굳힌다.

## 한 줄 요약

STS는 **만료되는 임시 자격 증명 3종**(AccessKeyId `ASIA...` + SecretAccessKey + **SessionToken**)을 발급하며, EC2 인스턴스 프로파일·Lambda 실행 역할·ECS 태스크 역할·EKS IRSA·페더레이션이 전부 이 위에서 돌아간다 — 그래서 장기 키가 등장할 자리가 사실상 없다. 역할은 정책을 두 장 갖는데 **신뢰 정책은 "누가 맡나"(리소스 기반), 권한 정책은 "맡으면 뭘 하나"(Identity 기반)**이고, 교차 계정은 호출 측 `sts:AssumeRole` Allow와 대상 역할 신뢰 정책이 **둘 다** 있어야 한다. "맡을 수 없다"와 "맡았는데 아무것도 못 한다"는 서로 다른 층의 문제다. 신뢰 정책의 `Principal`에 계정 root를 쓰면 그 계정 전체에 위임하는 것이고, `{"AWS": "*"}`는 조건이 있어도 피해야 한다. **Confused Deputy**는 대리인이 서드파티 계정이면 **서드파티가 발급한 `sts:ExternalId`**로, AWS 서비스면 **`aws:SourceArn`·`aws:SourceAccount`**로 막는다 — `{"Service": "s3.amazonaws.com"}`은 "전 세계의 S3"라는 뜻이라 출처 조건 없이는 위험하다. 역할 체이닝은 **세션이 1시간으로 잘리고** 추적성이 흐려지므로 가급적 피하되, 불가피하면 `sts:SourceIdentity`로 최초 신원을 끝까지 붙들어 둔다. 자격 증명 탈취 경로는 별도 통제이며 EC2에서는 **IMDSv2 강제 + 홉 제한 1**이 표준이고, 유출된 세션은 삭제 API가 아니라 **역할 정책의 Deny 추가**로 즉시 무력화한다.

---

## 📝 연습 문제

**문제 1.** STS 임시 자격 증명이 장기 IAM User access key보다 보안상 우수한 가장 본질적인 이유는?

A) 더 긴 무작위 문자열이라 추측이 불가능하기 때문  
B) 만료 시간이 있어 노출되더라도 피해가 시간적으로 제한되기 때문  
C) 암호화되어 전송되기 때문  
D) root 계정에서만 발급할 수 있기 때문  

**정답: B**  
해설: 임시 자격 증명은 만료 시간(AssumeRole 기본 1시간, 최대 12시간)이 있어, 탈취되더라도 유효 기간 이후에는 무력화되므로 노출 피해가 시간적으로 한정된다. 길이나 전송 암호화는 장기 키와 본질적 차이가 아니고, 임시 자격 증명은 root 전용이 아니라 역할을 맡는 모든 주체가 받는다.

---

**문제 2.** 서드파티 모니터링 SaaS가 여러 고객의 AWS 계정에 동일한 SaaS 계정으로 AssumeRole 접근한다. 한 고객의 역할을 다른 고객이 SaaS를 통해 맡지 못하게 격리하는 핵심 메커니즘은?

A) trust policy의 Principal을 root로 지정  
B) trust policy의 Condition에 서드파티가 고객별로 발급한 `sts:ExternalId`를 명시  
C) 고객이 임의로 정한 ExternalId를 trust policy에 넣음  
D) SaaS에 IAM User access key를 발급해 전달  

**정답: B**  
해설: ExternalId는 서드파티가 고객마다 고유하게 발급한 값을 trust policy 조건에 박아 Confused Deputy 공격을 막는다. 고객이 임의로 정하면 충돌·예측으로 격리가 깨질 수 있어 발급 주체는 서드파티여야 하고, root Principal 지정만으로는 고객 간 격리가 되지 않으며, access key 발급은 장기 자격 증명 노출이라는 더 큰 위험을 만든다.

---

**문제 3.** 역할 체이닝(한 역할을 맡은 상태에서 또 다른 역할을 맡음)에 대한 설명으로 옳은 것은?

A) 체이닝된 세션은 원본 역할의 MaxSessionDuration을 그대로 따라 최대 12시간까지 가능하다  
B) 체이닝 시 세션 최대 시간은 1시간으로 제한된다  
C) 체이닝은 권한 추적을 단순화하므로 항상 권장된다  
D) 체이닝에는 trust policy가 필요 없다  

**정답: B**  
해설: 역할 체이닝으로 발급되는 세션의 최대 시간은 1시간으로 고정되며, 원본 역할의 긴 MaxSessionDuration이 적용되지 않는다. 체이닝은 오히려 권한 추적을 흐리므로 가급적 피하는 것이 권장되고, 모든 AssumeRole과 마찬가지로 대상 역할의 trust policy 허용이 반드시 필요하다.

---

**문제 4.** GitHub Actions가 장기 access key 없이 AWS 역할을 맡도록 구성할 때, 보안상 가장 중요한 trust policy 설정은?

A) `sub` 조건을 `repo:org/*`로 두어 조직의 모든 repo가 역할을 맡게 한다  
B) `sub` 조건을 `repo:org/repo:ref:refs/heads/main`처럼 특정 repo·브랜치로 좁힌다  
C) Principal을 `*`로 설정해 어떤 OIDC 토큰이든 허용한다  
D) trust policy 없이 permission policy만 넓게 설정한다  

**정답: B**  
해설: OIDC 페더레이션에서 `token.actions.githubusercontent.com:sub` 조건을 특정 repo와 브랜치로 좁혀야, 그 워크플로만 역할을 맡을 수 있어 안전하다. `repo:org/*`나 Principal `*`는 조직의 임의 repo·토큰이 역할을 탈취할 통로를 열고, trust policy 없이 권한만 넓히는 것은 누구나 역할을 맡을 수 있게 만든다.

---

**문제 5.** EC2 인스턴스에 부여된 임시 자격 증명이 SSRF 공격으로 탈취된 사고를 예방하기 위해 가장 직접적으로 적용해야 할 통제는?

A) EC2 인스턴스 역할에 AdministratorAccess를 부여해 운영을 단순화한다  
B) IMDSv2(토큰 기반 메타데이터 서비스)를 강제하고 인스턴스 역할에 최소 권한을 적용한다  
C) EC2에 장기 IAM User access key를 직접 저장한다  
D) 임시 자격 증명의 만료 시간을 12시간으로 늘린다  

**정답: B**  
해설: IMDSv2는 세션 토큰을 요구해 SSRF를 통한 메타데이터·임시 자격 증명 탈취를 크게 어렵게 만들고, 인스턴스 역할 최소 권한은 탈취되더라도 피해 범위를 줄인다. admin 부여는 폭발 반경을 키우고, 장기 키 저장은 더 위험하며, 만료 시간을 늘리면 탈취 자격 증명의 유효 기간만 길어져 오히려 위험이 커진다.

---
