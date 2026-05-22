# Day 1 - AWS 개요, 글로벌 인프라, 공동 책임 모델

📅 날짜: Week 1 (Day 1)
🎯 주제: AWS 클라우드 기초와 솔루션 아키텍트 관점의 인프라 이해
⏱️ 학습 시간: 약 90분 (출퇴근 15-20분으로 핵심만 훑기 가능)

---

## 🎯 학습 목표

- AWS 글로벌 인프라(리전 / AZ / 엣지 / Local Zones / Outposts) 차이를 설계 관점에서 설명한다
- 공동 책임 모델을 IaaS / PaaS / SaaS 추상화 레벨로 구분해서 답할 수 있다
- Well-Architected Framework 6개 기둥을 키워드로 외운다

---

## 🧩 사전 지식 (CS 기초)

> 처음 보는 사람을 위해 — 이 Day를 이해하려면 알아두면 좋은 CS 개념.

- **가용성(Availability)**: 시스템이 정상 동작하는 시간 비율. "Three nines(99.9%)" = 연간 약 8시간 다운 허용.
- **내구성(Durability)**: 데이터가 손실되지 않는 비율. S3 11 9's는 "1000만 객체 중 1개를 1만 년에 잃을 확률".
- **장애 격리(Fault isolation)**: 한 컴포넌트 장애가 다른 컴포넌트로 번지지 않게 경계를 두는 설계. AZ는 물리적 격리.
- **무결성(Integrity) / 기밀성(Confidentiality) / 가용성(Availability) = CIA 트라이어드**: 보안 3대 목표.
- **추상화 계층 (IaaS / PaaS / SaaS)**: 고객이 관리하는 책임 범위가 점점 줄어든다. EC2(IaaS) → Beanstalk(PaaS) → S3(SaaS-ish).

---

## 📖 이론 내용

### 1. AWS 글로벌 인프라 — 설계자의 시야

| 구성 요소 | 개수(대략) | 설계 의미 |
|-----------|------|-----------|
| **Region** | 30+ | 데이터 주권 / 가격 / 서비스 가용성 결정 단위 |
| **Availability Zone (AZ)** | 리전당 3+ | HA 설계의 최소 단위. 물리적 격리 |
| **Edge Location** | 400+ | CloudFront / Route 53 / Global Accelerator 사용 |
| **Local Zones** | 30+ | 1ms 이내 초저지연 (게임, 미디어, ML 추론) |
| **Wavelength Zone** | 통신사 5G 엣지 | 모바일 5G 디바이스용 |
| **Outposts** | 고객 데이터센터 | 온프레미스 규제 / 하이브리드 |

> 💡 SAA에서 "1ms 이내", "데이터를 본사 밖으로 못 내보냄", "5G 사용자에게 초저지연" 같은 키워드가 보이면 각각 **Local Zones / Outposts / Wavelength**.

### 2. 공동 책임 모델 (Shared Responsibility Model)

**AWS = Security OF the Cloud / Customer = Security IN the Cloud**

| 책임 영역 | AWS | 고객 |
|-----------|-----|------|
| 물리적 시설 / 하드웨어 | ✅ | - |
| 하이퍼바이저 / 호스트 OS | ✅ | - |
| 게스트 OS 패치 (EC2) | - | ✅ |
| 관리형 서비스 OS / 엔진 패치 (RDS/Lambda) | ✅ | - |
| 네트워크 트래픽 보호 (SG / NACL) | - | ✅ |
| 데이터 분류 / 암호화 키 정책 | - | ✅ |
| IAM 사용자 / 권한 | - | ✅ |

핵심 규칙: **"AWS는 콘크리트 바닥부터 하이퍼바이저까지, 그 위는 모두 너의 책임"**. 단, 더 관리형(Managed)인 서비스일수록 AWS 책임이 위로 올라온다.

### 3. AWS Well-Architected Framework (W-AF) 6 Pillars

1. **Operational Excellence (운영 우수성)** — 모니터링, IaC, 자동화
2. **Security (보안)** — 최소권한, 모든 계층 보안, 데이터 보호
3. **Reliability (안정성)** — Self-healing, Multi-AZ, 분산
4. **Performance Efficiency (성능 효율)** — 적절한 리소스, 글로벌화, 서버리스
5. **Cost Optimization (비용 최적화)** — Right-sizing, 적합한 가격 모델
6. **Sustainability (지속 가능성)** — 탄소 발자국 최소화 (2021 추가)

> 시험은 6개 기둥 중 보통 4개(Security/Reliability/Performance/Cost)를 시나리오로 묻는다. SAA 도메인 비중과 일치한다.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **AZ는 데이터센터 ≠ 1:1** | 한 AZ는 1개 이상의 데이터센터 집합 | "AZ가 곧 단일 DC다" → ❌ |
| **AZ ID vs AZ Name** | `apne2-az1`(ID) vs `ap-northeast-2a`(Name). 이름은 계정마다 다르게 매핑 | 멀티 계정 비교 시 ID 사용 |
| **S3는 글로벌? 리전?** | 콘솔/네임스페이스는 글로벌, 데이터는 리전 종속 | 함정 자주 출제 |
| **GovCloud / China** | 별도 파티션(`aws-us-gov`, `aws-cn`). 일반 계정 접근 불가 | ARN 파티션 구분 |
| **Global Accelerator** | TCP/UDP 워크로드를 엣지에서 가속. 정적 Anycast IP 2개 제공 | "비-HTTP 글로벌 가속" 키워드 |

