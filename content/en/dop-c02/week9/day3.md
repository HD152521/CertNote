# Day 3 - AppConfig: Feature Flags and Progressive Deployment

Deployment is risky. The moment you push new code to prod, you can't fully know what will happen, and if something goes wrong you have to perform another deployment, a rollback. But if you look closely, a good share of what we want to change in prod is not the code itself. "Should we turn this new feature on or off?", "Should the retry count be 3 or 5?", "Should we show this promotion to only 10% of users?" These are changes to behavior, not changes to logic. Yet traditionally, even one small behavior change like this required a full code redeployment.

AppConfig unties this knot. **It separates configuration from code and turns it into external data (configuration as data)**, then changes that data gradually without redeploying code. Turning a feature flag on, tuning a threshold, and exposing a promotion to only some users all happen without a git push or a Lambda redeployment. Today we look at why this configuration-as-data is so powerful, why AppConfig's five-element structure is divided the way it is, how pre-deployment validation (Validator) and automatic rollback during deployment (Monitor) make a "configuration change" as safe as a "code deployment", and how the Lambda Extension reduces cost and latency with the small trick of localhost:2772. On the DOP exam, "toggle a feature on/off without a code deployment" and "gradual activation from 10% to 100% + automatic rollback on alarm" are almost always answered by AppConfig.

## Configuration as Data — Separating Code from Configuration

"What goes into code and what gets pulled out into configuration?" is an old question in software. The principle is to pull out into configuration whatever changes often, whatever you want to change without a deployment, and whatever differs per environment. The 12-Factor App methodology pins down the same idea with "store config in the environment."

Environment variables, however, have limits. Changing an environment variable requires restarting the process (that is, a redeployment), gradual rollout is impossible (everything changes at once), and there is no validation to stop a wrong value from being entered. AppConfig lifts configuration from an "environment variable" to "external data fetched dynamically at runtime." The application polls for configuration periodically while running, not just at startup, and reflects the latest values. Behavior changes without a restart.

This is the foundation of the **feature flag (feature toggle)**. You plant only a branch in the code (`if flag.enabled`) and control whether that branch is on or off through external configuration. You deploy the new feature's code to prod ahead of time but leave it switched off with the flag (a dark launch), and when you're ready you simply turn the flag on to activate it. Deployment and release are separated — this is the core technique of modern continuous delivery.

> 💡 **Related theory**: Separating deploy from release is a core principle of trunk-based development and continuous delivery. Established in Martin Fowler's writing, the concept treats putting code into prod (deploy) and exposing a feature to users (release) as separate acts. Feature flags make this separation possible. Even an unfinished feature can be merged into trunk and deployed with its flag off, which avoids the merge hell of long-lived branches. AppConfig provides these feature flags as a managed service and, beyond simple on/off, adds gradual rollout and automatic rollback.

> ⚠️ **Pitfall**: Feature flags are powerful, but if left unmanaged they become technical debt. If you leave the flag of a feature whose release is finished in place without removing it, branches like `if oldFlag ... else if newFlag ...` pile up in the code and it becomes impossible to test every combination of paths. Each flag doubles the number of code paths, so N flags produce up to 2^N combinations. This is why AppConfig's feature flag format has `_deprecation` metadata — it is a signal to track flags that have reached the end of their life and remove them. Debt starts the moment a "temporary flag" becomes a "permanent flag."

## The Five AppConfig Elements — Why Is It Divided This Way?

The structure of AppConfig feels complicated the first time you see it. For a single deployment, all five concepts are needed: Application, Environment, ConfigurationProfile, ConfigurationVersion, and DeploymentStrategy. Why is it sliced so finely? Each exists to separate a different axis of variability.

```
Application (e.g., checkout-api)         ← whose configuration is this
  ├─ Environment (dev / staging / prod) ← which environment is it deployed to (alarm monitors attach here)
  └─ ConfigurationProfile (featureflags / app-settings) ← what is being configured (the Validator attaches here)
       └─ Hosted / SSM Parameter / S3 / Secrets Manager  ← where is it stored
```

