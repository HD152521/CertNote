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

## 트레이드오프 비교표: 상용 DB를 벗어나는 5가지 경로

"Oracle 라이선스 비용을 줄여라"는 하나의 요구에도 답은 다섯 갈래다. Pro 시험은 이 다섯을 나란히 놓고 **한정어**로 하나를 고르게 한다. 클라우드 마이그레이션의 7R 프레임(Rehost·Replatform·Repurchase·Refactor·Retire·Retain·Relocate)에서 DB는 주로 앞의 네 가지에 걸쳐 있다.

| 경로 | 전환 기간 | 앱 코드 변경 | 라이선스 절감 | 운영 부담 | 위험 |
|------|-----------|--------------|----------------|-----------|------|
| **Rehost: EC2에 Oracle (BYOL)** | 가장 짧음 | 없음 | **없음** | 높음 (OS·DB 직접 운영) | 낮음 |
| **Replatform: RDS for Oracle** | 짧음 | 거의 없음 | 부분 (SE2 라이선스 포함 가능) | 중간 | 낮음 |
| **Replatform: RDS Custom for Oracle** | 짧음 | 없음 | 없음 (BYOL) | 중간 (OS 접근 가능) | 낮음 |
| **Refactor: SCT + DMS → Aurora PG** | **가장 김** (수개월) | **큼** (30~40% 수동) | **가장 큼** | 낮음 (관리형) | 높음 |
| **Refactor: Babelfish (SQL Server 한정)** | 중간 | 거의 없음 | 큼 | 낮음 | 중간 |

> 💡 **암기 팁**: **"빨리 옮기려면 Rehost, 싸게 쓰려면 Refactor."** 이 둘은 정확히 반대 방향의 트레이드오프다. 지문에 "as quickly as possible", "minimal changes to the application"이 있으면 Rehost·Replatform 쪽이고, "eliminate licensing costs", "long-term operational efficiency"가 있으면 SCT+DMS 쪽이다. 두 한정어가 동시에 나오면 **단계적 접근**(먼저 Rehost로 데이터센터를 나오고, 그다음 Refactor)이 정답 방향이다.

> 🔍 **더 깊이**: RDS for Oracle의 **License Included** 옵션은 Standard Edition 2에 한정되고, Enterprise Edition은 BYOL(Bring Your Own License)이다. 그래서 "RDS로 옮기면 라이선스가 해결된다"는 서술은 절반만 맞다. EE 기능(Partitioning, Advanced Security, RAC 등)에 의존하는 워크로드는 RDS로 옮겨도 라이선스 비용이 그대로 남는다. RAC은 RDS for Oracle에서 지원되지 않으므로, RAC 의존 시스템은 단일 인스턴스로 재구성하거나 Aurora로 refactor하는 선택지밖에 없다. 시험에서 "Oracle EE + RAC"라는 조건이 붙으면 선택지가 크게 좁아진다.

> 🎯 **시나리오**: "데이터센터 임대 계약이 6개월 후 종료된다. Oracle EE 기반 핵심 시스템 12개를 그 안에 AWS로 옮겨야 하고, 이후 2년에 걸쳐 라이선스 비용을 없애고 싶다. 어떤 순서인가?" — 답: **1단계 Rehost(EC2 BYOL 또는 RDS Custom)로 기한 내 데이터센터 탈출 → 2단계 SCT+DMS로 Aurora PostgreSQL 순차 Refactor**. 6개월 안에 12개 시스템의 PL/SQL을 전부 변환하는 것은 비현실적이고, 기한 압박 속의 대규모 refactor는 실패 확률이 높다. 기한과 비용이라는 두 제약이 충돌하면 **시간축으로 분리**하는 게 표준 답이다.

## DMS 태스크 설정 실물: 검증·LOB·제어 테이블

DMS의 성패는 콘솔 버튼이 아니라 태스크 설정 JSON에서 갈린다. 아래는 대규모 이종 마이그레이션에서 실제로 쓰는 설정의 핵심 부분이다.

