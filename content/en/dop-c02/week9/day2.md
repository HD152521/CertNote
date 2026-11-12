# Day 2 - State Manager·Inventory·Compliance: The Abstraction of Desired State

Run Command, which we saw yesterday, is powerful, but it has one weakness: it is **one-shot**. If you fire off a command that restarts nginx, everything is restarted at that moment, but when a new instance comes up from the ASG 30 minutes later, that instance is bare, untouched by anyone. Even if you install the CloudWatch Agent across the whole fleet, if someone removes it from a single machine next week, that one machine quietly drifts from the standard. A fleet is a living organism, and running a command once does not keep it in that state.

State Manager solves this problem with an abstraction called the "**desired state**." Instead of "running" a command "once," you declare "this state must always be true," and SSM periodically brings the actual state in line with that declaration. Today we look at how this desired state model shares its roots with Kubernetes, Puppet, and Chef; the data lake pattern in which Inventory collects the fleet's software landscape, streams it to S3, and queries it with SQL through Athena; and the governance pipeline in which all of these results gather in Compliance and flow on to Security Hub. On the DOP exam, "automatically install X on new instances," "analyze the inventory of 1 million machines with SQL," and "unified visibility of fleet compliance" are representative scenarios.

## State Manager — From Imperative to Declarative

The core unit of State Manager is the **Association**. An Association bundles three things: (1) what to do (an SSM Document, for example `AWS-ConfigureAWSPackage`), (2) to whom (the targets, usually tags), and (3) how often (the schedule). Once you declare these three, SSM maintains that state on its own.

```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --association-name Install-CW-Agent \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(7 days)" \
  --apply-only-at-cron-interval \
  --compliance-severity HIGH
```

This Association does three things. First, **periodic execution**: every 7 days it enforces CloudWatch Agent installation on all prod instances. Even if someone removed it, it is reinstalled in the next cycle. Second, **automatic application to new instances**: when a new instance with the `Environment=prod` tag comes up, the association is applied immediately, guaranteeing the standard state right after the first boot. Third, **compliance reporting**: how many instances succeeded and how many failed is recorded automatically in SSM Compliance.

This is the decisive difference from cron. Cron runs separately inside each instance, is not deployed automatically to new instances, and has no way to aggregate success or failure centrally. State Manager declares the state of the whole fleet in one place and shows the results in one place.

> 💡 **Related theory**: Desired state is the core abstraction of declarative configuration management. A Kubernetes controller declaring "the ReplicaSet must always have 3" while the control loop keeps reconciling the actual Pod count to that value, and Puppet/Chef declaring "this package must be installed" in a manifest while the agent applies it periodically, are exactly the same model. Imperative means "run this command," and declarative means "become this state." The advantage of declarative is **idempotency**: you get the same result no matter how many times you apply it, and when drift occurs it is automatically reverted. State Manager brings this declarative paradigm to SSM.

> An Association behaves subtly differently depending on the `apply-only-at-cron-interval` option. Without this flag, the association runs once immediately right after it is created or modified, and then follows the schedule. When a new instance comes up, it is applied immediately regardless of the schedule. With the flag on, it runs "only at cron times," preventing a rush right after instance creation. In a large environment, if hundreds of machines boot at once and run the association simultaneously, the load concentrates on package mirrors and downstream dependencies; this flag spreads it out to cron times. It is not asked about directly on the exam, but it helps to understand the tradeoff of "automatic application to new instances vs. preventing an immediate-execution rush."

> 🎯 **Scenario**: "An ASG launches and terminates instances frequently according to traffic. Every instance must have the CloudWatch Agent and a security agent installed, and they must be recovered automatically if anyone removes them. What is an option other than baking them into the AMI?" The answer is to declare the two packages with a State Manager Association based on tags and run it periodically. AMI baking is possible, but every agent version update means re-baking the AMI and replacing the ASG Launch Template. With State Manager, changing just the package version in the association updates the whole fleet in the next cycle, new instances are included automatically, and anything someone removes is reconciled. AMI baking (boot speed) and State Manager (runtime enforcement) are complementary.

