# Day 2 - Secrets Manager, Parameter Store, and CloudHSM: Three Tools for Handling Secrets and Configuration

Look at the statistics on software security incidents and you'll almost never find a case where "the encryption algorithm was broken." What you will find, every single week somewhere, is "a password / API key / DB credential got committed to a code repo in plaintext." By GitHub's own numbers, more than 12.5 million secrets were leaked to public repos over 2023, and 91% of them were automatically harvested by bots within 24 hours. In other words, the realistic assumption is that a secret is "stolen the instant it's exposed."

The cloud-era answer to this problem is a **central secrets manager**. Don't bake secrets into code, environment variables, or config files — store them in a dedicated service and have the application fetch them at startup using IAM permissions. That way the secret never lingers in plaintext anywhere in your code repo, CI logs, or container images, and rotation, auditing, and access control all become possible from one place. AWS split this problem across two services — **Secrets Manager** (launched April 2018, automatic rotation and highly available secret management) and **Systems Manager Parameter Store** (launched 2016, free storage for configuration and plaintext parameters). And beneath those sits **CloudHSM**, which satisfies the strictest compliance demands. In this article we'll look at what problem each of the three services answers, how to choose between them, and the scenarios you'll run into most often.

## The Core Value of Secrets Manager: Automatic Rotation and RDS Integration

Secrets Manager's biggest differentiator is **automatic rotation**. If all you need is "encrypt a secret with KMS and store it," Parameter Store SecureString is enough. But the requirement "automatically change the RDS password every 30 days, and at that moment have the application seamlessly pick up and use the new password" is something only Secrets Manager handles cleanly.

Automatic rotation works internally by triggering a Lambda function. AWS provides pre-built rotation Lambda templates for major databases like RDS / Aurora / Redshift / DocumentDB, and once the user just clicks "enable rotation," a 4-step lifecycle runs automatically.

```
[ Secrets Manager rotation: 4 steps ]

1) createSecret
   ├─ Generate a new password (random)
   ├─ Store it as the AWSPENDING version
   │  (AWSCURRENT is still the old password)

2) setSecret
   ├─ Apply the new password to the DB via the RDS API
   │  (change the RDS user's password)
   ├─ At this point the DB accepts both old + new passwords (brief window)

3) testSecret
   ├─ Test-connect to the DB with the new password
   │  Roll back on failure

4) finishSecret
   ├─ Promote AWSPENDING → AWSCURRENT
   ├─ Old password → AWSPREVIOUS (for rollback)
```

The key insight of this lifecycle is that **AWSCURRENT does not switch immediately — it's only promoted after testSecret succeeds**. If the new password is generated but applying it to the DB fails, AWSCURRENT stays on the old password, so the application doesn't grind to a halt. And because AWSPREVIOUS stays alive for a period, a client that happened to be holding an active connection at rotation time keeps working with the old password until its next reconnect. This is exactly why "zero-downtime rotation" is possible.

| Version label | Meaning | Lifetime |
|----------|------|------|
| `AWSCURRENT` | The currently valid secret | Until the next rotation |
| `AWSPENDING` | The new secret mid-rotation (awaiting validation) | During the rotation lifecycle |
| `AWSPREVIOUS` | The immediately prior secret (kept for rollback / transition) | For a period |

> 💡 **Related theory**: Secrets Manager's rotation model is called the **dual-credential pattern**, or **blue-green credentials**. You open a short window where the database or service accepts two credentials simultaneously, and during that window you gradually cut over to the new credential. This works because an RDS user can essentially change its password with `ALTER USER`, and existing connections aren't dropped when the password changes. You'll see the same pattern in Kubernetes Secrets + cert-manager, HashiCorp Vault's dynamic credentials, and elsewhere.

> 🔍 **Going deeper**: The RDS Proxy + Secrets Manager combination makes automatic rotation one step safer. RDS Proxy sits between the client and RDS doing connection pooling, and it can pull the password directly from Secrets Manager and operate with different credentials on the client side and the DB side. So even when rotation happens, the client only needs to know RDS Proxy's credentials, and RDS Proxy absorbs the backend password change. In environments like Aurora Serverless v2 where the connection count fluctuates frequently, this is a near-mandatory pattern.

