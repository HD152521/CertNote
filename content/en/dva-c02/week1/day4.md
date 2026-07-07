# Day 4 - AWS CLI and SDK: From Credential Chaining to SigV4

There are usually three tools through which a developer first gets acquainted with AWS: the **AWS CLI** (in the terminal), the **AWS SDK** (inside code), and **CloudShell** (in the browser). All three ultimately call the same HTTPS APIs, but they diverge in the details of credential chaining and region resolution. These details show up on the exam as the question "why does our code work in one environment but not in another?".

Today we look at the internal workings of these three tools — the credential provider chain, named profiles, the SDK retry algorithm, and SigV4 signing. The goal is not to memorize a few CLI commands, but to understand the mechanisms that apply identically across every SDK. Once you grasp the mechanism, the same debugging flow works in any language's SDK.

## AWS CLI v2: Not Just a Simple Command Tool

AWS CLI v1 (launched 2013, Python-based) was replaced by v2 in 2020. v2's biggest changes are: (1) a **containerized bundled Python runtime** (no dependency on the system Python), (2) **SSO login integration** (`aws configure sso`), (3) **auto-prompt mode** (`aws --cli-auto-prompt`), (4) a **client-side pager** (long output is automatically piped through less).

When the CLI receives a command, it executes in the following order.

```
1. Determine region and output format from ~/.aws/config
2. Obtain AK/SK/SessionToken from the credential provider chain
3. Determine the service endpoint (region + service)
4. Build the JSON request, sign it with SigV4
5. Call the endpoint over HTTPS
6. Format the response JSON per --output (table/json/text/yaml)
```

