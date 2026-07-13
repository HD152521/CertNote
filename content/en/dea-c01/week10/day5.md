# Day 5 - Final D-Day Prep: Exam Structure, Time Management & Scenario Breakdown Strategy

This is our last day. Instead of cramming new concepts, today we lock in **exam structure, time strategy, and problem-solving technique** so you walk into the test room confident and composed. DEA-C01 tests not the depth of your knowledge but your **speed and poise in translating requirements into the right AWS service**. Today is your final checklist.

## Exam Structure at a Glance

| Aspect | Details |
|------|------|
| Total questions | 65 (50 scored + 15 unscored) |
| Time | 130 minutes |
| Passing score | 720 / 1000 (scaled score on 100–1000 scale) |
| Question types | Single-select (4 choices), multi-select (5+ choices, select 2–3) |
| Domain 1 (Ingestion & Transformation) | ~34% |
| Domain 2 (Storage Management) | ~26% |
| Domain 3 (Operations & Support) | ~22% |
| Domain 4 (Security & Governance) | ~18% |

> 💡 **Related theory**: Scores are scaled — each question has a different weight, and you won't know which 15 of the 65 are unscored. Don't assume "this hard one might not count." Treat every question equally. If you get stuck, flag it and move on.

## Time Management Strategy

- **Total 130 minutes ÷ 65 questions = ~2 minutes per question.** Simple mapping questions take 30–60 seconds; save time for the hard ones.
- **First pass (~90 minutes)**: Solve quickly. Stuck questions get flagged for review; move to the next immediately. Never spend more than 3 minutes on one question.
- **Second pass (~30 minutes)**: Revisit flagged questions. Confirm answers you feel confident about.
- **Third pass (~10 minutes)**: Final check—verify multi-select questions have the right *number* of selections, no blank answers.

> 💡 **Related theory**: A blank answer is a guaranteed zero. Even if you're unsure, always select *something*. Running short on time? In your final minutes, fill all blanks with your best guess for each question—this raises your expected score.

## 4-Step Scenario Breakdown

Master this technique to stay calm with long, complex problems.

1. **Read the question sentence first**: "Most cost-efficient," "minimal operational overhead," "real-time"—these are the *actual* scoring criteria.
2. **Underline constraint keywords**: serverless/real-time/batch/cost/security·encryption/minimal code.
3. **Cross out 2 obvious wrong answers**: Services whose purpose clearly doesn't fit (e.g., DynamoDB for analytical SQL).
4. **Pick the best-fit constraint**: Of the remaining two, which satisfies the constraints *best*? Not "possible"—"most appropriate."

```text
Example: "Ingest tens of thousands of events/sec with minimal ops, store as Parquet in S3"
  Scoring criteria  → minimal ops (serverless)
  Keywords         → streaming / managed ingestion / S3
  Cross out        → always-on EMR, EC2 cron (too much ops)
  Answer           → Data Firehose (automatic buffering, transformation, delivery)
```

## Multi-Select Questions: Critical Details

- Respect the exact count: "select **two** of the following" is strict. If only one or three is correct, partial credit doesn't exist — it's wrong.
- Evaluate each option independently (true/false), then combine.

## D-Day Wellness Checklist

- Night before: No new concepts. Light review of your Day 4 quick-reference sheet and error log only.
- Confirm ID, reservation time, test center (or online proctor environment setup).
- If testing online: clear desk, test webcam, verify network connection beforehand.
- Get adequate sleep. During the test, don't panic at the first difficult question—maintain your pace.

> 💡 **Related theory**: 720 is not "perfect"—it's "competent." Don't lose pace trying to perfect 1–2 questions. Secure the questions you know cold; that's your path to 720+.

## Key Takeaways

- 65 questions / 130 minutes / 720 passing score. Domain weights: 34/26/22/18%.
- ~2 minutes per question. Stuck? Flag it and move. Recovery in pass 2.
- Blanks = automatic fail. Always answer, even if guessing.
- Scenarios: read question → extract constraints → eliminate obvious wrongs → pick best-fit.
- D-Day: review, not learn. Stay rested and composed.

## 📝 연습 문제

**문제 1.** DEA-C01 시험의 구성으로 옳은 것은?

A) 100문항, 180분, 합격 600점  
B) 40문항, 90분, 합격 800점  
C) 65문항(채점 50 + 비채점 15), 130분, 합격 720점  
D) 75문항, 120분, 합격 700점  

**정답: C**  
해설: DEA-C01은 총 65문항(채점 50, 비채점 15)을 130분 동안 풀며 1000점 척도에서 720점이 합격선입니다. 나머지는 실제 구성과 다릅니다.

---

**문제 2.** 시험 중 한 문항에서 4분째 고민하고 있다. 가장 바람직한 행동은?

A) 답을 찾을 때까지 계속 머문다  
B) 그 문항을 비워 둔다  
C) 남은 문항을 모두 같은 보기로 찍는다  
D) 잠정 답을 고르고 검토 표시 후 다음 문항으로 넘어간다  

**정답: D**  
해설: 문항당 평균 2분 페이스를 지키려면 막히는 문항은 잠정 답을 표시하고 넘어간 뒤 2차 검토에서 다시 봅니다. 무한정 머물면 쉬운 문항을 놓치고, 비워 두면 회수 기회를 잃습니다.

---

**문제 3.** "다음 중 두 가지를 고르시오"라는 복수응답 문항에서 한 가지만 확신할 때 가장 적절한 대응은?

A) 한 가지만 선택해 제출한다  
B) 나머지 보기들을 독립적으로 참/거짓 판단해 가장 타당한 두 번째를 함께 고른다  
C) 무조건 세 개를 고른다  
D) 그 문항을 비운다  

**정답: B**  
해설: 복수응답은 요구된 개수를 정확히 채워야 점수가 인정됩니다. 보기를 각각 독립적으로 평가해 가장 타당한 조합을 만들어야 하며, 개수 미달·초과나 미응답은 오답 처리됩니다.

---

**문제 4.** 긴 시나리오 문제를 가장 효율적으로 분해하는 순서로 옳은 것은?

A) 질문(마지막 문장) 먼저 → 제약 키워드 추출 → 명백한 오답 소거 → 제약 최적화 선택  
B) 본문을 처음부터 끝까지 정독한 뒤 보기를 본다  
C) 보기를 먼저 외운다  
D) 가장 긴 보기를 정답으로 고른다  

**정답: A**  
해설: 질문을 먼저 읽어 채점 기준(비용·운영·실시간 등)을 파악하고, 제약 키워드로 오답을 소거한 뒤 제약을 가장 잘 만족하는 보기를 고르는 것이 시간 효율과 정확도를 높입니다. 보기 길이는 정답과 무관합니다.

---

**문제 5.** 시험 종료 5분 전 미응답 문항이 3개 남았다. 가장 합리적인 행동은?

A) 시간이 없으니 그대로 제출한다  
B) 한 문항만 신중히 풀고 나머지는 비운다  
C) 남은 문항에 가장 그럴듯한 보기를 골라 모두 답을 채운다  
D) 이미 푼 답을 모두 지운다  

**정답: C**  
해설: 빈 답은 확정 오답이므로 시간이 부족해도 미응답 문항은 가장 그럴듯한 보기로 모두 채워 기대 점수를 높입니다. 비워 두거나 기존 답을 지우는 것은 점수를 잃는 행동입니다.

---
