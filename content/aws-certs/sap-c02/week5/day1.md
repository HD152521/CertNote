# Day 21 - Multi-Region 아키텍처: 왜 글로벌 분산은 어려운가

분산 시스템을 처음 설계하는 엔지니어에게 가장 낭만적으로 들리는 말이 "멀티 리전"이다. 그런데 실제로 해보면 곧 깨닫는다. **데이터가 여러 곳에 동시에 존재하는 순간, 모든 것이 어려워진다.** 시계가 맞지 않고, 네트워크가 끊기고, 트랜잭션이 분리된다. 1980년대 Leslie Lamport가 "분산 시스템이란 당신이 존재조차 몰랐던 컴퓨터 한 대의 고장이 당신의 컴퓨터를 망가뜨리는 시스템이다"라고 했던 말이 현실이 된다.

AWS 멀티 리전을 배우는 진짜 이유는 "이 서비스들을 어떻게 켜는가"가 아니다. **왜 이런 제약이 생기고, 어떤 트레이드오프를 감수해야 하는지**를 이해해야 SAP-C02 시나리오에서 정답과 오답을 가를 수 있다. 오늘은 그 근본부터 시작한다.

## 왜 Multi-Region인가: 네 가지 동기

멀티 리전을 선택하는 이유는 크게 네 가지다. SAP 시나리오마다 이 중 어느 것이 primary driver인지 파악하는 것이 첫 번째 단계다.

| 동기 | 시나리오 힌트 | 선택하는 패턴 |
|------|-------------|------------|
| **재해 복구 (DR)** | "리전 전체 장애 대비", "RTO/RPO 명시" | DR 4전략 중 선택 |
| **지연 최소화** | "글로벌 사용자", "가장 가까운 리전" | Active-Active + Route 53 LBR |
| **데이터 주권** | "GDPR", "EU 데이터는 EU에", "데이터 레지던시" | 리전별 독립 스택, Geolocation 라우팅 |
| **컴플라이언스** | "금융 규제", "정부 감사", "리전 격리 요구" | 리전별 계정 + SCP |

> 💡 **관련 이론**: CAP Theorem(Brewer, 2000)은 분산 시스템이 일관성(Consistency), 가용성(Availability), 분할 내성(Partition tolerance) 중 동시에 셋 모두를 완벽히 보장할 수 없다는 정리다. 멀티 리전은 네트워크 분단이 필연이므로 P는 항상 유지해야 하고, 결국 C와 A 사이에서 선택한다. DynamoDB Global Tables가 AP(최종 일관성)를 선택한 이유가 여기 있다. Aurora Global Database는 단일 Primary로 CP에 가깝게 유지한다.

> 🔍 **더 깊이**: 실제로는 CAP의 C(강한 일관성)와 A(가용성)의 이분법보다, PACELC(Abadi, 2012)가 더 현실적이다. PACELC는 Partition 시에는 A vs C, 정상 시에는 Latency vs Consistency의 트레이드오프가 있음을 설명한다. Aurora Global의 복제 지연(1초 미만)은 "Latency 희생으로 Consistency를 높인" PACELC 관점의 선택이다.

## DR 전략 4종: 수학으로 이해하는 RTO/RPO

DR 전략 4종을 "외우는" 것과 "이해하는" 것의 차이는 시나리오 변형 문제에서 드러난다. 각 전략의 비용·RTO·RPO는 트레이드오프 곡선으로 생각해야 한다.

| 전략 | RTO | RPO | 비용 지수 | 핵심 메커니즘 |
|------|-----|-----|----------|------------|
| **Backup & Restore** | 수시간~수일 | 백업 주기(시간 단위) | 1x | S3에 스냅샷 저장 후 복구 |
| **Pilot Light** | 30분~2시간 | 분 단위 | 3~5x | DB 복제만 켜두고 앱 서버는 끄기 |
| **Warm Standby** | 수분~30분 | 분 단위 | 10~20x | 축소된 풀 스택 상시 운영 |
| **Multi-Site Active-Active** | ~0 (즉시) | ~0 (실시간) | 50~100x | 양 리전 동시 트래픽 처리 |

