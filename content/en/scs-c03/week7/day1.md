# Day 1 - CloudTrail: Management/Data Events, Organization Trail, Log File Integrity Validation, CloudTrail Lake

The essence of auditing is making it possible to reconstruct, after the fact, "who did what, when, where, and how." In AWS, the primary evidence that answers this question is **CloudTrail**. CloudTrail records nearly every API call made within an account as a JSON event. From a security exam perspective, the core questions are "what does CloudTrail *record, and what does it not record*?" and "how do we prove that the record *has not been tampered with*?"

CloudTrail exists in two modes. One is **Event history**, which is enabled by default in every account and shows the last 90 days of management events (a single-Region, read-only console view that cannot be stored or exported). The other is a **Trail**, which the user explicitly creates and which keeps events permanently in S3. When the exam mentions "long-term retention," "forensics," or "compliance," the answer is a Trail or CloudTrail Lake, not Event history.

In 2014, the code-hosting company Code Spaces effectively shut down its business within a day after an attacker gained control of its AWS console and deleted instances, storage, snapshots, and backups in turn. The lesson from this widely known incident is simple: **if backups and logs sit inside the same control boundary as the compromised account, they are neither backups nor logs.** The order of incident response becomes clearer when you flip it to the attacker's point of view. Before taking data, an attacker wants to make *themselves invisible*, which is why disabling cloud logging is listed in MITRE ATT&CK as its own technique, "Impair Defenses: Disable or Modify Cloud Logs." The organization trail, the separate logging account, and the digest signature chain we learn today are all devices that exist to neutralize this one technique.

### Event History, Trail, Lake: Dividing the Roles of the Three Stores

| Item | Event history | Trail (S3) | CloudTrail Lake |
|------|---------------|-----------|-----------------|
| Retention | Last 90 days | Effectively unlimited (follows the S3 lifecycle) | Up to 10 years (retention period is specified) |
| Events held | Management events | Management + data + Insights | Management + data + Insights + **external sources** |
| Storage location | Inside CloudTrail (not a user bucket) | The S3 bucket you specify (+ CloudWatch Logs optionally) | An immutable event data store managed by CloudTrail |
| How to query | Console · `lookup-events` API | Configure an Athena table or parse directly | Run SQL directly |
| Region scope | That Region only | Multi-Region possible | Organization and multi-Region aggregation possible |
| Cost | Free | First copy of management events free + S3 storage and request costs | Separate billing based on ingestion and retention |
| Typical use | Ad hoc check: "what just changed?" | The **baseline form** for long-term retention, forensics, and central aggregation | Interactive investigation without code |

The three are not mutually exclusive. The practical standard is a structure that **lays down a Trail as the baseline** (the original evidence stays in S3) and adds Lake or Athena on top for investigation convenience. Event history is, at most, a supporting window for "quickly skimming management events from the last 90 days in the console," not an evidence repository.

> ⚠️ **Trap**: The sentence "CloudTrail is on by default" is only half true. Event history is on, but **no trail is created automatically.** After 90 days those events are gone. If an exam passage says "investigate an incident from six months ago" and says nothing about trail configuration, the trap's answer is often that the evidence is already gone. Logging is *not retroactive*; any moment you did not have it turned on stays a gap forever.

## Three Kinds of Events: Management / Data / Insights

The events CloudTrail records fall into three categories of different character. If you do not know this distinction, you fall into traps like "why can't I see my S3 GetObject in the log?"

- **Management events**: Operations on the *control plane* for resources. `RunInstances`, `CreateBucket`, `AttachRolePolicy`, `ConsoleLogin`, and so on. They are recorded by default, and one copy of management events for the first trail is free.
- **Data events**: Operations on the *data plane* for the data inside a resource. S3 `GetObject`/`PutObject`/`DeleteObject`, Lambda `Invoke`, DynamoDB `PutItem`, and so on. They are **off by default**, high in volume, and incur additional charges.
- **Insights events**: Detect changes in the *rate* of unusual API calls with ML (for example, `RunInstances` at 10 times the usual). They must be enabled separately.

```json
{
  "eventVersion": "1.09",
  "eventTime": "2026-06-24T08:14:22Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "GetObject",
  "awsRegion": "ap-northeast-2",
  "sourceIPAddress": "203.0.113.10",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc",
    "sessionContext": { "attributes": { "mfaAuthenticated": "false" } }
  },
  "resources": [
    { "type": "AWS::S3::Object", "ARN": "arn:aws:s3:::secret-data/payroll.csv" }
  ],
  "readOnly": true,
  "managementEvent": false,
  "eventCategory": "Data"
}
```

> ⚠️ **Trap**: For a requirement like "trace who downloaded objects from an S3 bucket," the default trail alone gives no answer. `GetObject` is a *data event*, so it is recorded only if you explicitly add an S3 data event selector to the trail. Likewise, tracing the callers of a Lambda function requires Lambda data events. It is also worth noting that `userIdentity.sessionContext` shows whether MFA was used and even which role was assumed.

### Comparing the Three Kinds in One Table

| Item | Management events | Data events | Insights events |
|------|-------------------|-------------|-----------------|
| Target plane | Control plane (calls that create and change the resource itself) | Data plane (calls that read and write data *inside* the resource) | Analysis results derived from other events |
| Representative calls | `CreateBucket`, `AttachRolePolicy`, `AssumeRole`, `ConsoleLogin` | S3 `GetObject`, Lambda `Invoke`, DynamoDB `PutItem` | None (an anomaly signal, not an event) |
| Default | **On** | **Off** | **Off** |
| Volume | Relatively small | Explosive | Very small |
| Billing | First copy free, additional copies billed | Billed by event count | Billed by events analyzed |
| Question it answers | "Who created this resource and changed its permissions?" | "Who actually read this data?" | "Is something unusual happening right now?" |
| Place in an investigation | Reconstructing the breach *path* | Establishing the breach's *scope of damage* | The trigger for *discovering* the breach |

