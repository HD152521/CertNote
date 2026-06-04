# Day 22 - Aurora: AWS가 다시 설계한 관계형 데이터베이스

2014년 AWS re:Invent에서 Aurora가 발표됐을 때 많은 DBA들이 의심했다. "MySQL을 그냥 관리형으로 올린 게 아니냐"는 것이었다. 아니다. Aurora의 내부를 들여다보면 이야기가 완전히 다르다. Amazon은 전통적인 관계형 DB 아키텍처의 근본적 제약 — 스토리지가 단일 서버에 붙어있다는 것 — 을 공유 분산 스토리지로 해체했다. 이 결정이 만드는 차이가 "왜 Aurora는 같은 MySQL이면서 더 빠르고 더 안전한가"를 설명한다.

## Aurora 탄생의 배경 — 전통적 DB 아키텍처의 한계

전통적인 MySQL RDS(Multi-AZ 포함)는 이렇게 생겼다. Primary 인스턴스 하나가 EBS 볼륨 하나에 데이터를 쓴다. Multi-AZ를 쓰면 그 EBS 데이터 전체를 Standby 인스턴스의 EBS로 블록 단위로 복제한다. Read Replica를 추가하면 binlog를 통해 각 Replica의 EBS에 데이터를 다시 쓴다. 결국 데이터가 N개의 EBS 볼륨에 N벌 존재한다.

이 구조의 문제: 페일오버가 느리다. Standby로 전환하려면 Standby가 완전히 최신 상태인지 확인하고, 새 Primary로 승격하고, DNS를 변경해야 한다. Read Replica를 5개 추가하면 Primary에서 binlog가 5곳으로 나가야 한다. 스토리지 확장은 각 인스턴스의 EBS를 별도로 관리해야 한다.

Aurora의 해결책은 스토리지 레이어를 완전히 분리하는 것이었다. 컴퓨팅(인스턴스)과 스토리지를 분리하고, 스토리지는 여러 AZ에 걸친 분산 스토리지 클러스터가 담당한다. 인스턴스는 이 공유 스토리지에서 데이터를 읽고 쓰기만 한다. 2014년 Amazon 내부 논문 "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"(SIGMOD 2017)에서 이 아키텍처가 공식 발표됐다.

> 💡 **관련 이론**: Aurora의 Compute-Storage 분리 아키텍처는 클라우드 데이터베이스의 새로운 패러다임을 열었다. 이 설계는 Snowflake의 "Virtual Warehouse + Cloud Storage" 분리, Google Spanner의 "Tablet server + Colossus storage" 분리와 같은 맥락이다. 컴퓨팅을 stateless에 가깝게 만들면 컴퓨팅 노드 추가/제거/교체가 스토리지와 독립적으로 빠르게 이루어질 수 있다. 전통적인 "Shared-Nothing 아키텍처"(각 노드가 자체 스토리지)와 반대되는 "Shared-Storage 아키텍처"다.

## 공유 분산 스토리지 — 6 카피와 Quorum의 의미

Aurora 스토리지는 하나의 AZ에 집중되지 않는다. 3개의 AZ에 걸쳐서 총 6개의 복사본(Copy)을 유지한다. 정확히는 각 AZ에 2개씩, 총 6개다.

쓰기가 발생할 때 이 6개 카피 중 4개에 쓰기가 성공하면 커밋 완료로 인정한다. 이것이 "4/6 Quorum Write"다. 읽기는 3/6 Quorum으로 동작한다. 이 Quorum 시스템의 의미를 이해하면 왜 Aurora가 AZ 하나가 완전히 날아가도 데이터 손실 없이 동작하는지 알 수 있다.

