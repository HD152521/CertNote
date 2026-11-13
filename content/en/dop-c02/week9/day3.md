# Day 3 - AppConfig: The Art of Changing Behavior Without a Code Deployment

Deployment is risky. The moment you push new code to prod, you can't fully know what will happen, and if something goes wrong you have to perform another deployment called a rollback. But if you look closely, much of what we want to change in prod isn't the code itself. "Should we turn this new feature on or off?" "Should the retry count be 3 or 5?" "Should we show this promotion to only 10% of users?" These are changes of behavior, not changes of logic. Yet traditionally, even one of these small behavior changes meant going through a full code redeployment.

AppConfig unties this knot. **It separates configuration from code and makes it external data (configuration as data)**, and then changes that data gradually without redeploying code. Turning on a feature flag, adjusting a threshold, and exposing a promotion to only some users all happen without a git push or a Lambda redeployment. Today we look at why this configuration-as-data is powerful, why AppConfig's five-element structure is divided the way it is, how pre-deployment validation (Validator) and in-flight automatic rollback (Monitor) make a "configuration change" "as safe as a code deployment," and how the Lambda Extension reduces cost and latency with the small trick of localhost:2772. On the DOP exam, "turn a feature on/off without a code deployment" and "gradual activation 10% → 100% + automatic rollback on alarm" are almost always AppConfig.

## Configuration as Data: Separating Code from Configuration

"What goes in the code and what gets pulled out into configuration?" is an old question in software. The principle is to pull out into configuration the values that change often, that you want to change without a deployment, and that differ per environment. The 12-Factor App methodology nailing down "store config in the environment" is in the same vein.

But environment variables have limits. To change an environment variable you have to restart the process (= redeploy), you can't apply it gradually (everything changes at once), and there is no validation to stop a wrong value. AppConfig lifts configuration from an "environment variable" to "external data fetched dynamically at runtime." The application polls for configuration periodically while running, not just at startup, and reflects the latest value. Behavior changes without a restart.

This is the foundation of the **feature flag (feature toggle)**. You plant only a branch in the code (`if flag.enabled`) and control whether that branch is on or off through external configuration. You deploy the new feature's code to prod in advance but leave it turned off with the flag (a dark launch), and when you're ready you flip only the flag to activate it. Deployment and release are decoupled, and this is a core technique of modern continuous deployment.

> 💡 **Related theory**: The separation of deploy and release is a core principle of trunk-based development and continuous deployment. It is a concept established in Martin Fowler's writing, and it treats putting code into prod (deploy) and exposing a feature to users (release) as separate acts. Feature flags make this separation possible. You can merge and deploy even an unfinished feature to trunk with its flag off, which avoids the merge hell of long-lived branches. AppConfig provides these feature flags as a managed service, and on top of a simple on/off it adds gradual rollout and even automatic rollback.

> ⚠️ **Trap**: Feature flags are powerful, but if unmanaged they become technical debt. If you leave the flag of a finished feature unremoved, branches like `if oldFlag ... else if newFlag ...` accumulate in the code, and testing every combination of paths becomes impossible. Each flag doubles the number of code paths, so N flags create up to 2^N combinations. That is why AppConfig's feature flag format has `_deprecation` metadata: it is a signal to track and remove flags that have reached the end of their life. The moment a "temporary flag" becomes a "permanent flag," the debt begins.

## The Five Elements of AppConfig: Why Is It Divided This Way?

When you first look at AppConfig, the structure feels complicated. For a single deployment you need all five concepts: Application, Environment, ConfigurationProfile, ConfigurationVersion, and DeploymentStrategy. Why was it split so finely? Because each one separates a different axis of variability.

```
Application (e.g., checkout-api)         ← Which app's configuration is this
  ├─ Environment (dev / staging / prod) ← Which environment are we deploying to (the alarm monitor attaches here)
  └─ ConfigurationProfile (featureflags / app-settings) ← What are we configuring (the Validator attaches here)
       └─ Hosted / SSM Parameter / S3 / Secrets Manager  ← Where is it stored
```

- **Application**: The owner of the configuration (which service). A logical group.
- **Environment**: The target environment for deployment. **The CloudWatch alarm monitor attaches here**, so you set up automatic rollback with different alarms per environment.
- **ConfigurationProfile**: The kind of configuration and where it is stored, and **the Validator attaches here**. You choose a Feature Flag type (structured flags) or a Freeform type (arbitrary JSON/YAML).
- **ConfigurationVersion**: A specific version of the configuration. The version goes up every time you create a new value; a rollback means reverting to the previous version.
- **DeploymentStrategy**: How to spread it (immediately / gradually / canary).

