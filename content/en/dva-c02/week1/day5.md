# Day 5 - Week 1 Review: The Chain of Trust Built by Infrastructure and IAM

If we tie together everything from the past four days in one line, it becomes: "For anything to work on AWS, all of the following must line up — (1) where (Region/AZ), (2) who (Principal), (3) what (Action), (4) on what (Resource), (5) under what conditions (Condition)." This sentence determines 90% of the answers in the DVA exam's security and troubleshooting domains (44% combined).

Today we re-bundle Week 1's key concepts into scenarios and classify the trap patterns that frequently appear on the exam. This is a review session, not new material, so the questions and explanations go deeper. It is organized in a form that is good to skim one more time right before the actual exam.

## The Big Picture of Week 1

```
[ AWS Global Infrastructure ]
    └─ Region (isolated infrastructure unit)
        └─ AZ (group of 3+ physical DCs)
            └─ Actual resources: EC2/Lambda/RDS, etc.
                └─ IAM (who can do what)
                    ├─ User (long-term credentials)
                    ├─ Group (permission bundle)
                    ├─ Role (temporary credential issuer)
                    └─ Policy (JSON specification)
                        └─ Condition (ABAC engine)
```

If any link in this chain breaks, the call fails. When solving exam scenarios, identifying which link is the problem is the fast path to the answer.

To emphasize once more: AWS's entire security model is **deny-by-default**. Without an explicit Allow for any resource, access is denied. Higher-level guardrails like SCPs can add further blocking, but they cannot create permissions. Once you internalize this model, the question "why don't I have permission?" always resolves into the search "where is the Allow missing?".

## Frequently Tested Trap Patterns

### 1. The 5 Causes of "EC2 Can't Access S3"

The most common scenario. Simply "attach an IAM Role" is not always the answer. Let's cover all the possible causes.

| Cause | Symptom | Fix |
|------|------|------|
| IAM Role not attached | "Unable to locate credentials" | Grant an instance profile |
| Role policy lacks S3 permissions | `AccessDenied` | Add s3:GetObject etc. |
| Explicit Deny in the S3 bucket policy | `AccessDenied` | Review the bucket policy |
| S3 Block Public Access + wrong policy | `AccessDenied` | Reconfigure BPA or the policy |
| Private subnet without a VPC Endpoint | timeout | Add an S3 Gateway Endpoint |
| Object encrypted with a KMS key + no KMS permission | `AccessDenied` (KMS) | KMS Key Policy + IAM kms:Decrypt |

> ⚠️ **Trap**: An S3 object encrypted with SSE-KMS cannot be read with IAM's `s3:GetObject` alone. The same Principal must also have `kms:Decrypt`, and the Principal must also appear in the KMS Key Policy's grants. On the exam, the scenario "S3 permissions are in place but GetObject fails" is almost always answered by KMS.

> 🔍 **Going deeper**: The VPC Endpoint scenario is a network-layer problem, so IAM debugging won't solve it. For an EC2 in a private subnet to reach S3, it must either (1) go out to the internet via a NAT Gateway, or (2) go over the AWS internal network via an S3 Gateway Endpoint (adding the prefix-list to the route table) or an Interface Endpoint (PrivateLink). With no NAT and no Endpoint, you get a timeout. The fact that it's a timeout rather than AccessDenied is the diagnostic clue.

### 2. "Lambda Can't Access Another Account's Resources"

Cross-account follows the principle of "agreement from both sides". The Lambda function's execution role needs (1) the `sts:AssumeRole` permission with the target account's Role ARN specified, and (2) the target account Role's Trust Policy must name our Role as a Principal. Both are required.

```python
# Cross-account call inside Lambda code
import boto3
sts = boto3.client('sts')
resp = sts.assume_role(
    RoleArn='arn:aws:iam::222222222222:role/CrossAccountReadRole',
    RoleSessionName='lambda-cross-account'
)
creds = resp['Credentials']
s3 = boto3.client('s3',
    aws_access_key_id=creds['AccessKeyId'],
    aws_secret_access_key=creds['SecretAccessKey'],
    aws_session_token=creds['SessionToken']
)
s3.list_objects_v2(Bucket='other-account-bucket')
```

