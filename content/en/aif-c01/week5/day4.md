# Day 4 - Data Governance and Compliance: Data Provenance and Quality, Model Governance, Auditing and Logging, Legal and Ethical Considerations of Generative AI

## 📌 Key Takeaways

- Governance is "deciding who handles what under which rules, and **proving** it." The keywords are traceability and provability.
- **Data governance** starts with provenance (lineage), quality, and classification. Data of unknown origin is a seed of copyright, bias, and regulatory violations.
- **Model governance** manages a model's whole life through versioning, documentation, approval, monitoring, and access control (Model Registry, Model Cards).
- **CloudTrail** = who did what (auditing), **CloudWatch** = how the system behaves (metrics and alarms), **AWS Config** = whether configuration complies with rules (configuration compliance).
- Generative AI adds new legal and ethical issues: copyright, hallucination, bias, privacy, deepfakes, and transparency disclosure.

## Data Governance: Starting with Provenance and Quality

Yesterday we looked at the technical defenses of AI security (IAM, encryption, PII, PrivateLink). Today is the organizational management layered on top of them. If security is "building walls," governance is setting rules and proving they were followed. Because AI is made from data, the starting point of governance is data too.

- **Data Lineage/Provenance**: Tracking where the data came from and what transformations it went through. You should be able to answer "what data was this model trained on?" Data of unclear origin becomes a seed of copyright, bias, and regulatory violations.
- **Data Quality**: Accuracy, completeness, consistency, and timeliness. "Garbage In, Garbage Out" is an iron rule of ML. Low-quality data produces biased and inaccurate models.
- **Data Classification**: Classifying data by sensitivity (public/internal/confidential/PII) and applying different protection and access rules for each grade.

Data governance is directly tied to responsible AI. If you train on data of unknown origin, you will not notice bias (a fairness violation) or copyright infringement. If quality is low, model reliability drops. In other words, good governance creates "a state in which, when a problem arises later, you can trace the cause and be accountable."

The exam guide gives three examples of concepts for revealing provenance and recording the origin of data.

| Concept | Question it answers | Analogy |
|------|------|------|
| Data lineage | Where did this data come from, and what transformations did it go through? | The distribution history of a food ingredient |
| Data cataloging | What data do we have, who owns it, and where is it? | A library's collection catalog |
| SageMaker Model Cards | What data was this model trained on, and what was it built to be used for? | A product manual |

- In generative AI, **source citation** means showing together which documents a response was based on. If you attach the source documents to a RAG response, users can verify its truthfulness themselves.

## Six Data Lifecycle Strategies

The exam guide lists lifecycle, logging, residency, monitoring, observation, and retention as examples of data governance strategies.

| Strategy | What it decides | Example |
|------|------|------|
| Data lifecycle | Rules for each stage: collect → store → use → archive → dispose | When and how to dispose of the raw data used for training |
| Logging | Records of who accessed data and models and when | Keep records of model invocations and data access |
| Data residency | The region where the data is physically located | Customer data is not taken outside the designated Region |
| Monitoring | Continuously checking for rule violations and anomalies | Detect a bucket that has become public |
| Observation | Watching how the system is actually used | Find out which questions come in most often |
| Retention | How long to keep it and when to delete it | Audit logs are kept for a set period |

- Residency and retention are often mixed up. Residency is **where** to put it; retention is **how long** to keep it.
- As best practices for data engineering from the security angle, the exam guide lists assessing data quality, applying privacy-enhancing technologies, controlling data access, and data integrity.

## Model Governance: Managing the Model's Whole Life

Model governance is putting control, recording, and accountability structures in place across the model's **entire lifecycle** (development → validation → deployment → operation → retirement).

| Element | Meaning |
|------|------|
| Version control | Record which model version was deployed and when |
| Model documentation | Record training data, performance, limits, and intended use (model cards) |
| Approval procedure | A review and approval gate before deployment |
| Monitoring | Monitor performance and bias drift after deployment (Model Monitor) |
| Access control | Who can modify and deploy the model (IAM) |

- On AWS, you manage model versions and approval status with SageMaker Model Registry, and document model information with SageMaker Model Cards.
- Model Cards are integrated with Model Registry, so you can attach audit information to a registered model version.
- Registry answers "which version was approved and deployed," and Cards answer "what is this model and how was it evaluated."

