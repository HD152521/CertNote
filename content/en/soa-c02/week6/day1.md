# Day 1 - CloudFormation: Infrastructure as Code from the Operator's Perspective

In 2011, Netflix released "Chaos Monkey"—a tool that randomly terminates production instances. This tool could exist because Netflix managed infrastructure as code. When instances died, CloudFormation (or the IaC tool of that time) automatically recreated identical instances. Chaos Monkey would have been a disaster with manually configured infrastructure.

CloudFormation is AWS's official IaC (Infrastructure as Code) service. Launched February 2011, it started with JSON templates and now defaults to YAML. In SOA-C02, CloudFormation isn't simply an "infrastructure creation tool" but rather an operational platform where "operators safely manage changes, detect state drift, and auto-recover on failure."

## History of IaC and CloudFormation's Position

IaC concepts systematized in 2006 by Mark Burgess (CFEngine author) in "In Search of Certainty." The core principle: "describe the system's desired state declaratively." Chef (2009), Puppet Enterprise (2011), Ansible (2012), and Terraform (2014) followed. Terraform, announced 2014 by HashiCorp's Mitchell Hashimoto with "Write, Plan, Apply" workflow, became industry standard.

CloudFormation's unique position is being **completely AWS-native**. While other IaC tools treat AWS as one provider, CloudFormation is AWS itself. When AWS launches new services, CloudFormation resource types appear within days or weeks. Terraform requires community or HashiCorp Provider updates for new services.

**IaC Tool Advanced Comparison:**

| Characteristic | CloudFormation | Terraform | Pulumi | CDK | Ansible |
|------|---------------|-----------|--------|-----|---------|
| Language | JSON/YAML | HCL | Python/TS/Go/C# | TS/Python/Java/Go | YAML + Jinja2 |
| State Management | AWS internal (Stack) | S3+DynamoDB files | Pulumi Cloud / S3 | Converted to CFn | None (idempotent run) |
| AWS Integration | Completely native | Via Provider | Via Provider | Via CFn conversion | boto3/module |
| Multi-cloud | No | Yes | Yes | No | Yes |
| Drift Detection | Built-in | `terraform plan` | `pulumi refresh` | CDK Drift | No |
| Rollback | Automatic | Manual | Manual | Automatic (via CFn) | No |
| Released | 2011 | 2014 | 2018 | 2019 | 2012 |
| Open Source | No | Yes (BSL) | Yes | Yes | Yes |

> 💡 **Related Theory**: CloudFormation's "Declarative" approach resembles set theory in mathematics. "This set (infrastructure) should contain these elements (resources)"—the system calculates difference between current and goal state and converges. Contrasts with Imperative Shell scripts describing "Step 1: Create EC2, Step 2: Create SG...". Declarative's core is **Idempotency**: applying same template multiple times yields identical results. This concept traces to Dijkstra's "Separable Abstraction" principle, even to 1970s hardware machine independence debates—the software version.

> 🔍 **Deeper Dive**: CloudFormation engine internally uses **DAG (Directed Acyclic Graph)** for resource dependency analysis. When dependencies defined via `!Ref` and `!GetAtt`, CFn performs topological sorting, determining which resources to create first and which can parallel. Explicit `DependsOn` captures implicit dependencies (e.g., IAM permission propagation delay). This DAG approach mirrors GNU Make Makefile dependency analysis, Apache Airflow DAG scheduling—all founded in same CS theory.

## CloudFormation Engine Internal Operation

When CloudFormation receives `create-stack`:

**Step 1: Template Parsing and Validation**
- JSON/YAML parsing → internal representation
- 10-section structure validation
- Intrinsic Functions interpretation (recursive evaluation)
- Circular reference detection (blocks A → B → A)

**Step 2: Dependency Graph Construction**
- Extract implicit dependencies from `!Ref` and `!GetAtt`
- Add explicit dependencies from `DependsOn`
- Validate DAG (no cycles)
- Topological sort determines creation order

**Step 3: Parallel Resource Creation**
- Create resources without dependencies simultaneously
- Wait for dependent resources' predecessors
- Poll each resource API call for completion
- Emit CloudWatch Events stream

**Step 4: CreationPolicy Signal Waiting (if specified)**
- Wait to receive Count cfn-signal signals
- Timeout → failure handling
- Success signal → proceed to next step

**Step 5: Finalize Stack State**
- All resources successful → `CREATE_COMPLETE`
- Any resource fails → start `ROLLBACK_IN_PROGRESS`

