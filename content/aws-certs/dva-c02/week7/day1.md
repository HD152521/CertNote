# Day 1 - RDS: 관리형 RDBMS의 두 얼굴, Multi-AZ와 Read Replica

RDS를 처음 쓰는 사람들은 보통 "EC2에 MySQL 깔면 되는데 왜 굳이 RDS?"라고 묻는다. 그 답은 단순한 편의성이 아니다. RDS는 "관계형 데이터베이스의 운영(Day-2 ops)이라는, 사실은 가장 무겁고 가장 자주 실수가 발생하는 영역을 AWS가 대신 짊어진다"는 약속이다. 마이너 패치, 백업, 로그 회전, 페일오버 자동화, 스토리지 확장 — 이 모든 게 콘솔 토글이나 API 한 번으로 끝난다.

DVA-C02 시험에서 RDS가 차지하는 비중은 단순한 "DB 선택지"가 아니다. **Lambda·API Gateway·ECS 같은 컴퓨트 서비스가 어떤 데이터 스토어를 선택해야 하는지**를 묻는 거의 모든 시나리오 문제에 RDS가 후보로 등장한다. 그래서 Multi-AZ와 Read Replica의 차이, 그리고 이 둘이 Aurora나 DynamoDB와 어떻게 갈리는지를 머릿속에 명확히 그려두는 게 첫 번째 과제다.

## RDS의 탄생 배경: "DBA가 사라진 자리"

RDS는 2009년 10월 출시됐다. 당시 AWS는 EC2(2006)와 S3(2006)로 IaaS 시장을 장악한 상태였지만, "EC2에 DB를 직접 깔자"는 흐름은 의외로 더디게 퍼졌다. 이유는 DBA의 부재였다. 스타트업이 EC2에 MySQL을 띄우긴 쉬워도, 매일 새벽 백업이 깨졌을 때 복구할 사람이 없었다. 데이터 한 번 날리면 서비스가 끝나는 회사가 속출했다.

RDS는 그 공백을 메우려고 나왔다. **자동 백업·자동 패치·자동 페일오버**를 옵션 토글 수준으로 내려서, DBA 없는 팀도 운영 가능한 RDBMS를 제공한다는 것이 핵심 가치 제안이다. 이게 시험에서 자주 묻는 "EC2 self-managed vs RDS managed"의 본질이다. EC2는 자유와 책임을 모두 가져가고, RDS는 자유를 일부 양보하는 대신 책임을 AWS에 넘긴다.

| 비교 차원 | EC2에 직접 설치 | RDS | Aurora |
|----------|----------------|-----|--------|
| OS·엔진 패치 | 직접 | AWS 자동 (윈도우 지정) | AWS 자동 |
| 자동 백업 | 직접 cron | 자동 (1-35일 보존) | 자동 + Backtrack |
| 페일오버 | HAProxy/Keepalived 수동 구성 | Multi-AZ (1-2분 자동) | 30초 이내 |
| 스토리지 | EBS 수동 확장 | Auto Scaling 옵션 | 10GB-128TB 자동 |
| 슈퍼유저 권한 | ✅ | ❌ (`rdsadmin` 제외) | ❌ |
| SSH 접근 | ✅ | ❌ | ❌ |
| OS 커스텀 모니터링 | ✅ | Enhanced Monitoring만 | 동일 |
| 가격 (동일 사양) | 인스턴스 + EBS | 약 20-30% 프리미엄 | 약 50% 프리미엄 (성능 5배) |

> 💡 **관련 이론**: RDS의 "관리형"이라는 추상화는 클라우드 컴퓨팅 모델의 PaaS(Platform-as-a-Service) 범주에 해당한다. NIST SP 800-145가 정의한 PaaS는 "고객이 인프라(네트워크, 서버, OS, 스토리지)를 관리하지 않지만 배포된 애플리케이션의 구성은 제어한다"고 명시한다. RDS에서 고객이 만지는 건 DB 파라미터 그룹, 사용자 권한, 스키마, 데이터뿐이고 그 아래는 모두 AWS 책임이다.

