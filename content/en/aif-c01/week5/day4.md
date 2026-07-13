# Day 4 - Data Governance and Compliance: Data Origin·Quality, Model Governance, Audit·Logging, Legal and Ethical Considerations for Generative AI

Yesterday we covered the technical defense of AI security (IAM, encryption, PII, PrivateLink). Today we add organizational management on top — **Data Governance and Compliance**. If security is "building walls," governance is "deciding who touches what and how, according to what rules, and then proving it."

AIF-C01 asks "how do you track, audit, follow regulations, and what legal and ethical problems does generative AI create?" Today we organize data origin and quality, model governance, CloudTrail-based audit and logging, and legal and ethical considerations unique to generative AI.

## Data Governance: Starting with Origin and Quality

Because AI is built from data, governance starts with data.

- **Data Lineage/Provenance**: Tracking where data came from and what transformations it went through. You must be able to answer "what data was this model trained on?" Unclear origin is a seed for copyright, bias, and regulatory violations.
- **Data Quality**: Accuracy, completeness, consistency, freshness. The ML axiom "garbage in, garbage out" is inviolable. Poor data quality creates biased and inaccurate models.
- **Data Classification**: Categorize data by sensitivity (public/internal/confidential/PII) and apply different protection and access rules per classification.

> 💡 **Related Theory**: Data governance directly connects to responsible AI. Training with data of unknown origin risks missing bias (fairness violation) or copyright violation. Low quality produces unreliable models. Good governance means "when problems arise later, we can trace the cause and assign responsibility."

## Model Governance: Managing a Model's Entire Lifecycle

Model governance applies control, documentation, and accountability systems across a model's **entire lifecycle** (development → validation → deployment → operation → retirement).

Core elements:

| Element | Meaning |
|------|------|
| Version Control | Record which model version deployed when |
| Model Documentation | Record training data, performance, limitations, intended use (model card) |
| Approval Process | Review and approval gate before deployment |
| Monitoring | Supervise performance and bias drift after deployment (Model Monitor) |
| Access Control | Manage who can modify and deploy models (IAM) |

AWS uses SageMaker Model Registry to manage model versions and approval status, and SageMaker Model Cards to document model information.

> 🔍 **Deeper Look**: Model governance connects to tools from earlier (Day 2). Clarify measures bias, Model Monitor watches for operational drift, Model Registry tracks versions — all are governance practice. "Governance" isn't abstract; it's weaving these tools into procedure.

## Audit and Logging: You Must Be Able to Prove Compliance

The core of compliance is "can we **prove** we followed the rules?" That foundation is audit logs.

- **AWS CloudTrail**: Records **every API call** in an AWS account. "Who, when, on what resource, did what action" — all captured. Trace who deployed a model, who accessed data.
- **Amazon CloudWatch**: Metrics, logs, and alerts-centric operational monitoring. Detects performance anomalies or threshold breaches and alerts.
- **AWS Config**: Track resource configuration changes and evaluate compliance with rules.

| Tool | Main Role | Core Question |
|------|--------|-----------|
| CloudTrail | API call audit log | "Who did what?" |
| CloudWatch | Metrics·logs·alerts | "Is it running well now?" |
| AWS Config | Configuration change tracking·compliance evaluation | "Does config match the rules?" |

> ⚠️ **Trap**: CloudTrail and CloudWatch are easily confused. **CloudTrail = "who did what" (audit·tracking)**, **CloudWatch = "how is the system behaving" (performance·metrics monitoring)**. In the exam, "we need audit trail of API calls for compliance" means CloudTrail.

Compliance frameworks (GDPR, HIPAA, SOC, ISO, etc.) vary by industry and region. AWS provides certifications and tools supporting them. At the AIF level, understanding that "auditability and traceability are core to compliance" is enough.

## Legal and Ethical Considerations for Generative AI

Generative AI raises new legal and ethical issues absent from traditional ML. Frequently appearing in exams:

- **Copyright and Intellectual Property**: Training data may contain copyrighted works, and copyright ownership of generated output is unclear.
- **Hallucination Leading to Misinformation**: Can plausibly fabricate falsehoods, raising liability questions.
- **Bias and Discrimination**: Generated output may be unfair or harmful to specific groups.
- **Privacy**: Personal information in training data may leak into output.
- **Deepfake and Misuse**: Fake images, audio, video can be weaponized for fraud, defamation.
- **Transparency Obligation**: Regulations increasingly require disclosing "AI generated content" to users.

> 📚 **Case Study**: A media company decided to use generative AI for article drafts. From a governance perspective, they ① clearly documented training and reference data origin to check copyright risk, ② used RAG on verified company documents for facts and had humans review (HITL) to prevent hallucination, ③ disclosed "AI-assisted writing" to maintain transparency, and ④ logged all generation and publication with CloudTrail for post-incident auditability. A case of building legal, ethical, and audit systems alongside technology adoption.

## Governance and Compliance: Quick Review

- **Data Governance**: Origin (lineage), quality, classification — "garbage in, garbage out."
- **Model Governance**: Versioning·documentation·approval·monitoring·access control — Model Registry/Cards.
- **Audit·Logging**: CloudTrail (who what), CloudWatch (how functioning), Config (config compliance).
- **Generative AI Legal·Ethics**: Copyright, hallucination, bias, privacy, deepfake, transparency disclosure.

## Summary

Today we organized the organizational management on top of security — governance and compliance. The core is "traceability and provability." Knowing data origin, documenting a model's entire life, and logging all actions with CloudTrail enables proving compliance. Generative AI adds new legal and ethical issues, so you must build legal and ethical systems alongside technology.

Tomorrow is comprehensive review of Week 5 — responsible AI principles, AWS tools, security, governance — wrapping everything into one big picture.

---

## 📝 Practice Questions

**문제 1.** "Which data was this model trained on, and what transformations did it go through?" You must be able to track this. What data governance concept does this describe?

A) Data Lineage/Provenance  
B) Data Compression  
C) Model Deployment Speed  
D) Network Bandwidth  

**정답: A**  
해설: Tracking where data came from and what processing it underwent is data lineage (provenance). This is core to post-incident tracing of copyright, bias, and regulatory violations. B·C·D are unrelated to data governance's origin-tracking concept.

---

**문제 2.** For compliance audit, you need "who, when, what resource, what action" API call history. What's the most appropriate AWS service?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS PrivateLink  
D) Amazon Comprehend  

**정답: B**  
해설: CloudTrail records all API calls, enabling "who did what" audit and traceability for compliance. A's CloudWatch is performance metrics monitoring, C is network path protection, D is NLP, none for audit logging.

---

**문제 3.** The best explanation of the CloudTrail and CloudWatch difference is?

A) CloudTrail tracks "who did what" (audit), CloudWatch tracks "how is the system functioning" (performance metrics)  
B) They're completely identical  
C) CloudTrail trains models, CloudWatch encrypts data  
D) CloudWatch exclusively does API call audit  

**정답: A**  
해설: CloudTrail is API audit and tracking, CloudWatch is metrics-based operational monitoring. B wrongly treats them as identical. C means neither service does those things. D is backwards — CloudTrail does audit.

---

**문제 4.** Which is least likely a legal·ethical consideration for generative AI adoption?

A) Copyright issues in training data  
B) Liability from hallucination-induced misinformation  
C) Deepfake misuse potential  
D) GPU physical heat dissipation specs  

**정답: D**  
해설: GPU heat specs are hardware specs unrelated to generative AI's legal and ethical concerns. A's copyright, B's hallucination liability, and C's deepfake misuse are all unique legal and ethical considerations for generative AI.

---

**문제 5.** Which is least clearly a model governance practice?

A) Manage model versions and approval status with SageMaker Model Registry  
B) Document training data, performance, limitations (model card)  
C) Monitor performance and bias drift after deployment with Model Monitor  
D) Grant unlimited model modification and deployment permissions to all employees  

**정답: D**  
해설: Model governance includes access control (IAM) limiting who can modify and deploy, so unlimited permissions directly violate governance. A's version management, B's documentation, and C's operational monitoring are all legitimate governance practices.

---
