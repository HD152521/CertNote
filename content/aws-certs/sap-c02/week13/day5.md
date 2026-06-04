# Day 65 - Well-Architected 종합 복습: 6 기둥을 한 시나리오로 풀어내기

Well-Architected Framework를 "6개의 기둥"으로 외우는 건 SAA 수준이다. Pro에서는 한 시나리오에 **여러 기둥이 동시에 충돌**하고, 그 중 어느 기둥을 우선시할지 trade-off를 판단해야 한다. "비용을 줄이면서 신뢰성도 유지"는 모든 시험 문제의 본질이고, AWS는 정답을 "두 기둥 모두 만족하는 단일 솔루션"으로 설계한다. 오늘은 13주차에서 본 Operational Excellence, Security, Reliability, Performance, Cost, Sustainability를 시나리오 매핑으로 정리한다.

## 6 기둥의 본질: AWS가 13년간 누적한 베스트 프랙티스

Well-Architected Framework는 2015년 5 기둥(Ops, Security, Reliability, Performance, Cost)으로 출발해, 2021년 Sustainability가 추가되며 6 기둥이 됐다. 각 기둥은 약 50개의 질문(WA Tool 기준)으로 구성되고, 워크로드를 각 질문에 답하면 **High Risk Issue(HRI)**가 자동 도출된다.

> 🔍 **더 깊이**: WA Framework는 AWS Solutions Architect들이 수천 개 고객 워크로드를 리뷰하며 누적한 패턴을 추출한 것이다. 6 기둥 중 어느 것을 우선시할지는 **비즈니스 컨텍스트 의존**. 헬스케어는 Security 우선, 게임은 Performance·Reliability 우선, 미디어 스트리밍은 Cost·Performance 우선. WA Tool로 워크로드를 등록하면 industry-specific Lens(Serverless, SaaS, ML, FS, Healthcare)를 적용해 더 정밀한 가이드를 받는다.

> 💡 **관련 이론**: WA는 ITIL·COBIT 같은 전통적 IT governance 프레임워크의 클라우드 버전이다. 단 ITIL이 프로세스 중심인 반면 WA는 **아키텍처 의사결정 중심**. 또한 Google Cloud Architecture Framework, Azure Well-Architected Framework도 비슷한 6 기둥 구조를 가지지만, AWS가 가장 먼저 시작해 가장 성숙하다.

> 💡 **관련 이론**: 6 기둥은 임의 분류가 아니라 소프트웨어 품질 표준 **ISO/IEC 25010**의 비기능 요구사항(NFR)과 거의 일대일로 대응한다. ISO 25010은 Reliability·Performance Efficiency·Security·Maintainability 등 8개 품질 특성을 정의하는데, WA 기둥명이 이 용어를 그대로 차용했다. 즉 WA는 "클라우드 아키텍처의 NFR을 AWS 서비스 카탈로그에 매핑한 가이드"다. 시험에서 한 시나리오가 여러 기둥에 걸치는 이유도 NFR이 본래 서로 얽혀 있기 때문이다 — 강한 일관성(Reliability)을 위해 동기 복제하면 지연(Performance)이 나빠지는 식의 trade-off가 본질이다.

> ⚠️ **함정**: 가장 자주 혼동하는 두 쌍을 못 박아야 한다. **Reliability vs Performance** — Reliability는 "장애를 견디고 복구하는가"(Multi-AZ·DR), Performance는 "주어진 자원으로 얼마나 빠른가"(캐싱·right-sizing)다. **Cost vs Sustainability** — Cost는 "달러 최소화", Sustainability는 "탄소·전력 최소화"로, 대개 같은 방향이지만 항상 일치하지는 않는다(HPC용 고성능 스토리지는 비용↑). 시험은 이 경계를 키워드로 끊임없이 변주한다.

### 1. Operational Excellence: 자동화와 관측성

핵심 키워드: **IaC**(CloudFormation, CDK, Terraform), **CI/CD**(CodePipeline, GitHub Actions), **관측성**(CloudWatch, X-Ray, OpenTelemetry), **자동 복구**(Auto Scaling, Lambda 자동 재시도), **Runbook 자동화**(Systems Manager Automation).

