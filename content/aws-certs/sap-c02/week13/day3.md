# Day 3 - 안정성·성능 효율성 기둥 심화 — CAP 정리, 멱등성과 재시도의 수학, HPC 네트워킹의 물리

분산 시스템에는 피할 수 없는 진실이 하나 있다. **네트워크는 반드시 끊기고, 노드는 반드시 죽으며, 메시지는 반드시 중복되거나 사라진다.** Reliability(안정성)는 이 진실을 부정하는 게 아니라 받아들이고 설계하는 기둥이고, Performance Efficiency(성능 효율성)는 같은 자원으로 더 빠르고 효율적으로 처리하는 기둥이다. 두 기둥은 자주 충돌한다 — 강한 일관성을 위해 모든 리전에 동기 복제하면 안정성은 오르지만 지연(성능)이 나빠진다. 이 trade-off를 어디서 끊을지 판단하는 게 Pro 아키텍트의 일이다.

SAP-C02에서 이 두 기둥은 "RTO 5분·RPO 1분", "노드 간 초저지연 HPC", "소비자보다 빠른 메시지 유입", "글로벌 캐싱" 같은 키워드로 출제된다. 오늘은 CAP 정리와 PACELC, 멱등성·재시도의 수학, 캐싱 계층의 원리, HPC 네트워킹의 물리까지 분산 시스템 이론에 뿌리를 두고 분해한다.

## Reliability — 장애를 전제로 설계한다

Reliability의 5대 설계 원칙은 "장애는 일어난다"는 한 가정에서 파생된다: **자동 복구, 복구 절차 테스트, 수평 확장, 용량 추측 금지(모니터링 기반), 변경 자동화.** 핵심은 세 번째와 두 번째다. 수평 확장(scale-out)은 단일 장애점을 제거하고, 복구 절차 테스트는 "백업이 있다"와 "복구가 된다"가 다른 명제임을 인정하는 것이다.

| 패턴 | 도구 | 적용 상황 |
|------|------|----------|
| Multi-AZ | ALB·RDS Multi-AZ·EFS·DynamoDB | 단일 AZ 장애 대비 (동기 복제) |
| Multi-Region | Aurora Global·DynamoDB Global Table·Route 53·S3 CRR | 리전 장애·낮은 RTO/RPO |
| Auto Scaling | ASG·Application Auto Scaling·Karpenter | 부하 변동 대응 |
| Health Check | Route 53·ELB·앱 레벨 | 비정상 노드 자동 제외 |
| 재시도·백오프·지터 | SDK 내장 | 일시적 장애 흡수 |
| 큐잉·디커플링 | SQS·SNS·Kinesis | 컴포넌트 분리·버퍼링 |
| 백업·DR | AWS Backup·MGN·DRS | 데이터·시스템 복구 |
| 카오스 테스트 | FIS | 복구 절차 검증 |

> 💡 **관련 이론**: Multi-AZ vs Multi-Region 선택의 근저에는 **CAP 정리(Brewer, 2000)**가 있다. CAP은 "네트워크 분할(Partition)이 발생하면 일관성(Consistency)과 가용성(Availability) 중 하나만 선택할 수 있다"는 정리다. RDS Multi-AZ는 동기 복제로 **강한 일관성(CP)**을 택해 standby가 항상 최신이지만, 한 AZ가 끊기면 failover 동안 잠깐 불가용하다. DynamoDB Global Table은 **가용성(AP)**을 택해 모든 리전이 쓰기를 받지만 마지막-쓰기-승리(last-writer-wins)로 일시적 불일치를 허용한다. 시험에서 "전 리전 동시 쓰기 + 항상 가용"은 AP(DynamoDB Global), "항상 최신 데이터 보장"은 CP(동기 복제) 신호다.

