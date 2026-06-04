# Day 2 - Multi-Region 복원력: DNS 라우팅·글로벌 복제·암호화 경계의 분산 원리

단일 리전 안에서 AZ를 여러 개 쓰면 데이터센터 한 동이 불타도 살아남는다. 그런데 리전 전체가 — 즉 us-east-1 같은 한 지리적 권역이 통째로 — 장애를 겪으면? 2017년 us-east-1 S3 대규모 장애, 2021년 us-east-1 Kinesis·API 장애처럼, 한 리전이 몇 시간 마비되는 사건은 드물지만 실재한다. 멀티 리전 아키텍처는 이 "리전이 통째로 사라지는" 시나리오에 대한 답이다. 하지만 리전을 넘는 순간 물리 법칙이 끼어든다 — 빛의 속도다. 서울과 버지니아 사이 왕복 지연은 200ms를 넘으니, 단일 리전 안에서 당연했던 동기 복제(밀리초 단위)가 리전 간에는 사실상 불가능해진다. 그래서 멀티 리전의 모든 설계는 "비동기 복제를 받아들이고, 그 결과인 데이터 불일치를 어떻게 다룰 것인가"로 귀결된다.

오늘은 멀티 리전을 떠받치는 네 기둥을 깊이 본다 — 트래픽을 어느 리전으로 보낼지 정하는 **Route 53 라우팅**(그리고 그 밑의 DNS·헬스 체크 메커니즘), 데이터를 리전 간 복제하는 **Aurora Global / DynamoDB Global Tables / S3 CRR**, 그리고 암호화 경계를 리전 간에 잇는 **KMS Multi-Region Key**다. DOP 시험에서 멀티 리전은 "리전 장애 시 자동 페일오버", "글로벌 사용자에게 최저 지연 제공", "리전 간 암호화 데이터 복호화" 시나리오로 나오며, 각 선택지가 active-active냐 active-passive냐, 동기냐 비동기냐를 읽어내는 게 관건이다.

## DNS는 어떻게 라우팅을 결정하는가 — Route 53의 내부

Route 53은 단순한 DNS 서버가 아니라 **헬스 체크와 정책을 결합한 글로벌 트래픽 디렉터**다. 사용자가 `api.example.com`을 물으면, Route 53은 설정된 라우팅 정책에 따라 어느 IP/엔드포인트를 응답할지 동적으로 결정한다. 그 밑에는 두 메커니즘이 깔려 있다 — DNS 자체(이름→주소 해석)와 헬스 체크(엔드포인트가 살아 있는지 주기 점검).

| 정책 | 결정 기준 | 대표 용도 |
|------|-----------|-----------|
| **Simple** | 단일 레코드 반환 | 페일오버 없는 단순 매핑 |
| **Weighted** | 가중치 비율로 분배 | Canary 배포, A/B 테스트 |
| **Latency** | 사용자에게 지연 최저 리전 | 글로벌 성능 최적화 |
| **Failover** | Primary, 실패 시 Secondary | Active-Passive DR |
| **Geolocation** | 사용자의 국가/대륙 | 데이터 주권, 지역 콘텐츠 |
| **Geoproximity** | 지리 + bias 조정(Traffic Flow 필요) | 트래픽 미세 조정 |
| **Multi-Value Answer** | 헬스 체크 통과한 여러 IP 반환 | 단순 클라이언트 측 분산 |
| **IP-based**(2023+) | 사용자 IP 블록 매핑 | ISP/CDN 최적화 |

> 💡 **관련 이론**: Route 53의 라우팅은 본질적으로 **DNS 기반 글로벌 서버 로드 밸런싱(GSLB)**이다. DNS는 RFC 1034/1035(1987)로 정의된 분산 계층 데이터베이스인데, 원래 정적 이름 해석용이었다. GSLB는 여기에 "응답을 클라이언트 위치·서버 건강에 따라 동적으로 바꾼다"는 발상을 더한 것이다. 단, DNS 라우팅에는 근본 한계가 있다 — **DNS는 캐시된다.** 리졸버·OS·브라우저가 응답을 TTL 동안 캐시하므로, 페일오버를 지시해도 캐시가 만료될 때까지 옛 답이 살아 있다. 이것이 Latency·Failover 라우팅의 페일오버가 "즉각"이 아닌 이유다. 즉각적 리전 전환이 필요하면 DNS가 아니라 **고정 anycast IP를 쓰는 Global Accelerator**가 답이다(아래 비교).

