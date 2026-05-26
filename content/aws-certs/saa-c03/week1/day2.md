# Day 2 - IAM 기초: 누구에게 무엇을 허용할 것인가

처음 AWS를 쓸 때 가장 빨리 부딪히는 벽은 권한이다. 로컬에서는 잘 동작하던 코드가 EC2에 올리는 순간 `AccessDenied`를 뱉고, 콘솔에서 잘 보이던 S3 버킷이 다른 사용자에게는 안 보인다. 이런 일이 반복되면 자연스럽게 IAM의 정체가 궁금해진다.

이 글은 IAM이 어떻게 동작하는지를 4개의 엔터티 — **User / Group / Role / Policy** — 를 중심으로 풀어낸다. 시험에서 가장 기본이면서 가장 자주 함정이 깔리는 영역이고, 실무에서도 "왜 이게 안 되지?"의 9할이 여기서 시작된다.

## 인증과 인가, 그리고 IAM의 자리

IAM은 두 가지 질문에 답하는 시스템이다. 첫째 "이 요청자가 누구인가?"(Authentication), 둘째 "그 사람이 이걸 해도 되는가?"(Authorization). 전자는 자격 증명(비밀번호, Access Key, 임시 토큰)으로, 후자는 정책(Policy)으로 해결한다.

> 💡 **관련 이론**: 인증(Authentication)과 인가(Authorization)는 보안의 가장 기본적인 두 축이다. 흔히 AuthN(N=네임)과 AuthZ(Z=잭슨)로 구분해서 부른다. RBAC(Role-Based Access Control)은 직무 기반, ABAC(Attribute-Based Access Control)은 태그·속성 기반 권한 모델인데, AWS IAM은 둘 다 지원한다. ABAC는 Saltzer & Schroeder가 1975년 제시한 보안 8대 원칙 중 "최소 권한 원칙(Principle of Least Privilege)"을 더 잘 구현하는 패턴으로 평가받는다.

## IAM의 4대 엔터티

| 엔터티 | 정의 | 자격 증명 |
|--------|------|----------|
| **User** | 사람/앱 같은 영구 신원 | 비밀번호, Access Key |
| **Group** | User들의 묶음. 정책 부여 단위 | 없음 (컨테이너) |
| **Role** | 임시로 빌릴 수 있는 신원 | STS Temp Credential |
| **Policy** | JSON 권한 문서 | - |

여기서 흔히 오해하는 게 Group이다. **Group은 사람이 아니다.** 로그인할 수도 없고, 그 자체의 자격 증명도 없다. 그냥 User들을 묶어서 정책을 한 번에 부여하기 위한 컨테이너일 뿐이다. 그리고 Group은 다른 Group의 멤버가 될 수 없다 — 중첩 불가다.

가장 흥미로운 건 Role이다. Role은 "빌려쓰는 신원"이다. EC2 인스턴스가, Lambda 함수가, 다른 계정의 사용자가, 외부 IdP가 — 누구든지 신뢰 정책에 명시된 주체라면 이 Role을 잠시 빌려서 그 권한으로 동작할 수 있다.

```
[ IAM 엔터티 관계 ]

   +-------+      attach      +--------+
   | User  | <-------------- | Policy |
   +-------+                  +--------+
       \                          |
        \  member of               |
         v                          v
       +-------+               +--------+
       | Group |               |  Role  |
       +-------+               +--------+
                                 ^  ^
                  Trust Policy   |  | AssumeRole
                                 |  |
                          EC2/Lambda/Account/...
```

## 정책의 해부학: 4개의 키만 보면 된다