```
CloudFormation Internal Processing Flow:

Template YAML
    │
    ▼
┌─────────────────────────────────────────┐
│  CFn Parser                             │
│  - JSON/YAML → IR (Internal Repr.)      │
│  - Intrinsic Function evaluation        │
│  - Pseudo Parameter substitution        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Dependency Analyzer (DAG Builder)      │
│  !Ref / !GetAtt → implicit dependencies │
│  DependsOn → explicit dependencies      │
│  Topological Sort → execution plan      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Resource Executor (parallel)           │
│  ┌─────────┐  ┌─────────┐             │
│  │ IAM Role│  │  VPC    │  (parallel)  │
│  └────┬────┘  └────┬────┘             │
│       └─────┬──────┘                   │
│             ▼                          │
│        ┌─────────┐                     │
│        │EC2 inst │  (after both above)  │
│        └─────────┘                     │
└─────────────────────────────────────────┘
```

## Template 10 Sections: Only What Operators Need to Know

CloudFormation Template has up to 10 sections. Only `Resources` is required; rest optional. This fact repeats on exams.

```yaml
AWSTemplateFormatVersion: '2010-09-09'  # Optional (current only value)
Description: 'My application stack'     # Optional

Metadata:           # Optional - console UI hints, group parameters
  AWS::CloudFormation::Interface:
    ParameterGroups:
      - Label:
          default: "Database Configuration"
        Parameters: [DBInstanceClass, DBPassword]

Parameters:         # Optional - input values at stack creation
  EnvType:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev
    Description: "Deployment environment"

Mappings:           # Optional - lookup table (Region → AMI etc)
  RegionAMIMap:
    ap-northeast-2:
      AMI: ami-0c9c942bd7bf113a2
    us-east-1:
      AMI: ami-0c55b159cbfafe1f0

Conditions:         # Optional - conditional resources/properties
  IsProd: !Equals [!Ref EnvType, prod]
  IsNotDev: !Not [!Equals [!Ref EnvType, dev]]

Transform:          # Optional - SAM, macro transformation
  - AWS::Serverless-2016-10-31

Resources:          # Required - actual AWS resource definitions
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'myapp-${EnvType}-${AWS::AccountId}'

Outputs:            # Optional - expose to other stacks or view in console
  BucketArn:
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub '${AWS::StackName}-BucketArn'

Rules:              # Optional - cross-validation between Parameters
  MustUseProdDB:
    RuleCondition: !Equals [!Ref EnvType, prod]
    Assertions:
      - Assert: !Equals [!Ref DBInstanceClass, db.r5.large]
        AssertDescription: "Production must use db.r5.large"
```

## Parameters: Sophisticated Input Control

Parameters make Templates reusable. Same template creates dev, staging, prod environments.

**Complete Parameter Type List:**

| Type | Description | Example |
|------|------|------|
| `String` | General string | `"t3.medium"` |
| `Number` | Integer or float | `3306` |
| `List<Number>` | Number list | `[80, 443]` |
| `CommaDelimitedList` | Comma-delimited string | `"a,b,c"` |
| `AWS::EC2::KeyPair::KeyName` | Existing keypair name | `my-key` |
| `AWS::EC2::SecurityGroup::Id` | Existing SG ID | `sg-abc123` |
| `AWS::EC2::Subnet::Id` | Existing subnet ID | `subnet-abc` |
| `AWS::EC2::VPC::Id` | Existing VPC ID | `vpc-abc` |
| `AWS::SSM::Parameter::Value<String>` | Fetch from SSM parameter | `/myapp/config` |
| `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` | Latest AMI ID from SSM | `/aws/service/ami-amazon-linux-latest/...` |

**Dynamic References (fetch external values without Parameter):**

```yaml
# Direct reference from Secrets Manager
DBPassword:
  !Sub '{{resolve:secretsmanager:prod/db/password:SecretString:password}}'

# Direct reference from Parameter Store
DBHost:
  !Sub '{{resolve:ssm:/myapp/prod/database/host}}'

# Reference encrypted value from Parameter Store
DBPassword2:
  !Sub '{{resolve:ssm-secure:/myapp/prod/database/password}}'
```

> 🔍 **Deeper Dive**: `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` type automatically fetches latest AMI ID from AWS-maintained SSM parameter path (`/aws/service/ami-amazon-linux-latest/...`). These paths auto-update when AWS publishes new AMIs. Same template deployed years later always uses latest Amazon Linux 2. Avoids "deprecated AMI ID" problems from hardcoding/Mappings. Caveat: without stack redeployment, SSM parameter changes don't reflect—and Drift Detection doesn't catch this gap.

