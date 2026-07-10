# Day 5 - Week 2 Synthesis: How the EC2 Layers Mesh Inside a Single System

Every EC2 layer we covered in Week 2 — Nitro, instance families, AMIs, Security Groups, Key Pairs, User Data, EBS, Instance Store, ALB, NLB, ASG — is a poor fit for rote memorization. The exam always frames things as scenarios, and those scenarios ask questions like "The SG is wide open, so why doesn't it work?", "Why doesn't the new instance show up in the ALB?", or "Why did our cross-AZ traffic bill explode?" You can't answer these by looking at each layer in isolation; you have to see **how the layers mesh and operate together**.

Today we tie every Week 2 concept into one production-grade architecture, then work through the traps and exam scenarios you hit most often on top of it. At the end, 12 scenario-based synthesis questions to gauge your real exam readiness.

## How All of Week 2 Meshes Inside a Single System

Assume we're building a classic 3-tier web service on EC2. The shape is user → CloudFront → ALB → ASG(EC2) → RDS Multi-AZ + ElastiCache. Let's locate each Week 2 concept within this structure.

```
                          [Route 53 (DNS, alias to ALB)]
                                       │
                                       ▼
                          [CloudFront (edge cache + WAF)]
                                       │
                                       ▼
                          [ALB in 3 AZs (cross-zone ON, ACM cert)]
            HTTPS:443  ┌──────┴──────┐
                       ▼             ▼
            (path /api/*)   (path /*)
                       │             │
                       ▼             ▼
            [api-tg]         [web-tg]
            (target=instance, /healthz)
                       │             │
            ┌──────────┴─────────────┴──────────┐
            ▼                                   ▼
     [ASG: Mixed Instance Policy]
     Min 3, Max 30, Desired 6
     ┌─ AZ-a ─┐  ┌─ AZ-b ─┐  ┌─ AZ-c ─┐
     │ EC2 #1 │  │ EC2 #3 │  │ EC2 #5 │
     │ EC2 #2 │  │ EC2 #4 │  │ EC2 #6 │
     │ gp3 root│  │ gp3 root│  │ gp3 root│
     │ io2 data│  │ io2 data│  │ io2 data│
     └────────┘  └────────┘  └────────┘
                       │
     IAM Instance Profile (S3 read, Secrets Manager read)
     User Data: fetch DB pass from Secrets Manager
     IMDSv2 required, hop-limit 1
                       │
                       ▼
     [Security Group: web-sg]
        Inbound:  443 from ALB SG
                  22  from Bastion SG
        Outbound: 3306 to db-sg, 6379 to cache-sg, 443 to 0.0.0.0/0
                       │
                       ▼
            ┌─ AZ-a ──┐   ┌─ AZ-b ──┐
     [RDS Multi-AZ Primary/Standby (synchronous), db-sg]
     [ElastiCache Redis Cluster (Multi-AZ, cache-sg)]
```

Let's trace how each Week 2 concept works inside this architecture.

**Starting point - a user requests https://app.example.com**
1. Route 53 receives the DNS query and answers with the ALB's alias record
2. The ALB presents the `app.example.com` certificate via SNI (issued by ACM, auto-renewed)
3. The ALB listener rule decides web-tg or api-tg by path-pattern
4. The ALB forwards to one of the healthy targets. With cross-zone ON, it spreads evenly across AZs
5. The ALB SG's outbound matches web-sg's inbound 443
6. nginx on the EC2 instance reverse-proxies 8080 → the application

**When Auto Scaling launches one more instance**
1. ALB RequestCountPerTarget hits 1500 in CloudWatch → the ASG's Target Tracking bumps desired +1
2. The ASG starts a new EC2 from the launch template. With Mixed Instance Policy it picks capacity-optimized across c5.large or c5a.large
3. The Nitro hypervisor assigns a host, attaches the EBS gp3 root volume + io2 data volume
4. cloud-init grabs an IMDSv2 token and fetches metadata, injecting the IAM instance profile's credentials
5. User Data fetches the DB password with `aws secretsmanager get-secret-value` and writes it to `/etc/app/secrets.env` with chmod 600
6. The `EC2_INSTANCE_LAUNCHING` lifecycle hook holds the instance in Pending:Wait
7. The application starts, and after cache pre-warm completes it calls `complete-lifecycle-action`
8. The ASG flips the instance to InService and auto-registers it in the ALB target group
9. Health check `/healthz` returns 200 five times in a row → healthy. Only now does it start receiving traffic

