# Day 4 - 자주 틀리는 함정과 키워드: "요구사항 → 서비스" 번역표

시험에서 점수를 잃는 가장 흔한 이유는 지식 부족이 아니라 **헷갈리는 서비스 쌍**과 **함정 키워드**입니다. 오늘은 시험 직전에 머릿속에 박아둘 "요구사항 → 서비스" 번역표와, 비슷해 보여 자주 오답으로 유도되는 함정들을 정리합니다. 이 표를 외우면 긴 시나리오도 키워드만 보고 빠르게 답을 좁힐 수 있습니다.

## 핵심 번역표: 요구사항을 서비스로

| 요구사항 키워드 | 정답 서비스 | 한 줄 근거 |
|----------------|------------|-----------|
| 서버리스 SQL, S3 직접 쿼리, 스캔량 과금 | Athena | 인프라 없이 Presto SQL |
| 스트리밍, 실시간, 샤드, 재처리 | Kinesis Data Streams | 직접 소비·순서·보존 |
| 스트리밍 무관리 적재 → S3/Redshift | Data Firehose | 버퍼링·변환·자동 배달 |
| Kafka 호환 | Amazon MSK | 관리형 Apache Kafka |
| 중앙 권한, 컬럼/행 수준 데이터 접근 | Lake Formation | 세분화 거버넌스 |
| 공유 메타스토어, 스키마 추론 | Glue Data Catalog + 크롤러 | 카탈로그·스키마 |
| 증분 ETL, 이미 처리한 데이터 건너뛰기 | Glue 잡 북마크 | 처리 상태 추적 |
| 서버리스 Spark ETL, 스케줄 | AWS Glue | 관리형 ETL |
| 대규모, 세밀 튜닝, 기존 Spark/Hive | Amazon EMR | 관리형 Hadoop |
| 페타바이트 분석 DW, 컬럼형 MPP | Amazon Redshift | OLAP |
| 핫=DW, 콜드=S3 로드 없이 조회 | Redshift Spectrum | 계층 분리 |
| DB 변경분(CDC) 실시간 복제 | AWS DMS | full load + CDC |
| Airflow DAG 그대로 운영 | Amazon MWAA | 관리형 Airflow |
| 이기종 단계 조율·분기·재시도 | Step Functions | 서버리스 상태 기계 |
| 스트리밍 윈도 집계(SQL/Flink) | Managed Service for Apache Flink | 실시간 윈도 |
| 민감정보(PII) 자동 탐지·분류 | Amazon Macie | ML 기반 발견 |
| API 호출 감사(누가·언제) | CloudTrail | 감사 로그 |
| 키 회전·키별 통제·암호화 감사 | KMS(SSE-KMS) | 고객 관리 키 |
| 데이터 품질 규칙 검증 | Glue Data Quality | DQDL 규칙 |

> 💡 **관련 이론**: 시험 문장은 거의 항상 이 "오른쪽 칸"이 아니라 "왼쪽 칸 표현"으로 묻습니다. 평소에 서비스명이 아니라 "요구사항 표현"으로 검색·매핑하는 훈련을 하면 실전에서 즉시 반응할 수 있습니다.

## 자주 헷갈리는 서비스 쌍 (함정)

| 쌍 | 구분 기준 |
|----|----------|
| Kinesis Data Streams vs Firehose | 직접 소비·재처리=Streams / 무관리 적재=Firehose |
| Athena vs Redshift | 즉석·서버리스·비정형=Athena / 대규모 상시 DW=Redshift |
| Glue vs EMR | 서버리스·간편=Glue / 대규모·세밀 튜닝=EMR |
| Step Functions vs MWAA | 이기종 AWS 조율=Step Functions / 기존 Airflow DAG=MWAA |
| Lake Formation vs IAM | 데이터(컬럼·행) 접근=LF / 서비스·API 운영 권한=IAM |
| CloudTrail vs CloudWatch Logs | 누가 API 호출했나=CloudTrail / 앱 실행 로그·원인=CloudWatch Logs |
| Macie vs GuardDuty | 민감정보 탐지=Macie / 위협·침해 탐지=GuardDuty |
| SSE-KMS vs SSE-S3 | 키 통제·감사 필요=KMS / 단순 관리형=S3 |

> 💡 **관련 이론**: "직접 소비/재처리/순서 보장"이 보이면 Firehose가 아니라 Kinesis Data Streams입니다. Firehose는 컨슈머·샤드 개념이 없습니다. 이 한 가지만 정확히 구분해도 스트리밍 문제 다수를 맞힙니다.

## 표현 함정: 같은 말, 다른 뜻

