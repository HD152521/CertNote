# Day 2 - Network Isolation: VPC Mode SageMaker and PrivateLink

Yesterday was permissions: "who can do what." Today is networking: "where does traffic flow." By default, SageMaker training and inference containers run in AWS-managed networks and can reach the internet. In sensitive or regulated environments, this must be blocked. Today you learn **VPC mode**, **internet blocking**, **VPC Endpoints (PrivateLink)**, and **security groups** to isolate SageMaker.

## Why VPC Mode

By default, SageMaker training jobs run in AWS-managed, isolated networks with optional internet access. Two problems arise: ① data might leak via internet routes, ② regulations (finance, healthcare) require "all traffic stays inside our VPC." The solution is **VPC mode** — attaching training/inference containers to **customer VPC subnets**.

```text
[Default Mode]
Training container → AWS-managed network → (internet possible)

[VPC Mode]
Training container → customer VPC subnet (ENI) → security group → VPC Endpoint → S3/SageMaker API
                                                (no internet gateway)
```

VPC mode makes SageMaker create an **ENI (elastic network interface)** in your specified subnet, connecting the container to your VPC.

> 💡 **Related Theory**: VPC mode's essence is "bringing traffic into customer-controlled boundaries." Once inside the VPC, you apply familiar VPC controls: security groups, NACLs, routing tables, VPC Endpoints. Isolation isn't about blocking—it's about routing traffic to where you can see it.

## VPC Mode Configuration

Specify subnets and security groups via `VpcConfig` in the training job or model.

```json
{
  "VpcConfig": {
    "Subnets": ["subnet-0a1b2c3d", "subnet-4e5f6a7b"],
    "SecurityGroupIds": ["sg-0123456789abcdef0"]
  }
}
```

- **Subnets**: Multiple AZ subnets improve availability. Typically use **private subnets** (no internet gateway routes).
- **SecurityGroupIds**: Security groups attached to the container ENI. Control inbound/outbound rules.

## Internet Blocking — EnableNetworkIsolation

VPC mode alone isn't enough. Stronger isolation is **network isolation**. When enabled, containers **cannot make any outbound network calls** — not even to the internet or within VPC. Containers operate only on data SageMaker provides.

```json
{
  "EnableNetworkIsolation": true
}
```

Caveat: Network isolation blocks external package downloads and API calls. All dependencies must be pre-baked into the container image. Use for extremely sensitive workloads requiring maximum isolation.

> 💡 **Related Theory**: `EnableNetworkIsolation` and VPC mode are often confused but operate at different levels. VPC mode means "send traffic to customer VPC," network isolation means "cut all container outbound." Together they're most powerful — but isolation prevents downloading packages, so dependencies must be image-embedded. "Block external model/code downloads" scenarios point to network isolation.

## VPC Endpoints (PrivateLink) — Access AWS Services Without Internet

With VPC mode and no internet gateway, how do containers reach S3 or SageMaker APIs? Answer: **VPC Endpoints**. Traffic stays within AWS backbone, never touching the internet.

Two types:

- **Gateway Endpoint**: S3 and DynamoDB only. Add routes to routing tables. No cost.
- **Interface Endpoint (PrivateLink)**: Most other services (SageMaker API, SageMaker Runtime, ECR, CloudWatch Logs, STS). ENI created in subnet with private IP. Hourly + data cost.

```text
Required VPC Endpoints (Internet-free VPC mode training)
- com.amazonaws.<region>.s3                  (gateway) → data/artifacts
- com.amazonaws.<region>.sagemaker.api       (interface) → job control
- com.amazonaws.<region>.sagemaker.runtime   (interface) → inference calls
- com.amazonaws.<region>.ecr.dkr / ecr.api   (interface) → container pull
- com.amazonaws.<region>.logs                (interface) → CloudWatch Logs
- com.amazonaws.<region>.sts                 (interface) → role assume
```

Missing endpoints cause "job starts but never finishes" — containers can't reach S3 or ECR. Classic exam trap.

> 💡 **Related Theory**: PrivateLink's core value: "AWS service traffic never touches public internet." Endpoints have private IPs in your VPC, so containers see S3/SageMaker as if they're local. Data leak paths shift from internet to AWS backbone—final isolation puzzle piece.

## Security Groups — ENI-Level Firewall

Attach security groups to container ENI and VPC Endpoint ENI to narrow traffic further. Distributed training needs node-to-node communication via self-referencing rules.

```text
SageMaker Container Security Group (sg-app)
- Inbound: from sg-app (self-referencing) all TCP (distributed training node comms)
- Outbound: 443 → Endpoint security group (sg-endpoint) (HTTPS to VPC Endpoints)

VPC Endpoint Security Group (sg-endpoint)
- Inbound: 443 from sg-app (HTTPS from containers)
```

