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

## 📝 연습 문제

**문제 1.** Tooling 계정의 CodePipeline이 Prod 계정에 CloudFormation 스택을 배포한다. "CloudFormation API 호출은 성공하지만 스택 내 ECS Task Definition 생성이 실패한다"는 문제의 원인으로 가장 가능성 높은 것은?

A) CrossAccountDeployRole에 CloudFormation API 권한 부족  
B) CloudFormationExecutionRole에 ECS Task Definition 생성 권한(ecs:RegisterTaskDefinition, iam:PassRole) 부족  
C) KMS 복호화 실패  
D) S3 버킷 정책 오류  

**정답: B**  
해설: CloudFormation API 호출은 CrossAccountDeployRole이 담당하고, 실제 리소스 생성은 CloudFormationExecutionRole이 담당한다. CloudFormation API가 성공했다는 것은 CrossAccountDeployRole의 권한은 충분하다는 뜻이다. 스택 내 리소스 생성 실패는 CloudFormationExecutionRole에 해당 리소스(ECS Task Definition, 필요한 경우 iam:PassRole)를 생성할 권한이 없기 때문이다. 두 Role의 역할 분리를 명확히 이해해야 한다.

---

**문제 2.** StackSets의 OrganizationsAutoDeployment 옵션의 정확한 기능은?

A) 새 StackSet 인스턴스가 생성될 때 자동으로 배포를 시작한다  
B) 지정된 OU에 새 멤버 계정이 추가되면 자동으로 StackSet 인스턴스를 그 계정에 생성한다  
C) CloudFormation 스택 드리프트를 자동으로 복구한다  
D) SCP를 자동으로 적용한다  

**정답: B**  
해설: OrganizationsAutoDeployment는 OU 멤버십 변화(계정 추가)를 감지해 자동으로 StackSet 인스턴스를 생성하는 기능이다. Landing Zone 자동화의 핵심이다. 반대로 계정이 OU에서 제거되면 StackSet 인스턴스를 자동 삭제하는 옵션도 있다. 드리프트 복구(C)는 StackSets의 기능이 아니고, SCP 적용(D)은 Organizations의 별도 기능이다. SERVICE_MANAGED 모드에서만 사용 가능하고 SELF_MANAGED 모드에서는 이 옵션이 없다.

---

**문제 3.** 멀티 리전 CodePipeline에서 각 리전에 별도 Artifact S3 버킷과 KMS 키가 필요한 이유는?

A) 비용 분산을 위해  
B) KMS 키는 리전 범위 서비스이므로 다른 리전의 KMS 키로 암호화된 Artifact를 복호화할 수 없다  
C) S3 버킷은 글로벌이라서 필요 없지만 KMS는 리전별로 필요하다  
D) CodePipeline 서비스 제한으로 단일 S3 버킷은 여러 리전에서 사용 불가  

**정답: B**  
해설: KMS 키는 리전 범위 서비스다. 서울(ap-northeast-2) KMS 키로 암호화한 Artifact는 반드시 서울 KMS 키로만 복호화할 수 있다. 버지니아(us-east-1)의 CodeBuild가 서울 S3의 Artifact를 가져와도 복호화 API 호출은 서울 KMS 엔드포인트에 해야 한다. 이 레이턴시와 비용을 피하려면 각 리전에 S3 버킷과 KMS 키를 두는 것이 표준이다. S3는 리전 서비스지만 Cross-Region 읽기는 가능하다—그래서 기술적으로는 단일 S3 버킷도 가능하지만 KMS 레이턴시 문제로 각 리전 버킷을 권장한다.

---

**문제 4.** 여러 팀의 파이프라인이 단일 Pipeline Service Role을 공유한다. 팀 A의 파이프라인이 팀 B의 Prod 계정 Role을 AssumeRole하는 것을 방지하려면?

A) 팀별로 별도 Pipeline Service Role을 생성한다  
B) Spoke 계정의 Trust Policy에 PrincipalTag 조건을 추가해 특정 파이프라인 태그가 있는 경우에만 AssumeRole을 허용한다  
C) VPC 엔드포인트로 접근을 제한한다  
D) S3 버킷을 팀별로 분리한다  