The key to this separation is that **alarms attach to the environment and validation attaches to the configuration profile**. Even if you deploy the same configuration profile (featureflags) to dev and prod, you can set a strict 5xx alarm only on the prod environment so that automatic rollback works there. The validation logic (Validator) applies identically to any environment, because a wrong format must be blocked in dev and prod alike. It is a design that puts things with different axes of variability into different concepts.

> The storage backend of a ConfigurationProfile (Hosted/SSM/S3/Secrets Manager) is chosen according to the size and nature of the configuration. **Hosted Configuration** is the simplest choice, versioned directly by AppConfig, and suits small feature flags and settings. Use **SSM Parameter** when you already use Parameter Store, **S3** when the configuration is large, close to 10MB, and **Secrets Manager** when it contains secrets. What matters is that whichever backend you use, AppConfig's deployment strategy, validation, and rollback mechanisms apply the same way. AppConfig is not a store but a "deployment orchestrator": its real job is to deploy that value safely and gradually, wherever you keep it.

## Deployment Strategy: The Math of the Canary

What decisively separates AppConfig from a simple key-value store is the Deployment Strategy. Instead of applying a configuration change to 100% at once, it spreads it gradually over time.

```bash
aws appconfig create-deployment-strategy \
  --name Canary10Percent20Minutes \
  --deployment-duration-in-minutes 20 \
  --growth-factor 10 --growth-type LINEAR \
  --final-bake-time-in-minutes 10 \
  --replicate-to NONE
```

Here is what these numbers mean. `growth-type LINEAR` + `growth-factor 10` + `duration 20` means "increase linearly by 10% at each step over 20 minutes." The proportion of polling clients that receive the new configuration moves over time like this.

```
LINEAR, growth-factor 10, duration 20 min:
T+0 min:  10% of clients get the new configuration
T+2 min:  20%
T+4 min:  30%
...
T+18 min: 100%
T+20 min: deployment complete → final bake begins
T+30 min: bake complete (alarms are watched for these 10 minutes; automatic rollback if one fires)
```

If you change to `growth-type EXPONENTIAL`, the growth is exponential (2% → 4% → 8% → 16% ...). It minimizes risk by exposing only a very small percentage at first and then spreads quickly toward the end. It is a curve closer to a canary. `final-bake-time-in-minutes 10` is the soak time during which alarms are watched for 10 minutes even after reaching 100%; if a problem signal is caught during this time, it rolls back automatically.

| Predefined strategy | Curve | Use |
|---------------|------|------|
| `AppConfig.AllAtOnce` | 100% immediately | Non-risky changes, fast application |
| `AppConfig.Linear50PercentEvery30Seconds` | Fast two steps | Fast validation in dev/staging |
| `AppConfig.Canary10Percent20Minutes` | Conservative gradual | Risky changes in prod |

> The name canary deployment comes from the canary in a coal mine. Just as miners took canaries, which are sensitive to toxic gas, and detected danger when the bird collapsed first, you expose the new version first to part of the traffic (the canary) to detect problems early. Growth-factor and duration quantify "how slowly will you raise the exposure percentage?" The more slowly you raise the exposure percentage, the sooner you find problems with little impact, but the longer the deployment takes. This also connects to statistical power: more traffic has to pass through the new version before a rare anomaly like 5xx shows up as statistically significant. Canary percentage and bake time are a trade-off between "detection confidence vs. deployment speed."

> AppConfig's gradual rollout is polling-based, so its mechanism differs from CodeDeploy's traffic shifting. CodeDeploy adjusts load balancer weights to send "X% of traffic to the new version." In AppConfig, when a client polls, the AppConfig service decides "do you belong to the new configuration group?" and responds. That is, it is a division of the set of polling clients, not a traffic distribution. So AppConfig's gradual rollout creates a situation where multiple instances/Lambdas running the same code receive different configuration values. An important premise is that the application must be able to tolerate temporary inconsistency in configuration values (some with the new value, some with the old).

## Validator and Monitor: Making Configuration Changes as Safe as Code Deployments

