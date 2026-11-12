# Day 3 - Nested Stack, Cross-Stack Reference, StackSets: Large-Scale IaC Operations

Within Amazon, the "Two-Pizza Team" principle emerged in the mid-2000s: team size should be limited to what can be fed by two pizzas (5-8 people), and each team independently owns and deploys its service. This principle became the seed of microservices architecture.

CloudFormation faces the same challenge. A single template with thousands of lines exceeds the scope of "one team understands and owns everything." We need a way to separate IaC by team boundaries, safely share information between teams, and deploy standards across the entire organization. Nested Stack, Cross-Stack Reference, and StackSets solve this problem. These three tools address problems at different scales: "modularization within one application," "resource sharing across teams," and "standard deployment across the organization."

## Nested Stack: "Building Infrastructure Like LEGO Blocks"

Nested Stack is a pattern where one Stack contains another Stack as a resource (`AWS::CloudFormation::Stack`). It separates large templates into small components to increase reusability and limit the scope of impact when components change.

**Technical Operation of Nested Stack:**

When a parent Stack creates a resource of type `AWS::CloudFormation::Stack`, CloudFormation fetches the Template from the S3 URL and creates a separate Stack. Parent and child Stacks have separate Stack IDs but are bound to the parent's lifecycle. When the parent Stack is deleted, child Stacks are deleted in reverse order (opposite of dependency order).

**Hierarchical Design Example:**

```
Root Stack (parent.yaml)
├── NetworkStack (network.yaml) - VPC, Subnet, IGW, NAT, RouteTables
│   └── Outputs: VpcId, PublicSubnetIds, PrivateSubnetIds, NatGwEips
│
├── SecurityStack (security.yaml) - Standard Security Groups set
│   └── Outputs: WebSgId, AppSgId, DbSgId
│
├── DatabaseStack (database.yaml) - RDS, ElastiCache
│   └── Inputs: VpcId, PrivateSubnetIds, DbSgId
│   └── Outputs: DbEndpoint, CacheEndpoint
│
└── AppStack (app.yaml) - ALB, ECS, Auto Scaling
    └── Inputs: VpcId, PublicSubnetIds, WebSgId, AppSgId, DbEndpoint
```

**Real-World Parent Template:**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Root Stack - Production Web Application

Parameters:
  TemplateBucket:
    Type: String
    Default: my-cfn-templates-123456789012

Resources:
  NetworkStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/network.yaml'
      Parameters:
        VpcCidr: 10.0.0.0/16
        Environment: prod
      TimeoutInMinutes: 20
      Tags:
        - Key: Component
          Value: Network

  SecurityStack:
    Type: AWS::CloudFormation::Stack
    DependsOn: NetworkStack      # Technically unnecessary since dependency is expressed via !GetAtt, but explicit for clarity
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/security.yaml'
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId

  DatabaseStack:
    Type: AWS::CloudFormation::Stack
    DeletionPolicy: Retain       # Prevent accidental deletion of RDS in child Stack
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/database.yaml'
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
        SubnetIds: !GetAtt NetworkStack.Outputs.PrivateSubnetIds
        DbSgId: !GetAtt SecurityStack.Outputs.DbSgId

  AppStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/app.yaml'
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
        PublicSubnetIds: !GetAtt NetworkStack.Outputs.PublicSubnetIds
        WebSgId: !GetAtt SecurityStack.Outputs.WebSgId
        DbEndpoint: !GetAtt DatabaseStack.Outputs.DbEndpoint

# Parent exposes child Outputs to the outside
Outputs:
  AppUrl:
    Value: !GetAtt AppStack.Outputs.AlbDnsName
```

**Template Size Limits:**

| Method | Limit |
|--------|-------|
| `--template-body` (direct upload) | 51,200 bytes (50KB) |
| `--template-url` (S3 URL) | 1 MB |
| S3 file itself | up to 1 MB |

If Template exceeds 1 MB, either split into Nested Stacks or use CDK.

```bash
# Upload template to S3 and use URL
aws s3 sync ./templates/ s3://my-cfn-templates-123456789012/

aws cloudformation create-stack \
  --stack-name webapp-root \
  --template-url "https://s3.ap-northeast-2.amazonaws.com/my-cfn-templates-123456789012/parent.yaml" \
  --parameters ParameterKey=TemplateBucket,ParameterValue=my-cfn-templates-123456789012 \
  --capabilities CAPABILITY_NAMED_IAM

