# Day 2 - Network Isolation: VPC-Mode SageMaker and PrivateLink

## 📌 Key Takeaways

- By default, SageMaker runs containers in an **AWS-managed network** and can reach the internet. Regulated environments must block this.
- **VPC mode** (`VpcConfig`) attaches the container ENI to subnets in your own VPC so that security group, routing, and endpoint controls apply.
- **`EnableNetworkIsolation`** is a stronger block that cuts off **all outbound calls** from the container.
- To reach AWS services from a VPC with no internet gateway, you need **VPC endpoints**. S3 and DynamoDB use gateway endpoints; everything else uses interface endpoints (PrivateLink).
- If VPC-mode training hangs, it is usually a **missing S3/ECR endpoint**; if distributed training does not work, it is usually a **missing security group self-referencing rule**.

## Three Levels of Isolation — What to Block and How Far

If yesterday was permissions ("who can do what"), today is networking ("where does traffic flow"). With the default settings, a SageMaker training job runs in an isolated network managed by AWS and can reach the internet if needed. It is convenient, but it has two stumbling blocks: ① the concern that data could leak through an internet path, and ② the financial and healthcare regulatory requirement that "all traffic stays inside our VPC."

| Item | Default (SageMaker-managed network) | VPC mode (`VpcConfig`) | Network isolation (`EnableNetworkIsolation`) |
|------|-------------------------------|------------------------|------------------------------------------|
| Where the container attaches | A network managed by AWS | An ENI in a subnet of your VPC | **Can be combined** with VPC mode. Blocks outbound entirely |
| Internet access | Possible | Depends on subnet routing (not possible if private) | Not possible |
| Security group / NACL applies | No | Yes | Not applicable (there are no calls at all) |
| S3 access path | The service handles it | A VPC endpoint is required | SageMaker downloads the data in advance and provides it to the container |
| Configuration key | None (default) | `Subnets` + `SecurityGroupIds` | `EnableNetworkIsolation: true` |
| Typical use | Experiments · PoC | Regulatory compliance, traffic path control | Highest level of isolation, blocking data exfiltration |
| Typical side effect | No means of control | The job hangs if an endpoint is missing | `pip install` and external API calls are impossible |

The three levels are not mutually exclusive; they **stack**. You pull traffic inside your own boundary with VPC mode, remove the internet gateway, fill in the missing paths with VPC endpoints, and add network isolation on top for the most sensitive workloads.

```text
[Default mode]
Training container → AWS-managed network → (internet possible)

[VPC mode]
Training container → Customer VPC subnet (ENI) → Security group → VPC endpoint → S3 / SageMaker API
                                                  (no internet gateway)

[VPC mode + network isolation]
Training container ─╳─ all outbound blocked
        ▲
        └── uses only the data SageMaker pre-downloaded and mounted
```

> 💡 **Related Theory**: The essence of VPC mode is "pulling the traffic path inside a boundary the customer can control." Once inside the VPC, you can apply all the familiar VPC controls: security groups, NACLs, route tables, and VPC endpoints. Isolation starts not from "blocking" but from "gathering traffic where I can see it."

## Configuring VPC Mode

You specify subnets and security groups for a training job or model with `VpcConfig`. SageMaker creates an **ENI (Elastic Network Interface)** in the specified subnets to connect the container to the VPC.

```json
{
  "VpcConfig": {
    "Subnets": ["subnet-0a1b2c3d", "subnet-4e5f6a7b"],
    "SecurityGroupIds": ["sg-0123456789abcdef0"]
  }
}
```

- **Subnets**: Providing subnets in multiple AZs improves availability. You normally use **private subnets** (those with no route to an internet gateway).
- **SecurityGroupIds**: The security groups attached to the container ENI. They control inbound and outbound rules.
- The subnet needs plenty of **available IPs**. Each instance needs an ENI, so if IPs run out in distributed training, the job fails.

