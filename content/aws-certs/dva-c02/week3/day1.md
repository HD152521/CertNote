# Day 11 - AWS Lambda 개요 및 실행 모델

📅 날짜: 2026년 5월 31일 (일요일)  
🎯 주제: AWS Lambda 기초  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Lambda의 서버리스 개념과 장점을 이해한다
- Lambda 함수의 실행 모델(콜드 스타트, 웜 스타트)을 설명한다
- Lambda의 런타임, 메모리, 타임아웃 등 기본 구성을 설정할 수 있다

---

## 📖 이론 내용

### 1. AWS Lambda란?

Lambda는 서버를 프로비저닝하거나 관리하지 않고 코드를 실행할 수 있는 서버리스 컴퓨팅 서비스입니다. 코드를 업로드하면 AWS가 실행에 필요한 모든 것을 관리합니다.

**서버리스의 의미:**
- 서버가 없는 것이 아니라, **서버 관리를 할 필요가 없음**
- AWS가 서버 프로비저닝, 확장, 패치, 고가용성을 관리
- 코드 실행 시간에만 과금 (밀리초 단위)

**Lambda의 장점:**
- 인프라 관리 불필요
- 자동 확장 (동시 실행 지원)
- 이벤트 기반 실행
- 다양한 런타임 지원
- 비용 효율적 (요청 기반 과금)

### 2. Lambda 기본 개념

#### 런타임 (Runtime)
Lambda는 다음 언어를 네이티브로 지원합니다:
- **Node.js** (20.x, 18.x)
- **Python** (3.12, 3.11, 3.10)
- **Java** (21, 17, 11, 8)
- **Go** (1.x)
- **.NET** (8, 6)
- **Ruby** (3.3)
- **사용자 정의 런타임** (Lambda Runtime API, Rust 등)

#### 배포 패키지
1. **ZIP 파일**: 코드 + 의존성 압축 (최대 50MB 직접, 250MB S3 경유)
2. **컨테이너 이미지**: Docker 이미지 (최대 10GB)

#### Lambda 구성
- **메모리**: 128MB ~ 10,240MB (vCPU는 메모리에 비례)
- **타임아웃**: 최대 15분 (기본 3초)
- **임시 스토리지**: /tmp 디렉토리, 기본 512MB (최대 10GB)
- **환경 변수**: 키-값 쌍으로 구성 정보 저장

### 3. Lambda 실행 모델

#### Lambda 실행 환경 수명 주기
```
1. INIT 단계 (초기화)
   - 코드 다운로드
   - 런타임 부팅
   - 핸들러 외부 코드 실행 (글로벌 변수, DB 연결 등)

2. INVOKE 단계 (실행)
   - 핸들러 함수 실행
   - 이벤트 처리

3. SHUTDOWN 단계 (종료)
   - 함수가 일정 시간 호출 안 될 때 환경 회수
```

#### 콜드 스타트 vs 웜 스타트

**콜드 스타트 (Cold Start):**
- 새 실행 환경이 처음 시작될 때 발생
- INIT 단계 포함 (수십~수백 밀리초 추가 지연)
- 발생 시점: 처음 호출, 동시성 급증, 비활성화 후 재호출

**웜 스타트 (Warm Start):**
- 기존 실행 환경이 재사용될 때 발생
- INVOKE 단계만 실행 (콜드 스타트보다 훨씬 빠름)
- 컨테이너가 "따뜻하게" 유지됨

**⭐ 콜드 스타트 최소화 방법:**
1. **Provisioned Concurrency**: 미리 초기화된 실행 환경 유지
2. **Lambda SnapStart**: Java 함수 스냅샷 기반 빠른 초기화
3. **메모리 증가**: 더 많은 vCPU 사용으로 초기화 속도 향상
4. **코드 최적화**: 패키지 크기 줄이기, 초기화 코드 최소화

### 4. Lambda 과금 방식

- **요청 수**: 월 100만 요청 무료, 이후 요청 수당 $0.20
- **실행 시간**: GB-초 단위 (메모리 × 실행 시간)
  - 월 400,000 GB-초 무료
  - 이후 GB-초당 $0.0000166667