The standard Documents that State Manager commonly uses come down to a few.

| Document | Purpose |
|----------|------|
| `AWS-ConfigureAWSPackage` | Install/uninstall packages (CloudWatch Agent, Inspector, Distributor packages) |
| `AWS-RunPatchBaseline` | Apply patches (shared with Day 1's Patch Manager) |
| `AWS-GatherSoftwareInventory` | Enable Inventory collection |
| `AWS-UpdateSSMAgent` | Automatic updates of the agent itself |

## Inventory — Collecting the Fleet's Software Landscape

Inventory draws the fleet's "topographic map." It automatically collects which OS is installed on each instance, which applications and versions are installed, which services are running, and how the network interfaces are configured. The collection itself is turned on with a State Manager Association; Inventory, too, is ultimately a desired state of "collect this instance's information every 30 minutes."

```bash
aws ssm create-association \
  --name AWS-GatherSoftwareInventory \
  --targets Key=InstanceIds,Values=* \
  --schedule-expression "rate(30 minutes)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "services":["Enabled"],
    "networkConfig":["Enabled"]
  }'
```

The collected items are structured in a fixed schema (`AWS:Application`, `AWS:Service`, `AWS:InstanceInformation`, `AWS:Network`, and the Windows-only `AWS:WindowsUpdate`, among others). In addition, with **Custom Inventory** you can push company-specific items, such as whether antivirus is enabled or the version of an in-house agent, directly from the instance.

```json
{
  "SchemaVersion": "1.0",
  "TypeName": "Custom:Compliance",
  "Content": {"AgentVersion": "1.2.3", "AntivirusEnabled": "true"}
}
```

You upload it with `aws ssm put-inventory --instance-id i-... --items file://custom.json`. This puts "the standard collected items + our own compliance items" into a single inventory.

> The true value of Inventory shows in the speed of vulnerability response. During the 2021 Log4Shell (Log4j remote code execution) crisis, organizations that could answer "which instances in our fleet have a vulnerable Log4j version installed?" within minutes and organizations that spent days investigating manually differed in their response speed. If Inventory had already collected application and library information and loaded it into S3, a single line of Athena SQL, which we will see in the next section, would immediately pick out the affected instances. Inventory is boring data in peacetime but a lifeline during an incident.

## Resource Data Sync — Inventory as a Data Lake

The collected Inventory accumulates inside SSM in each region. However, the SSM console's inventory view supports only simple lookups and is weak at complex queries or multi-region unified analysis. That is where **Resource Data Sync** comes in. If you continuously sync the whole fleet's inventory to an S3 bucket, you can query the JSON accumulated in S3 with SQL through Athena.

```bash
aws ssm create-resource-data-sync \
  --sync-name InventoryToS3 \
  --s3-destination '{
    "BucketName":"my-inventory-bucket",
    "Region":"ap-northeast-2",
    "SyncFormat":"JsonSerDe",
    "Prefix":"inventory"
  }'
```

Now, once you map the data loaded into S3 to Athena tables, SQL opens up.

```sql
SELECT instanceid, applicationtype, name, version
FROM   ssm_inventory.aws_application
WHERE  name = 'log4j-core'
  AND  version < '2.17.0';
```

This single line is the answer to the incident query "find every instance that has a vulnerable Log4j installed." Whether the fleet is 100,000 or 1 million machines, Athena scans the data in S3 and gives you the answer. In a multi-account, multi-region environment, you can gather Resource Data Sync **from all Organizations accounts into one central S3 bucket**, so the inventory of the whole organization is queried from one data lake.

> This pattern is exactly the data engineering **ELT (Extract-Load-Transform) + data lake**. Structured/semi-structured data is first loaded raw into S3 (object storage) (Load), and the schema is applied at query time (schema-on-read) so that Athena transforms and analyzes it (Transform). This contrasts with a traditional data warehouse (schema-on-write, with the schema fixed before loading). SSM Inventory -> Resource Data Sync -> S3 -> Athena is a classic case of handling operational data with the data lake pattern. The same structure is used as is when you gather CloudTrail logs, VPC Flow Logs, and ALB access logs in S3 and query them with Athena.

> For Athena to read JSON in S3 efficiently, a table schema is needed. You either run a Glue Crawler to infer the schema automatically or define it directly with `CREATE EXTERNAL TABLE`. And as inventory data accumulates and S3 objects multiply, converting to a columnar format such as Parquet and partitioning by date and account greatly reduces the amount Athena scans (= the cost). Resource Data Sync itself drops JSON, but adding a step that converts to Parquet with an ETL job is the standard at large scale. Athena bills by bytes scanned, so remembering that "query cost = amount scanned" shows the value of partitioning.

## Distributor — Deploying Your Own Packages to the Fleet

Packages that AWS provides, such as the CloudWatch Agent, can be installed directly with `AWS-ConfigureAWSPackage`, but how do you deploy a company's own security agent or monitoring tool? **Distributor** fills this gap. You define and register your own software as an SSM package, and automatically install and update it across the fleet with a State Manager Association.

```bash
# 1) Define the package (manifest + the install binary in S3)
aws ssm create-document \
  --content file://manifest.json \
  --attachments Key=SourceUrl,Values=s3://my-pkg/ \
  --name my-security-agent \
  --document-type Package

# 2) Deploy with a pinned version via State Manager
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["my-security-agent"],"version":["1.2.0"]}' \
  --schedule-expression "rate(1 day)"
```

The key point is that a Distributor package, too, is ultimately deployed as a State Manager desired state. If you pin the version to `1.2.0`, "the whole fleet always keeps this version." If you change the version to `1.3.0`, the entire fleet is rolling-upgraded in the next cycle. A single package version becomes the single source of truth for the agent version across the whole fleet.

## Compliance and Security Hub — Completing the Governance Pipeline

All the activity so far, including the success/failure of State Manager Associations and the patch results from Patch Manager, is automatically gathered into **SSM Compliance**. There are two compliance types.

- `AWS:State` — Association execution results (is the desired state being maintained?)
- `AWS:Patch` — patch application results (are all the required patches installed?)

```bash
aws ssm list-compliance-summaries
aws ssm list-resource-compliance-summaries --resource-type ManagedInstance
```

And these compliance results are **natively integrated with Security Hub**. When you turn on the SSM Patch integration in Security Hub, noncompliant instances appear as Findings and are gathered on one dashboard together with Findings from other services (GuardDuty, Inspector, Config). If you trigger an EventBridge rule with a Security Hub Custom Action, a closed loop is completed that runs from noncompliance detection through to an automatic Lambda response.

```
State Manager / Patch Manager results
        ▼
   SSM Compliance (AWS:State / AWS:Patch)
        ▼  (native integration)
   Security Hub Findings  <- integrated with GuardDuty/Inspector/Config Findings
        ▼  (Custom Action)
   EventBridge -> Lambda -> automatic isolation/patching/notification
```

> This pipeline is the **detect -> assess -> respond** loop of security operations and a form of SOAR (Security Orchestration, Automation and Response). What matters is that each stage is separated. SSM assesses the state, Security Hub aggregates Findings from multiple sources, and EventBridge + Lambda automate the response. Because no single tool does everything and responsibilities are separated (separation of concerns), adding a new detection source or changing the response logic does not affect the other stages. NIST's Cybersecurity Framework (Identify-Protect-Detect-Respond-Recover) is the theoretical foundation of this structure.

> ⚠️ **Trap**: SSM Inventory does not include **account-level resources** such as lists of IAM users and roles. Inventory is strictly information about "software, services, and networking inside managed instances." If you need compliance for account resources such as IAM, you must use AWS Config (resource-level evaluation) or IAM Access Analyzer. On the exam, in a question asking you to pick "what is not collected by Inventory," the IAM user list appears as the correct answer. There is a boundary: Inventory covers the inside of instances, and Config covers AWS resources.

## Change Calendar — Codifying Change Freezes

Finally, the tool that handles the time axis of governance is **Change Calendar**. It defines change freeze policies such as "freeze all prod changes during Black Friday week" or "no deployments on quarter-end closing days" as code.

```bash
aws ssm create-document \
  --name FreezeWindow \
  --document-type ChangeCalendar \
  --content file://calendar.json
# calendar.json: defines Open/Closed time windows in iCalendar format
```

Change Calendar defines OPEN/CLOSED states by time window, and an Automation Runbook or pipeline queries this state before running and enforces "do not proceed if it is currently a freeze period." Instead of a person judging "can we deploy today?" from memory, the calendar places a gate mechanically. Combined with the Week 12 Automation Runbooks, this grows into sophisticated policies such as "during a freeze period, allow only automatic recovery and block regular deployments."

> 🎯 **Scenario**: "An e-commerce company once had an accidental prod deployment during Black Friday week that caused an outage. It wants to block the automatic deployment pipeline for that week without depending on human error." The answer is to define that week as CLOSED in Change Calendar and place a gate (an Automation Runbook or Lambda) that checks the calendar state in front of the pipeline's deployment stage. If it is CLOSED, the pipeline stops proceeding. Emergency hotfixes are routed around it through a separate approval path. The freeze policy is enforced by code, not by human memory.

## Summary

We saw five pictures today. First, **a State Manager Association is the desired state abstraction**, a declarative, idempotent model like Kubernetes and Puppet, and automatic application to new instances and automatic drift recovery are the decisive differences from cron. Second, **Inventory collects the fleet's software landscape** and holds company-specific items through Custom Inventory; it does not include account resources such as IAM. Third, **Resource Data Sync -> S3 -> Athena** is a classic case of handling operational data with the data lake (schema-on-read) pattern, and during an incident a single line of SQL picks out the affected instances. Fourth, **Distributor deploys your own packages through State Manager**, making the version the fleet's single source of truth. Fifth, **Compliance -> Security Hub -> EventBridge -> Lambda** is a governance closed loop that separates detect-assess-respond responsibilities, and Change Calendar codifies freezes on the time axis.

In the next post we move on to AppConfig. If everything so far was about "enforcing the state of infrastructure," AppConfig is the world of feature flags and dynamic configuration that "change application behavior without a code deployment."

---

## 📝 Practice Questions

(All practice problems in Korean as required by rules)

**Question 1.** An ASG launches and terminates instances constantly. A security agent must always be installed on every instance and must be automatically restored if anyone removes it. What is an approach other than AMI baking?

A) Run an install script with cron on each instance
B) Declare a tag-based package installation with a State Manager association + periodic execution — automatically applied to new instances + automatic drift remediation
C) Run Run Command once
D) Connect over SSH hourly with Lambda to install

