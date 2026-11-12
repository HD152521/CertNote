# Day 2 - AWS Responsible AI Tools: SageMaker Clarify, Model Monitor, Bedrock Guardrails, AI Service Cards

## 📌 Key Takeaways

- **SageMaker Clarify** = bias measurement (before and after training) + explanation based on feature attribution. One tool handles both fairness and explainability.
- **SageMaker Model Monitor** = monitors a deployed model for data quality, model quality, bias drift, and feature attribution drift. It only alerts you; it does not fix anything.
- **Amazon Bedrock Guardrails** = safeguards applied to the input and output of generative AI. It filters harmful content, denied topics, words, sensitive information, and departures from the source.
- **AWS AI Service Cards** = transparency documents in which AWS discloses the intended uses and limits of its own AI services and models. Documenting your own model is the job of **SageMaker Model Cards**.
- The exam asks "which tool fits this problem situation?" Pin down the pairing of principle and tool, together with which stage of the lifecycle it applies to.

## The Tool Mapping at a Glance

Today's topic is **how** to put into practice with AWS the principles you learned yesterday (fairness, bias, transparency, explainability, robustness, privacy). AWS provides a managed tool for each principle.

| Tool | Principle it addresses | One-line role |
|------|--------------|-----------|
| SageMaker Clarify | Fairness/bias, explainability | Bias measurement + feature importance explanation |
| SageMaker Model Monitor | Robustness/reliability (operations) | Monitors quality and drift of deployed models |
| Bedrock Guardrails | Safety/privacy | Harmful content filters, PII masking, topic restriction |
| AI Service Cards | Transparency | Public documents on the intended uses, limits, and fairness of AWS AI services |

This table is today's core. On the exam, "I want to check whether a model is biased against a particular group" → Clarify; "I want to see whether performance degrades over time after deployment" → Model Monitor; "I want to block profanity and personal information in chatbot output" → Guardrails; "I want to know the limits and recommended uses of this AWS AI service" → AI Service Cards.

## SageMaker Clarify: Bias Measurement + Explainability

**Amazon SageMaker Clarify** is the centerpiece of the responsible AI tools. It does two things.

1. **Bias Detection**: Measures bias in both data and models.
   - **Pre-training bias**: Whether a particular group (for example, gender or age) is distributed unevenly in the training data itself.
   - **Post-training bias**: Whether the trained model's predictions are discriminatory between groups.
   - It automatically computes several statistical metrics (class imbalance, prediction gaps, and so on).
2. **Explainability**: Computes and shows how much each input feature contributed to a prediction, based on **SHAP values**. It produces explanations such as "the credit score feature had the largest effect on this loan being rejected."

| Question Clarify answers | What is needed | Timing |
|------|------|------|
| Is the training data skewed toward a particular group? | The dataset only | Before training |
| Do the model's predictions differ between groups? | The dataset + the trained model's predictions | After training |
| How much did each feature contribute to this prediction? | The trained model | After training, after deployment |
| How much does the prediction change if one feature changes? | The trained model (partial dependence plots) | After training |

- Pre-training bias measurement can be done **even without a model**. A passage that says "I want to check data imbalance before training the model" also points to Clarify.
- Clarify **measures and reports** bias. It does not automatically remove bias. Re-collecting data or balancing it is done by people.
- The resulting reports can also serve as model governance material to submit to risk and compliance teams or external regulators.

Clarify can be used at any stage: before training (data), after training (model), and after deployment (inference). In particular, combined with Model Monitor it can also monitor whether the bias of a deployed model grows over time (bias drift). So remember Clarify as one tool that bundles the two principles of "bias and explanation."

## SageMaker Model Monitor: Post-Deployment Quality Monitoring

Deploying a model is not the end. As time passes and real-world data differs from the training data (data drift), model performance quietly worsens. **SageMaker Model Monitor** automatically watches the deployed model endpoint.

| Monitoring type | What it checks for change | Example |
|------|------|------|
| Data quality | Whether the distribution of input data has changed from training (statistical drift) | The age distribution of customers differs from launch |
| Model quality | Whether a performance metric such as accuracy has fallen below the baseline | Accuracy against the ground truth declines |
| Bias drift | (Integrated with Clarify) Whether bias worsens over time | The approval-rate gap for a particular group widens |
| Feature attribution drift | Whether the explainability pattern has changed | Income used to matter most, but now region matters most |

