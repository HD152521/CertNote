# Day 2 - CloudTrail: Why an Audit Log Must Be Tamper-Proof

When a security incident breaks out, the first question you ask is "who did what, when." Did the intruder create an IAM user? Change an S3 bucket to public? Open a security group to 0.0.0.0/0? If you can't reconstruct this precisely, incident response falls into the realm of guesswork. But there's an even scarier scenario: after hijacking permissions, the intruder erases the logs of their own actions. If an audit log can be modified or deleted by the actor themselves, that log loses its evidentiary value in court and in post-incident analysis alike. So the most important design goal of an audit logging system isn't "record" — it's "make it so that no one — not even root — can alter the records after the fact."

AWS's **CloudTrail** (launched 2013) is the service that tackles this problem head-on. It records nearly every API call that happens inside an account — console, CLI, SDK, and even one AWS service calling another. Rather than list CloudTrail's features, this article traces "why management events and data events have different costs," "how log integrity validation cryptographically prevents tampering," and "how CloudTrail differs from Config and VPC Flow Logs" — pinning down the essence of what the SAA security and governance domain is really asking.

## Why Management Events and Data Events Split Into Different Tiers

CloudTrail's events split into Management Events and Data Events, and management events get 90 days of history for free while data events require separate enablement and separate billing. This asymmetry isn't a mere billing policy — it's a **fundamental trade-off created by the difference in volume**.

Management events are "control plane" operations — actions that "change a resource's configuration and permissions," like creating an IAM user, launching an EC2 instance, modifying a security group, or changing a bucket policy. These operations are low-frequency. A well-run account doesn't create IAM users hundreds of times a day. So the volume is manageable even if you record all of them, and AWS provides this for free by default.

Data events are "data plane" operations — actions that "access the data inside a resource," like S3 GetObject/PutObject, Lambda Invoke, or DynamoDB item reads. These are overwhelmingly high-frequency. An active S3 bucket sees thousands of GetObjects per second, and a popular Lambda is invoked billions of times a day. Record all of these and log volume explodes and cost becomes astronomical. So data events are disabled by default, and the standard is to turn them on only for the resources you need (a specific bucket, a specific prefix).

> 💡 **Related theory**: The distinction between control plane and data plane is a core concept in network and distributed-systems design. In a router, the control plane is "how do I build the routing table" (low-frequency, complex) and the data plane is "actually forward the packet" (high-frequency, simple). The AWS API has the same structure — the control plane that changes configuration is rare and audit-critical, while the data plane that handles data is frequent and reasonably audited selectively. CloudTrail's billing structure reflects this plane separation exactly.

> ⚠️ **Pitfall**: The answer to "track who did GetObject on this S3 object" is "enable CloudTrail Data Events." The default management events alone don't reveal object-level access. What's more confusing is that S3 Server Access Logs give similar information, but on the exam CloudTrail Data Events is almost always the answer (because the IAM principal information is clear and it integrates with other services). S3 Access Logs are best-effort delivery, so they can drop entries, and their IAM-principal tracking is weak.

> 🔍 **Going deeper**: Global service events (IAM, STS, CloudFront, Route 53) get special treatment. These services have no region concept or operate against us-east-1, so CloudTrail records their events in us-east-1. When you create a multi-region Trail you include this with `--include-global-service-events`, and if you omit it, core security events like "when was this IAM user created" go missing. So a security Trail is always built as multi-region + include global service events.

## Log Integrity Validation: How to Prove Tampering With Cryptography

CloudTrail's most important yet most often overlooked feature is **Log File Integrity Validation**. Beyond simply "storing logs in S3," it's a mechanism that "cryptographically proves that not a single character of this log has changed since it was generated."

Here's how it works. Every time CloudTrail stores a log file in S3, it computes the file's **SHA-256 hash**. Every hour it gathers these hashes into a **digest file**, and it **RSA-signs that digest file with AWS's private key**. The digest file also includes the hash of the immediately preceding digest file — that is, the digests are linked into a **hash chain**. In this structure, if anyone changes even one character in a past log file, that file's SHA-256 differs and no longer matches the hash recorded in the digest, so it's detected instantly. Trying to alter the digest itself fails because it's signed with AWS's private key and can't be forged, and deleting a digest wholesale breaks the hash chain, revealing "there's a gap here."

