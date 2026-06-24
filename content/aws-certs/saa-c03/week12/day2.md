# Day 2 - 복원력 도메인은 왜 "장애 반경과 복제 모드"라는 두 변수로 환원되나

SAA 시험에서 복원력 아키텍처(영역 2)는 26%를 차지한다. 보안 도메인이 "이 요청이 허용되는가"라는 판정 문제였다면, 복원력 도메인은 **"이 장애가 어디까지 번지는가, 그리고 잃어도 되는 게 얼마인가"**라는 반경 문제다. 수험생이 흔히 "Multi-AZ는 HA, Multi-Region은 DR" 같은 공식만 외우다 시나리오에서 막히는 이유는, 시험이 묻는 게 공식이 아니라 **"이 워크로드가 견뎌야 하는 장애의 반경(blast radius)을 어떤 격리 수준과 복제 모드에 매핑할 것인가"**이기 때문이다. 복원력 복습을 제대로 한다는 건 키워드를 서비스에 매핑하면서, 그 뒤에 깔린 두 변수 — **장애 격리 단위(AZ/리전)와 복제 모드(동기/비동기)** — 가 RTO·RPO·비용을 어떻게 동시에 결정하는지 보는 것이다.

이 글은 도메인 2를 컴퓨팅 복원력(무상태를 어떻게 흩뿌리나), 데이터 복원력(상태를 어떻게 복제하나), DR 4단계(비용과 복구 속도를 어떻게 절충하나), 트래픽 라우팅(장애 시 어디로 보내나), 디커플링(컴포넌트를 어떻게 떼어 놓나)이라는 다섯 흐름으로 다시 엮는다. 시험 함정의 대부분은 "Multi-AZ를 DR로 착각", "비동기 복제를 강한 일관성으로 착각" 같은 **격리 단위와 복제 모드의 혼동**에서 나온다.

> 💡 **관련 이론**: 복원력 설계의 모든 트레이드오프는 분산 시스템의 **CAP 정리**로 환원된다. 네트워크 분단(Partition)이 일어났을 때 일관성(Consistency)과 가용성(Availability)을 동시에 보장할 수 없다는 정리다. RDS Multi-AZ의 동기 복제는 일관성(CP)을 택해 RPO 0을 얻지만 가까운 AZ에서만 가능하고, DynamoDB Global Tables의 다중 리전 쓰기는 가용성(AP)을 택해 최종 일관성을 받아들인다. 한 발 더 나아간 **PACELC 정리**는 "분단이 없는 평상시(Else)에도 지연(Latency)과 일관성(Consistency) 중 하나를 골라야 한다"고 본다 — 동기 복제는 평상시에도 원격 커밋을 기다려 쓰기 지연이 커진다. RTO/RPO/비용의 모든 선택은 결국 CAP/PACELC를 비즈니스 언어로 번역한 것이다.

## 컴퓨팅 복원력은 "무상태를 여러 AZ에 흩뿌리는" 단순 원리다

복원력의 첫 계층은 컴퓨팅이다. 무상태(stateless) 컴퓨팅은 복제가 쉽다 — 상태가 없으니 같은 인스턴스를 여러 AZ에 복제해 두면 하나가 죽어도 나머지가 일을 이어받는다. **Auto Scaling Group(ASG)**을 여러 AZ의 서브넷에 걸쳐 두면, 한 AZ가 통째로 사라져도 ASG가 다른 AZ에 인스턴스를 새로 띄워 목표 용량을 회복한다. 여기서 **ELB Health Check**를 ASG에 연결하는 게 중요한데, ASG가 기본으로는 EC2 상태 체크(하드웨어 수준)만 보기 때문에, 애플리케이션이 죽었지만 OS는 살아 있는 경우를 잡으려면 **ELB 헬스 체크를 명시적으로 활성화**해야 한다.

세부 키워드도 정렬해 두자. **Lifecycle Hook**은 인스턴스가 종료되기 전에 잠시 멈춰(Terminating:Wait) 로그 업로드나 연결 드레이닝 같은 graceful shutdown을 수행하게 한다. **Capacity Rebalancing**은 Spot 인스턴스가 회수 2분 경고를 받기 전에 미리 대체 인스턴스를 띄워 중단을 완화한다. **Fargate**는 EC2 관리 없이 컨테이너를 서버리스로 돌려 운영 부담과 패치 책임을 AWS로 넘긴다.