Understanding why AWS moved from CLI v1 to v2 reveals a tool-design perspective. v1 depended on the Python installed on the system, so conflicts were frequent around the Python 2.7 EOL (January 2020). Touching macOS's system Python collided with Homebrew, and on Linux, ABI compatibility issues made security patching difficult. v2 bundles the Python interpreter statically, isolating it from the user's system. AWS [reflected](https://aws.amazon.com/blogs/developer/aws-cli-v2-is-now-generally-available/) that this decision eliminated thousands of GitHub issues per year.

> 🔍 **Going deeper**: CLI v2's credential chaining looks for credentials in the following order, using the first one found: (1) command-line options (`--profile`), (2) environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`), (3) the default profile in `~/.aws/credentials`, (4) SSO profiles in `~/.aws/config`, (5) Web Identity Token File (`AWS_WEB_IDENTITY_TOKEN_FILE`, EKS IRSA), (6) ECS task role (`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`), (7) EC2 instance metadata (IMDSv2). The [AWS SDK Credential Provider standard](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html) defines this same order so it applies consistently across all SDKs (boto3, AWS SDK for Java, Go, .NET, etc.).

> 💡 **Related theory**: The credential provider chain is essentially the **Chain of Responsibility pattern** (GoF, 1994). Each provider checks "can I handle this?" and, if not, passes to the next. Thanks to this pattern, a new provider (e.g., Pod Identity) can be slotted into the chain without changing existing code. If you look at `credentials.py` in the boto3 source, the `CredentialResolver` class implements exactly this pattern.

## Named Profiles: Handling Multiple Accounts

In practice, almost every developer works with multiple AWS accounts simultaneously. Named profiles in `~/.aws/config` and `~/.aws/credentials` solve this.

```ini
# ~/.aws/config
[default]
region = ap-northeast-2
output = json

[profile dev]
region = ap-northeast-2
role_arn = arn:aws:iam::111111111111:role/DevRole
source_profile = default

[profile prod]
region = us-east-1
role_arn = arn:aws:iam::222222222222:role/ProdRole
source_profile = default
mfa_serial = arn:aws:iam::333333333333:mfa/alice
duration_seconds = 3600

[profile sso-admin]
sso_session = mycompany
sso_account_id = 444444444444
sso_role_name = AdministratorAccess
region = us-east-1

[sso-session mycompany]
sso_start_url = https://mycompany.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

`source_profile` is the key. When you use the dev profile, the CLI first uses the default profile's credentials to call `sts:AssumeRole`, then makes the real API calls with the returned temporary credentials. If `mfa_serial` is present, a token code is required, so you can enforce MFA on dangerous accounts like prod.

```bash
# Specify the profile per command
aws s3 ls --profile prod

# Pin it for the session via environment variable
export AWS_PROFILE=prod
aws s3 ls

# SSO login (valid for 8 hours)
aws sso login --profile sso-admin
```

> ⚠️ **Trap**: The access keys in `~/.aws/credentials` are stored in plain text. If a laptop without disk encryption is lost, that's a straight-up key leak. AWS strongly recommends **IAM Identity Center (SSO)** + `aws configure sso` instead of IAM User access keys. SSO stores credentials encrypted in the OS keyring (macOS Keychain, Windows Credential Manager, Linux libsecret), and when the token expires, it prompts re-authentication via the browser.

> 📚 **Case study**: In the 2019 Capital One incident, the attacker stole the IAM Role's temporary keys from EC2 metadata — but had permanent keys from a laptop's `~/.aws/credentials` been there instead, they would have been discovered months later, unrotated. The 2021 Twitch source code leak also had `.aws/credentials` pushed to GitHub as one of its causes. AWS has since partnered with GitHub so that [Push Protection](https://github.blog/2022-04-04-push-protection-github-advanced-security/) automatically blocks pushes containing AKIA-pattern keys.

## SDK Retry Behavior: AIMD and Exponential Backoff

When an API call returns throttling or a transient error, the SDK retries automatically. This retry algorithm doesn't appear directly on the exam, but it underlies the answers to scenarios like DynamoDB ProvisionedThroughputExceededException, Lambda 429s, and S3 SlowDown.

| Retry mode | Default attempts | Algorithm | Introduced |
|------|------|------|------|
| Legacy (old) | 4 | exponential backoff | Early SDKs |
| Standard (default) | 3 (4 calls total) | exponential + jitter | 2019 |
| Adaptive (experimental) | 3 | client-side rate limiting + retry | 2020 |

**Standard mode** uses exponential backoff with jitter. The first retry waits 0-1 seconds, the second 0-2 seconds, the third 0-4 seconds, at random. Without jitter, all clients retry at the same moment and get throttled again all at once — the "thundering herd" problem. This algorithm is detailed in the AWS Architecture Blog's [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/).

**Adaptive mode** uses a token bucket algorithm for the client to dynamically limit its own call rate. It slows down preemptively before being throttled by the server. The downside is throughput can be constrained, so standard is the default.

> 💡 **Related theory**: AIMD (Additive Increase, Multiplicative Decrease) is an algorithm originating in TCP congestion control (Jacobson 1988). Increase throughput slowly, but cut it quickly on detecting loss. The AWS SDK's adaptive retry applies a similar philosophy to client-side rate limiting. RFC 7567 (IETF AQM Working Group, 2015) covers standardization work on similar mechanisms. Even more interesting is that the fact that omitting jitter re-creates the "thundering herd" was reconfirmed in datacenter traffic analysis [Polly Vavilala et al., SIGCOMM 2017].

> 🔍 **Going deeper**: SDK retry decisions hinge on HTTP status codes and error codes. (1) 5xx, 429, 502, 503, 504 are retried. (2) `ThrottlingException`, `Throttling`, `RequestLimitExceeded`, `RequestThrottled`, `ProvisionedThroughputExceededException` are retried. (3) Among 4xx, 400 BadRequest, 403 AccessDenied, and 404 NotFound are not retried (permanent errors). However, some 4xx errors are retryable, like DynamoDB's `TransactionConflictException`, so per-service exceptions exist. The full list of retryable errors is in `retries/special.py` in the boto3 source.

> ⚠️ **Trap**: Leaving SDK retries as-is inside a Lambda function collides with the function timeout. Inside a Lambda with the default 3-second timeout, if DynamoDB returns throttling, the SDK waits up to 0-1s + 0-2s = 3 seconds and Lambda dies first. In such cases, the right approach is to disable SDK retries with `AWS_MAX_ATTEMPTS=1` and retry at the function's caller (Step Functions, EventBridge Pipes, SQS DLQ).

## SigV4: The Signature on Every API Call

Almost all AWS API calls go through SigV4 signing (exceptions: query-string signing for presigned URLs, IoT's MQTT, etc.). If you don't know how SigV4 works, you can't debug things like "why does a timestamp off by more than 15 minutes produce a 403?" or "why is this presigned URL only valid for 5 minutes?".

```
SigV4 signing steps:
1. Build the Canonical Request
   - HTTP method, canonical URI, canonical query string
   - canonical headers, signed headers, body hash (SHA256)

2. Build the String to Sign
   - "AWS4-HMAC-SHA256"
   - timestamp (X-Amz-Date)
   - credential scope (date/region/service/aws4_request)
   - SHA256(Canonical Request)

3. Derive the Signing Key (5-stage HMAC)
   kDate    = HMAC("AWS4" + SecretAccessKey, Date)
   kRegion  = HMAC(kDate, Region)
   kService = HMAC(kRegion, Service)
   kSigning = HMAC(kService, "aws4_request")
   
4. Final signature = HMAC-SHA256(kSigning, String to Sign)

5. Include it in the Authorization header, or embed it in a presigned URL's query string
```

> 🔍 **Going deeper**: SigV4's 5-stage key derivation is a deliberate security design. Separating **kDate**, **kRegion**, and so on lets you create and use intermediate keys "valid only for this date, this region, this service" without exposing the SecretAccessKey. A pattern of handing such a derived key to an external service (e.g., CloudFront → Lambda@Edge) when delegating partial permissions becomes possible. The 15-minute timestamp skew limit prevents replay attacks — even if an attacker intercepts the packet, it's useless after 15 minutes. A client clock drifting off NTP is the cause of the commonly seen `SignatureDoesNotMatch` error.

> 📚 **Case study**: In late 2024, AWS released **SigV4a** (Signature Version 4 Asymmetric). Based on ECDSA asymmetric signing, the same signature is simultaneously valid against multiple regional endpoints. It lets **Multi-Region Access Points** (S3) and cross-region traffic be handled in one shot without regenerating the signature per region. SigV4 was HMAC symmetric-key based, requiring a different signature per region — a limitation ECDSA resolved.

> 💡 **Related theory**: HMAC is a message authentication code defined in RFC 2104 (Krawczyk et al., 1997). Its structure, `HMAC(K, m) = H((K ⊕ opad) || H((K ⊕ ipad) || m))`, is safe against the length extension attacks that plague naive hash chaining. The reason SigV4 uses a 5-stage HMAC chain is that it is the standard pattern for a key derivation function (KDF), providing security properties similar to NIST SP 800-108 (KDF in counter mode).

## Presigned URLs: Packaging Temporary Permission into a URL

An S3 presigned URL is a time-limited link the SDK creates by embedding a SigV4 signature into the URL's query string. The recipient can access the object with just that URL, no AWS credentials required.

```python
import boto3
s3 = boto3.client('s3')
url = s3.generate_presigned_url(
    'put_object',
    Params={'Bucket': 'my-bucket', 'Key': 'upload.bin'},
    ExpiresIn=300  # 5 minutes
)
# The client can PUT directly to this URL
```

The key constraint: **a presigned URL's validity cannot exceed the validity of the issuer's credentials**. If credentials issued via an EC2 instance profile expire after 1 hour, then even with ExpiresIn=86400 (24 hours), the URL dies after 1 hour. A staple exam question.

> ⚠️ **Trap**: If the issuer's IAM permissions are reduced after the presigned URL is created, the URL is invalidated even before it expires. The SDK signs with only the permissions at issuance time, but at actual usage time AWS also evaluates the current permissions. So the debugging scenario "we revoked permissions right after generating a presigned URL and the URL suddenly died" is entirely possible.

## CloudShell: EC2 Inside the Browser

CloudShell is a browser-based shell launched in December 2020. You can immediately type `aws` commands from the console without spinning up a separate EC2. Internally, an Amazon Linux 2-based container is isolated per user, and credentials are automatically inherited from the console login session.

| Feature | Value |
|------|------|
| Persistent storage | 1GB (home directory) |
| Memory | 4GB |
| Session idle timeout | 20-30 minutes |
| Auto-deletion after inactivity | 120 days |
| Free usage time | Unlimited (only the AWS API costs you invoke are billed) |

CloudShell's credentials are temporary credentials derived from the console session, so they expire just like an IAM Role's. That's why typing `aws sts get-caller-identity` shows an `assumed-role` ARN. CloudShell rarely appears on the exam, but in practice it's very handy for "running one urgent SQL line".

## Debugging: What Broke, and Where

The golden tool for CLI/SDK debugging is the `--debug` flag.

```bash
aws s3 ls --debug 2>&1 | grep -E "(endpoint|signature|Status|provider)"
```

Running this shows (1) which credential provider the credentials came from, (2) which endpoint was called, (3) the full canonical request of the SigV4 signature, and (4) the HTTP response code and headers. In boto3, `boto3.set_stream_logger('', logging.DEBUG)` yields the same information.

```python
import boto3
import logging
boto3.set_stream_logger('', logging.DEBUG)

s3 = boto3.client('s3')
print(s3.list_buckets())
```

The most common debugging scenario in practice is "why did the credentials get resolved differently than expected?". Find a line like `Found credentials in environment variables.` or `Found credentials in shared credentials file.` in the `--debug` output and you immediately know which provider won. Next, verify the region resolution with the `Endpoint: https://s3.ap-northeast-2.amazonaws.com` line. Finally, capturing the `StringToSign:` block and reproducing the same signature in your own code helps when implementing SigV4 directly outside the SDK.

## SDK Comparison: Key Differences by Language

| SDK | Version | Characteristics |
|------|------|------|
| boto3 (Python) | 1.x | Richest documentation; async requires separate aioboto3 |
| AWS SDK for JavaScript v3 | 3.x | Modular imports (tree shaking), TypeScript first |
| AWS SDK for Java v2 | 2.x | NIO-based async, builder pattern |
| AWS SDK for Go v2 | 2.x | context.Context-based cancellation |
| AWS SDK for .NET | 3.x | Native async/await, IConfiguration integration |
| AWS SDK for Rust | beta | tokio-based, type-safe |

Compared to v1, the v2/v3 SDKs share (1) async-first design, (2) module separation (import only the clients you need), and (3) a middleware system (retry, signing, logging as chainable handlers).

The JavaScript SDK v2 → v3 migration is a particularly big issue: v3 split npm packages per client (`@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb`, etc.), and with tree shaking, Lambda package sizes dropped by more than half. v2 imported every service at once, directly impacting Node.js Lambda cold starts, whereas v3 pulls in only the needed clients, so cold-start reductions of 30-50ms are typical.

> 💡 **Memorization tip**: SDK version labels follow a confusing pattern. **Python → boto3 is v1.x** (boto was v1, and boto3 effectively plays the v2 role), **for JavaScript, v3 is the modular one**, **for Java/Go/.NET, v2 is the latest**. When AWS official docs say "SDK v2", it's not JavaScript — it's the other languages.

## Wrapping Up

Today's picture is that the CLI and SDKs ultimately operate on the same mechanisms — the credential provider chain, region resolution, SigV4 signing, and retries. The patterns of handling multiple accounts with named profiles, using SSO without long-term keys via IAM Identity Center, and tracing the flow with `--debug` work identically across every SDK.

In the next article, we consolidate this Week 1 material into exam questions and pinpoint weak spots.

---

## 📝 연습 문제

**문제 1.** Inside an EC2 instance, where does boto3 look for credentials?

A) Always and only in `~/.aws/credentials`
B) Environment variables → ~/.aws/credentials → IMDS (EC2 instance metadata), in that order
C) Always and only in IMDS
D) Only access keys embedded in the code