> 🎯 **시나리오**: "한 스타트업이 production 인프라를 수동 콘솔로 관리하다 운영 사고가 빈번하다. Pro 권장 솔루션?" — 답: **CDK로 IaC 작성 → CodePipeline으로 stage(dev→staging→prod) 자동 배포 → CloudWatch Alarms + EventBridge로 자동 복구**. 사람 손이 닿는 모든 곳이 사고 지점.

### 2. Security: ID·암호화·감사·사고 대응

핵심 키워드: **최소 권한**(IAM, ABAC), **암호화**(KMS, ACM, Secrets Manager), **감사**(CloudTrail, Config), **사고 대응**(GuardDuty, Security Hub, Detective), **네트워크 분리**(VPC, Security Group, NACL, AWS Network Firewall).

> 📚 **사례**: 2019년 Capital One 사고는 SSRF 취약점으로 EC2 메타데이터에서 IAM 자격증명을 탈취 → S3에서 1억 명 데이터 유출. AWS의 대응: **IMDSv2** 의무화(token 기반 메타데이터), **GuardDuty**에 자동 탐지 추가. 이후 모든 신규 EC2는 IMDSv2를 권장한다. 핵심 교훈은 책임 공유 모델에서 이 사고가 전적으로 **고객 책임 영역**(잘못 구성된 WAF + 과도한 IAM 권한)에서 발생했다는 점이다 — AWS 인프라 자체는 뚫리지 않았다. Security 기둥의 "최소 권한"과 "모든 계층 보안"이 왜 비협상 원칙인지를 보여준다.

> 💡 **관련 이론**: Security 기둥의 진화 방향은 **Zero Trust**(NIST SP 800-207)다. "네트워크 위치를 신뢰 근거로 삼지 않고 모든 요청을 매번 검증"하는 모델로, 전통적 성벽(perimeter) 보안을 대체한다. AWS에서는 IAM 권한 검증, VPC 내부에서도 SG 세분화, IMDSv2의 token 요구, mTLS가 모두 Zero Trust 구현이다. Capital One 사고가 "경계 안에 있다고 신뢰한 메타데이터 엔드포인트"가 공격 표면이 된 사례라는 점에서, Zero Trust 전환의 직접 계기가 됐다.

### 3. Reliability: 자동 복구·DR·테스트

핵심 키워드: **Multi-AZ**(RDS, ALB, NAT), **Multi-Region**(Aurora Global, DynamoDB Global Table, S3 CRR), **DR 전략 4종**(Backup/Restore, Pilot Light, Warm Standby, Multi-Site), **FIS**(Fault Injection Simulator로 정기 카오스 테스트), **Resilience Hub**(자동 평가).

> 🔍 **더 깊이**: Netflix는 2011년 **Chaos Monkey**를 오픈소스로 공개해 "정기적으로 production 인스턴스를 죽여 시스템 견고성을 검증"이라는 패러다임을 만들었다. AWS는 이를 관리형으로 흡수해 **FIS(Fault Injection Simulator, 2021)**를 출시. 단순 EC2 종료뿐 아니라 latency 주입, API throttling, IAM 권한 일시 회수까지 시뮬레이션 가능. 카오스 엔지니어링의 핵심 명제는 "백업이 있다"와 "복구가 된다"는 다른 명제라는 것 — 복구 절차는 실제 장애를 주입해 검증해야만 신뢰할 수 있다.

> 💡 **관련 이론**: Reliability의 Multi-AZ vs Multi-Region 선택은 **CAP 정리**(분할 시 일관성·가용성 중 택)와 **PACELC**(분할 없을 때도 지연·일관성 중 택)에 뿌리를 둔다. RDS Multi-AZ는 동기 복제로 강한 일관성(CP)을 택해 항상 최신이지만 failover 중 잠깐 불가용하고, DynamoDB Global Table은 가용성(AP)을 택해 전 리전이 쓰기를 받되 일시적 불일치를 허용한다. Aurora Global이 "RPO 1초 미만"을 광고하면서 비동기 복제를 쓰는 것도 PACELC의 지연-일관성 trade-off다. 시험에서 RPO가 "0이 아닌 1초 미만"이면 비동기 복제 신호다.