지원 엔진은 6종이다. **MySQL, PostgreSQL, MariaDB**는 오픈소스로 라이선스 비용이 없고, **Oracle, SQL Server**는 상용 라이선스가 별도로 붙는다(Oracle은 BYOL 가능, SQL Server는 License Included만 가능). **Aurora MySQL/PostgreSQL**은 AWS가 호환만 유지하면서 스토리지·복제 레이어를 완전히 재설계한 별개 엔진으로, RDS의 한 변종이지만 내부 아키텍처는 전혀 다르다(Day 34에서 상세히).

## Multi-AZ: 동기 복제와 자동 페일오버의 내부 구조

Multi-AZ는 한 줄로 표현하면 "다른 AZ에 standby를 두고 synchronous physical replication으로 동일 상태를 유지하다가, primary가 죽으면 DNS 엔드포인트를 standby로 옮긴다"는 메커니즘이다. 그런데 이 한 줄 안에 시험 문제와 실무 사고가 줄줄이 숨어 있다.

먼저 **synchronous physical replication**의 의미. MySQL/PostgreSQL의 일반적인 binlog 기반 복제는 logical replication이지만, RDS Multi-AZ는 그 아래 스토리지 레이어에서 EBS Multi-Attach와 유사한 블록 수준 복제를 쓴다(엄밀히는 DRBD 계열의 동기 블록 복제). 클라이언트가 commit을 보내면 primary는 **standby에서 write ack를 받기 전까지 클라이언트에 OK를 못 돌려준다**. 이게 동기 복제의 본질이고, RPO(Recovery Point Objective)를 거의 0에 수렴시키는 비결이다.

```
              [클라이언트]
                  | commit
                  v
            [Primary RDS] (AZ-a)
                  |
                  | EBS 블록 동기 복제 (AZ 간 RTT 1-2ms)
                  v
            [Standby RDS] (AZ-b)
                  |
                  | write ack
                  ^
              [클라이언트]에 commit OK
```

> 🔍 **더 깊이**: AZ 간 RTT가 1-2ms라는 사실은 Multi-AZ의 성능 비용을 직접 결정한다. 한 트랜잭션의 commit latency가 single-AZ 대비 평균 +1-2ms 증가한다. OLTP 워크로드에서 TPS 10,000 수준이라면 이 latency가 connection pool 깊이와 곱해져 처리량을 떨어뜨릴 수 있다. 이게 "Multi-AZ는 RPO≈0의 대가로 약 10-15% 성능 페널티를 받는다"는 운영 통설의 근거다. 시험에선 "성능이 우선" 시나리오에 Multi-AZ를 답으로 고르면 함정에 빠진다.

페일오버 트리거는 6가지다. ① primary AZ 장애 ② primary 인스턴스 장애 ③ 네트워크 분할 ④ DB 인스턴스 클래스 변경(scale-up) ⑤ OS 패치 ⑥ 수동 `reboot --force-failover`. ⑤⑥은 운영자가 의도적으로 trigger하는 케이스다. 페일오버 자체는 **60-120초**가 일반적이고, DNS TTL이 짧기 때문에(보통 5-30초) 애플리케이션 연결만 재시도 로직이 있으면 자동 재연결된다.

> ⚠️ **함정**: "Multi-AZ Standby에서 읽기 쿼리를 처리할 수 있는가?" — **기존 Multi-AZ DB Instance Deployment에서는 불가능**. Standby는 오직 페일오버 대기 + 백업 I/O 분산 용도다. 2022년 도입된 **Multi-AZ DB Cluster Deployment**(MySQL/PostgreSQL only)는 2개의 read-capable standby를 두어 standby에서 읽기가 가능하다. 시험에서 "Multi-AZ인데 standby에서 읽고 싶다"는 시나리오가 나오면 후자를 골라야 한다.

다른 클라우드와 비교하면 설계 철학이 더 또렷이 보인다.

