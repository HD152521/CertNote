# Day 3 - 오케스트레이션: Step Functions·MWAA·Glue Workflows의 선택 기준

지금까지 본 도구들(Glue, EMR, Lambda)은 각각 "한 가지 일"을 한다. 그런데 현실의 데이터 파이프라인은 단일 작업이 아니다 — "S3에서 데이터를 받아 → Glue로 변환하고 → 검증 Lambda를 거쳐 → 실패하면 알림을 보내고 → 성공하면 Redshift에 적재한다"처럼 여러 단계가 순서·조건·재시도로 엮인다. 이 흐름을 정의하고 조율하는 것이 **오케스트레이션(orchestration)**이다.

오케스트레이션이 없으면 각 작업을 cron이나 수동으로 띄우고, 실패하면 사람이 로그를 뒤져 재실행해야 한다. 오케스트레이터는 이 "작업의 흐름"을 코드로 정의하고, 의존성·재시도·분기·병렬·알림을 자동으로 관리한다. AWS에는 세 가지 주요 선택지가 있고, 시험은 "어떤 상황에 어느 것"을 집요하게 묻는다.

## 오케스트레이션의 핵심 개념: DAG

세 도구 모두 작업 흐름을 **DAG(Directed Acyclic Graph, 방향성 비순환 그래프)**로 표현한다. 작업이 노드, 의존성이 화살표이며, 순환(cycle)이 없다 — A가 B를 기다리고 B가 다시 A를 기다리는 교착이 불가능하다는 뜻이다.

```
추출(Extract) ──► 변환(Transform) ──┬──► 적재(Load) ──► 알림
                                     └──► 품질 검증 ──► 실패 시 격리
```

> 💡 **관련 이론**: DAG가 오케스트레이션의 보편 모델이 된 이유는 **위상 정렬(topological sort)**이 가능하기 때문이다. 비순환 그래프는 "모든 의존성이 충족된 순서"로 작업을 정렬할 수 있고, 의존성이 없는 작업끼리는 안전하게 병렬 실행할 수 있다. 순환이 있으면 시작 지점을 정할 수 없어 정렬이 불가능하다. Airflow, Step Functions, Glue Workflows가 모두 DAG를 채택한 것은 우연이 아니라 이 수학적 성질 때문이다.

## AWS Step Functions: 서버리스 상태 머신

**Step Functions**는 서버리스 워크플로 오케스트레이터다. 워크플로를 **상태 머신(state machine)**으로 정의하며, 각 단계(state)는 Lambda 호출, Glue 작업 실행, ECS 태스크, 대기, 분기(Choice), 병렬(Parallel), 맵(Map) 등이 될 수 있다. JSON 기반 ASL(Amazon States Language)로 흐름을 기술한다.

```json
{
  "Comment": "ETL 파이프라인",
  "StartAt": "RunGlueJob",
  "States": {
    "RunGlueJob": {
      "Type": "Task",
      "Resource": "arn:aws:states:::glue:startJobRun.sync",
      "Parameters": { "JobName": "daily-transform" },
      "Retry": [{
        "ErrorEquals": ["States.ALL"],
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }],
      "Next": "ValidateData"
    },
    "ValidateData": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:function:validate",
      "Next": "CheckResult"
    },
    "CheckResult": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.isValid", "BooleanEquals": true,
        "Next": "LoadToRedshift"
      }],
      "Default": "NotifyFailure"
    },
    "LoadToRedshift": { "Type": "Task", "Resource": "...", "End": true },
    "NotifyFailure": { "Type": "Task", "Resource": "...", "End": true }
  }
}
```

핵심은 **`.sync` 통합**이다. `glue:startJobRun.sync`는 Glue 작업을 시작하고 끝날 때까지 기다린다. 덕분에 폴링 코드를 직접 짤 필요가 없다. 재시도(`Retry`), 에러 처리(`Catch`), 분기(`Choice`)가 모두 선언적으로 표현된다.

Step Functions는 두 가지 워크플로 타입이 있다.

| 타입 | 특징 | 용도 |
|------|------|------|
| Standard | 최대 1년 실행, 정확히 1회, 단계별 과금 | 장기·내구성 중요 ETL |
| Express | 최대 5분, 대량 고빈도, 실행시간 과금 | 이벤트 스트림 고속 처리 |

> 🎯 **시나리오**: "Glue 작업 → 검증 → 조건부 적재 → 실패 알림"처럼 AWS 서비스들을 분기·재시도와 함께 엮어야 하고, 인프라 운영을 두고 싶지 않다. 최적은 **Step Functions Standard**다. 각 단계가 Glue/Lambda/SNS와 네이티브 통합되고, `Choice`로 분기, `Retry`/`Catch`로 장애를 선언적으로 처리하며, 서버를 띄울 필요가 없다. 시각적 워크플로 콘솔로 실행 이력도 한눈에 본다.