> 📚 **사례**: 2017년 Amazon S3 us-east-1 장애. AWS 엔지니어가 점검 스크립트를 실수로 더 큰 서브시스템에 적용해 서버 수가 급격히 감소하며 S3 인덱싱 서비스가 멈췄다. 당시 S3를 Origin으로 쓰던 수많은 서비스가 같이 다운됐다. 이 사고 이후 AWS는 Control Plane 분리와 Pilot Light 패턴의 중요성을 재강조했다. 교훈: 단일 리전에 모든 것을 두면, 예상치 못한 운영 실수가 전체 장애로 이어진다.

### Backup & Restore 내부 동작

S3 Cross-Region Replication(CRR)은 S3 버킷 간 객체를 비동기로 복제한다. RTC(Replication Time Control)를 켜면 대부분의 객체가 15분 내 복제됨을 SLA로 보장한다. DB의 경우 RDS 스냅샷을 다른 리전으로 수동/자동 복사한다. 장애 시 복원 절차:
1. 대상 리전에 VPC·서브넷·보안 그룹 미리 준비 (Infrastructure as Code로)
2. 최신 스냅샷에서 RDS 인스턴스 복원
3. EC2 AMI에서 인스턴스 실행
4. DNS 전환

복원 시간이 길어지는 이유는 단순히 "복사"가 아니라 **인스턴스 초기화, 데이터 하이드레이션, 애플리케이션 기동** 순서로 시간이 걸리기 때문이다.

### Pilot Light: 핵심만 켜두는 기술

Pilot Light는 파일럿(점화 불꽃)에서 이름을 따왔다. 가스난로의 점화 불꽃처럼, 항상 꺼지지 않는 최소한의 구성만 유지한다. 보통 DB 복제만 켜두고 앱 계층(EC2, ECS)은 AMI만 준비해 끄거나 최소 인스턴스로 운영한다. 장애 시 Auto Scaling 그룹을 확장하고 DNS를 전환한다.

> ⚠️ **함정**: Pilot Light에서 DNS 전환만으로 완료가 아니다. 대기 리전의 EC2 인스턴스가 "전혀 없는" 상태라면 Auto Scaling으로 인스턴스를 새로 부팅하는 데 10~20분이 걸린다. RTO가 30분이라는 수치에는 이 부팅 시간이 포함된다. 시나리오에서 RTO "15분 이내"가 요구사항이라면 Pilot Light는 경계선이고 Warm Standby가 더 안전하다.

### Warm Standby: 축소된 풀 스택

Warm Standby는 대기 리전에서 완전한 스택을 작은 용량으로 운영한다. 예: 프로덕션이 m5.2xlarge × 10대라면, 대기는 m5.large × 2대. 장애 시 Auto Scaling으로 같은 용량까지 확장한다. 이미 모든 서비스가 기동된 상태이므로 RTO가 수분 수준이다.

### Multi-Site Active-Active: 가장 복잡한 패턴

Active-Active는 두 리전이 동시에 실제 트래픽을 처리한다. 이것이 가능하려면:
- **데이터 계층**: 마스터-마스터 복제 (DynamoDB Global Tables) 또는 단일 쓰기 리전 + 읽기 복제 (Aurora Global Database)
- **컴퓨팅 계층**: 각 리전에 독립적인 Auto Scaling 그룹·ECS 클러스터
- **DNS 계층**: Route 53 Latency 또는 Geolocation 라우팅
- **세션·상태**: Redis ElastiCache Global Datastore 또는 DynamoDB 세션 저장

> 🔍 **더 깊이**: Active-Active에서 마스터-마스터 쓰기 충돌 문제. DynamoDB Global Tables는 Last-Write-Wins(LWW) 전략을 쓴다. 두 리전에서 동시에 같은 아이템을 수정하면 타임스탬프가 더 늦은 쓰기가 이긴다. 이것이 문제가 되는 케이스: 사용자가 서울에서 잔액 $100 → $80을 쓰고, 도쿄에서 거의 동시에 $100 → $90으로 쓰면, 두 쓰기가 1ms 차이로 충돌할 때 최종값이 $80 또는 $90이 되지만 "어떤 것이 옳은지" 알 수 없다. 금융 시스템이 Global Tables를 직접 쓰지 못하는 이유가 이것이다. 해결책: Aurora Global Database로 단일 Primary 리전에서만 쓰고, Secondary는 읽기만.

