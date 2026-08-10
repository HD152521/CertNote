# Day 4 - 최종 복습 4: 메시징, 컨테이너, 아키텍처 패턴

📅 날짜: 2026년 8월 12일 (수요일)  
🎯 주제: 메시징/컨테이너 최종 복습 + 아키텍처 패턴  
⏱️ 학습 시간: 약 120분

---

## 🎯 학습 목표

- 메시징, 컨테이너, 아키텍처 패턴의 핵심을 최종 정리한다
- 시나리오 기반 아키텍처 선택 문제를 풀어본다

---

## 📖 최종 핵심 정리

### 메시징 서비스 선택 가이드
```
SQS 표준: 높은 처리량, 순서/중복 미보장
SQS FIFO: 순서 보장, 중복 제거, 초당 300개
SNS: Push, 여러 구독자 동시, 팬아웃 패턴
Kinesis Streams: 실시간 스트리밍, 여러 Consumer, 24시간 보존
Kinesis Firehose: ETL, S3/Redshift/OpenSearch, 1분 지연
Step Functions: 워크플로우 오케스트레이션, 재시도/병렬
AppSync: GraphQL, 실시간 구독, 오프라인 지원
```

### 핵심 숫자
```
SQS: 256KB, 14일, FIFO 300/s, VisibilityTimeout 30초
Kinesis: 샤드 1MB/s 쓰기, 2MB/s 읽기, 24시간 기본 보존
SNS: 여러 구독 대상, Push 방식
```

### 컨테이너/IaC 핵심 암기
```
ECS Fargate: 서버리스, awsvpc 모드
executionRole: ECR pull, CloudWatch Logs
taskRole: 컨테이너에서 AWS 서비스 접근
ECR: 취약점 스캔, 수명 주기 정책
CloudFormation: Change Set(검토), !ImportValue(교차 스택)
SAM: Transform 필수, sam local(Docker 필요)
CDK: 프로그래밍 언어 → CloudFormation 변환
```

---

## 아키텍처 패턴 총정리

```
패턴 1: 서버리스 REST API
================================
[클라이언트] → [API Gateway] → [Lambda] → [DynamoDB]
                                        ↘ [ElastiCache]
인증: Cognito Authorizer

패턴 2: 이벤트 기반 비동기 처리
================================
[서비스A] → [SQS] → [Lambda B]
                  ↘ (실패 시) [DLQ]

패턴 3: 팬아웃
================================
[S3 업로드] → [SNS] → [SQS1] → [Lambda: 리사이즈]
                    → [SQS2] → [Lambda: 분석]
                    → [Lambda: 알림]

패턴 4: 스트리밍 파이프라인
================================
[데이터 소스] → [Kinesis Streams] → [Lambda: 실시간]
                                  → [Firehose] → [S3]

패턴 5: 완전 CI/CD
================================
[Git Push] → [CodePipeline]
  → [CodeBuild: 테스트/빌드]
  → [Manual Approval]
  → [CodeDeploy: 배포]
     (Canary for Lambda, Blue/Green for EC2)
```

---

## 🧠 시나리오 → 정답 매핑 (시험 핵심 패턴)

### 메시징 시나리오 → 서비스

| 시나리오 | 답 |
|----------|-----|
| "비동기 작업 큐, 디커플링" | **SQS Standard** |
| "정확히 1회, 순서" | **SQS FIFO** |
| "여러 시스템에 동시 알림" | **SNS** |
| "S3 → 여러 Lambda" | **SNS 팬아웃** 또는 **EventBridge** |
| "실시간 클릭스트림 수집" | **Kinesis Data Streams** |
| "스트림 → S3 자동" | **Kinesis Firehose** |
| "Kafka 호환" | **MSK** |
| "복잡한 다단계 워크플로" | **Step Functions Standard** |
| "5분 이내 빠른 워크플로" | **Step Functions Express** |
| "GraphQL + 실시간 구독" | **AppSync** |
| "1년 워크플로" | **Step Functions Standard** |
| "외부 시스템 응답 대기" | **.waitForTaskToken** |
| "Kinesis 데이터 365일 보관" | Retention 설정 또는 Firehose → S3 |
| "Lambda 멱등 처리" | DDB idempotency 또는 SQS FIFO dedup |

### 컨테이너·IaC 시나리오

