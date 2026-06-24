# Day 1 - 가용 영역과 리전은 왜 "물리적 거리"라는 비용을 사이에 두고 갈라지나

클라우드를 처음 배우면 "Multi-AZ는 고가용성, Multi-Region은 재해 복구"라는 한 줄 공식을 외우게 된다. 하지만 이 공식은 결과만 말할 뿐 이유를 말하지 않는다. 왜 AWS는 하나의 리전 안에 굳이 여러 개의 가용 영역(Availability Zone)을 두고, 또 왜 그 가용 영역들 사이의 거리를 "충분히 멀되 너무 멀지는 않게" 설계했을까. 이 질문의 답에는 분산 시스템의 가장 근본적인 트레이드오프 — **물리적 거리와 데이터 일관성과 장애 격리는 동시에 최적화할 수 없다** — 가 숨어 있다.

AZ는 서로 독립된 전력·냉각·네트워크를 가진 하나 이상의 데이터센터 묶음이다. 같은 리전 안의 AZ들은 보통 수십 킬로미터 떨어져 있는데, 이 거리는 우연이 아니라 정밀하게 계산된 값이다. 너무 가까우면(같은 건물, 같은 변전소) 화재·정전·홍수가 두 AZ를 동시에 덮쳐 격리가 무의미해진다. 반대로 너무 멀면 AZ 간 광케이블 왕복 지연(round-trip latency)이 커져서 RDS Multi-AZ 같은 **동기 복제(synchronous replication)**가 쓰기 성능을 갉아먹는다. 빛은 광섬유 안에서 1km당 약 5마이크로초가 걸리므로, 100km 떨어진 AZ는 왕복만 1ms가 더 붙는다. AWS는 이 둘 사이에서 "한 재난이 두 AZ를 동시에 치지 못할 만큼 멀되, 동기 복제가 견딜 만큼 가까운" 거리를 골랐다. 리전 간 거리(수천 km)는 이 동기 복제 예산을 완전히 넘어서므로, Multi-Region은 본질적으로 비동기일 수밖에 없다. 바로 이것이 "AZ는 HA, Region은 DR"이라는 공식의 진짜 뿌리다.

이 글은 RTO/RPO라는 두 숫자, AZ와 리전의 물리적 경계, 그리고 그 경계 위에 AWS가 쌓아 올린 복원력 서비스들이 어떻게 하나의 일관된 설계 언어를 이루는지를 따라간다. SAA 시험의 복원력 도메인은 표 암기처럼 보이지만, 실제로는 "이 워크로드가 견뎌야 하는 장애의 반경(blast radius)"을 정하고 거기에 맞는 격리 수준과 복제 모드를 고르는 설계 문제다.

## RTO와 RPO는 왜 두 개의 독립된 축인가

복원력을 이야기할 때 가장 먼저 나오는 두 글자가 RTO와 RPO다. **RTO(Recovery Time Objective)**는 "장애 발생부터 서비스 복구까지 허용되는 시간" — 즉 다운타임의 상한이다. **RPO(Recovery Point Objective)**는 "복구 시점이 장애 시점에서 얼마나 뒤처져도 되는가" — 즉 잃어도 되는 데이터의 시간 폭이다. 초보자가 흔히 둘을 뭉뚱그리지만, 이 둘은 완전히 독립된 축이고 서로 다른 기술로 해결된다.

RPO는 **복제 방식**이 결정한다. 매일 한 번 백업하면 RPO는 최대 24시간(어제 백업 이후 오늘 장애까지의 데이터가 날아감)이다. 트랜잭션 로그를 5분마다 비동기 복제하면 RPO는 약 5분이다. 동기 복제(쓰기가 양쪽에 모두 커밋돼야 성공으로 응답)는 RPO를 0에 가깝게 만들지만, 앞서 본 거리·지연 예산 때문에 가까운 AZ 사이에서만 현실적이다. 반면 RTO는 **복구 절차의 자동화 수준**이 결정한다. 백업에서 인프라를 새로 만들어 부팅하면 수 시간이 걸리고(높은 RTO), 대기 중인 스탠바이로 트래픽만 전환하면 수 분 또는 수 초다(낮은 RTO).