# Update child Stack directly (without parent)
aws cloudformation update-stack \
  --stack-name webapp-root-NetworkStack-XXXX \
  --template-url "https://s3.ap-northeast-2.amazonaws.com/my-cfn-templates-123456789012/network.yaml" \
  --parameters ParameterKey=VpcCidr,ParameterValue=10.0.0.0/16
```

> 💡 **Related Theory**: Nested Stack applies the software engineering principle of "Modularization" to infrastructure. David Parnas's 1972 paper "On the Criteria To Be Used in Decomposing Systems into Modules" defines the core principle: "Hide parts likely to change in one module." Even if the network team changes VPC CIDR, the application team's template remains unaffected because the change scope is encapsulated within NetworkStack. This is the same concept as information hiding in object-oriented programming. Nested Stack's `Outputs` are public interfaces, while internal implementation (subnet division, NAT GW count) remains hidden.

> 🔍 **Deeper Dive**: The parent-child relationship in Nested Stack is a **direct hierarchy** without dependency inversion. Since the parent accesses child Outputs, changing child Output names requires updating the parent template. To prevent this, define child Stack Output names as "stable interfaces" and avoid changing them. In production deployment, patterns use versioned S3 directories: `s3://my-bucket/templates/v1.2.0/network.yaml`. This enables Blue-Green style deployment: upload new template version to S3, test, then update parent Stack to switch.

> ⚠️ **Pitfall**: `DeletionPolicy` on Nested Stack applies to Stack resources, not the Stack itself. Setting `DeletionPolicy: Retain` on `DatabaseStack` resource preserves the Stack itself, not the resources inside (RDS, ElastiCache). To protect RDS inside child Stack, also set `DeletionPolicy: Snapshot` on the RDS resource in the child template.

## Cross-Stack Reference: "Independent Yet Connected"

Cross-Stack Reference shares values between completely independent Stacks. Unlike Nested Stack, there's no parent-child relationship, and each Stack has independent create/update/delete lifecycle. It's well-suited for resource sharing across team boundaries.

**Export/Import Mechanism:**

```yaml
# Stack A (network-stack): Create VPC then Export
Outputs:
  VpcId:
    Value: !Ref MyVpc
    Description: Shared VPC ID for all application stacks
    Export:
      Name: !Sub '${AWS::StackName}-VpcId'  # → network-stack-VpcId

  PrivateSubnetIds:
    Value: !Join [',', [!Ref PrivateSubnetA, !Ref PrivateSubnetB, !Ref PrivateSubnetC]]
    Export:
      Name: !Sub '${AWS::StackName}-PrivateSubnetIds'
    # → network-stack-PrivateSubnetIds = "subnet-aaa,subnet-bbb,subnet-ccc"

  DbSubnetGroupName:
    Value: !Ref DbSubnetGroup
    Export:
      Name: !Sub '${AWS::StackName}-DbSubnetGroupName'
```

```yaml
# Stack B (web-app-stack): Import from network-stack
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      # Select first subnet from comma-separated list
      SubnetId: !Select [0, !Split [',', !ImportValue 'network-stack-PrivateSubnetIds']]

  AppDatabase:
    Type: AWS::RDS::DBInstance
    Properties:
      DBSubnetGroupName: !ImportValue 'network-stack-DbSubnetGroupName'
      VpcSecurityGroupIds:
        - !ImportValue 'security-stack-DbSgId'
```

**Key Constraints and Operational Impact of Cross-Stack:**

| Constraint | Impact |
|-----------|--------|
| Export name must be unique per account+region | Naming convention needed (`stackname-exportname` pattern recommended) |
| Cannot change Export value while being imported | Stack B using it prevents Stack A from changing that Output |
| Cannot delete Stack A with active imports | Must remove ImportValue from Stack B first before deleting Stack A |
| `!ImportValue` cannot nest with other functions | `!Sub '${!ImportValue ...}'` not allowed, no intermediate variable |
| Cannot nest `!If` with `!ImportValue` in same template | Conditional import not possible |

```bash
# Find which Stacks use a specific Export
aws cloudformation list-imports \
  --export-name "network-stack-VpcId"

# List all Exports
aws cloudformation list-exports \
  --query 'Exports[*].[Name,ExportingStackId,Value]' \
  --output table

# If Export change needed: first identify importing Stacks
IMPORTERS=$(aws cloudformation list-imports \
  --export-name "network-stack-VpcId" \
  --query 'Imports[]' --output text)
echo "Stacks using this Export: $IMPORTERS"
# Must modify these Stacks first before changing network-stack VpcId Export
```

