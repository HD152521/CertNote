# Day 4 - AWS Organizations와 멀티 계정 거버넌스: 회사의 규모로 권한을 다스리기

처음 AWS를 쓸 때는 계정 하나로 충분하다. 그런데 조직이 커지면 곧 한계가 온다. 운영팀과 개발팀이 같은 계정을 쓰면 사고가 번지고, 보안팀의 감사 로그가 일반 워크로드 옆에 쌓이며, 비용도 누가 얼마나 쓰는지 알 수 없게 된다. 그래서 어느 단계부터 멀티 계정으로 갈라지는 건 선택이 아니라 필연이다.

이 글에서는 멀티 계정 거버넌스의 핵심 도구들 — **Organizations, SCP, Control Tower, IAM Identity Center** — 를 다룬다. 한 줄로 줄이면 "조직의 규모로 IAM의 천장을 다시 그리는 일"이다. 어제 본 SCP가 왜 그렇게 강력했는지, 그 답은 오늘에 있다.

## 왜 멀티 계정인가: 블래스트 래디우스의 문제

장애나 침해 사고가 났을 때 영향을 받는 범위를 **블래스트 래디우스(Blast Radius)** 라고 부른다. 한 계정 안에 모든 워크로드가 들어 있으면, 한 번의 사고로 모든 게 흔들린다. 계정을 분리하면 사고의 폭발 반경 자체가 줄어든다.

> 💡 **관련 이론**: 블래스트 래디우스라는 개념은 핵폭발의 영향 반경에서 빌려왔지만, 분산 시스템의 **Bulkhead Pattern** 과도 같은 발상이다. 배의 격벽이 한 칸의 침수가 전체 침몰로 번지지 않게 막듯, AWS 계정 분리는 IAM·네트워크·결제·감사를 각각 격리한다. Netflix의 카오스 엔지니어링 원칙과도 같은 출발점이다.

그래서 잘 설계된 AWS 환경은 거의 항상 **Management 계정 + 보안 계정(Log Archive/Audit) + 워크로드 계정(Prod/Dev) + Sandbox** 의 4종 세트로 갈라져 있다.

## Organizations: 계정들의 지도

AWS Organizations는 여러 계정을 하나의 조직으로 묶어주는 서비스다. 트리 구조로 OU(Organizational Unit)를 만들고, 그 OU 안에 계정을 배치한다.

```
  Management Account (Payer)
    └─ Root
         ├─ OU: Security
         │     ├─ Log Archive Account
         │     └─ Audit Account
         ├─ OU: Production
         │     ├─ Prod-Web Account
         │     └─ Prod-Data Account
         └─ OU: Sandbox
               └─ Dev1 Account
```

여기서 가장 중요한 규칙: **워크로드를 Management 계정에서 돌리지 마라.** Management 계정은 청구·SCP·계정 생성을 다루는 신성한 공간이다. 일반 EC2나 RDS가 거기서 돌면 그 계정의 사고가 조직 전체로 번질 수 있다.

> ⚠️ **함정**: "SCP로 루트 계정의 작업까지 막을 수 있나?" → **일반 계정의 루트는 가능**하지만, **Management 계정 본체는 SCP가 적용되지 않는다**. 시험에서 자주 나오는 함정이다. Management 계정이 SCP를 만드는 주체이기 때문에 자기 자신을 막을 수 없는 구조다.

## SCP: 조직 단위의 천장

어제 IAM 평가 흐름에서 가장 위에 있던 SCP가 바로 Organizations의 도구다.

| 특징 | 내용 |
|------|------|
| 적용 단위 | Root / OU / 계정 |
| 영향 | 그 계정의 모든 사용자 + Role (루트 포함, Management 계정은 예외) |
| 동작 | 천장(가드레일) — Allow 자체를 부여하지 않음 |
| 기본값 | `FullAWSAccess` 자동 적용 (Allow-list 모드 가능) |
| 예외 | 청구·Organizations·일부 글로벌 API는 영향 못 줌 |

