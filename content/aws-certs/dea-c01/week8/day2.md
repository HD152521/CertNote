# Day 2 - 데이터 품질·검증: Glue Data Quality와 검증 게이트

## 📌 핵심 정리

- 데이터 품질은 완전성·정확성·일관성·유효성·고유성·적시성 여섯 차원으로 재고, 검증은 가능한 한 수집 직후에 둔다(shift-left).
- Glue Data Quality 는 **DQDL** 로 규칙을 선언하고, 통과한 규칙의 비율을 품질 점수로 낸다. Data Catalog 테이블과 ETL 잡 두 곳에서 실행한다.
- 규칙 추천은 Data Catalog 쪽에서, 불량 **행 식별**(row-level 결과)은 ETL 잡 쪽에서 된다. 요구가 어느 쪽인지로 진입점이 갈린다.
- 고정 임계값은 계절성에 약하다. 과거 통계를 학습하는 이상 탐지(`DetectAnomalies`)와 직전 실행들을 기준 삼는 동적 규칙(`last(k)`)을 함께 쓴다.
- 기준 미달이면 Step Functions Choice 로 다운스트림을 막고 격리 영역에 보관한 뒤, 멱등한 재처리로 다시 흘려보낸다.

## 데이터 품질의 여섯 차원

"쓰레기를 넣으면 쓰레기가 나온다(Garbage In, Garbage Out)." 파이프라인이 아무리 안정적이어도 들어오는 데이터가 틀렸다면 결과는 믿을 수 없다. 오늘은 품질을 측정·강제하고, 불량 데이터를 걸러 재처리하는 방법을 본다.

| 차원 | 묻는 것 | 대응하는 DQDL 규칙 예 |
|------|------|------|
| 완전성(Completeness) | 필수 값이 비어 있지 않은가 | `IsComplete`, `Completeness` |
| 고유성(Uniqueness) | 중복이 없는가 | `IsUnique`, `IsPrimaryKey`, `Uniqueness` |
| 유효성(Validity) | 형식·범위·허용값을 따르는가 | `ColumnValues`, `ColumnDataType`, `ColumnLength` |
| 일관성(Consistency) | 테이블·시스템 사이에 모순이 없는가 | `ReferentialIntegrity`, `DatasetMatch`, `RowCountMatch`, `SchemaMatch` |
| 적시성(Timeliness) | 데이터가 충분히 신선한가 | `DataFreshness` |
| 정확성(Accuracy) | 실제 사실과 일치하는가 | `CustomSql`, `AggregateMatch`(기준 데이터와 대조) |

- 정확성은 규칙 하나로 끝나지 않는다. 믿을 수 있는 기준 데이터와 합계·건수를 맞춰 보는 방식으로만 근사할 수 있다.

> 💡 **관련 이론**: 품질 검증은 가능한 한 파이프라인의 **앞쪽(수집 직후)** 에 둔다. 불량 데이터가 curated 존까지 흘러간 뒤 발견하면 영향 범위와 재처리 비용이 급격히 커진다(shift-left).

## Glue Data Quality 의 두 진입점

Glue Data Quality 는 오픈소스 Deequ 위에 만든 서버리스 기능이다. 같은 DQDL 을 쓰지만 실행 위치가 두 곳이고, 되는 일이 다르다.

| 항목 | Data Catalog 에서 실행 | ETL 잡 안에서 실행 |
|------|------|------|
| 대상 | 이미 카탈로그에 등록된 테이블(S3, Redshift, JDBC, Iceberg·Hudi·Delta 등) | Glue 가 읽을 수 있는 모든 소스 |
| 성격 | 쌓여 있는 데이터의 점검(저장 중) | 적재 **전에** 걸러 내는 사전 점검(이동 중) |
| 규칙 추천 | 지원 | 미지원 |
| 불량 행 식별 | 미지원 | 지원 |
| Auto Scaling·Flex | 미지원 | 지원 |
| 증분 검증 | 푸시다운 조건으로 범위 제한 | 잡 북마크 |
| EventBridge·CloudWatch 연동 | 지원 | 지원 |
| 주 사용자 | 데이터 스튜어드, 분석가(코드 없이) | 데이터 엔지니어 |

