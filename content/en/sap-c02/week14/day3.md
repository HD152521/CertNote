# Day 3 - Resilience Hub & Fault Injection Simulator — Birth of Chaos Engineering, Stop Condition's Safety Engineering, DR Verification Automation

In 2010 when Netflix migrated from DVD-by-mail to streaming, from own datacenters to AWS, engineers faced a terrifying truth: **in cloud, instances die without warning anytime.** Their response defied intuition. Not "fear failure so avoid it" but "intentionally, frequently, during business hours, cause failures and constantly prove the system survives anyway." This birthed **Chaos Monkey**—randomly killing production instances—and created the field of **Chaos Engineering**.

In SAP-C02, resilience doesn't end with "Multi-AZ enabled." Pro perspective is **active validation: auto-evaluate resilience against RTO/RPO goals (Resilience Hub), safely inject intentional failures (FIS), precisely control failover traffic (Route 53 ARC)**. Today we decompose chaos engineering's origins, FIS Stop Condition's safety engineering, and tool choice per DR location (DRS vs MGN).

## Resilience Hub — Evaluate RTO/RPO Like Code

Resilience design's first step: objectively know "does my workload actually meet defined RTO/RPO?" Instead of humans guessing architecture diagrams, **AWS Resilience Hub** analyzes automatically.

Operation is clear: (1) register workload (CloudFormation stack, Terraform state, Resource Group auto-discovers resources), (2) input RTO/RPO targets as policy, (3) Resilience Hub analyzes whether current architecture meets targets, **identifying policy violations and gaps**, (4) offers **concrete improvement recommendations** like "add Multi-AZ for RTO 30 seconds, increase backup frequency for RPO 5 minutes," (5) auto-generates **FIS experiment templates** for validation.

> 💡 **Related Theory**: Resilience Hub's most powerful use is **CI/CD pipeline integration**. Every PR calculates resilience score—making resilience a gate like code quality—"this change worsens RTO so merge blocked" becomes possible. This **Resilience as Code** paradigm prevents regression like test coverage or security scanning. WA Tool is qualitative interviews; Resilience Hub is quantitative, automated RTO/RPO evaluation. In exams, "auto-identify RTO/RPO gap + concrete recommendations + CI/CD" is Resilience Hub.

> 🔍 **Deeper Dive**: Resilience Hub and WA Tool overlap but differ. WA Tool qualitatively evaluates all six pillars via questions; Resilience Hub **deeply, automatically measures only Reliability's RTO/RPO**. Hub discovers actual resources and generates FIS experiments; WA Tool relies on human answers. In exams, "six-pillar structured assessment" is WA Tool; "quantitative RTO/RPO gap + auto experiment generation" is Resilience Hub.

## Fault Injection Simulator — Managed Chaos Implementation

FIS is Netflix's Chaos Monkey idea that AWS **commoditized as managed service in 2021**. Core: **Experiment Template**—combination of Targets (which resources) and Actions (what failure).

Rich failure types injectable:
- **EC2 stop/terminate**: Force shutdown validates ASG self-healing
- **CPU/memory stress**: Resource exhaustion behavior validation
- **Network latency, packet loss**: Inter-component communication failure simulation
- **API throttling**: Retry logic under API limits validation
- **RDS Failover**: Multi-AZ switchover actually works validation
- **IAM permission revocation**: Graceful degradation on permission failure
- **AZ availability block**: Single-AZ failure tests Multi-AZ resilience

> 💡 **Related Theory**: Chaos engineering isn't simple "failure testing" but follows **scientific experiment methodology**. Proper procedure: (1) define steady state with measurable metric ("1000 orders/sec"), (2) hypothesize "this metric persists even under failure," (3) inject actual failure, (4) verify hypothesis—metric sustained means resilient, collapsed means weakness found. This brings hypothesis-verification loop from experimental science into software engineering; "tests confirm known, chaos experiments discover unknown" summarizes it. In exams, FIS framed as "discover resilience weaknesses unknown before production."

> 📚 **Case Study**: Value of chaos engineering proven inversely by **2012 Netflix Christmas Eve major outage**. AWS ELB us-east-1 failure stopped Netflix streaming during peak season for hours. Netflix then evolved beyond Chaos Monkey into **"Chaos Kong"—simulating entire AWS region death—and regularly rehearsed regional failover**. Result: subsequent real AWS region failures were nearly imperceptibly absorbed. Lesson: **failover works only as well as practiced beforehand**. In exams, "validate region-failure resilience regularly before production" signals FIS-based Game Day.

