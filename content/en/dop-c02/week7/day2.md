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

**Question 4.** What is the most accurate description of the scope of the IAM policy that CDK `table.grantReadData(getOrder)` synthesizes automatically?

A) All dynamodb:* actions on the table  
B) The table ARN and its GSI/LSI ARNs, the table's KMS key ARN, and the appropriate read actions (GetItem, Query, Scan, and so on)  
C) Global read permission on all DynamoDB tables  
D) Permissions are granted automatically only to the Lambda function and do not apply to other resources  

**Answer: B**
Explanation: The core of CDK grant methods is **expressing intent + precise resource mapping**. It does not simply give actions; it automatically tracks all index ARNs of the table and even the encryption KMS key ARN to build an accurate Resource block. A is too broad (closer to grantFullAccess than grantReadData), C is inaccurate because it is a wildcard, and D is wrong because CDK supports the grant pattern for all resources. Compared with SAM policy templates, the permissions are narrower and more accurate.

---

**Question 5.** Which statement about the differences between Lambda container images and zip packages is NOT accurate?

A) A container image is up to 10 GB, while a zip is 250 MB  
B) Container images cannot use Lambda layers  
C) Container images do not support SnapStart (even for Java, only zip works)  
D) Container images do not support provisioned concurrency  

**Answer: D**
Explanation: D is the incorrect statement. Container image Lambda functions support PC (although PC warm-up takes longer than with zip). A/B/C are all true. The zip limit of 250 MB is measured after decompression, while the container's 10 GB is measured compressed, so the actual usable capacity differs by 30 to 40 times. SnapStart has supported only zip Java since its launch in 2022 and remained unsupported for containers through the end of 2024. Layers are not compatible with container images, so all dependencies must be included in the Dockerfile.

---

**Question 6.** "The team is comfortable with TypeScript, wants to manage Lambda, EKS, RDS, OpenSearch, and SQS in a single stack, reduce IAM permission mistakes, and build an in-house standard library to operate 9,000 stacks." Which IaC tool is the MOST suitable?

A) SAM  
B) Serverless Framework  
C) CDK with TypeScript  
D) Writing CloudFormation YAML directly  

**Answer: C**
Explanation: CDK provides (1) L2 constructs for all AWS resources (SAM covers only 6 serverless types), (2) automatic IAM through `grant*`, (3) reusable abstractions through an **in-house L3 construct library**, and (4) TypeScript type safety. Liberty Mutual's 9,000-stack case is exactly this scenario. SAM is weak at EKS/RDS integration, SLS is Lambda-centric and has the v4 licensing issue, and CFN YAML has no abstraction tools and produces 2,000-line templates.

---

**Question 7.** What does `selfMutation: true` in CDK Pipelines mean?

A) A Lambda function automatically modifies its own code  
B) The pipeline has itself as the first stage, and CDK code changes (adding stages, changing environments, and so on) are automatically reflected in the next execution  
C) DynamoDB Auto Scaling  
D) Automatic IAM role rotation  

**Answer: B**
Explanation: CDK Pipelines declares the pipeline itself as CDK code, following the GitOps philosophy. When selfMutation is on, after Source → Synth, the **UpdatePipeline** stage updates its own definition with CFN. The risk is that pushing a broken pipeline definition can cause self-mutation to deploy a broken pipeline, which can be hard to recover from (keeping break-glass IAM permissions is essential). A/C/D are unrelated.

---

**Question 8.** What is the core mechanism of SnapStart, and what is its scope of application on the exam?

A) Reduces cold starts for all runtimes  
B) Stores a snapshot of the JVM memory from the Java function's init phase in S3 → the next invocation restores it and skips init; supports only zip Java 11/17/21  
C) Automatic Lambda layer caching  
D) Accelerated lazy loading of container images  

**Answer: B**
Explanation: SnapStart (2022 re:Invent) is based on the same idea as Self/Smalltalk image-based persistence. The Java init phase is long and the main culprit of cold starts, so it is solved with a pre-taken snapshot. Because of the uniqueness assumption problem (random seeds, DB connections), explicit re-initialization through runtime hooks is required. Only zip Java (as of the end of 2024); Python/Node/container are not supported. A is too broad, C is unrelated to SnapStart, and D is in the container domain.

---

**Question 9.** What is the biggest change in Serverless Framework v4 that affects the adoption decision?

A) AWS Lambda is no longer supported  
B) Switch from the MIT license to a commercial license — companies with annual revenue of $2 million or more must register and pay  
C) Python support was dropped  
D) Docker images are not supported  

**Answer: B**
Explanation: Announced by Serverless Inc. in February 2023. MIT through v3; from v4, the "Serverless Framework License" (based on Apache 2.0 + commercial use restrictions). It triggered strong backlash on GitHub and a move toward migrating to SAM/CDK. It is the same pattern as Terraform's switch to BSL in August 2023. It is not often tested directly on the exam, but it can appear in scenarios about the decision to adopt SLS. A/C/D are not factual.

---

**Question 10.** What is the most accurate use of CDK Aspects?

A) Automatically inject code into all Lambda functions  
B) Traverse the construct tree with the visitor pattern and apply cross-cutting policies (tagging, enforcing encryption, naming rules)  
C) Automatically generate IAM policies (replacing grant methods)  
D) Manage Lambda layers  

**Answer: B**
Explanation: Aspects are the IaC version of AOP (Aspect-Oriented Programming, Gregor Kiczales, 1997). They separate cross-cutting concerns (tags, security, naming) from the core logic (stack definitions) and express them as a separate visitor. Apply them to the whole app with `cdk.Aspects.of(app).add(new TagAspect())`. A is in the code domain and unrelated, C is the domain of grant methods (Aspects are for validation and tagging), and D is unrelated. SAM has no equivalent mechanism, so external tools (cfn-nag) are used.
