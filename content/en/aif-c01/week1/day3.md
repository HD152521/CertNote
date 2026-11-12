# Day 3 - Problems Where ML Fits vs. Problems Where It Doesn't

## 📌 Key Takeaways

- Traditional programming is `data + rules → results`, while machine learning is `data + results → rules`. **The input and output are swapped.**
- ML is a **good fit** when the rules are too complex for humans to write down, there is enough data, and a small margin of error is acceptable.
- ML is a **poor fit** when the rules are simple and clear, there is almost no data, or 100% accuracy and a complete explanation are mandatory.
- Choosing the **simplest method that is still sufficient** is good design. A more complex technology is not automatically the right answer.
- In practice, clear rules are often written as code and only the complex judgments are handed to ML, so the two are **used together**.

## Traditional Programming vs. Machine Learning

Machine learning is powerful, but it is not a cure-all. In practice, cases are common where ML was adopted without any real need, so costs went up and the results were worse.

| Aspect | Traditional programming | Machine learning |
|------|------------------|----------|
| Who creates the rules | A person (the developer) | Learned from data |
| Input | Data + rules | Data + answers (examples) |
| Output | Results (answers) | Rules (a model) |
| Suitable situations | Rules are clear and do not change | Rules are complex or hard for humans to define |

- Traditional programming: a person writes the rules, and the computer executes them exactly as written.
- Machine learning: you give the computer data and example answers, and it produces the rules (a model).

Traditional programming is `data + rules → results`, and machine learning is `data + results → rules`. It is easy to remember if you think of it as the input and output being swapped.

## Problems Where Machine Learning Fits

The more of the following conditions are met, the better a choice machine learning is.

1. **The rules are too complex, or too hard for a person to write out one by one** — writing code rules to recognize a cat in a photo is practically impossible.
2. **Patterns exist but are hard to express explicitly** — the characteristics of spam email keep changing and are subtle, so they are hard to pin down as fixed rules.
3. **There is enough data of sufficient quality** — you need plenty of historical data (examples) to train on.
4. **A small margin of error is acceptable** — machine learning is not 100% accurate; it gives probabilistically good answers.
5. **The rules must change when circumstances change** — the model can be retrained on new data to adapt to change.

### Examples of a Good Fit

- Image, speech, and natural language recognition
- Recommendation systems (products, movies)
- Spam and fraud detection
- Demand and price forecasting
- Customer churn prediction

## Problems Where Machine Learning Doesn't Fit

Conversely, in the following cases machine learning is overkill or inappropriate.

1. **The rules are clear and simple** — "VAT is 10% of the amount" is just a multiplication.
2. **There is almost no data** — with too few examples to learn from, it will not work properly.
3. **100% accuracy and a perfect explanation are mandatory** — when legal or safety requirements allow no error and the basis for every decision must be explained, machine learning, which is probabilistic and sometimes a "black box," can be risky.
4. **Simple calculation or lookup is enough** — database lookups and fixed formula calculations are more accurate and cheaper with the traditional approach.

### Examples of a Poor Fit

| Problem | Better approach | Reason |
|------|-------------|------|
| Computing the sum of two numbers | Traditional programming | The rule is clear |
| Calculating a 10% tax | Traditional programming | A simple formula |
| Looking up employee information by employee ID | Database lookup | An exact lookup is enough |
| A prediction based on only 10 data records | Acquire data first | Not enough training data |

> 💡 **Related theory**: Avoid the misconception that "machine learning is always smarter." Applying machine learning to a problem with clear rules can raise costs and even lower accuracy. **Choosing the simplest method that is still sufficient** is good design.

## Decision Flowchart

This is a quick sequence for checking whether to adopt machine learning.

```
Can a person write the rules easily and clearly?
   └ Yes → Use traditional programming (ML is unnecessary)
   └ No ↓
Is there enough data to train on?
   └ No → Get data first (ML is difficult for now)
   └ Yes ↓
Can a small margin of error be tolerated?
   └ No → Review carefully (ML may be risky)
   └ Yes → ML is likely a good fit
```

## Two "Poor Fit" Signals the Exam Guide Points To

The AIF-C01 exam guide gives **cost-benefit analysis** and **cases that need a fixed outcome rather than a prediction** as examples of situations where AI/ML is not a good match.

### 1) You need a "fixed outcome," not a prediction

