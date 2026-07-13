# Day 3 - Integrated Monitoring: Security Hub·Detective·Audit Manager Roles and Responsibilities

After turning on all detection services (Macie·GuardDuty·Inspector), a new problem emerges. "Thousands of Findings pour in per day—who looks at them and how?" And one step further — "When a security incident happens, how do we track what happened?", "If an auditor demands PCI DSS evidence, how do we collect it?" These three operational questions are answered by **Security Hub (unified posture assessment)**, **Detective (incident investigation)**, and **Audit Manager (audit evidence)**. 

These three have similar names but clearly divided roles. Security Hub **sees the current state** (how is our security posture now, are we meeting standards). Detective **tracks the past** (how did this incident happen). Audit Manager **gathers evidence** (how do we prove regulatory compliance). If you distinguish these as the three tenses — "current · past · proof" — you'll solve integrated monitoring problems on the exam. Today we'll organize each service's internal operations and the relationship where Config and CloudTrail provide data foundations for them.

## Security Hub — CSPM and Standards Checks, Plus a Single Finding Gateway

Security Hub has two roles. First is **CSPM (Cloud Security Posture Management)** — it automatically checks account resource settings against security standards and evaluates "how well our security posture aligns with standards" with scores. Second is **Finding integration hub** — it collects Findings from GuardDuty·Inspector·Macie·IAM Access Analyzer·Firewall Manager and third parties in the **ASFF (AWS Security Finding Format)** single schema.

Standards that it automatically checks:

- **AWS Foundational Security Best Practices (FSBP)** — AWS-defined basic security recommendations
- **CIS AWS Foundations Benchmark** — Industry-standard security benchmark
- **PCI DSS** — Card payment industry security standard
- **NIST SP 800-53** — US federal security control framework

> 💡 **Related Theory**: CSPM is a product category defined in the security industry. Its core mission is **configuration drift detection + standards violation identification** — automatically catching cloud resources that deviate from safe baselines over time. Security Hub is AWS's native CSPM, with third-party competitors in the same category like Wiz, Prisma Cloud, Lacework, and Orca. Multi-cloud environments (AWS+Azure+GCP) usually use third-party CSPM as well — to evaluate multiple clouds' posture from a single console. In the exam, "AWS single cloud + CIS/PCI automatic checks + unified dashboard" means Security Hub is the answer.

> 🔍 **Deeper Dive**: Most of Security Hub's standards checks internally **run AWS Config Rules**. For example, the "S3 bucket public access blocked" check is evaluated with Config's `s3-bucket-public-read-prohibited` rule. So when you enable Security Hub's security standards, associated Config Rules are automatically deployed, and **if Config is inactive, many Security Hub checks don't work**. This dependency often appears in the exam — the cause of "Security Hub check showing 'No data'" is usually Config being disabled. Config is the engine that records and evaluates resource changes, and Security Hub is the higher layer that aggregates and standardizes those results from a security perspective.

## Detective — Tracing Incident Causality with Graphs

Suppose GuardDuty throws a Finding that "communicated with a malicious IP." So **what actually happened?** From when did that EC2 communicate, with what credentials, with which resources, and how much? This deeper investigation is **Detective's** domain.

Detective automatically collects VPC Flow Logs·CloudTrail·GuardDuty Findings·EKS audit logs and creates a **behavior graph** by connecting them. When you click a Finding, related entities (IPs, roles, instances, accounts) are visualized on a time axis showing how they interact. No need for humans to manually join multiple logs — it shows the context of anomalies by comparing "this credential's normal activity vs activity at incident time."

- **Graph Analysis**: Visualizes relationships between entities as nodes and edges
- **Time-Axis Based**: Tracks "when did behavior change"
- **Automatic Data Integration**: Pulls source logs without additional setup
- **GuardDuty Integration**: Jump directly from Finding to Detective investigation

> 💡 **Related Theory**: Detective's graph analysis applies **graph theory** to security investigation. Security incidents are fundamentally "abnormal patterns in relationships between entities" — nodes that normally don't connect (external IP) suddenly strongly connected to nodes (internal instance), edges that explode within a short time (bulk API calls). Modeling with graphs makes these abnormal connections visually obvious. This is like fraud detection and social network analysis techniques — you look at **connection structure**, not individual events. Attack paths that aren't visible in plain log listings become obvious at a glance in the graph.

> ⚠️ **Trap**: The boundary between Security Hub and Detective. Security Hub shows "what's wrong" (Finding aggregation, standards checks) but can't do deep investigation into "why and how it happened." That investigation is Detective's job. In the exam, "visualize specific IAM user activity on a timeline to investigate root cause of incident" is Detective, while "multi-account security standards compliance status dashboard" is Security Hub. They're not replacements but complementary (detection/aggregation → investigation) relationships.

