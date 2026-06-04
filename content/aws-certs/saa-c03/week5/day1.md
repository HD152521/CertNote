# Day 21 - RDS: 관계형 데이터베이스를 클라우드에서 운영한다는 것

관계형 데이터베이스는 1970년 에드거 코드(Edgar F. Codd)가 IBM 연구소에서 발표한 "A Relational Model of Data for Large Shared Data Banks"(CACM, 1970)에서 시작됐다. 그로부터 50여 년이 지난 지금도 OLTP 워크로드의 절대 다수는 여전히 관계형 모델 위에 돌아간다. AWS RDS는 그 오래된 기술을 클라우드에서 운영하는 부담을 크게 줄이는 서비스다. "관리형"이라는 말이 구체적으로 무엇을 뜻하는지, 그리고 Multi-AZ와 Read Replica가 왜 다른 목적으로 만들어졌는지를 깊이 파고들면 SAA-C03 시험의 DB 문제 절반은 자동으로 풀린다.

## RDS가 해결하는 문제 — 자체 운영 DB의 무게

EC2에 MySQL을 직접 설치해서 운영해본 사람은 알 것이다. OS 패치, MySQL 버전 업그레이드, 슬로우 쿼리 모니터링, 바이너리 로그 관리, 백업 스크립트 cron 설정, 스토리지 용량 알람… 이것들이 모두 DBA나 운영 엔지니어의 몫이 된다. RDS는 그 부담 중 상당 부분을 AWS가 가져간다.

RDS가 관리해주는 것: 하드웨어 프로비저닝, 데이터베이스 소프트웨어 설치 및 패치, 자동 백업, 포인트-인-타임 복구, 모니터링 대시보드, Multi-AZ 복제. RDS가 관리하지 않는 것: 쿼리 최적화, 스키마 설계, 인덱스 전략, 애플리케이션 레벨 암호화, IAM 정책 설정. 공동 책임 모델이 여기서도 작동한다.

> 💡 **관련 이론**: RDS는 NIST SP 800-145가 정의하는 PaaS(Platform as a Service)에 해당한다. 고객은 "플랫폼 위의 애플리케이션"만 책임지고, 플랫폼(DB 엔진, OS, 네트워크 인프라)은 AWS 몫이다. EC2 위의 자체 MySQL은 IaaS로, 게스트 OS 패치부터 모든 것이 고객 책임이다. 이 차이가 시험에서 "누구의 책임인가" 문제의 핵심 분기점이 된다.

## 6개 엔진과 선택 기준

RDS가 지원하는 엔진은 MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, Aurora다. Aurora는 같은 RDS 콘솔에서 출발하지만 내부 아키텍처가 완전히 다르므로 다음 날 별도로 다룬다. 나머지 5개는 "커뮤니티/상용 엔진의 관리형 버전"이고, 동작 방식은 온프레미스와 거의 같다.

엔진 선택 기준은 대부분 기존 애플리케이션이 결정한다. Oracle RAC 라이선스를 이미 갖고 있는 기업은 RDS Oracle, SQL Server 스토어드 프로시저에 깊이 의존하는 레거시 앱은 RDS SQL Server를 고른다. 새로운 프로젝트라면 오픈 소스 라이선스 비용이 없는 MySQL이나 PostgreSQL, 또는 처음부터 Aurora를 선택하는 게 일반적이다.

| 엔진 | 오픈소스 | MySQL 호환 | PG 호환 | 특이사항 |
|------|----------|-----------|---------|---------|
| MySQL | O | - | - | 가장 많이 쓰이는 선택 |
| PostgreSQL | O | - | - | JSON, GIS, 확장성 강점 |
| MariaDB | O | 대부분 | - | MySQL에서 포크, 일부 기능 차이 |
| Oracle | X (상용) | - | - | BYOL 또는 License Included |
| SQL Server | X (상용) | - | - | Windows 인증, AD 통합 |
| Aurora | AWS 전용 | O (MySQL 호환) | O (PG 호환) | 다음 날 별도 심화 |

