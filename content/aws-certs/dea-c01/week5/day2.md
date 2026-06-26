# Day 2 - Lambda 변환과 경량 처리: 이벤트 기반 ETL의 한계와 적합성

EMR과 Glue가 "대규모 데이터를 분산 처리하는 무거운 엔진"이라면, **AWS Lambda**는 정반대 철학의 도구다. 서버를 전혀 띄우지 않고, 이벤트가 발생한 순간 작은 코드 조각을 실행하고 사라진다. 데이터 엔지니어링에서 Lambda는 "거대한 변환"이 아니라 "이벤트에 즉각 반응하는 가볍고 짧은 변환"을 맡는다.

오늘의 핵심 질문은 단순하다 — **언제 Lambda가 적합하고, 언제 Lambda로는 안 되는가**. Lambda를 잘못 선택하면 시간·메모리 한계에 부딪혀 작업이 중간에 실패한다. 그 경계선을 정확히 아는 것이 시험과 실무 모두의 관건이다.

## Lambda의 본질: 이벤트 기반, 무상태, 짧은 수명

Lambda는 세 가지 성질로 정의된다.

| 성질 | 의미 |
|------|------|
| 이벤트 기반(event-driven) | S3 PUT, Kinesis 레코드, SQS 메시지 등이 함수를 트리거 |
| 무상태(stateless) | 호출마다 독립 실행, 메모리에 상태를 영속할 수 없음 |
| 짧은 수명(short-lived) | 최대 15분 실행 후 강제 종료 |

데이터 파이프라인에서 Lambda가 빛나는 대표 패턴은 **S3 이벤트 기반 변환**이다. 새 파일이 S3에 떨어지면 즉시 Lambda가 트리거되어 그 파일을 변환·검증·라우팅한다.

```python
# S3에 파일이 도착하면 트리거되는 Lambda: JSON → 정제 후 다른 버킷으로
import json
import boto3

s3 = boto3.client("s3")

def lambda_handler(event, context):
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        obj = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(obj["Body"].read())

        # 경량 변환: 필드 정제 및 검증
        cleaned = [r for r in data if r.get("amount", 0) > 0]

        s3.put_object(
            Bucket="curated-bucket",
            Key=f"cleaned/{key}",
            Body=json.dumps(cleaned),
        )
    return {"processed": len(event["Records"])}
```

이 패턴이 강력한 이유는 **유휴 비용이 0**이라는 점이다. 파일이 안 오면 함수가 실행되지 않고 과금도 없다. 새벽 내내 Glue 클러스터를 켜둘 필요 없이, 파일이 도착할 때만 100ms 단위로 처리하고 그만큼만 낸다.

> 💡 **관련 이론**: Lambda는 **FaaS(Function as a Service)** 모델의 대표 구현으로, 컴퓨팅 추상화의 정점에 있다. 컴퓨팅은 물리 서버 → 가상 머신(EC2) → 컨테이너(ECS) → 함수(Lambda) 순으로 추상화가 높아지며, 관리 단위가 "머신"에서 "코드 한 조각"으로 줄어든다. 추상화가 높아질수록 운영 부담은 줄지만 실행 환경에 대한 제어권과 실행 시간 한계라는 제약이 따라온다. Lambda의 15분 한계는 이 트레이드오프의 직접적 결과다.

## Lambda의 한계: 시간, 메모리, 페이로드

Lambda를 ETL에 쓸 때 반드시 외워야 하는 한계가 있다. 이 숫자들이 적합성 판단의 기준선이 된다.

| 항목 | 한계 | 시사점 |
|------|------|--------|
| 최대 실행 시간 | 15분 | 장시간 대규모 처리는 불가 |
| 메모리 | 128MB ~ 10,240MB(10GB) | 메모리에 다 못 올리는 데이터는 부적합 |
| /tmp 임시 디스크 | 512MB ~ 10GB | 대용량 파일 버퍼링에 한계 |
| 동기 페이로드 | 6MB(요청/응답) | 큰 데이터는 S3 경유 필요 |
| 배포 패키지 | 50MB(압축) / 250MB(압축 해제) | 큰 라이브러리는 컨테이너 이미지(10GB) 사용 |

Lambda의 CPU는 메모리에 비례해 할당된다. 즉 메모리를 올리면 CPU도 같이 늘어난다. CPU 바운드 작업이 느리면 메모리를 늘리는 것만으로 실행 시간이 단축되어 오히려 총비용이 줄기도 한다. 이것은 Lambda 비용 튜닝의 핵심 직관이다.

> ⚠️ **함정**: "S3에 매일 떨어지는 100GB 로그를 Lambda로 집계하라"는 시나리오에 Lambda를 고르면 틀린다. 단일 호출 15분·메모리 10GB 한계로 대규모 데이터를 한 번에 처리할 수 없다. 이런 대규모 배치는 Glue나 EMR이 정답이다. Lambda는 "작은 파일 단위의 짧은 변환"에 한정해야 한다.

