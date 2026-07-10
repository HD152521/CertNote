# Day 2 - The Network Boundary a Developer Actually Touches: Security Groups, Key Pairs, User Data

The two questions you get most often after launching an EC2 instance are: "Why won't SSH connect?" and "The code is up, so why isn't port 80 open?" Both have the same root cause — a misunderstanding of network control and the bootstrap mechanism. Where SAA asks from the architect's vantage point — "which SG goes where?" — DVA goes all the way down to "how do you create that SG with the SDK/CLI, how do you call Secrets Manager from inside User Data, and how do you enforce IMDSv2?" Same security group, but a single line of code or one ARN is what separates the right exam answer from the wrong one.

Today we dig into exactly how a Security Group's stateful mechanism works, follow SSH key pair authentication all the way down to the TLS-handshake stage, and trace the order in which User Data runs on top of cloud-init. The debugging scenarios a developer meets on the exam — "why does it say I don't have permission when the SG is wide open?" — can only be solved by someone who has followed this mechanism to the end.

## A Security Group Is Not Just a Firewall — Inside Connection Tracking

Most introductory guides write "an SG is stateful, so responses are automatically allowed" and stop there. Let's look at what actually happens. Client `203.0.113.10:53241` sends a TCP SYN to EC2 `10.0.1.5:443`. If the packet matches the rule `Allow TCP 443 from 0.0.0.0/0`, the SG lets it through. But the SG doesn't just forward the packet — it **registers the 5-tuple (src_ip=203.0.113.10, src_port=53241, dst_ip=10.0.1.5, dst_port=443, proto=TCP) in the conntrack table**. When the server replies with a SYN-ACK, that packet's 5-tuple is (src=10.0.1.5:443, dst=203.0.113.10:53241), which would normally consult the outbound rules. But because there is a matching inbound flow in conntrack, the SG lets it through without evaluating the outbound rules at all. That is what "stateful" really means.

This mechanism is the same idea as the Linux kernel's `nf_conntrack` (netfilter connection tracking). AWS implements this logic in hardware on the Nitro Card, performing stateful filtering at the ENI level without burdening the host OS. That's why SG changes take effect **immediately (within seconds)**, and even existing in-flight TCP connections get cut by a new rule. A NACL is stateless — it uses no conntrack and evaluates rules on a per-packet basis. That's why a NACL requires you to explicitly open the ephemeral port range (1024-65535) for outbound so responses can return.

| Dimension | Security Group | NACL |
|------|---------------|------|
| Applies at | ENI (instance level) | Subnet (subnet level) |
| State | Stateful (conntrack) | Stateless (per-packet) |
| Rule types | Allow only | Allow + Deny |
| Evaluation order | All rules OR'd (one matching allow lets it through) | Numeric order, first match wins |
| Response traffic | Automatically allowed | Ephemeral port must be specified |
| Default inbound | Deny all | Default NACL allows all |
| Default outbound | Allow all | Default NACL allows all |
| Self-reference | Possible (`sg-xxx ← sg-xxx`) | Not possible (CIDR only) |
| Limits | 5 SGs per instance, 60 in + 60 out per SG | 1 NACL per subnet, 20 in + 20 out per NACL (adjustable) |

> 🔍 **Going deeper**: An SG's conntrack table size varies by instance type. A baseline c5.large tracks hundreds of thousands of connections, while enhanced-networking instances like c5n can track millions. Exceed that limit and new connections get dropped. You can check it with the CloudWatch `conntrack_allowance_exceeded` metric. If a backend API has plenty of RPS headroom yet throws sporadic connection refused errors, suspect the conntrack limit first. The commonly cited figures are ~350K for m5.large and ~1M for c5n.large.

> 💡 **Related theory**: The SG's stateful model shares a lineage with the ASA (Adaptive Security Algorithm) introduced by the Cisco PIX firewall in the 1990s and the state-tracking approach of BSD `pf` (packet filter, OpenBSD 2001). RFC 5382 (NAT Behavioral Requirements for TCP) standardized the behavior of stateful TCP NAT, and AWS's ENI-level conntrack operates on top of that. UDP is tracked too, but since it has no connection concept, entries expire on a timeout basis (30s idle by default). So for UDP traffic like DNS or NTP, there's a corner case where a slow response arrives after the conntrack entry has already expired and gets dropped.

