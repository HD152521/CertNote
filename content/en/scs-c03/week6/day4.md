# Day 4 - ACM and Macie: Certificate Lifecycle and Integration, Macie Sensitive Data (PII) Discovery and Classification

Encryption in transit rests on TLS certificates. And knowing where sensitive information is hiding in stored data is the starting point of data protection. Today we cover two services: **AWS Certificate Manager (ACM)** automates the issuance, renewal, and deployment of TLS certificates, and **Amazon Macie** uses machine learning to discover and classify sensitive information such as PII in data stored in S3. The former is responsible for *trust in the encrypted channel*, the latter for *visibility into the data*.

## ACM: Automating the Certificate Lifecycle

The classic incident in TLS certificate operations is "forgetting to renew, the certificate expires, and the service goes down." ACM's core value is eliminating this risk through **managed renewal**.

It is easy to think "surely not because of that," but certificate expiry has been the cause of major outages. In December 2018, the widespread disruption of data services at several carriers, including O2 in the UK, was caused by the expiry of a certificate in network equipment software, and in February 2020 Microsoft Teams became unreachable for several hours because a certificate renewal was missed. It was neither an attack nor a vulnerability; the date merely passed, and the entire service stopped. There are two lessons here. First, a certificate is an *asset that must be operated*, not a setting you install once and forget. Second, therefore renewal must be left to **automation** rather than a person's calendar, and you must **monitor** for the possibility that the automation fails silently. ACM's reason for existing is exactly these two sentences.

It is accurate to view ACM certificates in three kinds.

| Kind | Issuance | Automatic renewal | Private key export | Typical use |
|------|------|-----------|---------------|-------------|
| **Public certificate** | Issued free by ACM, publicly trusted CA chain | **Possible** (unattended with DNS validation) | **Not possible** | Internet-facing ALB/CloudFront/API GW |
| **Private certificate** | AWS Private CA (paid), internal trust chain | Possible | **Possible** (export supported) | TLS/mTLS between internal services, direct installation on EC2 |
| **Imported certificate** | Issued by an external CA and uploaded to ACM | **Not possible** | Not applicable (you hold the original) | When an existing CA contract must be kept |

> ⚠️ **Trap**: **ACM does not renew imported certificates.** ACM only tells you when it expires (expiry-approaching event, `DaysToExpiry` metric); renewal is entirely the user's responsibility. The misconception "we uploaded it to ACM, so it renews automatically" is the point that leads to real outages, and the exam asks it in the form "we imported an external CA certificate into ACM and it expired." If you need automatic renewal, you must move to an ACM-issued public certificate or a Private CA certificate.

### Domain Validation: DNS vs Email

When issuing a public certificate, you must prove ownership of the domain:
- **DNS validation (recommended)**: when you add the CNAME record ACM gives you to the domain's DNS, ACM verifies it and handles **even automatic renewal unattended**. With Route 53, one button click inserts the record for you.
- **Email validation**: click the link in the email sent to the domain registration contact. A person must intervene at every renewal, so automation breaks.

The reason DNS validation is the key to renewal automation is that the CNAME record *persistently exists*. At renewal time, ACM re-checks the existence of that record to prove that domain control is maintained. Email validation is a one-time proof, so re-proof is needed at every renewal. That is, "sustainable proof of ownership" enables unattended renewal. Trust in PKI rests not only on key ownership but on the *continuity of domain control*.

What a TLS certificate actually does is only that a CA vouches by signature that "this public key belongs to this domain." The browser walks up the certificate chain presented by the server (leaf → intermediate CA → root CA), verifying signatures, and passes it if the root is in its own trust store. A frequently missed practical trap here is a **missing intermediate certificate**. If you send only the leaf and not the intermediate CA certificate along with it, it works in browsers that have cached that intermediate certificate but fails in clients that have not (some mobile apps, `curl`, old Java runtimes). This is the classic cause of the symptom "it works in the browser, but only the app gets a TLS error." ACM, as a managed service, deploys the whole chain, which structurally eliminates this mistake. Also, because the issuance of a publicly trusted certificate is publicly recorded in **Certificate Transparency logs**, you can detect it if an unexpected certificate is issued for your own domain (if you want to hide internal domain names, you can turn off CT logging when requesting from ACM, but then major browsers will not trust that certificate, which is the price).