In the Python SDK, you pass these directly as Estimator parameters.

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
    encrypt_inter_container_traffic=True,              # encrypt node-to-node traffic
)
```

## Cutting Off the Internet — EnableNetworkIsolation

VPC mode alone may not be enough. Stronger isolation is **network isolation**. When you turn it on, the container **cannot make any outbound network call**, and not only the internet but also calls inside the VPC are blocked. The container operates solely on the data SageMaker provides.

```json
{
  "EnableNetworkIsolation": true
}
```

With network isolation on, the container cannot download external packages or call external APIs. So you must put all dependencies into the container image in advance. Use it for sensitive workloads that need the strictest isolation.

`EnableNetworkIsolation` and VPC mode are easy to confuse, but they are at different levels. VPC mode means "send the traffic to the customer VPC," and network isolation means "cut off all of the container's outbound traffic." Using the two together is the strongest, but once isolation is on, SageMaker pre-downloads the training data and mounts it into the container. The answer to the scenario "prevent the container from downloading models from the internet" is network isolation.

> ⚠️ **Pitfall**: With network isolation on, `pip install` inside the training script, pretrained weight downloads, and sending to an external metrics server all fail. A good share of "why does it work locally but only fail on SageMaker" cases are this one. The remedies are ① bake the dependencies into a custom image, or ② upload a `requirements.txt` with the source directory so that SageMaker handles it before startup.

## VPC Endpoints (PrivateLink) — Calling AWS Services Without the Internet

If you remove the internet gateway with VPC mode, how does the container reach S3 or the SageMaker API? The answer is a **VPC endpoint**. Traffic flows only inside the AWS backbone without crossing the internet. There are two kinds, and distinguishing which is which is within the exam scope.

| Item | Gateway endpoint | Interface endpoint (PrivateLink) |
|------|----------------------|-------------------------------------|
| Supported services | **Only two: S3 and DynamoDB** | Most others, such as SageMaker API and Runtime, ECR, CloudWatch Logs, and STS |
| How it works | Adds a route to the route table | Creates an ENI in the subnet and assigns a private IP |
| Security group attachment | Not possible (controlled by endpoint policy) | Possible (attach an SG to the ENI) |
| Name resolution | Handled by routing | Private DNS resolves the service domain to the private IP |
| Cost | None | Charged per hour + data processed |
| Use from on-premises | Not possible (only from inside that VPC) | Possible (via Direct Connect or VPN) |
| Access control means | Endpoint policy | Endpoint policy + security group |

To run VPC-mode training without the internet, you need the following endpoints.

```text
Required VPC endpoints (for VPC-mode training without the internet)
- com.amazonaws.<region>.s3                  (gateway)   → data · artifacts · ECR image layers
- com.amazonaws.<region>.sagemaker.api       (interface) → job control
- com.amazonaws.<region>.sagemaker.runtime   (interface) → inference calls
- com.amazonaws.<region>.ecr.api             (interface) → image metadata · authentication
- com.amazonaws.<region>.ecr.dkr             (interface) → Docker pull
- com.amazonaws.<region>.logs                (interface) → CloudWatch Logs
- com.amazonaws.<region>.sts                 (interface) → role assumption
```

If these endpoints are missing, you get the symptom "I switched to VPC mode and the job hangs and never finishes," because the container cannot reach S3 or ECR. In particular, **ECR image layers are stored in S3**, so if you create only the ECR endpoints and forget the S3 gateway endpoint, the image pull fails.

You can check what has actually been created right away with the EC2 API.

```python
import boto3

ec2 = boto3.client('ec2')
resp = ec2.describe_vpc_endpoints(
    Filters=[{'Name': 'vpc-id', 'Values': ['vpc-0abc123456789def0']}]
)

for ep in resp['VpcEndpoints']:
    print(ep['ServiceName'], ep['VpcEndpointType'], ep['State'])
    # check that ServiceName includes s3 / sagemaker.api / ecr.dkr / logs / sts
```

The core value of PrivateLink (interface endpoints) is that "AWS service traffic never rides the public internet." Because the endpoint has a private IP inside the VPC, S3 and SageMaker look to the container as if they were in the same VPC. Moving the data exfiltration path from the internet to the AWS backbone is the final piece of the isolation puzzle.

## Where the Traffic Actually Flows

```text
┌──────────────────────── Customer VPC ────────────────────────┐
│                                                          │
│   Private subnet A               Private subnet B        │
│   ┌─────────────────┐           ┌─────────────────┐      │
│   │ Training        │◀─────────▶│ Training        │      │
│   │ container       │ node-to-  │ container       │      │
│   │  ENI (sg-app)   │ node      │  ENI (sg-app)   │      │
│   └────────┬────────┘ traffic   └────────┬────────┘      │
│            │  443/HTTPS                   │               │
│            ▼                              ▼               │
│   ┌────────────────────────────────────────────┐          │
│   │  Interface endpoint ENI (sg-endpoint)      │          │
│   └────────────────────────────────────────────┘          │
│            │                                              │
│            ├──▶ SageMaker API / Runtime                   │
│            ├──▶ ECR (api · dkr)                           │
│            ├──▶ CloudWatch Logs                           │
│            └──▶ STS                                       │
│                                                          │
│   Route table ──▶ [S3 gateway endpoint] ──▶ S3            │
│                                                          │
│   ✗ No internet gateway      ✗ No NAT gateway             │
└──────────────────────────────────────────────────────────┘
```

Traffic to the interface endpoints is created by **private DNS**. The container calls `sagemaker.<region>.amazonaws.com` as usual, and the in-VPC DNS resolves that name to the private IP of the endpoint ENI. If you turn private DNS off, the code tries to go out to a public IP and fails, so it is effectively a required setting.

## Security Groups — A Firewall at the ENI Level

You narrow traffic further with the security groups attached to the container ENIs and the VPC endpoint ENIs. Distributed training requires the containers to talk to each other, so it needs a self-referencing rule.

```text
SageMaker container security group (sg-app)
- Inbound: all TCP from sg-app itself          (node-to-node traffic in distributed training)
- Outbound: 443 → sg-endpoint                  (calls the VPC endpoints over HTTPS)