## Intrinsic Functions: Operator Essential

| Function | Syntax | Purpose |
|------|------|------|
| `!Ref` | `!Ref MyBucket` | Parameter value, resource's primary identifier (EC2→Instance ID, S3→bucket name) |
| `!GetAtt` | `!GetAtt MyBucket.Arn` | Resource's specific attribute (ARN, DNS name etc) |
| `!Sub` | `!Sub 'prefix-${EnvType}'` | Insert variables into string |
| `!FindInMap` | `!FindInMap [RegionAMIMap, !Ref AWS::Region, AMI]` | Lookup value in Mappings |
| `!If` | `!If [IsProd, t3.large, t3.micro]` | Choose between two values based on condition |
| `!ImportValue` | `!ImportValue 'network-stack-VpcId'` | Import Export value from another stack |
| `!Join` | `!Join [':', [a, b, c]]` → `"a:b:c"` | Join list with delimiter |
| `!Select` | `!Select [0, !GetAZs '']` | Select by index from list |
| `!GetAZs` | `!GetAZs 'ap-northeast-2'` | Region's AZ list |
| `!Cidr` | `!Cidr [10.0.0.0/16, 6, 12]` | Auto-split CIDR block |
| `!Base64` | `!Base64 '#!/bin/bash ...'` | Base64 encoding (for UserData) |
| `!Split` | `!Split [',', 'a,b,c']` → `[a, b, c]` | Split string by delimiter |

**Nested Function Examples (practical patterns):**

```yaml
# Auto-select first AZ subnet
SubnetId: !Select
  - 0
  - !GetAZs ''

# Conditional instance type + Sub nesting
InstanceType: !If
  - IsProd
  - !Sub 'r5.${ProdInstanceSize}'
  - t3.micro

# Auto-split CIDR (auto-create VPC subnets)
CidrBlock: !Select
  - 0
  - !Cidr [!GetAtt VPC.CidrBlock, 6, 12]
  # Split VPC CIDR into 6 /20 subnets, select first
```

## Stack Lifecycle: Know All States for Troubleshooting

```
Stack State Transition Diagram:

CREATE_IN_PROGRESS ──────────────► CREATE_COMPLETE
        │
        └──(failure)──► ROLLBACK_IN_PROGRESS ──► ROLLBACK_COMPLETE
                                                    │
                                                    └── [Update impossible, delete only]

CREATE_COMPLETE ──(update-stack)──► UPDATE_IN_PROGRESS ──► UPDATE_COMPLETE
                                            │
                                            └──(failure)──► UPDATE_ROLLBACK_IN_PROGRESS
                                                                │
                                                                ├──(success)──► UPDATE_ROLLBACK_COMPLETE
                                                                │
                                                                └──(failure)──► UPDATE_ROLLBACK_FAILED
                                                                                    │
                                                                                    └── continue-update-rollback needed

UPDATE_COMPLETE ──(delete-stack)──► DELETE_IN_PROGRESS ──► DELETE_COMPLETE
                                            │
                                            └──(failure)──► DELETE_FAILED
                                                             │
                                                             └── Use retain option, exclude problem resource, retry delete
```

**Important State Descriptions:**

| State | Cause | Operator Action |
|------|------|-------------|
| `ROLLBACK_COMPLETE` | Initial stack creation failed, rollback done | Delete then recreate. `update-stack` impossible |
| `UPDATE_ROLLBACK_FAILED` | Rollback during update failed additionally | `continue-update-rollback` + `resources-to-skip` |
| `DELETE_FAILED` | Resource deletion failed (non-empty S3, attached ENI etc) | `--retain-resources` save problem resources, retry delete |
| `IMPORT_ROLLBACK_FAILED` | Failed importing existing resource | Check import target resource status, retry |

```bash
# Delete ROLLBACK_COMPLETE stack
aws cloudformation delete-stack --stack-name failed-stack
aws cloudformation wait stack-delete-complete --stack-name failed-stack

# Recover UPDATE_ROLLBACK_FAILED
aws cloudformation continue-update-rollback \
  --stack-name my-stack \
  --resources-to-skip LogicalResourceId1 LogicalResourceId2

# Recover DELETE_FAILED: preserve problem resource
aws cloudformation delete-stack \
  --stack-name my-stack \
  --retain-resources ProblematicS3Bucket ProblematicENI

# View stack events to find failure cause
aws cloudformation describe-stack-events \
  --stack-name my-stack \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[Timestamp,LogicalResourceId,ResourceStatusReason]' \
  --output table
```