### Private CA: Building Internal Trust Yourself

TLS between internal services or mTLS (mutual authentication) does not need public trust. Rather, it is undesirable for internal hostnames to be exposed in CT logs. In that case you set up an organization-only trust chain with AWS Private CA.

```
[ Hierarchical Private CA setup ]

  Root CA (kept as close to offline as possible, used minimally)
     └─ Subordinate CA (does the actual issuing, can be revoked and replaced if needed)
           ├─ svc-a.internal   (server certificate)
           ├─ svc-b.internal
           └─ device-0001      (IoT device client certificate)
```

The reason for having subordinate CAs rather than using the Root directly is to reduce the **revocation blast radius**. If a subordinate CA key leaks, you only need to revoke that subordinate CA and set up a new one, but if the Root leaks, all trust collapses and the trust stores of every device must be replaced. Revocation is distributed through CRLs (revocation list files) or OCSP (real-time lookup); choose CRL when there are many large-scale or offline devices, and OCSP when immediacy matters.

| Item | ACM public | Private CA |
|------|------------|------------|
| Trust anchor | Public trust stores (browsers, OS) | Trust anchor distributed by the organization |
| Cost | Certificates free | CA operating cost + per-issuance charges |
| CT log disclosure | Public by default | Not applicable (internal names not exposed) |
| Private key export | Not possible | Possible → install on EC2/on-premises |
| mTLS client certificates | Not suitable | **Suitable** (typical use) |
| Revocation | Managed by the CA | You configure CRL/OCSP yourself |

> 🎯 **Scenario**: When "tens of thousands of IoT devices connect to the backend, each must mutually authenticate (mTLS) with a unique client certificate, and stolen devices must be blocked immediately" comes up, the answer is **issue client certificates from Private CA + configure revocation (CRL/OCSP)**. ACM public certificates are not for client certificate use, and you cannot put the private key on the device either. If the phrase "block immediately" is present, the answer must include the revocation mechanism too.

### Where ACM Certificates Can and Cannot Be Used

ACM public certificates can be used only when **deployed directly to integrated AWS services**, because the private key cannot be extracted:

| Usable | Not usable (cannot install directly) |
|-----------|--------------------------|
| Elastic Load Balancer (ALB/NLB) | Directly on an EC2 instance |
| CloudFront | On-premises servers |
| API Gateway | Direct installation inside a container |
| App Runner, Cognito, etc. | (key cannot be extracted) |

> ⚠️ **Trap**: "You want to terminate TLS directly on EC2, so install an ACM public certificate" is a *wrong* answer. An ACM public certificate cannot export its private key, so it cannot be installed directly on EC2. To terminate on EC2, either (1) put an ALB in front and terminate TLS with the ACM certificate, or (2) **export a certificate issued by Private CA** and install it on EC2. It is also easy to miss that the certificate used for CloudFront must be issued in **us-east-1 (N. Virginia)**.

### Regional Characteristics and Monitoring Renewal Failures

ACM certificates are **Regional resources** (only the one for CloudFront has the us-east-1 global exception). To prepare for cases where automatic renewal can fail (the DNS validation record was deleted, loss of domain control), receive **ACM expiry-approaching events via EventBridge** or set an alarm on the **CloudWatch `DaysToExpiry` metric**.

```bash
aws acm request-certificate \
  --domain-name example.com \
  --subject-alternative-names "*.example.com" \
  --validation-method DNS \
  --key-algorithm RSA_2048

# Check validation status and renewal eligibility together
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:ap-northeast-2:111122223333:certificate/abcd-1234 \
  --query 'Certificate.{Status:Status,InUse:InUseBy,NotAfter:NotAfter,Renewal:RenewalEligibility,Validation:DomainValidationOptions[].ValidationStatus}'

# Sweep for certificates nearing expiry (the first command in an audit)
aws acm list-certificates \
  --includes keyTypes=RSA_2048,EC_prime256v1 \
  --query 'CertificateSummaryList[].{Domain:DomainName,Arn:CertificateArn}'
```

