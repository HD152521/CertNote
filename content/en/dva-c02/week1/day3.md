# Day 3 - STS and Policy Conditions: The Deep World of Temporary Credentials

Yesterday, while looking at Roles, we glossed over "STS issues temporary credentials" in a single line. But if you don't know exactly what structure those temporary credentials have, how they are verified, and how they expire, you cannot solve the most common IAM problems you meet in practice — "why is the SDK suddenly throwing a 401?", "why does the federation token die after 1 hour?", "why doesn't Lambda know its own function ARN?".

Today we look deeply at the STS APIs, analyze policy Condition keys from an ABAC perspective, and examine the cross-account patterns of resource-based policies — especially the confused deputy problem and External ID. This is one of the most frequently tested areas on the exam, and when IAM breaks in practice, 90% of the time it is in this area.

## STS: What the Security Token Service Really Is

STS is a **global service that issues temporary credentials**. It launched in 2011; initially there was only `sts.amazonaws.com` (global), but since 2018 regional endpoints (`sts.ap-northeast-2.amazonaws.com`) have been recommended. The reasons are latency and reliability. The global endpoint is physically located in us-east-1, so if us-east-1 fails, the global endpoint dies with it. Using a regional endpoint closes the dependency within that region.

Looking at why STS was split off as a separate service reveals the essence of the cloud credential model. In traditional systems, authentication and authorization were bundled in one place (LDAP, AD, Kerberos KDC). But in an environment like AWS with hundreds of services and hundreds of millions of resources scattered about, that model doesn't work. So AWS turned the result of authentication into a **verifiable token** that flows through the system, and each service evaluates permissions just by looking at that token. STS is the token issuer, IAM is the permission policy store, and each service (S3, DynamoDB...) plays the role of token verifier. This is exactly the same structure as the OAuth2/OIDC model.

STS has five core APIs.

| API | Input | Output | Purpose |
|------|------|------|------|
| `AssumeRole` | RoleArn, RoleSessionName | Temporary credentials (15 min ~ 12 hrs) | Same-account / cross-account Role switching |
| `AssumeRoleWithSAML` | RoleArn, PrincipalArn, SAMLAssertion | Temporary credentials (15 min ~ 12 hrs) | AD/Okta SAML federation |
| `AssumeRoleWithWebIdentity` | RoleArn, WebIdentityToken | Temporary credentials (15 min ~ 12 hrs) | Google/Facebook/Cognito OIDC, EKS IRSA |
| `GetSessionToken` | (DurationSeconds, MFA token) | Temporary credentials (15 min ~ 36 hrs) | MFA-hardened sessions for IAM Users |
| `GetFederationToken` | Name, Policy | Temporary credentials (15 min ~ 36 hrs) | Custom federation brokers |
| `GetCallerIdentity` | (none) | The current caller's ARN | Debugging |

> 🔍 **Going deeper**: The credentials returned by AssumeRole are a 3-piece set: (1) AccessKeyId (starting with `ASIA`, unlike permanent keys which start with `AKIA`), (2) SecretAccessKey, (3) **SessionToken** (a base64 string with a JWT-like structure). When the SDK calls an API, all three are used in the SigV4 signature. AWS services verify the received SessionToken with STS's public key to check expiration and permissions. Unlike permanent keys, temporary keys can be revoked immediately on the STS side (`aws sts revoke-credentials` or the `revoke older sessions` action). More interestingly, a snapshot of the original Role's permissions is embedded inside the SessionToken, so changing the Role's Permission Policy after issuance is not reflected in that session. This is why AWS can distribute verification.

> 💡 **Related theory**: STS temporary credentials belong to the same family of mechanisms as OAuth 2.0 access tokens and Kerberos ticket-granting tickets. All share the pattern of "short-lived tokens + a refresh mechanism". From a security perspective, this pattern is superior because **even if leaked, they invalidate themselves automatically**. Stealing a token that auto-expires after 1 hour is useless in the next hour. In contrast, an IAM User's access key remains valid forever unless explicitly rotated. This difference is at the heart of both the Capital One incident (stealing EC2's credentials via IMDSv1) and the Twitter hack (damage would have been reduced had employee sessions been limited to 1 hour).

