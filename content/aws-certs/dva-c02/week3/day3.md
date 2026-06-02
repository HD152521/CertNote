# Day 13 - Lambda: 환경 변수, 레이어, 버전/별칭

📅 날짜: 2026년 6월 2일 (화요일)  
🎯 주제: Lambda 고급 설정  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda 환경 변수를 안전하게 관리하는 방법을 이해한다
- Lambda 레이어(Layer)로 코드와 라이브러리를 분리한다
- 버전(Version)과 별칭(Alias)으로 배포를 관리한다

---

## 📖 이론 내용

### 1. Lambda 환경 변수

환경 변수는 코드 외부에서 구성 값을 관리하는 방법입니다.

**특징:**
- 최대 4KB 크기
- KMS로 암호화 가능
- 런타임에 `os.environ` 또는 `process.env`로 접근
- 암호화되지 않으면 콘솔에서 평문으로 노출됨

**환경 변수 암호화:**
1. **전송 중 암호화**: AWS가 자동으로 TLS 적용
2. **저장 시 암호화**: 
   - AWS 관리형 KMS 키 (기본값)
   - 고객 관리형 KMS 키 (별도 설정)
   - **⭐ 민감한 값은 Secrets Manager나 SSM Parameter Store 사용 권장**

```python
import os

def lambda_handler(event, context):
    # 환경 변수 접근
    db_host = os.environ['DB_HOST']
    db_name = os.environ['DB_NAME']
    api_key = os.environ.get('API_KEY', 'default-value')
    
    # KMS로 암호화된 환경 변수 복호화
    # (AWS_LAMBDA_FUNCTION_NAME으로 자동 접근 가능한 예약 변수 예시)
    function_name = os.environ['AWS_LAMBDA_FUNCTION_NAME']
    region = os.environ['AWS_REGION']
    
    return {'db_host': db_host}
```

**Lambda 예약 환경 변수 (사용자 수정 불가):**
- `AWS_REGION`: 함수가 실행되는 리전
- `AWS_LAMBDA_FUNCTION_NAME`: 함수 이름
- `AWS_LAMBDA_FUNCTION_MEMORY_SIZE`: 할당된 메모리
- `AWS_LAMBDA_FUNCTION_VERSION`: 현재 버전

### 2. Lambda 레이어 (Layer)

레이어는 여러 Lambda 함수 간에 공유 코드나 라이브러리를 재사용하는 방법입니다.

**레이어 특징:**
- 최대 5개 레이어 연결 가능
- 레이어 + 함수 코드 합계: 250MB (압축 해제 기준)
- 레이어는 `/opt` 디렉토리에 추출됨
- 다른 계정과 공유 가능 (퍼블릭 또는 특정 계정)

**레이어 사용 사례:**
- 공통 비즈니스 로직 라이브러리
- AWS SDK 사용자 지정 버전
- ML 모델 파일
- 외부 패키지 (pandas, numpy 등)

**레이어 경로 구조 (Python):**
```
/opt/python/   → Python 라이브러리
/opt/lib/      → 공유 라이브러리 (.so)
/opt/bin/      → 실행 파일
```

### 3. Lambda 버전 (Version)

버전은 함수 코드와 구성의 불변(immutable) 스냅샷입니다.

**버전 특징:**
- 버전 번호: 1, 2, 3, ... (단조 증가)
- `$LATEST`: 항상 최신 배포판 (수정 가능)
- 버전 발행 후에는 코드/구성 수정 불가 (불변)
- 각 버전은 고유한 ARN을 가짐

```
함수 ARN: arn:aws:lambda:region:123:function:my-func
버전 ARN: arn:aws:lambda:region:123:function:my-func:1
최신 ARN: arn:aws:lambda:region:123:function:my-func:$LATEST
```

### 4. Lambda 별칭 (Alias)

별칭은 특정 버전(들)을 가리키는 포인터입니다.

