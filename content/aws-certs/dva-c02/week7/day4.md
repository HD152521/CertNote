# Day 4 - Aurora: AWS가 RDBMS의 스토리지 레이어를 다시 쓴 이야기

Aurora는 2014년 re:Invent에서 처음 공개됐을 때 많은 사람을 어리둥절하게 만들었다. "MySQL 호환인데 MySQL이 아니다"라는 어색한 표현. AWS의 메시지는 명확했다 — **SQL 엔진 코드는 MySQL/PostgreSQL을 거의 그대로 쓰지만, 그 아래의 스토리지·복제·트랜잭션 레이어를 클라우드 환경에 맞게 처음부터 재설계했다**. 이 결정이 가져온 결과가 "MySQL 대비 5배, PostgreSQL 대비 3배 성능 + 자동 확장 스토리지 + 1초 미만 cross-region 복제"라는 숫자다.

DVA-C02에서 Aurora는 RDS와 거의 같은 빈도로 나오지만 묻는 각도가 다르다. RDS는 "관리형 DB의 trade-off"를 묻고, Aurora는 "왜 RDS로 부족한가, 어떤 시나리오에서 Aurora를 골라야 하는가"를 묻는다. 그 답을 이해하려면 Aurora의 스토리지 구조와 quorum 기반 복제를 알아야 한다. 오늘은 그 내부를 들여다본다.

## Aurora의 탄생: "데이터베이스는 스토리지가 본질이다"

전통적인 MySQL/PostgreSQL은 1990년대 단일 서버 환경을 가정해서 설계됐다. binlog/WAL을 디스크에 쓰고, 백업은 그 디스크를 복사하고, 복제는 binlog를 다른 서버로 보내는 식이다. 이 모델을 클라우드에 그대로 옮기면 ① EBS 한 볼륨에 의존하므로 단일 AZ 장애에 취약 ② 복제는 비동기 binlog 기반이라 lag 발생 ③ 스토리지 확장은 수동 ④ 백업/복원은 인스턴스 크기에 비례하는 시간 — 이런 한계가 그대로 따라온다.

2014년 Aurora 논문(SIGMOD 2017 "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases", Verbitski et al.)이 던진 핵심 통찰은 단순했다. **"네트워크가 새로운 병목이다. 따라서 네트워크 트래픽을 줄이는 것이 곧 성능이다."** 전통 DB는 commit 시점에 ① data page ② undo log ③ redo log ④ binlog ⑤ double-write buffer 등 같은 데이터를 여러 형태로 디스크에 쓴다. AWS 측정에 따르면 MySQL은 한 commit당 약 7.4번의 디스크 I/O가 발생. Aurora는 이 모든 걸 버리고 **redo log만 분산 스토리지에 보내고, 페이지 재구성은 스토리지 노드가 백그라운드로 알아서 한다**. 결과: I/O 횟수 1/6 수준, 네트워크 트래픽 7.7배 감소.

```
일반 MySQL의 commit:
  애플리케이션 → MySQL
                  ↓
              로컬 디스크 쓰기 (data page, redo log, undo log, binlog, double-write...)
                  ↓
              binlog 기반 replica 복제 (비동기)

Aurora의 commit:
  애플리케이션 → Aurora
                  ↓
              "redo log record"만 6개 스토리지 노드에 송신
                  ↓
              4/6에서 ack 받으면 commit 완료
              (스토리지 노드가 백그라운드로 data page 재구성)
```

> 🔍 **더 깊이**: Aurora 스토리지 노드는 단순한 EBS 볼륨이 아니다. **redo log를 받아서 page를 reconstruct할 수 있는 작은 서버**다. Aurora의 한 스토리지 노드는 들어오는 log record를 자기 로컬 디스크에 append하고, 동시에 그 log를 적용한 페이지 버전을 만들어둔다. 읽기 요청은 "이 페이지의 특정 LSN 시점 버전"을 요구하면 스토리지 노드가 즉시 응답한다. 이 구조 덕분에 ① binlog가 사라지고 ② replica는 자체 스토리지 없이 primary와 같은 스토리지를 참조하며 ③ 백업은 사실상 무료(continuous backup) ④ 스토리지 확장은 자동(10GB 단위 segment를 추가/제거). 이게 Aurora의 모든 차별점의 근원이다.

