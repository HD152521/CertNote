# Day 3 - SageMaker Feature Store: 특성을 자산으로 관리하기

어제 만든 특성들이 노트북 안 데이터프레임에만 있다면, 다음 프로젝트에서 같은 특성을 또 만들어야 한다. 더 나쁜 건 학습 때 쓴 변환과 추론 때 쓴 변환이 미묘하게 달라져 모델 성능이 조용히 무너지는 것이다. SageMaker Feature Store는 이 두 문제 — 특성 재사용과 학습/추론 일관성 — 를 푸는 전용 저장소다.

MLA-C01 시험에서 Feature Store는 "온라인/오프라인 스토어의 차이", "training/serving skew 방지", "특성 공유" 같은 키워드로 등장한다. 오늘은 구조, 두 스토어, 일관성이라는 세 축을 본다.

## Feature Store란 무엇인가

Feature Store는 ML 특성을 중앙에서 저장·관리·제공하는 저장소다. 핵심 단위는 **Feature Group**이다. Feature Group은 관계형 테이블처럼 행과 열로 구성되며, 각 열이 하나의 특성(feature)이다. 두 가지 필수 요소가 있다.

- **Record Identifier**: 각 행을 식별하는 키 (예: customer_id)
- **Event Time**: 그 특성 값이 기록된 시점 (시간 여행/time travel의 기준)

```python
from sagemaker.feature_store.feature_group import FeatureGroup

feature_group = FeatureGroup(name='customer-features', ...)

feature_group.create(
    record_identifier_name='customer_id',   # 행 식별자
    event_time_feature_name='event_time',    # 이벤트 시각
    role_arn=role,
    enable_online_store=True                 # 온라인 스토어 활성화
)

# 특성 적재
feature_group.ingest(data_frame=df, max_workers=3)
```

같은 customer_id에 대해 event_time이 다른 여러 레코드가 쌓이면, "특정 시점의 특성 값이 무엇이었나"를 재구성할 수 있다.

> 💡 **관련 이론**: Event Time은 시계열 데이터베이스의 bitemporal 개념과 닿아 있다. 모델을 과거 데이터로 학습할 때 "그 시점에 실제로 알 수 있었던 특성 값"만 써야 미래 정보 누수(look-ahead bias)를 막는다. 예를 들어 2024년 1월 거래를 예측하는데 2024년 3월에 갱신된 특성 값을 쓰면 미래를 본 것이다. Event Time 기반 조회는 이 시간적 정합성을 보장하는 메커니즘이다.

## 온라인 스토어와 오프라인 스토어

Feature Store의 핵심은 두 종류의 스토어를 동시에 제공한다는 점이다. 시험에서 이 둘의 차이가 가장 자주 나온다.

| 구분 | 온라인 스토어 (Online) | 오프라인 스토어 (Offline) |
|------|----------------------|--------------------------|
| 목적 | 실시간 추론 | 학습·배치 |
| 지연시간 | 밀리초 (저지연) | 높음 (배치) |
| 저장 방식 | 빠른 key-value 조회 | S3 (Parquet) |
| 조회 단위 | 최신 레코드 1건 (GetRecord) | 전체 이력 (대량) |
| 비용 | 상대적으로 높음 | 저렴(S3) |
| 사용 API | GetRecord (단건) | Athena 쿼리 / S3 직접 |

**온라인 스토어**는 추론 서버가 "이 customer_id의 현재 특성 값을 즉시 줘"라고 요청할 때 밀리초 안에 최신값을 반환한다. **오프라인 스토어**는 S3에 모든 이력을 Parquet으로 쌓아두고, 학습 데이터셋을 만들 때 Athena 쿼리로 대량 조회한다.

```python
# 온라인 스토어: 실시간 추론 시 최신 특성 조회
record = featurestore_runtime.get_record(
    FeatureGroupName='customer-features',
    RecordIdentifierValueAsString='cust_12345'
)

# 오프라인 스토어: 학습용 데이터셋 생성 (Athena)
query = feature_group.athena_query()
query.run(query_string="SELECT * FROM customer_features WHERE ...",
          output_location='s3://my-bucket/query-results/')
```

> ⚠️ **함정**: 온라인 스토어만 활성화하면 학습용 이력이 S3에 쌓이지 않고, 오프라인만 활성화하면 실시간 추론에서 저지연 조회를 못 한다. 대부분의 실제 ML 시스템은 **둘 다 활성화**해서, 같은 특성을 학습(오프라인)과 추론(온라인)에 일관되게 쓴다. 데이터를 ingest하면 SageMaker가 온라인에는 최신값을, 오프라인에는 이력을 자동으로 동기화한다.

