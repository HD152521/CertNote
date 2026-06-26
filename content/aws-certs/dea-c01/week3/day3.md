# Day 3 - CDC와 데이터 복제: Database Migration Service(DMS)

운영 중인 데이터베이스의 데이터를 데이터 웨어हウ스나 데이터 레이크로 옮겨야 하는 순간은 끝없이 찾아온다. 그런데 운영 DB를 멈출 수는 없다. 매일 밤 전체 테이블을 통째로 덤프(full dump)하는 방식은 데이터가 커질수록 시간이 폭발하고, 덤프하는 동안의 변경분은 누락된다. 그리고 "어제 밤 스냅샷"은 실시간 분석에 무용하다.

이 문제의 답이 **CDC(Change Data Capture, 변경 데이터 캡처)**다. CDC는 "전체를 다시 읽지 말고, 마지막 이후 *바뀐 것만* 잡아내라"는 발상이다. AWS에서 이 작업을 담당하는 서비스가 **AWS Database Migration Service(DMS)**다. 이름은 "마이그레이션"이지만, 실제로는 일회성 마이그레이션과 지속적 복제(CDC)를 모두 수행한다.

## DMS의 세 가지 구성 요소

DMS는 세 부품의 조합으로 동작한다. 이 분해를 이해하면 시험 문제의 절반이 풀린다.

```
[Source Endpoint] → [Replication Instance] → [Target Endpoint]
   (예: RDS MySQL)    (마이그레이션 작업 실행)   (예: S3 / Redshift)
                            │
                       [Migration Task]
                   (Full Load / CDC / Full+CDC)
```

| 구성 요소 | 역할 |
|-----------|------|
| Source Endpoint | 데이터를 읽어올 원본 연결 정보 |
| Target Endpoint | 데이터를 쓸 대상 연결 정보 |
| Replication Instance | 실제 이관 작업을 수행하는 컴퓨팅(EC2 기반) |
| Migration Task | 어떤 테이블을, 어떤 모드로 옮길지 정의 |

DMS의 강점은 **이기종(heterogeneous) 복제**다. Oracle → PostgreSQL, SQL Server → S3처럼 엔진이 달라도 옮길 수 있다. 단, 스키마/코드(저장 프로시저 등) 변환까지는 DMS가 못 한다. 그건 **AWS SCT(Schema Conversion Tool)** 또는 DMS Schema Conversion의 몫이다. "데이터 = DMS, 스키마/코드 변환 = SCT"로 역할이 갈린다.

> 💡 **관련 이론**: CDC는 데이터 통합의 고전적 패턴이다. 대안인 "스냅샷 차분(snapshot diff)"은 두 시점의 전체 데이터를 비교해 변경을 찾지만, 데이터가 클수록 비용이 폭발한다. CDC는 DB가 이미 기록하는 변경 로그(트랜잭션 로그)를 활용해 변경만 추출하므로 원본 DB에 가하는 부하가 작다. "데이터를 다시 묻지 말고, 데이터가 이미 남긴 흔적을 읽어라"가 CDC의 철학이다.

## 세 가지 마이그레이션 모드

Migration Task는 세 가지 모드 중 하나로 동작한다.

| 모드 | 동작 | 용도 |
|------|------|------|
| Full Load | 기존 데이터를 통째로 한 번 복사 | 일회성 이전 |
| CDC only | 시작 시점 이후 변경분만 지속 복제 | 이미 초기 적재가 끝난 경우 |
| Full Load + CDC | 전체 복사 후, 이어서 변경분 지속 복제 | 무중단 마이그레이션의 표준 |

가장 중요한 건 **Full Load + CDC**다. 절차는 이렇다. (1) Full Load가 돌면서 기존 데이터를 통째로 옮긴다. (2) Full Load가 진행되는 동안 원본에서 발생한 변경은 DMS가 캐시에 모아둔다. (3) Full Load가 끝나면 캐시에 모인 변경분을 적용하고, 그 이후부터는 실시간 CDC로 전환한다. 이렇게 하면 운영 DB를 멈추지 않고도 일관된 상태로 옮길 수 있다.

```json
// Migration Task 설정 (개념적 발췌)
{
  "MigrationType": "full-load-and-cdc",
  "TableMappings": {
    "rules": [{
      "rule-type": "selection",
      "object-locator": { "schema-name": "sales", "table-name": "orders" },
      "rule-action": "include"
    }]
  }
}
```

> ⚠️ **함정**: CDC가 동작하려면 **원본 DB의 변경 로그 접근이 활성화**되어 있어야 한다. MySQL은 binary log(binlog)를 row 형식으로, PostgreSQL은 logical replication(`wal_level=logical`)을, Oracle은 supplemental logging을 켜야 한다. 이 사전 설정을 빠뜨리면 Full Load는 되는데 CDC가 안 되는 증상이 나타난다. 시험 단골 함정이다.

## CDC는 어떻게 변경을 잡아내는가: 트랜잭션 로그