```python
import boto3

ec2 = boto3.client('ec2', region_name='ap-northeast-2')

# Create an SG + self-reference (the intra-cluster communication pattern)
sg = ec2.create_security_group(
    GroupName='app-tier-sg',
    Description='App tier internal mesh',
    VpcId='vpc-0abc1234'
)
sg_id = sg['GroupId']

# Reference itself as the source — allow all TCP between members of the same SG
ec2.authorize_security_group_ingress(
    GroupId=sg_id,
    IpPermissions=[{
        'IpProtocol': 'tcp',
        'FromPort': 0,
        'ToPort': 65535,
        'UserIdGroupPairs': [{'GroupId': sg_id}]
    }]
)
```

This pattern of referencing itself as the source is the standard way to express "open everything between members of the same cluster, but block outsiders" — think Kafka clusters, Cassandra rings, and inter-node Elasticsearch communication. When a new node is added, you just attach the SG and it can communicate automatically.

> ⚠️ **Trap**: If an exam option says something like "block a specific IP with a deny rule in the SG", it is always wrong. SGs have no deny. When you need to block, add an explicit deny rule to a NACL, or handle it with AWS Network Firewall or WAF. Another common point of confusion: "since SG outbound is also stateful, closing only the outbound rules will also block inbound responses." Wrong — outbound and inbound are separate evaluation dimensions. The response to an inbound request passes regardless of outbound rules, and the response to an outbound request passes regardless of inbound rules.

## A Trap to Watch Alongside Security Groups: SGs on PrivateLink and VPC Endpoints

VPC Endpoints (especially Interface Endpoints, which are PrivateLink-based) also get an SG attached. The most common trap here is "the Endpoint SG doesn't allow the caller's (client's) IP or SG on inbound, so the call fails." For example, you attach a Lambda to a VPC and try to call GetSecretValue through a Secrets Manager Interface Endpoint, but you get a `ConnectTimeoutError`. In the console, the Lambda SG's outbound is wide open to 0.0.0.0/0. But if the Endpoint SG's inbound is closed, the packet reaches the Endpoint ENI and gets dropped right there.

```python
# Allow HTTPS inbound from the Lambda SG on the Endpoint SG
ec2.authorize_security_group_ingress(
    GroupId='sg-endpoint',
    IpPermissions=[{
        'IpProtocol': 'tcp',
        'FromPort': 443,
        'ToPort': 443,
        'UserIdGroupPairs': [{'GroupId': 'sg-lambda'}]
    }]
)
```

## Key Pairs: The Real Steps of SSH Authentication

Plenty of material sums up key pair authentication in one line — "challenge with the public key, sign with the private key" — but the actual steps are more granular. Let's walk the flow of the SSH protocol (RFC 4252, public key authentication).

```
1. Client → Server: exchange SSH-2.0 banners
2. Generate a session key via Diffie-Hellman key exchange
3. Server proves its identity with its host key (client compares against known_hosts)
4. Client → Server: SSH_MSG_USERAUTH_REQUEST (method=publickey, user=ec2-user)
5. Server: match the public key in the authorized_keys file
6. Server → Client: SSH_MSG_USERAUTH_PK_OK (this key is accepted)
7. Client: sign session_id with its private key, send the signature
8. Server: verify the signature with the public key; if it passes, authentication is complete
```

The key point here is that **session_id is different every time**. Connect 100 times with the same key and you sign 100 different pieces of data. That's why one key can't be captured and replayed. On EC2, at instance start, cloud-init reads IMDS's `public-keys/0/openssh-key` and automatically appends it to `~/.ssh/authorized_keys`. In other words, when you "register a key pair with EC2", what actually happens is: "cloud-init is baked into the AMI, and that cloud-init fetches the public key from IMDS and plants it inside the OS."

> 🔍 **Going deeper**: AWS Key Pairs are RSA 2048-bit by default, but **ED25519** has been supported since 2021. ED25519 is elliptic-curve based (Curve25519, DJB Bernstein 2011), with a shorter key length than RSA 2048 (256-bit), faster signing/verification, and stronger resistance to side-channel attacks. If you're creating a new key, specify `KeyType=ed25519`. Also, EC2 gives you a way to recover even if you lose the key: ① stop the instance → ② detach the EBS root volume → ③ attach it to another instance → ④ replace `/home/ec2-user/.ssh/authorized_keys` with the new public key → ⑤ reattach to the original instance → ⑥ start. This sequence occasionally shows up on the exam.

