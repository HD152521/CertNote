# Day 4 - 자주 틀리는 함정과 키워드: "요구사항 → 서비스" 번역표

## 📌 핵심 정리

- 시험은 서비스명이 아니라 요구사항 표현으로 묻는다. 왼쪽 칸(요구사항)을 보고 오른쪽 칸(서비스)이 바로 나오게 번역표를 익힌다.
- Streams/Firehose, Athena/Redshift, Glue/EMR, Step Functions/MWAA, Lake Formation/IAM, CloudTrail/CloudWatch Logs, Macie/GuardDuty, SSE-KMS/SSE-S3 여덟 쌍은 구분 축을 한 단어로 말할 수 있어야 한다.
- "서버리스·운영 최소·비용 최소"가 보이면 상시 클러스터와 EC2 직접 설치 보기부터 지운다.
- 그럴듯한 오답은 "그 서비스에 없는 조절 수단"을 말한다. Athena 에는 인스턴스가 없고, Firehose 에는 재처리가 없고, 북마크는 UPDATE 를 모른다.
- 두 보기가 모두 동작한다면 "가능"이 아니라 "가장 적합"을 고른다. 지문의 단어 하나(여러 소비자, 기존 코드, 컬럼 단위)가 답을 바꾼다.

## 번역표를 쓰는 법

시험에서 점수를 잃는 가장 흔한 이유는 지식 부족이 아니라 **헷갈리는 서비스 쌍**과 **함정 키워드**다. 오늘은 시험 직전에 머릿속에 넣어 둘 "요구사항 → 서비스" 번역표와, 비슷해 보여 자주 오답으로 유도되는 함정들을 정리한다. 표는 오른쪽 칸을 가리고 왼쪽 칸만 보며 답하는 식으로 쓴다. 답이 2초 안에 나오지 않는 줄만 표시해 두고 시험 전날 그 줄만 다시 본다.

## 핵심 번역표: 요구사항을 서비스로

| 요구사항 키워드 | 정답 서비스 | 한 줄 근거 |
|----------------|------------|-----------|
| 서버리스 SQL, S3 직접 쿼리, 스캔량 과금 | Athena | 인프라 없이 Trino(구 Presto) 기반 SQL |
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

> 💡 **관련 이론**: 시험 문장은 거의 항상 이 "오른쪽 칸"이 아니라 "왼쪽 칸 표현"으로 묻는다. 평소에 서비스명이 아니라 "요구사항 표현"으로 검색·매핑하는 훈련을 하면 실전에서 즉시 반응할 수 있다.

위 표에 없지만 지문에 자주 나오는 표현을 더한다.

| 요구사항 키워드 | 정답 서비스 | 한 줄 근거 |
|------|------|------|
| SaaS(Salesforce 등) 데이터를 코드 없이 S3 로 | Amazon AppFlow | SaaS 커넥터 |
| 온프레미스 파일을 반복 동기화, 무결성 검증 | AWS DataSync | 에이전트 기반 전송 |
| 외부 파트너가 SFTP 로 밀어 넣는다 | AWS Transfer Family | 프로토콜은 그대로, 뒤는 S3 |
| 회선이 부족한 초대용량 일회성 이전 | Snow 패밀리 | 물리 배송 |
| 분석가가 코드 없이 정제·프로파일링 | Glue DataBrew | 샘플 → Recipe → Job |
| 스트림 레코드의 스키마 호환성 강제 | Glue Schema Registry | 호환 모드로 등록 차단 |
| 레이크 테이블의 행 단위 갱신·시간 여행 | Apache Iceberg | 오픈 테이블 포맷 |
| 운영 DB 를 복제 없이 DW 에서 조인 | Redshift 페더레이션 쿼리 | 원격 DB 직접 조회 |
| DB 자격 증명의 자동 교체 | Secrets Manager | 교체 일정 |
| 리소스 구성 변경 이력 | AWS Config | 구성 스냅샷과 이력 |
| 감사 이벤트를 중앙에서 SQL 로 조회 | CloudTrail Lake | 이벤트 데이터 스토어 |
| 조회 시 역할별로 컬럼 값을 가린다(DW) | Redshift 동적 데이터 마스킹 | 원본 불변 |
| 항목이 일정 시간 뒤 자동 삭제(DynamoDB) | TTL | 만료 시각 속성 |
| 한 이벤트를 여러 큐로 유실 없이 분배 | SNS → SQS 팬아웃 | 분배 + 버퍼 |
| 이벤트 내용에 따라 다른 대상으로 | EventBridge 규칙 | 패턴 매칭 라우팅 |

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

