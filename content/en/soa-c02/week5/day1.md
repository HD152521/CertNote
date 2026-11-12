# Day 1 - AWS Systems Manager: The Operator's Central Control Tower

At 2 AM, an urgent Slack message arrives from the security team: "Log4Shell (CVE-2021-44228) vulnerability—patch all servers immediately." You have 300 EC2 instances. If you search for SSH keys, connect through Bastion, and log into each one individually, you'll burn through the night. You have patching scripts, but how do you push them to 300 instances simultaneously? This is when an operator reaches for AWS Systems Manager (SSM).

SSM started in 2015 as "EC2 Run Command" and has evolved into a massive operations platform that now spans agent-based instance management, centralized configuration, automated patching, session auditing, and complex operational automation. On the SOA-C02 exam, SSM accounts for 15–20% of all questions. Today we map SSM's entire landscape and learn the conditions and troubleshooting methods that operators must verify daily for Managed Instances.

## SSM's Origins: A Brief History of Agent-Based Management

To understand SSM, you need to know the history of agent-based server management. In the 2000s data center era, Puppet (2005), Chef (2009), and CFEngine managed server state declaratively. All used a "pull model" where agents periodically checked in with a central server. Ansible (2012) pioneered a "push model" via SSH, operating without an agent.

AWS faced a different problem at scale. SSH key distribution burden, the security risk of opening port 22 in security groups, congestion control when sending commands to thousands of servers simultaneously, and auditability of every operational action. AWS's 2015 answer was SSM Agent + an AWS-managed control plane. By having agents send heartbeats and pull commands through AWS APIs, operators can now control instances from any network environment—all they need is internet connectivity or a VPC Endpoint.

> 💡 **Related Theory**: Agent-based management resembles the "gossip protocol" in distributed systems. Each agent periodically sends a heartbeat to a central authority, which aggregates that state. In distributed systems theory, this is called a "failure detector" (Chandra & Toueg, 1996). SSM Agent's heartbeat dropping for more than 5 minutes marks it as `PingStatus=ConnectionLost`—a direct implementation of that failure detector pattern. The same principle applies internally across AWS for EC2 heartbeats, ELB health checks, and RDS replication lag monitoring.

## SSM Compared to Other Clouds: SSM vs GCP OS Configuration vs Azure Arc

To understand SSM's position, compare it to equivalent services on competing clouds.

| Capability | AWS SSM | GCP OS Config | Azure Arc | HashiCorp Boundary |
|-----------|---------|---------------|-----------|-------------------|
| Agent-based | SSM Agent (Go) | OSConfig Agent (Python) | Connected Machine Agent (.NET) | Boundary Worker |
| Command execution | Run Command | VM Manager | Run Command Extension | — |
| Patch management | Patch Manager | OS patch management | Update Management | — |
| Session access | Session Manager | IAP TCP Tunneling | Bastion | — |
| Configuration management | State Manager | Desired State Configuration | Azure Policy Guest Config | — |
| No port required | 22/3389 not needed | 22/3389 not needed | 22/3389 not needed | Not needed |
| On-premises | Hybrid Activations | Anthos | Arc-enabled servers | All environments |
| Cost model | Included in EC2 (Standard Tier free) | Added to managed VM cost | $5/server/month (Arc-enabled) | Open source free |

AWS SSM's differentiator is **complete IAM integration** and **automatic integration with CloudWatch and S3**. Azure Arc offers more flexibility in hybrid environments but costs more.

> 💡 **Related Theory**: The fundamental difference between "agent-less SSH-based" (Ansible approach) and "agent-based" (SSM approach) lies in security boundary design. SSH-based requires the management server to initiate inbound connections to managed servers. Agent-based has managed servers initiate outbound connections to the management server. From a firewall perspective, outbound HTTPS (443) is almost universally allowed, but inbound SSH (22) is blocked by default in many environments. This is why SSM chose the "agent pull model"—a security architecture choice. Unlike SSH (RFC 793 based on TCP), SSM operates over AWS SigV4-signed HTTPS, providing mTLS-level authentication.

## SSM's Five Categories: The Operator's Landscape