## 6 사본 × 3 AZ + Quorum: "어떤 조합의 실패에도 살아남는다"

Aurora 스토리지의 가장 유명한 그림은 "6 copies across 3 AZs". 이 숫자는 임의로 정해진 게 아니라 **분산 시스템의 fault tolerance 수학에서 유도된 최소값**이다.

```
3 AZ × 2 copies = 6 사본

쓰기 quorum: V_w = 4 (6 사본 중 4개 ack 받으면 commit)
읽기 quorum: V_r = 3 (6 사본 중 3개에서 읽으면 valid)

V_w + V_r > N (4 + 3 > 6) → 강한 일관성 보장
2 × V_w > N (8 > 6) → 동시 쓰기 충돌 방지
```

이 설정이 보장하는 것:

- **AZ 1개 + 추가 노드 1개 손실 = 읽기 가능** (남은 사본 3개로 V_r 만족)
- **AZ 1개 전체 손실 = 쓰기 가능** (남은 사본 4개로 V_w 만족)
- **AZ 2개 손실 = 데이터 손실 없음** (남은 사본 2개로 복구 가능)

> 💡 **관련 이론**: Quorum 기반 복제는 1979년 Robert Thomas의 "majority consensus algorithm"이 원조다. Werner Vogels의 2007년 Dynamo 논문이 이를 N/R/W 표기법으로 클라우드 스케일에 옮겼고, Cassandra·MongoDB·DynamoDB가 모두 같은 모델을 사용한다. Aurora의 (N=6, W=4, R=3)은 "데이터 한 청크가 살아남기 위해 동시에 잃을 수 있는 사본 수"를 가장 균형 있게 만든 선택이다. AZ 단위 장애 + 노드 단위 장애를 모두 견디려면 ① N≥6 ② N을 AZ로 나눈 값이 N-W ≥ 1이어야 함 → 3 AZ × 2 = 6, W = 4가 최소 해. 즉 6은 우연이 아니라 수학적 최적해다.

> 📚 **사례**: 2017년 2월 28일 AWS S3 us-east-1 대규모 장애(약 4시간)는 디버그 명령 오타로 인덱스 서버 다수가 한꺼번에 다운된 사고였다. 같은 시기 Aurora의 quorum 모델은 한 AZ가 통째로 사라져도 V_w=4를 유지하도록 설계되어 있어 비슷한 사고에서 데이터 일관성 위반 없이 살아남게 만든다. AWS Aurora 팀은 이후 quorum 모델을 더 강화해 "한 AZ + 한 노드 동시 손실에서도 읽기 가능"을 표준 SLO로 명시.

## Aurora Replica: 공유 스토리지가 만든 ms 단위 복제

RDS Read Replica는 각 replica가 자기 스토리지를 가지고 primary의 binlog를 받아 자기 디스크에 apply한다. 이 모델의 한계가 ① replica마다 스토리지 비용 발생 ② lag는 binlog 전송 + apply 속도에 의존(보통 수 초 ~ 수십 초) ③ replica 추가 시 초기 동기화에 시간 소요.

Aurora Replica는 **자체 스토리지가 없다**. Primary와 같은 분산 스토리지를 공유한다. 그래서:

- **복제 lag 10-20ms** (실제로는 redo log를 replica 캐시에 알려주는 시간만)
- **Replica 추가 시 즉시 사용 가능** (스토리지 복사 없음)
- **15개까지 확장** (RDS는 5개)
- **인스턴스 비용만 부담** (스토리지 비용 중복 없음)

| 차원 | RDS Read Replica | Aurora Replica |
|------|------------------|----------------|
| 스토리지 | 각자 보유 | 공유 |
| 복제 메커니즘 | 비동기 binlog/WAL | redo log 알림 (스토리지는 공유) |
| 복제 lag | 초 ~ 분 | 10-20ms |
| 최대 개수 | 5 (MySQL/PG/MariaDB는 15로 상향) | 15 |
| 초기 동기화 | 전체 copy 필요 | 즉시 |
| 페일오버 시간 | 수동 promote (수 분) | 자동 (~30초) |

