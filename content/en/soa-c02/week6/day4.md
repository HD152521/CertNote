# Day 4 - Service Catalog, AppConfig, AppRegistry: The Science of Governance and Dynamic Configuration

In 2017, Netflix made a radical decision to give software teams extraordinary freedom. Hundreds of microservice teams deployed independently. Yet when the question arose—"Which team owns which AWS resource?"—nobody could answer. Simultaneously, with thousands of EC2s, RDS instances, and Lambdas scattered across accounts, tags alone proved insufficient to map ownership and dependencies.

AWS Service Catalog, AppConfig, and AppRegistry answer these questions. Service Catalog declares: "Developers without permissions can self-service standard infrastructure." AppConfig promises: "Change runtime configuration without code redeployment." AppRegistry asserts: "Organize scattered AWS assets by application, not by resource type." In SOA-C02, these three services represent how operators maintain organizational governance and consistency at scale.

## Service Catalog: The Intersection of Self-Service and Governance

Service Catalog's core tension resolves two conflicting goals simultaneously: "Provide developers rapid self-service provisioning" AND "Enforce organizational security standards and cost policies." These goals typically conflict. Freedom undermines standards; rigorous standards create bottlenecks.

Service Catalog's solution is the **Launch Constraint Role**. A developer clicks a catalog product. The actual CloudFormation stack creation executes under a Launch Constraint Role. Developers lacking S3 bucket creation permissions can still provision a standard-approved package through Service Catalog. But they can create nothing outside that standard package.

> 💡 **Related Theory**: Service Catalog's Launch Constraint embodies **Principle of Least Privilege** from software security, but implemented elegantly. Rather than simply restricting permissions, it defines "a delegated agent (Role) that performs permitted work, and users access only through that agent." This mirrors Unix's setuid bit—programs execute with file owner privileges, not the caller's. Developer = regular user, Launch Role = setuid executable, Service Catalog product = the predefined action that executable performs.

**Service Catalog Component Reference:**

| Component | Role | Operator Perspective |
|-----------|------|----------------------|
| **Product** | CloudFormation Template (versioned) | Platform-approved infrastructure pattern |
| **Portfolio** | Product collection + user/group access | Access control by team or role |
| **Provisioned Product** | Actual Stack instance created by user | Operational resource owned by team |
| **Launch Constraint** | IAM Role used during provisioning | Bypass user permissions, enforce standards |
| **Notification Constraint** | SNS event on provisioning changes | Audit trail, change tracking |
| **Tag Constraint** | Enforced + allowed tag list | Cost allocation, resource classification enforcement |
| **Template Constraint** | Restrict parameter allowed values | Instance size, version constraints |
| **TagOptions** | Account-wide standard tag library | Organizational tagging standard |

**Service Catalog Practical CLI Workflow:**

```bash
# 1. Create Portfolio (Platform Team)
PORTFOLIO_ID=$(aws servicecatalog create-portfolio \
  --display-name "Standard Web Applications" \
  --provider-name "Platform Engineering Team" \
  --description "Security-approved web infrastructure templates" \
  --query 'PortfolioDetail.Id' --output text)

# 2. Create Product (Upload CFn Template to S3, reference URL)
PRODUCT_ID=$(aws servicecatalog create-product \
  --name "Standard Web Stack v2" \
  --owner "Platform Team" \
  --product-type CLOUD_FORMATION_TEMPLATE \
  --provisioning-artifact-parameters '{
    "Name": "v2.0",
    "Description": "ALB + ECS Fargate + RDS Aurora + standard security groups",
    "Info": {
      "LoadTemplateFromURL": "https://s3.ap-northeast-2.amazonaws.com/my-sc-templates/web-stack-v2.yaml"
    },
    "Type": "CLOUD_FORMATION_TEMPLATE"
  }' \
  --query 'ProductViewDetail.ProductViewSummary.ProductId' --output text)

# 3. Associate Product with Portfolio
aws servicecatalog associate-product-with-portfolio \
  --product-id $PRODUCT_ID \
  --portfolio-id $PORTFOLIO_ID

# 4. Set Launch Constraint (critical)
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type LAUNCH \
  --parameters "{\"RoleArn\":\"arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ServiceCatalogLaunchRole\"}"

# 5. Grant Portfolio access to developer group
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn "arn:aws:iam::123456789012:group/AppDevelopers" \
  --principal-type IAM

# 6. Template Constraint: Allow only t2.micro, t3.micro
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type TEMPLATE \
  --parameters '{
    "Rules": {
      "InstanceTypeRule": {
        "Assertions": [{
          "Assert": {"Fn::Contains": [["t2.micro","t3.micro","t3.small"], {"Ref":"InstanceType"}]},
          "AssertDescription": "Dev environment allows small instances only"
        }]
      }
    }
  }'
```