> ⚠️ **함정**: Oracle과 SQL Server는 RDS에서도 게스트 OS 접근이 불가능하다. 온프레미스에서 OS 레벨 customization에 의존하는 앱은 마이그레이션 전에 반드시 의존성을 확인해야 한다.

## Multi-AZ — 고가용성의 작동 방식을 내부에서 보기

Multi-AZ가 동기식 복제라는 것은 많은 사람이 알지만, 그 동기식 복제가 정확히 어떻게 동작하는지는 잘 모른다. 이 내부 원리를 이해하면 시험 문제의 "왜 Multi-AZ는 read 트래픽을 처리하지 못하는가" 같은 질문도 자연스럽게 풀린다.

MySQL RDS Multi-AZ는 Amazon의 독점 복제 기술(MySQL의 binlog replication이 아닌 블록 레벨 또는 페이지 레벨 복제)을 사용한다. Primary가 쓰기를 받으면 동기적으로 같은 데이터를 Standby에 전송하고, Standby가 "받았다"는 확인 응답을 보내야 Primary에서 트랜잭션이 커밋된다. 이 과정에서 Standby는 해당 데이터를 적용하지만 애플리케이션의 연결을 수락하지 않는다. Standby는 단지 "장애 대기 상태(hot standby)"다.

```
클라이언트 → RDS Endpoint (CNAME)
                   │
                   ▼
            [Primary AZ-a]  ← 읽기/쓰기 모두 처리
                   │  동기 복제 (AZ 간 1-2ms RTT)
                   │  Primary ACK 전에 Standby 확인 필수
                   ▼
            [Standby AZ-b]  ← 복제만 받음, 트래픽 없음
                   │
                   └─ 장애 시 CNAME이 Standby를 가리키도록 변경
                      (보통 60-120초, DNS TTL에 따라 다름)
```

페일오버가 발생하면 두 가지 일이 일어난다. 첫째, RDS가 Standby를 새로운 Primary로 승격한다. 둘째, DNS CNAME 레코드가 새 Primary의 IP를 가리키도록 변경된다. 이 때문에 애플리케이션이 RDS Endpoint(DNS 이름)를 사용하면 DNS TTL 후에 새 Primary로 자동으로 연결이 전환된다. 만약 IP 주소를 하드코딩하면 페일오버 후에도 죽은 Primary에 계속 연결 시도하는 재앙이 발생한다.

> 💡 **관련 이론**: 이 설계는 분산 시스템의 동기 복제 패턴인 "2PC(Two-Phase Commit)"의 변형과 유사하다. Primary가 Prepare를 하고 Standby의 Acknowledge를 받아야 Commit이 완료되는 구조다. 이 구조는 Consistency를 강력하게 보장하지만 Standby가 느리거나 AZ 간 네트워크가 끊어지면 Primary의 쓰기 지연이 늘어나는 trade-off가 있다. AWS는 AZ 간 전용 저지연 광섬유(보통 1-2ms RTT)로 이 trade-off를 최소화한다. 이것이 Multi-AZ의 RPO가 사실상 0인 이유다 — Standby ACK 없이는 Primary 커밋이 불가능하기 때문이다.

> 🔍 **더 깊이**: RDS Multi-AZ Cluster는 2021년 말 출시된 신규 옵션이다. 기존 Multi-AZ(1 Primary + 1 Standby)와 달리, 1 Writer + 2 Readable Standby로 구성된다. Readable Standby는 읽기 트래픽을 처리할 수 있어서 기존 Multi-AZ보다 읽기 성능이 개선되고, 페일오버 시간도 35초 이내로 단축된다. SAA-C03 시험에서는 이 Multi-AZ Cluster를 "Multi-AZ"와 구분해서 출제하는 경우가 있으니 주의해야 한다. 시험 지문에 "readable standby" 또는 "multi-az cluster"가 명시되지 않으면 일반 1+1 구조를 가정하는 것이 안전하다.