## Amazon MWAA: 관리형 Apache Airflow

**MWAA(Managed Workflows for Apache Airflow)**는 오픈소스 **Apache Airflow**의 관리형 버전이다. Airflow는 데이터 엔지니어링 업계의 사실상 표준 오케스트레이터로, **Python 코드로 DAG를 정의**한다.

```python
# Airflow DAG: Python으로 정의하는 ETL 흐름
from airflow import DAG
from airflow.providers.amazon.aws.operators.glue import GlueJobOperator
from datetime import datetime

with DAG("daily_etl", start_date=datetime(2026, 6, 1),
         schedule_interval="0 2 * * *", catchup=False) as dag:

    transform = GlueJobOperator(
        task_id="transform",
        job_name="daily-transform",
    )
    # >> 연산자로 의존성 정의
    transform  # downstream task로 이어짐
```

MWAA가 강한 지점은 **복잡한 의존성, 풍부한 연산자 생태계, Python 기반 동적 DAG 생성, 그리고 멀티 클라우드/온프레미스 혼합**이다. Airflow는 수백 개의 프로바이더(연산자)를 통해 AWS뿐 아니라 Snowflake, GCP, 데이터브릭스, 온프레미스 DB까지 한 DAG에서 조율할 수 있다. 기존에 Airflow DAG를 운영하던 팀이 AWS로 옮길 때도 자연스럽다.

대신 MWAA는 **서버리스가 아니다**. 환경(워커/스케줄러)이 상시 떠 있어 유휴 비용이 발생하고, 환경 클래스(small/medium/large)와 워커 스케일을 관리해야 한다. 운영 부담과 비용이 Step Functions보다 크다.

> 🔍 **더 깊이**: Airflow의 `schedule_interval`과 `catchup`은 흔한 함정이다. `catchup=True`(기본)면 `start_date`부터 현재까지 누락된 모든 스케줄 구간을 한꺼번에 **백필(backfill)** 실행한다. 과거 날짜로 DAG를 배포하면 수백 개 실행이 폭주할 수 있다. 의도적 백필이 아니라면 `catchup=False`로 두는 것이 안전하다. 또한 Airflow의 실행 시각은 "구간의 끝"을 기준으로 트리거되는 논리적 날짜(logical date) 개념이라 직관과 어긋나기 쉽다.

## Glue Workflows: Glue 전용 경량 오케스트레이션

**Glue Workflows**는 Glue 안에 내장된 오케스트레이션 기능이다. Glue의 **크롤러·작업·트리거**를 묶어 하나의 워크플로로 실행한다. 트리거는 스케줄, 온디맨드, 또는 이벤트(이전 작업 완료) 기반으로 다음 단계를 시작한다.

```
[스케줄 트리거] → Crawler(스키마 갱신)
                     ↓ (완료 이벤트)
                  Glue Job A (변환)
                     ↓ (완료 이벤트)
                  Glue Job B (집계)
```

Glue Workflows의 장점은 **순수 Glue 파이프라인에서 추가 서비스 없이 그 자체로 완결**된다는 점이다. 크롤러 → 작업 → 작업의 흐름이 전부 Glue라면 별도 오케스트레이터를 둘 필요가 없다. 단점은 **Glue 리소스에 거의 국한**된다는 것 — 복잡한 분기 로직이나 다양한 비-Glue 서비스 조율에는 약하다.

## 셋 중 무엇을 고를까: 결정 기준

시험의 최종 판단표다.

| 상황 | 선택 |
|------|------|
| AWS 서비스 중심, 서버리스, 분기·재시도 선언적 처리 | **Step Functions** |
| 단기·고빈도 이벤트 처리(5분 내) | **Step Functions Express** |
| 기존 Airflow DAG 마이그레이션, 복잡한 Python 로직 | **MWAA** |
| 멀티 클라우드/온프레미스 혼합, 풍부한 연산자 필요 | **MWAA** |
| 순수 Glue 크롤러·작업 파이프라인, 추가 서비스 불필요 | **Glue Workflows** |
| 운영 부담·유휴 비용을 최소화 | **Step Functions** 또는 **Glue Workflows** |

직관적 요약: **Step Functions = AWS 네이티브 서버리스**, **MWAA = 표준 Airflow·복잡·멀티 환경**, **Glue Workflows = Glue 전용 경량**.

> ⚠️ **함정**: "복잡한 다단계 워크플로 = MWAA"라고 단순 암기하면 틀린다. 워크플로가 전부 AWS 서비스로 구성되고 서버리스·저운영을 원하면 Step Functions가 더 적합하다. MWAA를 선택하는 결정적 단서는 "기존 Airflow 사용", "멀티 클라우드/온프레미스 혼합", "Python으로 동적 DAG 생성" 같은 키워드다. 단순히 "단계가 많다"는 것만으로 MWAA를 고르면 과한 운영 부담을 떠안는다.

## 정리