> 💡 **Related theory**: This is exactly the same mechanism by which a blockchain secures immutability — when each block includes the hash of the previous block to form a chain, changing any middle block throws off every subsequent hash and the tampering is revealed. CloudTrail's digest hash chain is a simplified form that adds "a trusted authority (the signature) operated by AWS." If a blockchain creates trust through decentralized consensus, CloudTrail creates trust through AWS's RSA signature. The core idea (hash chain + signature) is identical, and this is the standard pattern of a tamper-evident log.

Integrity validation alone only "detects" tampering — it doesn't "prevent" it. So you layer S3-side protection on top. Turn on **S3 Object Lock (WORM, Write-Once-Read-Many)** and objects can't be deleted or modified during the retention period — not even with root permissions. Turn on **MFA Delete** and deleting an object version requires MFA. Store logs in a separate account (a Log Archive account) and severely restrict that account's permissions, and even if the operations account is compromised the logs can't be touched. And **encrypt the logs themselves with KMS** to add confidentiality. This layered defense — detection (integrity validation) + prevention (Object Lock) + isolation (separate account) + confidentiality (KMS) — is the standard design for audit-log protection.

> 📚 **Case study**: In many security incident responses, the pattern "the first thing the attacker did was turn off logging or erase the logs" repeats. So mature organizations attach an EventBridge rule to CloudTrail so that when "audit-neutralizing APIs" like `StopLogging`, `DeleteTrail`, `UpdateTrail`, or `PutEventSelectors` are called, SecOps is alerted instantly. Because the act of turning off logging itself is logged and immediately raises an alarm, an attacker's attempt to erase their traces becomes a detection signal instead.

## Organization Trail: Multi-Account Auditing in One Shot

In a multi-account environment growing to tens or hundreds of accounts, "creating a Trail per account and managing each separately" is an operational nightmare. Forget the Trail setup whenever a new account appears and that account becomes an audit blind spot. **Organization Trail** solves this. Create a Trail once from the AWS Organizations management account (or a delegated administrator account) and events from every member account in the org are automatically included, and accounts added later automatically join too.

The key to this design is that **member accounts can't turn off or delete this Trail**. The Organization Trail is owned by the management account, so member-account permissions can't touch it. This structurally prevents the incident of "each team turning off audit logging for their own account." Logs are usually centralized into an S3 bucket in a dedicated **Log Archive account**, and by attaching Object Lock and a Lifecycle policy (move old logs to Glacier Deep Archive) to that bucket you achieve 7+ years of compliance retention cost-effectively.

> 🔍 **Going deeper**: Organization Trail is a core component of AWS's "Landing Zone" best practice. When AWS Control Tower sets up a new organization, it automatically creates a Log Archive account and an Audit account and connects an Organization Trail to them. This pattern of "isolating logs in a security OU (Organizational Unit)" is the cloud implementation of separation of duties — it separates, by a permission boundary, the people who operate workloads from the people who access the logs that audit those actions.

## CloudTrail Lake: Querying Audit Logs With SQL

Traditionally, analyzing CloudTrail logs required multiple setup steps — querying the JSON files piled up in S3 with Athena, or viewing them with CloudWatch Logs Insights. **CloudTrail Lake** (launched 2022) loads events into a dedicated data store so you can query them directly with SQL. It retains up to 7 years (or more) and integrates not just CloudTrail events but AWS Config configuration items and third-party sources for analysis in one place.

This comes from the recognition that "gathering logs" and "making logs analyzable" are separate problems. Piling JSON in S3 is storage, not analysis — to analyze it you have to define a schema and attach a query engine. CloudTrail Lake builds in this analysis layer so you can instantly run forensic queries like "aggregate by region every Decrypt API this IAM Role called over the past 3 years." On the exam, when you see the keywords "long-term retention + SQL query," CloudTrail Lake is the answer signal.