> 💡 **관련 이론**: RTO와 RPO를 동시에 0으로 만들려는 시도는 분산 시스템 이론의 벽에 부딪힌다. **CAP 정리**는 네트워크 분단(Partition) 상황에서 일관성(Consistency)과 가용성(Availability)을 동시에 보장할 수 없다고 말한다. 두 리전을 동기 복제로 묶어 RPO 0을 노리면(강한 일관성), 한쪽 리전이 분단됐을 때 쓰기를 막아야 하므로 가용성이 떨어진다(RTO 악화). 그래서 멀리 떨어진 리전 간에는 보통 일관성을 약간 양보하고(비동기 복제, RPO 수초) 가용성을 택한다. 한 발 더 나아간 **PACELC 정리**는 "분단이 없는 평상시(Else)에도 지연(Latency)과 일관성(Consistency) 중 하나를 골라야 한다"고 본다 — 동기 복제는 평상시에도 원격 커밋을 기다리느라 쓰기 지연이 커진다. RTO/RPO 트레이드오프는 결국 CAP/PACELC를 비즈니스 언어로 번역한 것이다.

> ⚠️ **함정**: RTO와 RPO를 한 덩어리로 보면 시험에서 틀린다. "RPO는 1시간이면 충분하지만 RTO는 5분 이내"라는 시나리오는 흔하다 — 이건 데이터는 한 시간치 잃어도 되지만 서비스는 빨리 복구돼야 한다는 뜻이다. 이 경우 값비싼 동기 복제(RPO 0)는 과잉이고, 비동기 복제 + 신속한 자동 페일오버 조합이 정답이다. 반대로 "RPO 0이 필수"라면 비용을 감수하고 동기 복제(Multi-AZ, Aurora) 또는 Active-Active로 가야 한다.

## Multi-AZ는 어떻게 "한 AZ가 죽어도 무중단"을 만드나

Multi-AZ 고가용성의 핵심은 **상태(state)를 여러 AZ에 미리 복제해 두고, 무상태(stateless) 컴퓨팅은 여러 AZ에 흩뿌려 두는 것**이다. 이 두 계층을 나눠 보면 서비스별 동작이 또렷해진다.

무상태 계층은 쉽다. **Auto Scaling Group**을 여러 AZ의 서브넷에 걸쳐 두면, 한 AZ가 통째로 사라져도 ASG가 다른 AZ에 인스턴스를 새로 띄워 목표 용량을 회복한다. **Elastic Load Balancer**는 본래 여러 AZ에 노드를 두고 살아 있는 타깃에만 트래픽을 보내므로, 죽은 AZ의 인스턴스는 헬스 체크에서 빠지고 자동으로 우회된다. 여기서 ELB의 **Cross-Zone Load Balancing**이 중요한데, 이게 켜져 있어야 한 AZ에 인스턴스가 몰려도 모든 AZ의 타깃에 고르게 트래픽이 분산된다(ALB는 기본 켜짐, NLB는 기본 꺼짐이라 시험 포인트다).

상태 계층은 복제 모드가 갈린다. **RDS Multi-AZ**는 프라이머리 DB의 모든 쓰기를 다른 AZ의 스탠바이에 **동기 복제**하고, 프라이머리가 죽으면 DNS 엔드포인트를 스탠바이로 자동 전환(보통 60~120초)한다 — 스탠바이는 평소 읽기 트래픽을 받지 않는 순수 대기 사본이다(읽기 분산은 Read Replica의 역할로 별개다). **Aurora**는 한 발 더 나아가, 데이터를 3개 AZ에 6벌 복제하는 분산 스토리지 위에 올라가 있어 AZ 하나가 사라져도 스토리지가 살아 있고 페일오버가 보통 30초 안에 끝난다. **EFS**는 본래 여러 AZ에 데이터를 분산 저장하는 리전 서비스이고, **S3**는 Standard 클래스가 최소 3개 AZ에 객체를 복제한다(One Zone-IA만 단일 AZ라 AZ 장애에 취약하다는 게 시험 단골 함정이다).

