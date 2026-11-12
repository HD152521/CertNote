# Day 4 - ACM and Macie: Certificate Lifecycle and Integration, Macie Sensitive Data (PII) Detection and Classification

In-transit encryption is supported by TLS certificates. And knowing where sensitive information hides in stored data is the starting point for data protection. Today we cover two services — **AWS Certificate Manager (ACM)** automates TLS certificate issuance, renewal, and deployment, and **Amazon Macie** detects and classifies sensitive information like PII in S3-stored data via machine learning. The former ensures *trust in the encryption channel*, the latter ensures *visibility of the data itself*.

## ACM: Automate Certificate Lifecycle

The classic disaster in TLS certificate operations is "certificate expiration forgotten, service goes down." ACM's core value is **managed renewal**, eliminating this risk.

There are two types of ACM certificates:
- **Public Certificate**: Issued free by ACM, public trust CA chain. For internet-facing endpoints.
- **Private Certificate**: Issued by **AWS Private CA** (paid), internal trust chain. For mTLS between internal services etc.

### Domain Validation: DNS vs Email

For public certificate issuance, you must prove domain ownership:
- **DNS Validation (recommended)**: ACM gives you a CNAME record; add it to your domain DNS, and ACM validates it and handles **automatic renewal without human intervention**. If using Route 53, one button applies the record.
- **Email Validation**: Click a link in an email sent to the domain registrant contact. Requires human action at each renewal, breaking automation.

> 💡 **Related Theory**: DNS validation is the key to renewal automation because the CNAME record *persists*. At renewal time, ACM re-validates its existence, proving domain control is maintained. Email validation is one-time proof requiring re-proof at each renewal. "Continuous proof of ownership" is what enables unattended renewal. PKI trust rests not just on key ownership but on *persistence of domain control*.

### Where ACM Certificates Can and Cannot Be Used

ACM public certificates can only be deployed **directly to AWS-integrated services** — private keys cannot be extracted:

| Can Use | Cannot Use Directly |
|---------|---------------------|
| Elastic Load Balancer (ALB/NLB) | EC2 instances directly |
| CloudFront | On-premises servers |
| API Gateway | Direct container installation |
| App Runner, Cognito, etc. | (Key extraction not possible) |

> ⚠️ **Pitfall**: "Install ACM public certificate directly on EC2 for TLS termination" is *wrong*. ACM public certificates cannot export private keys and cannot be installed on EC2. To terminate TLS on EC2, either (1) place an ALB in front and terminate TLS with an ACM certificate on the ALB, or (2) **export a certificate issued by Private CA** and install on EC2. If using CloudFront, the certificate **must be issued in us-east-1 (N. Virginia)** — a frequent exam point.

### Regional Characteristics and Renewal Failure Monitoring

ACM certificates are **regional resources** (except CloudFront, which is global in us-east-1). Since auto renewal can fail (DNS validation record deleted, lost domain control), **set up EventBridge to receive ACM expiration warnings** or **CloudWatch `DaysToExpiry` metric alarms**.

```bash
aws acm request-certificate \
  --domain-name example.com \
  --subject-alternative-names "*.example.com" \
  --validation-method DNS \
  --key-algorithm RSA_2048
```

> 🎯 **Scenario**: "Prevent certificate auto-renewal failure causing silent expiration downtime" → use DNS validation (enables auto renewal) + EventBridge/CloudWatch alarms for impending expiration. Recommending email validation contradicts automation.

## Amazon Macie: S3 Sensitive Data Discovery and Classification

Macie scans **data stored in S3 buckets** and uses machine learning and pattern matching to detect and classify sensitive data — PII (personally identifiable information), financial data (credit card numbers, bank accounts), credentials (AWS keys, private keys), medical information, etc. It answers "Does our S3 somewhere contain plaintext SSNs/card numbers?"

Macie performs two functions:

1. **Bucket Inventory and Security Posture Assessment**: Continuously evaluates all S3 bucket encryption status, public exposure, and sharing. Automatically flags "bucket that is both public and unencrypted."
2. **Sensitive Data Discovery Job**: Actually scans object contents, identifies sensitive data types and locations, and creates **findings**.

```bash
aws macie2 create-classification-job \
  --job-type ONE_TIME \
  --name "pii-scan-prod-buckets" \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111122223333","buckets":["prod-uploads"]}]}'
```

> 💡 **Related Theory**: Macie automates *data classification*. Traditional data governance has humans label data as "public/internal/confidential/secret," but at cloud scale (billions of objects) it's impossible. Macie mechanizes this labeling via managed data identifiers and **custom identifiers** (regex, keywords). Classification must precede "apply SSE-KMS+Object Lock to confidential data, relaxed controls for public data" — *risk-based protection*. What you cannot see, you cannot protect.

### Managed vs Custom Identifiers

- **Managed Data Identifiers**: AWS-maintained built-in detectors — credit cards, US SSNs, passport numbers, AWS secret keys, and other global PII types.
- **Custom Data Identifiers**: Organization-specific formats (employee IDs, Korean ID card number format, internal account numbers, etc.) defined via regex + keyword proximity + ignore words.

```bash
aws macie2 create-custom-data-identifier \
  --name "employee-id" \
  --regex "EMP-[0-9]{6}" \
  --keywords "employee" "employee ID" \
  --maximum-match-distance 50
```

### Findings and Integration

Macie findings are two categories — **policy findings** (bucket became public, encryption disabled, config violations) and **sensitive data findings** (PII discovered in objects). These findings **auto-emit to EventBridge**, flowing to Lambda auto-remediation (e.g., make bucket private) or **Security Hub aggregation**.

> 🎯 **Scenario**: "Detect sensitive data in public S3 bucket and auto-remediate to private" → Macie generates sensitive data/policy findings → EventBridge rule catches findings → Lambda applies BPA and fixes policy. Macie alone *detects*; auto-response is wired via EventBridge+Lambda (or Security Hub+automation).

> ⚠️ **Pitfall**: Macie is **S3-only**. Sensitive data inside RDS, DynamoDB, or EBS is not scanned. "Detect PII in DB" → Macie is wrong. Also, Macie samples and scans objects, so **cost scales with data volume** — rather than blindly scan entire buckets, target buckets likely to contain sensitive data and use automatic detection (sampling) to control cost.

## ACM and Macie Together

Both services bookend data protection. ACM makes the *channel where data moves* (TLS) trustworthy; Macie makes *where data rests* (S3) visible. For comprehensive defense: Macie detects "credit card numbers here" → apply SSE-KMS, Object Lock, BPA to that bucket → access only via ACM-based HTTPS → restrict path via VPC endpoint. This is the integrated picture of secret, storage, and sensitive data protection that week 6 draws, completed in day 5 via scenarios.

> 🔍 **Deeper Dive**: Macie's automated sensitive data discovery continuously *samples* the entire S3 asset base, showing the organization's sensitive data distribution as a heatmap — unlike one-off jobs, this runs persistently and cost-efficiently. In multi-account environments, integrate Macie as a **delegated administrator** to Organizations, scanning and aggregating S3 across all accounts from center. Same multi-account pattern as GuardDuty and Security Hub.

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
