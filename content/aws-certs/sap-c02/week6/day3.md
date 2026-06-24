# Day 3 - AWS DMS + SCT: 데이터베이스 마이그레이션의 과학

데이터베이스 마이그레이션은 서버 마이그레이션보다 훨씬 복잡하다. 서버는 OS와 파일 시스템이라는 공통 언어가 있지만, DB 엔진들은 각자 다른 SQL 방언, 데이터 타입, 내장 함수, 프로시저 언어를 가진다. Oracle의 PL/SQL, SQL Server의 T-SQL, PostgreSQL의 PL/pgSQL은 문법이 비슷해 보여도 실제로는 수십 개의 비호환 함수와 데이터 타입을 가진다.

AWS DMS(Database Migration Service)는 이 복잡성을 관리한다. CDC(Change Data Capture)로 원본 DB를 운영하면서 실시간으로 변경을 따라가고, SCT(Schema Conversion Tool)가 이종 엔진 간 스키마·코드 자동 변환을 지원한다. 오늘은 DMS·SCT의 내부 동작, CDC의 DB별 구현, Babelfish의 혁신적 접근, 그리고 실제 대규모 마이그레이션 패턴을 깊게 다룬다.

## CDC의 내부 메커니즘: DB별 구현 방식

CDC(Change Data Capture)는 데이터베이스의 변경 사항(INSERT, UPDATE, DELETE)을 실시간으로 캡처하는 기술이다. DMS는 각 DB 엔진의 내부 로그를 읽어 CDC를 구현한다.

| DB 엔진 | CDC 소스 | 설정 요구사항 |
|--------|---------|------------|
| **Oracle** | Redo Log (LogMiner) | ARCHIVELOG 모드, 보충 로깅 활성화 |
| **SQL Server** | Transaction Log (CDC 기능) | SQL Server CDC 기능 활성화 |
| **MySQL** | Binary Log (binlog) | binlog_format=ROW, FULL |
| **PostgreSQL** | WAL (Write-Ahead Log) | wal_level=logical, replication 슬롯 |
| **Aurora MySQL** | Binary Log | binlog 활성화 |
| **Aurora PostgreSQL** | WAL | logical replication 활성화 |

> 💡 **관련 이론**: Write-Ahead Logging(WAL)은 데이터베이스 내구성(Durability, ACID의 D)의 기본 메커니즘이다. 실제 데이터 페이지 변경 전에 로그 레코드를 먼저 기록해 시스템 장애 시 복구를 가능하게 한다(Jim Gray의 Shadow Paging 대안으로 1992년 PostgreSQL에서 구현). DMS는 이 WAL을 "정상 복구" 목적이 아닌 "변경 스트림 소비"에 재활용한다. 이것을 Logical Decoding이라 한다(PostgreSQL pg_logical_emit_message).

> 🔍 **더 깊이**: Oracle LogMiner의 원리. LogMiner는 Oracle의 Redo Log 파일에서 DML 작업을 SQL 형태로 재구성해주는 Oracle 내장 패키지다(DBMS_LOGMNR). DMS는 LogMiner API를 사용해 Redo Log에서 변경 데이터를 읽는다. 보충 로깅(Supplemental Logging)이 활성화되어야 DELETE된 행의 이전 값도 로그에 포함된다. 이것 없이는 DMS가 어떤 행이 삭제됐는지 알 수 없다.

## DMS 아키텍처: Replication Instance의 역할

DMS는 Source → Replication Instance → Target 3-tier 구조다.

```
Source DB                    Target DB
(Oracle On-Prem)             (Aurora PostgreSQL)
      │                           ▲
      │ CDC (Redo Log)            │
      ▼                           │
Replication Instance (EC2)        │
  ├── Full Load Worker            │
  ├── CDC Worker                  │
  └── 변환 규칙 적용 ─────────────┘
```

**Replication Instance**: EC2 기반. 변환 작업의 CPU·메모리가 이 인스턴스에서 실행된다. 크기 선택이 중요하다.
- 소규모(< 1TB): dms.t3.medium
- 중규모(1-5TB): dms.c5.large
- 대규모(5TB+): dms.r5.2xlarge (메모리 집약)

**DMS Serverless (2023)**: Replication Instance를 AWS가 자동 관리·확장한다. Capacity Units(DCU)로 과금. 피크 부하 시 자동 확장, 유휴 시 자동 축소.