- You set a baseline, and if actual traffic deviates from that baseline, it sends an alert through CloudWatch. The baseline is usually built from the dataset used to train the model.
- You can monitor not only real-time endpoints but also batch transform jobs that run periodically.
- To check model quality you need the actual ground truth. The ground truth often arrives later than the prediction (you only learn whether a loan actually went delinquent months later), so data quality monitoring, which works without ground truth, gives the first signal of anomalies.

> ⚠️ **Trap**: Model Monitor is not a tool that "automatically fixes the model." It is a monitoring tool that **detects anomalies and notifies you**. When a problem is found, a person must decide on retraining and redeployment. An option phrased as "the model heals itself" is a trap.

## Bedrock Guardrails: Safeguards for Generative AI

**Amazon Bedrock Guardrails** is a feature that places safety and privacy barriers on generative AI (LLM) applications. It applies to both input (the user prompt) and output (the model response). In older documents and questions it also appears under the name "Guardrails for Amazon Bedrock." It is the same feature.

| Feature | Role |
|------|------|
| Content filters | Block harmful content such as hate, violence, sexual content, and insults |
| Denied Topics | Restrict the application from covering particular topics (for example, medical advice, investment solicitation) |
| Sensitive information (PII) filters | Mask or block personal information such as names, national ID numbers, and card numbers |
| Word filters | Block specific words such as banned terms and competitor names |
| Contextual grounding check | Checks whether a response departs from the provided source (hallucination) |

- The content filter categories are Hate, Insults, Sexual, Violence, Misconduct, and **Prompt Attack**. You can adjust the filter strength per category, and images are covered as well as text.
- The sensitive information filter lets you choose between **blocking** and **masking**. Besides the predefined types, you can also define your own patterns with regular expressions (for example, an internal employee ID format).
- The contextual grounding check is meaningful when there are source documents, as in RAG. It filters out responses that add content not in the source or that are unrelated to the question.
- In addition to the table above, there are **Automated Reasoning checks**. This feature verifies the accuracy of a response against logical rules defined in advance.
- You can also define for yourself the message to return to the user when a filter is triggered.

In this way Guardrails takes charge of both **safety** (blocking harmful output) and **privacy** (protecting PII). Because it is a policy separate from the model itself, its strength is that it applies in the same way whichever FM you use. There is also an API (`ApplyGuardrail`) that inspects text without invoking a model, so you can apply the same standards to models outside Bedrock.

As a hypothetical case, a bank built a customer service chatbot on Bedrock. With Guardrails it ① automatically masked account numbers and national ID numbers that customers typed in (PII filter), ② blocked requests like "recommend an investment stock" as a denied topic because of regulatory risk, and ③ blocked profanity and discriminatory remarks with the content filter. Even when the model was swapped out, this policy stayed in place, so the safety standard could be applied consistently.

## AI Service Cards: Public Documents for Transparency

**AWS AI Service Cards** are documents that AWS publishes about its own AI services (for example, Amazon Rekognition and Textract). Each card contains the service's **recommended use cases, design choices, considerations on fairness and accuracy, limitations, and guidance for responsible use**.

- This is an implementation of the **transparency** principle. It lets users know in advance "what uses this AI service is suited to and where to be careful."
- Cards are issued not only for AWS AI services but also for AWS models such as Amazon Nova.

AI Service Cards are a kind of "nutrition label." Even if you cannot look inside the model yourself, AWS helps responsible use by disclosing "this service was evaluated with this kind of data, has these limitations, and should not be used for these purposes." If the exam asks "which transparency material tells you the intended uses and limits of an AWS AI service?", the answer is AI Service Cards.

## Two Similarly Named Documents: AI Service Cards and SageMaker Model Cards

Both are "cards" and both are documents for transparency, so they are easily mixed up. The criterion that separates them is **who writes it and what it describes**.

| Category | AWS AI Service Cards | Amazon SageMaker Model Cards |
|------|------|------|
| Who writes it | AWS | The customer who built the model (our team) |
| What it describes | AWS's AI services and models | The ML model we trained |
| What it contains | Intended uses and constraints, responsible AI design decisions, best practices for achieving performance | Intended uses, risk rating, training details and metrics, evaluation results and observations, considerations and recommendations |
| Use | Check suitability and limits before using the service | Responding to audits, sharing model usage guidelines, governance reporting |

