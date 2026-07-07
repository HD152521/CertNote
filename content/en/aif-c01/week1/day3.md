# Day 3 - Problems Where ML Fits vs. Problems Where It Doesn't

## Introduction

Machine learning is powerful, but **it is not a universal tool suited to every problem**. Today we will learn the criteria for distinguishing problems that suit machine learning well from those that do not, and compare how it differs from the traditional programming approach.

This judgment is very important in practice, because it is common to "adopt machine learning where it wasn't needed, only to increase costs and get worse results." The exam also frequently asks questions like "Is machine learning appropriate for this scenario?"

## Traditional Programming vs. Machine Learning

First, let's sort out the fundamental difference between the two approaches.

| Aspect | Traditional programming | Machine learning |
|------|------------------|----------|
| Who creates the rules | Humans (developers) | Learned from data |
| Input | Data + rules | Data + answers (examples) |
| Output | Results (answers) | Rules (a model) |
| Suitable situations | Rules are clear and unchanging | Rules are complex or hard for humans to define |

In traditional programming, "a human writes the rules and the computer executes them as-is." In contrast, the key difference with machine learning is that "given data and answer examples, the computer produces the rules (a model)."

> 💡 **Related theory**: Traditional programming is `data + rules → results`, while machine learning is `data + results → rules`. It's easy to remember if you think of the inputs and outputs as swapped.

## Problems Where Machine Learning Fits

The more of the following conditions are met, the better a choice machine learning is.

1. **The rules are too complex or too hard for a human to write out one by one**
   - Example: It is practically impossible for a human to write code rules for recognizing a cat in a photo.
2. **Patterns exist but are hard to express explicitly**
   - Example: The characteristics of spam email keep changing and are subtle, making them hard to pin down as fixed rules.
3. **Sufficient quantity and quality of data is available**
   - You need plenty of historical data (examples) to train on.
4. **Some margin of error is acceptable**
   - Machine learning is not 100% accurate. It gives probabilistically good answers.
5. **The rules must change as circumstances change**
   - The model can be retrained on new data to adapt to change.

### Suitable Examples

- Image/speech/natural language recognition
- Recommendation systems (products, movies)
- Spam and fraud detection
- Demand and price forecasting
- Customer churn prediction

## Problems Where Machine Learning Doesn't Fit

Conversely, in the following cases machine learning is overkill or inappropriate.

1. **The rules are clear and simple**
   - Example: "VAT is 10% of the amount" is just multiplication. No machine learning needed.
2. **There is almost no data**
   - Without enough examples to learn from, machine learning cannot work properly.
3. **100% accuracy and complete explainability are mandatory**
   - When legal or safety requirements allow zero error and every decision must have a clearly explained basis, machine learning — probabilistic and sometimes a "black box" — can be risky.
4. **Simple calculation or lookup is sufficient**
   - Database lookups, fixed formula calculations, and the like are more accurate and cheaper with the traditional approach.

### Unsuitable Examples

| Problem | Better approach | Reason |
|------|-------------|------|
| Computing the sum of two numbers | Traditional programming | The rule is clear |
| Calculating a 10% tax | Traditional programming | Simple formula |
| Looking up employee info by employee ID | Database lookup | An exact lookup is sufficient |
| A prediction with only 10 data records | Acquire data first | Insufficient training data |

> 💡 **Related theory**: Avoid the misconception that "machine learning is always smarter." Applying machine learning to problems with clear rules can increase costs and actually reduce accuracy. **Choosing the simplest method that is sufficient** is good design.

## Decision Flowchart

Here is a quick order of checks for deciding whether to adopt machine learning.

```
Can a human write the rules easily and clearly?
   └ Yes → Use traditional programming (machine learning unnecessary)
   └ No ↓
Is there enough data to train on?
   └ No → Acquire data first (machine learning is difficult for now)
   └ Yes ↓
Is some margin of error acceptable?
   └ No → Review carefully (machine learning may be risky)
   └ Yes → Machine learning is likely a good fit
```

## Striking a Realistic Balance

In practice, the two approaches are often **used together**. For example, clear rules are handled with traditional code, and only the complex judgments are delegated to machine learning. What matters is the perspective of "picking the right tool for the problem," not "only one of the two is correct."

## Today's Summary

- Traditional programming is `data + rules → results`; machine learning is `data + results → rules`.
- Machine learning fits when the rules are complex, data is plentiful, and some margin of error is acceptable.
- It can be a poor fit when the rules are clear, data is scarce, or 100% accuracy is mandatory.
- Choosing the simplest method that is sufficient is good design.

## 📝 연습 문제

**문제 1.** For which of the following problems is traditional programming more appropriate than machine learning?

A) Recognizing cats in millions of photos  
B) Detecting ever-changing spam email  
C) Calculating tax by multiplying an input amount by a fixed 10% rate  
D) Recommending products based on a customer's purchase history  

**정답: C**  
해설: Multiplying by a fixed tax rate is a clear, simple calculation, so traditional programming is more accurate and cheaper. Image recognition, detecting evolving spam, and recommendations involve rules that are complex or hard to define, making machine learning appropriate.

---

**문제 2.** Which statement most accurately describes the input/output relationship of traditional programming and machine learning?

A) Both take data and rules as input and output results  
B) The traditional approach produces results from data + rules, while machine learning produces rules from data + results  
C) Machine learning takes rules as input and generates data  
D) The traditional approach produces results without any data  

**정답: B**  
해설: Traditional programming produces results from human-made rules and data, while machine learning learns rules (a model) from data and answer (result) examples. The key point is that the input/output relationship is reversed between the two.

---

**문제 3.** In a certain business task, there are only a handful of historical records available for training, and the results must be legally 100% accurate and fully explainable. Which judgment is most appropriate for this situation?

A) Adopt machine learning immediately, since it is always more accurate even with little data  
B) Machine learning may be unsuitable due to the lack of data and the requirement for complete accuracy and explainability  
C) Using reinforcement learning solves it perfectly even without data  
D) There is no problem since machine learning always guarantees explainability  

**정답: B**  
해설: A situation with very little training data, no tolerance for error, and a requirement to fully explain every decision can be unsuitable for machine learning, which is probabilistic and sometimes a black box. Claims that machine learning is always more accurate or always explainable are incorrect.

---

**문제 4.** Which of the following is hard to consider a characteristic of problems suited to adopting machine learning?

A) The patterns are so complex that humans struggle to write explicit rules  
B) Sufficient quantity and quality of training data is available  
C) Some prediction error is acceptable  
D) The rules are very simple and unchanging, and a simple calculation suffices  

**정답: D**  
해설: Problems whose rules are simple, unchanging, and solvable with a simple calculation are better suited to traditional programming. Complex patterns, sufficient data, and tolerance for some error are the typical conditions where machine learning fits.

---
