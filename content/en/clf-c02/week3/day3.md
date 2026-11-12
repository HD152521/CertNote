# Day 3 - Management & Monitoring Tools: Watching and Tracing Your Systems

Once you build a system and start running it, new questions appear. "The server is slow right now — is the CPU high?" "Who changed this security setting yesterday?" "Are our resources following company rules?" "Can't we install a patch on 100 servers in one go?" The tools that answer these four questions are today's topic — CloudWatch, CloudTrail, Config, and Systems Manager.

At first the names all look alike, but **what each one looks at** is different. CloudWatch looks at performance, CloudTrail looks at who did what, Config looks at configuration state, and Systems Manager handles operational tasks. Nailing down this one-line difference is today's goal.

### The Days Before Anyone Was Watching

Let's start with why these services exist. Here is a day at a company with no monitoring tools.

At 10 a.m., the customer center gets a call. "The site won't open." Only then does a developer log in to the server. The disk is full, but nobody knows since when. At 2 p.m., the security officer asks, "This DB access setting wasn't like this last week — who changed it?" Nobody knows. At 4 p.m., the audit team makes a request: "Just give us a list of which servers aren't encrypted." Someone opens a spreadsheet and starts counting by hand. With 200 servers, it takes three days.

The three situations have one thing in common — **there were no "eyes."** The system kept running, but there was no way to know from the outside what was happening inside it. So outages were always reported first by customers, and causes were always filled in afterward with guesses. Each of the four services you learn today attaches one of those eyes.

This property — "being able to tell the state inside a system from the outside" — is called **observability**. Think of the dashboard in a car. A car without a dashboard still runs. You just find out when the fuel will run out, or whether the engine has overheated, only after you've stopped.

## Amazon CloudWatch: The Eye That Watches Performance and Health

**Amazon CloudWatch** is a monitoring service that gathers and displays the **metrics, logs, and alarms** of AWS resources and applications. You can graph numbers over time — EC2 CPU utilization, RDS connection counts, Lambda execution time — and when a threshold is crossed, it sends a notification or takes an automatic action.

- **Metrics**: Collects numeric data such as CPU, network, and disk as time series.
- **Logs**: Gathers application and system logs in one place for searching.
- **Alarms**: Threshold-based alerts like "notify me if CPU goes above 80%." They can also trigger Auto Scaling.
- **Dashboards**: Multiple metrics on a single screen.

### The Three Elements as a Hospital

At first, metrics, logs, and alarms look similar. **Metrics are numbers, logs are sentences, and an alarm is the bell that rings when those numbers cross a line.** Picture a hospital intensive care unit and it becomes clear.

| CloudWatch element | Hospital analogy | What it does |
|--------------------|------------------|--------------|
| Metrics | The numbers and graphs on a heart-rate and blood-pressure monitor | Keeps measuring state as numbers |
| Logs | The narrative entries written in a nursing record | Leaves "what happened at what time" as sentences |
| Alarms | The alarm that sounds when a value crosses the danger line | Alerts you even when no one is watching |
| Dashboards | The ward status board that shows many patients at once | Brings scattered information onto one screen |

### What Happens After an Alarm Fires

A CloudWatch alarm doesn't just turn a light red on the screen and stop there — it **leads to a next action.** This is the part that falls within the exam scope.

```
[Metric collected]  EC2 CPU utilization = 85%
      │
      ▼
[Alarm evaluation]  Condition "5-minute average CPU > 80%" met → alarm state (ALARM)
      │
      ├──► Amazon SNS ──► Notification by email / text message / other services
      │
      └──► Auto Scaling ──► Automatically launches more EC2 instances
```

The meaning of this flow is significant. It used to be three steps — "a person looks, a person decides, a person adds servers" — but now, even if traffic surges at 3 a.m., **nobody has to wake up, and the system scales itself out.** It is the CloudWatch alarm that decides when the Auto Scaling you learned about last week actually moves. Note that an alarm moves between OK, ALARM, and INSUFFICIENT_DATA (not enough data to decide).