> 💡 **관련 이론**: "직접 소비/재처리/순서 보장"이 보이면 Firehose가 아니라 Kinesis Data Streams다. Firehose는 컨슈머·샤드 개념이 없다. 이 한 가지만 정확히 구분해도 스트리밍 문제 다수를 맞힌다.

여덟 쌍이 익숙해졌다면 한 걸음 더 들어간 쌍을 본다. 앞 주차에서 따로 배운 것들을 같은 줄에 놓았다.

| 쌍 | 구분 기준 |
|------|------|
| Kinesis Data Streams vs SQS | 읽어도 남고 재생 가능=스트림 / 메시지 단위 삭제·재시도·DLQ=큐 |
| SNS vs EventBridge | 구독자 전원에게 복제=SNS / 내용으로 골라 보냄, AWS 서비스 이벤트=EventBridge |
| Glue 크롤러 vs Glue ETL 잡 | 메타데이터 등록=크롤러 / 데이터 변환=잡. 크롤러는 데이터를 옮기지 않는다 |
| Job 북마크 vs DMS CDC | 추가만 되는 원천의 신규분=북마크 / UPDATE·DELETE 까지 반영=CDC |
| 증분 크롤 vs 파티션 프로젝션 | 새 폴더만 스캔해 등록=증분 크롤 / 등록 자체를 없앰, Athena 전용=프로젝션 |
| Glue Studio vs DataBrew | 엔지니어의 운영 ETL=Studio / 분석가의 정제·프로파일링=DataBrew |
| Schema Registry vs Data Quality | 형태(스키마 호환성)=Registry / 내용(값의 유효성)=Data Quality |
| Redshift Spectrum vs 페더레이션 쿼리 | S3 파일 조회=Spectrum / 운영 RDS·Aurora 조회=페더레이션 |
| Athena vs Redshift Spectrum | 클러스터 없이 조회=Athena / 이미 있는 Redshift 테이블과 조인=Spectrum |
| Step Functions Standard vs Express | 길고 완료 대기가 필요한 ETL=Standard / 5분 이내 고빈도 이벤트=Express |
| EMR on EC2 vs EMR Serverless | 스팟·인스턴스 제어, 상주 서비스=on EC2 / 클러스터 운영 없음=Serverless |
| DataSync vs Transfer Family | 내가 끌어온다=DataSync / 외부가 프로토콜로 밀어 넣는다=Transfer Family |
| Secrets Manager vs Parameter Store | 자동 교체=Secrets Manager / 설정값 보관=Parameter Store |
| CloudTrail vs AWS Config | 누가 무엇을 호출했나=CloudTrail / 구성이 어떻게 바뀌었나=Config |
| Lifecycle vs Intelligent-Tiering | 접근 패턴을 알고 규칙으로 옮김=Lifecycle / 패턴을 몰라 자동에 맡김=Intelligent-Tiering |
| Macie vs Glue 민감 데이터 탐지 | S3 에 이미 있는 데이터에서 위치를 찾음=Macie / ETL 중에 찾아서 가림=Glue |

## 표현 함정: 같은 말, 다른 뜻

- **"실시간(real-time)"** vs **"준실시간(near real-time)/마이크로배치"**: 진짜 초 단위면 Kinesis/Flink, 분 단위 허용이면 Firehose 버퍼·Glue 마이크로배치.
- **"서버리스/운영 최소"**: EMR·상시 클러스터·EC2 보기를 우선 소거.
- **"비용 최소"**: 상시 가동·과대 프로비저닝 보기를 소거, S3 계층/Spectrum/서버리스 우선.
- **"기존 코드 재사용"**: Spark/Hive 대규모면 EMR, Airflow면 MWAA.
- **"가능한가"가 아니라 "가장 적합한가"**: 두 보기가 모두 동작 가능할 때 제약을 더 잘 만족하는 쪽.

> 💡 **관련 이론**: AWS 시험의 오답은 "틀린 답"이 아니라 "덜 적합한 답"인 경우가 많다. 두 개가 다 맞아 보이면, 운영 부담·비용·실시간성 제약을 다시 읽고 더 적합한 쪽을 고르자.

## 단어 하나가 답을 바꾼다