- **Application**: The owner of the configuration (which service). A logical grouping.
- **Environment**: The target environment of the deployment. **The CloudWatch alarm monitors attach here** — each environment sets up automatic rollback with its own alarms.
- **ConfigurationProfile**: The kind of configuration and its storage location, and **the Validator attaches here**. You choose a Feature Flag type (structured flags) or a Freeform type (arbitrary JSON/YAML).
- **ConfigurationVersion**: A specific version of the configuration. The version goes up every time you create a new value — a rollback means returning to a previous version.
- **DeploymentStrategy**: How to spread it (immediate, gradual, or canary).

The key of this separation is that **alarms attach to the environment, and validation attaches to the configuration profile**. Even if you deploy the same configuration profile (featureflags) to dev and prod, you can apply a strict 5xx alarm only to the prod environment to trigger automatic rollback. The validation logic (Validator) applies identically to every environment — a malformed value should be blocked in dev and prod alike. It is a design that places things with different axes of variability into different concepts.

> The storage backend of a ConfigurationProfile (Hosted/SSM/S3/Secrets Manager) is chosen according to the size and nature of the configuration. **Hosted Configuration** is the simplest choice, versioned directly by AppConfig, and suits small feature flags and settings. Use **SSM Parameter** when you already use Parameter Store, **S3** for large configurations approaching 10MB, and **Secrets Manager** when the configuration contains secrets. What matters is that the deployment strategy, validation, and rollback mechanisms of AppConfig apply identically whichever backend you choose. AppConfig is not a store but a "deployment orchestrator" — wherever you keep the value, its real job is to deploy that value gradually and safely.

## Deployment Strategy — The Mathematics of the Canary

What decisively separates AppConfig from a plain key-value store is the Deployment Strategy. Instead of applying a configuration change to 100% at once, it spreads the change gradually over time.

```bash
aws appconfig create-deployment-strategy \
  --name Canary10Percent20Minutes \
  --deployment-duration-in-minutes 20 \
  --growth-factor 10 --growth-type LINEAR \
  --final-bake-time-in-minutes 10 \
  --replicate-to NONE
```

Here is what these numbers mean. `growth-type LINEAR` + `growth-factor 10` + `duration 20` means "increase linearly by 10% at each step over 20 minutes." The share of polling clients that receive the new configuration moves over time like this.

```
LINEAR, growth-factor 10, duration 20 minutes:
T+0 min:  10% of clients get the new configuration
T+2 min:  20%
T+4 min:  30%
...
T+18 min: 100%
T+20 min: deployment complete → final bake begins
T+30 min: bake complete (alarms are watched for these 10 minutes; automatic rollback if one fires)
```

If you change to `growth-type EXPONENTIAL`, the growth is exponential (2%→4%→8%→16%...). It exposes only a very small share at first to minimize risk and spreads faster as it goes. It is a curve closer to a canary. `final-bake-time-in-minutes 10` is the bake time during which alarms are still watched for 10 minutes after reaching 100% — if a problem signal is caught during this time, it automatically rolls back.

| Predefined strategy | Curve | Use |
|---------------|------|------|
| `AppConfig.AllAtOnce` | Immediate 100% | Low-risk changes, fast application |
| `AppConfig.Linear50PercentEvery30Seconds` | Fast, 2 steps | Quick validation in dev/staging |
| `AppConfig.Canary10Percent20Minutes` | Conservative, gradual | Risky changes in prod |

> The name canary deployment comes from the canary in a coal mine. Miners brought canaries, which are sensitive to toxic gas, and detected danger when the bird collapsed first; likewise, exposing the new version to a portion of traffic (the canary) first detects problems early. The growth-factor and duration quantify "how slowly to raise the exposure ratio." The more slowly you raise the exposure ratio, the more you discover problems with little impact, but the longer the deployment takes. This also connects to statistical power — only when more traffic has passed through the new version do rare anomalies such as 5xx errors show up with statistical significance. The canary ratio and bake time are a trade-off of "detection confidence vs deployment speed."

> AppConfig's gradual rollout is polling-based, so its mechanism differs from CodeDeploy's traffic shifting. CodeDeploy adjusts load balancer weights to send "X% of traffic to the new version." In AppConfig, when a client polls, the AppConfig service decides "do you belong to the new configuration group?" and responds accordingly. That is, it is not traffic distribution but a partitioning of the set of polling clients. That is why an AppConfig gradual rollout creates situations in which multiple instances/Lambdas running the same code receive different configuration values. An important premise is that the application must be able to tolerate a temporary inconsistency in configuration values (some on the new value, some on the old).

