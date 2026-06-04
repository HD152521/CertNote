# Day 3 - RDS Multi-AZ vs Read Replica, 동기와 비동기 사이의 선택

데이터베이스 가용성 이야기는 결국 하나의 물리 법칙으로 귀결된다. **빛은 무한히 빠르지 않다.** 서울과 버지니아 사이는 광케이블로 왕복 약 180ms가 걸린다 — 이건 AWS가 돈으로 줄일 수 있는 게 아니라 빛의 속도가 정한 하한선이다. 데이터베이스가 "쓰기를 복제본에 반영할 때까지 기다린다"(동기)면 모든 트랜잭션이 이 왕복 시간만큼 느려지고, "기다리지 않는다"(비동기)면 빠르지만 복제본이 잠깐 뒤처진다. RDS Multi-AZ와 Read Replica의 모든 차이는 이 동기/비동기 선택에서 갈라진다.

이게 시험에서 가장 많이 틀리는 주제인 이유는 둘이 표면적으로 비슷해 보이기 때문이다 — 둘 다 "DB를 하나 더 두는 것"처럼 보인다. 하지만 Multi-AZ는 **가용성**을 위한 동기 복제 대기조이고, Read Replica는 **읽기 확장**을 위한 비동기 복제 일꾼이다. 목적도, 복제 방식도, 클라이언트 접근 가능 여부도 정반대다. 이 글은 동기/비동기의 물리적 의미부터 Aurora가 이 트레이드오프를 어떻게 재설계했는지까지 파고든다.

## 동기 복제 — Multi-AZ가 데이터를 잃지 않는 대가

RDS Multi-AZ는 같은 리전의 **다른 AZ**에 Standby 인스턴스를 두고, Primary의 모든 쓰기를 **동기적으로(synchronously)** Standby에 복제한다. "동기"의 정확한 의미가 핵심이다 — 애플리케이션이 트랜잭션을 커밋하면, Primary는 그 변경을 자기 디스크에 쓰는 **동시에** Standby에도 보내고, **Standby가 "받아서 디스크에 썼다"고 확인(ack)할 때까지 커밋을 완료로 처리하지 않는다.** 즉 클라이언트가 "커밋 성공"을 받은 순간, 그 데이터는 이미 두 AZ의 디스크에 모두 안전하게 들어가 있다.

이게 왜 중요한가. Primary가 통째로 터지는 순간에도 Standby에는 마지막 커밋까지 빠짐없이 들어 있다 — **데이터 손실(RPO)이 0이다.** RDS는 Primary 장애를 감지하면 자동으로 Standby를 새 Primary로 승격하고, **DNS endpoint를 새 Primary로 바꾼다(CNAME 전환).** 애플리케이션은 같은 endpoint를 계속 쓰는데 그 뒤의 실제 인스턴스만 바뀐다 — 보통 60~120초 안에 페일오버가 끝난다.

동기 복제의 대가는 **쓰기 지연**이다. 모든 커밋이 AZ 간 왕복(보통 1~2ms, 같은 리전이라 짧다)을 기다리므로 약간 느려진다. 그래서 Multi-AZ는 AZ 간 지연이 작은 **같은 리전 안에서만** 동작한다 — 만약 리전을 넘는 동기 복제를 하면 180ms씩 모든 커밋이 느려져 DB가 사실상 마비된다. **그래서 Multi-AZ는 DR이 아니다.** 같은 리전 내 AZ 장애는 견디지만, 리전 전체가 날아가면(드물지만 있었다) Multi-AZ도 함께 사라진다. 리전 단위 DR은 Cross-Region Read Replica나 Aurora Global Database의 몫이다.