> 🔍 **Going deeper**: Model governance connects to the tools you learned on Day 2. Measuring bias with Clarify, monitoring drift in operation with Model Monitor, and tracking versions with Model Registry are all governance in practice. "Governance" is not an abstract concept; it is weaving these tools into procedures.

## Auditing and Logging: Compliance Means Being Able to Prove

The core of compliance is "can we **prove** that we followed the rules?" Audit logs are the foundation for that.

- **AWS CloudTrail**: **Records every API call** that happens in an AWS account. It keeps "who did what, to which resource, and when." You can trace who deployed a model and who accessed the data.
- **Amazon CloudWatch**: Operational monitoring centered on metrics, logs, and alarms. It detects and notifies you of performance anomalies and threshold breaches.
- **AWS Config**: Tracks changes in resource configuration and evaluates whether they comply with compliance rules.

| Tool | Main role | Core question |
|------|--------|-----------|
| CloudTrail | API call audit log | "Who did what?" |
| CloudWatch | Metrics, logs, alarms | "Is it running well right now?" |
| AWS Config | Configuration change tracking and compliance evaluation | "Does the configuration match the rules?" |

> ⚠️ **Trap**: It is easy to confuse CloudTrail and CloudWatch. **CloudTrail = "who did what" (auditing and tracing)**, **CloudWatch = "how the system behaves" (performance and metrics monitoring)**. If the exam says "API call history is needed for a compliance audit," CloudTrail is the answer.

- CloudTrail records fall into two kinds. **Management events**, which create and change resources, are recorded by default, while the large volume of **data events**, which handle data inside resources, are recorded only if you turn them on separately. For an introductory exam, it is enough to be certain that "audit record of API activity = CloudTrail."
- Compliance frameworks (GDPR, HIPAA, SOC, ISO, and others) differ by industry and region, and AWS provides certifications and tools that support them. At the AIF level, it is enough to understand that "auditability and traceability are the core of compliance."

## "What Gets Recorded" in a Generative AI Call

When you use Bedrock, records are split into two layers. The names are similar, so they are easily mixed up.

| Category | CloudTrail | Bedrock model invocation logging |
|------|------|------|
| What is kept | Who called which model, when, and from where | The full content of requests and responses (prompts and responses) and metadata |
| Default state | On once you create the account | **Off by default.** You must turn it on yourself |
| Storage location | CloudTrail event history; S3 if you create a trail | CloudWatch Logs, Amazon S3 |
| Question it answers | "Who called it?" | "What was asked and what went out?" |

- A requirement such as "we must retain the prompt and response content for audit purposes" is not met by CloudTrail alone. You must turn on model invocation logging.
- Invocation logs contain exactly what the user typed. Because personal information may be in there, access control and encryption must also be applied to the log storage.

## Five AWS Services That Help with Compliance

As services that help with governance and compliance, the exam guide lists AWS Config, Amazon Inspector, AWS Artifact, AWS CloudTrail, and AWS Trusted Advisor.

| Service | One-line role | Question it answers | Clue in the passage |
|------|------|------|------|
| AWS CloudTrail | Records API activity | Who did what? | "Audit," "who changed it" |
| AWS Config | Change history of resource configuration and compliance rule evaluation | Does the configuration match the rules, and when did it change? | "Track configuration changes," "resources violating rules" |
| Amazon Inspector | Automatically scans workloads for software vulnerabilities | Are there known vulnerabilities? | "Vulnerability scan" |
| AWS Artifact | Download AWS's security and compliance documents | Where do I get the certification reports AWS has received? | "SOC report," "ISO certificate," "submit to the auditor" |
| AWS Trusted Advisor | Checks the account and recommends best practices | Are there settings that deviate from best practices? | "Recommendations," "best practice check" |

- **AWS Artifact** is where you download AWS's compliance documents, such as ISO, PCI, and SOC reports, when needed. It also has a function for reviewing, accepting, and managing agreements with AWS. The documents and agreements are provided at no cost.
- What Artifact proves is the compliance of **AWS's infrastructure and services**. A document proving our company's compliance must be created or obtained by the customer. The shared responsibility model applies to compliance as well.
- Config and CloudTrail have different viewpoints. CloudTrail looks at **actions** ("someone changed the bucket settings"), while Config looks at **state** ("this bucket now has encryption turned off and violates a rule").

