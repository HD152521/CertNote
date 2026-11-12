# Day 1 - AWS Outposts, Local Zones, Wavelength: Extending the Cloud at the Boundary

The centralized model of cloud computing is powerful, but it has one fundamental limitation: latency created by physical distance. It takes approximately 80ms for light to travel through fiber optics from Seoul to Virginia. This latency is a floor imposed by the laws of physics. For workloads requiring response times under 1ms—such as manufacturing line robot control, 5G autonomous driving, and real-time medical imaging analysis—the central cloud inherently hits its limits. Another constraint is regulation. In certain countries or industries, data must not physically leave a specific location. To address these two problems, AWS created three services: Outposts, Local Zones, and Wavelength. Understanding the design philosophy and technical implementation of each deeply unlocks 90% of SAP-C02 hybrid scenarios.

## AWS Outposts: Bringing AWS Infrastructure Inside Customer Buildings

Outposts is conceptually simple. AWS ships its own hardware (standard 42U racks equipped with Nitro-based servers or smaller 1U/2U servers) directly to a customer's data center and installs it. AWS services like EC2, EBS, S3 on Outposts, RDS, ECS, EKS, and EMR run on that hardware. Customers use the same API, CLI, and console as a regular AWS region.

> 💡 **Related Theory**: Outposts hardware is based on the AWS Nitro System. Nitro is a custom silicon architecture integrating hypervisor, networking, storage, and security that AWS has progressively disclosed since 2017. The Nitro Controller (a dedicated card) handles VM isolation, network processing, and EBS I/O completely separately from the host CPU. Thanks to this architecture, Outposts hardware in a customer's data center can deliver the same performance characteristics and security isolation as EC2 in an AWS region. Customers cannot directly access Nitro firmware or the hypervisor.

### Outposts Provisioning Process: How a Rack Comes Into Being

The shipping and installation of an Outposts rack goes through a more complex process than commonly known. When you order Outposts from the AWS console, AWS confirms hardware availability and coordinates shipping schedules. Before shipment, the customer must meet power requirements (standard Outposts Rack requires minimum 3-phase 208V, 15kVA or higher), cooling requirements (Outposts is based on air cooling, maximum 12.5kW per rack), and networking requirements (uplink for AWS Service Link and network ports for customer LAN).

After AWS field engineers install the rack and complete initial configuration, they establish a **Service Link** connection between Outposts and the connected AWS region. Service Link is an encrypted connection between Outposts and the AWS region it is associated with, through which all Outposts management and control operations are conducted.

> 📚 **Case Study**: In 2021, a major Korean hospital group adopted Outposts. Due to personal information protection law requirements for medical imaging (DICOM) data, storing patient images on servers outside the hospital building was legally restricted. An Outposts rack was installed in the hospital's server room, and EC2 and EBS were used to run AI imaging diagnostic models. Image data remained within the hospital building on Outposts, while model training occurred on a GPU cluster in an AWS region. Through Service Link, SageMaker in the region and inference instances on Outposts were integrated.

### Outposts Rack vs Outposts Servers

| Configuration | Size | Power | Target |
|------|------|------|------|
| Outposts Rack | Standard 42U rack | Minimum 15kVA | Large data centers, entire enterprise infrastructure |
| Outposts Servers | 1U or 2U | Standard power outlet | Retail locations, branch offices, clinics, small edge sites |

Outposts Servers were launched in 2022. They offer an option for small sites that cannot meet standard 42U rack space and power requirements. They are used in POS systems in small retail stores, diagnostic equipment in small hospitals, and edge computing nodes in factory lines.

### Local Gateway (LGW): Integrating Outposts with On-Premises LAN

EC2 instances on Outposts are placed in subnets of an AWS VPC. These subnets are created on Outposts hardware by specifying an AZ dependent on Outposts. The problem arises when these EC2 instances need to communicate directly with on-premises servers in the same building (such as manufacturing equipment controllers or legacy databases).

If traffic goes through the parent region's VPC, it must go through Service Link to the region and back, increasing latency. Local Gateway (LGW) is a local routing gateway that directly connects Outposts and the customer's on-premises network.

