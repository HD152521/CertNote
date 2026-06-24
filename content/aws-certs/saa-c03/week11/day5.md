# Day 5 - 복원력·DR·마이그레이션을 하나의 결정 트리로 꿰기

이번 주는 "장애를 어떻게 견디고, 재해에서 어떻게 복구하며, 워크로드를 어떻게 옮기는가"라는 세 주제를 다뤘다. 표면적으로는 별개로 보이지만, 셋은 하나의 질문으로 수렴한다 — **"이 시스템이 견뎌야 할 최악은 무엇이고, 그것을 견디는 데 얼마를 쓸 것인가."** 단일 AZ 장애인지 리전 전체 마비인지, 데이터 1초도 못 잃는지 한 시간은 괜찮은지, 옮기는 길을 막는 게 다운타임인지 대역폭인지 — 이 제약을 정확히 읽어 적정 비용의 도구로 매핑하는 것이 SAA 도메인 2(복원력)의 본질이다. 이 글은 한 주의 핵심을 결정 트리로 압축하고, 실제 시험에 나오는 복합 시나리오로 그 매핑을 몸에 새긴다.

## 한 주를 관통하는 세 개의 축

이번 주 모든 결정은 결국 세 축 위에 놓인다.

**첫째, 장애의 반경(blast radius)이 격리 수준을 정한다.** 한 AZ가 죽어도 무중단이어야 하면 Multi-AZ(같은 리전 내 동기 복제, RPO 0). 리전 전체가 마비돼도 살아야 하면 Multi-Region(비동기 복제, DR). "Multi-AZ는 DR이 아니다"가 한 주의 가장 큰 함정이었다 — Day 1의 2021 us-east-1 사고가 "리전도 장애 단위"임을 보여줬다.

**둘째, RTO와 RPO가 DR 단계와 비용을 정한다.** RPO(잃어도 되는 데이터)는 복제 방식이, RTO(허용 다운타임)는 컴퓨팅 준비 상태가 결정한다. 둘 다 작아질수록 DR 스펙트럼의 비싼 쪽(Backup-Restore → Pilot Light → Warm Standby → Active-Active)으로 올라간다. Day 2의 핵심은 "요구되는 복원력을 초과하는 설계는 그 자체로 낭비"라는 것 — 느슨한 RTO/RPO엔 싼 단계로 충분하다.

**셋째, 제약의 종류가 도구를 정한다.** 트래픽을 어디로 보낼지는 Route 53 라우팅 정책이(Day 3), 워크로드를 어떻게 옮길지는 마이그레이션 도구가(Day 4) 푼다. DB의 적은 다운타임(DMS+CDC), 대용량 파일의 적은 대역폭(Snow vs DataSync), 서버 이전의 도구는 MGN이다.

### 헷갈리기 쉬운 핵심 비교

| 비교 | 왼쪽 | 오른쪽 | 가르는 기준 |
|------|------|--------|-------------|
| Multi-AZ vs Multi-Region | HA(동기, RPO 0) | DR(비동기) | 장애 반경(AZ냐 리전이냐) |
| Aurora Global vs Cross-Region RR | 단일 라이터, 승격 ~1분 | 비동기 읽기 사본 | 승격 속도·전용 복제 인프라 |
| DynamoDB Global Tables vs Aurora Global | 다중 리전 동시 쓰기(AP) | 단일 리전 쓰기(일관성) | 쓰기 가능 리전 수 |
| Pilot Light vs Warm Standby | 앱 OFF, DB 복제 | 축소 풀스택 ON | 컴퓨팅 준비 상태 |
| DMS vs MGN | DB 데이터(CDC) | 서버 전체(블록) | 옮기는 단위 |
| MGN vs DRS | 일회성 마이그레이션 | 지속적 DR | 목적(이전이냐 복구냐) |
| DataSync vs Storage Gateway | 마이그/복제(일회·정기) | 영구 하이브리드 캐시 | 일시적이냐 영구냐 |
| Snow vs DataSync | 오프라인(네트워크 부족) | 온라인(대역폭 충분) | 회선×데이터량 전송 시간 |
| Alias vs CNAME | 루트 도메인 가능, 무료 | zone apex 불가 | zone apex 제약 |
| Latency vs Geolocation | 가장 빠른 리전 | 사용자 위치(규제·언어) | 속도냐 위치냐 |

