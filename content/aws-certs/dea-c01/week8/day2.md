# Day 2 - 데이터 품질·검증: Glue Data Quality와 검증 게이트

"쓰레기를 넣으면 쓰레기가 나온다(Garbage In, Garbage Out)." 파이프라인이 아무리 안정적이어도 들어오는 데이터가 틀렸다면 결과는 신뢰할 수 없습니다. 오늘은 데이터 품질을 측정·강제하고, 불량 데이터를 걸러 재처리하는 방법을 다룹니다.

## 데이터 품질의 6차원

데이터 품질은 보통 여섯 가지 차원으로 정의합니다.

- **완전성(Completeness)**: 필수 값이 비어 있지 않은가(NULL 비율).
- **정확성(Accuracy)**: 실제 사실과 일치하는가.
- **일관성(Consistency)**: 시스템 간/컬럼 간 모순이 없는가.
- **유효성(Validity)**: 정해진 형식·범위·도메인을 따르는가.
- **고유성(Uniqueness)**: 중복이 없는가(PK 중복).
- **적시성(Timeliness)**: 데이터가 충분히 신선한가.

> 💡 **관련 이론**: 품질 검증은 가능한 한 파이프라인의 **앞쪽(수집 직후)** 에 두는 것이 좋습니다. 불량 데이터가 curated 존까지 흘러간 뒤 발견하면 영향 범위와 재처리 비용이 기하급수적으로 커집니다(shift-left).

## AWS Glue Data Quality

Glue Data Quality는 데이터셋의 품질 규칙을 선언형 언어 **DQDL(Data Quality Definition Language)** 로 정의하고 점수를 매깁니다. Glue Data Catalog 테이블이나 ETL 잡 내부에서 실행할 수 있습니다.

```text
Rules = [
    RowCount > 1000,
    IsComplete "order_id",
    IsUnique "order_id",
    ColumnValues "status" in ["NEW", "PAID", "SHIPPED", "CANCELLED"],
    ColumnValues "amount" between 0 and 1000000,
    Completeness "customer_email" > 0.95,
    ColumnDataType "created_at" = "TIMESTAMP"
]
```

각 규칙의 통과 비율로 전체 품질 점수가 계산되고, 결과는 CloudWatch와 EventBridge로 전달할 수 있습니다.

### 추천(Recommendation) 기능

데이터에 규칙을 처음부터 손으로 쓰기 어렵다면, Glue Data Quality가 데이터를 분석해 규칙 초안을 **자동 추천**합니다. 추천 규칙을 검토·수정해 베이스라인으로 삼습니다.

## 통계 기반 이상 탐지

고정 임계값(예: RowCount > 1000)은 데이터 양이 계절적으로 변할 때 오탐을 냅니다. Glue Data Quality의 **이상 탐지(anomaly detection)** 는 지표의 과거 추세를 학습해 동적으로 비정상을 탐지합니다.

```text
# 정적 규칙: 절대 임계값 — 트래픽 변동에 취약
RowCount > 1000

# 동적 규칙: 과거 추세 대비 이상 — 계절성·성장 반영
DetectAnomalies "RowCount"
```

CloudWatch Anomaly Detection도 유사하게 지표의 정상 범위(밴드)를 학습해 그 밖으로 벗어나면 알람합니다. 정적 임계값과 동적 탐지를 함께 쓰는 것이 안전합니다.

> 💡 **관련 이론**: 이상 탐지는 "절대값이 틀렸다"가 아니라 "평소와 다르다"를 잡습니다. 데이터 양·분포가 시간에 따라 변하는 파이프라인에서 정적 임계값보다 오탐이 적습니다.

## 검증 게이트(Quality Gate)

검증 게이트는 품질 점수가 기준 미달이면 **다운스트림으로 진행을 막는** 제어 지점입니다. Step Functions로 흐름을 분기하는 것이 전형적입니다.

```text
[Glue DQ 평가] → Choice 상태
   ├─ 점수 >= 0.95  → [curated 적재 진행]
   └─ 점수 <  0.95  → [격리(quarantine) + SNS 통보 + 파이프라인 중단]
```

게이트를 통과하지 못한 데이터는 무시하거나 덮어쓰지 않고 **격리 영역(quarantine bucket)** 으로 보내 원인 분석과 재처리에 대비합니다.

## 불량 레코드 분리: 데드레터/격리 패턴

전체 배치를 통째로 막지 않고, 레코드 단위로 정상/불량을 나누는 경우도 많습니다.

```python
# 유효성 검증으로 정상/불량 분리 (개념 예시)
valid = records.filter(is_valid)
invalid = records.filter(lambda r: not is_valid(r))

valid.write.parquet("s3://lake-clean/orders/...")
invalid.write.json("s3://lake-quarantine/orders/dt=2026-06-26/")
```

