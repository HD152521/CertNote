# Day 2 - 멀티 리전 복원력: DNS 라우팅, 글로벌 복제, 암호화 경계의 분산 시스템 원리

단일 리전 안에서 여러 AZ를 쓰면 데이터센터 하나가 불타도 살아남는다. 그러나 us-east-1 같은 리전 전체가 무너지면 어떻게 되는가. 2017년 us-east-1의 대규모 S3 장애, 2021년 us-east-1의 Kinesis/API 장애처럼 드물지만 실제로 일어난다. 멀티 리전 아키텍처는 "리전 전체가 사라지는" 시나리오에 대한 답이다. 하지만 리전을 넘는 순간 물리 법칙, 즉 빛의 속도가 끼어든다. 서울과 버지니아 사이의 왕복 지연은 200ms를 넘으므로, 단일 리전에서는 밀리초 단위로 가능했던 동기 복제가 리전 간에는 사실상 불가능하다. 그래서 모든 멀티 리전 설계는 "비동기 복제를 받아들이고, 그 결과로 생기는 데이터 불일치를 어떻게 다룰지 정하는 것"으로 귀결된다.

오늘은 멀티 리전을 떠받치는 네 기둥을 본다. 트래픽을 어느 리전으로 보낼지 정하는 **Route 53 라우팅**(그 밑의 DNS와 헬스 체크 메커니즘 포함), 데이터를 리전 간에 복제하는 **Aurora Global / DynamoDB Global Tables / S3 CRR**, 암호화 경계를 잇는 **KMS Multi-Region Key**다. 멀티 리전은 DOP 시험에서 "리전 장애 시 자동 페일오버", "전 세계 사용자에게 최저 지연", "리전 간에 복제된 암호화 데이터 복호화" 같은 형태로 나온다. 핵심 역량은 각 선택지가 Active-Active인지 Active-Passive인지, 동기인지 비동기인지를 읽어내는 것이다.

## DNS는 어떻게 라우팅을 결정하는가 — Route 53의 내부

Route 53은 단순한 DNS 서버가 아니라 **헬스 체크와 정책을 결합한 글로벌 트래픽 지휘자**다. 사용자가 `api.example.com`을 조회하면 Route 53은 설정된 라우팅 정책에 따라 어떤 IP/엔드포인트를 돌려줄지 동적으로 결정한다. 그 밑에는 두 가지 메커니즘이 있다. DNS 자체(이름→주소 변환)와 헬스 체크(엔드포인트가 살아 있는지 주기적으로 확인)다.

| 정책 | 결정 기준 | 대표 용도 |
|--------|--------|-----------|
| **Simple** | 단일 레코드 반환 | 페일오버 없는 단순 매핑 |
| **Weighted** | 가중치 비율로 분산 | 카나리 배포, A/B 테스트 |
| **Latency** | 사용자에게 지연이 가장 낮은 리전 | 글로벌 성능 최적화 |
| **Failover** | Primary, 장애 시 Secondary | Active-Passive DR |
| **Geolocation** | 사용자의 국가/대륙 | 데이터 주권, 지역별 콘텐츠 |
| **Geoproximity** | 지리 + 바이어스 조정(Traffic Flow 필요) | 세밀한 트래픽 제어 |
| **Multi-Value Answer** | 헬스 체크를 통과한 여러 IP 반환 | 단순한 클라이언트 측 분산 |
| **IP-based** (2023+) | 사용자 IP 대역 매핑 | ISP/CDN 최적화 |

> 💡 **관련 이론**: Route 53 라우팅은 본질적으로 **DNS 기반 글로벌 서버 로드 밸런싱(GSLB, Global Server Load Balancing)**이다. RFC 1034/1035(1987)에 정의된 DNS는 정적인 이름 해석을 위한 분산 계층형 데이터베이스였다. GSLB는 여기에 "클라이언트 위치와 서버 상태에 따라 응답을 동적으로 바꾼다"를 더한다. 그러나 DNS 라우팅에는 근본적 한계가 있다. **DNS는 캐시된다.** 리졸버, OS, 브라우저가 TTL 동안 응답을 캐시하므로, 페일오버 신호가 나가도 캐시가 만료될 때까지 옛 답이 살아 있다. Latency/Failover 라우팅의 페일오버가 "즉시"가 아닌 이유다. 즉각적인 리전 전환의 답은 DNS가 아니라 **고정 anycast IP를 쓰는 Global Accelerator**다(아래에서 비교한다).