```
[ Where TLS termination happens - trust boundary by placement ]

(A) Edge termination
 Client ──HTTPS(ACM, us-east-1)──→ CloudFront ──HTTPS──→ ALB ──HTTP──→ EC2
                                                                  ↑ plaintext inside the VPC

(B) Regional termination + re-encryption
 Client ──HTTPS(ACM)──→ ALB ──HTTPS(private certificate)──→ EC2
                                    ↑ Private CA certificate installed on EC2

(C) Passthrough (the backend terminates directly)
 Client ──TLS──→ NLB (TCP passthrough) ──TLS──→ EC2
                    ↑ the LB cannot see the content = no WAF, no path routing

 If regulation requires "encryption on every leg," the final HTTP leg in (A) becomes a problem → go to (B).
```

ACM public certificate automatic renewal has one more condition. **The certificate must actually be attached (in use) to an AWS integrated service** for ACM to perform managed renewal. A certificate that was only issued and attached nowhere is not a renewal target, and in this case `RenewalEligibility` shows as not eligible. The two causes of "the certificate is in ACM, so why did it expire?" are (1) it is an imported certificate, and (2) it is not attached anywhere.

> 🎯 **Scenario**: When "ensure that automatic certificate renewal does not silently fail and outages due to expiry do not recur" comes up, use DNS validation (automatic renewal possible) + alarm on expiry-approaching via EventBridge/CloudWatch. An answer recommending Email validation runs against automation.

## Amazon Macie: Discovering and Classifying Sensitive Data in S3

Macie scans **data stored in S3 buckets** and detects and classifies sensitive data, such as PII (personally identifiable information), financial information (credit card numbers, bank accounts), credentials (AWS keys, private keys), and health information, through machine learning and pattern matching. It is the service that answers the question "is there a plaintext national ID number or card number somewhere in our S3?"

Macie does two things:

1. **Bucket inventory and security posture assessment**: *continuously* evaluates the encryption status, public exposure, and sharing status of every S3 bucket. It automatically surfaces "buckets that are public and unencrypted."
2. **Sensitive data discovery jobs**: actually scan object contents to identify the types and locations of sensitive data and generate **findings**.

```bash
aws macie2 create-classification-job \
  --job-type ONE_TIME \
  --name "pii-scan-prod-buckets" \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111122223333","buckets":["prod-uploads"]}]}'
```

Macie automates *data classification*. Traditional data governance has people label data as "public/internal/confidential/top secret," but at cloud scale (billions of objects) that is impossible. Macie mechanizes this labeling with managed data identifiers and **custom identifiers** based on regular expressions and keywords. Only when classification comes first does *risk-based protection* become possible, such as "SSE-KMS + Object Lock for confidential data, relaxed controls for public data." You cannot protect what you cannot see.

### Managed Identifiers vs Custom Identifiers

- **Managed data identifiers**: built-in detectors maintained by AWS - global PII types such as credit cards, US SSNs, passport numbers, and AWS secret keys.
- **Custom data identifiers**: define an organization-specific format (employee IDs, the format of the Korean resident registration number, internal account numbers, etc.) with a regular expression + keyword proximity + ignore words.

```bash
aws macie2 create-custom-data-identifier \
  --name "employee-id" \
  --regex "EMP-[0-9]{6}" \
  --keywords "employee" "employee ID" \
  --maximum-match-distance 50
```

As important as the regular expression in a custom identifier are **keyword proximity** and **ignore words**. A pattern alone such as `[0-9]{6}-[0-9]{7}` catches order numbers and arbitrary digit strings, and false positives pour in. If you match only when keywords such as "resident registration number" or "date of birth" appear together within a specified distance, and remove dummy values used in test data with ignore words, the signal-to-noise ratio rises greatly. **A detector with many false positives ends up being viewed by no one, which is the same as not having one**; accuracy management is operability.

### How to Read a Finding

The nature of the findings Macie produces splits just from the type name.

