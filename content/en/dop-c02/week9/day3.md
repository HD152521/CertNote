# Day 3 - AppConfig: Feature Flags and Progressive Deployment

Before AppConfig existed, feature roll-out meant: code changes to production, all at once, for all users. "New checkout flow ready" → deploy → 100% traffic sees it immediately. One bug hits 100% loss. AppConfig separates **configuration from code** and **gradual roll-out from immediate release**.

AppConfig's core: "apply configuration change to percentage of users dynamically." Lambda feature flag. ALB traffic shift. Database query behavior. All **without redeploying code**. Change a number, run a Validator Lambda, preview effects in staging, then **gradually roll out** to prod in 5%, 10%, 50%, 100% steps, abort anytime.

## AppConfig Architecture

```
AppConfig Profile:
  - Feature Name: "new-checkout-flow"
  - Validators: Lambda checking for data consistency
  - Deployment Strategy: Linear 10% every 5 minutes
  
App Code:
  GetLatestConfiguration() polls AppConfig → cache locally
  if feature["new-checkout-flow"] enabled → use new logic
```

AppConfig has **three abstractions**:

1. **Environment**: Logical grouping (dev, staging, prod)
2. **Profile**: Versioned configuration (new-checkout-flow v1, v2...)
3. **Deployment Strategy**: How to roll out (immediate, canary, linear, exponential)

| Strategy | Description | Use Case |
|----------|---|---|
| Immediate | All targets at once | Low-risk, well-tested changes |
| Linear | Percentage every N minutes | Gradual validation, observability |
| Exponential | Double percentage every N minutes | Risk-averse, infrastructure changes |
| All At Once | Concurrent to all | Emergency fix |

```bash
aws appconfig create-deployment-strategy \
  --name LinearTenPercent \
  --deployment-type LINEAR \
  --growth-factor 10 \
  --growth-type LINEAR \
  --replicate-to SSM_DOCUMENT
```

`growth-factor 10` = 10% per interval. `replicate-to SSM_DOCUMENT` mirrors change to SSM Parameter Store, enabling dynamic references in CloudFormation.

## Validators — Pre-Flight Checks

Deploying a feature flag that breaks database queries is prod disaster. Validators are **Lambda functions that execute during deployment**, checking configuration validity before it reaches apps.

```python
# Validator Lambda
import json

def handler(event, context):
    configuration = json.loads(event['configuration'])
    
    # Reject if checkout timeout < 5s (known problem)
    if configuration.get('checkout_timeout_seconds', 0) < 5:
        raise Exception('Checkout timeout must be >= 5 seconds')
    
    return {
        'deployment_state': 'SUCCEEDED'
    }
```

AppConfig invokes this validator **before each deployment stage**. If it raises, rollout stops. Linear 10% deployment with validator means: "deploy to 10%, validate with Lambda, if OK continue else abort." Risk moves from "hope the config is right" to "validate mathematically before shipping."

## Applications Polling

Applications call `GetLatestConfiguration()` periodically, with client-side caching.

```javascript
const appConfig = require('@aws-sdk/client-appconfig');

const client = new appConfig.AppConfigClient({ region: 'us-east-1' });

let configuration = {};
let configurationVersion = 0;

async function updateConfig() {
  const response = await client.send(
    new appConfig.GetLatestConfigurationCommand({
      Application: 'MyApp',
      Environment: 'prod',
      Configuration: 'FeatureFlags',
      ClientId: 'web-client-1'
    })
  );
  
  if (response.Configuration) {
    configuration = JSON.parse(response.Configuration);
    configurationVersion = response.ConfigurationVersion;
  }
}

// Poll every 60 seconds
setInterval(updateConfig, 60000);

// Application checks flags
if (configuration.newCheckoutFlow) {
  // use new checkout
}
```

`ClientId` matters: AppConfig tracks config version **per client**, so when you deploy a new version, not all clients flip at once. Clients get new config at next poll, rolling adoption. 1000 app servers, poll interval 60s = takes ~1-2 min for all to get new config. This **natural rate-limiting** prevents thundering herd of code changes hitting database simultaneously.

