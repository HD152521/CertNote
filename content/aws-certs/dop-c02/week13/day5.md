# Day 5 - Week 13 종합 복습: 고가용성·멀티 리전·DR·복원력 검증을 하나로 꿰다

Week 13은 "장애가 나도 살아남는 시스템을 어떻게 설계하고, 그것이 정말 작동하는지 어떻게 검증하는가"를 다뤘다. 이 한 주를 관통하는 단 하나의 통찰이 있다 — **가용성은 "장애가 안 나게 막는 것"이 아니라 "장애가 날 것을 전제로, 정족수·복제·페일오버로 견디게 설계하고, 그 견딤을 실험으로 검증하는 것"이다.** 단일 AZ에서 다중 AZ로, 단일 리전에서 다중 리전으로, 백업에서 Active-Active로, 그리고 "잘 되겠지"라는 믿음에서 FIS 카오스 실험으로 — 한 주의 흐름은 점점 더 강한 장애를 가정하고 점점 더 엄밀하게 검증하는 방향이었다.

오늘은 네 날의 핵심을 다시 엮고, DOP 시험에서 실제로 나오는 형태의 시나리오 문제로 종합 점검한다. 시험의 함정은 거의 항상 "비슷해 보이는 두 선택지 중 트레이드오프의 미묘한 차이"에 있다 — 동기냐 비동기냐, 단일 리더냐 멀티 마스터냐, RTO를 위해 평소에 켜두느냐 마느냐, Compliance Mode냐 Governance Mode냐. 이 경계들을 다시 또렷이 한다.

## 한 주를 관통하는 네 개의 축

### Day 1 — Multi-AZ: 복제와 쿼럼의 분산 원리

복제는 **동기/비동기 사이의 RPO-지연 트레이드오프**이고, 이는 CAP/PACELC 좌표 위에 놓인다. RDS Multi-AZ는 **블록 레벨 물리 동기 복제**라 Standby가 그림자 디스크처럼 동작해 읽기를 못 받지만, Read Replica는 **논리적 비동기 복제**라 자기 쿼리 엔진으로 읽기를 받는다 — 이 물리/논리 차이가 "왜 한쪽은 read 불가, 한쪽은 가능"의 답이다. Aurora는 복제를 스토리지로 내려 **6-copy/3-AZ 쿼럼(4/6 write, 3/6 read, AZ+1 장애 모델)**과 "로그가 곧 DB" 설계로 전통 DB를 앞선다. RTO는 "승격 후보가 떠 있고 데이터 복사가 불필요할수록 짧다"가 원리이며, RDS Proxy가 커넥션 풀링으로 페일오버를 클라이언트로부터 숨긴다.

### Day 2 — Multi-Region: DNS·글로벌 복제·암호화 경계

멀티 리전은 빛의 속도 때문에 **비동기 복제를 받아들여야** 하고, 그 충돌·불일치를 다루는 게 본질이다. Route 53은 **DNS 기반 GSLB**(7종 정책 + 정족수 헬스 체크)지만 DNS 캐시 TTL이라는 지연 한계가 있어, 즉각 페일오버는 **anycast 고정 IP의 Global Accelerator**가 맡는다. 데이터 복제는 **단일 리더(Aurora Global, 충돌 없음)와 멀티 마스터(DynamoDB Global Tables, LWW)**의 트레이드오프이며, LWW는 clock skew로 silent lost update 위험을 품는다. **KMS Multi-Region Key**가 같은 키 자료를 리전 간 공유해 복제 암호문의 이식성을 주고, Route 53 ARC가 컨트롤/데이터 플레인 분리로 안전한 DR 토글을 제공한다.

### Day 3 — DR 4 전략: RTO·RPO·비용의 경제학

DR은 "얼마나 빨리"가 아니라 **BIA로 RTO/RPO를 정하고 비용과 저울질하는 경제 문제**(ISO 22301)다. 4 전략은 **"평소에 얼마나 켜두느냐"의 스펙트럼** — Backup & Restore(아무것도 안 켬, 가장 싸고 느리나 IaC면 단축) → Pilot Light(데이터만, 앱 꺼둠, 경로 미검증) → Warm Standby(축소판 상시, 경로 검증됨) → Active-Active(풀 용량 둘 다, RTO 0이나 비싸고 "절반 죽어도 전부 받는" 용량 계획 필요). AWS Backup이 태그 기반 정책으로 통합하고, **Vault Lock Compliance Mode가 WORM 불변 백업으로 랜섬웨어를 막는다.**

