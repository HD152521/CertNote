# Day 5 - Week 9 Integrated Scenario: Configuration Management Across Fleet Scale

This week has covered **five tools**: SSM (Run Command, Session Manager, Patch Manager), State Manager + Inventory, AppConfig, Parameter Store, Secrets Manager. Each solves one dimension of operations: fleet command execution, stateful compliance, feature rollout, configuration storage, secret lifecycle. 

Real incidents demand **integration** across all five. A fintech company's checkout flow is down. Payment processing degraded. CEO demands root cause. Same scenario, different tools, different questions: Which tool would you reach for? Why? What's the sequence?

Before scenarios, organize Week 9's mental model:

| Tool | Core Problem | Abstraction | Scope |
|---|---|---|---|
| **Run Command** | One-time execution at scale | Stateless command dispatch | Fleet |
| **Session Manager** | Interactive access without Bastion | Shelless SSH replacement | Single instance |
| **Patch Manager** | OS updates at scale with approval gates | Automated lifecycle | Fleet |
| **State Manager** | Continuous config compliance | Declarative desired state | Fleet + auto-recovery |
| **Inventory** | What's installed on my fleet | Asset discovery + versioning | Fleet metadata |
| **AppConfig** | Feature rollout with validation | Config-as-code with gradual apply | Application feature |
| **Parameter Store** | Operational configuration storage | DynamoDB-like key-value | Application runtime |
| **Secrets Manager** | Sensitive data + rotation | Secret version + lifecycle | Application auth |

Three principles bind all: **declarative state** (desired != actual → reconcile), **gradual rollout** (5% → 50% → 100%), and **audit** (CloudTrail + CloudWatch Logs). Test scenarios often present a problem that spans three tools.

---

## 📝 연습 문제

**문제 1.** 결제팀이 새 결제 게이트웨이로 마이그레이션 중인데 현재 5000개 결제 서버 중 일부는 이미 새 게이트웨이로 전환됐고, 일부는 여전히 구 게이트웨이를 쓰고 있다. 각 서버의 현재 게이트웨이 엔드포인트를 확인하고, 아직 전환되지 않은 서버 목록을 즉시 파악하고, 남은 서버들을 점진 전환(10% per hour)해야 한다. 세 가지 요구를 모두 만족하는 구성은?

A) SSM Run Command로 grep 스크립트를 모두 실행해 현재 엔드포인트 수집, 수동으로 분석
B) (1) SSM Inventory Custom Attribute로 gateway-endpoint 수집 + Resource Data Sync → Athena 질의로 현황 파악, (2) AppConfig에 게이트웨이 엔드포인트 저장 + Linear 10% per hour 배포 전략, (3) 배포 중 Validator Lambda로 엔드포인트 연결성 검증
C) 모든 서버에 SSH 접속해 수동 검증 및 업데이트
D) CloudFormation으로 5000개 인스턴스 역할 변경 후 재부팅

**정답: B**

해설: 세 가지 문제 각각이 다른 도구: (1) 현황 파악 = Inventory(수집) + Athena(SQL 분석), (2) 점진 전환 = AppConfig Feature flag 또는 엔드포인트 configuration, (3) 안전성 = Validator Lambda(게이트웨이 연결성 테스트). A는 수동 수집만 되고 중앙 관리·점진 적용 불가, C/D는 규모에서 비현실적. 답: 인벤토리로 현황 파악 후 AppConfig로 점진 배포하는 조합.

---

**문제 2.** 로깅 에이전트가 모든 prod 인스턴스에 설치되어야 한다. 새 인스턴스가 ASG에서 계속 태어나고, 에이전트 버전은 fleet 전체가 동일하게 유지되어야 하며, 에이전트가 삭제되거나 충돌하면 자동 복구되어야 한다. 요구사항을 모두 만족하는 설계는?

A) CloudFormation User Data 스크립트로 설치 — 새 인스턴스는 받지만 삭제되면 미복구, 버전 통제 어려움
B) SSM Distributor로 패키지 정의 + State Manager Association으로 선언적 배포 — 새 인스턴스 태그 일치 시 자동 포함, 주기 실행으로 drift 복구, 버전이 single source of truth
C) Run Command 매시간 실행 — 새 인스턴스 자동 포함 안 됨, cron 기반 폴링 비효율
D) 컨테이너 이미지에만 포함시키기

**정답: B**