---

## 🧠 알아두면 좋은 심화 이론

### Lambda 한도 정리 (시험에서 숫자 그대로 출제)

| 항목 | 한도 |
|------|------|
| 메모리 | 128 MB ~ 10,240 MB (1MB 단위) |
| 타임아웃 | 1초 ~ 900초 (15분) |
| /tmp 임시 스토리지 | 512 MB ~ 10,240 MB |
| 환경 변수 총 크기 | 4 KB |
| 동기 페이로드 (요청/응답) | 6 MB |
| 비동기 페이로드 | 256 KB |
| Response Streaming | **20 MB** |
| ZIP 직접 업로드 | 50 MB |
| ZIP S3 경유 | 250 MB (압축 해제) |
| 컨테이너 이미지 | 10 GB |
| 동시성 (계정/리전) | 기본 1,000 (증가 가능) |
| 초기 버스트 한도 | 500~3,000 (리전별) |
| 분당 추가 동시성 | +500 |

### 콜드 스타트 최적화 옵션 4가지 비교

| 옵션 | 효과 | 비용 | 사용 |
|------|------|------|------|
| **Provisioned Concurrency** | 콜드 완전 제거 | 가장 비쌈 | 일관된 응답 필요 |
| **SnapStart** | 최대 10배 빠른 시작 (Java/Python/.NET) | 무료~약간 | Java/Spring 함수 |
| **메모리 증가** | CPU도 비례 ↑ → INIT 빨라짐 | 시간당 ↑ | 일반 최적화 |
| **레이어/코드 최적화** | 의존성 축소 | 무료 | 항상 적용 |

> ⚠️ **함정**: SnapStart는 **버전 발행 시점에 스냅샷 생성** → `$LATEST`에서는 동작 X. 별칭/버전 사용 강제.

### Lambda 실행 환경 - 알아두면 좋은 디테일

- **재사용 가능**: 한 번 초기화한 환경이 여러 번 호출 처리 (글로벌 변수 캐시 활용)
- **단일 요청**: 한 환경은 **한 번에 하나의 요청만** 처리 (스레드 분리 X — 동시성은 환경 수로 결정)
- **/tmp 공유**: 같은 환경 재사용 시 /tmp도 공유됨 — **민감 데이터 저장 금지**
- **약 1시간 무사용** → 환경 회수, 콜드 스타트 재발생

### Lambda Extensions

- 사이드카처럼 함수와 함께 실행되는 외부 프로세스
- 용도: 모니터링(Datadog), 시크릿 캐싱(Parameter Store/Secrets Manager Extension), 로그 수집
- **내부 확장** (런타임 내부) vs **외부 확장** (별도 프로세스)
- 시험: "시크릿을 매번 호출 안 하고 캐싱하고 싶어요" → AWS Parameters and Secrets Lambda Extension

### Lambda Response Streaming (2023~)

- HTTP 응답을 청크 단위로 스트리밍 가능 (최대 20MB)
- TTFB(첫 바이트 시간) 단축 → SSE, LLM 응답, 대용량 파일 다운로드
- Function URL 또는 `aws-lambda-streamifyResponse` 사용

### Lambda Function URL

- 별도 HTTPS 엔드포인트를 함수에 직접 부여 (API Gateway 없이)
- 인증: NONE 또는 AWS_IAM (SigV4)
- CORS 직접 설정
- 시험에 가끔: "간단한 단일 함수를 HTTPS로 노출하려면?" → Function URL

### VPC에서 Lambda 실행 (시험에 자주 출제)

- VPC에 연결하려면 서브넷 + 보안 그룹 지정
- ENI(Elastic Network Interface)를 통해 VPC 리소스(RDS 등) 접근
- **Hyperplane ENI** (2019부터): 콜드 스타트 시 ENI 생성 지연 거의 없음
- VPC 연결 시 인터넷 직접 접근 불가 → NAT GW 필요 (또는 VPC Endpoint 사용)

> ⚠️ **함정**: "Lambda가 RDS에 못 붙어요" → 1) VPC 연결 확인 2) SG 인바운드 확인 3) 서브넷이 NAT 경로 보유 확인

