# Day 4 - PrivateLink and VPC Endpoint: Service-Oriented Networking

In traditional networks, two systems communicating requires IP routing. Routes must exist in routing tables, CIDRs can't overlap, and firewall rules must allow it. AWS PrivateLink fundamentally changes this paradigm. Instead of IP routing, communicate via **service names**; overlapping CIDRs work fine; and since it's unidirectional, the service consumer never sees the service producer's internal network structure. Today we'll cover PrivateLink's operating principles from the start through Gateway/Interface/GWLB Endpoint differences, DNS resolution mechanisms, and security appliance chaining patterns—all to SAP-C02 depth.

## PrivateLink's Design Philosophy: Service-Oriented Networking

The problem PrivateLink solves is clear. When two organizations want to share services, historically had two main choices. First, expose public IPs over the internet—security risk and DDoS vulnerability follow. Second, connect at network level via VPC Peering or TGW—CIDR collision issues and overly broad access permissions result.

PrivateLink offers a third path. **Expose services at Endpoint level, not network level**. Producer places NLB (Network Load Balancer) in their VPC and creates Endpoint Service in front. Consumer creates Interface Endpoint in their VPC, which creates local ENI (Elastic Network Interface) with private IP. When Consumer sends requests to this ENI's IP, AWS PrivateLink infrastructure delivers to Producer's NLB.

```
[Consumer VPC: 10.0.0.0/16]              [Producer VPC: 10.0.0.0/16]
                                          ← CIDRs completely overlap and work!
  EC2 (10.0.1.100)
      │
      │ Request: 10.0.5.20 (looks like local IP)
      ▼
  Interface Endpoint ENI
  (10.0.5.20, AZ-a)   ──── AWS PrivateLink Internally ────> NLB (Producer)
  Interface Endpoint ENI                                        │
  (10.0.6.20, AZ-b)                                            ▼
                                                          App Server
```

> 💡 **Related Theory**: PrivateLink's internal implementation is AWS's implementation of the **Service Mesh** pattern. Like microservice architectures abstracting service discovery and inter-service communication, PrivateLink separates inter-VPC service communication from IP routing. Consumer needn't know Producer's internal IP structure; Producer IP changes don't affect Consumer. Combined with Martin Fowler's "Strangler Fig" pattern, this enables gradual legacy system servicification.

Three core characteristics: **Unidirectional** (Consumer → Producer only), **CIDR overlap allowed**, **service-level access control**.

> 📚 **Case Study**: Snowflake has enabled customers since 2019 to access Snowflake data warehouse via AWS PrivateLink without traversing internet. In environments where financial regulators require "data must not pass internet," PrivateLink is the only way to use Snowflake SaaS from private network. MongoDB Atlas, Datadog, Elastic Cloud similarly offer PrivateLink access.

## Three Types of VPC Endpoint: Selection Criteria

### Gateway Endpoint: Free S3 and DynamoDB-Only Service

Gateway Endpoint adds special route table entries directing S3 or DynamoDB traffic directly to AWS backbone. It differs fundamentally from Interface Endpoint in not creating ENIs.

```
VPC Route Table:
  pl-xxxxxxxx (S3 Prefix List) → vpce-xxxxxxxxx (Gateway Endpoint)

EC2 → S3 Packet → Route Table Lookup → S3 Prefix List Matching
                                      → Gateway Endpoint Routing
                                      → Reaches S3 via AWS Backbone
```

> 🔍 **Deeper Dive**: Gateway Endpoint internally uses **Managed Prefix Lists**. AWS automatically maintains prefix lists managing S3 IP ranges, and Gateway Endpoint route table entries reference these prefix lists. When S3 IPs change, AWS automatically updates prefix lists and routing reflects automatically. Users don't manage S3 IP lists directly. This mechanism enables zero-cost operation.

**Gateway Endpoint Limitations**: Only supports S3 and DynamoDB. Unusable from on-premises (route table-based so VPC-internal only). Doesn't work to S3 in other regions.

> ⚠️ **Pitfall**: Creating S3 Gateway Endpoint doesn't mean on-premises connected via DX/VPN can use it. On-premises traffic doesn't traverse Gateway Endpoint because it's route-table-based. For on-premises to privately access S3, S3 **Interface Endpoint** is required. Missing this distinction causes wrong answers on exam questions about "on-premises accessing S3 without internet."

### Interface Endpoint (PrivateLink): General-Purpose Private Service Access

Interface Endpoint creates ENI in VPC subnets for private IP access to AWS services or custom services. Currently 130+ AWS services support Interface Endpoint.