> ⚠️ **함정**: Aurora Replica의 페일오버 시간이 30초인 건 **인스턴스 클래스가 같을 때**다. Primary와 다른 인스턴스 클래스의 replica를 가지고 있으면 페일오버 우선순위가 떨어지고, 페일오버 후 성능 저하가 일어날 수 있다. 시험에서 "Aurora 페일오버 후 성능 저하" 시나리오는 replica 인스턴스 크기 불일치가 답일 때가 있다. **Tier 0-15** 우선순위로 페일오버 순서를 명시할 수 있다.

## Aurora 엔드포인트 5종: 어디로 연결할지 결정하는 도구

Aurora는 RDS와 달리 인스턴스 단위 endpoint가 아닌 **클러스터 단위 endpoint**가 기본이다. 5종을 구분해서 외워야 한다.

| 엔드포인트 | DNS 형태 | 역할 |
|-----------|---------|------|
| **Cluster Endpoint (Writer)** | `myclu.cluster-xxxx.region.rds.amazonaws.com` | 현재 primary로 자동 라우팅 (페일오버 시 자동 갱신) |
| **Reader Endpoint** | `myclu.cluster-ro-xxxx.region.rds.amazonaws.com` | 모든 read replica에 DNS round-robin (load balancing) |
| **Custom Endpoint** | `myclu-analytics.cluster-custom-xxxx...` | 사용자가 지정한 인스턴스 그룹 (예: 분석 워크로드용 큰 replica만) |
| **Instance Endpoint** | `myinst-1.xxxx.region.rds.amazonaws.com` | 특정 인스턴스 직접 (운영 디버깅용) |
| **Global Database Writer** | 자동 발급 | Global DB의 모든 리전에서 같은 endpoint, 자동으로 primary 리전 writer로 라우팅 |

> 🔍 **더 깊이**: Reader Endpoint의 부하 분산은 **DNS 레벨**에서 일어난다. 같은 endpoint를 resolve하면 매번 다른 replica IP가 반환된다(TTL 5초). 이는 ① 클라이언트가 connection을 유지하면 그 connection은 한 replica에 묶임 — connection pool이 작으면 부하가 균등 분산 안 됨 ② TTL 캐싱하는 stub resolver(Java DNS 기본 캐시는 무한)는 갱신 안 됨. 실무에선 ① 짧은 connection lifetime ② Aurora 클라이언트 라이브러리(MariaDB Connector/J Aurora cluster aware, Aurora Postgres JDBC wrapper) 사용 ③ RDS Proxy로 routing 위임 셋 중 하나가 필요하다. 시험에서 "Reader Endpoint 사용했는데 한 replica에만 부하 몰림"은 connection 유지 + DNS 캐싱이 답.

```python
# 실무: 분석 워크로드를 custom endpoint로 격리
ANALYTICS_ENDPOINT = "myclu-analytics.cluster-custom-xxxx.region.rds.amazonaws.com"
OLTP_READER_ENDPOINT = "myclu.cluster-ro-xxxx.region.rds.amazonaws.com"
WRITER_ENDPOINT = "myclu.cluster-xxxx.region.rds.amazonaws.com"

def get_analytics_conn():
    return pymysql.connect(host=ANALYTICS_ENDPOINT, ...)

def get_oltp_read_conn():
    return pymysql.connect(host=OLTP_READER_ENDPOINT, ...)

def get_write_conn():
    return pymysql.connect(host=WRITER_ENDPOINT, ...)
```

## Aurora Serverless v2: ACU의 비밀

Aurora Serverless는 트래픽에 따라 컴퓨트 용량이 자동으로 늘었다 줄었다 한다. 단위는 **ACU(Aurora Capacity Unit)** — 1 ACU ≈ 2GB 메모리 + 그에 상응하는 CPU/네트워크. v1과 v2의 차이가 시험에 자주 나온다.