> 🔍 **Deeper Dive**: Cross-Stack's "cannot change Export while imported" constraint is identical to the "breaking change" problem in distributed systems. Just as an API server cannot change endpoints while clients use them, the same principle applies here. The workaround is the **"versioned Export name" pattern**: `network-stack-VpcId-v1`, `network-stack-VpcId-v2`. During migration, export both versions simultaneously. Consumer Stacks migrate to new version, then delete old. This mirrors API versioning with "Sunset Date" strategy: publish new version, give users migration window, then delete old.

**Nested Stack vs Cross-Stack Selection Criteria:**

| Situation | Recommended | Reason |
|-----------|-----------|--------|
| Separate single app into components | Nested Stack | Single deployment unit, parent orchestrates all |
| Multiple teams share infrastructure (VPC, IAM) | Cross-Stack Reference | Each team Stack has independent lifecycle |
| Different lifecycle resources | Cross-Stack Reference | VPC (permanent) vs app (periodic deploy) |
| Reusable standard component library | Nested Stack (S3 common template) | Single template source, easy reuse |
| Multiple deployment teams releasing independently | Cross-Stack Reference | Minimize coupling between Stacks |

## StackSets: "Deploy Organization-Wide in One Go"

StackSets deploy a single template to multiple AWS accounts in multiple regions simultaneously. It's a critical tool for implementing organization-wide standards like Landing Zones, security baselines, and monitoring standardization.

**StackSets Architecture:**

```
Management Account
    │
    └── StackSet "OrgSecurityBaseline"
            │ (one template, many targets)
            │
    ┌───────┼───────┬──────────┐
    ▼       ▼       ▼          ▼
 Account A Account B Account C Account D
 (Seoul,   (Seoul,  (Seoul    (Seoul,
  Virginia) Virginia) only)    Virginia,
                                Tokyo)
    │
    └── Stack Instance (one per account+region combination)
        Account A/Seoul: Stack Instance 1
        Account A/Virginia: Stack Instance 2
        ...
```

**Permission Model: Self-Managed vs Service-Managed**

| Characteristic | Self-Managed | Service-Managed |
|----------------|--------------|-----------------|
| Setup | Manually create Administration/ExecutionRole | Only enable Organizations Trusted Access |
| Target | Specify arbitrary account IDs | Specify Organizations OU |
| Auto-deployment | None | New accounts auto-included |
| Recommended use | Environments without Organizations | Organizations environments (strongly recommended) |

**Self-Managed Permissions:**

```bash
# 1. Create AdministrationRole in management account
aws iam create-role \
  --role-name AWSCloudFormationStackSetAdministrationRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "cloudformation.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 2. Grant permissions to AdministrationRole (Assume ExecutionRole)
aws iam attach-role-policy \
  --role-name AWSCloudFormationStackSetAdministrationRole \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# 3. Create ExecutionRole in each Target account
# (AdministrationRole in management account assumes this Role)
aws iam create-role \
  --role-name AWSCloudFormationStackSetExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::MANAGEMENT_ACCOUNT_ID:root"},
      "Action": "sts:AssumeRole"
    }]
  }'
```

**Service-Managed Permissions (Organizations integration, recommended):**

```bash
# Enable StackSets Trusted Access in Organizations (run once in management account)
aws organizations enable-aws-service-access \
  --service-principal stacksets.cloudformation.amazonaws.com

# Create StackSet (SERVICE_MANAGED)
aws cloudformation create-stack-set \
  --stack-set-name "OrgSecurityBaseline" \
  --template-body file://security-baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment 'Enabled=true,RetainStacksOnAccountRemoval=false' \
  --capabilities CAPABILITY_NAMED_IAM \
  --description "Org-wide: CloudTrail, GuardDuty, Config, SecurityHub"
```

`AutoDeployment=true` is key. When a new AWS account is added to an OU, an EventBridge event fires and CloudFormation automatically creates Stack Instance. With `RetainStacksOnAccountRemoval=false`, Stack Instance is deleted when account is removed from OU.

**Stack Instance Deployment:**