> 🔍 **더 깊이**: Route 53의 헬스 체크는 단순 ping이 아니라 **전 세계 여러 위치(checker)에서 동시에 점검**하고 정족수로 판정한다 — 한 checker만 실패로 보면 일시적 네트워크 문제로 오판할 수 있어, 18% 이상의 checker가 정상이라고 봐야 healthy로 친다(글로벌 합의로 false positive 방지). 헬스 체크에는 세 종류가 있다. **Endpoint** 체크(HTTP/HTTPS/TCP로 직접 찌름), **Calculated** 체크(여러 헬스 체크를 AND/OR로 조합 — "DB와 캐시가 둘 다 살아야 healthy" 같은 복합 조건), **CloudWatch Alarm 기반** 체크(지표 알람을 헬스로 변환 — 엔드포인트를 직접 못 찌르는 내부 리소스나 복합 지표용)다. 이 조합으로 "엔드포인트는 200을 주지만 실제론 망가진" 상태까지 잡아낼 수 있다.

## Active-Active와 Active-Passive — 멀티 리전의 두 모드

멀티 리전은 크게 두 운영 모드로 갈린다. **Active-Passive**는 한 리전(Primary)만 트래픽을 받고 다른 리전(Secondary)은 대기하다가 장애 시 승격된다(Route 53 Failover Routing + 헬스 체크가 전형). **Active-Active**는 두 리전이 동시에 트래픽을 처리한다(Route 53 Latency Routing + 양방향 복제). Active-Active는 RTO가 0에 가깝지만(이미 둘 다 살아 있으니 트래픽만 시프트), 양방향 쓰기로 인한 **데이터 충돌(conflict)** 문제를 풀어야 한다.

```
Active-Active (Latency Routing)
==================================================
  Users (Global)
       │
       ▼
  Route 53 Latency Routing + Health Check
       │
       ├─► Region A (ap-northeast-2)  ── 동시 트래픽
       │     ALB → ECS/Lambda
       │     Aurora Global writer / DDB Global Table
       │
       └─► Region B (us-east-1)        ── 동시 트래픽
             ALB → ECS/Lambda
             Aurora Global secondary / DDB Global Table

  Cross-Region 데이터 계층:
   ├─ Aurora Global   : 비동기 <1초 (단일 writer)
   ├─ DDB Global Tables: multi-master, LWW 충돌 해결
   ├─ S3 CRR          : 비동기 객체 복제
   └─ KMS Multi-Region Key: 암호화 경계 연결
```

## Aurora Global Database — 단일 Writer의 비동기 글로벌 복제

Aurora Global은 한 Primary 리전과 최대 5개 Secondary 리전을 묶는다. 핵심은 **쓰기는 오직 Primary 리전에서만** 일어나고, Secondary는 읽기 전용이라는 점이다(단일 writer). 복제는 비동기지만, AWS의 전용 인프라(스토리지 계층 복제)를 통해 보통 **1초 미만 지연**으로 따라온다.

리전 장애 시에는 Secondary를 **standalone primary로 promote**한다(보통 1분 내). 주의할 점은, 페일오버 후 다시 글로벌 구성으로 복귀하려면 옛 Primary가 회복된 뒤 새 Secondary로 재구성해야 한다는 것이다 — 자동으로 양방향이 되지 않는다.

> 💡 **관련 이론**: Aurora Global이 "단일 writer + 읽기 전용 secondary"를 고수하는 이유는 **분산 쓰기 충돌을 원천 차단**하기 위해서다. 여러 리전이 동시에 같은 행을 쓰면 충돌 해결 로직이 필요한데, 관계형 DB의 트랜잭션·외래키·제약조건과 충돌 해결을 양립시키는 건 매우 어렵다(분산 합의 비용). 그래서 Aurora Global은 "쓰기는 한 곳, 읽기는 여러 곳"이라는 **단일 리더 복제(single-leader replication)** 모델을 택해 일관성을 단순하게 유지한다. 반대 극단이 DynamoDB Global Tables의 **다중 리더(multi-leader)**다. 단일 리더는 일관성이 쉽지만 쓰기 가용성이 Primary에 묶이고, 다중 리더는 어디서나 쓰지만 충돌을 다뤄야 한다 — 이 트레이드오프가 두 서비스 선택의 본질이다.