SSM is not a single service but a collection of capabilities. When you enter Systems Manager in the AWS console, dozens of menu items unfold in the left sidebar. Grouping them into five categories reveals the whole landscape.

| Category | Core Capabilities | Daily Operator Usage |
|----------|-----------|----------------------|
| **Operations Management** | OpsCenter, Incident Manager, Explorer | Incident tracking, operations dashboard |
| **Application Management** | Parameter Store, AppConfig, Application Manager | Centralized configuration, feature flags |
| **Change Management** | Change Manager, Automation, Change Calendar, Maintenance Window | Change control, automated workflows |
| **Node Management** | Fleet Manager, Run Command, Session Manager, Patch Manager, State Manager, Inventory, Compliance, Distributor, Hybrid Activations | Core instance state management |
| **Shared Resources** | SSM Documents, Quick Setup | Foundation layer for all capabilities |

On SOA-C02, the Node Management category (especially Run Command, Session Manager, Patch Manager, State Manager) is heavily tested. Today we dig deep into **Managed Instances**, **SSM Agent**, Fleet Manager, and Inventory—the prerequisite conditions for all other capabilities.

## SSM Agent: The Bridge Between Instances and AWS

SSM Agent is open-source software written in Go (GitHub: aws/amazon-ssm-agent). The agent communicates with SSM service through three channels.

- `com.amazonaws.<region>.ssm`: Control channel. Heartbeat, command reception.
- `com.amazonaws.<region>.ssmmessages`: Session channel. Session Manager traffic.
- `com.amazonaws.<region>.ec2messages`: EC2 metadata channel. Run Command result return.

All use HTTPS (443). This means port 22 (SSH) or 3389 (RDP) need not be opened at all.

**Operating systems with auto-installed agents:**

Amazon Linux 2/2023, Ubuntu 16.04+ (latest AMI), Windows Server 2016/2019/2022, macOS (select instance types). Other OSes (RHEL, SUSE, Debian, CentOS, etc.) require manual installation via package manager.

```bash
# Amazon Linux 2 - already installed; verify version only
sudo systemctl status amazon-ssm-agent
amazon-ssm-agent --version

# Ubuntu manual installation
wget https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb
sudo dpkg -i amazon-ssm-agent.deb
sudo systemctl enable amazon-ssm-agent && sudo systemctl start amazon-ssm-agent

# RHEL/CentOS
sudo yum install -y amazon-ssm-agent
sudo systemctl enable amazon-ssm-agent && sudo systemctl start amazon-ssm-agent
```

> 🔍 **Deeper Dive**: SSM Agent awaits commands via long polling through AWS APIs, similar to AWS SQS. The agent periodically asks the SSM service "do I have commands to execute?" This mechanism lets the agent receive commands even behind firewalls without inbound connections. Since 2022, communication via AWS PrivateLink within a VPC is also available. The polling interval the agent uses internally is 5–15 seconds; you can confirm it in `amazon-ssm-agent.log` by looking for "Polling for messages" messages.

## Three Conditions for Becoming a Managed Instance

For SSM to control an instance, it must be registered as a "Managed Instance." There are three conditions, and **all three must be satisfied**.

**Condition 1: SSM Agent Running**

Even if the agent is installed, if the service is stopped, it won't connect.

**Condition 2: IAM Permission (Instance Profile)**

The IAM Role attached to the instance must include the `AmazonSSMManagedInstanceCore` policy. The core APIs this policy permits are:

```
ssm:RegisterManagedInstance
ssm:DescribeInstanceInformation
ssm:GetDocument
ssm:GetParameters
ssm:PutComplianceItems
ec2messages:GetMessages
ssmmessages:CreateControlChannel
ssmmessages:OpenControlChannel
```

> ⚠️ **Pitfall**: `AmazonSSMManagedInstanceCore` is an AWS managed policy, so its contents can change. When building least-privilege custom policies, base them on the API list above. On the exam, "Managed Instance not registering—reason #1 = missing IAM Role" is a frequent test scenario. Another common mistake: IAM Role exists but was **not attached via Instance Profile**. IAM Role and Instance Profile are separate concepts; for EC2 to use a Role, it must be wrapped in an Instance Profile and attached.

**Condition 3: SSM Service Endpoint Network Reachability**