> 📚 **사례**: 2017년 2월 AWS S3 us-east-1 장애는 한 엔지니어의 잘못된 명령이 의도보다 많은 서버를 내리며 시작됐다. S3에 의존하던 수많은 서비스는 물론 AWS 자체 상태 대시보드까지 마비됐다. 교훈은 (1) us-east-1 단일 리전 의존 아키텍처는 그 리전 장애에 통째로 무너진다(Multi-Region 필요), (2) 운영·통제 도구가 단일 리전에 묶이면 장애 시 대응조차 못 한다(통제 평면 독립성)였다. 이후 핵심 워크로드의 Multi-Region 설계와 리전 독립적 상태 대시보드가 표준이 됐다.

### 4. Performance Efficiency: 적합한 서비스·캐싱

핵심 키워드: **Managed/Serverless**(Lambda, Fargate, Aurora Serverless), **캐싱**(CloudFront, ElastiCache, DAX), **Right-sizing**(Compute Optimizer), **선택지 다양화**(EBS gp3 vs io2, S3 Standard vs IA, EC2 Graviton).

> 💡 **관련 이론**: 캐싱 계층(CloudFront → ElastiCache → DB)은 컴퓨터 구조의 **메모리 계층(L1/L2/L3 → RAM → 디스크)**과 **지역성 원리**를 분산 시스템에 옮긴 것이다. "가까울수록 빠르고 작고 비싸다"는 동일 구조이며, 캐시 효율은 시간 지역성(최근 데이터 재사용)과 공간 지역성에 의존한다. DynamoDB 전용 마이크로초 캐시가 필요하고 코드 변경을 최소화하려면 **DAX**(DynamoDB API 호환), 범용 캐시는 **ElastiCache**(cache-aside 직접 구현)로 갈린다.

### 5. Cost Optimization: 소비 모델·Right-sizing

핵심 키워드: **소비 기반**(Serverless로 idle 제거), **약정 할인**(Savings Plans, RI), **Spot**(stateless·fault-tolerant 워크로드 90% 할인), **Right-sizing**(Trusted Advisor, Compute Optimizer), **데이터 lifecycle**(S3 Lifecycle, Glacier).

> 🔍 **더 깊이**: Cost의 진짜 지표는 총액이 아니라 **단위 경제학(unit economics)** — 요청당·사용자당·거래당 비용이다. 트래픽이 줄어 총액이 줄어도 단위 비용이 악화됐다면 비효율이 숨은 것이다. Cost Allocation Tag·Cost Categories로 팀·기능별 비용을 귀속시키는 것이 측정의 출발점이다. 또 "예측 가능한 한도 초과"는 **Budgets**(정적 임계), "예측 못 한 갑작스러운 급증"은 **Cost Anomaly Detection**(ML 기반)으로 구분한다.

### 6. Sustainability (2021 추가): 탄소·전력 효율

핵심 키워드: **유휴 0**(Auto Scaling, Serverless), **Graviton**(ARM, 동급 성능 대비 60% 적은 전력), **재생에너지 리전**(Frankfurt, Ireland, Oregon), **CCFT**(Customer Carbon Footprint Tool).

> 💡 **관련 이론**: AWS의 2025년 탄소중립 목표(원래 2030 → 5년 앞당김)는 단순 PR이 아니다. EU의 CSRD(Corporate Sustainability Reporting Directive)는 2024년부터 대기업의 Scope 3(공급망 포함 간접 배출) 보고를 의무화했고, 이 중 클라우드 사용분은 AWS가 제공한 데이터를 그대로 신고한다. CCFT의 정확도가 곧 고객 ESG 보고의 정확도가 된다.

## 시나리오 키워드 → 기둥 매핑 표