> 💡 **관련 이론**: 이 모든 비교의 밑바닥에는 Day 1에서 본 **CAP/PACELC**가 깔려 있다. Multi-Region에서 "여러 리전 동시 쓰기"를 택하면(DynamoDB Global Tables) 일관성을 양보하고 가용성을 얻는 AP 선택이고, "한 리전만 쓰기"를 택하면(Aurora Global) 일관성을 지키되 페일오버라는 절차적 RTO를 치른다. DR 4단계도 결국 "분단·장애 시 얼마나 빨리·얼마나 정확히 복구하느냐"를 비용과 맞바꾸는 CAP의 비즈니스 번역이다. 복원력 설계가 암기가 아니라 추론으로 풀리는 이유가 이것이다 — 분산 시스템의 근본 제약 위에서 비용과 견딤을 저울질하는 일관된 논리다.

> ⚠️ **함정**: 한 주 동안 반복된 4대 함정을 묶어 둔다. ① **Multi-AZ를 DR로 착각** — AZ는 같은 리전 내 격리라 리전 장애엔 무력. ② **RTO와 RPO 혼동** — 서로 독립 축이라 "RPO는 느슨하지만 RTO는 빡빡한" 시나리오가 흔함. ③ **루트 도메인에 CNAME** — zone apex 제약으로 불가, Alias가 답. ④ **백업을 운영과 같은 계정에 둠** — 운영을 지운 손이 백업도 지움(Code Spaces). 이 넷이 보이면 반사적으로 오답을 걸러낼 수 있어야 한다.

## 통합 아키텍처: 한 주의 모든 조각이 만나는 그림

```
[ 멀티 리전 DR + 마이그레이션 통합 ]

  ┌─ Region A (Primary, 운영) ────────────────┐
  │  Route 53 Alias(example.com) → CloudFront  │
  │     → ALB → ECS(Auto Scaling, 다중 AZ)     │
  │     → Aurora Global Writer (RPO ~1초)      │
  │  S3 (Standard, 3+ AZ) ──CRR──▶ Region B    │
  │  AWS Backup → Vault Lock(WORM) + 별도 계정  │
  └────────────────────────────────────────────┘
                    │ 비동기 복제
                    ▼
  ┌─ Region B (DR, Warm Standby) ──────────────┐
  │  ALB(상시) → ECS(축소, 장애 시 Scale Up)    │
  │  Aurora Global Reader (장애 시 ~1분 승격)   │
  └────────────────────────────────────────────┘

  Route 53 Failover/ARC: Primary 비정상 → Secondary
   (Health Check + ARC Readiness로 준비 상태 상시 점검)

  [ 마이그레이션 유입 경로 ]
   온프레 DB(Oracle) ─SCT+DMS(CDC)─▶ Aurora
   온프레 VM 200대  ─MGN(블록 복제)─▶ EC2
   온프레 파일(NFS) ─DataSync(대역폭 충분)─▶ S3
   페타바이트 오프라인 ─Snowball Edge Cluster─▶ S3
```

이 한 장에 주의 모든 개념이 들어 있다 — Multi-AZ HA(ECS 다중 AZ), Multi-Region DR(Aurora Global + CRR), Warm Standby 단계, Route 53 Alias·Failover·ARC, 불변 백업, 그리고 네 갈래 마이그레이션 경로. 시험의 복합 문제는 대개 이 그림의 한 조각을 떼어 "여기서 무엇을 골라야 하나"를 묻는다.

> 📚 **사례**: Day 2에서 본 Netflix의 카오스 엔지니어링은 이 통합 아키텍처를 "문서가 아니라 검증된 시스템"으로 만드는 마지막 조각이다. 아무리 정교하게 그려도 실제로 Region A를 죽여 보지 않으면 Region B의 ECS가 정말 스케일 업하는지, Aurora 승격이 정말 1분에 끝나는지, ARC Readiness가 정말 부족을 잡아내는지 알 수 없다. "테스트하지 않은 백업은 백업이 아니고, 연습하지 않은 DR은 DR이 아니다"라는 한 주의 운영 철학이 이 그림에 생명을 불어넣는다. SAA가 아키텍트 자격증인 이유도, 단순히 서비스를 나열하는 게 아니라 "이 설계가 진짜 견디는가"를 검증 가능하게 만드는 판단을 묻기 때문이다.

## 📝 시나리오 연습 문제

**문제 1.** 한 글로벌 핀테크가 리전 전체 장애 시에도 RTO 30초·RPO 거의 0으로 서비스를 이어가야 한다. 비용은 부차적이다. 가장 적절한 아키텍처는?

A) Backup & Restore + Cross-Region 스냅샷
B) Pilot Light (DB 복제 + 앱 OFF)
C) Warm Standby (축소 풀스택)
D) Multi-Site Active-Active (Aurora Global + DynamoDB Global Tables + Route 53)

