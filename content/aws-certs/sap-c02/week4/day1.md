# Day 1 - AWS Outposts, Local Zones, Wavelength: 클라우드 경계의 확장

클라우드 컴퓨팅의 중앙집중화 모델은 강력하지만 한 가지 근본적 한계를 가진다. 물리적 거리가 만드는 지연이다. 빛이 광섬유를 통해 서울에서 버지니아까지 이동하는 데 약 80ms가 걸린다. 이 지연은 물리 법칙이 부과하는 하한선이다. 제조 라인 로봇 제어, 5G 자율주행, 실시간 의료 영상 분석처럼 1ms 이하의 응답이 필요한 워크로드에서 중앙 클라우드는 구조적으로 한계에 부딪힌다. 또 다른 제약은 규제다. 특정 국가나 산업에서 데이터가 물리적으로 특정 장소를 벗어나면 안 된다. AWS가 이 두 문제에 답하기 위해 만든 세 가지 서비스가 Outposts, Local Zones, Wavelength다. 각각의 설계 철학과 기술적 구현을 깊이 이해하면 SAP-C02 하이브리드 시나리오의 90%가 풀린다.

## AWS Outposts: AWS 인프라를 고객 건물 안으로

Outposts는 개념적으로 단순하다. AWS가 자신의 하드웨어(Nitro 기반 서버가 탑재된 표준 42U 랙 또는 소형 1U/2U 서버)를 고객 데이터센터에 직접 배송하고 설치한다. 그 하드웨어 위에서 EC2, EBS, S3 on Outposts, RDS, ECS, EKS, EMR 같은 AWS 서비스가 실행된다. 고객은 일반 AWS 리전과 동일한 API, CLI, 콘솔을 사용한다.

> 💡 **관련 이론**: Outposts의 하드웨어는 AWS Nitro System을 기반으로 한다. Nitro는 AWS가 2017년부터 단계적으로 공개한 하이퍼바이저 + 네트워킹 + 스토리지 + 보안을 통합한 커스텀 실리콘 아키텍처다. Nitro Controller(전용 카드)가 VM 격리, 네트워크 처리, EBS I/O를 호스트 CPU와 완전히 분리해 처리한다. 이 아키텍처 덕분에 Outposts 하드웨어가 고객 데이터센터에 있어도 AWS 리전의 EC2와 동일한 성능 특성과 보안 격리를 제공할 수 있다. 고객은 Nitro 펌웨어나 하이퍼바이저에 직접 접근할 수 없다.

### Outposts 프로비저닝 과정: 랙 하나가 생기기까지

Outposts 랙의 배송과 설치는 알려진 것보다 복잡한 과정을 거친다. AWS 콘솔에서 Outposts를 주문하면 AWS가 하드웨어 가용성을 확인하고 배송 일정을 조율한다. 배송 전에 고객은 전력(표준 Outposts Rack은 최소 3상 208V, 15kVA 이상), 냉각(Outposts는 공기 냉각 기준 랙당 최대 12.5kW), 네트워크(AWS Service Link용 업링크와 고객 LAN용 네트워크 포트) 요구사항을 충족해야 한다.

AWS 현장 기술자가 랙을 설치하고 초기 구성을 마친 후, AWS 리전의 관리 플레인과 **Service Link** 연결을 수립한다. Service Link는 Outposts와 연결된 AWS 리전 간의 암호화된 연결로, Outposts의 관리·제어 작업이 모두 이 링크를 통해 이루어진다.

> 📚 **사례**: 2021년 한 대형 한국 병원 그룹이 Outposts를 도입했다. 의료영상(DICOM) 데이터의 개인정보보호법 요건으로 환자 영상이 병원 건물 외부 서버에 저장되는 것이 법적으로 제한됐다. Outposts 랙을 병원 서버실에 설치하고 EC2와 EBS를 사용해 AI 영상 진단 모델을 운행했다. 영상 데이터는 병원 건물 내 Outposts에 있고, 모델 학습은 AWS 리전 GPU 클러스터에서 이루어졌다. Service Link를 통해 리전의 SageMaker와 Outposts의 추론 인스턴스가 통합됐다.

### Outposts Rack vs Outposts Servers

| 구성 | 크기 | 전력 | 대상 |
|------|------|------|------|
| Outposts Rack | 표준 42U 랙 | 최소 15kVA | 대형 데이터센터, 전체 기업 인프라 |
| Outposts Servers | 1U 또는 2U | 일반 전기콘센트 | 소매점, 지점, 의원, 소형 엣지 사이트 |

Outposts Servers는 2022년 출시됐다. 표준 42U 랙 공간과 전력 요건을 충족하기 어려운 소규모 사이트를 위한 옵션이다. 소규모 매장의 POS 시스템, 소형 병원의 진단 장비, 공장 라인의 엣지 컴퓨팅 노드로 활용된다.