## What Turns Governance into Procedure

Tools alone do not make governance. The exam guide gives the following as examples of procedures that follow governance protocols.

| Element | Content |
|------|------|
| Policies | Document which data and models can be used for which purposes |
| Review cadence | Decide how often to look at models and policies again |
| Review strategies | Decide what is reviewed, by whom, and by what criteria |
| Governance framework | Use a framework that classifies risk systematically (for example, the Generative AI Security Scoping Matrix) |
| Transparency standards | Set criteria for what to disclose and notify |
| Team training requirements | Train members so they know the policies and risks |

The **Generative AI Security Scoping Matrix** is a classification framework presented by AWS. It divides the ways of using generative AI into five scopes according to the degree of ownership over the model and data.

| Scope | Name | What it is | Example |
|------|------|------|------|
| 1 | Consumer app | Use a public third-party generative AI service as is | An employee brainstorms ideas with a public chatbot |
| 2 | Enterprise app | A third-party enterprise application with built-in generative AI features | A scheduling app that writes meeting agendas |
| 3 | Pre-trained models | Call an existing FM through an API and build your own application | A support chatbot built with a Bedrock FM and RAG |
| 4 | Fine-tuned models | Refine an existing FM with our data | A summarization model tuned to medical terminology |
| 5 | Self-trained models | Train from scratch on our data | A purpose-built model made in-house |

- As the number goes up, ownership and control over the model and data grow, and so does the **security responsibility the customer must bear**.
- For each scope, this framework prompts you to think about what to take care of across five aspects: governance and compliance, legal and privacy, risk management, controls, and resilience.

## Legal and Ethical Considerations of Generative AI

Generative AI creates new legal and ethical issues that did not exist in traditional ML. These are what the exam covers.

- **Copyright and intellectual property**: Copyrighted works may be included in the training data, and the copyright ownership of the generated output is also unclear.
- **Misinformation from hallucination**: It can generate plausible falsehoods as fact, causing legal liability problems.
- **Bias and discrimination**: Generated results can be unfair or harmful to particular groups.
- **Privacy**: Personal information in the training data can leak into the output.
- **Deepfakes and misuse**: Fake images, audio, and video can be abused for fraud and defamation.
- **Transparency obligations**: Regulations requiring users to be told that content is "AI-generated" are increasing.

Pairing the legal risks of generative AI named in the exam guide with responses gives the following.

| Legal risk | How it shows up | How to reduce it |
|------|------|------|
| Intellectual property infringement claims | The output is too similar to an existing work | Check the source and license of training and reference data |
| Biased model output | Results that disadvantage or insult particular groups | Bias measurement, per-group evaluation, human review |
| Loss of customer trust | Wrong or inappropriate answers become public | Guardrails, pre-release evaluation, disclosure of AI use |
| End-user risk | Users believe wrong advice and act on it | Set denied topics for high-risk areas, human review |
| Hallucination | Invents facts and sources that do not exist | Provide grounding with RAG, validate output |

- As ways to detect and reduce hallucination, the exam guide lists RAG grounding, output validation, and confidence scoring. You supply source documents (RAG), check that the response matches the source (validation), and handle low-confidence responses separately.

As a hypothetical case, a media company decided to write article drafts with generative AI. In terms of governance, it ① clarified the provenance of training and reference data to check copyright risk, ② to prevent hallucination, grounded facts in internal verified material with RAG and had a person do the final review (HITL), ③ kept transparency by stating "written with AI assistance," and ④ logged all generation and publishing work with CloudTrail to secure after-the-fact auditability. It is a case of building legal, ethical, and traceability structures together with the adoption of the technology.

## Quick Review of Governance and Compliance

- **Data governance**: Provenance (lineage), quality, classification. "Garbage in, garbage out."
- **Model governance**: Versioning, documentation, approval, monitoring, access control. Model Registry/Cards.
- **Auditing and logging**: CloudTrail (who did what), CloudWatch (how it behaves), Config (configuration compliance).
- **Legal and ethical issues of generative AI**: Copyright, hallucination, bias, privacy, deepfakes, transparency disclosure.