| 시나리오 | 답 |
|----------|-----|
| "EC2 없이 컨테이너" | **Fargate** |
| "비용 절감 컨테이너" | **Fargate Spot** |
| "쿠버네티스 표준" | **EKS** |
| "온프레미스 ECS" | **ECS Anywhere** |
| "ECS → S3 권한" | **taskRole** |
| "ECR pull 권한" | **executionRole** |
| "CFN 안전 업데이트" | **Change Set** |
| "CFN 리소스 보호" | **DeletionPolicy: Retain** |
| "다중 계정 IaC 배포" | **Stack Set** |
| "재사용 가능한 CFN" | **Nested Stack** |
| "서버리스 SAM 로컬" | `sam local invoke` + Docker |
| "프로그래밍 언어 IaC" | **CDK** |
| "Lambda Canary 배포" | **CodeDeploy + SAM/CodePipeline** |

### 데이터·DB 시나리오

| 시나리오 | 답 |
|----------|-----|
| "관계형 + 자동 회전 비밀번호" | RDS + Secrets Manager |
| "NoSQL + 마이크로초 캐시" | DynamoDB + **DAX** |
| "여러 EC2 파일 공유" | **EFS** |
| "고성능 임시 디스크" | 인스턴스 스토어 |
| "글로벌 활성-활성 DB" | **Aurora Global** 또는 **DDB Global Tables** |
| "S3 PII 자동 탐지" | **Macie** |
| "EBS 1억 객체 일괄" | S3 Batch Operations |
| "오래된 S3 객체 정리" | Lifecycle Policy |
| "CRR + KMS" | **Multi-Region Key** |
| "원본은 한 번, 다양한 뷰" | **S3 Object Lambda** |
| "여러 팀에 다른 권한" | **S3 Access Points** |

### 보안 시나리오

| 시나리오 | 답 |
|----------|-----|
| "DB 비밀번호 자동 회전" | **Secrets Manager** |
| "100KB 데이터 KMS 암호화" | **Envelope Encryption** |
| "JWT 자동 검증 (REST API)" | **Cognito Authorizer** |
| "JWT 자동 검증 (HTTP API)" | **JWT Authorizer** |
| "외부 JWT (Auth0/Okta)" | **Lambda Authorizer** 또는 JWT Authorizer (HTTP API) |
| "SQL 인젝션 방어" | **WAF** |
| "DDoS 비용 보호" | **Shield Advanced** |
| "S3 HTTPS 강제" | `aws:SecureTransport=false` Deny |
| "EC2 직접 SSL 인증서" | ACM 불가 — 외부 인증서 |
| "다중 계정 가드레일" | **SCP (Organizations)** |
| "사용자에게 위임 가능 최대 권한" | **Permissions Boundary** |
| "Confused Deputy 방지" | **ExternalId** |

### 모니터링·디버깅 시나리오

| 시나리오 | 답 |
|----------|-----|
| "어떤 서비스가 느린지" | **X-Ray** |
| "쿼리 느림 분석" | **Performance Insights** (RDS) |
| "EC2 메모리 모니터링" | **CloudWatch Agent** |
| "root 로그인 즉시 감지" | CloudTrail → EventBridge → SNS |
| "API 가용성 24/7 모니터" | **Synthetics** |
| "로그 패턴 → 알람" | **Metric Filter** |
| "ML 기반 비정상 감지" | **Anomaly Detection** |
| "여러 계정 통합 대시보드" | **Cross-Account Dashboard** |
| "API GW Latency vs IntegrationLatency 차이 크면?" | API GW 자체 지연 |

### 비용 최적화 시나리오

| 시나리오 | 답 |
|----------|-----|
| "예측 가능한 EC2" | **Reserved** 또는 **Savings Plan** |
| "내결함성 + 90% 절감" | **Spot** |
| "ARM 호환 + 40% 절감" | **Graviton** |
| "SSE-KMS 비용 ↑" | **S3 Bucket Key** |
| "DDB throttle + 비용 절감" | **DAX** + 적절한 RCU |
| "Lambda 콜드 스타트 무료" | **SnapStart** (Java/Python/.NET) |
| "API GW 비용 절감" | **HTTP API** |
| "S3 아주 가끔 접근" | **Glacier Deep Archive** |
| "EBS 사용량 적은데 데이터 보존" | **gp3** (gp2보다 20% ↓) |

---

## 📬 메시징 4종을 가르는 단 하나의 축: 메시지는 소비되면 사라지는가