> 🔍 **더 깊이**: CAP은 "분할이 없을 때"는 말이 없어서 불완전하다. **PACELC 정리(Abadi, 2012)**가 이를 보강한다 — "분할(P)이면 A/C 중 택, **그렇지 않으면(Else) 지연(L)과 일관성(C) 중 택**"이다. 즉 정상 상황에서도 강한 일관성을 원하면 동기 복제로 지연을 감수해야 한다. Aurora Global Database가 "1초 미만 RPO + 1분 미만 복구"를 광고하면서도 **비동기 복제**를 쓰는 이유가 PACELC의 EL 트레이드오프다 — 동기로 전 리전을 묶으면 지연이 폭증하므로, 비동기로 지연을 줄이는 대신 1초 미만의 데이터 손실 창을 허용한다. 시험에서 RPO가 "0이 아니라 1초 미만"으로 표현되면 비동기 복제(Aurora Global)임을 알아챈다.

> 📚 **사례**: 2017년 2월 AWS S3 us-east-1 대규모 장애는 한 엔지니어가 디버깅 중 입력한 잘못된 명령으로 의도보다 많은 서버를 내리며 시작됐다. S3에 의존하던 수많은 서비스(심지어 AWS 자체 상태 대시보드까지)가 동시에 마비됐다. 교훈은 두 가지였다 — (1) us-east-1 단일 리전에 모든 것을 의존한 아키텍처는 그 리전 장애에 통째로 무너진다(Multi-Region의 필요성), (2) 운영 도구가 단일 리전에 묶여 있으면 장애 시 대응조차 못 한다(통제 평면의 독립성). 이후 많은 기업이 핵심 워크로드를 Multi-Region으로, 상태 대시보드를 리전 독립적으로 재설계했다.

> 📚 **사례**: 2012년 10월 AWS EBS us-east-1 장애 때 **Netflix는 거의 영향을 받지 않아** 주목받았다. 비결은 같은 해 구축한 카오스 엔지니어링 문화였다 — Chaos Monkey로 평소에 인스턴스를 무작위로 죽이며 단일 장애점을 없앴고, 여러 AZ에 무상태(stateless)로 분산해 한 AZ·한 컴포넌트가 죽어도 자동 우회되게 설계했다. 교훈: Reliability는 장애가 터진 뒤 대응하는 게 아니라 **평소에 장애를 주입해 검증**해야 확보된다. 이 철학을 AWS가 관리형으로 흡수한 것이 FIS다. "백업 존재"가 아니라 "복구 검증"이 Reliability의 본질이라는 점을 보여준다.

> 💡 **관련 이론**: DR 전략 4종은 RTO/RPO와 비용의 trade-off 스펙트럼이다 — **Backup/Restore**(RTO 수 시간, 최저 비용) → **Pilot Light**(핵심만 켜둠) → **Warm Standby**(축소판 상시 가동) → **Multi-Site Active-Active**(완전 이중화, RTO 거의 0, 최고 비용). RTO/RPO가 짧을수록 상시 가동 자원이 많아 비용이 오른다. 시험에서 "RTO 분 단위"는 Warm Standby 이상, "RTO 수 시간 허용 + 최저 비용"은 Backup/Restore 신호다. 이 스펙트럼은 Reliability와 Cost 두 기둥이 충돌하는 대표 지점이다.

## 멱등성과 재시도 — 안정성의 수학

재시도(retry)는 Reliability의 기본기지만, 잘못하면 장애를 키운다. 두 개념을 정확히 알아야 한다.

**멱등성(Idempotency)**: 같은 요청을 여러 번 실행해도 결과가 한 번 실행과 같은 성질이다. 네트워크 타임아웃으로 "요청이 처리됐는지 모를 때" 안전하게 재시도하려면 연산이 멱등해야 한다. 결제처럼 비멱등한 연산은 **멱등성 키(idempotency key)**를 붙여 서버가 중복을 걸러내게 한다. SQS FIFO의 메시지 중복 제거 ID, Lambda의 멱등 처리가 같은 발상이다.