| 시나리오 키워드 | 1순위 기둥 | 2순위 기둥 |
|----------------|-----------|------------|
| "운영 부담 최소" | Operational Excellence | Cost |
| "Managed로 전환" | Operational Excellence | Performance |
| "RTO 5분·Multi-Region" | Reliability | Cost |
| "30일 자동 비밀번호 변경" | Security | Operational Excellence |
| "감사 로그·누가 호출" | Security | - |
| "Graviton·ARM 전환" | Cost | Sustainability |
| "탄소 배출 측정" | Sustainability | - |
| "복구 절차 정기 검증" | Reliability | Operational Excellence |
| "사람 SSH 없이 접속" | Security | Operational Excellence |
| "임의 인프라 생성 금지" | Security | Operational Excellence |
| "HPC 노드 저지연" | Performance | - |
| "Idle 비용 0" | Cost | Sustainability |
| "최소 권한·ABAC" | Security | - |
| "Cross-region 백업" | Reliability | Cost |

> 🎯 **시나리오**: "한 헬스케어 SaaS가 환자 데이터를 다룬다. HIPAA 준수 + RTO 1시간 + 비용 최소화를 동시 만족해야 한다. 어느 기둥을 우선시하는가?" — 답: **Security 우선(HIPAA는 비협상)**, 그 위에 Reliability(Warm Standby로 RTO 1h), Cost는 마지막. HIPAA 위반은 환자당 최대 50,000달러 벌금이므로 비용 절감보다 우선.

## WA Tool 워크플로

```
[Step 1] 워크로드 등록 (이름·환경·리전)
   ↓
[Step 2] Lens 선택 (Serverless, SaaS, ML 등)
   ↓
[Step 3] 6 기둥별 ~50개 질문 답변
   ↓
[Step 4] HRI(High Risk Issue) + MRI(Medium Risk) 자동 도출
   ↓
[Step 5] Improvement Plan 생성
   ↓
[Step 6] Milestone 기록 (1차·2차·3차 리뷰)
```

> 📚 **사례**: 한 핀테크가 분기마다 WA Review를 실시한다. 1차 리뷰에서 HRI 23개 도출 → 3개월 후 2차 리뷰에서 8개로 감소 → 6개월 후 3개. Milestone은 AWS Support와 공유해 개선 추이를 추적. AWS는 일정 수준 이상 WA 성숙도 도달 시 **WA Partner Program**으로 추가 크레딧을 제공.

## Industry-Specific Lens

| Lens | 대상 | 추가 질문 영역 |
|------|------|----------------|
| Serverless | Lambda·API Gateway·Step Functions | 콜드 스타트·실행 시간·동시성 |
| SaaS | Multi-tenant | Tenant 격리·과금·온보딩 |
| ML | SageMaker·MLOps | 모델 거버넌스·드리프트·재학습 |
| Data Analytics | Redshift·Athena·EMR | 데이터 거버넌스·비용 |
| FS (Financial Services) | 핀테크 | 규제·암호화·감사 |
| Healthcare | 의료·헬스케어 | HIPAA·환자 데이터·BAA |
| HPC | 시뮬레이션·렌더링 | 노드 통신·파일시스템 |
| Hybrid Network | DX·VPN | BGP·암호화·QoS |

## 시험 함정 정리

> ⚠️ **함정**: "Run book 자동화"가 보이면 → **Systems Manager Automation Document** (SSM Run Document와 혼동 금지). Run Document는 단일 명령 실행, Automation Document는 다단계 워크플로(EC2 시작 → 패치 → 재시작 → 검증).

> ⚠️ **함정**: "비용·환경 동시 개선"이 보이면 → **Graviton 전환**. Sustainability가 함정 보기로 자주 등장하지만, Pro 정답은 거의 항상 "Cost + Sustainability 둘 다 만족하는 단일 액션".

> ⚠️ **함정**: "DR 절차 검증"이 보이면 → **FIS** 또는 **Resilience Hub의 정기 테스트**. Backup 정책 변경은 함정.

## 정리하며

6 기둥은 외우는 것이 아니라 **시나리오 키워드 → 기둥 → 도구**의 직답 매핑이다. 시험에서는 한 시나리오에 여러 기둥이 충돌하므로 비즈니스 컨텍스트(헬스케어=Security, 게임=Performance)를 먼저 파악하고 trade-off를 판단해야 한다. WA Tool과 Lens를 활용해 정기 리뷰를 돌리면 production 사고를 예방한다.