```bash
# Interface Endpoint supported service examples
com.amazonaws.ap-northeast-2.secretsmanager
com.amazonaws.ap-northeast-2.kms
com.amazonaws.ap-northeast-2.ecs
com.amazonaws.ap-northeast-2.ecr.api
com.amazonaws.ap-northeast-2.ecr.dkr
com.amazonaws.ap-northeast-2.logs
com.amazonaws.ap-northeast-2.monitoring
com.amazonaws.ap-northeast-2.sqs
com.amazonaws.ap-northeast-2.sns
com.amazonaws.ap-northeast-2.ssm
```

Interface Endpoint cost structure: hourly charge per AZ ($0.01~) + data processing charge (per GB). Creating Endpoints across multiple AZs in VPC creates one ENI per AZ with per-AZ hourly charge.

> 💡 **Related Theory**: Interface Endpoint internally operates on AWS's **Hyperplane** distributed networking infrastructure. Hyperplane is the internal network virtualization layer AWS announced at 2019 re:Invent, where managed network services like NAT Gateway, PrivateLink, Network Firewall all run. Hyperplane processes packets statelessly, enabling automatic horizontal scaling with no single point of failure.

### Gateway Load Balancer Endpoint: Security Appliance Traffic Chaining

GLB Endpoint is a special Endpoint redirecting traffic to network security appliances (firewall, IDS/IPS, DLP). Uses GENEVE (Generic Network Virtualization Encapsulation, RFC 8926) protocol to preserve original packet context when delivering to appliance.

```
[Spoke VPC Inbound Traffic]
     │
     │ Traffic arriving from IGW
     ▼
[VPC Ingress Route Table]
  0.0.0.0/0 → GLB Endpoint ──────────────── GENEVE Encapsulation ──────────────>
                                                                    [Security VPC]
                                                                    GLB → Firewall
                                                                    Firewall → GLB
<───────────────────── After Inspection Return ─────────────────────────────────
     │
     ▼
[Clean Traffic, Deliver to Final Destination]
```

> 💡 **Related Theory**: GENEVE (RFC 8926) was designed as VXLAN's (RFC 7348) successor protocol. While VXLAN only includes 24-bit VNID in fixed headers, GENEVE supports variable-length headers and Type-Length-Value (TLV) extensions to carry diverse network virtualization metadata. AWS GLB uses GENEVE to preserve original 5-tuple (source IP, destination IP, source port, destination port, protocol) when delivering to appliances. Appliances apply stateful firewall rules based on this context.

**GLB Endpoint's Core Value**: Centralized security inspection. Dozens of Spoke VPCs share single Security VPC appliance. Replacing or upgrading appliances requires no Spoke VPC configuration changes.

> 🎯 **Scenario**: Large financial holding company manages 15 subsidiary accounts via AWS Organizations. All inbound/outbound internet traffic from each subsidiary VPC must be inspected by Palo Alto Networks firewall run by security team. Deploying firewalls per VPC requires 15 firewall licenses and operational costs. Instead, deploy GLB + Palo Alto Networks in Security VPC, create GLB Endpoints in each subsidiary VPC to redirect all traffic to Security VPC. Firewall upgrades occur only in Security VPC; subsidiary VPCs need no changes.

## DNS Resolution: Private DNS Enablement Meaning

Creating Interface Endpoint provides two types of DNS names.

**1. Default Endpoint DNS Name** (always available):
```
vpce-0123456789abcdef0-abc12345.secretsmanager.ap-northeast-2.vpce.amazonaws.com
vpce-0123456789abcdef0-abc12345-ap-northeast-2a.secretsmanager.ap-northeast-2.vpce.amazonaws.com
```

**2. With Private DNS Enabled** (recommended):
Existing standard service URL (`secretsmanager.ap-northeast-2.amazonaws.com`) resolves to ENI private IP within VPC. No application code changes needed.

```
VPC Internal DNS Lookup:
secretsmanager.ap-northeast-2.amazonaws.com → 10.0.5.20 (ENI Private IP)

Outside VPC (Internet) DNS Lookup:
secretsmanager.ap-northeast-2.amazonaws.com → 52.x.x.x (Public IP)
```

For Private DNS to work, both VPC settings must be enabled:
- `enableDnsSupport`: Enable DNS resolution in VPC
- `enableDnsHostnames`: Assign DNS hostnames to EC2 in VPC

