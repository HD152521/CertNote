# Day 1 - The Relationship and Differences Between AI, Machine Learning, and Deep Learning

## 📌 Key Takeaways

- **AI ⊃ Machine Learning ⊃ Deep Learning** — a nested relationship, with smaller circles inside a bigger one.
- **AI**: any technology that imitates intelligent behavior. This includes systems where a person writes the rules by hand.
- **Machine learning**: a method where nobody writes the rules; the system **learns them from data**.
- **Deep learning**: a type of machine learning that stacks neural networks into many deep layers. It needs large amounts of data and GPUs.
- All deep learning is machine learning, but **not all AI is machine learning**. Generative AI and agentic AI are also applications that live inside the deep learning circle.

## The Nested Relationship of the Three Concepts

**AI / ML / DL** are used as if they meant the same thing in news and advertising, but in reality they are nested: smaller circles inside a bigger one.

![Diagram showing machine learning inside AI and deep learning inside machine learning](/diagrams/en/ai-ml-dl-nesting.svg)

- **Artificial Intelligence (AI)**: the broadest concept. Any technology that imitates intelligent human behavior.
- **Machine Learning (ML)**: one way to implement AI. A technology that "learns" rules from data.
- **Deep Learning (DL)**: a type of machine learning. A technology that learns by stacking artificial neural networks in many layers.

## 1. What Is Artificial Intelligence (AI)?

- Goal: to make machines think or act like people — it is the broadest field.
- It includes not only machine learning but also **approaches where a person writes in every rule one by one (rule-based systems)**.
- Example: an automatic thermostat that works only on "turn on the air conditioner when the temperature exceeds 28 degrees" → even without learning from data, it is an early form of AI in the broad sense.

## 2. What Is Machine Learning (ML)?

- Instead of a person writing out every rule, you **show it data and let the machine find the rules (patterns) on its own**.

| Aspect | Rule-based programming | Machine learning |
|------|---------------------|----------|
| Who creates the rules | A person | The machine, learning from data |
| Input | Data + rules | Data + answers (examples) |
| Output | Results | Rules (the model) |
| Adapting to new situations | The rules have to be rewritten | Can be retrained with new data |

**Spam filtering example**

- Rule-based: a person writes the conditions by hand, such as "if the subject contains 'free', it is spam" → when senders change their wording, you have to keep fixing the rules.
- Machine learning: show it tens of thousands of spam and normal emails, and it learns on its own which features indicate spam.

## 3. What Is Deep Learning (DL)?

- It stacks **artificial neural networks** in many layers (deep, hence the name) to learn complex patterns. The idea comes from the structure of neurons in the human brain.
- It is especially powerful on highly complex, unstructured data such as images, speech, and natural language.
- In exchange, it comes with these burdens.
  - It needs **a lot of data**.
  - It needs **powerful compute resources (such as GPUs)**.
  - The learning process looks like a "black box," so it is often hard for people to understand the results.
- **Generative AI (ChatGPT, image generation, etc.)**, which gets so much attention today, is also entirely based on deep learning → we will cover it in more detail in later weeks.
- After neural network models showed overwhelming performance at the 2012 image recognition competition (ImageNet), the combination of large amounts of data and GPU compute made deep learning mainstream.

## Sorting It Out with Everyday Examples

| Example | Category | Reason |
|------|------|------|
| Automatic thermostat that runs on rules | AI (not machine learning) | Works only on rules made by people |
| Email spam filter | Machine learning | Learns spam patterns from data |
| Smartphone face-recognition unlock | Deep learning | Recognizes face images with a neural network |
| Speech recognition in voice assistants (Siri, Alexa) | Deep learning | Converts speech to text with a neural network |
| Online store product recommendations | Machine learning | Learns taste patterns from purchase data |

## Solving the Same Problem Three Ways

If you hand the single problem "is there a cat in this photo?" to three different approaches, **who decides what** changes.

