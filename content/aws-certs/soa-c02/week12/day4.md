# Day 4 - 전체 모의고사 50문항, 그리고 오답이 알려주는 것

모의고사의 가치는 점수가 아니라 **오답의 패턴**에 있다. SOA-C02에서 틀리는 방식은 일정하다 — 비슷한 두 서비스를 혼동하거나(CloudTrail/Config, SG/NACL), 한정어("MOST cost-effective", "LEAST operational overhead")를 놓치거나, "되긴 되는" 보기와 "가장 적합한" 보기를 구별하지 못한다. 이 50문항은 그 함정들을 의도적으로 깔았다. 맞히고 넘어가지 말고, 틀린 문항이 어느 패턴인지 보라. 각 도메인 묶음 앞의 짧은 안내가 "오답이 모이는 지점"을 짚는다.

---

## 🧩 응시 가이드

- **권장 시간**: 90분(실제 180분의 절반 페이스). **채점**: 정답/50×100, 80% 부근이 합격선 감각
- **마킹**: 헷갈리면 별표(★) 후 재검토 — 실제 시험 Flag 연습. **오답 처리**: 틀린 문항마다 "혼동/한정어 놓침/함정"으로 분류해 기록

---

## 📝 모의고사 50문항

### 도메인 1: 모니터링·로깅·수정 (10문항)

> 📚 **사례**: 2019년 Capital One 유출은 이 도메인의 가치를 보여준 대표 사고다. 전직 AWS 직원이 잘못 설정된 WAF로 SSRF 공격을 걸어 EC2 메타데이터의 IAM 자격증명을 탈취하고, 그 권한으로 S3에서 1억 건 이상을 빼냈다. 사후 조사에서 CloudTrail 로그의 비정상 `ListBuckets`·대량 `GetObject` 패턴이 침해 범위 산정의 핵심 증거가 됐다 — CloudTrail이 꺼져 있었다면 추적 자체가 불가능했고, GuardDuty가 있었다면 이 패턴을 공격 진행 중에 잡았을 것이다. 이 도메인의 오답은 거의 다 "기록의 종류"(CloudTrail=행위, Config=상태, Logs=앱 로그, Flow Logs=트래픽) 혼동에서 오니, "무엇에 대한 기록을 묻는가"를 먼저 분류하라.

**문제 1.** EC2 메모리 사용률 메트릭 수집은?
A) 기본 메트릭에 포함
B) CloudWatch Agent 설치 필요
C) CloudTrail
D) Config

**정답: B**

해설: 하이퍼바이저는 게스트 OS 내부를 못 보므로 메모리·디스크 사용률은 표준 메트릭에 없다. CloudWatch Agent를 OS에 설치해 `mem_used_percent`를 푸시해야 한다. "메모리=Agent"가 반사 답이다.

---

**문제 2.** 여러 알람을 결합해 알람 폭주를 막는 기능은?
A) Anomaly Detection
B) Composite Alarm
C) Metric Math
D) Dashboard

**정답: B**

해설: Composite Alarm은 여러 알람을 AND/OR로 결합해 "CPU 높음 AND 메모리 높음"일 때만 발동시켜 알람 폭주를 막는다. Anomaly Detection은 동적 임계, Metric Math는 메트릭 연산이다.

---

**문제 3.** API 호출 이력 추적 서비스는?
A) CloudWatch Logs
B) CloudTrail
C) VPC Flow Logs
D) Config

**정답: B**

해설: CloudTrail은 "누가 언제 무슨 API를 호출했나"를 이벤트 스트림으로 남기는 감사 서비스다. Logs=앱 로그, VPC Flow Logs=네트워크 메타데이터, Config=리소스 상태.

---

**문제 4.** SG 변경 이력을 시간순으로 보려면?
A) CloudTrail
B) Config (구성 이력)
C) CloudWatch
D) VPC Flow Logs

**정답: B**

해설: 함정 문항. CloudTrail도 SG 변경 API(`AuthorizeSecurityGroupIngress` 등)를 기록하지만, "각 시점에 어떤 규칙 집합이었나"를 타임라인으로 보여주는 건 Config다 — 구성 스냅샷을 시간순으로 쌓는 상태 기반 모델이기 때문. "누가 바꿨나"는 CloudTrail, "그때 어떤 상태였나"는 Config다.

---

**문제 5.** Logs Insights에서 특정 에러 로그를 5분 단위로 집계하는 쿼리는?
A) `count(*) by error`
B) `stats count(*) by @message`
C) `filter @message like /ERROR/ | stats count() as cnt by bin(5m)`
D) `select count(*)`