해설: State Manager는 "이 상태가 항상 참"을 선언하고 주기적으로 강제한다. Distributor가 패키지를 정의하고 State Manager가 version을 고정해 배포하면 (1) 새 인스턴스 자동 포함(태그), (2) 삭제 시 자동 복구(drift), (3) 버전 일관성(single source of truth). CloudFormation(A)은 배포 시점만 보장, Run Command(C)는 일회성, 컨테이너(D)는 호스트 OS 수준 에이전트(보안, 모니터링 에이전트)에 부적합.

---

**문제 3.** 새벽 3시 Patch Manager가 실행되는데 RDS 데이터베이스와 데이터 연동 중인 특정 애플리케이션이 patch-induced 재부팅으로 순간 연결 끊김을 경험한다. 5000개 앱 서버의 패치를 타이트한 중단 시간(< 30초) 내에 하려면?

A) Patch Manager의 `max-concurrency 1`로 한 대씩만 패치 — 시간이 너무 오래 걸림
B) `max-concurrency 50% + max-errors 5`로 절반씩 2 배치 실행, 각 배치 전에 RDS 연결 풀 비우기(graceful drain) 구현 후 Patch 시작 — 첫 배치 때문에 일부 중단 불가피하지만 앱은 자동 재시도로 극복
C) Connection Pooling + Retry Logic 강화 + Secrets Manager에 DB 자격증명 저장 + 연결 재시도 설정 튜닝 + Patch Maintenance Window 전에 AppConfig로 retry delay 선택적 증가
D) 패치를 아예 하지 않음

**정답: B** 또는 **C**(상황에 따라)

해설: B는 **즉시 해결** (Patch Manager 설정만). 50% 패치 후 앱들의 자동 재연결로 복구, 다음 배치. A는 비현실적으로 오래 걸림, D는 보안 악화. 

깊이 있는 답은 C — **점진적 강화**: 우선 Patch Maintenance Window를 애플리케이션 저트래픽 시간대로 옮기고, Connection Pooling + Retry 로직을 기본으로, AppConfig에서 상황별 retry backoff 조정. Secrets Manager DB 자격증명 회전도 함께하면 전체 운영 견고성 증대. B는 응급, C는 장기 체질 개선.

---

**문제 4.** Secrets Manager에서 MySQL root 비밀번호를 매달 회전 중이다. 회전 Lambda가 2시간 30분에 실패했다. 현재 상태와 대응 방안은?

A) 비밀번호가 자동으로 예전으로 롤백되고 모든 앱 정상 작동
B) 회전 상태 = FAILED, 시크릿 = 구 비밀번호 유지 (AWSCURRENT), 앱 연결 정상. 운영자는 Lambda 로그 확인 후 원인 수정 및 재시도
C) 앱 연결 끊김
D) 새 비밀번호 강제 적용

**정답: B**

해설: 회전 실패 시 시크릿은 원래 상태(AWSCURRENT = 구 비밀번호). 앱 정상. 운영자 수동 개입 필요. 원인: Lambda 타임아웃(DB 접근 불가, 네트워크 문제), 검증 실패, RDS 권한 변경 등. CloudWatch Logs 확인 후 원인 제거 후 RotateSecret API 재실행. 롤백(A)은 DB 측 이미 변경 가능하므로 자동 불가, 강제 적용(D) 없음.

---

**문제 5.** AppConfig에서 feature를 Linear 5% per minute으로 배포 중인데 10분째 메트릭이 이상해 보인다. 다음 단계로 진행하지 않으려면?

A) AppConfig에서 배포 자동 중단
B) AppConfig Validator Lambda에서 자동으로 중단
C) EventBridge로 배포 이벤트 감시 → SNS 알림 → 운영자가 StopDeployment API 호출 또는 CloudWatch 메트릭 기반 자동 롤백 Lambda 트리거
D) AppConfig에는 자동 중단 기능 없음

**정답: C**

해설: AppConfig의 Deployment Strategy는 Validator 실패 전까지 계속 진행한다 (수동으로 멈출 방법 없음). 메트릭 기반 자동 중단은 외부에서 EventBridge + Lambda로 구현해야 한다. 예: CloudWatch Alarm (error rate 급상승) → EventBridge → Lambda가 StopDeployment 호출. 또는 SNS로 운영자에게 알림 후 수동 결정. 답: 외부 자동화 필요.

---

**문제 6.** Parameter Store에 저장된 데이터베이스 엔드포인트를 CloudFormation에서 동적으로 참조하고 있다. 엔드포인트가 바뀌면 어떻게 되나?

A) CloudFormation이 자동 감지해 스택 업데이트
B) 동적 참조는 배포 시점에만 해석 — 파라미터가 바뀌어도 CloudFormation은 다시 실행될 때까지 모름. 스택을 재배포해야 새 엔드포인트를 본다
C) CloudFormation은 절대 변경 안 됨
D) EventBridge로 Parameter Store 변경 감지해 자동 스택 업데이트