> 💡 **Related theory**: SSH public key auth is the idea of PKI (Public Key Infrastructure) compressed down to two parties. There's no CA (Certificate Authority); host keys are trusted via trust on first use (TOFU, known_hosts). So if you trust the wrong host key on first connect, you're vulnerable to MITM attacks thereafter. AWS lets you retrieve the instance boot log from the console or CLI (`aws ec2 get-console-output`) so you can verify the host fingerprint. In secure environments, the correct practice is to confirm the fingerprint from the console before your first SSH.

There are safer alternatives to key pairs. **EC2 Instance Connect** (launched 2019) issues SSH keys via IAM permissions and pushes a temporary key that's valid for only 60 seconds directly into the EC2 instance without going through IMDS. **Session Manager** (SSM Agent based) doesn't use SSH at all — it opens a shell session over HTTPS-over-WebSocket. No key, no inbound port 22 needed. When an exam scenario says "we absolutely do not want to open port 22 on production EC2", the answer is almost always Session Manager.

```bash
# Connect via Session Manager (works even with port 22 closed)
aws ssm start-session --target i-0abc1234

# Push a 60-second temporary key with EC2 Instance Connect
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-0abc1234 \
  --availability-zone ap-northeast-2a \
  --instance-os-user ec2-user \
  --ssh-public-key file://~/.ssh/id_ed25519.pub
```

> ⚠️ **Trap**: "I accidentally pushed an SSH key to GitHub" → the key rotation procedure is: ① create a new key pair → ② inject the new public key into the EBS root (or replace `authorized_keys` via SSM `aws ssm send-command`) → ③ reboot the instance → ④ delete the exposed key pair from AWS → ⑤ audit CloudTrail for calls made with that key such as RunInstances and StartInstances. The exam tests the point that a key pair itself is not an IAM credential but OS-level authentication, so it differs from handling a "compromised credential" in the IAM sense.

## User Data and cloud-init: The Tail End of the Boot Sequence

Everyone memorizes the User Data facts — 16KB limit, runs once, root privileges. But if you look at what actually happens inside cloud-init, the exam traps become far more visible.

```
0. The Nitro hypervisor allocates the instance slot, attaches EBS
1. UEFI bootloader → load kernel
2. systemd starts
3. cloud-init-local.service (early init that runs without networking)
   - set hostname, update /etc/hosts
4. cloud-init.service (networking + IMDS access)
   - fetch instance-id, IAM role, public-keys, etc. from IMDS
   - inject public-keys into ec2-user's authorized_keys
5. cloud-config.service
   - if user-data is cloud-config YAML, it's applied here
   - install packages, write_files, runcmd, etc.
6. cloud-final.service
   - if user-data is a #!/bin/bash script, it runs here
   - logs go to /var/log/cloud-init-output.log
```

The most common reasons a User Data script fails are: ① a missing shebang (the first line `#!/bin/bash`), ② `^M: command not found` from Windows CRLF line endings, ③ calling external resources (S3, Secrets Manager) from inside User Data when the IAM instance profile isn't attached yet or lacks permission. The first step in debugging is always to look at `/var/log/cloud-init-output.log`.

```bash
# Pull the DB password from Secrets Manager inside User Data
#!/bin/bash
set -euxo pipefail

# Called automatically with the IAM role credentials granted by the instance profile
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id prod/app/db \
  --region ap-northeast-2 \
  --query SecretString --output text | jq -r '.password')

# Inject into an environment file (restrict permissions with chmod 600)
echo "DB_PASSWORD=${DB_PASSWORD}" >> /etc/app/secrets.env
chmod 600 /etc/app/secrets.env
chown app:app /etc/app/secrets.env

systemctl restart app.service
```

This pattern is the right answer to the exam's "I hardcoded the DB password into user-data → how should I fix it?" scenario. The key points are: ① the password itself lives in Secrets Manager, ② User Data contains only the fetch command, ③ permissions are granted by the IAM instance profile. User Data itself is readable by anyone via IMDS, so it's unsuitable for storing passwords.