- "불량 레코드만 골라 격리하고 나머지는 적재"는 ETL 쪽이어야 한다. "기존 테이블에 어떤 규칙을 걸지 모르겠다"는 Data Catalog 쪽의 **규칙 추천**으로 초안을 받는다.
- 중첩 구조나 리스트 타입 컬럼은 규칙으로 평가하지 못한다. 먼저 펼친(flatten) 뒤 평가한다.

## DQDL 문법 깊이 보기

DQDL 문서는 대소문자를 구분하고, `Rules` 라는 이름의 목록 안에 규칙을 쉼표로 나열한다.

```text
Rules = [
    RowCount > 1000,
    IsComplete "order_id",
    IsUnique "order_id",
    ColumnValues "status" in ["NEW", "PAID", "SHIPPED", "CANCELLED"],
    ColumnValues "amount" between 0 and 1000000,
    Completeness "customer_email" > 0.95,
    ColumnDataType "created_at" = "TIMESTAMP",
    DataFreshness "created_at" <= 24 hours,
    ReferentialIntegrity "customer_id" "customers.customer_id" >= 0.99,
    (IsComplete "coupon_code") or (ColumnValues "discount" = 0),
    ColumnValues "country" in ["KR", "JP", "US"] with threshold > 0.98
]
```

| 문법 요소 | 의미 | 주의점 |
|------|------|------|
| `IsComplete` vs `Completeness` | 전부 채워졌는가 vs 채워진 비율 | 100% 를 요구할 수 없는 컬럼은 비율 규칙으로 |
| `between x and y` | 범위 검사 | 양 끝값은 **포함하지 않는다** |
| `with threshold` | 조건에 맞는 값의 비율로 통과 판정 | `ColumnValues`, `ColumnDataType`, `CustomSql` 에서만 |
| `and` / `or` | 규칙 결합(복합 규칙) | 결합되는 각 규칙을 괄호로 감싼다 |
| `where "..."` | SparkSQL 조건으로 대상 행을 걸러 평가 | 임계값이 있으면 `where` 가 `with threshold` 앞 |
| `CustomSql` | SQL 결과로 판정 | 규칙으로 표현 못 하는 업무 규칙용 |
| `ReferentialIntegrity` | 기준 데이터셋에 값이 존재하는 비율 | 기준 데이터셋을 별칭으로 함께 넘겨야 한다 |

- 복합 규칙은 기본적으로 **각 규칙을 테이블 전체에 대해 따로 평가한 뒤** 결과를 결합한다. "행마다 A 이거나 B 이면 통과"라는 SQL 식 의미를 원하면 평가 방식을 행 단위(`compositeRuleEvaluation.method = ROW`)로 바꿔야 한다. 이것을 모르면 OR 규칙이 예상과 달리 실패한다.
- **동적 규칙**은 임계값 자리에 과거 실행 결과를 넣는다. `last(k)` 가 직전 k 회의 값을 가리키고, k 가 2 이상이면 `avg`·`min`·`max` 같은 집계로 한 숫자로 줄여야 한다.
- **Analyzers** 블록은 조건 없이 통계만 수집한다. 아직 규칙을 쓸 만큼 데이터를 모를 때 통계부터 쌓아 두고, 그 통계를 이상 탐지가 쓴다.

```text
Rules = [
    RowCount >= min(last(7)),           # 최근 7회 중 가장 적었던 날보다 줄면 실패
    DetectAnomalies "RowCount"           # 과거 추세에서 벗어나면 실패
]
Analyzers = [
    DistinctValuesCount "customer_id",
    Completeness "customer_email"
]
```