## Immediate Applications

**Feature flags**: "should we show New UI?" is configuration, not code. Toggle in AppConfig, clients see it within polling interval. **A/B tests**: Feature value is percentage (0-50-100 = 0% A, 50% B, 100% B). Clients hash their `ClientId` against percentage, deterministically choose branch. Same client always sees same version. **Database switching**: "Use new read replica for reports" is configuration. Change AppConfig, apps' next read picks new endpoint.

> 📚 **Case**: A SaaS deploys new database query logic to staging first. AppConfig Validator Lambda runs schema compatibility test + performance benchmark (< 500ms p99). If fails, deployment blocked before prod. Passes, deploy to prod with Linear 5% strategy. Observability shows query latency stable, scale to 50%, then 100% over 1 hour. Old logic served 95% of traffic for that hour; any issue is caught on 5% slice. One hour later, old code entirely gone. Compare: traditional deploy, all queries change at once, p99 latency jumps from 50ms to 2000ms, pages timeout. Catch 10 minutes later when alerts fire. Lost revenue during that window. AppConfig prevents this.

## Related Pattern: Safely Deploying Config Changes

AppConfig isn't just about rolling out features; it's **infrastructure automation with gradual validation**. Same pattern as Patch Manager's `ApproveAfterDays` (bake time before prod) and CodeDeploy's traffic shift (percentage rollout). Each is asking: "How to change everything gradually, stopping if problems appear?"

---

## 📝 Practice Questions

**Question 1.** New payment logic is ready and you want to show it first to only 5% of existing users. How can this feature be implemented without a code deployment?

A) Split Lambda function version traffic 5%/95%
B) Route 5% with an ALB listener rule
C) AppConfig feature flag + a percentage comparison based on ClientId → deterministic true/false assignment
D) Spin up 5% new EC2 instances and deploy different code

**Answer: C**

Explanation: If the AppConfig feature value is "enableNewCheckout: 50" (50%), the client hashes its ClientId and deterministically gets true if the value in the 0-100 range is 50 or below, and false if above. The same client always gets the same result (consistency), and 50% of all clients get true (statistical). No code deployment is needed. Changing the value to 5 applies the new logic to only 5%. ALB/Lambda versions (A, B) are code-level splits that require deployment, and D is managed entirely separately.

---

**Question 2.** In an AppConfig deployment strategy, how do you implement "increase by 10% every 5 minutes in 5 steps, deploy only up to 50%, and then require manual approval"?

A) Linear 10%, 5 minutes interval
B) Linear 20%, 5 minutes — it reaches 100% in 25 minutes, so the 50% constraint is not possible
C) Create a custom deployment strategy and then add manual approval at each step
D) Not possible with AppConfig, implement directly with Lambda

**Answer: C**

Explanation: AppConfig default strategies (Immediate/Linear/Exponential) are either fully automatic or only set a percentage. Stopping at an upper limit (50%) and requesting manual approval is not possible within the default strategies. To mix an AWS managed group with human judgment, you would have to create a custom deployment strategy by combining final-bake-percentage, manual-approval-gate, and growth-factor. On the exam, when you see "until X% then manual," the custom strategy is the answer.

---

**Question 3.** The payment data schema changed, and the new configuration must be validated before deploying it with AppConfig. What is the most recommended method?

A) Review the configuration manually and then deploy
B) Specify a validator Lambda to validate automatically at deployment — database migration check, schema compatibility check, P99 performance benchmark
C) Preview with a CloudFormation change set
D) Monitor with CloudWatch after deployment

**Answer: B**

Explanation: The validator runs a Lambda right before deployment to validate the configuration. Codifying automatable checks such as schema compatibility and performance criteria (P99 < X ms) dramatically reduces risk. Manual review (A) allows human error, a CloudFormation change set (C) validates infrastructure code, not runtime configuration, and post-deployment monitoring (D) is cleaning up after the damage is already done.

