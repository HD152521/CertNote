# Day 2 - Application Integration: Connecting Systems Loosely

## 📌 Key Takeaways

- If you tie systems together with **direct calls**, everything stops together when one dies (tight coupling). Breaking the middle with **asynchronous messaging** is loose coupling.
- **SQS**: a message queue. Usually **1:1**, and consumers **poll to pull messages**. Buffering, loss prevention, and sequential processing are the core.
- **SNS**: publish/subscribe (pub/sub). Send to one topic and it is **pushed to multiple subscribers at once (1:many fan-out)**.
- **EventBridge**: an event bus. It **looks at the event's content and routes it by rules**, and it can also run on a schedule at set times.
- In practice, the **SNS + SQS combination** (fan out while each queue buffers safely) is used often.

## Why Not Connect Directly: A Story About Coupling

It's a question of "how systems talk to each other." In a small app, one function can simply call another directly, but in a large service with separate order, payment, and notification systems, the story changes.

- If the order service **calls the payment service directly (synchronous call)**, then when payment slows down or dies for a moment, the order also stops, waiting for a response. This is a tightly coupled state.
- What if instead the order service throws an "order came in" **message** into an intermediate queue, and the payment service takes it out and handles it when it's ready?
  - Even if payment dies briefly, the message is safely piled up in the queue.
  - Ordering is unaffected.
- This is **loose coupling**, and the three services we'll see today (SQS, SNS, EventBridge) are all tools for it.

Loose coupling is a core principle of the **Reliability** pillar of the Well-Architected Framework. To keep one component's failure from spreading to the whole, you have to cut the middle with messages/events instead of direct calls.

```
[Tight coupling]  Order ──direct call──▶ Payment   (if payment dies, order stops too)

[Loose coupling]  Order ──message──▶ [Queue] ──▶ Payment  (even if payment dies, it's kept in the queue)
```

> 📚 **Case study**: Imagine the moment booking opens for a popular concert on an online ticketing site. Tens of thousands of people rush in per minute. This site is built so that when it receives an order it immediately calls the payment system, and shows the "booking complete" screen only after payment finishes. But the payment provider's server can't withstand the traffic and its responses start slowing down. What happens then? The order server is held hostage waiting for the payment provider's answer, and as waiting requests pile up, the order server stops too. **Just because one payment step got slow, the entire site dies.** The screen shows only "Please try again shortly," and the orders that came in meanwhile vanish without a trace.
>
> Let's switch the same site to a queue. The order server throws a message "this person bought this seat" into the queue and immediately shows an "Accepted" screen. The payment system takes them out of the queue one at a time at its own pace. Even if the payment provider slows down, orders can keep being accepted, and the messages stay safely in the queue until the payment provider recovers and they get processed. **What changed isn't a few lines of code but the way the system collapses itself.**

## Synchronous and Asynchronous: Phone Calls and Text Messages

To understand loose coupling, you first have to distinguish **synchronous** from **asynchronous**. It sounds difficult, but it's exactly like the two ways of contacting people that we use every day.

**Synchronous is a phone call.** The conversation starts only when the other person picks up. If they aren't at their desk, the call can't happen at all, and while I'm holding the phone I can't do anything else. In exchange, I get the answer immediately.

**Asynchronous is a text message.** I send it and carry on with my work. The other person checks and replies when they have time. Even if they're in a meeting, the message doesn't disappear. In exchange, I can't get an immediate answer.

| Aspect | Synchronous (phone call) | Asynchronous (text) |
|------|-----------|-------------|
| Sender | Waits until the answer comes | Sends and immediately continues its own work |
| If the receiver is stopped | Call fails, request fails too | The message is kept |
| What you gain | Immediate response | Failure isolation, traffic cushioning |
| Suited for | "I need this value right now" | "It's fine whenever it gets processed" |

The three services we look at today (SQS, SNS, EventBridge) are all **tools on the asynchronous side**. It's accurate to think of them as devices that turn the conversation between systems from phone calls into text messages.