CDC의 핵심은 DB가 내구성을 위해 이미 기록하는 **트랜잭션 로그**를 읽는 것이다. 모든 관계형 DB는 커밋 전에 변경을 로그에 먼저 쓴다(Write-Ahead Logging). DMS는 이 로그를 따라가며 INSERT/UPDATE/DELETE를 추출한다.

| 원본 DB | CDC가 읽는 로그 | 필요한 설정 |
|---------|-----------------|-------------|
| MySQL / MariaDB | Binary Log (binlog) | `binlog_format=ROW` |
| PostgreSQL | Write-Ahead Log (WAL) | `wal_level=logical` |
| Oracle | Redo/Archive Log | Supplemental Logging |
| SQL Server | Transaction Log | MS-CDC 또는 MS-Replication |

이 방식의 큰 장점은 원본 테이블에 트리거를 걸거나 추가 쿼리를 날리지 않는다는 점이다. 이미 존재하는 로그를 읽기만 하므로 원본 워크로드에 미치는 영향이 작다(low-impact).

> 🔍 **더 깊이**: CDC가 추출한 각 변경 레코드에는 연산 종류를 나타내는 메타데이터가 붙는다. DMS는 이를 S3 타깃에 적재할 때 `Op` 컬럼(`I`=insert, `U`=update, `D`=delete)으로 표시할 수 있다(`includeOpForFullLoad`, `cdcInsertsAndUpdates` 설정). 다운스트림에서 이 `Op` 컬럼을 보고 데이터 레이크에 merge/upsert 로직을 구현한다. CDC는 "현재 값"이 아니라 "변화의 흐름"을 전달한다는 점이 핵심이다.

## DMS Serverless와 검증

전통적 DMS는 Replication Instance의 크기를 직접 골라야 했다. 너무 작으면 CDC가 밀리고, 너무 크면 낭비다. **DMS Serverless**는 워크로드에 따라 용량(DCU, DMS Capacity Unit)을 자동 조정해 이 사이징 고민을 덜어준다.

DMS에는 **데이터 검증(data validation)** 기능도 있다. 원본과 대상의 행을 비교해 실제로 데이터가 일치하는지 확인한다. 마이그레이션이 "끝났다"고 보고됐어도 데이터가 정확히 옮겨졌는지는 별개 문제이므로, 검증을 켜두면 불일치 행을 자동으로 찾아준다.

```
DMS 운영 시 핵심 CloudWatch 지표
- CDCLatencySource : 원본 로그에서 변경을 읽는 지연
- CDCLatencyTarget : 대상에 변경을 적용하는 지연
- FullLoadThroughputRowsTarget : Full Load 적재 속도
```

`CDCLatencyTarget`이 계속 증가하면 대상 쓰기가 병목이라는 뜻이다(예: Redshift 커밋 부담). `CDCLatencySource`가 증가하면 원본 로그를 읽는 속도가 문제다.

> 🎯 **시나리오**: 온프레미스 Oracle DB를 다운타임 없이 Aurora PostgreSQL로 옮긴다. 절차는 (1) SCT로 스키마/저장 프로시저를 PostgreSQL 호환으로 변환 → (2) Oracle에 supplemental logging 활성화 → (3) DMS Full Load + CDC 태스크 시작 → (4) Full Load 완료 후 실시간 CDC로 두 DB를 동기 유지 → (5) 데이터 검증으로 정합성 확인 → (6) 애플리케이션을 PostgreSQL로 전환(cutover)하고 CDC 중단. SCT와 DMS의 역할 분담이 핵심이다.

## CDC를 데이터 레이크/웨어하우스로: 패턴들

DMS의 타깃이 분석 시스템일 때 흔한 패턴들이 있다.

```
패턴 1: 운영 DB → DMS(CDC) → S3 → (Glue/Spark) → 데이터 레이크
  - S3에 변경분을 Parquet로 적재, Op 컬럼으로 merge
  - Apache Hudi / Iceberg로 upsert 가능한 레이크 테이블 구성

패턴 2: 운영 DB → DMS(CDC) → Kinesis Data Streams → Flink/Firehose
  - 변경 이벤트를 실시간 스트림으로 흘려 다수 컨슈머가 소비

패턴 3: 운영 DB → DMS(Full+CDC) → Amazon Redshift
  - 분석 웨어하우스를 운영 DB와 근실시간 동기 유지
```

DMS의 타깃 엔드포인트로 S3, Kinesis Data Streams, Redshift, OpenSearch, DynamoDB 등 분석 친화적 대상을 직접 지정할 수 있다는 점이 데이터 엔지니어링 맥락에서 중요하다. 특히 "운영 DB의 변경을 데이터 레이크에 근실시간으로 반영"은 DEA 시험의 핵심 시나리오다.

> 💡 **관련 이론**: CDC를 스트림으로 흘리는 패턴은 "데이터베이스를 이벤트 스트림으로 본다"는 관점(Kafka 창시자 Jay Kreps의 "Turning the database inside-out")과 맞닿아 있다. 테이블의 현재 상태는 모든 변경 이벤트를 누적 적용한 결과(materialized view)일 뿐이라는 시각이다. CDC는 이 변경 로그를 외부로 노출해, 하나의 변경을 여러 다운스트림(레이크, 검색, 캐시)이 각자 재구성하게 한다.

