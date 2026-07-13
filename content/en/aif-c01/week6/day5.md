# Day 5 - D-Day Wrap-Up: Exam Structure, Keyword → Service Translation Table, Frequently-Missed Traps

Six weeks' journey ends. Final text isn't "learning more" but crafting a **one-page summary** to carry into test. What exam looks like, how to translate keywords in problems to services, what traps catch even smart people. Organize this.

Day before exam, cramming new content beats **re-polishing foundational concept boundaries and mappings**. Today's text becomes that final checklist.

## Exam Structure: What You Face

AWS Certified AI Practitioner (AIF-C01) basic form:

| Item | Content |
|------|------|
| **Questions** | 65 (roughly 15 unscored evaluation) |
| **Time** | 90 minutes |
| **Passing Score** | 700 of 1000 |
| **Format** | Multiple choice (single answer), multiple response, misc assistance formats |
| **Level** | Foundational |

Core: "ace only the 50 scored questions." Don't exhaust time on unknowns; quickly secure the questions you know. Passing strategy beats perfection.

> 💡 **Related Theory**: Why ~15 unscored? AWS pre-tests new items for future exams. No marking of which are evaluation-only — treat all equally seriously. 90 min / 65 questions = ~1 min 20 sec each; flag-then-return pacing crucial. Dwelling on one question leaves points on the table.

## Domain Weight

Test has 4 domains with varying weight. More-weight domains deserve more review time.

| Domain | ~Weight |
|--------|-------------|
| AI/ML Fundamentals | ~20% |
| Generative AI Fundamentals | ~24% |
| Foundation Model Application | ~28% |
| Responsible AI + Security·Regulation·Governance | ~28% |

Generative AI and application (Bedrock, service mapping), responsible AI/security are combined half-plus. Today's translation table and trap summary target exactly that.

## "Keyword → Service" Translation Table

Test always describes "situations." Translate keywords to services — this is your strongest weapon. Memorize this table.

| Problem Keywords | Answer Service |
|----------------|-------------|
| Document/Scan **extract** text·tables, OCR | **Amazon Textract** |
| Image·video object/face/inappropriate **recognize** | **Amazon Rekognition** |
| Text **sentiment analyze**, entity/language extract | **Amazon Comprehend** |
| **Speech → Text**(STT), call transcript | **Amazon Transcribe** |
| **Text → Speech**(TTS), voice guidance | **Amazon Polly** |
| Language **translate** | **Amazon Translate** |
| **Chatbot**/voice bot, intent recognizing | **Amazon Lex** (or Amazon Q Business) |
| Product/content personalized **recommend** | **Amazon Personalize** |
| Time-series demand/sales **predict** | **Amazon Forecast** |
| Company document intelligent **search** | **Amazon Kendra** |
| Multiple **FM host**, single API call | **Amazon Bedrock** |
| **Custom model direct train**, deploy, MLOps | **Amazon SageMaker** |
| Internal-data **work AI assistant** | **Amazon Q Business** |
| **Code assist**, generation/explanation | **Amazon Q Developer** |
| Model/data **bias detect, explainability** | **SageMaker Clarify** |
| Generative AI output **safety policy**(harm/PII/hallucination) | **Guardrails for Amazon Bedrock** |
| Model use·limitations·fairness **transparency doc** | **AWS AI Service Cards** |

> 💡 **Related Theory**: Same data type, different **verb** changes service. Text "extract" → Textract, text "analyze meaning" → Comprehend, text "generate" → Bedrock/LLM. Most-powerful habit: reading problems and underlining **verbs first** ("extract", "analyze", "change", "recommend", "predict") before nouns ("document", "text"). Verb-first habit hugely lifts answer rate.

## Frequently-Missed Traps: Organized

Final compilation — foundational level yet repeatedly fails:

- **Textract vs Comprehend**: "Extract" text → Textract, "analyze meaning/feeling" → Comprehend. When stuck, check the verb.
- **SageMaker vs Bedrock**: "Build directly" → SageMaker, "borrow FM" → Bedrock. "Custom training" keyword spotting → SageMaker.
- **Few-shot vs Fine-tuning**: Few-shot = prompt examples (weight unchanged), Fine-tuning = weight change. "Show examples" → Few-shot.
- **Temperature direction**: Low = consistent·deterministic, High = creative·diverse. Accuracy needed → lower.
- **Shared Responsibility**: Data, permissions, encryption config nearly always "customer" responsibility.
- **Hallucination Fix**: Not bigger model but **RAG** (ground in docs).
- **RAG vs Fine-tuning**: Unknown "info" needed → RAG, internalize deep "speech·domain behavior" → Fine-tuning.
- **Lex vs Polly vs Transcribe**: Chat=Lex, make voice=Polly, receive voice=Transcribe.
- **AI Service vs SageMaker**: "No ML experts, fast" → managed AI Service, "direct control, custom" → SageMaker.

> 💡 **Related Theory**: Trap questions usually "look-alike different options." Examiner splits on one keyword (e.g., "extract" vs "analyze"). Spotting-when-two-services-seem-fitting: return to problem statement, reconfirm core **verb** describing the work. Verb-re-confirmation is safest validation.

## Summary — and Into the Test

Compress 6 weeks: **Foundational concepts (inclusion·learning modes·tokens)** → base, **AWS AI service mapping** → surface, **Responsible AI·Security·Governance** → judgment questions. 65 questions 90 minutes, 700 passes. Don't dwell; **verb-capture, service-translate**, and on trap pairs, verb-recheck to problem.

If you've reached here, you're ready. Skim this translation table and trap list once more, enter test relaxed. Passing success.

---

## 📝 Practice Questions

**문제 1.** AIF-C01 exam structure: correct?

A) 100 questions, 60 min, 800 passing  
B) 65 questions, 90 min, 700 passing (1000 total)  
C) 50 questions, 120 min, 600 passing  
D) 30 questions, 45 min, 900 passing  

**정답: B**  
해설: AIF-C01 is 65 questions in 90 minutes, passing 700/1000. ~15 unscored evaluation. Other choices wrong on count, time, or score.

---

**문제 2.** "Auto-extract amount and item table from scanned invoice" — core verb catches what service?

A) Amazon Comprehend  
B) Amazon Textract  
C) Amazon Lex  
D) Amazon Polly  

**정답: B**  
해설: Verb "extract" on scanned doc = Textract. Comprehend analyzes meaning/sentiment, Lex is chatbot, Polly is voice synth — doc text·table extraction mismatch.

---

**문제 3.** SageMaker and Bedrock both look plausible. Problem says "train model from scratch with company data directly." Correct answer?

A) Bedrock — borrows ready FM  
B) SageMaker — custom model direct training·deployment  
C) Both correct  
D) Neither has training  

**정답: B**  
해설: "Train from scratch" = custom building = SageMaker. Bedrock leverages ready FM (not direct-training), so clearly differ. Both aren't correct (C wrong), SageMaker core is training (D wrong).

---

**문제 4.** Generative AI hallucination cut, most fitting approach?

A) Infinitely scale model parameters  
B) Supply trusted docs grounding answers (RAG)  
C) Temperature maximum-high  
D) Unconditionally lengthen prompts  

**정답: B**  
해설: Hallucination fix's standard: real evidence docs (RAG) — model answers within evidence, not fabricate. Model scaling doesn't guarantee hallucination reduction, high temperature feeds freedom to invent (C opposite), prompt length doesn't reduce hallucination itself (D wrong).

---

**문제 5.** Two services (e.g., Textract vs Comprehend) both seem fitting. Safest verification when picking between them?

A) Pick first alphabetically  
B) Problem's core **verb** recheck to distinguish task type  
C) Pick pricier service  
D) Always newest service  

**정답: B**  
해설: Trap questions split on one keyword — problem core verb recheck ("extract/analyze/generate" etc.) distinguishing work type is most reliable. Alphabet order, pricing, release date are task-fitness unrelated.

---