> 📚 **Case study**: In 2020 a mobile gaming company switched its operational procedure of manually rotating the Aurora MySQL password every 90 days over to Secrets Manager automatic rotation. Before that, at every rotation an SRE would push the new password into a ConfigMap and redeploy the Pods, and a single failure caused a large-scale outage. After adopting Secrets Manager the rotation procedure was fully automated, and on a rotation failure it auto-rolled back at the testSecret step, so operational incidents dropped to zero for 18 months. The one troubleshooting headache they hit was "the rotation Lambda was in a different VPC from RDS, so setSecret failed due to a network issue" — placing the Lambda in the same VPC subnet as RDS became the operational standard.

## Parameter Store: The Zero-Cost Configuration Store

Systems Manager Parameter Store launched two years before Secrets Manager, and its basic usage is free. It's the best fit for storing "configuration that isn't secret" (e.g., DB hostname, S3 bucket name, environment variables), and it also supports KMS encryption via the SecureString type. So the most common pattern is a division of labor: "put only the secrets that truly need automatic rotation in Secrets Manager, and keep the rest of the configuration in Parameter Store."

| Item | Standard | Advanced |
|------|----------|----------|
| Parameter count | 10,000 per account/region | 100,000 |
| Value size | 4KB | 8KB |
| Policies (expiration, auto-notification) | X | O |
| Cost | Free | $0.05/param/month + API call cost |
| Throughput | 40 TPS by default (can be increased) | Same |
| SecureString (KMS) | Supported | Supported |

The fact that the Standard tier is free is decisive from an operating-cost standpoint. If 100 microservices each hold 20 configs per environment, you need 2,000 parameters — storing all of them in Secrets Manager costs $0.40/secret/month × 2,000 = $800/month. With Parameter Store Standard it's $0. So it makes sense to separate "real secrets that need rotation (DB passwords, API keys)" from "simple configuration (DB host, queue name)" when storing them.

```
[ Common division of labor ]

Secrets Manager (secrets that need rotation)
   ├─ /prod/rds/admin-password
   ├─ /prod/stripe/api-key
   └─ /prod/oauth/client-secret

Parameter Store (configuration + lightweight secrets)
   ├─ /prod/app/db-host
   ├─ /prod/app/s3-bucket-name
   ├─ /prod/app/feature-flags/new-checkout (value: true/false)
   └─ /prod/app/log-level (value: INFO)
```

Another advantage Parameter Store has is a **hierarchical namespace**. You can use slash-structured names like `/prod/app/db-host`, and pull an entire subtree under a given path at once with the `GetParametersByPath` API. That makes it possible for an application to load all its configuration in one shot at startup with `aws ssm get-parameters-by-path --path /prod/app --recursive --with-decryption`. Secrets Manager is weak at this kind of hierarchical lookup and requires fetching each secret individually.

> ⚠️ **Pitfall**: A common misconception is "I stored the password in Parameter Store as a SecureString, so rotation happens automatically too." SecureString provides only KMS encryption — it has no rotation feature. If you need rotation, you have to build a separate Lambda and trigger it with an EventBridge cron, and in the process you have to implement the dual-credential pattern yourself. One mistake means downtime, so for secrets that genuinely need rotation, going to Secrets Manager is far less operational burden.

> 🔍 **Going deeper**: Parameter Store and Secrets Manager actually overlap in some features. After Secrets Manager launched in 2018, AWS evolved both services for a while, then from 2020 clarified the guidance as "secrets = Secrets Manager, configuration = Parameter Store." So Parameter Store gained the ability to reference Secrets Manager secrets (`{{resolve:secretsmanager:...}}`), and conversely Secrets Manager came to support databases other than RDS (via custom rotation Lambdas) and user-defined rotation. As a result, the pattern where both services point at the same secret from two places (storing a Secrets Manager ARN under a Parameter Store name) is also common.

