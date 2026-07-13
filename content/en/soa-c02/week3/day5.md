# Day 5 - Week 3 Review: CloudWatch Observability Stack Synthesis

The CloudWatch tools covered in Week 3 are independent of each other, but in actual operations, they form one observability pipeline. When an Alarm detects "something went wrong," the Dashboard shows "what range and how much," Agent lets you "look inside the guest OS," Synthetics maintains the "user perspective," and X-Ray traces "which service's which call" is the cause. When this pipeline works perfectly together, MTTD/MTTK (Mean Time To Know) from incident detection to root cause analysis shrinks.

Today we re-examine how these five tools actually connect structurally, organize each tool's internal design principles in comparison tables, and solve the 10 most frequent exam scenarios.

## Week 3 Key Concept Connection Map

```
[Synthetics Canary]            [Real Users + RUM]
 24/7 availability                LCP/CLS/JS errors
 detection without traffic         real user data only
       │                              │
       ▼                              ▼
[CloudWatch Alarms]  ←──── [CloudWatch Metrics]  ←──── [CloudWatch Agent]
 M of N evaluation              (Standard + Custom)     EC2 memory/disk
 Composite Alarm                Dashboard display        procstat/StatsD
 Anomaly Detection                   │                   custom namespace
       │                             │
       ▼                             ▼
 [SNS/PagerDuty]            [CloudWatch Dashboard]
 [SSM Automation]            Cross-Account OAM integration
 [Auto Scaling]              Golden Signals design
                                     │
                              [X-Ray + ServiceLens]
                               distributed tracing → Logs jump
                               Service Map → Trace → Log
```

> 💡 **Related Theory**: This pipeline applies **Observability**, a concept from control theory, to modern distributed systems. First formalized by Rudolf Kalman in 1960 in "On the General Theory of Control Systems," it asks: "Can the internal state of a system be completely estimated from external outputs alone?" Metrics (numbers), Logs (text), and Traces (paths) are the "external outputs" in modern operations. CloudWatch integrates three signals into one platform, X-Ray handles Traces, and ServiceLens connects all three on one screen.

## Frequently Confused Key Comparisons

**M of N vs Treat Missing Data**

M of N controls "how long must the violation persist to trigger an alarm?" Treat Missing Data controls "how do we judge when data is absent?" These two settings are often confused.

| Setting | What It Controls | Key Use Case |
|---------|------------------|--------------|
| M of N (EvaluationPeriods + DatapointsToAlarm) | Duration of violation | Ignore temporary spikes |
| Treat Missing Data: breaching | Missing data = violation | Services that must always be alive |
| Treat Missing Data: notBreaching | Missing data = healthy | Idle workloads, terminated instances |
| Treat Missing Data: missing (default) | Ignore gaps, evaluate other data | General cases |
| Treat Missing Data: ignore | Maintain current state | Maintenance windows |

**Synthetics vs RUM vs X-Ray**

| Item | Synthetics | RUM | X-Ray |
|------|-----------|-----|-------|
| Perspective | External bot | Real user browser | Service-to-service internal |
| Traffic Unnecessary | Y (synthetic) | N | N |
| Find Latency Cause | N | Partial (browser layer) | Y (Subsegment-level) |
| Service Map | N | N | Y |
| Cost Model | Per canary execution | RUM event count | Trace count |
| Detect No-traffic Downtime | Y | N | N |

> 💡 **Related Theory**: The distinction between these three tools corresponds to the difference between **external quality** and **internal quality** in software quality measurement theory. Synthetics and RUM measure external quality experienced by users, while X-Ray measures internal structural quality (which component adds which latency). Google SRE's "Golden Signals" (latency, traffic, errors, saturation) is a framework that combines both perspectives: Synthetics measures external latency and errors including availability, while X-Ray measures per-component internal latency and saturation.

**Composite Alarm vs Metric Math Alarm**

| Item | Composite Alarm | Metric Math Alarm |
|------|-----------------|-------------------|
| Input | State of other alarms (OK/ALARM) | Metrics + expressions |
| Expression | `ALARM("a") AND ALARM("b")` | `e/r*100 > 5` |
| Purpose | Reduce alarm noise, service-level aggregation | Alarm on derived metrics like error rate |
| Actions Suppressor | Y (disable child alarm actions) | N |
| Cost | Composite Alarm + each child alarm charged | One alarm charged |