**별칭 특징:**
- 변경 가능 (어떤 버전을 가리킬지 변경 가능)
- 가중치 기반 트래픽 분할 가능 (Blue/Green 배포)
- 별칭은 다른 별칭을 가리킬 수 없음

**⭐ 별칭을 이용한 카나리 배포:**
```
별칭 "prod" → 버전 1: 90%
              버전 2: 10%  (카나리 테스트)

문제 없으면:
별칭 "prod" → 버전 2: 100%
```

---

## 🧠 알아두면 좋은 심화 이론

### 환경 변수 vs Parameter Store vs Secrets Manager (가장 자주 출제)

| 항목 | 환경 변수 | Parameter Store | Secrets Manager |
|------|----------|-----------------|-----------------|
| 비용 | 무료 | 기본 무료 (Advanced는 유료) | 시크릿당 $0.40/월 |
| 자동 로테이션 | ❌ | ❌ | ✅ |
| 버전 관리 | ❌ | ✅ | ✅ |
| 크기 한도 | 4KB 전체 | Standard 4KB / Advanced 8KB | 64KB |
| 캐싱 | 자동 (글로벌 변수) | Lambda Extension 필요 | Lambda Extension 필요 |
| 사용 | 비밀이 아닌 설정 | 설정 + 가벼운 비밀 | DB 자격 증명·API 키 |

> 💡 시험 시나리오:
> - "DB 비밀번호 자동 교체" → **Secrets Manager**
> - "함수에 환경 분기 (dev/prod)" → **환경 변수** + 별칭
> - "여러 함수가 같은 설정 공유 + 비용 최소화" → **Parameter Store**

### AWS Parameters and Secrets Lambda Extension (시험 가끔)

```
첫 호출 → Extension이 Secrets Manager에서 가져옴 → /opt 캐시
이후 호출 → 캐시에서 즉시 반환 (API 호출 없음)
TTL 만료 시 자동 갱신
```

`http://localhost:2773/secretsmanager/get?secretId=xxx` 로 호출 → 호출량 감소 + 콜드 스타트 영향 ↓.

### Lambda 레이어 추가 디테일

- 레이어 자체에도 **버전 번호** 존재 → 함수는 특정 버전 지정 (`...:layer-name:3`)
- **삭제된 레이어 버전**도 기존 함수에서는 계속 동작 (이미 다운로드됨)
- 레이어 권한: `lambda:GetLayerVersion`을 다른 계정에 부여하여 공유
- 레이어 경로: Python은 `/opt/python` 또는 `/opt/python/lib/python<X.Y>/site-packages`

### 버전·별칭·트래픽 시프트 - 상세

```bash
# 가중치 라우팅: 별칭 "prod"가 버전 1(90%) + 버전 2(10%)
aws lambda create-alias \
  --function-name f \
  --name prod \
  --function-version 1 \
  --routing-config 'AdditionalVersionWeights={"2"=0.1}'
```

> ⚠️ **함정**: 가중치 라우팅은 **2개 버전만** 지정 가능. 3개 이상 불가.

### CodeDeploy를 통한 Lambda 자동 배포 (시험 출제)

| 배포 전략 | 트래픽 전환 패턴 |
|----------|------------------|
| **Canary10Percent5Minutes** | 10% → 5분 후 100% |
| **Canary10Percent30Minutes** | 10% → 30분 후 100% |
| **Linear10PercentEvery1Minute** | 1분마다 10%씩 |
| **Linear10PercentEvery10Minutes** | 10분마다 10%씩 |
| **AllAtOnce** | 즉시 100% |

CloudWatch 경보와 연계 → 알람 발생 시 자동 롤백.

### 환경 변수 키 정책 (KMS 시나리오)

- 기본: AWS 관리 키 `aws/lambda` (계정 내 다른 함수도 복호화 가능)
- 권장: 고객 관리 KMS 키 (CMK) — 함수별·팀별 격리
- 시험 출제: "다른 팀이 내 Lambda 환경 변수를 볼 수 없게 하려면?" → 고객 관리 키 + 키 정책