> 📚 **사례**: 2013년 10월, Dropbox는 Amazon RDS에서 자체 MySQL 클러스터(나중에 Edgestore라고 부른 것)로 마이그레이션했다. 이유 중 하나가 RDS Multi-AZ의 페일오버 동안 발생하는 연결 끊김 시간이 SLA를 맞추기 어려웠다는 것이었다. 이처럼 금융권이나 글로벌 서비스의 경우 RDS Multi-AZ의 60-120초 페일오버가 허용 불가한 수준일 수 있으며, 그런 경우 Aurora(페일오버 30초 이내)나 Aurora Global Database로 넘어가야 한다.

## Read Replica — 비동기 복제가 만드는 가능성과 한계

Read Replica는 Multi-AZ와 기술적으로 완전히 다른 메커니즘이다. MySQL과 PostgreSQL의 경우 각 DB 엔진이 자체적으로 제공하는 비동기 복제(MySQL: binlog replication, PostgreSQL: streaming replication / logical replication)를 사용한다. Primary가 트랜잭션을 커밋하면 그 변경 사항이 비동기적으로 Replica에 전송된다. "비동기적으로"의 의미는 Primary가 Replica의 응답을 기다리지 않고 바로 클라이언트에게 커밋 성공을 알려준다는 뜻이다.

이 구조의 결과:
- **Replica는 읽기 트래픽을 처리할 수 있다** — Multi-AZ Standby와 달리 실제 연결을 받는다.
- **Replica는 Primary보다 데이터가 약간 늦을 수 있다(Replication Lag)** — 비동기라서 Primary 커밋 후 Replica에 반영되기까지 지연이 있다.
- **Replica는 별도의 엔드포인트를 가진다** — 애플리케이션이 명시적으로 Replica 엔드포인트를 사용해야 읽기 트래픽이 분산된다. ALB가 자동으로 나눠주지 않는다.

```
[Primary]  ─── 쓰기 ────► DB
              비동기        │
              binlog/       │ (Replication Lag 존재)
              streaming     ▼
           ─────────► [Read Replica 1] ← 읽기 전용 연결
           ─────────► [Read Replica 2] ← 읽기 전용 연결
           ─────────► [Read Replica 3 (다른 리전)] ← Cross-Region
```

Cross-Region Read Replica는 재해 복구(DR)의 중요한 도구다. 서울 리전(ap-northeast-2)에서 버지니아(us-east-1)로 Cross-Region Read Replica를 만들면, 서울 리전이 완전히 다운됐을 때 버지니아의 Replica를 Primary로 Promote해서 서비스를 계속할 수 있다. Promote는 수동 작업이고 수 분에서 수십 분이 걸릴 수 있으며, 비동기 복제 특성상 마지막 복제 이후의 데이터는 손실될 수 있다(RPO가 0이 아니다).

| 항목 | Multi-AZ | Read Replica |
|------|----------|--------------|
| 목적 | 고가용성(HA), 장애 자동 복구 | 읽기 트래픽 분산, DR |
| 복제 방식 | 동기 (Primary ACK 필요) | 비동기 (Lag 존재) |
| 읽기 트래픽 | Standby는 불가 (일반 Multi-AZ) | Replica에서 가능 |
| 페일오버 | 자동 (60-120초) | 수동 Promote 필요 |
| 비용 | Primary + Standby (2배) | Primary + N Replica (N+1배) |
| 리전 간 | 불가 (같은 리전 HA) | 가능 (Cross-Region) |
| RTO | 60-120초 (DNS TTL 포함) | 수 분 ~ 수십 분 (수동) |
| RPO | 거의 0 (동기 복제) | 수 초 ~ 수십 초 (Lag에 따라) |

> 💡 **관련 이론**: Read Replica의 Replication Lag 문제는 분산 시스템의 "Eventual Consistency" 개념과 직결된다. 에릭 브루어(Eric Brewer)의 CAP 정리에서 Read Replica를 포함한 아키텍처는 P(Partition Tolerance)를 유지하면서 A(Availability)를 높이지만, C(Consistency)를 희생한다. 즉, Replica에서 읽는 데이터가 Primary의 최신 상태와 다를 수 있다. "항상 최신 데이터가 필요한 읽기"는 Primary에서 해야 하고, "약간의 지연이 허용되는 읽기(예: 리포트, 통계, 사용자 프로필 조회)"는 Replica에서 해도 된다.