**Launch Constraint Role Configuration:**

```yaml
# Minimum permissions Launch Role needs (Service Catalog executes CFn as this Role)
LaunchRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: ServiceCatalogLaunchRole
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: servicecatalog.amazonaws.com
          Action: sts:AssumeRole
    # Permission Boundary prevents Launch Role from gaining excessive permissions
    PermissionsBoundary: arn:aws:iam::123456789012:policy/ServiceCatalogBoundary
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/CloudFormationFullAccess
    Policies:
      - PolicyName: WebStackProvisioning
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - ec2:*
                - ecs:*
                - rds:*
                - elasticloadbalancing:*
                - autoscaling:*
              Resource: '*'
```

> 🔍 **Deeper Dive**: Service Catalog combined with Permission Boundary represents one of AWS's most sophisticated permission delegation patterns. Structure: (1) Developer (IAM User/Role) holds only Service Catalog API call permissions. (2) Service Catalog assumes Launch Role. (3) Launch Role's effective permissions = (Launch Role IAM Policy) ∩ (Permission Boundary). Without Permission Boundary, Launch Role with Admin policy could let developers create resources with Admin privilege through Service Catalog—"privilege escalation." Permission Boundary acts as a guard rail preventing this attack.

**Multi-Account Portfolio Sharing:**

```bash
# Share Portfolio with another AWS account
aws servicecatalog create-portfolio-share \
  --portfolio-id $PORTFOLIO_ID \
  --account-id 111122223333  # Subsidiary account

# Share with entire Organizations OU (native Organizations integration)
aws servicecatalog create-portfolio-share \
  --portfolio-id $PORTFOLIO_ID \
  --organization-node '{
    "Type": "ORGANIZATIONAL_UNIT",
    "Value": "ou-root-abc123"
  }' \
  --share-tag-options  # Share TagOptions as well

# Accept Portfolio share in receiving account
aws servicecatalog accept-portfolio-share \
  --portfolio-id $PORTFOLIO_ID
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn arn:aws:iam::111122223333:group/Developers \
  --principal-type IAM
```

> 📚 **Case Study**: In 2023, large manufacturing company J managed 15 separate AWS accounts across business units. Each unit's development team independently provisioned EC2, RDS, etc., resulting in inconsistent security group configurations. Some teams opened RDS to 0.0.0.0/0—a compliance nightmare. Solution: Central Platform Engineering account created an "approved database package" product, sharing the Portfolio across 15 business unit accounts via Organizations. Thereafter, no business unit could create RDS outside the standard configuration. Post-audit six months later: "All RDS instances meet standard configuration." Compliance items: zero.

## AppConfig: The Science of Configuration Change Without Redeployment

In 2003, Google's Jeff Dean and Sanjay Ghemawat published MapReduce, declaring: "System parameters must be adjustable at runtime." Modern distributed systems embody this principle through Feature Flags—toggling capabilities without redeployment.

AWS AppConfig is the managed service for Feature Flags and dynamic configuration deployment. It's not merely a configuration store; it provides **Progressive Delivery**, **Pre-deployment Validation**, and **Automatic Rollback**.

**AppConfig Core Components:**

| Component | Role | Example |
|-----------|------|---------|
| **Application** | Top-level container | `OrderService`, `UserService` |
| **Environment** | Deployment environment | `dev`, `staging`, `prod` |
| **Configuration Profile** | Configuration source and type | Hosted / S3 / Parameter Store |
| **Hosted Configuration** | AppConfig built-in storage | Native feature flag support |
| **Deployment Strategy** | Deployment pattern and speed | Linear, Exponential, AllAtOnce, Canary |
| **Validator** | Pre-deployment validation | JSON Schema, Lambda |
| **Extension** | Event hooks | Trigger Lambda on deployment start/complete/rollback |