## DynamoDB Global Tables — 진짜 멀티 마스터와 LWW

DynamoDB Global Tables는 Aurora Global과 정반대다. **모든 리전이 읽고 쓸 수 있는 진정한 멀티 마스터(multi-master)**다. 한 리전에 쓰면 자동으로 다른 모든 리전에 양방향 복제된다(보통 1초 내). 어디서든 쓸 수 있으니 쓰기 가용성이 높지만, 두 리전이 거의 동시에 같은 항목을 다르게 쓰면 충돌이 난다. DynamoDB는 이를 **Last Write Wins(LWW)** — 타임스탬프가 더 늦은 쓰기가 이긴다 — 로 해결한다.

> 🔍 **더 깊이**: LWW는 충돌 해결의 가장 단순한 전략이지만 위험을 품는다. "더 늦은 쓰기가 이긴다"의 '늦음'은 **벽시계 시각(wall-clock timestamp)** 기준인데, 분산 시스템에서 서로 다른 노드의 시계는 완벽히 동기화되지 않는다(clock skew). 시계가 어긋나면 실제로는 먼저 일어난 쓰기가 타임스탬프상 '나중'으로 찍혀 이길 수 있고, 그러면 **조용한 쓰기 손실(silent lost update)**이 발생한다. 이 한계 때문에 분산 시스템 이론에서는 **벡터 클럭(vector clock)**(Lamport의 논리 시계 확장)이나 **CRDT(Conflict-free Replicated Data Type)** 같은 더 정교한 충돌 해결을 쓴다 — 시계에 의존하지 않고 인과관계(causality)로 충돌을 병합한다. DynamoDB가 LWW를 택한 건 단순성·성능 때문이며, 그래서 Global Tables에서 "같은 키를 여러 리전에서 동시 갱신"하는 패턴은 안티패턴이다. 키를 리전별로 파티셔닝하거나, 충돌 가능성이 낮은 워크로드에 써야 한다.

> 📚 **사례**: 원조 Amazon Dynamo 논문(DeCandia et al., SOSP 2007)은 쇼핑 카트 충돌을 다룰 때 LWW가 아니라 **양쪽 버전을 모두 보존**해 애플리케이션이 병합하게 했다 — 카트에서는 "추가된 항목을 잃지 않는 것"이 "최신 상태"보다 중요했기 때문이다(삭제보다 추가를 우선). 이는 "충돌 해결은 도메인 지식이 필요하다"는 교훈을 준다. 교훈: LWW는 만능이 아니며, 데이터의 의미에 따라 "마지막이 이긴다"가 데이터 손실이 될 수 있으니, 멀티 마스터를 쓸 땐 충돌 시나리오를 반드시 따져야 한다.

| 항목 | Aurora Global | DynamoDB Global Tables |
|------|---------------|------------------------|
| 쓰기 모델 | 단일 리더(Primary만 쓰기) | 멀티 마스터(모든 리전 쓰기) |
| 충돌 | 없음(쓰기 한 곳) | LWW로 해결 |
| 일관성 | secondary는 eventual read | eventual(리전 간) |
| 페일오버 | secondary promote(~1분) | 본질적 분산, 페일오버 개념 약함 |
| 데이터 모델 | 관계형(SQL) | 키-값/문서(NoSQL) |
| CAP 위치 | CP에 가까움(단일 리더) | AP(가용성·지연 우선) |

## S3 Cross-Region Replication — 객체의 비동기 복제

S3 CRR(Cross-Region Replication)은 한 버킷의 객체를 다른 리전 버킷으로 자동 비동기 복제한다. **양쪽 버킷 모두 버전 관리(versioning) 활성이 필수**다 — 버전 ID가 복제 추적의 키이기 때문이다. 복제는 기본 단방향이고, 양방향(bi-directional)이 필요하면 양쪽에 CRR을 교차 설정한다. 복제 역할(IAM Role)은 소스 버킷 read + 대상 버킷 write 권한을 가진다.

- **RTC(Replication Time Control)**: 99.99%의 객체를 15분 내 복제 보장(SLA). 일반 CRR은 best-effort.
- **복제 대상 제어**: prefix·태그로 일부만 복제, 다른 스토리지 클래스로 복제, 다른 계정으로 복제 가능.
- **기존 객체**: CRR은 기본적으로 설정 이후 새 객체만 복제한다(기존 객체는 S3 Batch Replication 필요).