> ⚠️ **함정**: "읽기 트래픽을 Multi-AZ Standby로 분산할 수 있다" — 이것은 일반 Multi-AZ에서는 불가능하다. Multi-AZ Cluster(2021 출시) 에서만 Readable Standby가 가능하다. 시험에서 이 차이를 모르고 Multi-AZ를 Read Replica처럼 사용하려는 함정 선택지가 자주 나온다.

## RDS Proxy — Lambda 시대가 만든 문제의 해결책

Lambda가 대중화되기 전에는 연결 풀링이 애플리케이션 서버의 역할이었다. Spring Boot 앱 10개가 RDS에 최대 100개의 연결을 유지하는 것은 예측 가능하고 관리 가능한 범위였다. 그런데 Lambda가 등장하면서 문제가 생겼다.

Lambda는 요청마다 새로운 실행 컨텍스트를 만들 수 있다. 동시에 1000개의 Lambda 함수가 실행되면 이론상 1000개의 DB 연결이 동시에 열릴 수 있다. 그런데 RDS MySQL은 기본 max_connections가 인스턴스 크기에 따라 수백 개 수준이다. db.t3.micro는 고작 66개다. 결과: Lambda가 폭증하면 DB가 "Too many connections" 오류로 다운된다.

RDS Proxy는 이 문제를 연결 풀링으로 해결한다. Lambda 수천 개가 Proxy에 연결하고, Proxy가 DB에는 소수의 연결만 유지한다. Proxy는 들어온 쿼리를 기다리는 DB 연결에 할당하고, 쿼리가 끝나면 연결을 반환한다. DB 입장에서는 연결 수가 안정적으로 유지된다.

추가 이점:
- **IAM 인증 통합**: Proxy가 Secrets Manager에서 DB 자격증명을 관리하므로, Lambda는 IAM Role로만 Proxy에 인증하면 된다. DB 패스워드가 Lambda 환경 변수에 없어도 된다.
- **페일오버 시 연결 전환**: Multi-AZ 페일오버 시 Proxy가 새 Primary로 연결을 자동 전환해줘서 애플리케이션 연결 중단 시간이 단축된다(일반적으로 66% 단축).

```
[Lambda 1000개 동시]
       │
       ▼
[RDS Proxy]  ←── Secrets Manager (자격증명 자동 로테이션)
       │
       │ 소수의 연결만 유지 (예: 50개)
       ▼
[RDS Primary]  ──────── Standby (Multi-AZ)
```

> 🔍 **더 깊이**: RDS Proxy의 내부는 HAProxy와 유사한 역할을 한다. 프로토콜 수준(MySQL 프로토콜, PostgreSQL 프로토콜)에서 파싱을 하기 때문에 쿼리 수준의 라우팅도 가능하다. 예를 들어 SELECT 문은 Read Replica로, 나머지는 Primary로 보내는 설정을 할 수 있다. 이 기능은 애플리케이션 코드 변경 없이 읽기/쓰기를 자동으로 분리한다. 단, 이 기능은 Aurora 클러스터에서 Proxy와 함께 쓸 때 더 효과적이다.

> 📚 **사례**: 2020년 핀테크 스타트업 Mable(미국 도매 식료품 플랫폼)은 Lambda 기반 서버리스 아키텍처에서 피크 타임에 RDS max_connections를 계속 초과하는 문제를 겪었다. RDS Proxy 도입 후 DB 연결 수가 95% 감소했으며, "Too many connections" 오류가 사라졌다고 보고했다. (AWS 공식 고객 사례)

## 백업 전략 — PITR과 스냅샷의 차이

RDS의 백업은 두 가지 레이어로 이뤄진다.

**자동 백업(Automated Backup)**은 보존 기간을 1~35일로 설정하면, 매일 지정된 백업 윈도우에 전체 스냅샷을 찍고 트랜잭션 로그를 5분마다 S3에 업로드한다. 이 트랜잭션 로그 덕분에 보존 기간 내 임의의 시점으로 복구(Point-In-Time Recovery, PITR)가 가능하다. 정확히는 5분 단위로 가능하다. PITR로 복구하면 "새 인스턴스"가 만들어진다. 기존 인스턴스를 덮어쓰지 않는다.