> 🔍 **Going deeper**: To re-run User Data on every boot, use cloud-init's `scripts_per_boot` module, or compose the User Data as mime-multipart and use the `cloud-init-per` directive. There's also the pattern of running a new script on the next boot after changing User Data via the EC2 console "Stop → Edit user data → Start" sequence. CloudFormation's `cfn-init` provides more sophisticated metadata-driven initialization than User Data. SSM State Manager is a tool that continuously maintains an instance's desired state, making it operationally superior to "run once" User Data.

> 💡 **Related theory**: cloud-init is an open-source initialization framework created by Canonical (Ubuntu) in 2009. Today it runs with the same YAML across nearly every environment — AWS, GCP, Azure, OpenStack, local KVM, VMware vSphere, and more. Because of this "write once, run on every cloud" value, it pairs naturally with IaC. AWS-specific tools like cfn-init and the SSM Agent are structured as layers stacked on top of cloud-init.

```yaml
#cloud-config
# Example of YAML-based declarative user-data
package_update: true
packages:
  - nginx
  - awscli
  - jq

write_files:
  - path: /etc/nginx/conf.d/app.conf
    content: |
      server {
        listen 80;
        location / { proxy_pass http://localhost:8080; }
      }

runcmd:
  - systemctl enable --now nginx
  - aws s3 cp s3://my-bucket/app.tar.gz /opt/
  - tar xzf /opt/app.tar.gz -C /opt/
  - systemctl restart app
```

## Enforcing IMDSv2: The Security Hardening That's Guaranteed to Appear

The Capital One incident (2019) was a case where SSRF exposed IMDSv1 and led to the theft of IAM role credentials. As a direct result, AWS introduced IMDSv2 (session-token based) in November 2019, and starting in 2024 it changed the default for new EC2 instances to IMDSv2 required.

```bash
# Enforce IMDSv2 at instance launch + block containers with hop limit 1
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=1,InstanceMetadataTags=enabled' \
  ...
```

`HttpTokens=required` disables IMDSv1; `HttpPutResponseHopLimit=1` blocks IMDS access from inside Docker containers (a container network traverses an extra hop). `InstanceMetadataTags=enabled` (added in 2022) is the option that lets you read the instance's tags from IMDS. You can read tags in your code without an `aws ec2 describe-tags` API call, reducing startup latency.

```bash
# Get credentials via IMDSv2 (get a token with PUT, attach it as a header on GET)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```

> ⚠️ **Trap**: If the exam presents a scenario asking "does boto3 / the AWS SDK support IMDSv2?", the answer is always "yes (automatic in the SDK since November 2019)". But if the SDK version is too old, it may only attempt IMDSv1 and fail. AWS SDK for Python (botocore) 1.13.0 or later, and AWS SDK for Java 2.x or later, are the safe baselines. EKS's IRSA (IAM Roles for Service Accounts) doesn't use IMDS — it receives credentials via OIDC + STS AssumeRoleWithWebIdentity, so it's unaffected by IMDS options.

## SG and NACL Evaluation Order, Seen from Inside the VPC

Seeing how the SG and NACL work together as a packet travels to the EC2 instance makes debugging much faster.

```
Inbound (external → EC2):
  Internet → IGW → Route Table → NACL (inbound rule)
       → Subnet → the ENI's SG (inbound rule) → EC2

Outbound (EC2 → external):
  EC2 → the ENI's SG (outbound rule) → Subnet → NACL (outbound rule)
       → Route Table → IGW → Internet
```

The SG is stateful, so it doesn't re-check the outbound rule for a response, but the NACL is stateless, so you must explicitly open the response direction too (usually ephemeral ports 1024-65535). That's why the answer to "the SG is wide open but communication fails" is almost always a NACL not allowing the ephemeral ports.

> 📚 **Case study**: In 2020, a Vimeo engineer posted a retrospective on their blog about "omitting outbound TCP 1024-65535 on a NACL, so all responses were dropped — 4 hours of debugging." The classic pattern of debugging by looking only at the SG, then finding the answer the moment they looked at the NACL. If an exam scenario shows "the SG is fine but connection timed out", suspect the NACL.

## Wrapping Up

There are three pictures we saw today. First, a Security Group is a conntrack-based stateful firewall, and the pattern of an SG referencing itself is the standard for intra-cluster communication. Second, a Key Pair is OS-level authentication operating on top of the SSH standard, not IAM, and in production the modern approach is to close port 22 with Session Manager or EC2 Instance Connect. Third, User Data runs once at the final stage of cloud-init, and you must never hardcode passwords — use the Secrets Manager + instance profile pattern.

