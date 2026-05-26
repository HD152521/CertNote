# Day 1 - AWS 인프라의 지도: 리전, AZ, 그리고 공동 책임이라는 약속

AWS 콘솔을 처음 열면 우측 상단에 "Seoul" 같은 리전 셀렉터가 보이고, 어떤 서비스는 글로벌이라고 적혀 있는데 어떤 서비스는 리전을 골라야 한다. 둘의 차이가 뭔지 한 번이라도 막힌 적이 있다면, 그게 바로 솔루션 아키텍트가 답해야 할 첫 질문이다.

이 글에서는 AWS의 글로벌 인프라가 어떤 계층으로 쌓여 있는지, 그리고 그 위에서 "내 책임"과 "AWS 책임"이 어떻게 갈리는지를 정리한다. SAA-C03 시험은 정확히 이 지점에서 시작한다. 인프라 지도를 머릿속에 그릴 줄 알아야, 다음 주의 VPC도, 그 다음 주의 RDS도 의미가 통한다.

## 리전과 AZ: HA 설계의 출발선

AWS 인프라를 한 줄로 표현하면 **Region > AZ > Edge** 의 3층 구조다. 거기에 특수 용도의 Local Zones, Wavelength, Outposts가 곁가지로 붙는다.

| 구성 요소 | 개수(대략) | 설계 의미 |
|-----------|------|-----------|
| **Region** | 30+ | 데이터 주권 / 가격 / 서비스 가용성 결정 단위 |
| **Availability Zone (AZ)** | 리전당 3+ | HA 설계의 최소 단위. 물리적 격리 |
| **Edge Location** | 400+ | CloudFront / Route 53 / Global Accelerator |
| **Local Zones** | 30+ | 1ms 이내 초저지연 (게임, 미디어, ML 추론) |
| **Wavelength Zone** | 통신사 5G 엣지 | 모바일 5G 디바이스용 |
| **Outposts** | 고객 데이터센터 | 온프레미스 규제 / 하이브리드 |

여기서 가장 중요한 건 AZ다. 한 AZ는 단일 데이터센터가 아니라 **물리적으로 격리된 1개 이상의 DC 집합**이다. 전원도 네트워크도 분리되어 있고, 같은 리전 안의 AZ 간에는 저지연 전용선으로 묶여 있어서 동기 복제가 가능하다. 그래서 시험에서 "고가용성이 필요하다"라는 키워드가 나오면 거의 항상 답은 **Multi-AZ**다.

```
                  [ AWS 글로벌 ]
                       |
        +--------------+-------------+
        |              |             |
   [Region A]     [Region B]    [Region C]
    |     |        |    |        |    |
  AZ-a  AZ-b     AZ-a AZ-b     AZ-a AZ-b
  (DC×N)(DC×N)   (DC×N)         ...

[Edge Locations (400+)] —— CloudFront / Route 53 / GA
[Local Zones / Wavelength / Outposts]
```

> 💡 **관련 이론**: 가용성(Availability)은 "정상 동작 시간 비율"이고, 내구성(Durability)은 "데이터가 손실되지 않는 비율"이다. 둘은 자주 혼동되지만 다른 차원이다. S3가 자랑하는 "11 9's"는 내구성 수치로, 1000만 개 객체 중 1개를 1만 년에 잃을 확률을 뜻한다. 가용성과 내구성은 모두 분산 시스템의 CAP 정리(Brewer, 2000)에서 갈라져 나온 운영 지표다.

> ⚠️ **함정**: "AZ는 곧 데이터센터 한 곳"이라는 보기가 자주 등장한다. 틀렸다. AZ는 1개 이상의 DC를 묶은 논리적 격리 단위다. 또 한 가지 자주 출제되는 함정은 **AZ ID vs AZ Name**. `ap-northeast-2a`는 계정마다 다른 물리 AZ로 매핑된다. 계정 간 비교가 필요하면 `apne2-az1` 같은 **AZ ID**를 써야 한다.

## Edge에서 일어나는 일: CloudFront와 Global Accelerator

엣지 로케이션은 사용자와 가까운 곳에 데이터를 캐싱하거나 트래픽을 가속하는 지점이다. 두 가지 서비스가 자주 헷갈리는데, 시험에서 명확히 가른다.

- **CloudFront**: HTTP/HTTPS 캐시 중심. 정적 콘텐츠나 API 응답을 엣지에 캐싱.
- **Global Accelerator**: TCP/UDP 워크로드를 엣지에서 AWS 백본망으로 끌어들여 가속. 정적 Anycast IP 2개 제공.