| 항목 | Aurora Serverless v1 (레거시) | Aurora Serverless v2 (권장) |
|------|------------------------------|------------------------------|
| 확장 단위 | 2배 단위 점프 (2→4→8 ACU) | 0.5 ACU 단위 미세 조정 |
| 확장 속도 | 분 단위 | 초 단위 |
| Min Capacity | 1 ACU (또는 일시정지) | 0 ACU (auto-pause) ~ 0.5 ACU |
| Max Capacity | 256 ACU | 256 ACU |
| 콜드 스타트 | 일시정지 후 첫 요청 ~30초 | 거의 없음 |
| Multi-AZ | 옵션 | 표준 |
| 데이터 API | ✅ | ✅ (2023부터) |
| 신규 | 단종 절차 | 권장 |

> 🔍 **더 깊이**: v1과 v2의 가장 큰 차이는 **확장 메커니즘**이다. v1은 새 인스턴스로 트래픽을 옮기는(scale-up) 방식 — 그래서 점프가 크고 느리다. v2는 라이브 인스턴스의 CPU/메모리 할당을 hypervisor 레벨에서 조정하는 방식 — Firecracker microVM의 동적 리소스 조정 기능을 활용해 인스턴스 교체 없이 ACU를 늘리고 줄인다. 이게 "초 단위 미세 조정"의 기술적 근거다. v2는 사실상 "사용량 기반 과금이 가능한 정규 Aurora 인스턴스"라고 봐도 된다.

> 💡 **사용 시나리오 결정 트리**:
> - 트래픽이 24시간 일정 → 일반 Aurora 인스턴스 (Reserved로 비용 절감)
> - 트래픽이 주기적이지만 예측 가능 → Aurora + Auto Scaling for replicas
> - 트래픽이 간헐적·예측 불가 → Aurora Serverless v2
> - 개발/스테이징 환경 (밤에는 사용 안 함) → Aurora Serverless v2 (auto-pause 활성화)
> - 데이터 API 호출이 주된 사용 → Aurora Serverless v2

## Aurora Global Database: 1초 미만 cross-region 복제의 비결

Aurora Global Database는 **primary 리전 1개 + secondary 리전 최대 5개**로 구성된다. RDS Cross-Region Read Replica와 다른 점은 ① 전용 복제 인프라(스토리지 레벨 복제) ② 일반적으로 lag < 1초 ③ Secondary가 자체 read replica 15개 보유 가능 ④ Cross-region failover 시 RTO < 1분.

```
[Primary Region: ap-northeast-2 서울]
  Aurora Writer + Replicas
       │
       │ (스토리지 레벨 replication, < 1초)
       │
       ├──→ [Secondary: us-east-1 버지니아]
       │      Read-only Aurora cluster
       │      자체 read replica 0-15개
       │
       └──→ [Secondary: eu-west-1 아일랜드]
              Read-only Aurora cluster
              자체 read replica 0-15개
```

> 🔍 **더 깊이**: Aurora Global Database의 복제는 **redo log shipping에 가깝지만 binlog가 아니다**. Primary의 스토리지 노드가 redo log를 추가로 secondary region의 스토리지 노드에게 직접 전송한다. 이 채널은 AWS backbone 네트워크(같은 백본 위에서 평균 RTT 100-200ms)를 사용하고, 압축·중복 제거가 적용되어 일반 인터넷 대비 효율적이다. 그 결과 cross-region lag이 1초 미만으로 유지된다. 시험에서 "글로벌 분산 + 1초 미만 lag + RDBMS" 시나리오는 거의 무조건 Aurora Global Database가 답.

| 차원 | RDS Cross-Region Read Replica | Aurora Global Database |
|------|--------------------------------|------------------------|
| 복제 방식 | binlog 비동기 | redo log shipping (전용 인프라) |
| 일반 lag | 수 초 ~ 수십 초 | < 1초 |
| 페일오버 | 수동 promote | Managed failover (< 1분) |
| Secondary 리전 수 | 다수 가능 (각각 별개 replica) | 최대 5개 (managed cluster) |
| Secondary read replica | N/A (자체가 replica) | 각 리전마다 15개까지 |
| RPO | 수십 초 ~ 분 | < 1초 |