**수동 스냅샷(Manual Snapshot)**은 사용자가 직접 시작하는 복구 지점이다. 보존 기간이 없어서 삭제하기 전까지는 남아 있다. 다른 리전이나 다른 계정으로 공유/복사할 수 있어서 DR 전략의 중요한 도구다.

Multi-AZ에서 스냅샷은 Standby에서 수행된다. 따라서 Primary 성능에 영향을 주지 않는다.

복구 시 주의사항: 스냅샷 복원이든 PITR이든 항상 새 인스턴스를 만들고, 애플리케이션이 새 엔드포인트로 연결을 전환해야 한다. "제자리 복구(in-place restore)"는 없다.

> 💡 **관련 이론**: PITR은 데이터베이스 이론의 "Redo Log"와 "Write-Ahead Logging(WAL)"을 활용한다. WAL은 데이터 변경 전에 로그를 먼저 쓰는 기법으로, InnoDB(MySQL)의 redo log와 PostgreSQL의 WAL이 대표적이다. RDS는 이 로그를 S3에 주기적으로 업로드하고, 복구 시 마지막 스냅샷에서 시작해서 필요한 시점까지 redo log를 재실행한다. 이 원리가 "5분 단위" 복구가 가능한 이유다 — 5분마다 로그 파일을 업로드하기 때문이다.

## 보안 — 레이어별 보호

RDS 보안은 여러 레이어로 구성된다.

**암호화**: RDS 인스턴스를 생성할 때 KMS 키로 암호화를 활성화할 수 있다. 한 번 설정된 암호화는 변경 불가다. 이미 비암호화 상태로 만들어진 RDS를 암호화하려면 ①비암호화 DB의 스냅샷 생성 → ②스냅샷을 암호화 복사 → ③암호화된 스냅샷에서 새 인스턴스 복원 → ④새 엔드포인트로 애플리케이션 전환 → ⑤기존 비암호화 인스턴스 삭제. 이 5단계를 거쳐야 한다.

Read Replica의 암호화: Primary가 암호화됐으면 같은 리전의 Replica는 자동으로 암호화. Cross-Region Replica는 별도의 KMS 키를 지정해야 한다(리전마다 KMS 키가 다름).

**네트워크 격리**: RDS는 VPC 안의 프라이빗 서브넷에 두는 것이 원칙이다. Security Group으로 특정 애플리케이션 서버만 접근 허용. 인터넷에서 직접 접근 불가.

**IAM DB 인증**: MySQL과 PostgreSQL에서 지원. IAM 역할에서 임시 토큰을 생성해서 DB 인증에 사용. 비밀번호 없이 인증 가능. 연결이 15분마다 새 토큰으로 갱신된다.

> ⚠️ **함정**: "RDS 인스턴스에 SSH로 접속해서 MySQL 설정 파일을 직접 편집할 수 있다" — 불가능하다. RDS는 관리형 서비스로 게스트 OS 접근이 없다. DB 엔진 파라미터는 Parameter Group을 통해 변경한다. 이것이 EC2 위의 자체 MySQL과 RDS의 가장 큰 운영 차이다.

다른 클라우드와 비교하면 설계 철학의 차이가 보인다:

| 항목 | AWS RDS | GCP Cloud SQL | Azure SQL Database |
|------|---------|---------------|-------------------|
| Multi-AZ 방식 | 블록 레벨 동기 복제 | HA 복제본 (동기) | Geo-redundant / Zone-redundant |
| Read Replica | 별도 생성 | 별도 생성 | Read replica (Premium만) |
| Serverless | X (Aurora Serverless v2) | Cloud SQL Serverless (Preview) | Azure SQL Serverless |
| 페일오버 시간 | 60-120초 | 60초 내외 | 10-30초 (Basic은 더 길어짐) |
| 관리형 Proxy | RDS Proxy | Cloud SQL Proxy | 내장(SQL Database는 없음) |
| 암호화 | KMS (생성 시) | CMEK | TDE (Azure Key Vault) |