> 💡 **Related Theory**: The Boolean expression design of Composite Alarm has the same structure as logic circuit theory. Just as digital circuit design combines AND/OR/NOT gates to express complex conditions, alarms are combined as logical gates to judge "is the entire service degraded?" This abstraction layer aligns with Jens Rasmussen's (1983) "Skills, Rules, Knowledge" cognitive layering model: abstracting lower signals (child alarms) into higher semantic units (service state).

**CloudWatch Agent Collected Metrics Types**

| Metric | Collection Method | Namespace | Agent Required |
|--------|-------------------|-----------|-----------------|
| CPU Utilization | Hypervisor | AWS/EC2 | No |
| Network In/Out | Hypervisor | AWS/EC2 | No |
| mem_used_percent | /proc/meminfo | CWAgent (custom) | Yes |
| disk_used_percent | statfs() syscall | CWAgent (custom) | Yes |
| Per-process CPU | /proc/[pid]/stat | CWAgent (custom) | Yes (procstat) |
| Application Custom | StatsD UDP 8125 | Custom specified | Yes (StatsD server) |

> 🔍 **Deeper Dive**: The way CloudWatch Agent reads `/proc/meminfo` on Linux differs fundamentally from reading WMI (Windows Management Instrumentation) Performance Counters on Windows. On Linux, procfs is a virtual filesystem through which the kernel exposes memory statistics in real-time. The `mem_used_percent` is calculated by combining `MemTotal`, `MemFree`, `Buffers`, and `Cached` fields. The formula is `(MemTotal - MemFree - Buffers - Cached) / MemTotal × 100`, matching the `used` column of the `free -m` command. On Windows, the `\Memory\% Committed Bytes In Use` counter is used.

**X-Ray Sampling: Reservoir + Fixed Rate Flow**

```
2000 requests per second → Sampling Rule applied
                    │
          Reservoir = 10 (at least 10 per second guaranteed)
                    │
          ┌─────────┴─────────┐
     First 10 requests       Remaining 1990
     (100% sampling)          Fixed Rate = 5% applied
                               = approximately 99 additional samples
                    │
          Approximately 109 traces sent per second
```

> 💡 **Related Theory**: X-Ray's Reservoir + Fixed Rate design is structurally identical to the **Token Bucket** algorithm in network traffic control. Reservoir is the bucket size (burst capacity), and Fixed Rate is the sustained processing rate. RFC 2697 (srTCM, Single Rate Three Color Marker) and RFC 2698 (trTCM) standardize this pattern. During low-traffic periods (early morning), the Reservoir alone is sufficient for sampling, while during high-traffic periods (lunch time), Fixed Rate controls costs with automatic adjustment.

## Production Operations Anti-Patterns Summary

Anti-patterns of each tool learned in Week 3 compiled at once.

**Alarm Anti-Patterns**
- All alarms DatapointsToAlarm=1 → PagerDuty flooded by every spike
- Treat Missing Data default (missing) + critical service → instance dies but alarm doesn't fire
- Each child alarm with PagerDuty action → dozens of notifications per incident
- Direct alarm on cross-region metrics → doesn't work (only same-region evaluation possible)
- Trust Anomaly Detection on service launch day → band unstable during 2-week learning period