The last two rows of this table matter most in practice. With management events alone, you can say only "how the attacker obtained which permissions," and "so what did they actually take?" **can never be answered** without data events. For an organization with a breach-notification obligation, this difference changes the legal judgment, because "access was possible" and "access occurred" are different sentences.

Insights is commonly introduced only as "anomaly detection on call *rate*," but there are actually two types. One is when API call volume deviates sharply from the usual baseline (`ApiCallRateInsight`); the other is when the **error response rate** of a particular API surges (`ApiErrorRateInsight`). The latter is more interesting from a security viewpoint. The first thing an attacker holding stolen credentials does is probe "what can I do with these credentials," and in that process `AccessDenied` occurs in large numbers. Legitimate automation is written in advance to succeed, so its error rate stays low. In other words, **a surge in the error rate is itself the fingerprint of reconnaissance.**

## Anatomy of `userIdentity`: How to Read "Who" Precisely

The block you end up staring at longest in a CloudTrail investigation is `userIdentity`. Depending on the `type` value, the next question you should ask changes completely.

| `type` | Meaning | The question that should follow immediately |
|--------|---------|---------------------------------------------|
| `Root` | The account root credentials were used directly | Almost always an immediate alarm. Why was root used? Was MFA attached? |
| `IAMUser` | A long-term access key or console password | What is the `accessKeyId`? Is it a leaked or shared key? |
| `AssumedRole` | A temporary session that assumed a role through STS | *Who assumed that role?* → you must look at `sessionContext.sessionIssuer` |
| `AWSService` | An AWS service called on the user's behalf | The service principal in `invokedBy`. Is it a normal automation path? |
| `AWSAccount` | A principal from another account (details are visible only in that account) | What cross-account trust is in place? |
| `FederatedUser` | A temporary session created with `GetFederationToken` | Which IAM user issued this token? |
| `Unknown` | The type could not be determined | Rare. You must read the whole raw record |

`AssumedRole` is a common type in practice and easy to misunderstand. The record below is an example.

```json
{
  "userIdentity": {
    "type": "AssumedRole",
    "principalId": "AROAEXAMPLEID:alice-session",
    "arn": "arn:aws:sts::111122223333:assumed-role/AdminRole/alice-session",
    "accountId": "111122223333",
    "accessKeyId": "ASIAEXAMPLEKEY",
    "sessionContext": {
      "sessionIssuer": {
        "type": "Role",
        "principalId": "AROAEXAMPLEID",
        "arn": "arn:aws:iam::111122223333:role/AdminRole",
        "accountId": "111122223333",
        "userName": "AdminRole"
      },
      "attributes": {
        "creationDate": "2026-06-24T07:58:11Z",
        "mfaAuthenticated": "false"
      }
    }
  },
  "eventName": "PutBucketPolicy",
  "sourceIPAddress": "203.0.113.10",
  "userAgent": "aws-cli/2.15.0 Python/3.11 Linux/5.10"
}
```

Four things to read here.

1. **The `arn` is a session ARN, not a role ARN.** The last piece of `assumed-role/AdminRole/alice-session` is the session name, and it is a string chosen freely by whoever called `AssumeRole`. In other words, the session name is a *claim*, not *proof*. The real identity emerges only by tracing back to the `AssumeRole` call that created this session.
2. **The prefix of `accessKeyId` is a clue.** If it starts with `AKIA`, it is a long-term access key issued to an IAM user; if it starts with `ASIA`, it is a temporary credential issued by STS. In a breach investigation, these two letters are the first fork in "where did this key come from?"
3. **`mfaAuthenticated` is a session attribute.** It tells you whether MFA was used when the role was assumed. If this value is `false` and a sensitive administrative action is being performed, that alone is a candidate policy violation.
4. **`creationDate` is the session's start time.** If you look up the `AssumeRole` event at this time, the original principal (a person, an EC2 instance profile, or another account) is revealed.

```
[ Session tracing: two steps to find the real answer to "who" ]

  ① The event in question       ② Trace back with sessionIssuer + creationDate
  PutBucketPolicy               AssumeRole
  arn: .../AdminRole/           roleArn: .../AdminRole
       alice-session            roleSessionName: alice-session
  creationDate: 07:58:11        eventTime: 07:58:11
                                userIdentity.type: IAMUser  ← the real identity appears here
                                arn: .../user/alice
                                sourceIPAddress: 198.51.100.77
                                ↑ Differs from ①'s 203.0.113.10 = a sign the session moved around
```

That the source IP in ② differs from the source IP in ① means **the place where the session token was issued differs from the place where it was used.** Normally they match, since the credential is issued on a host and used as is. A mismatch is a classic indicator that temporary credentials have leaked and are being replayed elsewhere.

Sometimes `sourceIPAddress` contains not an IP but a **service DNS name** such as `cloudformation.amazonaws.com`. This means the call was not made directly by the user but performed by an AWS service on the user's behalf, and the `invokedBy` field of the same record also shows that service. Before being alarmed that "the source IP is strange," you should check `invokedBy` first. Conversely, there are scenarios that abuse this combination: if an attacker works *through* a service such as CloudFormation or SSM, their IP is not left in the log, only the service name. So in an investigation, for "calls a service made on someone's behalf" you must go one step further back to the *management event in which someone told that service to do so*.

```json
{
  "userIdentity": { "type": "AWSService", "invokedBy": "cloudformation.amazonaws.com" },
  "eventSource": "iam.amazonaws.com",
  "eventName": "CreateRole",
  "sourceIPAddress": "cloudformation.amazonaws.com",
  "eventType": "AwsApiCall"
}
```

