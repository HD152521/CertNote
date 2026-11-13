# Day 4 - Service Catalog, AppConfig, AppRegistry: The Craft of Governance and Dynamic Configuration

In 2017, Netflix decided to give its software teams radical freedom. Hundreds of microservice teams deploy independently. But a situation arose in which nobody could answer the question "which team owns which AWS resources?" At the same time, with thousands of EC2, RDS, and Lambda resources, tags alone were insufficient to tell which one belonged to which service.

AWS Service Catalog, AppConfig, and AppRegistry are the answers to these problems. Service Catalog means "developers without permissions provision standard infrastructure through self-service." AppConfig means "safely change runtime configuration without deploying code." AppRegistry means "group scattered AWS assets by application." In SOA-C02, these three services are treated as tools that let operators maintain governance and consistency across the whole organization.

## Service Catalog: Where Self-Service and Governance Intersect

The core problem Service Catalog addresses is achieving two conflicting goals at once: "give developers fast self-service" + "always comply with the organization's security standards and cost policies." These two goals usually clash. Give freedom and the standard wobbles; enforce the standard and a bottleneck appears.

Service Catalog's solution is the **Launch Constraint Role**. A developer clicks a product in the catalog. The actual CloudFormation stack creation is performed by the Launch Constraint Role. Even if a developer has no permission at all to create an S3 bucket, they can provision a standard package through Service Catalog. And they can never create anything outside that standard package.

> 💡 **Related theory**: Service Catalog's Launch Constraint is a refined implementation of the **Principle of Least Privilege** in software security. It doesn't simply limit permissions; it is a delegation pattern in which "you define an agent (Role) that performs the required work, and users act only through that agent." This is the same principle as the Unix setuid bit (a program runs with the file owner's permissions when executed). Developer = ordinary user, Launch Role = setuid executable, Service Catalog product = the fixed task that executable performs.

**Service Catalog components:**

| Element | Role | Operator's perspective |
|------|------|-------------|
| **Product** | CloudFormation Template (versioned) | An infrastructure pattern approved by the platform team |
| **Portfolio** | A bundle of Products + user/group permissions | Access control by team or role |
| **Provisioned Product** | The stack instance a user actually created | Operational resources owned by each team |
| **Launch Constraint** | The IAM Role to use at provisioning time | Bypasses user permissions, enforces the standard |
| **Notification Constraint** | Notifies provisioning events via SNS | Auditing, change tracking |
| **Tag Constraint** | Mandatory tags + allowed tag list | Enforces cost allocation and resource classification |
| **Template Constraint** | Restricts allowed Parameter values | Constraints such as instance size |
| **TagOptions** | A library of standard tags across the account | Applies the organization's tagging standard |

**A hands-on Service Catalog CLI workflow:**

```bash
# 1. Create a Portfolio (platform team)
PORTFOLIO_ID=$(aws servicecatalog create-portfolio \
  --display-name "Standard Web Applications" \
  --provider-name "Platform Engineering Team" \
  --description "Security-approved web infrastructure templates" \
  --query 'PortfolioDetail.Id' --output text)

# 2. Create a Product (upload the CFn Template to S3, then specify the URL)
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

# 3. Associate the Product with the Portfolio
aws servicecatalog associate-product-with-portfolio \
  --product-id $PRODUCT_ID \
  --portfolio-id $PORTFOLIO_ID

# 4. Set the Launch Constraint (the key step)
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type LAUNCH \
  --parameters "{\"RoleArn\":\"arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ServiceCatalogLaunchRole\"}"

# 5. Grant the developer group access to the Portfolio
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn "arn:aws:iam::123456789012:group/AppDevelopers" \
  --principal-type IAM

# 6. Template Constraint: allow only t2.micro, t3.micro
aws servicecatalog create-constraint \
  --portfolio-id $PORTFOLIO_ID \
  --product-id $PRODUCT_ID \
  --type TEMPLATE \
  --parameters '{
    "Rules": {
      "InstanceTypeRule": {
        "Assertions": [{
          "Assert": {"Fn::Contains": [["t2.micro","t3.micro","t3.small"], {"Ref":"InstanceType"}]},
          "AssertDescription": "Only small instances are allowed in development environments"
        }]
      }
    }
  }'
```

**Launch Constraint Role configuration:**

```yaml
# Minimum permissions needed by the Launch Role (Service Catalog runs CFn with this Role)
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
    # Apply a Permission Boundary (so the Launch Role can't hold more powerful permissions)
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

The combination of Service Catalog + Permission Boundary is one of the most refined permission delegation patterns in AWS. The structure is this: (1) The developer (IAM User/Role) has only permission to call the Service Catalog API. (2) Service Catalog assumes the Launch Role. (3) The Launch Role's actual permissions = (the Launch Role's IAM Policy) ∩ (the Permission Boundary). Without a Permission Boundary, the Launch Role could hold unlimited permissions, and a developer could create arbitrary resources with Admin permissions through Service Catalog. This is called "privilege escalation," and the Permission Boundary is the guardrail that blocks it.

**Multi-account Portfolio sharing:**

```bash
# Share the Portfolio with another AWS account
aws servicecatalog create-portfolio-share \
  --portfolio-id $PORTFOLIO_ID \
  --account-id 111122223333  # Subsidiary account

# Share with an entire Organizations OU (Organizations integration)
aws servicecatalog create-portfolio-share \
  --portfolio-id $PORTFOLIO_ID \
  --organization-node '{
    "Type": "ORGANIZATIONAL_UNIT",
    "Value": "ou-root-abc123"
  }' \
  --share-tag-options  # Share TagOptions too