> 💡 **Related theory**: CloudTrail Lake is one instance of the "schema-on-read" analysis paradigm. A traditional database defines the schema before inserting data (schema-on-write), but a data lake stores raw data first and applies the schema at query time. This is the key to gathering diverse sources (CloudTrail, Config, third-party) in one place without normalizing them in advance, then querying later from whatever angle you need. Athena, BigQuery, and Snowflake are all of this lineage, and CloudTrail Lake is a managed version specialized for audit logs.

## CloudTrail vs Config vs VPC Flow Logs: The Division of Labor Among Three Logs

The most frequent trap on the SAA exam is distinguishing these three. All three are "logs," but they answer completely different questions.

**CloudTrail** records "**who did what** (the API-call action)." It's the record of an action like "user-A added an inbound rule for 0.0.0.0/0 to security group sg-123 at 14:32." The actor (who), the time (when), the operation (what), and even the source IP are left behind.

**Config** records "**what state is the resource in now and does it comply with the rules** (a configuration snapshot and evaluation)." It's the state and evaluation "sg-123 currently has 0.0.0.0/0 inbound, and this violates the 'no internet-open SG' rule." Who changed it isn't answered by Config but by CloudTrail.

**VPC Flow Logs** record "**what traffic flowed** (packet metadata)." It's the network flow "1.2MB was ACCEPTed from 10.0.1.5 to port 443 on 10.0.2.8." Not an API action, not a configuration state — the actual packet's source, destination, port, bytes, and allow/deny.

> ⚠️ **Pitfall**: "Who opened the security group to 0.0.0.0/0" → CloudTrail (the actor). "Which SGs currently have 0.0.0.0/0" → Config (state/rule). "Which IPs actually tried to connect through that open port" → VPC Flow Logs (traffic). One incident analysis uses all three — cross-check "who opened it" with CloudTrail, "which resources were exposed" with Config, and "who came in through the gap" with Flow Logs. The exam splits the answer by the question's verb ("did" vs "is" vs "flowed").

> 📚 **Case study**: The 2019 Capital One incident analysis illustrates the complementarity of these three logs well. The action of exfiltrating data from S3 with credentials stolen via SSRF is left in CloudTrail (if data events were on), the exposed WAF and SG configurations are tracked by Config, and the abnormal data-exfiltration traffic is visible in Flow Logs. After the incident, many organizations standardized the pattern of "centralizing all three logs in a central security account and correlating with GuardDuty."

## Real-Time Response: From CloudTrail to Automation

CloudTrail doesn't just record — it becomes a trigger for real-time automatic response. There are two main paths.

**CloudTrail → CloudWatch Logs → Subscription Filter → Lambda**: Send the Trail to CloudWatch Logs, then catch specific patterns (e.g., root account login, MFA-less console login) with a Subscription Filter or metric filter to invoke a Lambda or raise an alarm instantly. "Alert SecOps immediately on root account login" is the classic example — a root login should almost never happen in normal operations, so it's a strong alarm signal.

**CloudTrail → EventBridge → automatic response**: CloudTrail events flow to EventBridge in near real time, and an EventBridge rule matches a specific API-event pattern and sends it instantly to a target like Lambda/Step Functions/SNS. You build auto-remediation like "when 0.0.0.0/0 is added to a security group, automatically run a Lambda that revokes that rule."

> 🔍 **Going deeper**: CloudTrail's event delivery has some latency — typically an average of a few minutes (up to 15 minutes) from event occurrence to arriving in S3/CloudWatch Logs. So when you need "second-level real-time blocking," CloudTrail alone may not be enough, and true instant blocking is combined with the service's own policy (SCP, permission boundary) or GuardDuty's threat detection. CloudTrail's strength isn't "second-level blocking" but "a complete, tamper-proof after-the-fact record" — this role distinction splits the answer to the "real-time blocking" keyword on the exam.

## Getting Hands-On With the CLI