> ⚠️ **Pitfall**: Asynchronous isn't unconditionally good. If you switch even **places that need an immediate answer**, such as "we must show on screen right now whether the card was approved," to a queue, the user experience actually gets worse. Loose coupling begins with the judgment of picking out **"work that doesn't need an answer right away."**

## Amazon SQS: A Queue That Safely Holds Messages

- **Amazon SQS (Simple Queue Service)** is a fully managed **message queue**.
- One side (the producer) puts messages into the queue, and the other side (the consumer) takes them out and processes them when ready.
- The core is **1:1 delivery and buffering**.
  - The producer and consumer don't need to be alive at the same moment (asynchronous).
  - When traffic surges, it piles up in the queue and the consumer processes it at its own pace (cushion/buffer).
  - A message is kept until the consumer reports processing complete, so it is not lost.
- The representative analogy is **a café's order queue** — even when customers rush in, the order slips line up, and the barista handles them one by one, steadily.

### How a Queue Withstands Traffic Surges: A Dam and Its Sluice Gates

The real value of SQS lies less in "holding messages" than in **"decoupling the incoming speed from the processing speed."** When heavy rain falls, the river swells in an instant, but with a dam in the middle, only a steady amount can be released downstream. A queue is precisely that dam.

```
[Without a queue]  10,000 requests ───▶ processing server (10,000 at once? → it blows up)

[With a queue]     10,000 requests ──▶ [Queue: 10,000 waiting] ──▶ processing server
                                                                  (steadily, 200 per second)
```

Thanks to this structure, the systems behind it **can be left at their usual size.** It means you don't need to scale servers up tenfold for the few minutes when traffic jumps several-fold, and that also translates to cost savings.

### Standard Queues and FIFO Queues

SQS has two kinds of queues with different characters. Knowing the names is enough, but the distinction itself appears on the exam.

| Aspect | Standard queue | FIFO queue |
|------|------------------|---------|
| Order | May not be guaranteed | Processed in the order sent |
| Delivery | The same message may be delivered more than once | Processed exactly once |
| Throughput | Very high | More limited than standard |
| Suited for | High-volume work where order doesn't matter | Work where order and no duplicates matter |

FIFO means "First In, First Out" — what comes in first goes out first, like a number ticket at a bank counter. Use FIFO for **work whose result changes if the order is swapped**, such as banking transactions or inventory deduction, and use a standard queue for **high-volume work where order doesn't matter**, such as image conversion or sending notifications.

If you see keywords like "must not lose messages," "cushion traffic surges," or "pile work into a queue and process sequentially," it's SQS. The decisive difference from SNS is that a message is usually picked up and processed by a single consumer.

> ⚠️ **Pitfall**: SQS does **not push** messages to consumers. The consumer has to ask "anything new?" (polling) to get them. So choosing SQS for a scenario like "we have to notify multiple systems the moment an event occurs" is likely a wrong answer. That's SNS's job.

## Amazon SNS: Notifying Many Places of One Message at Once

- **Amazon SNS (Simple Notification Service)** is a **publish/subscribe (pub/sub)** notification service.
- When a publisher sends a message once to a single **topic**, it is **delivered simultaneously to multiple targets** subscribed to that topic (1:many, fan-out).
- Targets that can be subscribers: email, SMS, HTTP endpoints, Lambda functions, SQS queues.
- Example: a single "order complete" message handles sending a customer email + recording in the analytics system + starting the shipping system at the same time.

| Aspect | SQS | SNS |
|------|-----|-----|
| Model | Queue (1:1, pull) | Topic (1:many, push) |
| Core analogy | Order queue | Broadcast / sending notifications |
| Delivery method | Consumer polls and pulls | Pushed immediately to subscribers |
| Representative uses | Work buffering, asynchronous processing | Multi-recipient notifications, fan-out |