SQS·SNS·Kinesis·EventBridge를 서비스 설명으로 외우면 시나리오에서 계속 흔들린다. 네 서비스를 한 번에 가르는 축은 **"소비 후 메시지가 사라지는가, 남는가"** 다.

```
[소비하면 사라진다 — 작업 큐 모델]
  SQS  ─ 워커가 받고 처리한 뒤 DeleteMessage → 그 메시지는 끝
         · 여러 워커가 나눠 갖는다(부하 분산)
         · 같은 메시지를 두 시스템이 각자 처리할 수는 없다

[구독자마다 사본이 간다 — 발행/구독 모델]
  SNS  ─ 한 번 발행 → 모든 구독자에게 push (팬아웃)
         · 구독자가 그 순간 없으면 그 사본은 사라진다(재생 불가)
         · 그래서 SNS → SQS로 받아 두는 조합이 표준

[남아 있고 몇 번이든 다시 읽는다 — 로그/스트림 모델]
  Kinesis ─ 레코드가 보존 기간(24h~365d) 동안 스트림에 남는다
         · 여러 Consumer가 각자의 위치(체크포인트)로 독립 소비
         · 같은 데이터를 실시간 처리 + 배치 재처리 둘 다 가능

[규칙으로 라우팅한다 — 이벤트 버스 모델]
  EventBridge ─ 이벤트 내용을 규칙으로 매칭해 여러 대상에 전달
         · AWS 서비스 이벤트·SaaS·커스텀을 한 버스에서
         · 스키마 레지스트리·아카이브·재생(replay) 지원
```

이 축 하나로 대부분의 시나리오가 갈린다. "**여러 팀이 같은 데이터를 각자 처리하고, 나중에 다시 돌려 볼 수도 있어야 한다**"면 Kinesis다(SQS는 소비하면 사라지므로 오답). "**한 이벤트로 3개 시스템을 동시에 깨워야 한다**"면 SNS 팬아웃 또는 EventBridge다. "**작업을 뒤로 미루고 워커가 천천히 처리한다**"면 SQS다.

| 항목 | SQS Standard | SQS FIFO | SNS | Kinesis Data Streams |
|------|-------------|----------|-----|---------------------|
| 모델 | 작업 큐 | 순서 있는 작업 큐 | 발행/구독 | 스트림(로그) |
| 순서 | 보장 없음 | **메시지 그룹 단위 보장** | 보장 없음 | **파티션 키 단위 보장** |
| 중복 | 최소 1회(중복 가능) | 5분 창 내 중복 제거 | 최소 1회 | 재처리 시 중복 가능 |
| 처리량 | 사실상 무제한 | 배치 없이 300/s, 10개 배치 시 3,000/s | 매우 높음 | **샤드당 1MB/s·1,000 레코드/s** |
| 보존 | 기본 4일, 최대 **14일** | 동일 | 없음(즉시 전달) | 24시간 ~ **365일** |
| 재처리 | 불가(삭제되면 끝) | 불가 | 불가 | **가능**(반복 읽기) |
| 소비자 | 나눠 갖는다 | 나눠 갖는다 | 각자 사본 | 각자 독립 위치 |

> 💡 **관련 이론**: 이 분류는 메시징 미들웨어의 고전적 구분인 **큐(queue)와 로그(log)** 그대로다. 큐는 "작업을 나눠 주는 장치"라 소비가 곧 삭제이고, 로그는 "일어난 일을 순서대로 적어 둔 장부"라 읽어도 지워지지 않고 독자마다 읽은 위치만 다르다. Kafka가 로그 모델로 세상을 바꾼 이유가 바로 이 재생 가능성이다 — 소비자를 새로 붙여 과거부터 다시 읽는 일이 자연스러워진다. AWS에서는 Kinesis가 그 자리이고, Kafka 자체가 필요하면 MSK가 답이 된다. "재처리·다중 소비자"라는 단어가 문제에 등장하는 순간 큐 계열은 후보에서 빠진다.

### SQS를 코드로: 부분 배치 실패라는 함정

Lambda가 SQS를 소비할 때 가장 흔한 사고는 **배치 10건 중 1건만 실패했는데 10건 전부가 다시 돌아오는** 것이다. 성공한 9건이 반복 처리되어 중복이 생긴다.