## Audit Manager — Automatically Collecting Compliance Evidence

Auditing means **proving with evidence** that "we follow regulations." Standards like PCI DSS, HIPAA, SOC 2 require hundreds of controls, and for each control, you must collect evidence (screenshots, settings, logs) to submit to auditors. Doing this manually costs the security team weeks per quarter. **Audit Manager** automates this evidence collection.

- **Pre-built Frameworks**: Pre-provides control structures of standards like PCI DSS·HIPAA·SOC 2·GDPR·NIST·FedRAMP
- **Automatic Evidence Collection**: Automatically collects **CloudTrail logs·Config snapshots·Security Hub Findings·API responses** mapped to each control and attaches them as evidence
- **Audit Report Generation**: Auto-packages reports for auditor submission
- **Custom Frameworks**: Can define your own internal control standards

> 🔍 **Deeper Dive**: The decisive difference between Audit Manager and Security Hub is **point-in-time vs continuous**. Security Hub sees "right now are we following standards" in real-time. Audits require evidence of "sustained compliance during the audit period." You can't fix settings just the night before audits — you need timestamp evidence that controls operated throughout the quarter. That's why Audit Manager accumulates evidence over time. Audits require "current state," but they demand "continuous compliance during the period" — that's the key distinction. CloudTrail (who did what when) and Config (how settings changed over time) become evidence sources. In the exam, "auto-collect audit evidence·reports for auditor submission" is Audit Manager, while "real-time standards checks" is Security Hub.

> 📚 **Case Study**: A healthcare SaaS received annual HIPAA audits but wasted 3-4 weeks per time having engineers manually capture evidence (access logs, encryption settings, backup policies, etc. — hundreds of items) and organize them. After activating Audit Manager's HIPAA framework, evidence mapped to each control (from CloudTrail, Config, Security Hub) **automatically accumulated with timestamps**, and report generation became a single button click at audit time. Prep time dropped from 3-4 weeks to days. Lesson: audit cost lies not in "maintaining controls" but in "collecting evidence of compliance," and Audit Manager automates that evidence pipeline.

> 📚 **Case Study**: A security startup operated with just Security Hub enabled but without Detective and suffered a breach. Security Hub showed "GuardDuty detected suspected IAM activity," but knowing "exactly what that credential did and how far it spread" required manually joining CloudTrail and VPC Flow Logs for days. Investigation delays let the attacker perform lateral movement to additional resources. After Detective deployment, a single Finding click brought up the credential's time-axis activity graph, letting them immediately identify the lateral movement path. Lesson: Security Hub (detection/aggregation) and Detective (investigation) aren't replacements but sequential complementary tools — detection answers "what," investigation answers "how and how far."

## Data Foundations — Config and CloudTrail Lake

All three integrated services stand on the foundation of two services: **Config** and **CloudTrail**.

**Config** is the "engine that records and evaluates resource configuration changes." Config Rules automatically evaluate compliance like "Is S3 public?", "Is EBS encrypted?", and these results become core sources for Security Hub checks and Audit Manager evidence. Without Config, many features of higher layers become empty.

**CloudTrail Lake** is a feature making CloudTrail events into a **SQL-queryable data store**. You run arbitrary investigations like "find all `DeleteBucket` calls made by this IAM role over the past 90 days" directly with SQL. Complementary to Detective (graph visualization) — Lake is strong at queries, Detective at visualization.

> 🔍 **Deeper Dive**: The fundamental difference between Config and CloudTrail is "what they record." **Config sees resource state** — "is this S3 bucket public right now, how did settings change compared to yesterday" (time series of configuration snapshots). **CloudTrail sees actions** — "who called what API when" (flow of events). Both are needed for security investigation — Config finds "currently incorrect settings," CloudTrail tracks "who changed those settings when." Example: if S3 suddenly becomes public, Config flags "public state change" and CloudTrail tells us "who called `PutBucketAcl`." This combination of state (Config) + action (CloudTrail) is the data foundation for all higher-level security services.

> ⚠️ **Trap**: Confusing CloudTrail Lake vs Athena over S3 logs vs CloudWatch Logs Insights. All three query logs but — **CloudTrail Lake** is a managed SQL store dedicated to CloudTrail events (zero config, instant query). **Athena** can query CloudTrail logs stored in S3 but has ETL burden of setting up tables and partitions directly. **CloudWatch Logs Insights** is for CloudWatch Logs (application/system logs), not a CloudTrail event store. In the exam, "arbitrary SQL investigation of CloudTrail events" makes CloudTrail Lake the most direct answer.

