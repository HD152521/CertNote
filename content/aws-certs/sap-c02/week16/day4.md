# Day 79 - 도메인 4 종합: 지속적 개선 (25%) — SRE의 역사, SLI/SLO 수학, 관측성 3기둥, 카오스 엔지니어링의 뿌리

SAP-C02 도메인 4 "Continuous Improvement for Existing Solutions"는 시험 비중 25%로 둘째로 크다. 본질은 "이미 운영 중인 시스템을 운영하면서 점진적으로 개선하느냐"이고, 그 뿌리는 **SRE(Site Reliability Engineering)**다. Google이 2003년 Ben Treynor Sloss 팀에서 정립한 SRE는 "운영을 소프트웨어 엔지니어링 문제로 다룬다(Toil을 코드로 자동화) + 신뢰성을 측정 가능한 지표로 관리(SLI/SLO/SLA + Error Budget)"라는 패러다임이다. AWS는 이를 위해 관측성·자동화·배포·비용·복원력·보안 6영역에 도구를 제공한다.

오늘은 도메인 4를 SRE 이론과 함께 한 시나리오 매핑으로 정리한다 — 단순 도구 표가 아니라 "왜 이 운영 방식이 정답인가"의 원리를 이해하면 변형 문제를 푼다.

## 관측성 — 측정 가능해야 개선 가능하다

### 관측성의 세 기둥(Three Pillars)

현대 관측성(observability)은 **메트릭(Metrics)·로그(Logs)·추적(Traces)**의 세 기둥으로 정의된다(이 분류는 Peter Bourgon이 2017년 정리해 업계 표준이 됐다). 메트릭은 "무엇이 얼마나"(집계 수치), 로그는 "무슨 일이"(이산 이벤트), 추적은 "어디서 느려졌나"(요청의 서비스 간 경로)를 답한다.

| 기둥 | AWS 도구 | 답하는 질문 |
|------|----------|------------|
| Metrics | CloudWatch Metrics·Alarms | CPU·지연·에러율이 얼마인가 |
| Logs | CloudWatch Logs·Insights | 무슨 에러가 났나 |
| Traces | X-Ray·ADOT | 요청이 어느 서비스에서 느려졌나 |

| 도구 | 용도 |
|------|------|
| CloudWatch Metrics | 시계열 메트릭, 1초~1분 해상도 |
| CloudWatch Logs Insights | ad-hoc 로그 쿼리(스캔 GB당 과금) |
| CloudWatch Synthetics | 합성 사용자 모니터링(canary) |
| CloudWatch RUM | 실제 사용자 모니터링(Core Web Vitals·JS 에러) |
| Application Insights | 자동 이상 탐지·근본 원인 |
| Container/Lambda Insights | 컨테이너·Lambda 성능 메트릭 |

> 💡 **관련 이론**: SRE의 신뢰성 관리는 **SLI/SLO/SLA + Error Budget** 수학 위에 선다. **SLI**(Indicator, 측정값: 예 가용성 99.95%), **SLO**(Objective, 목표: 99.9%), **SLA**(Agreement, 계약: 99.5% 미달 시 환불)이다. 핵심은 **Error Budget = 100% − SLO**다 — SLO가 99.9%면 한 달에 약 43분의 다운타임이 "허용 예산"이다. 이 예산이 남으면 새 기능을 빠르게 배포하고, 다 쓰면 배포를 멈추고 안정화에 집중한다. 이것이 개발(속도)과 운영(안정성)의 갈등을 수치로 중재하는 SRE의 핵심 혁신이다. 시험에서 "신뢰성 목표 정량화·배포 속도 vs 안정성 균형"의 사고는 이 모델에서 온다.

> 🔍 **더 깊이**: CloudWatch Logs Insights는 인덱싱 없이 **쿼리 실행 시점에 병렬 스캔**하므로 ad-hoc 분석엔 빠르지만 스캔한 데이터 GB당 과금돼 광범위·반복 검색은 비싸진다. 대안 비교: **S3 + Athena**(저장은 싸고 SQL 분석, 서버리스), **OpenSearch**(역색인으로 실시간 풀텍스트·대시보드, 단 클러스터 운영 부담). 패턴: 단기 운영 디버깅은 Logs Insights, 장기 보관·대량 분석은 S3+Athena, 실시간 검색·Kibana 대시보드는 OpenSearch. "수년치 로그 저비용 보관 + 가끔 SQL 분석"은 S3+Athena, "실시간 로그 검색·시각화"는 OpenSearch가 갈린다.

