# Day 4 - Private Connectivity: VPC Endpoints and Sealing Off Data Exfiltration

On Day 1 we said a NAT Gateway can become a data exfiltration path. For the App Tier to read objects from S3, it normally goes out to the Internet through NAT. But NAT permits outbound broadly — it cannot tell whether traffic is going to S3 or to an attacker's server. When a compromised instance uses stolen credentials to move company data into an external S3 bucket, NAT cannot stop it.

VPC endpoints solve this problem at the root. They connect privately to AWS services (S3, DynamoDB, KMS, Secrets Manager, etc.) **without going through the Internet**, inside the AWS backbone. Since the Internet path can be removed altogether, the very road for data to escape disappears. On top of that, an endpoint policy lets you impose constraints such as "only our company's buckets, only our organization's accounts." Today we look at the two kinds of endpoints, PrivateLink, and a design that seals off exfiltration with endpoint policies. This is the pinnacle of SCS-C03 Domain 3.

## Two Kinds of Endpoints: Gateway vs Interface

| Item | Gateway Endpoint | Interface Endpoint (PrivateLink) |
|------|------------------|----------------------------------|
| Supported services | **Only S3 and DynamoDB** | Most AWS services + your own services |
| How it works | Adds a prefix-list route to the route table | Creates an ENI (private IP) in the subnet |
| Cost | **Free** | Hourly + data processing charges |
| Access | Only from inside the VPC | Inside the VPC + on-premises (DX/VPN) possible |
| DNS | Public DNS as is | Overrides the service domain with Private DNS |
| Security group | Not applicable (routing) | SG can be applied to the ENI |

Looking at the table alone, it seems like a list to memorize, but if you draw **where the packet actually flows**, everything else follows.

```
[ The same "S3 access" can take three different paths ]

(A) Via the Internet — NAT
    EC2(10.0.10.5) ─▶ routing 0.0.0.0/0 → NAT ─▶ IGW ─▶ Internet ─▶ S3 public endpoint
    · Cannot restrict the destination (NAT sends it anywhere)
    · An exfiltration path is opened at the same time

(B) Gateway Endpoint — routing layer
    EC2(10.0.10.5) ─▶ routing pl-xxxx(S3) → vpce-xxxx ─▶ AWS backbone ─▶ S3
                          └ a route expressed as a prefix list
    · No ENI · no private IP · cannot attach an SG · free
    · Works only inside the VPC (on-premises does not use this route table)

(C) Interface Endpoint / PrivateLink — ENI layer
    EC2(10.0.10.5) ─▶ DNS resolves to 10.0.10.240 ─▶ [ENI in subnet] ─▶ AWS backbone ─▶ service
                                                     └ sg-vpce can be applied
    · Creates an ENI (private IP) per subnet · hourly + processing charges
    · Reachable from on-premises (DX/VPN) via that private IP too

  ── The difference among the three is "what specifies the destination."
     (A) is a public IP, (B) is a routing path, (C) is a private IP.
     Only a private IP can be reached from on-premises, so only (C) works there.
```

This picture is the basis of related questions. The reason "private access to S3 from on-premises over Direct Connect" is an Interface Endpoint is that on-premises **does not use the VPC's route table**, and a Gateway Endpoint is a route that exists only in that route table. Conversely, the reason "a Lambda in the VPC accessing S3 privately" is a Gateway Endpoint is that in that case the route table applies as is and the cost is zero.

The difference between the two comes from different **implementation layers**. A Gateway Endpoint works at the **routing layer** — if you add to the route table a route toward the S3 prefix list (`pl-xxxx`), traffic bound for that service flows inside AWS rather than over the Internet. An Interface Endpoint works at the **ENI layer** — it creates an actual network interface (private IP) in the subnet and connects to the service via that IP. So Interface can have an SG attached and is reachable from on-premises, while Gateway, being routing, works only inside the VPC.

```bash
# Gateway Endpoint (S3) — add a route to route tables, free
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxx --service-name com.amazonaws.us-east-1.s3 \
  --vpc-endpoint-type Gateway \
  --route-table-ids rtb-app rtb-data

# Interface Endpoint (KMS) — create ENIs in subnets, Private DNS enabled
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxx --service-name com.amazonaws.us-east-1.kms \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-app-a subnet-app-b \
  --security-group-ids sg-vpce \
  --private-dns-enabled
```