> ⚠️ **함정**: Replication Instance는 Source와 Target DB에 동시 연결해야 한다. 온프레 Oracle이 방화벽 뒤에 있다면 Direct Connect 또는 VPN으로 연결이 필요하다. Replication Instance를 같은 VPC에 두고 프라이빗 연결로 구성하는 것이 표준.

## Full Load + CDC: 무중단 마이그레이션의 수학

```
Timeline:
T=0     Full Load 시작 (원본 전체 복사)
T=10h   Full Load 완료 (10TB → 약 10시간)
T=10h~  CDC 시작 (Full Load 중 쌓인 변경 + 이후 실시간 변경)
T=12h   CDC Lag 0 (Full Load 기간 변경분 따라잡음)
T=X     Cutover 결정 (Lag ≈ 0, 앱 중단 후 DNS 전환)
```

**Cutover 판단 기준**:
- CDC Lag < 1초 (또는 비즈니스 허용 RPO 이하)
- 모든 테이블 검증 완료 (행 수 일치, 샘플 데이터 비교)
- 앱 연결 테스트 성공

**테이블 매핑 규칙**: DMS는 JSON으로 소스-타겟 테이블 매핑, 컬럼 필터링, 데이터 변환을 정의한다.

```json
{
  "rules": [
    {
      "rule-type": "selection",
      "rule-id": "1",
      "object-locator": {
        "schema-name": "HR",
        "table-name": "%"
      },
      "rule-action": "include"
    },
    {
      "rule-type": "transformation",
      "rule-id": "2",
      "rule-action": "convert-lowercase",
      "rule-target": "schema"
    }
  ]
}
```

## SCT (Schema Conversion Tool): 이종 엔진 변환의 현실

SCT는 원본 DB의 스키마(DDL)와 코드(저장 프로시저, 트리거, 뷰, 함수)를 대상 엔진으로 자동 변환한다. 하지만 "자동"이라는 말이 "완전"을 의미하지는 않는다.

**SCT 변환 가능 항목**:
- 테이블·인덱스·제약조건 (85-95% 자동)
- 기본 SELECT/INSERT/UPDATE/DELETE (거의 100%)
- 표준 SQL 함수 → 대응 함수 변환

**SCT 수동 수정 필요 항목**:
- DB 엔진 고유 기능 (Oracle의 ROWNUM, SQL Server의 TOP)
- 복잡한 커서 로직
- 동적 SQL (exec())
- 외부 프로시저 호출 (Java stored procedures)
- 패키지·타입 중첩 의존성

**SCT Assessment Report**: 자동 변환 가능한 항목과 수동 수정 필요 항목을 색상(녹색/주황/빨강)으로 표시한다. 마이그레이션 사전 평가 단계에서 반드시 실행해야 한다.

> 📚 **사례**: Netflix의 Oracle → Aurora MySQL 마이그레이션 (2015-2016). 넷플릭스는 수십 개의 Oracle DB를 Aurora로 이전했다. SCT가 PL/SQL의 약 65%를 자동 변환하고 나머지 35%는 DBA 팀이 수동 변환했다. 특히 Oracle 패키지와 Nested Table 타입이 문제였다. 교훈: 이종 DB 마이그레이션에서 SCT 자동화율 70-80%를 현실적 목표로 잡고, 나머지 20-30%를 위한 개발 리소스를 프로젝트에 포함해야 한다.

## 주요 마이그레이션 패턴

### 패턴 1: Oracle → Aurora PostgreSQL (가장 일반적)

```
1. SCT Assessment Report 실행 (1-2주)
   → 변환율 평가, 수동 작업 범위 파악

2. SCT로 스키마 변환 + 수동 수정 (2-8주)
   → DDL, PL/SQL → PL/pgSQL, 인덱스, 뷰

3. DMS Full Load + CDC 시작 (데이터 마이그레이션)
   → Replication Instance 크기 선택 (데이터 볼륨 기반)

4. 앱 테스트 (Target DB 연결 후 기능 검증)
   → SQL 쿼리 성능 비교, 특히 복잡 쿼리

5. 성능 최적화 (Aurora PostgreSQL 특화)
   → EXPLAIN ANALYZE, 인덱스 추가, 쿼리 힌트 제거

6. Cutover (계획 다운타임 내)
   → CDC Lag ≈ 0 확인 → 앱 중단 → 최종 동기화 → DNS 전환
```