> 🔍 **더 깊이**: ASG의 헬스 체크가 두 종류로 갈리는 내부 이유는 **장애 계층이 다르기 때문**이다. EC2 상태 체크는 하이퍼바이저가 보는 시스템 상태(호스트 하드웨어·네트워크 도달성)와 인스턴스 상태(OS 부팅 여부)를 본다. 그러나 OS가 멀쩡히 떠 있어도 애플리케이션 프로세스가 행(hang)이 걸리거나 8080 포트가 응답하지 않으면 EC2 체크는 이를 "정상"으로 본다. 그래서 ALB/NLB의 **타깃 그룹 헬스 체크**(실제 HTTP 경로나 포트를 주기적으로 찔러 봄)를 ASG의 판정 기준으로 끌어와야, 애플리케이션 레벨 장애도 "비정상"으로 판정해 인스턴스를 교체한다. 이 설정을 빼먹으면 "헬스 체크는 통과인데 사용자는 503을 받는" 침묵 장애가 발생한다 — 실무에서 자주 터지는 함정이다.

> ⚠️ **함정**: **NAT Gateway가 단일 AZ에만 있으면 그 AZ 장애 시 다른 AZ의 프라이빗 서브넷도 인터넷이 끊긴다.** NAT GW는 AZ 단위 리소스라, AZ-A에만 NAT를 두고 AZ-B의 라우트 테이블이 그 NAT를 가리키면, AZ-A가 죽을 때 AZ-B 인스턴스의 아웃바운드 인터넷(패치·외부 API)이 함께 마비된다. 진짜 복원력을 위해서는 **각 AZ마다 NAT Gateway를 두고** 해당 AZ의 라우트 테이블이 자기 AZ의 NAT를 가리키게 해야 한다. 시험에서 "프라이빗 서브넷 인터넷 복원력"이 보이면 AZ별 NAT가 정답이다.

## 데이터 복원력은 "상태를 어떤 모드로 복제하나"로 갈린다

상태(state) 계층은 복제 모드가 전부다. **RDS Multi-AZ**는 프라이머리의 모든 쓰기를 다른 AZ 스탠바이에 **동기 복제**해 RPO 0을 보장하고, 프라이머리 장애 시 DNS 엔드포인트를 스탠바이로 자동 전환(약 60~120초)한다 — 스탠바이는 읽기를 받지 않는 순수 대기 사본이다. **Read Replica**는 읽기 확장용 **비동기** 사본으로, 강한 일관성이 필요한 읽기에는 부적합하다(복제 지연 존재). **Aurora**는 데이터를 3개 AZ에 6벌 복제하는 분산 스토리지 위에 올라가 AZ 하나가 사라져도 데이터가 살아 있다. 리전을 넘으면 **Aurora Global Database**(전용 복제 인프라, 복제 지연 보통 1초 미만, 단일 라이터)와 **DynamoDB Global Tables**(다중 리전 동시 쓰기 = Active-Active, last-writer-wins 충돌 해소)로 갈린다.

저장·메시지 계층도 정리하자. **S3 Standard**는 최소 3개 AZ에 객체를 복제(One Zone-IA만 단일 AZ라 함정), **CRR**(Cross-Region Replication)은 리전 간 비동기 복제다. 비동기·재시도가 본질인 메시징은 **SQS**(DLQ로 실패 메시지 격리)와 **Kinesis Data Streams**(스트림을 재생 가능하게 보관)로 복원력을 얻는다.

> 💡 **관련 이론**: DynamoDB Global Tables가 여러 리전에서 동시에 쓰기를 받으면서 split-brain(양쪽이 서로 다른 진실을 가짐)으로 깨지지 않는 비결은 **충돌 해소 규칙을 미리 정해 둔 것**이다. last-writer-wins는 각 쓰기에 타임스탬프를 붙여 가장 나중 것이 이긴다는 규칙으로, **최종 일관성(eventual consistency)** 모델 — "잠깐은 리전마다 값이 다를 수 있지만 복제가 수렴하면 결국 같아진다" — 을 받아들인 대가로 모든 리전이 항상 쓰기를 받는 가용성(AP)을 얻는다. 반대로 Aurora Global은 쓰기를 한 리전으로 모아 일관성을 지키되(단일 라이터), 그 리전이 죽으면 승격이라는 절차적 비용(RTO 약 1분)을 치른다. 같은 Multi-Region이라도 CAP의 어느 쪽을 택했는지가 다르다.

