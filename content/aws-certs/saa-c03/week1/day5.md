# Day 5 - Week 1 종합: 시나리오 문제로 점검하는 AWS 기초와 IAM

한 주 동안 글로벌 인프라부터 멀티 계정 거버넌스까지 훑었다. 머리로는 다 안다고 느껴도, SAA-C03 시험은 항상 한 줄짜리 시나리오로 변형해서 묻는다. "본사 밖으로 데이터가 못 나간다"라는 한 문장에서 Outposts가 떠올라야 하고, "TCP 게임 서버 글로벌 지연 최소화"에서 Global Accelerator가 즉시 튀어나와야 한다.

이 글은 Week 1의 핵심 7개 개념을 짧게 정리한 뒤, 시나리오 문제 10개로 약점 도메인을 식별하는 게 목적이다. 풀면서 어디서 막히는지 확인하고, 막힌 day로 돌아가서 다시 읽으면 한 주가 완성된다.

## 한 주의 핵심을 7줄로

1. **글로벌 인프라**: Region > AZ > Edge / Local Zones / Outposts / Wavelength. AZ가 HA 설계의 최소 단위.
2. **공동 책임 모델**: AWS는 하이퍼바이저 아래, 고객은 그 위. Managed 서비스일수록 AWS 책임이 위로 올라온다.
3. **IAM 4대 엔터티**: User(영구 신원) / Group(묶음) / Role(빌리는 신원) / Policy(JSON 문서).
4. **정책 평가**: Explicit Deny → SCP/Boundary 통과 → Allow → 그 외 암묵 Deny. Deny가 모든 것을 이긴다.
5. **STS**: 임시 자격 증명의 발급기. EC2 Role, EKS IRSA, SAML SSO의 공통 기반.
6. **세 가지 천장**: SCP(조직) / Boundary(사용자·Role) / Session Policy(세션). 모두 천장이지 부여가 아님.
7. **거버넌스 3축**: Organizations / Control Tower / IAM Identity Center. 멀티 계정 환경의 표준 구성.

## 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **CloudFront vs Global Accelerator** | HTTP 캐시 | TCP/UDP 가속 |
| **Local Zones vs Wavelength** | 초저지연(특정 도시) | 5G 통신사 엣지 |
| **SCP vs Permission Boundary** | 조직 천장 | 사용자/Role 천장 |
| **인라인 vs 관리형 정책** | 1:1, 재사용 불가 | 재사용 + 버전 |
| **Group vs Role** | 권한 묶음 컨테이너 | 빌릴 수 있는 임시 신원 |
| **AssumeRole vs AssumeRoleWithWebIdentity** | 같은/다른 계정 Role | OIDC IdP (EKS IRSA) |
| **RAM vs VPC Peering** | 리소스 공유 | VPC 연결 |

## Week 1을 하나의 그림으로

한 주 동안 본 모든 개념을 한 장의 다이어그램으로 합치면 이런 모습이다.

```
[ Week 1 모든 개념 합쳐서 본 그림 ]

  Management Account
   ├─ Org / SCP (천장)
   ├─ Control Tower / IAM Identity Center
   └─ Consolidated Billing
        │
        ▼
  Workload Account (Region: ap-northeast-2)
   └─ VPC + AZ-a/b/c
        ├─ EC2 ── Instance Profile ── IAM Role (Trust=ec2)
        │            └─ STS Temp Creds
        └─ S3 ── 리소스 정책 + KMS 키 정책

  공동 책임: AWS = 하이퍼바이저↓ / 고객 = 게스트 OS↑
```

위에서 아래로 천장이 깔리고, 그 안에서 IAM Role과 임시 자격 증명이 실제로 워크로드를 굴린다. 시험의 모든 문제는 이 그림의 어딘가에 끼워 넣을 수 있다.

> 💡 **관련 이론**: 보안의 고전적 원칙인 **Defense in Depth(심층 방어)** 가 정확히 이 구조다. SCP·Boundary·IAM 정책·Resource 정책·KMS 키 정책이 겹겹이 쌓여 있어서, 한 층이 뚫려도 다음 층이 막는다. 단일 통제로는 결코 안전을 담보할 수 없다는 NSA·NIST의 보안 운영 모델과 정확히 맞물린다.

> 💡 **암기 팁**: 시험에서 "권한 거부 원인"을 묻는 문제가 나오면 위에서 아래로 의심해라 — SCP → Boundary → Deny 정책 → Resource 정책 → KMS 키 정책. 이 순서가 곧 평가 흐름이고, 곧 의심의 우선순위다.

## 시험에서 자주 나오는 키워드 매핑