| 차원 | AWS RDS Multi-AZ | GCP Cloud SQL HA | Azure Database for MySQL Flexible Server |
|------|------------------|------------------|------------------------------------------|
| 복제 방식 | 블록 수준 동기 | regional persistent disk (블록 동기) | binlog 기반 동기 |
| 페일오버 시간 | 60-120초 | 60초 이내 | 60-120초 |
| Standby 읽기 | 불가 (Cluster mode는 가능) | 불가 | Replica 옵션 별도 |
| 가격 | 2배 (standby 인스턴스 비용) | 약 2배 | zone-redundant HA 약 2배 |

> 📚 **사례**: 2019년 8월 23일 AWS Tokyo 리전(`ap-northeast-1`)의 한 AZ에서 냉방 시스템 제어 SW 버그로 일부 서버가 과열, EC2·EBS·RDS가 약 6시간 영향을 받았다. 당시 Multi-AZ로 구성된 RDS는 자동 페일오버로 다른 AZ standby가 primary가 됐지만, **Single-AZ 배포된 RDS는 같은 AZ EBS가 죽으면서 함께 다운**됐다. 회고의 핵심 교훈: "RDS의 데이터는 한 AZ의 EBS에 묶여 있으므로, Single-AZ는 곧 Single-Point-of-Failure다." 일본 메르카리, 라쿠텐 일부 서비스가 영향받았다고 보고됐다.

## Read Replica: 비동기 복제로 풀어내는 읽기 확장

Read Replica는 Multi-AZ와 완전히 다른 문제를 푼다. Multi-AZ가 **가용성(availability)**을 푼다면, Read Replica는 **확장성(scalability)**, 그것도 읽기 트래픽 한정의 확장성을 푼다.

내부 동작은 **logical asynchronous replication**이다. MySQL이면 binlog, PostgreSQL이면 WAL streaming replication. primary가 트랜잭션을 commit하면 그 변경이 binlog/WAL에 기록되고, replica의 IO thread가 이를 pull해서 자기 storage에 apply한다. **primary는 replica의 ack를 기다리지 않는다** — 그래서 primary 성능에 영향이 거의 없는 대신, replica는 항상 primary보다 수 ms ~ 수십 초 뒤처질 수 있다(replication lag).

```python
# 실무 패턴: 읽기/쓰기 라우팅 분리
import pymysql
from contextlib import contextmanager

WRITER_HOST = "mydb.cxxxx.ap-northeast-2.rds.amazonaws.com"
READER_HOSTS = [
    "mydb-ro-1.cxxxx.ap-northeast-2.rds.amazonaws.com",
    "mydb-ro-2.cxxxx.ap-northeast-2.rds.amazonaws.com",
]

@contextmanager
def write_conn():
    conn = pymysql.connect(host=WRITER_HOST, user="app", ...)
    try: yield conn
    finally: conn.close()

@contextmanager
def read_conn():
    import random
    host = random.choice(READER_HOSTS)  # 단순 로드밸런싱
    conn = pymysql.connect(host=host, user="app_ro", ...)
    try: yield conn
    finally: conn.close()

# 사용
def get_user_profile(user_id):
    with read_conn() as c:  # 읽기는 replica
        return c.execute(...)

def create_order(order):
    with write_conn() as c:  # 쓰기는 primary
        return c.execute(...)
```

> ⚠️ **함정 (Read-Your-Writes 문제)**: "주문을 방금 INSERT 한 사용자가 바로 주문 목록을 조회"하는 시나리오에서 replica에 lag가 있으면 방금 만든 주문이 안 보인다. 해결 패턴 세 가지. ① 동일 세션 내 쓰기 직후 N초간은 primary에서 읽기 ② Aurora처럼 lag가 ms 단위인 엔진 사용 ③ session token/cookie에 commit timestamp를 박아 replica가 그 시점 이후 적용된 데이터인지 확인. 이게 분산 시스템에서 말하는 **session consistency**(또는 **monotonic read consistency**) 보장 패턴이다.