| Approach | What the person does | What the machine does | Limitation |
|------|---------------|---------------|------|
| Rule-based | Writes out every condition, such as "pointed ears and whiskers means cat" | Checks the written conditions exactly as given | The conditions collapse when angle or lighting changes |
| Traditional machine learning | Chooses **what to look at** (features), such as ear shape or fur color ratio, and extracts them as numbers | Learns the relationship between those numbers and the answers | If the features the person chose are poor, performance is poor |
| Deep learning | Just provides lots of photos and answers | Finds **even what to look at** on its own as the data passes through the layers | Needs lots of data and compute, and it is hard to explain why |

- The practical difference separating machine learning from deep learning is not "whether it uses a neural network" but **whether a person designs the features or the model learns directly from the raw data**.
- Early layers pick up simple shapes such as lines and edges, and later layers pick up complex shapes such as eyes and ears, so the understanding builds up in stages. "Deep" means there are many of these layers.

| Comparison axis | Traditional machine learning | Deep learning |
|---------|----------------|--------|
| Data it suits | Tabular (structured) data | Unstructured data such as images, speech, and text |
| Amount of data needed | Works with relatively little | The more the better, and it struggles with little |
| Compute resources | A regular server is enough | Massive parallel compute such as GPUs |
| Explaining results | Relatively easy | Hard (black box) |
| Typical examples | Customer churn prediction, loan approval scoring | Face recognition, speech transcription, translation |

## Where Do Generative AI and Agentic AI Fit?

The exam guide covers **generative AI** (GenAI) and **agentic AI** in addition to AI, ML, and deep learning, and asks about the differences. Neither is a new field outside the circles; both are **applications that grew inside the deep learning circle**.

| Term | Position in the nesting | One-line distinction | Example |
|------|---------------------|-----------|-----|
| AI | Outermost circle | The whole set of technologies that imitate intelligent behavior | Rule-based chatbots, and everything below |
| Machine learning | Inside AI | Learns rules from data | Spam filter, demand forecasting |
| Deep learning | Inside machine learning | Learns with multi-layer neural networks | Face recognition, speech recognition |
| Generative AI | Inside deep learning | Instead of choosing or predicting, it **creates new content** | Drafting text, generating images, summarization |
| Agentic AI | Uses a generative AI model as its brain | Doesn't stop at giving an answer; it **carries out multiple steps on its own toward a goal** | An assistant that checks a calendar, makes a reservation, and sends a confirmation email |

- Traditional machine learning models mostly produce **answers of a fixed form**, such as "is it spam or not" or "how much is it." Generative AI produces **open-ended outputs** such as sentences and images.
- AWS describes agentic AI as "an autonomous AI system that can act independently to achieve predefined goals." What differs from an ordinary chatbot is that it makes plans and calls tools without a person instructing each step.
- Both topics are covered in depth from Week 3 onward. For now, you only need to pin down their **position within the circles**.

> ⚠️ **Trap**: **Computer vision** and **natural language processing** (NLP) are not a layer of the nesting; they are **application-area names** attached according to "what it is used for." Working with images is computer vision, working with human language is NLP, and today both are mostly implemented with deep learning. Among AWS services, the representatives of each area are Amazon Rekognition for image and video analysis, Amazon Comprehend for text analysis, and Amazon Transcribe for turning speech into text.

## Identifying from Clues in the Question

| If the question says something like this | It points to | Reason |
|--------------------------|------------|------|
| "The person in charge defined the conditions as if-then" | AI (rule-based), not machine learning | There is no learning process |
| "Learns from past transaction data to find patterns" | Machine learning | Obtains rules from data |
| "Tabular customer data, a few thousand records" | Traditional machine learning is enough | With structured, small data, the benefit of deep learning is small |
| "Multi-layer neural network," "feeds raw images or speech directly" | Deep learning | Learns features on its own from unstructured data |
| "Generates new sentences, images, or code" | Generative AI | The output is new content |
| "Given a goal, it makes a plan and finishes the task by calling tools" | Agentic AI | Autonomous multi-step execution |

## Correcting Common Misconceptions

- **"AI = machine learning"** → Some AI, like rule-based systems, has no learning at all. In answer choices, "all AI learns from data" is a false statement.
- **"Anything that uses a neural network is deep learning"** → There are also shallow neural networks. The condition for calling it deep learning is that **many layers are stacked**.
- **"Deep learning is always more accurate"** → With little data or tabular data, simple machine learning is better, cheaper, and easier to explain.
- **"Generative AI is a technology separate from machine learning"** → Because it is a model built with deep learning, it is machine learning and it is AI. The nesting stays intact.
- **"Agentic AI is another name for generative AI"** → Generative AI is the ability to **create** content; agentic AI is a system that uses that ability to **get work done**.