One online shopping mall does fine with two EC2 instances most of the time, but visitors flood in during the Friday evening sale. This company set up an alarm that says, "If average CPU exceeds 70%, add servers; if it drops below 30%, remove them," and another that says, "If several payment error logs pile up in a short time, text the person in charge." As a result, traffic handling happens automatically, and only real warning signs reach a person. This is the point where the era of operators staring at graphs all night ends.

> ⚠️ **Trap**: What CloudWatch collects from EC2 by default are values like CPU utilization and network in/out — **values visible from outside the server (from the hypervisor).** By contrast, **information from inside the OS, such as memory usage or free disk space, is not in the default metrics** — you have to install the CloudWatch agent inside the instance for it to show up. Under the shared responsibility model, the inside of the OS is the customer's domain, so AWS does not peek into it on its own.

> 💡 **Related theory**: CloudWatch is a core tool for the **Operational Excellence** pillar of Well-Architected. It forms the foundation of "observability" — the ability to tell a system's internal state from the outside. When you see "performance metrics," "threshold alarms," or "log collection," it's CloudWatch.

## AWS CloudTrail: Who Did What, and When

**AWS CloudTrail** is a service that records the **API calls and activity (audit logs)** that happen inside your account. If someone terminated an EC2 instance, changed an S3 bucket policy, or created an IAM user — who did it, when, from where (IP), and what exactly they did are all recorded.

If CloudWatch looks at "how the system is behaving (performance)," CloudTrail looks at "what people and services have done (actions)." It is at the heart of security audits, incident investigations, and compliance evidence.

| Item | CloudWatch | CloudTrail |
|------|------------|------------|
| Looks at | Performance metrics, logs, alarms | API call / activity records |
| Question | "Is it running well right now?" | "Who did what?" |
| Use | Monitoring, alerts, auto scaling | Auditing, security investigation, compliance |

### Think of It as a Building's Entry Log

The easiest picture for understanding CloudTrail is the **entry log at the front desk of an office building.** To enter the building you tap your card, and "what time, who, which door" is recorded automatically. Nobody writes it in a notebook, yet the records pile up, and when an incident happens, that log is where you look first.

Almost everything that happens in an AWS account — launching EC2, creating an S3 bucket, adding an IAM user, opening a security group — is carried out internally as an **API call.** Even when you click a button with the mouse in the console, an API is called behind the scenes. CloudTrail records those API calls automatically. In other words, it is "a card reader installed across the entire account." The record shows **who (user or role), when, what (which action), from where (request IP), and on which target** it was done. Recent activity can be looked up right in the console, and if you need long-term retention, you configure the records to accumulate in an S3 bucket (for audit purposes this is practically a must).

At one startup, a production database vanished on a Friday night. On Monday morning, instead of suspecting each other, the team opened the CloudTrail records. The delete action had been called with a particular IAM user's access key, and the request IP was an overseas address unrelated to the company. That developer had accidentally committed the key to a public repository a few months earlier. Finding the cause took 30 minutes. Without the records, it would have ended with "someone must have made a mistake," and the leaked key would have stayed alive.

> ⚠️ **Trap**: CloudTrail **cannot answer "why is performance slow,"** and CloudWatch **cannot answer "who deleted this."** Don't reflexively pick CloudTrail just because you see the phrase "investigating the cause of an outage." If the subject of the investigation is *a person's action*, it's CloudTrail; if it's *the system's state or performance*, it's CloudWatch. Remember that if the sentence contains "who," it leans toward CloudTrail.

When you see "trace who performed this action," "audit," "security incident investigation," or "compliance evidence," it's CloudTrail. To avoid confusing it with CloudWatch (performance), separate them as "performance vs. a record of actions."

## AWS Config: Do the Settings Follow the Rules?

**AWS Config** is a service that **records the configuration state of resources and evaluates whether they comply with defined rules.** For example, you create rules like "every S3 bucket must be encrypted" or "a security group must not open SSH to 0.0.0.0/0," and it automatically finds the resources that violate them.

It also keeps a **history** of how resource configurations changed over time. You can look back and ask, "What state was this security group in a week ago?"

### Think of It as an Apartment Fire Inspection