- 정상 레코드는 정상 흐름으로 진행.
- 불량 레코드는 격리 영역에 원본·실패 사유와 함께 저장.
- 격리된 데이터는 원인 수정 후 **재처리(reprocessing)** 파이프라인으로 다시 흘려보냄.

## 재처리 설계 원칙

- **멱등성(Idempotency)**: 같은 입력을 두 번 처리해도 결과가 같아야 함. 업서트(MERGE) 또는 결정적 파티션 덮어쓰기를 사용.
- **원본 보존**: raw 존을 불변으로 두면 언제든 처음부터 다시 처리 가능.
- **파티션 단위 재처리**: 문제가 된 날짜 파티션만 다시 처리해 비용·영향 최소화.

## 핵심 정리

- 데이터 품질 6차원: 완전성·정확성·일관성·유효성·고유성·적시성.
- Glue Data Quality는 DQDL로 규칙 선언, 추천 기능으로 초안 생성, 점수/이상 탐지 제공.
- 정적 임계값 + 동적 이상 탐지를 병행하면 트래픽 변동에 강함.
- 검증 게이트(Step Functions Choice)로 미달 데이터의 다운스트림 진행 차단, 격리 후 멱등 재처리.

## 📝 연습 문제

**문제 1.** AWS Glue Data Quality에서 데이터셋의 품질 규칙을 선언형으로 정의하는 데 사용하는 언어는?

A) HiveQL  
B) PartiQL  
C) JSONPath  
D) DQDL(Data Quality Definition Language)  

**정답: D**  
해설: Glue Data Quality는 DQDL로 RowCount, IsComplete, IsUnique 등 규칙을 선언형으로 정의합니다. HiveQL/PartiQL은 쿼리 언어, JSONPath는 JSON 경로 표현식으로 품질 규칙 정의 용도가 아닙니다.

---

**문제 2.** 데이터 양이 요일·계절에 따라 크게 변하는 파이프라인에서, 고정 임계값보다 오탐이 적게 비정상을 탐지하려면 어떤 방식이 가장 적절한가?

A) RowCount > 1000 같은 절대 임계값만 사용  
B) 과거 추세를 학습하는 이상 탐지(anomaly detection)  
C) 모든 레코드에 IsUnique 적용  
D) 품질 검증을 비활성화  

**정답: B**  
해설: 이상 탐지는 지표의 과거 추세·정상 범위를 학습해 "평소와 다른" 값을 잡으므로 계절성·성장에 따른 변동에 강합니다. 고정 임계값은 트래픽 변동 시 오탐이 많고, IsUnique는 중복 검사일 뿐이며, 검증 비활성화는 품질 보장을 포기하는 것입니다.

---

**문제 3.** 데이터 품질 검증 게이트에서 점수가 기준에 미달한 데이터를 처리할 때 권장되는 동작은?

A) 즉시 curated 존에 덮어쓴다  
B) 무시하고 삭제한다  
C) 격리(quarantine) 영역에 보관하고 다운스트림 진행을 막는다  
D) 임계값을 자동으로 낮춰 통과시킨다  

**정답: C**  
해설: 미달 데이터는 격리 영역에 원본·실패 사유와 함께 보관하고 다운스트림 진행을 차단해, 원인 분석과 재처리에 대비합니다. curated 덮어쓰기·삭제는 데이터를 오염·소실시키고, 임계값을 낮추는 것은 품질 게이트의 목적을 무력화합니다.

---

**문제 4.** 격리된 불량 데이터를 수정 후 다시 처리할 때, 같은 입력을 여러 번 처리해도 결과가 동일하도록 보장하는 속성은?

A) 멱등성(Idempotency)  
B) 휘발성(Volatility)  
C) 카디널리티(Cardinality)  
D) 직렬화 가능성(Serializability)  

**정답: A**  
해설: 멱등성은 동일 입력을 반복 처리해도 결과가 변하지 않는 속성으로, 업서트(MERGE)나 파티션 단위 결정적 덮어쓰기로 구현해 재처리 시 중복을 방지합니다. 나머지는 재처리 중복 방지와 직접 관련된 개념이 아닙니다.

---

**문제 5.** 데이터 품질 검증을 파이프라인의 앞쪽(수집 직후)에 두는 것이 권장되는 주된 이유는?

A) 스토리지 비용이 절감되기 때문  
B) 쿼리 성능이 향상되기 때문  
C) IAM 권한이 단순해지기 때문  
D) 불량 데이터가 curated까지 흘러간 뒤 발견 시 영향·재처리 비용이 폭증하기 때문  

**정답: D**  
해설: shift-left 원칙에 따라 검증을 앞단에 두면 불량 데이터가 하류로 전파되기 전에 차단해 영향 범위와 재처리 비용을 최소화합니다. 비용·성능·권한도 부수적으로 좋아질 수 있지만 핵심 이유는 오염 전파 차단입니다.

---
