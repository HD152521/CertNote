# Day 5 - Week 1 복습 + 시나리오 10문항

📅 날짜: Week 1 (Day 5)
🎯 주제: SAP 전략·IAM·VPC·EC2 핵심 정리 + 시나리오 응용
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 이번 주 핵심 5개 개념을 한 줄로 요약할 수 있다
- 헷갈리기 쉬운 비교를 표로 정리한다
- Pro 스타일 시나리오 10문항을 풀고 약점을 식별한다

---

## 🧩 사전 지식 (CS 기초)

- **시험 메타스킬**: 시간 관리, 키워드 추출, 오답 소거, 트레이드오프 인식.
- **NFR 검증**: 모든 NFR(가용성·비용·보안·성능)을 만족하는 옵션만 정답.

---

## 📖 Week 1 핵심 7개

1. **SAP-C02 = 시나리오 + 최적해 시험** — 모든 옵션 동작, 정답은 NFR 최적 충족
2. **분해 5단계** — Actor / Workload / Constraints / NFR / Keyword
3. **IAM 평가** — Default Deny → Explicit Deny 우선 → Allow 교집합 (PB·SCP·Session 한계)
4. **자격 증명** — IRSA(EKS) / Task Role(ECS) / Roles Anywhere(온프레) / Identity Center(SSO 표준)
5. **VPC 트래픽** — Public(IGW)·Private(NAT)·Isolated, S3/DDB는 Gateway Endpoint
6. **ELB** — ALB(L7) / NLB(L4·정적 IP) / GLB(어플라이언스)
7. **컴퓨팅 비용** — Compute SP(유연)·RI(고정)·Spot(중단 허용 90% 할인)

---

## 🔄 헷갈리기 쉬운 비교표

| A | B | 차이 |
|---|---|------|
| **IAM Policy** vs **Resource Policy** | Identity 측 vs 리소스 측 | S3 버킷 정책 = Resource Policy |
| **SCP** vs **Permission Boundary** | OU/계정 한계 vs Principal 한계 | 둘 다 ceiling |
| **SAML** vs **Identity Center** | 옛 페더레이션 vs 멀티 계정 SSO 표준 | Pro에선 IDC가 정답 |
| **NAT GW** vs **NAT Instance** | Managed·자동확장 vs EC2 자체 운영 | 운영 부담 최소 → NAT GW |
| **Gateway VPCe** vs **Interface VPCe** | S3/DDB·무료 vs 대부분·유료 | 데이터 전송 비용 차이 큼 |
| **ALB** vs **NLB** | L7·HTTP/WS vs L4·UDP/정적 IP | 게임 UDP는 NLB |
| **RI** vs **SP** | 인스턴스 고정 vs 컴퓨팅 유연 | 유연성=SP |
| **gp3** vs **io2** | 일반·저렴 vs 고IOPS·DB | DB는 io2 Block Express |

---

## 📝 시나리오 연습 문제 10개

---

**문제 1.** 글로벌 SaaS, 5000만 사용자, 멀티 리전 데이터 격리 규제, 5명 SRE팀, 비용 우선. 가장 적절한 ID·계정 구조는?

A) 단일 계정 + Region별 OU
B) AWS Organizations + 리전별 계정 + IAM Identity Center + ABAC
C) 각 리전 별도 회사 계정 + 수동 IAM 동기화
D) IAM User 직접 부여 + MFA

**정답: B**
해설: Org 멀티 계정 + IDC가 멀티 리전·격리·확장성·운영 최소화 모두 만족.

---

**문제 2.** Lambda 함수가 다른 AWS 계정의 S3 버킷에 접근해야 한다. 가장 적절한 방식은?

A) Lambda Execution Role에 액세스 키 환경 변수
B) Lambda Execution Role + 대상 계정의 S3 버킷 정책에 Lambda Role ARN 허용
C) IAM User 생성 후 키 사용
D) Lambda를 대상 계정에 재배포

**정답: B**
해설: Cross-Account는 Identity 측(Role)에 권한 + Resource 측(버킷 정책)에 허용 둘 다.

---

**문제 3.** EC2 (Private Subnet)에서 SSM Parameter Store 접근 필요. 인터넷 경유 금지. 가장 비용 효율적 방법?