## 일관성: training/serving skew 방지

Feature Store의 가장 큰 가치는 **학습과 추론이 같은 특성 정의를 공유**한다는 점이다. training/serving skew는 학습 때와 서빙 때 특성 계산 방식이 달라 모델 성능이 떨어지는 고전적 문제다.

전형적 시나리오: 학습 파이프라인은 pandas로 "최근 30일 평균 구매액"을 계산하고, 추론 서버는 Java로 같은 값을 다시 계산한다. 두 구현이 미묘하게 다르면(예: 경계 처리, 반올림) 모델이 보는 값이 학습 때와 달라진다. Feature Store는 특성을 한 번 계산해 양쪽이 같은 저장소에서 읽게 함으로써 이 불일치를 원천 차단한다.

```
[특성 계산 파이프라인]  ──ingest──>  [Feature Store]
                                        |
                  ┌─────────────────────┴──────────────────┐
                  v                                          v
        [오프라인 스토어]                            [온라인 스토어]
        학습 데이터셋 생성                          실시간 추론 조회
        (Athena, 동일 정의)                        (GetRecord, 동일 정의)
```

> 💡 **관련 이론**: training/serving skew는 ML 시스템의 기술 부채를 다룬 Google의 "Hidden Technical Debt in Machine Learning Systems" 논문에서 강조한 핵심 문제다. 모델 코드는 전체 ML 시스템의 작은 부분이고, 데이터 파이프라인과 특성 일관성이 실패의 주원인이다. Feature Store는 특성을 "코드"가 아니라 "공유 데이터 자산"으로 승격시켜, 정의를 한 곳에 모으는 것으로 이 부채를 줄인다.

## 특성 재사용과 거버넌스

Feature Store의 두 번째 가치는 재사용이다. A팀이 만든 "고객 생애 가치", "최근 활동 점수" 같은 특성을 B팀이 새 모델에 그대로 가져다 쓸 수 있다. 매번 같은 특성을 다시 만드는 중복 작업이 사라진다.

- **검색·발견**: Feature Group과 특성에 메타데이터·설명을 붙여 팀 간 공유
- **버전·계보**: 특성이 언제 어떻게 만들어졌는지 추적
- **권한**: IAM으로 Feature Group 접근 제어

> 🔍 **더 깊이**: Feature Store에는 여러 Feature Group을 시점 정합성에 맞게 조인하는 기능이 있다. 학습 데이터를 만들 때 customer 특성과 product 특성을 각자의 event time 기준으로 조인하면, "그 시점에 알 수 있었던 값들"만 정확히 결합된다. 이를 point-in-time correct join이라 하며, 수작업으로 하면 매우 까다로운 미래 누수 방지를 자동화해준다.

> 📚 **사례**: 한 핀테크 회사가 사기 탐지와 신용 평가 두 모델을 운영하는데, 둘 다 "최근 거래 빈도"라는 특성이 필요했다. 처음엔 각 팀이 따로 계산해 정의가 미묘하게 달랐고, 한 팀이 버그를 고쳐도 다른 팀에 반영이 안 됐다. Feature Store로 이 특성을 한 번 정의해 공유하자 정의 불일치가 사라지고, 한 곳을 고치면 양쪽 모델이 함께 개선됐다.

## 데이터 흐름 정리

전형적 파이프라인은 이렇게 이어진다. ① Data Wrangler(또는 Processing Job)로 raw 데이터를 특성으로 변환 → ② `ingest`로 Feature Store에 적재(온라인+오프라인 동시) → ③ 학습 시 오프라인 스토어에서 Athena로 데이터셋 생성 → ④ 추론 시 온라인 스토어에서 GetRecord로 최신 특성 조회. 이 흐름 전체가 동일한 특성 정의를 공유하므로 일관성이 유지된다.

## 정리하며

Feature Store는 세 축으로 외운다. ① **구조**: Feature Group(Record Identifier + Event Time)이 단위. ② **두 스토어**: 온라인(밀리초, 실시간 추론, key-value)과 오프라인(S3 Parquet, 학습, Athena 대량 조회). ③ **가치**: training/serving skew 방지(같은 특성을 학습·추론이 공유)와 특성 재사용(팀 간 공유, point-in-time correct join). 시험에서 "실시간 저지연 특성 조회"는 온라인, "학습용 대량 이력"은 오프라인이라는 매핑이 핵심이다.