### Day 4 — 복원력 검증: Resilience Hub와 FIS

검증 안 된 복구는 작동하지 않는다. **카오스 엔지니어링**(Netflix Chaos Monkey 기원)은 과학적 방법(정상 상태→가설→장애 주입→검증)을 신뢰성에 적용한 것이다. **FIS**는 Targets(폭발 반경 다이얼: ALL/COUNT/PERCENT)·Actions·Stop Conditions(안전벨트)로 카오스를 관리형으로 구현하고, **Resilience Hub**는 RTO/RPO 목표 대비 실측 갭을 계량화한다. EventBridge Scheduler + FIS로 정기 자동화하고, Game Day(사람·일회성)와 Chaos(시스템·정기)는 보완 관계다.

## 핵심 경계 한눈에 — 시험 함정 정리

| 헷갈리는 쌍 | 결정적 차이 |
|-------------|-------------|
| RDS Multi-AZ Standby vs Read Replica | 물리 동기(read 불가) vs 논리 비동기(read 가능) |
| Aurora vs Aurora Global | 단일 리전 6-copy(30초) vs 멀티 리전 비동기(<1분 promote) |
| Aurora Global vs DDB Global Tables | 단일 리더(충돌 없음) vs 멀티 마스터(LWW) |
| Route 53 Failover vs Global Accelerator | DNS(캐시 TTL 지연) vs anycast IP(즉각) |
| Pilot Light vs Warm Standby | 앱 꺼둠(미검증) vs 축소판 상시(검증됨) |
| Vault Lock Governance vs Compliance | 권한자 우회 가능 vs root도 불가(WORM) |
| Backtrack vs PITR | in-place 되감기(MySQL,72h) vs 새 클러스터 복원 |
| Game Day vs Chaos | 사람·일회성 vs 시스템·정기 자동 |

## 🧠 시나리오 문제

**문제 1.** 글로벌 게임 서비스가 UDP 트래픽을 쓰고, 한 리전이 죽으면 클라이언트의 DNS 캐시와 무관하게 즉각 다른 리전으로 페일오버해야 한다. 동시에 클라이언트는 고정 IP 2개만 알면 되도록 하려 한다. 가장 적합한 것은?

A) Route 53 Failover Routing + 짧은 TTL(예: 10초)로 캐시 만료를 앞당겨 빠른 페일오버 유도

B) AWS Global Accelerator — anycast 고정 IP 2개 + 헬스 체크 기반 즉각 재라우팅

C) CloudFront 배포 + Origin Failover로 엣지에서 건강한 리전 오리진으로 자동 전환

D) Route 53 Latency Routing + 헬스 체크로 지연 최저이면서 건강한 리전으로 라우팅

**정답: B**

해설: Route 53 기반 페일오버는 응답 IP 자체를 바꿔 클라이언트 DNS 캐시 TTL만큼 지연되고(A·D 한계), UDP·고정 IP 요구를 충족하지 못한다. Global Accelerator는 전 세계 anycast로 광고되는 고정 IP 2개를 제공하고, 백엔드 리전 장애 시 헬스 체크 기반으로 즉시 건강한 리전으로 재라우팅한다 — IP가 안 바뀌므로 DNS 캐시와 무관하게 페일오버가 즉각적이다. TCP/UDP(L4)를 지원해 게임 트래픽에 맞다. CloudFront(C)는 HTTP/HTTPS 콘텐츠 캐싱용이라 UDP에 부적합하다.

---

**문제 2.** 결제 시스템이 RTO 0·RPO 0에 가까워야 하고 비용은 제약이 거의 없다. 두 리전에서 동시에 쓰기를 받아야 한다. 데이터 계층 구성과 반드시 검증할 위험은?

A) Aurora Global Database(단일 리더) — secondary는 읽기 전용이나 충돌이 없어 정합성이 가장 안전

B) DynamoDB Global Tables(멀티 마스터, LWW) + Route 53 Latency Routing, 단 "같은 키 동시 갱신 시 silent lost update"와 "한 리전이 전체 트래픽 감당 용량"을 반드시 검증

C) RDS Multi-AZ + 리전 간 Read Replica로 한 리전 쓰기·다른 리전 읽기를 구성

D) S3 CRR(Cross-Region Replication)로 양 리전 객체를 양방향 복제해 동시 쓰기를 수용

**정답: B**

