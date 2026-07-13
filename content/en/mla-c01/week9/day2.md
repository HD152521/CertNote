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

## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