> ⚠️ **Pitfall**: `ROLLBACK_COMPLETE` state is **initial stack creation's failure final state**. Can't `update-stack` here; must `delete-stack` then recreate. Attempting `update-stack` errors with "Stack is not in a valid state for UpdateStack." `continue-update-rollback` is exclusive to `UPDATE_ROLLBACK_FAILED`, not `ROLLBACK_COMPLETE`. Exam question "recover stack from ROLLBACK_COMPLETE?" always answers "delete and recreate."

## Resource Properties: DeletionPolicy, UpdateReplacePolicy, CreationPolicy

**DeletionPolicy: How to handle resources when Stack is deleted**

```yaml
MyDatabase:
  Type: AWS::RDS::DBInstance
  DeletionPolicy: Snapshot    # Create snapshot before deleting instance
  Properties: ...

MyBucket:
  Type: AWS::S3::Bucket
  DeletionPolicy: Retain       # Keep bucket when stack deleted
  Properties: ...

MyCacheCluster:
  Type: AWS::ElastiCache::ReplicationGroup
  DeletionPolicy: Delete       # Default: delete resource with stack
  Properties: ...
```

| DeletionPolicy Value | Behavior | Use Case |
|-------------------|------|-------------|
| `Delete` (default) | Delete resource with stack | Temporary resources |
| `Retain` | Preserve resource when stack deleted | S3, DynamoDB, critical data |
| `Snapshot` | Snapshot before deletion | RDS, ElastiCache, EBS |

**UpdateReplacePolicy: When Stack update triggers resource replacement**

UpdateReplacePolicy determines old resource handling when Stack update causes Replacement. DeletionPolicy acts on Stack **deletion**; UpdateReplacePolicy on update **replacement**.

```yaml
MyDatabase:
  Type: AWS::RDS::DBInstance
  DeletionPolicy: Retain
  UpdateReplacePolicy: Snapshot  # Snapshot old DB when update replaces it
  Properties:
    DBInstanceClass: db.t3.medium  # → Change to db.r5.large triggers RDS replacement
    MultiAZ: false                  # → Change to true triggers RDS replacement
```

**Resource Replacement (Replacement) Trigger Examples:**

| Resource | Changed Property | Replacement |
|--------|-----------|----------------|
| AWS::RDS::DBInstance | `DBInstanceClass` | True |
| AWS::RDS::DBInstance | `MultiAZ` (false→true) | True |
| AWS::S3::Bucket | `BucketName` | True |
| AWS::EC2::Instance | `ImageId` (AMI ID) | True |
| AWS::EC2::Instance | `InstanceType` | Conditional (EBS optimization) |
| AWS::DynamoDB::Table | `TableName` | True |
| AWS::ElastiCache::ReplicationGroup | `NumCacheClusters` | Conditional |

> 📚 **Case Study**: 2022, e-commerce company F had CloudFormation update accident. RDS instance unexpectedly replaced. Changed DB class from `db.t3.medium` to `db.r5.xlarge` while changing `MultiAZ: false` to `true`. AWS treated MultiAZ change as Replacement; `UpdateReplacePolicy` defaulted to `Delete`, so old DB deleted without snapshot. Lost 4 hours data from recent manual snapshot. Later implemented standard: all RDS set `DeletionPolicy: Snapshot` and `UpdateReplacePolicy: Snapshot`; Change Set review process mandates check `Replacement: True` resources.

**CreationPolicy: Wait for resource creation completion signal**

Pattern where CloudFormation waits until EC2 User Data script completes and application is ready.

```yaml
WebServer:
  Type: AWS::EC2::Instance
  CreationPolicy:
    ResourceSignal:
      Count: 1
      Timeout: PT15M  # ISO 8601 Duration: 15-min wait
  Properties:
    ImageId: !Ref AmiId
    UserData:
      Fn::Base64: !Sub |
        #!/bin/bash
        yum update -y
        yum install -y httpd
        systemctl start httpd
        systemctl enable httpd
        echo "<h1>Hello from ${AWS::StackName}</h1>" > /var/www/html/index.html
        # Signal CloudFormation on completion
        /opt/aws/bin/cfn-signal \
          --exit-code $? \
          --stack ${AWS::StackName} \
          --resource WebServer \
          --region ${AWS::Region}
```

When `cfn-signal` sends `exit-code 0`, CloudFormation proceeds to CREATE_COMPLETE. `exit-code 1` or no signal within Timeout = creation failure.

**cfn-signal Debugging Patterns:**