- A machine learning answer is a **prediction**. It means "probably this," and even for the same kind of input it is occasionally wrong.
- Traditional code, on the other hand, is **deterministic**. The same input always gives the same result, and you can point to a single line of code to show why.

| Task | What is needed | Right approach |
|------|----------|----------|
| Calculating the income tax to withhold from a salary | The single value set by law | Traditional programming |
| Checking an account balance, deducting a transfer amount | A value that cannot be wrong by even one unit of currency | Traditional programming |
| Checking whether a password matches | A definite yes or no | Traditional programming |
| The likelihood that this transaction is fraud | An estimate of a likelihood | Machine learning |
| Expected number of visitors next month | An estimate of an uncertain future | Machine learning |

- A rule of thumb: if you can say the answer is "**calculated or looked up**," use the traditional approach; if you have to say it is "**estimated or singled out**," it is a candidate for machine learning.

### 2) The cost-benefit does not add up

Machine learning does not cost only the price of building a model. You have to add up everything below and weigh it against the benefit you get.

| Cost | Details |
|---------|------|
| Data | Collecting, cleaning, and attaching answers (labels) |
| Training | Compute resources and time, and many rounds of trial and error |
| Operations | The cost of keeping it running in a service, monitoring performance, periodic retraining |
| People | Specialists, and staff to review the results |

- If you build a model to auto-classify 20 inquiries a month, it is far cheaper for a person to just read them. **When the volume is small, the benefit of automation is also small.**
- Even for a problem where a few lines of rules already solve 95%, adding a model to raise that to 97% means checking whether those 2 percentage points are worth more than the operating cost.

## Conversely, Three Ways AI/ML Adds Value

The exam guide gives **assisting human decision-making, scalability of solutions, and automation** as examples of where it adds value.

| Direction | Meaning | Example |
|------|-----|-----|
| Decision support | A person makes the decision, while the model narrows down evidence and candidates | Marking suspicious areas in a medical scan for the doctor to review |
| Scalability | Raise throughput without adding headcount | Checking millions of payments a day in real time |
| Automation | Take repetitive judgments off people's hands | Automatically routing incoming inquiries to the right department |

## Judging by Scenario

| Scenario | Verdict | Reason |
|----------|------|------|
| Free shipping when the order total is 50,000 KRW or more | Traditional programming | The rule is one line, and the outcome is fixed |
| Read a handwritten address and convert it to text | Machine learning | A person cannot write rules for handwriting styles |
| Apply a discount rate by membership tier | Traditional programming | Looking up a table is all it takes |
| Pick out, from millions of customers, those who will cancel next month | Machine learning | The patterns are complex and there is a lot of past data |
| In the first week of a startup, predict demand from 30 customer records | Not suitable for now | There is not enough data; build it up first |
| Fully automate eligibility decisions where the law requires giving reasons | Proceed carefully | A complete explanation is needed; use rules or add human review |
| Auto-classify a handful of documents a month | Not suitable | The cost does not justify the benefit |
| Pick out defective products from photos (tens of thousands of defect photos on hand) | Machine learning | Complex visual patterns + enough data |

## Striking a Realistic Balance

- In practice, the two approaches are often **used together**. Clear rules go into traditional code, and only the complex judgments are left to machine learning.
- The important perspective is not "only one of the two is right" but **"pick the tool that fits the problem."**

> 📚 **Case**: In a card payment approval system, "decline if over the limit" and "decline a card reported lost" are policies that must be enforced without exception, so they are put in as **code**. "Is this an unusual, suspicious payment?" is hard to write as rules, so **machine learning** scores it. Cases where the score is ambiguous are checked by a **person**. Three layers sit one on top of the other in a single system.

## Traditional ML Models vs. Foundation Models

Even after deciding to use machine learning, there is one more choice left. The exam guide asks you to tell which of a traditional ML model and a foundation model (FM) fits, based on **regulation, explainability, and operational constraints**.

| Comparison axis | Traditional ML model | Foundation model (FM) |
|---------|---------------|--------------------|
| What it was built for | Trained for one task (for example, predicting delinquency) | Pretrained on huge amounts of data and used generally across many tasks |
| What it does well | Classification and numeric prediction on tabular data | Generating text and images, summarization, question answering |
| Explaining results | Relatively easy to show which features had an influence | Hard to explain why a given sentence came out |
| Size and operation | Small, fast, and cheap | Large; response latency and usage cost must be weighed |
| Fitting situations | Decisions that need justification, such as screening and scoring in regulated industries | Work that needs flexible expression, such as drafting and handling customer conversations |

