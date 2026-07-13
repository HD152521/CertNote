# Day 1 - Well-Architected Framework Overview — The Origins of 6 Pillars, Internal Operations of WA Tool, and Design Philosophy of Lens

When a new architect opens the AWS console for the first time, they become paralyzed by over 200 services. Thousands of decisions stack up — "Should I use RDS or Aurora, should I enable Multi-AZ, is this IAM policy secure enough" — eventually forming one architecture. The problem is that these decisions often remain **tacit knowledge**, not passed down to other teams or projects. The Well-Architected Framework (hereafter WA) is AWS's result of conducting tens of thousands of customer architecture reviews since 2012, **formalizing that tacit knowledge into 6 pillars and standard questionnaires as explicit knowledge**.

In the SAP-C02 exam, WA is not merely a memorization target but a **frame of thinking** for solving all scenario questions. The ability to instantly map "minimum operational burden" to Operational Excellence, "audit trail" to Security, "RTO of 5 minutes" to Reliability is half the battle for passing as a Pro. Today, we deeply decompose why the 6 pillars are grouped as they are, how the WA Tool derives HRI, and what design philosophy Lens uses to extend domains.

## The Origins of 6 Pillars — From 5 to 6, and Why This Classification

WA's starting point was a white paper in 2015. At that time, there were 5 pillars: Operational Excellence, Security, Reliability, Performance Efficiency, and Cost Optimization. In December 2021, at AWS re:Invent, **Sustainability** was added as the 6th pillar. This timing was no accident — it coincided with the intensification of the EU's CSRD (Corporate Sustainability Reporting Directive) and carbon regulations in each country, making cloud usage carbon emissions a mandatory item in corporate ESG reporting.

The classification into 6 pillars itself is the key to the exam. Let's nail down two commonly confused pairs first. **Reliability vs Performance Efficiency** — Reliability is "can you withstand and recover from failures" (availability and fault tolerance), while Performance is "how fast and efficiently can you process with given resources" (latency and throughput). Multi-AZ is Reliability, caching is Performance. **Cost vs Sustainability** — Cost is "minimize dollars," while Sustainability is "minimize carbon and power." Usually they go in the same direction (removing idle resources), but not always.

> 💡 **Related Theory**: These 6 pillars correspond almost one-to-one with **Non-Functional Requirements (NFR)** classification in software engineering. ISO/IEC 25010 (Software Quality Model) defines 8 quality characteristics including Reliability, Performance Efficiency, Security, and Maintainability, and WA's pillar names adopt these standard terms directly. WA is ultimately "how to fulfill cloud architecture NFRs" mapped to AWS's service catalog. Understanding ISO 25010 shows that WA's pillars are not arbitrary categories but rooted in decades of quality engineering consensus.

> 🔍 **Deeper Dive**: The history of "5 to 6 pillars" is directly tested in exams. You must remember that Sustainability was added in 2021 and was not present in pre-5-pillar materials. Internally, each pillar in the WA Tool comprises approximately 8–10 "questions," and each question has multiple "best practice choices." When a workload fails to satisfy a best practice, that question is marked with a **risk**, classified as either HRI (High Risk Issue) or MRI (Medium Risk Issue) based on severity. In other words, HRI is not subjectively assigned by humans but automatically calculated based on "best practice non-compliance" rules.

## Equivalent Frameworks in Other Clouds — Not an AWS Invention

As WA became the de facto standard for cloud architecture governance, competing clouds released equivalent frameworks. While not directly tested in exams, a Pro architect designing multi-cloud environments must understand these corresponding relationships.

| Framework | Provider | Num. Pillars | Characteristics |
|-----------|----------|--------------|-----------------|
| **Well-Architected Framework** | AWS (2015) | 6 | Started first, automated via WA Tool, richest Lens ecosystem |
| **Azure Well-Architected Framework** | Microsoft | 5 | Cost·Security·Reliability·Performance·Operational Excellence (Sustainability separate guide) |
| **Cloud Architecture Framework** | Google Cloud | 6 | System design·Operational excellence·Security·Reliability·Cost·Performance |
| **(Traditional) ITIL / COBIT** | Non-cloud | - | Process and governance focused, weak on architecture decisions |

> 💡 **Related Theory**: The decisive difference between AWS WA and traditional IT governance like ITIL and COBIT is **abstraction level**. ITIL addresses organizational and process-level concerns like "how to operate change management processes," while WA addresses **concrete architecture decisions** like "is this workload Multi-AZ, encrypted with KMS." Therefore, WA doesn't replace ITIL but complements it — organizations run processes via ITIL, and individual workloads within are validated via WA. When exam questions distinguish "governance process" from "architecture review," recall this difference.

## Internal Operations of WA Tool — Workload, Milestone, Lens