Changing configuration without a code deployment is a double-edged sword. It is fast and convenient, but it also means bypassing the test and review gates of CI/CD. What stops someone from mistakenly entering `"thirty"` (a string) or a negative number for `timeoutSec`? AppConfig covers the risk of this bypass with two layers of safeguards: validation **before** deployment (Validator) and monitoring **during** deployment (Monitor).

The **Validator** automatically validates the configuration before the deployment starts. There are two kinds.

```json
// JSON Schema Validator — format and range validation
{
  "type": "object",
  "required": ["maxRetry", "timeoutSec"],
  "properties": {
    "maxRetry":   {"type": "integer", "minimum": 1, "maximum": 10},
    "timeoutSec": {"type": "integer", "minimum": 1, "maximum": 300}
  }
}
```

JSON Schema validates the configuration's format, required fields, and value ranges declaratively. If `timeoutSec` isn't an integer or exceeds 300, the deployment doesn't even start. More complex business rules (for example, "if flag A is on, B must be off") are validated by a **Lambda Validator**, which receives the configuration content and returns SUCCESS/FAILURE.

The **Monitor** watches CloudWatch alarms during and after deployment. If you register alarms on the Environment, the moment such an alarm goes into the ALARM state during a gradual deployment or during the final bake, AppConfig **automatically rolls back to the previous version**.

```bash
aws appconfig update-environment \
  --application-id $APP_ID --environment-id $ENV_ID \
  --monitors '[
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:5xxErrorRate"},
    {"AlarmArn":"arn:aws:cloudwatch:...:alarm:LatencyHigh"}
  ]'
```

These two layers are the key. **The Validator blocks "wrong values going in" beforehand, and the Monitor catches "values that are correct but worsen operational metrics" afterward.** A change that passes the format but is bad for the business, for example suddenly exposing everyone with `rolloutPercent: 100` and seeing 5xx explode, is automatically reverted by the Monitor when it sees the alarm. It applies to configuration changes exactly the same two-stage defense as code deployment's "tests (before) + canary monitoring (after)."

> 🎯 **Scenario**: "The marketing team wants to turn a promotion banner on and off without a code deployment. However, if a wrong setting increases 5xx on the checkout page, it must automatically revert." The answer is an AppConfig Feature Flag profile + a JSON Schema Validator (validating the settings format) + registering a 5xx alarm Monitor on the prod Environment + a Canary gradual deployment strategy. The marketing team just creates a new hosted configuration version and starts the deployment. Format errors are blocked beforehand by the Validator, and operational degradation is blocked afterward by the Monitor. You change behavior safely even without code deployment permissions.

> The incident that showed the danger of feature flags was Knight Capital in 2012 (from the era before AppConfig, but the lesson is the same). A reused flag bit woke up old trading logic that should have been disabled, and the firm lost 440 million dollars in 45 minutes. The lesson is that without validation, gradual application, and automatic rollback, a flag change can be even more dangerous than a code deployment. AppConfig's Validator + gradual deployment + Monitor automatic rollback is exactly the device to structurally block this kind of scenario where "a flag change is applied to everything at once and blows up."

## Lambda Extension: Cost Optimization with localhost:2772

How does the application fetch AppConfig configuration? The simplest way is to call `GetLatestConfiguration` with the AppConfig SDK every time. But this has two problems. First, in an environment like Lambda where invocations surge, a huge number of function instances hit the AppConfig API at the same time, raising cost and throttle risk. Second, every invocation adds an API round-trip latency.

The **AppConfig Lambda Extension** solves this problem elegantly. When you attach the Extension as a Lambda layer, a small sidecar process starts next to the function that **polls AppConfig periodically in the background and caches the latest value**. The function code fetches the cached value not from external AppConfig but from `http://localhost:2772` inside the same execution environment.

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

`POLL_INTERVAL_SECONDS: 45` means the Extension fetches a new value from AppConfig every 45 seconds. Even if the function is invoked thousands of times per second, the AppConfig API is called only once every 45 seconds. A cache hit is a localhost call, so latency is nearly nil too. On EC2, ECS, and EKS, you run the same Extension as a daemon or sidecar and use the same localhost:2772 interface.

The polling interval is a trade-off. A short one reflects configuration changes quickly but increases AppConfig API calls (= Configuration Session cost) and load, while a long one reduces cost but slows the reflection of new configuration. During a gradual deployment, the polling interval becomes "the resolution at which each client receives the new configuration," so you should set it sufficiently shorter than the duration for the gradual curve to be drawn as intended.