**Deployment Strategy Reference:**

| Strategy | Behavior | Typical Use |
|----------|----------|-------------|
| `AppConfig.AllAtOnce` | Instant 100% switch | Dev environment, emergency patch |
| `AppConfig.Linear50PercentEvery30Seconds` | 50% every 30s (total 60s) | Fast deployment, low risk |
| `AppConfig.Linear20PercentEvery6Minutes` | 20% every 6m (total 30m) | Standard production deployment |
| `AppConfig.Canary10Percent20Minutes` | 10% → wait 20m → 100% | New feature, cautious rollout |
| Custom | Full customization (GrowthFactor, BakeTime, GrowthType) | Special requirements |

**Create Custom Deployment Strategy:**

```bash
# Progressive: Start 5%, grow 30% exponential, 10m bake time
aws appconfig create-deployment-strategy \
  --name "Cautious5Percent" \
  --description "Start 5%, 10m intervals, 10m bake time" \
  --deployment-duration-in-minutes 50 \
  --final-bake-time-in-minutes 10 \
  --growth-factor 30 \
  --growth-type EXPONENTIAL \
  --replicate-to NONE

# During Bake Time, monitor alarms; auto-rollback if alarm fires
```

**Complete AppConfig Setup Workflow:**

```bash
# 1. Create Application
APP_ID=$(aws appconfig create-application \
  --name "OrderService" \
  --description "Order processing microservice" \
  --query 'Id' --output text)

# 2. Create Environment (with CloudWatch Alarm monitor)
ENV_ID=$(aws appconfig create-environment \
  --application-id $APP_ID \
  --name "prod" \
  --description "Production environment" \
  --monitors '[
    {
      "AlarmArn": "arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:OrderService-ErrorRate-High",
      "AlarmRoleArn": "arn:aws:iam::123456789012:role/AppConfigMonitorRole"
    }
  ]' \
  --query 'Id' --output text)

# 3. Create Configuration Profile (Feature Flags type)
PROFILE_ID=$(aws appconfig create-configuration-profile \
  --application-id $APP_ID \
  --name "FeatureFlags" \
  --location-uri "hosted" \
  --type "AWS.AppConfig.FeatureFlags" \
  --validators '[
    {
      "Type": "JSON_SCHEMA",
      "Content": "{\"type\":\"object\",\"required\":[\"flags\",\"values\"]}"
    },
    {
      "Type": "LAMBDA",
      "Content": "arn:aws:lambda:ap-northeast-2:123456789012:function:ValidateFeatureFlags"
    }
  ]' \
  --query 'Id' --output text)

# 4. Create configuration version
VERSION=$(aws appconfig create-hosted-configuration-version \
  --application-id $APP_ID \
  --configuration-profile-id $PROFILE_ID \
  --content-type "application/json" \
  --content '{
    "flags": {
      "new_checkout_flow": {
        "name": "new_checkout_flow",
        "description": "New checkout flow"
      },
      "recommendation_engine_v2": {
        "name": "recommendation_engine_v2"
      }
    },
    "values": {
      "new_checkout_flow": {"enabled": false},
      "recommendation_engine_v2": {"enabled": true}
    },
    "version": "1"
  }' \
  --query 'VersionNumber' --output text)

# 5. Start deployment (Canary strategy)
aws appconfig start-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-strategy-id "AppConfig.Canary10Percent20Minutes" \
  --configuration-profile-id $PROFILE_ID \
  --configuration-version $VERSION \
  --description "Disable new_checkout_flow, enable recommendation v2"

# 6. Monitor deployment progress
aws appconfig get-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-number 1 \
  --query '[State,PercentageComplete,StartedAt,CompletedAt]'

# 7. Immediate rollback if needed
aws appconfig stop-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-number 1
```

> ⚠️ **Gotcha**: AppConfig Deployment Strategy's `FinalBakeTimeInMinutes` is the additional wait period after configuration reaches 100%. CloudWatch Alarms continue monitoring during this bake time. If an alarm fires, auto-rollback initiates. Many operators mistake "100% deployed" for "deployment finished," but with `FinalBakeTimeInMinutes=10`, deployment remains incomplete until that 10 minutes elapses. `AllAtOnce` strategy with `FinalBakeTimeInMinutes=10` means "instant 100% + 10-minute safety monitoring."

