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

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 SSM Managed Instances 목록에 나타나지 않는다. 인스턴스는 실행 중이며, Amazon Linux 2 최신 AMI를 사용한다. 가장 먼저 확인해야 할 항목은?

A) AMI에 SSM Agent가 포함되어 있는지 확인한다
B) Instance Profile에 `AmazonSSMManagedInstanceCore` 정책이 포함된 IAM Role이 부착되어 있는지 확인한다
C) 보안 그룹에 포트 22 인바운드가 허용되어 있는지 확인한다
D) 인스턴스가 퍼블릭 서브넷에 있는지 확인한다

**정답: B**
해설: Amazon Linux 2 최신 AMI에는 SSM Agent가 기본 설치되어 있으므로 A는 이미 충족됐을 가능성이 높다. SSM은 포트 22를 사용하지 않으므로 C는 관계없다. 퍼블릭/프라이빗 서브넷은 추가 조건(VPC Endpoint)에 영향을 주지만 가장 먼저 확인해야 할 것은 IAM Role 누락이다. Managed Instance가 안 되는 원인 1순위가 IAM 권한 누락이다. 확인 명령: `aws ec2 describe-iam-instance-profile-associations --filters "Name=instance-id,Values=i-xxx"`

---

**문제 2.** 회사가 완전한 사설 VPC(인터넷 게이트웨이 없음)에서 EC2 인스턴스를 SSM으로 관리하려 한다. IAM Role은 이미 올바르게 설정되어 있다. 추가로 필요한 것은?

A) NAT Gateway 생성
B) 인터넷 게이트웨이 추가
C) 세 개의 VPC Interface Endpoint 생성: ssm, ssmmessages, ec2messages
D) Bastion Host 설정

**정답: C**
해설: SSM Agent는 HTTPS(443)를 통해 SSM 서비스 엔드포인트에 연결한다. 인터넷이 없는 사설 VPC에서는 VPC Interface Endpoint로 AWS 내부 백본을 통해 통신한다. NAT Gateway는 인터넷 경유이고, Bastion은 SSH 기반으로 SSM의 목적과 무관하다. S3 Gateway Endpoint도 함께 생성하는 것이 표준(Document 다운로드, 결과 저장용). 각 Endpoint의 보안 그룹은 EC2 서브넷에서 443 인바운드를 허용해야 한다.

---

**문제 3.** 운영팀이 "현재 우리 인프라에서 Python 2.7이 설치된 EC2가 몇 대인가?"를 알고 싶다. 가장 적합한 도구와 방법은?

A) 각 EC2에 Run Command로 `python --version`을 실행한다
B) CloudTrail에서 Python 관련 이벤트를 검색한다
C) SSM Inventory를 활성화하고 `AWS:Application` 데이터에서 Python 2.7을 필터링한다
D) Config Rules를 통해 Python 버전을 확인한다

**정답: C**
해설: Inventory는 모든 Managed Instance의 설치된 소프트웨어를 주기적으로 수집한다. `AWS:Application` 유형에 이름과 버전이 포함된다. Resource Data Sync로 S3에 모으면 Athena SQL로 대규모 분석이 가능하다. Run Command(A)도 동작하지만 일회성이고 결과를 집계하기 어렵다. Inventory는 한 번 설정하면 모든 인스턴스의 소프트웨어 현황을 지속적으로 추적한다.

---

**문제 4.** 온프레미스 데이터센터에 서버 80대가 있고, 이 서버들에 SSM을 통해 Run Command와 Patch Manager를 적용하려 한다. 가장 적합한 접근 방법은?

A) SSM은 EC2만 지원하므로 불가능하다
B) 온프레미스 서버에 Direct Connect를 통해 VPN을 구성한다
C) Hybrid Activations를 생성하고 각 서버에 SSM Agent를 설치 후 Activation Code/ID로 등록한다
D) AWS Outposts를 데이터센터에 설치한다

**정답: C**
해설: Hybrid Activations는 정확히 이 목적을 위해 만들어진 기능이다. Activation 생성 후 서버에 Agent 설치 + 등록 과정을 거치면 `mi-xxxxxxxxx` 형식의 ID가 부여된다. 이후 EC2와 완전히 동일하게 Run Command, Patch Manager, Session Manager를 사용할 수 있다. 80대까지는 Standard Tier(무료) 범위 내이므로 추가 비용 없이 사용 가능하다.

---

**문제 5.** 회사가 EC2 접속 시 SSH 키 분배 부담을 없애고, 모든 접속 세션을 자동으로 감사 로그로 남기려 한다. 동시에 포트 22를 보안 그룹에서 완전히 닫고 싶다. 가장 적합한 도구는?

A) Bastion Host를 통한 SSH 접속
B) AWS VPN + SSH 키 관리
C) Session Manager (SSM) - IAM 기반 접속, 자동 세션 로깅, 포트 22 불필요
D) EC2 Instance Connect

**정답: C**
해설: Session Manager는 IAM 권한으로 접속하며 포트 22가 전혀 필요 없다. 모든 세션 내용이 S3 또는 CloudWatch Logs에 자동으로 저장된다. EC2 Instance Connect(D)는 일시적인 SSH 키를 푸시하는 방식으로 포트 22가 필요하다. Session Manager는 운영 보안 모범 사례로, PCI-DSS, HIPAA 환경에서 특히 권장된다. 포트 포워딩 기능으로 RDS, Redis 등 내부 서비스에도 SSH 없이 직접 접근 가능하다.

---

**문제 6.** Default Host Management Configuration(DHMC)에 대한 설명으로 옳은 것은?

A) 모든 EC2 인스턴스에 자동으로 SSM Agent를 설치한다
B) Instance Profile(IAM Role) 없이도 EC2가 SSM Managed Instance로 등록될 수 있게 한다
C) Hybrid Activations 없이 온프레미스 서버를 등록할 수 있다
D) Session Manager의 로깅을 자동으로 활성화한다

**정답: B**
해설: DHMC는 계정 레벨에서 활성화하면 AWS가 서비스 연결 역할을 생성해 모든 EC2에 자동 적용한다. 이로 인해 개별 인스턴스마다 IAM Role을 부착하는 번거로움이 사라진다. 단, Agent 설치는 별도이고 네트워크 조건도 여전히 필요하다. DHMC는 Instance Profile 부재로 인한 Managed Instance 등록 실패를 근본적으로 방지한다.

---

**문제 7.** Session Manager 세션 로그를 S3에 저장할 때 보안을 강화하려 한다. 어떤 구성이 필요한가?

A) S3 버킷 공개 접근 차단만 설정한다
B) Session Manager 기본 설정에서 `s3EncryptionEnabled: true` + KMS 키 지정 + S3 버킷 서버 측 암호화 활성화
C) CloudWatch Logs에만 저장한다
D) 세션 로그는 암호화할 수 없다

**정답: B**
해설: Session Manager 세션 로그의 완전한 보안을 위해서는 (1) Session Manager 설정에서 `s3EncryptionEnabled: true`, (2) KMS CMK 지정(`kmsKeyId`), (3) S3 버킷 자체에 SSE-KMS 활성화, 세 가지가 모두 필요하다. CloudWatch Logs에도 `cloudWatchEncryptionEnabled: true`로 설정해야 한다. 이렇게 하면 세션 중 타이핑한 모든 명령과 출력이 암호화되어 저장된다. PCI-DSS 3.4와 HIPAA Security Rule이 요구하는 저장 데이터 암호화를 충족한다.

---
