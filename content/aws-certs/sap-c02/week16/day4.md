# Day 79 - 도메인 4 종합: 지속적 개선 (관측성·자동화·SRE)

SAP-C02 시험 도메인 4 "Continuous Improvement for Existing Solutions"는 시험 비중 25%로 가장 크다. 이 도메인은 "이미 운영 중인 시스템을 어떻게 운영하면서 점진적으로 개선하느냐"의 질문이고, 본질적으로 **SRE(Site Reliability Engineering)**의 클라우드 적용이다. Google이 2003년 정립한 SRE는 "운영을 코드로(Toil 자동화) + 신뢰성을 측정 가능한 지표로(SLI/SLO/SLA)"라는 패러다임이고, AWS는 이를 위해 관측성·자동화·배포·비용·복원력·보안의 6개 영역에 도구를 제공한다.

오늘은 도메인 4 전체를 한 시나리오 매핑으로 정리한다.

## 관측성: 측정 가능해야 개선 가능하다

### CloudWatch 계열: 통합 모니터링

| 도구 | 용도 |
|------|------|
| CloudWatch Metrics | 시계열 메트릭, 1초~1분 해상도 |
| CloudWatch Logs | 로그 수집·검색·Insights 쿼리 |
| CloudWatch Alarms | 임계치 기반 알림·자동 액션 |
| CloudWatch Synthetics | 합성 사용자 모니터링(canary) |
| CloudWatch RUM | 실제 사용자 모니터링(Real User Monitoring) |
| Application Insights | 자동 이상 탐지·근본 원인 분석 |
| Container Insights | ECS·EKS 컨테이너 메트릭 |
| Lambda Insights | Lambda 성능 메트릭 |

> 🔍 **더 깊이**: CloudWatch Logs Insights는 ad-hoc 로그 쿼리 도구다. 일반 CloudWatch Logs는 인덱싱 없이 저장만 하므로 검색이 느리다. Insights는 쿼리 실행 시점에 병렬 스캔. 단점: 비용이 스캔 데이터 GB당 청구되므로 광범위 검색은 비싸짐. 대안: S3 + Athena, OpenSearch.

### 분산 추적

| 도구 | 표준 |
|------|------|
| X-Ray | AWS 독자 (X-Ray SDK) |
| ADOT (AWS Distro for OpenTelemetry) | OpenTelemetry 표준 (CNCF) |
| ServiceLens | X-Ray + CloudWatch 통합 뷰 |

> 💡 **관련 이론**: **OpenTelemetry**는 2019년 CNCF가 OpenTracing + OpenCensus를 통합해 만든 분산 추적 표준. AWS는 자체 X-Ray를 유지하면서도 ADOT(2020년)로 OpenTelemetry 호환을 제공. 멀티 클라우드 환경에서는 ADOT 권장(같은 SDK로 AWS·GCP·Azure 모두 전송 가능).

### 감사·컴플라이언스

| 도구 | 용도 |
|------|------|
| CloudTrail Lake | API 호출 SQL 쿼리, 7년 보관 |
| AWS Config | 리소스 구성 변경 추적 |
| Config Conformance Pack | 표준 룰 묶음(PCI, HIPAA) |
| Audit Manager | 컴플라이언스 증거 자동 수집 |

## 자동화: Toil을 제거하라

SRE 핵심 원칙: 반복적 운영 작업(Toil)을 자동화해 엔지니어가 개선에 집중. AWS의 자동화 스택:

### Systems Manager (SSM)

| 기능 | 용도 |
|------|------|
| Patch Manager | OS 패치 자동 배포 |
| Session Manager | SSH 없이 EC2 접속 |
| Run Command | EC2에 명령 일괄 실행 |
| Inventory | 소프트웨어 인벤토리 자동 수집 |
| OpsCenter | 운영 사고 티켓 |
| Incident Manager | 페이저·런북·통신 |
| Automation Document | 복잡 운영 워크플로 |

> 🎯 **시나리오**: "한 회사가 500대 EC2에 매월 패치 적용. SSH 접근은 금지(보안 정책)". → **SSM Patch Manager + Maintenance Window + SSM Session Manager**. Patch Manager가 그룹별 점진 패치, Maintenance Window가 시간 통제, Session Manager가 콘솔 디버깅. Bastion·SSH 키 모두 불필요.

### 이벤트 기반 자동화

```
[CloudWatch Alarm] → [EventBridge] → [SNS / Lambda / Step Functions / Incident Manager]
```