> 🔍 **Going deeper**: The AccessKeyId prefix tells you the credential type. `AKIA` is a permanent IAM User key, `ASIA` is an STS temporary key, `AROA` is a Role identifier, `AGPA` is a Group, `AIDA` is a User. Security tools that scan GitHub for exposed keys build regexes on these prefixes. Tools like truffleHog and GitGuardian look at exactly these patterns. A leaked key starting with `ASIA` will normally expire soon, but if it was issued within the past 12 hours it is still dangerous.

## AssumeRole's Trust Policy: Who May Borrow This Role

The Trust Policy defined together with a Role determines "**who** can assume this Role". This is a different kind of policy from a regular Permission Policy. If the Permission Policy defines "what the person using this Role can do", the Trust Policy is the gatekeeper one level above it.

```json
// Trust Policy example: the EC2 service can assume this Role
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}

// Cross-Account: any User/Role in another account can assume
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::123456789012:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "my-shared-secret-12345"},
    "Bool": {"aws:MultiFactorAuthPresent": "true"}
  }
}
```

`Principal` determines who is allowed. `Service` is an AWS service (e.g., `ec2.amazonaws.com`, `lambda.amazonaws.com`), `AWS` is an IAM entity in the same or another account, and `Federated` is a SAML/OIDC provider. If the Trust Policy blocks, no matter how broad the Permission Policy is, the assume fails.

Some service principal names defy intuition. For example, the Trust Principal for an ECS Task Role is `ecs-tasks.amazonaws.com`, not `ecs.amazonaws.com`. Lambda is `lambda.amazonaws.com`, but a Role for Lambda@Edge must trust both `lambda.amazonaws.com` and `edgelambda.amazonaws.com` simultaneously. RDS Enhanced Monitoring uses the odd name `monitoring.rds.amazonaws.com`. These asymmetries stem from AWS's service evolution history and often appear as exam traps.

> ⚠️ **Trap**: Writing `"AWS": "arn:aws:iam::123456789012:root"` in the Trust Policy's Principal does not mean "only that account's root user" is allowed. It means **every IAM entity inside that account is a potential candidate**. For the assume to actually happen, that entity must also hold the `sts:AssumeRole` permission within its own account (two-sided evaluation). That is why cross-account always requires both sides' policies to allow.

## The Confused Deputy Problem and External ID

This comes up often on the exam and is also where incidents frequently happen in practice. Consider a scenario. A SaaS backup company, SaaS-Backup, creates a Role in our account so it can write backup data to our S3. The Trust Policy's Principal is set to SaaS-Backup's account ID.

The problem arises when SaaS-Backup takes on another customer, X. What if attacker X asks SaaS-Backup to "handle our backups too" while slipping in the ARN of our Role? Since SaaS-Backup has permission to call AssumeRole from its own account, it can borrow our Role and overwrite X's backups into our S3. This phenomenon — **the SaaS "confusing its customers" and accessing another customer's resources** — is called the confused deputy. The term was first coined by Norm Hardy in 1988 in the context of capability security, and its essence is "the abuse of authority that occurs when a privileged agent (deputy) does not know on whose behalf it is acting".

The solution is the **External ID**. We add an `sts:ExternalId` Condition to our Role's Trust Policy, enforcing a secret string only we know. For SaaS-Backup to assume our Role, it must send along the External ID we gave it. X does not know our External ID, so even if SaaS-Backup tries to process X's request, verification of our Role fails.

> ⚠️ **Trap**: The External ID is commonly misunderstood as a "password", but it is really closer to a "**customer identifier**". The key is not strong randomness but "a different value per customer". On the SaaS side, per-customer External IDs are stored in a DB and used differently each time. AWS recommends mandatory use of External IDs in all third-party SaaS Role configurations. Datadog, New Relic, Splunk, and Snowflake all auto-generate and display an External ID at signup.

> 📚 **Case study**: In May 2023, security researchers found third-party vendors in AWS's SaaS integration patterns that either didn't use External IDs or assigned the same External ID to all customers. These were defenseless against confused deputy attacks, and some allowed access to other customers' S3 data. AWS subsequently began explicitly requiring "a per-customer, unguessable External ID" in its [official guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html).