다음 주(Week 14)는 **복원력·DR 심화**다. 4가지 DR 전략(Backup/Restore, Pilot Light, Warm Standby, Multi-Site), Aurora Global, DynamoDB Global Table, FIS 카오스 엔지니어링까지.

---

## 📝 연습 문제

**문제 1.** "운영 부담 최소" + "EC2 → Fargate로 전환". 어느 기둥?

A) Reliability
B) Operational Excellence
C) Cost
D) Sustainability

**정답: B**
해설: "운영 부담 최소"는 Operational Excellence의 직답 키워드. Managed 전환(EC2→Fargate, RDS→Aurora Serverless)은 모두 Ops 우선. 부수적으로 Cost·Sustainability도 개선되지만 1순위는 Ops.

---

**문제 2.** "RTO 5분 + Multi-Region". 어느 기둥?

A) Performance
B) Reliability
C) Cost
D) Security

**정답: B**
해설: RTO·RPO·Multi-Region·DR은 Reliability의 핵심. 5분 RTO는 Warm Standby 이상 필요(Backup/Restore의 RTO는 수 시간).

---

**문제 3.** "DB 비밀번호를 30일마다 자동 변경하고 애플리케이션 중단 없이 갱신". 어느 도구 + 기둥?

A) Reliability + RDS Multi-AZ
B) Security + Secrets Manager 자동 로테이션
C) Ops + Systems Manager Parameter Store
D) Cost + IAM Role

**정답: B**
해설: Secrets Manager는 비밀번호 로테이션 Lambda를 자동 호출하고 RDS/Redshift/DocumentDB는 native 통합으로 무중단 갱신. Parameter Store는 로테이션 native 미지원.

---

**문제 4.** "Graviton 전환으로 비용 30% 절감 + 전력 60% 절감 + 동급 성능". 어느 기둥 조합?

A) Cost만
B) Cost + Sustainability
C) Performance만
D) Reliability + Cost

**정답: B**
해설: Graviton은 ARM Neoverse 기반으로 동급 x86 대비 가격·전력 모두 우위. Cost + Sustainability 두 기둥 동시 만족이 Pro 정답의 전형.

---

**문제 5.** "DR 복구 절차를 분기마다 자동 검증". 어느 도구?

A) AWS Backup의 정기 백업
B) FIS(Fault Injection Simulator)로 production 장애 시뮬레이션
C) Trusted Advisor의 정기 체크
D) Config Rule

**정답: B**
해설: 복구 절차 "검증"의 핵심은 실제 장애를 주입해 시스템이 의도대로 복구되는지 확인. FIS는 EC2 종료·latency 주입·API throttling 등을 정기 실행. Backup은 단순 백업이지 복구 검증 아님.

---

**문제 6.** "관리자가 production EC2에 SSH 없이 접속해 디버깅". 어느 도구?

A) Bastion Host + SSH key
B) SSM Session Manager
C) Client VPN
D) Direct Connect

**정답: B**
해설: SSM Session Manager는 SSH 포트(22) 개방 없이 IAM 권한으로 인증, 모든 세션을 CloudTrail에 기록. Bastion은 22 포트를 노출하므로 공격 표면 증가.

---

**문제 7.** "탄소 배출량을 콘솔에서 월별 확인 + ESG 보고에 활용". 어느 도구?

A) Trusted Advisor
B) Customer Carbon Footprint Tool (CCFT)
C) Compute Optimizer
D) Sustainability Lens

**정답: B**
해설: CCFT는 AWS 사용으로 인한 Scope 1·2·3 탄소 배출을 월별로 보고. ESG 보고에 직접 사용 가능. Sustainability Lens는 아키텍처 가이드일 뿐 측정 도구 아님.

---

**문제 8.** "어느 IAM 사용자가 어느 시각에 어느 API를 호출했는지 추적 + 변경 감사". 어느 도구?

A) Config
B) CloudTrail
C) CloudWatch
D) GuardDuty

**정답: B**
해설: CloudTrail은 모든 API 호출(콘솔·SDK·CLI)을 기록. Config는 리소스 구성 변경 추적(IAM API 호출 자체는 추적 안 함). 둘 다 Security 기둥이지만 "누가 호출"은 CloudTrail.