해설: 두 리전에서 동시에 쓰기를 받는 Active-Active는 멀티 마스터가 필요하므로 DynamoDB Global Tables가 적합하다(Aurora Global은 단일 리더라 secondary가 읽기 전용이라 양 리전 동시 쓰기 불가 — A 한계). 단 두 가지를 반드시 검증해야 한다. 첫째, Global Tables는 LWW로 충돌을 해결하는데 clock skew로 실제 최신 쓰기가 져 silent lost update가 날 수 있어 "같은 키 동시 갱신"은 안티패턴이다. 둘째, 한 리전이 죽으면 남은 리전이 100% 트래픽을 받아야 하므로 각 리전을 전체 용량으로 잡아야 한다(cascading failure 방지). RDS Multi-AZ(C)는 단일 리전이고 S3 CRR(D)은 객체 복제다.

---

**문제 3.** 전통적 RDS Multi-AZ를 쓰는 시스템에서 읽기 부하가 커졌다. Standby로 읽기를 분산하려 했으나 불가능했다. 이유와 올바른 해법은?

A) Standby가 다른 리전에 있어 cross-region 읽기가 차단된 것 — Standby를 같은 리전·AZ로 옮긴다

B) Multi-AZ Standby는 블록 레벨 물리 복제라 독립 쿼리 엔진이 없어 read 불가 — Read Replica(논리 비동기 복제)를 추가하거나 Multi-AZ DB Cluster(readable standby)로 전환

C) Standby 엔드포인트에 대한 IAM/SG 읽기 권한이 빠진 것 — 읽기 권한과 보안 그룹 규칙을 추가

D) Standby를 promote해 독립 읽기 인스턴스로 승격한 뒤 읽기 트래픽을 분산

**정답: B**

해설: 전통적 Multi-AZ Standby는 스토리지 블록을 그대로 미러링하는 물리 복제라 자기 쿼리 엔진이 없는 "그림자 디스크"이므로 읽기를 받을 수 없다. 읽기 분산이 필요하면 binlog/WAL 기반 논리 비동기 복제인 Read Replica를 추가하거나(별도 endpoint, read 가능), readable standby를 제공하는 Multi-AZ DB Cluster(2022+, <35초 페일오버 보너스)로 전환한다. 리전(A)·권한(C)이 원인이 아니고, Standby promote(D)는 페일오버지 읽기 분산이 아니다.

---

**문제 4.** Aurora MySQL에서 운영자가 실수로 대량 UPDATE를 실행했다. 5분 전 상태로 클러스터 전체를 가장 빠르게 되돌리려 한다. 또한 별도 케이스로 "30일 전 특정 테이블만" 복구해야 할 때의 차이는?

A) 둘 다 스냅샷에서 새 클러스터로 복원하고 필요한 시점·테이블을 추출해 적용

B) 5분 전 전체 되돌리기는 Backtrack(in-place, 최대 72h), 30일 전 특정 테이블은 PITR/스냅샷 복원(새 클러스터). Backtrack은 MySQL만·활성화 이후만 가능

C) 둘 다 Backtrack으로 in-place 되감기 — 5분 전과 30일 전 모두 윈도우 내에서 처리

D) 둘 다 Read Replica를 promote해 해당 시점 데이터를 가진 인스턴스로 분리 복구

**정답: B**

해설: Aurora Backtrack(MySQL 호환)은 클러스터를 새로 만들지 않고 제자리(in-place)에서 특정 시점으로 되감아 "방금 실수를 몇 분 전으로"에 가장 빠르다(최대 72시간 윈도우, 활성화 시점 이후만, PostgreSQL 불가). 반면 "30일 전" 또는 "특정 테이블만"은 Backtrack 범위를 벗어나므로 PITR이나 스냅샷에서 새 클러스터로 복원해야 한다. 둘은 용도가 갈리며 혼동이 시험 함정이다. 스냅샷 일괄(A)은 빠른 in-place 되감기를 놓치고, Read Replica promote(D)는 복구가 아니다.

---

**문제 5.** Lambda 기반 서버리스 앱이 트래픽 급증 시 RDS의 "too many connections"로 실패하고, DB 페일오버 시 커넥션이 일제히 끊겨 connection storm이 난다. 한 번에 해결하는 표준은?

A) DB 인스턴스 클래스를 키워 max_connections 한도를 높이고 더 많은 동시 커넥션을 수용

B) RDS Proxy — 커넥션을 풀링·다중화해 실제 DB 커넥션 수를 억제하고, 페일오버 시 클라이언트 커넥션을 유지해 storm을 완화