> 🔍 **더 깊이**: RDS의 스토리지는 Amazon EBS(gp2, gp3, io1, io2)를 기반으로 한다. gp3는 gp2 대비 20% 저렴하면서도 기본 3000 IOPS를 제공하며, IOPS를 별도로 구매할 수 있어서 대부분의 새 워크로드는 gp3가 권장된다. io1/io2는 최대 100,000 IOPS가 필요한 매우 I/O 집약적인 워크로드용이다. Storage Auto Scaling을 활성화하면 70% 임계값을 넘었을 때 스토리지가 자동으로 확장된다. 단, 스토리지는 늘릴 수만 있고 줄일 수 없다 — 줄이려면 새 인스턴스로 마이그레이션해야 한다.

## CLI로 Multi-AZ와 Read Replica 실제로 만들기

```bash
# Multi-AZ RDS 생성
aws rds create-db-instance \
  --db-instance-identifier prod-mysql \
  --db-instance-class db.m6i.large \
  --engine mysql \
  --engine-version 8.0.36 \
  --master-username admin \
  --master-user-password 'StrongPass123!' \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --storage-encrypted \
  --kms-key-id arn:aws:kms:ap-northeast-2:111:key/xxx \
  --backup-retention-period 7 \
  --preferred-backup-window "02:00-03:00" \
  --deletion-protection

# Read Replica (같은 리전)
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-mysql-ro \
  --source-db-instance-identifier prod-mysql \
  --db-instance-class db.m6i.large

# Cross-Region Read Replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-mysql-ro-us \
  --source-db-instance-identifier arn:aws:rds:ap-northeast-2:111:db:prod-mysql \
  --region us-east-1 \
  --db-instance-class db.m6i.large

# RDS Proxy 생성
aws rds create-db-proxy \
  --db-proxy-name prod-proxy \
  --engine-family MYSQL \
  --role-arn arn:aws:iam::111:role/rds-proxy-role \
  --auth '[{"AuthScheme":"SECRETS","SecretArn":"arn:aws:secretsmanager:...","IAMAuth":"REQUIRED"}]' \
  --vpc-subnet-ids subnet-a subnet-b \
  --vpc-security-group-ids sg-xxx

# 페일오버 강제 테스트 (Multi-AZ)
aws rds reboot-db-instance \
  --db-instance-identifier prod-mysql \
  --force-failover

# Read Replica Lag 모니터링
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=prod-mysql-ro \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-01T01:00:00Z \
  --period 60 \
  --statistics Average
```

## 정리하며

RDS는 "관계형 DB를 운영하는 부담을 줄이는 서비스"라는 단순한 설명으로 시작했지만, 그 안에 동기 복제와 비동기 복제의 분산 시스템 트레이드오프, 연결 풀링이 필요한 이유, WAL 기반 PITR의 원리까지 깊은 설계 결정들이 담겨 있다. Multi-AZ는 Standby가 트래픽을 처리하지 않는 대신 동기 복제로 데이터 손실 없는 자동 페일오버를 보장한다. Read Replica는 비동기 복제로 읽기 트래픽을 분산하고 Cross-Region DR의 기반을 만든다. 이 두 메커니즘은 다른 목적을 위한 다른 도구이며, 시험에서 가장 자주 혼동을 노리는 포인트다.

다음 날은 RDS의 기반 위에 서지만 완전히 다른 스토리지 아키텍처를 선택한 Aurora를 다룬다. Aurora가 왜 6개 사본을 쓰는지, 그 Quorum 쓰기가 무엇인지를 이해하면 "Aurora가 왜 Multi-AZ RDS보다 페일오버가 빠른지"도 자연스럽게 따라온다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 RDS MySQL을 운영하면서 읽기 트래픽이 쓰기의 10배에 달한다. 쓰기 성능을 희생하지 않고 읽기 처리량을 늘리는 가장 적합한 방법은?