- **Self-referencing inbound missing** = distributed training (multi-node) node-to-node communication blocked, training won't start.
- Outbound 443 to endpoint security group only = traffic doesn't leak.

## VPC Mode Checklist

When VPC training hangs or fails:

1. Subnets private? Routes go to VPC Endpoints?
2. S3 gateway endpoint present and route table linked?
3. SageMaker API/Runtime, ECR, Logs, STS interface endpoints present?
4. Security group outbound 443 open to endpoints?
5. Distributed training? Self-referencing inbound present?
6. (If NAT gateway used) Do you need external package download path?

## Summary

Today in one sentence: **Isolation means pulling traffic into your VPC (VPC mode), removing internet gateways, and filling gaps with VPC Endpoints (PrivateLink).** Strongest blocking is `EnableNetworkIsolation` cutting all container outbound. Hanging VPC training is 90% likely S3/ECR endpoint gaps; broken distributed training is security group self-reference missing. These two points solve network isolation scenarios.

Tomorrow: protecting data and models themselves — KMS encryption and Secrets management.

---

## 📝 Practice Questions

**Question 1.** Due to regulatory requirements, the SageMaker training container must be unable to make any external network calls, so it cannot download model weights or packages from outside. Which setting is the most appropriate?

A) Specify public subnets in VpcConfig  
B) Set `EnableNetworkIsolation` to true and include the dependencies in the container image in advance  
C) Open security group outbound to 0.0.0.0/0  
D) Add a NAT gateway  

**Answer: B**  
Explanation: Turning on network isolation blocks all outbound calls from the container so it cannot fetch packages or weights from outside, which is the strongest isolation, though the necessary dependencies must be included in the image beforehand. A public subnet actually opens an internet path in A, and C and D allow or expand external access, which is the exact opposite of the requirement.

---

**Question 2.** You ran a training job in VPC mode (private subnets, no internet gateway), and the job starts but makes no progress and eventually times out. What is the most likely cause?

A) The training algorithm hyperparameters are wrong  
B) There is no S3 gateway endpoint or ECR interface endpoint, so it cannot reach the data or the image  
C) The instance type is not a GPU  
D) The user lacks `iam:PassRole`  

**Answer: B**  
Explanation: In VPC mode without an internet gateway, reaching S3 and ECR requires a gateway/interface VPC endpoint for each, and without them the container cannot access the data or image and hangs. A and C produce different errors rather than a hang, and for D a missing PassRole would prevent the job from even starting, which does not match the symptom "it starts."

---

**Question 3.** You want to configure VPC access to S3 without traversing the internet and at no cost. Which is appropriate?

A) Create a gateway VPC endpoint for S3 and associate it with the route table  
B) Use only an interface endpoint (PrivateLink) for S3  
C) Access S3 through a NAT gateway  
D) Add an internet gateway  

**Answer: A**  
Explanation: S3 and DynamoDB support gateway VPC endpoints, which provide access without traversing the internet and at no additional cost by adding a route to the route table. B is possible for S3 as well, but interface endpoints are billed per hour and per data processed, which does not fit "at no cost," and C and D send traffic over a public path, which contradicts the isolation goal.

---

**Question 4.** You ran multi-node distributed training in VPC mode, and communication between nodes fails, so training does not start. Which rule should be added to the security group?

A) Allow all inbound from 0.0.0.0/0  
B) A self-referencing inbound rule whose source is the same security group (allowing node-to-node communication)  
C) Allow outbound 443 to the internet  
D) Deny all inbound  

**Answer: B**  
Explanation: Distributed training nodes have ENIs in the same security group, so a self-referencing inbound rule with that security group as the source is needed to allow node-to-node communication. A opens security too broadly and violates least privilege, C is about external communication rather than internal node-to-node traffic, and D blocks communication further and makes the problem worse.

---

**Question 5.** Which statement most accurately describes the difference between VPC mode and `EnableNetworkIsolation`?

A) They are two names for the same setting  
B) VPC mode sends traffic through the customer VPC so that VPC controls apply, while network isolation blocks all outbound network calls from the container  
C) VPC mode costs money and network isolation is free  
D) Network isolation allows internet access  

**Answer: B**  
Explanation: VPC mode attaches the container to a customer VPC subnet so that VPC controls such as security groups and endpoints apply, while network isolation is a stronger block that cuts all outbound traffic from the container, so the two are at different levels. A is wrong because they are different settings, C is wrong because cost is not the key distinction, and D is the opposite explanation because network isolation blocks the internet.

---