## The Other Half of the Event Record: Failure, Path, and Context Fields

If you end an investigation after looking only at `userIdentity` and `eventName`, you miss half. In practice, the decisive fields are in fact toward the back.

| Field | What it tells you | Use in an investigation |
|-------|-------------------|-------------------------|
| `errorCode` / `errorMessage` | If the call **failed**, the reason | Clusters of `AccessDenied` are traces of permission-enumeration reconnaissance |
| `requestParameters` | The arguments actually passed to the call | Which bucket, which policy, which CIDR was specified |
| `responseElements` | The result of a change operation | The ID/ARN of the newly created resource. Empty for read-only calls |
| `additionalEventData` | Service-specific extra information | `MFAUsed` for `ConsoleLogin`, bytes transferred for S3, etc. |
| `tlsDetails` | TLS version, cipher suite, host header sent by the client | Identifying unusual clients using old TLS |
| `vpcEndpointId` | Whether the call went through a VPC endpoint | Distinguishing internet-routed vs private path |
| `userAgent` | The calling tool | `aws-cli`, SDK version, console or not. A tool different from usual is a signal |
| `recipientAccountId` | The account that received this event | Differs from `userIdentity.accountId` in cross-account events |
| `sharedEventID` | A common ID for the same incident recorded in multiple accounts at once | Stitching together cross-account KMS use and the like from both sides |
| `eventType` | `AwsApiCall` / `AwsServiceEvent` / `AwsConsoleAction` / `AwsConsoleSignIn` | Distinguishing what a person did in the console from programmatic calls |

`errorCode` is the field beginners overlook most often, and it is the cheapest signal in breach detection. A legitimate application is written to call only what it can do, so it rarely produces `AccessDenied`. An attacker who has stolen credentials, on the other hand, fires off a series of calls that poke at "what works at all," such as `ListBuckets`, `GetCallerIdentity`, `ListRoles`, and `DescribeInstances`, and a good number of them are denied. That is why mature detection rules almost without exception include **"the same principal received `AccessDenied` on many different APIs in a short time."** The beauty of this rule is that it catches on the *shape of the behavior* alone, regardless of which attack tool or vulnerability was used.

```sql
-- Athena: principals denied on multiple APIs within an hour — permission-enumeration reconnaissance candidates
SELECT useridentity.arn                AS principal,
       sourceipaddress,
       count(DISTINCT eventname)       AS distinct_denied_apis,
       count(*)                        AS denied_calls,
       min(eventtime)                  AS first_seen,
       max(eventtime)                  AS last_seen
FROM cloudtrail_logs
WHERE errorcode IN ('AccessDenied', 'UnauthorizedOperation', 'Client.UnauthorizedOperation')
  AND eventtime >= '2026-06-24T00:00:00Z'
GROUP BY useridentity.arn, sourceipaddress
HAVING count(DISTINCT eventname) >= 5
ORDER BY distinct_denied_apis DESC;
```

**Not everything is contained in `requestParameters`.** CloudTrail intentionally does not record sensitive values. For example, Secrets Manager's `GetSecretValue` records which secret was read but not the secret value itself, KMS `Decrypt` leaves no plaintext, and parameters carrying passwords or key material are omitted or masked. This is correct behavior by design, because the log must not itself become a target of leakage. What you should expect from an investigation is "what was read," not "what the content that was read is." That is why a secret-leak investigation always ends by **rotating all of the secrets in question** on the basis of the *fact of access*.

## Advanced Event Selectors: Precise Filtering of Data Events

Because data events easily explode in volume, you narrow them with **advanced event selectors**. You can filter on fields such as `eventName`, `resources.ARN`, and `readOnly`: only S3 objects under a particular prefix, only particular functions, only reads or only writes, and so on.

```json
{
  "AdvancedEventSelectors": [
    {
      "Name": "Log writes to sensitive prefix only",
      "FieldSelectors": [
        { "Field": "eventCategory", "Equals": ["Data"] },
        { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
        { "Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::secret-data/payroll/"] },
        { "Field": "readOnly", "Equals": ["false"] }
      ]
    }
  ]
}
```

This records only *writes* to the sensitive prefix, which keeps cost under control while still securing the key evidence. On the exam, for "audit only changes to a specific bucket while reducing data event cost," the advanced event selector is the answer.

The operators available when designing selectors are `Equals`, `NotEquals`, `StartsWith`, `NotStartsWith`, `EndsWith`, and `NotEndsWith`. Among these, the negation operators are especially useful in practice, because they let you build a design that is safer than a whitelist: "record everything except the noisy logs and temporary prefixes."

```json
{
  "AdvancedEventSelectors": [
    {
      "Name": "Log all object activity except noisy temp prefixes",
      "FieldSelectors": [
        { "Field": "eventCategory", "Equals": ["Data"] },
        { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
        { "Field": "resources.ARN", "NotStartsWith": [
            "arn:aws:s3:::app-scratch/tmp/",
            "arn:aws:s3:::app-scratch/cache/"
        ]}
      ]
    }
  ]
}
```

Designing the logging scope is one instance of the common security problem of *allowlist vs denylist*. "Pick and record only the sensitive things" (allowlist) is cheap, but **a new bucket not on the list quietly becomes a blind spot**, and new buckets keep appearing. "Record everything except noise" (denylist) costs more but does not create blind spots by default. The general principle of detection design is to choose the *safe-by-default side*, and for logging the safe default is "recorded." Go with the denylist form as far as the budget allows, and if the budget falls short, use an allowlist but also put in place a **procedure that automatically reflects new resources in the list** (tag-based, enforced by IaC).