> ⚠️ **함정**: **"Read Replica가 강한 일관성을 제공한다"**는 오답이 단골이다. Read Replica는 비동기 복제라 복제 지연(보통 수십 ms~수 초) 동안 프라이머리와 값이 다를 수 있다. 방금 쓴 데이터를 즉시 정확히 읽어야 하는 경우(read-after-write)는 Read Replica가 아니라 프라이머리에서 읽어야 한다. 마찬가지로 **DynamoDB의 GSI(글로벌 보조 인덱스)는 결과적 일관성만** 제공한다(강한 일관성 읽기 불가). "강한 일관성 필요"가 보이면 비동기 복제 사본은 모두 오답으로 거른다.

## DR 4단계는 "비용과 복구 속도를 단계적으로 절충"하는 스펙트럼이다

리전 단위 재해에 대비하는 DR은 4단계로 표준화돼 있고, 각 단계는 RTO/RPO를 낮추는 대신 비용을 올린다. **Backup & Restore**는 Cross-Region 스냅샷/백업만 두고 장애 시 인프라를 새로 만든다 — 가장 싸지만 RTO·RPO가 시간 단위(h)다. **Pilot Light**는 데이터는 다른 리전에 실시간 동기화하되 애플리케이션은 꺼 둔다(불씨만 켜 둠) — RTO/RPO가 분 단위로 줄고 비용은 중간이다. **Warm Standby**는 축소된 규모로 애플리케이션까지 항상 돌려 둔다 — 장애 시 스케일 업만 하면 되니 RTO가 더 짧다(RPO 초 단위). **Active-Active**는 두 리전 모두 풀스케일로 동시에 트래픽을 받는다 — RTO·RPO가 거의 0이지만 비용이 두 배다.

이 스펙트럼에서 핵심은 **요구되는 RTO/RPO가 느슨할수록 싼 단계를 골라야 한다**는 것이다. "RPO 1시간·RTO 수 시간 + 비용 민감"이면 Backup & Restore, "RTO ~0·RPO ~0 + 비용 무관"이면 Active-Active다. **AWS Elastic Disaster Recovery(DRS)**는 서버를 블록 레벨로 실시간 복제해 두는 비용 효율적인 Pilot Light 도구다.

> 🔍 **더 깊이**: RDS Multi-AZ 페일오버가 "왜 즉시(0초)가 아니라 60초쯤 걸리나"는 내부 동작과 **클라이언트 DNS 캐싱**으로 풀린다. AWS는 프라이머리 실패를 헬스 체크 연속 실패로 감지한 뒤(잠깐의 깜빡임에 불필요한 페일오버를 막는 안전장치) 스탠바이를 승격하고, RDS 엔드포인트(CNAME)가 가리키는 IP를 새 인스턴스로 바꾼다. 여기서 애플리케이션이나 JVM이 DNS 결과를 오래 캐싱하면, 엔드포인트가 바뀌어도 죽은 프라이머리에 계속 접속한다. 그래서 페일오버를 빠르게 받으려면 커넥션 풀의 **DNS TTL을 짧게(예: 5초)** 두는 게 실무 표준이다. Aurora는 클러스터 엔드포인트로 이 문제를 완화해 승격이 더 빠르다(보통 30초 이내).

> 📚 **사례**: 2021년 12월 7일 AWS us-east-1 대규모 장애는 "리전도 장애 단위"임을 각인시켰다. 내부 네트워크 디바이스의 자동 스케일링이 폭주하며 내부 네트워크가 과부하됐고, EC2·DynamoDB·Lambda 등의 **제어 평면(control plane)**이 몇 시간 마비됐다. 교훈은 **데이터 평면(이미 떠 있는 인스턴스)은 살아 있어도 제어 평면(새 인스턴스 생성·스케일링 API)이 죽으면 자동 복구가 멈춘다**는 점이다 — Multi-AZ로 흩어 둔 워크로드조차 "새 인스턴스를 띄우는 API"가 막히면 회복하지 못한다. 이 사고 이후 많은 기업이 us-east-1 단일 의존을 걷어내고 Multi-Region DR을 재검토했다. "Multi-AZ는 DR이 아니다"가 시험 단골인 현실적 배경이다.

## 트래픽 라우팅과 디커플링 — 장애를 어디로 흘리고 어떻게 떼어 놓나