**정답: B**
해설: boto3's credential provider chain goes: command-line options → environment variables → config files → container/EC2 metadata. If keys exist in environment variables or ~/.aws/credentials, those take priority; otherwise it falls through to IMDS. This order comes up frequently on the exam, and the key idea is "**the most explicit wins**". In practice, if an EC2 has an attached Role but the SDK is using different keys, suspect the environment variables or ~/.aws/credentials.

---

**문제 2.** The command `aws s3 ls --profile prod` is configured so that the `prod` profile uses the dev account's access key to assume a Role in the prod account. What is the flow of this call?

A) Called directly as an IAM User in the prod account
B) Calls STS AssumeRole with the dev account's access key → calls S3 with the temporary credentials
C) Called with the prod account's root account
D) The AWS CLI automatically grants cross-account permissions

**정답: B**
해설: The source_profile + role_arn pattern is standard cross-account delegation. The CLI (1) loads the source_profile (dev) credentials, (2) calls `sts:AssumeRole(RoleArn=ProdRoleArn)`, (3) makes the real API calls with the returned temporary credentials. The dev User needs the `sts:AssumeRole` permission, and the prod Role's Trust Policy needs an entry allowing the dev account's User. Both sides must line up for it to work.

---

**문제 3.** boto3 returned a `SignatureDoesNotMatch` error. What is the most likely cause?