**지수 백오프 + 지터(Exponential Backoff with Jitter)**: 장애 시 모든 클라이언트가 동시에 재시도하면 **재시도 폭풍(retry storm)**으로 서버가 회복 직전에 다시 무너진다(thundering herd). 백오프는 재시도 간격을 지수적으로(1s→2s→4s→8s) 늘려 부하를 분산하고, 지터는 거기에 무작위성을 더해 클라이언트들이 같은 순간에 몰리지 않게 흩뜨린다.

> 💡 **관련 이론**: 지터의 효과는 확률론으로 설명된다. 지터 없이 백오프만 쓰면 모든 클라이언트의 재시도 시각이 동기화돼 1s, 2s, 4s 지점에 부하 스파이크가 생긴다. 지터를 넣으면 재시도 시각이 [0, backoff] 구간에 균등 분포되어 부하가 시간축에 평탄화된다. AWS Architecture Blog의 "Exponential Backoff And Jitter"는 full jitter(`random(0, base*2^n)`)가 재시도 횟수와 서버 부하를 동시에 최소화함을 시뮬레이션으로 보였다. 이것이 AWS SDK 기본 재시도 전략에 지터가 내장된 이유다. 시험에서 "동시 재시도로 서버 과부하"가 보이면 backoff + jitter가 정답 방향이다.

> ⚠️ **함정**: "메시지가 소비자보다 빠르게 유입된다"는 시나리오에서 동기 호출(Lambda 직접 호출 등)을 고르면 오답이다. 생산자-소비자 속도 불일치는 **큐(SQS)로 버퍼링(backpressure 흡수)**해야 한다 — 소비자는 자기 속도로 폴링하고, 처리 실패 메시지는 **DLQ(Dead Letter Queue)**로 격리해 정상 흐름을 막지 않는다. SNS 직접 팬아웃이나 동기 호출은 소비자가 못 따라가면 메시지 유실·타임아웃이 난다. 시험에서 "유입 폭주 흡수·디커플링"은 SQS + DLQ가 직답이다.

## Performance Efficiency — 적합한 서비스를 고르는 기둥

Performance의 5대 원칙은 "최신 기술 민주화(managed), 글로벌 도달, 서버리스 우선, 실험·측정, 공감 기반 설계"다. 실무에서는 **Compute·Storage·Database·Network 4영역에서 워크로드에 맞는 서비스를 고르는 것**으로 귀결된다.

**Compute**: EC2(Graviton·Spot·Auto Scaling)·Fargate·Lambda. 배치 전략 — Cluster(저지연), Spread(격리), Partition(대규모 분산).
**Storage**: gp3·io2(블록), st1·sc1(처리량/콜드), Instance Store(NVMe 초저지연 임시), FSx(Lustre·Windows·NetApp ONTAP·OpenZFS).
**Database**: 관계형(RDS·Aurora), 키-값(DynamoDB), 문서(DocumentDB), 그래프(Neptune), 시계열(Timestream), 원장(QLDB), 와이드칼럼(Keyspaces) + 캐시(ElastiCache·DAX·MemoryDB).
**Network**: CloudFront·Global Accelerator·Enhanced Networking(ENA·EFA)·Cluster Placement Group.

## 캐싱 계층 — 지연과 비용을 동시에 줄이는 원리

```
Client → CloudFront(엣지) → API GW Cache → ElastiCache/DAX(앱) → DB(원본)
```

각 계층은 더 빠르고 싼 저장소에 자주 쓰이는 데이터를 둬서, 느리고 비싼 원본(DB)에 도달하는 요청 수를 줄인다. 이것이 **캐시의 본질 — 지역성(locality)을 활용한 계층화**다.