다음 글에서는 이렇게 준비한 데이터가 공정하고 균형 잡혀 있는지 점검하는 데이터 편향·품질과 SageMaker Clarify를 본다.

---

## 📝 연습 문제

**문제 1.** 실시간 추천 서비스가 사용자가 페이지를 열 때마다 해당 사용자의 최신 특성을 밀리초 내에 조회해야 한다. SageMaker Feature Store에서 적합한 것은?

A) 오프라인 스토어를 Athena로 쿼리한다  
B) 온라인 스토어에서 GetRecord로 최신 레코드를 조회한다  
C) S3 Parquet 파일을 매번 전체 다운로드한다  
D) Redshift 전체 테이블을 스캔한다  

**정답: B**  
해설: 온라인 스토어는 key-value 저장으로 단건 최신 특성을 밀리초 내에 반환하므로 실시간 추론 조회에 적합하다. A·C는 오프라인/배치용으로 지연시간이 높고, D 역시 대량 분석용 스캔이라 실시간 저지연 요구에 부적합하다.

---

**문제 2.** 학습 파이프라인은 Python으로, 추론 서버는 Java로 "최근 30일 평균 구매액"을 각각 계산하다 미묘한 차이로 모델 성능이 저하됐다. 이를 근본적으로 해결하는 접근은?

A) Java 코드를 더 정밀하게 수정한다  
B) Feature Store에 특성을 한 번 계산·저장하고 학습(오프라인)과 추론(온라인)이 같은 저장소에서 읽게 한다  
C) 추론을 비활성화한다  
D) 모델을 더 크게 만든다  

**정답: B**  
해설: 이는 training/serving skew 문제로, Feature Store가 특성을 한 곳에서 정의·저장해 학습과 추론이 동일한 값을 공유하게 하여 원천 차단한다. A는 두 구현을 계속 동기화해야 하는 임시방편이고, C는 서비스를 포기하는 것이며, D는 특성 불일치와 무관하다.

---

**문제 3.** Feature Group을 생성할 때 반드시 지정해야 하며, 특정 시점의 특성 값을 재구성하는 기준이 되는 요소는?

A) Record Identifier와 Event Time  
B) VPC와 Subnet  
C) 인스턴스 타입과 개수  
D) 학습률과 배치 크기  

**정답: A**  
해설: Feature Group은 행을 식별하는 Record Identifier와 값이 기록된 시점을 나타내는 Event Time이 필수이며, Event Time이 point-in-time 조회와 미래 누수 방지의 기준이 된다. B는 네트워크 설정, C는 컴퓨팅 자원, D는 학습 하이퍼파라미터로 Feature Group 정의의 필수 요소가 아니다.

---

**문제 4.** 학습용 데이터셋을 만들기 위해 Feature Store에 쌓인 전체 특성 이력을 대량으로 조회하려 한다. 가장 적합한 방법은?

A) 온라인 스토어에서 GetRecord를 행마다 반복 호출한다  
B) 오프라인 스토어(S3)에 대해 Athena 쿼리로 대량 조회한다  
C) 온라인 스토어 전체를 메모리에 적재한다  
D) Feature Group을 삭제 후 재생성한다  

**정답: B**  
해설: 오프라인 스토어는 S3 Parquet에 전체 이력을 보관하며 Athena 쿼리로 대량 학습 데이터셋을 효율적으로 만든다. A는 단건 조회를 반복하는 비효율적 방식이고, C는 온라인 스토어 용도와 맞지 않으며, D는 데이터를 파괴하는 잘못된 조치다.

---

**문제 5.** 두 팀이 동일한 "고객 활동 점수" 특성을 각자 만들어 정의가 어긋나고 버그 수정이 한쪽에만 반영되는 문제가 있다. Feature Store가 제공하는 해결책은?

A) 각 팀이 더 자주 회의한다  
B) 특성을 Feature Store에 한 번 정의·공유해 양 팀이 같은 특성을 재사용하고 한 곳 수정이 모두에 반영되게 한다  
C) 두 모델을 하나로 합친다  
D) 특성을 모두 제거한다  

**정답: B**  
해설: Feature Store는 특성을 공유 데이터 자산으로 만들어 팀 간 재사용과 단일 정의를 가능하게 하므로, 한 곳을 고치면 그 특성을 쓰는 모든 모델에 일관되게 반영된다. A는 근본 해결이 아니고, C는 별개 모델을 억지로 합치는 것이며, D는 필요한 특성을 버리는 잘못된 선택이다.

---
