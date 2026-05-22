# Day 20 - Lambda + API Gateway 통합 실습

📅 날짜: 2026년 6월 11일 (목요일)  
🎯 주제: 서버리스 API 실습 및 Week 4 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda + API Gateway 통합 아키텍처를 실제로 구현한다
- API Gateway Week 4 학습 내용을 종합 복습한다
- 실전 문제로 이해도를 검증한다

---

## 📖 실습: 서버리스 TODO API 구현

### 프로젝트 구조
```
todo-api/
├── lambda/
│   ├── create_todo.py
│   ├── get_todos.py
│   ├── update_todo.py
│   └── delete_todo.py
├── template.yaml  (SAM)
└── README.md
```

### Lambda 함수 구현

```python
# lambda/create_todo.py
import json
import boto3
import uuid
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Todos')

def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        
        if not body.get('title'):
            return {
                'statusCode': 400,
                'headers': cors_headers(),
                'body': json.dumps({'error': '제목은 필수입니다'})
            }
        
        todo_id = str(uuid.uuid4())
        item = {
            'id': todo_id,
            'title': body['title'],
            'completed': False,
            'createdAt': datetime.utcnow().isoformat(),
            'userId': event['requestContext']['authorizer']['userId']
        }
        
        table.put_item(Item=item)
        
        return {
            'statusCode': 201,
            'headers': cors_headers(),
            'body': json.dumps(item)
        }
    
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': json.dumps({'error': str(e)})
        }

def cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
```

```python
# lambda/get_todos.py
import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Todos')

def lambda_handler(event, context):
    user_id = event['requestContext']['authorizer']['userId']
    
    response = table.query(
        IndexName='UserIdIndex',
        KeyConditionExpression=Key('userId').eq(user_id)
    )
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(response['Items'])
    }
```

### SAM 템플릿

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Serverless TODO API

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        TABLE_NAME: !Ref TodosTable

Resources:
  # API Gateway
  TodoApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      Cors:
        AllowOrigin: "'*'"
        AllowHeaders: "'Content-Type, Authorization'"
        AllowMethods: "'GET, POST, PUT, DELETE, OPTIONS'"
      Auth:
        DefaultAuthorizer: TodoAuthorizer
        Authorizers:
          TodoAuthorizer:
            FunctionArn: !GetAtt AuthorizerFunction.Arn

  # Lambda 함수들
  CreateTodoFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambda/
      Handler: create_todo.lambda_handler
      Events:
        CreateTodo:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos
            Method: POST
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref TodosTable

  GetTodosFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambda/
      Handler: get_todos.lambda_handler
      Events:
        GetTodos:
          Type: Api
          Properties:
            RestApiId: !Ref TodoApi
            Path: /todos
            Method: GET

  # DynamoDB
  TodosTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: Todos
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
        - AttributeName: userId
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: UserIdIndex
          KeySchema:
            - AttributeName: userId
              KeyType: HASH
          Projection:
            ProjectionType: ALL
      BillingMode: PAY_PER_REQUEST
```

---

## 아키텍처 다이어그램

```
완전한 서버리스 TODO API 아키텍처
================================

[모바일/웹 클라이언트]
        |
        | HTTPS + JWT 토큰
        v
[API Gateway - TodoApi]
  - REST API
  - Cognito 사용자 풀 권한 부여자
  - 스테이지: prod
  - 캐싱: GET /todos (TTL 60초)
        |
        +--[POST /todos]---> [CreateTodoFunction]
        |                         |
        +--[GET /todos]----> [GetTodosFunction]
        |                         |
        +--[PUT /todos/{id}] [UpdateTodoFunction]
        |                         |
        +--[DELETE /todos/{id}][DeleteTodoFunction]
                                  |
                                  v
                         [DynamoDB - Todos]
                         PK: id (UUID)
                         GSI: userId (사용자별 조회)

        Cognito 사용자 풀
        +-----------------+
        | 사용자 관리      |
        | JWT 발급        |
        | 소셜 로그인      |
        +-----------------+