| Finding type | What it says | Response |
|--------------|-----------------|------|
| `Policy:IAMUser/S3BucketPublic` | The bucket became public | Apply BPA immediately, correct the policy |
| `Policy:IAMUser/S3BlockPublicAccessDisabled` | BPA was turned off | Restore the guardrail, trace who turned it off via CloudTrail |
| `Policy:IAMUser/S3BucketEncryptionDisabled` | Default encryption was turned off | Reset default encryption |
| `Policy:IAMUser/S3BucketSharedExternally` | Shared with an external account | Confirm whether the sharing is intended |
| `SensitiveData:S3Object/Personal` | Personal information found in an object | Re-examine storage location and retention period |
| `SensitiveData:S3Object/Financial` | Financial information such as card numbers/accounts found | Isolate payment data, consider tokenization |
| `SensitiveData:S3Object/Credentials` | Access keys/private keys found | **Rotate those credentials immediately** |

```json
{
  "type": "SensitiveData:S3Object/Credentials",
  "severity": { "description": "High" },
  "resourcesAffected": {
    "s3Bucket": { "name": "prod-uploads", "publicAccess": { "effectivePermission": "NOT_PUBLIC" } },
    "s3Object": { "key": "backups/config-dump.json", "size": 20480 }
  },
  "classificationDetails": {
    "result": {
      "sensitiveData": [
        { "category": "CREDENTIALS", "totalCount": 3,
          "detections": [{ "type": "AWS_CREDENTIALS", "count": 3 }] }
      ]
    }
  }
}
```

What this single finding says is clear. The bucket is not public (`NOT_PUBLIC`), but three AWS credentials are in plaintext inside a backup dump file. **The fact that the bucket is private does not remove the risk**, because every principal that can access that file effectively becomes a holder of those credentials. The response order is (1) immediately rotate and invalidate the exposed credentials, (2) remove or isolate the object, (3) trace why the pipeline that generated the dump included secrets, and (4) widen the detection scope to see whether the same pattern exists in other buckets.

The pattern in which credentials remain in backup dumps, configuration files, and container image layers and flow into S3 is surprisingly common in practice. Even after developers pull secrets out of code and move them to Secrets Manager, plaintext values often remain in configuration dumps that applications left for debugging or in CI artifacts. This is why day 1's secrets management and today's Macie are bundled into one week: **managing secrets well and verifying that they have not leaked somewhere are separate controls.** If you do only the former and skip the latter, only the belief "we manage secrets securely" remains while real exposure is left unattended.

### Operating While Controlling Cost

Macie is billed in proportion to the amount of data scanned, so indiscriminate full scans immediately become a cost problem. Set the operating order as follows.

```bash
# Step 1: automated sensitive data discovery - sample the whole estate and draw the map first
aws macie2 update-automated-discovery-configuration --status ENABLED

# Step 2: precisely scan only high-risk buckets with targeted jobs
aws macie2 create-classification-job \
  --job-type SCHEDULED \
  --schedule-frequency '{"weeklySchedule":{"dayOfWeek":"MONDAY"}}' \
  --name "weekly-pii-scan-prod" \
  --s3-job-definition '{
    "bucketDefinitions":[{"accountId":"111122223333","buckets":["prod-uploads"]}],
    "scoping":{"includes":{"and":[
      {"simpleScopeTerm":{"comparator":"STARTS_WITH","key":"OBJECT_KEY","values":["uploads/"]}}
    ]}}
  }'

# Step 3: query only high-severity findings and pass them to the response queue
aws macie2 list-findings \
  --finding-criteria '{"criterion":{"severity.description":{"eq":["High"]}}}'
```

Filtering by prefix, file extension, and object size with `scoping` is the key to cost control. Just removing objects such as images or videos, which cannot contain text PII, from the scan targets changes the cost significantly.

### Findings and Integration

Macie findings fall into two categories: **policy findings** (configuration violations such as a bucket turning public or encryption being disabled) and **sensitive data findings** (PII found in an object). These findings are **automatically emitted to EventBridge** and flow into Lambda automated remediation (for example, making a bucket private) or **Security Hub aggregation**.

