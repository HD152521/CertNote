# Day 4 - 스키마 관리와 데이터 품질: 진화를 견디고 신뢰를 보장하다

## 📌 핵심 정리

- **Schema Registry**는 스트리밍(Kafka·MSK·Kinesis·Flink) 레코드의 스키마를 중앙에서 버전 관리하고, 호환성 규칙에 맞는 새 버전만 등록되게 한다.
- **BACKWARD**는 새 스키마의 소비자가 이전 데이터를 읽는 것(필드 삭제·선택 필드 추가 허용), **FORWARD**는 그 반대(필드 추가·선택 필드 삭제 허용), **FULL**은 양쪽 모두다.
- **Glue Data Quality**는 DQDL 규칙으로 값의 유효성을 검증한다. Data Catalog 테이블 대상(저장된 데이터 점검)과 ETL Job 안(적재 전 차단) 두 진입점이 있다.
- 형태는 Schema Registry, 내용은 Data Quality, 레이크 테이블의 안전한 컬럼 변경은 Iceberg 같은 테이블 포맷이 맡는다.
- 품질 점수(통과한 규칙의 비율)를 CloudWatch·EventBridge로 내보내 파이프라인의 자동 게이트로 쓴다.

## Schema Registry: 스트리밍 데이터의 스키마 계약

데이터 파이프라인에서 가장 조용하면서도 치명적인 사고는 **스키마가 바뀌는 것**이다. 어제까지 `user_id`가 정수였는데 오늘부터 누군가 문자열로 보낸다. 새 필드가 추가되거나, 있던 필드가 사라진다. 이런 변화를 통제하지 못하면 다운스트림 Job이 줄줄이 깨지고, 더 나쁜 경우 **조용히 잘못된 데이터를 산출**한다. 오늘은 이 두 위험을 다루는 두 도구를 배운다 — 스키마 변화를 관리하는 **Glue Schema Registry**와 데이터 자체의 품질을 검증하는 **Glue Data Quality**다.

**AWS Glue Schema Registry**는 스트리밍 데이터(Kinesis, MSK/Kafka, Managed Flink)의 스키마를 중앙에서 등록·버전 관리·검증하는 서비스다. 핵심 발상은 **생산자(producer)와 소비자(consumer) 사이에 스키마 계약을 강제**하는 것이다.

전통적인 문제는 이렇다. 생산자가 어느 날 메시지 형식을 바꿔 보내면, 그 사실을 모르는 소비자는 파싱에 실패하거나 잘못 해석한다. Schema Registry는 이를 막는다.

```
[Producer]                              [Consumer]
Avro 메시지 직렬화                       Avro 메시지 역직렬화
   ↓ 스키마 등록/검증                       ↑ 스키마 조회
       [Glue Schema Registry]
   - 스키마 버전 관리
   - 호환성 규칙 강제(BACKWARD/FORWARD/FULL)
   - 메시지에는 스키마 ID만 첨부 → 대역폭 절약
```

생산자는 메시지를 보낼 때 전체 스키마가 아니라 **스키마 ID**만 첨부한다. 소비자는 그 ID로 Registry에서 스키마를 조회해 역직렬화한다. 메시지마다 스키마를 통째로 넣지 않으니 대역폭이 절약되고, 스키마는 항상 검증된 버전이 보장된다. 지원 형식은 **Avro, JSON Schema, Protobuf**다.

```java
// 생산자에 Schema Registry 직렬화기 연결 (Kafka 예시)
props.put(AWSSchemaRegistryConstants.DATA_FORMAT, "AVRO");
props.put(AWSSchemaRegistryConstants.SCHEMA_AUTO_REGISTRATION_SETTING, true);
props.put(AWSSchemaRegistryConstants.COMPATIBILITY_SETTING, "BACKWARD");
// 직렬화기가 메시지에 스키마 ID를 자동 첨부하고 호환성을 검증
```