The trap in this code: the received temporary credentials expire after 1 hour, and if the Lambda holds onto them inside a workflow and reuses them, calls fail after expiration. The clean approach is to assume fresh on every invocation, or delegate automatic refresh to the SDK's `RefreshableCredentials`.

### 3. The "STS Endpoint" Trap

`sts.amazonaws.com` (global) vs `sts.ap-northeast-2.amazonaws.com` (regional). When an exam scenario says "during a us-east-1 outage, workloads in other regions fail to obtain credentials", suspect the global STS endpoint. Switch with `AWS_STS_REGIONAL_ENDPOINTS=regional`.

### 4. Understanding the "Permission Boundary"

The Permission Boundary is a mechanism that defines the effective maximum permissions of an IAM User/Role. **Actions absent from the Boundary are blocked even if present in the Identity Policy**. It is commonly used so that "an administrator can delegate IAM management to developers without excessive permissions leaking out". Example: enforce a Boundary on every Role a developer can create, and you can prevent those Roles from touching IAM itself.

> ⚠️ **Trap**: The difference between SCP, Permission Boundary, and Session Policy is an exam staple. The **SCP** is an Organizations guardrail applied to the entire account, the **Permission Boundary** is the maximum permission cap on a specific IAM entity, and the **Session Policy** is a one-shot guardrail narrowing scope inline at AssumeRole time. All three share the trait of "subtracting only, never granting permissions".

## Exam Domain Weights and the Week 1 Mapping

| Domain | Weight | Areas covered in Week 1 |
|--------|------|------|
| Development | 32% | SDK, CLI, credential chain |
| Security | 26% | All of IAM, STS, SigV4 |
| Deployment | 24% | (not covered yet) |
| Troubleshooting | 18% | IAM policy simulation, `--debug`, get-caller-identity |

Week 1's importance is overwhelming given that more than half of security's 26% + troubleshooting's 18% on the exam is IAM-related. **Master Week 1 completely and you get more than 30% of the exam essentially for free.**

## ARN Patterns You Must Know

An ARN (Amazon Resource Name) has the format `arn:partition:service:region:account-id:resource`. Memorize the patterns that appear frequently on the exam.

| Resource | ARN example |
|------|------|
| IAM User | `arn:aws:iam::123456789012:user/Alice` |
| IAM Role | `arn:aws:iam::123456789012:role/MyRole` |
| S3 Bucket | `arn:aws:s3:::my-bucket` (no region/account) |
| S3 Object | `arn:aws:s3:::my-bucket/path/to/file` |
| Lambda Function | `arn:aws:lambda:ap-northeast-2:123456789012:function:MyFn` |
| Lambda Layer | `arn:aws:lambda:ap-northeast-2:123456789012:layer:MyLayer:3` (includes version number) |
| DynamoDB Table | `arn:aws:dynamodb:ap-northeast-2:123456789012:table/MyTable` |
| SQS Queue | `arn:aws:sqs:ap-northeast-2:123456789012:MyQueue` |
| SNS Topic | `arn:aws:sns:ap-northeast-2:123456789012:MyTopic` |
| KMS Key | `arn:aws:kms:ap-northeast-2:123456789012:key/uuid` |
| Secrets Manager | `arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:Name-randomSuffix` |
| Parameter Store | `arn:aws:ssm:ap-northeast-2:123456789012:parameter/path/to/param` |

> 💡 **Memorization tip**: S3 and IAM are global services, so the region field in their ARNs is empty (`arn:aws:s3:::`). Other services have the region filled in. Also, IAM includes the account-id but S3 does not (the bucket name itself is globally unique). And the partition is `aws` for regular AWS, `aws-us-gov` for GovCloud, and `aws-cn` for China regions. Copying policies cross-partition without changing the partition prefix is a known failure mode.

## Wrapping Up