## Validator and Monitor — Making Configuration Changes as Safe as Code Deployments

Changing configuration without a code deployment is a double-edged sword. It is fast and convenient, but it also means bypassing the test and review gates of CI/CD. How do you stop someone from accidentally entering `"thirty"` (a string) or a negative number for `timeoutSec`? AppConfig fills the risk of this bypass with two layers of safeguards — validation **before** deployment (Validator) and monitoring **during** deployment (Monitor).

The **Validator** automatically validates the configuration before the deployment starts. There are two kinds.

```json
// JSON Schema Validator — validates format and range
{
  "type": "object",
  "required": ["maxRetry", "timeoutSec"],
  "properties": {
    "maxRetry":   {"type": "integer", "minimum": 1, "maximum": 10},
    "timeoutSec": {"type": "integer", "minimum": 1, "maximum": 300}
  }
}
```

JSON Schema validates the format, required fields, and value ranges of the configuration declaratively. If `timeoutSec` is not an integer or exceeds 300, the deployment doesn't even start. More complex business rules (for example, "if flag A is on, B must be off") are validated by a **Lambda Validator**, which receives the configuration content and returns SUCCESS/FAILURE.

The **Monitor** watches CloudWatch alarms during and after deployment. If you register alarms on an Environment, the moment one of them enters the ALARM state during a gradual deployment or during the final bake, AppConfig **automatically rolls back to the previous version**.

```bash
aws appconfig update-environment \
  --application-id $APP_ID --environment-id $ENV_ID \
  --monitors '[
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:5xxErrorRate"},
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:LatencyHigh"}
  ]'
```

These two layers are the key. **The Validator blocks "a wrong value going in" beforehand, and the Monitor catches, afterward, "a value that is correct but worsens operational metrics."** A change that passes the format check but is bad for the business — for example, suddenly exposing everyone with `rolloutPercent: 100` and watching 5xx errors surge — is automatically reverted by the Monitor when it sees the alarm. It applies the exact same two-stage defense of code deployment, "tests (beforehand) + canary monitoring (afterward)," to configuration changes.

> 🎯 **Scenario**: "The marketing team wants to turn a promotion banner on and off without a code deployment. However, if a wrong setting increases 5xx errors on the payment page, it must automatically revert." — The answer is an AppConfig Feature Flag profile + a JSON Schema Validator (validating the settings format) + a 5xx alarm Monitor registered on the prod Environment + a Canary gradual deployment strategy. The marketing team just creates a new hosted configuration version and starts a deployment. Format errors are stopped beforehand by the Validator and operational degradation afterward by the Monitor. Behavior is changed safely without code deployment permissions.

> An incident that showed the danger of feature flags was Knight Capital in 2012 (before the AppConfig era, but the lesson is the same). A reused flag bit awakened old trading logic that should have been deactivated, and the company lost 440 million dollars in 45 minutes. The lesson is that without validation, gradual application, and automatic rollback, a flag change can be even more dangerous than a code deployment. AppConfig's Validator + gradual deployment + Monitor automatic rollback is a mechanism built to structurally prevent exactly this scenario, where "a flag change applies to everything at once and explodes."

## Lambda Extension — Cost Optimization at localhost:2772

How does an application fetch AppConfig configuration? The simplest way is to call `GetLatestConfiguration` with the AppConfig SDK every time. But this has two problems. First, in environments like Lambda where invocations surge, a great many function instances hit the AppConfig API at the same time, raising cost and the risk of throttling. Second, the API round-trip latency is added to every invocation.

The **AppConfig Lambda Extension** solves this problem elegantly. When you attach the Extension as a Lambda layer, a small sidecar process starts alongside the function, **polling AppConfig periodically in the background and caching the latest value**. The function code fetches the cached value not from the external AppConfig but from `http://localhost:2772` inside the same execution environment.

```yaml
Resources:
  MyFn:
    Type: AWS::Serverless::Function
    Properties:
      Layers:
        - !Sub 'arn:aws:lambda:${AWS::Region}:027255383542:layer:AWS-AppConfig-Extension:67'
      Environment:
        Variables:
          AWS_APPCONFIG_EXTENSION_POLL_INTERVAL_SECONDS: 45
```