> 💡 **관련 이론**: 캐싱은 컴퓨터 구조의 **메모리 계층(memory hierarchy)**과 **지역성 원리(principle of locality)**를 분산 시스템에 그대로 옮긴 것이다. CPU의 L1/L2/L3 캐시 → RAM → 디스크 계층처럼, CloudFront → ElastiCache → DB도 "가까울수록 빠르고 작고 비싸다"는 동일 구조다. 캐시 효율은 **시간 지역성**(최근 쓴 데이터를 또 쓴다)과 **공간 지역성**(가까운 데이터를 함께 쓴다)에 의존한다. 캐시 전략(write-through·write-back·cache-aside)과 무효화(invalidation)는 OS·DB 캐시 이론과 동일하다. "캐시 무효화는 컴퓨터 과학의 두 가지 어려운 문제 중 하나"라는 농담이 분산 캐시에도 적용된다 — DAX·ElastiCache의 TTL·무효화 설계가 정합성의 핵심이다.

> 🎯 **시나리오**: "한 읽기 집약 애플리케이션이 DynamoDB에서 같은 항목을 초당 수만 번 읽어 비용과 지연이 모두 높다. 코드 변경을 최소화하며 마이크로초 단위 응답을 원한다. 무엇을 추가하나?" — 답: **DAX(DynamoDB Accelerator)**. DAX는 DynamoDB 전용 인메모리 캐시로 API가 DynamoDB와 호환돼 코드 변경이 거의 없고, 캐시 적중 시 마이크로초 응답·읽기 비용 절감을 동시에 준다. ElastiCache(Redis/Memcached)는 범용 캐시지만 cache-aside 로직을 직접 짜야 한다. "DynamoDB 전용 + 코드 최소 변경 + 마이크로초"는 DAX의 직답이다.

## HPC 네트워킹 — 물리가 지배하는 영역

HPC(고성능 컴퓨팅)·분산 ML 학습은 수백 노드가 매 스텝마다 그래디언트를 교환하므로 **노드 간 통신 지연이 전체 성능을 지배**한다. 여기서 빛의 속도와 네트워크 스택 오버헤드라는 물리가 설계를 결정한다.

- **Cluster Placement Group**: 인스턴스를 같은 AZ·같은 랙에 물리적으로 밀집 배치해 노드 간 지연을 최소화하고 대역폭을 최대화한다. 대가로 가용성은 떨어진다(같은 랙 장애 시 전멸 — HPC는 재실행 가능하므로 수용).
- **EFA(Elastic Fabric Adapter)**: OS 커널을 우회(OS-bypass)해 사용자 공간에서 직접 NIC에 접근, MPI·NCCL 같은 HPC 통신 라이브러리에 RDMA 수준 저지연을 제공한다.
- **FSx for Lustre**: 수백 GB/s 처리량의 병렬 파일시스템으로, S3와 연동해 대규모 데이터셋을 고속 공급한다.

> 🔍 **더 깊이**: EFA의 "OS-bypass"가 왜 결정적인가? 일반 TCP/IP 통신은 패킷마다 커널 모드 전환·복사·인터럽트가 발생해 마이크로초 단위 오버헤드가 쌓인다. 수백 노드가 매 스텝 통신하는 분산 학습에서는 이 오버헤드가 GPU를 놀게 만든다. EFA는 SRD(Scalable Reliable Datagram) 프로토콜로 커널을 건너뛰고 사용자 공간에서 직접 NIC와 통신해 지연을 수십분의 일로 줄인다. 이것이 Cluster PG(물리 밀집) + EFA(스택 우회) + Lustre(데이터 공급)가 HPC·대규모 ML 학습의 표준 3종 세트인 이유다. 시험에서 "노드 간 초저지연 + MPI/분산 학습"이 보이면 이 조합이 정답이다.

## 정리하며

Reliability는 "장애는 일어난다"를 전제로 Multi-AZ(CP·동기) → Multi-Region(AP/비동기)로 확장하며, 멱등성·지수 백오프+지터로 재시도를 안전하게 하고, FIS로 복구 절차를 검증한다. Performance Efficiency는 Compute·Storage·DB·Network 4영역에서 워크로드에 맞는 서비스를 고르고, 메모리 계층 원리를 따른 캐싱(CloudFront·ElastiCache·DAX)으로 지연·비용을 동시에 줄이며, HPC는 Cluster PG + EFA + Lustre로 물리적 한계를 돌파한다.