## Stop Condition — Preventing Intentional Failure From Becoming Real Disaster

Chaos engineering's greatest risk is obvious: **intentional failure spirals out of control into real major incident.** FIS's decisive superiority over self-written Chaos Monkey is **Stop Condition**—safety mechanism.

Stop Condition connects to one or more **CloudWatch Alarms**. If during experiment the alarm triggers (e.g., "error rate >5%", "latency >1 sec"), FIS **immediately stops all failure injections and restores normal state**. Pre-define "up to here is okay, beyond this line we stop"—safety boundary.

> 💡 **Related Theory**: Stop Condition implements safety engineering's **automatic safety stop (fail-safe/dead-man's switch)** in cloud. Same philosophy as reactor SCRAM, elevator emergency brake, industrial machine safety cutoffs—"detect danger signal, don't await human judgment, auto-revert to safest state." Without it, incident can grow before experimenter reacts. FIS combines IAM role separation (experiment affects only defined resources) and blast radius pre-definition for multi-layer safety. In exams, "chaos experiment doesn't become real disaster" is Stop Condition signal.

> ⚠️ **Pitfall**: Understanding FIS only as "failure tool" sets exam traps. FIS's true value is **"controlled" failure surrounded by Stop Condition, blast radius, IAM separation**. Choices like "Lambda directly terminate EC2," "Systems Manager manual failure injection" lack safety mechanisms—not proper chaos engineering. In exams, when "intentional failure + alarm auto-stop" both appear, FIS with built-in Stop Condition is only answer.

## DRS vs MGN — Same Engine, Different Purpose, Different DR Location

Beyond resilience validation, actual DR environment building presents AWS's two block-level replication services. Both descended from same replication engine (formerly CloudEndure) but opposite purposes.

| Item | **MGN** (Application Migration) | **DRS** (Elastic Disaster Recovery) |
|------|--------------------------------|-----------------------------------|
| **Purpose** | One-time migration | Continuous DR |
| **Source** | On-prem/other cloud → AWS | On-prem/other cloud/AWS Region → AWS Region |
| **Cutover** | Once (end after migration) | Repeatable (regular drills) |
| **Replication** | Until migration complete | 24/7 continuous |
| **RPO/RTO** | - | RPO seconds, RTO minutes |
| **Cost** | Stop after source terminated | Sustained DR environment |

Key distinction: **"move and done (MGN) vs continuously maintain (DRS)?"** On-premise 200 servers permanently to AWS = MGN (7R Rehost); on-premise stays, AWS maintains 24-hour DR standby = DRS.

> 🔍 **Deeper Dive**: DRS's strength is **block-level continuous replication + repeatable drills**. Can spin up DR site, test (drill), return to standby—validate "does DR actually work?" regularly without production impact. DRS keeps replicated data in cheap staging area normally, converts to instances only on failover (similar to Pilot Light cost efficiency). In exams, "on-prem + AWS sustained DR + regular drills" = DRS; "on-prem → AWS permanent" = MGN—clear split.

## Route 53 ARC — Failover Precision Control

Auto health-check failover is fast, but for mission-critical systems, **false positive (misinterpreting transient network flutter as failure) causing unnecessary failover** can be riskier. **Route 53 Application Recovery Controller (ARC)** refines this control.

- **Routing Control**: Explicit ON/OFF toggle **separate from** auto health check. Operator intentionally decides traffic switch—puts failover under human judgment.
- **Readiness Check**: Auto, continuous verify DR region maintains production-level readiness (capacity, config, quotas). Prevent "failover succeeded but DR unprepared."
- **Zonal Shift**: Immediately exclude problematic **single AZ** from ALB/NLB. Isolate one AZ, not whole region.

> 📚 **Case Study**: The 2021-12-07 **AWS us-east-1 massive outage** (~7 hours, API Gateway, console, many services affected) started from unexpected auto-scaling of internal network device. Some firms experienced auto health check ping-ponging between healthy/unhealthy—traffic instability. With ARC Routing Control, operators could **explicitly decide "now switch to us-west-2"** for more controlled response. Outage taught "keep control plane and data plane separate"—ARC Routing Control data plane distributed across 5 regions to work even when us-east-1 dies. In exams, "mission-critical auto failover false positive concern" signals ARC Routing Control.