Multi-Region 위에서는 트래픽을 어떻게 라우팅할지가 다음 결정이다. **Route 53 라우팅 정책**이 키워드별로 갈린다 — "사용자에게 가장 빠른 리전"이면 **Latency**, "위치별 다른 콘텐츠/규제"면 **Geolocation**, "카나리 배포·트래픽 %"면 **Weighted**, "Primary-Backup 자동 전환"이면 **Failover**(헬스 체크 연동)다. 더 정밀한 페일오버 통제가 필요하면 **Route 53 Application Recovery Controller(ARC)**로 라우팅 컨트롤을 수동·명시적으로 토글한다.

복원력의 또 다른 축은 **디커플링**이다. 컴포넌트를 직접 연결하면 하나가 죽을 때 연쇄로 무너지지만, 사이에 버퍼를 두면 격리된다. **SQS**는 생산자와 소비자를 큐로 분리해 폭증을 흡수하고, **SNS Fanout**(SNS → 여러 SQS)은 한 이벤트를 여러 구독자에 뿌리며, **EventBridge**는 규칙 기반 이벤트 라우팅, **Step Functions**는 워크플로 오케스트레이션, **Pipes**는 소스-타깃을 코드 없이 잇는다. 이 디커플링이 "한 컴포넌트 장애가 전체로 번지지 않게" 하는 핵심 패턴이다.

> 💡 **관련 이론**: 디커플링과 재시도의 안전성은 **멱등성(idempotency)**이라는 분산 시스템 개념에 기댄다. 네트워크는 신뢰할 수 없으므로(분산 컴퓨팅의 8가지 오류 가정 중 하나) 메시지는 중복 전달될 수 있고, 특히 SQS 표준 큐는 "at-least-once" 전달이라 같은 메시지가 두 번 올 수 있다. 따라서 소비자는 같은 메시지를 두 번 처리해도 결과가 같도록(멱등) 설계해야 한다 — 예: 주문 ID로 중복 처리를 막는 식이다. 또한 **SQS visibility timeout이 실제 처리 시간보다 짧으면**, 처리 중인 메시지가 타임아웃돼 다시 가시화되며 다른 소비자가 중복 처리한다. 그래서 visibility timeout은 처리 시간보다 넉넉히 잡아야 한다. 재시도 시 지수 백오프(exponential backoff)와 결합하면 일시적 장애에 안전하게 대응한다.

> ⚠️ **함정**: **순서 보장이 필요한데 표준 SNS/SQS를 쓰는 것**이 흔한 오답이다. SNS 표준·SQS 표준은 순서를 보장하지 않으므로(best-effort), 엄격한 순서가 필요하면 **SNS FIFO + SQS FIFO** 조합이어야 한다. 또 "Pilot Light"를 Warm Standby와 혼동하지 말 것 — Pilot Light는 **데이터만 동기화하고 애플리케이션은 꺼 둔(OFF)** 상태라 장애 시 앱을 부팅·스케일해야 하므로 Warm Standby보다 RTO가 길다. 키워드 "최소 비용 + 데이터는 항상 최신"이면 Pilot Light, "축소 규모로 항상 가동 중"이면 Warm Standby다.

## 다른 클라우드의 복원력 모델 비교

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 가용성 영역 | Availability Zone | Availability Zone | Zone |
| 글로벌 RDB | Aurora Global Database | Cosmos DB / SQL Geo-Replication | Cloud Spanner(전역 강한 일관성) |
| 글로벌 NoSQL Active-Active | DynamoDB Global Tables | Cosmos DB(다중 마스터) | Firestore / Bigtable 복제 |
| 글로벌 트래픽 라우팅 | Route 53 | Traffic Manager / Front Door | Cloud DNS / Cloud Load Balancing |
| 메시지 디커플링 | SQS / SNS / EventBridge | Service Bus / Event Grid | Pub/Sub |

GCP **Spanner**가 대조적이다 — 원자시계(TrueTime)로 전역에서 강한 일관성을 제공해 CAP의 일관성을 포기하지 않으려 하지만 그만큼 비싸고 특수하다. Azure **Cosmos DB**는 일관성 수준을 5단계로 슬라이더처럼 고르게 해 "일관성 vs 지연"을 고객이 조절하게 한 점이 독특하다. 같은 Multi-Region 문제를 각 클라우드가 CAP의 어느 지점에서 푸는지가 다르다.