## 데이터 복제 서비스별 내부 메커니즘

각 서비스의 복제 방식이 어떻게 다른지 이해하면 시나리오에서 적합한 서비스를 즉각 고를 수 있다.

| 서비스 | 복제 방식 | RPO | 일관성 모델 | 쓰기 방향 |
|--------|---------|-----|-----------|---------|
| **S3 CRR** | 비동기 이벤트 기반 | 15분(RTC) / 수시간 | 최종 일관성 | 단방향 (양방향 설정 가능) |
| **DynamoDB Global Tables** | 비동기 Kinesis 기반 | 1~2초 | 최종 일관성 (LWW) | 마스터-마스터 |
| **Aurora Global Database** | 스토리지 레벨 Redo log 비동기 | <1초 | 강한 일관성 (단일 Primary) | Primary 쓰기 전용 |
| **RDS Cross-Region Read Replica** | 비동기 binlog/WAL | 수초 | 최종 일관성 | 단방향 (DR 시 promote) |
| **EFS Replication** | 비동기 | ~1분 | 최종 일관성 | 단방향 |
| **ElastiCache Global Datastore** | 비동기 | ~1초 | 최종 일관성 | Primary 쓰기 |

> 💡 **관련 이론**: Aurora Global Database의 혁신적인 점은 **스토리지 레벨 복제**다. 기존 RDS는 binlog를 Primary에서 Replica로 전송하는 방식(논리적 복제)이라 쿼리 처리 + 로그 생성 + 전송 + 재실행의 4단계를 거쳐 수초의 지연이 생겼다. Aurora Global은 스토리지 노드가 직접 Redo log를 네트워크로 흘려보내 Primary 컴퓨팅 오버헤드를 거의 없애고 전용 복제 네트워크(< 1초)로 전달한다. 이것이 "RPO < 1초"를 가능하게 하는 물리적 이유다.

## Route 53 ARC (Application Recovery Controller)

Route 53 ARC는 멀티 리전 페일오버를 안전하게 제어하기 위한 "스위치보드"다. 일반 Route 53 Failover 라우팅은 Health Check 실패 시 자동 전환이지만, ARC의 Routing Control은 엔지니어가 **의도적으로** 트래픽을 전환한다.

**왜 자동이 항상 좋지 않은가?** 장애가 실제 장애인지 네트워크 순간 지연인지 불명확할 때, 자동 페일오버가 "flapping"을 일으킨다. 원본 리전이 잠깐 복구됐다가 또 장애나면 트래픽이 왔다 갔다 하면서 더 나쁜 사용자 경험이 생긴다. ARC Routing Control은 이를 막는 안전 클러스터다.

ARC의 내부 구조:
- **Control Panel**: 5개 AZ 이상에 분산된 Zookeeper 기반 합의 클러스터
- **Routing Control**: 켜기/끄기 스위치 (Route 53 Health Check에 연결)
- **Safety Rule**: 최소 N개 컨트롤을 켜야만 다른 컨트롤을 끌 수 있는 규칙 (페일오버 중 완전 차단 방지)

> 🎯 **시나리오**: 글로벌 결제 플랫폼이 us-east-1과 eu-west-1을 Active-Active로 운영 중이다. us-east-1에서 장애 징후가 보일 때 "자동으로" 전환되면 오탐(false positive) 가능성이 있다. SRE 팀이 판단해서 수동으로 스위치를 눌러 전환하고, Safety Rule로 "최소 한 리전은 항상 트래픽 받도록" 강제한다. 이것이 ARC Routing Control의 사용 시나리오다.

## 트래픽 분배: Route 53 vs CloudFront vs Global Accelerator