## Condition: The Engine of ABAC

The Condition clause of a policy is the most powerful part of IAM evaluation. AWS provides hundreds of condition keys; classifying the frequently tested ones makes things fast.

| Category | Key | Example |
|------|------|------|
| Global (all services) | `aws:RequestedRegion` | `"StringEquals": "ap-northeast-2"` |
|  | `aws:SourceIp` | `"IpAddress": "203.0.113.0/24"` |
|  | `aws:SourceVpc` | `"StringEquals": "vpc-abc123"` |
|  | `aws:SecureTransport` | `"Bool": "true"` (enforce HTTPS) |
|  | `aws:MultiFactorAuthPresent` | `"Bool": "true"` |
|  | `aws:MultiFactorAuthAge` | `"NumericLessThan": "3600"` (MFA within 1 hour) |
|  | `aws:PrincipalTag/Dept` | `"StringEquals": "Engineering"` |
|  | `aws:RequestTag/Env` | `"StringEquals": "prod"` |
|  | `aws:CurrentTime` | `"DateGreaterThan": "2026-01-01T00:00:00Z"` |
|  | `aws:UserAgent` | `"StringLike": "aws-cli/*"` |
| S3 service | `s3:prefix` | "Enforce per-user folders" |
|  | `s3:x-amz-server-side-encryption` | `"StringEquals": "AES256"` |
|  | `s3:RequestObjectTag/Sensitivity` | `"StringEquals": "Public"` |
| EC2 service | `ec2:InstanceType` | "Allow only the t3 family" |
|  | `ec2:ResourceTag/Owner` | Based on instance tags |

> 🔍 **Going deeper**: The combination of `aws:PrincipalTag` and `aws:RequestTag` is the heart of ABAC. If you enforce that Engineering department users carry the `Dept=Engineering` tag and that resources created by Engineering must also carry the `Dept=Engineering` tag, you can implement per-department resource separation with a single policy. The pattern that allows an action only when the identity and the resource carry the same tag: `"Condition": {"StringEquals": {"aws:RequestTag/Dept": "${aws:PrincipalTag/Dept}"}}`. With RBAC you would need a Group and Policy per department, but with ABAC a single policy suffices. NIST designated ABAC as the generation after RBAC in SP 800-162, and AWS brought it into IAM in 2017.

> 💡 **Related theory**: The SigV4 signing algorithm (the standard authentication for AWS APIs) is based on HMAC-SHA256. The client builds (1) a canonical request (method, URI, headers, body hash), (2) a string-to-sign (timestamp, scope, canonical request hash), and (3) a signing key (derived from the SecretAccessKey through five stages of HMAC) to produce the final signature. With temporary credentials, the SessionToken is sent along in the `X-Amz-Security-Token` header. SigV4 was never standardized as an RFC, but the [official guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_aws-signing.html) fills that role. **SigV4a**, released in late 2024, is a new version that allows the same signature to be used against multiple regional endpoints simultaneously, and is used by S3 Multi-Region Access Points. It avoids baking the region into the signature itself and derives a separate ECDSA key, enabling multi-region verification.

> ⚠️ **Trap**: `aws:SourceIp` **does not work when the call goes through an AWS service**. For example, when Lambda calls S3, a policy that allows only corporate IPs via `aws:SourceIp` will block it. Lambda → S3 is called from the AWS internal network, so the SourceIp is an AWS internal IP, not a corporate one. In such cases, use the `aws:SourceVpc` or `aws:SourceVpce` (VPC Endpoint) keys instead. This appears frequently on the actual exam.

## IRSA: EKS's IAM Integration

In EKS (Kubernetes on AWS), the standard way to give a Pod IAM permissions is IRSA (IAM Roles for Service Accounts). The core idea is to make the Kubernetes Service Account the issuer of an OIDC token, and have AWS trust that OIDC provider to allow AssumeRoleWithWebIdentity.