To understand Config, picture the **regular fire inspection of an apartment building.** The inspector goes from unit to unit with a checklist. "Is there a fire extinguisher?" "Does the detector work?" "Is the emergency exit unblocked?" Then they compile a list of the units in violation and check at the next inspection whether they were fixed.

This is exactly what AWS Config does. **Once you define the inspection items (rules), it automatically re-inspects every time resources are added or changed.** A person doesn't have to count 200 servers every time.

| Company rule | What Config does |
|--------------|------------------|
| "Every S3 bucket must be encrypted" | Pulls out a list of unencrypted buckets |
| "No SSH port open to everyone" | Flags security groups with port 22 open to 0.0.0.0/0 |
| "Every resource gets an owner-team tag" | Marks untagged resources as non-compliant |

One more thing comes with it — a **time axis.** Because Config shows a timeline of when and how configurations changed, it can also answer "What state was this security group in last Tuesday?"

```
CloudTrail : "Who made the change?"                                  (actions / who)
AWS Config : "Does the current setting match the rules, and how has it changed?"  (state / compliance)
```

The two are not rivals but a **pair.** When investigating a security incident, you use Config to narrow down "since when the setting was wrong," and CloudTrail to find "who changed it at that time." This is also why Config is loved in regulated industries. When you have to prove in an audit that "the data stores were always encrypted over the past year," you can submit the configuration history as is instead of collecting screenshots.

**Trap**: Config is a tool that **finds and reports** rule violations, not one that "blocks violations from happening in the first place." Prohibiting things in advance is the role of IAM policies or organization-level service control policies (SCPs). On the exam, it splits like this: "detect, evaluate, report" means Config, while "block the permission from being used in the first place" points toward IAM/SCP.

When you see "checking configuration compliance," "resource configuration history," or "rule violation detection," it's Config. It forms security and governance together with CloudTrail ("who did it"), but the difference is that Config focuses on **whether the resulting state matches the rules.**

## AWS Systems Manager: Operational Tasks in One Place

**AWS Systems Manager (SSM)** is a collection of tools for **operating and managing EC2 instances and on-premises servers at scale.** Instead of SSH-ing into servers one by one, you can issue commands and manage settings centrally.

A few key features:

- **Patch Manager**: Applies OS patches to many servers in bulk.
- **Session Manager**: Securely opens a shell on a server without SSH keys or open ports (with audit logs included).
- **Parameter Store**: Safely stores and shares configuration values, passwords, DB connection strings, and the like.
- **Run Command**: Runs a command on many servers at once.

### What Happens When You Handle 200 Servers by Hand

With 3 servers, you can SSH into each and type commands. It takes 10 minutes. But with 200 servers the story changes. You'd have to connect 200 times, and there is no way to check how many you missed. To connect, you have to keep port 22 open, and someone has to manage the SSH keys. If a key leaks, it becomes an intrusion path as is, and when an employee leaves, you have to remove that person's key from 200 servers. On top of that, who typed which command on which server isn't recorded anywhere.

Systems Manager **flips this situation from a "go into the servers" approach to a "push down from the center" approach.** Instead of connecting to servers directly, administrators pick a target group in the console and give the instruction.

| Feature | The old way | The Systems Manager way |
|---------|-------------|-------------------------|
| Session Manager | SSH key + port 22 open | Shell access from the console with no key or port, and a record is kept |
| Patch Manager | Manual patching on each server | Choose targets and a schedule and it applies in bulk |
| Run Command | Repeat the same command on each server | One instruction runs on hundreds of servers at the same time |
| Parameter Store | Hardcode configuration values in code | Store them safely in one place and let the app fetch them |

In particular, **Session Manager** lets you close port 22 — which had to be open for access — altogether. The key point is that it's an approach that **eliminates the attack surface itself,** rather than "adding one more security device." **Parameter Store** is a place to keep configuration values such as DB addresses or API keys outside the code; it removes the risk of writing passwords into code and means you don't need to redeploy when you change a value.