> 💡 **관련 이론**: Schema Registry의 호환성 규칙은 분산 시스템의 "계약 우선(contract-first)" 설계를 구현한 것이다. **BACKWARD 호환**은 "새 스키마로 만든 소비자가 옛 데이터를 읽을 수 있다"(필드 삭제·기본값 있는 추가 허용), **FORWARD 호환**은 "옛 스키마 소비자가 새 데이터를 읽을 수 있다"(필드 추가 허용), **FULL**은 양방향 모두를 보장한다. 이 규칙 덕분에 생산자와 소비자를 동시에 배포하지 않아도, 무중단으로 점진적 스키마 변경(rolling deployment)이 가능하다.

## 스키마 진화(Schema Evolution)를 다루는 법

스키마는 반드시 변한다. 중요한 건 "변화를 막는 것"이 아니라 "변화를 안전하게 허용하는 것"이다. 진화 유형별 대응을 정리하면 다음과 같다.

| 변화 유형 | 안전성 | 처리 방법 |
|-----------|--------|-----------|
| 필드 추가(기본값 있음) | 안전 | BACKWARD 호환, 옛 소비자 무영향 |
| 필드 삭제 | 주의 | FORWARD 호환 위반 가능, 소비자 점검 |
| 타입 변경(int→string) | 위험 | 보통 비호환, 새 필드로 추가 권장 |
| 필드 이름 변경 | 위험 | 삭제+추가로 취급, alias 활용 |

배치 ETL 쪽에서는 어제 배운 **DynamicFrame의 ResolveChoice**가 진화를 흡수하는 도구다. 또 Parquet/Avro 같은 형식 자체가 스키마 진화를 일부 지원하고, **Apache Iceberg 같은 개방형 테이블 포맷**은 컬럼 추가·삭제·이름변경을 트랜잭션으로 안전하게 처리한다.

```python
# 배치 측 진화 흡수: 타입 충돌을 구조체로 보존 후 정리
resolved = ResolveChoice.apply(
    frame=dyf,
    choice="make_struct"   # int와 string을 한 구조체에 모두 보존
)
```

> 🔍 **더 깊이**: 스트리밍에서는 Schema Registry가 진화를 게이트키핑하고, 데이터 레이크 배치에서는 **개방형 테이블 포맷(Apache Iceberg, Hudi, Delta Lake)**이 진화를 책임진다. Iceberg는 컬럼에 고유 ID를 부여하므로, 이름을 바꿔도 데이터 매핑이 깨지지 않는다(ID 기반 매핑). 컬럼을 이름이나 위치로 찾는 일반 Parquet 테이블과의 결정적 차이다. 시험에서 "스키마가 자주 바뀌는 데이터 레이크에서 안전한 진화"가 나오면 Iceberg 같은 테이블 포맷을 떠올려야 한다.

## Glue Data Quality: 데이터가 "맞는지"를 검증하다

스키마가 맞아도 **값이 틀릴 수 있다**. 금액이 음수거나, 필수 컬럼에 null이 90%거나, ID가 중복된다. 스키마 검증은 "형태"를 보고 데이터 품질 검증은 "내용"을 본다. **AWS Glue Data Quality**는 데이터에 대한 규칙을 정의하고 자동으로 검증하는 서비스다.

규칙은 **DQDL(Data Quality Definition Language)**이라는 선언적 언어로 작성한다.

```
Rules = [
    IsComplete "order_id",                       # null 없어야 함
    IsUnique "order_id",                         # 중복 없어야 함
    ColumnValues "amount" >= 0,                  # 금액은 0 이상
    ColumnValues "status" in ["NEW","PAID","CANCELLED"],
    Completeness "email" > 0.95,                 # 95% 이상 채워짐
    RowCount between 1000 and 1000000,           # 행 수 범위
    ColumnValues "created_at" matches "\\d{4}-\\d{2}-\\d{2}"
]
```