오케스트레이션은 여러 작업을 DAG로 엮어 순서·의존성·재시도·분기를 자동화한다. **Step Functions**는 AWS 네이티브·서버리스로 분기와 재시도를 선언적으로 처리하고 운영 부담이 적다. **MWAA**는 표준 Airflow로 복잡한 Python 로직과 멀티 환경 조율에 강하지만 상시 비용과 운영이 따른다. **Glue Workflows**는 순수 Glue 파이프라인을 추가 서비스 없이 묶는 경량 옵션이다. 선택의 단서는 "AWS 네이티브냐, Airflow 자산이냐, Glue 전용이냐"다. 내일은 파이프라인의 성능과 비용을 좌우하는 파일 포맷·파티셔닝을 다룬다.

---

## 📝 연습 문제

**문제 1.** 여러 작업이 순서·조건·재시도로 엮이는데, 한 작업이 다시 자신을 의존하는 순환은 허용되지 않는다. 이런 워크플로를 표현하는 보편 모델은?

A) 순환 연결 리스트  
B) DAG(방향성 비순환 그래프)  
C) 해시 테이블  
D) 이진 탐색 트리  

**정답: B**  
해설: 오케스트레이션은 작업을 노드, 의존성을 화살표로 하는 DAG로 표현한다. 비순환이라 위상 정렬이 가능해 실행 순서를 정하고 독립 작업을 병렬화할 수 있다. 순환이 있으면 시작점을 정할 수 없어 정렬이 불가능하다.

---

**문제 2.** 한 팀이 이미 온프레미스에서 Apache Airflow DAG를 다수 운영 중이며, 일부 작업은 GCP와 사내 DB도 조율한다. 이를 AWS로 옮기되 기존 DAG 자산을 최대한 재사용하려 한다. 가장 적합한 것은?

A) AWS Glue Workflows  
B) S3 이벤트 + Lambda 체인  
C) EventBridge 스케줄러 단독  
D) Amazon MWAA  

**정답: D**  
해설: MWAA는 관리형 Apache Airflow로 기존 Airflow DAG를 거의 그대로 재사용할 수 있고, 풍부한 프로바이더로 GCP·온프레미스 등 멀티 환경을 한 DAG에서 조율한다. Glue Workflows는 Glue 리소스에 국한되고, Lambda 체인이나 EventBridge 단독으로는 복잡한 Airflow 자산을 대체하기 어렵다.

---

**문제 3.** "Glue 작업 실행 → 검증 Lambda → 검증 통과 시 Redshift 적재, 실패 시 SNS 알림"을 분기와 재시도를 포함해 서버리스로 구성하려 한다. 가장 적합한 것은?

A) AWS Step Functions  
B) Amazon MWAA  
C) cron으로 각 작업 개별 트리거  
D) 단일 거대 Lambda 함수  

**정답: A**  
해설: Step Functions는 Glue/Lambda/SNS와 네이티브 통합되고 Choice(분기), Retry/Catch(재시도·에러 처리)를 선언적으로 표현하며 서버리스라 운영 부담이 적다. MWAA는 상시 비용·운영이 크고, cron은 의존성·재시도 관리가 빈약하며, 단일 거대 Lambda는 15분 한계와 가시성 문제가 있다.

---

**문제 4.** Glue 크롤러로 스키마를 갱신한 뒤, 그 완료를 기점으로 Glue 작업 두 개를 순차 실행하는 단순 파이프라인이 있고 다른 AWS 서비스는 끼지 않는다. 추가 서비스 없이 가장 간단히 구성하는 방법은?

A) Amazon MWAA 환경을 새로 프로비저닝  
B) Glue Workflows의 트리거로 크롤러·작업을 체인  
C) EMR Step으로 구성  
D) Kinesis Data Streams로 연결  

**정답: B**  
해설: 흐름이 전부 Glue 크롤러·작업으로 완결되므로 Glue 내장 Glue Workflows의 트리거(완료 이벤트 기반)로 묶으면 추가 서비스 없이 가장 간단하다. MWAA는 과한 운영 부담이고, EMR Step·Kinesis는 이 시나리오와 무관하다.

---

**문제 5.** Step Functions의 Standard와 Express 워크플로에 관한 설명으로 옳은 것은?

A) Express는 최대 1년까지 실행할 수 있다  
B) 둘 다 실행 시간 제한이 없다  
C) Standard는 장기 실행(최대 1년)·정확히 1회 실행에 적합하고, Express는 5분 이내 대량 고빈도 이벤트 처리에 적합하다  
D) Standard는 5분, Express는 무제한이다  

**정답: C**  
해설: Standard는 최대 1년 실행·exactly-once·단계별 과금으로 장기·내구성 ETL에 맞고, Express는 최대 5분·대량 고빈도·실행시간 과금으로 이벤트 스트림 고속 처리에 맞는다. 나머지 보기는 두 타입의 실행 시간 특성을 잘못 기술했다.

---