In the next article, we look at the layer where EC2 accesses disk — EBS, the instance store, and EFS/FSx on top of them. How IOPS, throughput, durability, and multi-attach trade off against one another, all under the same word "storage", is the core of the exam.

---

## 📝 연습 문제

**문제 1.** A developer designed an ECS task so that a Lambda calls a Secrets Manager Interface Endpoint. The Lambda SG's outbound is wide open to 0.0.0.0/0, yet a `ConnectTimeoutError` occurs. What is the most likely cause?

A) Secrets Manager doesn't support Interface Endpoints
B) The Endpoint SG's inbound doesn't allow 443 from the Lambda SG
C) IAM permissions are insufficient
D) The Lambda's timeout is too short

**정답: B**
해설: An Interface Endpoint (PrivateLink) has its own ENI, and an SG is attached to that ENI. Even if the Lambda's outbound is 0.0.0.0/0, if the Endpoint SG's inbound is closed, the packet is dropped at the Endpoint ENI. The fix is to allow TCP 443 on the Endpoint SG's inbound with the Lambda SG as the source. For C, an IAM problem would usually surface as `AccessDeniedException`, not a timeout. For D, a normal Secrets Manager call completes within 100ms — far faster than Lambda's default 3-second timeout. The Endpoint SG is a frequently missed trap.

---

**문제 2.** A company wants IAM-controlled shell access to EC2 without using SSH keys. They absolutely do not want to open inbound port 22. What is the most appropriate solution?

A) EC2 Instance Connect (Browser-based SSH)
B) Session Manager (SSM Agent + HTTPS over WebSocket)
C) Bastion Host + SSH
D) Direct Connect + VPN

**정답: B**
해설: With Session Manager, the SSM Agent connects to the SSM service over outbound HTTPS (443), and you open a shell over that session from the AWS Console or CLI. It works with port 22 closed, and IAM permissions (`ssm:StartSession`) control who can access which instance. Every command is recorded in CloudTrail, so auditing is possible too. A's EC2 Instance Connect can also be IAM-controlled, but ultimately port 22 must be open in the SG for the EC2 Instance Connect service IP. C requires port 22 open somewhere. D is a network connectivity method, not a shell access method.

---

**문제 3.** An EC2 instance is an m5.large and sporadically throws `Connection refused`. CPU and memory have headroom, and there are no errors in the application logs. What is the most likely cause?

A) EBS IOPS limit exceeded
B) Conntrack table limit exceeded (check the CloudWatch `conntrack_allowance_exceeded` metric)
C) The ALB's deregistration delay
D) IMDSv2 token expiration

**정답: B**
해설: Each EC2 instance has an SG stateful conntrack table with a per-instance-type limit (~350K for m5.large, ~1M for c5n.large). When the limit is exceeded, new connections are dropped. Check it with the CloudWatch agent's `conntrack_allowance_exceeded` metric. Fixes: ① change the instance type to a larger one (the c5n family), ② change the application to reuse the connection pool efficiently, ③ reduce the number of connections with keep-alive. For A, exceeding the IO limit increases latency, not connection refused. C is unrelated to ALB behavior. D is unrelated to metadata lookups.

---

**문제 4.** A User Data script doesn't run at instance boot. What is the most appropriate first debugging step?

A) Rebuild the AMI
B) Check `/var/log/cloud-init-output.log` and `/var/log/cloud-init.log`
C) Move the instance to a different AZ
D) Remove the IAM instance profile

**정답: B**
해설: User Data runs at the final stage of cloud-init (`cloud-final.service`), and all output is recorded in `/var/log/cloud-init-output.log`, while cloud-init's own operational log goes to `/var/log/cloud-init.log`. The most common failure causes are: ① a missing shebang (`#!/bin/bash`), ② Windows CRLF line endings, ③ insufficient IAM permission when calling external resources from inside User Data, ④ User Data exceeding the 16KB size limit. You can also see some of the boot log via the EC2 console's "Get System Log" or `aws ec2 get-console-output`.

---

**문제 5.** A company wants to use an ED25519 key pair on an EC2 instance. What is the exact command to create it via the CLI?