---

**문제 9.** "다른 팀이 임의 인프라 생성 금지 + 승인된 템플릿만 사용 가능". 어느 도구?

A) IAM Policy로 EC2 RunInstances 거부
B) Service Catalog로 승인된 Product만 노출
C) Config Rule로 비표준 리소스 자동 삭제
D) SCP로 모든 EC2 거부

**정답: B**
해설: Service Catalog는 IT 부서가 승인한 CloudFormation 템플릿을 Product로 등록 → 개발팀은 Service Catalog에서만 생성 가능. IAM/SCP는 너무 광범위, Config는 사후 탐지. Pro 정답은 거의 항상 "사전 통제 + 셀프서비스" 조합.

---

**문제 10.** "HPC 클러스터에서 인스턴스 간 통신 latency를 최소화". 어느 배치?

A) Spread Placement Group (격리)
B) Partition Placement Group (HDFS)
C) Cluster Placement Group + EFA
D) Cross-AZ Auto Scaling

**정답: C**
해설: Cluster PG는 같은 AZ·같은 rack에 묶어 latency 최소화. EFA(Elastic Fabric Adapter)는 OS bypass로 RDMA 수준 통신. 단 가용성은 떨어짐(HPC는 재실행 가능). A(Spread)는 격리가 목적이라 지연이 늘고, B(Partition)는 대규모 분산 저장(HDFS)용이며, D(Cross-AZ)는 AZ 간 지연으로 통신이 느리다.

---

**문제 11.** 한 헬스케어 SaaS가 환자 데이터를 다루며 HIPAA 준수, RTO 1시간, 비용 최소화를 동시에 요구받았다. 세 요구가 충돌할 때 가장 먼저 우선시해야 할 기둥과 그 이유는?

A) Cost — 비용 절감이 항상 최우선이다

B) Security — HIPAA 위반은 환자당 거액 벌금이고 비협상 규제이므로 보안·컴플라이언스가 최우선, 그 위에 Reliability(Warm Standby로 RTO 1h), Cost는 마지막

C) Performance — 응답 속도가 최우선이다

D) Sustainability — 탄소 절감이 최우선이다

**정답: B**
해설: 규제 산업에서 컴플라이언스(HIPAA)는 비협상 제약이라 Security 기둥이 최우선이다. 그 위에 RTO 1시간을 만족하는 Reliability(Warm Standby 이상), 비용은 마지막에 최적화한다. Pro 시험은 한 시나리오에 여러 기둥이 충돌할 때 비즈니스 컨텍스트(헬스케어=Security 우선)로 우선순위를 판단하게 한다. A·C·D는 규제 위반 리스크를 비용·성능·탄소보다 낮게 둔 오답이다. 함정: 규제는 비용·성능보다 항상 우선이며, "동시 만족"이 아니라 "우선순위"를 묻는 문제다.

---

**문제 12.** 한 회사가 AWS 기본 베스트 프랙티스 외에 "모든 외부 ALB는 WAF 필수", "모든 DB는 사내 KMS 키 암호화" 같은 사내 보안 표준도 WA Tool 평가에 포함하고, 멀티 계정 전체에 동일 기준을 적용하려 한다. 가장 적합한 방법은?

A) Serverless Lens 적용

B) Custom Lens를 정의해 사내 표준을 질문으로 등록하고 Organization 전 계정에 표준화

C) Trusted Advisor 자동 체크만 사용

D) Milestone을 더 자주 기록

**정답: B**
해설: Custom Lens는 기업 표준을 JSON 질문으로 정의해 WA Tool 평가에 포함시키며, 멀티 계정에 표준화하면 모든 팀이 동일 기준으로 HRI를 도출받는다 — WA가 조직 거버넌스 엔진으로 확장된 형태다. A는 서버리스 도메인 특화일 뿐이고, C(Trusted Advisor)는 사용자 정의 6 기둥 평가가 없으며, D는 시점 기록 빈도다. 함정: "AWS 기본 + 사내 규정 동시 점검 + 전 계정 표준화"는 Custom Lens다.

---