**AppConfig Lambda Client Integration:**

```python
# Efficient pattern for using AppConfig from Lambda
# Lambda Extension (AWS AppConfig Agent) serves config via local HTTP server
import urllib.request
import json

def get_config():
    """
    AppConfig Lambda Extension provides configuration from localhost:2772.
    Extension handles caching + polling automatically.
    Far more efficient than direct AppConfig API calls.
    """
    url = (
        "http://localhost:2772/applications/OrderService"
        "/environments/prod/configurations/FeatureFlags"
    )
    req = urllib.request.Request(url)
    response = urllib.request.urlopen(req)
    config = json.loads(response.read())
    return config

def handler(event, context):
    config = get_config()
    flags = config.get('values', {})
    
    if flags.get('new_checkout_flow', {}).get('enabled', False):
        return process_new_checkout(event)
    else:
        return process_legacy_checkout(event)
```

> 💡 **Related Theory**: AppConfig's Progressive Delivery implements Martin Fowler's 2010 "Feature Toggle" pattern as a managed AWS service. Fowler categorized toggles: (1) Release Toggles (temporary during deployment), (2) Experiment Toggles (A/B testing), (3) Ops Toggles (operational switches), (4) Permission Toggles (role-based access). AppConfig primarily supports Release and Ops Toggles. Automatic rollback is feedback control theory: CloudWatch Alarm detects error rate threshold, triggering corrective action (rollback).

**AppConfig Validator Deep Dive:**

```python
# Lambda Validator: enforce business rules
def validate_handler(event, context):
    """
    AppConfig calls this Lambda before deployment.
    Raising exception blocks the deployment.
    """
    import json, base64
    
    # Decode configuration content
    config = json.loads(base64.b64decode(event['content']))
    
    # Validation 1: Reject if flag count exceeds 100
    flags = config.get('flags', {})
    if len(flags) > 100:
        raise Exception(f"Feature flag count exceeds 100: {len(flags)}")
    
    # Validation 2: Reject unknown flag names
    allowed_flags = {'new_checkout_flow', 'recommendation_engine_v2', 'dark_mode'}
    unknown = set(flags.keys()) - allowed_flags
    if unknown:
        raise Exception(f"Unknown feature flags: {unknown}")
    
    # Validation 3: Enforce required attributes when flag enabled
    for flag_name, flag_value in config.get('values', {}).items():
        if flag_value.get('enabled') and flag_name == 'new_checkout_flow':
            # payment_provider required when new_checkout_flow enabled
            if 'payment_provider' not in flag_value:
                raise Exception("payment_provider required when new_checkout_flow enabled")
    
    print("Validation passed")
    # Return without exception = validation passes
```

## AppRegistry: Group Scattered AWS Assets by Application

At scale with microservices—"What CloudFormation Stacks, ECS Services, RDS instances, Lambdas, and S3 buckets comprise the Order Service?"—answering this question becomes difficult. Tags alone inadequately express hierarchy and context.

AWS Service Catalog AppRegistry solves this. It introduces an "Application" concept—a logical unit grouping related AWS resources.

**AppRegistry Core Concepts:**

| Concept | Description |
|---------|-------------|
| **Application** | Logical application unit (e.g., OrderService) |
| **Associated Resources** | CloudFormation Stacks and individual resources linked to Application |
| **Attribute Group** | Application metadata (owner, SLA, cost center, environment) |
| **Application Manager** | Unified view of Applications in SSM console |

**Practical AppRegistry Configuration:**

```bash
# 1. Create Application
aws servicecatalog-appregistry create-application \
  --name "OrderService" \
  --description "Order processing microservice"

# 2. Link CloudFormation Stack
aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/order-service-prod/abc123"

aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/order-db-prod/def456"

# 3. Create Attribute Group (metadata)
aws servicecatalog-appregistry create-attribute-group \
  --name "OrderServiceMeta" \
  --attributes '{
    "owner": "order-team@company.com",
    "sla": "99.9%",
    "cost_center": "CC-ORDER-001",
    "tier": "mission-critical",
    "pci_in_scope": "true",
    "last_security_review": "2026-03-15"
  }' \
  --description "Order Service metadata"

# 4. Link Attribute Group to Application
aws servicecatalog-appregistry associate-attribute-group \
  --application "OrderService" \
  --attribute-group "OrderServiceMeta"

# 5. List applications and associated resources
aws servicecatalog-appregistry list-applications

aws servicecatalog-appregistry list-associated-resources \
  --application "OrderService"
```