## CLI Commands to Know by Heart

In an investigation, what is faster than the console is, in the end, the CLI. The exam also asks at the level of command names.

```bash
# 1) Which trails exist in this account — the first command of an audit
aws cloudtrail describe-trails --include-shadow-trails

# 2) Is that trail actually recording right now (IsLogging=false means someone turned it off)
aws cloudtrail get-trail-status --name org-audit-trail

# 3) How are data events configured
aws cloudtrail get-event-selectors --trail-name org-audit-trail

# 4) Look up management events from the last 90 days by condition
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --start-time 2026-06-20T00:00:00Z \
  --end-time   2026-06-25T00:00:00Z \
  --max-results 50

# 5) Skim what was done with a suspected-leaked access key
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLEKEY \
  --query 'Events[].{t:EventTime,n:EventName,u:Username}' \
  --output table

# 6) Only the history of touching a specific resource
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=corp-sensitive
```

`--lookup-attributes` for `lookup-events` accepts `EventId`, `EventName`, `ReadOnly`, `Username`, `ResourceType`, `ResourceName`, `EventSource`, and `AccessKeyId`, and you can specify **only one attribute at a time**. If you want to apply multiple conditions as an AND, a CLI lookup cannot do it and you must move to Athena or CloudTrail Lake.

`lookup-events` queries **only management events, and only the last 90 days**, because it is an API wrapper around Event history. An approach of "let's find data events with `lookup-events`" returns nothing. To query data events, you must read the S3 objects the trail dropped with Athena or use CloudTrail Lake. This boundary is easily used as a wrong-answer option.

## Reading Logs Accumulated in S3 with Athena

A trail drops logs into S3 as gzip JSON. The practical way for a human to read them is Athena (the CloudTrail console screen can automate Athena table creation).

```sql
-- Every moment the root account was used — the first detection rule in any organization
SELECT eventtime, eventname, sourceipaddress, useragent, errorcode
FROM cloudtrail_logs
WHERE useridentity.type = 'Root'
  AND eventtype != 'AwsServiceEvent'
ORDER BY eventtime DESC;

-- Console logins that succeeded without MFA
SELECT eventtime, useridentity.arn, sourceipaddress,
       json_extract_scalar(additionaleventdata, '$.MFAUsed') AS mfa
FROM cloudtrail_logs
WHERE eventname = 'ConsoleLogin'
  AND json_extract_scalar(responseelements, '$.ConsoleLogin') = 'Success'
  AND json_extract_scalar(additionaleventdata, '$.MFAUsed') = 'No';

-- Attempts to disable logging — if this query returns even one row, it is a response target immediately
SELECT eventtime, useridentity.arn, eventname, requestparameters, errorcode
FROM cloudtrail_logs
WHERE eventname IN ('StopLogging', 'DeleteTrail', 'UpdateTrail',
                    'PutEventSelectors', 'DeleteEventDataStore')
ORDER BY eventtime;

-- Everything a specific IP touched — the query you run right after receiving an indicator of compromise (IoC)
SELECT eventtime, useridentity.arn, eventsource, eventname, errorcode
FROM cloudtrail_logs
WHERE sourceipaddress = '203.0.113.10'
ORDER BY eventtime;
```

> 🎯 **Scenario**: "Every investigation we scan several TB of CloudTrail logs with Athena, and the query cost and time are unmanageable." The answer direction is **partitions**. CloudTrail drops objects in the structure `AWSLogs/<account>/CloudTrail/<region>/<yyyy>/<mm>/<dd>/`, so if you set this path up as account, Region, and date partitions, the query reads only the date range it needs. A table built without partitions scans the entire bucket every time, and that is almost the only cause of the impression that "Athena is slow and expensive." If investigation convenience is the top priority and you do not want to manage partitions at all, that is when you go to CloudTrail Lake.

## Multi-Region Trails: Gathering Everything in One Place

A trail is created as single-Region or **multi-Region**. A multi-Region trail gathers the events of all Regions into one S3 bucket. **Global service events** such as IAM, STS, and CloudFront occur in a particular Region (mostly us-east-1), so you need either a multi-Region trail or global service event logging turned on to capture them without gaps.

The first principle of audit log design is *completeness*. In a security incident investigation, "there are no logs for that Region" is fatal. So the baseline recommendation is always a single multi-Region trail with "all Regions + all management events (both read and write)" turned on. This is to prevent the *region hopping* evasion technique, where an attacker stands up resources in a Region with no monitoring (for example, a rarely used Region).

## Organization Trail: Audit Across Multiple Accounts at Once

If you create an **organization trail** from the AWS Organizations management account (or a delegated administrator), the same trail is automatically applied to *all member accounts* of the organization. A member account administrator can neither view nor turn off this trail (it can be exposed read-only, but cannot be deleted or changed). When a new account joins the organization, it is included automatically.

```bash
aws cloudtrail create-trail \
  --name org-audit-trail \
  --s3-bucket-name central-audit-logs-111122223333 \
  --is-organization-trail \
  --is-multi-region-trail \
  --kms-key-id arn:aws:kms:us-east-1:111122223333:key/aaaa-bbbb
```

> 🎯 **Scenario**: "In a 200-account organization, guarantee centralized auditing that no account administrator can turn off." Answer: create an organization trail with multi-Region from the management account, and aggregate the logs into an S3 bucket in a separate logging-dedicated account. Having each member account create its own trail lacks consistency and enforceability, so it is wrong.

### Where, and Under What Names, Logs Actually Land

To avoid getting lost when you open the S3 console during an investigation, you need to know the path rules.