**Answer: B**

Explanation: State Manager declares a desired state and reconciles it periodically. New instances are included automatically as long as the tags match, and if anyone removes it, it is reinstalled in the next cycle. Cron (A) is not automatically deployed to new instances and has no central compliance. Run Command (C) is one-time, so it does not apply to new instances. Lambda+SSH (D) is an inefficient reinvention of what SSM already provides.

---

**Question 2.** An urgent vulnerability like Log4Shell has been disclosed. To instantly answer "where in the fleet are the instances with the vulnerable library version installed" at a scale of hundreds of thousands of instances, what should be prepared in advance?

A) SSH into every instance and grep
B) Collect SSM Inventory + Resource Data Sync → S3 → Athena, and query with SQL during an incident
C) CloudWatch Logs Insights
D) Trusted Advisor

**Answer: B**

Explanation: If Inventory collects application and library versions in advance and loads them into an S3 data lake, then during an incident a single line of Athena SQL such as `WHERE name='log4j-core' AND version<'2.17.0'` immediately narrows down the affected instances. Data collection in peacetime determines incident response speed. SSH grep (A) is impossible at scale, Logs Insights (C) is for log analysis and not inventory queries, and Trusted Advisor (D) is a best practice check, not a fleet inventory.

---

**Question 3.** Which of the following is not a decisive difference between a State Manager association and cron?