게임 서버, MQTT, VoIP, 비-HTTP 프로토콜이 보이면 거의 무조건 **Global Accelerator**다. HTTP 캐시·콘텐츠 배포면 CloudFront. 이 한 줄을 외워두면 한두 문제는 그냥 가져온다.

## 특수 인프라: Outposts, Local Zones, Wavelength

이 세 가지는 시나리오 키워드로 구별하는 게 가장 빠르다.

- **Outposts**: "데이터를 본사 밖으로 못 내보냄" / "온프레미스 규제" → 고객 DC 안에 AWS 하드웨어를 두고 같은 API로 운영.
- **Local Zones**: "특정 도시에 초저지연 필요" / "1ms 이내" → 게임, 실시간 영상, ML 추론.
- **Wavelength**: "5G 모바일 사용자" / "통신사 엣지" → 5G 단말에 가장 가까운 위치.

> 💡 **암기 팁**: 본사 = O(utposts), 도시 = L(ocal Zones), 5G = W(avelength). 키워드 한 단어만 잡으면 답이 떨어진다.

## 공동 책임 모델: AWS는 어디까지 책임지나

클라우드 보안을 처음 접하면 "AWS가 다 해주는 거 아니야?"라고 착각하기 쉽다. 실제로는 **AWS = Security OF the Cloud / Customer = Security IN the Cloud** 라는 분담이 있다. 콘크리트 바닥부터 하이퍼바이저까지는 AWS, 그 위는 모두 고객 책임이라고 외워두면 거의 맞는다.

| 책임 영역 | AWS | 고객 |
|-----------|-----|------|
| 물리적 시설 / 하드웨어 | ✅ | - |
| 하이퍼바이저 / 호스트 OS | ✅ | - |
| 게스트 OS 패치 (EC2) | - | ✅ |
| 관리형 서비스 OS / 엔진 패치 (RDS/Lambda) | ✅ | - |
| 네트워크 트래픽 보호 (SG / NACL) | - | ✅ |
| 데이터 분류 / 암호화 키 정책 | - | ✅ |
| IAM 사용자 / 권한 | - | ✅ |

핵심 규칙 하나만 챙기면 된다. **추상화 레벨이 올라갈수록(=Managed 서비스일수록) AWS의 책임이 위로 올라온다**. EC2(IaaS)는 OS 패치까지 고객이 하지만, RDS(PaaS)는 DB 엔진 패치까지 AWS가, S3 같은 완전 관리형 서비스는 더 위까지 AWS가 책임진다.

```
관리형↑       AWS 책임 ↑
  S3 / DynamoDB / Lambda        ┐
  RDS / ECS Fargate             │
  EC2 / EBS (IaaS)              │ ← 고객 책임 ↑
관리형↓       고객 책임 ↑
```

> 💡 **관련 이론**: 공동 책임 모델은 CIA 트라이어드(Confidentiality, Integrity, Availability)를 클라우드 환경에 매핑한 결과다. 물리적 가용성과 인프라 무결성은 AWS가, 데이터 기밀성과 애플리케이션 무결성은 고객이 맡는다. NIST SP 800-145의 클라우드 서비스 모델(IaaS/PaaS/SaaS) 분류와도 정확히 맞물린다.

## Well-Architected Framework: 설계의 6가지 축

AWS는 좋은 클라우드 설계를 6개 기둥으로 정리해두었다. SAA 도메인 비중과도 거의 일치하니까 외워두면 시나리오 문제의 의도를 빨리 읽을 수 있다.

1. **Operational Excellence (운영 우수성)** — 모니터링, IaC, 자동화
2. **Security (보안)** — 최소권한, 모든 계층 보안, 데이터 보호
3. **Reliability (안정성)** — Self-healing, Multi-AZ, 분산
4. **Performance Efficiency (성능 효율)** — Right-sizing, 글로벌화, 서버리스
5. **Cost Optimization (비용 최적화)** — 적합한 가격 모델
6. **Sustainability (지속 가능성)** — 탄소 발자국 최소화 (2021 추가)

> 💡 **암기 팁**: 머리글자만 따서 **O-S-R-P-C-S**. "오 살펴봐 시험" 으로 외워도 잘 안 잊혀진다. SAA에서 자주 묻는 건 4개(Security/Reliability/Performance/Cost)다.

## 콘솔 vs CLI로 확인해보기

말로만 외우면 잊어버린다. CLI로 한 번 찍어보면 머리에 박힌다.

```bash
# 1) 모든 리전 목록
aws ec2 describe-regions --output table

# 2) 서울 리전의 AZ 확인
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State]' \
  --output table
```

출력은 이렇게 나온다.