| Clue in the passage | Answer |
|------|------|
| "Trace what data this model was trained on" | Data lineage |
| "Find which datasets exist in the company and identify their owners" | Data catalog |
| "Customer data must not leave a particular country" | Data residency |
| "Keep logs for a set period and then delete them" | Data retention policy |
| "Check who deleted the endpoint last month" | AWS CloudTrail |
| "Continuously evaluate resources with encryption turned off against rules" | AWS Config |
| "The auditor requests AWS's SOC report" | AWS Artifact |
| "Keep even the prompt and response content for audit" | Bedrock model invocation logging |
| "Only approved model versions are put into production before deployment" | SageMaker Model Registry |

Tomorrow is a comprehensive review that ties all of Week 5 (responsible AI principles, AWS tools, security, governance) into one big picture.

## 📖 Glossary

- **Governance**: A management system that decides who handles what under which rules, and makes it possible to prove the rules were followed.
- **Compliance**: Following laws, regulations, and internal rules, and showing that you followed them.
- **Data lineage**: The history of where data came from and what transformations it went through.
- **Data catalog**: A collection of the lists and descriptions of the data an organization holds.
- **Data residency**: Requirements about the region where data is physically stored.
- **Retention**: Rules about how long to keep data and when to dispose of it.
- **Audit log**: Records kept so that who did what and when can be checked later.
- **Model invocation logging**: A Bedrock feature that records request and response content and metadata in CloudWatch Logs or S3.
- **Deepfake**: Fake images, audio, and video made with AI.
- **Generative AI Security Scoping Matrix**: AWS's classification framework that divides the ways of using generative AI into five scopes so you can gauge the security level needed.

## 📝 Practice Questions

**Question 1.** "Which data was this model trained on, and what transformations did it go through?" You must be able to track this. What data governance concept does this describe?

A) Data Lineage/Provenance  
B) Data Compression  
C) Model Deployment Speed  
D) Network Bandwidth  

**Answer: A**  
Explanation: Tracking where data came from and what processing it underwent is data lineage (provenance). This is core to post-incident tracing of copyright, bias, and regulatory violations. B·C·D are unrelated to data governance's origin-tracking concept.

---

**Question 2.** For compliance audit, you need "who, when, what resource, what action" API call history. What's the most appropriate AWS service?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS PrivateLink  
D) Amazon Comprehend  

**Answer: B**  
Explanation: CloudTrail records all API calls, enabling "who did what" audit and traceability for compliance. A's CloudWatch is performance metrics monitoring, C is network path protection, D is NLP, none for audit logging.

---

**Question 3.** The best explanation of the CloudTrail and CloudWatch difference is?

A) CloudTrail tracks "who did what" (audit), CloudWatch tracks "how is the system functioning" (performance metrics)  
B) They're completely identical  
C) CloudTrail trains models, CloudWatch encrypts data  
D) CloudWatch exclusively does API call audit  

**Answer: A**  
Explanation: CloudTrail is API audit and tracking, CloudWatch is metrics-based operational monitoring. B wrongly treats them as identical. C means neither service does those things. D is backwards — CloudTrail does audit.

---

**Question 4.** Which is least likely a legal·ethical consideration for generative AI adoption?

A) Copyright issues in training data  
B) Liability from hallucination-induced misinformation  
C) Deepfake misuse potential  
D) GPU physical heat dissipation specs  

**Answer: D**  
Explanation: GPU heat specs are hardware specs unrelated to generative AI's legal and ethical concerns. A's copyright, B's hallucination liability, and C's deepfake misuse are all unique legal and ethical considerations for generative AI.

---

**Question 5.** Which is least clearly a model governance practice?

A) Manage model versions and approval status with SageMaker Model Registry  
B) Document training data, performance, limitations (model card)  
C) Monitor performance and bias drift after deployment with Model Monitor  
D) Grant unlimited model modification and deployment permissions to all employees  

**Answer: D**  
Explanation: Model governance includes access control (IAM) limiting who can modify and deploy, so unlimited permissions directly violate governance. A's version management, B's documentation, and C's operational monitoring are all legitimate governance practices.

---