A) NAT Gateway
B) Public Subnet으로 이동
C) Interface VPC Endpoint for SSM
D) Direct Connect

**정답: C**
해설: SSM은 Interface Endpoint 지원. NAT GW보다 비용 효율적이고 보안 우수.

---

**문제 4.** 회사 100개 계정. 일부 개발 계정에서 us-east-1·ap-northeast-2 외 리전 사용 금지. 가장 적절한 방법은?

A) 각 계정에 IAM 정책 수동 추가
B) Organizations SCP에 `aws:RequestedRegion` 조건
C) CloudTrail로 사후 모니터링
D) Config Rule만

**정답: B**
해설: SCP가 사전 강제. CloudTrail/Config는 탐지 후 대응.

---

**문제 5.** 기존 NAT Instance가 트래픽 증가로 병목. 운영팀이 작아 직접 운영 부담. 어떤 조치?

A) NAT Instance를 c6i.4xlarge로 업그레이드
B) NAT GW 도입 (AZ별 배치)
C) Squid 프록시
D) Public IP 부여로 NAT 우회

**정답: B**
해설: AZ별 NAT GW가 운영 부담 최소·자동 확장·HA.

---

**문제 6.** 회사 ML 훈련: 24시간씩 GPU 인스턴스 100대 필요, 1주에 3번. 비용 절감 최대화. 답은?

A) On-Demand
B) RI 1년 100대
C) Spot + EC2 Capacity Block for ML (또는 SP + Checkpoint)
D) Dedicated Host

**정답: C**
해설: 정기 부하이지만 중단 허용·체크포인트 가능 → Spot. 안정 보장이 필요하면 Capacity Block.

---

**문제 7.** UDP 게임 매칭 서버, 정적 IP 필요, 1000만 동시 접속. 어떤 ELB?

A) ALB
B) NLB
C) CLB
D) Lambda+API GW

**정답: B**
해설: UDP·정적 IP·고성능 = NLB.

---

**문제 8.** EKS Pod별로 다른 S3 권한 부여. 가장 적절한 방식은?

A) Node IAM Role에 모든 권한
B) Pod에 액세스 키 ConfigMap
C) IAM Roles for Service Accounts (IRSA)
D) Pod Identity Webhook 수동

**정답: C**
해설: IRSA는 ServiceAccount-Role 매핑 표준. Pod 단위 권한 부여.

---

**문제 9.** "SG·NACL·라우팅 다 확인했는데 EC2 A→B 통신 실패". 가장 빠른 진단 도구는?

A) ping
B) traceroute
C) Reachability Analyzer
D) Flow Logs 수동 분석

**정답: C**
해설: Reachability Analyzer가 정책·라우트·NACL 시뮬레이션 후 차단 지점 식별.

---

**문제 10.** 회사 100개 계정에서 동일 SCP·IAM Identity Center·로깅 표준을 일괄 적용·신규 계정도 자동. 가장 적절한 도구는?

A) CloudFormation StackSets만
B) Service Catalog
C) AWS Control Tower (Landing Zone) + IDC
D) Config Aggregator

**정답: C**
해설: Control Tower가 멀티 계정 거버넌스 표준. 신규 계정 자동 배포·SCP·로깅·IDC 통합.

---

## 📌 다음 주 예고

**Week 2: 멀티 계정 아키텍처**
- AWS Organizations 구조와 OU 설계
- SCP 패턴 (deny list / allow list)
- Control Tower와 Landing Zone
- IAM Identity Center, Permission Set, 통합 결제

> Pro 시험에서 도메인 1(26%)의 핵심. Week 2를 깊이 학습하면 정답률이 즉시 올라간다.

---

## 📌 오늘의 요약

1. Pro는 단순 정답이 아니라 NFR 최적 만족 옵션 선택
2. 멀티 계정 SSO는 IAM Identity Center, 멀티 계정 거버넌스는 Control Tower
3. Cross-Account는 Trust(Role)+Resource Policy 양쪽 필요
4. 네트워크 비용 최소화 = Gateway Endpoint(S3/DDB), 나머지 Interface
5. 비용 절감 = Compute Savings Plans(유연)·Spot(중단 허용)
