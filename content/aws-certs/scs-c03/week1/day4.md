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

오늘날 권장 방식은 **IAM Identity Center(구 AWS SSO)**다. 다계정 환경에서 permission set을 정의하고, 외부 IdP(Okta, Entra ID 등)와 연동해 사용자가 한 번 로그인하면 여러 계정·역할에 임시 자격 증명으로 접근한다. IAM User를 계정마다 만드는 안티패턴을 제거한다.

### OIDC / Web Identity 페더레이션 (앱·CI/CD)

모바일 앱(Cognito), GitHub Actions, Kubernetes(EKS IRSA) 등은 OIDC로 `AssumeRoleWithWebIdentity`를 쓴다. 특히 **GitHub Actions의 OIDC**는 시험과 실무 모두 중요하다 — 장기 access key를 GitHub secret에 넣는 대신, GitHub의 OIDC 토큰으로 역할을 맡아 키 노출 위험을 없앤다.

> 🔍 **더 깊이**: GitHub Actions OIDC의 trust policy는 `token.actions.githubusercontent.com`을 OIDC provider로 두고, Condition에 `token.actions.githubusercontent.com:sub`로 **특정 repo·브랜치만** 허용한다. 이 sub 조건을 `repo:org/*`처럼 느슨하게 두면 조직의 아무 repo나 역할을 맡을 수 있어 위험하다. `repo:org/repo:ref:refs/heads/main`처럼 좁혀야 한다. EKS의 IRSA도 같은 OIDC 원리로 pod에 역할을 매핑한다.

## 역할 체이닝(Role Chaining)과 제약

역할을 맡은 상태에서 **또 다른 역할을 맡는** 것이 역할 체이닝이다. 계정 A → 역할 X 맡기 → 역할 X로 역할 Y 맡기.

핵심 제약 두 가지가 시험에 나온다.

1. **체이닝 시 최대 세션 시간은 1시간으로 고정**된다. 역할 X의 `MaxSessionDuration`이 12시간이어도, 체이닝으로 받은 세션은 1시간이 상한이다.
2. 체이닝된 세션으로는 다시 `GetSessionToken` 같은 일부 호출이 제한된다.

> 💡 **관련 이론**: 역할 체이닝은 권한 추적을 흐리게 만들 수 있어 가급적 피한다. 대신 **session policy**나 직접 AssumeRole이 권장된다. 다만 cross-account에서 "허브 계정의 역할을 거쳐 스포크 계정에 접근"하는 패턴은 정당한 체이닝이다. 추적성은 CloudTrail의 `assumedRole` 세션 이름으로 보완한다(`sts:RoleSessionName`을 의미 있게 설정).

## Confused Deputy 방지: ExternalId와 aws:SourceArn

오늘의 보안 핵심. **Confused Deputy(혼동된 대리인)**는 권한 있는 주체(대리인)가 속아서 제3자를 위해 권한을 행사하는 공격이다.

### 시나리오: 서드파티 SaaS의 cross-account 접근

모니터링 SaaS(예: Datadog)가 당신의 계정에 AssumeRole로 접근한다고 하자. SaaS는 **모든 고객**에 대해 같은 SaaS 계정으로 역할을 맡는다. 만약 trust policy가 "SaaS 계정이면 허용"만 검사하면, 악의적 사용자가 자기 계정 ID를 당신 것으로 속여 SaaS를 통해 당신 자원에 접근하게 만들 수 있다.

해법은 **ExternalId** — SaaS가 당신에게만 발급한 고유 비밀값을 trust policy의 Condition에 박아둔다.

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

> 📚 **사례**: 2019년 Capital One 사고의 본질은 ① WAF(SSRF 방어 미흡) ② **IMDSv1으로 EC2의 임시 자격 증명 탈취** ③ 그 자격 증명으로 S3 접근. 임시 자격 증명 자체는 안전 장치지만, **그것을 훔치는 경로(SSRF → IMDS)**가 열려 있으면 무력화된다. 그래서 IMDSv2 강제 + 최소 권한 인스턴스 역할 + WAF가 한 묶음으로 시험에 나온다. 임시 자격 증명은 "노출 시 시간 제한"이라는 방어선일 뿐, 노출 경로를 막는 건 별개의 통제다.

## 정리하며 — 임시 자격 증명이 보안의 기본값

오늘의 핵심 세 가지. 첫째, **STS는 만료되는 임시 자격 증명(SessionToken 포함)**을 발급하고, EC2/Lambda/ECS/페더레이션이 모두 그 위에서 동작한다 — 장기 키를 코드·CI에 넣는 안티패턴을 OIDC·인스턴스 역할로 대체하라. 둘째, AssumeRole은 **trust policy(누가)와 permission policy(무엇을)**의 두 축이며 cross-account는 양쪽 허용이 필요하다. 셋째, cross-account 위임에서 **Confused Deputy를 ExternalId(서드파티)·aws:SourceArn(AWS 서비스)**으로 반드시 막아야 한다.

내일은 Week 1의 마무리로, 오늘까지 배운 IAM·STS·정책 평가를 종합 시나리오로 엮는다. "권한이 있는데 왜 거부되는가", "서드파티에 안전하게 권한을 위임하라", "장기 키를 임시 자격 증명으로 전환하라" 같은 실전 문제를 통해 Week 1의 사고 프레임을 굳힌다.

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