### Lambda 권한 모델 (2개 정책)

| 정책 | 부착 위치 | 역할 |
|------|----------|------|
| **Execution Role** | 함수 자체 | Lambda가 **다른 AWS 서비스 호출**할 권한 |
| **Resource-based Policy (Function Policy)** | 함수에 리소스 정책으로 | **누가 Lambda를 호출**할 수 있는지 (S3, SNS, API GW 등) |

```bash
# API Gateway가 Lambda 호출 권한 부여 (리소스 정책)
aws lambda add-permission \
  --function-name my-function \
  --statement-id apigateway-prod \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:region:account:api-id/*/*/*"
```

### 관련 서비스 Cross-Reference

- **이벤트 소스 매핑(SQS/Kinesis/DDB Streams)** → [Day 2]
- **Layer/버전/별칭** → [Day 3]
- **동시성·DLQ** → [Day 4]
- **API Gateway 통합** → [Week 4]
- **Lambda + Step Functions** → 15분 초과 워크플로 (Step Functions가 오케스트레이션)

---

## 아키텍처 다이어그램

```
Lambda 실행 모델
================================

이벤트 소스              Lambda 서비스
(API GW, S3, SQS...)
        |
        | 이벤트 발생
        v
[Lambda 서비스 수신]
        |
        +-- 기존 웜 환경 있음? --> YES --> [웜 스타트] --> 핸들러 실행
        |
        NO
        |
        v
[새 실행 환경 생성 - 콜드 스타트]
        |
        v
[코드 다운로드]
        |
        v
[런타임 부팅]
        |
        v
[글로벌 코드 실행]   <- DB 연결 초기화, 설정 로드
(핸들러 외부)
        |
        v
[핸들러 함수 실행]
        |
        v
[응답 반환]
        |
        v
[실행 환경 유지 (잠시)]
     (다음 호출 대기)

Lambda 실행 환경 재사용
================================

호출 1 --> [환경 초기화] --> [핸들러 실행] --> 결과 반환
                                                    |
                          환경 유지 (300ms 내 재호출)
호출 2 -->                              [핸들러 실행] --> 결과 반환
                (웜 스타트, 콜드 스타트 비용 없음)

/tmp 디렉토리도 재사용됨 (주의: 민감 데이터 주의!)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Lambda 타임아웃**: 최대 15분 (긴 처리는 Step Functions 사용 고려)
2. ⭐ **Provisioned Concurrency**: 콜드 스타트 방지, 예측 가능한 응답 시간
3. ⭐ **Lambda 메모리 = vCPU**: 메모리 늘리면 CPU도 비례 증가
4. ⭐ **/tmp**: 512MB~10GB 임시 스토리지, 실행 환경 간 공유될 수 있음
5. ⭐ **컨테이너 이미지**: 최대 10GB, ZIP보다 훨씬 큰 배포 패키지 지원

---

## 💻 실제 예시 - Lambda 함수 코드

```python
# Python Lambda 핸들러 기본 구조
import json
import boto3
import logging