```bash
# Check EC2 system log on cfn-signal failure (console)
aws ec2 get-console-output --instance-id i-xxxx

# View UserData execution log (connect via SSM Session Manager)
cat /var/log/cfn-init.log
cat /var/log/cfn-init-cmd.log
cat /var/log/cloud-init-output.log

# Check cfn-signal success in CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name my-stack \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]'
```

> ⚠️ **Pitfall**: cfn-signal Timeout uses ISO 8601 Duration format. `PT15M` (15 min), `PT1H` (1 hour), `PT1H30M` (1.5 hours). Most mistakes: timeout too short. OS package update (`yum update -y`) alone takes 5-10 min depending on region/network. Recommend minimum `PT15M`; heavy software (Java, Node.js build) needs `PT30M+`. Timeout event shows "WaitCondition timed out" or "Failed to receive N resource signal(s) within the specified duration."

**Auto Scaling Group's UpdatePolicy (Rolling Update):**

```yaml
WebASG:
  Type: AWS::AutoScaling::AutoScalingGroup
  CreationPolicy:
    ResourceSignal:
      Count: !Ref DesiredCapacity
      Timeout: PT20M
  UpdatePolicy:
    AutoScalingRollingUpdate:
      MaxBatchSize: 2              # Replace 2 at a time
      MinInstancesInService: 1     # Always keep 1 in service
      PauseTime: PT5M              # Wait 5 min between batches (WaitOnResourceSignals=false)
      WaitOnResourceSignals: true  # true→wait for cfn-signal, false→use PauseTime
      SuspendProcesses:            # Suspend ASG processes during rolling update
        - HealthCheck
        - ReplaceUnhealthy
        - AZRebalance
  Properties:
    MinSize: 2
    MaxSize: 6
    DesiredCapacity: !Ref DesiredCapacity
```

**AutoScalingRollingUpdate Key Parameter Interactions:**

| Parameter | Role | Caveat |
|----------|------|----------|
| `MaxBatchSize` | Instances per replacement | Must be < DesiredCapacity |
| `MinInstancesInService` | Minimum always in service | Recommend MaxBatchSize + MinInstancesInService ≤ MaxSize |
| `PauseTime` | Wait between batches (WaitOnResourceSignals=false) | Ignored if WaitOnResourceSignals=true |
| `WaitOnResourceSignals` | Wait for cfn-signal | true→per-instance readiness, false→fixed pause |
| `SuspendProcesses` | Suspend ASG processes during rolling | No AZRebalance→unbalanced state possible |

> 💡 **Related Theory**: CreationPolicy and cfn-signal pattern mirrors distributed systems' "readiness probe" concept. Like Kubernetes `readinessProbe`, don't forward traffic before app signals readiness. In CloudFormation, this signal is `cfn-signal`; Stack stays `CREATE_IN_PROGRESS`, won't proceed until signaled. Rolling Update with WaitOnResourceSignals=true repeats this per batch, confirming "is this instance really ready?" Michael Fowler's "Blue-Green Deployment" replaces entire cluster; AutoScalingRollingUpdate's gradual replacement resembles "Canary Release."

## Stack Policy: Block Critical Resource Updates

Stack Policy is firewall preventing accidental modification/deletion of critical resources during Stack update. Unlike IAM policy controlling human **API access**, Stack Policy controls **CloudFormation operations on resources**.

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": "LogicalResourceId/ProdDatabase"
    },
    {
      "Effect": "Deny",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "LogicalResourceId/ProdCacheCluster"
    }
  ]
}
```

**Stack Policy Action Types:**

| Action | Meaning |
|--------|---------|
| `Update:Modify` | Modify existing resource properties in-place |
| `Update:Replace` | Delete existing, create new (Replacement) |
| `Update:Delete` | Remove resource from Stack and delete |
| `Update:*` | All three above |

```bash
# Set Stack Policy
aws cloudformation set-stack-policy \
  --stack-name my-prod-stack \
  --stack-policy-body file://stack-policy.json

# Override Stack Policy temporarily (admin permission required)
aws cloudformation update-stack \
  --stack-name my-prod-stack \
  --template-body file://template.yaml \
  --stack-policy-during-update-body '{"Statement":[{"Effect":"Allow","Action":"Update:*","Principal":"*","Resource":"*"}]}'