> 🔍 **더 깊이**: RDS Multi-AZ의 페일오버가 "왜 즉시(0초)가 아니라 60초쯤 걸리나"는 내부 동작을 알면 풀린다. AWS는 프라이머리의 실패를 **헬스 체크 연속 실패**로 감지한 뒤에야 페일오버를 시작한다 — 잠깐의 네트워크 깜빡임에 불필요하게 페일오버하지 않기 위한 안전장치다. 감지 후에는 스탠바이를 새 프라이머리로 승격하고, RDS 엔드포인트(CNAME)가 가리키는 IP를 새 인스턴스로 바꾼다. 여기서 **클라이언트 측 DNS 캐싱**이 복병이다 — 애플리케이션이나 JVM이 DNS 결과를 오래 캐싱하면 엔드포인트가 바뀌어도 죽은 프라이머리에 계속 접속을 시도한다. 그래서 RDS 페일오버를 빠르게 받으려면 커넥션 풀의 DNS TTL을 짧게(예: 5초) 두는 게 실무 패턴이다. Aurora는 이 문제를 **클러스터 엔드포인트**로 완화해 승격이 더 빠르다.

> 📚 **사례**: 2021년 12월 7일 AWS us-east-1 리전 대규모 장애는 단일 리전 의존의 위험을 적나라하게 보여줬다. 내부 네트워크 디바이스의 자동 스케일링 동작이 폭주(automated scaling activity)하며 내부 네트워크가 과부하됐고, 이 때문에 EC2·DynamoDB·Lambda 등 핵심 API의 제어 평면(control plane)이 몇 시간 동안 마비됐다. 중요한 교훈은 **데이터 평면(이미 떠 있는 인스턴스)은 살아 있어도 제어 평면(새 인스턴스 생성·스케일링·API 호출)이 죽으면 자동 복구가 멈춘다**는 점이다. Multi-AZ로 흩어 둔 워크로드조차 "새 인스턴스를 띄우는 API"가 막히면 회복하지 못한다. 이 사고 이후 많은 기업이 us-east-1에 글로벌 의존성을 두지 않도록 아키텍처를 재검토했고, "리전도 장애 단위(failure domain)"라는 인식이 확산됐다.

## Multi-Region은 무엇을 사고, 무엇을 포기하나

리전을 넘어가는 순간 동기 복제의 시대는 끝난다. 수천 km의 거리는 왕복 수십~수백 ms의 지연을 강제하고, 그 지연을 모든 쓰기마다 기다릴 수는 없다. 그래서 Multi-Region의 데이터 계층은 거의 다 **비동기 복제**이거나, 충돌을 영리하게 푸는 특수 설계다.

- **S3 Cross-Region Replication(CRR)**: 객체를 다른 리전 버킷으로 비동기 복제한다. 대부분 수 분 내 완료되지만 보장은 아니다(S3 RTC를 켜면 15분 SLA). 같은 리전 복제는 SRR로, 규제·로그 집계 용도다.
- **DynamoDB Global Tables**: 여러 리전에서 **모두 쓰기 가능한 Active-Active** NoSQL을 만든다. 충돌은 **last-writer-wins**로 자동 해소하고, 복제 지연은 보통 1초 미만이다. "5개 리전 액티브-액티브 NoSQL"이라는 키워드가 나오면 거의 정답이다.
- **Aurora Global Database**: 한 리전이 프라이머리(쓰기), 최대 5개 리전이 읽기 전용 사본. 전용 복제 인프라로 복제 지연 보통 1초 미만, 리전 장애 시 보조 리전을 보통 1분 안에 쓰기로 승격할 수 있다.
- **RDS Cross-Region Read Replica**: 단순 비동기 읽기 사본. Aurora Global보다 복제 지연이 크고 승격도 느리지만, 비-Aurora RDS 엔진에서 쓴다.