세 서비스는 모두 글로벌 라우팅에 관련되지만 동작 계층이 완전히 다르다.

| 서비스 | 동작 계층 | 라우팅 기준 | 페일오버 속도 | 캐싱 |
|--------|---------|-----------|------------|------|
| **Route 53 LBR** | DNS (L7) | 리전 단위 지연 측정 | DNS TTL 의존 (60~300초) | ❌ |
| **CloudFront** | HTTP (L7) | 엣지 캐시 PoP | 즉시 (엣지에서) | ✅ |
| **Global Accelerator** | BGP Anycast (L4) | 패킷 수준 최단 경로 | 수십 초 | ❌ |

> 💡 **관련 이론**: BGP Anycast는 인터넷의 라우팅 프로토콜인 BGP(Border Gateway Protocol, RFC 4271)를 이용해 같은 IP 주소를 여러 위치에서 광고한다. 인터넷 라우터는 "가장 짧은 AS path"로 라우팅하므로, 사용자 가까이 있는 AWS PoP로 트래픽이 자동 흘러간다. Global Accelerator는 이 원리로 동작한다. 반면 Route 53은 DNS 응답에 특정 IP를 넣어주는 것이므로, 한 번 IP를 캐시한 클라이언트는 TTL 동안 그 IP로 계속 간다.

## 글로벌 아키텍처 다이어그램: Active-Active

```
사용자 (서울)          사용자 (런던)
      │                     │
      ▼ DNS Query            ▼ DNS Query
   Route 53 Latency-Based Routing
      │                     │
      ▼ 서울 선택              ▼ 아일랜드 선택
 ap-northeast-2          eu-west-1
 ┌─────────────┐        ┌─────────────┐
 │ ALB         │        │ ALB         │
 │ ECS/EKS     │        │ ECS/EKS     │
 │ Aurora PG   │◄──────►│ Aurora PG   │
 │ (Primary)   │ 1초 미만 │ (Secondary) │
 │ DynamoDB    │◄──────►│ DynamoDB    │
 │ Global Tbl  │  LWW   │ Global Tbl  │
 └─────────────┘        └─────────────┘
      │                     │
      └──── R53 ARC ─────────┘
           (페일오버 스위치)
```

장애 시: Route 53 Health Check가 ap-northeast-2 ALB를 실패 감지 → 해당 레코드 제외 → 모든 트래픽 eu-west-1로. Aurora는 Secondary를 Primary로 Promote(1분 미만). ARC Safety Rule이 "eu-west-1이 살아있을 때만 ap-northeast-2 비활성화" 강제.

> 📚 **사례**: Netflix의 멀티 리전 전략 (Chaos Engineering, 2011~). Netflix는 Chaos Monkey를 이용해 프로덕션 환경에서 무작위로 인스턴스를 끄는 실험을 했다. 이후 Chaos Kong으로 리전 전체를 끄는 훈련도 진행했다. 이 과정에서 Active-Active의 취약점(DynamoDB 충돌, 세션 스티키 문제, Cassandra 복제 지연)을 발견하고 수정했다. 교훈: 멀티 리전은 설계만으로 완성되지 않는다. 실제 장애 훈련이 있어야 RTO/RPO 수치가 현실이 된다.

> 🔍 **더 깊이**: Aurora Global Database의 Managed Planned Failover vs Unplanned Failover. Planned(계획 페일오버): Secondary를 Primary로 승격하기 전에 Primary의 모든 쓰기를 Secondary에 플러시해 RPO=0으로 완료. Unplanned(비계획): Primary가 갑자기 다운 시 Secondary가 약 1초 미만의 Redo log 지연만큼을 잃고 승격. 시험에서 "RPO < 1초"는 Unplanned 기준, "RPO = 0"은 Planned 기준이다.

## Stateful vs Stateless 설계 원칙

멀티 리전에서 장애 복구 속도는 결국 **상태(state)가 어디에 있느냐**의 문제다.