## 점수는 어떻게 계산되나

- **품질 점수 = 통과한 규칙 수 ÷ 전체 규칙 수.** 불량 행의 비율이 아니다. 규칙 10개 중 1개가 실패하면 그 규칙이 행 한 건 때문에 실패했더라도 점수는 0.9 다.
- 그래서 게이트 기준을 점수 하나로만 잡으면 위험하다. "절대 깨지면 안 되는 규칙"(PK 중복, 필수 컬럼 누락)은 점수와 별개로 실패 즉시 중단시키고, 나머지를 점수로 본다.
- 이상 탐지가 만든 관찰(observation)은 점수에 반영되지 않는다. 점수는 규칙만으로 정해진다.

| 한도 | 값 |
|------|------|
| 룰셋 하나의 규칙 수 | 2,000개 |
| 룰셋 크기 | 65KB |
| 계정당 저장되는 통계 | 100,000개, 최대 2년 보관 |

## 통계 기반 이상 탐지

고정 임계값(`RowCount > 1000`)은 데이터 양이 요일·계절에 따라 변하면 오탐을 내거나, 사업이 커진 뒤에는 아무것도 못 잡는다. 하루 100만 건 기준으로 만든 규칙은 평소 200만 건이 들어오게 된 뒤 25% 가 빠져도 통과한다.

- 규칙과 Analyzer 가 실행될 때마다 통계가 Glue 서비스 안에 쌓이고, 이상 탐지는 이 통계의 추세를 학습해 예상 범위(상한·하한)를 만든다. 실제 값이 범위를 벗어나면 관찰을 생성한다.
- 탐지에는 **최소 세 개의 데이터 포인트**가 필요하다. 처음 몇 번의 실행에서는 아무것도 나오지 않는다.
- 한 번 이상으로 잡힌 값은 따로 제외하지 않으면 **다음 실행부터 정상값으로 학습에 들어간다.** 장애로 생긴 값을 그대로 두면 같은 장애를 다시 못 잡는다. 통계 제외로 모델에 피드백을 준다.
- 탐지 모드는 둘이다. 추세·계절성을 따라가는 기본 모드(Linear)와, 시간 간격을 무시하고 기준선만 보는 모드(Fixed)다. 실행 간격이 불규칙하면 후자가 맞다.
- 과금은 탐지에 걸린 시간만큼이며 통계 하나마다 DPU 가 잡힌다. 통계 저장 자체는 무료다.

| 방식 | 기준 | 강점 | 약점 |
|------|------|------|------|
| 정적 규칙 | 사람이 정한 절대값 | 의미가 분명, 첫 실행부터 동작 | 성장·계절성에 취약 |
| 동적 규칙 `last(k)` | 직전 k 회의 값 | 설명 가능, 규칙으로 실패 처리됨 | 요일 패턴은 못 봄 |
| 이상 탐지 | 학습한 추세·계절성 | 사람이 임계값을 몰라도 됨 | 초기 데이터 필요, 오염된 학습에 취약 |

> 💡 **관련 이론**: 이상 탐지는 "절대값이 틀렸다"가 아니라 "평소와 다르다"를 잡는다. CloudWatch Anomaly Detection 도 같은 발상으로 지표의 정상 범위를 학습한다. 차이는 대상이다. CloudWatch 는 운영 지표를, Glue Data Quality 는 데이터 자체의 통계를 본다.

## ETL 잡 안에서 평가하고 행을 가르기