같은 상황에 단어 하나가 더 붙었을 때 정답이 어떻게 옮겨 가는지 본다. 지문을 끝까지 읽어야 하는 이유다.

| 기본 상황과 답 | 더해진 단어 | 바뀐 답 |
|------|------|------|
| 스트림을 S3 에 적재 → Firehose | "여러 애플리케이션이 각자 읽는다" | Kinesis Data Streams(+ Firehose) |
| 스트림을 S3 에 적재 → Firehose | "기존 Kafka 프로듀서를 그대로" | MSK |
| 스트림을 읽는 소비자를 늘림 → 공유 처리량 | "소비자마다 지연 없이" | 향상된 팬아웃 |
| S3 로그를 SQL 로 조회 → Athena | "키워드 전문 검색" | OpenSearch Service |
| S3 데이터를 SQL 로 조회 → Athena | "Redshift 의 테이블과 조인" | Redshift Spectrum |
| 새 파티션을 자동 인식 → 크롤러 | "Athena 로만 조회, 크롤러 비용 제거" | 파티션 프로젝션 |
| 매일 신규 행만 가져옴 → 북마크 | "기존 행이 수정된다" | DMS CDC |
| 잡 여러 개를 순서대로 → Step Functions | "Glue 크롤러와 잡만" | Glue Workflows |
| 버킷 접근을 팀별로 → IAM·버킷 정책 | "컬럼 단위로" | Lake Formation |
| S3 암호화 → SSE-S3 | "키 사용을 감사" | SSE-KMS 고객 관리 키 |
| 오래된 데이터를 싸게 보관 → Lifecycle | "접근 패턴을 알 수 없다" | Intelligent-Tiering |
| 수 초짜리 파일 변환 → Lambda | "변환에 30분이 걸린다" | Glue 잡 |

## 그 서비스에 없는 손잡이

장애·최적화 문항의 오답은 "그 서비스가 실제로 갖고 있지 않은 조절 수단"을 말하는 경우가 많다. 아래 문장이 보기에 나오면 바로 지운다.

| 보기에 나오는 문장 | 왜 틀렸나 | 실제 손잡이 |
|------|------|------|
| "Athena 의 인스턴스 크기를 키운다" | 서버리스라 인스턴스가 없다 | 포맷·압축·파티션·파일 크기 |
| "Firehose 에서 지난 데이터를 다시 전달한다" | 보존·재처리 기능이 없다 | 소스를 KDS 로 두거나 S3 원본에서 재처리 |
| "온디맨드 모드로 바꿔 핫 샤드를 없앤다" | 한 키의 쏠림은 샤드를 늘려도 한 샤드로 간다 | 파티션 키 재설계 |
| "북마크로 원본 DB 의 변경을 감지한다" | 북마크는 새 행만 안다 | DMS CDC |
| "파티션 프로젝션으로 Spectrum 의 파티션을 관리한다" | Athena 전용이다 | 크롤러·파티션 등록 |
| "크롤러로 CSV 를 Parquet 으로 바꾼다" | 크롤러는 메타데이터만 만든다 | Glue ETL 잡, Athena CTAS |
| "SSE-S3 의 키 정책을 수정한다" | S3 가 관리하는 키라 정책이 없다 | SSE-KMS 고객 관리 키 |
| "CloudTrail 이벤트 기록에서 S3 객체 읽기를 찾는다" | 이벤트 기록은 관리 이벤트만, 90일 | 트레일의 데이터 이벤트 |
| "Macie 로 RDS 테이블의 PII 를 찾는다" | Macie 의 분석 대상은 S3 다 | S3 로 내보낸 뒤 분석하거나 ETL 단계에서 탐지 |
| "Express 워크플로에서 Glue 잡 완료를 기다린다" | 완료 대기 통합과 5분 제한에 걸린다 | Standard 워크플로 |
| "DynamoDB Streams 의 보존 기간을 7일로 늘린다" | 24시간 고정이다 | Kinesis Data Streams 로 내보내기 |
| "Redshift 테이블에 TTL 을 건다" | 자동 만료 기능이 없다 | UNLOAD 후 삭제를 스케줄 |
| "AWS 관리형 키를 다른 계정과 공유한다" | 키 정책을 바꿀 수 없다 | 고객 관리 키 |

## 헷갈리기 쉬운 숫자 묶음

숫자는 따로 외우면 섞인다. 서로 헷갈리는 것끼리 묶어서 본다.