> Route 53의 헬스 체크는 단순한 핑이 아니라 **전 세계 여러 위치(checker)에서 동시에 확인하고 쿼럼으로 판정**한다. checker 하나에만 의존하면 일시적인 네트워크 문제를 장애로 오판할 수 있으므로, checker의 18% 이상이 정상으로 보고해야 정상으로 판정한다(글로벌 합의로 오탐을 막는다). 유형은 세 가지다. **Endpoint** 체크(HTTP/HTTPS/TCP 직접 프로브), **Calculated** 체크(여러 체크를 AND/OR로 결합 — "데이터베이스와 캐시가 모두 살아 있어야 정상"), **CloudWatch Alarm 기반** 체크(메트릭 경보를 헬스로 변환 — 직접 프로브할 수 없는 리소스나 복합 메트릭용)다. 이 조합으로 "엔드포인트는 200을 반환하지만 실제로는 고장 난" 상태를 잡을 수 있다.

## Active-Active와 Active-Passive — 멀티 리전의 두 운영 모드

멀티 리전은 두 가지 운영 모드로 나뉜다. **Active-Passive**는 한 리전(Primary)만 트래픽을 받고 나머지(Secondary)는 대기하다가 장애 시 승격한다(대표: Route 53 Failover 라우팅 + 헬스 체크). **Active-Active**는 두 리전이 동시에 트래픽을 처리한다(대표: Route 53 Latency 라우팅 + 양방향 복제). Active-Active는 RTO=0에 가깝지만(둘 다 이미 실행 중이므로 트래픽만 옮기면 된다), 양방향 쓰기에서 생기는 **데이터 충돌**을 해결해야 한다.

```
Active-Active (Latency Routing)
==================================================
  Users (Global)
       │
       ▼
  Route 53 Latency Routing + Health Check
       │
       ├─► Region A (ap-northeast-2)  ── Simultaneous traffic
       │     ALB → ECS/Lambda
       │     Aurora Global writer / DDB Global Table
       │
       └─► Region B (us-east-1)        ── Simultaneous traffic
             ALB → ECS/Lambda
             Aurora Global secondary / DDB Global Table

  Cross-Region data layer:
   ├─ Aurora Global   : Async <1s (single writer)
   ├─ DDB Global Tables: Multi-master, LWW conflict resolution
   ├─ S3 CRR          : Async object replication
   └─ KMS Multi-Region Key: Encryption boundary bridging
```

## Aurora Global Database — 단일 Writer 비동기 글로벌 복제

Aurora Global은 Primary 리전 하나와 최대 5개의 Secondary 리전을 묶는다. 핵심은 **쓰기는 Primary 리전에서만 일어나고** Secondary는 읽기 전용(단일 Writer)이라는 점이다. 복제는 비동기이지만, AWS의 프라이빗 인프라(스토리지 계층 복제)를 타므로 보통 **1초 미만의 지연**을 달성한다.

리전 장애가 나면 Secondary를 **독립 Primary로 승격**한다(보통 1분 이내). 주의할 점은 페일오버 후 다시 글로벌 구성으로 돌아가려면 옛 Primary가 복구되기를 기다린 뒤 새 Secondary로 재구성해야 한다는 것이다. 양방향으로 자동 복귀하지 않는다.

> Aurora Global이 "단일 Writer + 읽기 전용 Secondary"를 고집하는 것은 **분산 쓰기 충돌을 구조적으로 없애기** 위해서다. 여러 리전이 같은 행에 동시에 쓰면 충돌 해결 로직이 필요한데, 트랜잭션·외래 키·제약 조건의 의미를 충돌 해결과 맞추는 일은 어렵다(분산 합의 비용). 그래서 Aurora Global은 "쓰기는 한 곳, 읽기는 어디서나"인 **단일 리더 복제(single-leader replication)** 모델을 택해 일관성을 단순하게 유지한다. 반대편 극단이 DynamoDB Global Tables의 **다중 리더(multi-leader)**다. 단일 리더는 일관성이 쉽지만 쓰기 가용성이 Primary에 묶이고, 다중 리더는 어디서든 쓸 수 있지만 충돌을 처리해야 한다. 이 트레이드오프가 두 서비스 중 하나를 고르는 일의 본질이다.