**Dashboard Anti-Patterns**
- Public Sharing for external sharing → instance IDs, traffic patterns, error messages exposed without auth
- 50 widgets on one dashboard → Dashboard Fatigue (more widgets don't mean higher observability)
- Number widgets without units → meaningless numbers ("is 1247 good or bad?")
- No hierarchy, all equal importance → don't know where to look during incidents

**Agent Anti-Patterns**
- Install Agent without IAM Role → PutMetricData AccessDenied (Agent can't call CloudWatch API)
- Deploy with User Data only, no State Manager → configuration drift undefended
- retention_in_days unset → Log Group kept forever, costs increase (Never Expire)
- Search for memory in AWS/EC2 without verifying Custom Namespace → not there, can't create alarm

**X-Ray Anti-Patterns**
- 100% sampling → costs explode in high-traffic service (100M RPS × $5/1M Traces = $500/day)
- DynamoDB call without SDK captureAWS() → Subsegment not visible, no DynamoDB node in Service Map
- Sampling Rule priority unset → important payment API and health check get same sampling rate
- Fault vs Error confused → Fault (5xx, possibly AWS responsibility) vs Error (4xx, client issue) distinction important for root cause analysis

> 📚 **Case Study**: In 2023, a major e-commerce company A (public case) left X-Ray 100% sampling on during Black Friday prep and received an unexpected $8,000 X-Ray bill for one day. After switching to fixed Reservoir + low Fixed Rate (1%) during traffic surge periods, cost dropped to $40/day while maintaining 100% error tracing via separate Priority 1 Rule. Sampling Rule design is a high-ROI optimization point.

> ⚠️ **Pitfall**: ServiceLens is a view integrating CloudWatch, X-Ray, and Synthetics Canary data, but all three services must be operating normally. If Lambda Active Tracing is disabled, Lambda won't appear in ServiceLens Service Map. If X-Ray SDK doesn't wrap AWS SDK, downstream services like DynamoDB and SQS disappear from the Map. If ServiceLens screen looks empty, first check X-Ray SDK configuration and Active Tracing status.

## Comparison with Other Cloud Platforms

| Feature | AWS CloudWatch | GCP Cloud Operations | Azure Monitor |
|---------|----------------|--------------------|---------------|
| Metrics | CloudWatch Metrics | Cloud Monitoring | Azure Monitor Metrics |
| Logs | CloudWatch Logs | Cloud Logging | Log Analytics |
| Traces | X-Ray | Cloud Trace | Application Insights |
| Agent | CloudWatch Agent | Ops Agent | Azure Monitor Agent |
| Synthetic Monitoring | Synthetics Canary | Uptime Checks | Application Insights Availability |
| Anomaly Detection | Anomaly Detection | Alerting Policy ML | Dynamic Threshold |
| Cross-Account | OAM Sink+Link | Workspace-based | Resource scope |
| Dashboard | CloudWatch Dashboard | Cloud Monitoring Dashboard | Azure Dashboard |

> 🔍 **Deeper Dive**: GCP's Ops Agent is structurally similar to CloudWatch Agent but uses OpenTelemetry Collector as its internal pipeline. CloudWatch Agent operates as its own Go binary. Azure Monitor Agent differs by defining collection policies centrally via DCR (Data Collection Rules). CloudWatch Agent corresponds by centralizing configuration via SSM Parameter Store. All three platforms clearly distinguish between metrics collectible without an agent (hypervisor layer) and metrics requiring an agent (OS layer).

## Incident Response Flow: Tool Connection Order

When actual incidents occur, the order in which to use CloudWatch tools is organized by scenario.

**Scenario: API Response Time Spike**

```
1. Composite Alarm triggers (ALB Latency High AND EC2 CPU High)
   → PagerDuty alert
2. View overall scope in CloudWatch Dashboard
   - ALB RequestCount, TargetResponseTime
   - EC2 CPUUtilization (Agent custom: mem_used_percent, disk_used_percent)
3. Check Service Map in X-Ray ServiceLens
   - Which service (Lambda, DynamoDB, RDS) has latency?
4. Error service Trace details → identify bottleneck at Subsegment level
5. ServiceLens "View Logs" → immediately see relevant execution logs in CloudWatch Logs
6. Synthetics Canary results → check user endpoint availability status
```

> 💡 **Related Theory**: This response order is a "Breadth-First Search → Depth-First" strategy. Start wide (dashboard, entire service map), then narrow scope (specific service Trace) and dig deep (Subsegment, logs). This is the core of "structured troubleshooting" recommended by Google SRE: from symptom to cause, from broad hypotheses to narrow ones.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 OOM으로 강제 종료됐다. 메모리 알람은 Treat Missing Data = missing이고 EvaluationPeriods=5다. 현재 데이터 포인트 2개가 누락됐다. 알람 상태는?

A) ALARM — 인스턴스가 OOM으로 종료돼 메트릭이 끊겼으므로 missing 설정과 무관하게 자동으로 ALARM 전이
B) INSUFFICIENT_DATA — 데이터가 충분히 누락되지 않아 판단 불가
C) OK — Treat Missing Data = missing은 누락 구간을 정상으로 간주해 마지막 상태를 OK로 유지
D) DISABLED — 데이터 소스가 사라지면 CloudWatch가 알람을 자동으로 비활성화 처리

