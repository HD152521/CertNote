# Day 5 - D-Day Finale: Exam Structure, Time Management, Scenario Breakdown Strategy

Final day of 10 weeks. Today isn't new knowledge but **exam technique**. Same skill level rises or falls based on time budgeting and problem breakdown. Know MLA-C01's structure precisely, use 130 minutes wisely, decompose long scenarios quickly, check everything pre-exam. Strong prep deserves confidence today.

## Exam Structure — What You Face

| Item | Detail |
|------|--------|
| Questions | 65 (50 scored + 15 unscored) |
| Time | 130 min |
| Question Types | Multiple choice single/multi, scenario, sequencing |
| Pass Score | 720 / 1000 (scaled) |
| Scoring | 50 scored questions only (15 unscored = experimental) |

Domain weights: **1 Data Prep 28% · 2 Model Dev 26% · 3 Deploy/Orch 22% · 4 Monitor/Security 24%**. No domain is skippable; Domains 1&2 top-heavy, so stability there = foundation passed.

> 💡 **Related Theory**: 15 unscored are test questions for future exams—you don't know which are unscored. Treat all equally. Pass line ~720 = ~70% of 50 scored. Goal isn't perfection but "majority solid + trap-dodge."

## Time Budgeting — Using 130 Minutes

65 questions / 130 minutes = **2 minutes average per question**. Recommended pace:

- **Pass 1 (~90–100 min)**: All questions once. Stuck >2 min? Mark/flag and move. **Never spend 5+ on one question.** All questions worth equal points.
- **Pass 2 (~25–30 min)**: Return to flagged questions calmly. Other questions seen in Pass 1 often hint at answers.
- **Pass 3 (~5 min)**: Empty answers? Multi-answer count correct? Final check.

> ⚠️ **Trap**: Common failure: "spent 10 min on one hard question, ran out of time for easy later ones." Flag and move. Also: **never leave blanks**. No wrong-answer penalty, so unanswered = pure loss.

## Scenario Decomposition — Disassemble Long Problems

Long scenario questions: read in this order.

1. **Read the final question first.** "Most cost-efficient?" "Most appropriate inference option?" — know what you're solving before diving into context.
2. **Mark decision keywords.** Real-time/sporadic, imbalanced, time series, drift, no internet, encrypt, etc.
3. **Decide answer before seeing options.** Use Day 4's translation table.
4. **Eliminate traps via option scan.** Cross out any option breaking even one requirement.

> 🔍 **Deeper**: Multi-answer ("select TWO") needs exact count—one right, one wrong = zero credit. Watch **superlatives** ("MOST secure", "LEAST overhead", "MOST cost-efficient"). Many options work technically, but superlative criterion picks one winner. Miss the superlative, choose "works but not best" trap.

## Pre-Exam Quick Checks

Night before and morning of: rapidly review this.

| Area | One-Line Check |
|------|---------|
| Inference Options | Real-time/serverless/async/batch by immediacy, traffic, payload |
| Algorithms | DeepAR time series, RCF anomaly, XGBoost tabular, BlazingText text, Factorization Machines sparse |
| Evaluation Metrics | Imbalance=F1/AUC, miss=Recall, false alarm=Precision, regression=RMSE |
| Monitoring | Input drift=Data Quality, performance=Model Quality+labels |
| Bias/Explainability | Clarify pre/post bias, SHAP |
| Security | IAM least privilege, VPC Endpoint, KMS at-rest, CloudTrail audit |
| MLOps | Pipelines + Registry + EventBridge trigger |
| Cost | MME, Inferentia, serverless, Spot, auto-shutdown, tags |

> 💡 **Related Theory**: Pre-exam review isn't learning new stuff—it's **sharpening recall paths** for known concepts. Saying keywords→function mappings aloud (active recall) helps more than re-reading. Sleep well, arrive early, don't panic if early questions feel hard (common test design).

## Summary — 10 Weeks Closing

MLA-C01 is fundamentally **translating requirements into SageMaker functions.** 65 questions/130 minutes, pass 720, 2-min discipline, flag-and-move discipline, superlative reading — these exam techniques turn 10 weeks of knowledge into scored points. Domains 1&2 foundation = majority secure. Domains 3&4 keyword mapping = reflex recall.

You've traversed data collection → feature engineering → Feature Store → Clarify, training → tuning → evaluation, inference options → Pipelines/MLOps, Model Monitor → IAM/VPC/KMS. One rotation complete.

Trust your prep. Answer calmly. Good luck.

---

## 📝 연습 문제