**When an instance dies or is scaled in**
1. The EC2's own status check fails, or the ALB hits the unhealthy threshold
2. Since the ASG has `HealthCheckType=ELB`, it decides to terminate that instance
3. The `EC2_INSTANCE_TERMINATING` lifecycle hook holds it in Terminating:Wait
4. It notifies via SNS/SQS, a Lambda syncs the logs to S3, and the application does a graceful shutdown
5. In-flight requests drain over the ALB's 300-second deregistration delay
6. After `complete-lifecycle-action`, the instance terminates; the EBS volume is deleted alongside it if DeleteOnTermination=true

Every concept that appears in this sequence is in Week 2's exam scope. The exam asks its questions by breaking one step somewhere in this sequence and framing it as a scenario.

## The Traps You Hit Most Often

### Trap 1: The SG is wide open but the connection still fails
Usually one of: ① a missing ephemeral-port outbound rule on the NACL, ② a missing inbound rule on the Endpoint SG (PrivateLink), ③ conntrack limit exceeded (per instance type), or ④ a missing IGW/NAT route in the Route Table. Don't stare at the SG alone — follow the entire packet path.

### Trap 2: The new instance returns 5xx from the ALB
The moment the health check passes is not the moment the application is fully ready. Point the health check path at `/healthz` and have the application respond 200 only when its ready flag is true, or use an ASG lifecycle hook to buy warmup time.

### Trap 3: Cross-AZ costs explode
Happens when NLB cross-zone is on and target counts differ per AZ, or when two AWS accounts have mismatched ZoneName mappings and PrivateLink ends up flowing cross-AZ. Align on ZoneId.

### Trap 4: Response is slow after restoring an EBS snapshot
This is lazy loading. Turn on Fast Snapshot Restore, or read every block once with `dd`.

### Trap 5: Hardcoding a password into User Data gets flagged in a security audit
Anyone can read it from IMDS. Switch to Secrets Manager + instance profile.

### Trap 6: High Spot reclamation rate keeps taking production down
Change the `lowest-price` strategy to `capacity-optimized` or `price-capacity-optimized`. Register several instance types in the Override list.

### Trap 7: Trying to boot from an HDD volume
st1 and sc1 can't boot. Only SSD (gp2/gp3/io1/io2) is bootable.

### Trap 8: Two EC2s accessing the same EBS volume at once
Not possible with plain gp3. You need io1/io2 + Nitro + same AZ + Multi-Attach + a cluster file system. Usually EFS is the better answer.

### Trap 9: Storing important data on instance store, then stopping
Permanent data loss. If you need durable storage use EBS; if you need sharing use EFS/S3.

### Trap 10: SSRF attack while running IMDSv1
Enforce IMDSv2 (`HttpTokens=required`, `HttpPutResponseHopLimit=1`). The root cause of the Capital One breach.

### Trap 11: The ALB target group is `target-type=ip` but the security group doesn't match
IP-type target SG referencing behaves differently from instance-type targets. You have to allow the ENI's SG on inbound precisely.

### Trap 12: Manually changing the ASG's desired capacity, but the scaling policy reverts it
If Target Tracking is on, it re-adjusts desired against the metric every time. If you need a manual adjustment, pause the policy or use `suspend-processes`.

## Week 2 Easy-to-Confuse Comparisons