# View current Stack Policy
aws cloudformation get-stack-policy --stack-name my-prod-stack
```

> 💡 **Related Theory**: Stack Policy evaluation follows IAM's **explicit Deny precedence** rule. Default differs: IAM defaults deny all; Stack Policy defaults allow all. When no Stack Policy, all updates allowed. Once set, only explicit Allow statements pass; unlisted resources denied. To deny specific resource, must add "allow all resources" statement. This pattern mirrors firewall rules' "Allow All, Deny Specific."

## Pseudo Parameters: Always-Available Built-In Variables

```yaml
# Available Pseudo Parameters
${AWS::AccountId}     # Current AWS account ID
${AWS::Region}        # Current region (e.g., ap-northeast-2)
${AWS::StackId}       # Stack ARN
${AWS::StackName}     # Stack name
${AWS::URLSuffix}     # Domain suffix (amazonaws.com or CN: amazonaws.com.cn)
${AWS::Partition}     # aws, aws-cn, aws-us-gov
${AWS::NoValue}       # Remove property conditionally

# Usage examples
BucketName: !Sub 'myapp-${AWS::AccountId}-${AWS::Region}-${EnvType}'
# → myapp-123456789012-ap-northeast-2-prod

# AWS::NoValue usage: conditionally remove property
MultiAZ: !If
  - IsProd
  - true
  - !Ref AWS::NoValue  # Dev: remove MultiAZ (use default false)
```

**Partition Usage (GovCloud, China regions):**

```yaml
# Build correct ARN regardless of region
PolicyArn: !Sub 'arn:${AWS::Partition}:iam::${AWS::AccountId}:policy/MyPolicy'
# us-east-1: arn:aws:iam::123456789012:policy/MyPolicy
# cn-north-1: arn:aws-cn:iam::123456789012:policy/MyPolicy
# us-gov-east-1: arn:aws-us-gov:iam::123456789012:policy/MyPolicy
```

## Troubleshooting Patterns: Operator's Daily Work

**Disable Rollback for Debugging:**

```bash
# On creation failure, preserve failed resources for inspection
aws cloudformation create-stack \
  --stack-name debug-stack \
  --template-body file://template.yaml \
  --on-failure DO_NOTHING \
  --parameters ...

# Disable rollback on update
aws cloudformation update-stack \
  --stack-name my-stack \
  --template-body file://template.yaml \
  --disable-rollback
```

**Caution**: `DO_NOTHING`/`--disable-rollback` continues charging; clean up after debugging.

**Template Validation:**

```bash
# Validate template syntax (AWS server-side)
aws cloudformation validate-template \
  --template-body file://template.yaml

# Local validation with cfn-lint (more detailed)
pip install cfn-lint
cfn-lint template.yaml

# Rule-specific validation (SOA exam-related)
cfn-lint template.yaml --include-checks W  # Include Warnings
cfn-lint template.yaml -r E3002            # Specific rule only
```

**CAPABILITY Flags:**

```bash
# Required for Templates with IAM resources
aws cloudformation create-stack \
  --capabilities CAPABILITY_IAM         # Unnamed IAM resources
  --capabilities CAPABILITY_NAMED_IAM   # Named IAM resources
  --capabilities CAPABILITY_AUTO_EXPAND # Transform (SAM/Macro)

# Multiple flags possible
aws cloudformation create-stack \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND
```

**CAPABILITY Absence Error:**
```
InsufficientCapabilities: Requires capabilities : [CAPABILITY_NAMED_IAM]
```
Occurs when Template contains IAM resources but CAPABILITY flag missing.

> 📚 **Case Study**: 2023, fintech startup G's CI/CD suddenly failed CloudFormation deploy. Error: "InsufficientCapabilities". Added `AWS::IAM::Role` but pipeline lacked `--capabilities CAPABILITY_IAM`. Fixed easily but production deploy delayed 30 min. Now pipeline scripts default to `--capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND`. Permitting extra capabilities risks nothing; CFn only affects IAM resource creation.

## Termination Protection and Operational Governance

```bash
# Prevent accidental stack deletion
aws cloudformation update-termination-protection \
  --stack-name my-prod-stack \
  --enable-termination-protection

# Check Termination Protection status
aws cloudformation describe-stacks \
  --stack-name my-prod-stack \
  --query 'Stacks[0].EnableTerminationProtection'

# Must disable before deletion
aws cloudformation update-termination-protection \
  --stack-name my-prod-stack \
  --no-enable-termination-protection