- "The basis for a loan screening result must be explained to a regulator" → the explainable traditional ML side.
- "We have to answer customer inquiries in natural sentences" → the foundation model side.
- Foundation models themselves are covered in Week 3. For today, just remember that it is **not "generative AI is the latest, so always choose it."**

## Correcting Common Misconceptions

- **"If you have lots of data, machine learning will work"** → Before the amount, look at **whether answers are attached and whether the data is skewed**. One million records you cannot use are the same as zero.
- **"Once a model is built, you're done"** → When the world changes, the model goes stale too. Monitoring and retraining costs keep coming.
- **"If you use machine learning, you don't need rules"** → Policies that must be followed are still fixed in code. The model takes the ambiguous judgments outside of them.
- **"If you can't tolerate error, you can never use machine learning"** → It can be used in a **decision-support** form, where the model only narrows down candidates and a person makes the final decision.

## 📖 Glossary

- **Traditional programming**: An approach where a person writes rules as code and the computer executes them exactly as written.
- **Model**: The bundle of rules machine learning finds in data. It is the product of training.
- **Training data**: The past data used to teach a model, together with its answers.
- **Data quality**: How accurate, complete, and unbiased the data is. It matters as much as the amount of data.
- **Probabilistic**: Does not guarantee the same correct answer every time, and answers "this is likely."
- **Black box**: A state where an answer comes out but a person has difficulty explaining why.
- **Explainability**: The property of being able to give the basis for why a model made a decision. Especially important in finance, healthcare, and law.
- **Churn prediction**: The task of predicting in advance whether a customer will stop using a service. A typical ML use case.
- **Fraud detection**: The task of picking out abnormal transactions, such as in card payments.
- **Foundation model (FM)**: A large model pretrained on huge amounts of data so it can be used broadly across many tasks. It is the basis of generative AI.

## 📝 Practice Questions

**Question 1.** For which of the following problems is traditional programming more appropriate than machine learning?

A) Recognizing cats in millions of photos  
B) Detecting ever-changing spam email  
C) Calculating tax by multiplying an input amount by a fixed 10% rate  
D) Recommending products based on a customer's purchase history  

**Answer: C**  
Explanation: Multiplying by a fixed tax rate is a clear, simple calculation, so traditional programming is more accurate and cheaper. Image recognition, detecting evolving spam, and recommendations involve rules that are complex or hard to define, making machine learning appropriate.

---

**Question 2.** Which statement most accurately describes the input/output relationship of traditional programming and machine learning?

A) Both take data and rules as input and output results  
B) The traditional approach produces results from data + rules, while machine learning produces rules from data + results  
C) Machine learning takes rules as input and generates data  
D) The traditional approach produces results without any data  

**Answer: B**  
Explanation: Traditional programming produces results from human-made rules and data, while machine learning learns rules (a model) from data and answer (result) examples. The key point is that the input/output relationship is reversed between the two.

---

**Question 3.** In a certain business task, there are only a handful of historical records available for training, and the results must be legally 100% accurate and fully explainable. Which judgment is most appropriate for this situation?

A) Adopt machine learning immediately, since it is always more accurate even with little data  
B) Machine learning may be unsuitable due to the lack of data and the requirement for complete accuracy and explainability  
C) Using reinforcement learning solves it perfectly even without data  
D) There is no problem since machine learning always guarantees explainability  

**Answer: B**  
Explanation: A situation with very little training data, no tolerance for error, and a requirement to fully explain every decision can be unsuitable for machine learning, which is probabilistic and sometimes a black box. Claims that machine learning is always more accurate or always explainable are incorrect.

---

**Question 4.** Which of the following is hard to consider a characteristic of problems suited to adopting machine learning?

A) The patterns are so complex that humans struggle to write explicit rules  
B) Sufficient quantity and quality of training data is available  
C) Some prediction error is acceptable  
D) The rules are very simple and unchanging, and a simple calculation suffices  

**Answer: D**  
Explanation: Problems whose rules are simple, unchanging, and solvable with a simple calculation are better suited to traditional programming. Complex patterns, sufficient data, and tolerance for some error are the typical conditions where machine learning fits.

---