## Why This Distinction Matters

- Exam: it shows up as "Which technology does this scenario correspond to?" and "How does deep learning differ from machine learning?"
- Practice: it is the basis for judging "Do we really need deep learning for our problem, or are simple machine learning or rules enough?"
- **A more complex technology is not always better** — solving a simple problem with a simple method is better for cost and maintenance.

## 📖 Glossary

- **Artificial Intelligence (AI)**: the umbrella term for all technologies that imitate thinking or acting like a person.
- **Machine Learning (ML)**: a method where a person doesn't write the rules; you show the machine data and it finds the rules.
- **Deep Learning (DL)**: machine learning that learns by stacking neural networks into many deep layers. Strong on images, speech, and language.
- **Rule-based system**: a program in which a person writes in every "if this, do that" condition by hand. It has no learning process.
- **Artificial neural network**: a computational structure that imitates neurons in the human brain. It is the building block of deep learning.
- **Unstructured data**: data that is hard to fit neatly into the cells of a table. Photos, speech, text, and so on.
- **Black box**: a state where an answer comes out but it is hard for a person to see why it came out that way.
- **GPU**: a processor that handles the same calculation in massive parallel. It determines how fast deep learning trains.
- **Generative AI**: AI that creates new text, images, and so on. It is based on deep learning.
- **Agentic AI**: an AI system that, given a goal, makes its own plan and carries out multiple steps while using tools.

## 📝 Practice Questions

**Question 1.** Which statement most accurately describes the relationship among artificial intelligence (AI), machine learning (ML), and deep learning (DL)?

A) The three concepts are completely independent and do not overlap  
B) Deep learning is the broadest concept, and machine learning and AI are contained within it  
C) AI is the broadest, machine learning is contained within it, and deep learning is contained within machine learning  
D) Machine learning and deep learning mean the same thing and have nothing to do with AI  

**Answer: C**  
Explanation: AI is the largest category, machine learning is one way to implement AI, and deep learning is a type of machine learning. So the nesting is AI ⊃ ML ⊃ DL. Saying the three are independent, that deep learning is the broadest, or that machine learning and deep learning are identical all reflect a misunderstanding of the nesting.

---

**Question 2.** Which is correct about a system that works because a person has personally written all the rules, such as "if the subject contains a certain word, handle it"?

A) It learns rules from data, so it is typical machine learning  
B) It uses a neural network, so it is deep learning  
C) Because a person created the rules directly, it is hard to call it machine learning  
D) It is just ordinary software with no connection to AI at all  

**Answer: C**  
Explanation: The core of machine learning is that the machine learns rules from data on its own. A system where a person wrote the rules by hand has no learning process, so it is hard to call it machine learning. It does not use a neural network, so it is not deep learning either. However, a rule-based system that imitates intelligent behavior can be included in the category of AI in the broad sense.

---

**Question 3.** What does deep learning generally require more of, compared with traditional machine learning?

A) Explicit rules written by people  
B) Large amounts of data and powerful compute resources  
C) An environment that uses no data at all  
D) An environment that uses only a small amount of simple tabular data  

**Answer: B**  
Explanation: Because deep learning stacks neural networks deeply to learn complex patterns, it generally requires large amounts of data and powerful compute resources such as GPUs. Explicit rules written by people are a characteristic of the rule-based approach, and saying it uses no data contradicts the essence of machine learning.

---

**Question 4.** Which of the following data types is deep learning generally strongest on?

A) Simple calculations that can easily be handled with fixed rules  
B) Complex, unstructured data such as images, speech, and natural language  
C) Small-scale environments with almost no data  
D) Problems where a person can clearly define every rule  

**Answer: B**  
Explanation: Deep learning is especially powerful on unstructured data with complex patterns where it is hard for people to clearly define rules, such as image recognition, speech recognition, and natural language processing. Its advantages are hard to realize for simple problems that rules can easily handle or in environments with very little data.

---