**정답: C**

해설: Logs Insights는 SQL이 아닌 파이프(|) 기반 언어다. `filter`로 ERROR를 거르고 `stats count() by bin(5m)`으로 5분 버킷 집계한다 — `bin(5m)`이 핵심 함수다. 나머지는 문법이 아니다.

---

**문제 6.** Config Rule이 비준수 리소스를 자동 수정하려면?
A) Lambda 직접 호출
B) Remediation Action (SSM Automation Document)
C) EventBridge
D) CloudFormation

**정답: B**

해설: Config의 Remediation은 SSM Automation Document를 호출해 리소스를 표준 상태로 되돌린다. 멱등적("이 상태가 되게 하라")이라 중복 실행에 안전하다. EventBridge로도 가능하지만 Config 내장 메커니즘은 Remediation Action이다.

---

**문제 7.** 정적 임계를 정하기 어려운 메트릭(요일·시간대별 패턴이 큼)에 알람을 걸려면?
A) 표준 Alarm
B) Composite Alarm
C) Anomaly Detection (ML 학습 밴드)
D) Metric Filter

**정답: C**

해설: Anomaly Detection은 과거 데이터를 ML로 학습해 동적 "정상 밴드"를 그리고 벗어나면 알람한다. 주중/주말·낮/밤처럼 정상값이 변하는 메트릭은 고정 임계로 오탐·미탐이 많지만, 밴드는 패턴을 따라가 적합하다.

---

**문제 8.** 여러 계정의 CloudWatch 메트릭·로그를 하나의 대시보드에서 보려면?
A) 각 계정 별도
B) Cross-Account Observability (Source + Monitoring 계정)
C) CloudTrail
D) Config Aggregator

**정답: B**

해설: CloudWatch Cross-Account Observability는 모니터링 계정 하나가 여러 소스 계정의 메트릭·로그·트레이스를 통합 조회한다. Config Aggregator(D)는 구성 컴플라이언스 통합이라 결이 다르다.

---

**문제 9.** Log Group에서 "ERROR" 단어 출현 횟수를 메트릭으로 변환해 알람을 걸려면?
A) Subscription Filter
B) Metric Filter
C) Insights Query
D) EMF

**정답: B**

해설: Metric Filter는 로그 패턴(ERROR)을 매칭해 CloudWatch 메트릭으로 변환하고 알람을 건다. Subscription Filter는 Kinesis/Lambda 실시간 전송, Insights는 대화형 쿼리, EMF는 메트릭 임베드 형식이다. "로그→메트릭+알람"은 Metric Filter.

---

**문제 10.** CloudTrail Lake의 목적은?
A) 실시간 알림
B) Trail 데이터를 SQL로 검색 가능한 데이터 레이크에 장기 보존
C) Config 대체
D) Logs 대체

**정답: B**

해설: 일반 CloudTrail은 S3에 쌓을 뿐 검색이 번거롭다. CloudTrail Lake는 이벤트를 관리형 데이터 레이크에 장기 보존하고 SQL로 직접 질의한다("지난 1년간 특정 사용자의 DeleteBucket"을 한 줄로). 감사·포렌식·장기 분석용이다.

---

### 도메인 2: 안정성·BCP (8문항)

> 🔍 **더 깊이**: 복제 오답은 "목적" 혼동에서 난다 — Multi-AZ(동기·HA·손실0)와 Read Replica(비동기·읽기 확장·lag)는 복제 방식부터 다르다. 그 바탕에 **CAP 정리**가 있다: 동기 복제는 일관성(C)을 우선해 손실 0이지만 쓰기 지연이 늘고, 비동기는 가용성·성능을 우선하되 복제 지연 동안 약한 일관성을 허용한다. 그래서 "방금 쓴 걸 곧바로 읽는" read-after-write 워크로드를 Read Replica로 보내면 옛 데이터를 읽는 버그가 난다. DR 4종은 RTO·RPO 좌표이며, Pilot Light(앱 계층 꺼둠·RTO 수십 분)와 Warm Standby(축소판 전체 스택 상시 가동·RTO 분 이내)의 경계가 단골 함정이다.

**문제 11.** RDS Multi-AZ의 주 목적은?
A) 읽기 성능 향상
B) HA (자동 failover)
C) 백업
D) 비용 절감

**정답: B**

해설: Multi-AZ는 다른 AZ의 standby에 동기 복제하다가 primary 장애 시 자동 failover하는 고가용성 기능이다. standby는 평소 트래픽을 받지 않으므로 읽기 성능 향상(A)이 아니다 — 읽기 확장은 Read Replica다.