## Secrets Manager's Advanced Features: Multi-Region Replication and Resource Policies

The two features that give Secrets Manager a decisive edge over Parameter Store in enterprise environments are **multi-region replication** and **resource policies**.

Multi-region replication was added in March 2021. Create a secret in one region and turn on the "replicate to ap-northeast-2 and us-west-2" option, and whenever the source changes (including rotation) the replicas are automatically updated too. It's usable for both active-passive and active-active DR scenarios, and you can call GetSecretValue directly in the replica region, so latency is low too. Parameter Store has no such automatic replication and forces you to sync it yourself with scripts.

A resource policy is a feature that attaches a policy to the secret itself to grant access to a Principal in another account. For example, when a SaaS company wants to share part of a secret with a customer account, it allows the customer account root as a Principal in the secret's resource policy. Then the customer only has to grant its own account's IAM Role the `secretsmanager:GetSecretValue` permission to fetch the SaaS company's secret directly.

```json
// Secrets Manager resource policy example (allowing another account)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCustomerAccess",
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::222222222222:root"},
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"secretsmanager:VersionStage": "AWSCURRENT"}
    }
  }]
}
```

The catch is that you have to share the secret's KMS key along with it. Secrets Manager encrypts the secret with KMS, so for another account to fetch the secret, both (1) the Secrets Manager resource policy and (2) the KMS key policy must allow that account. Miss either of these two steps and you get an `AccessDenied` — but the message doesn't tell you which one is blocking, which makes troubleshooting tricky.

> 📚 **Case study**: In 2022 a payments SaaS used the Secrets Manager cross-account pattern to share a "test secret key" with a customer. At first they set only the resource policy and used the AWS Managed Key (`aws/secretsmanager`) for KMS — but AWS Managed Keys can't be shared cross-account, so every customer got a `KMSAccessDeniedException`. After switching to a CMK and adding the customer account root to the key policy, it worked correctly. Afterward, "any secret that needs cross-account sharing must use a CMK" went into the company's standard guidelines.

## CloudHSM: Only When Compliance Demands It

CloudHSM is a dedicated, customer-only hardware security module operated by AWS. KMS also runs on HSMs internally, but it's multi-tenant, whereas CloudHSM is **single-tenant** — only one customer's workload runs on that HSM cluster. You get FIPS 140-2 Level 3 certification under your own name, and its biggest defining trait is that not even AWS employees can access the key material.

| Item | KMS CMK | CloudHSM |
|------|---------|----------|
| Tenancy | Multi-tenant | Single-tenant |
| FIPS certification | 140-2 Level 3 (under AWS's name) | 140-2 Level 3 (under the customer's name) |
| Key control | AWS also holds operational authority | No AWS employee access |
| AWS service integration | Nearly all services | Via KMS XKS, or PKCS#11/JCE directly |
| Operational burden | Almost none | You design cluster management and HA yourself |
| Cost | $1/key/month + calls | $1.45 per HSM instance-hour |
| Where it's used | Most scenarios | Strong regulation (finance/government), SSL offload, IBM HSM migration |

CloudHSM's operational model is completely different from KMS. You create a CloudHSM cluster inside a VPC, distribute HSM instances across multiple AZs, and design high availability yourself. You manage client certificates and communicate directly through standard interfaces like PKCS#11 / JCE / OpenSSL Dynamic Engine. Cost is also billed per instance-hour (over $2,000/month for a 2-AZ setup), so unless it's a "genuinely required" case, KMS is overwhelmingly more favorable.

The scenarios where CloudHSM is the answer are usually three. ① When a regulation explicitly requires that "not even AWS employees may access the keys" (some finance / government / healthcare). ② When migrating from an existing on-premises HSM (IBM 4768, Thales nShield) to the cloud. ③ When you need to use SSL/TLS keys inside the HSM so that the web server's private key is never exposed in plaintext in memory. Otherwise, a KMS CMK + Customer Managed Key policy can satisfy nearly every compliance requirement.