SCP의 가장 흔한 패턴은 두 가지다. **Deny-list**는 "이 작업만 금지"를 선언하고 나머지는 자동 허용. **Allow-list**는 기본 `FullAWSAccess`를 떼고 특정 서비스만 허용하는 더 엄격한 패턴이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": ["s3:DeleteBucket","s3:DeleteObject"],
    "Resource": "*"
  }]
}
```

이 SCP가 한 OU에 붙으면, 그 OU의 모든 계정에서 S3 버킷·객체 삭제가 불가능해진다. 사용자 정책에 Admin이 있어도 무용지물이다. SCP는 천장이라서 부서질 일이 없다.

## Consolidated Billing: 분리하되 모으는 청구

계정을 분리하면 청구도 따로따로 갈라질 것 같지만, Organizations에 묶이면 자동으로 **통합 결제**가 동작한다. 그리고 통합 결제에는 의외로 큰 경제적 효과가 따라온다.

- **볼륨 디스카운트** 자동 합산 (S3, 데이터 전송 등의 누진 할인)
- **RI / Savings Plans 공유** (한 계정에서 산 RI를 다른 계정의 EC2가 자동 매칭)
- **하나의 청구서** + 계정별 분리 가시성

특히 RI/SP 공유는 비용 최적화의 핵심이다. 운영팀이 산 RI를 개발팀의 동일 패밀리 EC2가 자동으로 사용한다. 회계는 통합되고 거버넌스는 분리된다. 이게 멀티 계정의 가장 큰 매력이다.

## Control Tower: 모범 답안의 자동 배포

Organizations 위에 얹는 자동화 도구가 **Control Tower**다. Landing Zone(여러 계정·OU·기본 가드레일이 미리 설정된 표준 환경)을 클릭 몇 번으로 만들어준다.

- **Landing Zone 자동 구축**: Log Archive, Audit, Sandbox OU가 사전 설계된 패턴으로 깔린다.
- **Account Factory**: 새 계정 발급 시 표준 SCP·IAM Identity Center 권한·VPC 베이스를 자동 적용.
- **Guardrails**: Mandatory / Strongly Recommended / Elective 등 사전 정의된 SCP·Config Rule 묶음.

Control Tower의 가치는 "수작업으로 30개 계정을 똑같이 세팅하는 일을 자동화"한다는 점이다. 사람이 하면 반드시 실수가 끼고, 계정마다 보안 베이스라인이 달라진다.

## IAM Identity Center: 멀티 계정 SSO의 표준

여러 계정을 가진 사용자가 매번 계정별로 IAM 사용자를 만들고 각각 로그인하는 건 비효율적이고 위험하다. **IAM Identity Center** (구 AWS SSO)가 이를 해결한다.

- 외부 IdP(Okta, AzureAD)와 SAML/SCIM으로 연동, 또는 내장 디렉터리 사용.
- **Permission Set**: 어떤 Role을 어느 계정에 적용할지 정의하는 템플릿.
- 사용자는 한 번 로그인하면 권한이 있는 모든 계정에 단일 포털에서 진입 가능.

> 💡 **관련 이론**: IAM Identity Center가 외부 IdP와 통합되는 표준 프로토콜은 **SAML 2.0**(인증 어설션)과 **SCIM**(사용자/그룹 프로비저닝)이다. SAML은 2005년 OASIS 표준으로 정착한 엔터프라이즈 SSO의 사실상 표준이고, SCIM은 IdP에서 변경된 사용자/그룹을 자동으로 SP(AWS)에 반영하는 동기화 프로토콜이다. 두 프로토콜이 함께 동작해야 SSO가 진짜로 굴러간다.

## RAM: 리소스를 계정 간에 공유하기

계정이 갈라지면 "이 VPC 서브넷을 다른 계정도 같이 쓸 수 있게 해줘" 같은 요구가 생긴다. 이때 등장하는 게 **AWS Resource Access Manager (RAM)** 다.

| 공유 가능한 것 | 용도 |
|----------------|------|
| VPC 서브넷 | 같은 VPC를 여러 계정이 공유 |
| Transit Gateway | 계정 간 네트워크 허브 공유 |
| License Manager | 라이선스 공유 |
| Route 53 Resolver | DNS 규칙 공유 |

RAM은 **공유**이지 **연결**이 아니다. VPC Peering이나 Transit Gateway는 서로 다른 VPC를 연결하는 도구지만, RAM은 같은 리소스를 여러 계정이 함께 보는 패턴이다. 시험에서 자주 헷갈리는 부분이다.

## 표준 Landing Zone 패턴

이 모든 걸 합치면 잘 설계된 멀티 계정 환경은 이런 모습이다.

```
[ 표준 Landing Zone 패턴 ]

   Management Account (Payer)
      ├─ Organizations 관리
      ├─ Control Tower
      ├─ IAM Identity Center
      └─ Consolidated Billing

   OU: Security
     ├─ Log Archive (CloudTrail/Config 로그 S3)
     └─ Audit (GuardDuty/SecurityHub Master)

   OU: Workload
     ├─ Prod
     │   └─ VPC + EC2 + RDS
     └─ Dev
         └─ ...

   OU: Sandbox
     └─ 예산 한도 SCP / 자동 클린업
```

> 💡 **암기 팁**: 멀티 계정 = "**Management + Security(Log Archive/Audit) + Workload(Prod/Dev) + Sandbox**" 4종 세트. 시험에서 어떤 계정에 무엇을 둘지 묻는 시나리오는 거의 이 패턴 안에서 답이 나온다.

## CLI로 OU와 계정 만들어보기

```bash
# OU 생성
aws organizations create-organizational-unit \
  --parent-id r-abcd --name Sandbox

# 계정 생성 (이메일 별칭 사용)
aws organizations create-account \
  --account-name "Sandbox-Dev1" \
  --email "aws+sandbox-dev1@example.com"

# SCP 생성 (S3 삭제 차단 예시)
cat > deny-s3-delete.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": ["s3:DeleteBucket","s3:DeleteObject"],
    "Resource": "*"
  }]
}
EOF

aws organizations create-policy \
  --name DenyS3Delete --type SERVICE_CONTROL_POLICY \
  --content file://deny-s3-delete.json