> 💡 **관련 이론**: 동기 복제와 데이터 손실 없음(RPO=0)의 관계는 분산 시스템의 **CAP 정리**와 직결된다. CAP은 네트워크 분단(Partition) 상황에서 일관성(Consistency)과 가용성(Availability)을 동시에 완벽히 가질 수 없다고 말한다. Multi-AZ 동기 복제는 일관성을 택한다 — Standby의 ack를 기다리므로 두 AZ가 항상 같은 데이터를 갖지만, 그 ack를 기다리는 동안 쓰기가 지연된다. 반대로 Read Replica의 비동기 복제는 가용성·성능을 택한다 — ack를 안 기다려 빠르지만 복제본이 뒤처진다(replication lag). "데이터를 절대 잃으면 안 되는가(동기)" vs "조금 뒤처져도 빠른 게 중요한가(비동기)"가 곧 일관성 vs 가용성의 실무적 번역이다.

> 🔍 **더 깊이**: 일반 RDS Multi-AZ(Primary+Standby)의 Standby는 클라이언트가 접근할 수 없다 — 순수한 대기조라 읽기조차 못 보낸다. 그런데 **Multi-AZ DB Cluster**(MySQL/PostgreSQL 전용)는 다르다. Primary 1개 + Reader 2개의 3노드 구조로, 두 Reader는 동기에 가까운 복제를 받으면서 **읽기 트래픽도 처리**하고, 페일오버도 35초 이하로 더 빠르다. 즉 Multi-AZ DB Cluster는 "HA + 약간의 읽기 확장"을 동시에 준다. 일반 Multi-AZ Instance(Standby 접근 불가)와 Multi-AZ DB Cluster(Reader 접근 가능)를 혼동하면 시험에서 함정에 빠진다 — "Multi-AZ인데 읽기도 분산되나?"는 DB Cluster 구성에서만 참이다.

## 비동기 복제 — Read Replica가 빠른 대신 뒤처지는 이유

Read Replica는 정반대 목적이다. Primary의 변경을 **비동기적으로(asynchronously)** 복제본에 흘려보내고, 그 복제본을 **별도 endpoint**로 노출해 읽기 전용 트래픽을 받게 한다. 비동기란 Primary가 Standby의 ack를 **기다리지 않는다**는 뜻이다 — 커밋은 Primary 디스크에 쓰는 즉시 완료되고, 변경 로그는 그 뒤에 느긋하게 복제본으로 전송된다. 그래서 Primary 쓰기 성능은 복제본 개수와 거리에 거의 영향받지 않는다.

대가는 **복제 지연(replication lag)**이다. 복제본은 항상 Primary보다 조금(수 ms~수 초, 부하 시 더) 뒤처진다. 방금 Primary에 쓴 데이터를 즉시 복제본에서 읽으면 아직 없을 수 있다(read-after-write 불일치). 그래서 Read Replica는 "약간 뒤처져도 괜찮은" 읽기 — 분석 쿼리, 리포트, 대시보드, 검색 — 에 쓰고, "방금 쓴 걸 즉시 읽어야 하는" 트랜잭션 읽기는 Primary로 보낸다.

Read Replica의 강력한 활용 두 가지가 있다. 첫째, **Cross-Region Read Replica** — 복제본을 다른 리전에 둘 수 있다. 비동기라 리전 간 180ms 지연이 Primary 성능을 해치지 않는다(어차피 안 기다리니까). 둘째, **promote** — 복제본을 독립 DB로 승격할 수 있다. Primary가 있는 리전 전체가 장애 나면, 다른 리전의 Read Replica를 promote해 새 Primary로 쓴다. 이게 Cross-Region Read Replica가 **DR 수단**이 되는 이유다. 단 promote는 수동(또는 자동화 트리거)이고, promote하는 순간 복제 관계가 끊겨 원본과 독립된다.

| 항목 | Multi-AZ (Instance) | Read Replica |
|------|---------------------|--------------|
| 목적 | 가용성(HA) | 읽기 확장 + Cross-Region DR |
| 복제 방식 | 동기 (ack 대기) | 비동기 (대기 안 함) |
| 데이터 손실(RPO) | 0 | 복제 지연만큼 가능 |
| 클라이언트 읽기 | 불가 (Standby 대기조) | 가능 (별도 endpoint) |
| Cross-Region | 불가 (같은 리전만) | 가능 |
| 장애 대응 | 자동 페일오버(60~120초, endpoint 유지) | 수동 promote(관계 단절) |
| 쓰기 성능 영향 | 약간 느려짐(AZ 왕복) | 거의 없음 |