| A | B | Key difference |
|---|---|---------|
| Instance Store | EBS | Ephemeral (host-bound) vs durable (network disk) |
| Stop | Terminate | EBS retained (optional) vs deleted by default (DeleteOnTermination) |
| Stop | Hibernate | RAM lost vs RAM dumped to EBS then stopped |
| Reboot | Stop+Start | Same host vs different host (public IP changes) |
| Reserved Instance | Savings Plan | Commit to instance family/region vs commit to dollars-per-hour |
| Standard RI | Convertible RI | Family fixed vs family exchangeable (higher price) |
| Compute SP | EC2 Instance SP | Applies across many services vs specific family/region only |
| Public IP | Elastic IP | Volatile/free vs fixed, billed when idle, and since 2024 billed even while in use |
| Security Group | NACL | Instance-level stateful Allow-only vs subnet-level stateless Allow+Deny |
| ALB | NLB | L7 HTTP routing vs L4 TCP/UDP with static EIP |
| ALB | API Gateway | LB invoking Lambda vs rich API management features |
| Cluster PG | Spread PG | Same rack (low latency) vs different racks (HA) |
| Cluster PG | Partition PG | Single group vs multiple partitions (Cassandra rack-awareness) |
| Target Tracking | Step Scaling | Automatic target-value tracking vs explicit threshold steps |
| gp3 | gp2 | IOPS/throughput set independently vs tied to size |
| io1 | io2 | 99.9% vs 99.999% durability + IOPS:GB 1:50 vs 1:500 |
| EBS | EFS | Block, single instance vs NFS, multiple instances |
| EFS | FSx for Lustre | General NFS vs HPC parallel FS |
| Cross-Zone ALB | Cross-Zone NLB | Default ON, free vs default OFF, cross-AZ data transfer cost when enabled |
| Sticky ALB | Sticky NLB | Cookie-based vs Source IP affinity |
| IMDSv1 | IMDSv2 | GET-only → SSRF vulnerable vs PUT token + GET header, safe |
| User Data | cfn-init | One-shot bootstrap vs fine-grained init based on CloudFormation metadata |
| Lifecycle Hook (Launching) | Lifecycle Hook (Terminating) | Delay InService during warmup vs delay termination during graceful shutdown |
| capacity-optimized | lowest-price | Low reclamation (production) vs low cost (batch) |

## Week 2 Acronym Glossary

| Acronym | Full name |
|------|--------|
| **EC2** | Elastic Compute Cloud |
| **AMI** | Amazon Machine Image |
| **EBS** | Elastic Block Store |
| **EFS** | Elastic File System |
| **FSx** | (product family - Lustre, Windows, NetApp ONTAP, OpenZFS) |
| **EIP** | Elastic IP |
| **IMDS** | Instance Metadata Service (v1/v2) |
| **ELB** | Elastic Load Balancing |
| **ALB / NLB / CLB / GWLB** | Application/Network/Classic/Gateway Load Balancer |
| **ASG** | Auto Scaling Group |
| **RI** | Reserved Instance |
| **SP** | Savings Plan |
| **PG** | Placement Group |
| **NACL** | Network Access Control List |
| **DLM** | Data Lifecycle Manager |
| **FSR** | Fast Snapshot Restore |
| **SNI** | Server Name Indication |
| **TLS** | Transport Layer Security |
| **ACM** | AWS Certificate Manager |
| **mTLS** | mutual TLS (client certificate) |
| **VPC** | Virtual Private Cloud |
| **IGW** | Internet Gateway |
| **NAT** | Network Address Translation |
| **IOPS** | Input/Output Operations Per Second |
| **EFA** | Elastic Fabric Adapter |
| **DEK** | Data Encryption Key (KMS envelope encryption) |
| **AES-XTS** | Advanced Encryption Standard - XEX-based Tweaked-codebook with ciphertext Stealing |
| **CMK** | Customer Master Key (KMS) |
| **LCU/NLCU/GLCU** | Load Balancer Capacity Unit (ALB/NLB/GWLB) |
| **MRK** | Multi-Region Key (KMS) |

## DVA-Specific Exam Points (What Differs from SAA)

DVA covers the same EC2 scope as SAA, but the exam's vantage point is different. Even for the same ASG, DVA drills down to the code, SDK, and option-name level: ① how you handle the IMDSv2 token in boto3, ② how CodeDeploy's Blue/Green manipulates the ALB target group, ③ how you mount EFS from Lambda, ④ at what point the instance profile permissions are attached when you call Secrets Manager inside User Data.

| DVA vantage point |
|----------|
| boto3 handles the IMDSv2 token automatically (botocore 1.13+) |
| Lambda → EFS mount (requires an access point) |
| ALB → invoking Lambda directly (event format differs from API Gateway) |
| Calling Secrets Manager via the instance profile inside User Data |
| The mechanism by which CodeDeploy integrates with ASG + ALB |
| SNS/SQS notification target of a lifecycle hook |
| KMS Multi-Region Key when doing an EBS multi-region snapshot copy |

## Wrapping Up

