# Day 4 - Private Connectivity: VPC Endpoints and Sealing Data Exfiltration

Day 1 said NAT Gateway can become an exfiltration path. App Tier reading objects from S3 usually exits to Internet via NAT. But NAT allows outbound broadly — whether to S3 or attacker''s server, it doesn''t distinguish. When a compromised instance using stolen creds exfiltrates company data to external S3 bucket, NAT can''t stop it.

VPC Endpoint solves this problem fundamentally. Connect to AWS services (S3, DynamoDB, KMS, Secrets Manager, etc.) **without the Internet**, privately inside the AWS backbone. Removing the Internet route removes the exfiltration path itself. Plus, endpoint policy can enforce "only our company bucket, only our organization account." Today we examine two endpoint types, PrivateLink, and design that seals exfiltration via endpoint policy. This is the peak of SCS-C03 Domain 3.

## Two Endpoint Types: Gateway vs Interface

| Item | Gateway Endpoint | Interface Endpoint (PrivateLink) |
|------|------------------|----------------------------------|
| Supported Services | **S3, DynamoDB only** | Most AWS services + custom services |
| How It Works | Adds prefix list route to route table | Creates ENI in subnet (private IP) |
| Cost | **Free** | Hourly + data processing charge |
| Access From | VPC only | VPC + on-premises (DX/VPN) possible |
| DNS | Public DNS as-is | Override service domain with Private DNS |
| Security Group | Doesn''t apply (routing) | SG applicable to ENI |

> 💡 **Related Theory**: The difference comes from different **implementation layers**. Gateway Endpoint operates at the **routing layer** — add a route in the route table to S3''s prefix list (`pl-xxxx`), and traffic destined for that service flows through AWS internals, not Internet. Interface Endpoint operates at the **ENI layer** — create an actual network interface (private IP) in the subnet and connect to the service via that IP. So Interface has SG and on-premises access possible, but Gateway is routing-based so works only inside VPC.

```bash
# Gateway Endpoint (S3) — add route to table, free
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxx --service-name com.amazonaws.us-east-1.s3 \
  --vpc-endpoint-type Gateway \
  --route-table-ids rtb-app rtb-data

# Interface Endpoint (KMS) — create ENI in subnet, enable Private DNS
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxx --service-name com.amazonaws.us-east-1.kms \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-app-a subnet-app-b \
  --security-group-ids sg-vpce \
  --private-dns-enabled
```

> ⚠️ **Pitfall**: Exam mainstay — "S3 and DynamoDB are Gateway, everything else is Interface." "Lambda in VPC accessing S3 privately" uses Gateway (free), not Interface. Reverse: "on-premises accessing S3 privately via DX" — Gateway is VPC-only so won''t work, need **S3 Interface Endpoint** (added 2021). So S3 supports both but use cases differ — free Gateway for VPC-only, Interface for on-premises.

## Private DNS: Send Privately Without Changing Code

Interface Endpoint''s key feature is **Private DNS**. Normally apps call public domains like `kms.us-east-1.amazonaws.com`. Enable Private DNS and the domain resolves to the endpoint''s **private IP within VPC**. Traffic flows via private path without changing a line of code.

> 🔍 **Deeper**: For Private DNS to work, VPC''s `enableDnsSupport` and `enableDnsHostnames` must both be enabled. If disabled, Private DNS won''t work — domain still resolves to public IP and traffic leaks to Internet. Troubleshooting "built endpoint but still going to Internet": check (1) Private DNS enable, (2) VPC DNS properties, (3) endpoint ENI subnet reachability to calling instances. From on-premises, need Route 53 Resolver Inbound Endpoint or conditional forwarding so public domain resolves to endpoint private IP at on-premises resolver.

## Endpoint Policy: Core Weapon to Seal Exfiltration