```bash
# Deploy to entire OU (multi-region, parallel)
aws cloudformation create-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets '{
    "OrganizationalUnitIds": ["ou-root-abc123", "ou-workloads-xyz456"]
  }' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType": "PARALLEL",
    "MaxConcurrentPercentage": 25,
    "FailureTolerancePercentage": 10
  }'

# Deploy to all OU except specific account
aws cloudformation create-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets '{
    "OrganizationalUnitIds": ["ou-workloads-xyz"],
    "AccountFilterType": "DIFFERENCE",
    "Accounts": ["111122223333"]
  }' \
  --regions ap-northeast-2

# Update StackSet (apply new template to all Stack Instances)
aws cloudformation update-stack-set \
  --stack-set-name "OrgSecurityBaseline" \
  --template-body file://security-baseline-v2.yaml \
  --operation-preferences '{
    "MaxConcurrentPercentage": 10,
    "FailureTolerancePercentage": 5,
    "RegionOrder": ["ap-northeast-2", "us-east-1", "eu-west-1"]
  }'
```

**Operation Preferences Options:**

| Option | Description | Recommended Value |
|--------|-------------|------------------|
| `MaxConcurrentCount` | Number of concurrent accounts (absolute) | 10~20 |
| `MaxConcurrentPercentage` | Percentage of concurrent accounts | 10~25% |
| `FailureToleranceCount` | Number of failed accounts tolerated | 10% of account count |
| `FailureTolerancePercentage` | Failure tolerance percentage | 5~10% |
| `RegionConcurrencyType` | Region deployment style | `SEQUENTIAL` (safe) or `PARALLEL` (fast) |
| `RegionOrder` | Region deployment order | Pilot regions first, then production |

> 📚 **Case Study**: In 2022, fintech company H restructured its account hierarchy with AWS Organizations and built an "org-wide security baseline" using StackSets. It included CloudTrail (all API logging), Config (baseline rules), GuardDuty (threat detection), and SecurityHub (unified security dashboard) deployed to all accounts. With Organizations + Service-Managed StackSets + AutoDeployment=true, security baseline automatically applied to new accounts instantly. Previous 1-2 days of manual setup became zero minutes. SOC2 Type II audit confirmed "identical security controls applied to all accounts" via StackSets operational records.

**StackSet Operations and Management:**

```bash
# Query Stack Instance status
aws cloudformation list-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --query 'Summaries[*].[Account,Region,Status,StatusReason]' \
  --output table

# Stack Instance status meanings:
# CURRENT: In sync with latest StackSet
# OUTDATED: StackSet updated but this Instance not yet applied
# INOPERABLE: Unrecoverable state (manual cleanup needed)

# StackSet Drift Detection (all Stack Instances simultaneously)
aws cloudformation detect-stack-set-drift \
  --stack-set-name "OrgSecurityBaseline" \
  --operation-preferences 'MaxConcurrentPercentage=10'

# Retry only failed Stack Instances
aws cloudformation update-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets 'Accounts=["111122223333"]' \
  --regions ap-northeast-2 \
  --operation-preferences 'MaxConcurrentCount=1,FailureToleranceCount=0'

# StackSet deletion order: Delete Stack Instances first, then StackSet
aws cloudformation delete-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets 'OrganizationalUnitIds=["ou-workloads-xyz"]' \
  --regions ap-northeast-2 us-east-1 \
  --no-retain-stacks  # Also delete actual Stacks in Stack Instances

aws cloudformation delete-stack-set \
  --stack-set-name "OrgSecurityBaseline"
# Error: Cannot delete if Stack Instances remain
```

## DependsOn: Explicit Dependency Relationships

CloudFormation automatically detects dependencies via `!Ref` or `!GetAtt`. However, when A must logically follow B but there's no code reference, use `DependsOn`.

```yaml
# Create EC2 after VPC Endpoints
# (EC2 needs VPC Endpoints to communicate with SSM)
WebServer:
  Type: AWS::EC2::Instance
  DependsOn:
    - S3GatewayEndpoint
    - SSMInterfaceEndpoint
  Properties:
    ImageId: !Ref AmiId
    SubnetId: !Ref PrivateSubnet

S3GatewayEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.s3'
    VpcId: !Ref MyVpc
    RouteTableIds: [!Ref PrivateRouteTable]

SSMInterfaceEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.ssm'
    VpcId: !Ref MyVpc
    VpcEndpointType: Interface
    SubnetIds: [!Ref PrivateSubnet]
    PrivateDnsEnabled: true
```

> ⚠️ **Pitfall**: Overusing `DependsOn` serializes creation and increases Stack creation time. CloudFormation naturally creates resources with no dependencies in parallel. Unnecessary `DependsOn` breaks this parallelism. Dependencies expressible via `!Ref` or `!GetAtt` don't need `DependsOn`. For example, if you reference SG ID via `!GetAtt SG.GroupId`, CloudFormation automatically creates SG before EC2. Adding `DependsOn: SG` on top is redundant.

