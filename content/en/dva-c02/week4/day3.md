# Day 3 - API Gateway Security, Caching, and Throttling: How Requests Are Controlled, from SigV4 to the Token Bucket

If you understand API Gateway as "just an HTTP proxy", you will inevitably make mistakes in your security design. In reality, API Gateway passes a request through at least five independent control layers before it reaches the backend: WAF, Resource Policy, Authorizer, Throttle, and Cache. Each layer solves a different problem, and if you misjudge which layer to use when, you either get flooded with 429s or open up an authentication-bypass vulnerability. In this file we dissect the internal working principles of each control layer and cover the edge cases DVA-C02 tests repeatedly.

---

## SigV4 and IAM Authentication: How AWS Internal Services Call an API

IAM authentication is based on AWS Signature Version 4 (SigV4). SigV4 is an HMAC-SHA256-based request signing protocol AWS formalized in 2012, and every AWS SDK now implements it automatically. The core idea is to build a "CanonicalRequest" that includes a hash of the entire request (URL, headers, body), sign it with the Access Key Secret, and place it in the `Authorization` header.

```
Authorization: AWS4-HMAC-SHA256
  Credential=AKIAIOSFODNN7EXAMPLE/20240115/ap-northeast-2/execute-api/aws4_request,
  SignedHeaders=host;x-amz-date,
  Signature=<HMAC-SHA256 computed value>
```

API Gateway receives this header and asks IAM to verify the signature. If verification passes, it confirms the requester's IAM identity and evaluates whether they have the `execute-api:Invoke` permission. Because the signature includes a date, **any request older than 5 minutes is automatically rejected** — this is replay-attack prevention.

> 💡 **Related theory**: SigV4 implements RFC 2104 (HMAC) and NIST FIPS 180-4 (SHA-256). It's a "scoped signing" scheme that includes the date, region, and service in the signature's scope to prevent a signature value from being reused in a different service or region. The same concept applies to Azure's Shared Key Authentication and GCP's HMAC Signed URL.

IAM authentication is optimized for **communication between AWS internal services**. Typical scenarios are a Lambda function calling an API Gateway in another AWS account, or calling an API with an EC2 instance's Instance Role. On the other hand, forcing SigV4 on external users (mobile apps, third-party partners) is impractical — implementing SigV4 by hand without the AWS SDK is quite cumbersome.

> ⚠️ **Trap**: The `aws:SourceIp` condition can be used for IP-based access restriction, but if the client goes through CloudFront or a NAT Gateway, **it is the CloudFront/NAT IP, not the origin IP, that shows up in `aws:SourceIp`**. To restrict by the real client IP, use `aws:VpcSourceIp` (inside a VPC) or a WAF Rule based on the X-Forwarded-For header.

---

## The Inner Mechanics of the Lambda Authorizer: TOKEN vs REQUEST Type

A Lambda Authorizer runs a separate Lambda function to dynamically generate an IAM policy before API Gateway calls the backend. Through this you can implement any authentication method AWS doesn't provide out of the box — OAuth, JWT, API tokens, LDAP, and so on.

There are two types of Lambda Authorizer, and this difference is frequently tested.

**TOKEN type**: Only the `Authorization` header (or a header you configure) is passed to Lambda. Suitable for simple Bearer token validation.

```python
# TOKEN type event structure
{
    "type": "TOKEN",
    "authorizationToken": "Bearer eyJhbGciOiJSUzI1NiJ9...",
    "methodArn": "arn:aws:execute-api:ap-northeast-2:123456789:abc123/prod/GET/orders"
}
```

**REQUEST type**: The full set of headers, query parameters, path parameters, and stage variables is passed to Lambda. Use it when you must decide authentication from a combination of multiple parameters.

```python
# REQUEST type event structure (abbreviated)
{
    "type": "REQUEST",
    "headers": {
        "Authorization": "Bearer ...",
        "X-Tenant-ID": "company-abc"
    },
    "queryStringParameters": {"version": "v2"},
    "pathParameters": {"proxy": "users/123"},
    "requestContext": {...},
    "methodArn": "arn:aws:execute-api:..."
}
```

The response a Lambda Authorizer must return is an IAM policy document. Using a wildcard (`*`) in the `Resource` field, you can allow/deny that Principal's access to the entire API at once:

```python
def lambda_handler(event, context):
    token = event.get("authorizationToken", "")
    
    try:
        # Verify JWT (using an external library)
        payload = verify_jwt(token)
        user_id = payload["sub"]
        
        # Add user info to the context (accessed in the backend Lambda as $context.authorizer.userId)
        return {
            "principalId": user_id,
            "policyDocument": {
                "Version": "2012-10-17",
                "Statement": [{
                    "Action": "execute-api:Invoke",
                    "Effect": "Allow",
                    # Wildcard allows all stages/methods of this API
                    "Resource": "arn:aws:execute-api:ap-northeast-2:123:abc123/*"
                }]
            },
            "context": {
                "userId": user_id,
                "tier": payload.get("tier", "free")
            }
        }
    except Exception:
        # Invalid token → 403 Forbidden (return a Deny policy)
        raise Exception("Unauthorized")  # or return a Deny policy
```

> 🔍 **Going deeper**: When a Lambda Authorizer throws `raise Exception("Unauthorized")`, API Gateway returns **403 Forbidden**. This differs from the usual HTTP convention (401 Unauthorized). To actually return a 401, you must customize the Gateway Response. Also, if you return a Deny policy, API Gateway internally evaluates that policy in its IAM engine and returns 403 — and in this process the Authorizer Lambda's execution cost has already been incurred.

**Authorizer result caching** is central to cost optimization. API Gateway keeps the IAM policy response in memory keyed by a cache key (TOKEN type: the token value; REQUEST type: the combination of parameters you specify). The TTL is configurable from 0 to 3600 seconds (default 300 seconds).

| Item | TOKEN type | REQUEST type |
|------|-----------|-------------|
| Cache key | Token value (Authorization header) | Explicitly specified header/query combination |
| Primary use case | JWT Bearer tokens | Multi-header auth, tenant-based |
| Event size | Small | Large (full request context) |
| Lambda timeout limit | Up to 29 seconds (within the API GW timeout) | Same |

> ⚠️ **Trap**: In the REQUEST type, if you don't explicitly specify a cache key, caching doesn't work at all. You must fill in the "Cache key" setting in the console. If you leave it blank, the Authorizer Lambda is invoked on every request.

---

## Cognito User Pool Authorizer: Validating JWTs Without Lambda

The Cognito User Pool Authorizer is a scheme where API Gateway itself directly validates a JWT (ID Token or Access Token) issued by Cognito, with no Lambda code. Internally, API Gateway fetches the public key from the Cognito User Pool's JWKS (JSON Web Key Set) endpoint and verifies the JWT signature.

```
Cognito User Pool JWKS endpoint:
https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json
```

Authentication flow:
1. The client logs in to Cognito → an ID Token (JWT) is issued
2. The client calls the API with an `Authorization: {ID Token}` header
3. API Gateway fetches the public key from Cognito JWKS → verifies the JWT signature
4. Confirms that the JWT's `aud` (Audience) claim matches the configured Client ID
5. Checks token expiration (`exp` claim)
6. All pass → the backend Lambda is called

> 💡 **Related theory**: A JWT (JSON Web Token, RFC 7519) consists of three parts: Header.Payload.Signature. Cognito signs with the RS256 (RSA + SHA-256) algorithm. Because API Gateway verifies the signature with the public key fetched from JWKS, it does not need to send a token-verification request to the Cognito server — this is called "offline verification".

**Cognito Authorizer vs Lambda Authorizer selection criteria**:

| Criterion | Cognito User Pool Authorizer | Lambda Authorizer |
|------|------------------------------|-------------------|
| Auth provider | Cognito User Pool only | Any provider (Auth0, Okta, custom) |
| Implementation complexity | Low (no Lambda code) | High (write a Lambda function) |
| Additional logic | Not possible (token validation only) | Possible (DB lookups, permission-level checks, etc.) |
| Cost | Cognito cost only | Lambda + Cognito/external IdP |
| Social login support | Via Cognito Identity Pool | Implement it yourself |

---

## Resource Policy: Access Control at the Network Level

A Resource Policy attaches an IAM-based access control policy directly to an API Gateway. It's the same concept as Lambda's Resource-based Policy. It's supported only on REST API; HTTP API does not support it.

Three primary use cases:

**1. IP whitelist**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Deny",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "execute-api:/*",
            "Condition": {
                "NotIpAddress": {
                    "aws:SourceIp": ["203.0.113.0/24", "198.51.100.50/32"]
                }
            }
        },
        {
            "Effect": "Allow",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "execute-api:/*"
        }
    ]
}
```

**2. VPC-Endpoint-only access (Private API)**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "execute-api:/*",
            "Condition": {
                "StringEquals": {
                    "aws:SourceVpce": "vpce-0abc1234def56789"
                }
            }
        }
    ]
}
```

**3. Allowing cross-account calls**
```json
{
    "Effect": "Allow",
    "Principal": {
        "AWS": "arn:aws:iam::987654321098:role/PartnerRole"
    },
    "Action": "execute-api:Invoke",
    "Resource": "execute-api:/*"
}
```

> 🔍 **Going deeper**: When creating a Private API (VPC-Endpoint-only), you must not only Allow the VPC Endpoint in the Resource Policy but also check the **VPC Endpoint's "Enable Private DNS" setting**. When Private DNS is enabled, `{api-id}.execute-api.{region}.amazonaws.com` resolves to the Endpoint's ENI IP inside the VPC. When it's disabled, you must use the Endpoint DNS name directly.

---

## mTLS and WAF: Enterprise B2B and Web Attack Defense

**mTLS (Mutual TLS)**, unlike the one-way server authentication of ordinary TLS, has the client also present a certificate so the server can verify the client. Used with IoT devices and B2B partner APIs.

To enable mTLS on API Gateway:
1. Bundle the certificates of the CAs (Certificate Authorities) you trust
2. Upload it to S3 (`s3://bucket/truststore.pem`)
3. Enable mTLS on the Custom Domain and specify the S3 path

```bash
aws apigateway create-domain-name \
  --domain-name api.example.com \
  --mutual-tls-authentication truststoreUri=s3://my-bucket/truststore.pem \
  --regional-certificate-arn arn:aws:acm:...
```

> 📚 **Case study**: In the 2021 financial-sector open API ecosystem (open banking), mTLS was mandated for connections between fintech services and bank APIs. The Korea Internet & Security Agency (KISA) guidelines recommend mTLS at the API gateway level. AWS API Gateway's mTLS is used as a managed solution that satisfies this requirement.

**WAF (Web Application Firewall)** integration is supported directly only on REST API (Edge-Optimized, Regional). HTTP API cannot attach a WAF Web ACL directly and must use the workaround of placing CloudFront in front and attaching WAF to CloudFront.

| WAF rule type | Purpose |
|--------------|------|
| AWS Managed Rules (AWSManagedRulesCommonRuleSet) | Block SQL injection, XSS, known malicious bots |
| Rate-based Rule | Block when requests per IP exceed a threshold within 5 minutes |
| IP Set Rule | Allow or block specific IPs/CIDRs |
| Geographic Match Rule | Block traffic from specific countries |
| Custom Rule (Regex) | Match header/body patterns |

---

## API Keys and Usage Plans: The Mechanics of Identification and Quotas

An API Key is a string identifier passed in the `x-api-key` header. Official AWS documentation explicitly states that an API key is "a means of usage tracking, not a means of authentication". This distinction is tested very often.

Why an API key is not an authentication mechanism: an API key is passed in the header unencrypted. Even with HTTPS, it can be leaked through a man-in-the-middle attack or log exposure. If an API key leaks, it must be revoked and reissued immediately — whereas IAM credentials support fine-grained permission control and automatic rotation.

A Usage Plan links API keys to API stages and applies three kinds of limits:

```
Usage Plan = {
    throttling: {
        rateLimit: 100,        // average requests per second (Token Bucket fill rate)
        burstLimit: 200        // instantaneous max requests (Token Bucket capacity)
    },
    quota: {
        limit: 10000,          // max requests
        period: "MONTH"        // DAY | WEEK | MONTH
    }
}
```

> 💡 **Related theory**: A usage plan's throttling is implemented with the Token Bucket algorithm. The bucket capacity is `burstLimit`, and the fill rate is `rateLimit`. When the bucket is empty, it returns 429. This is the "burst tolerance" concept that lets you absorb up to `burstLimit` even when traffic spikes momentarily. RFC 6585 (Additional HTTP Status Codes) defines the 429 status code, and you can advertise a retry time with the `Retry-After` header.

```bash
# Full flow: create an API key and link it to a usage plan
# 1. Create an API key
KEY_ID=$(aws apigateway create-api-key \
  --name "Partner-A-Key" \
  --enabled \
  --query 'id' --output text)

# 2. Create a usage plan
PLAN_ID=$(aws apigateway create-usage-plan \
  --name "PartnerPlan" \
  --throttle burstLimit=200,rateLimit=100 \
  --quota limit=50000,period=MONTH \
  --api-stages "apiId=abc123,stage=prod,throttle={GET/orders={burstLimit=50,rateLimit=20}}" \
  --query 'id' --output text)

# 3. Link the API key ↔ usage plan
aws apigateway create-usage-plan-key \
  --usage-plan-id $PLAN_ID \
  --key-id $KEY_ID \
  --key-type API_KEY
```

---

## Response Caching: The Exact Behavior of TTL, Cache Keys, and Invalidation

API Gateway caching is enabled at the stage level and can be overridden at the method level. The cache cluster is separate dedicated infrastructure, and cost is incurred based on its size.

| Cache size | Cost note |
|-----------|-----------|
| 0.5 GB | Small API |
| 1.6 GB | Medium scale |
| 6.1 GB | Large scale |
| 13.5 GB | High performance |
| 28.4 GB | Enterprise |
| 58.2 GB | Extra large |
| 118 GB | Ultra large |
| 237 GB | Maximum |

The cache key is, by default, **method + path**. You can add query parameters and headers as additional cache keys:

```
GET /products?category=electronics&page=1
→ Cache key: GET /products + category=electronics + page=1
→ If category or page differs, cache MISS
```

There are two **cache invalidation mechanisms**:

**1. Client-driven invalidation**: Include a `Cache-Control: max-age=0` header in the request. If any client can do this, the cache is defeated, so you must configure it to allow only clients that have the `execute-api:InvalidateCache` IAM permission.

```json
// Enforce IAM permission for cache invalidation in stage settings
{
  "/*/*/caching/requireAuthorizationForCacheControl": true
}
```

If a caller sends `max-age=0` without permission, API Gateway returns **403 Forbidden** (blocking the invalidation attempt).

**2. Full cache flush from the console/API**: You can manually clear the cache after a CloudFormation deployment or a new stage deployment.

> ⚠️ **Trap**: Caching is enabled at the stage level, but only **GET requests** actually get cached. POST, PUT, and DELETE are not cached. Also, the Lambda Authorizer's result cache and the API response cache are completely independent — invalidating one has no effect on the other.

---

## The Throttling Hierarchy: Four Layers and the Token Bucket

API Gateway throttling consists of four independent layers. The higher layers are applied before the lower ones.

```
Layer 1: AWS account level (default 10,000 RPS per region / burst 5,000)
    ↓ 429 on exceed