Attach **resource-based policy (VPC Endpoint Policy)** to endpoints. This is the core tool to prevent data exfiltration. Limits "what can be accessed through this endpoint."

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": [
      "arn:aws:s3:::my-company-bucket/*"
    ],
    "Condition": {
      "StringEquals": { "aws:PrincipalOrgID": "o-myorg123" }
    }
  }]
}
```

This policy means: through this endpoint, **only `my-company-bucket`, only Principals from our organization (`o-myorg123`) can access**. Even if compromised instance steals creds and tries PutObject to attacker''s bucket, that bucket isn''t in Resource, so it''s blocked.

> 💡 **Related Theory**: This is the **Data Perimeter** concept AWS established. Best practice on three axes — (1) "trust only these IDs" (`aws:PrincipalOrgID`), (2) "trust only these resources" (`aws:ResourceOrgID`), (3) "trust only from these networks" (`aws:SourceVpce`). Endpoint policy is the core tool of the network axis. If bucket policy enforces `aws:SourceVpce` condition "allow only through our VPC endpoint," direct access from Internet or other accounts is blocked.

> 🎯 **Scenario**: "Sensitive S3 bucket. Completely block access from employee laptop or compromised external host. Allow only requests through company VPC." — Answer: (1) Create Gateway Endpoint, (2) **bucket policy** with `"Condition": {"StringEquals": {"aws:SourceVpce": "vpce-xxxx"}}` to allow only endpoint transit, (3) also add `aws:SourceVpc` or `aws:PrincipalOrgID`. Then console/CLI access from Internet = AccessDenied. Data stays trapped in network boundary.

> ⚠️ **Pitfall**: Setting only `aws:SourceVpce` in bucket policy **blocks all other access** and can cut off CloudFront/service integration. Also VPC Endpoint policy, bucket policy, IAM policy are **AND-combined** — deny anywhere = deny overall; all must allow = allow. So narrowing endpoint policy sometimes breaks legitimate traffic. Endpoint policy defaults to "full access" — narrow incrementally with validation.

## PrivateLink: Service Provider Pattern

Generalizing Interface Endpoint is **PrivateLink**. Connect not just to AWS services but **custom services provided by other accounts**.

```
[Consumer VPC]                          [Provider VPC]
 Interface Endpoint (ENI) ──private──→ Endpoint Service ──→ NLB ──→ Backend
   (connects via private IP)            (different account/org)