## DynamoDB Global Tables — 진짜 멀티 마스터와 Last-Write-Wins

DynamoDB Global Tables는 Aurora Global의 반대다. **모든 리전이 진짜 멀티 마스터로 읽고 쓸 수 있다.** 한 리전에 쓰면 다른 모든 리전으로 양방향 자동 복제된다(보통 1초 미만). 어디서든 쓸 수 있어 쓰기 가용성이 높지만, 두 리전이 거의 동시에 같은 아이템을 갱신하면 충돌이 생긴다. DynamoDB는 이를 **Last Write Wins(LWW)**로 해결한다. 타임스탬프가 더 늦은 쓰기가 이긴다.

> LWW는 가장 단순한 충돌 해결 전략이지만 위험이 있다. "마지막 쓰기가 이긴다"의 "마지막"은 **벽시계 타임스탬프**로 판정하는데, 분산 시스템에서 노드마다 시계는 완벽하게 맞지 않는다(clock skew). 시계가 어긋나면 실제로 먼저 일어난 쓰기가 "더 늦은" 타임스탬프를 받아 이길 수 있고, 그 결과 **조용한 갱신 손실(silent lost update)**이 생긴다. 이 한계 때문에 분산 시스템 이론은 **벡터 시계(vector clock)**(Lamport 논리 시계의 확장)나 **CRDT(Conflict-free Replicated Data Type)**처럼 더 정교한 해결책을 쓴다. 시계가 아니라 인과 관계로 충돌을 병합한다. DynamoDB는 단순성과 성능을 위해 LWW를 택했으므로 "여러 리전에서 같은 키를 동시에 갱신"하는 것은 안티패턴이다. 파티션 키를 리전별로 나누거나 충돌이 적은 워크로드에 쓴다.

> 원조 Amazon Dynamo 논문(DeCandia et al., SOSP 2007)은 장바구니 충돌을 LWW가 아니라 **두 버전을 모두 보존**해 애플리케이션이 병합하도록 처리했다. 장바구니에서는 "최신 상태"보다 "담은 상품을 잃지 않는 것"이 중요했기 때문이다. 여기서 "충돌 해결에는 도메인 지식이 필요하다"는 교훈을 얻는다. LWW는 만능이 아니며, 데이터 의미에 따라 "마지막이 이긴다"는 곧 데이터 손실일 수 있다. 그래서 멀티 마스터는 충돌 시나리오를 엄밀히 검토해야 한다.

| 항목 | Aurora Global | DynamoDB Global Tables |
|------|---------------|------------------------|
| 쓰기 모델 | 단일 리더 (Primary만) | 멀티 마스터 (모든 리전에서 쓰기) |
| 충돌 | 없음 (쓰기는 한 곳) | LWW로 해결 |
| 일관성 | Secondary는 최종적 일관성 읽기 | 최종적 일관성 (리전 간) |
| 페일오버 | Secondary 승격 (약 1분) | 본질적으로 분산 구조라 페일오버 개념이 약함 |
| 데이터 모델 | 관계형 (SQL) | 키-값/문서 (NoSQL) |
| CAP 위치 | CP에 가까움 (단일 리더) | AP (가용성/지연 우선) |

## S3 Cross-Region Replication — 비동기 객체 복제

S3 CRR(Cross-Region Replication)은 한 버킷의 객체를 다른 리전의 버킷으로 자동 복제한다. **두 버킷 모두 버저닝을 활성화해야 한다.** 버전 ID로 복제를 추적하기 때문이다. 복제는 기본적으로 단방향이며, 양방향이 필요하면 양쪽에 CRR을 설정한다. 복제 역할(IAM)에는 원본 읽기와 대상 쓰기 권한이 필요하다.

- **RTC (Replication Time Control)**: 객체의 99.99%를 15분 이내에 복제하도록 보장한다(SLA). 일반 CRR은 최선 노력(best-effort)이다.
- **선택적 복제**: 프리픽스/태그 기준으로 복제하고, 다른 스토리지 클래스나 다른 계정으로 복제할 수 있다.
- **기존 객체**: CRR은 기본적으로 활성화 이후에 생성된 새 객체만 복제한다(기존 객체는 S3 Batch Replication이 필요하다).