Week 2 took in the whole EC2 layer. We started from EC2's own virtualization, instance families, and AMIs, then moved up through the network controls on top (SG, Key Pair, User Data), the disk layer (EBS, Instance Store, EFS/FSx), and finally the traffic-distribution layer (ALB/NLB, ASG) — following how one production architecture is woven together. Since the exam bundles all of this into a single scenario, you need to be able to picture "the full path an instance travels before it receives traffic" in your head, rather than memorizing each layer separately.

From Week 3 on, the DVA-specific layers — IAM, Lambda, DynamoDB, API Gateway, CodePipeline — stack on top of this EC2 layer. Only when the EC2 layer is firmly in place do the developer-vantage layers above it settle cleanly.

---

## 📝 Week 2 종합 연습 문제 (시나리오 12문항)

**문제 1.** An e-commerce company's ALB + ASG production system spikes to 20x its normal RPS during the first 5 minutes of a sale that starts at 7 PM daily. It uses a Target Tracking (CPU 60%) scaling policy, but users are getting 5xx. What is the most appropriate improvement?

A) Permanently raise the ASG's min size to the spike peak so there are always enough instances — survives the spike but idle-instance cost for 23 hours is enormous
B) Use Predictive Scaling + Scheduled Scaling to raise desired ahead of time at 6:55, and Step Scaling for aggressive scale-out during the spike
C) Lower the Target Tracking CPU target to 30% to trigger scale-out earlier — this doubles the instance count even at normal load (wasteful) and the boot delay remains
D) Replace the ALB with an NLB to distribute connections faster at L4 — boot delay is the cause, so swapping the LB won't clear the 5xx and only loses HTTP routing

**정답: B**
해설: Target Tracking adjusts reactively off the metric: 30-second CloudWatch + a 2-3 minute instance boot on scale-out = 3-5 minutes of total delay. For a 5-minute spike that's already too late. With **Scheduled Scaling**, raising desired ahead of time at 6:55 (predictive scaling does it automatically if there's a learned pattern) means the instances take the spike already warmed up. Add Step Scaling for an aggressive +5 during the spike. C wastes instances at normal load. D loses the ALB's HTTP features.

---

**문제 2.** A company runs ML training on an EC2 instance every midnight and uploads the results to S3. It wants to minimize cost, and the job only needs to finish within 24 hours. What is the most appropriate purchase option?

A) On-Demand, starting and stopping at each midnight to bill only by the hour — flexible but has no discount versus Spot, so it misses the cost-minimization goal
B) A 1-year Reserved Instance commitment to lower the hourly rate — but it's used only a few hours a day while committing to 24/7, so most of the time is wasted
C) Spot Instance + periodically saving a checkpoint to S3
D) A Dedicated Host to secure a whole physical server for stable execution — a BYOL-license-only option, the most expensive, exactly opposite to the cost goal
해설: A short window in the early hours each day + checkpoints to handle reclamation → Spot is the fit. 90% savings. On reclamation, catch the 2-minute warning from IMDS `/latest/meta-data/spot/instance-action`, sync current progress to S3, and do a graceful shutdown. On the next run, resume from the checkpoint. A costs full price every day. B wastes an RI commitment on short usage. D is BYOL-license-only and expensive.

---

**문제 3.** A developer trying to pull IAM credentials from an EC2 instance's IMDS finds that `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole` returns a 401. What is the most likely cause?

A) No IAM Role is attached to the instance — but that returns a 404 at that path, not a 401, so it doesn't match the symptom
B) IMDSv2 is required but `curl` uses only an IMDSv1 GET (you must obtain a token via PUT first)
C) 169.254.169.254/32 is blocked in web-sg's outbound rules — a link-local IP isn't controlled by SGs, so this can't be the cause
D) The subnet NACL blocks 169.254.0.0/16 link-local traffic with a deny rule — link-local isn't subject to NACLs, so this can't be the cause

**정답: B**
해설: Since 2024, new instances default to IMDSv2 required. A GET without a token returns 401. The correct method:
```bash
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```
If it were A, you'd get a 404. C/D fail because 169.254.169.254 is link-local and can't be controlled by SG/NACL.

---

**문제 4.** A company runs two EC2 instances that must read and write in the same directory. Concurrent access is required, and the two EC2s are in different AZs. What is the most appropriate solution?

