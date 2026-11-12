# Day 4 - Deployment, Automation & More: Infrastructure as Code, and Without Servers

Until now we've created services by clicking in the console. But if you have to build the same environment three times for development, testing, and production, or reproduce it identically without mistakes, clicking is risky and slow. Today we cover **how to handle infrastructure as code (IaC)**, tools that simplify deployment, and container and serverless concepts that reduce the burden of server management.

There's one core question: "Up to where do I manage things myself, and from where do I hand them over to AWS?" The tools we look at today keep raising that responsibility boundary higher.

### The Days of Building Infrastructure by Clicking

Why the term IaC came about becomes clear immediately if you look at the days before it existed.

A company has one production environment. Three EC2 instances, one load balancer, one database, five security groups, and dozens of settings connecting them. Over the past two years, several people built this environment by clicking one thing at a time in the console. Then one day a request comes in. **"Just create one more identical environment for testing."**

That's where the trouble starts.

- **Nobody knows the whole thing.** Two of the people who built it have already left the company. No one can explain why the settings are the way they are.
- **The documentation differs from reality.** The architecture diagram in the wiki is a version from a year ago. Things changed in a hurry since then haven't been reflected.
- **You can't build it identically.** If you click through it again by hand, something will inevitably end up different. And that subtle difference comes back later as an incident of "it worked in testing but not in production."
- **You can't roll back.** Even if someone changes a setting wrongly, there's no way to go back to "yesterday's state."
- **Deleting is work too.** When testing is over and you want to clean up, you have to remember what you created and delete things one by one, and any resource you miss keeps quietly generating charges.

The idea that came out of this is simple and powerful. **Treat infrastructure not as "a procedure for making it" but as "a blueprint file."** What happens if you write it down in a file, like code?

| Clicking by hand | Defined as code (IaC) |
|-------------|------------------|
| Only the person who built it knows | Anyone who opens the file sees the whole configuration |
| Documentation and reality drift apart | The file itself is the actual configuration |
| Rebuilding makes it subtly different | Same file → same result |
| No change history | Version control, review, and rollback with Git, etc. |
| You miss things when cleaning up | Delete all at once per bundle (stack) |

This is **IaC (Infrastructure as Code)**. In cooking terms, it's a switch from relying on the chef's instinct to **writing down an exact recipe**. With a recipe, anyone who makes it gets the same taste, it can be reproduced in another kitchen, and what was changed is left on record too.

## AWS CloudFormation: Infrastructure as Code (IaC)

**AWS CloudFormation** is a service that **defines infrastructure as code (IaC, Infrastructure as Code)**. If you write resources like EC2, VPC, S3, and RDS in a JSON/YAML template, CloudFormation creates, modifies, and deletes them exactly as written.

Why is that good? Console clicks differ from person to person and leave no record, but a template is **version-controlled and repeatably reproducible**. If you want to build "the dev environment identical to production," you just deploy the same template once more. Even an environment deleted by mistake comes back as it was, as long as you have the template.

```
[Manual clicking]  Different every environment, no record, hard to reproduce
[CloudFormation]   1 template → repeatedly create/delete identical environments, version-controllable
```

### Template and Stack — Just Two Words to Know

CloudFormation has really only two terms to memorize.

| Term | Meaning | Analogy |
|------|------|------|
| Template | A file (JSON/YAML) listing the resources to create | An architectural blueprint |
| Stack | The bundle of resources actually created from that template | One building built from the blueprint |

The relationship flows like this.

```
1 template file
   │  (deploy)
   ▼
Stack A (prod)      Stack B (test)      Stack C (dev)
 EC2·ELB·RDS…        EC2·ELB·RDS…        EC2·ELB·RDS…
   └─ 3 isolated environments that came from the same blueprint
```

There's one more benefit that the stack unit provides. **When you delete a stack, the resources that stack created are cleaned up together.** With a hand-built environment, you can't tell what you missed when deleting, but with a stack, CloudFormation remembers "I created this bundle." That's why creating and then deleting temporary experimental environments becomes painless.

Another important property is that it is **declarative**. In a template you don't write a procedure like "create EC2, then attach a security group"; you write **"I'd like it to end up in this state."** Getting the order right and resolving dependencies is something CloudFormation does on its own. That's why the same template produces the same result whenever you run it.

> 📚 **Case study**: A game company spins up a new environment for each country every time it launches a new title. In the past two engineers spent three days each clicking through the console, and every time one setting or another turned out different. Now they just swap in the "which Region, what size" values into one template and deploy. Environment setup has shrunk to half a day, and when the service ends, cleanup is done simply by deleting the stack.