**What Application Manager Integrated View Provides:**

- All CloudFormation Stack states for application
- Operational status of each stack resource
- CloudWatch Alarms (aggregated at application level)
- CloudWatch Logs (related log groups)
- OpsCenter OpsItems (operational issues)
- Cost Explorer (cost by application)
- AWS Config compliance status

> 🔍 **Deeper Dive**: AppRegistry's "Application as First-Class Citizen" approach derives from DORA (DevOps Research and Assessment) insights: "Deployment Frequency" and "Change Failure Rate" should be measured at the service level, not individual resources. From an operations standpoint, "EC2 i-abc123 at 90% CPU" lacks immediate business context, but "OrderService CPU at 90%" immediately conveys business impact. AppRegistry formalizes this abstraction at the AWS platform level.

## Integrated Pattern: Three Services Working Together

Service Catalog, AppConfig, and AppRegistry operate independently but become far more powerful when integrated.

```
Organizational Governance Platform Architecture
============================================================

[Platform Team]
    │
    ├── Register standard products in Service Catalog
    │   (web stack, ML stack, data stack)
    │
    ├── Manage environment configuration via AppConfig
    │   (Feature Flags, algorithm parameters)
    │
    └── Register application assets via AppRegistry
        (metadata, cost centers, SLAs)

[Development Teams]
    │
    ├── Select standard infrastructure from Service Catalog catalog
    │   → Provisioning via Launch Constraint Role
    │   → Provisioned Product = Stack
    │
    ├── Link Stack to AppRegistry Application
    │   → Unified view in Application Manager
    │
    └── Manage runtime configuration via AppConfig
        → Toggle Feature Flags without redeployment
        → Apply safely with Canary deployment
        → Auto-rollback on alarm

[Operations Teams]
    │
    ├── View application-level status in Application Manager
    ├── Monitor AppConfig deployment progress and auto-rollback
    └── Audit Service Catalog Provisioned Products for standard compliance
```

> 📚 **Case Study**: In 2024, e-commerce company K operated 50 microservices facing two problems: First, each team structured infrastructure differently, causing consistent "standard non-compliance" on security audits. Second, each feature deployment required full service downtime. Solution: (1) Service Catalog productized 5 standard patterns (web, data, batch, realtime, analytics); all teams select from these only. (2) AppConfig Feature Flags embed new features disabled by default, then progressively enable. (3) AppRegistry grouped 50 services' assets at application level, tracking operational issues per service in OpsCenter. Results: Security audit "non-compliance" items dropped to zero; deployment-related incidents fell 67%.

## SOA-C02 Exam Focus: Key Concepts Summarized

**Service Catalog Exam Points:**
- Launch Constraint = Standard provisioning without user IAM permissions
- Portfolio Sharing = Multi-account self-service standardization
- Permission Boundary + Launch Role = Prevent privilege escalation

**AppConfig Exam Points:**
- Change runtime configuration without code redeployment (Parameter Store also possible, but lacks progressive deployment/rollback)
- Validator (JSON Schema, Lambda) validates before deployment
- CloudWatch Alarm connection enables automatic rollback
- FinalBakeTimeInMinutes = Additional monitoring time after 100% reached
- Lambda Extension = Provides cached configuration on localhost:2772

**AppRegistry Exam Points:**
- Connect CloudFormation Stack → Application → Application Manager unified view
- Attribute Group = Application metadata
- Difference from Resource Groups: AppRegistry introduces "Application" as higher-level concept

## 📝 Practice Questions

**Question 1.** A company wants to provide developers self-service standard VPC + RDS infrastructure while preventing them from creating resources outside the standard package. Which tool addresses this?