Week 1 lays AWS's "foundation". On top of the infrastructure map sits the chain of trust that is IAM, and your code's SDK calls are bound to that chain. Starting next week, the real compute (EC2, Lambda, ECS), data (S3, DynamoDB, RDS), integration (API Gateway, SQS, EventBridge), and deployment (CodePipeline, etc.) go on top of this.

The key mindset to remember: on AWS, the question "why doesn't this work?" almost always reduces to "at which IAM evaluation stage was it blocked?". SCP, Resource Policy, Identity Policy, Permission Boundary, Session Policy, Explicit Deny — one of these six layers is the answer. And the starting point for finding that answer is `aws sts get-caller-identity` and the IAM Policy Simulator.

---

## 📝 Practice Questions

**Question 1.** A company issues IAM Users to all employees, who use access keys with the CLI. Following a security audit, the CISO has ordered "no more long-term keys". What is the most appropriate migration?

A) Rotate IAM User access keys every 30 days and detect unused keys with CloudTrail to auto-deactivate them — operations improve, but long-term keys themselves remain
B) Adopt AWS IAM Identity Center (SSO) + integrate an external IdP + use the CLI with `aws configure sso`
C) Put MFA on the root account and have all employees share it while auditing sessions with CloudTrail — credential sharing itself is the worst possible security failure
D) Issue every employee a dedicated EC2 instance and access via instance profile Roles to eliminate keys — keys disappear, but per-employee EC2 cost and operations are unrealistic

**Answer: B**
Explanation: IAM Identity Center integrates with external IdPs (Okta, Azure AD, Google Workspace, etc.) via SAML 2.0/OIDC, and the CLI operates by obtaining temporary credentials through STS. Long-term keys are never stored on disk. A reduces risk in proportion to the rotation interval but still keeps long-term keys. C: sharing root is the worst possible security failure. D: spinning up EC2 for every employee is unrealistic in cost and operations.

---

**Question 2.** What is the effect of the following IAM policy?
```json
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "arn:aws:s3:::project-${aws:PrincipalTag/Project}/*",
  "Condition": {"Null": {"aws:PrincipalTag/Project": "false"}}
}
```

A) `s3:*` is evaluated without the Condition, unconditionally allowing all actions on every S3 bucket in the account
B) Principals that have a `Project` tag are allowed all S3 actions only on buckets whose prefix matches that tag's value
C) The `${aws:PrincipalTag}` variable is not supported in Resource ARNs, so the policy always evaluates to deny at validation
D) Because the Resource ARN contains a variable, it applies only to the root account (the account-id owner) and is void for IAM Users

**Answer: B**
Explanation: `${aws:PrincipalTag/Project}` is substituted with the caller's Project tag value, and `"Null": false` means "this tag must exist". A user with Project=alpha accesses `project-alpha-*` buckets, a user with Project=beta accesses `project-beta-*` buckets. This is the classic ABAC pattern enabling per-department resource separation with a single policy.

---

**Question 3.** After moving a workload from EC2 to Lambda, you want it to run with the same IAM policies without code changes. What changes?

A) Lambda has no instance profile so it cannot use IAM Roles and keys must be injected via environment variables — in reality, Lambda uses a Role as its execution role just fine
B) The Principal in the Lambda execution role's Trust Policy must change from `ec2.amazonaws.com` → `lambda.amazonaws.com`
C) Lambda has restricted STS access, so access keys must be stored in code or Secrets Manager and loaded explicitly — Lambda receives temporary credentials automatically
D) The Trust Policy is service-agnostic, so attaching the Role as-is works with no code or config changes — the Principal Service differs, so the assume fails

**Answer: B**
Explanation: The IAM Role's Trust Policy determines "which service can assume this Role". If you attach the Role EC2 was using directly to Lambda, Lambda's assume attempt fails. The Trust Policy's Principal Service must be changed. The Permission Policy (the actual permissions) can be reused as-is.

---

**Question 4.** Which of the following is NOT included in an STS AssumeRole response?

A) AccessKeyId — an access key ID starting with the `ASIA` prefix indicating a temporary key
B) SecretAccessKey — the secret access key used for SigV4 request signing
C) SessionToken — the session token that must accompany every call made with temporary credentials, sent as a header
D) The IAM User's console login password — a permanent password returned alongside for credential recovery