### 분산 추적과 OpenTelemetry

| 도구 | 표준 |
|------|------|
| X-Ray | AWS 독자 SDK |
| ADOT(AWS Distro for OpenTelemetry) | OpenTelemetry(CNCF) 표준 |
| ServiceLens | X-Ray + CloudWatch 통합 뷰 |

> 💡 **관련 이론**: **OpenTelemetry(OTel)**는 2019년 CNCF가 OpenTracing + OpenCensus를 통합해 만든 분산 추적·메트릭·로그의 벤더 중립 표준이다. 그 개념적 뿌리는 Google의 **Dapper 논문(2010)** — 대규모 분산 시스템에서 trace ID를 요청에 전파해 서비스 간 경로를 재구성하는 아이디어다. AWS는 자체 X-Ray를 유지하면서 **ADOT(2020)**로 OTel 호환을 제공한다. 멀티클라우드·벤더 종속 회피가 필요하면 ADOT(같은 SDK로 AWS·GCP·Azure·Datadog 모두 전송), AWS 단독·간편 통합이면 X-Ray다. "벤더 락인 없는 표준 추적·멀티클라우드"는 ADOT 신호다.

## 자동화 — Toil을 제거하라

SRE 원칙: 반복적·수작업·확장성 없는 운영 작업(**Toil**)을 자동화해 엔지니어가 개선에 집중하게 한다. Google SRE는 "팀 시간의 50% 이상을 Toil에 쓰지 말 것"을 규범으로 둔다.

### Systems Manager (SSM)

| 기능 | 용도 |
|------|------|
| Patch Manager | OS 패치 자동 배포(그룹별 룰) |
| Session Manager | SSH 키·Bastion 없이 EC2 접속(로그 감사) |
| Run Command | 다수 EC2에 명령 일괄 실행 |
| Automation Document | 복잡 운영 워크플로 자동화 |
| Incident Manager | 페이저 escalation·런북·통신 통합 |

> 🎯 **시나리오**: "500대 EC2에 매월 보안 패치를 적용해야 하는데, 보안 정책상 SSH 접근과 Bastion 호스트가 금지된다. 패치는 업무 영향을 피해 정해진 시간대에 그룹별로 점진 적용해야 한다. 설계는?" — 답: **SSM Patch Manager(패치 베이스라인·패치 그룹) + Maintenance Window(시간대 통제) + Session Manager(SSH 없는 콘솔 디버깅)**. Patch Manager가 패치 그룹별로 점진 적용하고, Maintenance Window가 "주말 새벽 2~4시" 같은 시간 통제를 하며, 디버깅이 필요하면 Session Manager로 SSH 키·Bastion 없이 접속한다(모든 세션이 CloudTrail·S3에 감사 기록). Bastion·SSH 키 관리 부담이 0이 된다. "SSH 금지 + 패치 자동화 + 시간 통제"는 이 3종 세트가 직답이다.

> 📚 **사례**: 2017년 **AWS S3 us-east-1 대장애**(약 4시간)는 자동화 도구의 양날을 보여준다. 한 엔지니어가 빌링 시스템 디버깅 중 **playbook의 명령에 오타를 내** 의도보다 훨씬 많은 S3 서버를 내려, 인덱스·배치 서브시스템이 재시작되며 연쇄 장애가 났다. 교훈은 (1) **수동 명령에 안전장치(영향 범위 제한·확인 단계)**를 둘 것, (2) **대규모 작업은 점진(canary)으로**, (3) **runbook을 코드로(SSM Automation)** 만들어 사람 오타를 줄일 것이다. 시험에서 "사람 개입 최소·반복 운영 자동화"가 SSM Automation·EventBridge로 가는 역사적 이유다.

### 이벤트 기반 자동 복구

```
[CloudWatch Alarm] → [EventBridge] → [SNS / Lambda / SSM Automation / Incident Manager]
```