## Lambda가 적합한 사례 vs 부적합한 사례

판단 기준을 명확히 나눠 보자.

**적합한 사례**
- S3에 도착한 소~중규모 파일의 즉시 변환·검증·포맷 변환
- Kinesis/DynamoDB Streams 레코드의 경량 실시간 가공
- 파이프라인 단계 간 트리거·라우팅·알림 등 글루(glue) 코드
- API 호출로 외부 데이터 가져와 가공하는 짧은 작업
- Firehose 데이터 변환 함수(레코드 단위 변환)

**부적합한 사례**
- 15분을 넘는 장시간 처리
- 메모리에 올릴 수 없는 대용량 데이터(수십 GB+)의 단일 처리
- 복잡한 셔플·조인이 필요한 대규모 분산 집계
- 상태를 누적해야 하는 stateful 윈도우 집계(→ Flink)

```python
# Kinesis Firehose 변환 Lambda: 레코드를 변환하고 상태 코드를 반환
import base64
import json

def lambda_handler(event, context):
    output = []
    for record in event["records"]:
        payload = json.loads(base64.b64decode(record["data"]))
        payload["processed_at"] = context.aws_request_id
        transformed = base64.b64encode(
            (json.dumps(payload) + "\n").encode("utf-8")
        ).decode("utf-8")
        output.append({
            "recordId": record["recordId"],
            "result": "Ok",
            "data": transformed,
        })
    return {"records": output}
```

Firehose 변환에서 각 레코드는 반드시 `recordId`와 `result`(`Ok`/`Dropped`/`ProcessingFailed`)를 반환해야 한다. 이는 Firehose가 레코드별 성공/실패를 추적하기 위함이다.

> 🔍 **더 깊이**: Lambda의 첫 호출이 느린 **콜드 스타트(cold start)**는 실행 환경(컨테이너)을 새로 만드는 시간 때문이다. 이후 호출은 같은 환경을 재사용(warm)해 빠르다. 데이터 파이프라인처럼 지연에 덜 민감한 워크로드에서는 보통 문제가 안 되지만, 지연이 중요하면 **Provisioned Concurrency**로 미리 환경을 데워둘 수 있다. VPC에 붙은 Lambda도 과거엔 콜드 스타트가 길었으나 ENI 개선으로 크게 완화됐다.

## 동시성과 처리량: 병렬로 흐르게 하기

Lambda의 힘은 **자동 수평 확장**이다. S3에 파일 1,000개가 동시에 떨어지면 Lambda 인스턴스가 동시에 1,000개까지(계정 동시성 한도 내) 병렬 실행될 수 있다. 즉 "작은 파일 많은 변환"에는 분산 클러스터 없이도 사실상 무한에 가까운 병렬성을 공짜로 얻는다.

다만 다운스트림 보호를 위해 **예약 동시성(Reserved Concurrency)**이나 **함수별 동시성 제한**으로 폭주를 막아야 한다. 예컨대 Lambda가 RDS에 쓰는데 동시성을 안 막으면 수천 개 연결로 DB가 죽는다.

```bash
# 함수의 동시 실행을 50개로 제한해 다운스트림 DB 보호
aws lambda put-function-concurrency \
  --function-name s3-transform \
  --reserved-concurrent-executions 50
```

> 🎯 **시나리오**: IoT 기기 수천 대가 작은 JSON 파일을 끊임없이 S3에 올린다. 각 파일은 1MB 미만이고 변환은 단순 정제뿐이다. 최적 구성은 (1) **S3 이벤트 → Lambda** 트리거로 파일 도착 즉시 변환, (2) 변환 결과는 Parquet으로 큐레이션 버킷에 저장, (3) **예약 동시성**으로 다운스트림 부하 제어, (4) 실패 시 **DLQ(SQS)**로 격리 후 재처리. 유휴 비용 0, 트래픽에 따라 자동 확장된다. 만약 파일이 거대해지거나 복잡 집계가 필요해지면 그때 Glue/EMR로 전환한다.

## 에러 처리: 재시도와 DLQ

Lambda는 호출 유형에 따라 재시도 동작이 다르다. 비동기 호출(S3 이벤트 등)은 기본 2회 재시도하고, 계속 실패하면 **DLQ(Dead Letter Queue)** 또는 **Lambda Destinations**로 실패 이벤트를 보낼 수 있다. 이를 설정하지 않으면 실패 이벤트가 조용히 사라진다 — 데이터 파이프라인에서 절대 피해야 할 상황이다.

스트림 소스(Kinesis/DynamoDB Streams)는 동작이 또 다르다. 한 레코드가 실패하면 기본적으로 그 샤드의 처리가 멈춰 블로킹될 수 있으므로, `BisectBatchOnFunctionError`, `MaximumRetryAttempts`, 실패 레코드 목적지 같은 옵션으로 "독약 레코드(poison pill)"가 파이프라인 전체를 막지 않게 해야 한다.

