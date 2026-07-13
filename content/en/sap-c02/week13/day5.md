# Day 5 - Well-Architected Comprehensive Review: Distilling Six Pillars Into One Scenario

Memorizing Well-Architected Framework as "six pillars" is SAA level. At Pro level, **multiple pillars collide in one scenario**, and you must judge which pillar to prioritize via trade-offs. "Reduce cost while maintaining reliability" is the essence of every exam question, and AWS designs answers as "a single solution satisfying both pillars." Today we consolidate Operational Excellence, Security, Reliability, Performance, Cost, and Sustainability from Week 13 through scenario mapping.

## The Six Pillars' Essence: Thirteen Years of AWS Best Practices

The Well-Architected Framework started in 2015 with 5 pillars (Ops, Security, Reliability, Performance, Cost), then added Sustainability in 2021 to make 6. Each pillar comprises ~50 questions (per WA Tool), and answering them for a workload automatically surfaces **High Risk Issues (HRI)**.

> 🔍 **Deeper Dive**: WA Framework extracts patterns AWS Solutions Architects accumulated reviewing thousands of customer workloads. Which pillar to prioritize depends on **business context**. Healthcare prioritizes Security, gaming prioritizes Performance and Reliability, media streaming prioritizes Cost and Performance. Register a workload in WA Tool, then apply industry-specific Lens (Serverless, SaaS, ML, FS, Healthcare) for more precise guidance.

> 💡 **Related Theory**: WA is the cloud version of traditional IT governance frameworks like ITIL or COBIT. But where ITIL centers on processes, WA centers on **architecture decisions**. Google Cloud Architecture Framework and Azure Well-Architected Framework share similar six-pillar structure, but AWS pioneered and is most mature.

> 💡 **Related Theory**: The six pillars aren't arbitrary—they correspond one-to-one with non-functional requirements (NFR) in **ISO/IEC 25010** software quality standard. ISO 25010 defines eight quality characteristics—Reliability, Performance Efficiency, Security, Maintainability, etc.—and WA borrowed these terms directly. So WA is "a guide mapping cloud architecture's NFR to AWS service catalog." Scenarios spanning multiple pillars exist because NFR are inherently intertwined—the trade-off of syncing all regions for strong consistency (Reliability) degrading latency (Performance) is fundamental.

> ⚠️ **Pitfall**: Two pairs most commonly confused: **Reliability vs Performance**—Reliability is "tolerating and recovering from failure" (Multi-AZ, DR); Performance is "how fast with given resources" (caching, right-sizing). **Cost vs Sustainability**—Cost minimizes dollars; Sustainability minimizes carbon and power. They usually align but not always (high-performance HPC storage increases cost). Exams endlessly vary the boundary between them.

### 1. Operational Excellence: Automation and Observability

Core keywords: **IaC** (CloudFormation, CDK, Terraform), **CI/CD** (CodePipeline, GitHub Actions), **Observability** (CloudWatch, X-Ray, OpenTelemetry), **Auto-recovery** (Auto Scaling, Lambda auto-retry), **Runbook Automation** (Systems Manager Automation).

> 🎯 **Scenario**: "A startup manages production infrastructure manually via console and suffers frequent ops incidents. Pro recommendation?" — Answer: **Write IaC with CDK → automate deployment across stages (dev→staging→prod) via CodePipeline → CloudWatch Alarms + EventBridge auto-recover**. Every human touchpoint is an incident risk.

### 2. Security: ID, Encryption, Audit, Incident Response

Core keywords: **Least Privilege** (IAM, ABAC), **Encryption** (KMS, ACM, Secrets Manager), **Audit** (CloudTrail, Config), **Incident Response** (GuardDuty, Security Hub, Detective), **Network Isolation** (VPC, SG, NACL, AWS Network Firewall).

> 📚 **Case Study**: The 2019 Capital One breach—SSRF vulnerability stole IAM credentials from EC2 metadata → 100M people's data leaked from S3. AWS response: **enforce IMDSv2** (token-based metadata), add auto-detection to **GuardDuty**. All new EC2 thereafter recommend IMDSv2. Core lesson: this breach occurred entirely in **customer responsibility zone** (misconfigured WAF + excessive IAM permissions)—AWS infrastructure itself was not compromised. Security pillar's "least privilege" and "security at every layer" show why they're non-negotiable.