```python
from awsgluedq.transforms import EvaluateDataQuality
from awsglue.transforms import SelectFromCollection

result = EvaluateDataQuality().process_rows(
    frame=orders_dyf,
    ruleset=ruleset,
    publishing_options={
        "dataQualityEvaluationContext": "orders_ingest",
        "enableDataQualityCloudWatchMetrics": True,
        "enableDataQualityResultsPublishing": True,
    },
)

# 규칙별 결과(통과/실패, 실패 사유)
rule_outcomes = SelectFromCollection.apply(dfc=result, key="ruleOutcomes")

# 행별 결과: 원본 컬럼 + 판정 컬럼 4개
rows = SelectFromCollection.apply(dfc=result, key="rowLevelOutcomes").toDF()
valid = rows.filter(rows.DataQualityEvaluationResult == "Passed")
invalid = rows.filter(rows.DataQualityEvaluationResult == "Failed")

valid.write.mode("append").parquet("s3://lake-clean/orders/")
invalid.write.mode("append").json("s3://lake-quarantine/orders/dt=2026-06-26/")
```

- 행 단위 결과에는 `DataQualityRulesPass`, `DataQualityRulesFail`, `DataQualityRulesSkip`, `DataQualityEvaluationResult` 네 컬럼이 붙는다. 어떤 규칙 때문에 떨어졌는지가 행에 남으므로 격리 영역에 **실패 사유와 함께** 저장할 수 있다.
- 컬럼 존재 여부(`ColumnExists`)처럼 행 하나로는 판정할 수 없는 규칙은 행 단위 결과에서 건너뛴 규칙(`DataQualityRulesSkip`)으로 표시된다.

## 검증 게이트와 통보

검증 게이트는 품질이 기준 미달이면 **다운스트림 진행을 막는** 제어 지점이다.

```text
[Glue 잡: 수집 + DQ 평가] → Choice 상태
   ├─ 치명 규칙 통과 그리고 점수 >= 0.95 → [curated 적재]
   └─ 그 외 → [격리(quarantine)] → [SNS 통보] → [실패로 종료]
```

- 평가가 끝나면 EventBridge 로 이벤트가 나간다. 실패한 평가만 받아 SNS·Lambda 로 넘기는 규칙을 만든다. CloudWatch 에는 통과·실패 규칙 수가 지표(`glue.data.quality.rules.passed` / `failed`)로 올라온다.
- EventBridge 발행은 "지표를 CloudWatch 로 게시" 옵션이 켜져 있어야 동작한다. 지표 게시를 끄면 이벤트도 끊긴다.

```json
{
  "source": ["aws.glue-dataquality"],
  "detail-type": ["Data Quality Evaluation Results Available"],
  "detail": { "state": ["FAILED"] }
}
```

- 게이트를 통과하지 못한 데이터는 버리거나 덮어쓰지 않고 **격리 영역**으로 보낸다. 임계값을 낮춰 통과시키는 것은 게이트를 없애는 것과 같다.

## 격리와 재처리 설계

| 원칙 | 내용 |
|------|------|
| 배치 전체 차단 vs 행 단위 분리 | 스키마가 깨졌거나 건수가 급감하면 배치 전체를 막는다. 일부 행의 형식 오류면 정상 행은 흘려보내고 불량 행만 격리한다 |
| 원본 보존 | raw 존을 불변으로 두면 언제든 처음부터 다시 처리할 수 있다 |
| 멱등성 | 같은 입력을 두 번 처리해도 결과가 같아야 한다. 업서트(MERGE)나 파티션 단위 덮어쓰기로 구현한다 |
| 파티션 단위 재처리 | 문제가 된 날짜 파티션만 다시 처리해 비용과 영향을 줄인다 |
| 실패 사유 기록 | 격리 데이터에 어떤 규칙이 왜 실패했는지 남긴다. 사유 없는 격리 버킷은 아무도 열어 보지 않는 무덤이 된다 |

- 재처리 경로는 정상 경로와 **같은 검증**을 다시 통과해야 한다. 격리 데이터를 손으로 고쳐 curated 에 직접 넣는 지름길은 게이트를 우회한다.
- append 방식 적재는 재처리 때 중복을 만든다. 재처리를 염두에 둔 테이블은 처음부터 덮어쓰기나 MERGE 로 설계한다.