> ⚠️ **함정**: Aurora Global Database의 secondary는 **읽기 전용**이다. 단순 write를 시도하면 read-only error. 또한 "관리되는 페일오버(managed failover)"는 명시적으로 트리거해야 하며 자동이 아니다 — primary region이 완전히 죽었을 때 운영자가 promote를 실행. 자동 failover가 필요하면 Route 53 health check + Lambda로 직접 자동화하거나 RDS Proxy 활용. 시험에서 "Aurora Global Database가 자동으로 failover 한다"는 보기는 함정.

## Aurora Backtrack vs PITR: in-place 시간 여행

Aurora MySQL에는 RDS에 없는 기능 — **Backtrack**이 있다. 데이터를 과거 시점으로 **새 인스턴스 생성 없이** 되돌린다. 최대 72시간 전까지 가능. PITR은 새 인스턴스를 만들지만 Backtrack은 같은 인스턴스를 시간만 되돌린다.

| 항목 | Backtrack | PITR |
|------|-----------|------|
| 새 인스턴스 생성 | ❌ (in-place) | ✅ |
| 속도 | 초 ~ 분 | 분 ~ 시간 (DB 크기 의존) |
| 지원 | Aurora MySQL만 | RDS + Aurora |
| 최대 기간 | 72시간 | 35일 |
| 비용 | Backtrack window 별도 | 자동 백업 무료 범위 |
| 시나리오 | "방금 DROP TABLE" 즉시 롤백 | 어제 사고난 데이터 복원 |

> 📚 **사례**: 2020년 한 게임 회사 개발자가 production Aurora MySQL에 `DELETE FROM users` 를 WHERE 절 없이 실행했다(개발 DB와 헷갈림). Backtrack이 활성화돼 있어 콘솔에서 "5분 전으로 되돌리기" 한 번에 약 3분 만에 복구. 만약 PITR이었으면 ① 새 인스턴스 생성(30분) ② 데이터 export/import(시간 단위) ③ 애플리케이션 endpoint 전환의 복잡한 절차가 필요했을 것. 시험에서 "Aurora에서 빠른 실수 복구"는 Backtrack이 답.

## Aurora Database Cloning: COW로 만든 즉시 클론

Aurora는 클러스터를 **수 초 만에 클론**할 수 있다. 클론은 같은 스토리지를 공유하면서 **copy-on-write** 방식으로 동작 — 클론에서 데이터를 수정해야 비로소 그 페이지만 새로 복사된다. 결과: ① 클론 생성 즉시 가능 ② 초기 비용 = 0 ③ 수정량만큼만 추가 스토리지 비용.

```
[Primary Aurora] ────┬──── [Clone A] (개발 환경)
                     │
                     ├──── [Clone B] (테스트 환경)
                     │
                     └──── [Clone C] (분석 워크로드)

처음엔 모두 같은 스토리지 페이지 공유
수정 발생 시 그 페이지만 클론 전용 복사 (COW)
```

> 💡 **실무 패턴**: production DB의 클론을 만들어 개발자가 production-grade 데이터로 테스트하는 패턴이 표준화됐다. 일반 mysqldump/export는 TB 단위에서 수 시간 걸리지만, Aurora 클론은 거의 즉시. CI/CD 파이프라인에서 매 빌드마다 클론을 만들어 테스트하고 끝나면 삭제하는 워크플로우도 흔하다.

## RDS vs Aurora 결정표

| 시나리오 키워드 | 권장 |
|----------------|------|
| 표준 MySQL/PostgreSQL/MariaDB/Oracle/SQL Server | RDS |
| 5배 성능 / 15 replica / 자동 스토리지 확장 | Aurora |
| 글로벌 분산 + 1초 미만 lag | Aurora Global Database |
| 간헐적 트래픽 + 자동 확장 | Aurora Serverless v2 |
| 72시간 내 in-place 롤백 | Aurora MySQL Backtrack |
| Oracle/SQL Server BYOL | RDS (Aurora 미지원) |
| 최소 비용 단순 DB | RDS (Aurora 대비 ~20% 저렴) |

