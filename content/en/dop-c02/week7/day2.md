# Day 2 - Lambda Permissions, Layers, and Container Images

## Lambda Execution Role: Function's AWS Permissions

Lambda needs IAM Role to call AWS services. Execution Role is assumed by Lambda runtime, granting S3, DynamoDB, Secrets Manager, etc. access.

Policy example:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::checkout-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:region:account:table/orders"
    }
  ]
}
```

Trust Policy enables Lambda service to assume this role:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
```

> 💡 **Least Privilege**: Minimum permissions only. Function reading S3 doesn't need write permission.

## Lambda Layers: Sharing Code and Dependencies

Lambda Layers let multiple functions share code, libraries, or runtimes. Layer is ZIP with files extracted into `/opt` in Lambda runtime environment.

Creating layer (Python example):
```bash
# Create layer structure
mkdir -p python/lib/python3.11/site-packages
pip install -r requirements.txt -t python/lib/python3.11/site-packages/

# Create ZIP
zip -r layer.zip python/

# Publish layer
aws lambda publish-layer-version \
  --layer-name my-dependencies \
  --zip-file fileb://layer.zip \
  --compatible-runtimes python3.11
```

Using layer in function:
```bash
aws lambda create-function \
  --function-name myapp \
  --layers arn:aws:lambda:region:account:layer:my-dependencies:1 \
  # ... other parameters
```

Multiple layers allowed (up to 5). Runtime searches `/opt` for libraries and code.

> 📚 **Case**: Central platform team publishes observability layer (X-Ray, CloudWatch agent). All microservice functions use this layer, ensuring consistent monitoring without individual function configuration.

## Lambda Container Images: Alternative to ZIP

Lambda supports OCI container images stored in ECR. Build image locally, push to ECR, update function.

Dockerfile:
```dockerfile
FROM public.ecr.aws/lambda/python:3.11

COPY app.py ${LAMBDA_TASK_ROOT}/
COPY requirements.txt ${LAMBDA_TASK_ROOT}/

RUN pip install -r ${LAMBDA_TASK_ROOT}/requirements.txt

CMD ["app.lambda_handler"]
```

Build and push:
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
docker build -t checkout-lambda:latest .
docker tag checkout-lambda:latest $ECR_REGISTRY/checkout-lambda:latest
docker push $ECR_REGISTRY/checkout-lambda:latest

# Create function from image
aws lambda create-function \
  --function-name checkout-lambda \
  --role arn:aws:iam::account:role/lambda-role \
  --code ImageUri=$ECR_REGISTRY/checkout-lambda:latest \
  --package-type Image
```

> ⚠️ **Container vs ZIP trade-offs**: Container images support larger deployments (10GB vs 50MB ZIP) and custom runtimes, but cold-start slower. ZIP for typical functions; containers for heavy dependencies.

## Lambda Environment Variables and Secrets

Environment variables for non-sensitive config:
```bash
aws lambda update-function-configuration \
  --function-name myapp \
  --environment Variables="{LOG_LEVEL=DEBUG,API_ENDPOINT=https://api.example.com}"
```

Secrets Manager for sensitive data:
```python
import boto3
import json

secrets_client = boto3.client('secretsmanager')
secret = json.loads(secrets_client.get_secret_value(SecretId='prod/db-password')['SecretString'])
db_password = secret['password']
```

> 💡 **Best Practice**: Never hardcode secrets. Environment variables only for non-sensitive config.

## Lambda Reserved Concurrency and Provisioned Concurrency

**Reserved Concurrency**: Guarantees minimum simultaneously executing instances; prevents other functions depleting account concurrency. Other functions can't use reserved slots.

```bash
aws lambda put-function-concurrency \
  --function-name myapp \
  --reserved-concurrent-executions 100
```

**Provisioned Concurrency**: Keeps instances "warm" before execution, eliminating cold starts. More expensive but guarantees low latency.

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name myapp \
  --provisioned-concurrent-executions 10 \
  --qualifier LIVE
```

> 🔍 **Deep Dive**: Reserved concurrency limits blast radius. Production function reserved=100; if development function bug causes infinite loop, only 100 requests queue; other account concurrency unaffected. Provisioned concurrency adds cost ($0.015/hour/concurrent execution) for latency-critical functions.

---

## 📝 연습 문제

**문제 1.** Lambda 함수가 특정 S3 버킷에만 접근해야 한다면?

A) Lambda Execution Role의 IAM Policy에서 S3 버킷 ARN만 명시  
B) S3 버킷 정책에서 Lambda 함수 허용  
C) Lambda 콘솔에서 S3 설정  
D) 환경 변수로 S3 접근 권한 지정  

**정답: A**
해설: Lambda Execution Role의 IAM Policy에서 특정 S3 버킷 ARN에만 접근 권한을 부여한다. 최소 권한 원칙에 따라 필요한 버킷만 지정해야 한다.

---

**문제 2.** Lambda 함수 크기가 50MB를 초과한다면 가장 적절한 해결책은?

A) Lambda를 여러 함수로 분리  
B) Container Image 패키지 타입 사용 (10GB까지 지원)  
C) 의존성을 Lambda Layer로 분리  
D) EC2로 마이그레이션  

**정답: B**
해설: Container Image 타입은 10GB 제한으로 대규모 의존성을 지원한다. ZIP 패키지는 50MB 제한이 있으므로 큰 모델이나 복잡한 라이브러리가 필요한 경우 컨테이너 이미지를 선택한다.

---

**문제 3.** Lambda 함수에 Provisioned Concurrency를 설정하는 목적은?

A) 함수 실행 비용 절감  
B) Cold start 제거, 일정 수의 인스턴스를 항상 준비 상태로 유지  
C) 동시 실행 함수 제한  
D) 함수 메모리 증가  

**정답: B**
해설: Provisioned Concurrency는 지정된 수의 concurrent execution을 항상 준비 상태 (warm)로 유지한다. Cold start 지연 제거로 일정하고 빠른 응답 보장. 비용 증가 ($0.015/시간)하지만 레이턴시 중요한 서비스에서 사용.

---