> 💡 **Related theory**: FIPS 140-2 Levels 1-4 are the cryptographic-module security grades defined by NIST. Level 1 is software, Level 2 is hardware that shows tamper evidence, Level 3 is tamper-resistant hardware + user authentication, and Level 4 zeroizes the key material the instant tampering is detected. Most commercial HSMs are Level 3, and Level 4 is military / national-secret grade. Card-industry regulations like PCI DSS require Level 2 or higher, and some government regulations (e.g., parts of Korea's ISMS-P requirements) require Level 3 or higher. CloudHSM being Level 3 is usually the reason it's sufficient.

> 🔍 **Going deeper**: The **KMS External Key Store (XKS)**, launched in 2022, acts as a bridge connecting KMS to CloudHSM (or an external KMIP server). The key material lives in the external HSM and KMS operates as a proxy, so you can keep your keys in an external HSM while still using KMS's rich service integrations (S3, EBS, RDS, etc.) unchanged. It's the pattern that answers the regulatory demand of "we manage the keys ourselves" + "we still want to use AWS services as-is" — but there's a risk that if the external HSM goes down, KMS can't operate with those keys either, so it needs additional availability design.

## Standard Usage Patterns on EC2, Lambda, and ECS

How you fetch these three services from compute is the part you deal with most often in practice.

**Lambda** most commonly puts just the ARN in an environment variable and fetches it directly from code via the SDK. It fetches once at cold start and caches it in memory.

```python
import boto3, json, os
from functools import lru_cache

@lru_cache(maxsize=1)
def get_db_password():
    client = boto3.client("secretsmanager")
    resp = client.get_secret_value(SecretId=os.environ["DB_SECRET_ARN"])
    return json.loads(resp["SecretString"])["password"]
```

The catch is that even after a secret rotates, if the Lambda doesn't cold-start again it can keep holding the old value. That's why the **AWS Parameters and Secrets Lambda Extension**, launched in 2022, has effectively become the standard. The extension provides a local HTTP cache, and once the TTL (5 minutes by default) passes it automatically re-fetches. Your code just calls `http://localhost:2773/secretsmanager/get?secretId=...`, and the extension handles IAM permissions and caching for you.

**ECS Task** injects the secret as an environment variable at container startup when you put the ARN in the `secrets` section of the task definition. You get the secret with no code changes.

```json
{
  "containerDefinitions": [{
    "name": "app",
    "secrets": [
      {"name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..."}
    ]
  }]
}
```

**EC2** standardly receives permissions via an IAM Instance Profile and fetches from UserData. Or, if the EC2 has strong security requirements, connecting without a password via EC2 Instance Connect or SSM Session Manager is safer.

> ⚠️ **Pitfall**: The anti-pattern of putting the secret itself in plaintext in a Lambda environment variable is extremely common. Lambda environment variables are encrypted with KMS, but they can appear in plaintext in the console and in CloudTrail, and if you deploy with IaC (Terraform/CDK) they also remain in plaintext in the state file. The correct answer is always "only the ARN in the environment variable, fetch via the SDK in code."

## Hands-On with the CLI

```bash
# Create a Secrets Manager secret (RDS password format)
aws secretsmanager create-secret \
  --name prod/rds/admin \
  --secret-string '{"username":"admin","password":"InitialPass!"}' \
  --kms-key-id alias/saa-app \
  --tags Key=Environment,Value=production

# Automatic RDS rotation (30 days, using the AWS-provided Lambda)
aws secretsmanager rotate-secret \
  --secret-id prod/rds/admin \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111:function:SecretsManagerRDSPostgreSQLRotationSingleUser \
  --rotation-rules AutomaticallyAfterDays=30

# Multi-region replication
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/rds/admin \
  --add-replica-regions Region=us-west-2,KmsKeyId=alias/saa-app-uswest2

# Get a secret (AWSCURRENT automatically)
aws secretsmanager get-secret-value --secret-id prod/rds/admin

# Get a previous version (for rollback)
aws secretsmanager get-secret-value --secret-id prod/rds/admin --version-stage AWSPREVIOUS

# Parameter Store Standard SecureString
aws ssm put-parameter \
  --name /prod/app/api-key \
  --value "secret-value" \
  --type SecureString \
  --key-id alias/saa-app

# Fetch everything at once with a hierarchical lookup
aws ssm get-parameters-by-path \
  --path /prod/app \
  --recursive \
  --with-decryption

# Reference a Secrets Manager secret from Parameter Store
aws ssm put-parameter \
  --name /prod/app/db-secret-ref \
  --value "{{resolve:secretsmanager:prod/rds/admin:SecretString:password}}" \
  --type String

# Create a CloudHSM cluster
aws cloudhsmv2 create-cluster \
  --hsm-type hsm1.medium \
  --subnet-ids subnet-aaa subnet-bbb

# Add a CloudHSM instance (per AZ)
aws cloudhsmv2 create-hsm \
  --cluster-id cluster-1234 \
  --availability-zone ap-northeast-2a
```

## Wrapping Up

AWS's three tools for handling secrets and configuration have a clear division of labor. **Secrets Manager** is for real secrets that need automatic rotation and RDS/DocumentDB integration, **Parameter Store** is for configuration and lightweight secrets stored for free, and **CloudHSM** is for when compliance demands a standalone HSM. On the exam it's quickly solved by keyword matching (automatic rotation → Secrets Manager, free → Parameter Store, FIPS L3 + dedicated → CloudHSM), but in practice two pitfalls are the most common — ① the anti-pattern of putting secrets in plaintext in code/environment variables, and ② the mistake of assuming a SecureString is rotatable. For any secret that needs rotation, going straight to Secrets Manager is the least operational burden.

In the next article we'll look at the tools that manage the users themselves — Cognito User Pools and Identity Pools. Where KMS and Secrets Manager handle "the secrets of internal systems," Cognito handles "authentication and authorization of end users," and full-stack security is only complete when the tools from both domains come together.

---

## 📝 연습 문제

**문제 1.** A company needs to automatically rotate its RDS PostgreSQL admin password every 30 days, with no application downtime during rotation. What is the most suitable solution?

A) Parameter Store SecureString + a cron Lambda for rotation
B) Secrets Manager + the AWS-provided RDS rotation Lambda + a 30-day schedule
C) Store the password in CloudHSM and change it manually every 30 days
D) Bake the password into an EC2 environment variable and rotate it with cron