> ⚠️ **Pitfall**: A distinction that is easy to confuse on the exam — "S3 and DynamoDB are Gateway; everything else is Interface." If it is "a Lambda in the VPC accessing S3 privately," the answer is the Gateway Endpoint (free), not Interface. Conversely, if it is "private access to S3 from on-premises over DX," a Gateway cannot do it because it is VPC-internal only, and you need an **S3 Interface Endpoint** (added in 2021). That is, S3 supports both but for different uses — free Gateway for inside the VPC, Interface for on-premises integration.

## Private DNS: Sending Traffic Privately Without Changing Code

The key feature of an Interface Endpoint is **Private DNS**. By default an application calls a public domain like `kms.us-east-1.amazonaws.com`. When Private DNS is on, this domain **resolves to the endpoint's private IP** inside the VPC. Traffic flows over the private path without changing a single line of code.

For Private DNS to work, both `enableDnsSupport` and `enableDnsHostnames` on the VPC must be on. If these are off, even with Private DNS on the domain still resolves to a public IP and traffic leaks to the Internet. When troubleshooting "I created the endpoint but it still goes out to the Internet," check (1) whether Private DNS is enabled, (2) the two VPC DNS attributes, and (3) whether the endpoint ENI's subnet is reachable by routing from the calling instance. When calling from on-premises, a Route 53 Resolver Inbound Endpoint or conditional forwarding is needed so that the public domain resolves to the endpoint's private IP in the on-premises resolver.

## Endpoint Policies: The Key to Sealing Off Exfiltration

You can attach a **resource-based policy (VPC Endpoint Policy)** to an endpoint. This is the key weapon for preventing data exfiltration. It restricts "what can be accessed through this endpoint."

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

The meaning of this policy: through this endpoint, **only `my-company-bucket`, and only Principals belonging to our organization (`o-myorg123`)**, can be accessed. Even if a compromised instance steals credentials and tries to PutObject data to an external attacker's bucket, that bucket is not in Resource, so it is blocked.

This is the **Data Perimeter** concept. A best practice established by AWS, it consists of three axes — (1) "only trusted identities" (`aws:PrincipalOrgID`), (2) "only trusted resources" (`aws:ResourceOrgID`), (3) "only from trusted networks" (`aws:SourceVpce`). The endpoint policy is the key tool for the network axis among these. If you enforce "only requests that went through our VPC endpoint are allowed on our bucket" in the bucket policy with an `aws:SourceVpce` condition, direct access from the Internet or other accounts is blocked.

### Translating the Three Axes into Real Policies

Said in words it is abstract, so let us pair up where each of the three axes attaches. The key point is that **even the same condition key blocks something entirely different depending on which policy it is attached to**.

| Axis | What you want to block | Where to attach | Representative condition key |
|------|------------------------|-----------------|------------------------------|
| Trusted identities | An external account's principal touching our resources | Resource policy (bucket policy, etc.) | `aws:PrincipalOrgID` |
| Trusted resources | Our principal sending data to an **external resource** | Endpoint policy / SCP | `aws:ResourceOrgID` |
| Trusted network | Accessing our resources **from outside our network** | Resource policy | `aws:SourceVpce`, `aws:SourceVpc` |

What is decisive in exfiltration sealing is the **second axis**. The first and third block "outside in," but the scenario where a compromised instance **writes data to an attacker's bucket** with our credentials goes inside out, so neither catches it. The place that blocks this direction is the endpoint policy.

```json
// [Endpoint policy] Through this endpoint, one can go out only to "buckets owned by our organization"
// — blocks exfiltration going inside out
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRequestsFromOurOrgPrincipals",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-myorg123" }
      }
    },
    {
      "Sid": "DenyAccessToResourcesOutsideOurOrg",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringNotEqualsIfExists": { "aws:ResourceOrgID": "o-myorg123" }
      }
    }
  ]
}
```

```json
// [Bucket policy] Into this bucket, only "requests that went through our endpoint" can enter
// — blocks access going outside in
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnlessThroughOurVpcEndpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::corp-sensitive",
        "arn:aws:s3:::corp-sensitive/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": {
          "aws:SourceVpce": ["vpce-0aaa1111", "vpce-0bbb2222"]
        },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    }
  ]
}
```

Putting the two policies side by side, you can see that **the directions are exactly opposite**. The endpoint policy decides "how far you can go out through this door," and the bucket policy decides "through which door you can enter this room." To seal off exfiltration you need both — put up only one and the opposite direction stays open.

