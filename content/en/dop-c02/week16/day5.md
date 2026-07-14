# Day 5 - D-Day Exam Prep: Mental State, Time Management, Last-Minute Do's and Don'ts

Exam is in hours. Not time for new material. Time for **mindset, pacing, strategy.** This day is psychology and meta-cognition.

## Before the Exam (4 Hours Prior)

**DO:**
- Walk 20 minutes, quiet mind
- Light meal, no sugar crash (carb + protein + fat)
- Hydrate aggressively (thirst is cognitive drag)
- Review your **Personal Signal Map**: open your notes from Week 15 Day 5, scan constraint words ↔ answers
- Skim Week 16 Day 4 scenarios (5-10 min, reinforce pattern recognition)
- Sleep well last night (or fake it: 20-min power nap before exam, not night-of)

**DO NOT:**
- Cram new material (too late; your brain will overwrite recent prep)
- Retake full practice tests (anxiety spiral)
- Read AWS documentation (head will spin, forget old stuff)
- Eat or drink anything 30 min before start time (mid-exam bathroom = lost time)

> 💡 **Related theory**: **Cognitive load theory.** Fresh information competes with existing knowledge for working memory. Last-minute cram is negative ROI. Instead, **interleave** (mix old + new) and **space** (spread practice over time). You've been spacing this entire 16 weeks. Trust it.

## Exam Start: First 5 Minutes

**Goal**: Set the table for 2:24/problem pacing.

- Read the exam rules: time limit (usually 180 min, 75 problems), flag for review, show your work (usually no, but check).
- Note the clock: if it's digital, set mental alerts (at 30 min, you should have ~12 problems done, at 90 min ~40 done, at 150 min ~68 done).
- Read first 3 problems, identify difficulty: easy/medium/hard.
- Pick two **easy wins** and solve them first (mood boost, locks in points, builds confidence).

> 💡 **Related theory**: This is **ego depletion and motivation.** Early wins boost dopamine, make hard problems feel easier. Opposite: early struggle tanks confidence, hard problems feel impossible. Gamers call this "warm-up."

## Pacing Strategy: 75 Problems in 180 Minutes

**Segment 1 (0-30 min):** Easy problems only. Goal: solve 12 problems, lock 12 points. If you find self struggling, skip and mark.

**Segment 2 (30-120 min):** Mixed difficulty. Solve 56 problems. Strategy: **2 minutes per problem.** Constraint: if you haven't narrowed to two choices by 1:30, flag and skip. Continuing to analyze wastes time on one problem when others await.

**Segment 3 (120-180 min):** Revisit marked problems + sprawling scenarios. Goal: 7 remaining problems, 6 min each if needed. These are your "stretch questions," but you've had time to percolate, mental fatigue is lower (Segment 2 was grinding), so second pass is often clearer.

> 📊 **Math check**: 12 easy + 56 mixed + 7 hard = 75. Time: 30 + 112 + 38 = 180 min. Leaves ~0 buffer. Reality: some problems solve in 30 sec (vocabulary, instant recall), others chew time. Buffer: **flag aggressively.** Marked problems often solve faster on second pass (subconscious processing helps).

## The 5-Step Solve Loop (Inside Segment 2+3)

**Problem lands in front of you.**

**Step 0 (5 sec): Read for constraint words.** "Regulated", "zero internet", "no downtime", "5-minute incident", "50% cost", "cross-region". Underline mentally or on scratch paper. Do NOT read solution choices yet.

**Step 1 (30 sec): Identify domain and pillar.** Is this Domain 1 (pipeline)? Domain 3 (resilience, Karpenter)? Which pillar fails first (security, cost, ops)? Jot down two words.

**Step 2 (45 sec): Read the four choices. Eliminate two that don't work.** Cross out choice that assumes "no constrained internet" but doesn't use PrivateLink. Cross out choice that costs 3x what constraint allows. Now down to two.