```python
import json, urllib.request
CONFIG_URL = ('http://localhost:2772/applications/checkout-api'
              '/environments/prod/configurations/featureflags')

def get_config():
    with urllib.request.urlopen(CONFIG_URL) as r:
        return json.loads(r.read())
```

`POLL_INTERVAL_SECONDS: 45` means the Extension fetches the new value from AppConfig every 45 seconds. Even if the function is invoked thousands of times per second, the AppConfig API is called only once every 45 seconds. Because a cache hit is a localhost call, there is almost no latency either. On EC2, ECS, and EKS, you run the same Extension as a daemon or sidecar and use the same localhost:2772 interface.

The polling interval is a trade-off. A short one reflects configuration changes quickly but increases AppConfig API calls (that is, Configuration Session cost) and load; a long one reduces cost but reflects new configuration more slowly. During a gradual deployment, the polling interval becomes the "resolution at which each client receives the new configuration," so it should be set sufficiently shorter than the duration for the gradual curve to be drawn as intended.

> AppConfig bills on a Configuration Session basis. Since the Extension's polling is itself the session call, "polling interval × number of concurrent execution environments" determines cost. Lambda gives each concurrent execution its own execution environment (that is, its own Extension), but within each environment the Extension shares the cache, so not every function invocation hits the API. That is why the real cost is closer to "number of concurrent execution environments × (duration / poll-interval)" than to "100 million function invocations." Setting the polling interval too short makes cost spike for highly concurrent functions, which is a pitfall that also appears on the exam.

## The Boundary with Evidently — Operational Flags vs Experiments

CloudWatch Evidently is often compared with AppConfig. Both do gradual exposure and feature flags, but their purposes differ.

| Item | AppConfig | CloudWatch Evidently |
|------|-----------|----------------------|
| Purpose | Operational configuration + feature flags + safe deployment | A/B experiments + statistical significance analysis |
| Analysis | Delegated externally (CloudWatch/X-Ray) | Built-in statistics (conversion rate, confidence interval) |
| User segments | Handled in code | Built-in segments/targeting |
| Automatic rollback | ✅ (alarm Monitor) | Experiment stop |

AppConfig is an **operational** tool: "turn this feature on safely, and revert if operational metrics get worse." Evidently is an **experimentation** tool that measures "which of version A and B has a statistically significantly higher conversion rate?" However, since 2024 Evidently has been heading in a direction where new usage is discouraged, so the trend is to consolidate even experimentation into AppConfig + external analytics. On the exam, you can separate them as "safe gradual deployment and automatic rollback = AppConfig" and "statistical A/B experiments = Evidently."

> An A/B test is statistical hypothesis testing. It judges whether the difference in metrics between two variants (A/B) is chance or real, using p-values and confidence intervals. Evidently has this statistics built in because sufficient sample size and a significance verdict are the essence of an "experiment." AppConfig's gradual deployment, by contrast, is not hypothesis testing but risk management — the goal is to "discover problems with little impact and revert." Even for the same "gradual exposure," one aims at statistical learning and the other at safe operation, and that is the essence that separates the two services.

## Summary

Today's picture has five parts. First, **AppConfig is configuration as data**, separating configuration from code and serving as the foundation of feature flags that separate deploy from release — though flags that have reached the end of their life become debt and must be cleaned up. Second, **the five-element structure is a design that separates axes of variability**: the alarm Monitor attaches to the Environment and the Validator to the ConfigurationProfile. Third, **the Deployment Strategy's growth-factor, duration, and bake-time are the mathematics of the canary**, and because it works by partitioning the set of polling clients, the application must be able to tolerate temporary configuration inconsistency. Fourth, the two layers of **Validator (format validation beforehand) + Monitor (automatic rollback on alarm afterward)** make configuration changes as safe as code deployments. Fifth, **the Lambda Extension provides a cache at localhost:2772**, letting you tune cost and freshness through the polling interval.

In the next post we move on to another axis of configuration, secrets. We'll look at the boundary between Parameter Store and Secrets Manager, and at how the tricky problem of zero-downtime rotation is solved with alternating users.

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