## StackSets and SCP Interaction: Important Operational Pitfall

Important caution when SCP (Service Control Policy) and StackSets are used together.

**Scenario:** SCP forbids resource creation in a specific region (`aws:RequestedRegion` condition), but StackSets tries to deploy to that region?

Answer: Even if StackSets assumes ExecutionRole, SCP restrictions apply. SCP applies to all IAM entities in the account root, so CloudFormation operations via ExecutionRole are also subject to SCP. Stack Instance creation fails and may halt entire deployment depending on `FailureTolerancePercentage`.

**SCP + StackSets Safety Checklist:**

```bash
# Before deployment: Verify target region is allowed by SCP
# Simulate whether ap-northeast-2 is allowed in SCP
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::TARGET_ACCOUNT_ID:role/AWSCloudFormationStackSetExecutionRole \
  --action-names cloudformation:CreateStack \
  --resource-arns "*" \
  --context-entries 'ContextKeyName=aws:RequestedRegion,ContextKeyValues=["ap-northeast-2"],ContextKeyType=string'
```

> 💡 **Related Theory**: The combination of SCP and IAM policies follows AWS permission evaluation's "minimum intersection" principle. Effective permission = (SCP allows) ∩ (Permission Boundary allows) ∩ (Identity Policy allows). This follows set theory intersection where if any denies, result is deny. When designing StackSets, pre-simulate with IAM Policy Simulator to ensure deployment regions and operations fall within SCP allowance. This is mandatory.

> 📚 **Case Study**: In 2023, financial institution I restricted all resource creation outside ap-northeast-2 (Seoul) and us-east-1 (Virginia) via SCP. Later, StackSets attempted eu-west-1 (Ireland) deployment to meet European regulations. SCP constraints caused all Stack Instance creations to fail across hundreds of accounts. Repeated deploy→fail cycles caused CloudTrail event explosion. Solution: Isolated accounts needing eu-west-1 into separate OU and added eu-west-1 allowance to that OU's SCP only.

## CloudFormation Modules and Registry: Organizational Standard Types

AWS CloudFormation Modules package multiple resources into a reusable unit. Organizations can create modules implementing security standards so all teams use `Type: MyOrg::Security::HardenedEC2` the same way.

```yaml
# Module usage example (custom type)
Resources:
  WebServer:
    Type: MyOrg::Security::HardenedEC2Instance  # Custom module
    Properties:
      InstanceType: t3.medium
      SubnetId: !Ref PrivateSubnet
      # Internally includes IMDSv2 enforcement, CW Agent install, standard SG, encrypted EBS, etc.
```

Modules register in CloudFormation Registry, then organizations deploy modules to all accounts via StackSets, and each team uses them. This realizes "Governance as Code."

## Big Picture: When to Use What?

```
CloudFormation Pattern Selection Guide
============================================================

Q1: Want to modularize one application infrastructure within team
    └── Nested Stack (store component templates in S3)
        ★ Parent controls full lifecycle

Q2: Want to share resources (VPC, IAM) across multiple teams
    └── Cross-Stack Reference (Outputs.Export / !ImportValue)
        ★ Each Stack has independent lifecycle, loose coupling

Q3: Want to deploy security/monitoring standard to all org accounts
    └── StackSets (Service-Managed + Auto-deployment)
        ★ Organizations integration, new accounts auto-included

Q4: Want multiple teams to easily reuse pattern via standard type
    └── CFn Modules + Registry (type registry)
        ★ Governance as Code

Q5: Want to provide standard infrastructure to developers via self-service
    └── Service Catalog (productize CFn templates)
        ★ Catalog-based self-service (covered in Week 6 Day 4)
```

## 📝 Practice Questions

**Question 1.** A company manages 50 accounts with AWS Organizations. It wants to automatically enable CloudTrail and GuardDuty in all accounts, and to have accounts added in the future included automatically. What is the most suitable solution?

A) Manually deploy a CloudFormation Stack to each of the 50 accounts
B) Use StackSets with Service-Managed Permissions + `AutoDeployment=true`
C) Use a Lambda function to poll the Organizations API, detect new accounts, and run CloudFormation
D) Use Control Tower

**Answer: B**
Explanation: StackSets with Service-Managed Permissions integrates natively with Organizations. With `AutoDeployment=true`, an EventBridge event is raised when a new account is added to the OU, and CloudFormation automatically creates a Stack Instance. D (Control Tower) offers similar functionality, but it is a larger undertaking that requires moving the entire AWS environment structure to Control Tower. B can be implemented with the fewest changes while keeping the current organization structure.