**정답: D**

해설: RTO 30초·RPO 거의 0은 DR 스펙트럼의 가장 빠른 끝인 Active-Active만 충족한다 — 두 리전이 동시에 트래픽을 받으므로 한쪽이 죽어도 전환 지연이 거의 없다. Backup-Restore(A)는 RTO 시간~일, Pilot Light(B)는 앱을 켜고 스케일하는 분~수십 분, Warm Standby(C)는 스케일 업하는 수 분이 걸려 30초를 못 맞춘다. "비용 부차적 + 극단적으로 빡빡한 RTO/RPO" = Active-Active. 요구가 비싼 쪽 끝을 가리킬 때는 망설이지 말고 최상위 단계를 고른다.

---

**문제 2.** 한 회사가 내부 보고서 시스템의 DR을 RTO 12시간·RPO 6시간으로 설계하며 비용을 최소화한다. 적절한 전략은?

A) Multi-Site Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**정답: D**

해설: RTO 12시간·RPO 6시간이라는 매우 느슨한 목표는 가장 싼 Backup & Restore로 충분하다 — Cross-Region 스냅샷을 보관하다 장애 시 인프라를 새로 만든다. 문제 1과 정반대 끝의 시나리오다. Active-Active(A)·Warm Standby(B)는 분 단위 RTO용 고비용 옵션으로 과잉이고, Pilot Light(C)도 지속 복제 비용이 드는데 RPO 6시간이면 그만큼 핫한 데이터가 불필요하다. "느슨한 RTO/RPO + 비용 최소 = 최하위 단계". 요구 초과 설계는 낭비라는 Day 2 원칙이 핵심이다.

---

**문제 3.** 한 게임사가 전 세계 5개 리전에서 플레이어 인벤토리를 **모든 리전에서 동시에 읽고 쓰는** 저지연 NoSQL로 운영하려 한다. 적절한 서비스는?

A) Aurora Global Database
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) ElastiCache for Redis

**정답: B**

해설: DynamoDB Global Tables는 여러 리전이 모두 쓰기 가능한 Active-Active NoSQL을 제공하고 충돌은 last-writer-wins로 자동 해소하며 복제 지연이 보통 1초 미만이다. Aurora Global(A)은 단일 리전만 쓰기(단일 라이터)라 "모든 리전 동시 쓰기"에 맞지 않고, Cross-Region RR(C)은 읽기 전용 사본이며, ElastiCache(D)는 영속 인벤토리 저장소가 아닌 캐시다. "다중 리전 동시 쓰기 NoSQL" = Global Tables. CAP상 일관성을 양보하고 가용성을 택한 AP 설계임을 이해하면 확실하다.

---

**문제 4.** 한 연구 기관이 외딴 지역(저대역폭)의 200TB 데이터를 S3로 옮겨야 한다. 네트워크로는 수개월이 걸린다. 적절한 방법은?

A) DataSync
B) Snowball Edge Storage Optimized(클러스터)
C) DMS
D) S3 Transfer Acceleration

**정답: B**

해설: 저대역폭에서 200TB 온라인 전송은 수개월이 걸리므로 오프라인 물리 장비가 답이다 — Snowball Edge Storage Optimized는 약 80TB/대라 200TB는 여러 대 클러스터로 처리한다. DataSync(A)·Transfer Acceleration(D)은 네트워크를 타므로 회선이 병목이면 무의미하고, DMS(C)는 DB 마이그레이션 도구다. 회선 속도×데이터량으로 전송 시간을 가늠해 손익분기점을 넘으면 Snow라는 Day 4 판단이 핵심이다.

---

**문제 5.** 한 회사가 루트 도메인 `shop.com`을 CloudFront 배포에 연결하려는데 CNAME 설정이 거부된다. 올바른 해결책은?

A) Route 53 Alias 레코드
B) A 레코드에 CloudFront IP 직접 입력
C) zone apex에 CNAME 강제 추가
D) Weighted 라우팅

**정답: A**

해설: zone apex(루트 도메인)에는 CNAME을 둘 수 없다 — SOA·NS 필수 레코드와 충돌하기 때문이다. Route 53 Alias는 A 레코드처럼 동작하며 CloudFront 같은 AWS 리소스를 가리켜 이 제약을 우회하고 무료다. B는 CloudFront IP가 동적이라 불가능하고, C는 표준 위반으로 거부되며, D는 트래픽 분배 정책이라 무관하다. "루트 도메인 + AWS 리소스" = Alias. Day 3의 핵심 함정이다.