When you see "patch many servers in bulk," "connect securely without SSH keys," "store configuration values/secrets centrally," or "operations automation," it's Systems Manager. Session Manager in particular is mentioned often under Security (the Security pillar) because it connects without opening port 22.

## Two More to Know: Trusted Advisor and Health Dashboard

Two more tools make a light appearance on the exam. Just pin down one line each.

**AWS Trusted Advisor** is an **automated check tool that scans your account and advises "you'd be better off doing it this way."** It finds things like idle resources that waste money, dangerously open security settings, and configurations with weak availability, and tells you about them. It is closer to the results sheet from a health checkup (the range of check items you can see depends on your support plan tier).

**AWS Health Dashboard** is **the window that tells you about the AWS side.** It shows the overall situation, such as whether a service in a given Region is having an outage, and scheduled events that affect your resources (for example, an instance restart scheduled because of hardware maintenance).

**Trap**: In a "our service is down" situation, don't confuse Health Dashboard with CloudWatch. To **check whether the outage is on AWS's side**, use Health Dashboard; to see **the state of your own application and resources**, use CloudWatch. And Trusted Advisor is not a real-time monitoring tool but a tool for **improvement recommendations.**

## Telling the Four Tools Apart on One Page

| Signal (keyword) | Service |
|------------------|---------|
| Performance metrics, alarms, logs, dashboards | CloudWatch |
| Who did what, audit, security investigation | CloudTrail |
| Configuration compliance, configuration history, rule violations | AWS Config |
| Bulk server operations, patching, secure access, secret storage | Systems Manager |

The CLF exam often mixes these four to confuse you. The fastest way to tell them apart is **"what it looks at / does."** If it looks at performance, CloudWatch; at actions, CloudTrail; at configuration compliance, Config; and if it performs operational tasks, Systems Manager.

### One-Line Way to Remember

```
Performance?  → CloudWatch   (dashboard gauges)
Who did it?   → CloudTrail   (entry log)
Rules met?    → Config       (inspection checklist)
```

Take one event, "the website was slow for 30 minutes last evening." CloudWatch explains it as "CPU spiked to 95%," CloudTrail as "right before that, someone lowered the Auto Scaling maximum count," and Config as "that setting violated the company standard." **The symptom is CloudWatch, the culprit is CloudTrail, the rule is Config.** When you're stuck choosing, ask yourself, "Is the question about the symptom, the culprit, or the rule?"

## Glossary Table

| Confusing pair | The deciding difference |
|----------------|-------------------------|
| CloudWatch vs CloudTrail | Performance and state vs a record of the actions of people and services |
| CloudWatch vs Config | Is it running well now vs do the settings match the rules |
| CloudTrail vs Config | Who changed it vs what changed and how, and does it match the rules |
| CloudWatch Metrics vs Logs | Numbers (time series) vs sentences (text records) |
| CloudWatch Alarm vs SNS | Evaluating a condition (the alarm sounds) vs delivering the notification (email, text) |
| Config vs IAM/SCP | Find violations and notify vs block the action in the first place |
| Trusted Advisor vs Config | General improvement recommendations vs evaluating compliance with rules you defined |
| Health Dashboard vs CloudWatch | State of the AWS side vs state of your own resources |
| Systems Manager vs CloudFormation | Operating and managing servers that already exist vs creating infrastructure from scratch |

## How This Appears on the Exam

This area mostly comes in the form of **"in this situation, which service?"** When you see the expressions below, the answer on the right is likely.

| Expression in the question | Answer direction |
|----------------------------|------------------|
| Metrics, threshold, alarm, dashboard, utilization | CloudWatch |
| Collecting and searching application logs | CloudWatch Logs |
| Automatically adding instances (tied to an alarm) | CloudWatch + Auto Scaling |
| Audit, who, activity record, API call history | CloudTrail |
| Security incident investigation, regulatory evidence, tracing accountability | CloudTrail |
| Compliance rules, configuration evaluation | AWS Config |
| Resource configuration change history, past-point-in-time configuration | AWS Config |
| Bulk patching, running commands on many servers | Systems Manager (Patch/Run Command) |
| Connect without SSH keys / without opening ports | Systems Manager Session Manager |
| Central storage of configuration values and secret strings | Systems Manager Parameter Store |
| Cost-saving and security-improvement recommendations, account checks | Trusted Advisor |
| Whether an AWS service is down, scheduled maintenance | AWS Health Dashboard |
| Send an email or text when a condition is met | Amazon SNS (the notification channel for alarms) |