Glue Data Quality는 두 가지 방식으로 쓸 수 있다. (1) **Data Catalog 테이블**에 규칙을 붙여 주기적으로 검증, (2) **Glue ETL 파이프라인 안의 변환 노드**로 넣어 "품질 미달 데이터는 적재 전 차단/격리". 특히 두 번째가 강력하다 — 나쁜 데이터가 다운스트림으로 흘러가기 전에 막는다.

```python
# ETL 파이프라인 중간에 품질 게이트 (개념)
# 규칙 통과 행 → 정상 경로, 실패 행 → 격리 버킷(quarantine)
ruleset = """Rules = [ ColumnValues "amount" >= 0, IsComplete "order_id" ]"""
# EvaluateDataQuality 변환이 통과/실패를 분기
```

> ⚠️ **함정**: Glue Data Quality는 **추천 규칙 자동 생성** 기능이 있다. 데이터를 분석해 적절해 보이는 규칙을 제안해 주지만, 이를 그대로 신뢰하면 안 된다. 추천은 현재 데이터 분포 기반이라, 정상적인 미래 변화까지 "이상"으로 판정해 오탐(false positive)을 낼 수 있다. 추천을 출발점으로 삼되 비즈니스 규칙에 맞게 사람이 검토·조정해야 한다.

## 품질 점수와 운영 통합

Data Quality Job은 실행 후 **품질 점수(통과한 규칙 비율)**와 규칙별 통과/실패 상세를 산출한다. 이 결과를 CloudWatch/EventBridge로 보내 알림을 걸거나, Step Functions에서 "점수가 임계치 미만이면 파이프라인 중단" 같은 분기를 만들 수 있다. 품질을 **관측 가능한 지표(observable metric)**로 만드는 것이 핵심이다.

> 🎯 **시나리오**: 일일 매출 데이터가 분석 테이블로 적재되기 전, 품질을 자동 검증해야 한다. 구성은 (1) Glue ETL 파이프라인에 EvaluateDataQuality 노드 삽입 → (2) DQDL로 `amount >= 0`, `IsComplete "order_id"`, `RowCount between ...` 규칙 정의 → (3) 통과 데이터만 분석 테이블로 적재, 실패 행은 격리 버킷으로 분기 → (4) 품질 점수를 CloudWatch로 보내 임계치 미만이면 SNS 알림 → (5) EventBridge로 실패 시 운영 워크플로우 트리거. 나쁜 데이터가 대시보드에 닿기 전에 차단된다.

## 호환성 모드 여덟 가지와 배포 순서

본문에서는 BACKWARD·FORWARD·FULL 셋만 봤지만 실제 모드는 여덟 가지다. 호환성 모드는 "새 스키마 버전을 등록해도 되는가"를 판정하는 규칙이고, 통과하지 못한 버전은 등록 요청 자체가 실패한다.

| 모드 | 비교 대상 | 허용되는 변경 | 먼저 올릴 쪽 |
|------|-----------|---------------|--------------|
| BACKWARD | 직전 버전 | 필드 삭제, 선택(optional) 필드 추가 | 소비자 |
| BACKWARD_ALL | 모든 이전 버전 | 위와 같음 | 소비자 |
| FORWARD | 직전 버전 | 필드 추가, 선택 필드 삭제 | 생산자 |
| FORWARD_ALL | 모든 이전 버전 | 위와 같음 | 생산자 |
| FULL | 직전 버전 | 선택 필드의 추가·삭제 | 어느 쪽이든 |
| FULL_ALL | 모든 이전 버전 | 위와 같음 | 어느 쪽이든 |
| NONE | 검사하지 않음 | 무엇이든 등록된다 | 개발 단계용 |
| DISABLED | — | 새 버전 등록 자체를 막는다 | 스키마 동결 |