- The risk rating in Model Cards is chosen from unknown, low, medium, and high. A loan approval model has a higher risk rating than an email classification model.
- Model Cards can be exported as a PDF and shared with stakeholders, and when you edit one, new versions accumulate, leaving a change history.
- If the passage says "published by AWS" or "limits of an AWS service," it is AI Service Cards; if it says "record the uses and evaluation results of our model in one place," it is Model Cards.

## Placing the Tools by Lifecycle Stage

Even for the same tool, knowing "when to use it" prevents confusion.

| Stage | What you want to do | Tool |
|------|------|------|
| Model/service selection | Check the uses and limits of an AWS service | AI Service Cards |
| Model selection (generative) | Compare several FMs on the same criteria | Model evaluation in Amazon Bedrock |
| Before training | Measure whether the data is skewed | SageMaker Clarify |
| After training | Measure differences in predictions between groups, explain the basis of predictions | SageMaker Clarify |
| Before deployment | Document the model's uses, risks, and evaluation results | SageMaker Model Cards |
| In operation (traditional ML) | Monitor drift and quality degradation | SageMaker Model Monitor |
| In operation (generative) | Filter input and output in real time | Amazon Bedrock Guardrails |
| In operation (human review) | Hand low-confidence predictions to a person | Amazon Augmented AI (A2I) |

- **Model evaluation in Amazon Bedrock** provides automatic (programmatic) evaluation, evaluation scored by humans, and evaluation that uses another LLM as the judge. You can also evaluate whether a knowledge base (RAG) finds relevant information well and answers appropriately. If Clarify handles bias and explanation for traditional ML, this handles the response quality of FMs.
- **Amazon A2I** is the service that implements the Human-in-the-Loop you learned yesterday. It sends predictions with low model confidence, or randomly sampled predictions, to human reviewers. For common cases such as Textract document extraction and Rekognition inappropriate-image detection, there are prebuilt review workflows.

> ⚠️ **Trap**: AWS documentation notes that SageMaker Clarify, SageMaker Model Monitor, and Amazon A2I are no longer open to new customers, while existing customers can keep using them. That does not mean the division of roles among these names has vanished from the exam. What the exam asks about is the pairing of roles: "bias measurement and explanation = Clarify, post-deployment monitoring = Model Monitor, human review = A2I."

## Telling Apart the Confusing Pairs

| Confusing pair | Question that separates them | Answer |
|------|------|------|
| Clarify vs Model Monitor | Is it measured once, or watched continuously? | Measurement/explanation = Clarify, continuous monitoring = Model Monitor |
| Clarify vs Guardrails | Does it analyze predictions of traditional ML, or block input and output of generative AI? | Analysis = Clarify, blocking = Guardrails |
| Model Monitor vs Guardrails | Does it watch statistical change, or filter individual responses? | Trend monitoring = Model Monitor, per-response filter = Guardrails |
| Model Monitor vs CloudWatch | Is it the quality of the model, or the health of the system? | Drift = Model Monitor, latency/errors/resources = CloudWatch |
| AI Service Cards vs Model Cards | Is it a document written by AWS, or by us? | AWS = AI Service Cards, us = Model Cards |
| Guardrails vs prompt instructions | Do you ask the model, or enforce from outside the model? | Ask = prompt, enforce = Guardrails |

- The last row matters in practice. Writing "do not reveal personal information" in a system prompt is hoping the model will comply, while Guardrails inspects the model response separately and filters it out.
- Also know what Guardrails **does not do**. It does not measure bias in the training data, it does not retrain the model, and it does not record who called the API (that is CloudTrail on Day 4).

## Principle → Tool Quick Review

- You want to measure bias and explain decisions → **SageMaker Clarify**
- You monitor whether a deployed model gets worse over time → **SageMaker Model Monitor**
- You block harmful or sensitive content in generative AI output → **Bedrock Guardrails**
- You look at the uses and limits of an AWS AI service in a public document → **AI Service Cards**

| Clue in the passage | Answer |
|------|------|
| "Check the gender imbalance of the dataset numerically before training" | SageMaker Clarify |
| "Submit to a regulator which features affected each prediction" | SageMaker Clarify |
| "Automatic alert if the input data distribution changes six months after launch" | SageMaker Model Monitor |
| "Keep the chatbot from mentioning competitor names" | Bedrock Guardrails (word filter) |
| "Keep the chatbot from giving legal advice" | Bedrock Guardrails (denied topics) |
| "Check that a RAG response is based on the retrieved documents" | Bedrock Guardrails (contextual grounding check) |
| "Check what uses Amazon Rekognition must not be used for" | AWS AI Service Cards |
| "Submit our credit model's uses, risk rating, and evaluation results for audit" | SageMaker Model Cards |
| "Only a person checks the document extraction results with low confidence" | Amazon A2I |