C) Lambda 예약 동시성을 1로 제한해 동시에 열리는 DB 커넥션 수 자체를 강하게 묶는다

D) Read Replica를 추가해 읽기 커넥션을 분산함으로써 Primary의 커넥션 압박을 완화

**정답: B**

해설: Lambda는 동시 실행 환경마다 커넥션을 열어 급증 시 max_connections를 소진하고, 페일오버 시 수백 커넥션이 일제히 재연결을 시도해 새 Primary를 connection storm으로 무너뜨릴 수 있다. RDS Proxy는 클라이언트-DB 사이에서 커넥션을 풀링·다중화(PgBouncer/HikariCP의 관리형 구현)해 실제 DB 커넥션을 억제하고, 페일오버 시 클라이언트 커넥션을 유지해 storm을 완화한다 — 두 문제를 한 번에 푼다. 인스턴스 확대(A)는 근본 해결이 아니고, 동시성 1(C)은 처리량을 죽이며, Read Replica(D)는 읽기 분산이지 커넥션·storm 해결이 아니다.

---

**문제 6.** 금융 규제로 백업을 보존 기간 내 절대 삭제·변조 불가하게 만들어 랜섬웨어가 백업까지 지우는 것을 막아야 한다. root 사용자조차 예외가 없어야 한다. 올바른 구성은?

A) AWS Backup Vault Lock — Governance Mode로 보존을 강제하되 지정 IAM 권한자에게만 우회를 허용

B) AWS Backup Vault Lock — Compliance Mode(WORM, root 포함 누구도 보존 기간 내 삭제 불가)

C) IAM 정책에 백업 삭제(`backup:DeleteRecoveryPoint`) 명시적 Deny를 걸어 삭제를 차단

D) 백업을 격리된 별도 계정의 Vault로 cross-account 복사해 원본 손상에 대비

**정답: B**

해설: Vault Lock Compliance Mode는 WORM(Write Once Read Many)을 구현해 보존 기간 내에는 root를 포함 누구도 백업을 삭제·변경할 수 없는 진짜 불변 상태를 만든다 — 랜섬웨어의 "백업부터 삭제" 전술과 금융 규제(SEC 17a-4류)에 대한 답이다(S3 Object Lock Compliance Mode와 같은 사상). Governance Mode(A)는 특정 IAM 권한자가 우회 가능해 "실수 방지" 수준이라 root 예외 없음 요건을 못 채운다. IAM 거부(C)는 권한 탈취 시 변경 가능하고, Cross-Account 복사(D)만으로는 그 사본의 불변성이 보장되지 않는다(복사 대상에도 Vault Lock 필요).

---

**문제 7.** Tier 3 비중요 워크로드의 DR 비용을 최소화해야 한다. 전체 인프라는 Terraform으로 코드화돼 있고, RTO는 한두 시간까지 허용된다. 가장 적합한 전략과 그 이유는?

A) Active-Active — 두 리전에 풀 용량을 상시 가동해 RTO를 0에 가깝게 만드는 가장 안전한 선택

B) Backup & Restore — DR 리전에 인프라를 전혀 안 켜 비용 최소, IaC로 스택 배포 + 백업 복원을 자동화하면 RTO 한두 시간 달성 가능

C) Warm Standby — DR 리전에 축소판을 상시 가동해 경로를 검증해 두고 장애 시 스케일 업

D) Pilot Light — DR 리전에 데이터 복제만 켜두고 앱 tier는 꺼둬 비용과 RTO를 절충

**정답: B**

해설: 비용 최소화가 최우선이고 RTO 한두 시간이 허용되면 Backup & Restore가 정답이다 — DR 리전에 인프라를 켜두지 않아 가장 싸다. 전체 인프라가 IaC(Terraform)로 코드화돼 있으면 "스택 배포 → 백업 복원"을 자동화해 RTO를 한두 시간으로 줄일 수 있다(데이터+코드만 있으면 재현 가능한 불변 인프라 사상). Active-Active(A)·Warm Standby(C)·Pilot Light(D)는 모두 평소 인프라를 켜둬 비용이 더 들어 "비용 최소화"와 맞지 않는다.

---

**문제 8.** Pilot Light DR을 자동 발동하는 절차를 코드화하려 한다. 발동 시 수행할 단계와 도구로 올바른 것은?

A) 엔지니어가 콘솔에서 기억과 경험에 의존해 발동 단계를 수동으로 순서대로 실행