- **"먼저 올릴 쪽"이 정해지는 이유**: BACKWARD는 새 스키마로 옛 데이터를 읽을 수 있음을 보장하므로, 소비자를 먼저 새 스키마로 올려도 아직 옛 형식으로 들어오는 레코드를 읽을 수 있다. FORWARD는 옛 스키마로 새 데이터를 읽을 수 있음을 보장하므로 생산자를 먼저 바꿔도 된다.
- **`_ALL`이 필요한 경우**: 스트림을 과거 시점부터 재생(replay)하면 여러 버전 전의 레코드가 섞여 들어온다. 직전 버전만 비교하는 BACKWARD는 v1과 v3 사이의 호환까지 보장하지 않는다. 장기 보존 스트림이나 재처리가 잦은 토픽에는 `_ALL` 계열이 맞다.
- **NONE과 DISABLED는 정반대다.** NONE은 검사 없이 어떤 버전이든 받아들이고, DISABLED는 그 스키마에 새 버전을 더 이상 추가하지 못하게 잠근다.

Avro 스키마가 이름(필수)·이메일(필수)·전화번호(선택)로 이루어져 있다고 하자.

| 변경 | BACKWARD | FORWARD | 이유 |
|------|----------|---------|------|
| 필수 필드 `email` 삭제 | 등록 성공 | 거부 | 새 소비자는 옛 레코드의 남는 필드를 무시하면 되지만, 옛 소비자는 새 레코드에서 필수 값을 찾지 못한다 |
| 필수 필드 `zip_code` 추가 | 거부 | 등록 성공 | 새 소비자는 옛 레코드에서 필수 값을 찾지 못하지만, 옛 소비자는 모르는 필드를 무시하면 된다 |
| 선택 필드 `zip_code` 추가 | 등록 성공 | 등록 성공 | 없어도 되는 필드라 양쪽 모두 읽을 수 있다 |

> 🔍 **더 깊이**: 호환되지 않는 스키마는 **스트림에 들어가기 전에** 막힌다. 자동 등록을 켠 생산자의 직렬화기는 레코드를 보내기 전에 스키마를 Registry에 등록(또는 조회)하는데, 호환성 검사에 실패하면 등록이 거부되어 그 형식으로는 보내지 못한다. 소비자 쪽에서 파싱이 깨진 뒤에 알게 되는 것과, 생산자 배포 단계에서 바로 드러나는 것의 차이다. Schema Registry 자체는 추가 요금이 없고, 리전당 레지스트리 100개·스키마 버전 10,000개, 스키마 본문 170KB라는 한도가 있다.

## Schema Registry와 Data Catalog는 다른 물건이다

둘 다 Glue 콘솔에 있고 둘 다 "스키마"를 다뤄서 자주 섞인다.

| 구분 | Glue Schema Registry | Glue Data Catalog |
|------|----------------------|-------------------|
| 대상 | 스트림 위를 흐르는 레코드 | S3 등에 저장된 테이블 |
| 담는 것 | 스키마 정의와 그 버전(Avro / JSON Schema / Protobuf) | 테이블·파티션·위치·형식 |
| 스키마가 적용되는 시점 | 생산자가 직렬화할 때, 소비자가 역직렬화할 때 | 쿼리 엔진이 읽을 때(스키마-온-리드) |
| 변경 통제 | 호환성 모드로 새 버전 등록을 거부 | 크롤러의 스키마 변경 정책, 수동 DDL |
| 채우는 주체 | 직렬화기의 자동 등록 또는 API | 크롤러·DDL·ETL Job |
| 쓰는 쪽 | Kafka/MSK·Kinesis 클라이언트, Managed Flink, Lambda | Athena·Redshift Spectrum·EMR·Glue ETL |

## DQDL을 더 깊이: 규칙의 종류와 표현