| 시나리오 키워드 | 정답 후보 |
|----------------|-----------|
| "본사 데이터센터", "데이터가 외부로 못 나감" | Outposts |
| "초저지연", "1ms", "특정 도시" | Local Zones |
| "5G 모바일" | Wavelength |
| "TCP/UDP 글로벌 가속", "게임 서버" | Global Accelerator |
| "HTTP 정적 콘텐츠 캐시" | CloudFront |
| "EC2가 S3에 접근" | IAM Role + Instance Profile |
| "위임된 관리자, 자기보다 강한 권한 못 만들게" | Permission Boundary |
| "조직 전체 차단" | SCP |
| "외부 IdP, 멀티 계정 SSO" | IAM Identity Center |
| "RI 자동 공유" | Consolidated Billing |
| "EKS Pod별 권한" | AssumeRoleWithWebIdentity (IRSA) |
| "SAML AD 연동" | AssumeRoleWithSAML |
| "여러 계정이 같은 VPC 서브넷 공유" | RAM |

이 표는 외워두면 시험 시간을 크게 줄여준다. 한 문장을 읽고 키워드가 잡히면 답이 떨어진다.

---

## 📝 시나리오 연습 문제 10

**문제 1.** 한 회사가 "데이터가 본사 밖으로 못 나가는" 규제를 받는다. 그럼에도 AWS API/서비스를 그대로 쓰고 싶다. 무엇을 사용하나?

A) Local Zones
B) Outposts
C) Wavelength
D) Direct Connect

**정답: B**
해설: 본사 데이터센터 안에 AWS 하드웨어를 두고 같은 API로 운영하는 게 Outposts. "데이터가 외부로 못 나감" = Outposts. Direct Connect는 본사와 AWS를 잇는 전용선이지 데이터를 본사 안에 두는 도구가 아니다.

---

**문제 2.** EC2가 S3에 접근하는 권장 방법은?

A) Access Key를 EC2 환경 변수에 저장
B) IAM Role을 인스턴스 프로파일로 연결
C) S3 버킷을 공개로 설정
D) Bastion에서 키 복사

**정답: B**
해설: 자격 증명을 코드·환경 변수에 두는 패턴은 시험과 실무 모두에서 금기다. EC2에는 Instance Profile로 감싼 IAM Role을 연결한다. 그 Role의 Trust Policy는 `ec2.amazonaws.com`을 Principal로 한다.

---

**문제 3.** 어떤 SCP가 OU에 부착되었다. 그 OU 안의 계정 루트 사용자에게도 적용되는가?

A) 적용된다. 단 Management 계정은 예외
B) 루트는 항상 모든 SCP 우회
C) IAM 사용자에게만 적용
D) Resource 정책에만 적용

**정답: A**
해설: 일반 계정의 루트는 SCP에 막힌다. 하지만 Management 계정 본체는 SCP가 적용되지 않는다(자기 자신을 막을 수 없는 구조). 이 예외가 시험에서 자주 나오는 함정이다.

---

**문제 4.** 외부 SAML IdP로 AWS 콘솔 접근을 통합하려고 한다. 어떤 STS API가 사용되나?

A) AssumeRole
B) AssumeRoleWithSAML
C) AssumeRoleWithWebIdentity
D) GetSessionToken

**정답: B**
해설: SAML 2.0 IdP(AD FS, Okta SAML 등) 연동은 AssumeRoleWithSAML. AssumeRoleWithWebIdentity는 OIDC 전용(Google, Cognito, EKS IRSA).

---

**문제 5.** TCP 게임 서버 글로벌 지연 최소화를 위해 정답은?

A) CloudFront
B) Global Accelerator
C) Route 53 Latency
D) Direct Connect

**정답: B**
해설: TCP/UDP 글로벌 가속은 Global Accelerator. CloudFront는 HTTP 캐시 중심이라 게임 트래픽에 부적합. Route 53 Latency는 DNS 단의 라우팅이지 트래픽 가속이 아니다.

---

**문제 6.** 개발팀 리더(개발자 A)가 자기 팀의 IAM 사용자를 만들 수 있게 위임받았다. 단, A가 admin 권한 사용자를 만들지 못하게 막아야 한다. 가장 적합한 도구는?

A) SCP
B) Permission Boundary
C) Session Policy
D) MFA

**정답: B**
해설: 사용자 단위 천장이 Permission Boundary. 위임된 관리자가 만드는 사용자에게 미리 천장을 씌워서 자기보다 강한 권한이 가지 못하게 막는 표준 패턴이다.

---