> 💡 **관련 이론**: Read Replica의 비동기 복제는 분산 시스템의 **eventually consistent** 모델이다. Werner Vogels(AWS CTO)가 2008년 CACM에 쓴 "Eventually Consistent" 논문이 이 모델의 정전(canonical) 문헌이다. CAP 정리(Brewer 2000) 관점에서 Read Replica는 "쓰기 가용성과 읽기 확장성을 위해 강일관성을 일부 양보"하는 AP 시스템에 가깝다. PACELC(Abadi 2012)로 보면 RDS Read Replica는 PA/EL — 분할 시에도 가용성, 평상시에도 latency를 위해 일관성 양보 — 분류에 들어간다.

Read Replica의 제약을 시험에서 자주 묻는다.

- **최대 개수**: RDS MySQL/MariaDB/PostgreSQL은 **15개** (2022년 이전엔 5개였는데 상향됨). Oracle/SQL Server는 5개. Aurora는 15개.
- **다단계 chained replica**: MySQL은 가능(replica의 replica), PostgreSQL은 cascading replication 지원. 시험에선 거의 안 다룸.
- **Cross-Region Read Replica**: 다른 리전에 비동기 복제. DR 용도 + 글로벌 읽기 분산. 데이터 전송 비용 발생.
- **Promote(승격)**: replica를 독립 primary로 전환. 한번 promote하면 **역방향 복제 불가** — 새 primary가 됨. DR 시나리오에서 자주 묻는다.
- **자동 백업 필수**: Read Replica를 만들려면 source DB의 자동 백업이 활성화돼 있어야 한다(보존 기간 ≥ 1일). "Read Replica 생성 실패" 시나리오의 단골 원인.

## Multi-AZ vs Read Replica: 한 표로 끝내는 결정

이 둘이 같이 묶여 헷갈리는 건 **DNS 엔드포인트가 다르고, 둘 다 "AZ가 분리된다"**는 공통점 때문이다. 그러나 푸는 문제 자체가 다르다.

| 차원 | Multi-AZ | Read Replica |
|------|----------|--------------|
| 목적 | HA / DR | 읽기 확장 + (선택적) DR |
| 복제 방식 | Synchronous block-level | Asynchronous logical |
| 일관성 | Strong (RPO≈0) | Eventual (lag 존재) |
| Standby 읽기 | ❌ (Cluster mode는 ✅) | ✅ |
| 자동 페일오버 | ✅ (60-120초) | ❌ (수동 promote) |
| 최대 개수 | 1 standby | 15 (MySQL/PG) |
| Cross-Region | ❌ (단일 리전) | ✅ |
| 추가 비용 | 인스턴스 2배 | replica 인스턴스당 |
| 시나리오 키워드 | "고가용성", "자동 페일오버", "DR" | "읽기 부하", "분석 쿼리", "지리적 분산" |

> 💡 **실무 패턴**: 두 기능은 **동시 사용 가능**하고, 실제로 production에서 가장 흔한 조합은 "Multi-AZ + 2-3개 Read Replica"다. Multi-AZ가 single-AZ 장애 대응을, Read Replica가 읽기 트래픽 분산과 분석 쿼리 격리를 담당한다. 시험 시나리오에서 "고가용성 + 분석 워크로드 격리"가 동시에 나오면 둘 다 답이다.

## RDS Proxy: Lambda × RDS의 connection storm 해결사

DVA 시험에서 RDS Proxy는 거의 매 회 1-2문항 나온다. 이유는 명확하다 — **Lambda + RDS 조합의 가장 큰 안티패턴**을 해결하는 도구이기 때문이다.

문제 상황: Lambda는 요청당 컨테이너가 생기고 죽는다. 동시 호출이 1,000개 들어오면 Lambda 1,000개가 각자 RDS에 새 TCP 연결을 만든다. MySQL은 connection 하나당 메모리 ~256KB ~ 1MB를 쓰고, max_connections는 인스턴스 클래스에 따라 100-1,000 수준이다. 즉 burst 트래픽 한 번에 RDS가 "Too many connections" 에러를 토하며 죽는다.

