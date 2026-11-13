# Day 2 - Network Isolation: VPC-Mode SageMaker and PrivateLink

## 📌 Key Takeaways

- By default, SageMaker runs containers on an **AWS-managed network** and can reach the internet. In regulated environments you have to block that.
- **VPC mode** (`VpcConfig`) attaches the container's ENI to a subnet in your VPC so that security groups, routing, and endpoint controls apply.
- **`EnableNetworkIsolation`** is a step stronger, cutting off **all outbound calls** from the container.
- To reach AWS services from a VPC with no internet gateway, you need **VPC endpoints**. S3 and DynamoDB use gateway endpoints; the rest use interface endpoints (PrivateLink).
- If VPC-mode training stalls, it is usually a **missing S3/ECR endpoint**; if distributed training doesn't work, it is a **missing security-group self-referencing rule**.

## Three Levels of Isolation — What to Block, and How Far

If yesterday was permissions — "who can do what" — today is the network — "where does traffic flow." In the default setup, a SageMaker training job runs on an isolated network managed by AWS and can reach the internet if needed. It's convenient, but there are two stumbling blocks — ① the worry that data could leak over an internet path, and ② the financial and healthcare regulation requirement that "all traffic stay inside our VPC."

| Item | Default (SageMaker-managed network) | VPC mode (`VpcConfig`) | Network isolation (`EnableNetworkIsolation`) |
|------|-------------------------------|------------------------|------------------------------------------|
| Where the container attaches | A network managed by AWS | An ENI in your VPC subnet | **Can be combined** with VPC mode. Blocks outbound itself |
| Internet access | Possible | Depends on subnet routing (not possible if private) | Not possible |
| Security group / NACL applied | No | Yes | Not applicable (no calls at all) |
| S3 access path | The service handles it | A VPC endpoint is required | SageMaker pre-downloads the data and provides it to the container |
| Configuration key | None (default) | `Subnets` + `SecurityGroupIds` | `EnableNetworkIsolation: true` |
| Representative use | Experiments, PoC | Regulatory compliance, traffic path control | Highest-level isolation, blocking data exfiltration |
| Representative side effect | No control mechanisms | Job stalls if an endpoint is missing | `pip install` and external API calls are impossible |

The three levels are not exclusive; they **stack**. Use VPC mode to pull traffic inside your own boundary, remove the internet gateway, fill the missing paths with VPC endpoints, and layer network isolation on the most sensitive workloads.

```text
[Default mode]
Training container → AWS-managed network → (internet possible)

[VPC mode]
Training container → customer VPC subnet (ENI) → security group → VPC endpoint → S3 / SageMaker API
                                                  (no internet gateway)

[VPC mode + network isolation]
Training container ─╳─ all outbound blocked
        ▲
        └── only uses data that SageMaker pre-downloaded and mounted
```

> 💡 **Related theory**: The essence of VPC mode is "pulling the traffic path inside a boundary the customer can control." Once inside the VPC, you can apply all the familiar VPC controls — security groups, NACLs, route tables, VPC endpoints. Isolation begins not with "blocking" but with "gathering traffic where I can see it."

## VPC Mode Configuration

You specify subnets and security groups on a training job or model with `VpcConfig`. SageMaker creates an **ENI (Elastic Network Interface)** in the specified subnets to connect the container to the VPC.

```json
{
  "VpcConfig": {
    "Subnets": ["subnet-0a1b2c3d", "subnet-4e5f6a7b"],
    "SecurityGroupIds": ["sg-0123456789abcdef0"]
  }
}
```

- **Subnets**: Providing subnets in multiple AZs raises availability. You normally use **private subnets** (with no route to an internet gateway).
- **SecurityGroupIds**: The security groups attached to the container ENI. They control inbound and outbound rules.
- The subnet needs plenty of **available IPs**. Each instance needs an ENI, so in distributed training the job fails if IPs run out.