### Local Gateway(LGW): Outposts와 온프레미스 LAN의 통합

Outposts의 EC2 인스턴스는 AWS VPC의 서브넷에 배치된다. 이 서브넷은 Outposts에 종속된 AZ를 지정해 Outposts 하드웨어 위에 생성된다. 문제는 이 EC2 인스턴스가 같은 건물의 온프레미스 서버(제조 장비 컨트롤러, 기존 데이터베이스)와 직접 통신해야 할 때다.

AWS 리전 VPC를 경유하면 Service Link를 통해 리전까지 갔다 돌아와야 하므로 지연이 증가한다. Local Gateway(LGW)는 Outposts와 고객 온프레미스 네트워크를 직접 연결하는 로컬 라우팅 게이트웨이다.

```
Outposts EC2 (10.0.100.10)
      │ 패킷: 목적지 10.1.50.5 (온프레미스 제조 장비)
      ▼
VPC Subnet 라우트 테이블:
  10.1.0.0/16 → Local Gateway (lgw-xxx)
      │
      ▼
Local Gateway ──── BGP ──── 온프레미스 라우터 ──── 제조 장비 (10.1.50.5)
                             (지연: ~마이크로초)
```

LGW는 BGP 또는 정적 라우팅으로 온프레미스 라우터와 통신한다. 트래픽이 AWS 리전을 거치지 않으므로 실질적인 LAN 수준 지연(서브밀리초)이 달성된다.

> 🔍 **더 깊이**: Outposts의 LGW는 VPC에서 허용된 IP 프리픽스(Allowed Prefixes)만 온프레미스로 광고한다. 이 허용 프리픽스는 Outposts 관리 콘솔에서 명시적으로 설정해야 한다. 이는 보안을 위한 설계다. VPC의 모든 CIDR이 온프레미스에 자동으로 광고되면 의도치 않은 경로가 생길 수 있다. Allowed Prefixes를 명시함으로써 관리자가 의도한 경로만 온프레미스에 노출된다.

### Service Link의 연결 요구사항

Outposts가 정상 동작하려면 Service Link가 항상 연결되어 있어야 한다. Service Link는 Outposts와 연결된 AWS 리전 간의 제어 플레인 연결이다. 이 연결이 끊어지면:

- 새 EC2 인스턴스를 시작할 수 없다
- AMI, EBS 스냅샷 작업이 불가능하다
- IAM 인증 요청이 실패한다
- 기존에 실행 중인 인스턴스는 계속 동작하지만 관리가 제한된다

> ⚠️ **함정**: "Outposts는 연결이 끊어져도 독립적으로 동작한다"고 생각하면 틀린다. AWS는 Outposts의 **Disconnected Mode를 공식 지원하지 않는다**. Service Link가 끊어진 상태에서 기존 인스턴스는 계속 실행되지만 새 리소스 생성, IAM 인증, 스냅샷 등 대부분의 관리 작업이 불가능하다. 이 점이 Outposts와 경쟁사의 유사 서비스(예: Azure Stack Hub의 Disconnected Mode 지원)와의 차이점이다.

## Local Zones: 대도시 수준의 AWS 에지

Local Zone은 특정 도시에 배치된 AWS 인프라로, 부모 리전의 확장이다. 사용자는 부모 리전의 콘솔에서 Local Zone을 활성화하고 해당 Local Zone AZ에 서브넷을 생성해 일반 AZ처럼 사용한다.

```
AWS us-west-2 리전 (오리건)
   ├── AZ us-west-2a (오리건 데이터센터)
   ├── AZ us-west-2b (오리건 데이터센터)
   └── Local Zone us-west-2-lax-1a (로스앤젤레스)
              ↑
              활성화하면 콘솔에서 추가 AZ처럼 보임
              부모 리전과 AWS 전용 백본으로 연결
```

로스앤젤레스 Local Zone을 예로 들면, LA 사용자가 오리건 리전 EC2에 접근할 때 약 20~30ms가 걸린다. 같은 LA Local Zone EC2에 접근하면 1ms 미만이다. 이 차이가 실시간 비디오 편집, 게임, 라이브 스트리밍 같은 지연 민감 워크로드에서 사용자 경험을 결정한다.

> 💡 **관련 이론**: 지연시간은 두 가지 요소로 구성된다. **전파 지연(Propagation Delay)**: 신호가 물리적으로 이동하는 시간. 빛의 속도 × 거리. **처리 지연(Processing Delay)**: 라우터, 스위치, 서버가 패킷을 처리하는 시간. Local Zone은 물리적 거리를 줄여 전파 지연을 최소화한다. LA Local Zone은 오리건 리전 대비 약 900km 가까이 LA 사용자에게 위치해 약 6ms의 전파 지연 감소 효과가 있다. 처리 지연 최적화는 EC2의 Nitro 아키텍처가 담당한다.

