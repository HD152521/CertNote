# Day 2 - Multi-Account Pipeline: Why Cross-Account IAM Is Required

The most common enterprise AWS structure is "one Tooling account + multiple Spoke accounts." Development, staging, and production each have separate accounts, and the pipeline runs from central Tooling account. This structure simultaneously achieves security isolation (developers have no console access to Prod account), cost separation (per-account billing), and blast radius limitation (Prod account compromise doesn't affect Dev).

The problem is this structure demands significant IAM/S3/KMS configuration from pipeline engineers. Misconfiguration produces problems like "S3 works but decryption fails," "AssumeRole doesn't work," "deployment succeeded but permissions too broad." Today we understand this configuration's precise structure and why each element is required.

> 💡 **Related theory**: In AWS's security model, Account is the strongest isolation boundary. IAM Policy defines what Principals within same account can do, but cross-account action requires **bidirectional trust**. For Principal in Account A to access resources in Account B: (1) Account A IAM Policy must permit the action, and (2) Account B resource policy must permit Account A Principal—both conditions AND together. This is Cross-Account's fundamental principle; failure to understand this causes omission of one of the four permission chain elements.

## Hub-Spoke Pattern: Principle of Responsibility Separation

Before 2017, enterprises separated dev/staging/production environments within single AWS account using IAM policies. The problem: one IAM policy mistake affected entire environment, and "developer accidentally deletes production resource" incidents repeated. With AWS Organizations launch (November 2017), using account boundaries for isolation became industry standard, and the Hub-Spoke pattern emerged.

```
Tooling Account (Hub) — Pipeline execution responsibility
├── CodePipeline (orchestrator)
├── CodeBuild (build execution)
├── ECR (image registry)
├── Artifact S3 bucket + KMS CMK
└── Pipeline Service Role (IAM Role used by Pipeline)

Dev Account (Spoke) — Development environment resources
├── ECS / Lambda / CloudFormation stacks
├── CrossAccountDeployRole (Tooling assumes this)
└── CloudFormationExecutionRole (CFN uses for resource creation)

Staging Account (Spoke)
└── (same structure)

Prod Account (Spoke) — Most stringent control
├── (same structure)
├── SCP: DenyCreateUser, RequireMFA
└── CloudTrail centralized collection
```

> 💡 **Related theory**: SCP (Service Control Policy) sets maximum permission ceiling (Permission Ceiling) at account level. Attaching `DenyCreateIAMUser` SCP to Prod OU means nobody in Prod account can create IAM User—not even root account. IAM Policy can only grant permissions within SCP's allowance. The metaphor "SCP = account constitution, IAM Policy = individual laws" is accurate. No matter how broad IAM Policy is, if SCP denies it, it won't execute.

This structure has operational costs. For each Spoke account must create CrossAccountDeployRole and CloudFormationExecutionRole, and explicitly list each Spoke account Role in Tooling account's S3 bucket policy and KMS Key Policy. With 10+ accounts, this configuration becomes unmanageable without StackSets automation. AWS Control Tower and Account Factory handle this automation.

## Essential 4-Part Permission Configuration: The Precise Chain

For Cross-Account pipeline to function, permission must exist in exactly 4 places. Missing even one causes deployment failure. This chain must be followed in order to understand it.

**Permission chain flow**: CodePipeline → (AssumeRole) → CrossAccountDeployRole → (S3 GetObject) → Artifact → (KMS Decrypt) → Decryption → CloudFormation Deploy

### 1. Tooling Account — Pipeline Service Role must be able to AssumeRole

```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": [
    "arn:aws:iam::DEV-ACCT-ID:role/CrossAccountDeployRole",
    "arn:aws:iam::STG-ACCT-ID:role/CrossAccountDeployRole",
    "arn:aws:iam::PRD-ACCT-ID:role/CrossAccountDeployRole"
  ]
}
```

This goes in Pipeline Service Role's **Permission Policy (Identity Policy)**. It grants "this Role can impersonate another account's Role." AssumeRole doesn't succeed with this alone—Spoke account must accept this Trust (part 2).

### 2. Spoke Account — CrossAccountDeployRole's Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::TOOLING-ACCT-ID:role/CodePipelineServiceRole"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "aws:PrincipalTag/Pipeline": "checkout-pipeline"
      }
    }
  }]
}
```

This is **Resource Policy (Trust Policy)**. It defines "who can AssumeRole me." The `aws:PrincipalTag/Pipeline` condition is critical—AssumeRole is permitted only when Pipeline Service Role has tag `Pipeline=checkout-pipeline`. This is mechanism to separate permissions per-pipeline when multiple pipelines share same Service Role.

### 3. Tooling Account — Artifact S3 Bucket Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSpokeAccountsReadArtifact",
    "Effect": "Allow",
    "Principal": {
      "AWS": [
        "arn:aws:iam::DEV-ACCT-ID:role/CrossAccountDeployRole",
        "arn:aws:iam::STG-ACCT-ID:role/CrossAccountDeployRole",
        "arn:aws:iam::PRD-ACCT-ID:role/CrossAccountDeployRole"
      ]
    },
    "Action": [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:PutObject"
    ],
    "Resource": [
      "arn:aws:s3:::tooling-artifacts-bucket",
      "arn:aws:s3:::tooling-artifacts-bucket/*"
    ]
  }]
}
```

