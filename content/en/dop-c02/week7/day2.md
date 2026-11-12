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

## 📝 Practice Questions

**Question 1.** What should you do if a Lambda function must access only a specific S3 bucket?

A) Specify only the S3 bucket ARN in the IAM policy of the Lambda execution role  
B) Allow the Lambda function in the S3 bucket policy  
C) Configure S3 in the Lambda console  
D) Specify S3 access permissions with environment variables  

**Answer: A**
Explanation: Grant access permissions only to the specific S3 bucket ARN in the IAM policy of the Lambda execution role. Following the principle of least privilege, specify only the buckets that are needed.

---

**Question 2.** If a Lambda function size exceeds 50 MB, what is the most appropriate solution?

A) Split the Lambda into multiple functions  
B) Use the container image package type (supports up to 10 GB)  
C) Separate the dependencies into a Lambda layer  
D) Migrate to EC2  

**Answer: B**
Explanation: The container image type supports large dependencies with a 10 GB limit. ZIP packages have a 50 MB limit, so choose a container image when large models or complex libraries are needed.

---

**Question 3.** What is the purpose of configuring provisioned concurrency on a Lambda function?

A) Reducing function execution cost  
B) Eliminating cold starts by keeping a set number of instances always ready  
C) Limiting concurrently running functions  
D) Increasing function memory  

**Answer: B**
Explanation: Provisioned concurrency keeps a specified number of concurrent executions always ready (warm). Eliminating cold start latency guarantees consistent, fast responses. It increases cost ($0.015/hour) but is used for latency-sensitive services.

---