A) Grant IAM policies providing all necessary permissions  
B) Register standard products in Service Catalog Portfolio, designate Launch Constraint Role for provisioning. Developers lack direct resource creation permissions  
C) Deploy CloudFormation Template directly to developers  
D) Purchase products from AWS Marketplace  

**Answer: B**

**Explanation:** Standard pattern for self-service + standard enforcement. Launch Constraint Role holds actual CloudFormation execution permissions; developers hold only Service Catalog API permissions. Developers provision only catalog products and cannot create resources directly. C allows developers to modify templates or use others, defeating standard enforcement.

---

**Question 2.** Developers need to toggle Lambda Feature Flags without redeployment. New configuration deployment must auto-rollback if error rate spikes. Best tool?

A) Parameter Store—store configuration, Lambda reads it  
B) AppConfig—Feature Flag profile type + CloudWatch Alarm monitor for auto-rollback  
C) DynamoDB—create settings table, Lambda reads it  
D) Lambda environment variables—manually change via console  

**Answer: B**

**Explanation:** AppConfig provides dedicated Feature Flag type (`AWS.AppConfig.FeatureFlags`) and CloudWatch Alarm monitoring during deployment; alarm firing triggers auto-rollback. Parameter Store (A) supports value storage but lacks progressive deployment and auto-rollback. Lambda environment variables (D) require function restart on change.

---

**Question 3.** Before deploying AppConfig configuration, automatically validate JSON structure. Which feature to use?

A) Monitor CloudWatch Logs for error patterns  
B) Add JSON Schema Validator to Configuration Profile; schema mismatch blocks deployment  
C) Lambda detects configuration change and executes validation logic  
D) S3 bucket policy blocks invalid file uploads  

**Answer: B**

**Explanation:** AppConfig Configuration Profile Validator feature. Adding `JSON_SCHEMA` type Validator automatically validates configuration content against schema before deployment. Mismatch blocks deployment start. For business logic validation, add `LAMBDA` type Validator additionally.

---

**Question 4.** AppConfig deployment configured with `FinalBakeTimeInMinutes: 10` using `AllAtOnce` strategy. Behavior?

A) Configuration applied over 10 minutes, 0% → 100% progressively  
B) Configuration applies immediately to 100%, then monitors CloudWatch Alarms for 10 minutes. Alarm firing triggers auto-rollback  
C) Deployment starts after 10-minute delay  
D) Deployment status checked every 10 minutes  

**Answer: B**

**Explanation:** `FinalBakeTimeInMinutes` is additional monitoring time after 100% reached. `AllAtOnce` applies configuration immediately to 100%, but with FinalBakeTime, the system monitors alarms for that duration. Alarm during bake time → auto-rollback; normal completion → `COMPLETE` status confirmed.

---

**Question 5.** Developer lacks EC2 and RDS creation permissions in IAM. How does provisioning standard RDS package via Service Catalog work?

A) Grant developer temporary EC2, RDS permissions  
B) Service Catalog assumes Launch Constraint IAM Role and executes CloudFormation. Resources created under Launch Role permissions, not developer permissions  
C) Service Catalog auto-switches to admin account  
D) CloudFormation auto-extends developer permissions  

**Answer: B**

**Explanation:** Launch Constraint core behavior. Developer clicks "Provision Product" in Service Catalog; Service Catalog assumes Launch Constraint Role (not developer role) and executes CloudFormation. Resources created under Launch Role permissions. Developer lacks EC2 and RDS permissions yet provisions standard packages; cannot create resources outside packages.

---

**Question 6.** Company operates 50 microservices; wants service-level AWS cost, alarms, and operational issues visible in single view. Best tool combination?

A) Create 50 CloudWatch Dashboards, one per service  
B) Use AWS AppRegistry to define Applications, link related CloudFormation Stacks, view via AWS Systems Manager Application Manager  
C) Use Resource Groups and Tag Editor to group service resources  
D) Use Cost Explorer with tag-based filtering to view service costs  

**Answer: B**

**Explanation:** AppRegistry + Application Manager provides precise solution. Define Application in AppRegistry, link CloudFormation Stacks; Application Manager provides CloudWatch Alarms, OpsCenter items, Config compliance, cost information in unified view. Resource Groups (C) performs tag-based grouping without Application-level context. AppRegistry provides richer metadata via Attribute Group and Application hierarchy.

