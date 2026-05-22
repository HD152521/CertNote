# Day 2 - IAM 기초: 사용자, 그룹, 역할, 정책

📅 날짜: Week 1 (Day 2)
🎯 주제: IAM의 기본 엔터티와 정책 구조
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IAM의 4가지 핵심 엔터티(User / Group / Role / Policy)를 구분한다
- 신원 기반 정책 vs 리소스 기반 정책의 차이를 설명한다
- 최소 권한 원칙으로 정책을 작성할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **인증(Authentication) vs 인가(Authorization)**: "누군가?" vs "할 수 있나?". IAM은 둘 다 다룬다.
- **RBAC vs ABAC**: Role 기반 vs 속성(태그) 기반 권한. IAM은 둘 다 지원.
- **JSON 정책 문서**: IAM 정책은 JSON. Effect / Action / Resource / Condition 키 4개를 외워라.
- **STS(Security Token Service)**: 임시 자격증명 발급기. AssumeRole의 백엔드.
- **위임(Delegation)**: 한 주체에게 권한을 빌려주는 것. IAM Role의 본질.

---

## 📖 이론 내용

### 1. IAM 4대 엔터티

| 엔터티 | 정의 | 자격증명 |
|--------|------|----------|
| **User** | 사람/앱 같은 영구 신원 | 비밀번호, Access Key |
| **Group** | User들의 묶음. 정책 부여 단위 | (없음, 컨테이너만) |
| **Role** | 임시로 빌릴 수 있는 신원 | STS Temp Credential |
| **Policy** | JSON 권한 문서 | - |

> 💡 Group은 "Group에 로그인" 불가. 사람이 아니다. 정책 부여 편의용 컨테이너.

### 2. 정책 종류

| 종류 | 어디에 붙나? | 누가 평가에 참여하나? |
|------|--------------|------------------------|
| **Identity-based** (관리형/인라인) | User, Group, Role | 항상 |
| **Resource-based** | S3 버킷, SQS, KMS, Lambda, IAM Role의 신뢰 정책 | 항상 |
| **Permission Boundary** | User/Role | 최대 권한 제한선(상한) |
| **SCP (Service Control Policy)** | Organizations OU/계정 | 계정 전체 상한선 |
| **Session Policy** | AssumeRole 시 전달 | 세션 동안 상한 |
| **ACL** | S3, VPC | 레거시. 가능하면 정책 사용 |

### 3. 정책 문서 핵심 구조

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

- **Effect**: Allow / Deny
- **Action**: 서비스명:작업명 (`s3:GetObject`, `ec2:RunInstances`)
- **Resource**: ARN. `*` 가능하나 최소권한 위배
- **Condition**: IP, MFA, 시간, 태그 등으로 좁히기

### 4. IAM Role의 신뢰 정책

Role은 정책이 두 개다.
- **Trust Policy(신뢰 정책)** — *누가 이 Role을 빌릴 수 있나?*
- **Permission Policy(권한 정책)** — *빌린 뒤 무엇을 할 수 있나?*

EC2가 S3에 접근하려면 → EC2가 빌릴 수 있는 Role(Trust=`ec2.amazonaws.com`) + S3 권한 정책.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **루트 계정** | 모든 권한 보유. MFA 켜고 봉인. 청구·계정 폐쇄 등 14개만 가능 | "루트로만 가능한 작업" 출제 |
| **Access Key** | 절대 코드에 하드코딩 금지. IAM Role 또는 IAM Identity Center 사용 | 시나리오 정답 키워드 |
| **MFA** | 가상 / U2F / 하드웨어 / IAM SMS(비추천) | MFA 강제는 Condition으로 |
| **AWS 관리형 vs 고객 관리형** | AWS 관리형은 AWS가 업데이트. 고객 관리형은 직접 관리. 인라인은 1:1 attach | 운영 효율은 관리형이 좋음 |
| **인스턴스 프로파일** | EC2에 Role을 붙이는 컨테이너. 동일 이름 권장 | 시험에서 "EC2가 S3에 접근" 문제 정답 |

> ⚠️ **함정**: "Access Key를 git에 올린 다음 어떻게 막을까?" → ① 즉시 비활성화 ② 키 삭제 ③ 이후 IAM Role로 마이그레이션. GuardDuty가 자동 탐지하기도 한다.

> 💡 **암기 팁**: "정책은 4개 키워드 — VESAR" → Version / Effect / Statement / Action(+Resource).