| 보고 싶은 것 | 규칙 유형 예 |
|--------------|--------------|
| 비어 있지 않은가 | `IsComplete`, `Completeness` |
| 중복이 없는가 | `IsUnique`, `Uniqueness`, `IsPrimaryKey` |
| 값의 범위·형식·허용 목록 | `ColumnValues`, `ColumnLength`, `ColumnDataType` |
| 양이 정상인가 | `RowCount`, `ColumnCount` |
| 최신 데이터인가 | `DataFreshness` |
| 다른 데이터셋과 맞는가 | `ReferentialIntegrity`, `DatasetMatch`, `RowCountMatch` |
| 스키마가 기대와 같은가 | `SchemaMatch`, `ColumnExists` |
| 위 유형으로 표현하기 어려운 조건 | `CustomSql` |

```
Rules = [
    # 전부가 아니라 "대부분"을 요구: 95% 넘게 허용 목록에 있으면 통과
    ColumnValues "status" in ["NEW","PAID","CANCELLED"] with threshold > 0.95,
    # 복합 규칙: 각 규칙을 괄호로 감싸 and / or 로 결합
    (IsComplete "order_id") and (IsUnique "order_id"),
    # 동적 규칙: 고정 숫자 대신 최근 실행 이력과 비교
    RowCount > avg(last(3))
]
```

- **`IsComplete`와 `Completeness`의 차이**: 앞의 것은 null이 하나도 없어야 통과이고, 뒤의 것은 채워진 비율을 식과 비교한다(`Completeness "email" > 0.95`).
- **`between`은 양 끝 값을 포함하지 않는다.** `RowCount between 1000 and 1000000`은 정확히 1,000행이면 실패한다. 경계값을 포함하려면 `>=`, `<=`로 쓴다.
- **복합 규칙의 기본 평가 단위는 행이 아니라 데이터셋이다.** 각 규칙을 테이블 전체에 대해 먼저 평가한 뒤 결과를 and/or로 합친다. "행마다 A이거나 B"를 뜻하게 하려면 평가 방식을 행 단위로 바꾸는 설정이 따로 필요하다.
- **동적 규칙**은 "어제보다 급감했는가" 같은 상대 기준을 표현한다. 비교할 이력이 아직 없으면 `last()`가 0을 돌려주므로 첫 실행은 쉽게 통과한다는 점을 알고 써야 한다.
- 중첩 구조나 리스트 타입 컬럼은 규칙으로 평가할 수 없어 먼저 평탄화해야 한다. 룰셋 하나에 담을 수 있는 규칙은 2,000개까지다.

## 두 진입점의 차이: 저장된 데이터 점검과 적재 전 차단

| 기능 | Data Catalog 테이블 대상 | ETL Job 안 |
|------|--------------------------|------------|
| 성격 | 이미 저장된 데이터를 주기적으로 점검 | 적재 전에 걸러내는 사전 검증 |
| 주 사용자 | 코드를 쓰지 않는 데이터 관리자·분석가 | 파이프라인을 만드는 엔지니어 |
| 규칙 추천 | 지원 | 미지원 |
| 품질 검사에 실패한 레코드 식별 | 미지원 | 지원 |
| 신규분만 검증 | 푸시다운 프레디킷 | Job 북마크 |
| CloudWatch·EventBridge 연동 | 지원 | 지원 |

"나쁜 행만 격리 버킷으로"라는 요구는 실패 레코드를 식별할 수 있는 ETL 쪽에서만 구현된다. 반대로 추천 규칙으로 출발하는 흐름은 Catalog 쪽에서 시작한다.

```python
# ETL Job 안에서 행 단위 결과로 통과/실패를 가르는 예 (개념)
from awsgluedq.transforms import EvaluateDataQuality
from awsglue.transforms import SelectFromCollection

dq = EvaluateDataQuality().process_rows(
    frame=orders,
    ruleset=ruleset,
    publishing_options={
        "dataQualityEvaluationContext": "orders_dq",
        "enableDataQualityCloudWatchMetrics": True,
        "enableDataQualityResultsPublishing": True,
    },
)
rows = SelectFromCollection.apply(dfc=dq, key="rowLevelOutcomes").toDF()
good = rows.filter(rows.DataQualityEvaluationResult == "Passed")  # 분석 테이블로
bad = rows.filter(rows.DataQualityEvaluationResult == "Failed")   # 격리 버킷으로
```