- **"실시간(real-time)"** vs **"준실시간(near real-time)/마이크로배치"**: 진짜 초 단위면 Kinesis/Flink, 분 단위 허용이면 Firehose 버퍼·Glue 마이크로배치.
- **"서버리스/운영 최소"**: EMR·상시 클러스터·EC2 보기를 우선 소거.
- **"비용 최소"**: 상시 가동·과대 프로비저닝 보기를 소거, S3 계층/Spectrum/서버리스 우선.
- **"기존 코드 재사용"**: Spark/Hive 대규모면 EMR, Airflow면 MWAA.
- **"가능한가"가 아니라 "가장 적합한가"**: 두 보기가 모두 동작 가능할 때 제약을 더 잘 만족하는 쪽.

> 💡 **관련 이론**: AWS 시험의 오답은 "틀린 답"이 아니라 "덜 적합한 답"인 경우가 많습니다. 두 개가 다 맞아 보이면, 운영 부담·비용·실시간성 제약을 다시 읽고 더 적합한 쪽을 고르세요.

## 핵심 정리

- 시험은 서비스명이 아니라 요구사항 표현으로 묻는다 — 번역표를 외워라.
- Streams/Firehose, Athena/Redshift, Glue/EMR, Step Functions/MWAA, LF/IAM, CloudTrail/CloudWatch, Macie/GuardDuty 쌍을 정확히 구분.
- "서버리스·비용 최소" 키워드는 상시 클러스터 보기를 먼저 소거.
- "가능"이 아니라 "가장 적합"을 고르는 것이 마지막 한 끗.

## 📝 연습 문제

**문제 1.** 스트리밍 데이터를 여러 독립 애플리케이션이 각자 컨슈머로 직접 읽고, 24시간 내 데이터를 재처리할 수 있어야 한다. 가장 적합한 서비스는?

A) Amazon Data Firehose  
B) Amazon SNS  
C) Amazon Kinesis Data Streams  
D) Amazon SQS FIFO  

**정답: C**  
해설: Kinesis Data Streams는 샤드 기반으로 여러 컨슈머가 독립적으로 읽고 보존 기간 내 재처리(re-read)가 가능합니다. Firehose는 직접 소비·재처리 개념이 없고, SNS/SQS는 스트림 재처리 모델이 아닙니다.

---

**문제 2.** "누가 어떤 S3 버킷에 PutObject API를 언제 호출했는지" 감사해야 한다. 가장 적합한 서비스는?

A) Amazon CloudWatch Logs  
B) AWS CloudTrail  
C) Amazon Macie  
D) AWS Config  

**정답: B**  
해설: CloudTrail은 계정의 API 호출(주체·시각·액션)을 기록하는 감사 서비스입니다. CloudWatch Logs는 애플리케이션 로그, Macie는 민감정보 탐지, Config는 리소스 구성 변경 추적으로 API 호출 감사가 주목적이 아닙니다.

---

**문제 3.** 분석가가 임시로 S3 데이터를 표준 SQL로 한 번 조회하려 한다. 상시 클러스터를 두고 싶지 않고 운영 부담을 최소화하려 한다. 가장 적합한 서비스는?

A) Amazon Redshift 상시 클러스터  
B) Amazon EMR  
C) Amazon Athena  
D) EC2에 직접 설치한 Hive  

**정답: C**  
해설: Athena는 서버리스로 상시 인프라 없이 S3를 즉석 SQL 조회하며 스캔량만 과금해 임시·간헐 분석에 가장 적합합니다. Redshift 상시 클러스터·EMR·EC2 Hive는 운영 부담과 비용이 큽니다.

---

**문제 4.** 대규모(수십 TB) 일일 배치를 기존 Spark/Hive 코드로 처리하며, 인스턴스 타입과 튜닝을 세밀히 제어하고 Spot으로 비용을 절감하려 한다. 가장 적합한 서비스는?

A) Amazon EMR  
B) AWS Glue  
C) AWS Lambda  
D) Amazon Athena  

**정답: A**  
해설: EMR은 관리형 Hadoop/Spark 클러스터로 인스턴스 플릿·Spot·세밀한 튜닝과 기존 Spark/Hive 코드 재사용에 적합합니다. Glue는 서버리스라 세밀한 클러스터 제어가 제한적이고, Lambda·Athena는 대규모 배치 처리 엔진이 아닙니다.

---

**문제 5.** S3 버킷에 흩어진 민감 개인정보(PII)를 자동으로 발견·분류하는 것이 목적이다. 침해 위협 탐지가 아니라 데이터 분류가 핵심이다. 가장 적합한 서비스는?

A) Amazon GuardDuty  
B) Amazon Macie  
C) AWS WAF  
D) Amazon Inspector  

**정답: B**  
해설: Macie는 ML로 S3 내 PII·금융정보 등 민감 데이터를 발견·분류합니다. GuardDuty는 위협·침해 탐지, WAF는 웹 공격 차단, Inspector는 취약점 평가로 데이터 분류 기능이 없습니다.

---