RDS Proxy는 그 사이에 **connection pool**을 둔다. Lambda는 proxy에 연결하고, proxy는 RDS에 미리 만들어둔 connection들을 재사용한다. 결과: RDS의 실제 connection 수는 proxy pool 크기로 고정되고, Lambda 동시성과 디커플링된다.

| 효과 | 수치 |
|------|------|
| Connection 재사용 | RDS connection 사용량 최대 66% 감소 |
| Failover 시간 | 클라이언트 인지 failover 66% 단축 |
| IAM 인증 통합 | Lambda 실행 역할로 DB 접근 |
| Secrets Manager 통합 | 비밀번호 자동 회전 지원 |

> 🔍 **더 깊이**: RDS Proxy는 내부적으로 **multiplexing**과 **connection pinning** 두 모드를 쓴다. Multiplexing은 여러 클라이언트 요청을 하나의 백엔드 connection에 인터리브해서 보내는 모드(가장 효율적). 그러나 트랜잭션 안에서 `SET` 같은 세션 변수를 쓰거나 `LOCK TABLES`, prepared statement, temp table을 쓰면 proxy가 **pinning**으로 전환해 그 클라이언트에 backend connection을 묶어버린다. Pinning이 많아지면 사실상 connection pool 효과가 사라지므로 CloudWatch `DatabaseConnectionsCurrentlySessionPinned` 메트릭을 모니터링해야 한다.

> 📚 **사례**: 2020년 12월 AWS re:Invent 발표 자료에 따르면 Intuit는 TurboTax 워크로드에서 Lambda → Aurora 직접 연결로 인한 connection exhaustion으로 매년 세금 신고 마감 시즌에 장애를 겪었다. RDS Proxy 도입 후 동일 트래픽에서 RDS 인스턴스 크기를 한 단계 낮출 수 있었고 장애가 사라졌다. AWS 공식 블로그 "Improving application availability with Amazon RDS Proxy"에 포함된 사례.

## CLI로 직접 만져보기

```bash
# 1) Multi-AZ로 RDS 생성
aws rds create-db-instance \
  --db-instance-identifier mydb \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --master-username admin \
  --master-user-password "$(aws secretsmanager get-random-password --output text --query RandomPassword)" \
  --allocated-storage 20 \
  --multi-az \
  --backup-retention-period 7 \
  --storage-encrypted

# 2) Read Replica 생성
aws rds create-db-instance-read-replica \
  --db-instance-identifier mydb-ro-1 \
  --source-db-instance-identifier mydb

# 3) 페일오버 수동 트리거 (테스트)
aws rds reboot-db-instance \
  --db-instance-identifier mydb \
  --force-failover

# 4) Replica를 독립 DB로 promote
aws rds promote-read-replica \
  --db-instance-identifier mydb-ro-1
```

## 정리하며

RDS의 두 가지 핵심 기능은 결국 분산 시스템의 두 가지 trade-off를 그대로 옮긴 것이다. **Multi-AZ는 강일관성을 유지하면서 가용성을 확보하기 위해 한 AZ 안에서 동기 복제를 쓴다**(같은 리전 내 CP). **Read Replica는 글로벌 읽기 확장을 위해 일관성을 약화시키고 비동기 복제를 쓴다**(AP). 이 두 도구를 같이 쓰면 production-grade RDBMS 운영이 가능하다.

다음 글에서는 RDS의 또 다른 핵심 영역 — 암호화, IAM 인증, 백업, 모니터링 — 을 본다. Capital One 같은 사고가 왜 일어났는지, IMDSv2와 IAM DB Authentication이 그 답으로 어떻게 자라났는지를 같이 본다.

---

## 📝 연습 문제

**문제 1.** 한 핀테크 회사가 다음 요구사항을 모두 만족하는 RDS 아키텍처를 설계해야 한다. ① 단일 AZ 장애 시 RPO ≈ 0, RTO < 2분 ② 분석 팀의 무거운 read 쿼리가 OLTP 성능에 영향을 주지 않도록 격리 ③ 서울 ↔ 도쿄 간 DR 가능. 최소 비용으로 만족하는 구성은?

