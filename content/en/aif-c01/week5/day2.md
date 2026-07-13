# Day 2 - AWS's Responsible AI Tools: SageMaker Clarify, Model Monitor, Bedrock Guardrails, AI Service Cards

Yesterday we learned the principles of responsible AI — fairness, bias, transparency, explainability, robustness, privacy. We know the principles; now comes one question: "So how do we actually **do this** with AWS?" Fortunately, AWS provides concrete managed tools corresponding to each principle. Today we examine the four key ones.

These tools are frequently tested in AIF-C01 as "What AWS tool suits this problem?" Your goal is to precisely match each tool to "which principle it solves and how."

## Tools at a Glance: Mapping

| Tool | Principle It Solves | One-Line Role |
|------|--------------|-----------|
| SageMaker Clarify | Fairness·Bias, Explainability | Measure bias + explain feature importance |
| SageMaker Model Monitor | Robustness·Reliability (operational) | Supervise deployed model quality·drift |
| Bedrock Guardrails | Safety·Privacy | Filter harmful content·mask PII·restrict topics |
| AI Service Cards | Transparency | Public documentation of AWS AI service use cases·limitations·fairness |

> 💡 **Related Theory**: This table is today's core. In the exam, if "I want to check whether a model is biased against a specific group" → Clarify; "I want to see if performance degrades over time after deployment" → Model Monitor; "I want to block profanity·personal information in chatbot output" → Guardrails; "I want to know the limitations and recommended use cases for this AWS AI service" → AI Service Cards.

## SageMaker Clarify: Bias Measurement + Explainability

**Amazon SageMaker Clarify** is the cornerstone of responsible AI tools. It does two things.

1. **Bias Detection**: Measures bias in both data and models.
   - **Pre-training bias**: Does training data itself have an imbalanced distribution of certain groups (e.g., gender, age)?
   - **Post-training bias**: Do the predictions of the trained model discriminate between groups?
   - Automatically calculates multiple statistical indicators (class imbalance, prediction gaps, etc.).

2. **Explainability**: Shows which input features contributed to a prediction using **SHAP values**. Creates explanations like "This loan was rejected primarily because of the credit score feature."

> 🔍 **Deeper Look**: Clarify can be used at any stage — before training (data), after training (model), or after deployment (inference). Especially when combined with Model Monitor, you can also supervise bias drift (whether bias increases over time in deployed models). In other words, remember that Clarify combines two principles — "bias and explanation" — in one tool.

## SageMaker Model Monitor: Quality Supervision After Deployment

Model deployment isn't the end. Over time, as real-world data diverges from training data (data drift), model performance quietly degrades. **SageMaker Model Monitor** automatically monitors deployed model endpoints.

Items supervised:

- **Data Quality**: Has the distribution of input data changed statistically since training?
- **Model Quality**: Have performance metrics like prediction accuracy dropped below baseline?
- **Bias Drift**: (Integrated with Clarify) Is bias becoming more severe over time?
- **Feature Attribution Drift**: Has the explainability pattern changed?

You set a baseline and when actual traffic deviates from it, CloudWatch sends alerts.

> ⚠️ **Trap**: Model Monitor does **not** "automatically fix the model." It is a **monitoring tool that detects and alerts about** issues. When problems are found, humans decide on retraining and redeployment. Questions suggesting "the model self-heals automatically" are traps.

## Bedrock Guardrails: Safety Guard for Generative AI

**Amazon Bedrock Guardrails** is a feature that places safety and privacy barriers on generative AI (LLM) applications. It applies to both input (user prompts) and output (model responses).

Key features:

| Feature | Role |
|------|------|
| Content Filter | Block harmful content like hate speech, violence, sexual content, profanity |
| Denied Topics | Prevent covering specific topics (e.g., medical advice, investment tips) |
| Sensitive Information (PII) Filter | Mask or block personal information like names, ID numbers, card numbers |
| Word Filter | Block banned words or competitor names |
| Context Grounding Check | Verify that responses don't deviate from provided evidence (hallucination check) |

So Guardrails take responsibility for both **safety** (blocking harmful output) and **privacy** (protecting PII). Because it's a policy separate from the model itself, the same policy can be applied regardless of which foundation model you use — that's its strength.

> 📚 **Case Study**: A bank built a Bedrock-based customer service chatbot. Using Guardrails, they ① automatically masked account numbers and ID numbers in customer input (PII filter), ② blocked requests like "recommend investment products" as regulatory risk (denied topics), and ③ blocked profanity and discriminatory language (content filter). Because this policy persisted even when models were swapped out, they could consistently enforce safety standards.

## AI Service Cards: Public Documentation for Transparency