# Import the Portfolio in the receiving account
aws servicecatalog accept-portfolio-share \
  --portfolio-id $PORTFOLIO_ID
aws servicecatalog associate-principal-with-portfolio \
  --portfolio-id $PORTFOLIO_ID \
  --principal-arn arn:aws:iam::111122223333:group/Developers \
  --principal-type IAM
```

As a hypothetical example, in 2023 a large manufacturer, Company J, had 15 business units each operating its own AWS account. Because each business unit's development team provisioned EC2, RDS, and so on independently, security group settings were all over the place, and some teams ended up leaving RDS open to 0.0.0.0/0. As the solution, the central Platform Engineering account built an "approved database package" product and shared the Portfolio with the 15 business-unit accounts. After that, no business unit could create RDS outside the standard package. Six months later, a security audit confirmed that "all RDS instances comply with the standard configuration."

## AppConfig: The Science of Changing Configuration Without Redeploying Code

The MapReduce paper published by Google's Jeff Dean and Sanjay Ghemawat in 2003 contains the principle that "many of a system's parameters should be adjustable at runtime." In modern distributed systems, this principle has been made concrete as "Feature Flags." You should be able to turn features on and off without redeploying code.

AWS AppConfig is a managed service for these Feature Flags and dynamic configuration deployment. It doesn't merely store configuration values; it provides **Progressive Delivery**, **Validation**, and **Auto Rollback**.

**AppConfig core components:**

| Element | Role | Example |
|------|------|------|
| **Application** | Top-level container | `OrderService`, `UserService` |
| **Environment** | Deployment environment | `dev`, `staging`, `prod` |
| **Configuration Profile** | Configuration source and type | Hosted / S3 / Parameter Store |
| **Hosted Configuration** | AppConfig's built-in store | Supports the Feature Flags-specific type |
| **Deployment Strategy** | Deployment method and speed | Linear, Exponential, AllAtOnce, Canary |
| **Validator** | Pre-deployment validation | JSON Schema, Lambda |
| **Extension** | Event hooks | Invoke Lambda on deployment start/completion/rollback |

**All Deployment Strategies:**

| Strategy name | Behavior | Suited for |
|-----------|------|-----------|
| `AppConfig.AllAtOnce` | Switches to 100% immediately | dev environments, emergency patches |
| `AppConfig.Linear50PercentEvery30Seconds` | 50% every 30 seconds (60 seconds total) | Fast deployment, low risk |
| `AppConfig.Linear20PercentEvery6Minutes` | 20% every 6 minutes (30 minutes total) | Standard production deployment |
| `AppConfig.Canary10Percent20Minutes` | 10% → wait 20 minutes → 100% | Carefully rolling out new features |
| Custom | Fully custom (GrowthFactor, BakeTime, GrowthType) | Special requirements |

**Creating a Custom Deployment Strategy:**

```bash
# Progressive deployment: start at 5%, grow by 30%, 10-minute Bake Time
aws appconfig create-deployment-strategy \
  --name "Cautious5Percent" \
  --description "Start at 5%, 10-minute intervals, 10-minute bake time" \
  --deployment-duration-in-minutes 50 \
  --final-bake-time-in-minutes 10 \
  --growth-factor 30 \
  --growth-type EXPONENTIAL \
  --replicate-to NONE

