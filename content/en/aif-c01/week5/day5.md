# Day 5 - Week 5 Comprehensive Review: Binding Responsible AI·Security·Governance into One

This week we navigated the grown-up question of "how do we make AI responsible and operate it?" Monday was responsible AI principles (fairness·bias·transparency·explainability·robustness·privacy), Tuesday was AWS tools implementing them (Clarify·Model Monitor·Guardrails·AI Service Cards), Wednesday was technical defense (IAM·encryption·PII·PrivateLink·shared responsibility), and Thursday was organizational management (data·model governance·audit·generative AI legal·ethics).

Today we bind these four pieces into one big picture. The exam asks "what principle/tool/defense suits this scenario?" by weaving them together, so grasping connections between concepts is key. Rather than new content, the core is re-threading concepts and organizing frequently appearing mappings and traps.

## Week 5 in One Page

```
[Day1] Principles (what must we uphold)
        Fairness·Bias / Transparency·Explainability / Robustness·Privacy / Safety·HITL
          │  (how do we implement these principles with AWS?)
          ▼
[Day2] Responsible AI Tools (Principle → AWS Implementation)
        Clarify(bias+explanation) / Model Monitor(operational monitoring)
        Guardrails(safety+PII) / AI Service Cards(transparency)
          │  (technical defense forms the foundation of trust)
          ▼
[Day3] Security (Technical Defense)
        Shared Responsibility Model / IAM Least Privilege / Encryption(at-rest·in-transit)
        PII Protection(Macie·Comprehend) / PrivateLink
          │  (management·tracking·proof sits atop defense)
          ▼
[Day4] Governance·Compliance (Management·Tracking·Proof)
        Data(origin·quality) / Model(versioning·documentation·approval)
        Audit(CloudTrail·CloudWatch·Config) / Generative AI Legal·Ethics
```

Remembering this one flow accounts for 80% of Week 5 review. "Principles → tools → security → governance" progressively concretizes and organizes.

## Core Terms: Quick Organization

| Term | One-Line Definition |
|------|-----------|
| Fairness | No discrimination against specific groups |
| Bias | Prejudice in data/models (source of unfairness) |
| Transparency | System use cases·limitations publicly disclosed |
| Explainability | Why this output was generated, explained |
| Robustness | Stable even with abnormal input·attack |
| Privacy | Personal information (PII) protected |
| Human-in-the-Loop | Human review for high-stakes decisions |
| SageMaker Clarify | Bias measurement + explainability |
| Model Monitor | Post-deployment drift·quality monitoring |
| Bedrock Guardrails | Harmful content·PII·topic restrictions |
| AI Service Cards | AWS AI service transparency documents |
| Shared Responsibility Model | AWS=infrastructure, customer=data·access |
| IAM Least Privilege | Grant only necessary permissions |
| KMS | Encryption key management (at-rest encryption) |
| Macie | S3 stored data PII auto-detection |
| Comprehend(PII) | Text PII detection·masking |
| PrivateLink | Private connection without internet |
| Data Lineage | Data source·transformation tracking |
| CloudTrail | API call audit log |

> 💡 **Related Theory**: Remember these terms as "principle → AWS means" pairs. Fairness/bias→Clarify, safety·privacy→Guardrails, transparency→AI Service Cards, access→IAM, data protection→KMS·Macie·Comprehend, path→PrivateLink, proof→CloudTrail.

## Frequently Appearing Comparisons: Organized

**Transparency vs Explainability**: Transparency is "what is this system" disclosed, Explainability is "why was this decision made" explained. Former connects to AI Service Cards, latter to Clarify.

**Clarify vs Model Monitor**: Clarify measures bias·explanation (mainly pre- and post-training), Model Monitor supervises post-deployment drift·quality. They're linked so bias drift is also monitored.

**CloudTrail vs CloudWatch**: CloudTrail="who did what" (audit·tracking), CloudWatch="how is the system functioning" (performance·metrics).

**Encryption vs PrivateLink**: Encryption protects content (at-rest·in-transit), PrivateLink protects path (avoids internet). Different defensive layers.

**Macie vs Comprehend PII**: Macie detects PII in S3 stored data, Comprehend identifies PII in text·masks it.

> ⚠️ **Trap**: Most-confusing exam items. ① "Bias = bad intent" is false (usually unintentional, enters via data). ② "More data erases bias" is false (if skewed, stays skewed). ③ "Model Monitor auto-fixes" is false (detects and alerts only). ④ "Data access control responsibility is AWS's" under shared responsibility is false (customer responsibility). ⑤ "Transparency and explainability are the same" is false.

## AWS Service Mapping (Frequently Tested in AIF)

| Need | AWS Service/Feature |
|------|-----------------|
| Data·model bias measurement + decision explanation | SageMaker Clarify |
| Deployed model quality·drift monitoring | SageMaker Model Monitor |
| Generative AI harmful content·PII·topic restriction | Bedrock Guardrails |
| AI service use cases·limitations transparency document | AI Service Cards |
| Minimize access permissions | IAM(Least Privilege) |
| Stored data encryption key management | AWS KMS |
| S3 PII auto-detection | Amazon Macie |
| Text PII detection·masking | Amazon Comprehend |
| Private connection without internet | AWS PrivateLink |
| API call audit log | AWS CloudTrail |
| Model version·approval management | SageMaker Model Registry |