**정답: B**  
해설: 두 방법 모두 유효하지만 B가 더 실용적이다. A(별도 Service Role)는 파이프라인이 많을수록 관리 부담이 증가한다. B의 PrincipalTag 방식은 단일 Service Role을 유지하면서 파이프라인별로 세분화된 접근 제어가 가능하다. Pipeline Service Role에 `Pipeline=teamA-checkout` 태그를 붙이고 Spoke의 Trust Policy에 `aws:PrincipalTag/Pipeline`을 조건으로 넣으면, 태그가 다른 파이프라인은 해당 Spoke Role을 AssumeRole할 수 없다.

---

**문제 5.** CloudFormation 스택에서 명시적 이름이 있는 IAM Role을 생성하려 한다. CodePipeline Action Configuration에 추가해야 하는 설정은?

A) `Capabilities: CAPABILITY_IAM`  
B) `Capabilities: CAPABILITY_NAMED_IAM`  
C) `Capabilities: CAPABILITY_AUTO_EXPAND`  
D) 별도 설정 불필요  

**정답: B**  
해설: CloudFormation이 명시적 이름이 있는 IAM 리소스(예: `RoleName: MySpecificRole`)를 생성할 때는 `CAPABILITY_NAMED_IAM`이 필요하다. 이름이 없는(자동 생성 이름) IAM 리소스는 `CAPABILITY_IAM`만으로 충분하다. `CAPABILITY_AUTO_EXPAND`는 nested stack이나 SAM Transform을 사용할 때 필요하다. 이 Capability를 누락하면 `InsufficientCapabilitiesException`이 발생하고 스택 배포가 실패한다. 실무에서는 보통 `CAPABILITY_IAM,CAPABILITY_NAMED_IAM`을 모두 넣어 둔다.

---

**문제 6.** Cross-Account 배포에서 외부 서드파티 CI/CD 시스템이 Spoke 계정 Role을 AssumeRole하는 Trust Policy에 Confused Deputy 방어를 위해 추가해야 하는 조건은?

A) aws:PrincipalTag  
B) sts:ExternalId  
C) aws:SourceIp  
D) aws:RequestedRegion  

**정답: B**  
해설: 서드파티 CI/CD(외부 시스템)가 Spoke 계정 Role을 AssumeRole하는 패턴에서 Confused Deputy 방어의 표준은 ExternalId다. ExternalId는 서드파티 시스템과 사전 합의한 비밀 값으로, Role을 AssumeRole할 때 이 값을 제공해야만 허용된다. 내부 멀티팀 환경에서는 PrincipalTag(A)가 더 적합하지만, 외부 시스템이 Principal인 경우 PrincipalTag를 강제하기 어렵다. aws:SourceIp(C)는 IP 주소 기반 제한으로 CI 서버 IP가 변하면 깨진다. OIDC를 지원하는 외부 CI(GitHub Actions)는 sub claim 조건이 ExternalId보다 더 강력하다.

---

**문제 7.** CloudFormation StackSet의 `MaxConcurrentPercentage: 50`과 `FailureTolerancePercentage: 20`이 100개 계정에 적용될 때의 동작은?

A) 전체를 50개씩 두 번 배포하고, 실패 계정이 20%를 초과하면 즉시 전체 중단한다  
B) 동시에 50개 계정에 배포하고, 최대 20개 계정이 실패해도 나머지 계정에 계속 배포한다  
C) 20개 계정에 먼저 배포 후 50개로 확대한다  
D) 50개 완료 시 수동 승인을 요청한다  

**정답: B**  
해설: MaxConcurrentPercentage는 동시에 배포하는 계정의 비율(속도 제어), FailureTolerancePercentage는 얼마나 많은 계정이 실패해도 계속 진행할지의 허용치(안정성 제어)다. 100개 계정에서: 동시에 50개 계정에 배포 시작, 20개 계정(20%)이 실패해도 나머지 계정에 계속 배포, 21개 계정이 실패하면 배포를 중단하고 실패로 표시. 두 파라미터는 독립적으로 작동한다—MaxConcurrentPercentage는 "얼마나 빠르게", FailureTolerancePercentage는 "얼마나 관대하게"를 제어한다.