S3 bucket is in Tooling account. For Spoke account Role to retrieve Artifacts, bucket policy must explicitly permit Spoke Role. Even if parts 1-2 succeeded in AssumeRole, S3 bucket policy absence results in 403 GetObject rejection.

### 4. Tooling Account — KMS Key Policy

```json
{
  "Sid": "AllowSpokeAccountsDecrypt",
  "Effect": "Allow",
  "Principal": {
    "AWS": [
      "arn:aws:iam::DEV-ACCT-ID:role/CrossAccountDeployRole",
      "arn:aws:iam::PRD-ACCT-ID:role/CrossAccountDeployRole"
    ]
  },
  "Action": [
    "kms:Decrypt",
    "kms:DescribeKey",
    "kms:GenerateDataKey"
  ],
  "Resource": "*"
}
```

> ⚠️ **Pitfall**: Most common mistake is giving S3 bucket policy (part 3) while omitting KMS Key Policy (part 4). Error message doesn't look like "S3 Access Denied" and appears as vague Artifact extraction error, making root cause hard to find. KMS Key Policy is completely separate policy document from S3 bucket policy—no matter how correct S3 bucket policy, without KMS decrypt permission encrypted object can't be opened. KMS uses Envelope Encryption: S3 object is encrypted with Data Key, and this Data Key is encrypted again with KMS CMK. To read object, must decrypt Data Key with KMS CMK.

> 💡 **Related theory**: KMS Envelope Encryption principle. Encrypting large data directly with KMS API hits size limit (4KB). So KMS encrypts in two steps: (1) Generate temporary Data Key with KMS CMK, (2) Locally encrypt actual data with Data Key. What's stored in S3 is encrypted data + encrypted Data Key. On decryption, decrypt encrypted Data Key with KMS CMK, then use result to decrypt actual data. Why both `kms:Decrypt` and `kms:GenerateDataKey` needed in Cross-Account is due to these two steps.

## Two Roles: Action Role and CFN Execution Role

CloudFormation Deploy Action has two Roles that appear simultaneously. Their roles differ.

```json
{
  "name": "DeployToProd",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormation",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole",
  "configuration": {
    "ActionMode": "CREATE_UPDATE",
    "StackName": "checkout-service-prod",
    "TemplatePath": "BuildArtifact::cloudformation/template.yaml",
    "ParameterOverrides": "{\"ImageTag\": \"#{BuildVariables.IMAGE_TAG}\"}",
    "RoleArn": "arn:aws:iam::PRD-ACCT:role/CloudFormationExecutionRole",
    "Capabilities": "CAPABILITY_IAM,CAPABILITY_NAMED_IAM"
  },
  "inputArtifacts": [{"name": "BuildArtifact"}]
}
```

**`roleArn` (Action level)**: The Role that CodePipeline assumes to execute this Action. "Who calls CloudFormation API." Prod account's CrossAccountDeployRole goes here.