Local Zone에서 지원되는 서비스는 부모 리전보다 제한적이다. EC2, EBS, ALB가 핵심이고 일부 RDS, ElastiCache도 지원된다. 모든 AWS 서비스가 Local Zone에서 동작하지는 않는다.

> 📚 **사례**: Electronic Arts(EA Games)는 2022년 us-west-2-lax-1 Local Zone에 실시간 게임 서버를 배포해 LA 지역 플레이어의 핑을 평균 28ms에서 8ms로 낮췄다. 멀티플레이어 슈팅 게임에서 이 20ms 차이는 플레이어가 체감할 수 있는 수준으로, 반응 속도에 직결된다. EA는 게임 서버를 Local Zone에, 플레이어 데이터와 매치메이킹 서비스는 부모 리전에 유지해 리전의 모든 관리 기능을 그대로 활용했다.

## Wavelength: 5G 네트워크 안의 AWS

Wavelength는 AWS 서비스를 통신사의 5G 네트워크 에지, 즉 기지국 클러스터 가까이에 배치한다. 5G 디바이스(스마트폰, IoT 센서, 자율주행 차량)에서 발생한 데이터가 5G 코어 네트워크를 거치지 않고 직접 Wavelength Zone의 AWS 인프라에 도달한다.

```
5G 디바이스 (자율주행 차량)
    │ 5G 무선 연결
    ▼
5G 기지국 (gNB)
    │ 백홀: 5G 코어 우회
    ▼
Wavelength Zone (통신사 MEC 시설)
    │ AWS EC2, ECS, EKS 실행
    ▼
처리 결과 → 다시 5G 디바이스로 전달
```

일반적으로 5G 디바이스의 데이터는 기지국 → 5G 코어 네트워크(수백 킬로미터 거리의 중앙 데이터센터) → 인터넷 → 클라우드 순으로 이동한다. Wavelength는 이 경로를 기지국 → 통신사 MEC 시설의 Wavelength Zone으로 단축한다.

> 💡 **관련 이론**: MEC(Multi-access Edge Computing)는 ETSI(European Telecommunications Standards Institute)가 2014년부터 표준화한 엣지 컴퓨팅 아키텍처다. ETSI GS MEC 003 표준이 MEC 플랫폼의 참조 아키텍처를 정의한다. Wavelength는 AWS가 이 표준에 맞춰 통신사 MEC 인프라에 AWS 서비스를 통합한 구현체다. 5G 표준(3GPP Release 15 이후)에서 정의한 네트워크 슬라이싱과 UPF(User Plane Function) 분리가 기술적으로 가능하게 한 배경이다.

> 🔍 **더 깊이**: Wavelength Zone은 통신사 파트너(Verizon, KDDI, SK Telecom, Deutsche Telekom 등)의 데이터센터에 AWS 하드웨어를 함께 배치(Co-location)한 형태다. SK Telecom의 경우 서울, 대전, 부산의 5G MEC 시설에 Wavelength Zone이 있다. 자율주행 차량 시나리오에서 차량의 라이다 데이터가 5G로 전송되면 가장 가까운 기지국을 통해 Wavelength Zone의 EC2에서 처리되고, 처리 결과(장애물 감지, 경로 재계산)가 10ms 이내에 차량으로 반환된다.

## 세 서비스 심층 비교

| 항목 | Outposts | Local Zones | Wavelength |
|------|----------|-------------|------------|
| 물리적 위치 | 고객 데이터센터/빌딩 | AWS가 운영하는 도시 시설 | 통신사 5G MEC 시설 |
| 목표 지연 | 서브밀리초(LAN 수준) | 1ms 미만 (도시 내) | 10ms 이내 (5G 링크) |
| 데이터 주권 | 완전 충족(고객 건물 내) | 부분 충족(도시 내) | 부분 충족(통신사 시설) |
| 연결 요구사항 | Service Link(항상 on) | 부모 리전 백본 | 5G 네트워크 |
| 주요 사용 사례 | 규제·데이터 주권·초저지연 온프레미스 통합 | 게임·미디어·실시간 ML 추론 | 자율주행·5G IoT·AR/VR |
| 하드웨어 관리 | AWS (고객 시설 보안은 고객) | 완전 AWS | AWS + 통신사 |
| 비용 모델 | 랙/서버 임대료 + EC2 시간당 | 일반 EC2 요금 + 추가 | 일반 EC2 요금 + 추가 |

## GCP, Azure와의 비교