**정답: B**

해설: `{{resolve:ssm:/db/endpoint:1}}`은 CloudFormation **배포/업데이트 실행 시점**에만 해석된다. 런타임 변경을 추적하지 않음. 엔드포인트 변경이 즉시 리소스에 반영되려면 (1) 애플리케이션이 런타임에 Parameter Store를 직접 폴링하거나 (2) RDS Proxy 같은 중간 계층을 쓰거나 (3) 매번 스택 업데이트해야 한다. 대부분의 경우 (1)이 권장 패턴.

---

**문제 7.** 금융 회사의 감사팀이 "지난 90일간 모든 prod 인스턴스에서 실행된 시스템 변경 기록을 증거로 제출하시오"라고 요청했다. 준비할 것은?

A) SSH 로그 수집 (변조 가능성 높음, 불완전)
B) (1) Run Command 실행 기록은 CloudTrail에 다 로깅됨, (2) Session Manager 세션 로그는 CloudWatch Logs + S3(KMS)에 변조 불가능하게 기록, (3) State Manager Compliance 리포트로 설정 변경 추적, (4) SSM 모든 작업이 CloudTrail에 기록. 이 4개 조합이 Audit trail
C) CloudWatch Dashboard로 모니터링
D) 불가능, 금융 규제 요구사항 외면

**정답: B**

해설: Audit 증거는 여러 계층 필요. CloudTrail(누가, 언제), Session Manager 로그(무엇), Compliance 리포트(상태 변화). 각각이 AWS 관리 계정 수준에서 변조 불가능하게 기록되므로 SOC 2/PCI/금융감시 요구사항 충족. SSH 로그는 인스턴스 수준이라 운영자가 지울 가능성 높음. CloudTrail + Session Manager 조합이 규제 요구사항의 표준 답변.

---

**문제 8.** 새 CloudWatch Agent 설정을 전 fleet의 5000개 인스턴스에 배포하려 한다. 설정 이상이 발생할 경우 몇 개 인스턴스만 영향받고 빠르게 복구되어야 한다. 배포 절차는?

A) 모든 인스턴스에 동시 배포
B) SSM Patch Manager처럼 `max-concurrency 10% (500대) + max-errors 5` → 먼저 500대에만 배포, 실패 5개 도달 시 즉시 중단, 나머지 4500대 보호
C) 배포 불가능
D) 수동 SSH로 한 대씩

**정답: B**

해설: Run Command는 동일한 blast radius control (max-concurrency/max-errors)을 가진다. 첫 배치(10% = 500대)에서 문제 감지 후 즉시 중단 → 4500대 보호. Patch Manager와 동일 패턴. A는 모두 날림, C/D는 규모 불가능.

---

**문제 9.** 개발자가 실수로 Secrets Manager의 API 키를 GitHub에 푸시했다. 즉시 취해야 할 조치는?

A) GitHub에서 커밋 삭제만 하기 — 푸시된 키는 이미 인터넷에서 스크래핑 가능
B) (1) Secrets Manager에서 즉시 새 버전 생성 (자동 회전 트리거), (2) 누가 이 키를 이미 사용했는지 감사(CloudTrail 기록), (3) 외부 API 서비스(Datadog 등)에서 해당 키 revoke, (4) 앱 코드가 새 키를 읽도록 배포
C) 무시하기 — 한 번 깃허브에 있으면 이미 노출
D) 장기 회피 전략만 세우기

**정답: B**

해설: 민감 정보 노출은 직결 대응 필수. (1) 키 회전(새 버전 생성), (2) 감사(누가 썼나), (3) 외부 revoke(API 서비스 무효화), (4) 앱 배포. 한두 시간 내에 완료해야 광범위한 악용 방지. GitHub 삭제(A)는 이미 늦고, 무시(C)/미루기(D)는 위험.

---

**문제 10.** 전사적으로 운영 표준을 강제하려고 한다. "모든 애플리케이션의 데이터베이스 엔드포인트는 Parameter Store에서만 가져오고, 모든 인스턴스에는 CloudWatch Agent가 설치되어야 한다"를 코드화하려면?

A) 각 팀에 문서 배포 후 자율 준수 — 강제성 없음
B) (1) 데이터베이스 엔드포인트 = Parameter Store → SSM Parameter reference 규칙을 cdk-nag 룰로 강제 + Hooks로 배포 시점 검증, (2) CloudWatch Agent = State Manager + Inventory 수집으로 컴플라이언스 리포트 자동 생성, (3) 미준수 서비스는 자동으로 CloudWatch 알람 + 대시보드에 표시
C) Lambda로 매번 감사
D) 수동 감시