---

**문제 12.** RDS 읽기 성능 확장은?
A) Multi-AZ
B) Read Replica
C) Snapshot
D) RI

**정답: B**

해설: Read Replica는 비동기 복제본을 여러 개 두고 읽기 트래픽을 분산한다. 다만 비동기라 복제 지연이 있어, 방금 쓴 데이터를 곧바로 읽어야 하는(read-after-write) 일관성이 중요한 읽기는 primary로 보내야 한다.

---

**문제 13.** 리전 장애 대비 Aurora 글로벌 배포는?
A) Aurora Global Database
B) Multi-AZ
C) Cross-Region Snapshot
D) RDS Proxy

**정답: A**

해설: Aurora Global Database는 primary 리전에서 보조 리전들로 전용 인프라 복제(RPO 보통 1초 이내)하고, 리전 장애 시 보조를 promote해 복구한다. Multi-AZ(B)는 단일 리전 HA라 리전 전체 장애를 못 막는다.

---

**문제 14.** EBS 일일 자동 스냅샷 + 보존 정책을 가장 가볍게 구현하려면?
A) AWS Backup
B) Data Lifecycle Manager (DLM)
C) CloudFormation
D) Snapshot 수동

**정답: B**

해설: 함정 문항. AWS Backup(A)도 가능하지만 "EBS만, 가장 가볍게"라면 DLM이 직접적이다 — EBS 스냅샷·AMI·보존을 태그 기반 자동화하는 전용 경량 도구다. AWS Backup은 다중 서비스(RDS·EFS·DynamoDB) 통합용이다.

---

**문제 15.** RTO 분 단위 + 비용은 적당한 DR 전략은?
A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: B**

해설: Pilot Light는 핵심(DB)만 상시 복제하고 앱·웹 계층은 꺼두었다가 장애 시 켠다 — RTO 분 단위·비용 중간. Warm Standby(C)는 축소판 전체 스택을 상시 가동해 RTO 분 이내로 더 빠르지만 더 비싸다. "분 단위+적당한 비용"은 Pilot Light.

---

**문제 16.** S3 객체를 다른 리전에 자동 복제하려면?
A) S3 Lifecycle
B) Cross-Region Replication (CRR)
C) Snowball
D) Storage Gateway

**정답: B**

해설: CRR은 한 버킷의 객체를 다른 리전 버킷으로 비동기 자동 복제한다(리전 장애 대비·지연 단축·규제 요건). Lifecycle(A)은 스토리지 클래스 전환·만료이지 복제가 아니다.

---

**문제 17.** Route 53에서 Active/Passive 구성(평소 Primary, 장애 시 Secondary)은?
A) Weighted
B) Failover (Primary + Secondary + Health Check)
C) Latency
D) Geolocation

**정답: B**

해설: Failover 라우팅은 Primary 레코드에 헬스체크를 걸어, Primary가 정상이면 거기로, 비정상이면 Secondary로 보낸다 — 전형적 Active/Passive. Weighted(A)는 가중치 분산(A/B·카나리), Latency(C)는 최근접 리전이다.

---

**문제 18.** AWS Backup Vault Lock의 목적은?
A) 비용 절감
B) 백업 삭제 방지 (WORM, 규제 요건)
C) 암호화
D) 압축

**정답: B**

해설: Vault Lock은 백업 볼트에 WORM(Write Once Read Many) 정책을 걸어, 보존 기간 동안 백업을 삭제·변경하지 못하게 한다(랜섬웨어·내부자·실수 방어, 규제 요건). 참고로 S3 객체 자체의 보존은 S3 Object Lock이고, 백업 리소스 보존은 Vault Lock으로 둘을 혼동하지 말 것.

---

### 도메인 3: 배포·자동화 (9문항)

> 🔍 **더 깊이**: SSM 컴포넌트는 단발(Run)·유지(State)·정기(Patch+MW)·접속(Session)으로 갈린다. Session Manager가 SSH를 대체하는 메커니즘이 단골인데, 핵심은 **인바운드 포트를 전혀 열지 않는다**는 점이다 — SSM Agent가 SSM 엔드포인트로 아웃바운드 연결을 열고 그 위로 세션이 흐른다(인증=IAM, 감사=CloudTrail/Logs, 키 관리 소멸). 프라이빗 서브넷이면 ssm·ssmmessages·ec2messages Interface Endpoint가 필요하다. 그리고 자동 수정은 **멱등적**이어야 한다 — EventBridge·SQS는 RFC 9110이 정의하듯 at-least-once 전달이라 중복 가능하므로, "추가(append)"가 아니라 "이 상태가 되게 하라(ensure)"는 선언형이어야 안전하다.

