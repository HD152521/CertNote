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
  --keywords "employee" "사번" \
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

## 📝 연습 문제

**문제 1.** EC2 인스턴스에서 직접 TLS를 종단하려 한다. ACM 퍼블릭 인증서를 EC2에 설치하려 했으나 불가능하다. 가장 적절한 대안은?

A) ACM 퍼블릭 인증서의 개인키를 export해 EC2에 복사한다  
B) ALB를 EC2 앞에 두고 ALB에서 ACM 인증서로 TLS를 종단하거나, AWS Private CA에서 발급한 인증서를 export해 EC2에 설치한다  
C) 인증서를 us-east-1에서 발급하면 EC2에 설치된다  
D) Macie로 인증서를 배포한다  

**정답: B**  
해설: ACM 퍼블릭 인증서는 개인키를 내보낼 수 없어 EC2에 직접 설치할 수 없다. 통합 서비스인 ALB/CloudFront/API Gateway에 배포하거나, EC2에서 직접 종단해야 한다면 Private CA가 발급한(export 가능한) 인증서를 설치한다. 퍼블릭 인증서 키는 어떤 리전에서 발급해도 export 불가이며, Macie는 인증서 배포와 무관하다.

---

**문제 2.** 인증서 자동 갱신이 조용히 실패해 만료로 인한 장애가 반복된다. 재발 방지에 가장 적절한 조합은?

A) Email 검증으로 전환하고 갱신마다 수동 확인  
B) DNS 검증을 사용해 무인 자동 갱신을 가능하게 하고, EventBridge/CloudWatch DaysToExpiry로 만료 임박을 경보한다  
C) 인증서를 매년 수동 재발급  
D) 인증서를 Secrets Manager에 저장  

**정답: B**  
해설: DNS 검증은 CNAME 레코드가 지속 존재하므로 ACM이 무인으로 도메인 통제를 재확인해 자동 갱신할 수 있다. 추가로 EventBridge 이벤트나 CloudWatch DaysToExpiry 메트릭으로 만료 임박·갱신 실패를 경보하면 조용한 실패를 막는다. Email 검증·수동 재발급은 자동화에 역행하고, Secrets Manager는 ACM 갱신과 무관하다.

---

**문제 3.** "우리 프로덕션 S3 버킷 어딘가에 평문 신용카드 번호가 저장되어 있는지" 확인하려 한다. 적절한 서비스는?

A) Amazon Macie의 민감 데이터 탐지 작업  
B) AWS Config 규칙  
C) GuardDuty  
D) ACM  

**정답: A**  
해설: Macie는 S3 객체 내용을 스캔해 신용카드 번호 등 민감 데이터를 관리형 식별자로 탐지·분류하고 finding을 생성한다. AWS Config는 리소스 구성 준수를 평가할 뿐 객체 내용을 보지 않고, GuardDuty는 위협 탐지(이상 행위)에 특화되며, ACM은 인증서 관리 서비스다.

---

**문제 4.** RDS 데이터베이스 안에 저장된 PII를 탐지하려 한다. Macie를 쓰려 했으나 적절치 않다. 그 이유는?

A) Macie는 비용이 너무 비싸서  
B) Macie는 S3 전용이며 RDS/DynamoDB/EBS 내부 데이터는 스캔하지 못하기 때문  
C) Macie는 PII를 탐지하지 못하기 때문  
D) Macie는 us-east-1에서만 동작하기 때문  

**정답: B**  
해설: Macie의 민감 데이터 탐지 범위는 S3 객체로 한정된다. RDS·DynamoDB·EBS 안의 데이터는 스캔 대상이 아니므로 "DB 내부 PII 탐지"에는 부적절하다. Macie는 PII 탐지가 주 기능이고 여러 리전에서 동작하며, 비용은 표적 스캔으로 통제할 수 있어 핵심 이유가 아니다.

---

**문제 5.** 민감 데이터가 공개 S3 버킷에 업로드되면 즉시 탐지하고 자동으로 비공개 처리하려 한다. 올바른 아키텍처는?

A) Macie가 단독으로 탐지하고 자동 교정까지 수행한다  
B) Macie가 finding 생성 → EventBridge 규칙이 캐치 → Lambda가 BPA 적용·버킷 정책 교정  
C) ACM이 버킷을 모니터링하고 교정한다  
D) S3 버전 관리가 자동으로 공개를 막는다  

**정답: B**  
해설: Macie는 민감 데이터·정책 finding을 *탐지*하고 EventBridge로 송출하는 역할이며, 자동 *대응*은 EventBridge 규칙이 finding을 받아 Lambda로 BPA 적용·정책 교정을 실행하는 식으로 연결한다. Macie 단독은 교정하지 않고, ACM은 인증서 서비스, 버전 관리는 공개 차단과 무관하다.

---