A) `aws ec2 create-key-pair --key-name my-key --key-type ed25519 --query 'KeyMaterial' --output text > my-key.pem`
B) `aws ec2 create-key-pair --key-name my-key --key-format ed25519`
C) `aws iam create-key-pair --key-name my-key`
D) Only possible from the EC2 console

**정답: A**
해설: Specify it with `--key-type ed25519`. Receive the output in PEM format, save it to `my-key.pem`, then use SSH after `chmod 400 my-key.pem`. ED25519 has a shorter key than RSA 2048, faster signing/verification, and stronger resistance to side-channel attacks. AWS has supported ED25519 since 2021. C's `aws iam create-key-pair` is a nonexistent command (IAM keys are access keys, not SSH keys).

---

**문제 6.** An EC2 instance had its IAM role credentials stolen through IMDSv1 via an SSRF attack. What is the most appropriate EC2 setting to prevent the same incident?

A) Remove the IAM role
B) Enforce IMDSv2 with `MetadataOptions.HttpTokens=required, HttpPutResponseHopLimit=1` + block access via containers
C) Block 169.254.169.254 in the Security Group
D) Use the `ec2messages.amazonaws.com` endpoint

**정답: B**
해설: `HttpTokens=required` disables IMDSv1 → an SSRF attacker can't send the PUT, so they can't obtain a token and metadata access is blocked. `HttpPutResponseHopLimit=1` adds further hardening → a Docker container network traverses one more hop, so IMDS access from inside a container is blocked. A stops the application from using IAM permissions. C fails because 169.254.169.254 is a link-local address and can't be controlled by an SG (an SG only sees packets routed outside the ENI). D is an endpoint for SSM communication and is unrelated to IMDS.

---

**문제 7.** In the following cloud-config YAML, which part defines commands that run on every boot?

A) `runcmd`
B) `bootcmd`
C) `scripts_per_boot`
D) `write_files`

**정답: C**
해설: `runcmd` runs at cloud-init "instance" frequency — only once on first boot. `bootcmd` runs on every boot but at a very early stage where networking may not be up. `scripts_per_boot` runs the scripts in the `/var/lib/cloud/scripts/per-boot/` directory on every boot. `write_files` is not a command but a file-creation directive. To run User Data on every boot, use a mime-multipart `text/x-shellscript-per-boot` type part.

---

**문제 8.** A Lambda function is connected to a VPC and tries to call a DynamoDB Gateway Endpoint over PrivateLink. Which statement about the Lambda SG and Endpoint configuration is correct?

A) A Gateway Endpoint (S3, DynamoDB) has no ENI, so no SG applies; instead you add a prefix list to the Route Table to send the Lambda subnet's outbound route to the endpoint
B) A Gateway Endpoint also has an ENI, so it's controlled with an SG
C) DynamoDB only supports PrivateLink Interface Endpoints
D) When a Lambda is connected to a VPC, DynamoDB calls become impossible

**정답: A**
해설: AWS has two kinds of VPC Endpoints. A **Gateway Endpoint** (S3 and DynamoDB only) works as a Route Table entry, routing traffic to the endpoint without an ENI or SG. An **Interface Endpoint** (PrivateLink, most services) creates an ENI and attaches an SG to it. DynamoDB has supported the Gateway Endpoint since 2017, and added PrivateLink Interface Endpoint support in 2023. On the exam, the answer to "a Lambda is connected to a VPC but DynamoDB calls time out" is almost always a missing prefix list in the Gateway Endpoint's Route Table.

---

## 📌 오늘의 요약

1. A Security Group is a per-ENI stateful firewall that tracks 5-tuples in a conntrack table to auto-allow responses. SG → SG self-reference is the standard pattern for intra-cluster communication.
2. A NACL is a per-subnet stateless ACL that requires explicitly specifying ephemeral port outbound. It has more traps during debugging than an SG.
3. A Key Pair maps the SSH standard's public key auth onto EC2, with ED25519 as the modern standard. In production, the best practice is to close port 22 itself with Session Manager.
4. User Data runs once at the final stage of cloud-init, and `/var/log/cloud-init-output.log` is the starting point for debugging. Never hardcode passwords — use Secrets Manager + an instance profile.
5. Enforcing IMDSv2 (`HttpTokens=required` + `HttpPutResponseHopLimit=1`) is the core of SSRF defense. It's the mechanism introduced immediately after the Capital One incident.