배포 구조:
SAM/CloudFormation → 한 번에 모든 리소스 생성
sam build && sam deploy --guided
```

---

## 🧠 Week 4 시험 함정 & 약어

### API Gateway 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| REST API | HTTP API | 기능 완비·비쌈 vs 저렴·단순 |
| Lambda Proxy | Lambda (non-proxy) | 변환 X vs VTL 필수 |
| Edge-Optimized | Regional | CloudFront 자동 vs 직접 |
| Edge-Optimized | Private | 전 세계 vs VPC 내부 |
| API Key | 인증 | 사용량 추적 vs 신원 검증 |
| Cognito Authorizer | Lambda Authorizer | JWT 자동 vs 커스텀 로직 |
| TOKEN Authorizer | REQUEST Authorizer | Authorization 헤더만 vs 다중 입력 |
| Stage Variable | 환경 변수 (Lambda) | API GW에서 백엔드 분기 vs Lambda 내부 |
| Method Response | Integration Response | 클라이언트용 vs Lambda 결과 매핑 |
| Latency | IntegrationLatency | 전체 vs 백엔드만 |
| Caching at Stage | Caching at Method | 전역 vs 개별 |
| WebSocket | SSE | 양방향 vs 단방향 |
| Payload v1.0 | Payload v2.0 | REST 호환 vs HTTP API 신형 |

### Week 4 시험 함정 12가지

1. **변경 후 배포 안 하면 적용 X**
2. **API 키는 인증이 아님** — 사용량 플랜과 함께
3. **Edge-Optimized 인증서는 us-east-1 ACM 강제**
4. **WAF는 REST API만 직접 지원** (HTTP는 CloudFront 우회)
5. **HTTP API에 캐싱·X-Ray·요청 검증 없음**
6. **HTTP API Payload 2.0 = REST와 다른 이벤트 구조**
7. **Lambda Authorizer 결과 캐시 = 토큰 단위** (다른 사용자 영향 X)
8. **WebSocket 메시지 ↔ 회신은 post_to_connection** (응답이 아님)
9. **WebSocket idle timeout = 10분, 연결 max = 2시간**
10. **CORS는 Lambda Proxy + REST면 Lambda가 직접 헤더 추가**
11. **명시적 Deny 자동 캐시 안됨 — Lambda Authorizer Deny도 캐시됨, 주의**
12. **Cache InvalidateCache는 IAM 권한 필요** (no auth면 무력화 가능)

### Week 4 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **REST** | Representational State Transfer |
| **VTL** | Velocity Template Language |
| **JWT** | JSON Web Token |
| **OIDC** | OpenID Connect |
| **OAuth** | (인가 프로토콜) |
| **SigV4** | AWS Signature Version 4 |
| **CORS** | Cross-Origin Resource Sharing |
| **WAF** | Web Application Firewall |
| **mTLS** | Mutual TLS |
| **SSE** | Server-Sent Events |
| **RPS** | Requests Per Second |
| **WS** | WebSocket |
| **ACM** | AWS Certificate Manager |
| **NLB / ALB** | Network/Application Load Balancer |
| **VPC Link** | API GW ↔ 사설 자원 연결 |

---

## 📝 Week 4 종합 연습문제

**문제 1.** API Gateway Lambda Proxy 통합에서 Lambda 응답에 반드시 포함해야 하는 항목은?

A) headers만 필요  
B) statusCode와 body가 필수  
C) statusCode, headers, body 모두 필수  
D) body만 필수  

**정답: B** - Lambda Proxy 통합에서 Lambda 응답에는 최소 statusCode와 body가 필요합니다. headers는 선택 사항입니다.

---

**문제 2.** API Gateway에서 사용량 플랜과 함께 사용하는 식별자는?

A) IAM 역할  
B) Cognito 사용자 ID  
C) API 키  
D) 세션 쿠키  

**정답: C** - 사용량 플랜은 API 키와 함께 사용하여 클라이언트별 스로틀링 한도와 할당량을 설정합니다.

---

**문제 3.** API Gateway 스테이지에 변수를 설정하는 목적은?

A) 응답 캐싱 설정  
B) 스테이지별 다른 백엔드 엔드포인트 참조  
C) Lambda 메모리 설정  
D) CloudWatch 로그 설정  

**정답: B** - 스테이지 변수로 dev/staging/prod 환경에서 각각 다른 Lambda 별칭이나 HTTP 엔드포인트를 참조할 수 있습니다.

---

**문제 4.** Cognito 권한 부여자와 Lambda 권한 부여자의 차이점은?

A) Cognito 권한 부여자는 비용이 더 비싸다  
B) Lambda 권한 부여자는 Cognito 외부의 사용자 정의 인증을 지원한다  
C) Cognito 권한 부여자는 캐싱을 지원하지 않는다  
D) Lambda 권한 부여자는 HTTP API만 지원한다  

**정답: B** - Lambda 권한 부여자는 JWT, OAuth, 사용자 정의 인증 등 어떤 인증 시스템과도 통합 가능합니다. Cognito 권한 부여자는 Cognito 사용자 풀 토큰만 검증합니다.

---

**문제 5.** WebSocket API에서 연결된 모든 클라이언트에게 메시지를 보내려면?

A) SNS 브로드캐스트 사용  
B) 각 연결 ID에 대해 @connections API를 개별 호출  
C) API Gateway가 자동으로 브로드캐스트  
D) SQS에 메시지 저장 후 클라이언트가 폴링  

**정답: B** - 브로드캐스트를 하려면 저장된 모든 연결 ID를 조회하고, 각 연결 ID에 대해 @connections/{connectionId} API를 개별적으로 호출해야 합니다.

---

**문제 6.** API Gateway에서 응답 캐싱을 설정할 수 있는 위치는?

A) 메서드 수준만  
B) 스테이지 수준 및 메서드 수준  
C) 리소스 수준만  
D) 계정 수준만  

**정답: B** - 캐싱은 스테이지 수준에서 활성화하고, 메서드 수준에서 개별적으로 재정의할 수 있습니다.

---

**문제 7.** API Gateway의 스로틀링 한도를 초과할 때 클라이언트가 받는 HTTP 상태 코드는?

A) 400  
B) 403  
C) 429  
D) 503  

**정답: C** - 스로틀링 시 HTTP 429 (Too Many Requests) 오류가 반환됩니다.

---

## 📊 Week 4 자기 평가

| 점수 | 평가 |
|------|------|
| 6-7 | 우수 - API Gateway 완전 이해 |
| 4-5 | 양호 - 틀린 부분 재학습 |
| 2-3 | 보통 - Day 16-19 복습 |
| 0-1 | 미흡 - Week 4 처음부터 재학습 |

## 📌 오늘의 요약

1. API Gateway 핵심: 리소스, 메서드, 통합, 스테이지, 배포(변경 후 필수)
2. 인증: IAM, Lambda 권한 부여자, Cognito / API 키는 인증이 아닌 사용량 제한
3. 캐싱으로 Lambda 호출 감소, Cache-Control: max-age=0으로 무효화
4. WebSocket: $connect/$disconnect/$default, DynamoDB에 연결 ID 관리
5. HTTP API: REST API보다 70% 저렴, 단순 프록시에 적합