**`Configuration.RoleArn` (CFN level)**: The Role CloudFormation uses when creating/updating actual resources (ECS, IAM Role, Security Group, etc.). "What permissions does CloudFormation have to create resources." This Role must have permissions to create Prod account resources.

The reason for role separation is Least Privilege Principle. CrossAccountDeployRole only needs to call `cloudformation:CreateStack`, `cloudformation:UpdateStack` API. Actual resource creation permissions (ECS, EC2, IAM) belong only to CloudFormationExecutionRole. Without this separation, Tooling account would need broad Role to manipulate all Prod account resources directly.

> 🔍 **Deeper**: AWS CloudFormation's Role structure structurally resembles OAuth 2.0's Authorization Code Flow—dual Delegation pattern. CodePipeline (client) gets CrossAccountDeployRole (access token) to call CloudFormation API, and CloudFormation uses CloudFormationExecutionRole (service account) to manipulate actual resources. This dual Delegation allows CloudTrail to precisely track "who changed what resources." CloudTrail events show `assumedBy` and `invokedBy` fields recording which Role did which action. This traceability is essential in security audit.

> ⚠️ **Pitfall**: Confusion between `CAPABILITY_IAM` and `CAPABILITY_NAMED_IAM`. CloudFormation stack creating IAM resources needs `CAPABILITY_IAM`. However, when creating IAM resources with **explicit name** (fixed-name Role, User), `CAPABILITY_NAMED_IAM` is required. Unnamed IAM resources need only `CAPABILITY_IAM`. Including both doesn't fail, but including only `CAPABILITY_IAM` and trying to create explicitly-named Role results in `InsufficientCapabilitiesException` failure.

## CloudFormation StackSets and CodePipeline Integration

StackSets deploy single CloudFormation template to multiple accounts/regions simultaneously. Integration with CodePipeline allows handling "update Security Baseline in all accounts" in single pipeline execution.

```json
{
  "name": "DeployGuardrailsAllOUs",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormationStackSet",
    "version": "1"
  },
  "configuration": {
    "StackSetName": "OrgBaselineGuardrails",
    "TemplatePath": "BuildArtifact::guardrails/baseline.yaml",
    "DeploymentTargets": "OrganizationalUnitIds=ou-security-prod,ou-workloads",
    "Regions": "ap-northeast-2,us-east-1,eu-west-1",
    "PermissionModel": "SERVICE_MANAGED",
    "OrganizationsAutoDeployment": "Enabled",
    "MaxConcurrentPercentage": "50",
    "FailureTolerancePercentage": "20"
  }
}
```

Two Permission Models: **SELF_MANAGED vs SERVICE_MANAGED**.

`SELF_MANAGED` requires manually creating `AWSCloudFormationStackSetAdministrationRole` in account deploying StackSets and `AWSCloudFormationStackSetExecutionRole` in each target account. Works without Organizations but tedious when many accounts.

`SERVICE_MANAGED` available only in Organizations management account or Delegated Admin account. Organizations automatically creates needed Roles, so no manual Role setup required. Using with `OrganizationsAutoDeployment: Enabled` automatically creates StackSet instance in new account added to OU—core of Landing Zone automation.

> 💡 **Related theory**: StackSets deployment strategy is organization-level version of Canary deployment. Like single service Canary (traffic 1% → 10% → 100%), StackSets can "spread deployment 10% of accounts → 50% → 100%." `MaxConcurrentPercentage` controls how many % deploy simultaneously (speed control), `FailureTolerancePercentage` controls how many % can fail and continue (safety control). With 100 accounts, `MaxConcurrentPercentage=50, FailureTolerancePercentage=20`: deploy 50 simultaneously, continue if up to 20 fail, halt if 21 fail. AWS Control Tower uses this mechanism internally.

> 📚 **Case study**: Goldman Sachs Account Factory automation. 2021 re:Invent presentation on automating 1,000+ AWS accounts. They auto-deployed IAM Password Policy, CloudTrail, Config Rules, S3 Block Public Access to accounts using CodePipeline + StackSets (SERVICE_MANAGED) + Organizations AutoDeployment. Reduced new account onboarding from 2-3 days to under 30 minutes. Key is Security OU with `OrganizationsAutoDeployment: Enabled`—the moment account enters Security OU, Baseline applies automatically.