```

Attempting to delete with Termination Protection enabled:
```
TerminationProtection: Stack [my-prod-stack] cannot be deleted while TerminationProtection is enabled
```

> 💡 **Related Theory**: Termination Protection is a Human Error defense layer. Netflix's "Defense in Depth" culture ensures single mistakes don't cause irreversible damage—multiple confirmation stages. CloudFormation operational governance's 3 layers: (1) Stack Policy—CFn engine blocks specific resource updates, (2) Termination Protection—blocks stack deletion, (3) IAM Permission Boundary—user/role can't call CFn delete API. Each defends different attack surface.

> 🔍 **Deeper Dive**: Most dangerous CloudFormation situation: performing Replacement unknowingly. EC2 `ImageId` change, RDS `MultiAZ` change, DynamoDB `TableName` change all trigger Replacement. Change Set displays each resource's change type: `Replacement: True / False / Conditional`. Conditional means runtime-determined; e.g., EC2 `InstanceType` change decides Replacement by EBS optimization. Operators must **review Change Set's Replacement field**; if RDS/DynamoDB shows `True`, verify `UpdateReplacePolicy: Snapshot`.

## Complete Workflow Picture

```
CloudFormation Operator Workflow
============================================================

[Developer/Operator]
    │ Write Template (YAML)
    ▼
[cfn-lint / validate-template]  ← Local+remote validation
    │
    ▼
[create-change-set]  ← Check for Replacement=True resources
    │
    ▼
[execute-change-set]
    │
    ▼
┌─────────────────────────────────────────┐
│         CloudFormation Engine           │
│                                         │
│  1. Parse and validate template         │
│  2. Analyze DAG dependencies            │
│  3. Parallel resource create/update/delete
│  4. Check Stack Policy                  │
│  5. Wait for CreationPolicy signals     │
│  6. Generate event stream               │
└─────────────────────┬───────────────────┘
                      │
          ┌───────────┴───────────┐
          │ Success               │ Failure
          ▼                       ▼
    UPDATE_COMPLETE         UPDATE_ROLLBACK_IN_PROGRESS
                                  │
                          UPDATE_ROLLBACK_COMPLETE
                          (restore to previous state)

Event tracking:
aws cloudformation describe-stack-events --stack-name xxx
  → Real-time resource state changes