**Answer: D**
Explanation: STS returns the temporary credential 3-piece set (AccessKeyId / SecretAccessKey / SessionToken) plus an Expiration timestamp. An IAM User's password has nothing to do with STS and is never exposed. Distinguishing that an AccessKeyId starting with `ASIA` is temporary and one starting with `AKIA` is permanent comes up on the exam from time to time.

---

**Question 5.** A company has set an SCP allowing "only us-east-1 and ap-northeast-2". An IAM User has `AdministratorAccess`. This User attempts to launch an EC2 in eu-west-1. What happens?

A) The identity-based AdministratorAccess is an explicit Allow, which takes precedence over the Organizations SCP region restriction, so it is allowed
B) The SCP's Deny takes precedence and it is denied
C) The SCP only disables the console region selector, so the eu-west-1 EC2 launches normally via CLI or SDK
D) An `aws:RequestedRegion` violation is a soft warning, so only a warning banner appears in the console and the instance is created

**Answer: B**
Explanation: The SCP is the absolute upper limit at the Organizations level. No matter how broad the identity-based Allow is, if the SCP blocks it, it is denied. Blocking unapproved regions with the `aws:RequestedRegion` condition is the standard pattern for company-wide guardrails. Note that global services like IAM, CloudFront, Route 53, and Support must be carved out so they are not affected (excluded via the SCP's NotAction).

---

**Question 6.** What is the most appropriate first debugging step in this scenario? "boto3 code on EC2 returns `An error occurred (AccessDenied) when calling the GetObject operation`."

A) Disable the S3 bucket's Block Public Access and open the bucket policy to public-read to check access — this is the road to a security incident, not root-cause diagnosis
B) Run `aws sts get-caller-identity` to check which Role/User is currently in effect
C) Inject IAM root credentials into the instance to check whether it works — putting root keys on EC2 is absolutely forbidden
D) Restart the EC2 instance to refresh the instance profile credential cache — AccessDenied is a permission problem, not a cache problem, so this is irrelevant

**Answer: B**
Explanation: Debugging AccessDenied always starts with "who am I calling as?". `get-caller-identity` shows the ARN; verifying it is the expected Role gives you the starting point for tracing permissions. Then check that ARN's permissions with the IAM Policy Simulator, check KMS permissions if the object is KMS-encrypted, and review the S3 Block Public Access settings. A is the road to a security incident.

---

**Question 7.** A developer configured a dev profile in `~/.aws/credentials`, but unless `--profile dev` is specified on the CLI command, the default profile's credentials are used. How can the dev profile be applied automatically to every command?

A) Point the default profile at dev with `aws configure set profile dev` — no such configuration key exists, so this is void
B) Set the `AWS_PROFILE=dev` environment variable
C) Overwrite the `[default]` block in `~/.aws/config` with dev's credentials — it works, but blurs the boundary between profiles
D) Re-run `aws configure --profile dev` to re-register dev as the highest-priority profile — this only updates values and does not change the default selection

**Answer: B**
Explanation: The `AWS_PROFILE` environment variable determines the default profile for all AWS CLI/SDK calls during that shell session. Putting `export AWS_PROFILE=dev` in `~/.bashrc` makes it permanent. C is possible too, but it changes the contents of the default profile itself, blurring the boundary with other profiles. Also, the environment variable approach is easily reverted with `unset AWS_PROFILE`, making it flexible for multi-account work.

---

**Question 8.** In an IAM Policy's `"Resource": "arn:aws:s3:::my-bucket/${aws:username}/*"`, when is the `${aws:username}` variable evaluated?

A) It is substituted once with the author's username at policy authoring/save time and fixed
B) It is bound to the entity's name at the moment the policy is attached to an IAM entity
C) At API call time (dynamically substituted with the caller's information)
D) Variables are not supported in IAM policies, so it matches the literal string `${aws:username}` as-is