> 💡 **관련 이론**: DynamoDB Global Tables가 여러 리전에서 동시에 쓰기를 받으면서도 "split-brain(양쪽이 서로 다른 진실을 갖는 상태)"으로 깨지지 않는 비결은 **충돌 해소 규칙을 미리 정해 둔 것**이다. last-writer-wins는 각 쓰기에 타임스탬프를 붙여 가장 나중 것이 이긴다는 단순 규칙이다. 이는 분산 시스템의 **최종 일관성(eventual consistency)** 모델로, "잠깐은 리전마다 값이 다를 수 있지만 복제가 수렴하면 결국 같아진다"를 받아들인다. 강한 일관성을 포기한 대가로 모든 리전이 항상 쓰기를 받을 수 있는 가용성(AP 선택)을 얻은 것이다. 반대로 Aurora Global은 쓰기를 한 리전으로 모아 일관성을 지키되(단일 라이터), 그 리전이 죽으면 승격이라는 절차적 비용(RTO 약 1분)을 치른다 — 같은 Multi-Region이라도 CAP의 어느 쪽을 택했는지가 다르다.

> ⚠️ **함정**: "Multi-AZ면 재해 복구가 된다"는 가장 흔한 오답이다. Multi-AZ는 같은 리전 안의 격리이므로, 리전 전체를 덮는 재해(앞의 us-east-1 사례)나 리전 단위 규제 요구에는 무력하다. **DR은 반드시 리전 경계를 넘어야** 한다 — Cross-Region 백업이든, Aurora Global이든, CRR이든. 시험에서 "리전 장애에도 견뎌라"가 보이면 Multi-AZ 선택지는 전부 오답으로 걸러야 한다.

## Active-Active와 Active-Passive, 그리고 복원력 거버넌스

Multi-Region 위에서 트래픽을 어떻게 흘릴지가 다음 결정이다. **Active-Active**는 두 리전 모두가 동시에 사용자 트래픽을 받는다 — 가장 빠른 복구(거의 0 RTO)와 평상시 부하 분산을 얻지만, 양방향 데이터 동기화와 충돌 해소가 어렵고 비용이 두 배다. **Active-Passive**는 한쪽이 주(primary)이고 다른 쪽은 대기다 — 데이터가 한 방향으로만 흐르니 단순하고 싸지만, 페일오버 시 약간의 RTO가 든다. Active-Active를 무리하게 택했다가 충돌·정합성 버그로 고생하느니, 대부분의 워크로드는 Active-Passive로 충분하다는 게 실무 감각이다.

이 모든 결정을 떠받치는 거버넌스 서비스들도 알아 둬야 한다. **AWS Backup**은 EBS·EFS·RDS·DynamoDB·S3 등을 한 콘솔에서 정책 기반으로 백업하고 Cross-Region·Cross-Account 복사까지 묶는다. **AWS Elastic Disaster Recovery(DRS)**는 서버를 블록 레벨로 실시간 복제해 두었다가 장애 시 다른 리전에서 EC2로 부팅하는, 비용 효율적인 Pilot Light 도구다. **Resilience Hub**는 애플리케이션의 복원력을 평가해 RTO/RPO 목표 달성 여부를 점수로 매기고 개선점을 추천한다.

> 📚 **사례**: 2017년 2월 28일 S3 us-east-1 장애는 "Active-Passive조차 한 리전에 묶이면 위험하다"를 보여줬다. 한 엔지니어가 빌링 시스템 디버깅 중 명령어 입력 실수로 의도보다 많은 S3 서브시스템 서버를 제거했고, 인덱스·배치 시스템을 재시작하는 데 수 시간이 걸렸다. 더 뼈아팠던 건 AWS 자체 서비스 헬스 대시보드의 상태 아이콘마저 S3에 의존하고 있어 장애를 표시하지 못했다는 점이다 — **복구 도구가 장애 대상에 의존하면 안 된다**는 순환 의존성(circular dependency)의 교훈이다. 이 사고로 Netflix처럼 진작에 멀티 리전 Active-Active로 설계한 곳은 영향을 덜 받았고, 단일 리전에 의존한 수많은 SaaS는 함께 멈췄다. DR 설계의 첫 질문은 "내 복구 경로가 장애와 같은 운명을 공유하지 않는가"여야 한다.

## 다른 클라우드의 복원력 경계 비교

AWS의 AZ/리전 모델을 상대화하면 설계 선택이 또렷해진다.

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 영역 단위 | Availability Zone | Availability Zone(+ Availability Set) | Zone |
| 리전 내 격리 | AZ 3개 이상 권장 | AZ + 가용성 집합/스케일 세트 | Zone(리전당 3개 내외) |
| 글로벌 DB | Aurora Global, DynamoDB Global Tables | Cosmos DB(다중 리전, 다중 마스터) | Spanner(전역 강한 일관성) |
| 글로벌 트래픽 | Route 53 + CloudFront | Traffic Manager + Front Door | Cloud DNS + Cloud Load Balancing(애니캐스트) |