> ⚠️ **Pitfall**: Even if you have a CloudFormation template, **if someone changes a setting by hand in the console, the template and reality diverge.** This divergence is called drift. Adopting IaC also implies a team agreement that "from now on, changes are made by editing the template." Bringing in the tool alone does not create reproducibility.

IaC is a core practice of Well-Architected's **Operational Excellence**. If you see "infrastructure as code," "repeatably reproducible environments," or "automatic provisioning from templates," it's CloudFormation. For reference, **AWS CDK** is a tool that lets you define infrastructure in familiar programming languages like Python or TypeScript and converts it into a CloudFormation template. Knowing just the name is enough.

## AWS Elastic Beanstalk: Upload Code and Deployment Is Done

**AWS Elastic Beanstalk** is a service that, when you upload application code, **automatically configures and deploys the infrastructure needed to run it (EC2, load balancer, Auto Scaling, etc.)**. Developers can focus on the code without knowing infrastructure details.

The difference from CloudFormation is often confusing, but the focus differs. CloudFormation is "I precisely define all the resources I want with a template," while Elastic Beanstalk is "it configures a standard environment on its own so you can deploy a web app quickly." Beanstalk also uses CloudFormation internally.

| Aspect | CloudFormation | Elastic Beanstalk |
|------|----------------|-------------------|
| Focus | Precisely defines the whole infrastructure as code | Automates deployment when you just upload app code |
| Level of control | Fine-grained (every resource specified) | Simple (standard environment configured automatically) |
| Audience | Infrastructure engineers / broad range of resources | App developers who want to deploy quickly |

### Why Was This Needed — A Developer's Day

For a developer who has built a web app to put it on the internet, they used to have to handle this entire list.

Launch EC2, choose an OS, install a runtime (Java, Python, etc.), set up firewall rules, attach a load balancer, configure Auto Scaling, write deployment scripts, wire up log collection, and decide on a zero-downtime deployment method. **The thing they're actually good at — writing app code — appears nowhere on this list.**

Elastic Beanstalk takes this whole list away. The developer just uploads the code bundle and tells it something like "this is a Java app." Then the runtime environment, load balancer, Auto Scaling, and health monitoring are set up in a standard configuration.

What's important is that **Beanstalk isn't doing magic**. Behind the scenes, the very EC2 and ELB we know are created, and what actually creates them is CloudFormation. In other words, Beanstalk is closer to "an automatic assembly recipe layered on top of CloudFormation." If needed, you can look into the created resources directly and adjust them.

> 📚 **Case study**: A startup with only three developers launched its first service. With no room to hire an infrastructure person, they started by uploading code to Beanstalk and spent the first few months on feature development alone, without worrying about infrastructure. Only after users grew and the setup got complex did the team move toward defining the infrastructure directly with CloudFormation. They chose **convenience at first and control later**. On the exam, if "quickly, without infrastructure knowledge" is emphasized, it leans Beanstalk.

> ⚠️ **Pitfall**: Beanstalk and CloudFormation are not rivals. The split isn't "which is better" but **"do you need fine-grained control, or fast deployment?"** And Beanstalk focuses on deploying web applications, so if a question is about "defining the entire infrastructure including the VPC and network," the answer is CloudFormation.

If you see "just upload code and it deploys automatically" or "launch a web app quickly without infrastructure details," it's Elastic Beanstalk. If it's "define all resources directly with a template," it's CloudFormation.

## Containers: ECS, EKS, Fargate

A **container** is a technology that bundles an application and its runtime environment into one so it runs identically anywhere. It reduces the "it worked on my machine but not on the server" problem. AWS's representative container services are as follows.

- **Amazon ECS (Elastic Container Service)**: AWS's container orchestration service. It manages where and how many containers to launch.
- **Amazon EKS (Elastic Kubernetes Service)**: Provides standard open-source Kubernetes as a managed service. Suitable for teams already using Kubernetes.
- **AWS Fargate**: Serverless compute that runs just containers on ECS/EKS **without you managing servers (EC2)**. No need to worry about node patching or scaling.

### Containers as Moving Boxes

The word container originally comes from ports. If you put cargo into a standard-sized box, it can be moved as is by ship, truck, or train. The port doesn't need to know what the cargo is.

Software is the same. To run an app, you need a specific version of a language runtime, libraries, and configuration files, and if these differ slightly from server to server, the app behaves differently. **A container puts the app and everything it needs to run into one box.** So whether on a developer's laptop, a test server, or a production server, what's inside the box is identical.

Let's sort out the easily confused point here. When handling containers, **two decisions** are needed separately.

1. **Who manages (orchestrates) the containers?** — Launching how many where, bringing them back if they die, and distributing traffic. → **ECS** or **EKS**
2. **Who manages the servers those containers run on?** — Node OS patching, adjusting the number of machines. → **I manage the EC2** or **leave it to Fargate**