> 📚 **사례**: 한 SaaS가 DynamoDB throttle alarm → EventBridge → Lambda로 capacity 자동 증가 → Slack 알림 → 다음 영업일에 root cause 분석. 사람이 한밤중에 깨지 않고 자동 복구.

## 배포: Blue/Green · Canary

| 전략 | 동작 | 적합 워크로드 |
|------|------|----------------|
| Rolling | 인스턴스 일부씩 교체 | 소규모, 빠른 롤백 불필요 |
| Blue/Green | 새 환경 전체 생성 → 한 번에 전환 | 미션 크리티컬, 즉시 롤백 |
| Canary | 트래픽 1%·10%·100% 점진 증가 | 점진 검증 필요 |
| Linear | N분마다 N% 증가 | 시간 기반 점진 |

> 🔍 **더 깊이**: **CodeDeploy의 Lambda Canary**는 Lambda 트래픽을 1%부터 점진 증가시키면서 CloudWatch 알람을 모니터링. 알람 발생 시 자동 롤백. 단 Canary 동안은 두 버전이 동시 동작하므로 DB 스키마 호환성이 필요(backward compatible).

### IaC 도구

| 도구 | 특징 |
|------|------|
| CloudFormation | AWS native, YAML/JSON |
| CloudFormation StackSets | Organizations 전체 배포 |
| CDK | 프로그래밍 언어(TS/Python) → CFN 생성 |
| SAM | Serverless 전용 CFN 확장 |
| Terraform | Multi-cloud, HCL |
| Pulumi | 다양한 언어 지원 |

## 비용 지속 최적화

| 도구 | 용도 |
|------|------|
| Compute Optimizer | EC2/EBS/Lambda right-size 권고 |
| Cost Explorer | 비용 시각화·예측 |
| CUR (Cost and Usage Report) | 상세 청구 데이터 → S3 |
| Budgets | 예산 임계치 알림 |
| Budgets Action | 예산 초과 시 자동 액션(IAM 거부 등) |
| Cost Anomaly Detection | ML 기반 비정상 비용 탐지 |
| Trusted Advisor | 5 카테고리 체크(Cost·Performance·Security·Fault Tolerance·Service Limits) |

> 💡 **관련 이론**: **FinOps**(Financial Operations)는 2019년 정립된 클라우드 비용 관리 패러다임. "엔지니어가 비용 의식을 갖고 의사결정"이 핵심. AWS는 Compute Optimizer·Cost Anomaly Detection으로 FinOps 도구를 native 제공.

## 복원력·보안 (요약)

### 복원력
- **Resilience Hub**: RTO/RPO 격차 자동 평가
- **FIS**: 카오스 엔지니어링(Stop Condition으로 안전망)
- **DRS / MGN**: 지속 DR / 일회성 마이그레이션
- **Route 53 ARC**: Routing Control + Zonal Shift

### 보안
- Layer 1 KMS·CloudHSM, Layer 2 Macie·GuardDuty·Inspector, Layer 3 Security Hub·Detective·Audit Manager, Layer 4 WAF·Shield·Firewall Manager·Network Firewall·DNS Firewall (자세한 내용은 Day 55 참조)

## 시나리오 키워드 → 정답 매핑 표

| 키워드 | 정답 |
|--------|------|
| "EC2 right-size 권고" | Compute Optimizer |
| "예산 초과 자동 정지" | Budgets Action |
| "사고 자동 페이저·런북" | Incident Manager |
| "무중단 ECS 배포" | CodeDeploy Blue/Green |
| "Lambda 점진 트래픽" | CodeDeploy Canary |
| "패치 자동화 + 시간 통제" | SSM Patch Manager + Maintenance Window |
| "키 자동 로테이션" | Secrets Manager |
| "Org 전체 보안 통합 대시보드" | Security Hub Org |
| "분기 Game Day(카오스)" | FIS |
| "워크로드 RTO 자동 평가" | Resilience Hub |
| "비정상 비용 ML 탐지" | Cost Anomaly Detection |
| "API 호출 SQL 쿼리" | CloudTrail Lake |
| "Org 전체 CFN 배포" | StackSets |
| "Real User 모니터링" | CloudWatch RUM |
| "합성 트랜잭션 모니터링" | CloudWatch Synthetics |
| "Lambda 분산 추적" | X-Ray + ADOT |
| "리소스 구성 변경 이력" | AWS Config |
| "HIPAA 감사 증거" | Audit Manager |

## SRE Golden Signals와 AWS 매핑

Google SRE Book의 **4 Golden Signals**(서비스를 모니터링할 때 우선 측정해야 할 4개):

