# Day 3 - Domain Review 3: Responsible AI + Security·Governance Critical Summary

Powerful technology demands "safe and responsible use." AIF-C01 is not simple technology exam but asks **Responsible AI** and **Security·Regulation·Governance** substantively. Combined, roughly 1/3 of exam weight. Today we reorganize these two areas primarily by document, fitting all critical exam concepts without gaps.

Most problems in this area require sound **value judgment**. Understanding "why we should do it this way" beats memorization.

## Responsible AI's Core Principles

Responsible AI means building models not just "accurate" but "fair, safe, transparent." AWS and the exam emphasize these core axes:

| Principle | Meaning |
|------|------|
| **Fairness** | Minimize discrimination and bias against specific groups |
| **Explainability** | Model decision-making is explainable |
| **Transparency** | System limitations, use cases, data publicly disclosed |
| **Robustness/Safety** | Safe operation under errors, exploits, exceptions |
| **Privacy** | Protect personal information |
| **Governance** | Responsibility parties, procedures, audit systems |

These sound abstract, but exams present them as **concrete situations**. Example: "loan review model makes unfairly repeated decisions against one race" is **fairness/bias** problem; "customer needs explanation for denial" is **explainability**.

> 💡 **Related Theory**: Bias usually enters through "data." If hiring history tilts toward one gender, models trained on it reproduce that discrimination. Model mirrors data. So fairness work is "fix algorithm" before "audit data." AWS provides **SageMaker Clarify** measuring training and model bias, showing explanation (feature contribution) — supports fairness and explainability together.

## Hallucination·Bias·Toxicity: Generative AI Risks and Mitigation

Generative AI's own hazards are part of responsible AI.

- **Hallucination**: Fabricate false content plausibly. Mitigation: **RAG** (provide evidence docs), cite sources, human review (human-in-the-loop).
- **Bias**: Training data discrimination reflects in output. Mitigation: diversify data, measure bias, filter.
- **Toxicity/Harm**: Inappropriate output like hate, violence. Mitigation: content filtering and guardrails.

AWS provides **Guardrails for Amazon Bedrock** applying policy-based harmful-topic blocking, PII masking, hallucination suppression — handles these risks in one go. "Policy-control generative AI output safety" → guardrails is the answer.

> 💡 **Related Theory**: Hallucination's root: LLM is "next-token probability predictor," not "fact checker." Model makes "plausible" sentences without verifying truth. So hallucination reduction most effectively comes not from bigger models but **showing real evidence docs (RAG)**. Model then answers within that evidence instead of fabricating.

## AWS Security Fundamentals: Shared Responsibility and IAM

AWS Security's first step is **Shared Responsibility Model**.

- **AWS responsibility ("of the cloud")**: Physical infrastructure, hardware, foundational service security.
- **Customer responsibility ("in the cloud")**: Data, access permissions (IAM), encryption setup, app security.

So "data protection and permission-setting ultimately fall on customers." Test asks "who's data-encrypt responsible?" — nearly always **customer**.

Access control's core is **IAM (Identity and Access Management)** with **least privilege** principle. Grant only-necessary permissions.

| Concept | One-Line |
|------|-----------|
| **IAM** | Control who can do what |
| **Least Privilege** | Grant only necessary permissions |
| **Encryption(transit/storage)** | Protect data moving/stored |
| **KMS** | Encrypt key management service |

> 💡 **Related Theory**: Shared Responsibility importance: "Using cloud doesn't auto-complete security." However fortified AWS data centers, if customer leaves S3 public or over-grants permissions, data leaks. So "config, data, permissions are customer responsibility" gets repeatedly tested.

## Data Governance and Compliance

**Data's origin, ownership, privacy** — especially sensitive for generative AI. Core points:

- **Data Privacy**: Protect personal info (PII) throughout collection·storage·training. Mask with Bedrock guardrails or Comprehend PII detection.
- **Model Training and Data**: Prompts/data sent to Bedrock FM aren't reused retraining the base model (customer data separated). Trust foundation.
- **Governance Tools**: Logs (CloudTrail), data catalog, access policies track and audit data.
- **Compliance**: Align data handling·storage policy to industry·region rules (GDPR, HIPAA, etc.).

Transparency: Model providers publish **AWS AI Service Cards** (documentation organizing service use cases, limitations, fairness considerations). "Where to verify model use cases and limits?" → AI Service Cards.

> 💡 **Related Theory**: Data governance's essence is "controlling data's lifecycle." Where it came from (source), who can use (access), how long kept (retention), how deleted (deletion). Generative AI uses massive data volumes, so governance-less means copyright/privacy/regulation-violation risks explode. "Strong AI" pairs with "strong governance."

## Summary

Today organized the value-judgment area. First, **responsible AI** pursues fairness, explainability, transparency, safety, privacy, governance; bias mostly enters through data; SageMaker Clarify measures and explains. Second, **hallucination·bias·toxicity** mitigated via RAG, bias measurement, Guardrails for Bedrock. Third, security is **shared responsibility** (data/permissions customer-owned) and **IAM least privilege**, encryption; governance is data lifecycle control with **AI Service Cards** transparency.

Next text spot-checks all five domains with **comprehensive mock questions (8 items)**, raising practical pace.

---

## 📝 Practice Questions

**문제 1.** Loan review ML model makes repeated unfavorable decisions to specific demographic. Most related responsible AI principle?

A) Fairness  
B) Availability  
C) Scalability  
D) Cost Optimization  

**정답: A**  
해설: Discriminatory decisions against groups are fairness core. Availability·Scalability·Cost Optimization are system-operations/architecture traits unrelated to decision ethics.

---

**문제 2.** Generative AI app wants to policy-apply harmful-topic blocking, PII masking, hallucination suppression to output. Most fitting AWS feature?

A) Amazon Polly  
B) Guardrails for Amazon Bedrock  
C) AWS KMS  
D) Amazon Forecast  

**정답: B**  
해설: Guardrails for Amazon Bedrock policy-applies safety — harmful blocking, PII mask, hallucination suppression. Polly = voice synth, KMS = key management, Forecast = time-series — not output safety-policy.

---

**문제 3.** AWS shared responsibility: "in the cloud" data protection and access-permission setting responsibility?

A) AWS alone  
B) Customer  
C) ISP  
D) No one  

**정답: B**  
해설: Shared responsibility: AWS handles "of cloud" infrastructure, customer handles "in cloud" data·access(IAM)·encryption config. Data protection and permissions are customer responsibility. ISP not a party.

---