```json
{
  "TargetMetadata": {
    "SupportLobs": true,
    "FullLobMode": false,
    "LimitedSizeLobMode": true,
    "LobMaxSize": 64,
    "BatchApplyEnabled": true
  },
  "FullLoadSettings": {
    "TargetTablePrepMode": "DO_NOTHING",
    "MaxFullLoadSubTasks": 8,
    "CommitRate": 10000,
    "StopTaskCachedChangesApplied": false
  },
  "ValidationSettings": {
    "EnableValidation": true,
    "ValidationMode": "ROW_LEVEL",
    "ThreadCount": 5,
    "FailureMaxCount": 10000,
    "TableFailureMaxCount": 1000
  },
  "ControlTablesSettings": {
    "ControlSchema": "dms_control",
    "HistoryTimeslotInMinutes": 5,
    "StatusTableEnabled": true,
    "SuspendedTablesTableEnabled": true,
    "HistoryTableEnabled": true
  },
  "Logging": {
    "EnableLogging": true
  }
}
```

각 설정이 왜 그 값인지가 핵심이다.

| 설정 | 값 | 근거 |
|------|-----|------|
| `FullLobMode: false` + `LimitedSizeLobMode: true` | 제한 모드 | Full LOB 모드는 LOB을 조각내 여러 번 왕복하므로 매우 느리다. 최대 크기를 알면 제한 모드가 압도적으로 빠르다 |
| `LobMaxSize: 64` (KB) | 실측값 기반 | 이 값을 넘는 LOB은 **잘린다**. 반드시 원본에서 `MAX(LENGTH(col))`을 먼저 측정해야 한다 |
| `TargetTablePrepMode: DO_NOTHING` | 기존 테이블 유지 | SCT가 만든 스키마(제약·기본값)를 DMS가 덮어쓰지 않게 한다 |
| `BatchApplyEnabled: true` | 배치 적용 | CDC 변경을 건별이 아니라 묶어서 적용해 처리량을 크게 올린다 |
| `EnableValidation: true` | 검증 켬 | 행 수만이 아니라 값 단위로 원본·대상을 비교한다 |

> ⚠️ **함정**: `LobMaxSize`를 넘는 LOB이 **경고 없이 잘리는** 것이 이종 마이그레이션의 대표적 데이터 손실 사고다. 계약서 PDF나 이미지가 들어 있는 CLOB/BLOB 컬럼에서 특히 위험하다. 그래서 마이그레이션 사전 작업에 "LOB 컬럼별 최대 크기 실측"이 반드시 들어간다. 크기가 들쭉날쭉하고 상한을 알 수 없다면 성능을 희생하더라도 Full LOB 모드를 쓰거나, 아예 LOB을 S3로 분리하고 DB에는 키만 남기는 재설계를 검토한다.

> 🔍 **더 깊이**: `ValidationSettings`를 켜면 DMS가 대상 DB에 `awsdms_validation_failures_v1` 테이블을 만들고 불일치 행을 기록한다. 여기에 `ControlTablesSettings`로 `awsdms_status`(태스크 상태), `awsdms_suspended_tables`(오류로 중단된 테이블), `awsdms_apply_exceptions`(적용 실패 레코드)까지 남긴다. Cutover 판단은 콘솔의 초록색 표시가 아니라 **이 제어 테이블들이 비어 있는지**로 해야 한다. "행 수가 같다"는 검증은 UPDATE로 값만 바뀐 불일치를 절대 잡지 못한다.

```bash
# 사전 평가 실행 — 지원되지 않는 데이터 타입·PK 없는 테이블 등을 미리 잡는다
aws dms start-replication-task-assessment-run \
  --replication-task-arn arn:aws:dms:ap-northeast-2:111111111111:task:XXXX \
  --service-access-role-arn arn:aws:iam::111111111111:role/dms-assessment-role \
  --result-location-bucket dms-assessment-reports \
  --assessment-run-name preflight-2026-q1 \
  --include-only unsupported-data-types,table-with-lob-but-no-primary-key

# Full Load + CDC 태스크 생성
aws dms create-replication-task \
  --replication-task-identifier oracle-to-aurora-hr \
  --source-endpoint-arn arn:aws:dms:...:endpoint:SRC \
  --target-endpoint-arn arn:aws:dms:...:endpoint:TGT \
  --replication-instance-arn arn:aws:dms:...:rep:INST \
  --migration-type full-load-and-cdc \
  --table-mappings file://table-mappings.json \
  --replication-task-settings file://task-settings.json

# 테이블별 진행률·검증 상태 확인 (Cutover 판단의 근거 데이터)
aws dms describe-table-statistics \
  --replication-task-arn arn:aws:dms:...:task:XXXX \
  --query 'TableStatistics[?ValidationState!=`Validated`]'
```