**문제 1.** MLA-C01 시험 구성에 대한 설명으로 가장 정확한 것은?

A) 65문항 모두 채점되며 100문항 중 80개를 맞혀야 한다  
B) 총 65문항(채점 50 + 비채점 15), 130분, 합격 스케일 점수 720이며 비채점 문항은 점수에 반영되지 않는다  
C) 50문항/60분, 합격 600점이다  
D) 문항 수와 시간은 응시자마다 무작위로 다르다  

**정답: B**  
해설: MLA-C01은 65문항(채점 50 + 비채점 15)을 130분 동안 풀며 합격선은 1000점 만점에 720점이고, 비채점 15문항은 점수에 반영되지 않는다. A는 채점/비채점 구분과 점수 기준이 틀렸고, C는 문항 수·시간·합격선이 모두 다르며, D는 구성이 표준화되어 있어 사실이 아니다.

---

**문제 2.** 1차 통과 중 한 시나리오 문항에서 2분이 지나도 답을 확신할 수 없다. 가장 권장되는 행동은?

A) 확신이 설 때까지 그 문항에 계속 머문다  
B) 가장 그럴듯한 답을 임시로 고르고 표시(flag)한 뒤 다음 문항으로 넘어가, 검토 단계에서 다시 본다  
C) 그 문항을 빈칸으로 두고 넘어간다  
D) 시험을 일찍 종료한다  

**정답: B**  
해설: 모든 문항 배점이 같으므로 한 문항에 시간을 과하게 쓰지 않고 임시 답 + 표시 후 넘어가 검토 단계에서 다시 보는 것이 점수를 지키는 전략이다. A는 뒤쪽 쉬운 문항을 놓치게 하고, C는 오답 감점이 없으므로 빈칸이 순손해이며, D는 남은 문항을 포기하는 것이다.

---

**문제 3.** 긴 사례형 문항을 효율적으로 푸는 권장 순서로 가장 적절한 것은?

A) 본문을 처음부터 끝까지 정독한 뒤 마지막에 질문을 읽는다  
B) 마지막 질문(무엇을 묻는지)을 먼저 읽고, 본문에서 결정 키워드를 찾아 보기를 보기 전에 정답을 떠올린 뒤 함정 보기를 소거한다  
C) 보기 4개를 먼저 외운 뒤 본문을 읽는다  
D) 키워드 무시하고 직관으로만 고른다  

**정답: B**  
해설: 질문을 먼저 읽으면 본문에서 무엇을 찾을지 명확해지고, 키워드→기능 번역으로 정답을 먼저 정한 뒤 요구를 위반하는 보기를 소거하는 순서가 가장 효율적이다. A는 무엇을 찾을지 모른 채 정독해 시간을 낭비하고, C는 비효율적이며, D는 함정에 빠지기 쉽다.

---

**문제 4.** "다음 중 가장 비용 효율적인(MOST cost-effective) 옵션은?" 같은 최상급 한정어가 포함된 문항을 풀 때 핵심 주의점은?

A) 기술적으로 작동하는 보기 아무거나 고른다  
B) 여러 보기가 작동하더라도 한정어 기준(비용)에서 최선인 하나만 정답이므로, 한정어를 기준으로 비교해 고른다  
C) 한정어는 무시해도 된다  
D) 항상 가장 비싼 옵션이 정답이다  

**정답: B**  
해설: 최상급 한정어 문항은 여러 보기가 기술적으로 가능하더라도 그 기준(비용·운영부담·보안)에서 최선인 하나만 정답이므로, 한정어를 명시적 비교 기준으로 삼아야 한다. A·C는 한정어를 무시해 "작동하지만 최선이 아닌" 함정을 고르게 하고, D는 비용 효율과 정반대다.

---

**문제 5.** 시험 직전 마지막 복습 방법으로 가장 효과적인 것은?

A) 처음 보는 새 서비스 문서를 길게 읽어 지식을 추가한다  
B) 이미 아는 키워드→기능 매핑을 인출 연습(소리 내어 매핑)하며 회상 경로를 다진다  
C) 밤을 새워 모든 강의를 다시 본다  
D) 아무 준비 없이 직관에만 의존한다  

**정답: B**  
해설: 시험 직전에는 새 정보를 추가하기보다 이미 학습한 내용을 인출(능동 회상)하는 연습이 시험장 회상에 가장 효과적이다. A는 단기간에 소화하기 어렵고, C는 수면 부족으로 컨디션을 해치며, D는 준비를 활용하지 못하는 방법이다.

---


## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