In the Python SDK, you pass them straight through as Estimator parameters.

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=container,
    role=role,
    instance_count=2,
    instance_type='ml.m5.xlarge',
    subnets=['subnet-0a1b2c3d', 'subnet-4e5f6a7b'],   # VPC mode
    security_group_ids=['sg-0123456789abcdef0'],
    enable_network_isolation=True,                     # block all outbound
    encrypt_inter_container_traffic=True,              # encrypt traffic between nodes
)
```

## Blocking the Internet — EnableNetworkIsolation

VPC mode alone may not be enough. The stronger isolation is **network isolation**. When you turn it on, the container **cannot make any outbound network call** — not just the internet, but calls inside the VPC are blocked too. The container operates only on data provided by SageMaker.

```json
{
  "EnableNetworkIsolation": true
}
```

With network isolation on, the container can't download external packages or call external APIs. So you must bake all dependencies into the container image in advance. Use it for sensitive workloads that need the strictest isolation.

`EnableNetworkIsolation` and VPC mode are easy to confuse but are at different levels. VPC mode is "send traffic to the customer VPC," and network isolation is "cut off all outbound from the container." Using both together is the most powerful — however, when isolation is on, SageMaker pre-downloads the training data and mounts it into the container. The answer to the scenario "prevent the container from downloading models from the internet" is network isolation.

> ⚠️ **Pitfall**: With network isolation on, `pip install` inside the training script, pretrained-weight downloads, and sending to an external metrics server all fail. A good share of "why does it work locally but not only on SageMaker" is this case. The responses are ① bake dependencies into a custom image, or ② upload a `requirements.txt` with the source directory so SageMaker handles it before startup.

## VPC Endpoints (PrivateLink) — Calling AWS Services Without the Internet

If you remove the internet gateway with VPC mode, how does the container reach S3 or the SageMaker API? The answer is **VPC endpoints**. Traffic flows only inside the AWS backbone without passing through the internet. There are two kinds, and telling which is which is within the exam scope.

| Item | Gateway endpoint | Interface endpoint (PrivateLink) |
|------|----------------------|-------------------------------------|
| Supported services | **Only two: S3 and DynamoDB** | Most others: SageMaker API/Runtime, ECR, CloudWatch Logs, STS, etc. |
| How it works | Adds a route to the route table | Creates an ENI in the subnet and assigns a private IP |
| Security group attachment | Not possible (controlled by endpoint policy) | Possible (attach an SG to the ENI) |
| Name resolution | Handled by routing | Private DNS resolves the service domain to a private IP |
| Cost | None | Billed per hour + data processed |
| Use from on-premises | Not possible (only from inside that VPC) | Possible (via Direct Connect/VPN) |
| Access control means | Endpoint policy | Endpoint policy + security group |

To run VPC-mode training with no internet, you need the following endpoints.

```text
Required VPC endpoints (for VPC-mode training with no internet)
- com.amazonaws.<region>.s3                  (gateway)   → data · artifacts · ECR image layers
- com.amazonaws.<region>.sagemaker.api       (interface) → job control
- com.amazonaws.<region>.sagemaker.runtime   (interface) → inference calls
- com.amazonaws.<region>.ecr.api             (interface) → image metadata · authentication
- com.amazonaws.<region>.ecr.dkr             (interface) → Docker pull
- com.amazonaws.<region>.logs                (interface) → CloudWatch Logs
- com.amazonaws.<region>.sts                 (interface) → role assumption
```

If these endpoints are missing, you get the phenomenon "I switched to VPC mode and the job hangs and never finishes" — because the container can't reach S3 or ECR. In particular, **ECR image layers are stored in S3**, so if you create only the ECR endpoints and miss the S3 gateway endpoint, the image pull fails.

You can check what is actually created directly with the EC2 API.

```python
import boto3

ec2 = boto3.client('ec2')
resp = ec2.describe_vpc_endpoints(
    Filters=[{'Name': 'vpc-id', 'Values': ['vpc-0abc123456789def0']}]
)

for ep in resp['VpcEndpoints']:
    print(ep['ServiceName'], ep['VpcEndpointType'], ep['State'])
    # Check that ServiceName includes all of s3 / sagemaker.api / ecr.dkr / logs / sts