In other words, ECS/EKS and Fargate are not options on the same layer but **answers to two different questions**. The accurate phrasing isn't "ECS or Fargate" but "ECS on EC2, or ECS on Fargate."

| Combination | Orchestration | Server (node) management |
|------|----------------|------------------|
| ECS on EC2 | AWS-native approach | I manage the EC2 |
| ECS on Fargate | AWS-native approach | Managed by AWS (serverless) |
| EKS on EC2 | Standard Kubernetes | I manage the EC2 |
| EKS on Fargate | Standard Kubernetes | Managed by AWS (serverless) |

> ⚠️ **Pitfall**: **Don't try to tell ECS and EKS apart by "performance difference."** The fork is whether you go simply with the AWS-native approach (ECS), or use standard Kubernetes as is, which you're already familiar with or which is used across multiple clouds (EKS). If a question includes phrases like "already using Kubernetes" or "was running on Kubernetes on-premises," it's EKS.

"AWS-style container management" → ECS, "standard Kubernetes" → EKS, "run just containers without server management" → Fargate. At the CLF level, rather than deep operations, the one-line differences among these three are what's asked.

## Serverless: Lambda

**Serverless** is a model in which we don't manage servers at all and pay only for code execution. The representative is **AWS Lambda**. Once you upload code, it runs only when an event (a file upload, an API call, etc.) occurs, and you are billed only for the time it ran. If there's no traffic, the cost is close to zero too.

```
[Order in which management responsibility shrinks]
EC2 (manage servers directly)
  → ECS/EKS on EC2 (containers + node management)
    → Fargate (containers only, no node management)
      → Lambda (code only, no concept of servers)
```

### A Hotel Analogy for the "How Much Do You Hand Over" Spectrum

If we liken the ladder above to lodging, the feel becomes certain.

| AWS approach | Lodging analogy | What I do |
|----------|-----------|--------------|
| Operate EC2 directly | Buy empty land and build a house | Everything |
| CloudFormation | Hand over a blueprint and entrust the construction | I design; construction is automatic |
| Elastic Beanstalk | Move into a fully furnished studio carrying only my luggage | Only the luggage (code) |
| Fargate | Check in to a hotel | Don't worry about tidying the room or fixtures |
| Lambda | Rent a meeting room by the hour only when needed | Only for the time I use |

The further down you go, **freedom shrinks while convenience and cost efficiency rise.** It's not that one side is "better"; it's a matter of what the situation demands. Exam questions usually drop this requirement as a hint.

- "We need fine-grained control at the OS level" → the EC2 side
- "We want to minimize operational burden," "we have no administrators" → the Fargate/Lambda side
- "We need to repeatedly create identical environments" → CloudFormation
- "We want developers to deploy without knowing infrastructure" → Elastic Beanstalk

> 📚 **Case study**: Consider a media company's image-processing pipeline. When a user uploads a photo to S3, Lambda runs immediately and creates a thumbnail. Whether it's a day with 100 uploads or a day with 100,000 because of an event, the code stays the same. No one has had to worry about how many servers to run, and on nights with no uploads, practically no cost is incurred. On the other hand, a job that encodes video nonstop 24 hours a day suits containers or EC2 better than Lambda. **Serverless for intermittent, short jobs, and server-based for long, steady jobs** is generally the right instinct.

## Choosing a Service by Signal Keyword

| Signal (keyword) | Service |
|--------------|--------|
| Define and repeat infrastructure as a template (code) | CloudFormation |
| Deployment is automated when you just upload code | Elastic Beanstalk |
| AWS-style containers / standard Kubernetes | ECS / EKS |
| Run containers without server management | Fargate |
| Event-driven, billed by usage, no servers | Lambda |

## Terminology Table

We've collected the pairs that are easy to confuse today.

| Confusing pair | Decisive difference |
|-------------|-------------|
| CloudFormation vs Elastic Beanstalk | I define the entire infrastructure vs a standard environment is configured automatically when I upload only the app |
| CloudFormation vs CDK | YAML/JSON template vs written in a programming language (the result is the same template) |
| Template vs stack | The blueprint file vs the bundle of resources made from that blueprint |
| ECS vs EKS | AWS-native orchestration vs standard Kubernetes |
| EC2 vs Fargate (container-based) | I manage the nodes vs no node management |
| Fargate vs Lambda | Containers kept running vs a function runs only on events |
| Beanstalk vs Lambda | The whole app runs on servers vs short function-level execution |
| Systems Manager vs CloudFormation | Operate servers that already exist vs create infrastructure from scratch |