> ⚠️ **함정**: CRR은 **버전 관리가 켜진 시점 이후의 새 객체만** 복제한다는 점이 자주 함정으로 나온다. "CRR을 켰는데 기존 객체가 대상 버킷에 안 보인다"는 버그가 아니라 설계다 — 기존 객체를 복제하려면 S3 Batch Operations(Batch Replication)를 따로 돌려야 한다. 또 하나, 삭제 마커(delete marker) 복제 여부는 설정 옵션이며, 기본적으로 한 리전에서 삭제해도 다른 리전 객체는 보존될 수 있다.

## KMS Multi-Region Key — 암호화 경계를 리전 간에 잇다

멀티 리전 데이터의 숨은 함정이 암호화다. S3 CRR로 암호화된 객체를 다른 리전에 복제하거나, Aurora Global·DDB Global Tables가 리전 간 데이터를 복제할 때, **암호화에 쓴 KMS 키가 그 리전에 없으면 복호화할 수 없다.** 일반 KMS 키(single-region)는 리전에 갇혀 있어 다른 리전에서 쓸 수 없다.

**Multi-Region Key(MRK)**가 이 문제를 푼다. 한 리전에 Primary MRK를 만들고 다른 리전에 Replica MRK를 복제하면, 이들은 **같은 키 자료(key material)와 같은 키 ID(mrk- 접두)**를 공유한다. 그래서 리전 A에서 MRK로 암호화한 데이터를 리전 B의 Replica MRK로 복호화할 수 있다 — 암호문이 리전 경계를 넘어도 유효하다.

```bash
aws kms create-key --multi-region   # Primary MRK 생성
aws kms replicate-key --key-id mrk-abc --replica-region us-east-1  # Replica 복제
```

> 💡 **관련 이론**: MRK가 "같은 키 자료를 여러 리전이 공유"하는 것은 암호학적으로 미묘한 결정이다. 일반적으로 키는 한 곳에 가두는 게 안전한데(키 노출 표면 최소화), MRK는 의도적으로 키 자료를 복제해 **암호문의 리전 이식성(portability)**을 얻는다 — 대신 키 정책·grant·접근 제어는 각 리전에서 독립적으로 관리된다(키 자료는 같지만 권한은 리전별). 이는 "**봉투 암호화(envelope encryption)**"와 결합해 동작한다 — 데이터는 데이터 키(DEK)로 암호화하고, DEK를 KMS 키(KEK)로 암호화한다. MRK는 KEK 계층을 리전 간 공유 가능하게 만들어, 복제된 암호문에 딸려 온 암호화된 DEK를 대상 리전에서 풀 수 있게 한다. 시험에서 "리전 간 복제 데이터를 다른 리전에서 복호화 불가"의 답은 거의 항상 "MRK 미사용" 또는 "키 정책 권한 부재"다.

## Global Accelerator vs CloudFront — DNS를 우회하는 두 갈래

Route 53 DNS 라우팅의 한계(캐시 TTL로 인한 느린 페일오버)를 우회하는 두 서비스가 있고, 둘은 목적이 다르다.

| 항목 | Global Accelerator | CloudFront |
|------|---------------------|------------|
| 프로토콜 | TCP/UDP(L4) | HTTP/HTTPS(L7) |
| IP | 고정 anycast IP 2개 | 동적 엣지 IP |
| 캐싱 | 없음(프록시/라우팅) | 강력(콘텐츠 캐시) |
| 페일오버 | 헬스 체크 기반 즉각(DNS 캐시 무관) | Origin Failover |
| 대표 용도 | 게임, IoT, VoIP, 비-HTTP | 웹/정적 콘텐츠 배포 |

> 🔍 **더 깊이**: Global Accelerator가 즉각 페일오버를 내는 비결이 **anycast**다. anycast는 같은 IP 주소를 전 세계 여러 엣지 위치에서 동시에 광고(BGP)하는 라우팅 기법으로, 사용자 패킷은 네트워크상 가장 가까운 엣지로 자동 라우팅된다. 클라이언트는 항상 고정된 2개 IP만 알면 되고, 백엔드 리전이 죽으면 GA가 트래픽을 건강한 리전으로 즉시 재라우팅한다 — 클라이언트의 DNS 캐시와 무관하다(IP는 안 바뀌므로). 반면 Route 53은 페일오버 시 응답하는 IP 자체를 바꾸므로 DNS 캐시 TTL만큼 늦다. "비-HTTP에서 즉각적 리전 페일오버"는 GA, "정적 콘텐츠 글로벌 캐싱"은 CloudFront, "단순 가중 분산/지연 라우팅"은 Route 53으로 읽으면 된다.