> 📚 **사례**: 한 SaaS가 DynamoDB throttle 알람 → EventBridge → Lambda로 capacity 자동 증설 → Slack 통보 → 다음 영업일에 root cause 분석. 사람이 한밤중에 깨지 않고 자동 복구되는 self-healing 패턴이다. 이것이 SRE가 지향하는 "운영을 코드로" 구현한 예다.

## 배포 — Blue/Green · Canary와 점진 위험 분산

| 전략 | 동작 | 적합 워크로드 |
|------|------|----------------|
| Rolling | 인스턴스 일부씩 교체 | 소규모·빠른 롤백 불필요 |
| Blue/Green | 새 환경 전체 생성 → 한 번에 전환 | 미션 크리티컬·즉시 롤백 |
| Canary | 트래픽 1%·10%·100% 점진 | 점진 검증 |
| Linear | N분마다 N% 증가 | 시간 기반 점진 |

> 🔍 **더 깊이**: **CodeDeploy Lambda Canary**는 트래픽을 1%부터 점진 증가시키며 CloudWatch 알람을 모니터링하다 알람 발생 시 자동 롤백한다. 핵심 함정은 **Canary·Blue/Green 동안 두 버전이 동시 동작**하므로 DB 스키마가 backward-compatible해야 한다는 것이다 — 컬럼을 삭제·이름변경하면 옛 버전이 깨진다. 그래서 "expand and contract" 패턴(먼저 컬럼 추가→양 버전 동작→나중에 옛 컬럼 제거)을 쓴다. "무중단 배포 + 즉시 롤백"은 Blue/Green, "Lambda 점진 트래픽 + 자동 롤백"은 CodeDeploy Canary다.

### IaC 도구

| 도구 | 특징 |
|------|------|
| CloudFormation / StackSets | AWS native, StackSets는 Org 전체 배포 |
| CDK | TS/Python → CFN 생성 |
| SAM | Serverless 전용 CFN 확장 |
| Terraform / Pulumi | 멀티클라우드 |

## 비용 지속 최적화 — FinOps

| 도구 | 용도 |
|------|------|
| Compute Optimizer | EC2/EBS/Lambda right-size 권고(ML) |
| Cost Explorer / CUR | 비용 시각화·예측 / 상세 청구 → S3 |
| Budgets / Budgets Action | 예산 알림 / 초과 시 자동 액션(IAM 거부 등) |
| Cost Anomaly Detection | ML 기반 비정상 비용 탐지 |
| Trusted Advisor | 5영역 체크(Cost·Perf·Security·Fault Tol·Limits) |

> 💡 **관련 이론**: **FinOps**(Financial Operations)는 2019년 FinOps Foundation이 정립한 클라우드 비용 운영 문화로, "엔지니어가 비용 의식을 갖고 의사결정"이 핵심이다. 3단계 사이클 — **Inform**(가시성: Cost Explorer·CUR·태깅) → **Optimize**(최적화: right-size·SP/Spot·Compute Optimizer) → **Operate**(운영: 예산·이상 탐지 자동화). SP(Savings Plans) 수학의 핵심: Compute SP는 EC2·Fargate·Lambda를 가로질러 시간당 약정($/h)으로 최대 ~66% 할인하되 인스턴스 패밀리·리전 변경에 유연하고, EC2 Instance SP는 더 싸지만 패밀리 고정이다. "Lambda·Fargate·EC2 통합 할인 + 유연성"은 Compute SP가 정답이다.

## 복원력·보안

### 복원력 — 카오스 엔지니어링

- **Resilience Hub**: RTO/RPO 격차 자동 평가
- **FIS(Fault Injection Service)**: 카오스 엔지니어링(Stop Condition 안전망)
- **Route 53 ARC**: Routing Control(사람 결정 Failover) + Zonal Shift

> 💡 **관련 이론**: **카오스 엔지니어링**은 Netflix가 2010년 AWS로 이전하며 만든 **Chaos Monkey**(무작위로 인스턴스를 죽여 복원력을 강제 검증)에서 비롯됐고, 2011년 Simian Army로 확장됐다. 핵심 원칙은 "장애는 불가피하니 통제된 환경에서 의도적으로 주입해 약점을 미리 찾는다"이다. AWS FIS가 이를 관리형으로 제공하며, **Stop Condition**(CloudWatch 알람이 임계 초과 시 실험 자동 중단)이 안전망이다 — 실험이 실제 장애로 번지기 전에 멈춘다. "분기 Game Day·의도적 장애 주입 + 자동 안전 중단"은 FIS + Stop Condition이 직답이다.