SAP 시험 단골 매핑: (1) "RTO·RPO 분 단위 + 글로벌" → **Aurora Global**(비동기, RPO 1초 미만)·**DynamoDB Global Table**, (2) "전 리전 동시 쓰기 + 항상 가용" → **DynamoDB Global(AP)**, (3) "노드 간 초저지연 HPC/분산 학습" → **Cluster PG + EFA + FSx Lustre**, (4) "DynamoDB 전용 마이크로초 캐시 + 코드 최소 변경" → **DAX**, (5) "유입 폭주 흡수·디커플링" → **SQS + DLQ**, (6) "복구 절차 정기 검증" → **FIS**, (7) "동시 재시도 폭풍" → **지수 백오프 + 지터**, (8) "ARM 비용·성능·전력" → **Graviton**. 다음 day는 Cost·Sustainability 두 기둥을 단위 경제학과 탄소 회계까지 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 서비스가 여러 리전에서 동시에 읽고 쓰며, 한 리전이 장애가 나도 다른 리전에서 끊김 없이 쓰기를 계속 받아야 한다. 일시적 데이터 불일치는 비즈니스적으로 허용된다. 가장 적합한 데이터베이스는?

A) RDS Multi-AZ (동기 복제)

B) DynamoDB Global Table (멀티 리전, 멀티 액티브)

C) Aurora 단일 리전 + Read Replica

D) 단일 리전 DynamoDB

**정답: B**
해설: DynamoDB Global Table은 모든 리전이 쓰기를 받는 멀티 액티브 구조로, CAP의 가용성(AP)을 택해 한 리전 장애에도 다른 리전이 쓰기를 계속 받는다. 대신 last-writer-wins로 일시적 불일치를 허용하는데 문제에서 이를 허용한다. A(RDS Multi-AZ)는 단일 리전 내 동기 복제로 멀티 리전 동시 쓰기가 아니다. C는 리전 장애에 취약하고 쓰기는 단일 리전이다. D는 멀티 리전이 아니다. 함정: "전 리전 동시 쓰기 + 항상 가용 + 불일치 허용"은 AP(DynamoDB Global)다.

---

**문제 2.** 한 분산 ML 학습 작업이 수백 개 노드 간에 매 스텝 그래디언트를 교환하며, 노드 간 통신 지연이 학습 속도를 좌우한다. 가용성보다 통신 성능이 우선이다. 가장 적합한 구성은?

A) Spread Placement Group으로 노드를 여러 랙에 분산

B) Cluster Placement Group + EFA + FSx for Lustre

C) Multi-AZ Auto Scaling Group

D) Partition Placement Group + EBS gp3

**정답: B**
해설: Cluster PG는 같은 AZ·랙에 노드를 밀집 배치해 지연을 최소화하고, EFA는 OS-bypass로 MPI/NCCL 통신에 RDMA 수준 저지연을 주며, FSx Lustre는 수백 GB/s로 데이터를 공급한다 — HPC·분산 학습의 표준 3종이다. A(Spread)는 격리가 목적이라 지연이 오히려 늘고, C(Multi-AZ)는 AZ 간 지연으로 통신이 느리며, D(Partition)는 대규모 분산 저장용이지 초저지연 통신용이 아니다. 함정: "노드 간 초저지연 통신"은 Cluster PG + EFA다.

---

**문제 3.** 한 읽기 집약 애플리케이션이 DynamoDB에서 동일 항목을 초당 수만 번 읽어 지연과 비용이 높다. 애플리케이션 코드 변경을 최소화하며 마이크로초 단위 응답을 원한다. 가장 적합한 솔루션은?

A) ElastiCache for Redis를 cache-aside로 구현

B) DAX(DynamoDB Accelerator) 추가

C) DynamoDB 읽기 용량(RCU)을 대폭 증설

D) Aurora Read Replica 추가