The WA Tool is a managed service provided free on the console (or via API). Understanding the workflow precisely is essential for solving exam questions like "what is produced at which stage."

\\\
[1] Define Workload (name, environment, region, owner)
        ↓
[2] Select Lens (default AWS Lens + 0~N domain Lenses)
        ↓
[3] Answer pillar-specific questions (check each best practice)
        ↓
[4] Automatically derive HRI (High Risk Issue) / MRI (Medium Risk Issue)
        ↓
[5] Generate Improvement Plan (with AWS documentation and solution links)
        ↓
[6] Save Milestone (point-in-time snapshot) → re-evaluate after improvement → compare trend
\\\

Two concepts that exams love here are **Milestone** and **Lens**. **Milestone** is a complete snapshot frozen at a specific point in time. If you had 23 HRIs in the first review and reduced it to 8 a quarter later, you can quantitatively demonstrate improvement trends by comparing two Milestones. Like Git's commits and tags — anchoring immutable snapshots (Milestones) to mutable state (current answers) enables time-axis comparison.

> 💡 **Related Theory**: Milestone embodies the functional programming concepts of **immutability** and **event sourcing**. With only current state, you cannot know "how did we get here," but by accumulating point-in-time snapshots, you can reconstruct the trajectory of change. AWS Config's configuration timeline and CloudFormation's stack versions follow the same pattern. When you see "track and report WA improvement trends over time" in an exam, Milestone is the signal for the correct answer.

> 🔍 **Deeper Dive**: The WA Tool is **bidirectionally integrated with Trusted Advisor**. Trusted Advisor is a tool that **automatically checks** 5 categories — cost, performance, security, fault tolerance, and service limits — while WA Tool offers broader **question-based qualitative assessment**. Their relationship can be understood as "automated scanning (TA) vs structured interview (WA)." The latest WA Tool automatically pulls Trusted Advisor check results into some questions, pre-filling answers (for example: "Is an S3 bucket public" is something TA already knows). In exams, distinguish "automatically check cost and security risks" as Trusted Advisor, and "structure workload evaluation across 6 pillars" as WA Tool.

## Lens — Design Philosophy of Domain-Specific Extension

The default WA Lens contains general best practices common to all workloads. However, serverless apps and HPC clusters, multi-tenant SaaS apps have completely different risk points. **Lens** is a plugin that layers domain-specific questions on top of the default Lens.

| Lens | Target Workload | Specialized Check Areas |
|------|-----------------|--------------------------|
| **Serverless Lens** | Lambda·API Gateway·Step Functions | Cold starts·concurrency limits·execution time·event sourcing |
| **SaaS Lens** | Multi-tenant SaaS | Tenant isolation·tier-based billing·onboarding·noisy neighbor |
| **ML Lens** | SageMaker·MLOps | Model governance·data drift·retraining pipeline |
| **Data Analytics Lens** | Redshift·Athena·EMR·Lake | Data lake governance·query cost·schema evolution |
| **HPC Lens** | Simulation·rendering | Inter-node communication·parallel file system·job scheduler |
| **FTR / Financial Services / Healthcare Lens** | Regulated industries | Regulatory compliance·audit·data sovereignty |

> 🎯 **Scenario**: "A company operates a multi-tenant SaaS and wants to check the 'noisy neighbor' problem where one tenant's overload degrades other tenants' performance, plus tenant data isolation. Which WA assessment should they apply?" — Answer: **default WA Lens + SaaS Lens**. The SaaS Lens adds multi-tenancy-specific questions like tenant isolation models (silo vs pool vs bridge), per-tier throttling, and per-tenant cost attribution. These risks don't surface with just the default Lens. In exams, when you see "multi-tenant and tenant isolation," SaaS Lens is the signal.

> 📚 **Case Study**: AWS standardized **FTR (Foundational Technical Review)** based on WA in 2018. For APN Partners to list their SaaS product on AWS Marketplace or earn Competency, they must pass WA Tool review with Serverless/SaaS Lens. This shows that WA has transcended being a simple self-assessment tool to become **an institutionalized quality gate in the partner ecosystem**. Many SaaS startups actually discovered tenant isolation gaps, missing encryption, and other HRIs during the FTR process, fixing them before launch. While not directly tested in exams, understanding that WA serves as "certification you must pass" rather than "recommendation" provides context for its weight.

> 🔍 **Deeper Dive**: AWS added **Custom Lens capability** in 2022, allowing organizations to define their own internal standards (e.g., "all DBs encrypted with corporate KMS key," "all ALBs require WAF") as JSON and register them as a Lens. The WA Tool then outputs internal standard violations as HRI. This means WA has expanded beyond AWS guidance to become an **organizational governance engine**. Standardizing Custom Lens across multi-account Organizations means all teams are evaluated by identical criteria. In exams, when you see "check AWS base best practices plus internal regulations simultaneously," Custom Lens comes to mind.