**정답: B**

해설: 표준 강제 = 코드화 + 자동 검증 + 감사. 개발 단계(cdk-nag), 배포 단계(Hooks), 운영 단계(Inventory + Compliance) 3단 방어. 문서(A)는 준수 보장 안 됨, Lambda 감사(C)는 검출만 되고 강제 아님, 수동(D)은 수천 리소스 감시 불가.

---

**문제 11.** 회사의 모든 AWS 계정(200개)에 공통 보안 기준(GuardDuty, CloudTrail, Config)을 한 번에 적용하고 새 계정이 추가될 때 자동 적용되어야 한다. 관리 계정 직접 접촉 최소화하면서 구현하려면?

A) StackSets Self-managed로 각 계정의 계정 ID와 IAM 실행 역할을 수동 추가 — 200 계정 + 매주 신규에 비현실적, 관리 계정 주기 접촉
B) Service-managed StackSets + Delegated Administrator + AutoDeployment Enabled + OU 타겟 지정 — 신규 계정이 OU에 추가되면 자동 배포
C) Lambda로 계정 생성 이벤트 감지해 각 계정에 배포 — 멱등성, 실패 재시도, 롤백을 직접 구현
D) 각 계정에 수동 배포

**정답: B**

해설: 3가지 요구: (1) 200 계정 = Service-managed, (2) 신규 자동 = AutoDeployment, (3) 관리 계정 보호 = Delegated Administrator. B가 유일한 조합. Self-managed(A)의 닭과 달걀 문제(사전 IAM 필요), Lambda(C)의 상태 관리 복잡성, 수동(D)의 규모 불가능.

---

**문제 12.** 정책 변경: "모든 로그는 KMS 암호화되어야 한다"를 기존 100개 리소스(CloudTrail, VPC Flow Logs, ALB 로그 등)에 한 번에 강제 적용하려면?

A) 일일이 수동 업데이트
B) AWS Config Custom Rule로 미준수 검출 → EventBridge + Systems Manager Automation(또는 사용자 정의 Runbook)으로 자동 교정 시작 → 피드백 루프(자동 재시도, 실패 알림)
C) Lambda 만들어서 주기 폴링
D) 불가능

**정답: B**

해설: Detect-Assess-Remediate 폐루프. Config Rule이 검출, Automation/Runbook이 교정, 다시 Config Rule이 검증. 규모와 일관성 보장. 수동(A)은 100개 비현실적, Lambda 폴링(C)은 상태 관리 무겁고 표준 아님.

---

## 📌 Week 9 완료

Week 9는 **configuration and compliance at scale**을 다뤘다. 인프라의 형태(Week 8)와 달리, 인프라가 동작하는 데 필요한 설정·비밀·상태를 어떻게 관리하는지의 부분. SSM, AppConfig, Parameter Store, Secrets Manager의 경계가 명확하고, 각각이 같은 메커니즘(declarative, versioned, audit-enabled)을 다른 차원에서 구현한다는 점을 이해하는 게 핵심.

Week 8과 Week 9를 합치면 **완전한 운영 패러다임**: 
- IaC(Week 8)로 인프라 형태 코드화
- Configuration Management(Week 9)로 동작 상태 선언적 유지
- 둘 다 gradual rollout + audit 원칙 따름

다음 두 주(Week 10-11)는 **모니터링, 로깅, 장애 분석**으로 넘어간다. 기반이 튼튼해야 다음 단계를 밟을 수 있다.

---

## 📌 최종 요약

**Day 1**: SSM Agent pull 모델 → Run Command의 blast radius control → Session Manager의 ZTNA → Patch Manager의 bake time

**Day 2**: State Manager 선언적 상태 + Inventory 자산 수집 + Compliance 컴플라이언스 → Security Hub 통합 감시

**Day 3**: AppConfig feature flag 동적 제어 + Deployment Strategy 점진 배포 + Validator 사전 검증

**Day 4**: Parameter Store 설정 저장 (싸고 간단) 대 Secrets Manager 비밀 관리 (비싸지만 회전) 대비

**Day 5**: 12가지 통합 시나리오 — 한 문제 = 3-4개 도구 조합, 도구 선택 기준 = 추상화 차원 + 규모 + 변경 시점

Exam 대비: Week 9의 12 시나리오를 반복 풀이하면, 실제 시험 문제도 대부분 이 패턴을 벗어나지 않는다. 각 도구 단독 이해도 중요하지만 조합 능력이 더 중요하다.