```bash
# Create a multi-region + global-service-events + Organization Trail
aws cloudtrail create-trail --name org-trail \
  --s3-bucket-name org-trail-log-archive \
  --is-multi-region-trail \
  --include-global-service-events \
  --is-organization-trail \
  --kms-key-id alias/saa-app \
  --enable-log-file-validation

aws cloudtrail start-logging --name org-trail

# Add data events only to a specific sensitive bucket (turning on everything explodes cost)
aws cloudtrail put-event-selectors --trail-name org-trail \
  --event-selectors '[{
    "ReadWriteType":"All",
    "IncludeManagementEvents":true,
    "DataResources":[{
      "Type":"AWS::S3::Object",
      "Values":["arn:aws:s3:::sensitive-bucket/"]
    }]
  }]'

# Log file integrity validation (cryptographically confirm whether tampered)
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111:trail/org-trail \
  --start-time 2026-05-01T00:00:00Z

# Create a CloudTrail Lake event data store (7-year retention)
aws cloudtrail create-event-data-store \
  --name security-lake \
  --retention-period 2557 \
  --multi-region-enabled

# CloudTrail Lake SQL query (all Decrypt calls by a specific Role)
aws cloudtrail start-query \
  --query-statement "SELECT eventTime, sourceIPAddress, requestParameters
    FROM event-data-store-id
    WHERE eventName = 'Decrypt'
      AND userIdentity.arn LIKE '%app-role%'
    ORDER BY eventTime DESC"
```

## Wrapping Up

CloudTrail is the foundation of AWS auditing, recording "who did what" in a tamper-proof way, and it's a regular of the SAA security and governance domain. The essence compresses into five points. ① Management events (control plane, low-frequency) get 90 days free, data events (data plane, high-frequency) require separate enablement and billing — a distinction created by the volume difference. ② S3 object-access tracking requires enabling Data Events to be visible, and global service (IAM/STS) events are recorded in us-east-1, so multi-region + include global is the standard for a security Trail. ③ Log integrity validation detects tampering with a SHA-256 hash chain + RSA signature, and prevents/isolates tampering with S3 Object Lock, a separate account, and KMS. ④ Organization Trail creates multi-account automatic auditing that member accounts can't turn off. ⑤ CloudTrail (who did it) vs Config (current state) vs VPC Flow Logs (traffic) answer different questions, and the exam splits the answer by the question's verb.

In the next article, we look at the tool that answers the counterpart to CloudTrail's "who did it" — "what state is it in now and does it follow the rules" — AWS Config, along with Systems Manager, the center of operational automation. The key is the link between governance and operations, where Config enforces a configuration's desired state and Systems Manager executes the remediation.

---

## 📝 연습 문제

**문제 1.** A security team wants to track who did GetObject on which objects in a specific sensitive bucket. With CloudTrail's default settings this information isn't visible. What is the correct action?

A) Enabling only management events makes it visible automatically
B) Enable CloudTrail Data Events for that bucket
C) Turn on VPC Flow Logs
D) Add a Config Rule

**정답: B**

해설: Object-level access like S3 GetObject/PutObject is a data-plane operation, so you must turn on Data Events, which are disabled by default. To prevent cost explosion, the standard is to selectively enable only specific sensitive buckets/prefixes rather than everything. A: management events don't reveal object access. C is only packet metadata, not the object-access action, and D is a configuration-state evaluation, not an access-action record.

---

**문제 2.** An organization received a compliance-audit requirement to "prove that no audit log was tampered with over the past year." Which CloudTrail feature directly satisfies this?

A) KMS encryption alone is sufficient
B) Log file integrity validation (SHA-256 hash chain + RSA signature)
C) Enabling Data Events
D) Delivery to CloudWatch Logs

**정답: B**

해설: Log file integrity validation gathers each log file's SHA-256 hash into an hourly digest, RSA-signs it with AWS's private key, and links the digests into a hash chain. Change even one character of a past log and the hash mismatch detects it instantly, and forging a digest is blocked by the signature. KMS encryption (A) is confidentiality, not proof of integrity. C and D are unrelated to proving integrity.

---