## 닮은 도구 구분

| 도구 | 하는 일 | 고르는 단서 |
|------|------|------|
| Glue Data Quality | DQDL 규칙·점수·이상 탐지 | "규칙으로 품질을 측정·강제", "파이프라인 안에서 차단" |
| Glue DataBrew | 코드 없는 프로파일링·정제 | "분석가가 시각적으로 데이터를 살펴보고 정제" |
| Glue Schema Registry | 스트림 스키마의 버전·호환성 검사 | "프로듀서가 호환되지 않는 스키마를 보내지 못하게" |
| CloudWatch Anomaly Detection | 운영 지표의 정상 범위 학습 | "지연·오류율 같은 지표의 동적 임계값" |
| Athena SQL 검증 쿼리 | 적재 후 수동·임시 점검 | "일회성 확인", 규칙 관리 기능은 없음 |

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| 행 하나가 틀렸는데 점수가 크게 떨어짐 | 점수가 규칙 단위 비율 | 비율 규칙(`Completeness`, `with threshold`)으로 허용 범위 표현 |
| OR 로 묶은 규칙이 항상 실패 | 규칙별로 전체 평가 후 결합 | 복합 규칙 평가를 행 단위로 변경 |
| 이상 탐지가 아무것도 안 잡음 | 데이터 포인트 3개 미만, 또는 이상값이 학습에 포함됨 | 실행 횟수 확보, 이상 통계 제외 |
| 실패해도 통보가 안 옴 | CloudWatch 지표 게시가 꺼짐 | 게시 옵션을 켠 상태로 유지 |
| 재처리 후 건수가 두 배 | append 적재 | 파티션 덮어쓰기 또는 MERGE |
| 중첩 컬럼 규칙이 평가 안 됨 | 중첩·리스트 타입 미지원 | 펼친 뒤 평가 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "품질 규칙을 선언형으로 정의하는 언어" | DQDL |
| "규칙을 처음부터 쓰기 어렵다, 초안을 자동으로" | 규칙 추천(Data Catalog) |
| "불량 레코드만 식별해 격리" | ETL 잡의 행 단위 결과 |
| "요일·계절에 따라 양이 변한다, 오탐을 줄여라" | 이상 탐지 / 동적 규칙 |
| "기준 미달 데이터가 다운스트림으로 가지 않게" | Step Functions Choice 게이트 + 격리 |
| "실패 시 자동 통보" | EventBridge 규칙 → SNS |
| "재처리해도 중복이 생기지 않게" | 멱등성(MERGE, 파티션 덮어쓰기) |
| "스트리밍 프로듀서의 스키마 변경 통제" | Glue Schema Registry |

내일은 파이프라인이 실패했을 때 무슨 일이 있었는지 재구성하는 방법, CloudTrail 감사와 재시도·DLQ 를 다룬다.

## 📖 용어

- **DQDL** : Glue Data Quality 의 규칙을 쓰는 선언형 언어. 무엇을 만족해야 하는지만 적는다.
- **룰셋(ruleset)** : 품질 규칙의 묶음. 평가하면 규칙별 결과와 점수가 나온다.
- **품질 점수** : 룰셋에서 통과한 규칙의 비율. 불량 행의 비율이 아니다.
- **Analyzer** : 통과·실패 판정 없이 통계만 수집하는 DQDL 구문.
- **동적 규칙** : 임계값을 고정하지 않고 지난 실행들의 값(`last(k)`)과 비교하는 규칙.
- **이상 탐지** : 쌓인 통계의 추세를 학습해 평소와 다른 값을 찾아내는 기능.
- **검증 게이트** : 품질이 기준에 못 미치면 다음 단계로 못 넘어가게 막는 지점.
- **격리(quarantine)** : 불량 데이터를 지우지 않고 따로 모아 두는 영역.
- **멱등성** : 같은 작업을 여러 번 해도 결과가 한 번 한 것과 같은 성질.
- **shift-left** : 검증을 파이프라인의 앞단으로 당겨 오염이 퍼지기 전에 막는 원칙.