> ⚠️ **함정**: CRR은 **버저닝을 활성화한 이후에 생성된 새 객체만 복제한다.** 자주 걸리는 함정이다. "CRR을 켰는데 옛 객체가 대상 버킷에 없다"는 버그가 아니라 설계다. 기존 객체를 복제하려면 S3 Batch Operations(Batch Replication)를 따로 실행해야 한다. 또한 삭제 마커(delete marker) 복제는 선택 사항이라, 기본적으로는 한 리전에서 삭제해도 다른 리전의 객체는 삭제되지 않을 수 있다.

## KMS Multi-Region Key — 리전을 넘어 암호화 경계를 잇다

멀티 리전 데이터에는 숨은 함정이 있다. 바로 암호화다. S3 CRR이 암호화된 객체를 다른 리전으로 복제하거나 Aurora Global/DDB Global Tables가 데이터를 복제할 때, **암호화에 쓴 KMS 키가 그 리전에 없으면 복호화할 수 없다.** 단일 리전 KMS 키는 그 리전에 묶여 다른 곳에서 쓸 수 없다.

**Multi-Region Key(MRK)**가 이 문제를 푼다. 한 리전에 Primary MRK를 만들고 다른 리전에 Replica MRK를 복제하면, 이들은 **같은 키 머티리얼과 같은 키 ID(mrk- 접두사)를 공유**한다. 그래서 리전 A에서 MRK로 암호화한 데이터를 리전 B의 Replica MRK로 복호화할 수 있다. 암호문이 리전 경계를 넘어서도 유효하다.

```bash
aws kms create-key --multi-region   # Create Primary MRK
aws kms replicate-key --key-id mrk-abc --replica-region us-east-1  # Replicate
```

> "같은 키 머티리얼을 여러 리전에서 공유"하는 것은 암호학적으로 미묘한 일이다. 보통 키는 한 곳에 가둬 노출 면적을 최소화하지만, MRK는 **암호문의 이식성**을 얻기 위해 의도적으로 키 머티리얼을 복제한다. 키 머티리얼은 공유되어도 접근 제어(정책, 그랜트)는 리전마다 독립적으로 관리된다(같은 머티리얼, 리전별 권한). 이는 **봉투 암호화(envelope encryption)**와 함께 동작한다. 데이터는 데이터 키(DEK)로 암호화하고, DEK는 KMS 키(KEK)로 암호화한다. MRK는 KEK 계층을 리전 간에 공유 가능하게 만들어, 복제된 암호문에 딸린 암호화된 DEK를 대상 리전에서 복호화할 수 있게 한다. 시험에서 "복제된 암호화 데이터를 다른 리전에서 복호화할 수 없다"의 답은 거의 항상 "MRK가 없다" 또는 "키 정책 권한이 빠졌다"이다.

## Global Accelerator vs CloudFront — DNS 한계를 우회하는 두 경로

두 서비스는 Route 53 DNS 라우팅의 한계(캐시 TTL 때문에 페일오버가 느림)를 우회하지만 목적이 다르다.

| 항목 | Global Accelerator | CloudFront |
|--------|---------------------|------------|
| 프로토콜 | TCP/UDP (L4) | HTTP/HTTPS (L7) |
| IP | 고정 anycast IP 2개 | 동적 엣지 IP |
| 캐싱 | 없음 (프록시/라우팅) | 강력함 (콘텐츠 캐시) |
| 페일오버 | 헬스 체크 기반 즉시 (DNS 캐시와 무관) | Origin Failover |
| 대표 용도 | 게임, IoT, VoIP, 비HTTP | 웹/정적 콘텐츠 전송 |

> Global Accelerator가 즉각 페일오버할 수 있는 비결은 **anycast**다. Anycast는 같은 IP 주소를 전 세계 여러 엣지 로케이션에서 (BGP로) 광고하는 라우팅 기법으로, 사용자 패킷이 자동으로 가장 가까운 엣지로 향한다. 클라이언트는 고정된 IP 2개만 알고 있고, 백엔드 리전이 죽으면 GA가 즉시 정상 리전으로 경로를 바꾼다. IP가 바뀌지 않으므로 **클라이언트 DNS 캐시와 무관**하다. 반면 Route 53은 페일오버 때 IP 자체를 바꾸므로 지연이 최소 DNS 캐시 TTL만큼 생긴다. "비HTTP의 즉각적인 리전 간 페일오버"는 GA, "정적 콘텐츠의 글로벌 캐싱"은 CloudFront, "단순한 가중치/지연 라우팅"은 Route 53이다.