GCP **Spanner**가 특히 대조적이다 — 원자시계(TrueTime)로 전역에서 **강한 일관성**을 제공해 CAP의 일관성을 포기하지 않으려 한다. 대신 그만큼 비싸고 특수하다. Azure **Cosmos DB**는 다중 마스터로 DynamoDB Global Tables에 가깝고, 일관성 수준을 5단계로 고를 수 있게 해 "일관성 vs 지연"을 고객이 슬라이더로 조절하게 만든 점이 독특하다. 같은 Multi-Region 문제를 각 클라우드가 CAP의 어느 지점에서 풀지 다르게 선택한 것이다.

## CLI로 직접 만져보기

```bash
# RDS Multi-AZ 활성화 (동기 스탠바이 생성)
aws rds modify-db-instance --db-instance-identifier orders-db \
  --multi-az --apply-immediately

# S3 Cross-Region Replication 설정
aws s3api put-bucket-replication --bucket prod-src \
  --replication-configuration file://crr.json

# DynamoDB Global Table에 리전 추가 (Active-Active)
aws dynamodb update-table --table-name Orders \
  --replica-updates 'Create={RegionName=us-east-1}'

# Aurora Global Database 생성 (프라이머리 + 보조 리전)
aws rds create-global-cluster --global-cluster-identifier orders-global \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:...:cluster:orders

# ELB Cross-Zone Load Balancing 켜기 (NLB는 기본 꺼짐)
aws elbv2 modify-target-group-attributes --target-group-arn arn:... \
  --attributes Key=load_balancing.cross_zone.enabled,Value=true
```

## 정리하며

복원력은 "물리적 거리"라는 단일 변수가 일관성·지연·격리·비용을 한꺼번에 결정하는 설계 문제다. ① **AZ**는 동기 복제가 견딜 만큼 가깝되 한 재난이 둘을 동시에 치지 못할 만큼 멀게 설계됐고, 그래서 Multi-AZ는 RPO 0의 고가용성을 같은 리전 안에서 제공한다. ② **리전**은 동기 복제 예산을 넘어서므로 Multi-Region은 본질적으로 비동기이고, S3 CRR·DynamoDB Global Tables·Aurora Global이 각각 다른 CAP 선택으로 이를 푼다. ③ **RTO와 RPO**는 독립된 축으로, RPO는 복제 모드가, RTO는 복구 자동화 수준이 결정한다. ④ **Active-Active vs Active-Passive**는 복구 속도와 단순함·비용의 교환이고, AWS Backup·DRS·Resilience Hub가 이를 거버넌스로 묶는다. 시험은 "이 워크로드가 견뎌야 할 장애의 반경"을 격리 수준과 복제 모드에 매핑하는 능력을 반복해서 묻는다.

다음 글에서는 이 격리·복제 위에 AWS가 정립한 **DR 4단계 전략(Backup-Restore부터 Active-Active까지)**이 RTO/RPO/비용을 어떻게 단계적으로 절충하는지, 그리고 시나리오 키워드를 어느 단계로 매핑해야 하는지를 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 단일 AZ 장애 시에도 데이터베이스 쓰기가 무중단이어야 하고, 데이터 손실은 0(RPO 0)이어야 한다. 가장 적절한 구성은?

A) RDS Cross-Region Read Replica
B) RDS Multi-AZ (동기 스탠바이)
C) S3 One Zone-IA에 DB 백업
D) DynamoDB Global Tables

**정답: B**

해설: RDS Multi-AZ는 프라이머리의 모든 쓰기를 다른 AZ의 스탠바이에 **동기 복제**하므로 RPO 0을 보장하고, 프라이머리 장애 시 자동 페일오버(약 60~120초)로 무중단에 가깝게 복구한다. Cross-Region Read Replica(A)는 비동기 복제라 RPO 0이 아니고 자동 페일오버도 없다. One Zone-IA(C)는 단일 AZ 저장이라 AZ 장애에 오히려 취약하다. DynamoDB Global Tables(D)는 NoSQL Active-Active로 RDS 워크로드 대체가 아니며 리전 간 복제는 최종 일관성(RPO 0 아님)이다. 핵심 신호는 "동기 복제로 RPO 0".