Seen as a diagram, SNS looks like this. The publisher doesn't need to know at all how many subscribers there are or who they are. It just throws the message at the topic once.

```
                           ┌──▶ Send email
                           │
Publisher ──▶ [SNS topic] ─┼──▶ Lambda (record for analytics)
 (order service)           │
                           └──▶ SQS queue (shipping processing)
```

This is the same structure as a company bulletin board or a group announcement channel. The person posting an announcement doesn't care who reads it, and even if more readers appear later, the way of posting doesn't change. **When you want to attach one more system, you don't have to modify the publisher's code** — that is the real benefit of fan-out.

### A Practical Pattern: SNS + SQS Fan-Out

Using SNS alone has one drawback. If one of the subscribers is down briefly, it can miss that notification. So in practice a combination that **subscribes SQS queues to an SNS topic** is often used.

```
                           ┌──▶ [SQS queue A] ──▶ Shipping system
Publisher ──▶ [SNS topic] ─┤
                           └──▶ [SQS queue B] ──▶ Settlement system
```

This way, **you spread to multiple places with a single publish (SNS), while each system safely piles messages up in its own queue and processes them at its own pace (SQS).** Even if the shipping system stops for a moment, the messages remain in queue A, and the settlement system keeps running unaffected. Since it's a configuration that takes only the strengths of both services, its name appears even at the CLF level.

If you see "notify multiple systems of one event at the same time," "email/SMS notifications," or "fan-out," it's SNS. In practice the **SNS + SQS combination** (subscribe multiple SQS queues to an SNS topic to fan out while each queue still buffers safely) is used often.

> 📚 **Case study**: When a single "order received" happens in a food-delivery app, there's more than one or two things that must happen behind the scenes. You have to send a notification to the customer, display the order slip on the restaurant's tablet, start dispatching a rider, and record it in the sales data. If you make the order service call those four places directly in turn, then if even one of the four is slow, the whole order is delayed, and every time a fifth job like "coupon settlement" is added later you'd have to modify the order code. If you switch to **publishing to one SNS topic and having each system subscribe**, the order service only needs to announce "order received," and the rest each react on their own.

## Amazon EventBridge: Connecting Flows Based on Events

- **Amazon EventBridge** is an **event bus** service.
- It receives **events** that occur in AWS services, our apps, and external SaaS (e.g., Zendesk, Datadog) and routes them to appropriate targets according to rules.
- It looks similar to SNS, but EventBridge is strong at **filtering and routing by looking at the content of events**.
  - "When a file is uploaded to a particular folder in S3 → run this Lambda"
  - "When an EC2 state changes → send this notification"
  - These kinds of conditional flows are configured with rules, without code.
- It also provides a **schedule (cron)** feature that runs jobs at set times.

```
[Various event sources]          [EventBridge rules]        [Targets]
 AWS services ──┐                 Content filter + routing    Lambda
 My app       ──┼──▶ [Event bus] ──────────────▶              SQS/SNS
 SaaS app     ──┘                                             Step Functions ...
```

### How Do SNS and EventBridge Differ?

Both are similar in that "when one place publishes, multiple places receive," so they're the most often confused. The difference lies in **who does the filtering**.

SNS is a **loudspeaker**. If you shout at a topic, everyone subscribed to that topic receives the same content. What to receive is decided by the subscribing side.

EventBridge is a **mail sorting room**. It opens the events that come in from all over and **picks and sends them according to rules**, like "only items whose sender is S3 and whose folder is `/invoices` go to this Lambda." On top of that, it accepts events that AWS services generate on their own (instance state changes, build completions, etc.) and events from external SaaS too.

| Aspect | SNS | EventBridge |
|------|-----|-------------|
| Character | Publish/subscribe notifications | Event bus / routing |
| How it filters | Subscription per topic | Rules that look at event content |
| Event source | Mostly my own applications | My app + AWS services + SaaS |
| Distinctive feature | Various notification targets such as email and SMS | Scheduled (set-time) execution |

