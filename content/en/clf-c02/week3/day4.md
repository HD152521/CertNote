# Day 4 - Deployment, Automation & More: Infrastructure as Code, and Without Servers

So far we've built services by clicking around in the console. But when you have to build the same environment three times over — for development, testing, and production — or reproduce it identically without mistakes, clicking is risky and slow. Today we'll organize **how to treat infrastructure as code (IaC)**, tools that simplify deployment, and the container/serverless concepts that reduce the burden of server management.

There's one core question: "How much do I manage directly, and where do I hand off to AWS?" The tools we look at today keep pushing that responsibility boundary further up.

## AWS CloudFormation: Infrastructure as Code (IaC)

**AWS CloudFormation** is a service that **defines infrastructure as code (IaC, Infrastructure as Code)**. Write down resources like EC2, VPC, S3, and RDS in a JSON/YAML template, and CloudFormation creates, updates, and deletes them exactly as specified.

Why is it good? Console clicking varies from person to person and leaves no record, but a template is **version-controlled and repeatably reproducible**. If you want to make your development environment "exactly like production," you just deploy the same template once more. Even an environment you accidentally deleted comes right back as long as you have the template.

```
[Manual clicking]  Each environment differs, no record, hard to reproduce
[CloudFormation]   1 template → repeatedly create/delete identical environments, version-controllable
```

> 💡 **Related theory**: IaC is a core practice of the **Operational Excellence** pillar of Well-Architected. When you see "infrastructure as code," "repeatably reproducible environments," or "automatic provisioning from a template," it's CloudFormation. (For reference, CDK does the same thing with a programming language, but for CLF the CloudFormation concept is what matters.)

## AWS Elastic Beanstalk: Just Upload Your Code and Deployment Is Done

**AWS Elastic Beanstalk** is a service that, when you upload your application code, **automatically configures and deploys the infrastructure needed to run it (EC2, load balancer, Auto Scaling, etc.)**. Developers can focus on the code without knowing the infrastructure details.

The difference from CloudFormation often causes confusion, but their focus is different. CloudFormation is "I precisely define every resource I want with a template," while Elastic Beanstalk is "configure a standard environment automatically so I can deploy a web app quickly." Beanstalk itself uses CloudFormation internally.

| Item | CloudFormation | Elastic Beanstalk |
|------|----------------|-------------------|
| Focus | Precisely define all infrastructure as code | Just upload app code and automate deployment |
| Control level | Fine-grained (every resource specified) | Simple (standard environment auto-configured) |
| Target | Infrastructure engineers / broad resources | App developers who want to deploy quickly |

> 💡 **Related theory**: When you see "just upload code and it deploys itself" or "launch a web app quickly without infrastructure details," it's Elastic Beanstalk. "Define every resource directly with a template" is CloudFormation.

## Containers: ECS, EKS, Fargate

**Containers** are a technology that bundles an application and its runtime environment together so it runs identically anywhere. It reduces the "it worked on my machine but not on the server" problem. AWS's representative container services are as follows.

- **Amazon ECS (Elastic Container Service)**: AWS's container orchestration service. Manages where and how many containers to run.
- **Amazon EKS (Elastic Kubernetes Service)**: Provides standard open-source Kubernetes in managed form. Suits teams already using Kubernetes.
- **AWS Fargate**: Serverless compute that runs only containers on ECS/EKS **without directly managing the servers (EC2)**. No need to worry about node patching or scaling.

> 💡 **Related theory**: "AWS-style container management" → ECS, "standard Kubernetes" → EKS, "run only containers without managing servers" → Fargate. For CLF, it asks about the one-line difference among these three rather than deep operations.

## Serverless: Lambda

**Serverless** is a model where we don't manage servers at all and pay only for code execution. The flagship is **AWS Lambda**. Upload your code, and it runs only when an event occurs (file upload, API call, etc.), and you're charged only for the time it runs. When there's no traffic, the cost is close to zero.