---

**문제 2.** 한 아키텍트가 us-east-1 리전 전체가 마비되는 상황에서도 서비스가 다른 리전에서 계속되도록 설계해야 한다. 다음 중 이 요구를 충족하지 못하는 것은?

A) Aurora Global Database로 보조 리전 구성
B) RDS Multi-AZ로 3개 AZ에 분산
C) S3 Cross-Region Replication
D) DynamoDB Global Tables

**정답: B**

해설: RDS Multi-AZ는 **같은 리전 안**의 AZ 격리이므로 리전 전체 장애에는 무력하다 — DR이 아니라 HA 도구다. 2021년 us-east-1 장애처럼 리전 단위 사고에 견디려면 반드시 리전 경계를 넘는 복제가 필요하다. Aurora Global(A)·CRR(C)·DDB Global Tables(D)는 모두 리전을 넘는 복제를 제공해 보조 리전에서 서비스를 이어갈 수 있다. "리전 전체 장애"가 보이면 Multi-AZ 선택지는 모두 오답으로 걸러야 한다.

---

**문제 3.** 한 글로벌 게임 회사가 5개 리전에서 플레이어 프로필을 **모든 리전에서 동시에 읽고 쓸 수 있는** 저지연 NoSQL로 운영하려 한다. 가장 적합한 것은?

A) Aurora Global Database
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) ElastiCache Global Datastore

**정답: B**

해설: DynamoDB Global Tables는 여러 리전이 **모두 쓰기 가능한 Active-Active** NoSQL을 제공하고, 충돌은 last-writer-wins로 자동 해소하며 복제 지연이 보통 1초 미만이다. Aurora Global(A)은 한 리전만 쓰기(단일 라이터) 가능하므로 "모든 리전에서 동시에 쓰기"에 맞지 않는다. Cross-Region Read Replica(C)는 읽기 전용 사본이다. ElastiCache Global Datastore(D)는 캐시 계층이지 영속 프로필 저장소가 아니며 쓰기도 프라이머리 리전에서만 받는다. "다중 리전 동시 쓰기 NoSQL" = Global Tables.

---

**문제 4.** RDS Multi-AZ 페일오버 후에도 애플리케이션이 한동안 죽은 인스턴스에 접속을 시도한다. 가장 가능성 높은 원인과 해결책은?

A) 스탠바이가 동기화되지 않음 — 복제 재시작
B) 클라이언트 측 DNS 캐싱이 과도하게 김 — 커넥션 풀의 DNS TTL 단축
C) Cross-Zone Load Balancing 비활성 — 활성화
D) RDS가 Multi-AZ를 지원하지 않음 — Aurora로 전환

**정답: B**

해설: RDS 페일오버는 엔드포인트(CNAME)가 가리키는 IP를 새 프라이머리로 바꾸는 방식이라, 애플리케이션이나 JVM이 DNS 결과를 오래 캐싱하면 바뀐 IP를 보지 못하고 죽은 인스턴스에 계속 접속한다. 해결책은 커넥션 풀·런타임의 DNS TTL을 짧게(예: 5초) 두는 것이다. A는 동기 스탠바이는 페일오버 시 이미 최신이므로 원인이 아니고, C는 DB 페일오버와 무관한 ELB 설정이며, D는 문제 원인을 잘못 짚었다(RDS는 Multi-AZ를 지원한다). 이건 분산 시스템에서 캐시 무효화 타이밍이 복구 속도를 좌우하는 전형적 사례다.

---

**문제 5.** 한 팀이 동기 복제로 두 **리전** 간 RPO를 0으로 만들려 한다. 이 접근의 근본 문제는?

A) AWS는 리전 간 동기 복제를 기술적으로 전혀 지원하지 않으므로 불가능
B) 리전 간 거리에 따른 지연으로 모든 쓰기가 느려지고, 분단 시 가용성이 떨어진다(CAP 트레이드오프)
C) 비용이 전혀 들지 않으므로 문제없다
D) Multi-AZ로 자동 해결된다