---

**문제 6.** 한 SaaS가 전 세계 사용자에게 **네트워크 지연이 가장 낮은 리전**으로 트래픽을 라우팅하려 한다. 적절한 Route 53 정책은?

A) Geolocation
B) Latency
C) Weighted
D) Geoproximity

**정답: B**

해설: Latency 라우팅은 사용자에서 각 리전까지의 실제 네트워크 지연을 측정해 가장 빠른 리전으로 보낸다. Geolocation(A)은 지리적 위치 기반이라 국경 근처에서 네트워크상 더 빠른 리전을 놓칠 수 있고, Weighted(C)는 가중치 분배, Geoproximity(D)는 위치+bias 조절로 "최저 지연"이 목적이 아니다. "가장 빠른/지연 최저"는 Latency, "어느 나라/규제·언어"는 Geolocation의 구분이 시험의 단골이다.

---

**문제 7.** 한 금융사가 규제 준수를 위해 백업이 보존 기간 내 **루트 사용자조차 삭제할 수 없도록** 변조 불가여야 한다. 적절한 통제는?

A) IAM 정책으로 삭제 거부
B) AWS Backup Vault Lock (Compliance 모드)
C) S3 버킷 정책
D) MFA Delete

**정답: B**

해설: AWS Backup Vault Lock의 Compliance 모드는 백업을 WORM으로 잠가 보존 기간 내에는 루트조차 삭제·변경할 수 없게 만들어 규제·랜섬웨어 대비 불변 백업 요구를 충족한다. IAM 정책(A)·S3 버킷 정책(C)은 권한 있는 주체(특히 루트)가 우회·변경할 수 있고, MFA Delete(D)는 S3 객체 삭제에 MFA를 요구할 뿐 보존을 강제하는 불변성이 아니다. "변조 불가·루트도 삭제 불가" = Vault Lock. 현대 DR이 랜섬웨어·내부자 삭제까지 가정한다는 Day 2 교훈이다.

---

**문제 8.** 한 팀이 온프레미스 데이터센터의 200대 VM을 코드 변경 없이 AWS EC2로 영구 이전하려 한다. 적절한 도구는?

A) AWS DMS
B) AWS Application Migration Service (MGN)
C) AWS DataSync
D) AWS Elastic Disaster Recovery (DRS)

**정답: B**

해설: 서버를 OS·애플리케이션째 코드 변경 없이 EC2로 옮기는 lift-and-shift(Rehost)의 자동화 도구가 MGN으로, 블록 레벨 실시간 복제 후 EC2로 부팅한다. DMS(A)는 DB 데이터만, DataSync(C)는 파일만 옮기고, DRS(D)는 같은 블록 복제를 쓰지만 목적이 재해 복구(소스 계속 운영, 장애 시만 페일오버)라 "영구 이전"과 다르다. MGN=일회성 마이그레이션, DRS=지속 DR이 핵심 구분이다.

---

**문제 9.** 한 회사가 DR 비용을 낮추되, 데이터는 다른 리전에 지속 복제하고 앱 서버는 평소 꺼두었다가 장애 시 빠르게 부팅하려 한다. 이 전략과 이를 자동화하는 서비스의 조합은?

A) Backup & Restore — AWS Backup
B) Pilot Light — AWS Elastic Disaster Recovery (DRS)
C) Warm Standby — Auto Scaling
D) Active-Active — Route 53

**정답: B**

해설: "데이터는 지속 복제(핫), 앱은 평소 꺼둠(콜드), 장애 시 빠르게 부팅"은 Pilot Light의 정의이고, AWS DRS가 블록 레벨 실시간 복제로 이를 경제적으로 자동화한다(분 단위 RTO). Backup & Restore(A)는 데이터를 지속 복제하지 않고 백업만 두며, Warm Standby(C)는 앱이 꺼지지 않고 축소판이 항상 켜져 있고, Active-Active(D)는 양쪽이 풀스택으로 동시 운영된다. Pilot Light와 Warm Standby의 차이는 "앱이 켜져 있느냐"라는 Day 2 함정이다.

---

**문제 10.** 한 아키텍트가 멀티 리전 Active-Active에서 페일오버 시 **헬스 체크에 의존하지 않고 명시적으로** 리전 트래픽을 즉시 전환하며, 보조 리전의 준비 상태를 상시 점검하려 한다. 적절한 도구는?

A) Route 53 Failover 정책 단독
B) Route 53 Application Recovery Controller (ARC)
C) CloudWatch Alarm
D) GuardDuty

**정답: B**