> 🔍 **더 깊이**: DR 4단계는 사실 **NIST SP 800-34**(연방 정보시스템 비상계획 가이드)가 정의한 복구 전략 스펙트럼과 같은 뿌리를 공유한다. cold site(백업만)·warm site(부분 인프라)·hot site(완전 이중화)라는 전통 DR 용어가 AWS의 Backup&Restore·Pilot Light/Warm Standby·Active-Active로 클라우드화된 것이다. 차이는 클라우드에서는 "꺼 둔 인프라에 비용을 거의 안 낸다"는 점이다 — 전통 DR의 hot site는 유휴 하드웨어에 풀 비용이 들지만, AWS Pilot Light는 데이터 복제 비용만 내고 컴퓨팅은 장애 시점에 띄우므로 같은 RTO를 훨씬 싸게 달성한다. 클라우드 DR이 경제성을 바꾼 핵심이다.

## CLI로 직접 확인하기

```bash
# ASG에 ELB 헬스 체크 활성화 (애플리케이션 레벨 장애 감지)
aws autoscaling update-auto-scaling-group --auto-scaling-group-name web-asg \
  --health-check-type ELB --health-check-grace-period 120

# RDS Multi-AZ 활성화 (동기 스탠바이)
aws rds modify-db-instance --db-instance-identifier orders-db \
  --multi-az --apply-immediately

# DynamoDB Global Table에 리전 추가 (Active-Active)
aws dynamodb update-table --table-name Orders \
  --replica-updates 'Create={RegionName=us-west-2}'

# Route 53 Failover 레코드 (Primary-Backup)
aws route53 change-resource-record-sets --hosted-zone-id Z123 \
  --change-batch file://failover.json

# SQS visibility timeout 조정 (중복 처리 방지)
aws sqs set-queue-attributes --queue-url https://sqs.../orders \
  --attributes VisibilityTimeout=300
```

## 정리하며

복원력 도메인(26%)은 키워드 암기처럼 보이지만, **장애 격리 단위(AZ/리전)와 복제 모드(동기/비동기)**라는 두 변수가 RTO·RPO·비용을 동시에 결정하는 설계 문제다. ① **컴퓨팅**은 무상태를 ASG로 여러 AZ에 흩뿌리되 ELB 헬스 체크 활성화·AZ별 NAT가 핵심이다. ② **데이터**는 동기(Multi-AZ, RPO 0)와 비동기(Read Replica·CRR·Global Tables)의 구분이 전부이며, Read Replica는 강한 일관성에 부적합하다. ③ **DR 4단계**는 비용↔복구속도 스펙트럼으로, 느슨한 RTO/RPO일수록 싼 단계를 고른다. ④ **라우팅**은 Route 53 정책 키워드 매칭, **디커플링**은 멱등성·visibility timeout이 받친다. 2021 us-east-1 사고는 "리전도 장애 단위, Multi-AZ는 DR이 아니다"라는 핵심 함정을 현실로 증명한다.

다음 글에서는 도메인 3 고성능 아키텍처를 "지연·처리량 트레이드오프와 데이터를 사용자에게 얼마나 가까이 두나"라는 원리로 다시 엮는다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 RPO 0과 RTO ~0을 모두 요구하며 비용은 문제되지 않는다. 리전 장애에도 무중단이어야 한다. 가장 적절한 DR 패턴은?

A) Backup & Restore B) Pilot Light C) Warm Standby D) Active-Active

**정답: D**

해설: **Active-Active**는 두 리전 모두 풀스케일로 동시에 트래픽을 받으므로 한 리전이 죽어도 거의 0의 RTO/RPO로 무중단을 제공한다 — 가장 비싸지만 비용 무관이라는 조건에 부합한다. Backup & Restore(A)는 RTO·RPO가 시간 단위, Pilot Light(B)는 앱이 꺼져 있어 부팅 시간이 들고, Warm Standby(C)는 축소 규모라 스케일 업 시간이 든다. "RTO ~0 / RPO ~0 / 비용 무관"은 Active-Active의 정답 신호다. 반대로 비용 민감 + 느슨한 목표면 가장 싼 단계를 골라야 한다.

---

**문제 2.** ASG 인스턴스가 종료되기 직전에 로그를 S3로 업로드하고 연결을 정리해야 한다. 적절한 메커니즘은?

A) UserData 스크립트 B) Lifecycle Hook (Terminating:Wait) C) CloudWatch 알람 D) Scheduled Action

**정답: B**