```python
def handler(event, context):
    """SQS 이벤트 소스 매핑 + ReportBatchItemFailures 설정 시 핸들러."""
    failures = []

    for record in event["Records"]:
        try:
            process(json.loads(record["body"]))
        except Exception as e:
            print(f"failed messageId={record['messageId']}: {e}")
            failures.append({"itemIdentifier": record["messageId"]})  # 이것만 되돌린다

    # 실패한 메시지 ID만 반환하면 나머지는 큐에서 삭제된다
    return {"batchItemFailures": failures}
```

```bash
# 이벤트 소스 매핑에 부분 배치 실패 보고를 켠다
aws lambda update-event-source-mapping \
  --uuid 12345678-90ab-cdef-1234-567890abcdef \
  --function-response-types ReportBatchItemFailures

# DLQ 연결: 3번 실패하면 별도 큐로 격리
aws sqs set-queue-attributes --queue-url "$MAIN_QUEUE_URL" \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:ap-northeast-2:123456789012:orders-dlq\",\"maxReceiveCount\":\"3\"}",
    "VisibilityTimeout": "180",
    "ReceiveMessageWaitTimeSeconds": "20"
  }'
```

> ⚠️ **함정**: **가시성 타임아웃(Visibility Timeout)이 Lambda 타임아웃보다 짧으면** 아직 처리 중인 메시지가 큐에 다시 나타나 두 번째 워커가 같은 작업을 시작한다. 결제가 두 번 되는 종류의 사고가 여기서 나온다. AWS 권장은 **큐의 가시성 타임아웃을 함수 타임아웃의 6배 이상**으로 두는 것이다. 그리고 `ReceiveMessageWaitTimeSeconds`를 20으로 두는 **롱 폴링**은 빈 응답에 대한 요청 비용을 줄이는 기본 설정인데, 기본값이 0(숏 폴링)이라 명시적으로 켜지 않으면 그냥 돈이 새어 나간다.

### SNS 필터 정책 — 팬아웃을 낭비 없이

팬아웃에서 모든 구독자가 모든 메시지를 받을 필요는 없다. 구독마다 **필터 정책**을 걸면 SNS 쪽에서 걸러 준다 — 필요 없는 Lambda 호출과 SQS 저장을 아예 만들지 않으므로 비용과 부하가 함께 줄어든다.

```json
// 구독 필터 정책: 한국 지역의 고액 주문만 이 구독으로
{
  "eventType": ["order.created"],
  "region": ["KR"],
  "amount": [{ "numeric": [">=", 1000000] }]
}
```

```
[주문 서비스] ──publish──▶ ( SNS 토픽: order-events )
                                │
        ┌───────────────────────┼───────────────────────┐
        │ filter: amount>=100만  │ filter: eventType=*    │ filter: region=KR
        ▼                       ▼                        ▼
   [SQS: 심사 큐]          [SQS: 분석 큐]           [Lambda: 알림]
        │                       │
   [Lambda: 수동심사]      [Firehose → S3]
        │
   [SQS DLQ] ← 3회 실패 시 격리
```

SNS와 Lambda를 직접 연결하지 않고 **중간에 SQS를 두는** 이 모양이 실무의 기본형이다. 이유는 셋이다 — (1) 소비자가 잠시 죽어도 메시지가 큐에 쌓여 유실되지 않고, (2) 소비 속도를 소비자가 정할 수 있어 하류 시스템이 압도되지 않으며(백프레셔), (3) DLQ로 실패를 격리할 자리가 생긴다.

---

## 🔁 Step Functions: 재시도와 보상까지 선언으로

여러 단계를 잇는 작업에서 "Lambda가 Lambda를 직접 호출하는" 구조는 시험에서 언제나 오답이다. 오류 처리·재시도·타임아웃·상태 추적을 전부 손으로 만들어야 하고, 동기 호출 사슬은 앞단 타임아웃에 묶이기 때문이다. 정답은 오케스트레이션을 선언으로 옮기는 것이다.