A) Insufficient IAM permissions
B) The client clock lost NTP sync and differs from AWS server time by more than 15 minutes
C) Network connection dropped
D) The SDK version is too old

**정답: B**
해설: The SigV4 signature includes the `X-Amz-Date` header, and AWS servers reject it if this timestamp differs from their own time by more than 15 minutes (900 seconds). This is a replay attack prevention mechanism. Containers that lost NTP sync, Docker containers with broken clocks, and VM clock drift are common causes. Check UTC time with `date -u` and synchronize with `chronyd` or `ntpd` to resolve. A produces `AccessDenied`, a different error.

---

**문제 4.** Why is AWS CLI v2's SSO login (`aws configure sso`) safer than IAM User access keys?

A) It is faster
B) Long-term keys are never stored on disk in plain text, expired tokens force browser re-authentication, and credentials are stored encrypted in the OS keyring
C) AWS provides it for free
D) MFA is applied automatically

**정답: B**
해설: The SSO model: (1) the user authenticates with the IdP via the browser, (2) the CLI stores the received OIDC token in the OS keyring, (3) temporary credentials are issued via AssumeRoleWithWebIdentity, (4) when the token expires after 8 hours, browser authentication is required again. No plain-text key ever remains on disk, and if a laptop is lost, the keys aren't exposed unless the OS lock is broken. D: SSO itself doesn't enforce MFA; that is determined by the IdP's policy.