> ⚠️ **함정**: "가용성을 높이고 싶다"에 Read Replica를 고르거나 "읽기 부하를 분산하고 싶다"에 Multi-AZ를 고르는 게 가장 흔한 오답이다. Multi-AZ Standby는 클라이언트가 **읽기조차 보낼 수 없으므로** 읽기 분산에 전혀 도움이 안 되고, Read Replica는 비동기라 Primary 장애 시 마지막 몇 초의 데이터를 잃을 수 있어 RPO=0 가용성을 보장하지 못한다. 둘 다 필요하면 둘을 함께 쓴다 — Multi-AZ로 HA를 잡고, Read Replica를 추가로 붙여 읽기를 분산한다. 시험 키워드: "단일 AZ 장애 자동 복구/데이터 손실 없이" → Multi-AZ, "읽기 성능/리포트 부하" → Read Replica, "리전 장애 대비" → Cross-Region RR 또는 Aurora Global DB.

## Aurora — 복제를 인스턴스가 아니라 스토리지가 하게 만들다

RDS의 복제는 인스턴스 단위다 — Primary 인스턴스가 변경 로그를 만들어 다른 인스턴스로 보내고, 받은 쪽이 재생한다. Aurora는 이 구조를 근본적으로 뒤집었다. **복제를 인스턴스가 아니라 스토리지 계층이 한다.** Aurora 클러스터에서 컴퓨트(DB 인스턴스)와 스토리지가 분리되고, 스토리지는 **3개 AZ에 걸쳐 6벌(6-way)**로 자동 복제되는 공유 분산 볼륨이다. Writer든 Reader든 이 **하나의 공유 스토리지**를 바라본다.

이 설계가 바꾸는 게 많다. RDS Read Replica는 각자 자기 데이터 사본을 갖고 로그를 재생해야 해서 복제 지연이 크지만, Aurora Reader는 Writer와 **같은 스토리지를 공유**하므로 로그를 재생할 필요 없이 보통 수십 ms 안에 최신 데이터를 본다. 스토리지가 6벌이라 디스크 일부가 손상돼도(self-healing) 자동 복구되고, 4/6만 살아 있어도 읽기, 3/6이면 쓰기가 가능한 **quorum** 방식이라 가용성이 99.99%에 이른다.

```
Aurora Cluster
├── Cluster Endpoint  (Writer, 읽기·쓰기 — 항상 현재 Primary 가리킴)
├── Reader Endpoint   (모든 Reader에 읽기 로드밸런싱)
├── Custom Endpoint   (특정 인스턴스 그룹 — 예: 분석 전용 큰 인스턴스)
└── Instance Endpoint (개별 인스턴스 직접)

Storage Layer:
   6 copies / 3 AZ (자동, quorum 4/6 읽기·3/6 쓰기)
   Continuous backup to S3
   Self-healing (손상 블록 자동 복구)
```

Endpoint가 여러 개인 이유도 이 구조에서 나온다. **Cluster Endpoint**는 항상 현재 Writer를 가리켜 페일오버 시 자동으로 새 Writer로 옮겨가고, **Reader Endpoint**는 모든 Reader에 읽기를 분산한다. 애플리케이션은 쓰기를 Cluster Endpoint로, 읽기를 Reader Endpoint로 보내기만 하면 인스턴스가 추가·제거·페일오버되든 신경 쓸 필요가 없다.

> 💡 **관련 이론**: Aurora의 quorum 복제는 분산 합의 이론의 **quorum 시스템**을 그대로 쓴다. N개 복제본에서 쓰기 정족수 W와 읽기 정족수 R을 `W + R > N`으로 잡으면 읽기와 쓰기 집합이 반드시 겹쳐 항상 최신 데이터를 읽을 수 있다. Aurora는 N=6, W=4, R=3으로 `4+3 > 6`을 만족시킨다 — 이 여유 덕에 AZ 하나(복제본 2개)가 통째로 죽어도 남은 4벌로 쓰기 정족수를 채우고, 추가로 1벌이 더 죽어도 읽기는 된다. 6벌이라는 숫자가 "AZ 1개 완전 장애 + 추가 1벌 장애를 동시에 견딘다"는 목표에서 역산된 것이다. Dynamo, Cassandra 같은 분산 DB가 쓰는 정족수 튜닝과 같은 수학이다.

