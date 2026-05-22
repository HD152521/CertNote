# Day 1 - AWS 글로벌 인프라 & 공동 책임 모델 (운영자 관점)

📅 날짜: Week 1 (Day 1)
🎯 주제: CloudOps Engineer로서 알아야 할 AWS 인프라 기본기와 책임 분할
⏱️ 학습 시간: 약 90분 (출퇴근 15-20분으로 핵심만 훑기 가능)

---

## 🎯 학습 목표

- AWS 리전·AZ·엣지 로케이션 구조를 **운영자 시각**으로 이해한다
- 공동 책임 모델에서 "내가 모니터링해야 할 것"과 "AWS가 알아서 해주는 것"을 구분한다
- 운영자가 알아야 할 가용성/내구성/SLA 용어를 익힌다

---

## 🧩 사전 지식 (CS 기초)

> 출퇴근 중 처음 보는 사람을 위해 — 이 Day를 이해하려면 알아두면 좋은 CS 개념.

- **가용성(Availability)**: 시스템이 정상 작동하는 시간 비율. 99.99%는 연간 약 52분 다운 허용
- **내구성(Durability)**: 데이터가 손실되지 않을 확률. S3 표준은 11 9's (99.999999999%)
- **MTBF / MTTR**: Mean Time Between Failure / Mean Time To Repair. SRE 핵심 지표
- **Fault Tolerance vs High Availability**: FT는 장애 시에도 무중단, HA는 짧은 단절 후 자동 복구
- **Blast Radius**: 장애가 미치는 범위. 멀티 AZ/리전 설계로 폭발 반경 축소
- **Eventual Consistency**: 데이터가 결국엔 일관되지만 일시적으로 불일치 가능. S3, DynamoDB Global Table 등

---

## 📖 이론 내용

### 1. AWS 글로벌 인프라 - 운영자가 신경 써야 할 것

CloudOps Engineer는 인프라를 **"운영하는 입장"**에서 봅니다. 즉 "어떤 리전을 선택할까"보다 "이미 선택된 리전에서 어떻게 가용성을 유지할까"가 중요합니다.

#### 리전 (Region)

- 지리적으로 분리된 데이터 센터 클러스터
- 각 리전은 완전히 독립적 — **한 리전 장애가 다른 리전에 영향 X**
- 글로벌 서비스(IAM, Route 53, CloudFront)를 제외하면 모든 리소스는 리전에 종속됨
- **운영 관점**: 리전 단위 장애 대비 → 멀티 리전 백업/DR 필요 (RTO/RPO에 따라 비용 trade-off)

#### 가용 영역 (Availability Zone, AZ)

- 한 리전 내 최소 3개 이상의 격리된 데이터 센터 그룹
- AZ 간 지연시간 1ms 이내, 같은 메트로 안에서 광케이블 직결
- **운영 관점**: 단일 AZ 장애 대비 → 최소 2개 AZ에 워크로드 분산이 기본

#### 엣지 로케이션 (Edge Location) & Regional Edge Cache

- CloudFront/Route 53/Global Accelerator의 캐싱·라우팅 지점
- 600+ POP (Points of Presence) 운영 중
- **운영 관점**: TTL, 캐시 무효화(Invalidation), 오리진 장애 시 fallback 동작 이해 필요

### 2. 공동 책임 모델 - 운영자의 책임 범위

```
+--------------------------------------------------+
|   고객 책임 (Security IN the Cloud)              |
|   - 데이터 분류·암호화                            |
|   - IAM 사용자/역할 권한                         |
|   - OS·앱 패치 (EC2의 경우)                       |
|   - 네트워크 트래픽 보호 (SG, NACL, WAF 설정)   |
|   - 클라이언트/서버 측 데이터 암호화              |
+--------------------------------------------------+
|   AWS 책임 (Security OF the Cloud)               |
|   - 글로벌 인프라 (리전/AZ/엣지)                 |
|   - 하드웨어·소프트웨어·시설·물리 보안           |
|   - 관리형 서비스의 OS·DB 엔진 패치              |
+--------------------------------------------------+
```

#### CloudOps 관점에서 자주 헷갈리는 책임 구분

| 항목 | EC2 | RDS | Lambda | Fargate |
|------|-----|-----|--------|---------|
| 게스트 OS 패치 | **고객** | AWS | AWS | AWS |
| DB 엔진 패치 | - | **AWS**(고객이 시점 지정) | - | - |
| 백업 스케줄 | 고객 | 고객(보존기간 설정) | - | 고객 |
| 모니터링 메트릭 활성화 | 고객(CW Agent) | 일부 자동/일부 고객 | 자동 | 자동 |
| 시크릿 회전 | 고객 | **AWS+고객**(Secrets Manager) | 고객 | 고객 |
| 네트워크 ACL/SG | 고객 | 고객 | 고객(VPC 설정 시) | 고객 |