> ⚠️ **Pitfall**: Note that the bucket policy above uses `StringNotEqualsIfExists` rather than `StringNotEquals`, and that it includes an `aws:PrincipalIsAWSService` exception. `aws:SourceVpce` is a key that exists only on requests that went through a VPC endpoint, so if you apply `StringNotEquals` to requests that have no such condition key at all (for example, calls an AWS service makes on your behalf, access through CloudFront OAC, cross-Region replication), **they all fall to Deny.** Incidents in which this policy is applied in a hurry and CloudFront distributions, log delivery, and replication are cut off all at once are common. Always design data-perimeter policies with `IfExists`-type operators and service exceptions together, and **before turning on a Deny, pull the list of access origins from CloudTrail first.**

### Policies Are Evaluated as an AND

Let us fix in a picture how endpoint policies, resource policies, and IAM policies combine. The answer to the exam question "I got AccessDenied, where do I look?" comes from here.

```
[ Gates an S3 request through a VPC endpoint must pass ]

   EC2's instance profile role
        │
   ① IAM policy (+ permission boundary / SCP)
        │   "Is this principal allowed to do this action?"
        ▼
   ② VPC endpoint policy
        │   "Is it allowed to go out through this door to this resource?"
        ▼
   ③ Resource policy (bucket policy / KMS key policy)
        │   "Does this resource accept this request?"
        ▼
      Allowed

  · All three gates must be Allow to pass (AND)
  · An explicit Deny at any one is an immediate rejection (Deny wins)
  · The endpoint policy does not "grant" permission — it only narrows
    (even if the endpoint policy has an s3:* Allow, it is rejected if IAM blocks)
  · The default endpoint policy is "allow all," so if you do nothing, ② passes
```

The third item is a frequently misunderstood point. The endpoint policy is **a filter, not a means of granting permission.** If "I put an allow in the endpoint policy but I still get AccessDenied," look at IAM or the bucket policy.

> 🎯 **Scenario**: "There is an S3 bucket containing sensitive data. We want to completely block employees from accessing this bucket directly from a laptop, or from a compromised external host, and allow only requests that go through the corporate VPC." — Answer: (1) create a Gateway Endpoint, (2) in the **bucket policy** allow only access through that endpoint with `"Condition": {"StringEquals": {"aws:SourceVpce": "vpce-xxxx"}}`, (3) also add `aws:SourceVpc` or `aws:PrincipalOrgID`. Then direct access from the Internet via console or CLI gets AccessDenied. The data is confined within the network perimeter.

If you attach only `aws:SourceVpce` to the bucket policy, **it blocks all other access**, which can cut off even CloudFront and other service integrations. Also, the VPC Endpoint policy, bucket policy, and IAM policy are **evaluated as an AND** — if any one of the three denies, it is denied, and all must allow for it to be allowed. So narrowing the endpoint policy too much often causes incidents in which even legitimate traffic is cut off. The default endpoint policy is "full access," and when narrowing, verify step by step.

## The Order for Narrowing Down "EC2 Can't Reach S3"

Introducing endpoints increases the points of failure. The network layer and policy layer overlap, so digging without an order takes double the time. If you fix the order below, the causes eliminated at each step become clear.

```
[ EC2 → S3 access failure, the order of narrowing down ]

  0. Read the error message first  ★ most important
       timeout / connection failure → 1-3 (network layer)
       AccessDenied                 → 4-6 (policy layer)
       Trying to connect to a strange IP → DNS problem (3-b)

  1. Routing
       Gateway EP: does that subnet's routing have a pl-xxxx → vpce route
                   (did you include it in --route-table-ids when creating the endpoint)
       Interface EP: is the subnet holding the endpoint ENI reachable
  2. NACL
       Inbound/outbound 443 of the subnet holding the endpoint ENI
       (stateless, so the response ephemeral ports too)
  3. Security group
       3-a. Does the SG attached to the Interface EP's ENI allow 443 inbound
            ★ A Gateway EP has no SG — don't waste time looking for one here
       3-b. Private DNS: does the domain resolve to a private IP
            (the VPC's enableDnsSupport / enableDnsHostnames, two attributes)
  ── Up to here is the realm of timeouts ──
  4. Endpoint policy
       Default is allow all. If narrowed, look at Resource and Condition
  5. Resource policy (bucket policy / KMS key policy)
       Is this endpoint ID in the aws:SourceVpce condition
       For an SSE-KMS bucket, also check the KMS key policy and the kms endpoint
  6. IAM (instance profile role + permission boundary + SCP)
       Is the s3:GetObject permission actually present

  → Classifying the error type at step 0 alone halves the candidates.
     Looking into the bucket policy for a timeout is the most common waste of time.
```

