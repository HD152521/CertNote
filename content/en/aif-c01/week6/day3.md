# Day 3 - Domain Review 3: Responsible AI + Security and Governance: Critical Summary

## 📌 Key Takeaways

- Domain 4 (Responsible AI) and Domain 5 (Security, Compliance, and Governance) are 14% each, together 28% of the scored questions.
- Responsible AI pursues fairness, explainability, transparency, robustness/safety, privacy, and governance. Bias mostly enters through data, and SageMaker Clarify measures and explains it.
- The risks of generative AI, namely hallucination, bias, and toxicity, are mitigated with RAG, bias measurement, and Amazon Bedrock Guardrails.
- Security rests on the **shared responsibility model** (data, permissions, and encryption settings are the customer's), IAM least privilege, and encryption.
- Governance controls the origin, access, and retention of data and proves it with records. The purpose and limits of AWS services are confirmed in AWS AI Service Cards.

## Core Principles of Responsible AI

The more powerful the technology, the more important "how to use it safely and responsibly" becomes. Most questions in this area call for a "correct value judgment," so it is more effective to grasp the context of "why should it be done this way" than to memorize. Responsible AI means every effort to make a model not only "accurate" but also "fair, safe, and transparent."

| Principle | Meaning |
|------|------|
| **Fairness** | Minimize discrimination and bias against particular groups |
| **Explainability** | Being able to explain why the model made a given decision |
| **Transparency** | Disclosing the system's limits, purpose, and data |
| **Robustness/Safety** | Operating safely under errors, misuse, and edge cases |
| **Privacy** | Protecting personal information |
| **Governance** | Accountable owners, procedures, and an audit framework |

These principles look abstract, but on the exam they appear as **concrete situations**. For example, "a loan-screening model repeatedly makes decisions unfavorable to a particular race" is a **fairness/bias** problem, and "we must explain to the customer why they were rejected" is an **explainability** problem.

Bias usually enters through "data." If past hiring data is skewed toward one gender, a model trained on it reproduces that discrimination as is, because a model is a mirror of its data. So securing fairness is "checking the data" before it is "fixing the algorithm." In AWS, **SageMaker Clarify** measures bias in training data and models and provides explanations of predictions (feature attribution), helping with fairness and explainability together.

## Hallucination, Bias, Toxicity: Risks of Generative AI and How to Mitigate Them

The risks specific to generative AI are also part of responsible AI.

- **Hallucination**: Plausibly making up content that is not true. Mitigations are **RAG** (supplying grounding documents), citing sources, and human review (human-in-the-loop).
- **Bias**: Discrimination in the training data is reflected in the output. Mitigations are diversifying data, measuring bias, and filtering.
- **Toxicity**: Inappropriate output such as hate or violence. Mitigations are content filtering and guardrails.

In AWS, **Guardrails for Amazon Bedrock** applies policies such as blocking harmful topics, masking sensitive information (PII), and suppressing hallucination, handling these risks in one place. The name in current documentation is **Amazon Bedrock Guardrails**, and it is the same feature. When the question says "we want to control the safety of generative AI output through policy," guardrails are the answer.

> 💡 **Related Theory**: The root reason hallucination occurs is that an LLM is not a "fact checker" but a "next-token probability predictor." The model only produces "plausible" sentences and does not weigh truth. That is why the most effective way to reduce hallucination is not to make the model bigger but to **supply the actual documents that ground the answer (RAG)**. If the grounding is in the prompt, the model answers from it without needing to make anything up.

The three risks have different causes, so the remedies differ too. One remedy does not solve the other risks.

| Risk | Cause | Right remedy | Wrong remedy |
|------|------|------|------|
| Hallucination | The model fills in what it does not know with probability | RAG, citing sources, contextual grounding checks, human review | Swapping in a bigger model, raising temperature |
| Bias | The training data is skewed | Diversify data, measure bias, evaluate per group | Only increasing the amount of data |
| Toxicity | The model can generate harmful expressions | Content filters, denied topics, word filters | RAG (even with grounding, the harmfulness of the wording is a separate matter) |
| Personal information exposure | There is PII in the input, reference documents, or training data | PII filters (block or mask), removing PII before training | Turning on only the content filter |

## Revisiting Domain 4 Through the Task Statements

Domain 4 of the exam guide has two tasks. Pulling out "what you should be able to say in one sentence" for each task gives the following.

| Task | Item named in the guide | In one sentence |
|------|------|------|
| 4.1 Developing responsible AI | Bias, fairness, inclusivity, robustness, safety, veracity | Results must be fair to groups, withstand abnormal input, do no harm, and be true to fact |
| 4.1 | Using tools to identify features (e.g., Amazon Bedrock Guardrails) | Filter the inputs and outputs of generative AI through policy |
| 4.1 | Responsible model selection (environment, sustainability) | A model far larger than the task needs wastes cost and energy |
| 4.1 | Legal risks of generative AI | Intellectual property infringement claims, biased output, loss of customer trust, end-user risk, hallucination |
| 4.1 | Characteristics of datasets | Inclusivity, diversity, curated sources, and balance are the conditions of a good dataset |
| 4.1 | Effects of bias and variance | High bias leads to underfitting and high variance to overfitting. Both lead to inaccuracy for some groups |
| 4.1 | Detecting and monitoring bias and trustworthiness | Label quality analysis, human audits, subgroup analysis |
| 4.2 Transparent and explainable models | The difference between such models and others | A simple model's decision process can be read; a complex model needs post-hoc explanation |
| 4.2 | Tools to check | SageMaker Model Cards, Amazon Bedrock model evaluation, open-source model, data, and license information |
| 4.2 | The trade-off between safety and transparency | Interpretability and performance are hard to maximize together |
| 4.2 | Human-centered design for explainable AI | Provide a user feedback mechanism and make the reason for a decision understandable to the person receiving it |

- The reason **open-source models, data, and licenses** are cited as transparency tools is that when a model's architecture, training data, and terms of use are public, they can be verified from outside.
- The classic trade-off question goes like this: "Which do you choose, a complex model with slightly higher performance or a simple model whose decision rationale can be read directly?" If the scenario has regulation, audit, or an explanation obligation, the simpler one is the answer.

## AWS Security Basics: The Shared Responsibility Model and IAM

The security domain applies the common AWS foundations as they are. The first thing that comes up is the **Shared Responsibility Model**.

- **AWS's responsibility ("of the cloud")**: Security of the physical infrastructure, hardware, and underlying services.
- **The customer's responsibility ("in the cloud")**: Data, access permissions (IAM), encryption settings, and application security.

In other words, "data protection and permission settings are ultimately the customer's part." On the exam, "Who is responsible for data encryption?" is almost always answered **the customer**.

The core of access control is **IAM (Identity and Access Management)**, and its principle is **least privilege**: grant only as much permission as is needed.

| Concept | One-line definition |
|------|-----------|
| **IAM** | Controls who can do what |
| **Least privilege** | Grant only the permissions that are strictly necessary |
| **Encryption (in transit/at rest)** | Protect data while it moves or is stored |
| **KMS** | Encryption key management service |

> 💡 **Related Theory**: The shared responsibility model matters because it makes clear that "using the cloud does not make security automatically complete." However sturdily AWS guards its data centers, if a customer leaves an S3 bucket public or grants permissions too broadly, data leaks. That is why the exam repeatedly asks about the boundary that "configuration, data, and permissions are the customer's responsibility."

Let us judge, one line at a time, statements that ask "whose responsibility is it?"

| Statement | Responsible party | Reason |
|------|------|------|
| Access control to the data center | AWS | The cloud itself |
| The hardware and underlying software of the servers that run models | AWS | The foundation of a managed service |
| Whether the S3 bucket holding training data is public | Customer | Configuration |
| Who can invoke Bedrock models | Customer | Access permissions |
| Which KMS key to encrypt with and who can decrypt | Customer | Encryption settings |
| Whether to put customer personal information into prompts | Customer | Data |
| Turning on Guardrails and setting its policies | Customer | Application security |
| A document proving our company complied with regulations | Customer | AWS Artifact gives only AWS's side of the reports |

## Revisiting Domain 5 Through the Task Statements

| Task | Item named in the guide | What to recall |
|------|------|------|
| 5.1 Securing AI systems | IAM roles, policies, and permissions; encryption; Amazon Macie; AWS PrivateLink; the shared responsibility model; Amazon Bedrock Guardrails; AgentCore Identity; Policy in AgentCore | Access → IAM / Content → encryption / Path → PrivateLink / Sensitive data in S3 → Macie / Inputs and outputs → Guardrails / An agent's identity and scope of action → AgentCore |
| 5.1 | Source citation and recording data origin | Data lineage, data catalogs, SageMaker Model Cards |
| 5.1 | Secure data engineering | Assessing data quality, privacy-enhancing technologies, access control, integrity |
| 5.1 | Security and privacy considerations | Prompt injection, encryption at rest and in transit, preventing data leakage, output filtering and validation, audit trails and logging of AI interactions, toxicity |
| 5.1 | Hallucination detection and grounding | RAG grounding, output validation, confidence scores |
| 5.2 Governance and compliance | AWS Config, Amazon Inspector, AWS Artifact, AWS CloudTrail, AWS Trusted Advisor | Configuration compliance / Vulnerability scanning / AWS's compliance reports / API activity records / Best-practice recommendations |
| 5.2 | Data governance strategies | Lifecycle, logging, residency, monitoring, observation, retention |
| 5.2 | Procedures for adhering to governance protocols | Policies, review cadence and strategies, frameworks such as the Generative AI Security Scoping Matrix, transparency standards, team training |

- The sense that separates 5.1 from 5.2 is this: 5.1 is "block it, protect it," and 5.2 is "record it, prove it, set the rules."

## Data Governance and Compliance

What is especially sensitive in generative AI is the **origin, ownership, and privacy of data**. Here are the key points.

- **Data privacy**: Personal information (PII) must be protected throughout collection, storage, and training. It can be masked with Bedrock guardrails or Comprehend PII detection.
- **Model training and data**: Prompts and data sent to an FM in Bedrock are not used to retrain the underlying model (customer data is separated). Model providers cannot access customers' prompts and responses. This is the core of trust.
- **Governance tools**: For tracking and auditing data, use logs (CloudTrail), data catalogs, and access policies.
- **Compliance**: You must set data processing and retention policies to match industry and regional regulations such as GDPR and HIPAA.

For transparency, AWS provides **AWS AI Service Cards** (documents that summarize a service's intended use, limits, and fairness considerations). When the question is "Where do I check the intended use and limits of an AWS AI service?", it is AI Service Cards. The document that records the purpose and evaluation results of a model we built is SageMaker Model Cards.

The essence of data governance is "controlling the life of data." It means deciding where it came from (origin), who can use it (access), how long it is kept (retention), and how it is disposed of (deletion). Generative AI uses enormous amounts of data for training and inference, so without governance the risk of copyright, privacy, and regulatory violations surges. That is why "powerful AI" must be paired with "strong governance."

## Telling Apart the "Record and Prove" Family of Services

Going by name alone, these all look like "monitoring." Each looks at a different target.

| Service | What it looks at | Question it answers |
|------|------|------|
| AWS CloudTrail | **API calls** made by people and services | Who did what and when |
| Amazon CloudWatch | System **metrics and logs** | Is it running well now, did it cross a threshold |
| AWS Config | The **configuration state** of resources | Do the settings comply with rules, when did they change |
| Amazon Inspector | **Software vulnerabilities** in workloads | Are there known vulnerabilities |
| AWS Trusted Advisor | **Best-practice adherence** across the account | Has anything departed from recommendations |
| AWS Artifact | **AWS's** compliance reports | Where do I get the certification documents AWS has received |
| Amazon Macie | **Sensitive data** in S3 | Where is personal information stored |
| SageMaker Model Monitor | The **quality of a deployed model** | Have the data or performance changed from training time |

- What CloudTrail records for a Bedrock call is "who invoked which model." To also keep the contents of prompts and responses, you must separately turn on Bedrock's model invocation logging (it is off by default).

## Five Principles for Solving Value-Judgment Questions

In the questions of these two domains, you can eliminate wrong answers by direction alone, even without knowing the service names.

| Principle | Phrasing on the correct side | Phrasing on the wrong side |
|------|------|------|
| Keep permissions narrow | "Only the necessary permissions," "limited to specific resources" | "To all users," "administrator permissions," "full access" |
| Keep records | "Enable logging," "audit trail" | "Delete logs," "disable recording" |
| Put a human on high-risk decisions | "A person reviews and approves" | "Fully automatic final decisions" |
| Measure and disclose | "Measure bias," "disclose limits," "disclose that it is AI" | "Hide the problem," "do not disclose" |
| Defend in layers | "Encrypt and also restrict permissions" | "Doing just one is enough" |

- If an option contains "unconditionally," "always," "all," or "automatically solves," it is usually wrong. In responsible AI and security there is no one-shot fix.

## Five Common Misconceptions

| Misconception | Reality |
|------|------|
| If you use a managed service, AWS handles all the security | Data, permissions, and configuration are still the customer's responsibility |
| Data sent to Bedrock is used to train the foundation model | It is not used to improve the foundation model and is not shared with the model provider |
| Turning on Guardrails eliminates hallucination | It only filters responses that stray from the grounding; the grounding itself must be supplied through RAG |
| CloudTrail exists, so prompt contents are recorded too | The contents are kept only when model invocation logging is turned on |
| Our own models are also recorded in AI Service Cards | That is a document AWS writes. Our own models are recorded in Model Cards |

In the next post, we raise our test-taking instincts by working through a **comprehensive mock exam (8 questions)** that checks the five areas organized this way all at once.

## 📖 Glossary

- **Toxicity**: Harmful content such as hate, violence, or insults showing up in the output.
- **Grounding**: Tying a model's response to actual supporting documents.
- **Inclusivity**: The quality of ensuring diverse user groups are not excluded.
- **Subgroup analysis**: A method of examining a model's performance and results by dividing into groups rather than looking only at the whole.
- **Interpretability**: The degree to which a person can directly read and understand a model's internal workings.
- **Least privilege**: The principle of granting only the permissions strictly necessary for the job.
- **Audit trail**: A flow of records that lets you trace back who did what and when.
- **Data residency**: Requirements about the region where data is physically stored.
- **Compliance**: Following laws, regulations, and internal rules, and demonstrating that you did.

---

## 📝 Practice Questions

**Question 1.** Loan review ML model makes repeated unfavorable decisions to specific demographic. Most related responsible AI principle?

A) Fairness  
B) Availability  
C) Scalability  
D) Cost Optimization  

**Answer: A**  
Explanation: Discriminatory decisions against groups are fairness core. Availability·Scalability·Cost Optimization are system-operations/architecture traits unrelated to decision ethics.

---

**Question 2.** Generative AI app wants to policy-apply harmful-topic blocking, PII masking, hallucination suppression to output. Most fitting AWS feature?

A) Amazon Polly  
B) Guardrails for Amazon Bedrock  
C) AWS KMS  
D) Amazon Forecast  

**Answer: B**  
Explanation: Guardrails for Amazon Bedrock policy-applies safety — harmful blocking, PII mask, hallucination suppression. Polly = voice synth, KMS = key management, Forecast = time-series — not output safety-policy.

---

**Question 3.** AWS shared responsibility: "in the cloud" data protection and access-permission setting responsibility?

A) AWS alone  
B) Customer  
C) ISP  
D) No one  

**Answer: B**  
Explanation: Shared responsibility: AWS handles "of cloud" infrastructure, customer handles "in cloud" data·access(IAM)·encryption config. Data protection and permissions are customer responsibility. ISP not a party.

---