## Multi-Region Pipeline: Why Each Region Needs Separate Artifact Store

CodePipeline Action can run in different region from Tooling account default via `region` property. Pattern used for global services building in Korea, deploying to US and Europe.

```yaml
ArtifactStores:
  - Region: ap-northeast-2
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-kr
      EncryptionKey:
        Id: arn:aws:kms:ap-northeast-2:TOOLING:key/kr-key-id
        Type: KMS
  - Region: us-east-1
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-use1
      EncryptionKey:
        Id: arn:aws:kms:us-east-1:TOOLING:key/use1-key-id
        Type: KMS
  - Region: eu-west-1
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-euw1
      EncryptionKey:
        Id: arn:aws:kms:eu-west-1:TOOLING:key/euw1-key-id
        Type: KMS
```

Each region needs separate S3 bucket and KMS key because of **KMS's region scope**. KMS key works only in creation region. Artifact encrypted with Seoul (ap-northeast-2) KMS key must call Seoul KMS endpoint for decryption API—calling Virginia (us-east-1) KMS endpoint doesn't work.

> 🔍 **Deeper**: KMS region scope relates to HSM (Hardware Security Module) physical security requirements. KMS key material is processed only by HSM in that region's data center. If key crossed regions, satisfying GDPR (Europe), Privacy Law (Korea), FIPS 140-2 (US Government) data residency requirements becomes difficult. "In which region was this data encrypted/decrypted" is essential security audit tracking info, and KMS's region scope guarantees this traceability. Managing separate KMS keys per-region in multi-region pipeline is not mere technical constraint but compliance architecture decision. KMS Multi-Region Keys (launched 2021) allow replicating same key material to multiple regions via Primary/Replica structure, but even then each region has separate Replica Key ARN.

Multi-region pipeline Action definition example:

```json
{
  "name": "DeployToUSEast1",
  "region": "us-east-1",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormation",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole",
  "configuration": {
    "ActionMode": "CREATE_UPDATE",
    "StackName": "checkout-service-use1",
    "TemplatePath": "BuildArtifact::cloudformation/template.yaml"
  }
}
```

With `region: us-east-1`, CodePipeline automatically looks for BuildArtifact in `us-east-1` region's Artifact Store. This bucket is the one corresponding to `us-east-1` in `ArtifactStores` config.

## Confused Deputy Problem and Defense Patterns

Frequently mentioned security vulnerability in Cross-Account is **Confused Deputy (confused delegate)** problem. If one Role can access Spoke account for multiple customers/pipelines, malicious pipeline can make itself confused about which Spoke Role it should access.

**Attack scenario**: Pipeline A (team-a) and Pipeline B (team-b) share same Pipeline Service Role. If Spoke account Trust Policy conditions only on Pipeline Service Role ARN, team-a can modify their pipeline to specify team-b's Spoke Role ARN in Action's roleArn.

**3 Defense methods**:

Method 1 — aws:SourceArn condition (internal service):
```json
{
  "Condition": {
    "ArnLike": {
      "aws:SourceArn": "arn:aws:codepipeline:ap-northeast-2:TOOLING-ACCT:checkout-pipeline"
    }
  }
}
```

Method 2 — PrincipalTag condition (internal multi-team):
```json
{
  "Condition": {
    "StringEquals": {
      "aws:PrincipalTag/Pipeline": "checkout-pipeline",
      "aws:PrincipalTag/Environment": "prod"
    }
  }
}
```

Method 3 — ExternalId (external third-party):
```json
{
  "Condition": {
    "StringEquals": {
      "sts:ExternalId": "unique-secret-id-from-tooling"
    }
  }
}
```

> 💡 **Related theory**: Confused Deputy problem was first documented in Norm Hardy's 1988 paper. Original example was OS file system—program opens file inaccessible to itself via compiler. In AWS, scenario is "accessing truly unauthorized resources via trusted service (CodePipeline)." AWS's official solution is `aws:SourceArn`—meaning "permit this trusted service processing request for this specific resource (pipeline ARN) only." ExternalId is standard solution when Principal is third-party, while external CI supporting OIDC has stronger defense via OIDC subject claim condition.