A) Attach an io2 EBS volume to both EC2s at once via Multi-Attach and set up a cluster file system — Multi-Attach only supports the same AZ, so it's impossible in this different-AZ scenario
B) Mount an EFS file system on both EC2s over NFS
C) Use an S3 bucket as shared storage and have the two EC2s sync files periodically — being an object store, it lacks POSIX filesystem semantics and concurrent read/write locking
D) Give each EC2 an instance store and replicate data bidirectionally — host-bound ephemeral storage, so neither shared nor durable

**정답: B**
해설: EFS is NFSv4.1-based with automatic multi-AZ replication and supports thousands of clients accessing concurrently. Plain EBS Multi-Attach has thorny constraints: ① io1/io2 only, ② same AZ only, ③ requires a cluster-aware FS. With the EC2s in two AZs, Multi-Attach is impossible. C is an object store, not filesystem semantics. D is host-bound.

---

**문제 5.** A company runs microservices behind an ALB. `api.example.com/orders/*` must go to the orders service and `api.example.com/users/*` to the users service. The two services each run on their own ASG. What is the most accurate configuration?

A) Create a dedicated ALB per service and attach each ALB to a separate subdomain — it works, but two ALBs for path branching under the same host wastes cost and operational effort
B) Create two target groups on one listener of a single ALB, and use listener rules for path-pattern matching: `/orders/*` → orders-tg, `/users/*` → users-tg
C) Move to an NLB and branch services by destination port on a TCP listener — NLB is L4 and can't see the URL path, so path routing is impossible
D) Use a Route 53 routing policy to branch `/orders/*` and `/users/*` to each service's IP — DNS only sees the host name, not the path, so it's impossible

**정답: B**
해설: ALB has native routing based on path-pattern and host-header. Register listener rules in priority order and have each rule forward to a target group. C's NLB is L4 and unaware of paths. D's Route 53 is DNS and can't branch on path (host name only). A wastes cost and adds operational complexity. One ALB is enough.

---

**문제 6.** An EC2 instance calls `aws s3 cp s3://bucket/app.tar.gz /opt/` inside user-data but gets an `Unable to locate credentials` error. What is the most likely cause?

A) The specified S3 bucket doesn't exist or the object key is wrong — that yields `NoSuchBucket`/`NoSuchKey`, not `Unable to locate credentials`
B) No IAM Instance Profile is attached to the instance, or that Role lacks `s3:GetObject` permission
C) The CLI's default region differs from the bucket's region, so endpoint resolution fails — a region mismatch produces an endpoint error, not a credentials error
D) The IMDSv2 token's TTL expired and cut off credential lookups — botocore 1.13+ re-issues the token automatically, so this isn't the cause of this error

**정답: B**
해설: The AWS CLI/SDK looks for credentials in order: ① explicit access key, ② environment variables, ③ ~/.aws/credentials, ④ the instance profile via IMDS. `Unable to locate credentials` means none of these were found. An EC2 instance normally receives an IAM Role's temporary credentials through the instance profile, and if the profile isn't attached or lacks permission, you get this error. A would be `NoSuchBucket`, C would be something like `endpoint not found`, and D is auto-reissued by the SDK on IMDSv2 token expiry (botocore 1.13+).

---

**문제 7.** A company wants to encrypt a production EC2's EBS volume (unencrypted gp2). To minimize downtime, what should it do?

A) Encrypt the running volume in-place with no downtime via `modify-volume --encrypted` — modify-volume only changes size/type/IOPS and has no encryption-toggle option
B) Create a snapshot → make an encrypted copy with `copy-snapshot --encrypted` → create a new volume from the encrypted snapshot → swap detach/attach during a short downtime
C) Open a case with AWS Support to convert the volume's encryption on the backend — Support doesn't encrypt your volume on your behalf
D) Create a new encrypted instance, move all data with rsync, then cut over — possible, but on large volumes the sync time and consistency risk are high, so it's not the standard procedure

**정답: B**
해설: The standard 5-step procedure. You can't encrypt a running volume directly. The exact commands:
```bash
aws ec2 create-snapshot --volume-id vol-original
aws ec2 copy-snapshot --source-snapshot-id snap-orig --encrypted --kms-key-id alias/aws/ebs
aws ec2 create-volume --snapshot-id snap-encrypted --availability-zone same-az --volume-type gp3
# short downtime: detach old, attach new
```
Alternative: for RDS, create an encrypted read replica and promote it (nearly zero downtime). D carries data-sync risk.