```
Outposts EC2 (10.0.100.10)
      │ Packet: destination 10.1.50.5 (on-premises manufacturing equipment)
      ▼
VPC Subnet Route Table:
  10.1.0.0/16 → Local Gateway (lgw-xxx)
      │
      ▼
Local Gateway ──── BGP ──── On-premises router ──── Manufacturing equipment (10.1.50.5)
                             (Latency: ~microseconds)
```

LGW communicates with the on-premises router using BGP or static routing. Because traffic does not pass through the AWS region, true LAN-level latency (sub-millisecond) is achieved.

> 🔍 **Deeper Dive**: Outposts' LGW advertises only IP prefixes allowed by VPC (Allowed Prefixes) to on-premises. These allowed prefixes must be explicitly configured in the Outposts management console. This is a security-by-design approach. If all VPC CIDRs were automatically advertised to on-premises, unintended routes could be created. By explicitly specifying Allowed Prefixes, administrators ensure only intended routes are exposed to on-premises.

### Service Link Connection Requirements

For Outposts to function normally, Service Link must remain connected at all times. Service Link is the control plane connection between Outposts and the connected AWS region. When this connection is disrupted:

- New EC2 instances cannot be launched
- AMI and EBS snapshot operations are impossible
- IAM authentication requests fail
- Existing running instances continue to operate, but management is restricted