## Route 53 ARC — DR 페일오버를 코드로 안전하게

헬스 체크가 주도하는 페일오버에만 의존하면 헬스를 잘못 해석하거나 부분 장애를 만났을 때 잘못된 페일오버가 일어날 위험이 있다. **Route 53 Application Recovery Controller(ARC)**는 페일오버를 **명시적 제어(Routing Control)**로 다룬다. 운영자나 자동화가 코드/API로 "지금 트래픽을 리전 B로 보낸다"를 안전하게 토글한다. 동시에 **Readiness Check**가 "Secondary 리전이 정말 준비되어 있는가"(용량, 구성, 복제 상태)를 지속적으로 검증한다.

> ARC의 핵심 가치는 **안전한 DR 훈련**(테스트된 페일오버)을 가능하게 한다는 것이다. DR 계획의 고질병은 "테스트하지 않은 페일오버 경로는 재해가 닥칠 때 실패한다"는 것이다(방치된 코드의 부패). ARC Routing Control은 5개의 독립된 리전 데이터 플레인에 분산되어 있어, 메인 컨트롤 플레인이 죽어도 페일오버를 토글할 수 있다(컨트롤/데이터 플레인 분리 — 장애 시 의존하는 시스템이 적을수록 좋다는 "정적 안정성(static stability)" 원칙). Well-Architected의 "복구 절차를 정기적으로 테스트하라"는 원칙을 상용화한 것이다. 이 페일오버를 FIS 카오스 실험으로 검증하는 것은 Day 4의 패턴이다.

## 정리

오늘은 네 장의 그림이 나왔다. 첫째, **멀티 리전은 빛의 속도 때문에 비동기 복제를 받아들여야 하며, 그 결과로 생기는 불일치와 충돌을 다루는 것이 핵심**이다. 둘째, **Route 53은 DNS 기반 GSLB**로 8개 라우팅 정책과 쿼럼 헬스 체크를 결합하지만 DNS 캐시 TTL이 근본적인 지연이며, **즉각 페일오버는 anycast 기반의 Global Accelerator의 몫**이다. 셋째, **데이터 복제는 단일 리더(Aurora Global, 충돌 없음)와 다중 리더(DDB Global Tables, LWW) 사이의 트레이드오프**이며, LWW는 clock skew로 인한 조용한 갱신 손실 위험이 있다. 넷째, **KMS Multi-Region Key는 암호화 경계를 이어** 복제된 암호문을 다른 리전에서 복호화할 수 있게 하고, **S3 CRR은 버저닝 이후의 새 객체만 복제하며**, **Route 53 ARC는 컨트롤/데이터 플레인 분리로 페일오버를 안전한 코드로 만든다.**

다음에는 네 가지 DR 전략인 Backup & Restore, Pilot Light, Warm Standby, Active-Active와 각각의 RTO/RPO/비용 트레이드오프를 살펴본다.

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

B) Last Write Wins(타임스탐프가 늦은 쓰기가 이김)로 해결되며, 노드 간 clock skew로 실제 나중 쓰기가 져서 silent lost update가 날 수 있다

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

오늘 본 핵심은 네 가지다. 첫째, 멀티 리전은 빛의 속도라는 물리 한계로 비동기 복제를 받아들여야 하며 그 결과인 충돌·불일치를 다루는 게 본질이다. 둘째, Route 53은 DNS 기반 GSLB로 8종 라우팅 정책과 정족수 헬스 체크(여러 checker 합의로 false positive 방지)를 결합하지만 DNS 캐시 TTL이라는 지연 한계가 있어, 즉각 페일오버는 anycast 고정 IP 기반 Global Accelerator가 맡는다(CloudFront는 HTTP 콘텐츠 캐싱). 셋째, 데이터 복제는 단일 리더(Aurora Global, 쓰기 한 곳이라 충돌 없음, secondary promote ~1분)와 멀티 마스터(DynamoDB Global Tables, LWW 충돌 해결)의 트레이드오프이며 LWW는 clock skew로 silent lost update 위험을 품는다. 넷째, KMS Multi-Region Key가 같은 키 자료를 리전 간 공유해 복제 암호문의 리전 이식성을 주고(봉투 암호화 KEK 공유), S3 CRR은 버전 관리 필수·새 객체만 복제이며, Route 53 ARC가 컨트롤/데이터 플레인 분리로 안전한 DR 페일오버 토글을 제공한다.