## Route 53 ARC — DR 페일오버를 안전하게 코드로

페일오버를 헬스 체크 자동에만 맡기면, 헬스 체크가 오판하거나 부분 장애 시 잘못된 페일오버가 일어날 수 있다. **Route 53 Application Recovery Controller(ARC)**는 페일오버를 **명시적 컨트롤(Routing Control)**로 다룬다 — 운영자나 자동화가 "지금 리전 B로 트래픽을 돌려라"를 코드/API로 안전하게 토글한다. 동시에 **Readiness Check**로 "Secondary 리전이 정말 트래픽을 받을 준비가 됐는가"(용량, 구성, 복제 상태)를 지속 점검한다.

> 💡 **관련 이론**: ARC의 핵심 가치는 **DR drill을 안전하게**(검증된 페일오버) 만드는 것이다. DR 계획의 고질적 문제는 "평소에 검증 안 된 페일오버는 정작 장애 때 실패한다"는 것이다(미사용 코드 경로의 부패). ARC Routing Control은 5개의 독립된 리전 데이터 플레인에 분산돼 있어, 메인 컨트롤 플레인이 장애여도 페일오버를 토글할 수 있다(컨트롤 플레인과 데이터 플레인의 분리 — 장애 시 의존하는 시스템이 적을수록 좋다는 "static stability" 원칙). 이는 AWS Well-Architected의 "복구 절차를 정기적으로 테스트하라"를 제품화한 것이다. 이 페일오버를 FIS 카오스 실험으로 정기 검증하는 패턴은 Day 4에서 본다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **멀티 리전은 빛의 속도라는 물리 한계 때문에 비동기 복제를 받아들여야** 하고, 그 결과인 데이터 불일치·충돌을 다루는 게 핵심이다. 둘째, **Route 53은 DNS 기반 GSLB**로 7종 정책과 정족수 헬스 체크를 결합하지만 DNS 캐시 TTL이라는 근본 지연이 있어, 즉각 페일오버는 anycast 기반 Global Accelerator가 맡는다. 셋째, **데이터 복제는 단일 리더(Aurora Global, 충돌 없음)와 멀티 마스터(DDB Global Tables, LWW)의 트레이드오프**이며, LWW는 clock skew로 silent lost update 위험을 품는다. 넷째, **KMS Multi-Region Key가 암호화 경계를 리전 간에 이어** 복제된 암호문을 다른 리전에서 복호화 가능하게 하고, Route 53 ARC가 페일오버를 안전한 코드로 만든다.

다음 글에서는 이 멀티 리전 빌딩블록들을 조합한 **DR 4종 전략 — Backup & Restore, Pilot Light, Warm Standby, Active-Active의 RTO/RPO/비용 트레이드오프**를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 전 세계 사용자에게 각자 지연이 가장 낮은 리전으로 트래픽을 보내면서, 리전 장애 시 자동으로 건강한 리전만 응답하게 하려 한다. 가장 적합한 Route 53 구성은?

A) Simple Routing

B) Latency-based Routing + 각 레코드에 헬스 체크 연결

C) Weighted Routing 고정 50:50

D) Geolocation Routing만

**정답: B**

해설: Latency-based Routing은 측정된 네트워크 지연을 기준으로 사용자에게 가장 빠른 리전을 응답해 글로벌 성능을 최적화한다. 여기에 각 레코드에 헬스 체크를 연결하면 장애 리전은 응답 후보에서 자동 제외돼, 성능 최적화와 자동 페일오버를 동시에 얻는다. Simple(A)은 단일 레코드라 분산·페일오버가 없고, 고정 Weighted(C)는 지연을 고려하지 않으며, Geolocation(D)은 지리 기반이라 같은 대륙 내 더 빠른 리전 선택을 못 한다. 단, DNS 캐시 TTL 때문에 페일오버는 즉각이 아님에 유의.

---

**문제 2.** DynamoDB Global Tables에서 두 리전이 거의 동시에 같은 항목을 다르게 갱신한다. 충돌은 어떻게 해결되며 어떤 위험이 있는가?

A) 트랜잭션 롤백으로 둘 다 취소된다