**정답: B**
해설: Treat Missing Data = missing은 누락된 데이터 포인트를 무시하고 남은 데이터포인트(3개)로 평가한다. 마지막 3개 포인트가 정상이었다면 알람은 OK 또는 INSUFFICIENT_DATA 상태를 유지한다. "인스턴스가 죽었으니 자동 ALARM"은 틀린 가정이다. 핵심 가용성 서버는 Treat Missing Data = breaching으로 설정해야 인스턴스 소실 시 ALARM으로 전이된다.

---

**문제 2.** 운영팀이 한 사고에서 EC2/RDS/ALB/ElastiCache 알람 20개가 동시에 울려 PagerDuty가 20번 울렸다. 이를 해결하는 가장 구조적인 방법은?

A) 20개 알람의 임계값을 모두 높여 동시 발화 가능성을 낮추고, 한 번에 울리는 알람 수를 줄인다
B) 20개 알람의 EvaluationPeriods·DatapointsToAlarm을 모두 늘려 일시적 동시 spike에 의한 다중 발화를 억제한다
C) 자식 알람 20개에 Actions Suppressor 적용 + Composite Alarm으로 논리 조합 → 부모만 PagerDuty
D) 상관관계 높은 알람을 묶어 20개를 10개로 통합하고, 나머지는 SNS 대신 대시보드로만 노출한다

**정답: C**
해설: Composite Alarm의 핵심 사용 사례다. 자식 알람 20개는 각각 메트릭을 추적하되 액션을 비활성화한다. Composite Alarm이 "ALB 5xx AND (EC2 CPU OR RDS CPU)" 같은 논리 조합으로 "실제 서비스 저하" 상태를 판단하면, 그 하나만 PagerDuty에 연결한다. 임계값을 높이거나 EvaluationPeriods를 늘리면 탐지 자체가 느려지는 다른 문제가 생긴다.

---

**문제 3.** EC2 메모리 사용률 90% 알람을 만들었는데 CloudWatch에서 해당 메트릭을 찾을 수 없다. 원인과 해결책은?

A) Detailed Monitoring을 활성화하면 수집 간격이 1분으로 줄면서 메모리 메트릭이 AWS/EC2에 추가된다
B) 메모리는 EC2 기본 메트릭에 없다. CloudWatch Agent 설치 + mem 플러그인 설정 + Custom Namespace에서 알람 생성
C) 메모리는 AWS/EC2가 아니라 AWS/EC2/MemoryUtilization 같은 별도 시스템 네임스페이스에 발행되므로 그곳에서 찾는다
D) 메트릭이 인스턴스 home Region이 아닌 us-east-1에 발행되므로 콘솔 리전을 us-east-1로 바꿔 검색한다

**정답: B**
해설: EC2 메모리는 하이퍼바이저가 볼 수 없는 게스트 OS 내부 정보다. CloudWatch Agent를 설치하고 설정 파일에 `mem` 섹션을 추가하면 `CWAgent` 네임스페이스(또는 설정한 커스텀 네임스페이스)에 `mem_used_percent` 메트릭이 발행된다. 알람 생성 시 `AWS/EC2`가 아닌 그 네임스페이스를 선택해야 한다.

---

**문제 4.** 회사가 5개 AWS 계정을 운영한다. 모든 계정의 EC2 CPU를 단일 대시보드에서 보고 싶다. 올바른 구성은?

A) Organizations 관리 계정의 대시보드는 멤버 계정 메트릭을 자동 상속하므로 추가 설정 없이 모든 계정 CPU가 보인다
B) CloudWatch Cross-Account Observability: Monitoring Account에 OAM Sink + 각 계정에 Link 생성 → 대시보드 위젯에 accountId 명시
C) CloudFormation StackSet으로 동일한 대시보드를 5개 계정에 배포하고, 각 계정 콘솔에서 자기 EC2 CPU를 본다
D) 각 계정 EventBridge 룰로 CPU 메트릭 변경 이벤트를 중앙 계정 버스에 복사한 뒤 PutMetricData로 재발행해 통합한다

**정답: B**
해설: OAM(Observability Access Manager) Sink+Link 구조가 CloudWatch Cross-Account Observability의 표준이다. Monitoring Account에 Sink를 만들고 Sink 정책으로 어느 계정이 Link를 만들 수 있는지 제어한다. 각 Source Account에서 Link를 생성하면 Monitoring Account 콘솔에서 다른 계정 메트릭이 보인다. 대시보드 위젯의 메트릭 정의에 `accountId`와 `region`을 명시해야 한다.

---