> 🔍 **Deeper**: IAM Condition Key selection criteria. `aws:SourceArn` validates when AWS service accesses another account resource "what specific resource (resource ARN) this service is processing." `aws:PrincipalTag` uses IAM Role's attached tags as condition "what tag does this Role have." `sts:ExternalId` validates secret value provided during AssumeRole call. Of three methods, `aws:SourceArn` is most specific and hardest to forge, but only valid when AWS service is Principal. For third-party tools or own servers as Principal, must use ExternalId or OIDC.

## Hands-On Implementation: Automating Spoke Account Role Creation

```bash
# Run in Spoke (Prod) account
TOOLING_ACCOUNT_ID="111111111111"
PIPELINE_NAME="checkout-pipeline"

# 1. Create CrossAccountDeployRole
aws iam create-role \
  --role-name CrossAccountDeployRole \
  --assume-role-policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Principal\": {
        \"AWS\": \"arn:aws:iam::${TOOLING_ACCOUNT_ID}:role/CodePipelineServiceRole\"
      },
      \"Action\": \"sts:AssumeRole\",
      \"Condition\": {
        \"StringEquals\": {
          \"aws:PrincipalTag/Pipeline\": \"${PIPELINE_NAME}\"
        }
      }
    }]
  }"

# 2. Attach Permission Policy (minimum privilege: CFN API only)
aws iam put-role-policy \
  --role-name CrossAccountDeployRole \
  --policy-name CrossAccountDeployPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "cloudformation:CreateStack",
          "cloudformation:UpdateStack",
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks",
          "cloudformation:CreateChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DescribeChangeSet"
        ],
        "Resource": "arn:aws:cloudformation:ap-northeast-2:*:stack/checkout-*/*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ],
        "Resource": "arn:aws:s3:::tooling-artifacts-bucket/*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "kms:Decrypt",
          "kms:DescribeKey"
        ],
        "Resource": "arn:aws:kms:ap-northeast-2:111111111111:key/KMS-KEY-ID"
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": "arn:aws:iam::*:role/CloudFormationExecutionRole",
        "Condition": {
          "StringEquals": {
            "iam:PassedToService": "cloudformation.amazonaws.com"
          }
        }
      }
    ]
  }'
```

Reason for `iam:PassRole` with `iam:PassedToService` condition: prevent CrossAccountDeployRole from passing Role to arbitrary service. Restrict to CloudFormation only. Without this condition, attack passes Role to EC2, Lambda, etc. to expand permissions.

> 🎯 **Scenario**: Financial company has requirement "pipeline can deploy to Prod account, but must block creating IAM User or disabling S3 Block Public Access during deployment." Must use two layers. First, exclude these permissions from CrossAccountDeployRole and CloudFormationExecutionRole Permission Policies. Second (stronger defense), apply SCP `DenyCreateIAMUser` and `DenyS3PublicAccess` to Prod account OU. Permission Policy can be accidentally modified by Role owner, but SCP applies at account level—no Role, not even root, can bypass. During compliance audit when asked "can this account create IAM User technically," Permission Policy alone can't prove "impossible," but SCP makes it clear.

## Comparison: AWS CodePipeline vs Other CI/CD Cross-Account Approaches

| Characteristic | CodePipeline | Jenkins | GitHub Actions |
|---|---|---|---|
| **Cross-Account Authentication** | IAM AssumeRole (native) | Credentials Plugin + manual setup | OIDC Provider + AssumeRole |
| **Artifact Isolation** | S3 + KMS CMK (automatic) | Shared workspace (manual management) | Actions Cache (shared) |
| **Permission Chain** | Service Role → Action Role (explicit) | Server self-credentials | GitHub App Token → AWS Role |
| **Audit Trail** | CloudTrail (automatic) | Jenkins logs (manual retention) | GitHub Actions logs + CloudTrail |
| **Confused Deputy Defense** | aws:SourceArn, PrincipalTag | External ID (manual config) | OIDC sub claim condition |
| **Multi-Region** | ArtifactStores config native support | Plugin + manual setup | matrix strategy |