> ⚠️ **함정**: DMS는 이종 마이그레이션에서 대상 테이블을 만들 때 **기본 키만 있는 최소 형태**로 생성한다. 보조 인덱스·외래 키·시퀀스·기본값·트리거·저장 프로시저는 만들어주지 않는다. 이것들은 SCT가 생성한 DDL로 별도 적용해야 한다. 그리고 성능을 위해 **Full Load 동안에는 보조 인덱스와 외래 키를 제거했다가 완료 후 다시 만드는** 것이 표준이다. 인덱스가 걸린 채로 수억 건을 적재하면 적재 시간이 몇 배로 늘어난다.

## Cutover와 롤백: 되돌아갈 길을 만드는 순서

DB Cutover가 서버 Cutover보다 무서운 이유는 **되돌리기가 어렵기 때문**이다. 전환 후 새 DB에 쓰기가 시작되면, 원본으로 돌아가는 순간 그 사이의 데이터가 사라진다. 그래서 순서에 역방향 복제가 반드시 들어간다.

```
[T-2주]  리허설
   ├── 프로덕션 복제본으로 Cutover 전 과정을 한 번 그대로 수행
   ├── 소요 시간 실측 → 점검 창(maintenance window) 길이 확정
   └── 근거: 다운타임을 추정이 아니라 실측으로 정해야 한다

[T-1일]  준비
   ├── DNS TTL을 60초 이하로 낮춤 (또는 Route 53 가중치 라우팅 준비)
   ├── 검증 제어 테이블 비어 있음 확인
   ├── 롤백 판단 기준을 문서로 확정 (예: 30분 내 미해결 시 롤백)
   └── 근거: 장애 한복판에서 "롤백할까?"를 논의하면 이미 늦다

[T-0]  전환
   1. 앱을 읽기 전용 모드로 전환 (또는 완전 중단)
   2. 원본 DB에 더 이상 쓰기가 없음을 확인
   3. CDC Lag = 0 도달 대기
   4. 시퀀스·자동 증가 값 동기화  ← 가장 자주 빠지는 단계
   5. 대상 DB에서 통계 갱신(ANALYZE) 및 보조 인덱스 존재 확인
   6. 앱 연결 문자열/엔드포인트를 대상 DB로 전환
   7. 스모크 테스트 (핵심 트랜잭션 5~10개)

[T+0]  안전망 가동
   ├── 즉시 역방향 CDC 태스크 시작 (Aurora → Oracle)
   ├── 원본 Oracle을 최소 1~2주 유지 (삭제하지 않는다)
   └── 근거: 역방향 복제가 살아 있으면 롤백 시점의 데이터 손실이 0에 가깝다

[T+2주]  정리
   ├── 이상 없음 확인 후 역방향 태스크 중지, 원본 폐기
   └── DMS Replication Instance 삭제 (계속 과금된다)
```

> ⚠️ **함정**: 4번 **시퀀스 동기화**를 빼먹는 사고가 매우 흔하다. DMS는 테이블의 행 데이터를 옮기지만 Oracle의 SEQUENCE나 PostgreSQL의 serial/identity 현재값은 옮기지 않는다. 전환 직후 새 INSERT가 1번부터 시작하면서 기본 키 충돌이 폭발한다. Cutover 체크리스트에 "모든 시퀀스의 `last_value`를 원본 최대값 + 여유분으로 설정"을 명시적으로 넣어야 한다.

> 📚 **사례**: 이종 DB Cutover 후 롤백을 실제로 실행한 팀들이 공통으로 지목하는 실패 원인은 데이터가 아니라 **성능**이다. 기능 테스트는 모두 통과했는데, 실제 프로덕션 부하가 들어오자 특정 쿼리의 실행 계획이 Aurora PostgreSQL에서 다르게 잡혀 응답 시간이 수십 배로 늘어난 사례가 반복된다. Oracle의 힌트에 의존하던 쿼리, 상관 서브쿼리, 대용량 조인에서 특히 잘 생긴다. 그래서 Cutover 전 검증에는 반드시 **프로덕션 수준 부하 테스트**와 `EXPLAIN ANALYZE` 기반 실행 계획 비교가 들어가야 한다. 행 수 일치는 최소 조건이지 충분 조건이 아니다.