**정답: B**

해설: Secrets Manager lets you use the AWS-provided rotation Lambda template as-is for RDS / Aurora / Redshift / DocumentDB, and it guarantees zero-downtime rotation through the 4-step lifecycle of AWSPENDING → testSecret → promote to AWSCURRENT. Since it auto-rolls back on testSecret failure, operational safety is high too. A is risky because you'd have to implement the dual-credential pattern yourself. C doesn't automate rotation. D is a security anti-pattern.

---

**문제 2.** A SaaS company operating 200 microservices wants to centrally manage per-environment configuration (DB host, queue name, feature flags, etc.). Most of it is ordinary configuration, not secrets, and they want to minimize cost. What is the most suitable service?

A) Store everything in Secrets Manager
B) Parameter Store Standard (free + SecureString support)
C) CloudHSM
D) Build your own table in DynamoDB

**정답: B**

해설: The Parameter Store Standard tier is free and supports a hierarchical namespace (`/prod/app/...`) and `GetParametersByPath` bulk lookups. Even if 200 services each hold dozens of configs, the cost is $0. Storing everything in Secrets Manager runs $0.40/secret/month, accumulating into hundreds-to-thousands of dollars. The standard pattern is to split off only real secrets like passwords into Secrets Manager and keep the rest in Parameter Store.

---

**문제 3.** A company is running in us-east-1 and is preparing DR to ap-northeast-2. It needs to keep the RDS password identical in both regions, and when it rotates in us-east-1 the change must be reflected in ap-northeast-2 immediately. What is the most suitable approach?