> 🎯 **Scenario**: "Fintech runs us-east-1/us-west-2 active-active. Auto health check misinterprets partial failure causing traffic instability. Operators want to carefully decide failover themselves. Use what?" — Answer: **Route 53 ARC Routing Control**. Explicit toggle separate from auto health check—humans control. Simple Route 53 Health Check (automatic) has false positive problem. "Isolate AZ only" = Zonal Shift; "continuously verify DR readiness" = Readiness Check—functions split within ARC.

## Summary

Resilience completes via **validation**, not design. Resilience Hub auto-identifies RTO/RPO gaps, generates concrete recommendations and FIS experiments, integrates CI/CD to gate resilience like code quality. FIS implements Netflix's chaos engineering as managed service with **Stop Condition, blast radius, IAM separation** safety engineering preventing intentional failures from becoming real disasters. DR location build splits by purpose—MGN (one-time migration) vs DRS (sustained DR)—and failover traffic control refines via Route 53 ARC's Routing Control (explicit human decision), Zonal Shift (AZ isolation), Readiness Check (prep validation).

SAP exam frequent mappings: (1) "Auto-identify RTO/RPO gap + recommendations + CI/CD" → **Resilience Hub**, (2) "Intentional failure during operation + alarm auto-stop" → **FIS + Stop Condition**, (3) "On-prem → AWS permanent migration" → **MGN**, (4) "On-prem + AWS sustained DR + regular drills" → **DRS**, (5) "Auto failover false positive concern, human explicit decision" → **ARC Routing Control**, (6) "Problem AZ only instant traffic exclude" → **Zonal Shift**, (7) "DR region prep state continuous validation" → **Readiness Check**. Next day digs into resilience's data layer (RDS, Aurora, DynamoDB Global Multi-AZ, Multi-Region choices).

---

## 📝 연습 문제

**문제 1.** 한 팀이 워크로드의 현재 RTO/RPO가 목표를 충족하는지 자동으로 평가받고, 격차를 메우는 구체적 권고를 받아 CI/CD 파이프라인에서 복원력을 게이트로 강제하려 한다. 가장 적합한 도구는?

A) Well-Architected Tool

B) AWS Resilience Hub

C) Trusted Advisor

D) CloudWatch Synthetics

**정답: B**

해설: Resilience Hub는 워크로드를 등록하면 목표 RTO/RPO 대비 격차를 자동 식별하고 "Multi-AZ 추가 시 RTO 30초" 같은 구체적 권고와 FIS 실험을 생성하며, resilience score를 CI/CD에 통합해 복원력 회귀를 게이트로 막을 수 있다. A(WA Tool)는 6 기둥 전체를 사람 답변으로 평가하는 정성 도구로 RTO/RPO 정량 격차를 자동 측정하지 않는다. C는 자동 체크 스캐너이고, D는 엔드포인트 가용성 모니터링일 뿐이다. 함정: "RTO/RPO 정량 격차 + 권고 + CI/CD"는 Resilience Hub의 직답이다.

---

**문제 2.** 한 회사가 production 환경에서 EC2 종료·네트워크 지연을 의도적으로 주입해 복원력을 검증하되, 에러율이 임계치를 넘으면 실험이 자동으로 중단되기를 원한다. 가장 적합한 구성은?

A) Lambda로 무작위 EC2를 종료하는 스크립트

B) FIS Experiment Template + CloudWatch Alarm 기반 Stop Condition

C) Systems Manager Run Command로 수동 장애 주입

D) Auto Scaling으로 인스턴스를 줄였다 늘림

**정답: B**

해설: FIS는 Experiment Template으로 장애(EC2 종료·네트워크 지연)를 정의하고, CloudWatch Alarm에 연결된 Stop Condition으로 에러율이 임계치를 넘으면 즉시 실험을 중단해 정상 상태로 복귀한다 — 의도적 장애가 진짜 사고로 번지는 것을 막는 자동 안전 정지(fail-safe)다. A·C는 Stop Condition 같은 안전장치가 없어 통제를 벗어날 위험이 있고, D는 장애 주입이 아니라 일반 스케일링이다. 함정: "의도적 장애 + 알람 시 자동 중단" 두 조건이 함께 나오면 Stop Condition을 내장한 FIS가 유일한 정답이다.