> 🎯 **Scenario**: When "if sensitive data enters a public S3 bucket, detect it immediately and automatically make it private" comes up: Macie generates a sensitive data/policy finding → an EventBridge rule catches the finding → Lambda applies BPA and corrects the bucket policy. Macie alone only *detects*, and *response automation* is connected through EventBridge + Lambda (or Security Hub + automation).

```
[ Detection → response wiring ]

  Macie (sensitive data / policy findings)
        │
        ├──────────────→ Security Hub  ──→ multi-account aggregation, dashboard, severity normalization
        │
        └── EventBridge rule (severity=High && type=Policy:*S3BucketPublic)
                  │
                  ├─→ Lambda: PutPublicAccessBlock + bucket policy correction
                  ├─→ SNS: security team notification
                  └─→ Step Functions: actions needing an approval gate run after human confirmation

  * Apply automated remediation only to "reversible actions."
     Making a bucket private is reversible, but deleting an object is not → do not automate deletion.
```

The most important principle in designing automated remediation is to **automate only reversible actions**. Turning on BPA can be undone by reopening the policy even if it fires by mistake, but if an action that deletes objects or removes roles fires on a false positive, that itself becomes an incident. Route dangerous actions through a person via a Step Functions approval step or ticket creation.

### Macie in Multi-Account Environments

At organization scale, enabling Macie in each account and viewing results separately does not work. You designate a **delegated administrator** in Organizations to scan and aggregate S3 in all member accounts centrally. You can also configure Macie to be enabled automatically when a new account joins the organization. Because GuardDuty, Security Hub, and Config all use the same delegated administrator pattern, once you understand this structure it applies as is to many services.

```bash
# In the organization management account, designate the security account as the Macie delegated administrator
aws macie2 enable-organization-admin-account --admin-account-id 999988887777

# In the delegated administrator account: automatically enable new member accounts
aws macie2 update-organization-configuration --auto-enable
```

For Macie to scan an object, it must be able to decrypt that object. Objects with SSE-S3 or SSE-KMS (where the Macie service role has `kms:Decrypt` permission) are scanned, but **objects encrypted with SSE-C and objects encrypted on the client side cannot be read by Macie**, because the key is not with AWS. Compressed files and archives are looked into internally for supported formats, and unsupported formats are skipped. That is, the conclusion "we turned on Macie, so we know all the sensitive data in our S3" does not hold. Knowing what was not scanned (encryption method, file format, ranges excluded by scoping) is as important as reading the scan results.

Macie is **S3-only**. It cannot scan sensitive data inside RDS, DynamoDB, or EBS. If "detect PII inside a DB" comes up, Macie is the wrong answer. Also, because Macie samples and scans objects, **cost** is proportional to data volume: rather than indiscriminately scanning all buckets, target buckets likely to be sensitive and control cost with the automated discovery (sampling) feature.

## Viewing ACM and Macie Together

The two services take care of both ends of data protection. ACM makes the *channel through which data moves* (TLS) trustworthy, and Macie makes visible what is in *the place where data resides* (S3). In a comprehensive defense, you discover "there are card numbers here" with Macie → apply SSE-KMS, Object Lock, and BPA to that bucket → allow access only over ACM-based HTTPS → restrict the path with VPC endpoints. This is the integrated picture of secrets, storage, and sensitive data protection that all of week 6 draws, and we will weave it together in scenarios on day 5.

Macie's automated sensitive data discovery *continuously samples* the whole S3 estate and shows the distribution of sensitive data across the organization as a heat map; unlike one-time jobs it runs continuously and is cost-efficient. Meanwhile, in multi-account environments, you integrate Macie into Organizations as a **delegated administrator** to scan and aggregate S3 in all accounts centrally. It is the same multi-account pattern as GuardDuty and Security Hub.

> 🎯 **Scenario**: When "find out where and how much regulated personal information exists in S3 across multiple accounts, and automatically include newly created accounts" comes up, the combination is **Organizations + Macie delegated administrator + auto-enable + automated sensitive data discovery**. An answer that creates individual jobs per account has no scalability and is wrong, and Config rules cannot see object contents, so they cannot answer "what is in there?"

## 📌 Key Takeaways