## Common DNA of Design Principles — 5 Threads Running Through All 6 Pillars

Each pillar has its own principles, but there are common design philosophies running through all 6 pillars. Exams constantly ring changes on this common DNA with keywords like "minimum operational burden" and "managed first."

1. **Automation First** — Every point requiring manual intervention is a source of accidents and inefficiency. IaC·CI/CD·Auto Scaling·automatic recovery.
2. **Design for Failure** — Premise that "failures will happen." Multi-AZ·retry·circuit breaker.
3. **Horizontal Scaling** — Prefer many small servers (scale-out) over one large server (scale-up). Eliminate single points of failure + elasticity.
4. **Loose Coupling** — Separate components via queues and events so failure in one part doesn't propagate.
5. **Managed > Self-managed** — AWS-operated managed services handle operational burden, security patching, and scaling instead.

> 🔍 **Deeper Dive**: These 5 threads of common DNA align with WA's General Design Principles. Among them, unique to the cloud are **"Stop guessing capacity"** and **"Test at production scale."** On-premises required pre-purchase matched to peak demand (over-provisioning), but cloud uses Auto Scaling to adjust in real-time to demand — guessing is replaced with measurement. Furthermore, "testing at production scale" was impossible on-premises due to cost, but cloud makes it possible by immediately releasing resources after testing. When you see "automatic response without demand forecasting" or "validate operational accidents before production" in exams, this principle is the foundation.

> ⚠️ **Pitfall**: "Switch to managed services" is almost always the right direction in exams, but when asked **which pillar's score improves**, confusion arises. Switching EC2 to Fargate reduces operational burden, so the primary improvement is **Operational Excellence**, with secondary gains in Security (AWS patches), and Cost·Sustainability (removing idle resources). If the exam asks for "primary pillar," it's "minimum operational burden = Operational Excellence," but if emphasis shifts to cost savings, the answer can move to Cost. Understanding that a single action impacts multiple pillars is the core of Pro-level thinking.

## Summary

The Well-Architected Framework is AWS's governance engine that formalizes tacit knowledge extracted from tens of thousands of architecture reviews into 6 pillars and standard questionnaires. The 6 pillars (Operational Excellence·Security·Reliability·Performance Efficiency·Cost Optimization·Sustainability) are rooted in the ISO 25010 quality model, and Sustainability was added in 2021. The WA Tool operates through a flow of question answering → automatic HRI/MRI derivation → Improvement Plan → Milestone snapshots, Lens is a plugin for domain-specific (Serverless·SaaS·ML·HPC, etc.) questions, and Custom Lens absorbs even internal standards.

SAP exam common mappings: (1) "structured 6-pillar workload evaluation" → **WA Tool**, (2) "automatically check cost·security·fault tolerance" → **Trusted Advisor**, (3) "track and report improvement trends at specific points" → **Milestone**, (4) "check multi-tenant isolation" → **SaaS Lens**, (5) "check AWS base + internal regulations simultaneously" → **Custom Lens**, (6) "pillar added in 2021" → **Sustainability**, (7) "primary pillar for managed service switch" → typically **Operational Excellence** (but shifts with emphasis). Next day dives into Operational Excellence and Security pillars down to the tool level.

---

## 📝 연습 문제

**문제 1.** 한 조직이 Lambda·API Gateway·Step Functions 기반 서버리스 애플리케이션을 운영하며, 콜드 스타트·동시성 한도·실행 시간 같은 서버리스 고유 위험을 WA Tool로 점검하려 한다. 가장 적합한 접근은?

A) 기본 AWS WA Lens만으로 평가한다

B) 기본 WA Lens에 Serverless Lens를 추가해 평가한다

C) Trusted Advisor의 자동 체크만 사용한다

D) Custom Lens를 직접 만들어 모든 질문을 새로 작성한다

**정답: B**
**해설:** Serverless Lens는 콜드 스타트·동시성·실행 시간·이벤트 소싱 등 서버리스 고유의 베스트 프랙티스 질문을 기본 Lens 위에 얹는다. A는 서버리스 고유 위험이 질문에 없어 누락된다. C(Trusted Advisor)는 자동 스캔일 뿐 구조화된 6 기둥 평가가 아니다. D는 AWS가 이미 제공하는 Serverless Lens를 두고 처음부터 다시 만드는 불필요한 작업으로, Custom Lens는 "AWS 표준에 없는 사내 규정"을 추가할 때 쓴다. 함정: 도메인 특화 점검은 해당 Lens를 추가하는 것이지 기본 Lens로 되는 게 아니다.

---

**문제 2.** 한 핀테크가 분기마다 WA Review를 수행하며, 각 리뷰 시점의 위험 상태를 동결해 개선 추이(HRI 23개 → 8개 → 3개)를 AWS Support와 공유하려 한다. WA Tool의 어떤 기능을 사용하나?