> 💡 **Related Theory**: Security pillar evolution heads toward **Zero Trust** (NIST SP 800-207): "verify every request regardless of network location, don't trust location itself." Replaces traditional perimeter security. In AWS: IAM permission verification, SG segmentation even within VPC, IMDSv2 tokens, mTLS all implement Zero Trust. Capital One's case—where a metadata endpoint inside the perimeter became attack surface—directly triggered Zero Trust transition.

### 3. Reliability: Auto-Recovery, DR, Testing

Core keywords: **Multi-AZ** (RDS, ALB, NAT), **Multi-Region** (Aurora Global, DynamoDB Global Table, S3 CRR), **Four DR Strategies** (Backup/Restore, Pilot Light, Warm Standby, Multi-Site), **FIS** (Fault Injection Simulator for regular chaos tests), **Resilience Hub** (auto-assessment).

> 🔍 **Deeper Dive**: Netflix published **Chaos Monkey** in 2011, establishing the paradigm "regularly kill production instances to validate system resilience." AWS absorbed this as managed **FIS (Fault Injection Simulator, 2021)**. Beyond just EC2 termination, it can inject latency, throttle APIs, temporarily revoke IAM permissions—all simulatable. Chaos engineering's core premise: "backup exists" differs from "recovery works"—recovery procedures must validate via actual failure injection.

> 💡 **Related Theory**: Reliability's Multi-AZ vs Multi-Region choice roots in **CAP Theorem** (partitioning forces choice between Consistency and Availability) and **PACELC** (even without partition, choose between Latency and Consistency). RDS Multi-AZ uses sync replication for strong consistency (CP)—always current but briefly unavailable during failover. DynamoDB Global Table chooses Availability (AP)—all regions write but tolerate temporary inconsistency via last-writer-wins. Aurora Global advertising "sub-1-second RPO" while using async replication reflects PACELC's latency-consistency trade-off. In exams, RPO stated as "sub-1-second, not 0" signals async replication.

> 📚 **Case Study**: February 2017 AWS S3 us-east-1 outage started when an engineer entered a wrong command during debugging, bringing down more servers than intended. Countless services depending on S3—even AWS's own status dashboard—went down simultaneously. Two lessons: (1) architecture dependent solely on us-east-1 collapses entirely on that region's failure (Multi-Region needed), (2) if operational tools bind to one region, you can't respond during outage (control plane independence). Thereafter, Multi-Region design for critical workloads and region-independent status dashboards became standard.

### 4. Performance Efficiency: Right Service, Caching

Core keywords: **Managed/Serverless** (Lambda, Fargate, Aurora Serverless), **Caching** (CloudFront, ElastiCache, DAX), **Right-sizing** (Compute Optimizer), **Choice Variety** (EBS gp3 vs io2, S3 Standard vs IA, EC2 Graviton).

> 💡 **Related Theory**: Caching layers (CloudFront → ElastiCache → DB) transpose **memory hierarchy** (L1/L2/L3 → RAM → disk) and **locality principle** from computer architecture to distributed systems. Same structure: "closer = faster, smaller, more expensive." Cache efficiency relies on temporal locality (recent data reused) and spatial locality. If DynamoDB needs microsecond cache, minimize code change, use **DAX** (API-compatible); for general-purpose cache, use **ElastiCache** (hand-write cache-aside).

### 5. Cost Optimization: Consumption Model, Right-Sizing

Core keywords: **Consumption-based** (Serverless removes idle), **Commitment Discounts** (Savings Plans, RI), **Spot** (stateless, fault-tolerant 90% off), **Right-sizing** (Trusted Advisor, Compute Optimizer), **Data Lifecycle** (S3 Lifecycle, Glacier).

> 🔍 **Deeper Dive**: Cost's real metric isn't total but **unit economics**—cost per request, per user, per transaction. Even if total falls, unit cost deteriorating signals hidden inefficiency. Cost Allocation Tag and Cost Categories to attribute by team and function are measurement's starting point. Also distinguish "predictable threshold exceeded" → **Budgets** (static threshold) vs "unexpected sudden surge" → **Cost Anomaly Detection** (ML-based).

### 6. Sustainability (Added 2021): Carbon and Power Efficiency

Core keywords: **Zero Idle** (Auto Scaling, Serverless), **Graviton** (ARM, 60% less power at equivalent performance), **Renewable Regions** (Frankfurt, Ireland, Oregon), **CCFT** (Customer Carbon Footprint Tool).