```
[Order of decreasing management responsibility]
EC2 (manage the server directly)
  → ECS/EKS on EC2 (containers + node management)
    → Fargate (containers only, no node management)
      → Lambda (code only, no notion of servers)
```

> 💡 **Related theory**: When you see "without managing servers," "runs only when there's an event," "pay only for what you use," or "short-unit tasks," it's Lambda (serverless). The ladder above is an extension of the shared responsibility model — the higher the abstraction rises, the less operational responsibility the customer bears.

## One-Page Summary

| Signal (keywords) | Service |
|--------------|--------|
| Define and repeat infrastructure as a template (code) | CloudFormation |
| Just upload code and automate deployment | Elastic Beanstalk |
| AWS-style containers / standard Kubernetes | ECS / EKS |
| Run containers without managing servers | Fargate |
| Event-driven, pay-per-use, no servers | Lambda |

## Wrapping Up

Today we looked at deployment and automation, and the flow of reducing operational responsibility. Codify infrastructure with CloudFormation, simplify app deployment with Elastic Beanstalk, and hand off more and more operations to AWS with containers (ECS/EKS/Fargate) and serverless (Lambda). The principle running through it all is the shared responsibility model we've seen day after day — the higher the abstraction rises, the less my responsibility, and the more I can focus on business logic.

In the next article, we'll review and consolidate all of Week 3 — databases, integration, management tools, and deployment — in one pass.

---

## 📝 연습 문제

**문제 1.** You want to automatically create identical infrastructure environments (dev, test, prod) in a repeatable, version-controlled way. Which service is most appropriate?

A) AWS Elastic Beanstalk  
B) AWS CloudFormation  
C) AWS Lambda  
D) Amazon ECS  

**정답: B**  
해설: CloudFormation is an IaC service that defines infrastructure as JSON/YAML templates (code) for repeatable reproduction and version control. Elastic Beanstalk focuses on simplifying app deployment, Lambda is serverless code execution, and ECS is container orchestration, so none are meant for defining infrastructure as a whole.

---

**문제 2.** A developer wants to deploy a web app quickly by uploading just the code — without handling infrastructure details directly — and have EC2, a load balancer, and Auto Scaling configured automatically. Which service is most appropriate?

A) AWS CloudFormation  
B) AWS Config  
C) AWS Elastic Beanstalk  
D) Amazon EKS  

**정답: C**  
해설: Elastic Beanstalk automatically configures and deploys the standard infrastructure needed to run the code once uploaded, letting the developer focus on the code. CloudFormation requires defining every resource directly, Config evaluates configuration, and EKS manages Kubernetes, so their purposes differ.

---

**문제 3.** You want to run containers but not patch or scale the underlying EC2 servers (nodes) directly — a serverless approach. Which is most appropriate?

A) Amazon EC2  
B) AWS Fargate  
C) Amazon RDS  
D) AWS CloudTrail  

**정답: B**  
해설: Fargate is serverless compute that runs only containers on ECS/EKS without node (EC2) management. EC2 requires managing servers directly, RDS is a database, and CloudTrail is audit logs, so they have nothing to do with running containers.

---

**문제 4.** You want code to run only when an event (e.g., a file upload) occurs, to be charged only for the time it runs, and to not manage servers at all. Which service is most appropriate?

A) AWS Lambda  
B) Amazon EC2  
C) Amazon EKS  
D) AWS Elastic Beanstalk  

**정답: A**  
해설: Lambda is serverless compute that runs only in response to events and charges only for the time used. EC2, EKS, and Beanstalk each require maintaining and managing servers or environments to varying degrees, so they don't meet the "no servers at all" condition.

---

**문제 5.** A team already using standard open-source Kubernetes wants to run managed Kubernetes on AWS. Which service is most appropriate?

A) Amazon ECS  
B) Amazon EKS  
C) AWS Lambda  
D) AWS CloudFormation  

**정답: B**  
해설: EKS provides standard Kubernetes in managed form, so it fits well with existing Kubernetes workloads. ECS is AWS's proprietary container orchestration, Lambda is serverless functions, and CloudFormation is IaC, so none are Kubernetes management services.

---