```
s3://central-audit-logs/
└── AWSLogs/
    ├── 111122223333/                       ← single-account trail
    │   ├── CloudTrail/
    │   │   └── ap-northeast-2/2026/06/24/  ← log files (.json.gz)
    │   └── CloudTrail-Digest/
    │       └── ap-northeast-2/2026/06/24/  ← digest files (for integrity validation)
    └── o-exampleorgid/                     ← an organization trail adds one more level for the organization ID
        ├── 111122223333/CloudTrail/...
        ├── 444455556666/CloudTrail/...
        └── 777788889999/CloudTrail/...
```

The key point is that an organization trail adds one more **organization ID directory** right under `AWSLogs/`, and splits by account inside it. If you do not reflect this structure when writing the `Resource` ARN in the bucket policy, writes are denied and logs are not delivered. And digests are stored under a **separate prefix** from the logs. If you lock only the logs when applying a retention policy later and miss the digests, integrity validation becomes meaningless, so both prefixes must receive the same protection.

### Log Bucket Policy: Let CloudTrail Write but Not Just Anyone

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::central-audit-logs",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail"
        }
      }
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::central-audit-logs/AWSLogs/o-exampleorgid/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceArn": "arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail"
        }
      }
    },
    {
      "Sid": "DenyEverythingButTheTrailAndAuditors",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutBucketPolicy"],
      "Resource": [
        "arn:aws:s3:::central-audit-logs",
        "arn:aws:s3:::central-audit-logs/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalArn": "arn:aws:iam::999988887777:role/LogArchiveBreakGlass"
        }
      }
    }
  ]
}
```

The three statements each do a different job. The first is `s3:GetBucketAcl`, which CloudTrail needs to verify bucket ownership (without it, trail creation itself fails); the second is the actual write permission; and the third is a Deny that keeps anyone from deleting the logs.

If you omit the `aws:SourceArn` condition, a **Confused Deputy** door opens. The service principal `cloudtrail.amazonaws.com` is a name shared by every account in the world, so if you allow it without a condition, *any account* can create its own trail and pour data into someone else's log bucket. If the log bucket is polluted with junk, both investigation cost and storage cost rise, and in the worst case forged logs get mixed in with the real ones. You are better off memorizing that in every resource policy that allows a service principal, an `aws:SourceArn` or `aws:SourceAccount`/`aws:SourceOrgID` condition is not optional but mandatory.

A decision often missed when designing an organization trail is whether to use a **delegated administrator**. If you create the trail directly in the management account, the person who wants to change the audit configuration has to get into the account with the highest privileges over the entire organization; that is, you end up opening the most dangerous account frequently for audit operations. CloudTrail lets you designate a particular account in the organization as a delegated administrator and have it manage the organization trail from that account, which lets you separate "routine audit operations" from "top-level organization privileges." Least privilege is not only a matter of policy documents but also of *which account you must log into, and how often*.

```
[ Flow of multi-account audit data ]

  Management account / delegated administrator
  ┌──────────────────────────┐
  │ organization trail defined│  ← members can only view; they cannot turn it off or delete it
  └───────────┬──────────────┘
              │ configuration propagates automatically to the whole organization (new accounts auto-included)
   ┌──────────┼───────────────┬───────────────┐
   ▼          ▼               ▼               ▼
 Account A  Account B      Account C     (Account D, joining tomorrow)
 all Regions all Regions   all Regions    applied automatically on joining
   │          │               │               │
   └──────────┴───────┬───────┴───────────────┘
                      ▼
            Log archive account (separate credential boundary)
            s3://central-audit-logs
              ├─ Bucket policy: only the service principal + SourceArn may write
              ├─ Versioning + Object Lock (Day 4)
              ├─ Dedicated SSE-KMS CMK (Day 4)
              └─ No operations-team access / read access for the security team only
```

The whole of this design is that the arrows in this picture go **in one direction only**. Logs only flow from the operational accounts into the archive account, and there is no path from the operational side to touch the data in the archive account. Even if the operational accounts are entirely taken over, logs that have already arrived cannot be touched.

## Log File Integrity Validation

The value of an audit log comes from the trust that "it has not been tampered with." CloudTrail provides **log file integrity validation**, which guarantees this cryptographically. When enabled, CloudTrail generates a **digest file** every hour and stores it separately in S3.

How it works:
1. It computes the SHA-256 **hash** of each log file.
2. It records those hashes in the hourly digest file together with *the hash of the previous digest file*, so the digests are linked in a **hash chain**.
3. The digest file is **RSA-signed** with CloudTrail's private key. Validation is performed with AWS's public key.

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail \
  --start-time 2026-06-20T00:00:00Z
```

This structure shares its idea with the *Merkle chains / append-only integrity* used by blockchains and Git. If someone deletes a past log file or changes its contents, that file's SHA-256 no longer matches the digest's record, and even if they try to forge the digest, the RSA signature and the chain leading to the previous digest break. In other words, it creates *tamper-evidence*. However, this is a mechanism that *proves* tampering, not one that *prevents* it. To prevent tampering itself, you need S3 Object Lock (Day 4).

Integrity validation "proves that the logs have not changed," but it cannot recover events that were missing (never recorded) in the first place. Also, if the digest files are deleted as well, validation of that interval becomes impossible, so protecting the logs and digests with a separate account and Object Lock is what makes the control complete.

### Opening Up a Digest File

A digest is not just a list of hashes. It carries *a pointer to the previous digest and its hash*, forming a chain that is unbroken in time order.