## 한정어가 바뀌면 답이 달라진다

"온프레미스 Oracle을 AWS로 옮겨라"라는 하나의 요구에, 한정어만 바꿔 보자.

| 한정어 | 정답 방향 | 왜 |
|--------|-----------|-----|
| **MINIMAL downtime** | DMS **Full Load + CDC** | 원본을 운영하면서 따라잡고 마지막에만 짧게 멈춘다 |
| **MINIMAL changes to application** | Rehost(EC2) 또는 RDS for Oracle | 이종 전환은 필연적으로 코드 변경을 부른다 |
| **LOWEST long-term cost** | SCT + DMS → **Aurora PostgreSQL** | 라이선스 자체를 제거하는 유일한 경로 |
| **LEAST operational overhead (전환 작업 자체)** | **DMS Serverless** | Replication Instance 사이징·스케일링을 없앤다 |
| **네트워크 대역폭이 매우 제한적 / 수십 TB** | **Snowball + DMS(SCT 데이터 추출 에이전트)** | 초기 대량 적재는 물리 전송, 이후 변경분만 CDC |
| **동종 엔진(MySQL → RDS MySQL)** | **DMS만** (SCT 불필요) | 스키마 변환이 필요 없다 |
| **실시간 분석 파이프라인도 필요** | DMS → **Kinesis / S3** 타깃 | DMS의 타깃은 DB만이 아니다 |

> 💡 **암기 팁**: **"downtime을 물으면 CDC, cost를 물으면 Aurora, bandwidth를 물으면 Snowball, 동종이면 SCT 빼라."** 네 문장이면 DMS 문항의 방향이 대부분 잡힌다.

> 🔍 **더 깊이**: 대역폭 제약 시나리오에서 **SCT 데이터 추출 에이전트(Data Extraction Agent)**의 역할을 정확히 알아둘 필요가 있다. 이 에이전트는 온프레미스에서 원본 데이터를 추출·압축해 로컬 파일로 만들고, 그 파일을 Snowball Edge에 적재해 물리적으로 AWS에 보낸 뒤, S3를 거쳐 대상(특히 Redshift 같은 데이터 웨어하우스)으로 로드한다. 수십~수백 TB 규모의 Teradata·Netezza·Oracle DW를 Redshift로 옮길 때 쓰는 표준 경로다. 이때도 **초기 적재만 물리 전송이고, 그 이후의 변경분은 DMS CDC가 네트워크로 따라잡는다** — 이 조합을 묻는 문항이 자주 나온다.

## 정리하며

오늘 본 그림은 넷이다.

첫째, **CDC는 각 DB 엔진의 트랜잭션 로그를 재활용하는 기술**이다. Oracle은 Redo Log(LogMiner + 보충 로깅), SQL Server는 Transaction Log(CDC 기능), MySQL은 binlog(ROW 포맷), PostgreSQL은 WAL(logical replication)이다. 원본 DB에 어떤 사전 설정이 필요한지가 곧 그 엔진의 CDC 소스가 무엇인지를 묻는 문제다.

둘째, **SCT와 DMS는 역할이 다르다**. SCT는 스키마·코드(구조)를, DMS는 데이터(내용)를 옮긴다. 동종 엔진이면 SCT가 필요 없고, 이종 엔진이면 SCT의 자동 변환율 70~80%를 현실적 목표로 잡고 나머지를 위한 개발 리소스를 프로젝트 계획에 포함해야 한다.

셋째, **무중단의 실체는 Full Load + CDC**다. 전체를 복사하는 동안 쌓인 변경을 CDC가 따라잡고, Lag이 0에 수렴한 순간에만 짧게 멈춘다. 다만 Cutover 체크리스트에서 시퀀스 동기화·보조 인덱스·통계 갱신·역방향 CDC 안전망은 별도로 챙겨야 한다.

넷째, **선택지는 한정어가 결정한다**. 다운타임이면 CDC, 장기 비용이면 Aurora로의 Refactor, 앱 변경 최소화면 Rehost 또는 Babelfish, 대역폭 제약이면 Snowball + 데이터 추출 에이전트다. 여러 선택지가 모두 "동작하는" 것이 Pro 문항의 기본 전제이므로, 무엇이 되는지가 아니라 **무엇이 그 한정어에서 가장 나은지**를 골라야 한다.

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