```
1. Pod starts → the Service Account's OIDC token is auto-injected (signed by the kube-apiserver)
2. AWS SDK checks the AWS_ROLE_ARN, AWS_WEB_IDENTITY_TOKEN_FILE environment variables
3. SDK calls STS AssumeRoleWithWebIdentity (with the OIDC token)
4. STS looks up the EKS cluster's public key from the OIDC JWKS endpoint → verifies the token signature
5. STS issues temporary credentials (15 min ~ the Role's MaxSessionDuration)
6. SDK automatically re-calls to refresh 5 minutes before expiration
7. The code inside the Pod calls AWS APIs with those credentials
```

Thanks to this mechanism, **per-Pod permission separation** becomes possible, rather than per-node. Two Pods on the same worker node can have completely different IAM Roles. **EKS Pod Identity**, released in 2023, is a simpler alternative that bypasses OIDC: a daemonset called eks-pod-identity-agent exposes a metadata endpoint from which the SDK fetches credentials directly. The difference matters: IRSA requires configuring an OIDC provider outside the cluster and is complex to manage in multi-cluster environments, while Pod Identity is done with a click in the EKS console. However, Pod Identity came out later than IRSA and is not compatible with some third-party operators (Karpenter, older versions of Cluster Autoscaler).

> 🔍 **Going deeper**: IRSA's OIDC verification flow is standard JWT verification. STS fetches and caches the JWKS from the EKS cluster's OIDC issuer URL (e.g., `oidc.eks.ap-northeast-2.amazonaws.com/id/ABCDEF1234`) and verifies the token's signature. The token's `sub` claim has the form `system:serviceaccount:default:my-sa`, so in the IAM Role's Trust Policy you can allow only a specific Service Account with the `oidc.eks...:sub` Condition. If you omit the Condition, every Pod in the cluster can borrow that Role — a big security hole. A frequent exam trap.

## The 4 Patterns of Cross-Account

| Pattern | Mechanism | Suitable when |
|------|------|------|
| Role chaining | User in account A → assumes Role in account B → assumes Role in account C | Multi-stage delegation |
| Resource-based policy | Account B's S3 bucket policy names account A's user as Principal | S3/SQS/SNS/Lambda, etc. |
| RAM (Resource Access Manager) | Share resources with other accounts (Transit Gateway, Subnets, etc.) | Infrastructure sharing |
| AWS Organizations + delegated admin | Master account delegates to member accounts | Central management of Security Hub, GuardDuty |

Role chaining has a hidden constraint. **A chained session lasts at most 1 hour**. Even if you pass `DurationSeconds=12*3600` when assuming Role B from account A, if you then assume Role C through Role B, that session is automatically capped at 1 hour. AWS put this constraint in place to prevent infinite chaining attacks, and it is often the cause of tokens suddenly expiring in long-running batch workloads. Fix: instead of chaining, directly assume the deepest Role from the start, or trust the SDK's automatic refresh logic.

It is important to note that resource-based policies are evaluated from two directions. For a user in account A to access an S3 bucket in account B, (1) account A's IAM policy must allow S3 access, and (2) account B's bucket policy must allow account A. **It's AND, not OR**. However, resource-based policies within the same account are evaluated as OR (even if the IAM policy doesn't allow it, the Bucket Policy allowing it is enough), while cross-account is AND. This asymmetry often decides the correct answer.

> 📚 **Case study**: The Twitter hack of July 2020. Attackers used social engineering to steal employee credentials, accessed admin tools, and mobilized 130 accounts (Obama, Biden, Musk, etc.) for a Bitcoin scam. It wasn't an AWS incident, but the direct lessons are **session length limits and MFA**. Had user sessions been capped at 1 hour with MFA enforced, the attack window would have been far narrower. On AWS, the standard guidance is to keep the IAM Role's `MaxSessionDuration` short (1 hour) and add the `aws:MultiFactorAuthPresent` condition to the Trust Policy.

> 📚 **Case study**: The Okta breach of March 2022. The Lapsus$ group accessed some customer data through the laptop of a third-party support employee at Okta. Okta immediately revoked all affected sessions, but some OIDC tokens remained valid until expiration. Lesson: when using federation, you need a mechanism to force-expire downstream AWS sessions when the IdP is compromised. AWS subsequently began recommending the pattern of "rejecting tokens issued before a certain point in time" using the IAM Role's `aws:TokenIssueTime` Condition.