```json
{
  "awsAccountId": "111122223333",
  "digestStartTime": "2026-06-24T07:00:00Z",
  "digestEndTime":   "2026-06-24T08:00:00Z",
  "digestS3Bucket": "central-audit-logs",
  "digestS3Object": "AWSLogs/111122223333/CloudTrail-Digest/ap-northeast-2/2026/06/24/…json.gz",
  "digestPublicKeyFingerprint": "d1a2b3c4…",
  "digestSignatureAlgorithm": "SHA256withRSA",
  "previousDigestS3Bucket": "central-audit-logs",
  "previousDigestS3Object": "AWSLogs/111122223333/CloudTrail-Digest/ap-northeast-2/2026/06/24/…json.gz",
  "previousDigestHashValue": "9f2c…",
  "previousDigestHashAlgorithm": "SHA-256",
  "logFiles": [
    {
      "s3Bucket": "central-audit-logs",
      "s3Object": "AWSLogs/111122223333/CloudTrail/ap-northeast-2/2026/06/24/…json.gz",
      "hashValue": "4b8e…",
      "hashAlgorithm": "SHA-256",
      "newestEventTime": "2026-06-24T07:59:41Z",
      "oldestEventTime": "2026-06-24T07:00:12Z"
    }
  ]
}
```

The digest's own RSA signature is held not in the file body but in the **metadata of that S3 object**. So when you download a digest and read it by eye, you do not see the signature; the validation tool reads the object metadata as well to check it.

```
[ The integrity validation chain: what vouches for what ]

  07:00 digest ◀────┐          08:00 digest ◀────┐          09:00 digest
  ├ logFiles[]      │          ├ logFiles[]      │          ├ logFiles[]
  │  └ SHA-256 ──▶ 07:00 logs  │  └ SHA-256 ──▶ 08:00 logs  │  └ SHA-256 ──▶ 09:00 logs
  ├ prevHash ───────┘(06:00)   ├ prevHash ───────┘(07:00)   ├ prevHash ──┘(08:00)
  └ RSA signature (AWS private key)  └ RSA signature         └ RSA signature
        ▲                            ▲                          ▲
        └──────── Validation is performed with the AWS public key ──────────┘

  ① Change even one line of a log  → that file's SHA-256 mismatches the digest's record
  ② Try to fix the digest to match → the RSA signature breaks
  ③ Swap out the whole digest      → the chain breaks against the next digest's prevHash
  ④ Delete the digest              → that interval is reported as "unverifiable" (it does not pass silently)
```

④ matters most in practice. The purpose of integrity validation is not to see a green light saying "all normal," but to **make sure an abnormality can never pass silently.** A deleted interval is reported not as "nothing" but as a "hole."

```bash
# Download the logs and digests for the specified interval and validate both hashes and signatures
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-audit-trail \
  --start-time 2026-06-20T00:00:00Z \
  --end-time   2026-06-25T00:00:00Z \
  --verbose
```

The three statements to watch for in the output are (1) the number of digest and log files validated, (2) the list of files judged invalid, and (3) the **list of files that could not be found (deleted)**. The evidence you submit to an auditor is complete only when it includes not just (1) but also the fact that (2) and (3) are empty.

Integrity validation works **only when the logs and digests to be validated are still in their original location.** If you moved logs to Glacier Deep Archive to save cost or moved them to another bucket, `validate-logs` cannot find the files. So when you are asked for "7-year retention + integrity validation," you must design the lifecycle policy's tier-transition timing together with the restore time needed during an audit. Losing verifiability while trying to satisfy a retention requirement is a common own goal.

Here we separate precisely what integrity validation guarantees from what it does not. What it guarantees is that "nobody changed it **after** CloudTrail recorded it." What it does not guarantee is anything that happened at the stage **before** CloudTrail recorded it. That is, activity that was never left because data events were off, time periods when the trail was stopped, and APIs that are not logged are gaps that even a perfect hash chain cannot fill. The chain of custody for evidence begins *at the moment the evidence is generated*, and what precedes it is a matter not of a chain but of trust. So the statement "we turned on integrity validation, so we are safe" does not hold, and you must always discuss together **logging scope (what is recorded) + continuity (is it unbroken) + integrity (is it untampered)**.

## CloudTrail Lake: Audit Logs as a Queryable Data Lake

A traditional trail drops logs into S3 as JSON. To investigate, you have to create an Athena table or parse them directly. **CloudTrail Lake** stores events in an *immutable* data store and lets you **query directly with SQL**. The retention period is up to 10 years (extendable retention).

```sql
SELECT eventTime, userIdentity.arn, eventName, sourceIPAddress
FROM event_data_store_id
WHERE eventName = 'ConsoleLogin'
  AND element_at(additionalEventData, 'MFAUsed') = 'No'
  AND eventTime > '2026-06-01 00:00:00'
ORDER BY eventTime DESC;
```

Strengths of CloudTrail Lake:
- **Instant queries**: Run SQL without ETL or Athena setup.
- **Event data stores**: Can ingest not only management, data, and Insights events but also **external sources** (other AWS services, on-prem, SaaS audit logs).
- Supports **organization-level aggregation** and Athena integration through federation.

> 🎯 **Scenario**: "A security analyst wants to ad hoc investigate the last two years of CloudTrail with SQL without coding." The answer is CloudTrail Lake. S3 + Athena is also possible, but it carries table and partition management overhead, whereas Lake provides retention, immutability, and querying in one go. However, Lake's ingestion and storage cost model differs from a trail's, so if the goal is "lowest-cost simple storage," an S3 trail is still better.

### Trail (S3+Athena) vs Lake: What to Choose By

| Criterion | Trail + S3 (+Athena) | CloudTrail Lake |
|-----------|----------------------|-----------------|
| Investigation setup cost | Table DDL, partitions, and permissions must be configured | None (SQL right after creation) |
| Storage cost | Low (S3 pricing + tiering with lifecycle) | Relatively high |
| Original evidence retention | The S3 object itself is the original and can be locked with Object Lock | The store is immutable, but object-level control is not possible |
| Integrity validation | The hash chain of `validate-logs` is available | Relies on the store's immutability |
| External log integration | Separate ETL needed | Supports ingesting external sources |
| Retention cap | Follows S3 policy (effectively unlimited) | Up to 10 years |
| Export to other tools | Free (every tool reads S3) | Centered on exporting query results |