**AWS AI Service Cards** are documents AWS publishes about its AI services (e.g., Amazon Rekognition, Textract, etc.). Each card contains the service's **recommended use cases, design choices, considerations for fairness and accuracy, limitations, and responsible use guidelines**.

This is the implementation of the **transparency** principle. It enables users to know in advance "what use cases are suitable for this AI service and where to be careful."

> 🔍 **Deeper Look**: AI Service Cards are like a "nutrition label." You can't peer directly into the model, but by AWS stating "we evaluated this service with this data, it has these limitations, and you shouldn't use it for these purposes," it enables responsible use. In the exam, if you see "What transparency resource tells you the intended use cases and limitations of an AWS AI service?", the answer is AI Service Cards.

## Quick Review: Principle → Tool

- Want to measure bias and explain decisions → **SageMaker Clarify**
- Monitor if deployed model gets worse over time → **SageMaker Model Monitor**
- Block harmful and sensitive output in generative AI → **Bedrock Guardrails**
- See intended use cases and limitations of AWS AI services in public documentation → **AI Service Cards**

## Summary

Today we connected yesterday's principles to AWS's concrete tools. The key is memorizing the tool-and-principle pairing. Clarify (bias+explanation), Model Monitor (operational monitoring), Guardrails (safety+privacy), AI Service Cards (transparency). Master just these four pairings and you'll solve most scenario problems in the responsible AI area.

Tomorrow we broaden our perspective to **AI Security** — least privilege IAM, data encryption, PII protection, PrivateLink, shared responsibility model. If responsible AI is "ethics and trust," security is "technical defense."

---

## 📝 Practice Questions

**문제 1.** A data scientist wants to measure whether specific age groups are overrepresented in training data and check if model prediction results are discriminatory between groups. They also want to explain the basis of each prediction (feature contribution). What's the most appropriate AWS tool?

A) Amazon Bedrock Guardrails  
B) Amazon SageMaker Clarify  
C) AWS AI Service Cards  
D) Amazon SageMaker Model Monitor  

**정답: B**  
해설: SageMaker Clarify provides both pre- and post-training bias measurement and SHAP-based feature contribution (explainability). A's Guardrails is a generative AI output safety mechanism, C's AI Service Cards are transparency documents, and D's Model Monitor is a post-deployment drift monitoring tool whose primary function is not bias measurement and explanation.

---

**문제 2.** A generative AI chatbot needs to mask personal ID numbers and card numbers in user input, block profanity, and prevent covering specific topics like "investment recommendations." What's the appropriate feature?

A) Amazon SageMaker Model Monitor  
B) AWS CloudTrail  
C) Amazon Bedrock Guardrails  
D) Amazon SageMaker Clarify  

**정답: C**  
해설: Bedrock Guardrails provides PII filtering (masking), content filtering (profanity blocking), and denied topics (topic restriction) as one unified policy. A is for model quality monitoring, B is for API call audit logging, and D is for bias and explanation tools that don't match these requirements.

---

**문제 3.** Which statement about Amazon SageMaker Model Monitor is correct?

A) It detects data drift and quality degradation of deployed models and sends alerts  
B) When it detects problems, it automatically retrains and redeploys the model  
C) It's a tool that blocks harmful content in generative AI output  
D) It's a document that discloses limitations of AWS AI services  

**정답: A**  
해설: Model Monitor supervises data quality, model quality, and bias drift of deployed endpoints and sends CloudWatch alerts. B is incorrect because it doesn't auto-retrain (humans decide), C is the role of Guardrails, and D is the role of AI Service Cards.

---

**문제 4.** What is the primary purpose of AWS AI Service Cards?

A) To speed up model training  
B) To provide transparency by publicly disclosing recommended use cases, limitations, and fairness considerations of AWS AI services  
C) To encrypt personal information  
D) To automatically remove model bias  

**정답: B**  
해설: AI Service Cards publicly disclose intended use cases, design choices, limitations, and responsible use guidelines for services. A is unrelated to performance, C is not an encryption feature, and D does not automatically remove bias (the purpose is providing transparency information).

---

**문제 5.** Which connection between responsible AI principle and supporting AWS tool is correct?

A) Transparency - Amazon Bedrock Guardrails  
B) Bias·Explainability - Amazon SageMaker Clarify  
C) Safety - AWS AI Service Cards  
D) Operational Monitoring - Amazon Bedrock Guardrails  

**정답: B**  
해설: SageMaker Clarify supports both bias measurement and explainability. A pairs transparency with AI Service Cards, C pairs safety with Guardrails, and D pairs operational monitoring with Model Monitor, so all other pairs are mismatched.

---