```
+-------------------+-----------+---------------+
| ap-northeast-2a   | apne2-az1 | available     |
| ap-northeast-2b   | apne2-az2 | available     |
| ap-northeast-2c   | apne2-az3 | available     |
| ap-northeast-2d   | apne2-az4 | available     |
+-------------------+-----------+---------------+
```

ZoneName과 ZoneId가 따로 있는 게 보일 거다. 멀티 계정 환경에서는 ZoneId가 진실이다.

## 정리

오늘 본 그림은 AWS의 인프라 지도와 그 위의 책임 분담이다. **Region > AZ > Edge** 라는 3층 구조, 그리고 **AWS는 콘크리트 바닥부터 하이퍼바이저까지** 라는 책임 경계 한 줄. 이 두 가지가 다음 글부터 등장할 모든 서비스의 배경이 된다.

다음 글에서는 IAM의 4대 엔터티 — User, Group, Role, Policy — 를 다룬다. 공동 책임 모델에서 "고객 책임"의 가장 첫 번째 항목이 바로 IAM이다. 누구에게 무엇을 허용할지를 정확히 그릴 수 있어야 클라우드 보안의 절반이 끝난다.

---

## 📝 연습 문제

**문제 1.** 한 회사는 본사 데이터센터 내에서 일부 워크로드를 실행해야 하지만 AWS 매니지드 서비스도 함께 쓰고 싶다. 가장 적합한 솔루션은?

A) Wavelength Zone
B) Local Zones
C) Outposts
D) Region 직접 사용

**정답: C**
해설: 고객 데이터센터 안에 AWS 하드웨어를 두고 동일한 API/서비스를 쓸 수 있는 것이 Outposts. "본사 안", "데이터를 외부로 못 보냄" 키워드가 정답 신호다.

---

**문제 2.** 다음 중 EC2 인스턴스를 운영할 때 AWS의 책임에 해당하는 것은?

A) 게스트 OS 패치
B) 보안 그룹 설정
C) 하이퍼바이저 보안
D) 애플리케이션 코드의 취약점 점검

**정답: C**
해설: 하이퍼바이저 및 그 아래는 AWS 책임. 게스트 OS, SG, 애플리케이션 코드는 모두 고객 책임이다. EC2는 IaaS이므로 OS 패치도 고객 몫이다.

---

**문제 3.** TCP/UDP 기반 글로벌 게임 서버에 가장 일관된 글로벌 지연시간을 제공하려면?

A) CloudFront + Lambda@Edge
B) Global Accelerator
C) Route 53 Geolocation
D) Direct Connect

**정답: B**
해설: CloudFront는 HTTP 캐시 중심이고, 게임 같은 TCP/UDP·비-HTTP 트래픽에는 Global Accelerator가 적합하다. Route 53 Geolocation은 DNS 라우팅일 뿐 트래픽 자체를 가속하지는 않는다.

---

**문제 4.** S3에 대한 설명으로 옳은 것은?

A) S3 버킷은 글로벌 서비스이므로 데이터도 글로벌하게 복제된다
B) S3 버킷 이름은 글로벌 네임스페이스지만 데이터는 특정 리전에 저장된다
C) S3 데이터는 모든 리전에 자동 복제된다
D) S3는 가용 영역에 종속된다

**정답: B**
해설: 이름은 글로벌 유일, 데이터는 리전 종속. 데이터 복제는 Cross-Region Replication을 별도로 설정해야 한다. 이름의 글로벌 유일성 때문에 "글로벌 서비스"라고 착각하기 쉬운 함정이다.

---

**문제 5.** Well-Architected Framework의 기둥이 아닌 것은?

A) Reliability
B) Sustainability
C) Compliance
D) Operational Excellence

**정답: C**
해설: 6 Pillars는 Operational Excellence / Security / Reliability / Performance Efficiency / Cost Optimization / Sustainability. Compliance는 별도의 거버넌스 개념으로, W-AF의 기둥에는 포함되지 않는다.

---

**문제 6.** 한 회사가 ap-northeast-2 리전에서 RDS Multi-AZ를 운영하면서, 별도 리전(ap-northeast-1)에 읽기 전용 복제본을 두려고 한다. 이 설계의 주된 이점은?

A) 단일 AZ 장애 복구
B) Region 단위 재해 복구(DR) + 동시 읽기 트래픽 분산
C) IAM 권한 분리
D) CloudFront 캐시 효율 향상

**정답: B**
해설: Multi-AZ는 동일 리전 내 HA, 다른 리전의 Read Replica는 Region 단위 DR과 글로벌 읽기 트래픽 분산을 동시에 노린다. AZ 격리(HA)와 Region 격리(DR)는 다른 차원이라는 점을 구분해야 한다.