### 3. 운영자 어휘 - SLA, RTO, RPO, RCO

CloudOps 시험에서 시나리오 문제 단서가 되는 핵심 약어들.

| 약어 | 풀네임 | 의미 | 예시 |
|------|--------|------|------|
| **SLA** | Service Level Agreement | AWS의 가동률 보장 | EC2 단일 인스턴스 99.5%, Multi-AZ Region 99.99% |
| **RTO** | Recovery Time Objective | 장애 발생 → 복구까지 허용 시간 | "RTO 1시간" = 1시간 내 복구 필요 |
| **RPO** | Recovery Point Objective | 허용 가능한 데이터 손실 시간 | "RPO 5분" = 5분치까지만 손실 허용 |
| **MTTR** | Mean Time To Recovery | 평균 복구 시간 | 운영 성과 지표 |
| **MTBF** | Mean Time Between Failures | 평균 장애 간격 | 안정성 지표 |

#### DR 전략 4단계 (비용 vs RTO 트레이드오프)

```
비용 ↑                                            RTO ↓
  |
  | 4. Multi-Site Active/Active   ← 가장 비쌈, 거의 0초
  | 3. Warm Standby (축소 환경 상시)
  | 2. Pilot Light (핵심만 켜둠)
  | 1. Backup & Restore           ← 가장 쌈, 시간 단위
  +--------------------------------> 복구 속도
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Local Zones** | 대도시 인접 확장 리전. 1ms 이내 초저지연 | 미디어/실시간 ML 워크로드 |
| **Wavelength Zones** | 5G 통신사 엣지 | 5G·IoT 저지연 |
| **AWS Outposts** | 고객 데이터 센터 내 AWS 하드웨어 | 하이브리드/규제 산업 |
| **AWS Global Accelerator** | 정적 Anycast IP + 엣지 라우팅 | 비-HTTP 가속, 빠른 페일오버 |
| **GovCloud / China** | 격리 파티션 (`aws-us-gov`, `aws-cn`) | ARN 파티션이 다름, IAM 별도 |

> ⚠️ **함정 1**: "S3는 글로벌"이라는 표현은 절반만 맞다. 버킷 이름은 글로벌 네임스페이스지만 데이터는 특정 리전 저장.
>
> ⚠️ **함정 2**: GovCloud/China는 일반 AWS 콘솔에서 보이지 않음. 별도 계정 필요.
>
> 💡 **암기 팁**: 운영자 시험에서 "관리형(Managed)일수록 AWS 책임 ↑". EC2 < ECS-EC2 < RDS < Fargate < Lambda < DynamoDB 순으로 AWS가 더 많이 관리.

### 관련 서비스 Cross-Reference

- **글로벌 인프라 → Week 8 네트워킹 운영** (멀티 AZ 라우팅, Transit Gateway)
- **공동 책임 → Week 5 SSM** (OS 패치 자동화 = 고객 책임을 자동화로 위임)
- **DR 전략 → Week 10 백업·DR** (Pilot Light vs Warm Standby 구현)
- **SLA → Week 3 알람** (다운타임 예산을 알람 임계값으로 환산)

---

## 🏗️ 아키텍처 다이어그램

```
운영자 관점 - 책임 영역별 모니터링/조치 흐름
========================================================

   [고객 책임: Security IN the Cloud]
   ┌──────────────────────────────────────────────┐
   │  데이터    │  IAM      │  OS/앱    │  네트워크 │
   │  - KMS    │  - 정책   │  - 패치   │  - SG    │
   │  - 백업   │  - MFA    │  - 로그   │  - NACL  │
   └────┬──────┴────┬──────┴────┬──────┴────┬─────┘
        ▼           ▼           ▼           ▼
    [CloudWatch  +  CloudTrail  +  Config  +  GuardDuty]
        │           │           │           │
        ▼           ▼           ▼           ▼
   [Alarm/EventBridge → Lambda/SSM Automation → 자동 복구]

   ─────────────  AWS 관할 경계  ─────────────

   [AWS 책임: Security OF the Cloud]
   ┌──────────────────────────────────────────────┐
   │  글로벌 인프라 (Region/AZ/Edge)              │
   │  하드웨어 / 하이퍼바이저 / 시설 / 물리 보안   │
   │  관리형 서비스 기반 인프라                    │
   └──────────────────────────────────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EC2 OS 패치는 고객 책임** — SSM Patch Manager로 자동화하는 것이 운영 모범 사례
2. ⭐ **RDS DB 엔진 패치는 AWS 책임** — 단, 적용 시점(maintenance window)은 고객이 지정
3. ⭐ **SLA 99.99%** = 연간 52분 다운 허용. 알람 설계 시 이 예산을 초과하지 않도록 임계값 설정
4. ⭐ **단일 AZ 배포 = 안티 패턴** — 시험에서 "가용성 향상" 키워드 보이면 Multi-AZ가 정답
5. ⭐ **AWS는 인프라까지, 고객은 데이터까지** — 책임 모델 도표 머릿속에 박아둘 것