- **Stateless 컴포넌트** (Lambda, ECS Task, EC2 앱 서버): 상태를 직접 갖지 않아 어느 리전에서도 즉시 대체 가능. 멀티 리전 최적.
- **Stateful 컴포넌트** (RDS, ElastiCache, 로컬 파일시스템): 상태를 다른 리전으로 복제해야 함. 복제 지연이 곧 RPO.

설계 원칙: **상태를 가능한 외부화하라.** 세션은 DynamoDB나 ElastiCache에, 파일은 S3에, 설정은 SSM Parameter Store나 AppConfig에. 컴퓨팅 계층 자체는 완전히 Stateless로 만들어야 멀티 리전 페일오버가 단순해진다.

> 💡 **관련 이론**: 12-Factor App 방법론(Heroku, 2012)의 Factor VI "Processes": 프로세스는 Stateless여야 하고, 영속 데이터는 외부 Backing Service(DB, 큐, 캐시)에 저장해야 한다. 이 원칙이 Cloud-Native 설계의 기본이며, 멀티 리전 가용성의 전제 조건이다.

## 비용 고려: DR 패턴별 월별 추정

| 전략 | 주요 비용 항목 | 월별 비용 예시 (us-east-1 기준 프로덕션 $10K/월 가정) |
|------|-------------|---------------------------------------------|
| Backup & Restore | S3 스토리지 + 데이터 전송 | ~$200~500/월 |
| Pilot Light | DB 복제 인스턴스 + 네트워킹 | ~$1,000~2,000/월 |
| Warm Standby | 축소 스택 운영 비용 | ~$3,000~5,000/월 |
| Active-Active | 풀 스택 × 2 | ~$10,000+/월 |

> 🎯 **시나리오**: 한 SaaS 회사가 "RTO 4시간, RPO 1시간"을 요구사항으로 제시하면서 "비용을 최소화"하라고 한다. 이 조건은 Backup & Restore로 충족 가능하다. 만약 선택지에 Warm Standby가 있다고 해서 더 좋은 RTO를 제공한다는 이유로 고르면 "비용 최소화" 키워드를 무시한 것이다. Pro 시험은 "충분히 좋은 솔루션"과 "과잉 설계" 사이에서 항상 비용 효율을 따진다.

## 📝 연습 문제

**문제 1.** 한 글로벌 금융 서비스가 Aurora PostgreSQL을 us-east-1에서 운영 중이다. eu-west-1에 DR 리전을 구성하려 하며 RPO < 1초, RTO < 1분을 요구한다. 비용이 주요 제약은 아니다. 어떤 구성이 가장 적합한가?

A) RDS Cross-Region Read Replica + 수동 Promote
B) Aurora Global Database + R53 Failover Health Check
C) DMS CDC로 실시간 동기 + 컷오버
D) S3 스냅샷 백업 + 복원

**정답: B**
해설: Aurora Global Database는 스토리지 레벨 복제로 RPO < 1초를 달성하고, 장애 시 Secondary를 Primary로 Promote하는 데 < 1분이 걸린다. A는 RPO가 수초~수십 초로 1초를 보장하지 못하고 RTO가 길다. C는 DMS가 DR 솔루션으로 부적합하다(마이그레이션 도구). D는 RPO/RTO 요건 불충족.

---

**문제 2.** 한 e-commerce가 DynamoDB를 us-east-1에서 운영 중이다. ap-southeast-1에도 동일 데이터가 필요하고, 양 리전에서 쓰기가 발생한다. 충돌 가능성이 있어도 "결국 수렴"하면 된다. 어떤 서비스가 적합한가?

A) Aurora Global Database
B) DynamoDB Global Tables
C) ElastiCache Global Datastore
D) RDS Cross-Region Read Replica

**정답: B**
해설: 양방향(마스터-마스터) 쓰기 + 최종 일관성(LWW) = DynamoDB Global Tables의 정확한 사용 케이스다. Aurora Global은 단일 Primary(단방향 쓰기)다. ElastiCache Global Datastore는 캐시용. RDS Read Replica는 단방향.

---