> 🔍 **Deeper Dive**: Private DNS enablement internally automatically creates and **Route 53 Private Hosted Zone** connected to VPC. This Private Hosted Zone overrides VPC internal DNS lookups of service domain (`*.amazonaws.com`) to ENI IP. VPC DNS resolver (169.254.169.253) queries this Private Hosted Zone first, so ENI IP takes precedence over public DNS. This mechanism doesn't affect outside VPC, so identical Endpoint URL resolves to private IP inside VPC and public IP from internet.

> ⚠️ **Pitfall**: If custom Route 53 Private Hosted Zone already exists for same domain, Interface Endpoint's Private DNS can conflict. For example, if PHZ exists for `amazonaws.com`, Endpoint's Private DNS may not work correctly. To separate, applying PHZ only to service-specific subdomains (e.g., `secretsmanager.ap-northeast-2.amazonaws.com`) is recommended.

## Producer-Side Configuration: Creating Endpoint Service

To expose custom services to Consumer VPCs or other accounts via PrivateLink, **create Endpoint Service**.

```bash
# 1. Create NLB (Network-level load balancing)
aws elbv2 create-load-balancer \
  --name my-service-nlb \
  --type network \
  --subnets subnet-aaa subnet-bbb

# 2. Create Endpoint Service (connect to NLB)
aws ec2 create-vpc-endpoint-service-configuration \
  --network-load-balancer-arns arn:aws:elasticloadbalancing:...:loadbalancer/net/my-service-nlb/xxx \
  --acceptance-required  # Manually approve Consumer connection requests

# 3. Allow service to Consumer account/Organization
aws ec2 modify-vpc-endpoint-service-permissions \
  --service-id vpce-svc-xxx \
  --add-allowed-principals arn:aws:iam::CONSUMER_ACCT:root

# Consumer side: Create Interface Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-consumer \
  --service-name com.amazonaws.vpce.ap-northeast-2.vpce-svc-xxx \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-ccc subnet-ddd \
  --security-group-ids sg-yyy \
  --private-dns-enabled
```

Setting `acceptance-required: true` requires Producer manual approval when Consumer submits Endpoint creation request. Auto-approval (`acceptance-required: false`) is possible but restricting via allowed Principal list is security-recommended.

## Endpoint Policy: Fine-Grained Access Control