> ⚠️ **함정**: "CloudFront는 캐시, Global Accelerator는 네트워크 가속". CloudFront는 HTTP 위주, GA는 TCP/UDP 위주. 게임 서버, MQTT 같으면 GA.

> 💡 **암기 팁**: 6 Pillars 영어 머리글자 → **O-S-R-P-C-S** ("OSRP-CS" = "오 살펴 봐 시험" 으로 외워도 됨).

### 관련 서비스 Cross-Reference

- 공동 책임 → **IAM, KMS** (Week 1, Week 8)
- AZ 격리 → **Multi-AZ RDS, ASG** (Week 3, Week 5, Week 11)
- 글로벌 인프라 → **CloudFront, Route 53, Global Accelerator** (Week 4, Week 11)

---

## 🏗️ 아키텍처 다이어그램

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


공동 책임 — 서비스별 책임 곡선
================================
관리형↑       AWS 책임 ↑
  S3 / DynamoDB / Lambda        ┐
  RDS / ECS Fargate             │
  EC2 / EBS (IaaS)              │ ← 고객 책임 ↑
관리형↓       고객 책임 ↑
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **AZ는 물리적 격리. HA의 최소 단위.** Region 내 3개 이상이 표준.
2. ⭐ **공동 책임 — Managed 서비스일수록 AWS 책임 ↑.** EC2 OS 패치는 고객, RDS DB 엔진 패치는 AWS.
3. ⭐ **Global Accelerator vs CloudFront**: TCP/UDP·게임 = GA / HTTP 캐시 = CloudFront.
4. ⭐ **Outposts** = 데이터 본사 밖 못 나감 / **Local Zones** = 초저지연 / **Wavelength** = 5G.
5. ⭐ **Well-Architected 6 Pillars**: Operational / Security / Reliability / Performance / Cost / Sustainability.

---

## 💻 실제 예시 - AWS CLI

```bash
# 1) 모든 리전 목록
aws ec2 describe-regions --output table

# 2) 서울 리전의 AZ
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State]' \
  --output table

# 3) 현재 계정에서 사용 가능한 서비스 확인 (Service Quotas)
aws service-quotas list-services --output table | head
```

**출력 예시:**
```
-------------------------------------------------
|         DescribeAvailabilityZones             |
+-------------------+-----------+---------------+
| ap-northeast-2a   | apne2-az1 | available     |
| ap-northeast-2b   | apne2-az2 | available     |
| ap-northeast-2c   | apne2-az3 | available     |
| ap-northeast-2d   | apne2-az4 | available     |
+-------------------+-----------+---------------+
```

---

## 📝 연습 문제

**문제 1.** 한 회사는 본사 데이터센터 내에서 일부 워크로드를 실행해야 하지만 AWS 매니지드 서비스도 함께 쓰고 싶다. 가장 적합한 솔루션은?

A) Wavelength Zone
B) Local Zones
C) Outposts
D) Region 직접 사용

**정답: C**
해설: 고객 데이터센터 안에 AWS 하드웨어를 두고 동일한 API/서비스를 쓸 수 있는 것이 Outposts.

---

**문제 2.** 다음 중 EC2 인스턴스를 운영할 때 AWS의 책임에 해당하는 것은?

A) 게스트 OS 패치
B) 보안 그룹 설정
C) 하이퍼바이저 보안
D) 애플리케이션 코드의 취약점 점검

**정답: C**
해설: 하이퍼바이저 및 그 아래는 AWS 책임. 그 위 OS/SG/앱은 고객 책임.

---

**문제 3.** TCP/UDP 기반 글로벌 게임 서버에 가장 일관된 글로벌 지연시간을 제공하려면?

A) CloudFront + Lambda@Edge
B) Global Accelerator
C) Route 53 Geolocation
D) Direct Connect

**정답: B**
해설: CloudFront는 HTTP 캐시 중심, 게임 같은 TCP/UDP·비-HTTP 트래픽은 Global Accelerator가 적합.

---

**문제 4.** S3에 대한 설명으로 옳은 것은?

A) S3 버킷은 글로벌 서비스이므로 데이터도 글로벌하게 복제된다
B) S3 버킷 이름은 글로벌 네임스페이스지만 데이터는 특정 리전에 저장된다
C) S3 데이터는 모든 리전에 자동 복제된다
D) S3는 가용 영역에 종속된다

**정답: B**
해설: 이름은 글로벌 유일, 데이터는 리전 종속. Cross-Region Replication은 별도 활성화 필요.

---

**문제 5.** Well-Architected Framework의 기둥이 아닌 것은?

A) Reliability
B) Sustainability
C) Compliance
D) Operational Excellence

**정답: C**
해설: 6 Pillars는 OE / Security / Reliability / Performance / Cost / Sustainability. Compliance는 별도 개념.

---

## 📌 오늘의 요약

1. AWS 인프라 계층: Region > AZ > Edge / Local Zones / Outposts / Wavelength.
2. 공동 책임 모델은 추상화 레벨이 올라갈수록 AWS 책임이 커진다.
3. Outposts/Local Zones/Wavelength는 시나리오 키워드(본사 / 초저지연 / 5G)로 구별.
4. Global Accelerator는 TCP/UDP 글로벌 가속, CloudFront는 HTTP 캐시.
5. Well-Architected 6 Pillars는 SAA 도메인 비중과 거의 일치한다.