## 정리

Lambda는 이벤트 기반·무상태·15분 한계를 가진 경량 변환 도구다. S3 도착 즉시 변환, Firehose 레코드 변환, 파이프라인 글루 코드처럼 "작고 짧은" 작업에 최적이며, 유휴 비용 0과 자동 수평 확장이 강점이다. 반면 장시간·대용량·복잡 집계는 Glue/EMR로 보내야 한다. 한계(시간·메모리·페이로드)를 외우고, DLQ로 실패를 격리하는 것이 신뢰성의 핵심이다. 내일은 이런 여러 처리 단계를 엮는 오케스트레이션을 다룬다.

---

## 📝 연습 문제

**문제 1.** 매일 S3에 도착하는 단일 200GB 압축 로그 파일을 디코드하고 복잡한 집계를 수행해야 한다. 다음 중 가장 적절하지 않은 선택은?

A) AWS Lambda 단일 함수로 전체 파일을 처리  
B) AWS Glue Spark 작업  
C) Amazon EMR Spark 클러스터  
D) EMR Serverless  

**정답: A**  
해설: 단일 Lambda 호출은 최대 15분·메모리 10GB 한계가 있어 200GB 파일을 한 번에 디코드·집계할 수 없다. 대규모 복잡 집계는 Glue나 EMR(Serverless 포함) 같은 분산 엔진이 적합하다. Lambda는 작은 파일 단위의 짧은 변환에 한정해야 한다.

---

**문제 2.** Kinesis Data Firehose의 데이터 변환 Lambda에서 각 레코드를 반환할 때 반드시 포함해야 하는 필드는?

A) bucket과 key  
B) recordId와 result  
C) timestamp와 shardId  
D) partitionKey만  

**정답: B**  
해설: Firehose 변환 Lambda는 각 레코드에 대해 원본 `recordId`와 처리 `result`(Ok/Dropped/ProcessingFailed), 그리고 변환된 `data`를 반환해야 Firehose가 레코드별 성공·실패를 추적할 수 있다. bucket/key는 S3 이벤트 구조이고 나머지는 무관하다.

---

**문제 3.** Lambda 함수가 CPU 바운드 작업으로 자주 타임아웃에 가깝게 느리게 동작한다. 비용까지 함께 개선할 수 있는 1차적 튜닝은?

A) 메모리 할당을 늘려 비례 증가하는 CPU로 실행 시간을 단축한다  
B) 동시성을 0으로 설정한다  
C) /tmp 디스크를 512MB로 줄인다  
D) 페이로드 크기를 6MB 이상으로 늘린다  

**정답: A**  
해설: Lambda는 메모리에 비례해 CPU가 할당되므로, CPU 바운드 작업은 메모리를 늘리면 실행 시간이 단축되고 때로는 총비용까지 감소한다. 동시성을 0으로 하면 함수가 실행되지 않고, 페이로드 한계는 6MB이며 이를 늘릴 수 없다.

---

**문제 4.** S3 이벤트로 비동기 트리거되는 Lambda가 간헐적으로 실패한다. 실패 이벤트가 조용히 유실되지 않도록 보장하는 가장 적절한 방법은?

A) 함수 메모리를 최대로 설정  
B) DLQ(SQS) 또는 Lambda Destinations로 실패 이벤트를 격리  
C) 동기 호출로 전환  
D) Reserved Concurrency를 0으로 설정  

**정답: B**  
해설: 비동기 호출은 기본 재시도 후에도 실패하면 이벤트가 사라질 수 있으므로, DLQ(SQS/SNS)나 Lambda Destinations로 실패 이벤트를 격리해 재처리·조사할 수 있게 해야 한다. 메모리 증가나 동기 전환은 유실 방지의 본질적 해법이 아니다.

---

**문제 5.** 다음 중 Lambda 기반 변환이 가장 적합한 워크로드는?

A) 수십 GB를 메모리에 올려 복잡한 셔플 조인을 수행하는 배치  
B) 사용자 세션 단위로 상태를 누적하는 장시간 윈도우 집계  
C) S3에 도착하는 1MB 미만 파일을 즉시 정제·포맷 변환하는 이벤트 기반 처리  
D) 30분 이상 걸리는 대규모 머신러닝 학습  

**정답: C**  
해설: Lambda는 이벤트 기반·무상태·짧은 수명에 최적이라, 작은 파일이 S3에 도착하는 즉시 정제·변환하는 워크로드에 이상적이다. 대용량 셔플 조인(Glue/EMR), stateful 윈도우 집계(Flink), 장시간 ML 학습(EMR/SageMaker)은 모두 15분·메모리 한계로 Lambda에 부적합하다.

---