> ⚠️ **Pitfall**: It is incorrect to think "Outposts operates independently even when disconnected." **AWS does not officially support Outposts Disconnected Mode**. When Service Link is disconnected, existing instances continue to run, but most management tasks—new resource creation, IAM authentication, snapshots—become impossible. This is the key difference between Outposts and competing services (e.g., Azure Stack Hub's supported Disconnected Mode).

## Local Zones: AWS Edge at the Metropolitan Level

Local Zone is AWS infrastructure deployed in a specific city, extending the parent region. Users enable Local Zone from the parent region's console, create subnets in that Local Zone AZ, and use it like any standard AZ.

```
AWS us-west-2 region (Oregon)
   ├── AZ us-west-2a (Oregon data center)
   ├── AZ us-west-2b (Oregon data center)
   └── Local Zone us-west-2-lax-1a (Los Angeles)
              ↑
              Once enabled, appears as an additional AZ in the console
              Connected to parent region via AWS private backbone
```

Using the Los Angeles Local Zone as an example, when LA users access Oregon region EC2, it takes approximately 20–30ms. When accessing the same LA Local Zone EC2, it takes less than 1ms. This difference determines user experience for latency-sensitive workloads like real-time video editing, gaming, and live streaming.

> 💡 **Related Theory**: Latency consists of two components. **Propagation Delay**: The time for a signal to physically travel. Speed of light × distance. **Processing Delay**: The time routers, switches, and servers take to process packets. Local Zone minimizes propagation delay by reducing physical distance. The LA Local Zone, located approximately 900km closer to LA users than the Oregon region, achieves approximately 6ms less propagation delay. Processing delay optimization is handled by EC2's Nitro architecture.

The services supported in Local Zones are more limited than the parent region. EC2, EBS, and ALB are core; some RDS and ElastiCache are also supported. Not all AWS services operate in Local Zones.

> 📚 **Case Study**: Electronic Arts (EA Games) deployed real-time game servers to the us-west-2-lax-1 Local Zone in 2022, reducing average ping for LA region players from 28ms to 8ms. In multiplayer shooters, this 20ms difference is perceptible to players and directly impacts reaction time. EA maintained game servers in the Local Zone while keeping player data and matchmaking services in the parent region, leveraging all parent region management capabilities.

## Wavelength: AWS Inside 5G Networks

Wavelength deploys AWS services at the 5G network edge of telecom operators, specifically near base station clusters. Data originating from 5G devices (smartphones, IoT sensors, autonomous vehicles) reaches AWS infrastructure in Wavelength Zones without traversing the 5G core network.

```
5G Device (autonomous vehicle)
    │ 5G wireless connection
    ▼
5G Base Station (gNB)
    │ Backhaul: 5G core bypass
    ▼
Wavelength Zone (telecom operator MEC facility)
    │ AWS EC2, ECS, EKS running
    ▼
Processing result → transmitted back to 5G device
```

Typically, data from a 5G device travels: base station → 5G core network (central data center hundreds of kilometers away) → internet → cloud. Wavelength shortens this path to: base station → telecom operator MEC facility's Wavelength Zone.

> 💡 **Related Theory**: MEC (Multi-access Edge Computing) is an edge computing architecture standardized by ETSI (European Telecommunications Standards Institute) since 2014. ETSI GS MEC 003 defines the reference architecture for MEC platforms. Wavelength is AWS's implementation integrating AWS services into telecom MEC infrastructure in compliance with this standard. Network slicing and UPF (User Plane Function) separation defined in 5G standards (3GPP Release 15 and later) made this technically possible.

> 🔍 **Deeper Dive**: Wavelength Zones involve co-locating AWS hardware with telecom partner data centers (Verizon, KDDI, SK Telecom, Deutsche Telekom, etc.). In the case of SK Telecom, Wavelength Zones are located in 5G MEC facilities in Seoul, Daejeon, and Busan. In an autonomous vehicle scenario, when vehicle LiDAR data is transmitted via 5G, it is processed by EC2 in Wavelength Zone through the nearest base station, and processing results (obstacle detection, route recalculation) are returned to the vehicle within 10ms.

## Deep Comparison of Three Services

| Item | Outposts | Local Zones | Wavelength |
|------|----------|-------------|------------|
| Physical Location | Customer data center/building | AWS-operated city facility | Telecom operator 5G MEC facility |
| Target Latency | Sub-millisecond (LAN level) | Sub-1ms (within city) | Within 10ms (5G link) |
| Data Sovereignty | Fully satisfied (inside customer building) | Partially satisfied (within city) | Partially satisfied (telecom facility) |
| Connection Requirement | Service Link (always on) | Parent region backbone | 5G network |
| Primary Use Cases | Regulation, data sovereignty, ultra-low-latency on-premises integration | Gaming, media, real-time ML inference | Autonomous driving, 5G IoT, AR/VR |
| Hardware Management | AWS (customer responsible for facility security) | Fully AWS | AWS + telecom operator |
| Cost Model | Rack/server lease + EC2 hourly | Standard EC2 rate + premium | Standard EC2 rate + premium |

## Comparison with GCP and Azure

| Item | AWS Outposts | GCP Distributed Cloud | Azure Stack Hub |
|------|-------------|----------------------|-----------------|
| Hardware Ownership | AWS | Google | Azure |
| Disconnected Mode | Not supported | Supported in edge version | Supported |
| Management Console | Same AWS console | GCP console | Azure Portal |
| Minimum Scale | 1U server | Edge appliance | 4+ nodes |
| 5G Integration | Wavelength (separate) | Telecom Infra | Partner solution |
| Service Scope | Limited (EC2/EBS/RDS, etc.) | Limited | Limited |

> 📚 **Case Study**: GE Aerospace implemented AWS Outposts in a system for real-time analysis of aircraft engine data. Engine sensor data is collected from the factory LAN, and a real-time anomaly detection model (latency-sensitive) runs on Outposts. When an anomaly is detected, a signal to stop the line is immediately transmitted to the factory control system through Local Gateway. Aggregated data and model retraining occur in the AWS region cloud. When comparing with Azure Stack Hub, the key reason GE Aerospace chose Outposts was API compatibility with existing AWS services.

## Scenario-Based Selection Guide

**Choose Outposts when:**
- "Data cannot legally leave the building/facility"
- "We need to use AWS services while maintaining LAN-level latency communication with on-premises equipment"
- "Regulations prohibit using multi-tenant public cloud"

**Choose Local Zones when:**
- "Sub-1ms latency is required for users in a specific city"
- "We want to use AWS services while deploying them geographically closer"
- "The purpose is real-time media, gaming, or ML inference"

**Choose Wavelength when:**
- "5G devices (mobile, IoT, autonomous vehicles) are the clients"
- "Ultra-low-latency processing over 5G network is required"
- "Use cases are autonomous driving, AR/VR, or industrial 5G IoT"

> 🎯 **Scenario**: A South Korean smart port company remotely controls cranes at Busan Port via 5G. Crane sensor data (cameras, LiDAR) is transmitted over 5G, and operators control them remotely via screen. If control command latency exceeds 20ms, accident risk increases. If a Wavelength Zone exists in a telecom operator's 5G MEC facility near Busan Port, 5G data can be processed without the core network, enabling a response within 10ms. Conversely, if crane control software must run on a server in the port's server room itself, an Outposts Rack is appropriate.

## Hands-On CLI: Configuring Outposts and Local Zones

```bash
# List available Outposts
aws outposts list-outposts

# Create a subnet on Outposts
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.100.0/24 \
  --outpost-arn arn:aws:outposts:ap-northeast-2:ACCT:outpost/op-xxx

# Create Local Gateway Route Table
aws ec2 create-local-gateway-route-table \
  --local-gateway-id lgw-xxx \
  --mode direct-vpc-routing

# Add Local Gateway Route (on-premises CIDR → LGW)
aws ec2 create-local-gateway-route \
  --destination-cidr-block 10.1.0.0/16 \
  --local-gateway-route-table-id lgwrtb-xxx \
  --local-gateway-virtual-interface-group-id lgw-vif-grp-xxx

# Enable Local Zone
aws ec2 modify-availability-zone-group \
  --group-name us-west-2-lax-1 \
  --opt-in-status opted-in

# Create subnet in Local Zone
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.99.0/24 \
  --availability-zone us-west-2-lax-1a

# Enable Wavelength Zone
aws ec2 modify-availability-zone-group \
  --group-name us-east-1-wl1 \
  --opt-in-status opted-in
```

Outposts, Local Zones, and Wavelength are different answers to the question "Where should AWS be located?" Outposts is inside a customer building, Local Zones are in major cities, Wavelength is next to 5G base stations. Mapping these three locations to the problems each solves (data sovereignty, city-level latency, 5G-level latency) immediately unlocks SAP-C02 hybrid scenario problems.

---

## 📝 Practice Questions

**Question 1.** Under Korean Financial Supervisory Service regulations, customer transaction data must not leave the financial firm's Seoul headquarters building. At the same time, inference for an ML-based fraud detection model (trained on AWS SageMaker) must run in real time. What is an appropriate configuration?

A) AWS Lambda (Seoul Region)
B) AWS Outposts (Seoul headquarters server room) + deploy the SageMaker inference endpoint on Outposts
C) Local Zones (Seoul expansion)
D) Wavelength (SK Telecom 5G MEC)