## How It Appears on the Exam

| Phrase in the question | Answer direction |
|----------------------|-----------|
| Template, repeatable reproduction, multiple identical environments | CloudFormation |
| Infrastructure as code (IaC), version control | CloudFormation |
| Bulk creation and deletion per stack | CloudFormation |
| Upload only code, fast deployment without infrastructure knowledge | Elastic Beanstalk |
| Automatically configure the web app runtime environment (EC2, ELB, Auto Scaling) | Elastic Beanstalk |
| Already using Kubernetes | EKS |
| AWS-native container orchestration | ECS |
| Don't want to provision and patch nodes (EC2) | Fargate |
| Runs only when an event occurs, billed only for run time | Lambda |
| Minimize operational burden, no administrators | Serverless (Lambda/Fargate) |
| Need OS kernel settings or special software | EC2 |

## Summary

Today we looked at deployment, automation, and the flow of reducing operational responsibility. You codify infrastructure with CloudFormation, simplify app deployment with Elastic Beanstalk, and hand more and more of operations over to AWS with containers (ECS/EKS/Fargate) and serverless (Lambda). The principle running through it all is the shared responsibility model we saw up to yesterday — the higher the abstraction rises, the less my responsibility, and the more I can focus on business logic.

There are two big pictures to remember. First, **handle infrastructure with files, not hands.** Only then can it be reproduced, reviewed, and rolled back. Second, **"how much to hand over" is a choice, not a right answer.** If you need control, move toward EC2; if you need speed and convenience, move toward serverless. The exam asks the reason for that choice.

Check yourself. What is the difference between a template and a stack? What does Beanstalk use internally? What is the criterion that separates ECS from EKS? What exactly is the management burden that Fargate removes? What is an example of work that Lambda doesn't suit? If you can answer each in a line, today is enough.

In the next post, we'll review and wrap up all of Week 3 — databases, integration, management tools, and deployment — in one go.

---

## 📝 Practice Questions

**Question 1.** You want to automatically create identical infrastructure environments (dev, test, prod) in a repeatable, version-controlled way. Which service is most appropriate?

A) AWS Elastic Beanstalk  
B) AWS CloudFormation  
C) AWS Lambda  
D) Amazon ECS  

**Answer: B**  
Explanation: CloudFormation is an IaC service that defines infrastructure as JSON/YAML templates (code) for repeatable reproduction and version control. Elastic Beanstalk focuses on simplifying app deployment, Lambda is serverless code execution, and ECS is container orchestration, so none are meant for defining infrastructure as a whole.

---

**Question 2.** A developer wants to deploy a web app quickly by uploading just the code — without handling infrastructure details directly — and have EC2, a load balancer, and Auto Scaling configured automatically. Which service is most appropriate?

A) AWS CloudFormation  
B) AWS Config  
C) AWS Elastic Beanstalk  
D) Amazon EKS  

**Answer: C**  
Explanation: Elastic Beanstalk automatically configures and deploys the standard infrastructure needed to run the code once uploaded, letting the developer focus on the code. CloudFormation requires defining every resource directly, Config evaluates configuration, and EKS manages Kubernetes, so their purposes differ.

---

**Question 3.** You want to run containers but not patch or scale the underlying EC2 servers (nodes) directly — a serverless approach. Which is most appropriate?

A) Amazon EC2  
B) AWS Fargate  
C) Amazon RDS  
D) AWS CloudTrail  

**Answer: B**  
Explanation: Fargate is serverless compute that runs only containers on ECS/EKS without node (EC2) management. EC2 requires managing servers directly, RDS is a database, and CloudTrail is audit logs, so they have nothing to do with running containers.

---

**Question 4.** You want code to run only when an event (e.g., a file upload) occurs, to be charged only for the time it runs, and to not manage servers at all. Which service is most appropriate?

A) AWS Lambda  
B) Amazon EC2  
C) Amazon EKS  
D) AWS Elastic Beanstalk  

**Answer: A**  
Explanation: Lambda is serverless compute that runs only in response to events and charges only for the time used. EC2, EKS, and Beanstalk each require maintaining and managing servers or environments to varying degrees, so they don't meet the "no servers at all" condition.

---

**Question 5.** A team already using standard open-source Kubernetes wants to run managed Kubernetes on AWS. Which service is most appropriate?

A) Amazon ECS  
B) Amazon EKS  
C) AWS Lambda  
D) AWS CloudFormation  

**Answer: B**  
Explanation: EKS provides standard Kubernetes in managed form, so it fits well with existing Kubernetes workloads. ECS is AWS's proprietary container orchestration, Lambda is serverless functions, and CloudFormation is IaC, so none are Kubernetes management services.

---