**정답: B**
해설: DAX는 DynamoDB 전용 인메모리 캐시로 DynamoDB와 API 호환이라 코드 변경이 거의 없고, 캐시 적중 시 마이크로초 응답과 읽기 비용 절감을 동시에 준다. A(ElastiCache)는 범용 캐시지만 cache-aside 로직을 직접 작성해야 해 코드 변경이 크다. C는 비용만 늘고 마이크로초 응답을 보장하지 않는다. D는 DynamoDB가 아닌 Aurora용이다. 함정: "DynamoDB 전용 + 코드 최소 변경 + 마이크로초"는 DAX의 직답이다.

---

**문제 4.** 한 모바일 백엔드에서 장애 복구 시 수많은 클라이언트가 동시에 재시도하며 서버가 회복 직전에 다시 무너지는 현상이 반복된다. 가장 적합한 대응은?

A) 재시도 횟수를 무제한으로 늘린다

B) 지수 백오프에 지터(jitter)를 추가해 재시도 시각을 분산한다

C) 재시도를 완전히 제거한다

D) 모든 클라이언트가 동일한 고정 간격으로 재시도하게 한다

**정답: B**
해설: 동시 재시도 폭풍(thundering herd)은 지수 백오프(간격을 1s→2s→4s로 증가)에 지터(무작위성)를 더해 재시도 시각을 [0, backoff] 구간에 균등 분포시켜 부하를 시간축에 평탄화함으로써 해결한다. AWS SDK 기본 전략에 내장돼 있다. A는 부하를 키우고, C는 일시 장애를 흡수 못 하며, D(고정 간격)는 오히려 동기화돼 스파이크를 만든다. 함정: "동시 재시도 과부하"는 backoff + jitter다.

---

**문제 5.** 한 시스템에서 생산자가 메시지를 소비자 처리 속도보다 빠르게 쏟아내 메시지 유실과 타임아웃이 발생한다. 처리에 실패한 메시지는 정상 흐름을 막지 않고 별도로 격리·재처리하고 싶다. 가장 적합한 설계는?

A) SNS로 소비자에게 직접 팬아웃

B) SQS로 버퍼링하고 처리 실패 메시지는 DLQ로 격리

C) Lambda를 동기 호출로 직접 연결

D) DynamoDB Streams로 직접 처리

**정답: B**
해설: 생산자-소비자 속도 불일치는 SQS 큐로 버퍼링해 소비자가 자기 속도로 폴링하게 하고(backpressure 흡수), 처리 실패 메시지는 DLQ(Dead Letter Queue)로 격리해 정상 흐름을 막지 않으면서 재처리한다. A(SNS 직접)·C(동기 호출)는 소비자가 못 따라가면 유실·타임아웃이 난다. D는 이 목적의 디커플링·버퍼링 메커니즘이 아니다. 함정: "유입 폭주 흡수 + 실패 격리"는 SQS + DLQ다.

---

**문제 6.** 한 팀이 Aurora Global Database를 도입했는데, 문서에 RPO가 "0이 아니라 1초 미만"으로 명시돼 있다. 이 RPO 특성을 가장 잘 설명하는 것은?

A) Aurora Global은 동기 복제라 RPO가 항상 0이다

B) Aurora Global은 리전 간 비동기 복제를 사용하므로 1초 미만의 데이터 손실 창이 존재한다

C) RPO 1초 미만은 단순 마케팅 표현이며 실제로는 0이다

D) Aurora Global은 복제를 하지 않는다

**정답: B**
해설: Aurora Global Database는 리전 간 비동기 복제를 사용한다. 동기로 전 리전을 묶으면 지연이 폭증(PACELC의 EL 트레이드오프)하므로, 비동기로 지연을 줄이는 대신 1초 미만의 데이터 손실 가능 창(RPO)을 허용한다. A는 동기로 오인한 것, C·D는 사실과 다르다. 함정: RPO가 "0이 아닌 1초 미만"이면 비동기 복제이며, 지연과 일관성의 trade-off(PACELC)를 반영한 것이다.

---