---

## 💻 실제 예시 - AWS CLI

```bash
# 현재 리전의 AZ 목록 + 상태 확인 (운영 점검 첫걸음)
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,State,ZoneType]' \
  --output table

# 서비스별 가용 리전 확인 (운영 가능 리전 검증)
aws ssm get-parameters-by-path \
  --path /aws/service/global-infrastructure/services/lambda/regions \
  --query 'Parameters[*].Value' \
  --output table

# 모든 활성 리전 목록 (DR 사이트 후보 검토용)
aws ec2 describe-regions \
  --query 'Regions[?OptInStatus==`opt-in-not-required`].RegionName' \
  --output table
```

**출력 예시:**
```
--------------------------------------------------
|         DescribeAvailabilityZones              |
+-----------------+-----------+------------------+
| ap-northeast-2a | available | availability-zone|
| ap-northeast-2b | available | availability-zone|
| ap-northeast-2c | available | availability-zone|
| ap-northeast-2d | available | availability-zone|
+-----------------+-----------+------------------+
```

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스에서 OS 보안 패치가 누락되어 보안 사고가 발생했다. 책임 주체는?

A) AWS — 인프라 패치는 AWS 책임이다
B) 고객 — EC2의 게스트 OS는 고객 책임이다
C) 공동 책임 — 책임이 분할된다
D) 서비스 공급자 — 자동 패치 미설정 책임

**정답: B**
해설: 공동 책임 모델에서 EC2는 IaaS이므로 게스트 OS 패치는 전적으로 고객 책임. SSM Patch Manager로 자동화하는 것이 운영 모범 사례.

---

**문제 2.** 한 회사가 SLA 99.9%를 보장하는 SaaS를 운영한다. 연간 허용 다운타임은?

A) 약 5분
B) 약 52분
C) 약 8시간 45분
D) 약 87시간

**정답: C**
해설: 99.9% = 0.1% × 365일 × 24시간 = 8.76시간 ≒ 8시간 45분. 알람 설계 시 이 예산을 초과하지 않도록 임계값을 정한다. (참고: 99.99% = 52분, 99.999% = 5분)

---

**문제 3.** RDS Multi-AZ 배포에서 DB 엔진의 마이너 버전 패치가 발생했다. 운영자가 할 일은?

A) 패치 적용 명령어를 직접 실행한다
B) 인스턴스를 재시작한다
C) 유지 관리 기간(Maintenance Window)을 적절히 설정해두고, 자동 마이너 버전 업그레이드 옵션을 검토한다
D) 백업본을 복원해 패치된 새 인스턴스를 만든다

**정답: C**
해설: RDS는 관리형 서비스이므로 DB 엔진 패치는 AWS 책임이지만, **적용 시점(Maintenance Window)은 고객이 지정**한다. 자동 마이너 업그레이드를 켜두면 Maintenance Window 동안 AWS가 적용. Multi-AZ면 Standby부터 패치되어 다운타임 최소화.

---

**문제 4.** 글로벌 서비스가 아닌 것은?

A) IAM
B) Route 53
C) CloudFront
D) DynamoDB

**정답: D**
해설: DynamoDB는 리전 서비스. (Global Table은 멀티 리전 복제 기능일 뿐, 테이블 자체는 리전에 종속.) IAM, Route 53, CloudFront, WAF(CloudFront 연동 시), STS 등은 글로벌 서비스.

---

**문제 5.** 한 회사가 RPO 1분, RTO 5분의 매우 엄격한 DR 요건을 가지고 있다. 가장 적절한 DR 전략은?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active/Active

**정답: D**
해설: RTO 5분 / RPO 1분처럼 거의 0에 가까운 요건은 Multi-Site Active/Active만 만족. Warm Standby는 RTO 수십 분 수준. Backup & Restore는 RTO 수 시간, Pilot Light는 RTO 약 1시간. 단, Active/Active는 가장 비싸므로 비용 trade-off 고려.

---

## 📌 오늘의 요약

1. CloudOps Engineer는 "운영자 관점"에서 AWS 인프라를 본다 — 리전 선택보다 **이미 선택된 리전의 가용성 유지**가 핵심
2. 공동 책임 모델: AWS = 클라우드 자체 보안, 고객 = 클라우드 내부 보안 (데이터·IAM·OS·네트워크)
3. 관리형 서비스(Managed)일수록 AWS 책임이 늘어남: EC2 < RDS < Lambda < DynamoDB
4. SLA / RTO / RPO는 시나리오 문제 단서. 숫자 단위(시간/분/초)로 DR 전략 추론 가능
5. 단일 AZ 배포 = 안티 패턴. "가용성 향상" 키워드 → Multi-AZ가 거의 항상 정답