| 신호 | 의미 | AWS 도구 |
|------|------|----------|
| **Latency** | 응답 시간 | CloudWatch Metrics, X-Ray |
| **Traffic** | 처리량 | ELB/API GW 메트릭 |
| **Errors** | 실패율 | CloudWatch + RUM |
| **Saturation** | 자원 포화도 | CloudWatch + Container Insights |

## 정리하며

도메인 4는 "이미 잘 만든 시스템을 어떻게 운영하느냐"의 SRE 영역이다. **측정(관측성) → 자동화(SSM·EventBridge·Lambda) → 점진 개선(CodeDeploy·CFN) → 비용·성능·복원력·보안의 지속 최적화**가 핵심 사이클. 시험은 "운영 부담 최소", "사람 개입 최소", "자동 복구" 같은 키워드가 보이면 거의 항상 SSM·EventBridge·Incident Manager 같은 자동화 도구가 답이다.

내일(Day 80)은 16주 전체 마무리 + 실전 모의고사 풀이 전략.

---

## 📝 연습 문제

**문제 1.** EC2가 over-provisioned된 인스턴스를 자동으로 식별·권고.

A) Trusted Advisor
B) Compute Optimizer
C) X-Ray
D) Config

**정답: B**
해설: Compute Optimizer는 EC2/EBS/Lambda의 14일치 사용 패턴을 ML 분석 → right-size 권고. Trusted Advisor는 이미 idle한 인스턴스 식별이지 사이즈 권고는 약함.

---

**문제 2.** 무중단 ECS 배포 + 즉시 롤백 가능.

A) Rolling Update
B) CodeDeploy Blue/Green
C) ASG 직접 업데이트
D) CloudFormation Update

**정답: B**
해설: Blue/Green은 새 task set 전체 시작 → ALB target group 전환. 문제 발생 시 alarm으로 즉시 이전 set으로 traffic 되돌림. Rolling은 부분 교체라 중간 상태 모호.

---

**문제 3.** 운영 사고 시 자동 페이저 + 런북 표시 + 채팅·통화 통합.

A) AWS Chatbot
B) Incident Manager
C) Health Dashboard
D) EventBridge

**정답: B**
해설: Incident Manager는 사고 단일화 + 페이저 escalation + Runbook 실행 + Chime/Slack 통합. Chatbot은 알림 전달뿐.

---

**문제 4.** 500대 EC2 패치를 그룹별 점진 + 시간 통제.

A) Run Command 수동
B) SSM Patch Manager + Maintenance Window
C) CloudFormation Update
D) EC2 자체 yum-cron

**정답: B**
해설: Patch Manager가 그룹별 룰 + Maintenance Window가 시간대 통제. Run Command는 명령 실행만, CFN은 인스턴스 교체로 부적합.

---

**문제 5.** 분기 카오스 엔지니어링 + 알람 시 자동 중단.

A) AWS Backup으로 백업 테스트
B) FIS + Stop Condition
C) Resilience Hub만
D) Trusted Advisor

**정답: B**
해설: FIS는 의도적 장애 주입, Stop Condition은 CloudWatch 알람 발생 시 자동 중단. 안전망이 핵심 차별화.

---

**문제 6.** 비용이 평소 대비 비정상적으로 증가 시 자동 알림.

A) Budgets만으로 절대 임계치
B) Cost Anomaly Detection (ML 기반)
C) Trusted Advisor
D) CUR 매뉴얼 분석

**정답: B**
해설: Cost Anomaly Detection은 ML로 평소 패턴 학습 → 이상 시 알림. Budgets는 사전 정한 임계치만 모니터링이라 새 패턴 미감지.

---

**문제 7.** Lambda 함수 v2 배포를 트래픽 1%부터 점진 증가 + 알람 시 롤백.

A) Lambda Alias 수동
B) CodeDeploy Lambda Canary
C) API Gateway Stage
D) Step Functions

**정답: B**
해설: CodeDeploy Lambda Canary는 트래픽 1%→10%→100% 점진 + CloudWatch 알람 모니터링 + 자동 롤백. Alias 수동은 단계적 자동화 어려움.

---

**문제 8.** Real User Monitoring + 페이지 성능·JS 에러 추적.

A) CloudWatch Synthetics
B) CloudWatch RUM
C) X-Ray
D) Application Insights

**정답: B**
해설: RUM은 실제 브라우저에서 수집한 사용자 데이터(Core Web Vitals, JS 에러). Synthetics는 합성 트랜잭션(주기적 가상 사용자)으로 다른 용도.