```

The core value of PrivateLink (interface endpoints) is "AWS service traffic never rides the public internet." Since the endpoint has a private IP inside the VPC, from the container's point of view S3 or SageMaker looks as if it were in the same VPC. Moving the data-exfiltration path from the internet to the AWS backbone is the last piece of the isolation puzzle.

## Where Does Traffic Actually Flow

```text
┌──────────────────────── Customer VPC ────────────────────────┐
│                                                          │
│   Private subnet A               Private subnet B        │
│   ┌─────────────────┐           ┌─────────────────┐      │
│   │ Training container│◀─────────▶│ Training container│      │
│   │   ENI (sg-app)  │  node-to-  │   ENI (sg-app)  │      │
│   └────────┬────────┘  node      └────────┬────────┘      │
│            │  443/HTTPS                   │               │
│            ▼                              ▼               │
│   ┌────────────────────────────────────────────┐          │
│   │  Interface endpoint ENI (sg-endpoint)       │          │
│   └────────────────────────────────────────────┘          │
│            │                                              │
│            ├──▶ SageMaker API / Runtime                   │
│            ├──▶ ECR (api · dkr)                           │
│            ├──▶ CloudWatch Logs                           │
│            └──▶ STS                                       │
│                                                          │
│   Route table ──▶ [S3 gateway endpoint] ──▶ S3       │
│                                                          │
│   ✗ No internet gateway      ✗ No NAT gateway       │
└──────────────────────────────────────────────────────────┘
```

The traffic to the interface endpoint is made by **private DNS**. The container calls `sagemaker.<region>.amazonaws.com` as usual, and the VPC's internal DNS resolves that name to the private IP of the endpoint ENI. If you leave private DNS off, the code tries to go out to a public IP and fails, so it's effectively a required setting.

## Security Groups — A Firewall at the ENI Level

You narrow traffic further with security groups attached to the container ENI and the VPC endpoint ENI. In distributed training the containers must talk to each other, so a self-referencing rule is needed.

```text
SageMaker container security group (sg-app)
- Inbound: all TCP from sg-app itself   (node-to-node communication in distributed training)
- Outbound: 443 → sg-endpoint                (call VPC endpoints over HTTPS)