행 단위로 가를 수 있는 것은 `ColumnValues`처럼 행마다 참·거짓이 정해지는 규칙이다. `RowCount`처럼 데이터셋 전체에 대한 규칙은 "어느 행이 틀렸는가"가 없으므로, 격리가 아니라 Job 전체를 멈추는 게이트로 쓴다.

## 스키마 문제인가 품질 문제인가: 판별표

| 증상 | 문제의 종류 | 담당 |
|------|-------------|------|
| 생산자가 필드 타입을 바꿔 소비자의 역직렬화가 깨진다 | 스트림의 스키마 계약 | Schema Registry 호환성 모드 |
| 금액이 음수, ID 중복, 필수 컬럼이 null | 값의 품질 | Glue Data Quality |
| 어제보다 행 수가 절반으로 줄었다 | 양의 이상 | Data Quality의 `RowCount`(동적 규칙) |
| 레이크 테이블의 컬럼 이름을 바꿨더니 과거 데이터가 비어 보인다 | 테이블 스키마 진화 | Iceberg 같은 테이블 포맷 |
| 한 컬럼에 정수와 문자열이 섞여 ETL이 죽는다 | 배치의 타입 충돌 | DynamicFrame `ResolveChoice` |
| 크롤러가 테이블 정의를 바꿔 버린다 | Catalog 스키마 변경 | 크롤러의 스키마 변경 정책 |

내일은 이번 주 Glue 변환 전체를 종합 복습한다.

## 📖 용어

- **스키마 진화** : 필드 추가·삭제·타입 변경처럼 시간이 지나며 스키마가 바뀌는 것, 그리고 그 변화를 기존 데이터·소비자를 깨뜨리지 않고 받아들이는 방법.
- **호환성 모드** : 새 스키마 버전을 등록해도 되는지 판정하는 Schema Registry의 규칙. 통과하지 못하면 등록이 거부된다.
- **BACKWARD 호환** : 새 스키마를 쓰는 소비자가 이전 스키마로 쓰인 데이터를 읽을 수 있는 성질.
- **FORWARD 호환** : 이전 스키마를 쓰는 소비자가 새 스키마로 쓰인 데이터를 읽을 수 있는 성질.
- **직렬화 / 역직렬화** : 객체를 전송용 바이트로 바꾸는 것과 그 바이트를 다시 객체로 되돌리는 것. 양쪽이 같은 스키마를 알아야 한다.
- **DQDL** : Glue Data Quality의 규칙을 적는 선언형 언어. `Rules = [ ... ]` 안에 규칙을 나열한다.
- **품질 점수** : 룰셋의 규칙 중 통과한 규칙의 비율.
- **품질 게이트** : 품질 기준을 넘지 못한 데이터가 다음 단계로 넘어가지 못하게 막는 파이프라인의 관문.
- **격리(quarantine)** : 규칙에 실패한 레코드를 버리지 않고 별도 위치에 따로 모아 두는 것.
- **개방형 테이블 포맷** : Iceberg·Hudi·Delta Lake처럼 파일 묶음 위에 스키마·스냅샷·트랜잭션 메타데이터를 얹어 테이블처럼 다루게 하는 형식.

## 📝 연습 문제

**문제 1.** Kafka/Kinesis 스트리밍에서 생산자가 보낸 메시지 형식을 소비자가 안전하게 역직렬화하도록, 스키마를 중앙 등록하고 호환성 규칙을 강제하는 서비스는?