**문제 3.** 한 회사가 "RTO 15분, RPO 5분"을 요구하는 DR 전략을 선택해야 한다. 비용은 최소화하려 한다. 가장 적합한 DR 패턴은?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: C**
해설: Warm Standby는 축소 스택이 상시 운영되어 RTO 수분~15분, RPO 분 단위를 달성한다. Pilot Light는 앱 서버 부팅 시간 때문에 RTO 15분이 불확실하다. Active-Active는 비용 최소화 조건에 과잉. Backup & Restore는 RTO 수시간으로 불충족.

---

**문제 4.** 멀티 리전 Active-Active에서 SRE 팀이 리전 페일오버를 "의도적으로, 안전하게" 수동 제어하고 싶다. 자동 페일오버의 flapping 위험을 막으려 한다. 어떤 서비스를 쓰는가?

A) Route 53 Failover 라우팅 (자동 Health Check)
B) Route 53 ARC (Application Recovery Controller)
C) CloudWatch Alarm + Lambda 자동화
D) Global Accelerator 트래픽 다이얼

**정답: B**
해설: Route 53 ARC는 Safety Rule로 "최소 N개 컨트롤을 켜야만 전환 가능"을 강제해 flapping과 완전 차단을 막는다. 수동 스위치로 의도적 페일오버에 최적. A는 자동 전환이라 flapping 위험. C는 커스텀 자동화라 운영 부담 증가.

---

**문제 5.** GDPR로 인해 EU 사용자 데이터는 EU 리전에만 저장해야 한다. 단일 코드베이스로 us-east-1(미국 사용자)과 eu-west-1(EU 사용자)을 운영하려 한다. 데이터 격리를 보장하는 방법은?

A) DynamoDB Global Tables (양 리전 자동 복제)
B) Aurora Global Database (Read Replica를 eu-west-1에)
C) 리전별 독립 DynamoDB + Route 53 Geolocation 라우팅
D) S3 Cross-Region Replication + Presigned URL

**정답: C**
해설: A와 B 모두 양 리전에 데이터를 복제하므로 GDPR의 데이터 레지던시 요구 위반. D는 S3 CRR이 데이터를 미국으로 복제해서 역시 위반. C만이 데이터를 각 리전에 격리하고 Route 53 Geolocation으로 EU 사용자를 eu-west-1으로 보낸다.

---

**문제 6.** 한 회사가 멀티 리전 Active-Active를 구성했는데, 아주 드물게 같은 사용자 레코드가 두 리전에서 동시에 수정되어 불일치가 발생한다. 이 회사는 금융 시스템이라 충돌이 허용되지 않는다. 어떻게 해결하는가?

A) DynamoDB Global Tables의 LWW를 그대로 쓴다
B) Aurora Global Database로 단일 Primary 쓰기만 허용한다
C) 충돌 시 Lambda로 자동 merge한다
D) 모든 쓰기를 Single AZ EC2에서만 처리한다

**정답: B**
해설: 금융 시스템에서 충돌 불허 = 단일 쓰기 지점이 필요. Aurora Global Database는 Primary 리전에서만 쓰기를 처리하고 Secondary는 읽기만 가능해 충돌 자체가 발생하지 않는다. RPO < 1초로 재해 복구도 가능. A는 충돌 허용, C는 merge 로직 복잡도와 오류 가능성, D는 멀티 리전의 의미가 없다.

---

**문제 7.** 한 게임 회사가 글로벌 사용자에게 UDP 기반 매치메이킹 서버를 서비스한다. us-east-1이 장애 시 ap-northeast-2로 수초 내 페일오버되어야 한다. 어떤 서비스를 선택하는가?

A) Route 53 Latency-Based Routing
B) CloudFront + Lambda@Edge
C) Global Accelerator + NLB
D) API Gateway Regional 엔드포인트

**정답: C**
해설: UDP 프로토콜 지원 + 수초 내 페일오버(DNS 캐시 우회) = Global Accelerator. Route 53 LBR은 DNS TTL 때문에 페일오버가 수분 걸린다. CloudFront는 UDP 미지원. API Gateway는 HTTP 전용.

---