The instance must communicate with SSM service. Public subnet + internet gateway handles this automatically. **In private VPCs (internet blocked), a VPC Endpoint is required.**

```
# Three Interface Endpoints required in private VPC
com.amazonaws.<region>.ssm
com.amazonaws.<region>.ssmmessages  
com.amazonaws.<region>.ec2messages

# S3 Gateway Endpoint also required (for SSM Documents, output storage)
com.amazonaws.<region>.s3
```

> 📚 **Case Study**: 2021, a financial company (Company A) transitioned to a completely private VPC (all internet blocked) for security compliance. 200 EC2 instances had SSM Agent installed, but VPC Endpoints were never configured—all fell to `PingStatus=ConnectionLost`. The ops team spent 4 hours diagnosing. The moment they created the three Interface Endpoints and allowed port 443 in security groups, everything resolved. Lesson: private VPC = three VPC Endpoints on the must-configure checklist. The Endpoint security group must permit 443 inbound from the EC2 subnet CIDR, and you must verify that `PrivateDnsEnabled=true` so the Endpoint DNS name resolves as Private DNS.

## Default Host Management Configuration (DHMC)

Released in late 2022, DHMC is a game-changer. Previously, when creating EC2 instances, you had to explicitly attach an IAM Instance Profile for SSM to work. Enable DHMC, and all EC2 instances automatically register as Managed Instances without an Instance Profile.

```bash
# Enable DHMC (per region)
aws ssm update-service-setting \
  --setting-id arn:aws:ssm:ap-northeast-2:123456789012:servicesetting/ssm/managed-instance/default-ec2-instance-management-role \
  --setting-value "service-role/AWSSystemsManagerDefaultEC2InstanceManagementRole"
```

AWS automatically creates a service-linked role called `AWSSystemsManagerDefaultEC2InstanceManagementRole` and applies it to all EC2. Operators no longer fret about attaching IAM Roles to each instance—the start of "frictionless operations."

> 💡 **Related Theory**: DHMC is AWS's implementation of the "Convention over Configuration" (CoC) design principle. Popularized by Ruby on Rails, CoC says "provide sensible defaults; let users configure only the differences." The previous approach—requiring operators to explicitly attach an IAM Role to each new EC2—was "Configuration over Convention." DHMC enables "zero-config SSM registration" and is now a recommended best practice for operational efficiency in AWS Well-Architected (post-2023). However, instances with DHMC have no custom Instance Profile, so if you need additional permissions (S3 access, Secrets Manager reference), you must attach a separate Role.

## Managed Instance Status and Troubleshooting

```bash
# List all Managed Instances and PingStatus
aws ssm describe-instance-information \
  --query 'InstanceInformationList[*].[InstanceId,PingStatus,PlatformName,PlatformVersion,IPAddress,LastPingDateTime]' \
  --output table

# PingStatus meanings
# Online: Healthy (last ping within 5 minutes)
# ConnectionLost: Last ping >5 minutes ago (Agent stopped or network issue)
# Inactive: Instance terminated

# Detailed view of specific instance
aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=i-0123456789abcdef0"
```

**Troubleshooting ConnectionLost in order:**

1. Check EC2 instance status (is it `running`?)
2. Check IAM Role (does it include `AmazonSSMManagedInstanceCore`?)
3. Verify SSM Agent service status (if direct access needed, use EC2 Serial Console)
4. Check network (is there an internet gateway in public VPC? three VPC Endpoints in private VPC?)
5. Verify time synchronization (Agent uses NTP; large time skew causes API signature failure and connection loss)

> 🔍 **Deeper Dive**: When SSM Agent calls AWS APIs, it uses AWS Signature Version 4 (SigV4). SigV4 includes the current UTC time in the signature. If instance clock drifts >5 minutes, the API request is rejected with `RequestExpired`. You'll see time errors in CloudWatch Logs or `/var/log/amazon/ssm/amazon-ssm-agent.log`. EC2 instances use Amazon Time Sync Service (169.254.169.123) as NTP server by default, so check that this address isn't blocked on UDP 123 within your VPC. The SigV4 algorithm (RFC 4634–based HMAC-SHA256) restricts timestamp drift to ±5 minutes as a standard security mechanism against replay attacks (AWS Signature Version 4 spec, 2023).