---

**문제 8.** A company finds that a new instance starts receiving traffic the moment it registers with the ALB target group and returns 5xx before the application warms up. What is the most appropriate response?

A) Raise the ASG's `HealthCheckGracePeriod` to 300 seconds to defer the unhealthy verdict right after registration — the grace period only prevents premature termination, not the traffic reception itself
B) Register an `EC2_INSTANCE_LAUNCHING` lifecycle hook on the ASG and call `complete-lifecycle-action` from inside the instance once warmup is complete
C) Change the ALB health check path to `/` for a lighter endpoint check — if `/` returns 200 even before warmup, it's a false positive and registers too early
D) Increase the target group's deregistration delay to preserve in-flight requests longer — that's a termination-time setting, unrelated to a new instance's warm-up problem

**정답: B**
해설: The lifecycle hook is the right tool. It holds the instance in Pending:Wait, delaying the transition to InService. After warmup (JVM warm, cache preload) completes, an explicit signal lets it proceed. A's grace period defers the health check but only adjusts termination timing. C is unsuitable (if `/` always returns 200, false positive). D is unrelated to termination timing. A common alternative pattern is to put the application's `/healthz` under control of a ready flag.

---

**문제 9.** A company distributes game-server traffic with an NLB. Users are spread evenly across 5 AZs, but the instance count per AZ differs (AZ-a 10, AZ-b 5, AZ-c 2). A report comes in that traffic is uneven. What is the most appropriate action?

A) Enable NLB cross-zone load balancing (note: it incurs cross-AZ data transfer cost)
B) Replace the NLB with an ALB to use L7 routing and weighted distribution — ALB is HTTP-only, so it's unsuitable for L4 game traffic (UDP/TCP)
C) Fix every AZ's instance count to 10 — a partial fix, but the ASG doesn't always guarantee even placement per AZ, so the imbalance can recur
D) Distribute traffic with Route 53 weighted routing by giving each AZ a weight — DNS cache/TTL means it doesn't take effect immediately and it isn't per-connection distribution

**정답: A**
해설: NLB has cross-zone OFF by default, so each NLB node distributes traffic only to targets in the same AZ. With AZ-a 10 / AZ-b 5 / AZ-c 2, traffic goes 1/3 each but AZ-c's 2 instances take a concentrated load. Turning on cross-zone makes all targets take equal load but incurs cross-AZ data transfer cost ($0.01 per GB, both directions). C is also a fix but the ASG doesn't always guarantee even placement per AZ. B's ALB is HTTP-only and unsuitable for game traffic. D is at the DNS layer, so it doesn't take effect immediately.

---

**문제 10.** An ML team needs to load a 2GB ML model in a Lambda function. It exceeds the Lambda layer limit (250MB). What is the most appropriate solution?

A) Abandon Lambda and serve inference from an EC2/ASG with the model preloaded — possible, but it throws away all the benefits of serverless auto-scaling and billing
B) Mount an EFS access point on Lambda and store the model file on EFS
C) Keep the model in S3 and download the 2GB to `/tmp` on every cold start — a multi-GB transfer per cold start makes latency explode and strains the `/tmp` limit (10GB)
D) 8-bit quantize the model down under 250MB and package it in the Layer — it fits the limit, but at an accuracy cost and it's a model change unrelated to the requirement

**정답: B**
해설: Lambda has supported EFS mounts since 2020. Mount via an EFS access point from the same VPC + subnet and access the model with ordinary file I/O inside the function. This bypasses the ZIP/Layer limit. Cold start latency adds the EFS mount time, but that's far faster than a 2GB download. C downloads 2GB on every cold start → latency explodes. A forfeits the serverless advantages. D loses accuracy. Note it requires an EFS access point + VPC config.

---

**문제 11.** An instance sporadically returns `Connection refused`. CPU and memory have headroom and the SG is wide open. CloudWatch shows the `conntrack_allowance_exceeded` metric. What is the most appropriate response?

A) Conntrack limit exceeded. Move to a larger instance type (enhanced networking like c5n), or make the application's connection pool more efficient and use keep-alive
B) Ask AWS Support for a quota increase to raise the conntrack table limit — the conntrack limit is a hard limit fixed per instance type and can't be raised
C) Increase the ASG max size to add more instances — total throughput rises but each individual instance's conntrack saturation remains
D) Add more explicit allow rules to the Security Group to secure connection throughput — the number of rules is unrelated to conntrack capacity, so it has no effect