A) Multi-AZ를 활성화해서 Standby에서 읽기 처리
B) Read Replica를 2-3개 추가하고 애플리케이션에서 읽기 엔드포인트로 연결
C) RDS Proxy를 앞에 놓아서 연결을 분산
D) 더 큰 인스턴스 클래스로 업그레이드

**정답: B**
해설: Multi-AZ Standby는 일반적으로 읽기 트래픽을 처리하지 않는다(Multi-AZ Cluster는 가능하지만 일반 Multi-AZ와 구별). Read Replica는 비동기 복제로 만들어진 읽기 전용 복사본으로, 별도 엔드포인트를 통해 읽기 트래픽을 처리한다. RDS Proxy는 연결 수를 줄이는 도구이지 읽기 처리량을 늘리는 도구가 아니다. 인스턴스 업그레이드는 비용이 크고 근본적인 트래픽 분산 문제를 해결하지 못한다.

---

**문제 2.** Lambda 함수 1000개가 동시에 실행될 때 RDS에서 "Too many connections" 오류가 발생하고 있다. 최소한의 코드 변경으로 이 문제를 해결하려면?

A) RDS 인스턴스를 더 큰 클래스로 변경해서 max_connections를 늘린다
B) Lambda의 예약 동시성을 50으로 제한한다
C) RDS Proxy를 도입해서 Lambda와 RDS 사이에 연결 풀링을 추가한다
D) Read Replica를 5개 추가해서 연결을 분산한다

**정답: C**
해설: RDS Proxy는 수천 개의 Lambda 연결을 받아서 DB에는 소수의 연결만 유지하는 연결 풀링을 제공한다. 애플리케이션은 Proxy 엔드포인트로만 연결 방법을 변경하면 되므로 코드 변경이 최소화된다. A는 근본적 해결이 아니고 비용이 증가한다. B는 Lambda 처리량을 제한해서 비즈니스 요구를 만족하지 못할 수 있다. D는 읽기 전용 연결만 분산하고 쓰기 연결 문제를 해결하지 못한다.

---

**문제 3.** 운영 중인 비암호화 RDS 인스턴스를 암호화 상태로 전환해야 한다. 올바른 절차는?

A) RDS 콘솔에서 "Enable Encryption" 토글을 켠다
B) 인스턴스를 중지하고 암호화를 활성화한 뒤 재시작한다
C) 현재 인스턴스의 스냅샷을 찍고 → 암호화 옵션으로 스냅샷 복사 → 암호화된 스냅샷에서 새 인스턴스 복원
D) Read Replica를 암호화 설정으로 만들고 Promote한다

**정답: C**
해설: RDS 암호화는 인스턴스 생성 시에만 설정 가능하며, 이후 변경할 수 없다. 비암호화 → 암호화 전환은 반드시 스냅샷 경유 새 인스턴스 생성 방식으로 해야 한다. A와 B는 불가능한 작업이다. D도 불가능하다 — Primary가 비암호화면 같은 리전 Replica도 비암호화로 만들어진다. 단, Cross-Region Read Replica는 별도 KMS 키로 암호화 상태로 만드는 것이 가능하다.

---

**문제 4.** RDS Multi-AZ가 활성화된 상태에서 AZ-a의 Primary 인스턴스가 장애를 일으켰다. 최소 다운타임으로 서비스를 복구하는 데 Multi-AZ가 기여하는 방식은?

A) S3에서 최신 스냅샷을 가져와서 새 인스턴스를 시작한다
B) AZ-b의 Standby를 Primary로 자동 승격하고 DNS CNAME을 업데이트한다
C) 운영자가 수동으로 Failover를 트리거해야 한다
D) AZ-b의 Read Replica를 자동으로 Primary로 Promote한다

**정답: B**
해설: Multi-AZ의 핵심 가치는 자동 페일오버다. AWS는 Primary 장애를 감지하면 자동으로 Standby를 새 Primary로 승격하고 DNS CNAME 레코드를 업데이트한다. 애플리케이션이 RDS의 DNS 엔드포인트를 사용하면 DNS TTL 이후 자동으로 새 Primary로 연결된다. C는 틀렸다 — 수동 개입이 필요 없는 것이 Multi-AZ의 장점이다. D는 틀렸다 — Multi-AZ Standby와 Read Replica는 다른 개념이다.