| 묶음 | 값 |
|------|------|
| 보존 기간 | Kinesis Data Streams 기본 24시간·최대 365일 / DynamoDB Streams 24시간 고정 / SQS 기본 4일·최대 14일 / CloudTrail 이벤트 기록 90일 |
| 실행 시간 상한 | Lambda 15분 / Firehose 변환 Lambda 5분 / Step Functions Express 5분 / Step Functions Standard 1년 |
| Firehose S3 버퍼 | 크기 1~128MB(기본 5MB), 간격 0~900초(기본 300초), 먼저 찬 쪽에서 전달. 포맷 변환을 켜면 최소 64MB |
| Kinesis 샤드 | 쓰기 1MB/s 또는 1,000건/s, 읽기 2MB/s(공유). 향상된 팬아웃은 소비자마다 2MB/s |
| S3 최소 보관 기간 | Standard-IA·One Zone-IA 30일 / Glacier Instant·Flexible Retrieval 90일 / Glacier Deep Archive 180일 |
| KMS 자동 교체 | AWS 관리형 키는 매년(옛 자료는 3년) / 고객 관리 키는 켰을 때 기본 365일 |
| 권장 파일 크기 | 분석용 컬럼형 파일은 128MB~1GB. 작은 파일 수만 개가 쿼리를 느리게 한다 |

- 한도는 대부분 조정 가능한 기본값이고 바뀐다. 시험이 묻는 것은 숫자 자체보다 "기본값으로는 요구를 못 채운다"(보존 24시간으로 3일치 재처리 불가)와 "한도 때문에 그 서비스가 탈락한다"(30분 변환에 Lambda 불가)다.

## 이름이 바뀐 서비스

시험 문항과 자료는 옛 이름과 새 이름을 섞어 쓴다. 같은 서비스임을 알아보지 못하면 모르는 서비스로 착각한다.

| 옛 이름 | 지금 이름 | 메모 |
|------|------|------|
| Amazon Kinesis Data Firehose | Amazon Data Firehose | 시험 가이드의 서비스 목록은 여전히 옛 이름으로 적는다 |
| Amazon Kinesis Data Analytics | Amazon Managed Service for Apache Flink | SQL 전용 애플리케이션(Kinesis Data Analytics for SQL)은 2025년 10월 15일부터 새로 만들 수 없고 2026년 1월 27일부터 삭제된다. 대체는 Managed Service for Apache Flink 와 그 Studio 노트북이다 |
| Presto 기반 Athena | Trino 기반 Athena 엔진 | 보기에는 둘 다 나올 수 있다 |
| 고객 마스터 키(CMK) | KMS 키(고객 관리 키) | 옛 자료의 CMK 는 고객 관리 키를 뜻한다 |

- 문항에 Kinesis Data Analytics 로 나오든 Managed Service for Apache Flink 로 나오든 "스트림에 대한 윈도 집계·상태 처리"의 답이라는 점은 같다.

내일은 마지막 날이다. 시험 구성과 시간 배분, 응시 절차를 정리한다.

## 📖 용어

- **번역표** : 지문의 요구사항 표현을 서비스 이름으로 바꿔 주는 대응표. 서비스명이 아니라 요구사항 쪽에서 출발해 익힌다.
- **구분 축** : 닮은 두 서비스를 가르는 단 하나의 기준. 재처리 여부, 운영 주체, 권한의 단위 같은 것이다.
- **준실시간** : 수 초에서 수 분의 지연을 허용하는 처리. 버퍼로 모았다가 전달하는 Firehose 가 대표적이다.
- **손잡이** : 서비스가 실제로 제공하는 조절 수단. 서버리스 서비스에는 인스턴스 크기 같은 손잡이가 없다.
- **핫 샤드** : 파티션 키가 쏠려 특정 샤드에만 트래픽이 몰리는 상태. 샤드를 늘려도 한 키의 쏠림은 풀리지 않는다.
- **데이터 이벤트** : S3 객체 읽기·쓰기처럼 리소스 안의 데이터에 대한 호출. CloudTrail 에서 따로 켜야 기록된다.
- **팬아웃** : 한 메시지를 여러 수신자에게 복제해 나눠 주는 것. SNS → 여러 SQS 큐가 대표 패턴이다.
- **고객 관리 키** : 사용자가 만들고 키 정책·교체·삭제를 직접 통제하는 KMS 키.

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