**문제 19.** CloudFormation에서 변경을 적용 전 미리 검토하려면?
A) Drift Detection
B) Change Set
C) Rollback
D) Nested Stack

**정답: B**

해설: Change Set은 템플릿 변경이 실제로 어떤 리소스를 추가·수정·삭제할지를 적용 전에 미리 보여준다. 의도치 않은 삭제(예: 리소스 교체로 인한 데이터 손실)를 사전에 잡는 안전장치다. Drift Detection(A)은 적용 후 실제와 템플릿의 차이를 본다.

---

**문제 20.** 멀티 계정/리전에 동일 IaC를 일괄 배포하려면?
A) Nested Stack
B) StackSets
C) Cross-Stack Reference
D) Change Set

**정답: B**

해설: StackSets는 하나의 템플릿을 여러 계정·여러 리전에 한 번에 배포·관리한다(예: 조직 전체에 동일 보안 baseline 적용). Nested Stack(A)은 한 스택 안의 모듈화, Cross-Stack Reference(C)는 스택 간 출력 참조다.

---

**문제 21.** 다운타임 0 + 문제 시 즉시 롤백이 가능한 배포는?
A) All at once
B) Rolling
C) Blue/Green
D) In-place

**정답: C**

해설: Blue/Green은 구 환경(blue)을 둔 채 신 환경(green)을 띄워 트래픽을 전환하고, 문제 시 blue로 되돌리는 한 번으로 즉시 롤백한다. 단 DNS 전환이면 TTL 지연, 공유 DB면 스키마 호환성이 함정이다.

---

**문제 22.** SSM에서 100대 EC2의 OS 패치를 매월 정기 자동 적용하려면?
A) Run Command 수동
B) Patch Manager + Maintenance Window
C) State Manager만
D) Automation만

**정답: B**

해설: Patch Manager가 패치 Baseline(분류·심각도별 승인 지연)을 정의하고, Maintenance Window가 "매월 특정 시각" 정기 일정에 작업을 돌린다. Run Command(A)는 단발 즉시 실행이라 정기성이 없다.

---

**문제 23.** EC2에 SSH 키·22번 포트 없이 안전하게 접속하려면?
A) Bastion
B) Session Manager
C) VPN
D) Direct Connect

**정답: B**

해설: Session Manager는 SSM Agent의 아웃바운드 연결로 셸을 열어 인바운드 포트가 0이어도 되고, IAM으로 인가하며 CloudTrail로 모든 세션을 감사한다. Bastion(A)은 또 하나의 관리·노출 대상이라 운영 부하가 크다.

---

**문제 24.** DB 마스터 패스워드를 주기적으로 무중단 자동 회전하려면?
A) Parameter Store SecureString
B) Secrets Manager + Lambda Rotation
C) KMS만
D) IAM

**정답: B**

해설: 자동 회전은 Secrets Manager의 핵심 기능이다(RDS 내장 또는 Lambda 회전). Parameter Store SecureString(A)은 암호화 저장은 되지만 자동 회전이 없다. "DB 패스워드 회전 = Secrets Manager"가 반사 답이다.

---

**문제 25.** CloudFormation 템플릿과 실제 리소스의 차이를 탐지하려면?
A) Change Set
B) Drift Detection
C) Rollback Trigger
D) Nested Stack

**정답: B**

해설: Drift Detection은 누군가 콘솔·CLI로 스택 밖에서 리소스를 수정해 실제 상태가 템플릿과 어긋났을 때(drift) 그 차이를 보고한다. desired(템플릿)와 actual(실제)의 diff를 노출하는 기능이다. Change Set(A)은 적용 전 변경 미리보기다.

---

**문제 26.** 사용자가 승인된 IaC를 셀프서비스로 안전하게 배포하게 하려면?
A) CloudFormation 콘솔만
B) Service Catalog
C) Proton
D) Beanstalk

**정답: B**

해설: Service Catalog는 관리자가 승인한 IaC 제품 카탈로그를 만들고 사용자는 그 안에서만 셀프서비스 배포한다(거버넌스+자율성). Proton(C)은 플랫폼 팀의 컨테이너·서버리스 표준 스택 도구라 결이 다르다.

---

**문제 27.** 100대 EC2에 일회성 명령을 즉시 실행하려면?
A) Run Command
B) State Manager
C) Patch Manager
D) Maintenance Window

**정답: A**