```

## 📝 연습 문제

**문제 1.** CloudFormation Template에서 반드시 있어야 하는 섹션은?

A) AWSTemplateFormatVersion, Resources, Outputs
B) Parameters, Resources, Conditions
C) Resources
D) Description, Resources, Parameters

**정답: C**
해설: CloudFormation Template에서 유일한 필수 섹션은 `Resources`다. 나머지 모든 섹션(AWSTemplateFormatVersion, Description, Metadata, Parameters, Mappings, Conditions, Transform, Outputs, Rules)은 선택이다. 실제로 `Resources` 섹션 하나만 있는 최소 Template도 유효하다.

---

**문제 2.** Stack이 `ROLLBACK_COMPLETE` 상태에 있다. 이 Stack을 동일한 이름으로 새 Template로 업데이트하려 한다. 어떻게 해야 하는가?

A) `update-stack` 명령을 실행한다
B) `create-change-set`으로 변경 사항을 먼저 확인한다
C) `delete-stack`으로 삭제한 후 `create-stack`으로 재생성한다
D) `continue-update-rollback`을 실행한다

**정답: C**
해설: `ROLLBACK_COMPLETE` 상태는 초기 Stack 생성이 실패하고 롤백이 완료된 최종 상태다. 이 상태에서는 업데이트가 불가능하며 삭제만 가능하다. `update-stack`을 시도하면 "Stack is not in a valid state" 오류가 발생한다. `continue-update-rollback`은 `UPDATE_ROLLBACK_FAILED` 상태 전용이다. 반드시 삭제 후 재생성해야 한다.

---

**문제 3.** EC2 인스턴스의 User Data 스크립트가 완료될 때까지 CloudFormation이 기다리게 하려면 어떤 설정이 필요한가?

A) EC2 리소스에 `UpdatePolicy`를 설정한다
B) EC2 리소스에 `CreationPolicy.ResourceSignal`을 설정하고, User Data에서 스크립트 완료 후 `cfn-signal`을 호출한다
C) EC2 리소스에 `DependsOn`을 설정한다
D) `WaitCondition` 리소스를 별도로 생성한다

**정답: B**
해설: `CreationPolicy.ResourceSignal`이 표준 패턴이다. EC2 리소스에 `CreationPolicy`를 정의하면 CloudFormation이 지정된 수(Count)의 `cfn-signal` 성공 신호를 받을 때까지 대기한다. User Data 스크립트 마지막에 `cfn-signal --exit-code $?`를 호출하면 스크립트 성공/실패 여부가 CloudFormation에 전달된다. `WaitCondition`(D)은 이전 방식으로 현재는 CreationPolicy가 권장된다.

---

**문제 4.** CloudFormation 운영자가 S3 버킷 리소스의 `BucketName`을 `old-bucket`에서 `new-bucket`으로 변경했다. Stack 업데이트 시 어떤 일이 발생하는가?

A) S3 버킷 이름이 인플레이스로 변경된다
B) 기존 S3 버킷이 삭제되고 새 이름으로 버킷이 생성된다 (Replacement)
C) 변경이 거부된다
D) 자동으로 버킷 내용이 새 버킷으로 복사된다

**정답: B**
해설: S3 버킷 이름(`BucketName` 속성)은 변경 불가능한 속성(immutable property)이다. 이 속성을 변경하면 CloudFormation이 기존 버킷을 삭제하고 새 이름으로 버킷을 생성하는 Replacement를 수행한다. `DeletionPolicy`가 `Delete`(기본값)이면 기존 버킷과 그 안의 데이터가 모두 삭제된다. Change Set을 사용하면 `Replacement: True`로 사전에 확인할 수 있다. 중요 데이터가 있다면 반드시 `DeletionPolicy: Retain`을 설정해야 한다.

---

**문제 5.** Template에서 현재 리전에 해당하는 최신 Amazon Linux 2 AMI ID를 자동으로 사용하려 한다. 하드코딩이나 Mapping을 사용하지 않는 방법은?

A) `!GetAZs` 함수로 AMI 목록을 가져온다
B) Lambda Custom Resource로 최신 AMI를 조회한다
C) Parameter의 `Type`을 `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`로 설정하고 `Default`에 AWS 공식 SSM 경로를 지정한다
D) Mappings에 리전별 최신 AMI ID를 매월 업데이트한다

**정답: C**
해설: AWS는 공식 SSM 파라미터 경로(`/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2` 등)에 최신 AMI ID를 자동으로 업데이트한다. Parameter 타입을 `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`로 설정하면 CloudFormation이 배포 시점에 자동으로 최신 AMI ID를 가져온다. 이 방법은 수동 업데이트 없이 항상 최신 AMI를 사용하는 운영 모범 사례다.

---

**문제 6.** Auto Scaling Group을 CloudFormation으로 관리할 때 `UpdatePolicy: AutoScalingRollingUpdate`를 사용한다. `WaitOnResourceSignals: true`로 설정했을 때의 동작은?

A) `PauseTime`만큼 대기한 후 다음 배치로 이동한다
B) 각 배치의 인스턴스들이 cfn-signal을 보낼 때까지 대기한 후 다음 배치로 이동한다
C) 모든 배치 교체 후 한 번에 cfn-signal을 대기한다
D) ELB 헬스체크가 통과될 때까지 대기한다

**정답: B**
해설: `WaitOnResourceSignals: true`로 설정하면 각 배치(MaxBatchSize)의 인스턴스들이 `cfn-signal`로 준비 완료를 알릴 때까지 대기한 후 다음 배치를 처리한다. `PauseTime`은 `WaitOnResourceSignals: false`일 때 배치 간 고정 대기 시간으로 사용된다. 즉 두 설정은 상호 배타적이다. WaitOnResourceSignals=true면 PauseTime이 cfn-signal 대기의 최대 타임아웃으로 동작한다.

---

**문제 7.** CloudFormation Stack Policy에 대한 설명으로 올바른 것은?

A) Stack Policy는 IAM 정책과 동일하게 동작하며, Principal에 IAM 사용자 ARN을 지정해야 한다
B) Stack Policy를 설정하지 않으면 모든 리소스 업데이트가 기본으로 거부된다
C) Stack Policy는 CloudFormation이 특정 리소스에 수행할 수 있는 업데이트 작업을 제어하며, 기본적으로 모든 업데이트가 허용된다
D) Stack Policy는 Stack 삭제를 방지하는 용도로 사용된다

**정답: C**
해설: Stack Policy는 CloudFormation 엔진이 Stack 업데이트 시 특정 리소스에 수행할 수 있는 작업(Update:Modify, Update:Replace, Update:Delete)을 제어한다. Stack Policy가 **없으면** 모든 리소스 업데이트가 허용된다. Stack Policy가 **설정되면** 명시적으로 Allow된 작업만 허용되고 나머지는 거부된다. Stack 삭제 방지는 Termination Protection이 담당한다(D). Principal은 항상 `"*"`를 사용하며 특정 IAM 사용자 지정이 아니다(A).

---