| 항목 | AWS Outposts | GCP Distributed Cloud | Azure Stack Hub |
|------|-------------|----------------------|-----------------|
| 하드웨어 소유 | AWS | Google | Azure |
| Disconnected Mode | 미지원 | 에지 버전 지원 | 지원 |
| 관리 콘솔 | AWS 콘솔 동일 | GCP 콘솔 | Azure Portal |
| 최소 규모 | 1U 서버 | 엣지 어플라이언스 | 4노드 이상 |
| 5G 통합 | Wavelength (별도) | Telecom Infra | 파트너 솔루션 |
| 서비스 범위 | 제한적(EC2/EBS/RDS 등) | 제한적 | 제한적 |

> 📚 **사례**: 제조업체 GE Aerospace는 항공기 엔진 데이터를 실시간 분석하는 시스템에 AWS Outposts를 도입했다. 엔진 센서 데이터는 공장 LAN에서 수집되고, 지연에 민감한 실시간 이상 탐지 모델이 Outposts에서 실행된다. 이상이 감지되면 즉시 라인을 멈추는 신호가 로컬 게이트웨이를 통해 공장 제어 시스템으로 전달된다. 집계 데이터와 모델 재학습은 AWS 리전 클라우드에서 이루어진다. Azure Stack Hub와 비교 검토 시 GE Aerospace가 Outposts를 선택한 주요 이유는 기존 AWS 서비스와의 API 호환성이었다.

## 시나리오별 선택 가이드

**Outposts를 선택하는 경우:**
- "데이터가 법적으로 특정 건물/시설 밖으로 나갈 수 없다"
- "AWS 서비스를 사용하면서 온프레미스 장비와 LAN 수준 지연으로 통신해야 한다"
- "규제로 인해 멀티테넌트 퍼블릭 클라우드 사용이 금지되어 있다"

**Local Zones를 선택하는 경우:**
- "특정 도시의 사용자에게 1ms 미만의 지연이 필요하다"
- "AWS 서비스를 그대로 쓰면서 지역적으로 가깝게 배치하고 싶다"
- "실시간 미디어, 게임, ML 추론이 목적이다"

**Wavelength를 선택하는 경우:**
- "5G 디바이스(모바일, IoT, 자율주행)가 클라이언트다"
- "5G 네트워크를 통한 초저지연 처리가 필요하다"
- "자율주행, AR/VR, 산업용 5G IoT가 사용 사례다"

> 🎯 **시나리오**: 한국의 스마트 항만 회사가 부산항 크레인을 5G로 원격 제어한다. 크레인 센서 데이터(카메라, LiDAR)가 5G로 전송되고 운영자가 화면으로 원격 조작한다. 제어 명령의 지연이 20ms를 초과하면 사고 위험이 있다. 부산항 인근 통신사 5G MEC에 Wavelength Zone이 있다면 5G 데이터가 코어 네트워크 없이 바로 처리되어 10ms 이내 응답이 가능하다. 만약 5G가 아닌 크레인 제어 소프트웨어 자체가 항만 내 서버실에서 실행되어야 한다면 Outposts Rack이 적합하다.

## 실전 CLI: Outposts와 Local Zone 구성

```bash
# 사용 가능한 Outposts 조회
aws outposts list-outposts

# Outposts에 서브넷 생성
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.100.0/24 \
  --outpost-arn arn:aws:outposts:ap-northeast-2:ACCT:outpost/op-xxx

# Local Gateway Route Table 생성
aws ec2 create-local-gateway-route-table \
  --local-gateway-id lgw-xxx \
  --mode direct-vpc-routing

# Local Gateway Route 추가 (온프레미스 CIDR → LGW)
aws ec2 create-local-gateway-route \
  --destination-cidr-block 10.1.0.0/16 \
  --local-gateway-route-table-id lgwrtb-xxx \
  --local-gateway-virtual-interface-group-id lgw-vif-grp-xxx

# Local Zone 활성화
aws ec2 modify-availability-zone-group \
  --group-name us-west-2-lax-1 \
  --opt-in-status opted-in

# Local Zone에 서브넷 생성
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.99.0/24 \
  --availability-zone us-west-2-lax-1a

# Wavelength Zone 활성화
aws ec2 modify-availability-zone-group \
  --group-name us-east-1-wl1 \
  --opt-in-status opted-in
```

Outposts, Local Zones, Wavelength는 "AWS를 어디에 위치시킬 것인가"라는 질문에 대한 서로 다른 답이다. Outposts는 고객 건물 안, Local Zones는 대도시, Wavelength는 5G 기지국 옆. 이 세 가지 위치와 각 위치가 해결하는 문제(데이터 주권, 도시 수준 지연, 5G 수준 지연)를 매핑하면 SAP-C02 하이브리드 시나리오 문제가 즉시 풀린다.

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