해설: Run Command는 다수 인스턴스에 즉시 단발 명령을 실행한다. State Manager(B)는 원하는 상태를 지속 유지(주기적 적용), Patch Manager(C)는 패치 전용이다. "즉시·단발"은 Run Command다.

---

### 도메인 4: 보안·컴플라이언스 (8문항)

> 💡 **관련 이론**: 보안 서비스 오답은 "무엇을 보는가"를 안 따져서 난다 — GuardDuty=행위(로그), Inspector=취약점, Macie=데이터(S3), Security Hub=통합. 권한은 SCP(상한)·Permission Boundary(상한)·Identity(부여)의 AND 교집합이며 명시적 Deny가 모두를 이긴다.

**문제 28.** 조직(Organizations) 단위로 모든 계정에 권한 가드레일을 걸려면?
A) IAM Policy
B) Permission Boundary
C) SCP
D) Identity Center

**정답: C**

해설: SCP는 Organizations의 OU/계정에 적용되는 권한 상한(가드레일)이다. 단 SCP는 권한을 부여하지 않고 제한만 한다 — 실제 권한은 각 계정의 IAM 정책으로 따로 줘야 한다. Permission Boundary(B)는 개별 IAM 엔티티 단위라 범위가 다르다.

---

**문제 29.** IAM 역할·사용자가 가질 수 있는 최대 권한 상한을 개별로 설정하려면?
A) SCP
B) Permission Boundary
C) Resource Policy
D) Session Policy

**정답: B**

해설: Permission Boundary는 특정 IAM 엔티티(역할/사용자)의 권한 천장을 정의한다 — 예를 들어 개발자에게 권한 위임을 허용하되, 그가 만드는 역할이 절대 관리자 권한을 넘지 못하게 막는다. SCP(A)는 계정 전체 단위라 입자도가 다르다.

---

**문제 30.** S3에 저장된 PII(민감정보)를 자동 탐지하려면?
A) Inspector
B) Macie
C) GuardDuty
D) Security Hub

**정답: B**

해설: Macie는 ML로 S3 객체 내용을 스캔해 주민번호·카드번호 등 PII가 어디 있고 노출됐는지 찾는다. Inspector(A)는 소프트웨어 취약점, GuardDuty(C)는 행위 기반 위협이라 데이터 내용은 안 본다. "S3 데이터 내용 = Macie"다.

---

**문제 31.** EC2·ECR 이미지·Lambda의 알려진 취약점(CVE)을 스캔하려면?
A) GuardDuty
B) Inspector
C) Macie
D) Detective

**정답: B**

해설: Inspector는 EC2·컨테이너 이미지·Lambda의 소프트웨어 패키지를 CVE 데이터베이스와 대조해 패치 안 된 취약점을 찾는다. "취약점 스캔 = Inspector"가 반사 답이다.

---

**문제 32.** VPC Flow Logs·DNS·CloudTrail을 분석해 진행 중인 위협을 탐지하려면?
A) Macie
B) GuardDuty
C) Inspector
D) Config

**정답: B**

해설: GuardDuty는 이 세 가지 로그 흐름을 상관분석해 악성 IP 통신, 비정상 API 패턴, 자격증명 탈취 같은 진행 중 위협을 탐지한다. 행위(로그)를 보는 서비스라 "지금 일어나는 공격"을 잡는다.

---

**문제 33.** 여러 보안 서비스의 finding을 한곳에 모아 표준(CIS·PCI) 대비 점수화하려면?
A) GuardDuty
B) Security Hub
C) Detective
D) Config

**정답: B**

해설: Security Hub는 GuardDuty·Inspector·Macie·Config의 finding을 통합 수집하고, CIS·PCI-DSS·NIST 같은 보안 표준 대비 컴플라이언스 점수를 매긴다. 개별 탐지가 아니라 "통합 대시보드"가 핵심이다.

---

**문제 34.** 외부(다른 계정·퍼블릭)에 의도치 않게 노출된 IAM·리소스 접근을 자동 탐지하려면?
A) IAM Access Analyzer
B) GuardDuty
C) Config
D) Trusted Advisor

**정답: A**

해설: IAM Access Analyzer는 리소스 정책(S3·역할·KMS)을 automated reasoning(형식 논리)으로 분석해 외부에 노출된 접근 경로를 찾는다. GuardDuty(B)는 행위 위협이라 결이 다르다.

---

**문제 35.** PCI-DSS·SOC·HIPAA 컴플라이언스 증거 수집과 보고서 작성을 자동화하려면?
A) Security Hub
B) Audit Manager
C) Artifact
D) Config

**정답: B**