**Answer: B**
Explanation: "Data cannot leave the building" is the key constraint. Outposts is AWS hardware inside the customer's building, so data physically stays in the building. If SageMaker inference is deployed on Outposts, the data does not leave. Local Zones (C) are separate facilities operated by AWS, so they do not meet the data sovereignty requirement. Wavelength (D) is a telecom carrier facility. Lambda (A) runs in an AWS Region, so data is sent to servers in the Seoul Region.

---

**Question 2.** You operate a real-time stock trading analytics system in New York. When traders in the New York office access us-east-1 EC2, there is about 15 ms of latency. This must be reduced to under 1 ms. What is the most appropriate method?

A) AWS Outposts (New York office)
B) CloudFront (New York edge)
C) Enable AWS Local Zones (us-east-1-nyc-1a) + deploy EC2 in the New York Local Zone
D) AWS Wavelength (Verizon New York)

**Answer: C**
Explanation: The AWS Local Zone in New York (us-east-1-nyc-1a) places AWS infrastructure in a data center in downtown New York and provides under 1 ms latency. Because there is no data sovereignty requirement, Outposts (A) is excessive in cost and complexity. CloudFront (B) is for static content and HTTP caching and is unsuitable for compute workloads. Wavelength (D) is for 5G mobile devices and is unnecessary complexity in a wired office network environment.