```
AZ-a                AZ-b                AZ-c
[Copy 1] [Copy 2]  [Copy 3] [Copy 4]  [Copy 5] [Copy 6]
   ↑         ↑         ↑        ↑         ↑         ↑
   ─────────────────────────────────────────────────
              Aurora 분산 스토리지 레이어
   ─────────────────────────────────────────────────

쓰기: 6개 중 4개 응답 필요 (4/6 Quorum)
      → AZ-a 전체 장애(Copy 1,2 손실): Copy 3,4,5,6 중 4개 응답 → 정상
      → AZ-a의 Copy 1 + AZ-b의 Copy 3 손실: Copy 2,4,5,6 중 4개 → 정상

읽기: 6개 중 3개 응답 필요 (3/6 Quorum)
      → AZ 하나 전체 손실해도 나머지 4개에서 3개 확보 → 정상
```

이 설계의 핵심 이점: Aurora 인스턴스(컴퓨팅)가 장애가 나도 스토리지는 멀쩡히 살아 있다. 새 인스턴스를 스토리지에 붙이면 된다. 스토리지 복제가 이미 되어 있으므로 "Redo Log 재실행" 없이 즉시 최신 상태에서 시작할 수 있다. 이것이 Aurora 페일오버가 30초 이내로 빠른 근본적 이유다.

> 🔍 **더 깊이**: Aurora 스토리지 노드들 사이의 통신은 데이터 페이지 전체가 아니라 Redo Log만 전송한다. Writer 인스턴스는 변경된 데이터를 Redo Log 형태로 스토리지 노드에 보내고, 스토리지 노드들이 자체적으로 Redo를 실행해서 데이터 페이지를 업데이트한다. 이 "Log Applicator" 설계 덕분에 네트워크 트래픽이 크게 감소한다. 전통적 MySQL Multi-AZ가 전체 데이터 블록을 복제하는 것과 대비된다. SIGMOD 2017 논문에서 Aurora 팀은 이 최적화가 네트워크 I/O를 7.7배 감소시켰다고 보고했다.

> 💡 **관련 이론**: 4/6 Quorum 시스템은 분산 시스템의 "Quorum-based Replication" 이론을 구현한다. Leslie Lamport의 Paxos(1989)와 Diego Ongaro의 Raft(2014, USENIX ATC) 알고리즘에서 Quorum은 다수결 원칙으로 일관성을 보장한다. n개 복사본 중 (n/2 + 1)개의 동의가 있어야 커밋하면, 최대 (n/2 - 1)개 노드가 동시에 죽어도 시스템이 동작한다. Aurora의 4/6는 정확히 이 원칙: 6개 중 4개 필요 → 최대 2개 동시 손실 허용.

## Aurora 엔드포인트 — 4종류의 역할

Aurora 클러스터에는 여러 종류의 엔드포인트가 있으며, 각각 다른 목적으로 사용된다. 시험에서 "어떤 엔드포인트를 써야 하는가"를 자주 묻는다.

**Cluster Endpoint(Writer Endpoint)**: 항상 현재 Writer 인스턴스를 가리킨다. 쓰기 및 트랜잭션 처리에 사용. 페일오버가 발생하면 자동으로 새 Writer를 가리킨다.

**Reader Endpoint**: 클러스터 내의 모든 Reader 인스턴스 사이에서 로드밸런싱. 연결 요청이 들어올 때마다 Round-Robin으로 Reader를 선택. 읽기 트래픽 분산에 사용.

**Custom Endpoint**: DBA가 특정 Reader 집합을 지정해서 만드는 엔드포인트. "분석 쿼리는 r5.8xlarge Reader 2대로만", "OLTP 읽기는 r5.2xlarge Reader 3대로만" 같은 분리가 가능.

**Instance Endpoint**: 특정 인스턴스 하나를 직접 가리키는 엔드포인트. 디버깅이나 특수한 쿼리 라우팅에 사용. 일반 운영에서는 권장하지 않는다.