A) New instances are applied automatically when tags match
B) Success/failure is reported automatically to central compliance
C) Drift is automatically remediated in the next cycle
D) Instance types are changed automatically

**Answer: D**

Explanation: State Manager is a tool that enforces software state (package installation, configuration) and does not change infrastructure attributes such as the instance type. A (automatic application to new instances), B (central compliance), and C (automatic drift remediation) are all key advantages of State Manager over cron. Changing instance types is in the domain of EC2/CloudFormation/ASG.

---

**Question 4.** What does SSM Inventory not collect?

A) Installed applications and versions
B) Running services
C) Network interface information
D) The list of IAM users and roles in the account

**Answer: D**

Explanation: Inventory collects software, service, and network information "inside" the managed instances. Account-level AWS resources such as IAM users and roles are not in the scope of Inventory — AWS Config or IAM Access Analyzer handles those. The boundary that Inventory is inside the instance and Config is AWS resources is an exam point.

---

**Question 5.** What data pattern does the Resource Data Sync → S3 → Athena pipeline follow?

A) A schema-on-write data warehouse
B) A schema-on-read data lake (ELT) — load raw JSON into S3 and apply the schema at query time
C) An in-memory cache
D) A graph database

**Answer: B**

Explanation: The inventory JSON is first loaded raw into S3 (Load), and the schema is applied at Athena query time (schema-on-read) for analysis. It is a typical data lake + ELT pattern. The same structure is used for CloudTrail, VPC Flow Logs, and ALB log analysis. At large scale, Parquet conversion + partitioning reduce Athena scan cost.