## Aurora Global Database — 리전 장애를 1분 안에 넘기는 구조

Cross-Region Read Replica가 리전 DR을 주지만, RDS의 인스턴스 단위 비동기 복제라 지연이 크고 페일오버가 굼뜨다. **Aurora Global Database**는 이걸 스토리지 계층 복제로 다시 푼다. 1개 Primary Region + 최대 5개 Secondary Region 구조에서, Primary의 변경이 **전용 복제 인프라**를 통해 Secondary 리전의 스토리지로 전송된다. 인스턴스가 아니라 스토리지가 리전을 넘어 복제되므로 **RPO < 1초, RTO < 1분**을 달성한다.

Secondary 리전은 읽기 전용이며 수십 ms 지연으로 최신 데이터를 본다 — 글로벌 사용자에게 가까운 리전에서 빠른 읽기를 제공한다. Primary 리전 전체가 장애 나면 Secondary를 **promote**해 60초 이내에 새 Primary로 전환한다. RDS Cross-Region RR의 수동 promote보다 빠르고, 데이터 손실도 훨씬 작다.

| 도구 | 범위 | 복제 단위 | RPO/RTO | 주 용도 |
|------|------|-----------|---------|---------|
| Multi-AZ | 같은 리전 AZ 간 | 동기, 인스턴스 | RPO 0 / RTO 1~2분 | HA |
| Cross-Region Read Replica | 리전 간 | 비동기, 인스턴스 | RPO 분 / RTO 수동 | 읽기+DR(RDS) |
| Aurora Global Database | 리전 간 | 비동기, 스토리지 | RPO<1초 / RTO<1분 | 글로벌 읽기+DR(Aurora) |

> 📚 **사례**: 2021년 12월 AWS us-east-1 리전에서 대규모 장애가 발생해 수많은 서비스가 중단됐다. 이때 단일 리전에만 의존하던(Multi-AZ만 쓰던) 워크로드는 함께 멈췄지만, Aurora Global Database나 Cross-Region 복제로 다른 리전에 사본을 둔 곳은 Secondary를 promote해 복구할 수 있었다. 이 사건은 "Multi-AZ는 AZ 장애용이지 리전 장애용이 아니다"라는 교훈을 업계에 각인시켰다. us-east-1은 AWS에서 가장 크고 오래된 리전이라 글로벌 컨트롤 플레인 일부가 여기 의존하기도 해, 이 리전 장애는 여러 차례 광범위한 영향을 미쳤다. 리전 단위 DR을 설계에 넣지 않으면, 아무리 Multi-AZ를 촘촘히 깔아도 리전 하나의 운명에 묶인다.

## PITR과 Backtrack — 시간을 되돌리는 두 가지 방식

RDS와 Aurora 모두 시간을 거슬러 복원하는 수단을 주지만 방식이 다르다. **PITR(Point-in-Time Recovery)**은 Day 2에서 본 대로 베이스 스냅샷 + 트랜잭션 로그 재생으로 **임의 시점의 새 인스턴스**를 만든다. 자동 백업 보존 기간(1~35일) 내에서 작동하고, 원본을 건드리지 않는다.

Aurora의 **Backtrack**은 전혀 다른 메커니즘이다. PITR이 새 인스턴스를 만드는 데 비해, Backtrack은 **기존 클러스터 자체를 과거 시점으로 되감는다(rewind).** Aurora가 변경 기록을 스토리지에 보관하고 있어, "10분 전으로 되감아줘"라고 하면 새 인스턴스 생성 없이 그 자리에서 클러스터를 그 시점 상태로 되돌린다 — 수 초~수 분 만에. 잘못된 배포나 실수 쿼리를 빠르게 무를 때 PITR(새 인스턴스, 수십 분)보다 훨씬 빠르다. 대신 되감기라 그 시점 이후 데이터는 사라진다.