A) Lens

B) Milestone

C) Trusted Advisor

D) Custom Lens

**정답: B**
**해설:** Milestone은 특정 시점의 답변·위험 상태를 불변 스냅샷으로 저장해 시간축 비교를 가능하게 한다(Git 태그와 같은 발상). 두 Milestone을 비교하면 개선 추이를 정량적으로 보여줄 수 있다. A(Lens)는 도메인 특화 질문 확장이지 시점 추적이 아니다. C는 자동 체크 도구로 추이 동결 기능이 없다. D는 사내 표준을 질문으로 추가하는 기능이다. 함정: "추이 추적·시점 비교·보고"는 Milestone의 직답 키워드다.

---

**문제 3.** WA Tool에서 HRI(High Risk Issue)는 어떻게 도출되는가?

A) AWS Solutions Architect가 수동으로 검토해 주관적으로 매긴다

B) 워크로드가 각 질문의 베스트 프랙티스를 충족하지 못하면 위험도에 따라 자동 분류된다

C) Trusted Advisor의 비용 체크 결과만으로 결정된다

D) 고객이 직접 위험도를 입력한다

**정답: B**
**해설:** WA Tool은 각 질문마다 여러 베스트 프랙티스 선택지를 두고, 워크로드가 충족하지 못한 항목의 위험도에 따라 HRI(높음) 또는 MRI(중간)로 **규칙 기반 자동 분류**한다. 사람의 주관(A·D)이 아니라 베스트 프랙티스 미충족이라는 객관 기준으로 산출된다. C는 Trusted Advisor와 혼동한 것으로, TA는 자동 스캔 도구이고 WA Tool은 질문 기반 평가다. 함정: HRI는 "주관적 판단"이 아니라 "베스트 프랙티스 미충족"의 결과다.

---

**문제 4.** 다음 중 2021년 re:Invent에서 Well-Architected Framework에 새로 추가된 6번째 기둥은?

A) Operational Excellence

B) Cost Optimization

C) Sustainability

D) Security

**정답: C**
**해설:** WA는 2015년 5 기둥(Ops·Security·Reliability·Performance·Cost)으로 출발했고, 2021년 Sustainability(지속 가능성)가 6번째로 추가됐다. EU CSRD 등 탄소 규제 본격화 시기와 맞물린다. A·B·D는 모두 최초 5 기둥에 포함된 기둥이다. 함정: "최근 추가된 기둥", "탄소·전력 효율"은 Sustainability를 가리킨다.

---

**문제 5.** 한 기업이 "모든 DB는 사내 전용 KMS 키로 암호화", "모든 외부 ALB는 WAF 필수" 같은 AWS 기본 베스트 프랙티스에 없는 **사내 보안 표준**도 WA Tool 평가에 포함하고 싶다. 가장 적합한 방법은?

A) Serverless Lens를 적용한다

B) Custom Lens를 정의해 사내 표준을 질문으로 등록한다

C) Trusted Advisor 사용자 정의 체크를 만든다

D) Milestone을 더 자주 기록한다

**정답: B**
**해설:** Custom Lens는 기업이 자사 표준을 JSON으로 정의해 WA Tool 평가 항목으로 등록하는 기능으로, AWS 기본 Lens가 다루지 않는 사내 규정 위반을 HRI로 도출한다. 멀티 계정 환경에서 Custom Lens를 표준화하면 모든 팀이 동일 기준으로 평가받는다. A는 서버리스 도메인 특화일 뿐 사내 표준과 무관하다. C(Trusted Advisor)는 사용자 정의 6 기둥 평가 기능이 없다. D는 시점 기록 빈도일 뿐이다. 함정: "AWS 기본 + 사내 규정 동시 점검"은 Custom Lens의 직답 신호다.

---

**문제 6.** Trusted Advisor와 WA Tool의 관계로 가장 정확한 설명은?

A) 둘은 동일한 도구이며 이름만 다르다

B) Trusted Advisor는 비용·성능·보안·내결함성·서비스 한도를 자동 스캔하고, WA Tool은 6 기둥 질문 기반의 구조화된 정성 평가다

C) WA Tool이 Trusted Advisor를 완전히 대체한다

D) Trusted Advisor만 멀티 계정을 지원한다

**정답: B**
**해설:** Trusted Advisor는 5개 카테고리를 자동 체크하는 스캐너이고, WA Tool은 광범위한 질문으로 워크로드를 6 기둥으로 구조화 평가하는 도구다. 둘은 상호 보완적이며, 최신 WA Tool은 일부 질문에 TA 결과를 자동으로 끌어와 답을 미리 채운다(A·C 오답). D는 사실과 무관하다. 함정: "자동 스캔 = Trusted Advisor", "질문 기반 구조화 평가 = WA Tool"로 갈린다.

---