### Lambda Powertools (Python/Java/.NET/TypeScript) - 실무 표준

- **Logger**: 구조화 로깅 (CloudWatch Logs Insights 친화)
- **Tracer**: X-Ray 자동 통합
- **Metrics**: EMF(Embedded Metric Format) 자동
- **Idempotency**: DynamoDB 기반
- **Parameters**: SSM/Secrets Manager 캐싱
- **Validation**: JSON Schema

> 💡 시험에는 직접 안 나와도 실무 코드 베이스에서 표준이라 알아두면 좋음.

### 관련 서비스 Cross-Reference

- **KMS 봉투 암호화** → [Week 9 Day 1]
- **Secrets Manager 자동 회전** → [Week 9 Day 2]
- **CodeDeploy + Lambda Hooks** → [Week 8 Day 3]
- **SAM/CloudFormation으로 레이어 관리** → [Week 12 Day 5]

---

## 아키텍처 다이어그램

```
Lambda 버전과 별칭 관계
================================

              [$LATEST] (수정 가능)
                  |
                  | 버전 발행
                  v
[버전 1] --> ARN: function:my-func:1
[버전 2] --> ARN: function:my-func:2
[버전 3] --> ARN: function:my-func:3

[별칭 "dev"]  --> $LATEST
[별칭 "staging"] --> 버전 2
[별칭 "prod"] --> 버전 1 (90%) + 버전 2 (10%)

API Gateway → 별칭 "prod" → 트래픽 분할 → 버전 1/2

Lambda 레이어 구조
================================

[Lambda 함수]
  /var/task/          <- 함수 코드 (ZIP 업로드)
    lambda_function.py
    utils.py

[레이어 1: common-libs]
  /opt/python/
    pandas/
    numpy/

[레이어 2: ml-models]
  /opt/
    models/
      model.pkl

함수 코드에서 /opt 경로의 레이어 코드 자동 접근!
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **별칭을 이용한 카나리 배포**: 두 버전 간 가중치 설정으로 트래픽 분할
2. ⭐ **레이어 최대 5개**: 레이어+함수 코드 합계 250MB 제한
3. ⭐ **$LATEST**: 항상 최신 버전, 버전 번호로 발행 후 불변
4. ⭐ **환경 변수 암호화**: KMS로 암호화, 민감 값은 Secrets Manager 사용
5. ⭐ **버전은 불변**: 발행 후 코드/메모리/타임아웃 등 변경 불가

---

## 💻 실제 예시

```bash
# 환경 변수 업데이트
aws lambda update-function-configuration \
  --function-name my-function \
  --environment Variables='{
    "DB_HOST": "mydb.cluster.ap-northeast-2.rds.amazonaws.com",
    "DB_NAME": "myapp",
    "LOG_LEVEL": "INFO"
  }'

# 레이어 생성 (Python pandas 포함)
mkdir -p python/lib/python3.12/site-packages
pip install pandas -t python/lib/python3.12/site-packages/
zip -r layer.zip python/

aws lambda publish-layer-version \
  --layer-name pandas-layer \
  --zip-file fileb://layer.zip \
  --compatible-runtimes python3.12 python3.11 \
  --description "Pandas library layer"

# 함수에 레이어 연결
aws lambda update-function-configuration \
  --function-name my-function \
  --layers arn:aws:lambda:ap-northeast-2:123:layer:pandas-layer:1

# 버전 발행
aws lambda publish-version \
  --function-name my-function \
  --description "Version 2 - 새 기능 추가"

# 별칭 생성 (카나리 배포 - 10% 트래픽을 새 버전으로)
aws lambda create-alias \
  --function-name my-function \
  --name prod \
  --function-version 1 \
  --routing-config AdditionalVersionWeights={"2"=0.1}

# 별칭 업데이트 (완전 전환)
aws lambda update-alias \
  --function-name my-function \
  --name prod \
  --function-version 2 \
  --routing-config AdditionalVersionWeights={}
```

**Secrets Manager에서 시크릿 가져오기 (환경 변수 대신 권장):**
```python
import boto3
import json