해설: Audit Manager는 프레임워크별 증거(CloudTrail·Config 등)를 자동 수집해 감사 보고서를 만든다. Artifact(C)는 AWS 자신의 컴플라이언스 문서를 받는 곳이라 다르다. "내 환경 보고서 자동화"는 Audit Manager.

---

### 도메인 5: 네트워킹·콘텐츠 전송 (9문항)

> ⚠️ **함정**: 네트워킹 오답은 SG/NACL의 stateful/stateless 혼동과 Endpoint 종류에 몰린다. 패킷은 IGW→Route→NACL→SG 순서로 검문받고, NACL은 stateless라 ephemeral port(1024-65535) 아웃바운드를 명시 허용해야 하며, 무료 Gateway Endpoint는 S3/DDB 전용이다.

**문제 36.** Security Group의 특징은?
A) Stateless
B) Stateful (응답 자동 허용)
C) 서브넷 단위
D) Deny 규칙 지원

**정답: B**

해설: SG는 stateful이라 연결 추적 테이블로 나간 연결의 응답을 자동 허용한다. 그래서 인바운드 규칙만 적으면 되고, allow 규칙만 지원(deny 없음)하며, 적용 단위는 서브넷이 아니라 인스턴스(ENI)다.

---

**문제 37.** S3·DynamoDB만 무료로 프라이빗 연결하는 옵션은?
A) Interface Endpoint
B) Gateway Endpoint
C) PrivateLink
D) NAT Gateway

**정답: B**

해설: Gateway Endpoint는 S3와 DynamoDB 전용이고 무료다 — 라우트 테이블 경로로 트래픽을 AWS 내부로 직행시킨다. Interface Endpoint/PrivateLink(A·C)는 대부분의 서비스를 지원하지만 시간당+GB당 과금이 있다.

---

**문제 38.** 두 리소스 간 네트워크 경로를 실제 트래픽 없이 정적 분석하려면?
A) VPC Flow Logs
B) Reachability Analyzer
C) Traffic Mirroring
D) Network Access Analyzer

**정답: B**

해설: Reachability Analyzer는 SG·NACL·라우트 등의 구성을 정적 분석해 도달 가능 여부와 막힌 지점을 보고한다(실제 패킷 불필요). VPC Flow Logs(A)는 실제 트래픽이 발생한 뒤의 기록이다.

---

**문제 39.** UDP 게임 트래픽을 글로벌 가속하려면?
A) CloudFront
B) Global Accelerator
C) Route 53
D) ALB

**정답: B**

해설: CloudFront는 HTTP/S 캐싱 전용이라 UDP를 못 다룬다. Global Accelerator는 TCP·UDP를 AWS 사설 백본으로 가속하고 고정 Anycast IP를 제공한다. "UDP·non-HTTP 글로벌 가속 = Global Accelerator"다.

---

**문제 40.** CloudFront에서 S3 직접 접근을 막는 현재 표준은?
A) OAI (구식)
B) OAC (Origin Access Control)
C) Signed URL만
D) Bucket Policy만

**정답: B**

해설: OAC는 2022년 OAI를 대체한 표준으로 SigV4 서명 기반이며 KMS 암호화 객체까지 지원한다. S3를 비공개로 두고 CloudFront만 OAC로 접근하게 강제한다. OAI는 레거시로 분류된다.

---

**문제 41.** 다수 VPC를 허브-스포크로 연결하려면?
A) VPC Peering
B) Transit Gateway
C) Direct Connect
D) VPN

**정답: B**

해설: VPC Peering은 1:1이고 transitive가 안 된다(A↔B,B↔C라도 A↔C 불가). Transit Gateway는 중앙 허브로 다수 VPC·VPN·DX를 연결해 N:N을 관리한다. 멀티 VPC 규모엔 TGW가 정석이다.

---

**문제 42.** 사용자를 가장 가까운(지연이 낮은) 리전으로 라우팅하려면?
A) Failover
B) Latency-based Routing
C) Weighted
D) Simple

**정답: B**

해설: Latency-based Routing은 사용자→각 리전 실측 지연 기준으로 가장 빠른 리전으로 보낸다. Geolocation(어느 나라/대륙)과 헷갈리지 말 것 — Latency는 "실측 지연 최저"가 기준이다.

---

**문제 43.** VPC Flow Logs의 한계는?
A) 허용/거부 트래픽 메타데이터만 기록, 패킷 페이로드는 X
B) 모든 패킷 캡처
C) IPv6 미지원
D) 실시간 불가

**정답: A**