A) Multi-AZ만 활성화
B) Multi-AZ + 동일 리전 Read Replica 2개
C) Multi-AZ + 동일 리전 Read Replica 1개 + Cross-Region Read Replica(도쿄)
D) Aurora Global Database

**정답: C**
해설: 요구사항 ①은 Multi-AZ(동기 복제)로 RPO≈0, 자동 페일오버 60-120초로 RTO < 2분을 만족한다. 요구사항 ②는 동일 리전 Read Replica를 분석 워크로드 전용으로 두면 OLTP primary와 격리된다(또는 custom endpoint로 분석 replica 그룹 지정). 요구사항 ③은 Cross-Region Read Replica가 도쿄로 비동기 복제하므로 DR 가능. D)도 모두 만족하지만 Aurora는 약 50% 프리미엄이 붙어 "최소 비용" 조건에서 탈락한다. B)는 cross-region이 빠져 ③ 미충족. A)는 ②③ 모두 미충족.

---

**문제 2.** Lambda 함수가 burst 트래픽 시 RDS MySQL에 "Too many connections" 에러를 일으킨다. 가장 직접적이고 비용 효율적인 해결책은?

A) RDS 인스턴스 클래스를 한 단계 올려 max_connections 증가
B) Lambda 동시성 제한(reserved concurrency)을 낮춰 connection 수 제한
C) RDS Proxy를 도입해 connection pooling
D) DynamoDB로 마이그레이션

**정답: C**
해설: RDS Proxy는 정확히 이 문제(Lambda 폭증 → connection exhaustion)를 해결하려고 만들어진 서비스다. Connection 재사용으로 RDS 실제 connection 사용량 최대 66% 감소, 인스턴스 크기 유지 가능. A)는 비용이 크게 증가하고 근본 문제를 해결하지 않음(트래픽 더 커지면 또 터짐). B)는 throughput을 인위적으로 제한하는 비즈니스적 손해. D)는 데이터 모델 자체 변경이 필요한 과도한 솔루션. 시험에서 "Lambda + RDS + connection 문제"는 거의 무조건 RDS Proxy가 답.

---

**문제 3.** RDS Multi-AZ에 대한 다음 설명 중 옳은 것은?

A) Standby에서 읽기 쿼리를 실행해 primary 부하를 분산할 수 있다 (기본 Multi-AZ DB Instance)
B) 페일오버 시 새로운 DNS 엔드포인트로 변경해야 한다
C) 같은 AZ 안의 다른 서버로 standby가 배치된다
D) Synchronous block-level replication을 사용해 RPO가 거의 0이다

**정답: D**
해설: D)가 정확하다. 블록 수준 동기 복제로 commit이 standby에 도달한 후 클라이언트에 ack 반환, RPO≈0. A)는 함정 — 기본 Multi-AZ DB Instance Deployment에서는 standby 읽기 불가. 2022년 도입된 Multi-AZ DB Cluster Deployment(MySQL/PostgreSQL only)는 가능. B)는 틀림 — 페일오버 시 동일 DNS 엔드포인트가 새 primary IP로 해석된다(애플리케이션 변경 불필요). C)는 틀림 — standby는 반드시 다른 AZ에 배치된다(이게 Multi-"AZ"의 본질).

---

**문제 4.** RDS Read Replica의 특성으로 옳지 않은 것은?

A) Cross-Region으로 생성 가능하며 DR 용도로 사용할 수 있다
B) Promote 후에는 원본과의 복제가 끊기고 독립 DB가 된다
C) 비동기 복제이므로 쓰기 직후 즉시 동일 데이터를 읽을 수 있다
D) source DB의 자동 백업이 비활성화돼 있으면 생성할 수 없다

**정답: C**
해설: C)가 틀렸다. 비동기 복제이므로 replication lag(보통 수 ms ~ 수 초, 부하 높으면 수 분)가 있어 쓰기 직후 replica 조회 시 stale data가 반환될 수 있다(Read-Your-Writes 문제). 해결책은 "동일 세션 쓰기 직후 N초간은 primary 읽기" 패턴 또는 Aurora Replica(공유 스토리지로 ms 단위)로 전환. A)는 옳다(Cross-Region Read Replica는 DR 표준 패턴). B)는 옳다(promote 후 역방향 복제 불가, 독립 DB). D)는 옳다(자동 백업 0일 설정 시 Read Replica 생성 실패가 단골 함정).

