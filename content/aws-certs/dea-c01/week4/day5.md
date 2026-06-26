# Day 5 - Week 4 종합: AWS Glue 변환의 큰 그림

이번 주는 데이터 엔지니어링의 심장인 **변환(Transform)**을 AWS Glue 생태계로 관통했다. Data Catalog로 메타데이터를 잡고, ETL Job으로 Spark 변환을 돌리고, Studio/DataBrew로 노코드 변환을 했으며, Schema Registry와 Data Quality로 신뢰성을 보장했다. 오늘은 이 조각들을 하나의 그림으로 꿰고, 서비스 선택 기준을 정리하며, 시험에서 자주 나오는 함정을 복습한다.

## 한 장으로 보는 Glue 데이터 흐름

Glue의 모든 구성 요소가 어떻게 맞물리는지 전체 파이프라인으로 보자.

```
[원천 데이터]                S3 raw / Kinesis / MSK / JDBC
     │
     ├─(스트리밍)→ [Schema Registry] 스키마 계약·호환성 검증
     │
[크롤러] ──→ [Data Catalog] 스키마·파티션 메타데이터 등록
     │              │
     │      (모든 엔진이 공유: Athena / Redshift Spectrum / EMR)
     ▼
[변환 계층]
  ├─ Glue ETL Job (PySpark, DynamicFrame)   ← 엔지니어, 코드
  ├─ Glue Studio (비주얼 ETL → 코드 생성)    ← 엔지니어, 노코드 시작
  └─ Glue DataBrew (정제·프로파일링 Recipe)  ← 분석가, 완전 노코드
     │
[품질 게이트] Glue Data Quality (DQDL) — 통과만 적재, 실패는 격리
     │
     ▼
[정제 데이터]  S3 Parquet/Iceberg → Catalog 갱신 → Athena/Redshift/QuickSight

[오케스트레이션]  Glue Workflow/Trigger · Step Functions · MWAA(Airflow)
[증분 처리]      Job 북마크 (transformation_ctx + job.commit())
```

핵심은 **Data Catalog가 모든 것의 중심**이라는 점이다. 크롤러가 채우고, 변환 도구가 읽고 쓰고, 분석 엔진이 공유한다.

> 💡 **관련 이론**: 이 구조는 현대 데이터 플랫폼의 표준인 **메달리온 아키텍처(Bronze→Silver→Gold)**와 정확히 대응한다. raw(Bronze)를 크롤러가 카탈로깅하고, ETL/DataBrew가 정제해 Silver를 만들며, 추가 집계로 Gold(분석용 마트)를 만든다. Glue Data Quality는 각 계층 전환의 게이트 역할을 한다. AWS 특정 서비스 이름에 매몰되지 말고, "원시 → 정제 → 집계, 각 단계에 품질 게이트"라는 보편 패턴으로 이해하면 어떤 클라우드에서도 통한다.

## 서비스 선택 의사결정 정리

시험은 "어떤 상황에 무엇을?"을 집요하게 묻는다. 이번 주 도구들의 선택 기준이다.

| 상황 | 정답 | 이유 |
|------|------|------|
| S3 데이터 스키마·파티션 자동 등록 | Glue 크롤러 → Data Catalog | 메타데이터 자동 추론 |
| 대용량 분산 ETL, 코드 작성 가능 | Glue ETL Job (Spark) | DynamicFrame, 강력한 변환 |
| 수백 MB 가벼운 작업·오케스트레이션 | Python Shell Job | 분산 오버헤드 회피, 저렴 |
| 비주얼 ETL, 필요시 코드 전환 | Glue Studio | 코드 자동 생성 + 편집 |
| 분석가의 노코드 정제·프로파일링 | Glue DataBrew | 미리보기, PII 탐지, Recipe |
| 스트리밍 스키마 호환성 강제 | Schema Registry | BACKWARD/FORWARD/FULL |
| 데이터 값 유효성 검증·차단 | Glue Data Quality | DQDL 규칙, 품질 게이트 |
| 매번 전체 재처리 방지 | Job 북마크 | 증분 처리 |
| 단순 변환 후 S3 적재만 | Firehose + Lambda | Glue는 과한 설계 |