GitHub Actions's OIDC approach deserves attention. GitHub acts as OIDC Provider, AWS trusts this Provider. GitHub Actions workflow runs, GitHub issues JWT token, AWS STS validates and exchanges for IAM Role. No long-term credentials (Access Key) needed for AssumeRole.

> 📚 **Case study**: Netflix's multi-account deployment architecture. Netflix operates 100+ AWS accounts using Spinnaker (open-source CD tool) running in Tooling account. Each Spoke has SpinnakerDeployRole with Trust Policy listing Spinnaker's IAM Role ARN. Netflix chose Spinnaker over CodePipeline for multi-cloud support and sophisticated Canary analysis (Kayenta). But the IAM Cross-Account pattern itself is identical to CodePipeline—the same 4-part permission chain (AssumeRole, S3 bucket policy, KMS Key Policy) applies. Despite different tools, Cross-Account mechanisms in AWS are uniform.

## Summary

Cross-Account pipeline's core is **complete 4-part permission chain configuration**. Tooling account Pipeline Service Role must be able to AssumeRole (part 1), Spoke account Trust Policy permits this (part 2), S3 bucket policy (part 3) and KMS Key Policy (part 4) both list Spoke account Role. Missing any one part causes deployment failure. Most frequently omitted is KMS Key Policy—S3 access succeeds but encrypted Artifact decryption fails.

CloudFormation Deploy Action has two Roles. Action `roleArn` (CrossAccountDeployRole) calls CFN API; Configuration `RoleArn` (CloudFormationExecutionRole) creates actual resources. This separation realizes Least Privilege.

StackSets (SERVICE_MANAGED + OrganizationsAutoDeployment) with CodePipeline can auto-deploy Baseline across entire Organization. Multi-region deployment requires separate S3 bucket and KMS key per region due to KMS's region scope. Confused Deputy defense uses `aws:SourceArn`/`aws:PrincipalTag` for internal systems, `sts:ExternalId`/OIDC for external third-party.

---

## 📝 Practice Questions

**Question 1.** A CodePipeline in the Tooling account deploys a CloudFormation stack to the Prod account. What is the most likely cause of the problem "the CloudFormation API call succeeds, but creating the ECS task definition inside the stack fails"?

A) The CrossAccountDeployRole lacks CloudFormation API permissions  
B) The CloudFormationExecutionRole lacks permissions to create the ECS task definition (ecs:RegisterTaskDefinition, iam:PassRole)  
C) KMS decryption failure  
D) S3 bucket policy error  

**Answer: B**  
Explanation: The CrossAccountDeployRole is responsible for the CloudFormation API calls, and the CloudFormationExecutionRole is responsible for actually creating the resources. The CloudFormation API call succeeding means the CrossAccountDeployRole has sufficient permissions. A failure to create a resource inside the stack is because the CloudFormationExecutionRole lacks permission to create that resource (the ECS task definition and, if needed, iam:PassRole). You must clearly understand the separation of roles between the two roles.

---

**Question 2.** What is the exact function of the StackSets OrganizationsAutoDeployment option?

A) It automatically starts a deployment when a new StackSet instance is created  
B) When a new member account is added to a specified OU, it automatically creates a StackSet instance in that account  
C) It automatically remediates CloudFormation stack drift  
D) It automatically applies SCPs  

**Answer: B**  
Explanation: OrganizationsAutoDeployment detects OU membership changes (account additions) and automatically creates StackSet instances. It is key to landing zone automation. Conversely, there is also an option to automatically delete the StackSet instance when an account is removed from the OU. Drift remediation (C) is not a StackSets feature, and SCP application (D) is a separate Organizations feature. It is available only in SERVICE_MANAGED mode and this option does not exist in SELF_MANAGED mode.

---

**Question 3.** Why does a multi-Region CodePipeline need a separate artifact S3 bucket and KMS key in each Region?

A) To distribute costs  
B) KMS keys are Regional, so an artifact encrypted with a KMS key in another Region cannot be decrypted  
C) S3 buckets are global so they are not needed, but KMS is needed per Region  
D) Because of a CodePipeline service limit, a single S3 bucket cannot be used from multiple Regions  