> ⚠️ **함정**: DR 전략의 비용·RTO trade-off를 혼동하면 안 된다. Backup&Restore(가장 싸고 RTO 시간 단위) < Pilot Light(핵심만 켜둠) < Warm Standby(축소판 상시 가동) < Multi-Site Active-Active(가장 비싸고 RTO 분/초). "RTO 분 단위 + 비용 절충"은 Warm Standby, "RTO 거의 0 + 비용 무관"은 Active-Active다. 함정: 콜드 스탠바이(Backup&Restore)는 막상 페일오버 시 미검증 상태라 실패하기 쉽다 — 그래서 평소에도 일부 트래픽을 받는 Warm 이상이 권장된다.

### 보안(요약)

Layer 1 KMS·CloudHSM, Layer 2 Macie·GuardDuty·Inspector, Layer 3 Security Hub·Detective·Audit Manager, Layer 4 WAF·Shield·Firewall Manager·Network Firewall·DNS Firewall.

## SRE Golden Signals와 AWS 매핑

Google SRE Book의 **4 Golden Signals**(서비스 모니터링 시 우선 측정할 4개):

| 신호 | 의미 | AWS 도구 |
|------|------|----------|
| Latency | 응답 시간 | CloudWatch Metrics·X-Ray |
| Traffic | 처리량 | ELB·API GW 메트릭 |
| Errors | 실패율 | CloudWatch·RUM |
| Saturation | 자원 포화 | CloudWatch·Container Insights |

## 시나리오 키워드 → 정답 매핑

| 키워드 | 정답 |
|--------|------|
| "EC2 right-size 권고" | Compute Optimizer |
| "예산 초과 자동 정지" | Budgets Action |
| "사고 자동 페이저·런북" | Incident Manager |
| "무중단 ECS 배포·즉시 롤백" | CodeDeploy Blue/Green |
| "Lambda 점진 트래픽·자동 롤백" | CodeDeploy Canary |
| "SSH 금지 + 패치 자동화 + 시간 통제" | SSM Patch Manager + Maintenance Window + Session Manager |
| "분기 카오스·자동 안전 중단" | FIS + Stop Condition |
| "워크로드 RTO 격차 자동 평가" | Resilience Hub |
| "비정상 비용 ML 탐지" | Cost Anomaly Detection |
| "Lambda·Fargate·EC2 통합 할인" | Compute Savings Plans |
| "벤더 락인 없는 분산 추적" | ADOT(OpenTelemetry) |
| "수년 로그 저비용 + SQL 분석" | S3 + Athena |
| "실시간 로그 검색·대시보드" | OpenSearch |
| "Real User 모니터링" | CloudWatch RUM |
| "합성 트랜잭션 모니터링" | CloudWatch Synthetics |
| "사람 결정 Failover" | Route 53 ARC Routing Control |

## 정리하며

도메인 4는 SRE의 클라우드 적용이다. 핵심 사이클: **측정(관측성 3기둥·SLI/SLO·Error Budget) → 자동화(Toil 제거, SSM·EventBridge self-healing) → 점진 배포(Blue/Green·Canary, 스키마 호환성) → 비용·복원력·보안의 지속 최적화(FinOps·카오스 엔지니어링)**. 시험은 "운영 부담 최소·사람 개입 최소·자동 복구" 키워드가 보이면 거의 항상 SSM·EventBridge·Incident Manager 같은 자동화가 답이다. 역사적 사고(2017 S3 오타 장애·Netflix Chaos Monkey)가 왜 "코드로 된 runbook·통제된 장애 주입"이 정답인지를 설명한다.

내일(Day 80)은 16주 전체 마무리 + 실전 모의고사 + D-Day 전략이다.

---

## 📝 연습 문제

**문제 1.** 500대 EC2에 매월 보안 패치를 적용해야 하는데, 보안 정책상 SSH와 Bastion이 금지된다. 패치는 정해진 시간대에 그룹별로 점진 적용되어야 한다. 가장 적합한 구성은?

A) Run Command로 수동 패치 명령 일괄 실행

B) SSM Patch Manager + Maintenance Window + Session Manager

C) 각 EC2에 yum-cron 설정