## The Exact Order of the Permission Evaluation Algorithm

The IAM evaluation order is the thing most frequently tested and most frequently gotten wrong. AWS defines it explicitly in the [official documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html).

```
1. SCP (Service Control Policy) — enforced by Organizations. If denied, immediately denied.
2. Resource-based policy — S3 bucket policies, etc. OR within the same account, AND cross-account.
3. Identity-based policy — the User/Group/Role's attached policies.
4. Permission boundary — the cap set on the Role/User. If denied, immediately denied.
5. Session policy — the scope narrowed inline at AssumeRole time. If denied, immediately denied.
6. Explicit Deny — a Deny at any stage makes the final result Deny.
```

The key points are that an Explicit Deny beats every Allow, and that SCPs and Permission Boundaries **set upper limits** (they only subtract, never grant permissions). The most common mistake made by organizations introducing SCPs for the first time is the misconception that "we wrote an Allow in the SCP, so permission is granted". SCPs only block.

## Wrapping Up

Today's takeaways are four. First, STS is the factory of temporary credentials, and AssumeRole, AssumeRoleWithSAML, and AssumeRoleWithWebIdentity are its three flagship APIs. Second, the Condition clause is the engine by which IAM evolved into ABAC, and the combination of `aws:PrincipalTag` and `aws:RequestTag` enables per-department resource separation without policy explosion. Third, the confused deputy problem in cross-account scenarios is solved with External IDs. Fourth, IAM evaluation flows in the order SCP → Resource-based → Identity-based → Boundary → Session policy, and an Explicit Deny beats every Allow.

In the next article, we look at the practical use of the AWS CLI, SDKs, and CloudShell built on top of this — credential chaining, profile management, and signature debugging.

---

## 📝 연습 문제

**문제 1.** A company wants to let an external SaaS backup service write backup data to its S3. What is the safest configuration?

A) Create an IAM User and hand the access key to the SaaS
B) Create an IAM Role and specify both the SaaS's account ID and an External ID condition in the Trust Policy
C) Set the S3 bucket to public
D) Refresh and deliver S3 presigned URLs to the SaaS every hour

**정답: B**
해설: The External ID prevents the confused deputy problem. If you trust only the SaaS's account ID, the SaaS could mistakenly borrow our Role while processing another customer's request. The External ID verifies "this request is on behalf of our account". A carries long-term key leakage risk, C exposes the data, and D imposes hourly refresh as an operational burden — plus a presigned URL is essentially the same as exposing a key. In practice, make the External ID a random string of 16+ characters and never leave it in plaintext on GitHub or in Jira tickets.

---

**문제 2.** In a Lambda function, `boto3.client('s3').list_buckets()` returned an `ExpiredToken` error. What is the most likely cause?

A) The Lambda function's IAM Role is misconfigured
B) The Lambda ran for over 8 hours and failed to refresh its STS credentials (Lambda max is 15 minutes)
C) The Lambda function code called `assume_role` internally and used the returned temporary credentials more than 1 hour later
D) The S3 bucket is in a different region

**정답: C**
해설: The credentials a Lambda function receives automatically via an IMDS-like mechanism are automatically refreshed by the SDK before expiration. But temporary credentials obtained by explicitly calling `sts.assume_role()` inside your code are not auto-refreshed. They expire after 1 hour. Solutions: use the SDK's `boto3.Session(profile_name='...')`, specify a longer `DurationSeconds` (up to 12 hours) at `sts.assume_role`, or track the expiration time and re-issue. B is an impossible scenario since Lambda's max execution time is 15 minutes.

---

**문제 3.** What does the following Trust Policy mean?
```json
{"Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}
```

A) The OS inside the EC2 instance has root privileges
B) The ec2.amazonaws.com service can assume this Role, so it can be attached to EC2 instances
C) IAM permissions are baked into AMIs created by EC2
D) It is an invalid policy

**정답: B**
해설: To let an AWS service itself assume a Role, you specify the service name in the Trust Policy's Principal. `ec2.amazonaws.com` means EC2 can attach and use this Role as an instance profile. Similarly, a Lambda execution role uses `lambda.amazonaws.com`, and an ECS Task Role uses `ecs-tasks.amazonaws.com` (note: NOT `ecs.amazonaws.com`).