마지막 줄을 특히 기억하라. **Glue가 정답이 아닌 경우**를 아는 것이 진짜 실력이다. 단순 형식 변환은 Firehose+Lambda가 더 싸고, 복잡한 클러스터 튜닝·비표준 프레임워크가 필요하면 EMR이 낫다.

## 자주 틀리는 함정 모음

이번 주 각 날에서 강조한 함정을 한자리에 모은다.

```
[Day1] 비-Hive 경로(2026/06/25/)는 파티션 자동 인식 실패
       → 처음부터 key=value(year=2026/...) 경로 사용

[Day2] Job 북마크는 job.commit()과 transformation_ctx 둘 다 필요
       → 하나라도 빠지면 증분 처리 동작 안 함
       → 수정(덮어쓰기)된 파일은 북마크가 건너뜀

[Day3] Studio = 엔지니어/프로덕션 ETL, DataBrew = 분석가/탐색 정제
       → 둘 다 "Glue 비주얼"이라 혼동 주의, DataBrew도 유료

[Day4] Schema Registry = 형태(스키마), Data Quality = 내용(값)
       → 음수/중복/null은 품질 문제이지 스키마 문제 아님
       → DQ 추천 규칙은 오탐 가능, 사람이 검토
```

> ⚠️ **함정**: 가장 흔한 함정은 **Glue 크롤러와 Glue ETL Job을 혼동**하는 것이다. 크롤러는 "메타데이터를 등록"할 뿐 데이터를 변환하거나 복사하지 않는다. ETL Job이 실제로 데이터를 읽고 변환해 새로 쓴다. "스키마를 알아내라" = 크롤러, "데이터를 바꿔라" = ETL Job. 이 구분이 흔들리면 시나리오 문제를 줄줄이 틀린다.

## 비용 관점 한 번 더

데이터 엔지니어는 비용을 설계의 일부로 본다. Glue 변환의 비용 레버를 정리하면:

| 레버 | 절감 방법 |
|------|-----------|
| DPU 시간 | 적정 DPU 선택, Job 최적화, Python Shell 활용 |
| 크롤러 스캔 | 증분 크롤, 파티션 프로젝션으로 크롤러 제거 |
| 재처리 | Job 북마크로 신규분만 처리 |
| 출력 형식 | Parquet/ORC + 파티셔닝으로 다운스트림 스캔 절감 |
| 과한 설계 | 단순 변환은 Firehose+Lambda로 다운그레이드 |

> 🎯 **종합 시나리오**: 한 회사가 매일 raw JSON 로그(수십 GB)를 받아 분석 가능한 정제 테이블로 만들어야 한다. 완성형 구성은 (1) 로그를 `dt=` Hive 경로로 S3 적재 → (2) **증분 크롤러**가 새 파티션을 Data Catalog에 등록 → (3) **Glue Studio**로 설계한 ETL Job이 `from_catalog`로 읽어 ApplyMapping·ResolveChoice로 정제, **Job 북마크**로 어제 신규분만 처리 → (4) **Glue Data Quality** 노드가 `amount>=0`·`IsComplete`·`RowCount` 검증, 통과분만 Parquet으로 적재하고 실패는 격리 → (5) 후속 크롤러가 정제 테이블 갱신 → (6) **Workflow 트리거**로 매일 새벽 자동 실행, 품질 점수를 CloudWatch로 모니터링. Athena가 정제 테이블을 즉시 조회한다. 이 한 흐름에 이번 주 전부가 들어 있다.

## 정리: 변환은 신뢰할 수 있어야 한다

이번 주의 큰 교훈은 단순하다. **변환은 단지 데이터를 바꾸는 일이 아니라, 신뢰할 수 있는 데이터를 만드는 일**이다. Catalog로 일관된 스키마를 공유하고, 적합한 도구(코드/노코드)로 변환하고, 북마크로 효율적으로 증분 처리하며, Schema Registry와 Data Quality로 형태와 값의 신뢰성을 지킨다. 다음 주는 이 변환된 데이터를 한 단계 더 끌어올리는 변환 2편 — Amazon EMR과 Spark의 세계로 들어간다.

---

## 📝 연습 문제

**문제 1.** 다음 중 Glue 크롤러와 Glue ETL Job의 역할을 가장 정확히 구분한 것은?