> 🔍 **더 깊이**: Backtrack이 빠른 이유는 Aurora의 로그 중심(log-structured) 스토리지 구조 덕이다. Aurora는 전통 DB처럼 데이터 페이지를 직접 쓰지 않고 **redo 로그만 스토리지로 보내며, 스토리지 계층이 그 로그로 페이지를 구성한다.** 변경의 역사가 로그로 이미 스토리지에 쌓여 있으니, 특정 시점으로 되감는 건 "로그 포인터를 그 시점으로 옮기는" 일에 가깝다 — 데이터를 새로 복원·재생할 필요가 없어 빠르다. 단 Backtrack은 미리 활성화하고 되감기 가능 윈도우(target backtrack window)를 설정해 둬야 하며, 그 윈도우만큼 추가 저장 비용이 든다. PITR(보존 기간 내 임의 시점, 새 인스턴스)과 Backtrack(설정한 윈도우 내, 같은 클러스터 되감기)을 시험에서 구분해야 한다.

## RDS Proxy — Connection Storm을 막는 연결 풀

Lambda 같은 서버리스가 RDS를 만나면 고유한 문제가 터진다. Lambda는 동시 요청이 폭증하면 함수 인스턴스가 수백~수천 개로 늘어나는데, **각 인스턴스가 DB에 직접 커넥션을 연다.** DB의 최대 커넥션 수는 인스턴스 메모리에 묶여 있어(예: db.t3.medium은 수백 개) 금세 한도를 초과하고, 새 커넥션을 맺는 비용(TCP+TLS+인증)도 매번 발생해 DB가 커넥션 관리에 짓눌린다. 이게 **Connection Storm**이다.

**RDS Proxy**는 DB 앞에 **커넥션 풀**을 둬 이를 해결한다. Lambda는 Proxy에 연결하고, Proxy가 실제 DB 커넥션을 소수로 유지하며 재사용(multiplexing)한다. 수천 개의 Lambda가 와도 DB가 실제로 보는 커넥션은 풀 크기로 제한된다. 추가로 Proxy는 Secrets Manager와 통합해 자격증명을 안전하게 관리하고, Primary 페일오버 시 커넥션을 빠르게 새 Primary로 돌려 페일오버 시간도 줄인다. **Lambda + RDS는 RDS Proxy가 사실상 필수**라고 봐야 한다.

> ⚠️ **함정**: Connection Storm을 "DB 인스턴스를 키우면 해결된다"고 답하면 오답이다. 인스턴스를 키우면 최대 커넥션이 늘긴 하지만, Lambda 스케일은 그보다 훨씬 가파르게 폭증할 수 있어 근본 해결이 아니고 비용만 든다. 또 매 요청마다 커넥션을 새로 맺고 끊는 오버헤드는 인스턴스 크기와 무관하다. 정답은 커넥션을 **풀링·재사용**하는 RDS Proxy다. 시험에서 "Lambda가 RDS에 동시 수천 호출 → 커넥션 한도 초과"는 거의 항상 RDS Proxy가 답이다.

## 정리하며

RDS의 가용성 도구들은 전부 동기/비동기라는 하나의 축에서 갈라진다. Multi-AZ는 동기 복제로 RPO=0 가용성을 얻는 대신 같은 리전에 묶이고 Standby는 읽기를 못 받는다. Read Replica는 비동기 복제로 빠른 읽기 확장과 Cross-Region DR을 얻는 대신 복제 지연을 감수한다. Aurora는 복제를 스토리지 계층으로 내려 둘의 트레이드오프를 완화하고, Global Database로 리전 DR을 1분 안에 끝낸다.