A) Glue Data Catalog  
B) Glue DataBrew  
C) Glue Schema Registry  
D) Glue 크롤러  

**정답: C**  
해설: Schema Registry는 스트리밍 데이터의 스키마를 버전 관리하고 BACKWARD/FORWARD/FULL 호환성을 강제해 생산자-소비자 계약을 보장한다. Data Catalog는 배치 분석용 메타데이터, DataBrew는 정제 도구, 크롤러는 메타데이터 등록 도구로 호환성 강제와 무관하다.

---

**문제 2.** 새 스키마로 만든 소비자가 과거 데이터를 문제없이 읽을 수 있도록 보장하는 Schema Registry의 호환성 모드는?

A) FORWARD  
B) NONE  
C) DISABLED  
D) BACKWARD  

**정답: D**  
해설: BACKWARD 호환은 "새 스키마 소비자가 옛 데이터를 읽을 수 있음"을 보장하며, 기본값 있는 필드 추가나 필드 삭제를 허용한다. FORWARD는 반대로 옛 소비자가 새 데이터를 읽는 경우를 보장한다. NONE은 검증을 하지 않고, DISABLED는 새 버전 등록 자체를 막는 모드라 둘 다 답이 아니다.

---

**문제 3.** 데이터의 스키마는 올바르지만 `amount` 컬럼에 음수 값이 섞여 있고 `order_id`에 중복이 있다. 이를 규칙으로 정의해 자동 검증하고 적재 전 차단하려면?

A) Glue 크롤러의 파티션 탐지를 사용  
B) Glue Data Quality에 DQDL 규칙을 정의하고 ETL 파이프라인에 품질 게이트로 통합  
C) Schema Registry의 호환성 모드를 FULL로 설정  
D) Athena 파티션 프로젝션을 적용  

**정답: B**  
해설: 값의 유효성(음수 금지, 중복 금지)은 스키마가 아니라 데이터 품질의 문제이며, Glue Data Quality의 DQDL 규칙(ColumnValues, IsUnique 등)으로 정의해 ETL 파이프라인 게이트로 차단·격리한다. Schema Registry는 형태만 검증하고, 크롤러·파티션 프로젝션은 값 검증과 무관하다.

---

**문제 4.** 데이터 레이크 배치에서 컬럼 이름을 바꿔도 데이터 매핑이 깨지지 않도록 컬럼에 고유 ID를 부여해 안전한 스키마 진화를 지원하는 테이블 포맷은?

A) 순수 CSV  
B) 압축되지 않은 JSON  
C) Apache Iceberg  
D) 단일 Parquet 파일(테이블 포맷 없음)  

**정답: C**  
해설: Apache Iceberg는 컬럼에 고유 ID를 부여해 이름 변경·추가·삭제를 트랜잭션으로 안전하게 처리한다. 컬럼을 이름이나 위치로 찾는 일반 Parquet/CSV/JSON 테이블은 컬럼 이름 변경 시 매핑이 깨질 수 있어 안전한 진화를 보장하지 못한다.

---

**문제 5.** Glue Data Quality의 자동 추천 규칙에 대한 올바른 태도는?

A) 추천은 현재 데이터 분포 기반이라 정상적 변화를 오탐할 수 있으므로 출발점으로 삼되 사람이 검토·조정한다  
B) 추천 규칙은 항상 정확하므로 그대로 운영에 적용한다  
C) 추천 기능은 존재하지 않는다  
D) 추천 규칙은 스키마 호환성만 검사한다  

**정답: A**  
해설: 추천 규칙은 현재 데이터 분포를 기반으로 생성되므로 미래의 정상적 변화를 이상으로 판정하는 오탐을 낼 수 있다. 따라서 출발점으로 활용하되 비즈니스 규칙에 맞게 사람이 검토·조정해야 한다. 추천 기능은 실제로 존재하며 값 기반 품질 규칙을 다룬다.

---