**문제 3.** An organization with dozens of accounts wants "new accounts to be audited automatically, and no team able to turn off their own account's Trail." Which is the most suitable solution?

A) Create an individual Trail per account and protect it with an SCP
B) Create an Organization Trail from the Organizations management account
C) Config Aggregator
D) CloudTrail Lake per account

**정답: B**

해설: Create an Organization Trail once from the management account and every member account is automatically included, new accounts automatically join, and because it's owned by the management account, member-account permissions can't turn it off or delete it. This is the standard for multi-account automatic auditing. A carries a heavy operational burden and risk of gaps; C is configuration aggregation, not API auditing; D is an analysis store, not a multi-account automatic-collection mechanism.

---

**문제 4.** During an incident analysis you want to check the current state and rule compliance of "which security groups currently have 0.0.0.0/0 inbound." Which is the most suitable tool?

A) CloudTrail
B) AWS Config
C) VPC Flow Logs
D) CloudTrail Lake

**정답: B**

해설: "What state is it in now and does it comply with the rules" is Config's domain. Config records a resource's current configuration snapshot and evaluates it with Rules. CloudTrail (A) answers the action "who added that rule," Flow Logs (C) is traffic flow, and CloudTrail Lake (D) is SQL analysis of API events. The question's verb is "is (state)," so it's Config.

---

**문제 5.** A team wants to retain 7 years of CloudTrail events and instantly run, in SQL, a forensic query to "aggregate by region every Decrypt API a specific IAM Role called over the past 3 years." Which is the most suitable solution?

A) Pile logs in S3 and manually define an Athena table each time
B) A CloudTrail Lake event data store
C) CloudWatch Logs Insights
D) Store in a Glacier Vault

**정답: B**

해설: CloudTrail Lake loads events into a dedicated data store, retains them up to 7+ years, and lets you query directly in SQL. It fits the requirement "long-term retention + instant SQL query" exactly. A works but carries heavy setup burden (schema definition, partition management); C is unsuitable for long-term forensics in terms of retention and integration; D is store-only and can't be queried.

---

**문제 6.** A security team wants to detect "an attacker attempting to erase their traces." When an API call that neutralizes CloudTrail itself occurs, they want an alert sent immediately. How?

A) Check only with a Config Rule
B) CloudTrail → EventBridge rule (StopLogging/DeleteTrail/PutEventSelectors, etc.) → SNS/Lambda
C) Analyze S3 Access Logs
D) Manually check the Trail state daily

**정답: B**

해설: "Audit-neutralizing APIs" like StopLogging, DeleteTrail, UpdateTrail, and PutEventSelectors are also recorded in CloudTrail and delivered to EventBridge in near real time. Match this event pattern with an EventBridge rule and send an instant alert to SNS/Lambda, and the very attempt to turn off logging becomes a detection signal. A and C aren't action-based instant alerting, and D is manual rather than automated, so it's late.

---

**문제 7.** In one incident, an intruder exfiltrated S3 data with stolen credentials. Which log answers each of the following three questions? (a) Who downloaded the objects (b) The exposed bucket's current public setting (c) The exfiltration traffic's source/destination IPs

A) (a) Config (b) CloudTrail (c) Flow Logs
B) (a) CloudTrail Data Events (b) Config (c) VPC Flow Logs
C) All CloudTrail
D) (a) Flow Logs (b) Config (c) CloudTrail

**정답: B**

해설: (a) The API action of downloading objects is answered by CloudTrail Data Events, (b) the bucket's current public setting and rule compliance by Config, and (c) the actual packet's source/destination/port by VPC Flow Logs. The three logs answer different questions and are used complementarily together in incident analysis. Split the tool by the question's verb ("downloaded / is set / flowed").

---

Supplementary note: CloudTrail is the core of the SAA security and governance domain, and the exam repeatedly asks about "management vs data events," "integrity validation's tamper prevention," "Organization Trail's multi-account automatic auditing," and above all "the division of labor among CloudTrail vs Config vs Flow Logs." Training yourself to distinguish, by verb, the questions the three logs answer (who did it / current state / traffic) is where you'll score best.