**Answer: C**
Explanation: IAM policy variables are evaluated at each API call. When Alice calls, `${aws:username}` → `Alice`, yielding `my-bucket/Alice/*`; when Bob calls, it becomes `my-bucket/Bob/*`. A single policy can enforce per-user isolated folders. This pattern is the standard for "per-tenant data isolation" in SaaS.

---

**Question 9.** What error appears when SigV4 signature timestamp validation fails?

A) AccessDenied — a permission-denied error returned as an IAM permission evaluation failure
B) SignatureDoesNotMatch or RequestTimeTooSkewed
C) ThrottlingException — a throttling error from exceeding request rates that triggers SDK retries
D) ServiceUnavailable — a 5xx-class error indicating a transient server-side failure

**Answer: B**
Explanation: If the clock differs from the AWS server by more than 15 minutes, you get `RequestTimeTooSkewed`; if the signature itself is wrong, you get `SignatureDoesNotMatch`. NTP synchronization, container clocks, and VM clock drift are common causes. Check UTC with `date -u`, then synchronize with `chronyd`. It's an issue you meet occasionally in cloud environments, and if you don't know the cause, you waste time suspecting IAM permissions.

---

**Question 10.** A company separates prod and dev accounts with AWS Organizations, and developers can assume Roles in both accounts via IAM Identity Center. Why is prod protected even if a major incident happens in the dev account?

A) Within the same Organizations, AWS automatically detects the blast radius and isolates the incident account from the network — no such automatic isolation feature exists
B) With OU separation in Organizations, an IAM Principal crossing account boundaries requires explicit cross-account permissions, and SCPs can add further isolation
C) The moment prod is registered as a member account, it is automatically locked read-only by SCP — no such default behavior exists
D) All cross-account actions are automatically blocked and audited by CloudTrail so incidents don't propagate — CloudTrail only records, it never blocks

**Answer: B**
Explanation: The AWS account itself is a strong isolation boundary. Even within the same Organizations, accessing another account's resources requires explicit cross-account permissions (IAM Role + Resource Policy). SCPs can add guardrails (e.g., blocking certain actions in the prod account), and multi-account aggregation in GuardDuty/CloudTrail enables central auditing. The multi-account strategy is a standard recommendation of AWS Well-Architected.

---

**Question 11.** A Lambda function received a `LimitExceededException`. What is the SDK's default retry behavior?

A) Throttling-class errors have no idempotency guarantee, so the exception propagates immediately after 1 attempt with no retry
B) Standard retry mode: 3 additional attempts + exponential backoff with jitter
C) `LimitExceededException` is classified as recoverable, so it retries infinitely without backoff until it succeeds
D) When the calling region is throttled, the SDK automatically fails over to another regional endpoint in the same partition and retries

**Answer: B**
Explanation: The AWS SDK's default retry mode is standard, with 4 attempts total (initial call + 3 retries). Each retry backs off randomly by 0-1s, 0-2s, 0-4s (jitter). LimitExceededException is throttling-class and can recover through retries. If a Lambda function is close to its timeout, reducing max attempts via environment variable is safer. Infinite retries create a thundering herd and kill the server even harder.

---

**Question 12.** A company wants to let a SaaS monitoring tool read CloudWatch metrics from its AWS account. What is the safest configuration?

A) Create a dedicated IAM User, grant only CloudWatchReadOnlyAccess, hand the access key to the SaaS, and rotate every 90 days — handing long-term keys to an external party is an anti-pattern
B) Create an IAM Role, specify the SaaS's account ID + an External ID condition in the Trust Policy, and grant only ReadOnlyAccess
C) Issue a separate access key on the root account, restrict it to ReadOnly, and provide it to the SaaS — issuing/sharing root keys is the worst possible security failure
D) Expose CloudWatch metrics to the SaaS account via cross-account sharing and allow reading without authentication — unauthenticated exposure violates least privilege

**Answer: B**
Explanation: The external SaaS scenario is standard: cross-account Role + External ID. The External ID prevents the confused deputy problem, and ReadOnlyAccess follows the least privilege principle. AWS requires this pattern of every third-party SaaS, and SaaS vendors provide automatic External ID generation.