## 정리하며

Aurora의 모든 차별점은 결국 **"스토리지 레이어를 재설계했다"**는 한 문장에서 파생된다. 6 사본 quorum이 가용성을 보장하고, 공유 스토리지가 replica를 ms 단위로 만들고, redo log shipping이 cross-region을 1초 미만으로 만들고, copy-on-write가 클론을 즉시 만든다. 시험은 이 인과관계를 시나리오 형태로 묻는다 — "어떤 요구사항에서 어떤 Aurora 기능이 답인가".

RDS는 "기존 DBMS를 클라우드에 옮긴" 1세대 관리형 DB, Aurora는 "DBMS를 클라우드 네이티브로 다시 설계한" 2세대다. DynamoDB는 "관계형 모델 자체를 버린" 또 다른 답이다. 같은 문제(데이터 영속성, 확장성, 가용성)에 세 가지 다른 답이 존재한다는 걸 이해하는 게 시험 시나리오를 푸는 핵심.

다음 글에서는 이번 주 전체(RDS + ElastiCache + Aurora)를 시나리오 중심으로 묶고, Week 7 종합 평가를 정리한다.

---

## 📝 연습 문제

**문제 1.** Aurora의 스토리지 구성으로 옳은 것은?

A) 단일 AZ에 1개 사본
B) 단일 AZ에 6개 사본
C) 3개 AZ에 6개 사본, 쓰기 quorum 4/6
D) 2개 AZ에 3개 사본, 쓰기 quorum 2/3

**정답: C**

해설: Aurora는 3개 AZ × 2 사본 = 6개 사본 분산 스토리지를 사용하며 쓰기 quorum V_w=4, 읽기 quorum V_r=3이다. V_w + V_r > N(6) 조건을 만족해 강한 일관성 보장. AZ 1개 손실에도 쓰기 가능(남은 4 사본으로 quorum 만족), AZ 1개 + 노드 1개 손실에도 읽기 가능. 이 수치는 분산 시스템의 fault tolerance를 만족하는 최소 해.

---

**문제 2.** Aurora Replica와 RDS Read Replica의 가장 큰 차이는?

A) Aurora Replica는 비동기 binlog 복제를 사용한다
B) Aurora Replica는 자체 스토리지가 없고 primary와 공유하므로 lag가 10-20ms로 매우 짧다
C) RDS Read Replica는 최대 30개까지 가능하다
D) 둘 다 동일하다

**정답: B**

해설: Aurora Replica의 핵심 차별점은 공유 스토리지 — replica는 자체 디스크 없이 primary와 같은 분산 스토리지를 참조한다. 복제 메커니즘은 "redo log 알림"만 보내고 실제 page는 스토리지에서 직접 읽으므로 lag가 10-20ms 수준(RDS Read Replica는 수 초 ~ 수십 초). A) Aurora는 binlog 비의존. C) RDS Read Replica는 최대 15개(MySQL/PG/MariaDB, 2022 상향). D) 큰 차이가 있다.

---

**문제 3.** 한 SaaS 회사가 글로벌 사용자를 대상으로 Aurora MySQL을 사용 중이다. 도쿄·런던에서도 read latency가 100ms 이하여야 하고, 서울 region이 다운되면 1분 내 다른 region으로 failover해야 한다. 가장 적합한 구성은?

A) 서울 Aurora Multi-AZ만 사용
B) 서울 Aurora + 도쿄·런던 Aurora Cross-Region Read Replica (각각)
C) Aurora Global Database (Primary: 서울, Secondary: 도쿄·런던)
D) DynamoDB Global Tables

**정답: C**

해설: Aurora Global Database는 ① 전용 인프라로 cross-region lag < 1초 ② managed failover RTO < 1분 ③ Primary region 완전 다운 시 secondary를 primary로 promote 가능 ④ 각 secondary region이 자체 read replica를 둘 수 있어 region 내 latency 최소화. B는 Aurora의 Cross-Region Read Replica로 가능하지만 lag와 failover 자동화가 약함. A는 cross-region 분산 안 됨. D는 RDBMS 호환성 잃음(요구사항이 Aurora MySQL이므로 부적합).