Layer 2: Stage level (Default Method Throttling)
    ↓ 429 on exceed
Layer 3: Method level (Route-level Throttling)
    ↓ 429 on exceed
Layer 4: Usage plan level (per API key)
    ↓ 429 on exceed
    ↓ all pass
Backend integration
```

The burst limit is the upper bound that permits momentary traffic spikes. It varies by region:

| Region | Account default RPS | Burst limit |
|------|-------------|-----------|
| us-east-1 | 10,000 | 5,000 |
| us-west-2 | 10,000 | 5,000 |
| ap-northeast-2 (Seoul) | 10,000 | 5,000 |
| ap-southeast-1 | 10,000 | 5,000 |

> 💡 **Related theory**: API Gateway's throttling is a variant of the **Token Bucket** algorithm. The bucket can hold up to `burstLimit` tokens, and tokens refill at the rate of `rateLimit`. Each incoming request consumes one token. When the bucket is empty, a 429 is returned. In contrast, a **Leaky Bucket** processes requests at a constant rate and rejects them when the queue is full. The key difference is that a Token Bucket permits bursts while a Leaky Bucket does not.

---

## CloudWatch Logging and Metrics: How to Diagnose Problems

API Gateway writes two kinds of logs to CloudWatch Logs:

**Access Log**: A structured log of the request/response. Configurable in a custom format.
```json
{
    "requestId": "$context.requestId",
    "ip": "$context.identity.sourceIp",
    "caller": "$context.identity.caller",
    "user": "$context.identity.user",
    "requestTime": "$context.requestTime",
    "httpMethod": "$context.httpMethod",
    "resourcePath": "$context.resourcePath",
    "status": "$context.status",
    "protocol": "$context.protocol",
    "responseLength": "$context.responseLength",
    "integrationLatency": "$context.integrationLatency",
    "responseLatency": "$context.responseLatency"
}
```

**Execution Log**: The detailed stages of request processing. Choose INFO or ERROR level. INFO logs every stage and is useful for debugging but increases cost.

Key CloudWatch metrics:

| Metric | Description | Use |
|--------|------|------|
| `Count` | Total number of API calls | Traffic monitoring |
| `Latency` | Client request received ~ response returned (end-to-end) | Total response time |
| `IntegrationLatency` | Backend call ~ response received (integration time only) | Backend performance |
| `4XXError` | Client errors (400, 401, 403, 429, etc.) | Detect misuse/throttling |
| `5XXError` | Server errors (500, 502, 503, 504, etc.) | Detect backend failures |
| `CacheHitCount` | Number of requests served from cache | Cache efficiency |
| `CacheMissCount` | Number of requests that missed cache and called the backend | Cache efficiency |

> 🔍 **Going deeper**: If the difference `Latency - IntegrationLatency` is large, it means API Gateway internal processing (auth, mapping, cache lookup, etc.) is the bottleneck. Conversely, if the difference is small and `Latency` itself is high, the backend (Lambda, DynamoDB, etc.) is slow. Comparing these two metrics is the first step of troubleshooting. Enabling X-Ray lets you analyze the time of each segment more granularly.

A **504 Gateway Timeout** occurs when the integration timeout (max 29 seconds) is exceeded. This is captured by the client as a `5XXError`. If a Lambda function doesn't respond within 29 seconds, a 504 always occurs. Regardless of Lambda's maximum execution time (15 minutes), the API Gateway timeout cuts it off first.

---

## Comparison of All Authentication Methods: The Frequently-Tested Mapping Table

| Auth method | How it works | Primary use case | REST API | HTTP API |
|----------|-----------|---------------|----------|----------|
| IAM (SigV4) | AWS signature verification | Between internal services | ✅ | ✅ |
| Lambda Authorizer (TOKEN) | Bearer token → Lambda | OAuth, custom JWT | ✅ | ✅ |
| Lambda Authorizer (REQUEST) | Composite parameters → Lambda | Multi-header auth | ✅ | ✅ |
| Cognito User Pool Authorizer | Automatic JWT validation | Cognito users | ✅ | ❌ (use JWT Authorizer) |
| JWT Authorizer | OIDC JWT validation | Cognito, Auth0, Okta | ❌ | ✅ |
| API Key | x-api-key header identification | Partner API tracking | ✅ | ✅ |
| Resource Policy | IP/VPC/account blocking | Network control | ✅ | ❌ |
| mTLS | Client certificate | IoT, B2B | ✅ | ✅ |
| WAF Web ACL | Pattern-based blocking | Web attack defense | ✅ | ❌ (via CloudFront) |

> 📚 **Case study**: In the 2022 Twitter API upheaval (the move to paid access), many services experienced the weaknesses of API-key-based access control. There were cases where a service relied on a simple API key alone for access control, and once the key leaked, all its usage limits were burned through. The AWS API Gateway best practice is to combine an API key + Lambda Authorizer to separate "identification (API Key) + authentication (Authorizer)".

---

## 📝 연습 문제

**문제 1.**  
A company's internal Lambda function must call an API Gateway REST API in another AWS account. What is the most secure way to authenticate while applying the principle of least privilege to the Lambda function?

A) Create an API key and store it in a Lambda environment variable  
B) Grant `execute-api:Invoke` to the Lambda execution role and call with a SigV4 signature  
C) Use a Cognito User Pool Authorizer and have Lambda log in to Cognito  
D) Allow the Lambda function ARN in the Resource Policy  

**정답: B**  
SigV4 automatically leverages the Lambda's IAM role credentials, and the AWS SDK handles the signing. For cross-account, you allow the origin account's role ARN in the target API's Resource Policy and grant `execute-api:Invoke` to the Lambda role. An API key is not an authentication mechanism, so it doesn't fit the principle of least privilege.

---

**문제 2.**  
On an API using a Lambda Authorizer (TOKEN type), the Authorizer Lambda runs every time on repeated calls with the same JWT token. What is the most direct way to optimize this?

A) Set Provisioned Concurrency on the Authorizer Lambda  
B) Set the Authorizer's TTL greater than 0 to enable result caching  
C) Replace the Lambda Authorizer with a Cognito User Pool Authorizer  
D) Migrate to API Gateway HTTP API  

**정답: B**  
A TOKEN-type Lambda Authorizer uses the token value as the cache key to cache the IAM policy response. Setting the TTL greater than 0 (default 300 seconds) returns the cached policy without invoking Lambda again for requests coming with the same token. This reduces both latency and Lambda execution cost.

---

**문제 3.**  
You want to apply WAF to an API Gateway REST API to block SQL injection attacks. This API is a Regional endpoint. What is the correct configuration?

A) Apply WAF in front of CloudFront  
B) Attach a WAF Web ACL directly to the API Gateway REST API  
C) Inspect for SQL injection patterns in a Lambda Authorizer  
D) Switch to an HTTP API and apply WAF  

**정답: B**  
A Regional endpoint REST API can attach a WAF Web ACL directly. A is the workaround used for Edge-Optimized or HTTP API (which doesn't support WAF). HTTP API doesn't support WAF directly, so D is wrong.

---

**문제 4.**  
API Gateway response caching is enabled. A particular client that needed fresh data sent a `Cache-Control: max-age=0` header and received 403 Forbidden. What is the cause?

A) Because caching is disabled  
B) Because that client lacks the `execute-api:InvalidateCache` IAM permission  
C) Because the Cache-Control header is not supported by API Gateway  
D) Because the client's API key has expired  

**정답: B**  
When "require authorization for cache invalidation (requireAuthorizationForCacheControl)" is enabled on the API Gateway stage, a caller without the `execute-api:InvalidateCache` permission who sends `max-age=0` gets a 403. This is by design to prevent unintended cache defeat.

---

**문제 5.**  
A company wants to offer tiered API access to three kinds of partners (Premium: 1000 RPS, Standard: 100 RPS, Free: 10 RPS). What is the most appropriate configuration?

A) Create a separate API Gateway REST API per partner  
B) Create three usage plans and issue an API key to each partner, linking it to the appropriate plan  
C) Return a different IAM policy per partner tier from a Lambda Authorizer  
D) Create three stages (premium, standard, free) and set different throttling on each  

**정답: B**  
Usage plans are designed for exactly this purpose. Define each tier's throttling (RPS, burst) and quota (daily/weekly/monthly limits) as a separate plan, and link each partner's API key to the appropriate plan. A single API and stage can accommodate all partners.

---

**문제 6.**  
In API Gateway CloudWatch metrics, `Latency` averages 3 seconds and `IntegrationLatency` averages 0.1 seconds. Which best explains this situation?

A) The Lambda function is slow, so the response time is long  
B) A DynamoDB query is the bottleneck  
C) A bottleneck is occurring in API Gateway internal processing (auth, mapping, cache, etc.)  
D) Network latency is high  

**정답: C**  
`Latency (3s) - IntegrationLatency (0.1s) = 2.9s` is consumed inside API Gateway. Lambda Authorizer invocation, request/response mapping (VTL), cache processing, and so on could be the cause. A short IntegrationLatency means the backend (Lambda, DynamoDB) is fast.

---

**문제 7.**  
You need to implement Cognito user authentication on an HTTP API. You can't use REST API's Cognito User Pool Authorizer as-is. What is the correct approach on HTTP API?

A) Only a Lambda Authorizer can be used  
B) Configure a JWT Authorizer and specify the Cognito User Pool's issuer URL and audience  
C) HTTP API does not support authentication  
D) Switch to IAM authentication via a Cognito Identity Pool  

**정답: B**  
HTTP API's JWT Authorizer supports any provider that follows the OIDC/OAuth 2.0 standard (Cognito, Auth0, Okta, etc.). When using Cognito, specify `https://cognito-idp.{region}.amazonaws.com/{userPoolId}` as the `issuer` and the app client ID as the `audience`. It's functionally equivalent to REST API's Cognito User Pool Authorizer but configured differently.