---

**문제 3.** 한 기업이 온프레미스 데이터센터를 그대로 운영하면서, AWS에 24시간 대기하는 DR 환경을 유지하고 정기적으로 failover drill을 수행하려 한다. 가장 적합한 서비스는?

A) Application Migration Service (MGN)

B) Elastic Disaster Recovery (DRS)

C) DataSync

D) AWS Backup

**정답: B**

해설: DRS는 블록 레벨 연속 복제로 온프레미스를 유지하면서 AWS에 지속적 DR 환경을 유지하고, DR 사이트를 띄워 drill한 뒤 다시 대기 상태로 되돌릴 수 있어 production 영향 없이 정기 검증이 가능하다. A(MGN)는 일회성 마이그레이션 후 종료되어 "지속적 DR"에 부적합하다. C(DataSync)는 파일 전송 도구이고, D(Backup)는 스냅샷 백업이지 실시간 DR 환경이 아니다. 함정: "온프레 유지 + AWS 지속 DR + 정기 drill"은 DRS, "AWS로 영구 이전"은 MGN으로 갈린다.

---

**문제 4.** 한 핀테크가 us-east-1·us-west-2 active-active로 운영 중이다. 자동 health check가 일시적 네트워크 흔들림을 장애로 오판해 트래픽이 불필요하게 튀는 것을 막고, 장애 시 운영자가 직접 신중하게 failover를 결정하길 원한다. 가장 적합한 것은?

A) Route 53 Health Check 자동 failover만 사용

B) Route 53 ARC Routing Control

C) Global Accelerator endpoint group 자동 failover

D) Lambda로 자동 DNS 전환

**정답: B**

해설: ARC Routing Control은 자동 health check와 분리된 명시적 ON/OFF 토글로, 운영자가 의도적으로 트래픽 전환을 결정한다. false positive로 인한 불필요한 자동 failover가 더 위험한 미션 크리티컬 시스템에 적합하며, Routing Control 데이터 평면은 5개 리전에 분산돼 단일 리전 장애에도 작동한다. A·C·D는 모두 자동 전환이라 false positive 문제를 그대로 가진다. 함정: "자동 failover의 false positive 우려 + 사람의 명시적 결정"은 ARC Routing Control의 직답이다.

---

**문제 5.** 카오스 엔지니어링 실험에서 Stop Condition의 역할로 가장 정확한 것은?

A) 실험을 더 빠르게 실행한다

B) 연결된 CloudWatch Alarm이 발동하면 진행 중인 장애 주입을 즉시 중단해 의도적 장애가 실제 사고로 번지는 것을 막는다

C) 실험 결과를 S3에 저장한다

D) 실험 대상 리소스를 자동으로 늘린다

**정답: B**

해설: Stop Condition은 하나 이상의 CloudWatch Alarm과 연결되어, 실험 중 그 알람이 발동(예: 에러율·지연 임계 초과)하면 FIS가 모든 장애 주입을 즉시 중단하고 정상 상태로 복귀시키는 자동 안전 정지(fail-safe) 메커니즘이다. 원자로 SCRAM·엘리베이터 비상 브레이크와 같은 안전 공학 원리다. A·C·D는 Stop Condition의 기능과 무관하다. 함정: Stop Condition은 "실험을 멈추는 안전장치"이지 성능·저장·확장 기능이 아니다.

---

**문제 6.** 한 워크로드가 단일 AZ의 부분 장애를 겪고 있다. 리전 전체를 failover하지 않고 문제가 된 그 AZ만 즉시 트래픽에서 제외하려 한다. 가장 적합한 방법은?

A) NACL로 해당 AZ 트래픽 차단

B) Route 53 ARC Zonal Shift

C) ASG에서 인스턴스 Detach

D) ALB Connection Draining

**정답: B**

해설: Zonal Shift는 단일 명령으로 ALB/NLB에서 특정 AZ를 즉시 제외해 트래픽을 나머지 정상 AZ로 재분배하는 정밀 대응으로, 리전 전체를 건드리지 않는다. A(NACL)는 너무 광범위하고 수동적이며, C·D는 개별 인스턴스·연결 단위라 AZ 전체를 깔끔하게 격리하지 못한다. 함정: "리전이 아니라 문제 AZ만 즉시 제외"는 Zonal Shift의 직답이다.

---