If you see "react to AWS service state changes," "integrate SaaS events," "conditional routing by event content," or "run automatically at set times," it's EventBridge. It acts as the glue that lets you build an event-driven architecture without code.

## One More Line: AWS Step Functions

When the topic of integration services comes up, **AWS Step Functions** gets mentioned at least once too. It's a service that **defines and runs a workflow of tasks, like a diagram**, so that multiple steps proceed in order, depending on conditions, and retry on failure. Think of it as managing a procedure such as "step 1 image check → step 2 approval → step 3 publish, and roll back if something fails midway" with a flowchart rather than code. At the CLF level, one line is enough: **"a service that coordinates (orchestrates) multiple steps."**

## Telling the Three Apart on One Page

| Signal (keyword) | Service |
|--------------|--------|
| Work queue, buffering, loss prevention, sequential processing | SQS |
| Multi-recipient notifications, email/SMS, fan-out | SNS |
| Event routing, reacting to service/SaaS events, scheduling | EventBridge |

- At the CLF level, what's asked is not deep configuration but the ability to sort scenarios by these **three-line identities**.
  - "Notify many people" → SNS
  - "Pile up work safely and process it" → SQS
  - "React to events and connect flows" → EventBridge
- The three share one goal — keep components from being directly tied to each other, so that even if one wobbles, the whole holds.

### Summary of Confusing Pairs

| Confusing pair | Decisive difference |
|-------------|------------|
| SQS vs SNS | A queue the consumer pulls from (1:1) vs notifications pushed to subscribers (1:many) |
| SNS vs EventBridge | A per-topic loudspeaker vs a sorting room that looks at event content |
| SQS Standard vs FIFO | Order not guaranteed, maximum throughput vs order guaranteed, no duplicates |
| Synchronous call vs messaging | Waits for the answer (tight coupling) vs throws it and moves on (loose coupling) |
| EventBridge vs Step Functions | Sends events to the right place vs coordinates multiple steps in order |

### Integration Services Keyword Mapping Table

| Keyword in the question | Service it points to |
|---------------|----------------|
| Work buffering, cushioning traffic surges, preventing message loss | SQS |
| Consumers process one at a time at their own pace | SQS |
| Order guaranteed, exactly once without duplicates | SQS FIFO queue |
| Email/SMS notifications, simultaneous delivery to multiple subscribers, fan-out | SNS |
| Publish once, spread to multiple queues, each processes safely | SNS + SQS combination |
| React to AWS service state changes, integrate SaaS events | EventBridge |
| Conditional routing by event content | EventBridge |
| Automatic execution at set times/intervals (schedule) | EventBridge |
| Coordinate multiple steps including order, conditions, and retries | Step Functions |

A well-built system is not one whose parts never break, but one that holds as a whole even when parts break. Parts will break someday, and the devices that keep them from dragging neighboring parts down with them are messages and events. SQS cushions surging traffic and lets the processing side pull at its own pace. With SNS, even when a new audience is added, the shouting side stays the same. EventBridge handles events from AWS services and SaaS, and even schedules. In scenarios, you sort them this way: if one party handling it is enough, SQS; if multiple parties need to know, SNS; if you have to look at conditions and branch, EventBridge.

In the next post, we'll look at the **tools for watching and managing** whether a system built this way runs well — CloudWatch, CloudTrail, Config, and Systems Manager.

## 📖 Glossary