---

**문제 5.** How do you customize SDK retry behavior in a Lambda function?

A) Set the Lambda environment variables `AWS_RETRY_MODE=adaptive` and `AWS_MAX_ATTEMPTS=5`
B) SDK retries are disabled in Lambda
C) Change the Lambda runtime
D) Add a retry permission to the IAM policy

**정답: A**
해설: AWS SDKs in every language recognize the `AWS_RETRY_MODE` (legacy/standard/adaptive) and `AWS_MAX_ATTEMPTS` (total attempts) environment variables. Setting them as Lambda environment variables applies to every SDK call inside the function. Adaptive mode adds client-side rate limiting, but standard is generally recommended. For functions near their Lambda timeout, retries risk running out the clock, so lowering max attempts is safer.

---

**문제 6.** When you run `aws sts get-caller-identity` inside CloudShell, what does the ARN come back as?

A) An IAM User ARN
B) An assumed-role ARN (temporary credentials derived from the console login session)
C) The root account ARN
D) CloudShell's service ARN

**정답: B**
해설: CloudShell's credentials are automatically inherited from the console login session. If you logged in to the console as an IAM User, they are temporary credentials from applying STS GetSessionToken to that User; if you logged in via IAM Identity Center, they are the temporary credentials of that SSO Role. Both appear as `assumed-role/...` in `aws sts get-caller-identity`. CloudShell has no instance profile of its own.

---

**문제 7.** While uploading a 5GB file with `aws s3 cp`, the network dropped momentarily. How does CLI v2 handle this?

A) Re-uploads from the beginning
B) Uses multipart upload to automatically retry from the failed part; progress is preserved
C) Fails immediately
D) S3 Transfer Acceleration is automatically enabled

**정답: B**
해설: The AWS CLI automatically handles files above 8MB (the default multipart_threshold) as multipart uploads. Each part is uploaded independently, and on failure only that part is retried. The SDK retry chain kicks in, so transient errors recover automatically. If the CLI process itself terminates, the in-progress multipart upload remains in S3 in an incomplete state — and this is billed — so the standard pattern is to clean it up automatically with a lifecycle rule (`AbortIncompleteMultipartUpload`).

---

**문제 8.** You set a presigned URL's ExpiresIn=86400 (24 hours), but it expires after 1 hour. Why?

A) S3 does not support 24-hour presigned URLs
B) The issuer's (EC2 instance profile's) temporary credentials expire after 1 hour, so the presigned URL is also invalidated at that point
C) An SDK bug
D) S3 lifecycle configuration

**정답: B**
해설: A presigned URL is SigV4-signed with the issuer's credentials. When those credentials expire, the URL's signature no longer verifies. The EC2 instance profile automatically refreshes its 1-hour temporary credentials, but the refreshed credentials apply only to newly issued presigned URLs. If you need a 24-hour URL, either (1) sign with an IAM User access key (a security risk), or (2) assume a 12-hour Role for the issuer's credentials and issue from there.