A) 크롤러는 메타데이터(스키마·파티션)를 등록하고, ETL Job은 실제 데이터를 읽어 변환·기록한다  
B) 크롤러가 데이터를 변환하고, ETL Job은 메타데이터만 등록한다  
C) 둘 다 동일하며 이름만 다르다  
D) 크롤러는 데이터를 삭제하고, ETL Job은 백업한다  

**정답: A**  
해설: 크롤러는 데이터를 변환하지 않고 스키마·파티션 메타데이터만 Catalog에 등록한다. 반면 ETL Job이 소스를 읽어 실제로 변환하고 새 위치에 기록한다. "스키마 알아내기 = 크롤러, 데이터 바꾸기 = ETL Job"이 핵심 구분이다.

---

**문제 2.** 다음 요구사항에 가장 비용 효율적인 선택은? "들어오는 JSON을 단순히 형식만 바꿔 S3에 적재하면 되고, 윈도우 집계나 복잡한 분산 변환은 필요 없다."

A) Glue ETL Spark Job에 DPU 최대 설정  
B) EMR 상시 클러스터  
C) Kinesis Data Firehose + Lambda 변환  
D) Glue DataBrew 대화식 세션 상시 유지  

**정답: C**  
해설: 단순 형식 변환 후 S3 적재라면 Firehose + Lambda가 가장 단순하고 저렴하다. Glue Spark Job이나 EMR은 복잡한 분산 변환에 적합하며 이 경우 과한 설계다. DataBrew 세션 상시 유지는 비용만 늘린다. "Glue가 정답이 아닌 경우"의 대표 사례다.

---

**문제 3.** Glue Job 북마크가 동작하지 않아 매번 전체 데이터를 재처리한다. 점검할 항목으로 옳지 않은 것은?

A) Job 속성에서 북마크가 Enable되어 있는지  
B) 소스/싱크에 transformation_ctx가 지정되어 있는지  
C) 스크립트 끝에 job.commit()이 호출되는지  
D) Schema Registry 호환성 모드가 FULL인지  

**정답: D**  
해설: Job 북마크 동작에는 북마크 Enable, transformation_ctx 지정, job.commit() 호출이 필요하다. Schema Registry 호환성 모드는 스트리밍 스키마 검증과 관련될 뿐 배치 Job 북마크와 무관하므로 점검 대상이 아니다.

---

**문제 4.** 데이터의 스키마(형태)와 값(내용) 검증을 담당하는 서비스를 올바르게 짝지은 것은?

A) 스키마 호환성 = Glue Data Quality / 값 유효성 = Schema Registry  
B) 스키마 호환성 = Schema Registry / 값 유효성(음수·중복·null) = Glue Data Quality  
C) 둘 다 Glue 크롤러가 담당  
D) 둘 다 Athena가 담당  

**정답: B**  
해설: Schema Registry는 스트리밍 데이터의 스키마 호환성(형태)을 강제하고, Glue Data Quality는 DQDL로 값의 유효성(음수 금지, 중복 금지, null 비율 등 내용)을 검증한다. 크롤러는 메타데이터 등록, Athena는 쿼리 엔진으로 둘 다 이 역할을 하지 않는다.

---

**문제 5.** 코드를 모르는 분석가가 데이터를 빠르게 프로파일링하고 정제하려 한다. 반면 데이터 엔지니어는 복잡한 조인을 포함한 프로덕션 ETL을 비주얼로 설계하되 일부는 코드로 제어하려 한다. 각각에 맞는 도구는?

A) 분석가 = Glue Studio / 엔지니어 = DataBrew  
B) 분석가 = 크롤러 / 엔지니어 = Schema Registry  
C) 분석가 = Glue DataBrew / 엔지니어 = Glue Studio  
D) 분석가 = Athena / 엔지니어 = QuickSight  

**정답: C**  
해설: 노코드 정제·프로파일링은 분석가용 DataBrew, 비주얼로 프로덕션 ETL을 짜면서 코드 전환이 가능한 것은 엔지니어용 Studio다. A는 둘을 뒤바꿨고, 크롤러·Schema Registry·Athena·QuickSight는 정제/ETL 설계 도구가 아니다.

---
