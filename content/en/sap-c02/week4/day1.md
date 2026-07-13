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

## 📝 연습 문제

**문제 1.** 한국 금융감독원 규제로 고객 거래 데이터가 금융사 서울 본사 건물 밖으로 반출되면 안 된다. 동시에 ML 기반 사기 탐지 모델(AWS SageMaker 학습)의 추론을 실시간으로 실행해야 한다. 적합한 구성은?

A) AWS Lambda (서울 리전)
B) AWS Outposts (서울 본사 서버실) + SageMaker 추론 엔드포인트 Outposts에 배포
C) Local Zones (서울 확장)
D) Wavelength (SK Telecom 5G MEC)

**정답: B**
해설: "데이터가 건물 밖으로 나갈 수 없다"가 핵심 제약이다. Outposts는 고객 건물 내 AWS 하드웨어로, 데이터가 물리적으로 건물 안에 유지된다. SageMaker 추론을 Outposts에 배포하면 데이터가 외부로 나가지 않는다. Local Zones(C)는 AWS가 운영하는 별도 시설이므로 데이터 주권 요건을 충족하지 않는다. Wavelength(D)는 통신사 시설이다. Lambda(A)는 AWS 리전에서 실행되므로 데이터가 서울 리전 서버로 전송된다.

---

**문제 2.** 뉴욕에서 실시간 주식 거래 분석 시스템을 운영한다. 트레이더가 뉴욕 사무실에서 us-east-1 EC2에 접근하면 약 15ms 지연이 발생한다. 이를 1ms 미만으로 줄여야 한다. 가장 적합한 방법은?

A) AWS Outposts (뉴욕 사무실)
B) CloudFront (뉴욕 엣지)
C) AWS Local Zones (us-east-1-nyc-1a) 활성화 + 뉴욕 Local Zone에 EC2 배포
D) AWS Wavelength (Verizon 뉴욕)

**정답: C**
해설: 뉴욕의 AWS Local Zone(us-east-1-nyc-1a)은 뉴욕 도심 데이터센터에 AWS 인프라를 배치해 1ms 미만 지연을 제공한다. 데이터 주권 요건이 없으므로 Outposts(A)는 비용과 복잡성이 과하다. CloudFront(B)는 정적 콘텐츠와 HTTP 캐싱이며 컴퓨팅 작업에는 부적합하다. Wavelength(D)는 5G 모바일 디바이스용이며 사무실 유선 네트워크 환경에서는 불필요한 복잡성이다.

---

**문제 3.** 자율주행 배달 로봇 스타트업이 배달 경로 최적화와 장애물 회피 알고리즘을 클라우드에서 처리한다. 로봇이 5G 네트워크로 연결되어 있으며, 경로 재계산의 응답 시간이 15ms를 초과하면 안 된다. 로봇이 운행하는 도시에 SK Telecom 5G 인프라가 있다. 가장 적합한 서비스는?

A) AWS Outposts
B) Local Zones
C) AWS Wavelength (SK Telecom)
D) Global Accelerator + 서울 리전 EC2

**정답: C**
해설: 5G 연결 디바이스의 초저지연 처리는 Wavelength의 정확한 사용 사례다. Wavelength는 SK Telecom 5G MEC 시설에 AWS EC2를 배치해 5G 링크를 통한 데이터가 5G 코어를 거치지 않고 바로 Wavelength Zone에서 처리된다. 15ms 이내 응답이 가능하다. Outposts(A)는 고객 시설에 AWS를 배치하는 것으로 이동하는 로봇과의 5G 통합에 부적합하다. Local Zones(B)는 도시 내 AWS 시설이지만 5G 코어 우회 기능이 없다. Global Accelerator + 서울 EC2(D)는 5G 코어를 통한 전체 경로를 사용해 15ms 요건을 충족하기 어렵다.

---

**문제 4.** AWS Outposts의 Service Link가 장시간 끊어진 경우 어떤 일이 발생하는가?