When the exam says **"compliance, long-term retention, lowest cost,"** it is an S3 trail, and when it says **"analysts investigate immediately without code,"** it is Lake. And in practice the answer is usually both: keep the original evidence in S3 under Object Lock, and put a copy for investigation convenience in Lake. Separating the original from the working copy is also a basic principle of digital forensics.

```sql
-- Lake: the entire activity of a specific access key in time order (building an investigation timeline)
SELECT eventTime, eventSource, eventName, sourceIPAddress, errorCode
FROM event_data_store_id
WHERE userIdentity.accessKeyId = 'ASIAEXAMPLEKEY'
ORDER BY eventTime;

-- Lake: pick out only the moments IAM permissions were expanded across the whole organization
SELECT eventTime, recipientAccountId, userIdentity.arn, eventName
FROM event_data_store_id
WHERE eventSource = 'iam.amazonaws.com'
  AND eventName IN ('AttachUserPolicy', 'AttachRolePolicy', 'PutUserPolicy',
                    'PutRolePolicy', 'CreateAccessKey', 'UpdateAssumeRolePolicy')
  AND eventTime > '2026-06-01 00:00:00'
ORDER BY eventTime DESC;
```

The second query is used especially often in breach investigations. It is rare for an attacker's goal to be the initial access itself; most reach the target data by way of **privilege escalation**. So if you pull out only the "IAM-related write calls" and lay them out in time order, the skeleton of the attack narrative is exposed as it is. The reason for also selecting `recipientAccountId` is to tell which account an incident belongs to in an organization-level store.

When you create a CloudTrail Lake event data store, **you set the retention period and ingestion scope, and afterward you cannot delete already-ingested events individually.** This immutability is its value as an audit tool, but it is also a trap: a store created with a wide scope cannot have the cost of data already ingested reversed even if you later judge that "too much is being captured." So when adopting Lake, the safe order is (1) start with a narrow scope and short retention and observe the actual query patterns, and (2) widen the scope after you have confirmed which event types the investigation truly needs. Always remember together that for an immutable store, "it cannot be deleted" is both the advantage and the bill.

## Connecting CloudTrail to Real-Time Response

CloudTrail is a recording tool, but if you stream events to **CloudWatch Logs** or combine it with **EventBridge** rules, near-real-time detection and response become possible. Example: catch "root account login" or "CloudTrail disabled (`StopLogging`)" events with EventBridge and trigger an SNS notification and Lambda automatic response.

```json
{
  "Name": "detect-cloudtrail-tampering",
  "EventPattern": {
    "source": ["aws.cloudtrail"],
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventSource": ["cloudtrail.amazonaws.com"],
      "eventName": ["StopLogging", "DeleteTrail", "UpdateTrail",
                    "PutEventSelectors", "DeleteEventDataStore"]
    }
  },
  "Targets": [
    { "Id": "notify-secops", "Arn": "arn:aws:sns:ap-northeast-2:999988887777:secops-critical" },
    { "Id": "auto-restart",  "Arn": "arn:aws:lambda:ap-northeast-2:999988887777:function:ReenableTrail" }
  ]
}
```

You can also build the same detection on the CloudWatch Logs side. If you are also sending the trail to CloudWatch Logs, a **metric filter + alarm** is the classic implementation, and many of the monitoring items required by the CIS AWS Foundations Benchmark take exactly this form.

```bash
# The classic pattern: extract root account use as a metric and connect it to an alarm
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-audit-trail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
      metricName=RootAccountUsageCount,metricNamespace=CISBenchmark,metricValue=1

aws cloudwatch put-metric-alarm \
  --alarm-name RootAccountUsageAlarm \
  --namespace CISBenchmark --metric-name RootAccountUsageCount \
  --statistic Sum --period 300 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:ap-northeast-2:999988887777:secops-critical
```

The `$.userIdentity.invokedBy NOT EXISTS` condition in the filter pattern matters. Without it, even legitimate actions that AWS services perform on the account's behalf are caught as "root use," and the alarm becomes the boy who cried wolf. **The quality of a detection rule is determined less by what it catches than by what it filters out** — a rule with frequent false positives is ignored within weeks, and an ignored rule is the same as no rule.

EventBridge-based detection and S3 delivery **differ in speed.** Management events flowing to EventBridge are close to real time, but a trail delivering log files to S3 generally takes from several minutes to around 15 minutes after the API call. So when "immediate detection and blocking" is required, the answer is EventBridge (or a CloudWatch Logs subscription), not "periodically scan the S3 logs." Conversely, for "sweep the entire last quarter to find anomalies," the answer is batch analysis on S3/Lake, not the real-time path. The exam separates these two using *real time vs after the fact* as the clue.

One of the first things an attacker goes after after getting in is *disabling logs* — `StopLogging`, `DeleteTrail`, turning off data events with `PutEventSelectors`, and so on. So a mature detection design puts "changes to the CloudTrail configuration itself" under watch. It catches `eventName in (StopLogging, DeleteTrail, UpdateTrail)` with an EventBridge rule and alarms immediately, makes it impossible to turn off from member accounts with an organization trail, and sends logs to a separate account so that *even if the attacker obtains permissions in the account where the logs live, they cannot delete the logs.* Together with Day 2's AWS Config, this forms "audit of both configuration and activity."