**문제 5.** 새벽 2시에 API가 다운됐는데 트래픽이 없어서 RUM에도 데이터가 없고 알람도 안 울렸다. 이 문제를 예방하는 가장 적합한 도구는?

A) CloudWatch Agent의 수집 간격을 1초 해상도로 줄여 새벽 다운 구간을 더 촘촘히 포착한다
B) RUM 스니펫을 모든 페이지에 추가하고 세션 샘플링률을 100%로 올려 새벽 트래픽까지 빠짐없이 수집한다
C) Synthetics Canary로 1분 주기 Heartbeat Canary를 설정한다
D) X-Ray 샘플링률을 100%로 올려 새벽 시간대 요청까지 모두 추적해 다운을 감지한다

**정답: C**
해설: RUM은 실제 사용자가 없는 새벽엔 데이터가 없다. Synthetics Canary는 합성 사용자(봇)가 정해진 주기로 API를 호출하므로 트래픽과 무관하게 24/7 가용성을 측정한다. 실패 시 `SuccessPercent` 메트릭이 떨어지고 알람 → SNS로 즉시 통보된다. X-Ray 샘플링률은 비용과 추적 정밀도에 관한 것이며 가용성 탐지와 무관하다.

---

**문제 6.** Anomaly Detection 알람을 새로 활성화했는데 2주가 지나도 한 번도 알람이 울리지 않았다. 정상인가, 문제인가?

A) 권한 문제다. 알람 역할에 `cloudwatch:GetMetricData`·`PutAnomalyDetector` 권한이 없으면 밴드 평가가 조용히 실패한다
B) 정상이다. 서비스가 2주간 안정적으로 동작하고 있는 것이다. Anomaly Detection은 최소 2주 학습 후 밴드가 안정화된다
C) `ANOMALY_DETECTION_BAND` 수식이 알람 조건에 연결되지 않아 모델은 학습하지만 알람이 메트릭을 평가하지 못한다
D) 학습 기간 동안 소스 메트릭이 결측이라 알람이 INSUFFICIENT_DATA에 머물러 한 번도 발화하지 못한다

**정답: B**
해설: Anomaly Detection의 ML 모델은 최소 2주 데이터로 학습한다. 학습 기간 동안 밴드가 불안정하거나 넓게 잡혀 위반이 감지되지 않는 것이 정상이다. 2주 이후부터 주간 계절성(월-금 패턴)을 반영한 더 정확한 밴드가 형성된다. 2주 동안 알람이 안 울렸다면 서비스가 정상적으로 동작하고 있을 가능성이 높다.

---

**문제 7.** Lambda 함수 내 DynamoDB 쿼리의 지연 시간을 X-Ray로 추적하려 한다. 필요한 조치 두 가지는?

A) Lambda 함수의 Active Tracing 활성화 + X-Ray SDK의 captureAWS()로 AWS SDK 래핑
B) Lambda 함수의 Active Tracing만 활성화하면 런타임이 모든 AWS SDK 호출을 자동 계측해 DynamoDB Subsegment까지 보인다
C) Lambda 실행 환경에 CloudWatch Agent를 설치하고 X-Ray Daemon을 사이드카로 띄워 DynamoDB 호출 지연을 수집한다
D) EventBridge로 DynamoDB API 이벤트를 받아 CloudTrail Data Event와 조인해 쿼리 지연을 재구성한다

**정답: A**
해설: Lambda Active Tracing은 Lambda 실행 자체를 Segment로 추적한다. Lambda 내부 DynamoDB 호출을 Subsegment로 추적하려면 추가로 X-Ray SDK를 사용해 `const AWS = AWSXRay.captureAWS(require('aws-sdk'))`로 AWS SDK를 래핑해야 한다. 이 래핑이 없으면 DynamoDB 호출은 X-Ray Service Map에서 보이지 않는다. B는 Active Tracing만으로 SDK 호출이 자동 계측되지 않으므로 부족하고, C의 X-Ray Daemon은 Lambda에선 AWS가 관리해 별도 설치가 불가하며, D는 추적이 아니라 감사 로그라 Subsegment 지연을 줄 수 없다.

---

**문제 8.** 100대 EC2에 CloudWatch Agent를 배포했는데 일부 인스턴스에서 Agent 설정이 초기화됐다(다른 설정으로 덮어써짐). 이를 방지하는 방법은?