## 정리: 멈추지 않고 옮기기

CDC의 본질은 "전체를 다시 읽지 않고 변경만 따라간다"는 것이고, DMS는 이를 이기종 환경에서 관리형으로 제공한다. 무중단 마이그레이션의 표준은 Full Load + CDC이며, CDC를 켜려면 원본의 트랜잭션 로그 설정이 선행되어야 한다. 스키마/코드 변환은 SCT가, 데이터 이관은 DMS가 맡는다. 이 분담과 모드 선택, 로그 사전 설정이 시험의 핵심이다. 내일은 이런 수집들을 큰 그림으로 묶는 아키텍처 패턴 — Lambda 아키텍처와 이벤트 기반 수집 — 으로 넘어간다.

---

## 📝 연습 문제

**문제 1.** 운영 중인 RDS MySQL을 다운타임 없이 분석용 S3 데이터 레이크로 옮기면서, 이전 이후에도 변경분을 계속 반영하려 한다. 가장 적절한 DMS 마이그레이션 모드는?

A) Full Load only  
B) CDC only  
C) Full Load + CDC  
D) Schema Conversion only  

**정답: C**  
해설: 무중단 마이그레이션의 표준은 Full Load + CDC다. 기존 데이터를 전체 복사(Full Load)한 뒤, 그 사이 발생한 변경분을 적용하고 이후부터 실시간 CDC로 지속 동기화한다. Full Load only는 이후 변경을 반영 못 하고, CDC only는 초기 데이터가 없는 상태에서만 적합하다.

---

**문제 2.** DMS로 PostgreSQL을 소스로 CDC를 구성했는데 Full Load는 성공하지만 변경분이 전혀 복제되지 않는다. 가장 가능성 높은 원인은?

A) 원본 PostgreSQL의 `wal_level`이 logical로 설정되지 않았다  
B) Replication Instance가 너무 크다  
C) Target Endpoint가 S3여서  
D) Migration Task 이름에 대문자가 있어서  

**정답: A**  
해설: PostgreSQL CDC는 logical replication을 사용하므로 `wal_level=logical` 설정이 필요하다. 이 설정이 없으면 Full Load는 되지만 CDC가 변경 로그를 읽지 못한다. MySQL은 ROW 형식 binlog, Oracle은 supplemental logging이 동일한 역할을 한다. CDC 사전 로그 설정 누락은 대표적인 함정이다.

---

**문제 3.** Oracle 데이터베이스를 Aurora PostgreSQL로 옮길 때, 테이블 데이터가 아니라 저장 프로시저와 스키마 구조를 PostgreSQL 호환으로 변환하는 도구는?

A) DMS Migration Task  
B) Amazon Athena  
C) AWS Glue Crawler  
D) AWS SCT(Schema Conversion Tool) / DMS Schema Conversion  

**정답: D**  
해설: DMS는 데이터 이관을 담당하지만 스키마/저장 프로시저 같은 코드 변환은 SCT(또는 DMS Schema Conversion)의 몫이다. 이기종 마이그레이션에서 "데이터=DMS, 스키마/코드 변환=SCT"로 역할이 나뉜다. Glue Crawler는 메타데이터 카탈로그용, Athena는 쿼리 엔진이다.

---

**문제 4.** DMS CDC 작업에서 `CDCLatencyTarget` 지표가 지속적으로 증가하고 `CDCLatencySource`는 정상이다. 무엇을 의미하는가?

A) 원본 DB 로그를 읽는 속도가 느리다  
B) 대상(target)에 변경을 적용하는 단계가 병목이다  
C) Replication Instance가 종료됐다  
D) 데이터 검증이 실패했다  

**정답: B**  
해설: `CDCLatencyTarget`은 대상에 변경을 적용하는 지연을, `CDCLatencySource`는 원본 로그를 읽는 지연을 나타낸다. Target만 증가하면 대상 쓰기(예: Redshift 커밋 부담, 인덱스 등)가 병목이라는 뜻이다. 대상 측 처리 능력이나 적재 방식을 개선해야 한다.

---

**문제 5.** 운영 DB의 변경을 여러 다운스트림(데이터 레이크, 실시간 대시보드, 검색 인덱스)이 각자 소비하도록 하려 한다. DMS의 CDC 출력을 어디로 보내는 것이 이 팬아웃에 가장 적합한가?

A) Kinesis Data Streams (이후 여러 컨슈머가 구독)  
B) 단일 RDS 인스턴스  
C) 로컬 파일 시스템  
D) 단일 EBS 볼륨  

**정답: A**  
해설: CDC 변경 이벤트를 Kinesis Data Streams로 보내면 여러 컨슈머(Flink, Firehose→S3, OpenSearch 등)가 같은 스트림을 독립적으로 구독해 각자 재구성할 수 있다. 이는 "데이터베이스를 이벤트 스트림으로 노출"하는 팬아웃 패턴의 표준이다. 단일 인스턴스/볼륨은 다중 소비에 부적합하다.

---