### 관련 서비스 Cross-Reference

- 정책 평가 / 권한 경계 → **Day 3 IAM 심화**
- SCP / Organizations → **Day 4**
- KMS 키 정책 → **Week 8 보안**
- S3 버킷 정책 → **Week 4 S3 보안**

---

## 🏗️ 아키텍처 다이어그램

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


[ EC2 → S3 패턴 (정답 패턴) ]

  EC2 Instance
    └─ Instance Profile (=Role A)
         ├─ Trust Policy: ec2.amazonaws.com
         └─ Permission Policy: s3:GetObject on my-bucket/*
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EC2 → AWS 서비스 접근은 무조건 IAM Role.** 키 하드코딩 답 등장하면 오답.
2. ⭐ **Role은 Trust + Permission 두 정책** 필요.
3. ⭐ **Group에 로그인 불가.** Group은 권한 부여 단위.
4. ⭐ **루트 계정**은 MFA + 봉인. 일상 사용 금지.
5. ⭐ **최소권한**: `*` 대신 명시적 Action / Resource / Condition.

---

## 💻 실제 예시 - AWS CLI

```bash
# 사용자 생성 + 그룹 가입 + 관리형 정책 부여
aws iam create-user --user-name alice
aws iam create-group --group-name Developers
aws iam add-user-to-group --user-name alice --group-name Developers
aws iam attach-group-policy \
  --group-name Developers \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# EC2가 사용할 Role 생성 (trust.json은 ec2.amazonaws.com 신뢰)
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

**trust.json 예시:**
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

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스 내부 애플리케이션이 S3에 접근해야 한다. 가장 권장되는 방법은?

A) 인스턴스 안에 Access Key를 환경 변수로 넣는다
B) IAM 사용자에게 키를 발급해 코드에 포함한다
C) EC2에 IAM Role을 연결한다
D) S3 버킷을 모두 공개로 설정한다

**정답: C**
해설: 자격 증명을 코드/환경 변수에 두는 것은 금지. EC2에는 Role(인스턴스 프로파일)을 연결한다.

---

**문제 2.** 다음 중 IAM 그룹에 대한 설명으로 옳지 않은 것은?

A) 정책을 그룹에 부여하면 멤버에게 상속된다
B) 그룹은 다른 그룹의 멤버가 될 수 있다
C) 그룹은 사람이 아니므로 로그인할 수 없다
D) 그룹은 정책 관리의 편의를 위한 컨테이너다

**정답: B**
해설: 그룹은 그룹의 멤버가 될 수 없다(중첩 불가).

---

**문제 3.** IAM Role의 신뢰 정책(Trust Policy)이 정의하는 것은?

A) Role이 접근 가능한 리소스
B) Role을 AssumeRole 할 수 있는 주체
C) Role의 만료 시간
D) Role이 수행 가능한 Action

**정답: B**
해설: 신뢰 정책은 "누가 이 Role을 빌릴 수 있는가"를 정의. 권한 정책이 "무엇을 할 수 있는가"를 정의.

---

**문제 4.** 정책의 Condition 키 중 MFA가 적용된 세션만 허용하려면?

A) `aws:MultiFactorAuthPresent` = `true`
B) `aws:Mfa` = `enabled`
C) `aws:Authenticated` = `true`
D) `aws:SourceArn` = `mfa`

**정답: A**
해설: 표준 글로벌 컨텍스트 키는 `aws:MultiFactorAuthPresent`.

---

**문제 5.** 회사가 관리형 정책과 인라인 정책 중 선택해야 한다. 운영성과 재사용성을 위해 권장되는 것은?

A) 인라인 정책 (1:1)
B) 고객 관리형 정책 (재사용 가능)
C) ACL
D) 보안 그룹

**정답: B**
해설: 인라인은 1:1 attach라 재사용 불가. 고객 관리형은 여러 대상에 재사용 + 버전 관리 가능.

---

## 📌 오늘의 요약

1. IAM의 4대 엔터티: User / Group / Role / Policy.
2. Role은 Trust + Permission 두 정책으로 구성, EC2-→AWS 접근의 표준 답.
3. 정책 4대 키: Effect / Action / Resource / Condition.
4. 최소 권한 + MFA + Role 사용이 시험과 실무의 정답.
5. 인라인보다 고객 관리형 정책이 운영성 우수.