# Monitor alarms during the 10-minute Bake Time after deployment completes
# If an alarm fires during the Bake Time, automatically roll back
```

**The complete AppConfig setup workflow:**

```bash
# 1. Create the Application
APP_ID=$(aws appconfig create-application \
  --name "OrderService" \
  --description "Order processing microservice" \
  --query 'Id' --output text)

# 2. Create the Environment (attach a CloudWatch Alarm monitor)
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

# 3. Create the Configuration Profile (Feature Flags type)
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

# 4. Create a configuration version
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

# 5. Start the deployment (Canary strategy)
aws appconfig start-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-strategy-id "AppConfig.Canary10Percent20Minutes" \
  --configuration-profile-id $PROFILE_ID \
  --configuration-version $VERSION \
  --description "Disable new_checkout_flow, enable recommendation v2"

# 6. Monitor deployment status
aws appconfig get-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-number 1 \
  --query '[State,PercentageComplete,StartedAt,CompletedAt]'

# 7. Roll back immediately (if needed)
aws appconfig stop-deployment \
  --application-id $APP_ID \
  --environment-id $ENV_ID \
  --deployment-number 1
```

> ⚠️ **Trap**: The `FinalBakeTimeInMinutes` of an AppConfig Deployment Strategy is the additional waiting time after the deployment reaches 100%. The CloudWatch Alarm is monitored during this time as well. If an alarm fires, automatic rollback begins. Many operators mistake "100% deployed = deployment finished," but if `FinalBakeTimeInMinutes` is set, the deployment only reaches the `COMPLETE` state after that time passes. If you add `FinalBakeTimeInMinutes=10` to the `AllAtOnce` strategy, it reaches 100% immediately, but the deployment is fully finalized only after 10 minutes.

**AppConfig Lambda client integration:**

```python
# Pattern for using AppConfig efficiently from Lambda
# The Lambda Extension (AWS AppConfig Agent) caches configuration on a local HTTP server
import urllib.request
import json