IAM 정책은 JSON 문서다. 복잡해 보여도 핵심은 **Effect / Action / Resource / Condition** 네 가지 키뿐이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowReadFromBucket",
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::my-bucket",
      "arn:aws:s3:::my-bucket/*"
    ],
    "Condition": {
      "IpAddress": {"aws:SourceIp": "203.0.113.0/24"},
      "Bool":      {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

- **Effect**: `Allow` 또는 `Deny`
- **Action**: `서비스명:작업명` 형태 (`s3:GetObject`, `ec2:RunInstances`)
- **Resource**: ARN. 와일드카드(`*`)도 가능하지만 최소 권한 위배
- **Condition**: IP 대역, MFA 여부, 시간, 태그 등으로 추가 좁히기

> 💡 **암기 팁**: 정책 핵심 키워드는 **VESAR** — Version / Effect / Statement / Action / Resource. 5글자만 외우면 정책 문서가 통째로 보인다.

> ⚠️ **함정**: 정책에서 `Allow`와 `Deny`가 충돌하면 **항상 Deny가 이긴다**. 그래서 그룹 단위로 Deny를 걸어두고 예외 사용자에게 Allow를 주는 패턴은 동작하지 않는다. 이건 다음 글의 정책 평가 로직에서 더 깊이 다룬다.

## Role의 두 얼굴: Trust Policy와 Permission Policy

Role을 처음 만들 때 자주 헷갈리는 게 정책이 두 개라는 점이다.

- **Trust Policy (신뢰 정책)** — *누가 이 Role을 빌릴 수 있나?*
- **Permission Policy (권한 정책)** — *빌린 뒤 무엇을 할 수 있나?*

예를 들어 EC2가 S3에 접근하는 가장 표준적인 패턴은 이렇다. 먼저 EC2 서비스가 빌릴 수 있는 Role을 만든다. 이 Role의 Trust Policy에는 `ec2.amazonaws.com`이 Principal로 명시된다. 그리고 Permission Policy로 S3 읽기 권한을 붙인다. 마지막으로 이 Role을 Instance Profile이라는 래퍼로 감싸서 EC2에 연결한다.

```
[ EC2 → S3 패턴 (정답 패턴) ]

  EC2 Instance
    └─ Instance Profile (=Role A)
         ├─ Trust Policy: ec2.amazonaws.com
         └─ Permission Policy: s3:GetObject on my-bucket/*
```

이 패턴을 외워두면 SAA 시험에서 "EC2 안의 앱이 AWS 서비스에 접근하려면 어떻게 해야 하나?"라는 문제는 무조건 IAM Role을 고를 수 있다. **Access Key를 코드에 넣는다, 환경 변수에 저장한다** 같은 보기는 전부 오답이다.

## 정책의 종류: 어디에 붙느냐가 곧 의미

정책은 어디에 붙는지에 따라 종류가 갈린다.

| 종류 | 어디에 붙나? | 역할 |
|------|--------------|------|
| **Identity-based** (관리형/인라인) | User, Group, Role | 일반적인 권한 부여 |
| **Resource-based** | S3 버킷, SQS, KMS, Lambda 등 | 리소스 쪽에서 누구를 허용할지 선언 |
| **Permission Boundary** | User/Role | 최대 권한 천장(상한) |
| **SCP (Service Control Policy)** | Organizations OU/계정 | 계정 전체 천장 |
| **Session Policy** | AssumeRole 시 전달 | 세션 동안 임시 천장 |
| **ACL** | S3, VPC | 레거시 — 가능하면 정책 사용 |

여기서 가장 중요한 건 **Identity-based vs Resource-based**. 같은 계정 안에서는 둘 중 하나만 허용해도 통과하지만, **크로스 계정**에서는 양쪽 모두 허용이 필요하다. 이 차이가 시험에서 단골로 나온다.

> 💡 **관련 이론**: Resource-based 정책은 객체에 ACL을 거는 클래식 운영체제 모델과 비슷하다. Unix의 파일 권한이 inode에 붙어 있듯, S3 버킷 정책은 버킷 자체에 붙는다. 반면 Identity-based 정책은 Capability-based Security(권한 능력이 주체에 붙는 모델)에 가깝다. AWS는 두 모델을 같이 쓰는 하이브리드다.

## 관리형 정책 vs 인라인 정책: 무엇이 운영에 좋은가

정책을 사용자나 Role에 붙일 때 두 가지 방식이 있다.

- **AWS 관리형 정책**: AWS가 만들고 업데이트한다. `AmazonS3ReadOnlyAccess` 같은 흔한 권한 묶음.
- **고객 관리형 정책**: 내가 만들고 버전 관리한다. 여러 사용자/Role에 재사용 가능.
- **인라인 정책**: 특정 사용자/Role에 1:1로 직접 박힌 정책. 재사용 불가.

운영성과 재사용성 측면에서 정답은 거의 항상 **고객 관리형 정책**이다. 인라인은 한 곳에서만 의미가 있는 진짜 특수한 권한일 때만 쓴다.

## 실제로 만들어보기

말로만 외우면 안 박힌다. CLI로 한 번 흐름을 찍어보자.

```bash
# 사용자 생성 → 그룹 가입 → 관리형 정책 부여
aws iam create-user --user-name alice
aws iam create-group --group-name Developers
aws iam add-user-to-group --user-name alice --group-name Developers
aws iam attach-group-policy \
  --group-name Developers \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# EC2가 사용할 Role 생성
aws iam create-role \
  --role-name AppServerRole \
  --assume-role-policy-document file://trust.json

aws iam attach-role-policy \
  --role-name AppServerRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Instance Profile 만들어 EC2에 연결
aws iam create-instance-profile --instance-profile-name AppServerProfile
aws iam add-role-to-instance-profile \
  --instance-profile-name AppServerProfile --role-name AppServerRole
```

`trust.json`은 이렇게 생겼다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
```

`Principal`이 EC2 서비스라는 점, 그리고 Action이 `sts:AssumeRole`이라는 점이 핵심이다. EC2가 STS에게 "내가 이 Role을 빌리고 싶다"고 요청할 때 이 신뢰 관계가 통과 조건이 된다.

## 루트 계정과 Access Key: 두 가지 시한폭탄

루트 계정은 모든 권한을 가진 최상위 계정이다. 청구 정보 변경, 계정 폐쇄 등 14개 정도의 작업은 루트만 할 수 있지만, **일상 작업은 절대 루트로 하지 않는다**. MFA를 켜고 자격 증명을 봉인해두는 게 표준이다.

> ⚠️ **함정**: "Access Key를 git에 실수로 올렸다. 어떻게 막을까?" → ① 즉시 비활성화 ② 키 삭제 ③ IAM Role로 마이그레이션. 단순히 새 키로 갈아끼우는 답은 오답이다. GuardDuty가 GitHub 노출을 자동 탐지하기도 한다.

## 정리

IAM의 4대 엔터티는 이름만 봐도 역할이 다 다르다. **User는 영구 신원, Group은 묶음, Role은 빌려쓰는 신원, Policy는 권한 문서**. 그리고 정책은 4개 키 — Effect / Action / Resource / Condition — 으로 거의 모든 의미가 표현된다. EC2가 AWS 서비스에 접근하는 표준 답은 **IAM Role + Instance Profile**, 이건 시험과 실무 모두의 정답이다.

다음 글에서는 IAM의 의사결정 흐름을 깊이 파고든다. **명시적 Deny는 왜 항상 이기는가**, **SCP / Permission Boundary / Session Policy** 의 천장이 어떻게 쌓이는가, 그리고 STS의 임시 자격 증명이 EC2 Role의 내부에서 어떻게 동작하는가를 다룬다.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스 내부 애플리케이션이 S3에 접근해야 한다. 가장 권장되는 방법은?

A) 인스턴스 안에 Access Key를 환경 변수로 넣는다
B) IAM 사용자에게 키를 발급해 코드에 포함한다
C) EC2에 IAM Role을 연결한다
D) S3 버킷을 모두 공개로 설정한다

**정답: C**
해설: 자격 증명을 코드나 환경 변수에 두는 패턴은 키 유출 위험 때문에 금기다. EC2에는 Instance Profile로 감싼 IAM Role을 연결하고, 그 Role의 Trust Policy에 `ec2.amazonaws.com`을 명시한다.

---

**문제 2.** 다음 중 IAM 그룹에 대한 설명으로 옳지 않은 것은?

A) 정책을 그룹에 부여하면 멤버에게 상속된다
B) 그룹은 다른 그룹의 멤버가 될 수 있다
C) 그룹은 사람이 아니므로 로그인할 수 없다
D) 그룹은 정책 관리의 편의를 위한 컨테이너다

**정답: B**
해설: 그룹은 그룹의 멤버가 될 수 없다. IAM은 그룹 중첩(nested group)을 지원하지 않는다. 다른 보기는 모두 맞는 설명이다.

---

**문제 3.** IAM Role의 신뢰 정책(Trust Policy)이 정의하는 것은?

A) Role이 접근 가능한 리소스
B) Role을 AssumeRole 할 수 있는 주체
C) Role의 만료 시간
D) Role이 수행 가능한 Action

**정답: B**
해설: 신뢰 정책은 "누가 이 Role을 빌릴 수 있는가"를 정의한다. "무엇을 할 수 있는가"는 권한 정책(Permission Policy)이 정의한다. 둘은 짝을 이룬다.

---

**문제 4.** 정책의 Condition 키 중 MFA가 적용된 세션만 허용하려면?

A) `aws:MultiFactorAuthPresent` = `true`
B) `aws:Mfa` = `enabled`
C) `aws:Authenticated` = `true`
D) `aws:SourceArn` = `mfa`

**정답: A**
해설: 표준 글로벌 컨텍스트 키는 `aws:MultiFactorAuthPresent`. `aws:MultiFactorAuthAge`로 MFA 인증 후 경과 시간을 조건화할 수도 있다.

---

**문제 5.** 회사가 관리형 정책과 인라인 정책 중 선택해야 한다. 운영성과 재사용성을 위해 권장되는 것은?

A) 인라인 정책 (1:1)
B) 고객 관리형 정책 (재사용 가능)
C) ACL
D) 보안 그룹

**정답: B**
해설: 인라인은 1:1 attach라 재사용 불가하고 일괄 업데이트가 어렵다. 고객 관리형은 여러 대상에 재사용 + 버전 관리가 가능하다. ACL과 보안 그룹은 IAM 정책과 다른 차원의 통제다.

---

**문제 6.** 크로스 계정 시나리오에서 계정 A의 사용자가 계정 B의 S3 버킷에 접근하려면 권한 설정으로 옳은 것은?

A) 계정 A의 IAM 정책에만 Allow가 있으면 된다
B) 계정 B의 버킷 정책에만 Allow가 있으면 된다
C) 양쪽 계정 모두 명시적 Allow가 있어야 한다
D) 계정 A의 루트 사용자만 가능하다

**정답: C**
해설: 같은 계정 안에서는 한쪽 Allow로도 충분하지만, 크로스 계정에서는 Identity 쪽과 Resource 쪽 모두 명시적 Allow가 필요하다. 이게 IAM 평가 로직의 가장 중요한 함정 중 하나다.