운영자가 기억할 다섯 가지는 이렇다. ① Multi-AZ = HA(동기, RPO 0, 같은 리전, Standby 읽기 불가, 자동 페일오버). ② Read Replica = 읽기 확장(비동기, 별도 endpoint, Cross-Region 가능, promote로 DR). ③ 리전 DR = Cross-Region RR 또는 Aurora Global DB(RPO<1초, RTO<1분). ④ Aurora는 컴퓨트/스토리지 분리 + 6벌/3AZ quorum, Reader는 공유 스토리지라 지연이 작다. ⑤ Lambda + RDS는 RDS Proxy로 Connection Storm 방어 — 인스턴스 키우기는 오답.

다음 글에선 데이터베이스를 넘어, 파일·객체·온프레미스 워크로드를 다른 리전과 AWS로 복제·페일오버하는 S3 Replication, Storage Gateway, Elastic Disaster Recovery를 다룬다.

---

## 📝 연습 문제

**문제 1.** "단일 AZ 장애에서 데이터 손실 없이 자동 복구"가 목표다. 어떤 RDS 기능이 정확한가?

A) Read Replica 추가
B) Multi-AZ — 다른 AZ의 Standby에 동기 복제, 자동 페일오버(60~120초), RPO 0
C) Manual Snapshot 주기 생성
D) Cross-Region Read Replica

**정답: B**

해설: Multi-AZ는 같은 리전 다른 AZ의 Standby에 모든 커밋을 동기 복제하고 Standby의 ack를 받은 뒤에야 커밋을 완료하므로, Primary가 죽어도 마지막 커밋까지 Standby에 있어 데이터 손실(RPO)이 0이다. 장애 감지 시 자동으로 Standby를 승격하고 endpoint를 전환한다. Read Replica(A)는 비동기라 지연만큼 손실 가능하고 읽기 확장용이며, Cross-Region RR(D)은 리전 DR용으로 수동 promote다.

---

**문제 2.** 운영 중 DB 읽기 부하(분석·리포트)가 폭증한다. 비용 효율적으로 읽기를 분산하려면?

A) DB 인스턴스 크기를 키운다
B) Read Replica를 추가하고 별도 endpoint로 읽기 트래픽을 분산한다
C) Multi-AZ를 활성화한다
D) Manual Snapshot을 더 자주 만든다

**정답: B**

해설: Read Replica는 비동기 복제로 읽기 전용 사본을 만들고 별도 endpoint로 노출해 읽기 부하를 분산하는 정확한 도구다. Multi-AZ(C)의 Standby는 클라이언트가 읽기조차 보낼 수 없어 읽기 분산에 전혀 도움이 안 된다. 인스턴스 크기 키우기(A)는 비용이 크고 읽기/쓰기를 분리하지 못한다. 분석·리포트처럼 약간의 복제 지연을 견디는 읽기에 Read Replica가 적합하다.

---

**문제 3.** Multi-AZ를 켰는데도 us-east-1 리전 전체 장애 때 DB가 함께 멈췄다. 리전 단위 장애까지 견디려면 무엇이 필요한가?

A) Multi-AZ를 두 번 적용
B) Cross-Region Read Replica 또는 Aurora Global Database로 다른 리전에 사본을 두고 장애 시 promote
C) 더 큰 인스턴스 타입
D) Manual Snapshot

**정답: B**

해설: Multi-AZ는 같은 리전 내 AZ 장애만 견딘다 — 동기 복제라 리전을 넘으면 지연이 커져 같은 리전에만 둔다. 리전 전체 장애에 대비하려면 다른 리전에 비동기 복제 사본(Cross-Region Read Replica)이나 Aurora Global Database를 두고, Primary 리전 장애 시 Secondary를 promote해야 한다. Aurora Global DB는 RPO<1초, RTO<1분으로 가장 빠른 리전 DR을 제공한다.

---

**문제 4.** 글로벌 사용자(아시아·미국·유럽)에게 가까운 리전에서 빠른 읽기를 제공하면서 리전 단위 DR도 필요하다. 가장 적합한 도구는?

