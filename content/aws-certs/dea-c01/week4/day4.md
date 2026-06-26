# Day 4 - 스키마 관리와 데이터 품질: 진화를 견디고 신뢰를 보장하다

데이터 파이프라인에서 가장 조용하면서도 치명적인 사고는 **스키마가 바뀌는 것**이다. 어제까지 `user_id`가 정수였는데 오늘부터 누군가 문자열로 보낸다. 새 필드가 추가되거나, 있던 필드가 사라진다. 이런 변화를 통제하지 못하면 다운스트림 Job이 줄줄이 깨지고, 더 나쁜 경우 **조용히 잘못된 데이터를 산출**한다. 오늘은 이 두 위험을 다루는 두 도구를 배운다 — 스키마 변화를 관리하는 **Glue Schema Registry**와 데이터 자체의 품질을 검증하는 **Glue Data Quality**다.

## Schema Registry: 스트리밍 데이터의 스키마 계약

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

배치 ETL 쪽에서는 어제 배운 **DynamicFrame의 ResolveChoice**가 진화를 흡수하는 도구다. 또 Parquet/Avro 같은 형식 자체가 스키마 진화를 일부 지원하고, **Lake Formation / Iceberg 같은 테이블 포맷**은 컬럼 추가·삭제·이름변경을 트랜잭션으로 안전하게 처리한다.

```python
# 배치 측 진화 흡수: 타입 충돌을 구조체로 보존 후 정리
resolved = ResolveChoice.apply(
    frame=dyf,
    choice="make_struct"   # int와 string을 한 구조체에 모두 보존
)
```

> 🔍 **더 깊이**: 스트리밍에서는 Schema Registry가 진화를 게이트키핑하고, 데이터 레이크 배치에서는 **개방형 테이블 포맷(Apache Iceberg, Hudi, Delta Lake)**이 진화를 책임진다. Iceberg는 컬럼에 고유 ID를 부여하므로, 이름을 바꿔도 데이터 매핑이 깨지지 않는다(ID 기반 매핑). 위치 기반으로 컬럼을 매핑하는 순수 Parquet과의 결정적 차이다. 시험에서 "스키마가 자주 바뀌는 데이터 레이크에서 안전한 진화"가 나오면 Iceberg 같은 테이블 포맷을 떠올려야 한다.

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

## 정리: 형태와 내용을 모두 지킨다

오늘의 두 도구는 데이터 신뢰성의 양 축이다. Schema Registry는 스트리밍 데이터의 **스키마(형태)**가 호환 규칙 안에서만 진화하도록 강제하고, Glue Data Quality는 데이터의 **값(내용)**이 비즈니스 규칙을 만족하는지 검증한다. 스키마 진화는 막는 게 아니라 안전하게 허용하는 것이며, 품질은 측정 가능한 지표로 만들어 자동 게이트로 통합해야 한다. 내일은 이번 주 Glue 변환 전체를 종합 복습한다.

---

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
해설: BACKWARD 호환은 "새 스키마 소비자가 옛 데이터를 읽을 수 있음"을 보장하며, 기본값 있는 필드 추가나 필드 삭제를 허용한다. FORWARD는 반대로 옛 소비자가 새 데이터를 읽는 경우를 보장한다. NONE/DISABLED는 검증을 하지 않아 안전성을 보장하지 못한다.

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
해설: Apache Iceberg는 컬럼에 고유 ID를 부여해 이름 변경·추가·삭제를 트랜잭션으로 안전하게 처리한다. 위치 기반 매핑인 순수 Parquet/CSV/JSON은 컬럼 이름 변경 시 매핑이 깨질 수 있어 안전한 진화를 보장하지 못한다.

---

**문제 5.** Glue Data Quality의 자동 추천 규칙에 대한 올바른 태도는?

A) 추천은 현재 데이터 분포 기반이라 정상적 변화를 오탐할 수 있으므로 출발점으로 삼되 사람이 검토·조정한다  
B) 추천 규칙은 항상 정확하므로 그대로 운영에 적용한다  
C) 추천 기능은 존재하지 않는다  
D) 추천 규칙은 스키마 호환성만 검사한다  

**정답: A**  
해설: 추천 규칙은 현재 데이터 분포를 기반으로 생성되므로 미래의 정상적 변화를 이상으로 판정하는 오탐을 낼 수 있다. 따라서 출발점으로 활용하되 비즈니스 규칙에 맞게 사람이 검토·조정해야 한다. 추천 기능은 실제로 존재하며 값 기반 품질 규칙을 다룬다.

---