```
앱 (쓰기) ──────────────► Cluster Endpoint ──► Writer (AZ-a)
앱 (읽기) ──────────────► Reader Endpoint ────► Reader1 (AZ-b)
                                         ├──► Reader2 (AZ-c)
                                         └──► Reader3 (AZ-a)

분석팀 ────────────────► Custom Endpoint ─────► Reader4 (r5.8xl, AZ-b)
                                         └──► Reader5 (r5.8xl, AZ-c)

                              ↑
                   공유 분산 스토리지 (6 카피, 3 AZ)
```

> ⚠️ **함정**: Reader Endpoint는 연결 수준에서 로드밸런싱한다. 즉, 새 연결이 열릴 때마다 라우팅 결정이 이루어진다. 이미 열린 연결은 페일오버가 발생해도 같은 Reader를 유지한다. 따라서 "연결 풀링 라이브러리가 연결을 오래 유지"하면 Reader 간 불균형이 생길 수 있다. RDS Proxy + Aurora 조합에서 Proxy가 이 문제도 완화한다.

## Aurora Global Database — 리전을 넘는 실시간 복제

Aurora Global Database는 단일 Aurora 클러스터를 여러 리전으로 확장하는 기능이다. 1개 Primary 리전과 최대 5개 Secondary 리전으로 구성된다.

복제는 Aurora 스토리지 레이어에서 직접 이루어진다. DB 엔진 레벨(binlog 등)이 아닌 스토리지 레이어 복제이기 때문에 DB 인스턴스의 CPU를 사용하지 않고, 복제 지연이 매우 짧다. 일반적으로 **1초 미만의 복제 지연(RPO < 1초)**이 달성된다.

Secondary 리전에서는 읽기 전용으로 사용할 수 있다. 만약 Primary 리전이 재해로 완전히 다운되면, Secondary 리전을 새 Primary로 Promote하는 데 **1분 이내**의 RTO가 달성된다.

| 항목 | Aurora Global DB | RDS Cross-Region Read Replica |
|------|-----------------|-------------------------------|
| 복제 위치 | 스토리지 레이어 | DB 엔진 레이어(binlog/WAL) |
| 복제 지연 | < 1초 | 수 초 ~ 수십 초 |
| Secondary 리전 수 | 최대 5개 | 최대 5개(MySQL), 여러 개(PG) |
| 페일오버 시간 | 1분 이내 | 수 분 ~ 수십 분 (수동 Promote) |
| Secondary 읽기 | 가능 | 가능 |
| 비용 | 높음 | 보통 |
| 엔진 | Aurora MySQL / Aurora PG | MySQL / PG / MariaDB / Oracle 등 |

> 🔍 **더 깊이**: Aurora Global Database의 Planned Failover와 Unplanned Failover는 다르다. **Planned Failover(Managed Planned Failover)**는 유지보수나 리전 마이그레이션을 위해 사용하며, Secondary를 새 Primary로 먼저 승격한 다음 원래 Primary를 Secondary로 강등한다. 이 과정에서 데이터 손실(RPO)이 거의 0이다. **Unplanned Failover**는 Primary 리전 장애 시 Secondary를 수동으로 Promote하는 것으로, 복제 Lag에 해당하는 데이터가 손실될 수 있다(보통 수백 ms ~ 1초 이내).

> 📚 **사례**: 삼성전자의 B2B SaaS 플랫폼 SmartThings는 전 세계 수억 개의 IoT 디바이스 이벤트를 처리한다. 국내 AWS 고객 사례 세션(AWS Summit Seoul)에서 SmartThings 팀은 Aurora Global Database를 통해 미국, 유럽, 아시아 사용자들이 가장 가까운 리전의 Aurora Secondary에서 디바이스 상태를 읽어가는 구조를 설명했다. 복제 지연이 1초 미만이기 때문에 전 세계 사용자가 거의 동일한 최신 상태를 볼 수 있다.

## Aurora Serverless v2 — 자동 스케일링의 진짜 의미