A) Add ap-northeast-2 replication with Secrets Manager Replication
B) Store it in Parameter Store and sync with cron
C) Store the secret as a JSON file in S3 and replicate with CRR
D) Query the us-east-1 secret directly every time

**정답: A**

해설: Secrets Manager multi-region replication (launched 2021) was designed for exactly this scenario. When the source rotates, the replica is automatically updated, and you can call GetSecretValue directly in the replica region, so latency is low too. B requires implementing a sync script yourself. C is an anti-pattern for both security and operations. D has cross-region latency and availability problems.

---

**문제 4.** A financial company has a regulatory requirement: "no AWS employee may access the key material, and FIPS 140-2 Level 3 certification must be obtained under the company's own name." What is the most suitable service?

A) KMS Customer Managed Key
B) Secrets Manager
C) CloudHSM
D) Parameter Store SecureString

**정답: C**

해설: CloudHSM is a single-tenant HSM and its FIPS 140-2 Level 3 certification is obtained under the customer's name. The decisive difference from KMS is that not even AWS employees can access the key material. KMS also runs on HSMs internally, but it's multi-tenant and the certification is under AWS's name. Generally, without regulation this strict, a KMS CMK is more favorable on both cost and operations — but when the requirement is explicit, CloudHSM is the answer.

---

**문제 5.** A Lambda function fetches the DB password from Secrets Manager. The secret rotates every 30 days, but the Lambda occasionally calls with the old password and authentication fails. What is the best solution?

A) Force the Lambda to cold-start every time
B) Use the AWS Parameters and Secrets Lambda Extension (TTL caching + auto-refresh)
C) Bake the password directly into a Lambda environment variable
D) Turn off rotation and manage manually

**정답: B**

해설: The AWS Parameters and Secrets Lambda Extension is the standard tool launched in 2022. It provides a local HTTP cache (localhost:2773) and automatically fetches a new value once the TTL (5 minutes by default) passes. With one line of code you get caching and rotation-handling at the same time. A blows up cost and latency. C is an anti-pattern that contradicts rotation. D gives up rotation's security benefit.

---

**문제 6.** A system stored an API key in a Parameter Store SecureString. It needs automatic rotation every 90 days, but you've learned that SecureString has no rotation feature. What is the most appropriate action?

A) Migrate to Secrets Manager + AWS Lambda rotation
B) Change the SecureString to a plaintext String
C) Have a Lambda generate a new key daily and directly modify the SecureString (no dual-credential support)
D) Switch to KMS Multi-Region Keys

**정답: A**

해설: SecureString provides only KMS encryption and has no rotation feature. When automatic rotation is needed, moving to Secrets Manager is the standard, and you can write a custom rotation Lambda yourself or register a rotation function for an external system (e.g., a Stripe API key). C, replacing only the key directly without dual-credential support, causes active calls to fail at rotation time. B and D are unrelated to the problem.

---

**문제 7.** A company wants to fetch a Secrets Manager secret from an EKS Pod. What is the most recommended approach?

A) Bake the secret in plaintext into Pod environment variables
B) IRSA (IAM Roles for Service Accounts) + direct GetSecretValue via the AWS SDK, or mount it with the Secrets Store CSI Driver
C) Store it in plaintext in a ConfigMap
D) Grant permissions to all Pods via the Node IAM Role

**정답: B**

해설: IRSA is the standard pattern for scoping IAM permissions per Pod, and the Secrets Store CSI Driver mounts Secrets Manager secrets into the file system so they can be used with no code changes. A and C are security anti-patterns, and D can't separate permissions (every Pod gets the same permissions). The standard recommendation in an EKS environment is the IRSA + CSI Driver combination.

---

해설 보강: Secrets Manager, Parameter Store, and CloudHSM are quickly solved by keyword matching on the exam, but in practice the design is decided along four axes — "secret classification (real secret vs. simple config) + rotation automation + multi-region + caching." Remember the division-of-labor principle — Secrets Manager for secrets that need rotation, Parameter Store for general configuration, CloudHSM when compliance forces it — and 90% of scenarios solve themselves automatically.