The exam does not ask about detailed features in depth. If you get **"what is this service there for"** right in one line, you can answer most questions correctly.

## Summary

Today we looked at four tools for watching and managing systems. CloudWatch (performance monitoring), CloudTrail (action auditing), Config (configuration compliance), and Systems Manager (large-scale operations). They are not used separately but together — catch the warning signs with CloudWatch, trace the causative action with CloudTrail, find rule violations with Config, and apply the fix in bulk with Systems Manager.

Seen from a higher level, what you learned today is **"a way to entrust operations to the structure of the system rather than to people's diligence."** An alarm rings before a customer reports the outage, change records pile up on their own, and rule violations surface automatically. This is what the Operational Excellence that AWS Well-Architected talks about actually looks like.

Check yourself. What does each of the three CloudWatch elements hold? What are two actions that can follow after an alarm fires? If you had to state in one word the question CloudTrail answers, what is it? How does Config differ from CloudTrail? What is the name of the feature that lets you connect to a server without SSH keys? If you can answer each with one line, today's portion is enough.

In the next article, we'll look at how to **create and deploy such infrastructure automatically with code** — CloudFormation, Elastic Beanstalk, and containers and serverless.

---

## 📝 Practice Questions

**Question 1.** You want to track an EC2 instance's CPU utilization as a time series and send a notification when it exceeds 80%. Which service is most appropriate?

A) AWS CloudTrail  
B) Amazon CloudWatch  
C) AWS Config  
D) AWS Systems Manager  

**Answer: B**  
Explanation: CloudWatch is a monitoring service that collects performance metrics and provides threshold-based alarms. CloudTrail is for API activity records (auditing), Config is for configuration compliance, and Systems Manager is for operational tasks, so none are meant for performance alarms.

---

**Question 2.** For a security investigation, you need to determine "who, when, and from which IP changed an S3 bucket policy." Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS Config  
C) AWS CloudTrail  
D) Amazon SNS  

**Answer: C**  
Explanation: CloudTrail is an audit-log service that records API calls and activity within the account, tracing who did what and when. CloudWatch is for performance monitoring, Config evaluates configuration state, and SNS sends notifications, so none are suited to tracing actions.

---

**Question 3.** You want to automatically detect resources that violate the company rule "every S3 bucket must be encrypted" and track configuration history. Which service is most appropriate?

A) AWS Config  
B) Amazon CloudWatch  
C) AWS Systems Manager  
D) Amazon SQS  

**Answer: A**  
Explanation: AWS Config records resource configurations, evaluates compliance against rules (e.g., bucket encryption), and keeps configuration history. CloudWatch is for performance, Systems Manager is for operational tasks, and SQS is a message queue, so none have configuration-compliance evaluation capability.

---

**Question 4.** You want to apply OS patches in bulk to hundreds of EC2 instances without SSH keys or open ports. Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Systems Manager  
D) AWS Config  

**Answer: C**  
Explanation: Systems Manager is an operational tool suite that applies large-scale patches in bulk via Patch Manager and connects securely without keys/ports via Session Manager. CloudWatch, CloudTrail, and Config are for monitoring, auditing, and configuration evaluation respectively, and don't perform bulk operational tasks.

---

**Question 5.** Which is the most accurate description of the difference in roles between CloudWatch and CloudTrail?

A) CloudWatch records API actions, and CloudTrail monitors performance  
B) CloudWatch is performance metrics/logs/alarms, and CloudTrail is the activity record of who did what  
C) Both only evaluate configuration compliance  
D) Both automate server patching  

**Answer: B**  
Explanation: CloudWatch watches performance (metrics, logs, alarms), while CloudTrail records actions (who did what). A swaps the two; configuration compliance is Config's role and server patching is Systems Manager's role.

---
