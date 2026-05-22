# Day 5 - Week 1 복습 + 시나리오 문제 10

📅 날짜: Week 1 (Day 5)
🎯 주제: AWS 기초 / IAM / Organizations 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Week 1 핵심 7개 개념을 자기 말로 설명할 수 있다
- 시나리오 문제 10개를 풀고 약점 도메인을 식별한다

---

## 🧩 사전 지식 (CS 기초)

- **거버넌스 vs 보안**: 거버넌스는 "규칙·가드레일", 보안은 "방어". SCP는 거버넌스에 가깝다.
- **블래스트 래디우스**: 사고가 영향을 미치는 범위. 계정 분리·Multi-AZ가 이걸 줄인다.
- **Least Privilege**: 최소권한. 시험에서 정답을 고르는 가장 강력한 기준.

---

## 📖 한 주 핵심 정리

1. **글로벌 인프라**: Region > AZ > Edge / Local Zones / Outposts / Wavelength.
2. **공동 책임**: Managed 서비스일수록 AWS 책임 ↑.
3. **IAM 4엔터티**: User / Group / Role / Policy.
4. **정책 평가**: Explicit Deny → SCP/Boundary 통과 → Allow → 암묵적 Deny.
5. **STS**: 임시 자격증명. EC2 Role의 백엔드.
6. **Permission Boundary vs SCP**: 둘 다 천장이지만 Boundary는 사용자/Role, SCP는 OU/계정.
7. **Organizations / Control Tower / IAM Identity Center**: 거버넌스 3대 축.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **CloudFront vs Global Accelerator** | HTTP 캐시 | TCP/UDP 가속 |
| **Local Zones vs Wavelength** | 초저지연(특정 도시) | 5G 통신사 엣지 |
| **SCP vs Boundary** | 조직 천장 | 사용자/Role 천장 |
| **인라인 vs 관리형 정책** | 1:1, 재사용 불가 | 재사용 + 버전 |
| **Group vs Role** | 권한 묶음 컨테이너 | 빌릴 수 있는 임시 신원 |

---

## 🏗️ 한 주 통합 아키텍처

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

---

## 📝 시나리오 연습 문제 10

**문제 1.** 한 회사가 "데이터 본사 밖으로 못 나가는" 규제를 받는다. 그럼에도 AWS API/서비스를 그대로 쓰고 싶다. 무엇을 사용하나?

A) Local Zones B) Outposts C) Wavelength D) Direct Connect

**정답: B** — 본사 데이터센터 안의 AWS 하드웨어.

---

**문제 2.** EC2가 S3에 접근하는 권장 방법은?

A) Access Key를 EC2 환경 변수에 저장 B) IAM Role을 인스턴스 프로파일로 연결 C) S3 버킷을 공개로 D) bastion에서 키 복사

**정답: B**.

---

**문제 3.** 어떤 SCP가 OU에 부착되었다. 그 OU 안의 계정 루트 사용자에게도 적용되는가?

A) 적용된다. 단 Management 계정은 예외 B) 루트는 항상 모든 SCP 우회 C) IAM 사용자에게만 적용 D) Resource 정책에만 적용

**정답: A** — 일반 계정 루트는 SCP에 막힌다. Management 계정 본체는 SCP 적용 안 됨.

---

**문제 4.** 외부 SAML IdP로 AWS 콘솔 접근을 통합하려고 한다. 어떤 STS API가 사용되나?

A) AssumeRole B) AssumeRoleWithSAML C) AssumeRoleWithWebIdentity D) GetSessionToken

**정답: B**.

---

**문제 5.** TCP 게임 서버 글로벌 지연 최소화를 위해 정답은?

A) CloudFront B) Global Accelerator C) Route 53 Latency D) Direct Connect

**정답: B** — TCP/UDP는 GA.

---

**문제 6.** 개발팀 리더(개발자 A)가 자기 팀의 IAM 사용자를 만들 수 있게 위임받았다. 단, A가 admin 권한 사용자를 만들지 못하게 막아야 한다. 가장 적합한 도구는?

A) SCP B) Permission Boundary C) Session Policy D) MFA

**정답: B** — 사용자 단위 천장.

---

**문제 7.** 한 회사가 RI 비용을 여러 계정에서 자동으로 공유받고 싶다.

A) Control Tower B) Consolidated Billing C) Service Catalog D) Cost Explorer

**정답: B**.

---

**문제 8.** AdministratorAccess가 부여된 사용자가 KMS 키로 암호화된 객체에 접근 거부됨. 원인 가능성 가장 높은 것은?

A) IAM 정책에 KMS Allow 없음 B) KMS 키 정책에 해당 사용자 미허용 C) S3 ACL D) Bucket Policy

**정답: B** — KMS 키 정책은 IAM Admin도 우회 못함. 키 정책 자체에 명시 허용 필요.

---

**문제 9.** AZ에 대한 설명 중 옳지 않은 것은?

A) AZ는 1개 이상의 데이터센터로 구성 B) 같은 리전 AZ끼리는 고속 연결 C) AZ는 글로벌 단위다 D) 각 AZ는 독립 전원·네트워크

**정답: C** — AZ는 리전 내 단위.

---

**문제 10.** 멀티 계정 SSO + 외부 IdP(Okta) 연동, 한 번 로그인으로 여러 계정 콘솔에 진입. 적합한 도구는?

A) Cognito User Pool B) IAM Identity Center C) Directory Service D) IAM 사용자 + Switch Role

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. IAM과 거버넌스는 SAA 도메인 1 보안의 시작점.
2. 시나리오 키워드 → 정답 매핑이 습관이 되어야 함.
3. 다음 주는 **VPC 네트워킹**. SG/NACL, NAT, Endpoint, TGW, Peering 등 보안 + 복원력 핵심.