B) Step Functions/SSM Runbook으로 "Read Replica promote → ASG desired 0→N → ALB 헬스 통과 대기 → Route 53(ARC) 페일오버 → 알림"을 코드화하고 정기 drill로 검증

C) 발동 절차의 모든 단계를 위키 런북 문서에 상세히 적어 두고 사고 시 따라 실행

D) RPO를 줄이도록 Backup 주기를 더 짧게 잡아 발동 시 복원 데이터 손실을 최소화

**정답: B**

해설: Pilot Light 발동은 데이터 불씨(Read Replica)를 promote하고, 꺼둔 앱 tier(ASG desired=0)를 N으로 올리고, 헬스 통과를 기다린 뒤, Route 53/ARC로 트래픽을 페일오버하고 알림을 보내는 절차다. 이를 Step Functions나 SSM Automation Runbook으로 코드화하면 결정적·재현 가능해지고, 정기 DR drill로 반복 검증해 "앱 tier가 평소 꺼져 있어 미검증"이라는 Pilot Light의 핵심 위험(경로 부패)을 막는다. 수동 실행(A)·문서(C)는 실수·미검증 위험이 크고, 잦은 Backup(D)은 발동 절차와 무관하다.

---

**문제 9.** EC2 운영 인스턴스 중 무작위 30%에 5분간 CPU 부하를 주입해 Auto Scaling 자가 치유를 검증하되, 실험이 진짜 장애로 번지면 즉시 중단되게 하려 한다. FIS 구성은?

A) Target SelectionMode ALL + CPU-Stress(PT5M)로 전수에 부하를 줘 최악 상황을 한 번에 검증, Stop Condition 없음

B) Target SelectionMode PERCENT(30) + Action CPU-Stress(PT5M) + Stop Condition(CloudWatch P99/에러율 Alarm)

C) Action으로 무작위 30% 인스턴스를 Terminate해 ASG의 인스턴스 교체 자가 치유를 검증

D) 운영자가 30% 인스턴스에 직접 부하 발생기를 실행하고 이상 시 수동으로 중단

**정답: B**

해설: 무작위 30%는 SelectionMode PERCENT(30)으로 폭발 반경을 제어하고, CPU 부하는 AWSFIS-Run-CPU-Stress를 5분(PT5M) 실행하며, 진짜 장애로 번질 때 즉시 중단은 CloudWatch Alarm 기반 Stop Condition으로 구현한다 — "작은 폭발 반경 + 빠른 중단"의 다층 방어다. ALL+Stop 없음(A)은 전체 영향에 안전망이 없어 위험하고, 전체 Terminate(C)는 의도(CPU 부하로 자가 치유 검증)와 다르며 과도하고, 수동(D)은 재현·자동화·안전 중단이 안 된다.

---

**문제 10.** 코드와 인프라가 자주 바뀌는 환경에서, 복원력이 시간이 지나며 조용히 깨지는 것(regression)을 막으려 한다. 가장 적합한 운영 패턴은?

A) 분기마다 한 번 엔지니어가 복원력 구성을 수동으로 점검하고 갭을 문서화

B) EventBridge Scheduler로 FIS 카오스 실험을 주기 실행하고 결과를 Resilience Hub/CloudWatch로 모아 측정·실험·개선 루프를 정기 자동화

C) 실제 장애가 발생했을 때 대응하며 그 경험을 다음 설계 개선에 반영

D) 복원력 지표에 대한 CloudWatch 알람을 더 촘촘히 추가해 regression을 조기 감지

**정답: B**

해설: 코드·인프라가 바뀌면 어제 견디던 시스템이 오늘 깨질 수 있어, 복원력 검증은 일회성이 아니라 정기 반복이어야 한다. EventBridge Scheduler로 FIS 실험을 주기(예: 주 1회) 실행하고 결과를 Resilience Hub와 CloudWatch로 모으면, 측정→실험→개선 루프가 자동으로 돌아 regression을 조기에 잡는다. 분기 수동 점검(A)은 빈도가 낮고, 사후 대응(C)은 검증이 아니며, 알람만 추가(D)는 장애를 주입·검증하지 못한다.

---

**문제 11.** 한 워크로드의 실제 복원력이 설정한 RTO/RPO 목표(AZ 장애 RTO 600초 등)를 충족하는지 측정하고, 미달 항목에 대한 개선안과 그 비용 영향을 자동으로 받고 싶다. 가장 적합한 서비스는?