Endpoint Policy is IAM policy restricting API actions and resources allowed through VPC Endpoint. Applicable to both S3 Gateway Endpoint and Interface Endpoint.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::company-data-bucket/*"]
    },
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-xxxxxxxxx"
        }
      }
    }
  ]
}
```

> 💡 **Related Theory**: Endpoint Policy is special form of IAM's **Resource-based Policy**. In IAM evaluation logic, Endpoint Policy acts as filter applying additional restrictions to requests passing through VPC Endpoint. Even if IAM user policy allows, Endpoint Policy denial blocks access (AND logic). Using `aws:sourceVpce` condition in S3 bucket policy enables data isolation allowing only specific Endpoint access.

## PrivateLink vs Peering vs TGW: When Use What

| Criterion | PrivateLink | VPC Peering | TGW |
|------|-------------|-------------|-----|
| Connection Model | Service unit | Entire network | Entire network |
| Direction | Unidirectional (Consumer → Producer) | Bidirectional | Bidirectional |
| CIDR Overlap | Allowed | Not allowed | Not allowed |
| Consumer Configuration | Interface Endpoint ENI | Route table | Route table |
| Access Scope | Designated service only | All peer VPC IPs | All TGW-connected VPC IPs |
| Multi-account | Endpoint Service allow list | Peering request/approval | RAM share |
| Cost | ENI hourly + data | Free (inter-VPC)| TGW processing cost |
| Scalability | Independent per service | O(N²) Peering count | O(N) Attachment |

> 🎯 **Scenario**: Insurance company A provides premium calculation API to reinsurer B. Both companies use identical VPC CIDR 10.0.0.0/8. Peering impossible due to CIDR collision. Network connectivity via TGW means reinsurer B gains access to insurance company A's entire internal network—security concern. PrivateLink exposing only calc API NLB means reinsurer B accesses only API endpoint, no CIDR collision, and insurance company A's internal structure stays hidden.

## Cross-Account, Cross-Region PrivateLink

**Cross-Account**: Adding other account ARN to `add-allowed-principals` when creating Endpoint Service allows that account's VPC to be Consumer. Can allow entire Organizations.

**Cross-Region** (2024 support added): Consumer and Producer VPCs in different regions can connect via PrivateLink. Consumer region's Interface Endpoint connects through AWS backbone to Endpoint Service in other region. Inter-region data transfer cost added.

> 🔍 **Deeper Dive**: Before Cross-Region PrivateLink support, accessing services in other regions privately required complex TGW Inter-Region Peering + local NLB combination. Since 2024, Interface Endpoints can directly reference Endpoint Services in other regions, simplifying multi-region service architecture. This allows global SaaS services to provide private access to worldwide customers via single-region PrivateLink infrastructure.

## Comparison with Other Cloud Similar Services

| Item | AWS PrivateLink | GCP Private Service Connect | Azure Private Link |
|------|----------------|-----------------------------|--------------------|
| Producer Side | NLB + Endpoint Service | Service Attachment (NEG) | Standard Load Balancer |
| Consumer Side | Interface Endpoint (ENI) | PSC Endpoint | Private Endpoint (NIC) |
| CIDR Overlap | Allowed | Allowed | Allowed |
| Direction | Unidirectional | Unidirectional | Unidirectional |
| DNS Integration | Private DNS automatic | Cloud DNS manual config | Private DNS Zone |
| Supported Services Count | 130+ AWS services | 40+ GCP services | 90+ Azure services |

> 📚 **Case Study**: Google Cloud's Private Service Connect (PSC) launched 2021 following identical AWS PrivateLink pattern. PSC uses NEG (Network Endpoint Group) on Producer side and PSC Endpoint on Consumer side. GCP's single global VPC characteristic means PSC handles cross-region connectivity simply, simpler than AWS. Azure Private Link, launched 2019, was first among three clouds implementing this pattern.

## Practice: KMS and Secrets Manager Private Access Pattern

Encryption key management (KMS) and secret management (Secrets Manager) are representative services requiring VPC-internal access without internet for security.

```bash
# KMS Interface Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxx \
  --service-name com.amazonaws.ap-northeast-2.kms \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-kms-endpoint \
  --private-dns-enabled

# Secrets Manager Interface Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxx \
  --service-name com.amazonaws.ap-northeast-2.secretsmanager \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-secretsmanager-endpoint \
  --private-dns-enabled

# KMS Endpoint Policy: Allow only specific keys
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id vpce-xxx \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCT:role/AppRole"},
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:ap-northeast-2:ACCT:key/KEY-ID"
    }]
  }'
```

Security Group applies to Interface Endpoint's ENI. For EC2 instances to access KMS Endpoint ENI, that Security Group's inbound rules must allow EC2 Security Group or EC2 IP (port 443).

> ⚠️ **Pitfall**: Not specifying Security Group when creating Interface Endpoint automatically attaches **VPC default Security Group**. Default SG allows all traffic within same SG, so if default SG applies to all EC2s, Endpoint access becomes overly permissive. Always create explicit Security Group and configure to allow only necessary source on port 443.

PrivateLink is core pattern across AWS service access, internal service sharing, third-party SaaS integration, and security appliance chaining. On SAP-C02, keywords "CIDR overlap," "unidirectional service exposure," "SaaS access without internet" indicate PrivateLink is the answer.

---

## 📝 연습 문제

**문제 1.** Financial company uses Snowflake data warehouse. Regulations require data not traverse internet; both organizations use identical VPC CIDR 10.0.0.0/8. Appropriate connection method:

A) VPC Peering
B) AWS Transit Gateway + TGW Peering
C) AWS PrivateLink (Interface Endpoint)
D) Direct Connect + Public VIF

**정답: C**
Explanation: Identical CIDR makes Peering and TGW impossible due to CIDR collision (A, B incorrect). Direct Connect + Public VIF accesses AWS public services like S3 privately, doesn't apply to third-party SaaS like Snowflake (D incorrect). PrivateLink connects service-unit regardless of CIDR collision—correct answer. Snowflake provides PrivateLink Endpoint Service so Customer creates Interface Endpoint in their VPC.

---

**문제 2.** EC2 instance (private subnet) accesses S3. Data must not traverse internet and cost minimization required. Most appropriate method:

A) Access S3 over internet via NAT Gateway
B) S3 Interface Endpoint (PrivateLink)
C) S3 Gateway Endpoint
D) Access S3 via on-premises through VPN tunnel

**정답: C**
Explanation: S3 Gateway Endpoint is free and doesn't traverse internet. Interface Endpoint (B) also works but incurs hourly + data charges. "Cost minimization" keyword points to free Gateway Endpoint as answer. NAT Gateway (A) traverses internet with costs. VPN routing (D) adds unnecessary complexity. However, if on-premises must privately access S3, Gateway Endpoint is route-table-based unsuitable for on-premises, requiring Interface Endpoint.

---

**문제 3.** Company A's internal microservice (VPC A) must serve company B (VPC B). Company B should only call service, not access other Company A resources. Both VPCs have overlapping CIDRs. Appropriate architecture:

A) VPC A and VPC B Peering connection
B) Create Endpoint Service (NLB-based) in VPC A, configure Interface Endpoint in VPC B
C) Connect both VPCs via TGW then restrict with Security Group
D) Place NAT Gateway in VPC A and expose service with public IP

**정답: B**
Explanation: PrivateLink Endpoint Service is standard pattern for unidirectional service-level exposure. Meets all requirements: CIDR overlap allowed, unidirectional (B→A API calls only), VPC A's other resources inaccessible. Peering (A) impossible due to CIDR overlap; even if possible, VPC B would gain access to all VPC A resources. TGW (C) also CIDR-collision issues and enables network-level access. Public IP exposure (D) violates security via internet.

---

**문제 4.** Want to inspect all outbound internet traffic from multiple VPCs via central Security VPC's firewall appliance. Appliance must maintain original packet's 5-tuple and perform stateful inspection. Appropriate configuration:

A) TGW + Egress VPC + NLB-based appliance
B) ALB + Lambda-based traffic inspection
C) Gateway Load Balancer + GLB Endpoint + GENEVE protocol
D) PrivateLink Interface Endpoint + appliance VPC

**정답: C**
Explanation: GLB preserves original packet 5-tuple via GENEVE (RFC 8926) when delivering to appliances. Appliance applies stateful firewall rules based on this info and returns traffic. GLB Endpoint placed in Spoke VPCs "Bump in the wire" style. NLB (A) is L4 load balancer making source IP preservation complex and GENEVE unsupported. ALB + Lambda (B) is HTTP-level processing unsuitable for all L3/L4 traffic inspection. Interface Endpoint (D) is unidirectional service exposure, not traffic redirection pattern.

---

**문제 5.** Created Secrets Manager Interface Endpoint in VPC and enabled Private DNS. However, calling `secretsmanager.ap-northeast-2.amazonaws.com` from EC2 returns public IP. Root cause:

A) Interface Endpoint Security Group blocks port 443
B) VPC's `enableDnsSupport` or `enableDnsHostnames` disabled
C) S3 Gateway Endpoint interferes DNS resolution
D) EC2's /etc/hosts file has wrong entry

**정답: B**
Explanation: Private DNS requires both VPC DNS support (`enableDnsSupport=true`) and DNS hostnames (`enableDnsHostnames=true`) enabled. If either disabled, Private Hosted Zone doesn't connect to VPC so standard domain resolves to public IP. Security Group (A) is packet filter unaffecting DNS resolution. S3 Gateway Endpoint (C) unrelated to Secrets Manager DNS. /etc/hosts (D) possible but not mentioned condition and uncommon cause.

---

**문제 6.** Multi-account environment: must use shared service account's billing service (NLB-based) privately from 50 different workload account VPCs. Most appropriate configuration:

A) Peer shared account VPC with all 50 workload account VPCs
B) Share TGW via RAM and connect shared account VPC to TGW
C) Create Endpoint Service in shared account + add Organizations to allowed Principal + create Interface Endpoint in workload accounts
D) Make shared account's NLB internet-facing

**정답: C**
Explanation: Adding Organizations ARN to Endpoint Service's `add-allowed-principals` allows all organization accounts creating Interface Endpoints. New accounts need no Endpoint Service configuration changes. Peering (A) requires minimum 50 Peerings with CIDR collision risk. TGW (B) enables network-level access to billing service beyond just service resources, high operational complexity. Internet-facing NLB (D) violates security requirements.

---

**문제 7.** Which Gateway Endpoint or Interface Endpoint (PrivateLink) can on-premises servers use via DX to privately access S3 without internet:

A) Only Gateway Endpoint possible
B) Only Interface Endpoint possible
C) Both possible
D) Neither possible, only Public VIF possible

**정답: B**
Explanation: Gateway Endpoint is route-table-based, applies only to VPC-internal traffic. On-premises traffic via DX doesn't traverse Gateway Endpoint. Interface Endpoint creates ENI for private IP access, so on-premises can access via DX Private VIF to Interface Endpoint ENI IP reaching S3 without internet. Requires on-premises DNS to resolve S3 domain to Interface Endpoint private IP via Route 53 Resolver configuration.

---