Aurora Serverless v2는 기존 Serverless v1의 완전한 재설계 버전이다. v1은 용량이 0으로 줄어들고 다시 올라오는 데 30~60초가 걸려서 실용적인 사용이 어려웠다. v2는 설계 자체를 바꿨다.

Aurora Serverless v2는 **0.5 ACU(Aurora Capacity Unit)부터 256 ACU까지** 스케일링한다. 1 ACU는 대략 2GB RAM에 해당하므로, 최대 512GB RAM까지 자동 스케일링이 가능하다. 스케일링 속도는 수 초 단위 — v1의 분 단위와 비교하면 혁신적이다.

v2의 또 다른 특징: 0 ACU로 완전히 꺼지지 않는다. 최소 0.5 ACU를 항상 유지한다. "자동 일시 정지" 기능이 별도로 있지만(개발/테스트 환경용), 프로덕션에서는 보통 최소값을 설정해서 콜드 스타트를 방지한다.

적합한 사용 사례:
- 트래픽이 불규칙하게 급증하는 SaaS 서비스 (월초 청구 집중, 이벤트 기간 폭증)
- 개발/테스트 환경 (야간에 자동으로 최소로 줄어들어 비용 절감)
- 트래픽 패턴을 모르는 신규 서비스

부적합한 사용 사례:
- 항상 높은 처리량을 유지해야 하는 안정적 워크로드 (Provisioned가 더 저렴)
- 특정 ACU 수준에서 최대 성능이 필요한 경우 (스케일링 중 일시적 지연 발생 가능)

> 💡 **관련 이론**: Serverless v2의 스케일링 메커니즘은 "Resource Sharing on Multi-Tenant Infrastructure" 원칙을 따른다. 물리적으로는 대형 서버에서 여러 Aurora Serverless v2 클러스터들이 CPU와 메모리를 공유하지만, 각 클러스터는 완전히 격리된다. 이 방식은 Google의 Borg/Kubernetes 클러스터와 유사하게, 물리 자원 활용률을 높이면서 논리적 격리를 유지한다.

## Backtrack과 Fast Clone — 빠른 복구의 두 가지 방법

Aurora MySQL에만 있는 독특한 기능 두 가지가 Backtrack과 Fast Clone이다.

**Backtrack**: 마치 비디오를 되감듯이 클러스터를 과거의 특정 시점으로 되돌린다. PITR과 다른 점은, PITR은 새 클러스터를 만들지만 Backtrack은 현재 클러스터 자체를 되돌린다. 몇 분 안에 완료된다. 단, MySQL 호환 Aurora에서만 지원한다. PostgreSQL 호환 Aurora는 Backtrack이 없다 — PITR을 써야 한다. Backtrack 가능 범위는 최대 72시간 전까지다.

```
PITR:      ────────────────────────────────►
                                           새 클러스터 생성 (몇십 분)

Backtrack: ◄────────────────────────────────
           현재 클러스터를 과거로 되돌림 (몇 분)
```

**Fast Database Cloning**: Copy-on-Write(COW) 방식으로 Aurora 클러스터를 즉시 복제한다. 처음에는 원본 스토리지를 공유하고, 변경이 생길 때만 새 페이지를 만든다. 결과적으로 수 TB 데이터베이스를 수 분 만에 클론할 수 있다. 개발/테스트 환경, 스테이징, 대규모 마이그레이션 전 검증에 활용된다.

> ⚠️ **함정**: 시험에서 "Aurora PostgreSQL 클러스터에서 실수로 데이터를 삭제했다. 빠르게 원상복구하는 방법은?"이라는 문제에서 Backtrack을 고르면 틀린다. PostgreSQL은 Backtrack을 지원하지 않으며 PITR이 답이다. "Aurora MySQL"이라는 명시가 있을 때만 Backtrack이 선택지가 된다.

## Aurora vs RDS — 언제 Aurora를 선택하는가