> 💡 **Related Theory**: AWS's 2025 carbon-neutral target (moved up from 2030) is not PR. EU's CSRD (Corporate Sustainability Reporting Directive) mandates Scope 3 (supply chain, indirect emissions) reporting from large companies starting 2024. Cloud usage carbon is reported directly from AWS-provided data. **CCFT's accuracy becomes ESG reporting's accuracy.**

## Scenario Keywords → Pillar Mapping Table

| Scenario Keyword | Primary Pillar | Secondary Pillar |
|-----------------|---------------|-----------------|
| "Minimize operational burden" | Operational Excellence | Cost |
| "Migrate to Managed" | Operational Excellence | Performance |
| "RTO 5 min, Multi-Region" | Reliability | Cost |
| "Auto-rotate password every 30 days" | Security | Operational Excellence |
| "Audit logs, who called" | Security | - |
| "Graviton, ARM shift" | Cost | Sustainability |
| "Measure carbon emissions" | Sustainability | - |
| "Regularly validate recovery" | Reliability | Operational Excellence |
| "People access without SSH" | Security | Operational Excellence |
| "Ban arbitrary infrastructure creation" | Security | Operational Excellence |
| "HPC inter-node low latency" | Performance | - |
| "Zero idle cost" | Cost | Sustainability |
| "Least privilege, ABAC" | Security | - |
| "Cross-region backup" | Reliability | Cost |

> 🎯 **Scenario**: "A healthcare SaaS handles patient data. HIPAA compliance + RTO 1 hour + cost minimization required simultaneously. Which pillar is priority?" — Answer: **Security first (HIPAA non-negotiable)**, then Reliability (Warm Standby for RTO 1h), Cost last. HIPAA violation risks $50k per patient in fines.

## WA Tool Workflow

```
[Step 1] Register workload (name, environment, region)
   ↓
[Step 2] Select Lens (Serverless, SaaS, ML, etc.)
   ↓
[Step 3] Answer ~50 questions per six pillars
   ↓
[Step 4] Auto-generate HRI (High Risk) + MRI (Medium Risk)
   ↓
[Step 5] Create Improvement Plan
   ↓
[Step 6] Record Milestones (1st, 2nd, 3rd review)
```

> 📚 **Case Study**: A fintech conducts WA Review quarterly. 1st review: 23 HRI surfaced → 3 months later 2nd review: 8 → 6 months 3rd: 3. Milestones shared with AWS Support to track improvement. AWS offers **WA Partner Program** bonus credits when reaching certain maturity thresholds.

## Industry-Specific Lens

| Lens | Target | Additional Question Areas |
|------|--------|--------------------------|
| Serverless | Lambda, API Gateway, Step Functions | Cold starts, execution time, concurrency |
| SaaS | Multi-tenant | Tenant isolation, billing, onboarding |
| ML | SageMaker, MLOps | Model governance, drift, retraining |
| Data Analytics | Redshift, Athena, EMR | Data governance, cost |
| FS (Financial Services) | Fintech | Regulation, encryption, audit |
| Healthcare | Medical, Healthcare | HIPAA, patient data, BAA |
| HPC | Simulation, rendering | Node communication, filesystem |
| Hybrid Network | DX, VPN | BGP, encryption, QoS |

## Exam Pitfall Summary

> ⚠️ **Pitfall**: "Automate runbook" → **Systems Manager Automation Document** (don't confuse with SSM Run Document). Run Document executes single command; Automation Document orchestrates multi-step workflows (start EC2 → patch → restart → validate).

> ⚠️ **Pitfall**: "Reduce cost and environment simultaneously" → **Graviton shift**. Sustainability often appears as a tempting distractor, but Pro answer almost always is "single action satisfying both Cost + Sustainability."

> ⚠️ **Pitfall**: "Validate DR procedure" → **FIS** or **Resilience Hub's regular testing**. Changing backup policy is a trap.

## Summary

The six pillars are not memorization—they're **scenario keyword → pillar → tool direct mapping**. Exams present multiple colliding pillars per scenario, requiring business context first (healthcare = Security, gaming = Performance) then trade-off judgment. WA Tool and Lens enable regular reviews preventing production incidents.

Next week (Week 14) is **Resilience and DR Advanced**: Four DR strategies (Backup/Restore, Pilot Light, Warm Standby, Multi-Site), Aurora Global, DynamoDB Global Table, FIS chaos engineering.

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