```

- Provider exposes service behind NLB as **Endpoint Service**.
- Consumer connects via Interface Endpoint. **CIDR overlap irrelevant**, no Peering needed.
- Traffic one-way (consumer→provider), provider''s full VPC not exposed.

> 🔍 **Deeper**: PrivateLink is more secure than VPC Peering for **attack surface difference**. Peering connects two VPCs bidirectionally via routing — full CIDR visible (SG narrows it). PrivateLink shows only the **single service (NLB endpoint)** provider exposes; rest of provider VPC fully hidden. That''s why SaaS serving many customers use PrivateLink — isolate from customer VPCs without mixing. No CIDR collision (ENI uses consumer VPC IPs).

> 📚 **Case**: Snowflake, Datadog, MongoDB Atlas all offer PrivateLink for private connectivity. Customer data never touches Internet to reach SaaS, easing compliance (HIPAA, PCI). With Peering, provider''s entire VPC would be exposed to customer — risk. PrivateLink implements "expose only needed service privately" least-exposure principle at network level.

## Summary: Three Layers to Stop Exfiltration

```
1. Remove NAT → block Internet egress path itself
2. VPC Endpoint → private connection to only needed AWS services
3. Endpoint Policy + bucket policy(aws:SourceVpce) → restrict who/where
```

> 🔍 **Deeper**: Strongest isolation = completely remove NAT and route all AWS service access through Interface/Gateway Endpoints only. But then instances can''t get OS patches from Internet, so connect Systems Manager (SSM Agent) via Interface Endpoints (`ssm`, `ssmmessages`, `ec2messages`), container images via ECR Endpoint, logs via CloudWatch Logs Endpoint. Build "zero-internet VPC" and exfiltration paths vanish. Regulated workloads (finance, healthcare) adopt this.

## Wrapping Up

Three essentials. First, **Gateway Endpoint is S3/DynamoDB-only (free, routing-based)** and rest all **Interface Endpoint (PrivateLink, ENI-based, paid)**. Second, endpoint policy and bucket policy''s `aws:SourceVpce` condition build **data perimeter** blocking direct access from Internet/external accounts — even stolen creds can''t exfiltrate. Third, **PrivateLink smaller attack surface than Peering**, standard for SaaS/cross-account.

Network isolation''s final goal is "leave only paths to data that were explicitly allowed." Next we integrate Week 3 — VPC design, SG/NACL, Flow Logs, private connectivity — into one scenario review.

---

## 📝 Practice Questions

**Question 1.** A Lambda function inside a VPC must privately access an S3 bucket without going through the internet. What is the most cost-effective method?

A) Create an Interface Endpoint (PrivateLink) for S3  
B) Create a Gateway Endpoint and add the S3 route to the route table  
C) Route out to S3 through a NAT Gateway  
D) Connect to the S3 service VPC with VPC Peering  

**Answer: B**  
Explanation: S3 and DynamoDB support the free Gateway Endpoint, and private access from inside the VPC is possible by adding the service route to the route table. An Interface Endpoint incurs hourly and data processing charges, so it is disadvantageous in cost for VPC-internal-only access, and S3 is not something you can Peer with a service VPC.

---

**Question 2.** Private access to S3 is needed from an on-premises data center through Direct Connect. What is the appropriate configuration?

A) Create an S3 Gateway Endpoint  
B) Create an S3 Interface Endpoint  
C) Place a NAT Gateway on the on-premises side  
D) Make the S3 bucket public  

**Answer: B**  
Explanation: A Gateway Endpoint is routing-based and VPC-internal only, so it cannot be reached directly from on-premises. To access privately from on-premises through Direct Connect or VPN, you need an S3 Interface Endpoint, which places an ENI in the subnet. Making the bucket public goes against the private connectivity requirement.

---

**Question 3.** We want an S3 bucket holding sensitive data to be accessible only to requests that go through the corporate VPC endpoint. What is the most effective control?

A) Allow only via a specific endpoint with the aws:SourceVpce condition in the bucket policy  
B) Apply an ACL to the bucket to block anonymous access  
C) Restrict the bucket inbound with a security group  
D) Block the S3 IP ranges with a NACL  

**Answer: A**  
Explanation: If you put a condition requiring a specific VPC endpoint in the bucket policy, direct access from the internet, console, or other accounts that does not go through that endpoint is denied, keeping the data inside the network boundary. S3 is not a target to which security groups or NACLs apply directly, and ACLs cannot express such network-origin-based constraints.

---

**Question 4.** Even though an Interface Endpoint was created and Private DNS was turned on, traffic still goes out to the internet. What should be checked first?

A) The Resource scope of the bucket policy  
B) The VPC's enableDnsSupport and enableDnsHostnames attributes  
C) The NAT Gateway's ephemeral port range  
D) The rule number order of the NACL  

**Answer: B**  
Explanation: For Private DNS to resolve the service domain to the endpoint's private IP, both the VPC's DNS support and DNS hostnames attributes must be on. If these attributes are off, the domain resolves to a public IP and traffic flows over the internet path. Ephemeral ports or NACL order have nothing to do with the DNS resolution path.

---

**Question 5.** A SaaS provider wants to provide its service privately to many customers without exposing its entire VPC to the customers. What is the advantage of PrivateLink over VPC Peering?

A) Data transfer costs are always cheaper than Peering  
B) Only the single service endpoint the provider exposes is visible, the rest of the VPC is hidden, and there are no CIDR conflicts  
C) It automatically configures bidirectional routing, making management easy  
D) It works only if the customer and provider CIDRs overlap  

**Answer: B**  
Explanation: With Peering, the entire CIDR of both VPCs is visible in both directions, so the exposure surface is large and it does not work if the CIDRs overlap. With PrivateLink, only the single service the provider exposes with an NLB is visible to the consumer and the rest of the provider VPC is completely hidden, and because it is an ENI approach using consumer VPC addresses, CIDR conflicts do not occur either.

---

**Question 6.** In a "zero-internet VPC" with no internet path at all, we want to manage EC2 instances with Systems Manager. What configuration is needed?

A) Temporarily open a NAT Gateway so the SSM Agent can communicate  
B) Create Interface Endpoints for ssm, ssmmessages, ec2messages, and so on  
C) An S3 Gateway Endpoint alone makes SSM work  
D) Assign a public IP to the instance  

**Answer: B**  
Explanation: To use Systems Manager in a VPC with no internet path, you must privately connect the SSM-related service endpoints with Interface Endpoints. This way, patching and session management traffic flows only inside the AWS backbone. Opening a NAT or assigning a public IP recreates a data exfiltration path and goes against the isolation goal.

---