Aurora는 RDS MySQL/PostgreSQL보다 약 20% 비싸다. 이 추가 비용이 정당화되는 시나리오가 있고, 그렇지 않은 시나리오가 있다.

**Aurora가 더 적합한 경우:**
- 페일오버가 30초 이내여야 하는 고가용성 요구사항
- 5개 이상의 Read Replica가 필요한 대규모 읽기 트래픽
- 글로벌 서비스에서 리전 간 < 1초 복제가 필요한 경우 (Aurora Global DB)
- 트래픽이 급변하는 서비스 (Aurora Serverless v2)
- 수십 TB 이상의 데이터를 무한 스케일링하고 싶은 경우 (Aurora Storage 자동 확장)

**일반 RDS가 더 적합한 경우:**
- 비용 민감도가 높고 트래픽이 안정적인 중소 규모 워크로드
- Oracle, SQL Server, MariaDB 엔진이 필요한 경우 (Aurora는 MySQL, PostgreSQL 호환만)
- 특정 MySQL/PostgreSQL 버전 기능이나 플러그인이 필요한 경우

| 항목 | RDS MySQL/PostgreSQL | Aurora MySQL/PostgreSQL |
|------|---------------------|------------------------|
| 스토리지 | 인스턴스당 EBS | 공유 분산 (6 카피, 3 AZ) |
| 최대 스토리지 | 64TB (gp3), 16TB (gp2) | 최대 128TB |
| 최대 Read Replica | 5개 | 15개 |
| 복제 지연 | 비동기 (수 초) | 수십 ms (공유 스토리지) |
| 페일오버 시간 | 60-120초 | 30초 이내 |
| Global 복제 | Cross-Region Replica (비동기) | Global DB (스토리지 레벨, < 1초) |
| Serverless | 없음 | v2 (0.5-256 ACU, 초 단위 스케일) |
| Backtrack | 없음 | MySQL 호환만 (72시간) |
| Fast Clone | 없음 | 있음 (COW) |
| 비용 | 기준 | 약 20% 높음 |

> 📚 **사례**: 넷플릭스(Netflix)는 AWS 위에 글로벌 스트리밍 서비스를 운영하면서 핵심 데이터를 여러 리전에 걸쳐 복제한다. 공식 기술 블로그(Netflix Tech Blog)에 따르면, 넷플릭스는 "Active-Active" 멀티 리전 전략을 추구하는데 Aurora Global Database가 그 기반 중 하나로 활용된다. 특히 사용자 프로필과 구독 정보 같은 글로벌하게 읽기가 많은 데이터에서 Secondary 리전의 읽기 분산이 지연을 크게 줄였다고 언급한다.

## CLI로 Aurora 클러스터 실제로 설정하기

```bash
# Aurora MySQL 클러스터 생성
aws rds create-db-cluster \
  --db-cluster-identifier prod-aurora \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.05.2 \
  --master-username admin \
  --master-user-password 'StrongPass123!' \
  --storage-encrypted \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name aurora-subnet-group \
  --backup-retention-period 7

# Writer 인스턴스
aws rds create-db-instance \
  --db-instance-identifier prod-aurora-writer \
  --db-cluster-identifier prod-aurora \
  --engine aurora-mysql \
  --db-instance-class db.r6g.xlarge \
  --availability-zone ap-northeast-2a

# Reader 인스턴스 x2 (다른 AZ)
aws rds create-db-instance \
  --db-instance-identifier prod-aurora-reader-1 \
  --db-cluster-identifier prod-aurora \
  --engine aurora-mysql \
  --db-instance-class db.r6g.xlarge \
  --availability-zone ap-northeast-2b

# Aurora Global DB 생성 (Seoul → Virginia)
aws rds create-global-cluster \
  --global-cluster-identifier prod-global-aurora \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:111:cluster:prod-aurora

# Backtrack 활성화 (MySQL 호환만)
aws rds modify-db-cluster \
  --db-cluster-identifier prod-aurora \
  --backtrack-window 4320   # 72시간 = 4320분

# Aurora Serverless v2 클러스터
aws rds create-db-cluster \
  --db-cluster-identifier dev-aurora-serverless \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.05.2 \
  --master-username admin \
  --master-user-password 'StrongPass123!' \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=16

aws rds create-db-instance \
  --db-instance-identifier dev-aurora-serverless-instance \
  --db-cluster-identifier dev-aurora-serverless \
  --engine aurora-mysql \
  --db-instance-class db.serverless
```