**정답: A**
해설: The SG stores 5-tuples in the conntrack table for stateful filtering. There's a per-instance-type limit (m5.large ~350K, c5n.large ~1M) and new connections drop when it's exceeded. Fixes are: ① a larger instance (especially the c5n/m5n enhanced-networking families), ② keep-alive to reuse connections, ③ improving connection-pool efficiency. B's conntrack is a hard limit, so no quota increase. C adds instances but leaves a single instance's conntrack unchanged. D is unrelated.

---

**문제 12.** A company runs EC2 production behind an ALB + ASG. It wants to set up Blue/Green deployment with CodeDeploy — which ALB feature does it use?

A) Weighted forward on the listener rule distributes traffic across the two target groups (Blue/Green), and CodeDeploy shifts the weight over time from 0/100 → 100/0
B) Create two ALBs, one each for Blue/Green, and switch with a Route 53 weighted record — DNS TTL caching makes instant/gradual switchover and fast rollback difficult
C) Replace with an NLB and use source IP affinity to steer existing sessions to Blue and new ones to Green — affinity isn't a deployment tool and offers no weighted switchover or automatic rollback
D) Pin users to Blue/Green with ALB sticky sessions (cookies) — that's session pinning, not a mechanism for shifting traffic between versions

**정답: A**
해설: CodeDeploy's Blue/Green deployment (ALB integration) leverages the listener's weighted forward. It creates a new Green target group and CodeDeploy adjusts the weights of the two target groups in the listener rule's forward action. E.g., start Blue 100/Green 0 → Linear10PercentEvery1Minute → Blue 0/Green 100 → terminate Blue after verification. It works on a single ALB. CodeDeploy additionally spins up new instances in the ASG to fill Green. B can't switch instantly because of DNS TTL. C/D are unrelated.

---

## 📊 Week 2 Self-Assessment

| Score | Assessment |
|------|------|
| 11-12 | Excellent - proceed to Week 3, full command of the EC2 layer |
| 8-10 | Good - review the missed questions before proceeding, especially re-check the 12 traps |
| 5-7 | Fair - relearning the EC2 layer recommended, especially ASG and lifecycle hooks |
| 0-4 | Weak - restart Week 2 from the beginning. Read each layer (SG, EBS, ALB) closely |

## 📌 Week 2 Full Summary

1. EC2 virtualization evolved into the Nitro System (dedicated hardware cards), and Firecracker microVMs are the foundation of Lambda and Fargate. Choosing the instance family (M/C/R/I/D/P/G/T) and Graviton (g suffix) chips is the starting point of cost optimization.
2. A Security Group is an ENI-level stateful firewall (conntrack-based). A NACL is subnet-level and stateless. Enforcing IMDSv2 (`HttpTokens=required`) is the standard SSRF defense.
3. User Data runs once as the final step of cloud-init, with a 16KB limit. Never hardcode passwords — use Secrets Manager + instance profile.
4. EBS is AZ-bound distributed block storage. gp3 is the default, io2/Block Express for critical DBs. Snapshots are S3 incremental + Snapshot Archive (75% savings). KMS envelope encryption.
5. Instance Store is host-attached NVMe with microsecond latency, but it's lost on stop/terminate. No durable storage.
6. For shared files, use EFS (NFS multi-AZ), not EBS Multi-Attach. HPC uses FSx for Lustre, Windows uses FSx for Windows, enterprise uses FSx for NetApp ONTAP.
7. Choosing between ALB (L7 HTTP routing) and NLB (L4 TCP/UDP with static EIP) is based on the workload protocol. ALB cross-zone is default ON and free; NLB is default OFF and costs money when enabled.
8. An ASG is a reconciliation loop, with lifecycle hooks controlling warmup and graceful shutdown. Target Tracking is the default scaling policy. Mixed Instance Policy + capacity-optimized Spot is the production standard.
9. Blue/Green deployment is implemented natively through the ALB's weighted forward integrated with CodeDeploy.
10. Exam scenarios ask about connections between layers. Building the habit of narrowing "the SG is open but it doesn't work" down to one of NACL/Endpoint SG/conntrack/Route Table, and "5xx" down to one of health-check timing/warmup/IAM permission, is what determines your score.