> AppConfig bills based on Configuration Sessions. The Extension's polling is itself a session call, so "polling interval × number of concurrent execution environments" governs cost. Lambda has a separate execution environment (= a separate Extension) for each concurrent execution, but within each environment the Extension shares its cache, so not every function invocation hits the API. So the real cost is closer to "number of concurrent execution environments × (duration / poll-interval)" than to "100 million function invocations." That setting the polling interval too short makes costs spike for highly concurrent functions is a trap that also appears on the exam.

## The Boundary with Evidently: Operational Flags vs. Experiments

The service most often compared with AppConfig is CloudWatch Evidently. Both do gradual exposure and feature flags, but their purposes differ.

| Item | AppConfig | CloudWatch Evidently |
|------|-----------|----------------------|
| Purpose | Operational configuration + feature flags + safe deployment | A/B experiments + statistical significance analysis |
| Analysis | Delegated to external (CloudWatch/X-Ray) | Built-in statistics (conversion rate, confidence interval) |
| User segments | Handled in code | Built-in segments/targeting |
| Automatic rollback | ✅ (alarm Monitor) | Experiment stop |

AppConfig is an **operations** tool that says "turn this feature on safely and revert if operational metrics get worse." Evidently is an **experimentation** tool that measures "which of version A and B has a statistically significantly higher conversion rate?" However, since 2024 Evidently has been heading in a direction where new use is not recommended, so the trend is to consolidate even experimentation into AppConfig + external analysis. On the exam, you can distinguish them as "safe gradual deployment and automatic rollback = AppConfig" and "statistical A/B experiments = Evidently."

> An A/B test is statistical hypothesis testing. It judges whether the difference in metrics between two variants (A/B) is by chance or real using p-values and confidence intervals. Evidently has this statistics built in because sufficient samples and a significance judgment are the essence of an "experiment." AppConfig's gradual deployment, by contrast, is not hypothesis testing but risk management: the goal is to "find problems with little impact and revert if they occur." Even for the same "gradual exposure," one aims at statistical learning and the other at safe operations, and that is what fundamentally separates the two services.

## Summary

Today's picture has five parts. First, **AppConfig is configuration as data**, separating configuration from code and serving as the foundation of the feature flags that decouple deploy and release, but flags past their lifetime become debt and must be cleaned up. Second, the **five-element structure is a design that separates axes of variability**, with the alarm Monitor attached to the Environment and the Validator attached to the ConfigurationProfile. Third, **the Deployment Strategy's growth-factor, duration, and bake-time are the math of the canary**, and since it divides the set of polling clients, the application must tolerate temporary configuration inconsistency. Fourth, the two layers of **Validator (format validation beforehand) + Monitor (automatic alarm-based rollback afterward)** make configuration changes as safe as code deployments. Fifth, the **Lambda Extension provides a cache at localhost:2772**, letting you tune cost and freshness with the polling interval.

In the next post we move on to secrets, another axis of configuration. We look at the boundary between Parameter Store and Secrets Manager, and how the tricky problem of zero-downtime rotation is solved with alternating users.

---

## 📝 Practice Questions

**Question 1.** "The marketing team must gradually activate a feature from 10% → 100% without a code deployment, and it must roll back automatically if checkout 5xx increases." What is the most appropriate service?

A) Store the flag in Parameter Store
B) AppConfig + a gradual Deployment Strategy + registering a 5xx alarm Monitor on the Environment
C) An S3 object + Lambda polling
D) Redeploy the pipeline every time

**Answer: B**

Explanation: AppConfig is the orthodox answer. It uses a Deployment Strategy for gradual exposure (10% → 100%) and an Environment Monitor with a 5xx alarm to roll back automatically if the alarm fires during deployment or bake. Parameter Store (A) is a simple key-value store with no gradual application, automatic rollback, or validation. S3 + Lambda (C) is an inefficient reimplementation of what AppConfig provides, and redeployment (D) directly violates the requirement of "without a code deployment."

---

**Question 2.** In AppConfig, to which component does the Monitor for CloudWatch alarm-based automatic rollback attach?

A) Application
B) Environment
C) ConfigurationProfile
D) DeploymentStrategy

**Answer: B**

Explanation: The Monitor (alarm) attaches to the Environment. Even if you deploy the same ConfigurationProfile to dev and prod, you can set a strict alarm only on the prod environment to trigger automatic rollback. Validation (Validator) attaches to the ConfigurationProfile and blocks bad formats identically in any environment. The key is the separation of axes of variability: alarms differ per environment, while validation of configuration format is common.