B) Last Write Wins(타임스탬프가 늦은 쓰기가 이김)로 해결되며, 노드 간 clock skew로 실제 나중 쓰기가 져서 silent lost update가 날 수 있다

C) 첫 번째 쓰기가 항상 이긴다

D) 사용자에게 충돌 오류를 반환한다

**정답: B**

해설: DynamoDB Global Tables는 멀티 마스터로, 충돌을 Last Write Wins(LWW) — 더 늦은 벽시계 타임스탬프가 이김 — 로 해결한다. 그런데 분산 노드의 시계는 완벽히 동기화되지 않아(clock skew), 실제로 먼저 일어난 쓰기가 타임스탬프상 '나중'으로 찍혀 이기면 진짜 최신 쓰기가 조용히 사라지는 silent lost update가 발생할 수 있다. 그래서 "같은 키를 여러 리전에서 동시 갱신"은 안티패턴이다. 원조 Dynamo 논문은 카트에서 LWW 대신 양쪽 버전 보존을 택했는데, 이는 충돌 해결이 도메인 지식을 요구함을 보여준다. 롤백(A)·선쓰기 승리(C)·충돌 오류(D)는 DDB의 동작이 아니다.

---

**문제 3.** Aurora Global Database가 리전 간 쓰기 충돌 문제를 아예 겪지 않는 근본 이유는?

A) 모든 리전이 동기 복제되어서

B) 쓰기는 오직 Primary 리전에서만 일어나는 단일 리더 모델이라 충돌 자체가 발생하지 않음(secondary는 읽기 전용)

C) Aurora가 충돌을 자동 병합해서

D) 리전이 하나뿐이라서

**정답: B**

해설: Aurora Global은 단일 리더(single-leader) 복제 모델로, 쓰기는 Primary 리전에서만 일어나고 최대 5개 Secondary 리전은 읽기 전용이다. 쓰기 지점이 하나뿐이므로 리전 간 쓰기 충돌이 원천적으로 발생하지 않는다 — 관계형 DB의 트랜잭션·제약조건과 충돌 해결을 양립시키는 어려움을 회피하는 설계다. 복제는 동기가 아니라 비동기 <1초(A 틀림)이고, 충돌을 병합(C)하는 게 아니라 충돌이 안 생기게 막는 것이며, 리전은 여럿이다(D 틀림). 반대 극단이 DDB Global Tables의 멀티 마스터다.

---

**문제 4.** S3 객체를 KMS로 암호화한 뒤 CRR로 다른 리전에 복제했는데, 대상 리전에서 객체를 복호화할 수 없다. 원인과 해법은?

A) CRR이 암호화를 지원하지 않는다

B) 암호화에 single-region KMS 키를 써서 대상 리전에 키가 없다 — KMS Multi-Region Key(MRK)로 키를 양 리전에 복제해야 함

C) 버전 관리가 꺼져 있다

D) S3는 리전 간 암호화 데이터를 지원하지 않는다

**정답: B**

해설: 일반 KMS 키는 한 리전에 갇혀 있어 다른 리전에서 쓸 수 없다. 암호화된 객체를 다른 리전에 복제해도 그 리전에 같은 키가 없으면 복호화가 불가능하다. KMS Multi-Region Key는 같은 키 자료와 키 ID(mrk-)를 여러 리전에 공유해, 한 리전에서 암호화한 데이터를 다른 리전의 Replica MRK로 복호화할 수 있게 한다(봉투 암호화의 KEK 계층을 리전 간 공유). CRR은 암호화를 지원하고(A 틀림), 버전 관리는 CRR 전제조건이지 복호화 실패 원인이 아니며(C), S3는 리전 간 암호화 데이터를 지원한다(D 틀림).

---

**문제 5.** 비-HTTP(게임용 UDP) 트래픽에서, 백엔드 리전 장애 시 클라이언트의 DNS 캐시와 무관하게 즉각적으로 건강한 리전으로 페일오버하려 한다. 가장 적합한 것은?

A) Route 53 Failover Routing(TTL을 짧게)

B) AWS Global Accelerator — 고정 anycast IP 2개 + 헬스 체크 기반 즉각 재라우팅(DNS 캐시 무관)

C) CloudFront

D) Route 53 Latency Routing

**정답: B**

