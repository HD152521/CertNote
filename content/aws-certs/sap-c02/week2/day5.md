# Day 10 - Week 2 복습 + 시나리오 10문항

📅 날짜: Week 2 (Day 5)
🎯 주제: 멀티 계정 아키텍처 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Week 2 핵심을 한 줄씩 정리
- Org·SCP·CT·IDC 비교
- 시나리오 10문항으로 도메인 1 약점 진단

---

## 🧩 사전 지식 (CS 기초)

- **Defense in Depth**: 다층 방어 — SCP + IAM + Resource Policy + Network 모두 조합.
- **Separation of Duties**: 직무 분리 — Log/Audit 계정과 Workload 계정 분리.

---

## 📖 Week 2 핵심 7개

1. **멀티 계정 동기** = 격리·청구·규제·운영
2. **Management 계정**은 결제·Org 관리만, 워크로드 X
3. **SCP** = ceiling, Deny-list 권장, 글로벌 서비스 NotAction 예외
4. **Control Tower** = Landing Zone 자동 (Log/Audit 계정 + 가드레일 3종)
5. **가드레일** = Preventive(SCP) / Detective(Config) / Proactive(CFN Hook)
6. **IAM Identity Center** = 멀티 계정 SSO 표준, Permission Set + SCIM
7. **Consolidated Billing** = RI/SP 공유 + 볼륨 할인

---

## 🔄 비교표

| A | B | 차이 |
|---|---|------|
| **Org SCP** vs **IAM Policy** | OU/계정 ceiling vs Principal 권한 | SCP는 Allow X |
| **Preventive** vs **Detective** | 사전 차단(SCP) vs 사후 탐지(Config) | 보완 관계 |
| **Account Factory** vs **AFT** | 콘솔/베이스 vs Terraform IaC | GitOps는 AFT |
| **IDC** vs **Cognito** | 직원·관리자 vs 고객 사용자 | 절대 헷갈리지 X |
| **Permission Set** vs **IAM Role** | IDC 추상화 vs 실제 Role | PS 매핑이 Role 자동 생성 |
| **Log Archive** vs **Audit** | 로그 적재 vs 보안 분석 마스터 | Object Lock S3는 Log Archive |

---

## 📝 시나리오 연습 문제 10개

---

**문제 1.** 5개 OU·100개 계정. 일부 OU에 비인가 리전 사용 금지. Best?

A) IAM 정책 일괄
B) Org SCP에 `aws:RequestedRegion` Deny + 글로벌 서비스 NotAction
C) NACL
D) Config Rule만

**정답: B**
해설: SCP가 사전 강제. Config는 탐지만.

---

**문제 2.** 새 OU 생성 후 FullAWSAccess SCP 제거, Allow-list로 EC2만 허용. 그 계정에서 S3 호출은?

A) 허용 (S3는 글로벌)
B) 거부 (SCP에 S3 Allow 없음)
C) Resource Policy로 풀림
D) IAM Policy 우선

**정답: B**
해설: SCP에 액션이 없으면 IAM 정책이 뭘 줘도 결과는 Deny.

---

**문제 3.** Okta 사용자 + 50개 AWS 계정 + 콘솔/CLI SSO. 가장 적절한?

A) 각 계정 SAML 등록
B) IAM Identity Center + Okta (SAML + SCIM)
C) Cognito 직원용
D) AD Connector + IAM User

**정답: B**
해설: IDC가 표준.

---

**문제 4.** 신규 계정 생성 시 표준 베이스라인(CloudTrail, IAM Role, 태그) 자동 적용. Terraform 사용. Best?

A) Account Factory (콘솔)
B) AFT (Account Factory for Terraform)
C) CfCT
D) StackSets만

**정답: B**
해설: Terraform 기반 자동 배포 = AFT.

---

**문제 5.** 회사 정책: 모든 EBS는 KMS 암호화 필수. 배포 시도부터 차단. 어떤 가드레일?

A) Detective (Config Rule)
B) Proactive (CloudFormation Hook)
C) Preventive (SCP)
D) Tag Policy

**정답: B**
해설: 배포 전 차단 = Proactive(CFN Hook). SCP도 가능하지만 IaC 흐름에서 가장 깔끔.

---

**문제 6.** 100개 계정의 CloudTrail 로그를 변경 불가능하게 한 곳에 모으려면?

A) 각 계정 자체 S3
B) Log Archive 계정 + S3 Object Lock + Org Trail
C) CloudWatch Logs 통합
D) Athena 직접

**정답: B**
해설: Log Archive 패턴 + Object Lock 표준.

---

**문제 7.** 개발자 그룹이 자유롭게 실험할 OU. 비용 폭주 위험. Best?

A) Workloads OU
B) Sandbox OU + SCP(고비용 인스턴스 Deny) + Budget Alert
C) Management 계정에 IAM User
D) Direct Connect + 별도 VPC

**정답: B**
해설: Sandbox OU 패턴 + 비용 가드레일.

---

**문제 8.** CFO가 부서별 비용을 분리 청구하려고 함. Best?

A) Consolidated Billing + 부서별 OU + 태그 + Cost Allocation Tag
B) 각 부서 별도 Org
C) Linked Account 폐지
D) Trusted Advisor

**정답: A**
해설: Org + 태그 기반 비용 분류 표준.

---

**문제 9.** CloudTrail을 누군가 비활성화하지 못하게 보장. Best?

A) IAM 정책으로만
B) SCP에 `cloudtrail:StopLogging`, `DeleteTrail` 명시적 Deny
C) NACL
D) WAF

**정답: B**
해설: SCP Deny는 어떤 IAM Allow도 뚫지 못함.

---

**문제 10.** 회사가 Org 가입 직후 Landing Zone 빠르게 갖추고 Audit·Log 표준 자동화. Best?

A) 직접 구축 (수개월)
B) Control Tower
C) Service Catalog
D) Trusted Advisor

**정답: B**
해설: Control Tower가 Landing Zone 자동.

---

## 📌 다음 주 예고

**Week 3: 고급 네트워킹**
- VPC Peering vs Transit Gateway
- Direct Connect 이중화·LAG
- Site-to-Site VPN, Client VPN
- PrivateLink, VPC Endpoint, Service Endpoint

---

## 📌 오늘의 요약

1. Org + SCP + Control Tower + IDC가 멀티 계정 표준 스택
2. SCP는 ceiling, Deny-list가 표준
3. 가드레일 3종(Preventive/Detective/Proactive) 조합
4. Log Archive = Object Lock S3, Audit = Security Hub Master
5. Consolidated Billing + Cost Allocation Tag으로 비용 분리
