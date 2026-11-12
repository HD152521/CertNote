# Day 5 - Week 9 Synthesis: Security and Governance Review

This week covered four pillars of data security and governance — access control, encryption, sensitive-data protection, governance. Today we weave them into one end-to-end scenario.

## 1. Access Control (Day 1)

- **IAM**: Broad permissions. Logic: explicit Deny > Allow > implicit deny. Least privilege.
- **Lake Formation**: Catalog-level fine-grained. Data access requires **both IAM + LF perms**.
- **Granularity**: Column GRANT / row data filter / cell (combo).
- **TBAC (LF-Tags)**: Large-scale permissions as tag expressions.
- **Cross-account**: Align trust policy + permission policy + (if encrypted) KMS key policy.

> 💡 **Related Theory**: IAM = "can call API?", Lake Formation = "can see this data?" AND relationship.

## 2. Encryption (Day 2)

- **At rest**: SSE-S3 (no control) / SSE-KMS (policy/audit/bucket key) / SSE-C (customer key) / client-side (AWS sees no plaintext).
- **In transit**: TLS, deny `aws:SecureTransport: false`, Redshift `require_ssl`.
- **Envelope**: KMS key → data key → data.
- **Key policy**: Central to KMS access. Cross-account/service roles allowed here.
- **S3 Bucket Key** cuts KMS call costs.

## 3. Sensitive Data Protection (Day 3)

- **Macie**: S3 PII auto-detect/classify. Findings to EventBridge/Hub. No direct masking.
- **Masking** (hide, irreversible) vs **Tokenization** (reversible, vault mapping).
- **Redshift DDM**: Role-based column visibility.
- **Lake Formation data filter**: Exclude sensitive columns/rows entirely.
- **Regulation mapping**: GDPR delete (Iceberg DELETE), PCI (tokenization), detect (Macie), audit (CloudTrail).

## 4. Data Governance (Day 4)

- **Glue Data Catalog**: Shared engine metadata. Crawlers auto-register.
- **Lineage**: Impact/root-cause analysis, audit. Source→ETL→target→BI.
- **Sharing**: Data Exchange (transfer) vs Clean Rooms (orig-hidden collab). LF cross-account, Redshift datashare.
- **Audit**: CloudTrail management (default) vs data events (S3 objects, optional/billable).

> 💡 **Related Theory**: Governance cycles "find (catalog) → trust (lineage) → collab (sharing) → track (audit)." Single-pillar gaps risk compliance, trust loss.

## Integrated Scenario: Regulated Customer Payment Platform

Requirements: Load payment data to lake, detect/protect PII, give analysts masked data only, partner collab without original exposure, audit all access, support GDPR deletion.

```text
[Payment source] --Glue ETL(KMS encrypt, tokenize)--> s3://lake-clean/payments/ (Iceberg)
   --Macie scan--> [PII found] --EventBridge--> [Lambda: isolate/alert]
   --Lake Formation(data filter, TBAC)--> [Analyst: masked view]
   --Clean Rooms--> [Partner: agreed-aggregate only]
   All activity --> CloudTrail(data events) --> audit
```

Design decisions:
1. **Encryption**: S3 SSE-KMS (customer-managed + Bucket Key), transit TLS forced. Card# **tokenized** in ETL.
2. **Detection**: Macie auto-discovery finds PII, EventBridge→Lambda auto-isolates.
3. **Access**: Lake Formation **TBAC** manages perms, **data filter** excludes PII columns + region rows to analysts.
4. **Sharing**: Partner via **Clean Rooms**, orig-hidden collab.
5. **Audit/compliance**: CloudTrail **data events** track object access, GDPR delete via **Iceberg DELETE**.

```sql
-- GDPR deletion (Iceberg on Athena)
DELETE FROM lake_clean.payments WHERE customer_id = 'GDPR-REQ-2026-042';
```