def get_config():
    """
    The AppConfig Lambda Extension serves configuration on local port 2772.
    The Extension handles caching and polling automatically.
    Much more efficient than calling the AppConfig API directly.
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

AppConfig's progressive delivery is an AWS-managed implementation of the "Feature Toggle" pattern defined by Martin Fowler in 2010. Fowler classified Feature Toggles into 4 types: (1) Release Toggles (temporary during deployment), (2) Experiment Toggles (A/B testing), (3) Ops Toggles (operational switches), and (4) Permission Toggles (tiered access). AppConfig mainly supports Release Toggles and Ops Toggles. Automatic rollback is a feedback control loop from control theory: when a CloudWatch Alarm detects an error rate threshold, AppConfig executes a corrective action (rollback).

**AppConfig Validator in depth:**

```python
# Lambda Validator: business rule validation
def validate_handler(event, context):
    """
    AppConfig invokes this Lambda before deployment.
    If invalid, raise an exception to block the deployment.
    """
    import json, base64
    
    # Decode the configuration content
    config = json.loads(base64.b64decode(event['content']))
    
    # Check 1: reject if there are more than 100 feature flags
    flags = config.get('flags', {})
    if len(flags) > 100:
        raise Exception(f"Number of feature flags exceeds 100: {len(flags)}")
    
    # Check 2: reject if there is an unknown flag name
    allowed_flags = {'new_checkout_flow', 'recommendation_engine_v2', 'dark_mode'}
    unknown = set(flags.keys()) - allowed_flags
    if unknown:
        raise Exception(f"Unknown feature flag: {unknown}")
    
    # Check 3: verify required attributes when a flag is enabled
    for flag_name, flag_value in config.get('values', {}).items():
        if flag_value.get('enabled') and flag_name == 'new_checkout_flow':
            # payment_provider is required when the new checkout flow is enabled
            if 'payment_provider' not in flag_value:
                raise Exception("payment_provider is required when new_checkout_flow is enabled")
    
    print("Validation passed")
    # Returning without an exception means validation passed
```

## AppRegistry: Grouping Scattered AWS Assets by Application

In a large-scale microservices environment, it's hard to answer the question "which CloudFormation Stacks, ECS Services, RDS instances, Lambda functions, and S3 buckets make up the Order Service?" Tags alone struggle to express hierarchy and context.

AWS Service Catalog AppRegistry solves this problem. It introduces the concept of an "Application" and groups related AWS resources into a single logical unit.

**AppRegistry core concepts:**

| Concept | Description |
|------|------|
| **Application** | A logical application unit (e.g. OrderService) |
| **Associated Resources** | The CloudFormation Stacks and individual resources linked to the Application |
| **Attribute Group** | Application metadata (owner, SLA, cost center, environment) |
| **Application Manager** | A consolidated per-Application view in the SSM console |

**AppRegistry hands-on setup:**

```bash
# 1. Create the Application
aws servicecatalog-appregistry create-application \
  --name "OrderService" \
  --description "Order processing microservice"

# 2. Associate CFn Stacks
aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/order-service-prod/abc123"

aws servicecatalog-appregistry associate-resource \
  --application "OrderService" \
  --resource-type CFN_STACK \
  --resource "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/order-db-prod/def456"

# 3. Create an Attribute Group (metadata)
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

# 4. Associate the Attribute Group with the Application
aws servicecatalog-appregistry associate-attribute-group \
  --application "OrderService" \
  --attribute-group "OrderServiceMeta"

# 5. List applications and their associated resources
aws servicecatalog-appregistry list-applications

aws servicecatalog-appregistry list-associated-resources \
  --application "OrderService"
```

**What you can see in the Application Manager consolidated view:**

- The status of all CloudFormation Stacks belonging to the application
- The operational status of each resource within the stacks
- CloudWatch Alarms (aggregated at the application level)
- CloudWatch Logs (related log groups)
- OpsCenter OpsItems (operational issues)
- Cost Explorer (cost per application)
- Config compliance status

AppRegistry's "Application as a First-Class Citizen" approach came from the insight that the unit for measuring the DORA (DevOps Research and Assessment) metrics "Deployment Frequency" and "Change Failure Rate" should be the "service (Application)" rather than individual resources. From an operations standpoint, "EC2 i-abc123 is at 90% CPU" carries little information, but "OrderService's CPU is at 90%" tells you the immediate business impact. AppRegistry officially supports this abstraction at the AWS level.

## Integration Patterns of the Three Services

Service Catalog, AppConfig, and AppRegistry can each be used independently, but they become more powerful when used together.

```
Organization-level governance platform architecture
============================================================

[Platform team]
    │
    ├── Register standard products in Service Catalog
    │   (web stack, ML stack, data stack)
    │
    ├── Manage per-environment configuration with AppConfig
    │   (Feature Flags, algorithm parameters)
    │
    └── Register application assets in AppRegistry
        (metadata, cost center, SLA)

[Development team]
    │
    ├── Choose standard infrastructure from the Service Catalog catalog
    │   → Provision with the Launch Constraint Role
    │   → Provisioned Product = Stack
    │
    ├── Associate the Stack with an AppRegistry Application
    │   → Consolidated view in Application Manager
    │
    └── Change runtime configuration with AppConfig
        → Toggle Feature Flags without redeploying code
        → Apply safely with Canary deployment
        → Automatic rollback via alarm integration

[Operations team]
    │
    ├── Check per-application status in Application Manager
    ├── Monitor AppConfig deployment status and automatic rollback
    └── Audit standard compliance via Service Catalog Provisioned Products
```

As a hypothetical example, in 2024 an e-commerce company, Company K, operated 50 microservices and had two problems. First, each team configured infrastructure differently, so "non-compliance with standards" items always showed up in security audits. Second, every time they deployed a new feature, they took the entire service down. The solution: (1) They productized 5 standard infrastructure patterns (web, data, batch, real-time, analytics) with Service Catalog and had all teams choose only from among these. (2) They shipped new features in the code in a disabled state using AppConfig Feature Flags and then enabled them gradually. (3) They organized the assets of the 50 services by Application with AppRegistry and tracked per-service operational issues in OpsCenter. Result: 0 "non-compliance with standards" findings in security audits, and a 67% reduction in deployment-related incidents.

## Key Takeaways from the SOA-C02 Exam Perspective

**Service Catalog exam points:**
- Launch Constraint = provision standard products even without the user's IAM permissions
- Portfolio Sharing = standardizing multi-account self-service
- Permission Boundary + Launch Role = preventing privilege escalation

**AppConfig exam points:**
- Change runtime configuration without redeploying code (Parameter Store can also do it, but has no progressive deployment/rollback)
- Pre-deployment validation with Validators (JSON Schema, Lambda)
- Automatic rollback by attaching a CloudWatch Alarm
- FinalBakeTimeInMinutes = additional monitoring time after reaching 100%
- Lambda Extension = serves cached configuration on local port 2772

**AppRegistry exam points:**
- CFn Stack → Application association → Application Manager consolidated view
- Attribute Group = application metadata
- Difference from Resource Groups: AppRegistry has the higher-level concept of an Application

## 📝 Practice Questions

**Question 1.** A company wants to provide developers with standard VPC + RDS infrastructure as self-service while forcing developers not to be able to create other kinds of resources directly. Which tool should it use?

A) Grant all necessary permissions with IAM policies
B) Register the standard product in a Service Catalog Portfolio and specify the provisioning Role with a Launch Constraint. Developers have no permission to create resources outside the catalog directly
C) Distribute CloudFormation Templates directly to developers
D) Purchase the product from AWS Marketplace

**Answer: B**
Explanation: This is the standard pattern for self-service + enforcing the standard. The Launch Constraint Role holds the actual CloudFormation execution permissions, and developers have only permission to call the Service Catalog API. Developers can provision only the products in the catalog and can't create EC2 or RDS directly. With C, developers can modify the Template or use a different Template, so enforcing the standard is impossible.

---

**Question 2.** You want to toggle a Lambda function's Feature Flag without redeploying code. If the error rate spikes while the new configuration is being deployed, it must automatically revert to the previous configuration. What is the most suitable tool?

A) Parameter Store - store the configuration and read it from Lambda
B) AppConfig - a Feature Flag-type profile + a CloudWatch Alarm monitor configured for automatic rollback
C) DynamoDB - create a configuration table and read it from Lambda
D) Lambda environment variables - change them manually in the console

**Answer: B**
Explanation: AppConfig provides a dedicated type for Feature Flags (`AWS.AppConfig.FeatureFlags`), and if you attach a CloudWatch Alarm Monitor to the Environment, it automatically rolls back when an alarm fires during deployment. Parameter Store (A) can also store values but lacks progressive deployment and automatic rollback. Lambda environment variables (D) require a function restart when changed.

---

**Question 3.** You want to automatically validate that the JSON structure of configuration values is correct before an AppConfig deployment. Which feature should you use?

A) Monitor error patterns in CloudWatch Logs
B) Add a JSON Schema Validator to the Configuration Profile. If the schema doesn't match, the deployment doesn't start
C) A Lambda function detects configuration changes and runs validation logic
D) Block incorrect file uploads with an S3 bucket policy

**Answer: B**
Explanation: This is the Validator feature of an AppConfig Configuration Profile. If you add a `JSON_SCHEMA`-type Validator, it automatically validates before deployment that the configuration content matches the schema. If it doesn't match, the deployment doesn't start. If you need business logic validation, you can additionally use a `LAMBDA`-type Validator. Both kinds can be applied at the same time.

---

**Question 4.** You set `FinalBakeTimeInMinutes: 10` on an AppConfig deployment. What happens when you deploy with the `AllAtOnce` strategy?

A) It is applied gradually from 0% to 100% over 10 minutes
B) The configuration is applied to 100% immediately, and then the CloudWatch Alarm is monitored for 10 minutes. If an alarm fires, it rolls back automatically
C) The deployment starts after 10 minutes
D) The deployment status is checked every 10 minutes

**Answer: B**
Explanation: `FinalBakeTimeInMinutes` is the additional monitoring time after the deployment reaches 100%. The `AllAtOnce` strategy applies the configuration to 100% immediately, but if there is a FinalBakeTime, the Alarm Monitor is watched during that time. If an alarm fires during the FinalBakeTime → automatic rollback; if all is normal → the `COMPLETE` state is finalized. So `AllAtOnce` + `FinalBakeTimeInMinutes: 10` means "immediate deployment + 10 minutes of monitoring."

---

**Question 5.** A development team wants to provision the "Standard Web Stack" product from Service Catalog. The developer's IAM permissions do not include permission to create EC2 or RDS. How is provisioning possible?

A) Temporarily grant the developer EC2 and RDS permissions
B) Service Catalog assumes the IAM Role specified in the Launch Constraint and runs CloudFormation. The actual resources are created with the Launch Role's permissions, not the developer's permissions
C) Service Catalog automatically switches to the administrator account
D) CloudFormation automatically expands permissions on the developer's behalf

**Answer: B**
Explanation: This is the core behavior of the Launch Constraint. When a developer clicks "Provision Product" in Service Catalog, Service Catalog assumes the Launch Role specified in the Launch Constraint, not the developer's IAM Role, and runs CloudFormation. The resources CloudFormation creates are made with the Launch Role's permissions. Developers can provision the standard package even without EC2 or RDS permissions, and they can't create resources other than the standard package.

---

**Question 6.** A company operating 50 microservices wants to see AWS cost, alarms, and operational issues for each service on one screen. Which combination of tools is most suitable?

A) Create 50 CloudWatch Dashboards, one configured for each service
B) Define each service as an Application with AWS AppRegistry and associate the related CloudFormation Stacks. AWS Systems Manager Application Manager provides a consolidated per-service view
C) Group each service's resources with Resource Groups and Tag Editor
D) Check per-service cost in Cost Explorer by filtering by tag

**Answer: B**
Explanation: The AppRegistry + Application Manager combination is the exact answer. When you define an Application in AppRegistry and associate CFn Stacks, Application Manager provides the CloudWatch Alarms, OpsCenter Items, Config compliance status, and cost information of the resources belonging to that Application in a single view. Resource Groups (C) are tag-based grouping and bundle only resources without the higher-level concept of an Application. AppRegistry provides richer context, such as metadata through Attribute Groups and an Application hierarchy.