**라이선스 절감 계산**:
- Oracle Enterprise Edition: ~$47,500/코어/년 + 옵션
- Aurora PostgreSQL: vCPU당 $0.29/시간 (8vCPU → ~$20,000/년)
- 절감율: 50-80% (서버 규모·옵션 패키지에 따라)

### 패턴 2: SQL Server → Aurora PostgreSQL with Babelfish

Babelfish는 2021년 AWS가 오픈소스로 출시한 Aurora PostgreSQL 확장이다. SQL Server의 TDS(Tabular Data Stream) 프로토콜과 T-SQL 방언을 Aurora PostgreSQL이 이해할 수 있도록 변환해 제공한다.

**Babelfish의 동작 원리**:
- PostgreSQL에 TDS 프로토콜 엔드포인트 추가 (기본 1433 포트)
- T-SQL 문장을 파싱해 PostgreSQL SQL로 변환
- SQL Server 시스템 카탈로그 뷰(sys.tables, sys.columns) 에뮬레이션

**Babelfish 사용 케이스**:
- SQL Server .NET 앱을 코드 변경 없이 Aurora로 전환
- JDBC/ODBC SQL Server 드라이버 호환
- 기존 SQL Server 저장 프로시저 (T-SQL) 대부분 그대로 실행

**Babelfish의 한계**:
- 일부 복잡한 T-SQL 기능 미지원 (CLR 프로시저, 일부 SQL Agent 기능)
- 성능 특성이 순수 PostgreSQL과 다를 수 있음
- SQL Server 2017+ 특화 기능은 제한적

| 항목 | SCT + DMS (전통 방식) | Babelfish |
|-----|---------------------|---------|
| 코드 변경 | 있음 (30-40% 수동) | 거의 없음 |
| 호환성 | 높음 (완전 변환 후) | 중간 (T-SQL 부분 호환) |
| 기간 | 길다 | 짧다 |
| 장기 이식성 | 완전 PostgreSQL | T-SQL 의존 유지 |

> 💡 **관련 이론**: TDS 프로토콜(Tabular Data Stream)은 SQL Server와 클라이언트 간 통신 프로토콜이다. 1984년 Sybase가 설계하고 Microsoft가 계승해 공개했다(OpenSpec). Babelfish는 이 프로토콜을 PostgreSQL이 직접 처리하도록 구현해, 클라이언트가 Aurora를 SQL Server로 인식하게 만든다. 마치 API 호환 레이어를 추가하는 것이다.

## DMS의 다양한 대상(Target)

DMS는 단순 DB → DB 마이그레이션뿐 아니라 **분석 파이프라인 구축**에도 사용된다.

| 사용 케이스 | Source | Target | 패턴 |
|----------|-------|-------|-----|
| OLTP 마이그레이션 | Oracle | Aurora PG | Full Load + CDC |
| 데이터 레이크 구축 | MySQL | S3 (Parquet/CSV) | CDC + S3 |
| 실시간 분석 | PostgreSQL | Kinesis Data Streams | CDC → 실시간 |
| 데이터 웨어하우스 | SQL Server | Redshift | Full Load + CDC |
| NoSQL 전환 | MongoDB | DynamoDB | Full Load |

> 🔍 **더 깊이**: DMS → S3 → Athena 패턴. DMS가 운영 DB의 변경을 S3에 Parquet 형식으로 저장하면, Athena가 SQL로 직접 쿼리한다. 이것이 Lake Formation 기반 데이터 레이크의 실시간 수집 경로다. CDC 레코드는 op 컬럼(I=Insert, U=Update, D=Delete)이 포함되어 원본의 변경 이력을 모두 보존한다. 이것을 Schema-on-Read 방식으로 Athena에서 쿼리할 수 있다.

## DMS Fleet Advisor: DB 포트폴리오 자동 발견

대규모 엔터프라이즈에서는 어디에 어떤 DB가 몇 개 있는지조차 파악이 안 되는 경우가 있다. DMS Fleet Advisor는 네트워크에서 DB 인스턴스를 자동 발견하고 마이그레이션 권장사항을 생성한다.

**동작 방식**:
1. 네트워크 범위 지정 (IP 대역 또는 호스트 리스트)
2. Fleet Advisor Collector가 DB 엔진·버전·스키마 크기·스토어드 프로시저 수 수집
3. Migration Complexity Report 생성 (각 DB의 이전 난이도 평가)
4. 대상 엔진 권장 (예: Oracle → Aurora PG 권장, 변환 복잡도 20%)