D) CloudFormation으로 인스턴스 교체

**정답: B**

해설: "SSH 금지 + 패치 자동화 + 시간대 통제 + 그룹별 점진"은 SSM 3종 세트가 직답이다. Patch Manager가 패치 베이스라인·패치 그룹으로 점진 적용하고, Maintenance Window가 시간대를 통제하며, 디버깅 시 Session Manager로 SSH 키·Bastion 없이 접속(CloudTrail 감사)한다. A(Run Command 수동)는 자동화·시간 통제·점진이 약하다. C(yum-cron)는 중앙 통제·감사·시간 통제가 안 된다. D(인스턴스 교체)는 패치가 아니라 과한 변경이다. 함정: "SSH 금지 + 패치"는 Patch Manager + Session Manager.

---

**문제 2.** Lambda 함수 v2를 트래픽 1%부터 점진 증가시키며 배포하고, CloudWatch 알람 발생 시 자동으로 v1으로 롤백하려 한다. 가장 적합한 방법은?

A) Lambda Alias 가중치를 수동 조정

B) CodeDeploy Lambda Canary

C) API Gateway Stage 변수로 분기

D) Step Functions로 트래픽 제어

**정답: B**

해설: CodeDeploy Lambda Canary는 트래픽을 1%→10%→100%(또는 Linear)로 점진 증가시키며 CloudWatch 알람을 모니터링하다 알람 발생 시 자동 롤백한다 — Lambda Alias 가중치 전환을 자동 오케스트레이션한다. A(수동 Alias 조정)는 점진·자동 롤백을 사람이 해야 해 운영 부담이 크다. C·D는 트래픽 분기는 되지만 알람 연동 자동 롤백·점진 배포 자동화가 CodeDeploy만큼 매끄럽지 않다. 함정: "Lambda 점진 트래픽 + 자동 롤백"은 CodeDeploy Canary. 주의: Canary 중 두 버전 동시 동작이므로 backward-compatible해야 한다.

---

**문제 3.** 한 서비스의 가용성 SLO를 99.9%로 정하고, 이 목표를 초과 달성하는 동안만 새 기능을 빠르게 배포하되 예산을 소진하면 배포를 멈추고 안정화에 집중하려 한다. 이 운영 모델의 이름과 핵심 지표는?

A) 카오스 엔지니어링 — MTBF

B) Error Budget — (100% − SLO)

C) FinOps — 단위 비용

D) Blue/Green — 롤백 시간

**정답: B**

해설: 이는 SRE의 **Error Budget** 모델이다. Error Budget = 100% − SLO이므로 SLO 99.9%면 한 달 약 43분의 허용 다운타임이 예산이다. 예산이 남으면 기능을 빠르게 배포(속도 우선)하고, 소진하면 배포를 멈추고 안정화(신뢰성 우선)한다 — 개발 속도와 운영 안정성의 갈등을 수치로 중재한다. A는 의도적 장애 주입 기법으로 다른 개념이다. C는 비용 운영 문화다. D는 배포 전략이다. 함정: "신뢰성 목표 정량화 + 속도/안정성 균형"은 Error Budget(=100%−SLO).

---

**문제 4.** 분기마다 의도적으로 장애를 주입해 시스템 복원력을 검증하되, 실제 사용자 영향이 임계치를 넘으면 실험이 자동 중단되어야 한다. 가장 적합한 도구·구성은?

A) AWS Backup으로 복구 테스트

B) FIS + Stop Condition(CloudWatch 알람)

C) Resilience Hub 평가만

D) Trusted Advisor 점검

**정답: B**

해설: 카오스 엔지니어링은 **FIS(Fault Injection Service)**가 관리형으로 제공하며, **Stop Condition**이 CloudWatch 알람을 모니터링하다 임계 초과 시 실험을 자동 중단하는 안전망이다 — Netflix Chaos Monkey의 정신을 안전하게 구현한다. A(Backup 테스트)는 복원력 주입이 아니다. C(Resilience Hub)는 RTO/RPO 격차를 정적 평가할 뿐 실제 장애를 주입하지 않는다. D는 베스트프랙티스 점검이다. 함정: "의도적 장애 주입 + 자동 안전 중단"은 FIS + Stop Condition.

---