---

**문제 4.** Aurora Serverless v2의 특징으로 옳지 않은 것은?

A) ACU 단위로 자동 확장 (0.5 ACU 단위 미세 조정)
B) 콜드 스타트가 거의 없고 초 단위로 확장
C) v1과 달리 256 ACU까지 확장 가능
D) Min Capacity는 항상 1 ACU 이상이어야 한다

**정답: D**

해설: D는 틀렸다. Aurora Serverless v2의 Min Capacity는 0.5 ACU(2024년 이후 auto-pause를 통해 0 ACU도 가능). v1과 달리 더 작은 단위로 시작 가능. A) 0.5 ACU 단위로 점진적 확장. B) Firecracker microVM의 동적 리소스 조정 활용으로 초 단위. C) 256 ACU까지 확장 가능. 시험에서 v1 vs v2 비교는 "v2는 미세 조정 + 빠름 + 콜드 스타트 없음"이 핵심.

---

**문제 5.** Aurora Backtrack에 대한 설명으로 옳은 것은?

A) RDS와 Aurora 모두에서 사용 가능하다
B) 최대 35일 전까지 되돌릴 수 있다
C) Aurora MySQL에서만 사용 가능하며 in-place로 시간을 되돌린다 (새 인스턴스 생성 X)
D) PITR과 동일한 메커니즘이다

**정답: C**

해설: Backtrack은 Aurora MySQL만의 기능으로, 새 인스턴스 생성 없이 같은 클러스터를 과거 시점(최대 72시간 전)으로 되돌린다. 속도 매우 빠름(초~분 단위). A) RDS는 미지원. B) 35일이 아니라 최대 72시간. D) PITR은 새 인스턴스를 만들고 백업+log replay로 복원 — Backtrack과 다른 메커니즘. 시험에서 "Aurora에서 빠른 실수 복구" 시나리오는 Backtrack.

---

**문제 6.** Aurora Reader Endpoint의 부하 분산 메커니즘은?

A) 애플리케이션 레이어에서 round-robin
B) DNS 레벨에서 매 resolve 시 다른 replica IP 반환
C) Network Load Balancer 사용
D) Application Load Balancer 사용

**정답: B**

해설: Aurora Reader Endpoint는 DNS round-robin 방식으로 동작한다 — 같은 endpoint를 resolve할 때마다 다른 replica IP가 반환된다(TTL 5초). 그 결과 **connection을 길게 유지하면 한 replica에 묶임** — connection pool이 작으면 부하 불균등. 해결: 짧은 connection lifetime, Aurora cluster-aware 클라이언트(MariaDB Connector/J 등), 또는 RDS Proxy 사용. C)D) ALB/NLB는 Aurora 자체 endpoint와 무관.

---

**문제 7.** 한 핀테크 회사가 Aurora MySQL production DB의 데이터로 매일 밤 분석 환경을 만들고 싶다. 기존엔 mysqldump + import로 6시간 걸렸는데, 5분 안에 끝내고 싶다. 가장 적합한 방법은?

A) Aurora Cross-Region Read Replica 생성
B) Aurora Database Cloning (COW 기반 즉시 클론)
C) RDS Snapshot 매일 복사
D) DMS로 매일 마이그레이션

**정답: B**

해설: Aurora Database Cloning은 copy-on-write 방식으로 같은 스토리지를 공유하며 즉시 클론을 만든다 — TB 단위 데이터도 수 초 만에 클론 생성. 클론에서 수정한 페이지만 추가 스토리지 비용 발생. CI/CD나 매일 ETL 워크로드에 표준 패턴. A) Cross-Region은 region 간 복제용이지 즉시 클론용이 아님. C) Snapshot은 생성/복원에 시간 소요. D) DMS는 cross-engine 마이그레이션 도구로 동일 엔진 복제엔 과도.