Tomorrow we widen our view to **AI security** (IAM least privilege, data encryption, PII protection, PrivateLink, the shared responsibility model). If responsible AI is "ethics and trust," security is "technical defense."

## 📖 Glossary

- **SHAP value**: A number that shows how much each input feature contributed to a single prediction.
- **Feature attribution**: The degree to which a feature pushed a prediction up or down.
- **Drift**: The phenomenon in which the properties of data or a model in operation differ from those at training time.
- **Baseline**: The normal range set in advance to judge drift. It is usually built from the training data.
- **Denied Topics**: Topics defined in Guardrails that the application must not cover.
- **Masking**: Displaying personal information with parts hidden rather than deleting it. Example: replacing a card number with asterisks.
- **Contextual grounding check**: A check of whether a model's response is actually based on the provided source documents.
- **AI Service Card**: A document in which AWS discloses the uses, limits, and design decisions of its own AI services.
- **Model Card**: A document in which the team that built a model records the model's uses, risks, training, and evaluation.

## 📝 Practice Questions

**Question 1.** A data scientist wants to measure whether specific age groups are overrepresented in training data and check if model prediction results are discriminatory between groups. They also want to explain the basis of each prediction (feature contribution). What's the most appropriate AWS tool?

A) Amazon Bedrock Guardrails  
B) Amazon SageMaker Clarify  
C) AWS AI Service Cards  
D) Amazon SageMaker Model Monitor  

**Answer: B**  
Explanation: SageMaker Clarify provides both pre- and post-training bias measurement and SHAP-based feature contribution (explainability). A's Guardrails is a generative AI output safety mechanism, C's AI Service Cards are transparency documents, and D's Model Monitor is a post-deployment drift monitoring tool whose primary function is not bias measurement and explanation.

---

**Question 2.** A generative AI chatbot needs to mask personal ID numbers and card numbers in user input, block profanity, and prevent covering specific topics like "investment recommendations." What's the appropriate feature?

A) Amazon SageMaker Model Monitor  
B) AWS CloudTrail  
C) Amazon Bedrock Guardrails  
D) Amazon SageMaker Clarify  

**Answer: C**  
Explanation: Bedrock Guardrails provides PII filtering (masking), content filtering (profanity blocking), and denied topics (topic restriction) as one unified policy. A is for model quality monitoring, B is for API call audit logging, and D is for bias and explanation tools that don't match these requirements.

---

**Question 3.** Which statement about Amazon SageMaker Model Monitor is correct?

A) It detects data drift and quality degradation of deployed models and sends alerts  
B) When it detects problems, it automatically retrains and redeploys the model  
C) It's a tool that blocks harmful content in generative AI output  
D) It's a document that discloses limitations of AWS AI services  

**Answer: A**  
Explanation: Model Monitor supervises data quality, model quality, and bias drift of deployed endpoints and sends CloudWatch alerts. B is incorrect because it doesn't auto-retrain (humans decide), C is the role of Guardrails, and D is the role of AI Service Cards.

---

**Question 4.** What is the primary purpose of AWS AI Service Cards?

A) To speed up model training  
B) To provide transparency by publicly disclosing recommended use cases, limitations, and fairness considerations of AWS AI services  
C) To encrypt personal information  
D) To automatically remove model bias  

**Answer: B**  
Explanation: AI Service Cards publicly disclose intended use cases, design choices, limitations, and responsible use guidelines for services. A is unrelated to performance, C is not an encryption feature, and D does not automatically remove bias (the purpose is providing transparency information).

---

**Question 5.** Which connection between responsible AI principle and supporting AWS tool is correct?

A) Transparency - Amazon Bedrock Guardrails  
B) Bias·Explainability - Amazon SageMaker Clarify  
C) Safety - AWS AI Service Cards  
D) Operational Monitoring - Amazon Bedrock Guardrails  

**Answer: B**  
Explanation: SageMaker Clarify supports both bias measurement and explainability. A pairs transparency with AI Service Cards, C pairs safety with Guardrails, and D pairs operational monitoring with Model Monitor, so all other pairs are mismatched.

---