**문제 7.** 한 회사가 RI 비용을 여러 계정에서 자동으로 공유받고 싶다.

A) Control Tower
B) Consolidated Billing
C) Service Catalog
D) Cost Explorer

**정답: B**
해설: 통합 결제는 Organizations 가입 계정 간에 RI/SP를 자동 매칭·공유한다. Cost Explorer는 분석 도구일 뿐이고, Control Tower는 Landing Zone 자동화 도구다.

---

**문제 8.** AdministratorAccess가 부여된 사용자가 KMS 키로 암호화된 객체에 접근 거부됨. 원인 가능성 가장 높은 것은?

A) IAM 정책에 KMS Allow 없음
B) KMS 키 정책에 해당 사용자 미허용
C) S3 ACL
D) Bucket Policy

**정답: B**
해설: KMS 키 정책은 IAM Admin도 우회할 수 없는 자체 권한 모델이다. 키 정책에 명시 허용이 없으면 admin도 막힌다. 시험에서 가장 자주 나오는 KMS 관련 함정이다.

---

**문제 9.** AZ에 대한 설명 중 옳지 않은 것은?

A) AZ는 1개 이상의 데이터센터로 구성
B) 같은 리전 AZ끼리는 고속 연결
C) AZ는 글로벌 단위다
D) 각 AZ는 독립 전원·네트워크

**정답: C**
해설: AZ는 리전 내 단위다. 글로벌 단위가 아니라 한 Region 안에 3개 이상이 표준. 같은 리전 AZ끼리는 저지연 전용선으로 묶여 있어서 Multi-AZ 동기 복제가 가능하다.

---

**문제 10.** 멀티 계정 SSO + 외부 IdP(Okta) 연동, 한 번 로그인으로 여러 계정 콘솔에 진입. 적합한 도구는?

A) Cognito User Pool
B) IAM Identity Center
C) Directory Service
D) IAM 사용자 + Switch Role

**정답: B**
해설: 멀티 계정 + 외부 IdP = IAM Identity Center(구 AWS SSO). SAML/SCIM으로 IdP와 연동하고, Permission Set 템플릿으로 어느 계정에 어떤 Role을 적용할지 정의한다.

---

**문제 11.** EKS 클러스터에서 Pod별로 서로 다른 IAM 권한을 부여하려고 한다. 표준 패턴은?

A) 노드 IAM Role에 모든 권한 부여 후 앱에서 분기
B) Access Key를 Secret에 저장해서 마운트
C) IRSA — ServiceAccount의 OIDC 토큰으로 AssumeRoleWithWebIdentity
D) EKS Cluster Role에 모든 권한 부여

**정답: C**
해설: IRSA(IAM Roles for Service Accounts)는 OIDC 토큰을 AssumeRoleWithWebIdentity로 교환해 Pod 단위 IAM 권한을 부여하는 EKS 표준 패턴. 노드 단위로 권한을 한꺼번에 주는 방식은 최소 권한 원칙 위배다.

---

**문제 12.** 한 회사가 멀티 계정에서 동일한 거버넌스 베이스라인을 신규 계정마다 자동으로 적용하고 싶다. 그리고 표준 Log Archive/Audit OU도 함께 구축하고 싶다. 가장 적합한 도구는?

A) Organizations API + 수작업 SCP 부착
B) CloudFormation StackSets만 사용
C) Control Tower
D) AWS Config Aggregator

**정답: C**
해설: Control Tower가 Landing Zone(표준 OU + 가드레일 + 계정 발급 자동화)을 한 번에 제공한다. StackSets·Config는 보조 도구로 함께 쓰지만 Landing Zone 자체의 자동 구축은 Control Tower의 영역이다.

---

## 다음 주 예고

Week 1에서 본 IAM과 거버넌스는 SAA 도메인 1(보안)의 출발점이었다. 다음 주는 **VPC 네트워킹** 으로 넘어간다. **Security Group과 NACL의 차이**, **NAT Gateway vs NAT Instance**, **VPC Endpoint로 S3·DynamoDB 사설 접근**, **Transit Gateway·VPC Peering**, **Direct Connect와 Site-to-Site VPN** — 네트워크는 보안과 복원력 모두의 핵심이라 시험 비중도 가장 높다.

이번 주에 잡은 IAM의 시각으로 다음 주의 VPC를 보면 흐름이 자연스럽게 이어진다. 누구에게 무엇을 허용할지를 IAM이 다뤘다면, 어디서 어디로 트래픽이 흐를지를 VPC가 다룬다. 클라우드 보안은 결국 이 두 축이 만나는 지점에서 완성된다.
