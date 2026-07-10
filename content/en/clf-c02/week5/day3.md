# Day 3 - Support Plans: How AWS Helps When Problems Arise

Even if you watch and rein in costs well, when a service actually goes down or a design hits a wall, you need someone's help. AWS knows that the level of help each customer needs differs, and it offers **Support Plans at multiple tiers**. Today we'll organize the differences across the four tiers from Basic to Enterprise, the dedicated support person TAM, and Trusted Advisor — an automatic-check tool anyone can use.

There's one core question: "How fast a response and how deep a level of help does this organization need?" The answer determines the right plan.

## The Four Support Plans: Basic → Developer → Business → Enterprise

The higher up the support plans go, the faster the response and the deeper the help — and the cost rises accordingly.

- **Basic**: Provided **free** to every account. No technical support cases; only account/billing inquiries, documentation, forums, and some Trusted Advisor checks are available.
- **Developer**: An inexpensive paid plan. **Email technical inquiries** available (during business hours). Suitable for the development and testing phase.
- **Business**: **24/7, year-round** technical support (phone, chat, email), with the **full set of Trusted Advisor checks**. Suitable for production workloads in operation.
- **Enterprise**: The top tier. On top of 24/7 support, it provides the **fastest response (15-minute target for critical cases)**, a dedicated **TAM**, concierge billing support, and more. For large-scale, mission-critical environments.

| Plan | Cost | Technical support | Key features |
|------|------|-----------|-----------|
| Basic | Free | None (no cases) | Docs, forums, billing inquiries; limited Trusted Advisor |
| Developer | Paid (low) | Email (business hours) | Development/testing phase |
| Business | Paid (mid) | 24/7 phone, chat, email | Full Trusted Advisor, for production |
| Enterprise | Paid (high) | 24/7 + fastest response | TAM, concierge, mission-critical |

> 💡 **Related theory**: "Free basic support" = Basic, "email technical support, development phase" = Developer, "24/7 support, full Trusted Advisor, production" = Business, "TAM, fastest response, mission-critical" = Enterprise. It's easy to remember that you move up in order of the strength of the clues.

## TAM (Technical Account Manager): Our Dedicated Technical Advisor

A **TAM (Technical Account Manager)** is a **dedicated technical advisor provided with Enterprise Support**. They continuously understand the customer's environment and help with architecture reviews, operational best practices, cost optimization, preparation for critical launches, and more — right by your side. Unlike general support that only responds when a case arises, the key point is that they are **a person who stays with the customer consistently**.

> 💡 **Related theory**: If you see "dedicated technical advisor" or "a designated person who continuously watches over our environment," it's a TAM — and this is **Enterprise-plan only**. There is no TAM below Business.

## AWS Trusted Advisor: The Automatic-Check Coach

**AWS Trusted Advisor** is a service that **automatically inspects the customer's environment and points out improvements relative to best practices**. Its checks fall into five categories.

1. **Cost Optimization** — unused resources, underutilized instances, and so on
2. **Performance** — throughput and configuration improvements
3. **Security** — open security groups, MFA not set, exposed access keys, and so on
4. **Fault Tolerance** — insufficient backups and redundancy
5. **Service Quotas** — warnings when nearing a limit

The important part is that **the scope of checks differs by plan**. Basic/Developer provide only **the core security and service quota checks**, while the **full five-category checks unlock on Business and Enterprise**.

> 💡 **Related theory**: If you see "automatically inspect the environment and recommend security/cost/performance improvements," it's Trusted Advisor. "To get the full set of checks," which plan? → Business or higher. Don't confuse who inspects (the human, a TAM) with what inspects (the tool, Trusted Advisor).

## One-Page Summary

| Signal (keyword) | Answer |
|--------------|----|
| Free, no technical cases, billing inquiries only | Basic |
| Email technical support, development/testing phase | Developer |
| 24/7 support, full Trusted Advisor, production | Business |
| TAM, fastest response, mission-critical | Enterprise |
| Dedicated technical advisor | TAM (Enterprise-only) |
| Automatic environment checks, best-practice recommendations | Trusted Advisor |

## Wrapping Up

Today's one sentence: **the response speed and depth of help you need is exactly what determines your plan tier.** Start with free Basic; for the development phase, Developer; to protect production 24/7, Business; and for a mission-critical setup that needs a dedicated person (TAM) and the fastest response, move up to Enterprise. And in any plan, Trusted Advisor plays the coach by automatically inspecting your environment — though the full set of checks unlocks on Business or higher.

In the next article, we'll look at the billing structure for grouping and paying across multiple accounts, and the tools for gauging costs in advance.

---

## 📝 연습 문제

**문제 1.** You run a production workload 24/7 and need phone/chat technical support and the full set of Trusted Advisor checks. However, you don't need a dedicated TAM. Which support plan is the best fit?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**정답: C**  
해설: The Business plan provides 24/7 phone/chat/email technical support and the full set of Trusted Advisor checks, making it suitable for production operations. Basic has no technical cases, Developer is limited to email during business hours, and Enterprise includes a TAM and the fastest response — exceeding the requirements (and overpaying).

---

**문제 2.** A large enterprise running a mission-critical environment wants a dedicated technical advisor and the fastest emergency response. Which support plan is the best fit?

A) Developer  
B) Business  
C) Enterprise  
D) Basic  

**정답: C**  
해설: The Enterprise plan provides a dedicated TAM, the fastest response for critical cases (15-minute target), concierge support, and more, making it suitable for a mission-critical environment. Basic and Developer don't even have 24/7 support, and Business is 24/7 but doesn't include a TAM.

---

**문제 3.** Which plan is provided to every account at no additional cost, cannot open technical support cases, and can only use billing inquiries, documentation, and forums?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**정답: A**  
해설: Basic is provided free to every account but cannot open technical support cases; it can only use account/billing inquiries, documentation, forums, and limited Trusted Advisor. Developer and above are all paid and can open technical support cases.

---

**문제 4.** Which dedicated person is provided with Enterprise Support and continuously understands the customer's environment to advise on architecture, operations, and cost?

A) Trusted Advisor  
B) Technical Account Manager (TAM)  
C) Solutions Architect certification  
D) AWS Config  

**정답: B**  
해설: A TAM is a dedicated technical advisor provided with the Enterprise plan who stays with the customer continuously and guides them on best practices. Trusted Advisor is an automatic-check tool (not a person), and Config is a configuration assessment service — different from a dedicated advisory person.

---

**문제 5.** Which service automatically inspects your environment and recommends improvements across five categories — cost, performance, security, fault tolerance, and service quotas? (Note: the full set of checks is provided on Business or higher.)

A) AWS Budgets  
B) AWS Trusted Advisor  
C) AWS Cost Explorer  
D) Technical Account Manager  

**정답: B**  
해설: Trusted Advisor automatically inspects your environment across five categories (cost, performance, security, fault tolerance, service quotas) and recommends improvements relative to best practices, with the full set of checks unlocking on Business and Enterprise. Budgets is budget alerts, Cost Explorer is cost analysis, and a TAM is a human advisor — none is an automatic-check tool.

---