```

새 계정 생성은 비동기로 처리된다. `describe-create-account-status`로 상태를 확인할 수 있다. 그리고 이메일 별칭 트릭(`aws+sandbox-dev1@example.com`) 패턴은 실무에서 정말 자주 쓴다. 단일 메일박스로 여러 계정의 알림을 받기 위함이다.

## 정리

멀티 계정 거버넌스는 IAM의 천장을 조직 규모로 끌어올린 것이다. **Organizations** 가 트리 구조를, **SCP** 가 조직 천장을, **Control Tower** 가 자동 Landing Zone을, **IAM Identity Center** 가 단일 로그인을 책임진다. 그리고 **RAM** 으로 계정 간 리소스를 공유하고, **Consolidated Billing** 으로 청구를 모은다. 이 다섯 가지의 조합으로 회사 규모의 AWS 환경이 굴러간다.

다음 글에서는 Week 1의 모든 내용을 시나리오 문제로 점검한다. 글로벌 인프라, 공동 책임, IAM 4대 엔터티, 정책 평가, STS, 그리고 오늘의 거버넌스 — 이 모든 게 시험에서는 어떻게 한 줄짜리 시나리오로 변형돼서 나오는지 직접 확인해본다.

---

## 📝 연습 문제

**문제 1.** 회사가 멀티 계정으로 운영하면서 RI(Reserved Instance) 비용을 최대한 활용하려고 한다. 어떤 기능이 필요한가?

A) IAM Identity Center
B) Consolidated Billing
C) Control Tower
D) Service Catalog

**정답: B**
해설: 통합 결제는 Organizations 가입 계정 간에 RI/SP를 자동 공유한다. 한 계정에서 산 RI를 다른 계정의 동일 패밀리 EC2가 자동으로 매칭해 사용하므로 비용 최적화에 직결된다.

---

**문제 2.** 신규 AWS 계정을 표준 패턴으로 빠르게 만들고 가드레일을 자동 적용하려면?

A) CloudFormation StackSets
B) Control Tower Account Factory
C) Organizations API + IAM 정책
D) Service Catalog

**정답: B**
해설: Control Tower의 Account Factory가 표준 계정 발급 + 가드레일 자동 적용의 표준 답이다. CloudFormation StackSets와 Service Catalog는 인프라 배포의 보조 도구로 함께 쓰지만, 계정 생성 자체의 자동화는 Account Factory가 맡는다.

---

**문제 3.** 한 OU 내 모든 계정에서 S3 객체 삭제를 차단하려면?

A) S3 버킷 정책 일괄 적용
B) IAM 사용자별 정책 작성
C) 해당 OU에 Deny SCP 부착
D) Block Public Access

**정답: C**
해설: 조직 가드레일은 SCP가 가장 깔끔하다. 버킷별·사용자별로 일일이 적용하면 누락이 생기고, Block Public Access는 외부 공개 차단이지 삭제 차단과는 다르다.

---

**문제 4.** 다중 계정 SSO 로그인을 외부 IdP(Okta)와 연동하는 가장 적합한 도구는?

A) Cognito User Pool
B) IAM 사용자
C) IAM Identity Center
D) Directory Service Simple AD

**정답: C**
해설: 다중 계정 + 외부 IdP 연동은 IAM Identity Center(SAML/SCIM)이 표준이다. Cognito는 모바일·웹 앱 사용자 인증용이고, Directory Service는 AD 호환 디렉터리 자체를 제공한다.

---

**문제 5.** 멀티 계정 환경에서 동일 VPC 서브넷을 여러 계정이 공유해서 사용하고 싶다. 어떤 서비스를 사용하나?

A) VPC Peering
B) RAM (Resource Access Manager)
C) Transit Gateway
D) Direct Connect

**정답: B**
해설: RAM은 서브넷·TGW·License 등을 조직 계정에 공유한다. Peering과 TGW는 서로 다른 VPC를 "연결"하는 개념이고, RAM은 같은 리소스를 여러 계정이 "공유"하는 개념이다.

---

**문제 6.** Management 계정에 대한 설명으로 옳은 것은?

A) Management 계정에도 SCP가 동일하게 적용된다
B) Management 계정에서 일반 워크로드를 운영하는 것이 권장된다
C) Management 계정은 SCP의 영향을 받지 않으며 워크로드 운영을 피해야 한다
D) Management 계정은 청구 정보만 다루며 IAM은 다루지 않는다

**정답: C**
해설: Management 계정 본체에는 SCP가 적용되지 않는다(자기 자신을 막을 수 없는 구조). 그리고 블래스트 래디우스를 줄이기 위해 일반 워크로드는 Management 계정에 두지 않는 게 표준이다.

---

**문제 7.** Control Tower의 Guardrails 분류에 해당하지 않는 것은?

A) Mandatory
B) Strongly Recommended
C) Elective
D) Critical

**정답: D**
해설: Control Tower의 Guardrails는 Mandatory / Strongly Recommended / Elective 세 단계로 분류된다. Mandatory는 해제 불가의 강제 가드레일, Strongly Recommended는 모범 사례, Elective는 선택적 적용이다. "Critical"이라는 분류는 존재하지 않는다.