## 정리하며

Aurora는 관계형 DB의 외관을 유지하면서 내부 스토리지 아키텍처를 완전히 재설계한 서비스다. 6 카피 분산 스토리지와 4/6 Quorum 쓰기가 AZ 하나의 완전 손실에도 데이터를 보호하고, 컴퓨팅-스토리지 분리가 빠른 페일오버와 쉬운 Reader 추가를 가능하게 한다. Aurora Global Database는 스토리지 레이어 복제로 1초 미만의 리전 간 지연을 달성하고, Serverless v2는 수 초 만에 용량을 조정한다.

시험 관점에서: "5개 이상 Read Replica", "30초 이내 페일오버", "리전 간 < 1초 복제", "변동 트래픽 자동 스케일링"이 보이면 Aurora 계열이 정답이다. "Backtrack"은 Aurora MySQL만, "PostgreSQL은 PITR"만이 가능하다는 것을 반드시 기억하자.

다음 날은 스키마가 없는 세계, DynamoDB를 다룬다. 파티션 키가 왜 그렇게 중요한지, Hot Partition이 어떻게 시스템을 죽이는지, 그리고 1 RCU = 4KB가 무엇을 의미하는지를 볼 것이다.

---

## 📝 연습 문제

**문제 1.** 한 금융 서비스 회사가 글로벌 애플리케이션을 위해 미국(us-east-1), 유럽(eu-west-1), 서울(ap-northeast-2) 3개 리전에서 동일한 DB 데이터에 빠르게 접근해야 한다. 데이터 일관성은 1초 미만 지연을 허용한다. 가장 적합한 솔루션은?

A) 각 리전에 독립적인 RDS MySQL을 두고 애플리케이션에서 동기화
B) Aurora Global Database를 us-east-1에 Primary로 설정하고 eu-west-1, ap-northeast-2를 Secondary로 구성
C) us-east-1에 RDS MySQL을 두고 각 리전에 Cross-Region Read Replica를 만든다
D) DynamoDB Global Tables를 사용한다

**정답: B**
해설: Aurora Global Database는 스토리지 레이어 복제로 1초 미만의 리전 간 복제 지연을 달성한다. 최대 5개 Secondary 리전을 지원하므로 3개 리전 구성은 충분하다. A는 데이터 일관성 보장이 어렵다. C는 RDS Cross-Region Read Replica의 복제 지연이 수 초~수십 초로 Aurora Global DB보다 길다. D는 NoSQL이므로 관계형 스키마가 필요한 금융 서비스에 부적합할 수 있다.

---

**문제 2.** Aurora MySQL 클러스터에서 운영자가 실수로 DELETE 쿼리를 잘못 실행해서 중요한 데이터가 삭제됐다. 이미 몇 분이 지났다. 현재 클러스터를 가장 빠르게 삭제 이전 상태로 복구하는 방법은?

A) 가장 최근 스냅샷에서 새 클러스터를 복원한다 (20분 소요 예상)
B) Aurora Backtrack을 사용해서 현재 클러스터를 삭제 전 시점으로 되돌린다 (수 분 소요)
C) Read Replica를 Primary로 Promote하고 삭제된 데이터를 수동으로 복구한다
D) PITR로 삭제 시점 직전으로 새 클러스터를 생성한다 (15-20분 소요)

