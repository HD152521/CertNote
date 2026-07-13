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

## 📝 연습 문제

**문제 1.** 회사가 AWS Organizations로 50개 계정을 관리한다. 모든 계정에 CloudTrail과 GuardDuty를 자동으로 활성화하고, 앞으로 새로 추가되는 계정도 자동으로 포함되길 원한다. 가장 적합한 솔루션은?

A) 50개 계정에 각각 CloudFormation Stack을 수동으로 배포한다
B) StackSets with Service-Managed Permissions + `AutoDeployment=true`를 설정한다
C) Lambda 함수로 Organizations API를 폴링해 새 계정을 감지하고 CloudFormation을 실행한다
D) Control Tower를 사용한다

**정답: B**
해설: StackSets with Service-Managed Permissions는 Organizations와 네이티브로 통합된다. `AutoDeployment=true`를 설정하면 새 계정이 OU에 추가될 때 EventBridge 이벤트가 발생하고 CloudFormation이 자동으로 Stack Instance를 생성한다. D(Control Tower)도 유사한 기능을 제공하지만 전체 AWS 환경 구조를 Control Tower로 전환해야 하는 더 큰 작업이다. B가 현재 조직 구조를 유지하면서 가장 최소 변경으로 구현 가능하다.

---

**문제 2.** Stack A(네트워크 Stack)가 VPC ID를 Export하고 Stack B가 `!ImportValue`로 사용 중이다. 운영자가 Stack A의 다른 속성(NAT Gateway 수)을 변경하는 업데이트를 시도한다. 이 업데이트는 VPC ID Export 값을 변경하지 않는다. 어떻게 되는가?

A) Stack B가 ImportValue를 사용 중이라 Stack A를 전혀 수정할 수 없다
B) Stack A 업데이트가 정상적으로 허용된다. Export 값 자체가 변경되지 않으므로 제약이 없다
C) Stack B도 함께 자동으로 업데이트된다
D) Stack A를 업데이트하기 전에 Stack B를 먼저 삭제해야 한다

**정답: B**
해설: Cross-Stack의 제약은 "Import 중인 Export의 값(Value) 또는 Export 자체를 변경/삭제할 수 없다"는 것이다. NAT Gateway 수 변경은 VPC ID Export 값에 영향을 주지 않으므로 허용된다. 제약은 Export 이름이나 Export 값 자체를 변경하거나, Export를 출력에서 제거하려 할 때 적용된다.

---

**문제 3.** Nested Stack을 사용할 때 부모 Stack을 삭제하면 어떻게 되는가?

A) 부모 Stack만 삭제되고 자식 Stack은 독립적으로 남는다
B) 자식 Stack들이 역순으로 삭제되고 그 다음 부모 Stack이 삭제된다 (cascade)
C) 자식 Stack들의 DeletionPolicy에 따라 결정된다
D) 삭제가 거부된다

**정답: B**
해설: Nested Stack에서 부모가 자식의 라이프사이클을 제어한다. 부모 Stack 삭제 시 자식 Stack들이 역순으로(의존성의 반대 순서) 삭제된다. 자식 Stack 내 리소스의 `DeletionPolicy`는 Stack 간 cascade 삭제에도 적용된다. 즉, `DeletionPolicy: Retain`이 설정된 S3 버킷이 자식 Stack에 있다면, 그 버킷은 Stack이 삭제되어도 보존된다.

---

**문제 4.** StackSets를 배포하는 중 100개 계정 중 8개에서 IAM 권한 오류로 실패했다. `FailureToleranceCount: 5`로 설정되어 있다. 어떻게 되는가?

A) 8개 실패는 무시되고 나머지 92개에 계속 배포된다
B) 5개를 초과했으므로 전체 배포 작업이 중단된다. 이미 배포된 것들은 유지되고 아직 미배포 계정들은 진행되지 않는다
C) 이미 배포된 계정들 포함 전체 롤백이 시작된다
D) 실패한 8개만 자동으로 재시도된다

**정답: B**
해설: FailureToleranceCount=5는 5개 계정 실패까지 허용한다는 의미다. 8개가 실패하면 임계값(5)을 초과하므로 StackSets 작업이 중단된다. 이미 성공적으로 배포된 Stack Instance들은 롤백되지 않고 유지된다. 나머지 배포 예정 계정들은 작업이 실행되지 않는다. 운영자는 IAM 권한 문제를 해결한 후 `update-stack-instances`로 실패한 계정들만 재시도해야 한다.

---

**문제 5.** Nested Stack과 Cross-Stack Reference를 비교할 때, VPC와 서브넷 같은 공유 네트워크 인프라를 관리하기 위해 어떤 방식을 사용해야 하는가? 그 이유는?

A) Nested Stack - 부모가 라이프사이클을 통제하므로 더 안전하다
B) Cross-Stack Reference - VPC는 애플리케이션보다 수명이 길고, 여러 팀의 독립적인 Stack이 참조해야 하므로 각 Stack의 독립적인 라이프사이클이 중요하다
C) 두 방식 모두 동일하게 적합하다
D) 직접 Template에 복제하는 것이 가장 안전하다

**정답: B**
해설: VPC는 애플리케이션 Stack들보다 훨씬 수명이 길고 안정적인 리소스다. Nested Stack을 사용하면 VPC가 특정 애플리케이션 Stack의 "자식"이 되어 그 애플리케이션 Stack 삭제 시 VPC도 삭제될 위험이 있다. Cross-Stack으로 분리하면 여러 팀의 애플리케이션 Stack이 독립적으로 동일한 VPC를 참조할 수 있다. Import를 사용하는 Stack들이 있는 한 VPC Stack 삭제가 불가능하므로 오히려 실수 삭제 방지 효과도 있다.

---

**문제 6.** Organizations SCP로 ap-northeast-2와 us-east-1만 허용하고 다른 모든 리전의 리소스 생성을 거부했다. StackSets로 eu-west-1에 새 Stack Instance를 배포하려 하면?

A) Service-Managed StackSets는 SCP를 우회할 수 있으므로 정상 배포된다
B) ExecutionRole은 관리 계정의 권한을 상속하므로 SCP 제약 없이 배포된다
C) SCP가 ExecutionRole에도 적용되므로 eu-west-1 배포가 거부되고 Stack Instance 생성이 실패한다
D) StackSets는 SCP 이전에 평가되므로 정상 배포된다

**정답: C**
해설: SCP는 계정 내 모든 IAM 엔티티(사용자, 역할)에 적용된다. StackSets의 ExecutionRole도 예외가 없다. eu-west-1이 SCP에서 허용되지 않으면 ExecutionRole이 eu-west-1에서 CloudFormation API를 호출할 수 없다. `FailureTolerancePercentage` 설정에 따라 이 실패가 전체 배포를 중단시킬 수 있다. 해결책: eu-west-1 사용이 필요한 계정들을 별도 OU로 분리하고 해당 OU의 SCP에 eu-west-1을 허용하는 조건을 추가한다.