VPC endpoint security group (sg-endpoint)
- Inbound: 443 ← sg-app                        (HTTPS from the containers)
```

| Rule | What happens without it |
|------|------------------|
| sg-app self-referencing inbound | In multi-node distributed training, node-to-node traffic is blocked and training never starts |
| sg-app outbound 443 → sg-endpoint | The container cannot reach any VPC endpoint and the job hangs |
| sg-endpoint inbound 443 ← sg-app | Connections are refused even though the endpoint was created |

If you allow outbound only on 443 to the endpoint security group, traffic cannot leak anywhere else. The trick is to **reference other security group IDs** rather than IP ranges. In a SageMaker environment where ENIs get a new IP every time, IP-based rules are unmanageable.

## VPC Mode Checklist

The order to check when VPC-mode training hangs or fails:

1. Is the subnet private, and does routing go to the VPC endpoints?
2. Is there an S3 gateway endpoint, and is it **associated with that subnet's route table**?
3. Are there interface endpoints for SageMaker API/Runtime, ECR (api and dkr), Logs, and STS?
4. Is **private DNS** turned on for the interface endpoints?
5. Is security group outbound 443 open to the endpoint SG?
6. For distributed training, is there a self-referencing inbound rule?
7. Does the subnet have **available IPs** left to create ENIs?
8. Is external package download really necessary (if so, a NAT gateway or pre-baking into the image)?

## When Isolation Blocks You: Symptom → Cause → Fix

| Symptom | Common cause | Fix |
|------|-----------|------|
| After switching to VPC mode, the job starts but times out with no progress | No S3 gateway endpoint, or it is not associated with the route table | Create the endpoint and associate it with that subnet's route table |
| Stuck at the container image pull stage | `ecr.api` and `ecr.dkr` missing, or the S3 endpoint for image layers is missing | Configure the two ECR endpoints + the S3 gateway endpoint **together** |
| Logs do not reach CloudWatch, so even finding the cause is hard | The `logs` interface endpoint is missing | Create the logs endpoint. Without it in an isolated environment, debugging is shut down |
| `pip install` in the training script fails | Network isolation is active, or there is no internet path | Bake the dependencies into the image or pass `requirements.txt` in the source directory |
| Multi-node distributed training hangs at the start phase | No security group self-referencing inbound rule | Add a rule with source = sg-app to the sg-app inbound |
| Access fails even though the endpoint was created | Private DNS disabled, or inbound 443 not opened on the endpoint SG | Enable private DNS + sg-endpoint inbound 443 ← sg-app |
| Everything else works but only S3 is denied | The `aws:SourceVpce` value in the bucket policy or endpoint policy does not match the actual endpoint ID | Compare the VPCE ID embedded in the policy with the current endpoint ID |
| Job preparation time becomes noticeably longer | VPC mode adds a step that creates ENIs in the subnet | Normal behavior. Proceed with extra timeout margin |
| The job fails because ENI creation failed | The subnet has run out of available IPs | Use a subnet with a larger CIDR or specify subnets in multiple AZs together |

Tomorrow we cover KMS encryption and Secrets management, which protect the data and models themselves.

## 📖 Glossary

- **VPC mode** : A setting that runs training and inference containers attached to customer VPC subnets as ENIs. It is specified with `Subnets` and `SecurityGroupIds`.
- **ENI (Elastic Network Interface)** : A virtual network card that has a private IP inside the VPC. SageMaker creates it when attaching a container to the VPC.
- **EnableNetworkIsolation** : An option that blocks all outbound network calls from the container. The strongest means of isolation.
- **VPC endpoint** : A pathway that lets you reach AWS services without crossing the internet. There are gateway and interface types.
- **Gateway endpoint** : Dedicated to S3 and DynamoDB. It works by adding a route to the route table and has no additional cost.
- **Interface endpoint (PrivateLink)** : Connects to a service by creating an ENI and private IP in the subnet. Most services use this method, and it is billed per hour and per data processed.
- **Private DNS** : A feature that resolves a service's public domain name to the endpoint's private IP. If turned off, the code tries to go out over the public path and fails.
- **Private subnet** : A subnet with no route to an internet gateway. The default placement for VPC-mode SageMaker.
- **Self-referencing security group rule** : An inbound rule that specifies the same security group as its source. Essential for node-to-node traffic in distributed training.
- **aws:SourceVpce** : A condition key that checks whether a request came in through a specific VPC endpoint. Used when opening a bucket only through that path.

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