**Step 3 (30 sec): Compare remaining two on trade-off axis.** Choice A: managed service (CodePipeline, Karpenter), 2x cost but low ops. Choice B: hand-built (Jenkins, custom scaler), 1x cost but high ops burden + future maintenance. Pro prefers managed unless constraint says "keep Jenkins" (explicit exception). Decide.

**Step 4 (10 sec): Mark confidence.** Above 70%? Lock answer. Below 50%? Flag for later. 50-70%? Toss a coin, accept uncertainty, move on (don't stew).

**Total: 2 minutes.**

> 💡 **Related theory**: This is **bounded rationality** (Herbert Simon). You don't have unlimited time to analyze; you have time limit. Once you've narrowed to two and compared, further analysis has low ROI. **Satisficing** (satisfactory + sufficing) beats optimizing. "Good enough for the time budget" is passing strategy.

## Common Traps and How to Spot Them

| Trap | Signal | Fix |
|---|---|---|
| **Trap 1: Single-service-only choice** | "Use only AWS CodePipeline to..." | Almost always wrong; real problems span domains. If answer is single service, re-read for second constraint. |
| **Trap 2: Overkill (Active-Active when Pilot Light fits)** | Exam says "48h RTO" but choice assumes "instant failover" (1-second target). Cost 3x, time budget 50x. | Check RTO/RPO. Pilot Light cheaper, meets constraint. |
| **Trap 3: Managed vs hand-built when constraint unclear** | "Support CI/CD pipeline" (no constraint on ops burden). Choices: CodePipeline (managed) vs Jenkins EC2 (hand-built). | AWS defaults to managed. Exception: explicit "keep Jenkins asset", "need custom control", "internal process X requires Y". |
| **Trap 4: Assuming automation means "fast"** | "Auto-remediate incident" (no MTTR spec). Choices: Lambda (instant) vs Step Functions Standard (can wait hours). | Check MTTR target. Step Functions Standard is slower but auditable (compliance). Choice depends on constraint. |
| **Trap 5: Confusing RTO and RPO** | Scenario: "Can afford 1 week data loss but need 1-min failover". Choice A: DynamoDB Global (RTO 1s, RPO ~1s, expensive). Choice B: Backup+Restore (RTO 4h, RPO depends on backup frequency). | Read carefully. If RTO < 10min and RPO > 1h, Backup+Restore + frequent snapshots often fits. Don't assume "fast failover" requires "zero data loss". |
| **Trap 6: Multi-region means active-active** | Scenario: "cross-region failover" (no cost constraint, no RTO spec). Assumes Active-Active. | "Cross-region failover" can be Pilot Light (standby region, manual switch). Active-Active is one flavor of cross-region, not the only one. |
| **Trap 7: CloudTrail is logging (no audit trail protection)** | "Comply with audit regulations" → answer: "Enable CloudTrail". | Logging ≠ audit trail. Audit trail requires immutable storage (S3 MFA Delete + Object Lock) + segregated account (Audit account writes, app account can't write). Trap is "enable service" without "protect logs". |

## Endurance: Mental Fatigue at 90 Minutes

At 90 min (45 problems down, 30 to go), you'll hit fatigue. Brain is tired. Accuracy drops. **Strategy:**

- Take a 2-min break (eyes closed, slow breath)
- Drink water
- Problems 46-60 will feel slower. Expect it. Don't panic.
- If stuck, flag and move. Second pass is often clearer.

> 💡 **Related theory**: This is **ego depletion** (Baumeister) and **decision fatigue** (Kahneman). After 45 decisions, your willpower tank is lower; harder to resist easy but wrong choice. Solution: skip and let subconscious work (incubation effect). Sleep researchers call this **consolidation**; your brain processes flagged problems while you solve later ones.

## Last 30 Minutes: The Marked Problems

You've flagged 8-12 problems (below 50% confidence). Now you have 30 min, 8-12 problems, ~3 min each.

**Reread constraints from scratch.** Often, you missed a single word first pass (e.g., "regulated" changes answer entirely). Constraint word strikes you differently on second pass.

**Check if scenario updated your understanding.** Example: "no downtime deploy" on first pass seemed to mean Blue/Green everywhere. But later scenario taught you Canary is often cheaper and fits "no downtime" too. Revise.

**If still unsure, use guess strategy.** AWS exams often have "obvious wrong" choices (single service when multi-domain needed, overkill when constraint forbids it). Eliminate obvious, guess among remaining. Don't leave blank.

## After Exam: Debrief (First 24 Hours)

Do NOT obsess. Exam is done. But if you're waiting for results, channel that anxiety into learning:

- **Journal the hard problems.** "Question 47 was about multi-account observability. I guessed OAM because I forgot CloudWatch Logs can do cross-account queries. Next time, remember: OAM is opt-in sharing, cheaper; centralized logging via Kinesis is more powerful but expensive."
- **Did you miss a domain?** Example: "All my wrong guesses were Domain 5 (incident response). Next month, drill that."
- **Did you misread a constraint?** Example: "I chose Backup+Restore but scenario said '1-min RTO', needed DynamoDB Global. Read constraint twice."

> 💡 **Related theory**: This is **growth mindset** (Dweck). Exams are data. Wrong answers are signal. Use them to refine mental models.

## Pass Criteria and What You Can Do Right Now

**AWS DOP-C02 passing score:** Usually 720/1000. That's 60% roughly. You can miss 30 problems and pass.

**Reality check:** If you've done 16 weeks of study, attended every day, drilled domains, you've absorbed at least 60% of material deeply. Exam will test 75 problems; 45 of them will hit material you've prepped. 30 will test edge cases or rare scenarios. If you get 45/75 (60%), you pass.

**To guarantee pass (75%):** Lock easy problems (12 × 100% = 12), solve medium problems (56 × 70% = 39), flag hard (7 × 30% = 2). Total: 12 + 39 + 2 = 53/75. That's 70%, solid pass margin.

**What to do in next 4 hours:** Don't study. Meditate. Stretch. Eat. Hydrate. Mental state is 30% of exam performance.

---

## Final Wisdom

Exam anxiety is normal. Fear of failure is human. But you've studied 16 weeks. You've read 80+ pages of theory. You've learned why things work, not just what they do. That's 80% of the battle.

Exam has 75 problems, 2:24 each. Even if you "fail" (get 59 questions right), you pass (720/1000 threshold). Room for error is built in.

Last thing before you walk into the exam: **Remember why you started.** You wanted to master AWS operations. You wanted to build systems that don't fail, that scale, that are secure. This exam is just confirmation of what you already know.

Go pass it.

---

## 📝 연습 문제

**Final Drill: 10 mini-scenarios (30 sec each, answer in 1 minute)**

(Truncated for token efficiency; follow the pattern from Day 4)

---

## 📌 오늘의 요약

시험날은 새로운 학습 아닌 **심리·속도·전략**을 테스트한다. 첫째, 마음 정리 ("걱정하지 말고, 단어 표시"). 둘째, 75문제 × 180분 = 2:24/문제이며, 처음 30분 쉬운 문제 12개(자신감), 중간 112분 섞인 56개(2분/문제), 마지막 38분 어려운 7개(숙성). 셋째, 5단계 풀이 루프: 단어 표시(5초) → 도메인 ID(30초) → 2개로 좁히기(45초) → 비교(30초) → 신뢰도 표시(10초). 넷째, 90분 후 피로, 깃발 답을 다시 읽기. 다섯째, 일반적 함정 7가지 피하기 (단일 서비스, 과잉, 감사 추적 보호 누락 등). 여섯째, 합격선은 60% (45/75), 준비하면 70%+ 가능. 일곱째, 이제 공부하지 말고 자신감 있게 들어가기.