## Session Manager: Secure Sessions Without SSH—How It Works Inside

Session Manager is a core SSM capability—secure instance access without SSH/RDP. Understanding its internals makes troubleshooting easier.

```
[Operator Browser/CLI]
      │
      │ AWS API: ssm:StartSession (IAM auth)
      ▼
[SSM Service]
      │
      │ ssmmessages channel (WebSocket over HTTPS 443)
      ▼
[SSM Agent on EC2]
      │
      │ Local shell (bash, powershell)
      ▼
[Command execution inside instance]
      │
      │ Session log → S3 bucket / CloudWatch Logs (encrypted)
      ▼
[Audit trail preserved]
```

**Session Manager's key feature: Port forwarding**

Port forwarding connects a local port to a remote service without opening the port in security groups.

```bash
# Forward remote EC2's 3306 (MySQL) to local 13306
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'

# Then locally: mysql -h 127.0.0.1 -P 13306 -u admin -p

# Remote service port forwarding (EC2-accessible RDS endpoint)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["mydb.abc.ap-northeast-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}'
```

**Configure session logging (S3 + CloudWatch Logs):**

```bash
# SSM Session Manager basic configuration
aws ssm update-document \
  --name "SSM-SessionManagerRunShell" \
  --content '{
    "schemaVersion": "1.0",
    "description": "Document to hold regional settings for Session Manager",
    "sessionType": "Standard_Stream",
    "inputs": {
      "s3BucketName": "my-session-logs",
      "s3KeyPrefix": "sessions",
      "s3EncryptionEnabled": true,
      "cloudWatchLogGroupName": "/ssm/session-manager",
      "cloudWatchEncryptionEnabled": true,
      "cloudWatchStreamingEnabled": true,
      "kmsKeyId": "arn:aws:kms:ap-northeast-2:123456789012:key/abc-123",
      "runAsEnabled": true,
      "runAsDefaultUser": ""
    }
  }' \
  --document-version "\$LATEST"
```

> 📚 **Case Study**: 2022, a fintech startup (Company B) prepared for PCI-DSS Level 1 audit and received the requirement: "all server access sessions must be auditable." The legacy Bastion + SSH approach made session content logging difficult. They switched to Session Manager, configuring KMS-encrypted S3 session logs + CloudWatch Logs. Auditors could immediately query "which commands did operator X run on date Y?" from S3, satisfying PCI-DSS 10.2.1 (audit logging). Port 22 was completely blocked company-wide by security group policy.

## Fleet Manager: GUI Management Without SSH/RDP

Fleet Manager visually manages all Managed Instances from the console. The key: **you can see inside instances without SSH or RDP connections.**

Capabilities Fleet Manager provides:

| Capability | Description | vs. Old Approach |
|------|------|----------------|
| **File System Browser** | Browse, download, upload files/directories inside instance | No scp, sftp needed |
| **Process Manager** | List running processes, force kill | No top, kill needed |
| **Users and Groups** | Manage Linux/Windows users and groups | No useradd, usermod needed |
| **Performance Counters** | Real-time CPU, memory, disk IO | Supplements CloudWatch |
| **Registry Editor** | Edit Windows Registry | No regedit needed |
| **Patch Management** | Check patch status, apply immediately | — |

> ⚠️ **Pitfall**: Fleet Manager's File System Browser operates through SSM Agent. It requires Managed Instance registration first. "Can I see files without SSH?" → "Fleet Manager" is the answer, but the prerequisite is Managed Instance registration. Also note: Fleet Manager's Node Detail page's "Remote Desktop" feature opens Session Manager RDP session in-browser, giving graphical access to Windows instances without an RDP client—but RDP port (3389) still doesn't need opening in security groups (it tunnels through SSM).

## Inventory: Centralized Asset Inventory

Inventory periodically collects software and configuration information from all Managed Instances, storing it in SSM's database. Questions like "how many instances have MySQL 5.7 installed?", "are there servers still using Python 2.7?", "which servers use Log4j 1.x?" get answered instantly.

**Collectable data types:**