**정답: B**

해설: 리전 간 거리(수천 km)는 왕복 수십~수백 ms 지연을 강제하므로, 동기 복제로 모든 쓰기가 원격 커밋을 기다리면 쓰기 지연이 치명적으로 커진다(PACELC의 평상시 일관성-지연 트레이드오프). 게다가 CAP 정리상 네트워크 분단 시 강한 일관성을 지키려면 쓰기를 막아야 해 가용성이 희생된다. 그래서 Multi-Region은 보통 비동기 복제(RPO 수초)로 가용성을 택한다. A는 과장(기술적 시도는 가능하나 비현실적)이고, C는 명백히 틀리며, D는 Multi-AZ가 리전 문제를 풀지 못한다.

---

**문제 6.** 비용에 민감한 회사가 리전 장애에 대비하되 RPO는 1시간, RTO는 수 시간을 허용한다. 가장 비용 효율적인 DR 접근의 출발점은?

A) 두 리전 Active-Active 풀스택
B) Cross-Region 스냅샷/백업 + 장애 시 복구(Backup & Restore)
C) RDS Multi-AZ
D) 모든 데이터를 동기 복제

**정답: B**

해설: RPO 1시간·RTO 수 시간이라는 느슨한 목표는 가장 싼 Backup & Restore(Cross-Region 스냅샷 복사 후 장애 시 인프라 재생성)로 충분하다. Active-Active(A)는 거의 0 RTO/RPO를 위한 최고가 옵션으로 요구 대비 과잉이고, Multi-AZ(C)는 리전 장애 대비가 아니며, 동기 복제(D)는 리전 간에 비현실적이고 비싸다. 핵심은 "느슨한 RTO/RPO + 비용 민감 = 가장 저렴한 단계 선택". 요구되는 복원력 수준을 넘어서는 과잉 설계는 그 자체로 낭비다.

---

**문제 7.** NLB 뒤에 두 AZ로 인스턴스를 배치했는데, 한 AZ에 인스턴스가 몰려 트래픽이 고르게 분산되지 않는다. 가장 적절한 조치는?

A) NLB의 Cross-Zone Load Balancing을 활성화
B) 인스턴스를 모두 한 AZ로 통합
C) ALB는 이 기능이 없으므로 NLB만 유지
D) Route 53 Weighted로 대체

**정답: A**

해설: NLB는 Cross-Zone Load Balancing이 **기본 꺼짐**이라, 각 AZ의 로드밸런서 노드가 자기 AZ 타깃에만 트래픽을 보내 인스턴스 분포가 불균형하면 트래픽도 불균형해진다. 이를 활성화하면 모든 AZ 타깃에 고르게 분산된다(ALB는 기본 켜짐). B는 가용성을 해치는 반대 방향이고, C는 사실과 반대(ALB는 기본 활성)이며, D는 DNS 가중치로 인스턴스 단위 분산 문제를 풀 수 없다. NLB의 기본값이 ALB와 다르다는 점이 시험 포인트다.

---

## 📌 핵심 요약

복원력은 물리적 거리가 일관성·지연·격리·비용을 한꺼번에 결정하는 설계 문제다. AZ는 동기 복제가 견딜 만큼 가깝되 한 재난이 둘을 동시에 치지 못할 만큼 멀게 설계돼 Multi-AZ가 같은 리전 안에서 RPO 0의 HA를 제공한다. 리전은 동기 복제 예산을 넘어 Multi-Region이 본질적으로 비동기이며, S3 CRR·DynamoDB Global Tables(Active-Active, last-writer-wins)·Aurora Global(단일 라이터, 승격 RTO 약 1분)이 각각 다른 CAP/PACELC 선택으로 이를 푼다. RTO(복구 자동화)와 RPO(복제 모드)는 독립 축이고, "Multi-AZ는 DR이 아니다"가 핵심 함정이다. 2021 us-east-1·2017 S3 사고는 리전도 장애 단위이며 복구 경로가 장애와 운명을 공유하면 안 된다는 교훈을 남겼다.