ACM and Macie hold the opposite ends of data protection. **ACM automates trust in the channel the data passes through**: the key judgments are DNS validation (unattended renewal possible) versus Email and imported certificates (not possible), and the fork that comes from the constraint that the private key cannot be taken out: "Private CA for direct installation on EC2, public certificates for integrated services." **Macie creates visibility into where the data resides**: the key points are the boundary that it is limited to S3, the division of roles in which it only detects and response is connected through EventBridge and Lambda, and the operating principle that cost is controlled by scoping. You cannot protect what you cannot see, and you cannot safely move even protected data over an untrusted channel.

---

## 📝 Practice Questions

**Question 1.** You want to terminate TLS directly on an EC2 instance. You tried to install an ACM public certificate on EC2, but it is not possible. What is the most appropriate alternative?

A) Export the private key of the ACM public certificate and copy it to EC2  
B) Put an ALB in front of EC2 and terminate TLS at the ALB with an ACM certificate, or export a certificate issued by AWS Private CA and install it on EC2  
C) If you issue the certificate in us-east-1, it can be installed on EC2  
D) Deploy the certificate with Macie  

**Answer: B**  
Explanation: The private key of an ACM public certificate cannot be exported, so it cannot be installed directly on EC2. You deploy it to integrated services such as ALB/CloudFront/API Gateway, or, if you must terminate on EC2 directly, install a certificate issued by Private CA (which is exportable). A public certificate key cannot be exported regardless of which Region it is issued in, and Macie is unrelated to certificate deployment.

---

**Question 2.** Automatic certificate renewal silently fails, causing repeated outages from expiration. What is the most appropriate combination to prevent recurrence?

A) Switch to email validation and manually check at every renewal  
B) Use DNS validation to enable unattended automatic renewal, and alert on imminent expiration with EventBridge/CloudWatch DaysToExpiry  
C) Manually reissue the certificate every year  
D) Store the certificate in Secrets Manager  

**Answer: B**  
Explanation: With DNS validation, the CNAME record persists, so ACM can re-verify domain control unattended and renew automatically. In addition, alerting on imminent expiration and renewal failures with EventBridge events or the CloudWatch DaysToExpiry metric prevents silent failures. Email validation and manual reissuance run against automation, and Secrets Manager is unrelated to ACM renewal.

---

**Question 3.** You want to check "whether plaintext credit card numbers are stored somewhere in our production S3 buckets." What is an appropriate service?

A) Amazon Macie sensitive data discovery job  
B) AWS Config rule  
C) GuardDuty  
D) ACM  

**Answer: A**  
Explanation: Macie scans the contents of S3 objects, detects and classifies sensitive data such as credit card numbers using managed identifiers, and generates findings. AWS Config only evaluates resource configuration compliance and does not look at object contents, GuardDuty specializes in threat detection (anomalous behavior), and ACM is a certificate management service.

---

**Question 4.** You want to detect PII stored inside an RDS database. You tried to use Macie, but it is not appropriate. Why?

A) Macie is too expensive  
B) Macie is S3-only and cannot scan data inside RDS/DynamoDB/EBS  
C) Macie cannot detect PII  
D) Macie works only in us-east-1  

**Answer: B**  
Explanation: Macie's sensitive data discovery scope is limited to S3 objects. Data inside RDS, DynamoDB, and EBS is not a scan target, so it is inappropriate for "detecting PII inside a database." Macie's main function is PII detection, it operates in multiple Regions, and cost can be controlled with targeted scans, so these are not the key reason.

---

**Question 5.** When sensitive data is uploaded to a public S3 bucket, you want to detect it immediately and automatically make the bucket private. What is the correct architecture?

A) Macie detects and also performs automatic remediation on its own  
B) Macie generates a finding → an EventBridge rule catches it → Lambda applies BPA and corrects the bucket policy  
C) ACM monitors the bucket and remediates it  
D) S3 versioning automatically prevents public exposure  

**Answer: B**  
Explanation: Macie *detects* sensitive data and policy findings and emits them to EventBridge, while automatic *response* is wired up by having an EventBridge rule receive the finding and run Lambda to apply BPA and correct the policy. Macie alone does not remediate, ACM is a certificate service, and versioning is unrelated to blocking public exposure.

---