| Tool | Core Role | Form |
|------|----------|------|
| **Config** | Record and evaluate resource setting changes | Compliance evaluation engine |
| **CloudTrail** | Record API calls (who when what) | Audit log |
| **CloudTrail Lake** | SQL query CloudTrail events | Queryable store |

> 🎯 **Scenario**: "Operating security across multiple accounts. (1) See CIS/PCI standards compliance status of all accounts on a single dashboard, (2) when GuardDuty detects a suspicious Finding, investigate the resource's timeline behavior deeply, (3) collect evidence for annual HIPAA audit automatically." How to design? → (1) **Security Hub** (standards checks + Finding integration, Org delegated administrator), (2) **Detective** (GuardDuty integration graph investigation), (3) **Audit Manager** (HIPAA framework automatic evidence collection). The three services each handle "current posture · past incidents · compliance proof," and Config/CloudTrail supply data below them. Trap: don't try to merge them into one — they have different roles so you combine them.

## Integrated SOC Architecture

```
[GuardDuty]   [Inspector]   [Macie]   [IAM Access Analyzer]
     │            │            │            │
     └────────────┴────────────┴────────────┘
                       │  (ASFF Integration)
                       ▼
              [Security Hub]  ◀── (Standards Checks: Config Rule-based)
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   [Detective]    [EventBridge]   [Audit Manager]
   (Graph Investigation)  (Automated Response)   (Audit Evidence·Reports)
                       │
                [Lambda · SNS · SOAR]

   Data Foundation: Config(Setting Changes) + CloudTrail/Lake(API Logs)
```

## Summary

Integrated monitoring is the three tenses — "current · past · proof" — **Security Hub** checks **current** security posture against standards (CIS·PCI·NIST) and integrates all Findings in ASFF, **Detective** tracks **past** incidents via graphs to investigate root causes, and **Audit Manager** **proves** compliance by automatically collecting evidence. All are grounded in data from Config (setting evaluation) and CloudTrail (API logs), with many of Security Hub's standards checks implemented internally as Config Rules.

SAP exam frequent mappings: (1) "Multi-account CIS/PCI automatic checks + unified dashboard" → **Security Hub**, (2) "Timeline visualization of IAM user activity, incident root cause investigation" → **Detective**, (3) "HIPAA/PCI audit evidence automatic collection·reports" → **Audit Manager**, (4) "Automatic resource non-compliance evaluation" → **Config Rule**, (5) "CloudTrail event SQL query" → **CloudTrail Lake**, (6) "Security Hub checks showing No data" → Config disabled, (7) "Send Findings to external SIEM" → EventBridge → Kinesis/Lambda. Next day we look at edge security (WAF·Shield·Firewall Manager).

---

## 📝 연습 문제

**문제 1.** 30개 계정으로 구성된 Organization에서 CIS와 PCI DSS 표준 준수 현황을 자동 점검하고, GuardDuty·Inspector·Macie의 Finding을 단일 대시보드로 통합 관리하고 싶다. 가장 적합한 것은?

A) Trusted Advisor

B) Security Hub (Org 위임 관리자)

C) Audit Manager

D) Detective

**정답: B**

**해설:** Security Hub는 CIS·PCI·NIST·FSBP 표준을 자동 점검하고 모든 보안 서비스 Finding을 ASFF로 통합하며, Org 위임 관리자에서 전 계정을 일괄 관리한다. A(Trusted Advisor)는 일반 모범 사례 점검이지 보안 표준(CIS/PCI) 통합 점검·Finding 허브가 아니다. C(Audit Manager)는 감사 증거 수집이지 실시간 표준 점검·대시보드가 아니다. D(Detective)는 사건 조사 도구다. 함정: "표준 자동 점검 + Finding 통합 대시보드"는 Security Hub.

---

**문제 2.** GuardDuty가 한 EC2의 자격 증명 탈취 의심을 탐지했다. 이 인스턴스가 언제부터, 어떤 자격 증명으로, 어떤 리소스와 통신했는지 시계열 그래프로 깊이 조사해 근본 원인을 파악해야 한다. 가장 적합한 것은?

A) CloudTrail 콘솔에서 수동 로그 검색

B) Detective

C) X-Ray

D) Macie

**정답: B**

**해설:** Detective는 VPC Flow Log·CloudTrail·GuardDuty Finding을 자동 통합해 행동 그래프를 만들고, 엔티티 간 관계와 시간축 변화를 시각화해 사건의 근본 원인 조사를 돕는다. GuardDuty Finding에서 바로 점프할 수 있다. A(수동 로그 검색)는 여러 로그를 사람이 조인해야 해 느리고 누락이 쉽다. C(X-Ray)는 애플리케이션 분산 추적이지 보안 조사가 아니다. D(Macie)는 S3 데이터 분류. 함정: "사건의 시계열·관계 시각화·근본 원인 조사"는 Detective.