해설: VPC Flow Logs는 5-tuple(출발지·목적지 IP/포트·프로토콜)과 허용/거부 결과 같은 메타데이터만 남긴다 — 실제 패킷 내용(페이로드)은 없다. 페이로드까지 봐야 하면 Traffic Mirroring을 쓴다. "무엇이 통신했나"는 Flow Logs, "무엇을 주고받았나"는 Mirroring이다.

---

**문제 44.** Direct Connect의 백업 연결로 흔히 쓰는 것은?
A) 또 다른 DX
B) Site-to-Site VPN
C) NAT
D) TGW

**정답: B**

해설: DX는 전용선이라 안정적이나 단일 회선이면 장애 시 끊긴다. 저렴·신속한 Site-to-Site VPN을 백업으로 두어 DX 장애 시 자동 우회한다(평소엔 DX). 또 다른 DX(A)는 비싸고 구축이 오래 걸린다.

---

### 도메인 6: 비용·성능 최적화 (6문항)

> ⚠️ **함정**: 비용 도구는 분석(Cost Explorer)·알림+Action(Budgets)·ML 이상 탐지(Cost Anomaly Detection)·Right Sizing 권장(Compute Optimizer)으로 역할이 갈린다. 약정의 진짜 함정은 적용 범위다 — Savings Plans는 EC2·Fargate·Lambda에만 적용되고 **RDS·Redshift·ElastiCache에는 적용되지 않는다**(각 서비스의 Reserved Instances를 써야 한다). "RDS 약정 할인"의 답이 Compute SP가 아니라 RDS RI인 이유다. 약정은 유연성↔할인 반비례, Spot은 회수 위험↔90% 할인이다.

**문제 45.** EC2·Fargate·Lambda 모두에 적용되는 가장 유연한 약정은?
A) Standard RI
B) Compute Savings Plans
C) EC2 Instance SP
D) Convertible RI

**정답: B**

해설: Compute SP는 패밀리·리전·서비스(EC2/Fargate/Lambda)를 가리지 않고 시간당 금액만 약속하므로 가장 유연하다. 대신 할인은 중간이다(유연성↔할인 반비례). 워크로드가 자주 바뀌면 Compute SP가 적합하다.

---

**문제 46.** Spot 회수 2분 전 알림에 대응해 우아하게 종료하려면?
A) Cron
B) EventBridge → Lambda / Lifecycle Hook
C) CloudWatch Alarm
D) SQS 폴링

**정답: B**

해설: Spot 회수 2분 경고는 EC2 Spot Instance Interruption Warning 이벤트로 오고, EventBridge→Lambda/Lifecycle Hook으로 드레이닝·체크포인트 후 종료한다. Spot은 stateless·체크포인트 가능한 워크로드 전제다.

---

**문제 47.** EC2·EBS·Lambda의 Right Sizing을 ML로 권장받으려면?
A) Trusted Advisor만
B) Compute Optimizer
C) Cost Explorer
D) Budgets

**정답: B**

해설: Compute Optimizer는 14일 이상의 메트릭 퍼센타일 분포를 ML로 분석해 Over/Under/Optimized를 판정하고 더 적합한 타입을 권장한다. Trusted Advisor(A)는 폭넓은 점검을 하지만 인스턴스 단위 ML 권장은 약하다.

---

**문제 48.** 비용의 비정상 급증을 ML로 자동 탐지하려면?
A) Budgets
B) Cost Anomaly Detection
C) Trusted Advisor
D) CloudWatch Alarm

**정답: B**

해설: Cost Anomaly Detection은 지출 패턴을 ML로 학습해 평소와 다른 급증을 자동 탐지·알림한다. Budgets(A)는 사용자가 정한 고정 임계 기반이라, "예상 못한 이상 패턴"은 ML 기반 Anomaly Detection이 더 잘 잡는다.

---

**문제 49.** 신규 인스턴스 타입의 용량을 특정 AZ에 보장(할인은 불필요)하려면?
A) Standard RI
B) EC2 Capacity Reservation
C) Spot
D) Compute SP

**정답: B**

해설: Capacity Reservation은 할인이 아니라 "필요할 때 반드시 용량이 있음"을 보장하는 보험이다(가격은 온디맨드). 대규모 이벤트·DR 대비처럼 용량 확보 자체가 중요할 때 쓴다. RI/SP는 할인이 목적이지 용량 보장이 핵심이 아니다(둘은 별개 개념).

---

**문제 50.** 월 예산 임계 도달 시 자동으로 EC2 stop 또는 제한 SCP를 부착하려면?
A) Cost Anomaly Detection
B) Budgets + Budget Action
C) CloudWatch Alarm
D) Trusted Advisor