---

**Question 6.** How do you deploy a self-developed security agent to the entire fleet and manage its version uniformly?

A) Install manually on each instance
B) Define the package with Distributor, then deploy with the version pinned through a State Manager association — the version becomes the fleet single source of truth
C) Upload it to S3 and let instances fetch it on their own
D) Bake it into the AMI only

**Answer: B**

Explanation: Distributor defines your own software as an SSM package, and State Manager pins the version and deploys it as the desired state. When you change the version, the entire fleet is rolling-upgraded in the next cycle and new instances are included automatically. AMI baking alone (D) makes runtime enforcement and version updates difficult.

---

**Question 7.** How do you view SSM patch compliance on the same dashboard as other security findings and even connect it to automated response?

A) Poll with Lambda each time
B) Enable the SSM Patch integration in Security Hub → aggregate findings → EventBridge through a custom action → automated response with Lambda
C) Save results to S3 and review manually
D) A CloudWatch dashboard widget

**Answer: B**

Explanation: SSM compliance is natively integrated with Security Hub and gathers on the same dashboard as GuardDuty, Inspector, and Config findings. If a Security Hub custom action triggers EventBridge and Lambda responds automatically, the detect-assess-respond closed loop is complete. Each stage (assess/aggregate/respond) has separated responsibilities, so it is easy to scale. Manual polling (A) or manual review (C) loses the benefit of automation.

---

## 📌 Today's Summary

The five key takeaways from today are as follows. First, the State Manager association is a desired state abstraction (declarative and idempotent) with the same roots as Kubernetes and Puppet, and automatic application to new instances and automatic drift remediation are the decisive differences over cron. Second, Inventory collects software, services, and network information inside the instances and can capture company-specific items with custom inventory, but it does not include account resources such as IAM (that is Config's domain). Third, Resource Data Sync → S3 → Athena is a schema-on-read data lake pattern that narrows down the affected instances with a single line of SQL during an incident. Fourth, Distributor deploys your own packages through State Manager so that the version becomes the fleet single source of truth. Fifth, Compliance → Security Hub → EventBridge → Lambda is a governance closed loop that separates the responsibilities of detect-assess-respond, and Change Calendar codifies freezes on the time axis.