VPC endpoint security group (sg-endpoint)
- Inbound: 443 ← sg-app                       (HTTPS from containers)
```

| Rule | What happens without it |
|------|------------------|
| sg-app self-referencing inbound | In multi-node distributed training, node-to-node communication is blocked and training doesn't start |
| sg-app outbound 443 → sg-endpoint | The container can't reach any VPC endpoint and the job hangs |
| sg-endpoint inbound 443 ← sg-app | Connections are refused even though you created the endpoint |

If you allow outbound only on 443 to the endpoint security group, traffic doesn't leak elsewhere. The trick is to **reference other security group IDs** rather than IP ranges. In a SageMaker environment where ENIs get a new IP each time, IP-based rules are impossible to manage.

## VPC Mode Checklist

The order of checks when VPC-mode training stalls or fails:

1. Is the subnet private, and does routing go to the VPC endpoints?
2. Does the S3 gateway endpoint exist and is it **associated with that subnet's route table**?
3. Do the SageMaker API/Runtime, ECR (api, dkr), Logs, and STS interface endpoints exist?
4. Is **private DNS** on for the interface endpoints?
5. Is security group outbound 443 open to the endpoint SG?
6. For distributed training, is there a self-referencing inbound rule?
7. Does the subnet have **available IPs** left to create ENIs?
8. Is external package downloading truly necessary (if so, a NAT gateway or baking into the image)?

## When Isolation Gets Blocked: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| After switching to VPC mode, the job starts but times out with no progress | No S3 gateway endpoint, or not associated with the route table | Create the endpoint and associate it with that subnet's route table |
| Stuck at the container image pull stage | `ecr.api`/`ecr.dkr` missing, or the S3 endpoint for image layers missing | Configure the two ECR endpoints + the S3 gateway endpoint **together** |
| Logs don't appear in CloudWatch so even finding the cause is hard | `logs` interface endpoint missing | Create the logs endpoint. Without it in an isolated environment, debugging is shut off |
| `pip install` in the training script fails | Network isolation active or no internet path | Bake dependencies into the image or pass `requirements.txt` in the source directory |
| Multi-node distributed training stalls at startup | No security group self-referencing inbound rule | Add a rule with source = sg-app to sg-app inbound |
| Access fails even though the endpoint was created | Private DNS disabled, or the endpoint SG's 443 inbound not open | Enable private DNS + sg-endpoint inbound 443 ← sg-app |
| Everything else works but only S3 is denied | The `aws:SourceVpce` value in the bucket/endpoint policy doesn't match the actual endpoint ID | Compare the VPCE ID embedded in the policy against the current endpoint ID |
| Job preparation time becomes noticeably longer | VPC mode adds a step of creating ENIs in the subnet | Normal behavior. Proceed with some timeout slack |
| Job fails because ENI creation failed | The subnet's available IPs are exhausted | Use a subnet with a larger CIDR or specify subnets in several AZs together |

Tomorrow we cover KMS encryption and Secrets management, which protect the data and the model themselves.

## 📖 Glossary

- **VPC mode**: A setting that runs training/inference containers attached as ENIs to customer VPC subnets. Specified with `Subnets` and `SecurityGroupIds`.
- **ENI (Elastic Network Interface)**: A virtual network card with a private IP inside a VPC. SageMaker creates it when attaching a container to the VPC.
- **EnableNetworkIsolation**: An option that blocks all outbound network calls from the container. The strongest means of isolation.
- **VPC endpoint**: A pathway that lets you reach AWS services without passing through the internet. There are gateway and interface types.
- **Gateway endpoint**: Dedicated to S3 and DynamoDB. It works by adding a route to the route table and has no extra cost.
- **Interface endpoint (PrivateLink)**: Creates an ENI and a private IP in the subnet to connect to the service. Most services use this method, billed per hour and per data.
- **Private DNS**: A feature that resolves a service's public domain name to the endpoint's private IP. If left off, code tries to go out over a public path and fails.
- **Private subnet**: A subnet with no route to an internet gateway. The default placement for VPC-mode SageMaker.
- **Self-referencing security group rule**: An inbound rule that specifies the same security group as its source. Essential for node-to-node communication in distributed training.
- **aws:SourceVpce**: A condition key that checks whether a request came in through a specific VPC endpoint. Used when opening a bucket only through that path.

---

## 📝 Practice Questions

**Question 1.** Per regulatory requirements, a SageMaker training container must not make any external network calls, and must not be able to fetch model weights or packages from outside. What is the most appropriate setting?

A) Specify a public subnet in VpcConfig  
B) Set `EnableNetworkIsolation` to true and include the dependencies in the container image in advance  
C) Open security group outbound to 0.0.0.0/0  
D) Add a NAT gateway  

**Answer: B**  
Explanation: Turning on network isolation blocks all outbound calls from the container so it can't fetch packages or weights from outside, which makes it the strongest isolation; in return, the needed dependencies must be put in the image beforehand. In A, a public subnet actually opens an internet path, and C and D allow or expand external access, so they are the opposite of the requirement.

---

**Question 2.** You ran a training job in VPC mode (private subnet, no internet gateway), and the job starts but makes no progress and eventually times out. What is the most likely cause?

A) The training algorithm hyperparameters are wrong  
B) The S3 gateway endpoint and ECR interface endpoints are missing, so it can't reach the data and image  
C) The instance type isn't a GPU  
D) The user lacks `iam:PassRole`  

**Answer: B**  
Explanation: In VPC mode without an internet gateway, reaching S3 and ECR requires a gateway/interface VPC endpoint respectively, and without them the container can't reach the data and image and hangs. A and C would produce other errors rather than a hang, and for D, a missing PassRole means the job can't even start, so it doesn't match the symptom "it starts."

---

**Question 3.** You want to configure VPC access to S3 without passing through the internet and without cost. What is appropriate?

A) Create a gateway VPC endpoint for S3 and associate it with the route table  
B) Use only an interface endpoint (PrivateLink) for S3  
C) Access S3 through a NAT gateway  
D) Add an internet gateway  

**Answer: A**  
Explanation: S3 and DynamoDB support gateway VPC endpoints, which work by adding a route to the route table, giving access without passing through the internet and at no extra cost. For B, S3 can also have an interface endpoint, but it's billed per hour and per data so it doesn't fit "without cost," and C and D send traffic out a public path, which goes against the isolation goal.

---

**Question 4.** You ran multi-node distributed training in VPC mode, and training doesn't start because nodes can't communicate with each other. What rule should be added to the security group?

A) Allow all inbound from 0.0.0.0/0  
B) A self-referencing inbound rule with the same security group as the source (allowing node-to-node communication)  
C) Allow 443 outbound to the internet  
D) Deny all inbound  

**Answer: B**  
Explanation: Distributed training nodes have ENIs in the same security group, so for node-to-node communication they need a self-referencing inbound rule with that security group as the source. A opens security excessively, against least privilege; C is external, not node-to-node (internal) communication; and D blocks communication further and worsens the problem.

---

**Question 5.** Which most accurately describes the difference between VPC mode and `EnableNetworkIsolation`?

A) They are different names for the same setting  
B) VPC mode sends traffic to the customer VPC so VPC controls apply, while network isolation blocks all outbound network calls from the container  
C) VPC mode costs money and network isolation is free  
D) Network isolation allows internet access  

**Answer: B**  
Explanation: VPC mode attaches the container to a customer VPC subnet so VPC controls such as security groups and endpoints apply, while network isolation is a stronger block that cuts all outbound from the container; they are at different levels. A is wrong because they are different settings, C is wrong because a cost-based distinction isn't the point, and D is the opposite explanation since network isolation blocks the internet.

---