해설: Route 53 ARC는 헬스 체크에 의존하지 않고 운영자가 라우팅 컨트롤로 "리전 트래픽 100%/0%"를 즉시 전환하며, Readiness Check로 보조 리전의 용량·쿼터·설정 준비 상태를 상시 점검한다. 5개 리전 클러스터로 동작해 장애 중에도 제어가 살아 있다. Failover 정책 단독(A)은 헬스 체크 기반이라 명시적 제어가 아니고, CloudWatch Alarm(C)은 임계값 알림, GuardDuty(D)는 위협 탐지로 페일오버 제어와 무관하다. "명시적·헬스체크 비의존 페일오버 + 준비 점검" = ARC.

---

**문제 11.** 한 회사가 Oracle 데이터베이스를 Aurora PostgreSQL로 옮기되 다운타임을 수 분 이내로 최소화하려 한다. 그런데 마이그레이션 시작 후 CDC가 변경을 따라잡지 못한다. 올바른 접근과 문제 원인의 조합은?

A) SCT+DMS(Full Load+CDC) 사용 / 원본 DB의 트랜잭션 로그가 비활성이거나 보존이 짧음
B) Snowball 사용 / 네트워크 대역폭 부족
C) DataSync 사용 / 스케줄 미설정
D) MGN 사용 / 블록 복제 실패

**정답: A**

해설: Oracle→Aurora PostgreSQL은 엔진이 다른 Heterogeneous라 SCT로 스키마를 먼저 변환하고 DMS의 Full Load + CDC로 무중단 전환한다. CDC는 원본의 트랜잭션 로그(redo/WAL)를 읽어 변경을 재구성하므로, 그 로그가 비활성이거나 보존 기간이 짧으면 변경을 따라잡지 못한다 — 해결책은 로그 활성화와 보존 기간 연장이다. B·C·D는 DB 무중단 마이그레이션의 도구·원인이 아니다. "엔진 다름+다운타임 최소"의 정답 도구와 CDC=로그 기반 복제 원리를 함께 묻는 복합 문제다.

---

**문제 12.** 한 회사가 단일 AZ 장애에도 RDS의 쓰기가 무중단이고 RPO가 0이어야 하며, 동시에 us-east-1 리전 전체 장애에도 다른 리전에서 서비스를 이어가야 한다. 가장 적절한 조합은?

A) RDS Multi-AZ만 — 같은 리전 내 동기 스탠바이로 AZ·리전 장애를 모두 대비
B) Cross-Region Read Replica만 — 다른 리전에 비동기 읽기 사본을 두고 장애 시 승격
C) RDS Multi-AZ(AZ 장애 대비, 동기 RPO 0) + Aurora Global 또는 Cross-Region 복제(리전 장애 대비)
D) Backup & Restore만 — Cross-Region 스냅샷을 주기 보관하고 장애 시 다른 리전에 복원

**정답: C**

해설: AZ 장애 무중단·RPO 0은 동기 복제인 Multi-AZ가 충족하고(같은 리전 내 HA), 리전 전체 장애는 반드시 리전 경계를 넘는 복제(Aurora Global Database 또는 Cross-Region 복제)가 있어야 견딘다 — 두 요구는 서로 다른 격리 수준이라 둘을 결합해야 한다. Multi-AZ만(A)은 리전 장애에 무력하고, Cross-Region RR만(B)은 비동기라 RPO 0이 아니며 자동 AZ 페일오버도 없고, Backup-Restore만(D)은 RPO 0·무중단을 못 준다. "AZ HA + 리전 DR을 동시에 요구"하면 두 메커니즘을 겹쳐야 한다는 Day 1의 핵심이다.

---

## 📌 오늘의 요약 + 다음 주 예고

1. 복원력·DR·마이그레이션은 "견뎌야 할 최악 × 쓸 비용"이라는 한 질문으로 수렴한다 — 장애 반경이 격리를(AZ/리전), RTO·RPO가 DR 단계를, 제약 종류가 마이그레이션 도구를 정한다.
2. 4대 함정: Multi-AZ를 DR로 착각 / RTO·RPO 혼동 / 루트 도메인 CNAME / 백업을 운영과 같은 계정에. 이것들은 보이는 즉시 오답을 걸러낸다.
3. 밑바닥엔 CAP/PACELC가 깔려 있어, 복원력은 암기가 아니라 "일관성·가용성·지연·비용"을 저울질하는 추론으로 풀린다.
4. 다음 주: **최종 복습 + 풀 모의고사 + 시험 D-Day 체크리스트** — 전 도메인을 통합해 실전 감각을 굳힌다.