---

**문제 4.** ABAC pattern: every resource carries a `Project` tag, and IAM Principals also have a `Project` tag. Which Condition expresses "access only to resources of one's own project"?

A) `"StringEquals": {"aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"}`
B) `"StringEquals": {"aws:PrincipalTag/Project": "AllProjects"}`
C) `"StringNotEquals": {"aws:RequestTag/Project": "*"}`
D) `"Bool": {"aws:PrincipalTag/Project": "true"}`

**정답: A**
해설: This is the standard ABAC pattern. `aws:ResourceTag/Project` is the tag of the resource being called, and `${aws:PrincipalTag/Project}` substitutes the caller's tag as a variable. The action is allowed only when the two values match. This single policy works even with 1,000 projects and 10,000 users, solving RBAC's role explosion. However, for ABAC to work, consistent tagging must be enforced on all resources (enforced via SCPs or IaC).

---

**문제 5.** What is the risk of using the global endpoint (`sts.amazonaws.com`) instead of the STS regional endpoint (`sts.ap-northeast-2.amazonaws.com`)?

A) It costs more
B) A us-east-1 outage affects the global endpoint, so workloads in other regions can also fail to obtain credentials
C) It has lower throughput limits
D) It cannot be FIPS certified

**정답: B**
해설: The STS global endpoint is physically located in us-east-1. If an event like the 2017 S3 us-east-1 outage occurs, STS calls through the global endpoint also fail. Since 2018, AWS has recommended that all SDKs use regional endpoints by default (boto3 since 1.18.0; AWS SDK for Java v2 from the start). You can force it with the `AWS_STS_REGIONAL_ENDPOINTS=regional` environment variable. Global-endpoint tokens are valid in all regions, but regional-endpoint tokens are also valid in all regions by default (aside from legacy behavior).

---

**문제 6.** You want to call AWS APIs from an EKS Pod. What is the safest method?

A) Inject an IAM User access key into the Pod's environment variables
B) Grant all permissions to the worker node's instance profile (shared by all Pods)
C) Grant a per-Pod Role via IRSA (IAM Roles for Service Accounts) or EKS Pod Identity
D) Store keys in AWS Secrets Manager and have the Pod download them at boot

**정답: C**
해설: IRSA grants IAM Roles at the Pod level. Credentials arrive via the Service Account → OIDC token → STS AssumeRoleWithWebIdentity path, so there are no long-term keys. B has every Pod on the same node sharing the same permissions, violating least privilege. A and D ultimately risk long-term key exposure. With EKS Pod Identity released in 2023, the same effect can be achieved with a simpler setup than IRSA (no OIDC configuration required).

---

**문제 7.** What is the role of RoleSessionName in an AssumeRole call?

A) It determines the Role's ARN
B) It is an identifier for tracing which session it is in CloudTrail audit logs
C) It is the expiration time of the temporary credentials
D) It is the verification key of the MFA token

**정답: B**
해설: RoleSessionName is an identifier recorded verbatim in CloudTrail logs. When one Role is shared by many users, it lets you trace who did what and when. Example: if 50 developers assume the same `DevRole`, each uses a RoleSessionName like `alice@company.com`, `bob@company.com` to identify whose action it was. Looking at CloudTrail's `userIdentity.sessionContext.sessionIssuer.userName` together with `userIdentity.arn` reveals the exact flow.

---

**문제 8.** A user in account A must access an S3 bucket in account B. Which combination of policies is required?

A) Allowing account A's Principal in account B's bucket policy alone is sufficient
B) Allowing S3 access in account A's user IAM policy alone is sufficient
C) Both account A's user IAM policy AND account B's bucket policy must allow (AND)
D) Apply SCPs to both accounts

**정답: C**
해설: This is the core principle of cross-account. Even with a resource-based policy, in cross-account scenarios both sides must allow (AND). Within the same account it is OR (either one is enough), but cross-account it is AND. This asymmetry frequently appears as a trap both on the exam and in practice.