**Answer: B**  
Explanation: KMS keys are Regional. An artifact encrypted with a Seoul (ap-northeast-2) KMS key can be decrypted only with the Seoul KMS key. Even if CodeBuild in Virginia (us-east-1) fetches the artifact from the Seoul S3 bucket, the decrypt API call must go to the Seoul KMS endpoint. To avoid this latency and cost, the standard is to have an S3 bucket and a KMS key in each Region. S3 is a Regional service but cross-Region reads are possible — so technically a single S3 bucket is also possible, but a bucket per Region is recommended because of the KMS latency issue.

---

**Question 4.** Pipelines of several teams share a single pipeline service role. How do you prevent team A pipeline from assuming team B Prod account role?

A) Create a separate pipeline service role for each team  
B) Add a PrincipalTag condition to the spoke account trust policy so that AssumeRole is allowed only when a specific pipeline tag is present  
C) Restrict access with VPC endpoints  
D) Separate the S3 buckets by team  

**Answer: B**  
Explanation: Both methods are valid, but B is more practical. With A (separate service roles), the management burden grows as the number of pipelines increases. The PrincipalTag approach in B keeps a single service role while allowing fine-grained access control per pipeline. If you attach a `Pipeline=teamA-checkout` tag to the pipeline service role and put `aws:PrincipalTag/Pipeline` as a condition in the spoke trust policy, pipelines with a different tag cannot assume that spoke role.

---

**Question 5.** You want to create an IAM role with an explicit name in a CloudFormation stack. What setting must be added to the CodePipeline action configuration?

A) `Capabilities: CAPABILITY_IAM`  
B) `Capabilities: CAPABILITY_NAMED_IAM`  
C) `Capabilities: CAPABILITY_AUTO_EXPAND`  
D) No additional setting is needed  

**Answer: B**  
Explanation: When CloudFormation creates an IAM resource with an explicit name (for example, `RoleName: MySpecificRole`), `CAPABILITY_NAMED_IAM` is required. For IAM resources without a name (auto-generated name), `CAPABILITY_IAM` alone is sufficient. `CAPABILITY_AUTO_EXPAND` is needed when using nested stacks or the SAM transform. If this capability is missing, an `InsufficientCapabilitiesException` occurs and the stack deployment fails. In practice, both `CAPABILITY_IAM,CAPABILITY_NAMED_IAM` are usually included.

---

**Question 6.** In a cross-account deployment, what condition should be added to the trust policy that lets an external third-party CI/CD system assume the spoke account role, to defend against the confused deputy problem?

A) aws:PrincipalTag  
B) sts:ExternalId  
C) aws:SourceIp  
D) aws:RequestedRegion  

**Answer: B**  
Explanation: In the pattern where a third-party CI/CD (an external system) assumes the spoke account role, the standard confused deputy defense is ExternalId. ExternalId is a secret value agreed in advance with the third-party system, and assuming the role is allowed only if this value is provided. In an internal multi-team environment PrincipalTag (A) is more suitable, but when the principal is an external system, it is hard to enforce PrincipalTag. aws:SourceIp (C) is an IP address-based restriction and breaks if the CI server IP changes. For an external CI that supports OIDC (GitHub Actions), the sub claim condition is stronger than ExternalId.

---

**Question 7.** What is the behavior when `MaxConcurrentPercentage: 50` and `FailureTolerancePercentage: 20` of a CloudFormation StackSet are applied to 100 accounts?

A) It deploys to all accounts in two rounds of 50 and immediately stops everything if failed accounts exceed 20%  
B) It deploys to 50 accounts at the same time and keeps deploying to the remaining accounts even if up to 20 accounts fail  
C) It deploys to 20 accounts first and then expands to 50  
D) It requests manual approval when 50 are complete  

**Answer: B**  
Explanation: MaxConcurrentPercentage is the percentage of accounts deployed to at the same time (speed control), and FailureTolerancePercentage is the tolerance for how many accounts can fail while still continuing (stability control). With 100 accounts: deployment starts on 50 accounts at once, continues to the remaining accounts even if 20 accounts (20%) fail, and if 21 accounts fail, the deployment stops and is marked as failed. The two parameters work independently — MaxConcurrentPercentage controls "how fast," and FailureTolerancePercentage controls "how tolerant."