```json
{
  "Comment": "주문 처리 워크플로",
  "StartAt": "ChargePayment",
  "States": {
    "ChargePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-2:123456789012:function:charge",
      "TimeoutSeconds": 30,
      "Retry": [
        {
          "ErrorEquals": ["States.Timeout", "Lambda.ServiceException", "Lambda.TooManyRequestsException"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3,
          "BackoffRate": 2.0
        }
      ],
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "Next": "RefundAndFail" }
      ],
      "Next": "FanOutTasks"
    },
    "FanOutTasks": {
      "Type": "Parallel",
      "Branches": [
        { "StartAt": "SendEmail",     "States": { "SendEmail":     { "Type": "Task", "Resource": "arn:aws:states:::sns:publish", "Parameters": { "TopicArn": "arn:aws:sns:ap-northeast-2:123456789012:mail", "Message.$": "$.orderId" }, "End": true } } },
        { "StartAt": "UpdateStock",   "States": { "UpdateStock":   { "Type": "Task", "Resource": "arn:aws:lambda:ap-northeast-2:123456789012:function:stock", "End": true } } }
      ],
      "Next": "Done"
    },
    "RefundAndFail": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-2:123456789012:function:refund",
      "Next": "Failed"
    },
    "Failed": { "Type": "Fail", "Error": "OrderFailed" },
    "Done":   { "Type": "Succeed" }
  }
}
```

`Retry`의 `IntervalSeconds`·`BackoffRate`는 **지수 백오프**를 선언으로 표현한 것이고, `Catch`는 실패를 보상 단계(`RefundAndFail`)로 흘려보내는 **사가(Saga) 패턴**의 뼈대다. 코드로 짰다면 수십 줄이 필요한 이 로직이 상태 정의 안에 들어간다는 점이 Step Functions의 존재 이유다.

| 구분 | Standard | Express |
|------|----------|---------|
| 최대 실행 시간 | **최대 1년** | **최대 5분** |
| 실행 의미론 | 정확히 한 번 실행 | 최소 한 번(중복 가능) |
| 이력 | 실행 이력이 서비스에 기록 | CloudWatch Logs로 기록 |
| 과금 | 상태 전이 횟수 | 실행 횟수·시간·메모리 |
| 어울리는 곳 | 사람 승인·장기 작업·감사 필요 | 고빈도 짧은 이벤트 처리 |

| 상태 유형 | 역할 |
|----------|------|
| `Task` | 실제 작업(Lambda·SDK 통합·서비스 호출) |
| `Choice` | 조건 분기 |
| `Parallel` | 고정된 여러 갈래 동시 실행 |
| `Map` | **배열 각 원소에 같은 처리 반복**(동적 개수) |
| `Wait` | 지정 시간·시각까지 대기 |
| `Succeed` / `Fail` | 종료 |

> 🔍 **더 깊이**: 외부 시스템의 응답을 며칠씩 기다려야 하는 워크플로에서는 `.waitForTaskToken` 통합이 답이다. 상태가 **토큰을 발급하고 그대로 멈춰** 있다가, 외부 시스템이 `SendTaskSuccess`/`SendTaskFailure`로 그 토큰을 돌려주면 다시 흐른다. 폴링 루프도, 대기용 Lambda도 필요 없고 대기 중에는 상태 전이가 없으니 과금도 거의 없다. "관리자 승인을 3일 기다린다", "결제사 웹훅을 기다린다" 같은 문장이 나오면 이 패턴을 떠올린다. 대기 자체를 컴퓨팅으로 구현하지 않는다는 발상이 서버리스 설계의 핵심 습관이다.

---

## 📦 컨테이너와 IaC: 권한 시점과 선언의 안전장치

ECS에서 두 역할을 가르는 기준은 **시점**이다.

```
     [ 태스크 시작 ]                      [ 태스크 실행 중 ]
          │                                     │
   executionRole 사용                     taskRole 사용
   · ECR에서 이미지 pull                   · DynamoDB 읽기/쓰기
   · CloudWatch Logs 스트림 생성           · S3 업로드
   · Secrets Manager에서 값 주입           · SQS 폴링
          │                                     │
   실패하면 → "태스크가 시작조차 안 됨"    실패하면 → "앱 로그에 AccessDenied"
```

증상으로 역추적하면 헷갈릴 일이 없다. **컨테이너가 뜨지 못하면 executionRole, 떠서 돌다가 거부당하면 taskRole.**

```json
// 태스크 정의 발췌 — 두 역할이 나란히 들어간다
{
  "family": "orders-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512", "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ordersAppRole",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:1.4.2",
      "portMappings": [{ "containerPort": 8080 }],
      "secrets": [
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:prod/orders/db" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/ecs/orders", "awslogs-region": "ap-northeast-2", "awslogs-stream-prefix": "api" }
      }
    }
  ]
}
```

IaC 쪽에서 시험이 반복해 묻는 것은 **"실수해도 되돌릴 수 있게 만드는 장치"** 들이다.