## 📝 연습 문제

**문제 1.** AWS Glue Data Quality에서 데이터셋의 품질 규칙을 선언형으로 정의하는 데 사용하는 언어는?

A) HiveQL  
B) PartiQL  
C) JSONPath  
D) DQDL(Data Quality Definition Language)  

**정답: D**  
해설: Glue Data Quality는 DQDL로 RowCount, IsComplete, IsUnique 등 규칙을 선언형으로 정의한다. HiveQL/PartiQL은 쿼리 언어, JSONPath는 JSON 경로 표현식으로 품질 규칙 정의 용도가 아니다.

---

**문제 2.** 데이터 양이 요일·계절에 따라 크게 변하는 파이프라인에서, 고정 임계값보다 오탐이 적게 비정상을 탐지하려면 어떤 방식이 가장 적절한가?

A) RowCount > 1000 같은 절대 임계값만 사용  
B) 과거 추세를 학습하는 이상 탐지(anomaly detection)  
C) 모든 레코드에 IsUnique 적용  
D) 품질 검증을 비활성화  

**정답: B**  
해설: 이상 탐지는 지표의 과거 추세·정상 범위를 학습해 "평소와 다른" 값을 잡으므로 계절성·성장에 따른 변동에 강하다. 고정 임계값은 트래픽 변동 시 오탐이 많고, IsUnique는 중복 검사일 뿐이며, 검증 비활성화는 품질 보장을 포기하는 것이다.

---

**문제 3.** 데이터 품질 검증 게이트에서 점수가 기준에 미달한 데이터를 처리할 때 권장되는 동작은?

A) 즉시 curated 존에 덮어쓴다  
B) 무시하고 삭제한다  
C) 격리(quarantine) 영역에 보관하고 다운스트림 진행을 막는다  
D) 임계값을 자동으로 낮춰 통과시킨다  

**정답: C**  
해설: 미달 데이터는 격리 영역에 원본·실패 사유와 함께 보관하고 다운스트림 진행을 차단해, 원인 분석과 재처리에 대비한다. curated 덮어쓰기·삭제는 데이터를 오염·소실시키고, 임계값을 낮추는 것은 품질 게이트의 목적을 무력화한다.

---

**문제 4.** 격리된 불량 데이터를 수정 후 다시 처리할 때, 같은 입력을 여러 번 처리해도 결과가 동일하도록 보장하는 속성은?

A) 멱등성(Idempotency)  
B) 휘발성(Volatility)  
C) 카디널리티(Cardinality)  
D) 직렬화 가능성(Serializability)  

**정답: A**  
해설: 멱등성은 동일 입력을 반복 처리해도 결과가 변하지 않는 속성으로, 업서트(MERGE)나 파티션 단위 결정적 덮어쓰기로 구현해 재처리 시 중복을 방지한다. 나머지는 재처리 중복 방지와 직접 관련된 개념이 아니다.

---

**문제 5.** 데이터 품질 검증을 파이프라인의 앞쪽(수집 직후)에 두는 것이 권장되는 주된 이유는?

A) 스토리지 비용이 절감되기 때문  
B) 쿼리 성능이 향상되기 때문  
C) IAM 권한이 단순해지기 때문  
D) 불량 데이터가 curated까지 흘러간 뒤 발견 시 영향·재처리 비용이 폭증하기 때문  

**정답: D**  
해설: shift-left 원칙에 따라 검증을 앞단에 두면 불량 데이터가 하류로 전파되기 전에 차단해 영향 범위와 재처리 비용을 최소화한다. 비용·성능·권한도 부수적으로 좋아질 수 있지만 핵심 이유는 오염 전파 차단이다.

---