---

**문제 5.** EC2에 직접 MySQL을 설치한 환경에서 RDS로 마이그레이션할 때 잃게 되는 권한·기능이 아닌 것은?

A) OS SSH 접근
B) DB 슈퍼유저 권한(예: `root` for MySQL)
C) 자동 백업
D) 커스텀 OS 레벨 모니터링 에이전트 설치

**정답: C**
해설: 자동 백업은 RDS로 옮기면 **새로 얻는** 기능이다(EC2에서는 cron + mysqldump를 수동 구성). A)B)D)는 모두 RDS에서 잃는다. RDS는 OS SSH 접근 불가(Enhanced Monitoring으로 OS 메트릭은 1초 간격 조회 가능하나 셸 진입은 불가). MySQL `root`는 막혀 있고 `rdsadmin` 사용자에게만 슈퍼유저 권한이 있어 일부 명령(`SUPER`, `FILE` 등)이 제한된다. 커스텀 에이전트(Datadog agent 등) 설치는 불가하고 Enhanced Monitoring·Performance Insights·CloudWatch만 사용 가능. 이게 "관리형 서비스는 자유를 양보하고 책임을 위임한다"는 trade-off의 구체적 모습이다.

---

**문제 6.** Aurora가 아닌 RDS MySQL/PostgreSQL에서 **standby에서 읽기 쿼리를 처리**하려면?

A) Read Replica를 추가한다
B) Multi-AZ DB Cluster Deployment를 사용한다
C) Aurora로 마이그레이션한다
D) RDS Proxy를 도입한다

**정답: B (A도 부분 정답)**
해설: 질문의 핵심은 "standby에서 읽기"다. 2022년 도입된 Multi-AZ DB Cluster Deployment는 2개의 readable standby + 1 writer 구조로 standby 자체에서 읽기 가능(synchronous quorum 복제 사용, RPO≈0 유지). A) Read Replica는 standby가 아니라 별도의 비동기 replica이므로 엄밀히 "standby 읽기"는 아님 — 다만 읽기 확장 목적이라면 A도 유효. C)는 과도한 변경. D)는 connection pooling만 제공하고 읽기/쓰기 분리는 자동으로 안 함(애플리케이션에서 endpoint 분리 필요). 시험에서 "standby" 단어가 명시되면 B를 우선 고려.

---

**문제 7.** 한 게임 회사가 Asia-Pacific 전역 사용자를 대상으로 리더보드 조회 응답 latency를 100ms 이하로 유지하려 한다. 데이터는 MySQL에 저장돼 있고 쓰기는 서울 리전에서만 발생한다. 가장 적합한 구성은?

A) 서울 RDS Multi-AZ만 사용
B) 서울 RDS + 도쿄·싱가포르 Cross-Region Read Replica
C) 서울 Aurora Global Database (Secondary: 도쿄, 싱가포르)
D) DynamoDB Global Tables

**정답: C (B도 가능하나 C가 우월)**
해설: 요구사항은 "글로벌 읽기 분산 + 낮은 latency + 단일 쓰기 리전". B)는 RDS Cross-Region Read Replica로 가능하지만 복제 지연이 수 초 ~ 수십 초 수준이고 페일오버가 수동. C) Aurora Global Database는 전용 복제 인프라로 **1초 미만** 복제 지연 + RPO < 1초, RTO < 1분을 보장하며 secondary 리전 최대 5개까지 확장 가능. 게임 리더보드처럼 "신선도가 중요한 읽기"에 더 적합. D)는 RDBMS 모델을 NoSQL로 바꿔야 해서 마이그레이션 비용이 크고, 트랜잭션·JOIN이 필요한 워크로드에 안 맞음. A)는 글로벌 분산을 못 함.