```yaml
# SAM 템플릿 — Transform이 없으면 그냥 CloudFormation으로 해석되어 실패한다
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  OrdersTable:
    Type: AWS::DynamoDB::Table
    DeletionPolicy: Retain          # 스택을 지워도 테이블은 남긴다
    UpdateReplacePolicy: Retain
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions: [{ AttributeName: PK, AttributeType: S }]
      KeySchema: [{ AttributeName: PK, KeyType: HASH }]

  OrdersApi:
    Type: AWS::Serverless::Function
    DependsOn: OrdersTable           # 생성 순서를 명시적으로 강제
    Properties:
      Runtime: python3.12
      Handler: app.handler
      AutoPublishAlias: prod         # 배포마다 새 버전 + 별칭 이동
      DeploymentPreference:
        Type: Canary10Percent5Minutes   # 10%로 5분 지켜본 뒤 전환
        Alarms: [!Ref ErrorAlarm]       # 알람이 울리면 자동 롤백
      Environment:
        Variables:
          TABLE_NAME: !Ref OrdersTable
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref OrdersTable }

Outputs:
  TableName:
    Value: !Ref OrdersTable
    Export:
      Name: orders-table-name       # 다른 스택에서 !ImportValue로 참조
```

| 안전장치 | 막아 주는 사고 |
|---------|--------------|
| **Change Set** | 업데이트가 무엇을 바꾸는지 모른 채 실행 (특히 리소스 교체) |
| **DeletionPolicy: Retain / Snapshot** | 스택 삭제가 프로덕션 DB까지 지움 |
| **UpdateReplacePolicy** | 속성 변경이 리소스를 새로 만들며 데이터 소실 |
| **Stack Policy** | 특정 리소스가 업데이트로 건드려짐 |
| **종료 방지(Termination Protection)** | 스택 자체의 실수 삭제 |
| **DependsOn** | 참조 관계가 없는 리소스의 생성 순서 뒤엉킴 |
| **Nested Stack / Stack Set** | 템플릿 중복, 다계정·다리전 수동 배포 |

> ⚠️ **함정**: `DeletionPolicy: Retain`과 `Snapshot`을 같은 것으로 보면 안 된다. **Retain은 리소스를 그대로 남기고**(이후 요금도 계속 발생), **Snapshot은 스냅샷을 뜬 뒤 원본을 지운다**(RDS·EBS처럼 스냅샷을 지원하는 리소스에서만). 또 하나 자주 틀리는 것이 `!Ref`의 반환값이 리소스마다 다르다는 점이다 — DynamoDB 테이블의 `!Ref`는 테이블 이름을, S3 버킷은 버킷 이름을, EC2 인스턴스는 인스턴스 ID를 돌려준다. ARN이 필요하면 `!GetAtt`을 써야 하며, 이 혼동이 "권한 정책이 이상하게 안 먹는" 사고의 흔한 원인이다.

> 📚 **사례**: 컨테이너 배포에서 이미지 태그를 `latest`로 고정해 두는 습관이 실무 사고를 반복해서 만든다. 태스크 정의가 `:latest`를 가리키면 "지금 무엇이 돌고 있는지"를 아무도 확정할 수 없고, 스케일 아웃으로 새로 뜬 태스크만 새 이미지를 받아 **같은 서비스 안에 두 버전이 섞이는** 상황이 벌어진다. 처방은 (1) 커밋 해시나 시맨틱 버전으로 태그를 고정하고, (2) ECR의 **태그 불변성(immutable tag)** 을 켜 같은 태그의 덮어쓰기를 막는 것이다. 배포의 추적 가능성은 롤백 가능성과 같은 말이고, 롤백할 수 없는 배포는 사실상 되돌릴 수 없는 실험이다.

---

## 정리하며

오늘의 세 주제는 "**컴포넌트를 어떻게 느슨하게 이어 붙일 것인가**"라는 한 질문의 서로 다른 대답이다. 메시징은 시간축에서 떼어 놓고(비동기·버퍼링), Step Functions는 흐름의 제어를 코드 밖으로 꺼내며(선언적 오케스트레이션), 컨테이너와 IaC는 실행 환경과 인프라 자체를 버전이 매겨진 산출물로 바꾼다. 그래서 이 영역의 정답 보기에는 일관된 방향이 있다 — **직접 호출보다 중개자, 손으로 만든 재시도보다 선언된 재시도, 소비하면 사라지는 큐와 다시 읽을 수 있는 스트림의 구분, 그리고 언제든 되돌릴 수 있는 배포.** 시나리오에서 "여러 소비자", "재처리", "순서", "장기 대기", "자동 롤백" 같은 단어를 먼저 찾아 표시하면, 선택지는 대개 하나로 좁혀진다.