A) RDS Multi-AZ
B) Aurora Global Database — 1 Primary + 최대 5 Secondary 리전, 스토리지 계층 복제로 RPO<1초·RTO<1분
C) 단일 리전 Read Replica 여러 개
D) DynamoDB Multi-AZ

**정답: B**

해설: Aurora Global Database는 Primary 리전의 변경을 전용 인프라로 최대 5개 Secondary 리전 스토리지에 복제해, 각 지역 사용자에게 가까운 리전에서 수십 ms 지연으로 읽기를 제공하고 동시에 리전 DR(promote 60초 이내)을 제공한다. 스토리지 계층 복제라 인스턴스 단위 복제(RDS Cross-Region RR)보다 지연과 RTO가 작다. 글로벌 읽기 + 리전 DR의 표준 답이다.

---

**문제 5.** Lambda 함수가 트래픽 폭증 시 RDS에 동시 수천 개 커넥션을 열어 DB 최대 커넥션 한도를 초과한다. 근본 해결책은?

A) RDS 인스턴스를 더 큰 타입으로 변경
B) RDS Proxy — DB 앞에 커넥션 풀을 두고 소수의 실제 커넥션을 재사용(multiplexing)
C) Multi-AZ 활성화
D) Read Replica 추가

**정답: B**

해설: Lambda는 동시 요청에 따라 함수 인스턴스가 수천 개로 폭증하고 각자 DB에 직접 커넥션을 열어 Connection Storm을 일으킨다. RDS Proxy는 DB 앞에 커넥션 풀을 둬 수천 Lambda가 와도 DB가 보는 실제 커넥션을 풀 크기로 제한하고 재사용한다. 인스턴스 키우기(A)는 Lambda 스케일을 따라잡지 못하고 커넥션 생성 오버헤드도 남아 근본 해결이 아니다. Lambda+RDS는 RDS Proxy가 사실상 필수다.

---

**문제 6.** Aurora 클러스터에서 잘못된 마이그레이션을 10분 전 상태로 가장 빠르게 되돌리려 한다. 새 인스턴스 생성 없이 같은 클러스터를 되감을 수 있는 기능은?

A) PITR(Point-in-Time Recovery)
B) Aurora Backtrack — 같은 클러스터를 설정한 윈도우 내 과거 시점으로 되감기(rewind)
C) Read Replica promote
D) Manual Snapshot 복원

**정답: B**

해설: PITR(A)은 베이스 스냅샷+로그 재생으로 임의 시점의 새 인스턴스를 만들어 수십 분이 걸린다. Aurora Backtrack은 로그 중심 스토리지 구조를 이용해 기존 클러스터 자체를 과거 시점으로 되감아 수 초~수 분 만에 끝난다. 단 Backtrack은 미리 활성화하고 되감기 윈도우를 설정해 둬야 하며, 되감으면 그 시점 이후 데이터는 사라진다. 빠른 무르기에는 Backtrack, 임의 시점의 별도 복원에는 PITR이다.

---

**문제 7.** Multi-AZ 구성인데 "읽기 부하도 분산하고 싶다"는 요구가 추가됐다. MySQL/PostgreSQL 환경에서 HA와 읽기 분산을 동시에 얻는 RDS 구성은?

A) 일반 Multi-AZ Instance만으로 충분하다
B) Multi-AZ DB Cluster — Primary 1 + Reader 2 구조로 Reader가 읽기 트래픽을 처리하고 페일오버도 35초 이하
C) Cross-Region Read Replica만 추가
D) Snapshot을 더 자주 생성

**정답: B**

해설: 일반 Multi-AZ Instance(A)의 Standby는 클라이언트 접근 불가라 읽기 분산이 안 된다. Multi-AZ DB Cluster는 Primary 1개 + Reader 2개의 3노드 구조로, 두 Reader가 읽기 트래픽을 처리해 HA와 읽기 분산을 동시에 제공하고 페일오버도 35초 이하로 더 빠르다(MySQL/PostgreSQL 전용). 일반 Multi-AZ에 Read Replica를 별도로 붙여도 되지만, DB Cluster는 이를 하나의 구성으로 통합한 것이다.

---