해설: **Lifecycle Hook**은 인스턴스가 종료(또는 시작) 상태로 전이되기 전에 잠시 멈추게(Terminating:Wait) 해, 그 사이 로그 업로드·연결 드레이닝 같은 graceful shutdown 작업을 수행하게 한다. UserData(A)는 부팅 시 한 번 실행돼 종료 시점 작업에 맞지 않고, CloudWatch 알람(C)은 메트릭 기반 트리거지 종료 전 대기 메커니즘이 아니며, Scheduled Action(D)은 정해진 시각에 스케일을 조정할 뿐이다. "종료 전 마무리 작업" = Lifecycle Hook이 정답.

---

**문제 3.** 한 글로벌 서비스가 여러 리전에서 동시에 읽고 쓰는 저지연 NoSQL이 필요하다. 가장 적합한 것은?

A) DocumentDB B) DynamoDB Global Tables C) Aurora Global Database D) RDS Cross-Region Read Replica

**정답: B**

해설: **DynamoDB Global Tables**는 여러 리전이 모두 쓰기 가능한 Active-Active NoSQL로, last-writer-wins로 충돌을 자동 해소하고 복제 지연이 보통 1초 미만이다. Aurora Global(C)은 단일 라이터(한 리전만 쓰기)라 "모든 리전 동시 쓰기"에 맞지 않고, Cross-Region Read Replica(D)는 읽기 전용 사본이며, DocumentDB(A)는 MongoDB 호환 문서 DB로 글로벌 다중 마스터 모델이 아니다. "다중 리전 동시 쓰기 NoSQL" = Global Tables.

---

**문제 4.** 한 팀이 프라이빗 서브넷의 인터넷 아웃바운드(패치·외부 API)가 AZ 장애에도 끊기지 않게 하려 한다. 올바른 설계는?

A) 모든 AZ가 단일 NAT Gateway를 공유 B) 각 AZ마다 NAT Gateway를 두고 해당 AZ 라우트가 자기 NAT를 가리킴 C) NAT Instance 한 대로 통합 D) Internet Gateway를 프라이빗 서브넷에 직접 연결

**정답: B**

해설: NAT Gateway는 **AZ 단위 리소스**라, 단일 NAT에 모든 AZ를 묶으면 그 AZ 장애 시 다른 AZ의 아웃바운드 인터넷도 함께 끊긴다. 복원력을 위해서는 **각 AZ마다 NAT GW를 두고** 해당 AZ의 라우트 테이블이 자기 AZ의 NAT를 가리키게 해야 한다. A·C는 단일 장애점을 만들고, D는 프라이빗 서브넷에 IGW를 직접 붙이면 더 이상 프라이빗이 아니게 된다(잘못된 구성). "프라이빗 서브넷 인터넷 복원력" = AZ별 NAT.

---

**문제 5.** 사용자에게 가장 빠른 응답을 주도록 여러 리전 중 지연이 가장 낮은 곳으로 라우팅하려 한다. 적절한 Route 53 정책은?

A) Geolocation B) Latency C) Weighted D) Failover

**정답: B**

해설: **Latency 기반 라우팅**은 사용자와 각 리전 사이의 측정된 네트워크 지연을 기준으로 가장 빠른 리전으로 보낸다. Geolocation(A)은 사용자의 지리적 위치(국가/대륙)로 라우팅해 규제·콘텐츠 현지화에 쓰지 "가장 빠른"과는 다르며(가까운 게 항상 빠른 건 아님), Weighted(C)는 트래픽 비율 분배(카나리), Failover(D)는 Primary-Backup 전환용이다. "가장 빠른 리전/최저 지연" = Latency가 정답 신호.

---

## 📌 핵심 요약

복원력 도메인(26%)은 장애 격리 단위(AZ/리전)와 복제 모드(동기/비동기)가 RTO·RPO·비용을 동시에 결정하는 설계 문제다. 컴퓨팅은 무상태를 ASG로 여러 AZ에 흩뿌리되 ELB 헬스 체크 활성화와 AZ별 NAT가 핵심이고, 데이터는 동기(Multi-AZ, RPO 0)와 비동기(Read Replica·CRR·DDB Global Tables, 최종 일관성)의 구분이 전부다. DR 4단계(Backup-Restore→Pilot Light→Warm Standby→Active-Active)는 비용↔복구속도 스펙트럼이라 요구가 느슨할수록 싼 단계를 고른다. Route 53은 키워드 매칭(Latency/Geo/Weighted/Failover), 디커플링은 멱등성·visibility timeout이 받친다. "Multi-AZ는 DR이 아니다", "Read Replica는 강한 일관성 부적합", "단일 NAT는 AZ 단일 장애점"이 3대 함정이다.