---

**Question 2.** Stack A (a network Stack) exports the VPC ID and Stack B uses it with `!ImportValue`. An operator tries an update to Stack A that changes another property (the number of NAT Gateways). This update does not change the VPC ID Export value. What happens?

A) Stack A cannot be modified at all because Stack B is using the ImportValue
B) The Stack A update is allowed normally. There is no restriction because the Export value itself does not change
C) Stack B is also automatically updated
D) Stack B must be deleted first before updating Stack A

**Answer: B**
Explanation: The Cross-Stack constraint is that you cannot change or delete the value of an Export that is being imported, or the Export itself. Changing the number of NAT Gateways does not affect the VPC ID Export value, so it is allowed. The constraint applies when you try to change the Export name or Export value itself, or remove the Export from the Outputs.

---

**Question 3.** When using Nested Stacks, what happens when the parent Stack is deleted?

A) Only the parent Stack is deleted and the child Stacks remain independently
B) The child Stacks are deleted in reverse order and then the parent Stack is deleted (cascade)
C) It is determined by the DeletionPolicy of the child Stacks
D) The deletion is rejected

**Answer: B**
Explanation: In Nested Stacks, the parent controls the lifecycle of the children. When the parent Stack is deleted, the child Stacks are deleted in reverse order (the opposite of the dependency order). The `DeletionPolicy` of resources inside a child Stack also applies to cascade deletion across Stacks. That is, if an S3 bucket with `DeletionPolicy: Retain` is in a child Stack, that bucket is preserved even when the Stack is deleted.

---

**Question 4.** While deploying StackSets, 8 of 100 accounts failed with IAM permission errors. `FailureToleranceCount: 5` is set. What happens?

A) The 8 failures are ignored and deployment continues to the remaining 92
B) Since it exceeded 5, the entire deployment operation is stopped. Already deployed ones are kept and accounts not yet deployed do not proceed
C) A full rollback starts, including the accounts already deployed
D) Only the 8 failed ones are automatically retried

**Answer: B**
Explanation: FailureToleranceCount=5 means up to 5 account failures are tolerated. If 8 fail, the threshold (5) is exceeded, so the StackSets operation stops. Stack Instances that were already deployed successfully are not rolled back and are kept. The operation is not run on the remaining accounts scheduled for deployment. After resolving the IAM permission problem, the operator must retry only the failed accounts with `update-stack-instances`.

---

**Question 5.** Comparing Nested Stacks and Cross-Stack References, which approach should be used to manage shared network infrastructure such as a VPC and subnets, and why?

A) Nested Stack - it is safer because the parent controls the lifecycle
B) Cross-Stack Reference - a VPC outlives applications and must be referenced by independent Stacks from multiple teams, so an independent lifecycle for each Stack is important
C) Both approaches are equally suitable
D) Duplicating it directly in the Template is the safest

**Answer: B**
Explanation: A VPC is a far longer-lived and more stable resource than application Stacks. With a Nested Stack, the VPC becomes a "child" of a particular application Stack, so there is a risk that the VPC is also deleted when that application Stack is deleted. Separating with Cross-Stack lets the application Stacks of multiple teams reference the same VPC independently. As long as there are Stacks importing it, the VPC Stack cannot be deleted, which also helps prevent accidental deletion.

---

**Question 6.** An Organizations SCP allows only ap-northeast-2 and us-east-1 and denies resource creation in all other Regions. What happens if you try to deploy a new Stack Instance to eu-west-1 with StackSets?

A) Service-Managed StackSets can bypass the SCP, so it deploys normally
B) The ExecutionRole inherits the management account's permissions, so it deploys without SCP restrictions
C) The SCP also applies to the ExecutionRole, so the eu-west-1 deployment is denied and Stack Instance creation fails
D) StackSets are evaluated before the SCP, so it deploys normally

**Answer: C**
Explanation: An SCP applies to all IAM entities (users, roles) in the account. The StackSets ExecutionRole is no exception. If eu-west-1 is not allowed by the SCP, the ExecutionRole cannot call the CloudFormation API in eu-west-1. Depending on the `FailureTolerancePercentage` setting, this failure can stop the entire deployment. Solution: separate the accounts that need to use eu-west-1 into a separate OU and add a condition allowing eu-west-1 to that OU's SCP.