- **Tight coupling**: A state in which systems are directly attached, so when one side stops, the other stops with it.
- **Loose coupling**: A structure that places messages or events in the middle so that even if one side dies, the other keeps running.
- **Asynchronous**: A method in which the sender doesn't wait for an answer and immediately continues its own work.
- **Message queue**: A waiting line that piles up work to be processed in order. The processing side takes them out one at a time when ready.
- **Producer / consumer**: The side that puts messages into the queue (producer) and the side that takes them out and processes them (consumer).
- **Polling**: A method in which the consumer periodically asks the queue "any new messages?" and pulls them.
- **Publish/subscribe (pub-sub)**: A method in which, when something is published once in one place, everyone who subscribed to it receives the same content.
- **Fan-out**: A single message spreading out to multiple targets at once.
- **Event bus**: A relay station that gathers events coming from many places and sends them to the right places according to rules.
- **Synchronous**: A method in which the sender waits until it gets the answer. Closer to a phone call.
- **Topic**: The name of the window through which messages are published in SNS. Subscribers subscribe to this window.
- **Buffering**: Piling up requests that arrived all at once for a while in the middle, and letting them flow at a speed the back end can handle.
- **FIFO**: "First In, First Out" — what comes in first goes out first. An order guarantee like a bank number ticket.
- **Event**: A single fact that "something happened." Examples: a file was uploaded, an instance's state changed.
- **Rule**: In EventBridge, the condition that decides "which events to send where."
- **Orchestration**: Conducting the work of multiple steps and services in order and according to conditions. Step Functions plays this role.

---

## 📝 Practice Questions

**Question 1.** You want to decouple an order system and a payment system so that no messages are lost during a traffic spike and the payment system processes them one at a time at its own pace. Which service is most appropriate?

A) Amazon SNS  
B) Amazon SQS  
C) Amazon EventBridge  
D) Amazon ElastiCache  

**Answer: B**  
Explanation: SQS safely piles messages into a queue to decouple producer and consumer (buffering), so it cushions traffic spikes and prevents loss. SNS is for multi-recipient notifications, EventBridge is for event routing, and ElastiCache is a cache — none are meant for a work queue.

---

**Question 2.** With a single "order complete" event, you want to send the customer an email, record it in an analytics system, and wake up the shipping system all at once. Which service is most appropriate?

A) Amazon SQS  
B) Amazon RDS  
C) Amazon SNS  
D) Amazon Redshift  

**Answer: C**  
Explanation: SNS uses the publish/subscribe (pub/sub) model to deliver a single message to multiple subscribers simultaneously (fan-out). SQS is typically a 1:1 queue where one consumer takes the message, and RDS/Redshift are databases, not notification-dispatch services.

---

**Question 3.** What is the main benefit of connecting system components with messages instead of direct calls?

A) Tight coupling between components improves speed  
B) Loose coupling prevents a single component's failure from spreading across the whole  
C) Reduced database cost  
D) Automatic IAM permission configuration  

**Answer: B**  
Explanation: Breaking the middle with messaging creates loose coupling, so even if one component dies, the message is retained and other components are unaffected. Direct calls instead create tight coupling, and cost reduction or IAM configuration is not the direct purpose of messaging.

---

**Question 4.** You want to conditionally route work based on the content of AWS service or SaaS events — for example, automatically running a Lambda when a specific file is uploaded to S3. Which service is most appropriate?

A) Amazon SQS  
B) Amazon EventBridge  
C) Amazon ElastiCache  
D) Amazon Aurora  

**Answer: B**  
Explanation: EventBridge is an event bus that receives events from various sources and routes them to targets by rules (content filters), and it also supports scheduled execution. SQS is a simple queue, ElastiCache is a cache, and Aurora is a database, so none have event-routing capability.

---

**Question 5.** Which is the most accurate description of the difference between SQS and SNS?

A) SQS pushes to multiple recipients, and SNS is polled by a single consumer  
B) SQS is a message queue (usually 1:1, consumer pulls), and SNS is publish/subscribe (1:many, pushed to subscribers)  
C) Both are database services  
D) SQS is exclusively for sending notifications, and SNS is exclusively for buffering work  

**Answer: B**  
Explanation: SQS is a message queue the consumer polls and pulls from (usually 1:1, buffering), while SNS is publish/subscribe that pushes one message to multiple subscribers (1:many). A swaps the two, both are not databases, and their purposes are also the reverse of D.

---