---

**문제 3.** 연 1회 HIPAA 감사를 위해 각 통제별 증거(접근 로그, 암호화 설정, 백업 정책 등)를 감사 기간에 걸쳐 자동 수집하고 감사관 제출용 보고서를 생성해야 한다. 가장 적합한 것은?

A) Security Hub

B) Audit Manager

C) Config

D) Inspector

**정답: B**

**해설:** Audit Manager는 HIPAA 등 사전 빌드 프레임워크의 통제별로 CloudTrail·Config·Security Hub 증거를 자동 수집·타임스탐프와 함께 축적하고 감사 보고서를 생성한다. A(Security Hub)는 현재 시점 표준 점검이지 기간 내 지속 준수 증거 축적·보고서 자동화가 아니다. C(Config)는 평가 엔진이지 감사 보고서 패키징이 아니다(증거 소스 역할). D(Inspector)는 취약점 스캔. 함정: "감사 증거 자동 수집 + 보고서"는 Audit Manager, "실시간 점검"은 Security Hub.

---

**문제 4.** Security Hub의 보안 표준 점검 다수가 "No data" 상태로 나온다. 가장 가능성 높은 원인은?

A) GuardDuty가 비활성화되어 있다

B) AWS Config가 비활성화되어 표준 점검의 근간인 Config Rule이 평가되지 않는다

C) Macie가 비활성화되어 있다

D) CloudFront가 없다

**정답: B**

**해설:** Security Hub의 표준 점검 다수는 내부적으로 Config Rule로 구현된다. Config가 비활성이면 연관 Config Rule이 리소스를 평가하지 못해 점검 결과가 "No data"가 된다. 해결은 해당 계정·리전에서 Config를 활성화하는 것이다. A·C는 특정 탐지 서비스 Finding 통합에 영향을 줄 뿐 표준 점검의 근간이 아니다. D는 무관. 함정: "Security Hub 점검 No data"의 전형적 원인은 Config 미활성화.

---

**문제 5.** 지난 90일간 특정 IAM 역할이 호출한 모든 `DeleteBucket` API를 SQL로 임의 조회해 사건을 조사하고 싶다. 가장 적합한 것은?

A) Athena over raw S3 CloudTrail logs (직접 ETL)

B) CloudTrail Lake

C) CloudWatch Logs Insights

D) Detective

**정답: B**

**해설:** CloudTrail Lake는 CloudTrail 이벤트를 SQL로 직접 쿼리 가능한 관리형 데이터 저장소로, 임의 조건의 이벤트 조사를 가장 직접적으로 수행한다. A(Athena)는 가능하지만 S3로 로그를 모으고 테이블·파티션을 직접 구성하는 ETL 부담이 있다. C(Logs Insights)는 CloudWatch Logs용 쿼리이지 CloudTrail 이벤트 저장소에 최적화돼 있지 않다. D(Detective)는 그래프 시각화에 강하지 임의 SQL 쿼리 도구가 아니다. 함정: "CloudTrail 이벤트 SQL 쿼리"는 CloudTrail Lake.

---

**문제 6.** Security Hub의 모든 Finding을 외부 SIEM(예: Splunk)으로 실시간 전송해 SOC에서 통합 분석하려고 한다. 가장 적합한 구성은?

A) S3로 Export 후 야간 배치 ETL

B) Security Hub → EventBridge Rule → Kinesis Data Firehose/Lambda → SIEM

C) Config Snapshot 전송

D) CloudWatch Metric 알람

**정답: B**

**해설:** Security Hub Finding은 ASFF로 정규화돼 EventBridge로 흐르고, EventBridge Rule이 이를 Kinesis Data Firehose나 Lambda로 보내 SIEM에 실시간 전달한다. ASFF 단일 스키마라 SIEM 파싱이 일관된다. A(야간 배치)는 실시간이 아니고 운영 부담이 크다. C(Config Snapshot)는 설정 스냅샷이지 보안 Finding 스트림이 아니다. D(Metric 알람)는 임계값 알림이지 Finding 전체 전송이 아니다. 함정: "Finding 실시간 SIEM 전송"은 EventBridge 기반 스트리밍.

---

## 📌 Today's Summary

Today's core: integrated monitoring divides across three tenses — **Security Hub** (current state: standards checks + Finding integration), **Detective** (past: timeline graph investigation), **Audit Manager** (proof: continuous evidence collection). Security Hub uses Config Rules for standards checks, so Config being disabled causes "No data." Detective enables root-cause investigation of GuardDuty Findings via automated log integration and graph visualization. Audit Manager collects evidence continuously during audit periods (not point-in-time snapshots like Security Hub). CloudTrail and Config are data foundations for all three. Multi-account deployments use delegated administrator for unified management.