There is an order that is repeatedly confirmed in public cloud breach response reports. ① Initial access through a leaked long-term access key or a vulnerable application, ② checking what permissions they hold with calls like `GetCallerIdentity` and `ListRoles`, ③ creating new IAM users and access keys to secure **persistence**, ④ attempting to disable logging and alarms, ⑤ accessing the target data. This order matters because **log disabling comes at ④, not ①.** That is, ① through ③, before the attacker turned off logs, are already in CloudTrail, and that interval is exactly what we must recover in the investigation. So the three layers of organization trail (members cannot turn it off) + delivery to a separate account (it cannot be deleted) + a `StopLogging` alarm (you are notified the moment it is turned off) each defend a different point in time: so it cannot be turned off, so it cannot be deleted, and so that if it was turned off, you know immediately.

## Summary

CloudTrail is the primary evidence of auditing, but **what is not turned on is not recorded, and what is not recorded cannot be investigated.** So learning this service compresses into three questions. First, *what does it keep?* Management events are the default, but to answer "who actually took the data?" you must turn on data events in advance, and you make the cost manageable by narrowing with advanced event selectors. Second, *who can turn it off?* Use an organization trail so members cannot turn it off, send logs to a separate account so they cannot be deleted, and alarm immediately through EventBridge on `StopLogging`-family calls. Third, *can that record be trusted?* The SHA-256 hash chain and RSA signatures of log file integrity validation *prove* tampering, and *preventing* tampering is the job of Day 4's Object Lock. And what your hands actually reach for at an investigation scene is, in the end, the `userIdentity` block: separate the nature of the principal by `type`, for `AssumedRole` trace back through `sessionContext` to find the real identity, and read the fingerprint of reconnaissance in the interval where `errorCode` clusters.

---

## 📝 Practice Questions

**Question 1.** You are trying to trace who downloaded a specific object from an S3 bucket, but the `GetObject` call does not appear in the default multi-Region trail. Which cause and resolution is correct?

A) `GetObject` is a global service event, so a us-east-1 trail is needed  
B) `GetObject` is a data event, so it is not recorded by default, and you must add an S3 data event selector to the trail  
C) Log file integrity validation must be turned on for data events to be recorded  
D) Insights events must be enabled  

**Answer: B**  
Explanation: S3 object-level operations (`GetObject`/`PutObject`, etc.) are data events, which are data plane operations and are off by default. You must explicitly add an S3 data event selector (or advanced event selector) to the trail for them to be recorded. `GetObject` is not a global service event, integrity validation is for tamper detection and does not expand what is recorded, and Insights detects anomalies in call *rates*, which is unrelated to tracking individual downloads.

---

**Question 2.** In a 200-account organization, you must guarantee centralized auditing that no member account administrator can turn off or change. What is the most appropriate design?

A) Create an individual trail in each member account and check it regularly  
B) Create a multi-Region organization trail in the management account and aggregate the logs into an S3 bucket in a dedicated logging account  
C) Export Event history every 90 days and store it  
D) Manually collect each account's CloudWatch Logs  

**Answer: B**  
Explanation: An organization trail is created in the management account (or a delegated administrator) and automatically applies to all member accounts, and member account administrators cannot turn it off or delete it. New accounts are included automatically. If logs are sent to a separate logging account, a member account cannot tamper with the logs even if it obtains permissions. Individual trails lack consistency and enforceability, Event history covers 90 days and cannot be exported, and manual aggregation is vulnerable to omission and tampering.

---

**Question 3.** A compliance auditor requires cryptographic proof that CloudTrail log files from the past 3 months have not been tampered with. Which feature directly provides this?

A) S3 bucket versioning  
B) CloudTrail log file integrity validation (SHA-256 hash + RSA-signed digest chain)  
C) Insights events  
D) KMS envelope encryption  

**Answer: B**  
Explanation: Log file integrity validation computes the SHA-256 hash of each log file, records it in an hourly digest file signed with RSA, and links each digest to the previous digest in a hash chain. Therefore any tampering with a log or digest is detected at the validation step. Versioning only keeps overwrite history and provides no cryptographic proof, Insights is anomaly detection, and KMS encryption is a confidentiality control that differs from integrity *proof*.

---

**Question 4.** A security analyst wants to immediately investigate the past 2 years of CloudTrail events with SQL, without a separate ETL or Athena table setup. What is most suitable?

A) Filter in the Event history console  
B) Run SQL queries in a CloudTrail Lake event data store  
C) Manually parse the JSON stored in S3 every time  
D) The Insights dashboard  

**Answer: B**  
Explanation: CloudTrail Lake stores events in an immutable data store and lets you query them directly with SQL, supporting retention of up to 10 years. No ETL or Athena table/partition management is needed. Event history covers 90 days and cannot be exported, manual JSON parsing is inefficient, and Insights is a dashboard for call-rate anomaly detection that does not offer ad hoc SQL investigation.

---

**Question 5.** The incident response team requests: "Immediately detect and alert on an attacker turning off CloudTrail after intrusion (`StopLogging`)." What is the most appropriate configuration?

A) Turn on only log file integrity validation for the trail  
B) Match CloudTrail management events with an EventBridge rule (`eventName in [StopLogging, DeleteTrail, UpdateTrail]`) and trigger real-time response through SNS/Lambda  
C) Add a data event selector  
D) Turn on Insights events and review weekly  

**Answer: B**  
Explanation: `StopLogging`/`DeleteTrail`/`UpdateTrail` are recorded as management events, and you can match these events in real time with an EventBridge rule to trigger an SNS alert or an automatic Lambda response. Integrity validation is after-the-fact proof of tampering rather than a real-time alert, data event selectors are for data plane operations, and Insights is rate-based anomaly detection that is lacking in immediacy and precision. Making it impossible to turn off from member accounts with an organization trail is also a complementary measure.

---