**ADS vs Fleet Advisor**:
- ADS: 서버 인프라 전체 인벤토리 (CPU, 메모리, 네트워크, OS)
- Fleet Advisor: DB 특화 인벤토리 (엔진, 버전, 스키마, 복잡도)

## 이종 마이그레이션의 숨겨진 복잡성

이종 DB 마이그레이션에서 자주 발생하는 문제들:

**데이터 타입 불일관**:
- Oracle NUMBER(38,10) → PostgreSQL NUMERIC(38,10): 자동 변환 가능
- Oracle DATE (날짜+시간 포함) → PostgreSQL DATE (날짜만): 시간 정보 손실 위험
- Oracle CLOB → PostgreSQL TEXT: 대부분 OK, 일부 길이 제한 차이

**문자 인코딩**:
- Oracle: AL32UTF8, WE8ISO8859P1 등 다양
- PostgreSQL: UTF8 권장
- 이기종 인코딩 시 DMS 변환 설정 필요

**NULL 처리 차이**:
- Oracle: 빈 문자열 ''을 NULL로 처리
- PostgreSQL: ''와 NULL을 구분
- 이 차이가 쿼리 결과를 바꿀 수 있음

**스키마 대소문자**:
- Oracle: 기본 대문자 오브젝트명 (TABLE_NAME)
- PostgreSQL: 기본 소문자 오브젝트명 (table_name)
- SCT가 자동 변환하지만 앱 코드의 대소문자 가정 주의

> ⚠️ **함정**: 마이그레이션 후 앱의 쿼리가 PostgreSQL에서 다른 결과를 반환하는 경우가 있다. NULL 처리·문자 비교·날짜 산술 차이 때문이다. Full Load + CDC 완료 후 반드시 **기능 테스트(애플리케이션 레벨)**를 수행해야 한다. 행 수 일치만으로는 충분하지 않다.

## 아키텍처 다이어그램: 대규모 Oracle → Aurora 마이그레이션

```
[Oracle RAC On-Prem]
    │
    │  Step 1: SCT Assessment + 스키마 변환 (개발 환경)
    ▼
[Aurora PostgreSQL (개발 환경)]
    │ 스키마·프로시저 검증
    ▼
[Aurora PostgreSQL (프로덕션, Multi-AZ)]
    ▲
    │  Step 2: DMS Replication Instance
    │    ├── Full Load (전체 데이터)
    │    └── CDC (변경 데이터 실시간)
    │
[Oracle RAC On-Prem] ──── Redo Log ──► DMS
    │
    │ Direct Connect (전용 회선, 낮은 지연)
    │
[AWS VPC, ap-northeast-2]
    └── DMS Replication Instance (r5.2xlarge)

    Step 3: 검증
    ├── 행 수 비교 (DMS Row Count Validation)
    ├── 데이터 샘플 비교
    └── 앱 기능 테스트 (Test 환경)

    Step 4: Cutover
    ├── CDC Lag ≈ 0 확인
    ├── 앱 서버 점검 시간 (오전 2-4시)
    ├── 최종 동기화 완료
    ├── 앱 endpoint → Aurora로 변경
    └── Oracle 연결 차단 → Aurora 운영 시작
```

## 📝 연습 문제

**문제 1.** Oracle 50TB DB를 Aurora PostgreSQL로 마이그레이션하려 한다. 다운타임 없이 진행해야 하고 스토어드 프로시저도 변환해야 한다. 어떤 단계가 필요한가?

A) Oracle Export → Aurora로 Import (다운타임 있음)
B) SCT로 스키마·PL/SQL 변환 → DMS Full Load + CDC → 검증·Cutover
C) MGN으로 Oracle 서버 통째로 EC2로 이전
D) Snowball로 데이터 전송 후 Aurora 로드

**정답: B**
해설: 이종 엔진 + 스토어드 프로시저 변환 + 무중단 = SCT + DMS Full Load + CDC 표준 패턴. A는 다운타임 필요, C는 Oracle 라이선스 지속, D는 실시간 CDC 불가.

---

**문제 2.** SQL Server 앱이 있다. 코드 변경 없이 Aurora로 전환하고 Oracle·SQL Server 라이선스 비용을 줄이고 싶다. 어떤 옵션이 가장 적합한가?

A) RDS for SQL Server (BYOL) → 코드 변경 없음
B) Aurora PostgreSQL with Babelfish
C) Aurora MySQL (T-SQL 호환)
D) DynamoDB (NoSQL 전환)