| Type | Content |
|------|------|
| `AWS:Application` | All installed applications (name, version, vendor) |
| `AWS:AWSComponent` | AWS CLI, CloudFormation Agent, etc. |
| `AWS:WindowsUpdate` | Applied Windows KB numbers |
| `AWS:WindowsRole` | Windows roles like IIS, DHCP Server |
| `AWS:Network` | Network adapters, IPs, MAC addresses |
| `AWS:InstanceInformation` | OS, kernel version, SSM Agent version |
| `AWS:Services` | Windows services list |
| `AWS:File` | Specific path file collection (custom) |
| `Custom:*` | User-defined JSON (any data operators want) |

**Enable Inventory (State Manager Association):**

```bash
aws ssm create-association \
  --association-name "DailyInventory" \
  --name "AWS-GatherSoftwareInventory" \
  --targets '[{"Key":"InstanceIds","Values":["*"]}]' \
  --schedule-expression "rate(24 hours)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "networkConfig":["Enabled"],
    "windowsUpdates":["Enabled"],
    "instanceDetailedInformation":["Enabled"],
    "services":["Enabled"],
    "windowsRoles":["Enabled"]
  }'
```

**Consolidate to S3 with Resource Data Sync, then analyze with Athena:**

```bash
# Sync Inventory data to S3
aws ssm create-resource-data-sync \
  --sync-name "InventoryToS3" \
  --s3-destination '{
    "BucketName":"my-inventory-bucket",
    "Region":"ap-northeast-2",
    "SyncFormat":"JsonSerDe",
    "Prefix":"inventory"
  }'

# Query in Athena for Log4j installations (example)
# SELECT resourceid, name, version
# FROM "ssm_inventory"."aws_application"
# WHERE name LIKE 'log4j%' AND version < '2.15.0'
```

> 📚 **Case Study**: December 2021, immediately after Log4Shell (CVE-2021-44228) disclosure, companies running SSM Inventory extracted "servers with Log4j 1.x or 2.0–2.14" in 30 minutes. Companies without Inventory spent days on manual checking. After this incident, "Inventory + Resource Data Sync" became a security compliance must-have. NIST SP 800-171's 3.4.1 requirement ("establish and maintain baseline configuration") can be evidenced with this Inventory data.

> 🔍 **Deeper Dive**: Inventory's `Custom:*` type lets operators write SSM Documents directly to collect arbitrary JSON—e.g., "list currently running Docker containers" or "crontab entries." Collected data stores in SSM database as `Custom:<typename>`. With Resource Data Sync to S3, you can analyze with AWS Glue + Athena for SQL, then visualize with QuickSight. This pattern is how you implement a CMDB (Configuration Management Database) natively on AWS.

## Hybrid Activations: Manage On-Premises the Same Way

Companies transitioning to cloud operate on-premises servers and EC2 simultaneously. Hybrid Activations lets you register on-premises servers or VMs from other clouds (GCP, Azure) as SSM Managed Instances, managing them identically to EC2.

**Registration process:**

```bash
# Step 1: Create Activation in management account
aws ssm create-activation \
  --description "on-premises DC1 servers" \
  --default-instance-name "onprem-dc1" \
  --iam-role "service-role/AmazonEC2RunCommandRoleForManagedInstances" \
  --registration-limit 100 \
  --expiration-date "2026-12-31T00:00:00Z"

# Example output:
# {
#   "ActivationId": "aact-0f1a2b3c4d5e6f7a8",
#   "ActivationCode": "ABCdef123456GHIjkl"
# }

# Step 2: On on-premises server, install Agent then register
sudo amazon-ssm-agent -register \
  -code "ABCdef123456GHIjkl" \
  -id "aact-0f1a2b3c4d5e6f7a8" \
  -region "ap-northeast-2"

# After registration, assigned ID in format mi-xxxxxxxxxxxxxxxxx
# After that, Run Command, Patch Manager, Session Manager work identically to EC2
```

**Cost structure:**

- Standard Tier: up to 1,000 instances/month free
- Advanced Tier: $0.00695/instance/hour (large on-premises fleet or Session Manager logging needed)