The KMS mention at step 5 is a trap often hit in practice. **Accessing an encrypted S3 bucket doesn't end with S3.** If the object is encrypted with SSE-KMS, the client must also call KMS, and in a zero-internet VPC a KMS Interface Endpoint must exist separately. A good share of cases like "I created the S3 Gateway Endpoint but GetObject fails" actually occur because the KMS call cannot go out. You need the habit of checking whether the error message points to KMS rather than S3.

```bash
# List the endpoints in this VPC with a summary of each
aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'VpcEndpoints[].{Id:VpcEndpointId,Svc:ServiceName,Type:VpcEndpointType,
             State:State,PrivateDns:PrivateDnsEnabled,RTs:RouteTableIds,
             Subnets:SubnetIds,SGs:Groups[].GroupId}' \
  --output json

# Associate a Gateway Endpoint with additional route tables (rescue a missed subnet)
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id vpce-0aaa1111 \
  --add-route-table-ids rtb-data-a rtb-data-b

# Replace the endpoint policy (narrow step by step)
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id vpce-0aaa1111 \
  --policy-document file://endpoint-policy.json

# Check the actual CIDRs of the S3 prefix list — to see what went into the routing
aws ec2 describe-prefix-lists \
  --filters "Name=prefix-list-name,Values=com.amazonaws.us-east-1.s3"
```

When creating an Interface Endpoint, **which subnets you put the ENIs in** decides both availability and cost. If you place an ENI in only one AZ, instances in other AZs cannot reach the service when that AZ is shaky, and cross-AZ traffic occurs even in normal times. So the default is one in every AZ that has workloads. Conversely, as ENIs increase per endpoint, the hourly charge multiplies, so managing the list of "services that are truly needed" becomes the actual cost-management work. The compromise organizations commonly pick here is a **centralized shared-endpoint VPC** — a configuration that gathers endpoints in one VPC and lets other VPCs use them via Transit Gateway or Route 53 Resolver rules. However, in this configuration a single endpoint policy controls the traffic of multiple VPCs at once, so keep in mind that the blast radius when narrowing the policy grows too.

## PrivateLink: The Service Provider Pattern

The generalization of the Interface Endpoint is **PrivateLink**. You can connect privately not only to AWS services but also to **custom services provided by other accounts**.

```
[Consumer VPC]                          [Provider VPC]
 Interface Endpoint (ENI) ──private──→ Endpoint Service ──→ NLB ──→ backend
   (connects via a private IP)         (another account/organization)
```

- The provider places the service behind an NLB and exposes it as an **Endpoint Service**.
- The consumer connects with an Interface Endpoint. **Unaffected by IP overlap**, no Peering needed.
- Traffic is one-way (consumer→provider) and the provider's entire VPC is not exposed.

What makes PrivateLink superior to VPC Peering in security is **the difference in exposed surface**. Peering connects the two VPCs with two-way routing so the entire CIDRs are visible to each other (you must narrow with SGs). With PrivateLink only **the single service (the NLB endpoint)** the provider exposed is visible, and the rest of the provider VPC is completely hidden. So when a SaaS provider serves many customers, it is the standard way to connect while keeping customer VPCs and its own VPC isolated rather than mixed. There is no CIDR conflict either (the ENI uses consumer-VPC addresses).

SaaS such as Snowflake, Datadog, and MongoDB Atlas all offer private connectivity to customers via PrivateLink. From the customer's view, its data flows to the SaaS without crossing the Internet, so it is easier to satisfy compliance (HIPAA, PCI). With Peering, there would have been a risk of the SaaS provider's entire VPC being exposed to the customer. PrivateLink implements the minimal-exposure principle of "only the one service you need, privately" in the network.

## Wrap-Up: Three Layers That Stop Exfiltration

```
1. Remove NAT → block the Internet egress path itself
2. VPC Endpoint → connect privately to only the AWS services you need
3. Endpoint Policy + bucket policy (aws:SourceVpce) → allow only where to / who
```