A) Outposts가 완전히 독립적으로 모든 기능을 유지한다
B) 기존 실행 중인 인스턴스는 계속 동작하지만 새 인스턴스 시작, IAM 인증, 스냅샷 생성 등 관리 작업이 불가능해진다
C) 모든 인스턴스가 즉시 종료된다
D) Outposts가 자동으로 로컬 모드로 전환되어 완전히 동작한다

**정답: B**
해설: AWS Outposts는 Disconnected Mode를 공식 지원하지 않는다. Service Link가 끊어지면 제어 플레인 기능이 중단된다. 기존에 시작된 EC2 인스턴스는 데이터 플레인 수준에서 계속 실행되지만(하이퍼바이저가 로컬에서 계속 동작), 새 인스턴스 시작, IAM 인증(AWS IAM 서비스에 도달 불가), EBS 스냅샷, CloudWatch 메트릭 전송 등이 불가능해진다. 이것이 Outposts 설계에서 Service Link의 고가용성이 중요한 이유다. DX 또는 VPN으로 Service Link의 이중화를 구성하는 것이 권장된다.

---

**문제 5.** 제조업체가 공장 자동화에 AWS를 활용한다. 공장 내 Outposts Rack의 EC2가 공장 LAN(10.1.0.0/16)의 PLC(프로그래머블 로직 컨트롤러)와 서브밀리초 수준으로 통신해야 한다. 가장 적합한 구성은?

A) Outposts EC2 → Service Link → AWS 리전 → VPN → PLC (온프레미스)
B) Outposts EC2 → Local Gateway (LGW) → 공장 라우터 → PLC
C) Outposts EC2 → 인터넷 → PLC
D) Outposts EC2 → Direct Connect → PLC

**정답: B**
해설: Local Gateway(LGW)는 Outposts와 온프레미스 네트워크를 직접 연결하는 로컬 라우팅 경로를 제공한다. 트래픽이 AWS 리전을 거치지 않아 LAN 수준의 서브밀리초 지연이 달성된다. A는 Service Link → AWS 리전 → VPN 경로로 왕복 지연이 수십 밀리초 이상이 된다. C는 인터넷 경유로 지연과 보안 모두 부적합하다. D는 Direct Connect가 DX Location까지의 물리 연결이 필요하고 공장 LAN 직접 통신이 아니다.

---

**문제 6.** 게임 회사가 글로벌 멀티플레이어 게임의 실시간 게임 서버를 운영한다. 각 도시(LA, 뉴욕, 도쿄, 서울)의 플레이어에게 1ms 미만 지연을 제공하고 싶다. 부모 리전(us-west-2, ap-northeast-1)의 관리 인프라(매치메이킹, 플레이어 데이터베이스)는 그대로 활용해야 한다. 가장 적합한 아키텍처는?

A) 각 도시에 Outposts 랙 설치
B) 각 도시의 AWS Local Zones에 게임 서버 EC2 배포 + 부모 리전에 매치메이킹 서비스 유지
C) CloudFront + Lambda@Edge
D) Wavelength Zone에 게임 서버 배포

**정답: B**
해설: Local Zones는 대도시에 배치된 AWS 인프라로 1ms 미만 지연을 제공하고 부모 리전의 모든 관리 서비스와 통합된다. 매치메이킹, DB, 인증은 부모 리전에서 처리하고 게임 서버만 Local Zone에 배포하면 비용 효율적이다. Outposts(A)는 고객 시설에 AWS 하드웨어를 배치하는 것으로 도시별 설치가 필요해 운영 복잡성이 매우 높다. CloudFront + Lambda@Edge(C)는 HTTP 기반 정적 콘텐츠와 간단한 로직에 적합하며, 상태 저장 게임 서버에는 부적합하다. Wavelength(D)는 5G 모바일 디바이스가 클라이언트일 때 적합하며, 일반 인터넷 연결 플레이어에게는 과한 구성이다.