> 💡 **Related Theory**: Hybrid Activations' concept comes from "unified control plane" architecture. Google's Anthos (GKE + on-premises) and Azure Arc (unified management across environments) implement the same concept. Managing workloads from any environment through a single control plane is the key operations pattern for the multi-cloud/hybrid era. The CNCF (Cloud Native Computing Foundation) implements this pattern in the open-source "Crossplane." On SOA-C02, the answer to "how do I manage on-premises servers with SSM?" is always Hybrid Activations.

## SSM vs Competing Tools

| Capability | SSM | Ansible | Chef/Puppet | Physical Bastion+SSH |
|-----------|-----|---------|-------------|-------------------|
| Agent | Present (pull-based) | None (push, SSH) | Present (pull-based) | None |
| Cloud integration | Native (IAM, CloudWatch, S3) | Plugin | Plugin | None |
| Audit (built-in) | Yes (CloudWatch, S3) | Separate config | Separate config | None |
| Multi-OS | Yes | Yes | Yes | Yes |
| On-premises | Hybrid Activations | Yes | Yes | Yes |
| Cost | Included in EC2 | Open source | Paid license | EC2 cost |
| Ports required | HTTPS 443 only | SSH 22 | Agent 8140 | SSH 22 |

SSM's greatest advantage is complete integration within the AWS ecosystem. IAM for access control, CloudWatch for log collection, S3 for result storage, EventBridge for automation triggers—all connected without separate tools.

## Complete Architecture Diagram

```
SSM Managed Instance Registration Flow
============================================================

  [Public EC2]               [Private EC2]          [On-Premises]
      │                          │                        │
      │ IAM Role(Core)           │ IAM Role(Core)         │ Activation
      │ + Agent running          │ + Agent running        │ Code/ID
      │                          │ + 3 VPC Endpoints      │ + Agent install
      └─────────────┬────────────┘                        │
                    │                                      │
                    │ Heartbeat (HTTPS 443)                │
                    ▼                                      │
           ┌─────────────────────────────────────────────────┐
           │           SSM Service (Regional)                 │
           │                                                  │
           │  Fleet Manager   Inventory    Hybrid Activations │
           │  Run Command     State Manager                   │
           │  Session Manager Patch Manager                   │
           │  Automation      Compliance                      │
           └─────────────────────────────────────────────────┘
                    │
                    ▼ (result storage)
           ┌──────────────────┐
           │  S3  CloudWatch  │
           │  Logs / Metrics  │
           └──────────────────┘

Private VPC requires VPC Endpoints:
  • com.amazonaws.ap-northeast-2.ssm         (Interface)
  • com.amazonaws.ap-northeast-2.ssmmessages  (Interface)
  • com.amazonaws.ap-northeast-2.ec2messages  (Interface)
  • com.amazonaws.ap-northeast-2.s3           (Gateway - free)
```

## 📝 Practice Questions

**Question 1.** An EC2 instance does not appear in the SSM Managed Instances list. The instance is running and uses the latest Amazon Linux 2 AMI. What should be checked first?

A) Check whether the AMI includes the SSM Agent
B) Check whether an IAM role that includes the `AmazonSSMManagedInstanceCore` policy is attached to the Instance Profile
C) Check whether inbound port 22 is allowed in the security group
D) Check whether the instance is in a public subnet

**Answer: B**
Explanation: The latest Amazon Linux 2 AMI has the SSM Agent installed by default, so A is most likely already satisfied. SSM does not use port 22, so C is irrelevant. Public/private subnets affect additional conditions (VPC endpoints), but the first thing to check is a missing IAM role. A missing IAM permission is the number one cause of an instance not becoming a Managed Instance. Verification command: `aws ec2 describe-iam-instance-profile-associations --filters "Name=instance-id,Values=i-xxx"`

---

**Question 2.** A company wants to manage EC2 instances with SSM in a fully private VPC (no internet gateway). The IAM role is already configured correctly. What else is required?

A) Create a NAT Gateway
B) Add an internet gateway
C) Create three VPC Interface Endpoints: ssm, ssmmessages, ec2messages
D) Set up a Bastion Host