> 🔍 **Deeper Look**: Exam scenarios ask "problem situation → suitable means." "Bias check"→Clarify, "post-deployment performance drop detection"→Model Monitor, "output profanity·personal information block"→Guardrails, "audit who deployed model"→CloudTrail, "data doesn't go the internet"→PrivateLink. Memorizing keyword-service pairs cracking variations too.

## Self-Check (Answer Mentally)

1. Relationship between fairness and bias in one sentence?
2. Difference between transparency and explainability?
3. Two common misunderstandings about bias?
4. Role difference between Clarify and Model Monitor?
5. Three things customers are responsible for in shared responsibility?
6. Why is IAM least privilege important?
7. At-rest and in-transit encryption means, respectively?
8. Where Macie and Comprehend PII apply differently?
9. What problem does PrivateLink solve?
10. Difference between CloudTrail and CloudWatch?
11. Three legal·ethical issues for generative AI?
12. What safety mechanism bolsters high-stakes decisions?

If items stall, return to that day's text. If answers flow smoothly, Week 5 passes.

> 📚 **Case Study**: A fintech responsibly launched a generative AI loan consultation service. ① Checked training data origin and quality, masked PII with Comprehend (governance+privacy), ② measured specific-group bias with Clarify·mitigated (fairness), ③ protected data with IAM least privilege and KMS encryption, PrivateLink (security), ④ Bedrock Guardrails blocked inappropriate investment/financial advice and PII from output (safety), ⑤ high-stakes loan denials reviewed by humans (HITL) with explanation (explainability), ⑥ logged all operations with CloudTrail and supervised with Model Monitor (governance·audit). All Week 5 pieces fit in one system.

## Summary — and Next

Week 5 we circled "how to make AI responsible and secure." Core is three sentences: **Responsible AI implements fairness·transparency·explainability·privacy etc. principles via SageMaker Clarify·Model Monitor·Bedrock Guardrails·AI Service Cards, defends technically with IAM·encryption·PII protection·PrivateLink, and proves compliance through data·model governance and CloudTrail audit.** Foundation of everything: "customers are responsible for security IN the cloud" under the shared responsibility model.

This one-page picture becomes your compass when meeting scenario problems in the exam, rapidly pinpointing "which principle, which tool?"

---

## 📝 Practice Questions

**문제 1.** Integrating Week 5's flow, which connects "principle → AWS implementation tool" correctly?

A) Transparency - SageMaker Clarify  
B) Bias·Explainability - SageMaker Clarify  
C) Safety·PII Protection - AWS CloudTrail  
D) Operational Monitoring - AI Service Cards  

**정답: B**  
해설: SageMaker Clarify implements both bias measurement and explainability. A pairs transparency with AI Service Cards correctly, C pairs safety·PII with Bedrock Guardrails, D pairs operational monitoring with Model Monitor, so all other pairs are mismatched.

---

**문제 2.** Which is hardest to call "customer responsibility" under the shared responsibility model?

A) Set data access permissions with IAM  
B) Classify data and decide encryption policy  
C) Operate the physical security of AWS data centers  
D) Configure VPC network  

**정답: C**  
해설: Data center physical security is "cloud's own security" and AWS responsibility. A, B, D are all "security IN the cloud" — customer responsibility areas.

---

**문제 3.** A team wants to detect deployed model performance drop over time and simultaneously watch if bias increases (bias drift). Most appropriate combination?

A) AI Service Cards alone  
B) SageMaker Model Monitor(+ Clarify integration)  
C) AWS PrivateLink alone  
D) Amazon Macie alone  

**정답: B**  
해설: Model Monitor supervises post-deployment data·model quality drift and, integrated with Clarify, can watch bias drift too. A is transparency docs, C is network path protection, D is S3 PII detection — none do post-deployment model monitoring.

---

**문제 4.** Which of these traps is correct (true)?

A) Sufficient data automatically erases bias  
B) Model Monitor auto-retrains and redeploys when problems are found  
C) CloudTrail records "who did what" audit logs, CloudWatch monitors performance·metrics  
D) Under shared responsibility, customer data access control is AWS responsibility  

**정답: C**  
해설: CloudTrail is API call audit, CloudWatch is performance·metrics monitoring — correct distinction. A is false (skewed data stays skewed), B is false (Monitor alerts only, humans decide), D is false (access control is customer responsibility).

---

**문제 5.** A company wants to responsibly launch a generative AI service. Least appropriate measure?

A) Block harmful content and PII from output with Bedrock Guardrails  
B) High-stakes decisions reviewed by humans (HITL)  
C) Log all operations with CloudTrail for post-incident audit capability  
D) Grant all employees unlimited model and data access permissions  

**정답: D**  
해설: Unlimited access permission violates IAM least privilege and governance directly. A's Guardrails, B's HITL, C's CloudTrail audit logging are all correct responsible AI·security·governance practices.

---