**문제 5.** 수년치 애플리케이션 로그를 저비용으로 보관하면서, 가끔 SQL로 ad-hoc 분석하려 한다. 클러스터 운영 부담은 피하고 싶다. 가장 적합한 조합은?

A) CloudWatch Logs에 영구 보관 + Logs Insights

B) S3에 로그 보관 + Athena로 SQL 쿼리

C) OpenSearch 클러스터에 색인

D) Redshift에 적재

**정답: B**

해설: "저비용 장기 보관 + 가끔 SQL 분석 + 운영 부담 최소"는 **S3(저렴한 스토리지·Lifecycle로 Glacier 티어링) + Athena(서버리스 SQL, 스캔량 과금)**가 정석이다. A(CloudWatch Logs 영구 보관)는 저장·Insights 스캔 비용이 누적돼 수년치엔 비싸다. C(OpenSearch)는 실시간 검색엔 좋지만 클러스터 상시 운영·비용 부담이 크다. D(Redshift)는 상시 클러스터로 가끔 쓰는 로그 분석엔 과하다. 함정: "저비용 보관 + 가끔 SQL + 서버리스"는 S3+Athena, "실시간 검색·대시보드"는 OpenSearch.

---

**문제 6.** 비용이 평소 패턴 대비 비정상적으로 급증할 때 자동으로 탐지·알림받고 싶다. 사전에 절대 임계치를 알 수 없는 새로운 이상 패턴도 잡아야 한다. 가장 적합한 도구는?

A) Budgets로 절대 임계치 알림

B) Cost Anomaly Detection(ML 기반)

C) Trusted Advisor

D) CUR 수동 분석

**정답: B**

해설: Cost Anomaly Detection은 ML로 평소 비용 패턴을 학습해 통계적으로 비정상인 지출을 탐지·알림한다 — 사전에 임계치를 모르는 "새로운 이상 패턴"도 잡는다. A(Budgets)는 사전에 정한 절대 임계치만 모니터링해 예측 못 한 패턴을 놓친다. C·D는 자동 ML 탐지가 아니다. 함정: "사전 임계치 불가 + 이상 패턴 자동 탐지"는 Cost Anomaly Detection.

---

**문제 7.** 멀티클라우드(AWS + 온프레 K8s) 환경에서 동일한 계측 SDK로 분산 추적을 수집해 벤더 락인을 피하려 한다. 가장 적합한 선택은?

A) X-Ray SDK

B) ADOT(AWS Distro for OpenTelemetry)

C) CloudWatch Logs

D) 각 환경별 독자 APM

**정답: B**

해설: ADOT는 CNCF의 OpenTelemetry 표준 배포판으로, 같은 SDK·계측으로 AWS·GCP·Azure·온프레·서드파티(Datadog 등) 어디로든 텔레메트리를 보낼 수 있어 벤더 락인을 피한다. A(X-Ray)는 AWS 독자 SDK라 멀티클라우드 이식성이 떨어진다. C(Logs)는 추적이 아니다. D는 표준화·통합 관측을 잃는다. 함정: "멀티클라우드 + 벤더 중립 추적"은 ADOT(OpenTelemetry).

---

**문제 8.** 리전 장애 시 자동 헬스체크 기반 페일오버 대신, 운영팀이 상황을 판단해 수동으로(그러나 신뢰성 높게) 트래픽을 다른 리전으로 전환하고 싶다. 가장 적합한 서비스는?

A) Route 53 Health Check 자동 Failover

B) Route 53 Application Recovery Controller(ARC) Routing Control

C) Global Accelerator 자동

D) Lambda로 라우팅 변경

**정답: B**

해설: Route 53 ARC의 **Routing Control**은 사람이 의도적으로 on/off 스위치를 눌러 트래픽 라우팅을 전환하는 고신뢰 제어판이다 — 자동 헬스체크가 오탐(false positive)으로 잘못 페일오버하는 것을 막고, 운영팀의 검토된 결정으로 전환한다(여러 리전에 분산된 데이터 플레인으로 자체 가용성이 높음). A(자동 Health Check)는 사람 판단이 개입하지 않는다. C(Global Accelerator)는 자동 엔드포인트 페일오버다. D는 신뢰성·감사가 약하다. 함정: "사람이 판단하는 신뢰성 높은 수동 Failover"는 Route 53 ARC Routing Control.

---
