# Day 4 - Full Mock Exam Pace: Five Domains Comprehensive Questions

Today stop learning and solve **five-domain comprehensive questions** like actual test. Real AIF-C01 doesn't ask domains sequentially. Foundational questions jump to security next, then service mapping follows. Today's goal: get comfortable with this "domain jumping."

When solving, keep two things conscious. First, **capture core verb/keyword in problem** ("extract", "recommend", "feel", "train directly"). Second, time pace: actual test is 65 questions 90 minutes — ~1 min 20 sec per question. Cruise through 8 questions in 11 minutes. Check answers after.

## Quick Pre-Solve Checklist

- Caught the verb? (Extract/Analyze/Generate/Recommend/Predict)
- Distinguished "build ourselves vs borrow"? (SageMaker vs AI Services/Bedrock)
- Security problem = "customer vs AWS responsibility"?
- Value judgment = which responsible AI principle?

Ready? Start.

## 📝 Practice Questions

**Question 1.** (Domain: AI/ML Fundamentals) Unlabeled customer transaction data — find naturally-occurring groups/segments. Learning mode?

A) Supervised — Classification  
B) Supervised — Regression  
C) Unsupervised — Clustering  
D) Reinforcement Learning  

**Answer: C**  
Explanation: Without answer labels, finding intrinsic data structure via groups is unsupervised clustering. Classification·Regression need answers (supervised), Reinforcement uses reward signals for sequential decisions — none match label-free segment discovery.

---

**Question 2.** (Domain: Generative AI Fundamentals) Same prompt multiple times → slightly different answers each time. Make output more consistent, deterministic?

A) Raise temperature  
B) Lower temperature (near 0)  
C) Increase max tokens  
D) Expand Top-k infinitely  

**Answer: B**  
Explanation: Lower temperature → model picks highest-probability tokens → consistent, deterministic. High temperature adds randomness/diversity (opposite A). Max tokens is length cap, Top-k expansion widens candidates — consistency direction opposite.

---

**Question 3.** (Domain: FM Application) Call-center recording files → convert to text, then analyze sentiment in that text. Service combo?

A) Polly → Translate  
B) Transcribe → Comprehend  
C) Textract → Rekognition  
D) Lex → Personalize  

**Answer: B**  
Explanation: Speech-to-text = Transcribe (STT), then text sentiment = Comprehend. Polly = text-to-speech, Translate = language translation, Textract = doc extraction, Rekognition = image analysis, Lex = chatbot, Personalize = recommendation — combo mismatch.

---

**Question 4.** (Domain: Responsible AI) Generative AI chatbot outputs factually false info plausibly (hallucination). Most effective mitigation?

A) Maximize temperature  
B) Supply trusted evidence documents letting model draw from them (RAG)  
C) Write longest prompts possible  
D) Set max tokens 0  

**Answer: B**  
Explanation: Hallucination stems from LLM "guessing plausibly," not fact-checking. Real evidence docs via RAG most effective — model answers within evidence instead of fabricating. Temperature hike feeds fabrication (A wrong), prompt length·max-tokens-0 don't reduce hallucination itself (C, D wrong).

---

**Question 5.** (Domain: Security·Governance) AWS shared responsibility: S3 stored data encryption enabling and access IAM permissions setting — who's responsible?

A) AWS  
B) Customer  
C) Region operator  
D) Open-source community  

**Answer: B**  
Explanation: Data encryption config and IAM access control are "in cloud" — customer responsibility. AWS handles "of cloud" infrastructure (data centers, hardware). Region operators/community aren't responsibility parties.

---

**Question 6.** (Domain: FM Application) Medical team wants to build custom diagnostic-assist model from own medical-image data, directly train, tune, deploy, and post-deploy monitor drift. Most fitting service?

A) Amazon Rekognition  
B) Amazon Q Developer  
C) Amazon SageMaker  
D) Amazon Translate  

**Answer: C**  
Explanation: Custom model full lifecycle (train·tune·deploy·monitor) = SageMaker. Rekognition = pre-made image analysis, Q Developer = coding assist, Translate = language translation — not custom-model direct-building.

---

**Question 7.** (Domain: Generative AI Fundamentals) Showed 2-5 prompt examples following pattern, posed real question — model followed the pattern. Weights unchanged. This technique?

A) Fine-tuning  
B) Few-shot Prompting  
C) Pre-training  
D) RAG  

**Answer: B**  
Explanation: Examples in prompt making model follow patterns without weight change = Few-shot (In-Context Learning). Fine-tuning/Pre-training alter weights, RAG supplies external doc-search — separate techniques.

---

**Question 8.** (Domain: Responsible AI/Governance) AWS managed AI service's intended use cases, limitations, fairness considerations organized to heighten transparency — document?

A) AWS AI Service Cards  
B) AWS Billing Report  
C) IAM Policy Document  
D) CloudFormation Template  

**Answer: A**  
Explanation: AI Service Cards organize service use·limits·fairness for transparency. Billing Report = cost invoice, IAM Policy = access definition, CloudFormation = infra provisioning — unrelated to transparency docs.

---