---

**문제 5.** 서울 리전(ap-northeast-2)에서 RDS MySQL을 운영 중이다. 리전 전체 재해에 대비하여 RPO를 최소화하면서 도쿄 리전(ap-northeast-1)에서 읽기 트래픽도 처리하고 싶다. 가장 적합한 솔루션은?

A) Multi-AZ를 활성화하고 도쿄 리전에도 별도 Multi-AZ를 구성한다
B) 서울에서 도쿄로 Cross-Region Read Replica를 만들고, 도쿄 사용자는 Replica 엔드포인트를 사용한다
C) 서울과 도쿄에 각각 독립적인 RDS 인스턴스를 만들고 애플리케이션에서 동기화한다
D) S3 Cross-Region Replication으로 백업을 도쿄에 복제한다

**정답: B**
해설: Cross-Region Read Replica는 두 가지 목적을 동시에 달성한다. ① 도쿄 사용자는 물리적으로 가까운 Replica에서 읽기 → 지연 감소. ② 서울 장애 시 도쿄 Replica를 Promote → DR. 비동기 복제이므로 RPO가 0은 아니지만(수 초~수십 초의 Lag), 완전한 S3 백업보다는 훨씬 작다. A는 리전 간 Multi-AZ가 불가능하다 — Multi-AZ는 같은 리전 내 AZ 간 메커니즘이다. C는 데이터 일관성 문제가 크다. D는 RPO가 수 시간 단위일 수 있다.

---

**문제 6.** RDS 자동 백업의 PITR(Point-In-Time Recovery)에 대한 설명으로 올바른 것은?

A) 보존 기간(최대 35일) 내 원하는 분 단위로 복구 가능하다
B) 보존 기간 내 원하는 5분 단위로 복구 가능하며, 기존 인스턴스를 직접 덮어쓴다
C) 보존 기간 내 원하는 5분 단위로 복구 가능하며, 새 인스턴스가 생성된다
D) 보존 기간은 최대 90일이며, 수동 스냅샷이 필요하다

**정답: C**
해설: RDS 자동 백업의 PITR은 5분 단위(트랜잭션 로그를 5분마다 S3에 업로드)로 복구 지점을 제공하고, 보존 기간은 1~35일이다. 중요한 점은 PITR 복구 시 "새 인스턴스"가 생성된다는 것이다. 기존 인스턴스는 그대로 유지된다. A는 분 단위가 아닌 5분 단위가 맞다. B는 기존 인스턴스 덮어쓰기가 잘못됐다. D는 보존 기간 90일이 틀렸다.

---

**문제 7.** 애플리케이션 팀이 RDS 인스턴스에 SSH로 직접 접속해서 MySQL 설정 파일(my.cnf)을 편집하고 싶어한다. 이것이 가능한지, 그리고 대안은 무엇인지?

A) 가능하다. RDS는 EC2 기반이므로 SSH 접속이 허용된다
B) 불가능하다. RDS는 관리형 서비스로 게스트 OS 접근이 없다. MySQL 파라미터는 RDS Parameter Group을 통해 변경해야 한다
C) 가능하다. AWS Systems Manager Session Manager를 통해 접속할 수 있다
D) 불가능하다. RDS 파라미터는 변경 자체가 불가능하다

**정답: B**
해설: RDS는 관리형 PaaS 서비스로, 사용자는 DB 레이어 이상만 접근할 수 있다. OS나 MySQL 설정 파일에 직접 접근은 불가능하다. DB 엔진 파라미터(예: innodb_buffer_pool_size, max_connections, slow_query_log 등)는 RDS Parameter Group에서 변경할 수 있으며, 일부 파라미터는 적용 시 DB 재시작이 필요하다(Static Parameters). EC2 위의 MySQL이 필요한 경우는 RDS가 아닌 EC2에 직접 설치해야 하며, 그 경우 OS 패치, 백업, HA 설정 등 모든 책임이 고객에게 있다.

---
