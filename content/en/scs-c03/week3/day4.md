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

## 📝 연습 문제

**문제 1.** VPC 내부의 Lambda 함수가 S3 버킷에 인터넷을 거치지 않고 사설로 접근해야 한다. 가장 비용 효율적인 방법은?

A) Interface Endpoint(PrivateLink)를 S3용으로 생성한다  
B) Gateway Endpoint를 생성해 라우팅 테이블에 S3 경로를 추가한다  
C) NAT Gateway를 통해 S3로 나가게 한다  
D) VPC Peering으로 S3 서비스 VPC와 연결한다  

**정답: B**  
해설: S3와 DynamoDB는 무료인 Gateway Endpoint를 지원하며, 라우팅 테이블에 해당 서비스 경로를 추가하는 방식으로 VPC 내부에서 사설 접근이 가능하다. Interface Endpoint는 시간당·데이터 처리 요금이 발생하므로 VPC 내부 전용 접근에는 비용 면에서 불리하고, S3는 서비스 VPC와 Peering할 수 있는 대상이 아니다.

---

**문제 2.** 온프레미스 데이터센터에서 Direct Connect를 통해 S3에 사설로 접근해야 한다. 적절한 구성은?

A) S3 Gateway Endpoint를 생성한다  
B) S3 Interface Endpoint를 생성한다  
C) NAT Gateway를 온프레미스 쪽에 둔다  
D) S3 버킷을 퍼블릭으로 전환한다  

**정답: B**  
해설: Gateway Endpoint는 라우팅 기반이라 VPC 내부 전용이며 온프레미스에서 직접 도달할 수 없다. 온프레미스에서 Direct Connect나 VPN을 통해 사설로 접근하려면 서브넷에 ENI를 두는 S3 Interface Endpoint가 필요하다. 버킷을 퍼블릭으로 전환하는 방식은 사설 연결 요구에 어긋난다.

---

**문제 3.** 민감 데이터가 담긴 S3 버킷을 오직 사내 VPC 엔드포인트를 거친 요청만 접근 가능하게 하려고 한다. 가장 효과적인 통제는?

A) 버킷 정책에 aws:SourceVpce 조건으로 특정 엔드포인트 경유만 허용한다  
B) 버킷에 ACL을 적용해 익명 접근을 막는다  
C) 보안 그룹으로 버킷 인바운드를 제한한다  
D) NACL로 S3 IP 범위를 차단한다  

**정답: A**  
해설: 버킷 정책에 특정 VPC 엔드포인트 경유 조건을 걸면, 그 엔드포인트를 통하지 않은 인터넷·콘솔·다른 계정의 직접 접근이 거부되어 데이터가 네트워크 경계 안에 갇힌다. S3는 보안 그룹이나 NACL이 직접 적용되는 대상이 아니며, ACL은 이런 네트워크 출처 기반 제약을 표현하지 못한다.

---

**문제 4.** Interface Endpoint를 생성하고 Private DNS를 켰는데도 트래픽이 여전히 인터넷으로 나간다. 가장 먼저 확인할 항목은?

A) 버킷 정책의 Resource 범위  
B) VPC의 enableDnsSupport와 enableDnsHostnames 속성  
C) NAT Gateway의 임시 포트 범위  
D) NACL의 규칙 번호 순서  

**정답: B**  
해설: Private DNS가 서비스 도메인을 엔드포인트의 사설 IP로 해석하려면 VPC의 DNS 지원과 DNS 호스트네임 속성이 모두 켜져 있어야 한다. 이 속성이 꺼져 있으면 도메인이 공용 IP로 해석되어 트래픽이 인터넷 경로로 흐른다. 임시 포트나 NACL 순서는 DNS 해석 경로와 무관하다.

---

**문제 5.** SaaS 제공자가 다수 고객에게 자사 서비스를 사설로 제공하되, 자사 VPC 전체가 고객에게 노출되지 않도록 하려고 한다. VPC Peering 대비 PrivateLink의 장점은?

A) Peering보다 데이터 전송 비용이 항상 더 저렴하다  
B) 제공자가 노출한 단일 서비스 엔드포인트만 보이고 나머지 VPC는 가려지며 CIDR 충돌도 없다  
C) 양방향 라우팅을 자동으로 구성해 관리가 쉽다  
D) 고객과 제공자의 CIDR이 반드시 겹쳐야 동작한다  

**정답: B**  
해설: Peering은 두 VPC의 CIDR 전체가 양방향으로 보이므로 노출 표면이 크고 CIDR이 겹치면 동작하지 않는다. PrivateLink는 제공자가 NLB로 노출한 단일 서비스만 소비자에게 보이고 나머지 제공자 VPC는 완전히 가려지며, 소비자 VPC 주소를 쓰는 ENI 방식이라 CIDR 충돌도 발생하지 않는다.

---

**문제 6.** 인터넷 경로가 전혀 없는 "zero-internet VPC"에서 EC2 인스턴스를 Systems Manager로 관리하려고 한다. 필요한 구성은?

A) NAT Gateway를 임시로 열어 SSM Agent가 통신하게 한다  
B) ssm, ssmmessages, ec2messages 등에 대한 Interface Endpoint를 생성한다  
C) S3 Gateway Endpoint만 있으면 SSM이 동작한다  
D) 인스턴스에 퍼블릭 IP를 부여한다  

**정답: B**  
해설: 인터넷 경로가 없는 VPC에서 Systems Manager를 사용하려면 SSM 관련 서비스 엔드포인트를 Interface Endpoint로 사설 연결해야 한다. 이렇게 하면 패치·세션 관리 트래픽이 AWS 백본 내부로만 흐른다. NAT를 열거나 퍼블릭 IP를 부여하는 방식은 데이터 유출 경로를 다시 만드는 것이라 격리 목표에 어긋난다.

---