def get_secret(secret_name):
    client = boto3.client('secretsmanager', region_name='ap-northeast-2')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# 글로벌에 캐싱 (웜 스타트 시 재사용)
_secrets = None

def lambda_handler(event, context):
    global _secrets
    if _secrets is None:
        _secrets = get_secret('prod/myapp/db')
    
    db_password = _secrets['password']
    # ... 사용
```

---

## 📝 연습 문제

**문제 1.** Lambda 별칭(Alias)으로 카나리 배포를 설정할 때 가능한 것은?

A) 세 개의 버전 간 트래픽 분할  
B) 두 개의 버전 간 가중치 기반 트래픽 분할  
C) IP 주소 기반 트래픽 분할  
D) 지역 기반 트래픽 분할  

**정답: B**  
해설: Lambda 별칭은 최대 두 개의 버전 간에 가중치를 설정하여 트래픽을 분할할 수 있습니다. 이를 통해 새 버전을 점진적으로 배포하는 카나리 배포가 가능합니다.

---

**문제 2.** Lambda 레이어에 대한 올바른 설명은?

A) 하나의 함수에 최대 3개의 레이어만 연결 가능하다  
B) 레이어는 /tmp 디렉토리에 추출된다  
C) 여러 함수 간에 공통 라이브러리를 공유하는 방법이다  
D) 레이어는 동일 계정에서만 공유 가능하다  

**정답: C**  
해설: Lambda 레이어는 여러 함수 간에 공통 코드나 라이브러리를 공유하는 방법입니다. 최대 5개 레이어 연결, /opt에 추출, 계정 간 공유도 가능합니다.

---

**문제 3.** Lambda 함수에서 민감한 데이터베이스 비밀번호를 가장 안전하게 관리하는 방법은?

A) 환경 변수에 평문으로 저장  
B) 함수 코드에 하드코딩  
C) AWS Secrets Manager에 저장하고 런타임에 조회  
D) S3 버킷에 텍스트 파일로 저장  

**정답: C**  
해설: AWS Secrets Manager를 사용하면 자동 로테이션, 세밀한 IAM 접근 제어, 감사 로그 등 강력한 보안 기능을 활용할 수 있습니다. 환경 변수는 콘솔에서 볼 수 있어 덜 안전합니다.

---

**문제 4.** Lambda 버전 $LATEST에 대한 올바른 설명은?

A) 가장 오래된 버전을 가리킨다  
B) 배포된 버전 중 가장 안정적인 버전이다  
C) 항상 현재 편집 가능한 최신 코드를 가리킨다  
D) 프로덕션 환경에서만 사용 가능하다  

**정답: C**  
해설: $LATEST는 Lambda 함수의 가장 최신 수정 가능한 버전을 가리킵니다. 버전을 발행하면 번호가 매겨지고 불변 상태가 됩니다.

---

**문제 5.** Lambda 레이어와 함수 코드의 합계 최대 크기(압축 해제 기준)는?

A) 100MB  
B) 150MB  
C) 250MB  
D) 500MB  

**정답: C**  
해설: Lambda 배포 패키지(레이어 포함)의 최대 크기는 압축 해제 기준 250MB입니다. 이 제한을 초과하면 컨테이너 이미지 배포(최대 10GB)를 사용해야 합니다.

---

## 📌 오늘의 요약

1. 환경 변수로 코드와 구성을 분리하며, 민감 정보는 KMS 암호화 또는 Secrets Manager를 사용한다
2. Lambda 레이어로 공통 라이브러리를 공유하며, 최대 5개 연결, /opt에 추출된다
3. 버전은 발행 후 불변, $LATEST는 수정 가능한 최신 버전을 항상 가리킨다
4. 별칭은 특정 버전을 가리키는 포인터로 카나리 배포(두 버전 간 트래픽 분할) 가능
5. 레이어+함수 코드 합계 250MB 제한, 초과 시 컨테이너 이미지(최대 10GB) 사용