**정답: B**
해설: Backtrack은 현재 클러스터를 과거 시점으로 빠르게(수 분 내) 되돌리는 Aurora MySQL 전용 기능이다. 새 클러스터를 만들 필요가 없으므로 엔드포인트 변경도 필요없다. A와 D는 새 클러스터 생성이 필요해서 더 오래 걸리고 엔드포인트 전환 작업이 필요하다. C는 Read Replica는 쓰기도 복제받으므로 삭제 작업도 복제됐을 것이다 — 이미 Replica에서도 데이터가 사라졌다.

---

**문제 3.** 스타트업이 새로운 SaaS 서비스를 출시하려고 한다. 트래픽 패턴을 예측하기 어렵고, 런치 후 몇 주간 트래픽이 급격히 변동할 것으로 예상한다. 비용을 최소화하면서 자동으로 용량을 조절하고 싶다. 가장 적합한 Aurora 옵션은?

A) Aurora MySQL Provisioned (db.r6g.large 고정)
B) Aurora Serverless v1 (최소 0 ACU로 완전 일시 정지 가능)
C) Aurora Serverless v2 (최소 0.5 ACU, 초 단위 스케일링)
D) Aurora MySQL + Auto Scaling Read Replica

**정답: C**
해설: Aurora Serverless v2는 0.5~256 ACU 범위에서 수 초 단위로 자동 스케일링해서 트래픽 변동에 빠르게 대응한다. v1은 스케일링이 느리고(분 단위) 스케일링 중 연결이 끊어지는 문제가 있어서 프로덕션에 적합하지 않다. A는 고정 용량으로 낭비나 부족이 발생할 수 있다. D는 읽기 확장은 되지만 쓰기 용량은 자동 조절이 안 된다.

---

**문제 4.** Aurora 클러스터의 6 카피 중 2개가 동시에 손실됐다 (AZ-c의 Copy 5와 Copy 6). 클러스터의 읽기/쓰기 동작에 어떤 영향이 있는가?

A) 클러스터가 완전히 중단된다
B) 쓰기만 가능하고 읽기는 중단된다
C) 쓰기와 읽기 모두 정상적으로 계속 동작한다
D) 읽기만 가능하고 쓰기는 중단된다

**정답: C**
해설: Aurora 스토리지는 6 카피 중 4/6 Quorum으로 쓰기를 커밋하고 3/6 Quorum으로 읽기를 처리한다. Copy 5와 6이 손실되면 남은 Copy 1, 2, 3, 4가 있다. 쓰기는 4/6 → 4개 중 4개 응답으로 충분(정상). 읽기는 3/6 → 4개 중 3개 응답으로 충분(정상). 따라서 클러스터는 계속 정상 동작한다. 단, Aurora는 백그라운드에서 손실된 카피를 자동으로 재생성한다(Self-Healing).

---

**문제 5.** 애플리케이션이 Aurora 클러스터에 쓰기와 읽기를 모두 수행한다. 운영팀이 특정 Reader 인스턴스 2개를 분석 쿼리 전용으로 예약하고 싶다 (OLTP 읽기와 분석 읽기를 분리). 이를 구현하는 Aurora 기능은?

A) Reader Endpoint를 2개 만든다
B) Custom Endpoint를 만들어서 분석용 Reader 인스턴스를 지정한다
C) Instance Endpoint를 직접 사용한다
D) Aurora Serverless v2로 마이그레이션한다

**정답: B**
해설: Custom Endpoint는 클러스터 내 특정 Reader 인스턴스들을 묶어서 별도의 엔드포인트를 만드는 기능이다. 분석 팀은 Custom Endpoint를 사용하고, OLTP 앱은 Reader Endpoint를 사용하면 트래픽이 완전히 분리된다. A는 불가능 — Reader Endpoint는 클러스터당 하나다. C는 특정 인스턴스 하나만 직접 지정하는 것이므로 로드밸런싱이 없어 단일 장애점이 된다. D는 이 문제와 관련이 없다.

---