A) 설정이 틀어진 인스턴스를 모두 재시작해 User Data 부트스트랩으로 Agent 설정을 다시 적용한다
B) SSM State Manager Association으로 원하는 설정을 주기적으로 강제 적용(desired state enforcement)
C) CloudFormation으로 인스턴스를 immutable하게 재배포해 변경된 설정을 새 AMI 기준으로 초기화한다
D) IAM 정책으로 EC2 인스턴스 내 Agent 설정 파일(`amazon-cloudwatch-agent.json`) 쓰기를 Deny해 수정을 원천 차단한다

**정답: B**
해설: SSM State Manager의 핵심 기능이 "Drift 자동 교정"이다. Association을 rate(24 hours)로 설정하면 24시간마다 SSM Parameter Store의 설정으로 Agent를 재구성한다. 누군가 설정을 변경해도 다음 Association 실행 시 원래 설정으로 자동 복구된다. IAM 정책으로 파일 수정을 막는 것은 EC2 내 프로세스 수준에서 어렵다.

---

**문제 9.** ServiceLens를 사용하는 가장 큰 실무 이점은?

A) Trace와 Logs를 단일 뷰로 묶어 중복 저장을 제거하므로 X-Ray·Logs 보관 비용이 자동으로 절감된다
B) X-Ray Service Map에서 에러 Trace를 선택하면 해당 Lambda/ECS의 CloudWatch Logs로 즉시 점프할 수 있다
C) Service Map의 트래픽 패턴을 분석해 X-Ray Sampling Rule의 Reservoir·Fixed Rate를 자동으로 최적화해준다
D) Synthetics Canary의 합성 트래픽 결과가 Service Map 노드에 자동 병합돼 외부 가용성까지 한 화면에 표시된다

**정답: B**
해설: ServiceLens의 핵심 가치는 "Correlated telemetry(상관 원격 측정)"다. 에러가 있는 Trace ID에서 "View logs"를 클릭하면 해당 Lambda 함수의 CloudWatch Logs에서 그 실행의 로그가 즉시 열린다. 수동으로 Log Group에서 request_id를 검색하는 과정을 건너뛰어 장애 분석 시간(MTTD)을 크게 줄인다.

---

**문제 10.** X-Ray 비용이 급증했다. 트래픽이 초당 2000 RPS인 API에서 현재 기본 샘플링(Reservoir=1, Fixed Rate=5%)을 사용 중이다. 비용을 줄이면서 에러 발생 시에는 반드시 추적하게 하려면?

A) X-Ray를 전 구간 비활성화하고, 에러는 CloudWatch Logs의 ERROR 로그로만 사후 분석한다
B) 기본 Sampling Rule의 Fixed Rate를 1%로 낮추고, 에러/Fault가 있는 요청은 별도 Rule(Priority 1, FixedRate 1.0)로 우선 처리
C) X-Ray 추적을 끄고 모든 요청 경로를 EMF 구조화 로그 + Logs Insights로 대체해 Trace 비용을 0으로 만든다
D) X-Ray 단가가 더 낮은 리전으로 워크로드를 이전해 동일 100% 샘플링을 유지하면서 청구액만 낮춘다

**정답: B**
해설: X-Ray Sampling Rule에서 에러/Fault 조건으로 요청을 필터링하면 정상 트래픽의 샘플링률은 줄이면서 에러는 100% 추적할 수 있다. Advanced Sampling Rule에서 `errorCode`, `faultCode` 조건을 추가하면 HTTP 5xx 응답에는 Fixed Rate 1.0을 적용할 수 있다. 정상 트래픽 1% + 에러 100%로 비용과 정밀도를 모두 확보하는 표준 패턴이다.

---

## Week 4 Preview — Logging and Audit Essentials: CloudTrail + Config

Week 4 is the week of audit tools that track "who did what" and "does the current state comply with regulations?"

- Day 1: CloudTrail — difference between Management Event and Data Event, Organization Trail, log integrity validation
- Day 2: CloudTrail Lake — SQL-based analytics data lake, Insights anomaly detection, EventBridge real-time response
- Day 3: AWS Config — Rule evaluation triggers, Conformance Pack, Auto Remediation SSM integration
- Day 4: Audit Manager, License Manager, Resource Explorer — audit report automation and resource visibility
- Day 5: Week 4 review 10 scenario questions

If CloudWatch showed "what's happening right now," CloudTrail + Config tracks "what happened, who did it, and whether we're compliant." Both domains carry high exam weight in SOA-C02.