```json
// Analyst data filter: exclude PII + region limit
{
  "Name": "analyst_payments_filter",
  "ColumnNames": ["txn_id", "region", "amount_token", "dt"],
  "RowFilter": { "FilterExpression": "region = 'ap-northeast-2'" }
}
```

> 💡 **Related Theory**: Security/governance = layered defense. Encryption (confidentiality) + access control (authorization) + detection (visibility) + audit (accountability) together meet regulation and trust.

## Exam Points Summary

- IAM and Lake Formation = AND (both pass = access).
- SSE types, envelope, key policy, in-transit TLS enforcement.
- Macie detects, masking/tokenization/data filter minimize exposure.
- Data Exchange (transfer) vs Clean Rooms (no-exposure collab).
- Audit via CloudTrail, object-level needs data-events (billable) enable.

## 📝 Practice Questions

**Question 1.** On a payment data platform, you want analysts to see card numbers as tokens, expose only the rows for their own region, and have permissions applied automatically even when new tables are added. Which combination is the most appropriate?

A) IAM wildcard policy + SSE-S3  
B) S3 bucket policy + client-side encryption  
C) Lake Formation TBAC + data filter + ETL tokenization  
D) Redshift snapshot sharing + partition projection  

**Answer: C**  
Explanation: With TBAC, permissions are applied automatically to a new table as long as its tags match, a data filter restricts columns and rows, and ETL tokenization hides the original card numbers. Wildcards violate least privilege, bucket policies are weak in granularity, and snapshot sharing is unrelated to the requirements.

---

**Question 2.** A security team must prove "which IAM role read a specific object in the payment bucket last month." What setup is required?

A) Enable CloudTrail data events (S3 object-level)  
B) Add a Macie custom identifier  
C) Automatic KMS key rotation  
D) Apply Lake Formation TBAC  

**Answer: A**  
Explanation: Tracking S3 object reads is recorded in CloudTrail data events, which are disabled by default and must be explicitly enabled. Macie is detection, key rotation is encryption hygiene, and TBAC is access control; none of them generates object access audit logs.

---

**Question 3.** You must jointly analyze campaign effectiveness with an external partner without exposing either company's raw customer data. At the same time, you provide in-house analysts with data excluding PII. Which combination of services is correct?

A) Data Exchange for the partner, IAM wildcard for analysts  
B) S3 cross-account bucket sharing for both  
C) Redshift datashare for both  
D) Clean Rooms for the partner, Lake Formation data filter for analysts  

**Answer: D**  
Explanation: Clean Rooms is correct for joint analysis without exposing raw data, and a Lake Formation data filter is correct for providing in-house data excluding PII. Data Exchange, bucket sharing, and datashare hand the raw data over to the other party, which violates the partner requirement.

---

**Question 4.** An ETL job reading a large number of objects from a payment bucket encrypted with SSE-KMS is suffering KMS throttling and a cost spike. Plaintext HTTP access must also be blocked at the same time. Which combination of actions is the most appropriate?

A) Switch to SSE-S3 + versioning  
B) Enable S3 Bucket Key + deny `aws:SecureTransport: false`  
C) Client-side encryption + Glacier transition  
D) Rotate the KMS key daily + Object Lock  

**Answer: B**  
Explanation: A Bucket Key reduces per-object KMS calls, easing cost and throttling, and the SecureTransport deny blocks plaintext HTTP. Switching to SSE-S3 loses key control, client-side encryption and Glacier burden the ETL, and daily rotation and Object Lock are unrelated to the problem.

---

**Question 5.** Which option most accurately describes "defense in depth" in data security and governance?

A) If encryption alone is strong enough, other controls are unnecessary  
B) With access control alone, auditing is not needed  
C) Encryption, access control, detection, and auditing must work together to meet regulatory and trust requirements  
D) All controls can be replaced by IAM alone  

**Answer: C**  
Explanation: Security and governance are a defense in depth that combines confidentiality (encryption), authorization (access control), visibility (detection), and accountability (auditing), and no single one can replace the rest. A, B, and D contain the false premise that a single control is sufficient.

---