---

**Question 3.** What is the most efficient way to use AppConfig configuration in Lambda?

A) Call the GetLatestConfiguration SDK on every function invocation
B) The AppConfig Lambda Extension layer → http://localhost:2772 cache, tuning the polling interval with an environment variable
C) Copy the configuration into DynamoDB
D) Hardcode the configuration in the Lambda code

**Answer: B**

Explanation: The Extension polls periodically and caches in the background, and the function fetches the cached value from localhost:2772. Even if the function is invoked thousands of times per second, the AppConfig API is called only once per polling interval, reducing cost, throttling, and latency alike. An SDK call on every invocation (A) causes an API call surge, copying to DynamoDB (C) adds a synchronization burden, and hardcoding (D) loses the very purpose of dynamic configuration.

---

**Question 4.** What does `final-bake-time-in-minutes 10` in a Deployment Strategy mean?

A) Apply gradually only for the first 10 minutes
B) Watch alarms for an additional 10 minutes after reaching 100%, and roll back automatically if one fires
C) Forcibly end the deployment after 10 minutes
D) Perform polling every 10 minutes

**Answer: B**

Explanation: Bake time is the soak and monitoring interval after reaching 100%. Even after all clients have received the new configuration, it watches alarms for 10 minutes and rolls back automatically if a problem signal is caught. It applies the reliability-engineering notion of bake time (a change's risk reveals itself as time passes) to configuration deployment. It is the same idea as Patch Manager's approve-after-days.

---

**Question 5.** What are the two kinds of AppConfig Validators?

A) IAM Policy + Resource Policy
B) JSON Schema (format and range validation) + Lambda (arbitrary business logic validation)
C) CloudWatch Alarm + EventBridge
D) Config Rule + Trusted Advisor

**Answer: B**

Explanation: The JSON Schema Validator validates format, required fields, and value ranges declaratively, and the Lambda Validator receives the configuration content, validates complex business rules in code, and returns SUCCESS/FAILURE. Both work "before" the deployment starts to block wrong values from going in. Paired with the automatic alarm-based rollback (Monitor) "during and after" deployment, they form a two-stage defense.

---

**Question 6.** What situation must an application be able to tolerate during an AppConfig gradual deployment?

A) All instances always having the same configuration value
B) A temporary inconsistency where some clients receive the new configuration and some the old
C) Configuration not changing at all
D) All configuration disappearing from memory

**Answer: B**

Explanation: AppConfig's gradual deployment divides the set of polling clients, so while a rollout is in progress, multiple instances/Lambdas running the same code receive different configuration values. The application must be able to handle this temporary inconsistency (some new values, some old values) safely. This differs from CodeDeploy, whose mechanism adjusts traffic weights.

---

**Question 7.** To measure "which of version A and B has a statistically significantly higher conversion rate," what is more suitable than AppConfig?

A) AppConfig Feature Flag
B) CloudWatch Evidently (built-in A/B statistical analysis)
C) Parameter Store
D) Secrets Manager

**Answer: B**

Explanation: A/B experiments with statistical significance are Evidently's domain: it has statistics such as conversion rate and confidence intervals built in and performs hypothesis testing. AppConfig is an operations tool that "turns things on safely and rolls back if metrics get worse," not a statistical experimentation tool. Even with the same gradual exposure, one aims at statistical learning and the other at safe operations. (Note, however, that the trend is toward less new-use recommendation for Evidently in 2024+.)

---

## 📌 Today's Summary

There are five key points today. First, AppConfig is configuration as data, separating configuration from code and serving as the foundation of the feature flags that decouple deploy and release, and flags past their lifetime become 2^N combination debt and must be cleaned up. Second, the five elements (Application/Environment/ConfigurationProfile/Version/Strategy) are a design that separates axes of variability, with the alarm Monitor attached to the Environment and the Validator attached to the ConfigurationProfile. Third, the Deployment Strategy's growth-factor, duration, and bake-time are the math of the canary, and since it divides the set of polling clients, you must tolerate temporary configuration inconsistency. Fourth, the two-stage defense of the Validator (format validation beforehand) and the Monitor (automatic alarm-based rollback afterward) makes configuration changes as safe as code deployments. Fifth, the Lambda Extension tunes cost and freshness through the polling interval with its localhost:2772 cache, and AppConfig (operational safety) and Evidently (statistical experiments) have different purposes.