해설: Route 53 기반 페일오버는 응답 IP 자체를 바꾸므로 클라이언트 DNS 캐시 TTL만큼 지연이 불가피하다(A·D 한계). Global Accelerator는 전 세계에 anycast로 광고되는 고정 IP 2개를 제공하고, 백엔드 리전이 죽으면 헬스 체크 기반으로 트래픽을 건강한 리전으로 즉시 재라우팅한다 — IP가 안 바뀌므로 클라이언트 DNS 캐시와 무관하게 페일오버가 즉각적이다. 게다가 TCP/UDP(L4)를 지원해 비-HTTP에 맞다. CloudFront(C)는 HTTP/HTTPS 콘텐츠 캐싱용이라 UDP 게임 트래픽에 부적합하다.

---

**문제 6.** Route 53 헬스 체크가 일시적 네트워크 글리치로 인한 false positive(멀쩡한데 실패로 오판)를 줄이는 메커니즘은?

A) 단일 위치에서 1회만 점검

B) 전 세계 여러 checker가 동시 점검하고 정족수(약 18% 이상 정상) 합의로 healthy를 판정

C) 사용자 트래픽으로만 판정

D) DNS TTL을 늘려서

**정답: B**

해설: Route 53 헬스 체크는 단일 ping이 아니라 전 세계 여러 checker 위치에서 동시에 점검하고, 일정 비율(약 18%) 이상의 checker가 정상이라고 봐야 healthy로 판정한다. 이 글로벌 정족수 합의가 한 checker의 일시적 네트워크 문제로 인한 false positive를 막는다. 추가로 Calculated 체크(여러 체크 AND/OR 조합)나 CloudWatch Alarm 기반 체크로 복합 조건도 표현한다. 단일 점검(A)·사용자 트래픽 판정(C)·TTL 조정(D)은 헬스 체크의 오판 방지 메커니즘이 아니다.

---

**문제 7.** DR 페일오버 절차를 평소에 안전하게 검증하고, 메인 컨트롤 플레인이 장애여도 페일오버를 토글할 수 있게 하려 한다. 가장 적합한 것은?

A) Route 53 레코드를 수동으로 직접 편집

B) Route 53 Application Recovery Controller(ARC) — Routing Control로 명시적 토글 + Readiness Check로 준비 상태 점검, 5개 리전 데이터 플레인 분산으로 static stability 확보

C) Lambda로 매번 DNS를 다시 작성

D) CloudFront Origin Failover

**정답: B**

해설: Route 53 ARC는 페일오버를 헬스 체크 자동에만 맡기지 않고 명시적 Routing Control로 토글하며, Readiness Check로 Secondary 리전의 용량·구성·복제 준비 상태를 지속 점검해 DR drill을 안전하게 만든다. 핵심은 ARC의 데이터 플레인이 5개 리전에 분산돼 있어 메인 컨트롤 플레인이 장애여도 페일오버를 실행할 수 있다는 점이다(컨트롤/데이터 플레인 분리, static stability 원칙 — 장애 시 의존 시스템이 적을수록 안전). 수동 편집(A)이나 매번 재작성(C)은 검증·안전성이 없고, CloudFront Origin Failover(D)는 HTTP origin 수준의 페일오버라 범용 DR 토글이 아니다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 멀티 리전은 빛의 속도라는 물리 한계로 비동기 복제를 받아들여야 하며 그 결과인 충돌·불일치를 다루는 게 본질이다. 둘째, Route 53은 DNS 기반 GSLB로 7종 라우팅 정책과 정족수 헬스 체크(여러 checker 합의로 false positive 방지)를 결합하지만 DNS 캐시 TTL이라는 지연 한계가 있어, 즉각 페일오버는 anycast 고정 IP 기반 Global Accelerator가 맡는다(CloudFront는 HTTP 콘텐츠 캐싱). 셋째, 데이터 복제는 단일 리더(Aurora Global, 쓰기 한 곳이라 충돌 없음, secondary promote ~1분)와 멀티 마스터(DynamoDB Global Tables, LWW 충돌 해결)의 트레이드오프이며 LWW는 clock skew로 silent lost update 위험을 품는다. 넷째, KMS Multi-Region Key가 같은 키 자료를 리전 간 공유해 복제 암호문의 리전 이식성을 주고(봉투 암호화 KEK 공유), S3 CRR은 버전 관리 필수·새 객체만 복제이며, Route 53 ARC가 컨트롤/데이터 플레인 분리로 안전한 DR 페일오버 토글을 제공한다.