# 글로벌 변수 (실행 환경 재사용 시 초기화 안 됨)
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# DB 연결은 핸들러 외부에 (웜 스타트 시 재사용)
s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Lambda 핸들러 함수
    
    Parameters:
        event: 이벤트 데이터 (dict)
        context: 실행 컨텍스트 정보
    """
    logger.info(f"이벤트 수신: {json.dumps(event)}")
    
    # 컨텍스트 정보 활용
    logger.info(f"함수 이름: {context.function_name}")
    logger.info(f"남은 시간(ms): {context.get_remaining_time_in_millis()}")
    logger.info(f"메모리 제한(MB): {context.memory_limit_in_mb}")
    
    try:
        # 비즈니스 로직
        bucket_name = event.get('bucket', 'my-bucket')
        key = event.get('key', 'test.txt')
        
        response = s3_client.get_object(Bucket=bucket_name, Key=key)
        content = response['Body'].read().decode('utf-8')
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Success',
                'content': content
            })
        }
    except Exception as e:
        logger.error(f"오류 발생: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
```

```bash
# Lambda 함수 생성
aws lambda create-function \
  --function-name my-function \
  --runtime python3.12 \
  --handler lambda_function.lambda_handler \
  --role arn:aws:iam::123456789012:role/LambdaRole \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 256 \
  --environment Variables='{BUCKET_NAME=my-bucket,ENV=production}'

# Lambda 함수 호출 (동기)
aws lambda invoke \
  --function-name my-function \
  --payload '{"bucket": "my-bucket", "key": "test.txt"}' \
  --cli-binary-format raw-in-base64-out \
  output.json

# Lambda 함수 업데이트
aws lambda update-function-code \
  --function-name my-function \
  --zip-file fileb://function.zip

# Provisioned Concurrency 설정
aws lambda put-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier prod \
  --provisioned-concurrent-executions 10
```

---

## 📝 연습 문제

**문제 1.** Lambda 함수의 최대 실행 타임아웃은?

A) 5분  
B) 15분  
C) 30분  
D) 1시간  

**정답: B**  
해설: Lambda 함수의 최대 실행 타임아웃은 15분(900초)입니다. 이보다 긴 처리가 필요한 경우 Step Functions 또는 다른 서비스를 사용해야 합니다.

---

**문제 2.** Lambda 콜드 스타트를 방지하는 가장 효과적인 방법은?

A) 더 빠른 프로그래밍 언어 사용  
B) 코드 크기 최소화  
C) Provisioned Concurrency 활성화  
D) Lambda 함수를 주기적으로 호출하는 CloudWatch 이벤트 설정  

**정답: C**  
해설: Provisioned Concurrency는 미리 초기화된 실행 환경을 유지하여 완전히 콜드 스타트를 제거합니다. 나머지 방법들은 부분적으로 도움이 되지만 완전한 해결책은 아닙니다.

---

**문제 3.** Lambda 함수에서 실행 환경 간 상태를 공유하면 어떤 문제가 발생할 수 있는가?

A) 메모리 부족  
B) 동시 실행 시 /tmp 디렉토리 데이터가 오염될 수 있다  
C) 타임아웃 발생  
D) 함수가 자동으로 종료된다  

**정답: B**  
해설: Lambda 실행 환경의 /tmp 디렉토리는 동일 실행 환경이 재사용될 때 유지됩니다. 민감한 데이터나 세션 관련 데이터를 /tmp에 저장하면 다른 요청에서 접근될 수 있습니다.

---

**문제 4.** Lambda 함수의 메모리 설정과 성능의 관계는?

A) 메모리 증가는 성능에 영향을 주지 않는다  
B) 메모리를 늘리면 vCPU도 비례하여 증가한다  
C) 메모리가 많을수록 항상 비용이 절감된다  
D) 메모리는 실행 시간과 무관하다  

**정답: B**  
해설: Lambda에서 메모리를 늘리면 할당되는 vCPU 수도 비례하여 증가합니다. 따라서 CPU 집약적 작업의 경우 메모리를 늘리면 실행 시간이 줄어 전체 비용이 낮아질 수 있습니다.

---

**문제 5.** Lambda 컨테이너 이미지 배포의 최대 크기는?

A) 250MB  
B) 1GB  
C) 5GB  
D) 10GB  

**정답: D**  
해설: Lambda 컨테이너 이미지 배포의 최대 크기는 10GB입니다. ZIP 파일 배포의 경우 S3 경유 시 250MB까지 지원됩니다.

---

## 📌 오늘의 요약

1. Lambda는 서버 관리 없이 이벤트에 반응하여 코드를 실행하는 서버리스 서비스다
2. 콜드 스타트는 새 실행 환경 초기화 시 발생하며 Provisioned Concurrency로 방지 가능하다
3. Lambda 메모리(128MB~10GB)와 vCPU는 비례하며, 최대 타임아웃은 15분이다
4. 글로벌 변수(DB 연결 등)는 핸들러 외부에 두어 웜 스타트 시 재사용한다
5. 과금은 요청 수 + 실행 시간(GB-초)으로, 월 100만 요청 + 400,000 GB-초 무료