A) CloudWatch Dashboard — RTO/RPO 관련 지표를 한 화면에 시각화해 목표 미달을 눈으로 확인

B) AWS Resilience Hub — 워크로드를 분석해 장애 유형별(Hardware/Software/AZ/Region) 목표 대비 실측 갭·권장 개선안·비용을 제시하고 FIS로 검증

C) AWS Config — 복원력 관련 리소스 구성(Multi-AZ 여부 등)을 규칙으로 평가해 비준수를 탐지

D) FIS 단독 — 장애를 주입해 실제 복구 시간을 측정하고 RTO/RPO 목표 충족을 직접 확인

**정답: B**

해설: Resilience Hub는 워크로드 구성을 분석해 복원력 정책(Hardware/Software/AZ/Region별 RTO/RPO)을 실제로 달성하는지 평가하고, 미달 시 구체적 개선안과 비용 영향을 제시하며 결과를 FIS 실험으로 검증한다 — Well-Architected Reliability Pillar의 계량화 도구다("측정할 수 없으면 개선할 수 없다"). CloudWatch Dashboard(A)는 지표 시각화, Config(C)는 구성 규정 준수, FIS 단독(D)은 장애 주입은 하지만 목표 대비 측정·권고는 하지 않는다.

---

**문제 12.** 글로벌 사용자에게 평소엔 지연 최저 리전으로 서비스하되, 한 리전이 죽으면 자동으로 건강한 리전만 응답하고, 데이터는 리전 간 비동기 복제로 유지하려 한다(관계형 DB, 쓰기는 한 곳). 올바른 조합은?

A) Route 53 Simple Routing + RDS Single-AZ로 단일 리전에 단순 구성하고 장애 시 수동 전환

B) Route 53 Latency Routing + 헬스 체크 + Aurora Global Database(단일 리더 비동기 <1초, 장애 시 secondary promote)

C) Route 53 Weighted 50:50 + DynamoDB Global Tables로 트래픽을 균등 분산하고 멀티 마스터 복제

D) Global Accelerator(anycast IP) + S3 CRR로 즉각 페일오버하고 데이터는 리전 간 객체 복제

**정답: B**

해설: "지연 최저 리전 + 리전 장애 시 자동 제외"는 Latency Routing + 헬스 체크 조합이고, "관계형 DB·쓰기는 한 곳·리전 간 비동기 복제"는 Aurora Global Database(단일 리더, secondary 읽기 전용, <1초 비동기, 장애 시 secondary promote ~1분)에 정확히 맞는다. Simple+Single-AZ(A)는 분산·HA가 없고, Weighted 50:50(C)은 지연을 고려 안 하며 DDB는 NoSQL이라 "관계형"과 안 맞고, Global Accelerator+S3 CRR(D)은 관계형 DB 복제가 아니다.

---

## 📌 Week 13 최종 요약

이 한 주의 결론은 하나다 — **가용성은 장애를 막는 게 아니라, 장애를 전제로 견디게 설계하고 그 견딤을 실험으로 검증하는 것이다.** Day 1에서 복제·쿼럼(Aurora 6-copy/3-AZ, CAP/PACELC)으로 단일 리전 HA를 세웠고, Day 2에서 비동기 글로벌 복제(Aurora Global 단일 리더 vs DDB Global Tables 멀티 마스터 LWW)와 DNS/anycast 라우팅, KMS MRK 암호화 경계로 멀티 리전으로 확장했다. Day 3에서 BIA 기반 RTO/RPO 경제학으로 DR 4 전략("평소 얼마나 켜두느냐"의 스펙트럼)을 정하고 Vault Lock WORM으로 백업을 불변화했다. Day 4에서 Netflix發 카오스 엔지니어링을 FIS(폭발 반경 + Stop Condition)와 Resilience Hub(계량화)로 제품화해 "검증 안 된 복구는 작동 안 한다"를 정면으로 풀었다. 시험에서는 동기/비동기, 단일 리더/멀티 마스터, Pilot Light/Warm Standby, Governance/Compliance Mode, Game Day/Chaos 같은 경계의 미묘한 차이를 읽어내는 것이 관건이다.

## 🔜 Week 14 예고

**보안 자동화 — GuardDuty, Security Hub, Config, Audit Manager**

> 💪 Week 13 완료! 장애를 두려워하지 않고, 장애를 설계의 전제로 삼는 사고방식을 손에 넣었다.