The strongest isolation is a configuration that removes NAT entirely and accesses all AWS services only through Interface/Gateway Endpoints. However, then instances cannot receive OS patches from the Internet, so Systems Manager (SSM Agent) is also connected via Interface Endpoints (`ssm`, `ssmmessages`, `ec2messages`), container images through the ECR Endpoint, and logs sent to the CloudWatch Logs Endpoint. Configuring a "zero-internet VPC" this way makes the data exfiltration path effectively disappear. It is the pattern adopted for regulated workloads (finance, healthcare).

### The Minimum Endpoint List for a Zero-Internet VPC

The decision to "delete NAT" is the work of "standing up every needed endpoint without omission." If even one is missing, only that function fails silently, and it is usually discovered on the night of deployment. Here is a list of what is actually needed by workload type.

| What you want to do | Endpoint needed | Type |
|---------------------|-----------------|------|
| Access object storage | `s3` | Gateway (inside VPC) / Interface (on-premises) |
| Access NoSQL tables | `dynamodb` | Gateway |
| Instance management, patching, sessions | `ssm`, `ssmmessages`, `ec2messages` | Interface |
| Use encryption keys (including SSE-KMS) | `kms` | Interface |
| Retrieve secrets | `secretsmanager` | Interface |
| Pull container images | `ecr.api`, `ecr.dkr` **+ s3** (layer storage) | Interface + Gateway |
| Ship logs | `logs` | Interface |
| Ship metrics | `monitoring` | Interface |
| Call the EC2 API (tag lookup, etc.) | `ec2` | Interface |
| Assume a role via STS | `sts` | Interface |

The ECR row is especially often missed. **The image manifest is fetched through the ECR API, but the actual layers are downloaded from S3.** So if you create only `ecr.api` and `ecr.dkr` and omit the S3 endpoint, `docker pull` proceeds partway and then stalls. Likewise, without `sts`, every operation that needs a role assumption fails, and the error message usually points to the downstream service, making the cause hard to find.

> 🎯 **Scenario**: "To meet regulatory requirements, we put a container workload in a VPC with no Internet path. The task does not start and stalls at the image pull. What is missing?" — Usually the **S3 Gateway Endpoint**. Even if you created both ECR-related interface endpoints, layer downloads go through S3, so without an S3 path it gets only as far as the manifest and then stops. In addition, if the log driver uses CloudWatch Logs, the `logs` endpoint is also needed, and if you use a task role, `sts` is needed too. Because of the property that **"if one endpoint is missing, only that function fails,"** symptoms appear partially, and so having the full list as a checklist is the fastest solution.

### In Closing

There are four key points. First, the **Gateway Endpoint is for S3 and DynamoDB only (free, routing-based)** and everything else is an **Interface Endpoint (PrivateLink, ENI-based, paid)**. The difference among the three is ultimately "what specifies the destination" — NAT is a public IP, Gateway is a routing path, Interface is a private IP — and since only a private IP can be reached from on-premises, in that case only Interface is the answer.

Second, a data perimeter is built from **a pair of policies with opposite directions**. The endpoint policy decides "how far you can go out through this door" (`aws:ResourceOrgID`), and the resource policy decides "through which door you can enter this room" (`aws:SourceVpce`). The former is decisive for sealing exfiltration — the scenario where a compromised instance writes to an external bucket with our credentials goes in the outgoing direction and so is not caught by the latter. And when attaching condition keys, always design the `IfExists`-type operators and service exceptions together. Otherwise CloudFront, replication, and log delivery get cut off too.

Third, policies are evaluated as **the AND of IAM ∩ endpoint policy ∩ resource policy**, and an explicit Deny takes priority. If you remember that the endpoint policy does not grant permission and only narrows, you won't flounder on "I put an Allow in the endpoint policy, so why AccessDenied?" Fix the diagnostic order too — **if the error is a timeout, routing → NACL → SG/DNS; if AccessDenied, endpoint policy → resource policy → IAM.**

Fourth, **PrivateLink has a smaller exposed surface than Peering**, so it is the standard for SaaS and cross-account connections. And when you actually stand up a zero-internet VPC, the endpoint checklist becomes the work list — in particular, ECR needs, in addition to `ecr.api` and `ecr.dkr`, **the S3 that delivers the layers**, role assumption needs `sts`, and logs need `logs`. If one is missing, only that function fails silently.

The ultimate goal of network isolation is to "leave only the paths along which data can flow that were explicitly allowed." In the next note, we review all of Week 3 — VPC design, SG/NACL, Flow Logs, private connectivity — integrated in a single scenario.

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