---

**Question 3.** A startup with autonomous delivery robots processes delivery route optimization and obstacle avoidance algorithms in the cloud. The robots are connected over a 5G network, and the response time for route recalculation must not exceed 15 ms. The cities where the robots operate have SK Telecom 5G infrastructure. What is the most appropriate service?

A) AWS Outposts
B) Local Zones
C) AWS Wavelength (SK Telecom)
D) Global Accelerator + EC2 in the Seoul Region

**Answer: C**
Explanation: Ultra-low-latency processing for 5G-connected devices is precisely the use case for Wavelength. Wavelength places AWS EC2 in SK Telecom's 5G MEC facilities so that data over the 5G link is processed directly in the Wavelength Zone without passing through the 5G core. A response within 15 ms is possible. Outposts (A) places AWS in a customer facility and is unsuitable for 5G integration with moving robots. Local Zones (B) are AWS facilities within a city but have no 5G core bypass capability. Global Accelerator + EC2 in Seoul (D) uses the full path through the 5G core and has difficulty meeting the 15 ms requirement.

---

**Question 4.** What happens when the Service Link of AWS Outposts is disconnected for an extended period?

A) Outposts retains all functionality completely independently
B) Existing running instances continue to operate, but management operations such as launching new instances, IAM authentication, and creating snapshots become impossible
C) All instances terminate immediately
D) Outposts automatically switches to local mode and operates fully

**Answer: B**
Explanation: AWS Outposts does not officially support Disconnected Mode. When the Service Link is disconnected, control plane functions stop. EC2 instances that were already started continue to run at the data plane level (the hypervisor keeps running locally), but launching new instances, IAM authentication (the AWS IAM service cannot be reached), EBS snapshots, and sending CloudWatch metrics become impossible. This is why high availability of the Service Link matters in Outposts design. Configuring redundancy for the Service Link with DX or VPN is recommended.

---

**Question 5.** A manufacturer uses AWS for factory automation. EC2 on an Outposts Rack in the factory must communicate with PLCs (programmable logic controllers) on the factory LAN (10.1.0.0/16) at sub-millisecond latency. What is the most appropriate configuration?

A) Outposts EC2 → Service Link → AWS Region → VPN → PLC (on premises)
B) Outposts EC2 → Local Gateway (LGW) → factory router → PLC
C) Outposts EC2 → internet → PLC
D) Outposts EC2 → Direct Connect → PLC

**Answer: B**
Explanation: The Local Gateway (LGW) provides a local routing path that directly connects Outposts to the on-premises network. Traffic does not pass through the AWS Region, so LAN-level sub-millisecond latency is achieved. A takes a Service Link → AWS Region → VPN path, so round-trip latency becomes tens of milliseconds or more. C goes over the internet, which is unsuitable for both latency and security. D requires a physical connection to a DX Location for Direct Connect and is not direct communication with the factory LAN.

---

**Question 6.** A gaming company operates real-time game servers for a global multiplayer game. It wants to provide under 1 ms latency to players in each city (LA, New York, Tokyo, Seoul). It must keep using the management infrastructure (matchmaking, player database) in the parent Regions (us-west-2, ap-northeast-1) as is. What is the most appropriate architecture?

A) Install an Outposts rack in each city
B) Deploy game server EC2 instances in AWS Local Zones in each city + keep the matchmaking service in the parent Regions
C) CloudFront + Lambda@Edge
D) Deploy game servers in a Wavelength Zone

**Answer: B**
Explanation: Local Zones are AWS infrastructure placed in major cities that provide under 1 ms latency and integrate with all management services of the parent Region. Handling matchmaking, DB, and authentication in the parent Region and deploying only the game servers to the Local Zone is cost-efficient. Outposts (A) places AWS hardware in customer facilities, requiring installation in each city, so operational complexity is very high. CloudFront + Lambda@Edge (C) suits HTTP-based static content and simple logic and is unsuitable for stateful game servers. Wavelength (D) suits cases where the clients are 5G mobile devices and is excessive for players on ordinary internet connections.