**정답: B**
해설: SQL Server TDS 프로토콜 + T-SQL 호환 + Aurora PG = Babelfish. 앱 코드가 SQL Server에 연결하듯 Aurora에 연결 가능. 라이선스 비용도 절감. A는 라이선스 절감 불완전(SQL Server 라이선스 지속). C는 Aurora MySQL은 T-SQL 호환 아님. D는 앱 코드 대규모 변경 필요.

---

**문제 3.** DMS CDC를 Oracle에서 사용하려면 원본 DB에 어떤 설정이 필요한가?

A) Binary Log 활성화
B) ARCHIVELOG 모드 + 보충 로깅(Supplemental Logging) 활성화
C) WAL logical replication 활성화
D) CDC 기능 활성화 (SQL Server 방식)

**정답: B**
해설: Oracle CDC = LogMiner 기반. ARCHIVELOG 모드에서만 Redo Log가 보존되어 DMS가 읽을 수 있다. 보충 로깅은 DELETE 작업에서 삭제된 행의 이전 값을 로그에 포함시켜 DMS가 어느 행이 삭제됐는지 알 수 있게 한다. Binary Log는 MySQL, WAL은 PostgreSQL, CDC 기능은 SQL Server.

---

**문제 4.** MySQL → RDS MySQL 마이그레이션(동종 엔진)에서 SCT가 필요한가?

A) 필요. 항상 SCT를 사용해야 한다
B) 필요 없음. 동종 엔진은 DMS만으로 충분
C) 필요. MySQL 버전 차이를 변환해야 한다
D) 필요. RDS가 다른 SQL 방언을 쓴다

**정답: B**
해설: 동종 엔진 마이그레이션(MySQL → RDS MySQL)은 스키마 변환이 불필요하므로 DMS만으로 충분하다. SCT는 이종 엔진(Oracle → PostgreSQL, SQL Server → Aurora) 마이그레이션에서 스키마·코드 변환에 사용된다.

---

**문제 5.** 온프레미스 MySQL DB를 데이터 레이크 구축 목적으로 S3에 Parquet 형식으로 지속 수집하려 한다. 가장 적합한 구성은?

A) mysqldump → S3 배치 업로드 (일 1회)
B) DMS (MySQL → S3 Target, CDC 활성화)
C) AWS DataSync로 MySQL 데이터 파일 복사
D) Kinesis Data Streams + Lambda

**정답: B**
해설: DMS는 MySQL을 Source, S3를 Target으로 설정하고 CDC로 실시간 변경을 수집해 Parquet 또는 CSV로 S3에 저장한다. 변경 레코드에 op 컬럼(I/U/D)이 포함되어 변경 이력을 보존한다. mysqldump는 일 1회 배치라 실시간 아님. DataSync는 파일 시스템 복제, MySQL DB 파일 직접 복사는 정합성 문제.

---

**문제 6.** DMS Fleet Advisor와 Application Discovery Service(ADS)의 차이는?

A) Fleet Advisor는 서버 인프라, ADS는 DB 특화
B) ADS는 서버 인프라 전체 (CPU·메모리·네트워크), Fleet Advisor는 DB 특화 (엔진·스키마·복잡도)
C) 둘 다 동일한 기능이다
D) Fleet Advisor는 Oracle만 지원

**정답: B**
해설: ADS는 서버 인프라 전체 인벤토리(CPU, 메모리, 디스크, 네트워크 의존성, OS)를 수집하는 범용 Discovery 도구다. Fleet Advisor는 DB 특화로 DB 엔진·버전·스키마 크기·저장 프로시저 수·마이그레이션 복잡도를 평가한다. 전사 마이그레이션에서는 ADS(서버 전체) + Fleet Advisor(DB 특화)를 함께 사용한다.

---

**문제 7.** DMS Serverless를 선택하는 가장 큰 이유는?

A) 비용이 완전 무료다
B) Replication Instance 크기 선택·관리 없이 자동 확장, 운영 부담 최소화
C) 온프레미스에서만 사용 가능하다
D) SCT 없이 이종 엔진 변환이 가능하다

**정답: B**
해설: DMS Serverless는 Replication Instance(EC2)를 AWS가 자동 관리하고 트래픽에 따라 자동 확장한다. 관리자가 인스턴스 타입 선택·스케일 업 없이 운영 부담을 줄인다. 비용은 DCU(DMS Capacity Unit) 사용량 기반으로 유료다. SCT는 여전히 별도 단계로 필요하다.

---