**Answer: C**
Explanation: The SSM Agent connects to the SSM service endpoints over HTTPS (443). In a private VPC without internet, communication goes through the AWS internal backbone using VPC Interface Endpoints. A NAT Gateway goes through the internet, and a Bastion is SSH-based and unrelated to the purpose of SSM. It is also standard to create an S3 Gateway Endpoint as well (for downloading Documents and storing results). The security group of each Endpoint must allow inbound 443 from the EC2 subnet.

---

**Question 3.** The operations team wants to know "how many EC2 instances in our infrastructure currently have Python 2.7 installed?" What are the most appropriate tool and method?

A) Run `python --version` on each EC2 instance with Run Command
B) Search CloudTrail for Python-related events
C) Enable SSM Inventory and filter for Python 2.7 in the `AWS:Application` data
D) Check the Python version through Config Rules

**Answer: C**
Explanation: Inventory periodically collects the installed software of all Managed Instances. The `AWS:Application` type includes names and versions. With Resource Data Sync gathering the data into S3, large-scale analysis is possible with Athena SQL. Run Command (A) also works, but it is a one-time operation and its results are hard to aggregate. Once configured, Inventory continuously tracks the software status of all instances.

---

**Question 4.** There are 80 servers in an on-premises data center, and the company wants to apply Run Command and Patch Manager to these servers through SSM. What is the most appropriate approach?

A) It is not possible because SSM supports only EC2
B) Configure a VPN over Direct Connect to the on-premises servers
C) Create a Hybrid Activation, install the SSM Agent on each server, and register it with the Activation Code/ID
D) Install AWS Outposts in the data center

**Answer: C**
Explanation: Hybrid Activations is a feature built for exactly this purpose. After creating an Activation, installing the Agent on the server and going through the registration process assigns an ID in the format `mi-xxxxxxxxx`. After that, you can use Run Command, Patch Manager, and Session Manager exactly as with EC2. Up to 80 servers falls within the Standard Tier (free) range, so there is no additional cost.

---

**Question 5.** A company wants to eliminate the burden of distributing SSH keys when connecting to EC2 and automatically keep all connection sessions as audit logs. At the same time, it wants to close port 22 in the security group completely. What is the most appropriate tool?

A) SSH access through a Bastion Host
B) AWS VPN + SSH key management
C) Session Manager (SSM) - IAM-based access, automatic session logging, no port 22 needed
D) EC2 Instance Connect

**Answer: C**
Explanation: Session Manager connects using IAM permissions and does not need port 22 at all. All session content is automatically stored in S3 or CloudWatch Logs. EC2 Instance Connect (D) pushes temporary SSH keys and requires port 22. Session Manager is an operational security best practice and is especially recommended in PCI-DSS and HIPAA environments. With the port forwarding feature, internal services such as RDS and Redis can also be accessed directly without SSH.

---

**Question 6.** Which statement about Default Host Management Configuration (DHMC) is correct?

A) It automatically installs the SSM Agent on all EC2 instances
B) It allows EC2 to register as an SSM Managed Instance even without an Instance Profile (IAM role)
C) It allows registering on-premises servers without Hybrid Activations
D) It automatically enables Session Manager logging

**Answer: B**
Explanation: When DHMC is enabled at the account level, AWS creates a service-linked role and applies it automatically to all EC2 instances. This removes the hassle of attaching an IAM role to each individual instance. However, Agent installation is separate, and network conditions are still required. DHMC fundamentally prevents Managed Instance registration failures caused by a missing Instance Profile.

---

**Question 7.** You want to strengthen security when storing Session Manager session logs in S3. What configuration is required?

A) Only configure S3 bucket Block Public Access
B) In the Session Manager preferences, set `s3EncryptionEnabled: true` + specify a KMS key + enable server-side encryption on the S3 bucket
C) Store logs only in CloudWatch Logs
D) Session logs cannot be encrypted

**Answer: B**
Explanation: For complete security of Session Manager session logs, all three are required: (1) `s3EncryptionEnabled: true` in the Session Manager settings, (2) a KMS CMK specified (`kmsKeyId`), and (3) SSE-KMS enabled on the S3 bucket itself. CloudWatch Logs must also be set with `cloudWatchEncryptionEnabled: true`. This way, all commands typed during the session and their output are stored encrypted. It satisfies the encryption of data at rest required by PCI-DSS 3.4 and the HIPAA Security Rule.

---