---

**Question 4.** Apps in 100 Regions worldwide must use the same feature flag. How do you implement it so that editing in one place automatically synchronizes all Regions?

A) Configure a separate AppConfig profile in each Region
B) Central Region AppConfig + direct requests with the SDK → latency problems, and everything goes down if the central Region fails
C) Synchronize to SSM Parameter Store with AppConfig replicate-to SSM_DOCUMENT → CloudFormation dynamic references or app polling
D) Update each Region manually

**Answer: C**

Explanation: If you enable the replicate-to option in an AppConfig deployment strategy, the same configuration is automatically replicated to SSM Parameter Store at deployment. SSM is a Regional service that exists per Region but keeps the same value. Each app polls its local SSM/AppConfig and synchronizes automatically. Centralization (B) brings latency and a single point of failure, and manual (D) is not possible at scale.

---

**Question 5.** The ElastiCache Redis endpoint changed, and 1000 microservices need to know about it. How can this be done without modifying service code?

A) Notify all services of the configuration change manually and redeploy
B) Store the endpoint in AppConfig or SSM Parameter Store → services call GetLatestConfiguration/GetParameter → no redeployment needed
C) Change the DNS CNAME — wait for the TTL to expire, consistency is hard to guarantee
D) Update all ECS tasks with environment variables

**Answer: B**

Explanation: The configuration-as-data pattern. Operational values such as endpoints are managed in AppConfig/Parameter Store, and applications fetch the latest value with an API call. No service code change or deployment is needed. The management burden of 1000 redeployments disappears. DNS (C) has no synchronization guarantee because of the TTL, and environment variables (D) require restarting all containers/tasks.

---

**Question 6.** How can a configuration currently managed with AppConfig be referenced dynamically from a CloudFormation resource definition?

A) Hardcode the AppConfig configuration values in the CloudFormation template
B) Enable AppConfig replicate-to SSM_DOCUMENT and then use the `{{resolve:ssm:/path:1}}` dynamic reference in CloudFormation
C) Call AppConfig with a CloudFormation macro
D) Query AppConfig with a separate Lambda custom resource

**Answer: B**

Explanation: If you synchronize values to Parameter Store with the AppConfig replicate-to SSM_DOCUMENT option, the CloudFormation dynamic reference syntax `{{resolve:ssm:/path:version}}` resolves the value at deployment time, not at definition time. When the configuration changes, SSM is updated automatically and the next stack update sees the new value. Hardcoding (A) means modifying the template on every change (a static link), and macros (C) / custom resources (D) are unnecessarily complex.

---

**Question 7.** How do you deploy a new feature with Linear 10% at 5-minute intervals, but check the validation metrics manually after each step and decide whether to proceed?

A) Set a Linear deployment strategy in AppConfig and let it proceed automatically
B) Notify a person after each step with EventBridge + SNS → call the manual APPROVE/ROLLBACK API
C) Configure manual approval at each step in AppConfig
D) Check CloudWatch after deployment and roll back to the previous version if necessary

**Answer: B**

Explanation: An AppConfig deployment strategy proceeds automatically (the only stop condition is a validator failure). To involve human judgment, capture the deployment state change event with EventBridge and send an SNS notification, and the operator checks the metrics and then calls the StartDeployment/StopDeployment API. It does not stop automatically after each step, but it can be controlled through the API. There is no default setting like C, so manual orchestration with EventBridge is the standard.

---

## 📌 Today's Summary

The essence of AppConfig is three things. First, separate configuration from code to control features without deployments. Second, the deployment strategy (Linear/Exponential) and the validator Lambda together codify **gradual deployment + pre-validation**. Third, ClientId-based hash determination guarantees **deterministic and fair random assignment**. Through replicate-to SSM_DOCUMENT it also connects to CloudFormation dynamic references, so IaC and configuration management circulate in a single system.