---

## 📝 최종 모의고사 - Part 4

**문제 1.** 수백만 사용자의 클릭 이벤트를 실시간으로 수집하고 여러 시스템에서 분석해야 할 때?

A) SQS  
B) SNS  
C) Kinesis Data Streams  
D) EventBridge  

**정답: C** - Kinesis Data Streams는 대용량 실시간 스트리밍을 지원하고 여러 Consumer가 동시에 동일 스트림을 읽을 수 있습니다.

---

**문제 2.** 마이크로서비스 A가 B의 응답을 기다리지 않고 비동기로 작업을 처리하려면?

A) Lambda A에서 Lambda B를 동기 호출  
B) Lambda A → SQS → Lambda B  
C) API Gateway 직접 연결  
D) DynamoDB를 통한 데이터 공유  

**정답: B** - SQS를 통한 비동기 통신은 두 서비스를 느슨하게 결합하고 Lambda A가 응답을 기다리지 않아도 됩니다.

---

**문제 3.** ECS 태스크가 실행 중 Secrets Manager에서 비밀번호를 가져오려면?

A) executionRoleArn에 권한 추가  
B) taskRoleArn에 권한 추가  
C) 환경 변수에 하드코딩  
D) CloudFormation 파라미터로 주입  

**정답: B** - taskRole은 컨테이너 내 애플리케이션 코드가 AWS 서비스에 접근하는 데 사용합니다.

---

**문제 4.** 결제 처리 → 이메일 발송 → 재고 업데이트 순서로 실행하되 각 단계 실패 시 재시도해야 할 때?

A) SQS 체인  
B) Lambda 체인 (Lambda에서 Lambda 직접 호출)  
C) Step Functions  
D) Kinesis  

**정답: C** - Step Functions는 순차 실행, 오류 처리, 자동 재시도를 시각적으로 관리할 수 있습니다.

---

**문제 5.** CloudFormation에서 VPC를 별도 스택으로 관리하고 다른 스택에서 참조하려면?

A) VPC ID를 수동으로 파라미터로 전달  
B) Outputs에서 Export 후 !ImportValue로 참조  
C) 동일 스택에 모두 포함  
D) 크로스 스택 참조 불가  

**정답: B** - Outputs 섹션에서 Export 이름을 지정하고 다른 스택에서 !ImportValue로 참조합니다.

---

**문제 6.** S3 업로드 이벤트로 이미지 리사이즈, 메타데이터 분석, 관리자 알림을 동시에 처리하려면?

A) S3 이벤트를 각 Lambda에 직접 설정  
B) S3 → SNS → 여러 SQS → 각 Lambda  
C) S3 → Kinesis → Lambda  
D) S3 → EventBridge → Lambda 3개  

**정답: B 또는 D** - 팬아웃 패턴입니다. SNS를 중간에 두고 각 SQS로 분기하거나(B), EventBridge로 여러 Lambda를 동시에 트리거합니다(D).

---

**문제 7.** Beanstalk에서 중단 없이 새 버전을 배포하는 가장 안전한 전략은?

A) All at once  
B) Rolling  
C) Immutable  
D) Blue/Green  

**정답: C** - Immutable 배포는 새 ASG에 새 버전을 배포하고 검증 후 교체하므로 가장 안전합니다.

---

**문제 8.** CDK 앱을 배포할 때 실제로 생성되는 것은?

A) Terraform 플랜  
B) CloudFormation 스택  
C) ECS 태스크  
D) Lambda 레이어  

**정답: B** - CDK는 cdk deploy 시 코드를 CloudFormation 템플릿으로 변환하고 CloudFormation 스택을 생성합니다.

---

## 📌 오늘의 요약

1. SQS(큐/비동기) vs SNS(팬아웃/Push) vs Kinesis(스트리밍/다중Consumer)
2. Step Functions: 복잡한 워크플로우, 재시도, 병렬, 오류 처리
3. ECS: taskRole(앱 권한), executionRole(인프라 권한)
4. CDK: 프로그래밍 언어 → CloudFormation, cdk synth/deploy
5. 핵심 패턴: 팬아웃(SNS→SQS), 비동기(SQS), 워크플로우(Step Functions)