**정답: B**

해설: Budget Action은 예산 임계 도달 시 자동으로 IAM/SCP 정책을 부착하거나 EC2/RDS를 중지하는 등 능동적 조치를 취한다. Cost Anomaly Detection(A)은 탐지·알림까지이지 자동 차단 액션은 없다. "알림 + 자동 차단"은 Budgets + Action이다.

---

## 📊 채점 & 약점 분석

> 💡 **관련 이론**: 도메인별 정답률은 비중과 함께 봐야 한다 — 20% 도메인 1에서 5개와 12% 도메인 6에서 5개는 점수 무게가 다르다. 약점은 "틀린 수 × 비중"으로 우선순위를 매겨라.

### 도메인별 정답률 기록

| 도메인 | 문항 수 | 정답 수 | 정답률 | 비중 |
|--------|---------|---------|--------|------|
| 도메인 1 (모니터링·로깅) | 10 | __/10 | __ % | 20% |
| 도메인 2 (안정성·BCP) | 8 | __/8 | __ % | 16% |
| 도메인 3 (배포·자동화) | 9 | __/9 | __ % | 18% |
| 도메인 4 (보안·컴플라이언스) | 8 | __/8 | __ % | 16% |
| 도메인 5 (네트워킹) | 9 | __/9 | __ % | 18% |
| 도메인 6 (비용·성능) | 6 | __/6 | __ % | 12% |
| **합계** | **50** | **__/50** | **__ %** | 100% |

### 점수대별 진단

| 정답률 | 진단 | 처방 |
|--------|------|------|
| ≥ 90% | 합격 안정권 | 시간 관리 + 함정 문제만 복습 |
| 80-89% | 합격선 | 약점 도메인 day.md 재정독 |
| 70-79% | 위험 | 약점 2개 도메인 집중 + 추가 문제 |
| < 70% | 부족 | week1~12 핵심 포인트 빠른 회독 |

### 오답 유형별 자가 진단

틀린 문항을 아래 세 유형으로 분류하면 약점의 성격이 보인다:

| 오답 유형 | 증상 | 처방 |
|-----------|------|------|
| **서비스 혼동** | 비슷한 둘을 뒤바꿈(CloudTrail/Config 등) | 헷갈리는 쌍 표로 정리 후 차이의 "이유" 암기 |
| **한정어 놓침** | "MOST cost-effective" 같은 조건 무시 | 질문을 끝까지, 한정어에 밑줄 긋는 습관 |
| **함정 보기** | "되긴 되지만 최선은 아닌" 보기 선택 | 모든 보기를 "가능한가"가 아니라 "가장 적합한가"로 재평가 |

### 약점 도메인별 처방

- **도메인 1 부족** → Week 2·3·4 + 이번 주 Day 1, CloudWatch/CloudTrail/Config의 데이터 모델 차이 재정독
- **도메인 2 부족** → Week 10 + Day 1, RDS Multi-AZ(동기)/Read Replica(비동기)/Aurora Global + DR 4종의 RTO/RPO 좌표
- **도메인 3 부족** → Week 5·6·7 + Day 2, 선언형 IaC + 배포 정책 trade-off + SSM 7대 컴포넌트
- **도메인 4 부족** → Week 1·9 + Day 2, IAM 결정 트리(명시적 Deny 우선) + 보안 서비스 "무엇을 보는가"
- **도메인 5 부족** → Week 8 + Day 3, 패킷 검문 순서 + stateful/stateless + Endpoint 종류
- **도메인 6 부족** → Week 11 + Day 3, 약정의 유연성↔할인 + 비용 도구 역할 구분

---

## 📌 오늘의 요약

1. 모의고사는 점수가 아니라 **오답 패턴**으로 본다 — 서비스 혼동 / 한정어 놓침 / 함정 보기 세 유형으로 분류
2. 약점은 "틀린 수 × 도메인 비중"으로 우선순위 — 비중 20% 도메인 1과 12% 도메인 6은 무게가 다르다
3. 가장 잦은 혼동 쌍: **CloudTrail(행위)/Config(상태)**, **SG(stateful)/NACL(stateless)**, **Multi-AZ(동기)/Read Replica(비동기)**, **SP(유연)/RI(할인)**
4. 시나리오 한정어("MOST cost-effective", "LEAST operational overhead", "automatically")가 정답 단서 — 질문을 끝까지 읽는다
5. 내일(Day 5) D-Day 체크리스트 + 짧은 모의고사 20문항으로 컨디션을 조정한다
