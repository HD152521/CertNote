# Day 4 - EC2 / EBS / ELB / Auto Scaling 복습 심화

📅 날짜: Week 1 (Day 4)
🎯 주제: 컴퓨팅·스토리지·로드밸런싱·확장의 Pro 수준 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EC2 구매 옵션 5종의 사용처를 정확히 구분한다
- EBS 볼륨 타입(gp3·io2·st1·sc1) 선택 기준을 안다
- ALB·NLB·GLB·CLB의 결정적 차이를 안다
- Auto Scaling 정책 4종(Target/Step/Simple/Scheduled) + Predictive를 안다

---

## 🧩 사전 지식 (CS 기초)

- **IOPS vs Throughput**: IOPS=초당 입출력 횟수, Throughput=초당 데이터량. DB는 IOPS, 빅데이터는 Throughput.
- **Latency vs Bandwidth**: 지연 vs 대역폭. EBS gp3는 둘 다 조절 가능.
- **Connection Multiplexing**: ALB는 HTTP/2 연결 다중화, NLB는 TCP/UDP 그대로.
- **Sticky Session**: 동일 사용자가 같은 백엔드로. ALB는 쿠키 기반.
- **Warm Pool**: ASG에서 미리 데워둔 인스턴스 풀 — 빠른 스케일 아웃.

---

## 📖 이론 내용

### 1. EC2 구매 옵션 5종

| 옵션 | 할인율 | 약정 | 사용처 |
|------|--------|------|--------|
| **On-Demand** | 0% | X | 단기·예측 불가 |
| **Reserved Instance** | ~72% | 1·3년 | 안정 워크로드, 인스턴스 패밀리 고정 |
| **Savings Plans (Compute)** | ~66% | 1·3년 | 유연 (모든 리전·인스턴스 패밀리·Fargate·Lambda 적용) |
| **Spot** | ~90% | X | 중단 허용 배치·CI·ML 훈련 |
| **Dedicated Host/Instance** | - | - | 라이선스(BYOL), 컴플라이언스 |

> ⚠️ **함정**: "유연성 필요 + 비용 절감" → **Compute Savings Plans** (RI보다 유연).
> "BYOL Windows·Oracle 라이선스" → **Dedicated Host** (소켓·코어 시각화).

### 2. EBS 볼륨 타입

| 타입 | 최대 IOPS | 최대 Throughput | 사용처 |
|------|-----------|------------------|--------|
| **gp3** | 16,000 | 1,000 MB/s | 일반 워크로드 (기본 선택) |
| **gp2** | 16,000 (volume size 비례) | 250 MB/s | 레거시, gp3로 마이그레이션 권장 |
| **io2 Block Express** | 256,000 | 4,000 MB/s | 미션 크리티컬 DB |
| **io1/io2** | 64,000 | 1,000 MB/s | 고성능 DB |
| **st1** | 500 | 500 MB/s | 빅데이터·로그 (Throughput) |
| **sc1** | 250 | 250 MB/s | 콜드 스토리지 |

> 💡 **암기 팁**: "gp3 = IOPS·Throughput 독립 조절 + gp2보다 20% 저렴".

**Multi-Attach**: io1/io2만 지원 — 단일 EBS 볼륨을 최대 16개 EC2에 동시 attach (클러스터 FS 필요, ext4 같은 일반 FS는 깨짐).

**Snapshot**: 증분 백업. S3에 저장(보이지 않음). FSR(Fast Snapshot Restore)로 첫 액세스 지연 제거.

### 3. ELB 4종 비교 (⭐ 시험 핵심)

| 종류 | 계층 | 프로토콜 | 주요 기능 |
|------|------|----------|-----------|
| **ALB** | L7 | HTTP/HTTPS/gRPC | 경로·호스트·헤더 라우팅, WebSocket, Lambda Target |
| **NLB** | L4 | TCP/UDP/TLS | 초저지연, 정적 IP, 1초당 수백만 요청, PrivateLink |
| **GLB** | L3 (GENEVE) | IP | 서드파티 어플라이언스(방화벽·IDS) 인서트 |
| **CLB** | L4/L7 | HTTP/HTTPS/TCP | 레거시, 신규는 X |

> ⚠️ **함정**:
> - "WebSocket·gRPC" → **ALB**
> - "정적 IP 필요·게이밍 UDP" → **NLB**
> - "보안 어플라이언스 체인" → **GLB**
> - "Cross-AZ Load Balancing" — NLB는 기본 OFF(켜면 데이터 전송 비용), ALB는 항상 ON

### 4. Auto Scaling 정책

| 정책 | 동작 |
|------|------|
| **Target Tracking** | "CPU 60% 유지" 같이 목표값 (가장 권장) |
| **Step Scaling** | CloudWatch 알람 임계치별 단계 조정 |
| **Simple Scaling** | 단일 임계치 (쿨다운 필요, 거의 사용 X) |
| **Scheduled** | 시간 기반 (월요일 9시 출근 트래픽) |
| **Predictive** | ML 기반 예측 (CPU 정기 패턴) |

**Warm Pool**: 미리 가동·정지 상태 인스턴스 보관 → 스케일 아웃 시간 단축. 부팅 오래 걸리는 Windows·게임 서버에 유용.

**Lifecycle Hook**: 인스턴스 시작/종료 전후에 작업 (로그 수집, 등록 해제). `Pending:Wait`, `Terminating:Wait` 상태에서 SNS/Lambda 트리거.

### 5. EC2 Placement Group

| 종류 | 동작 | 사용처 |
|------|------|--------|
| **Cluster** | 단일 AZ 근접 배치 | HPC, 노드 간 저지연 |
| **Spread** | 여러 AZ·다른 H/W (최대 7개/AZ) | 작은 인스턴스 그룹 분산 |
| **Partition** | 7개 파티션 그룹, 파티션 간 격리 | 분산 DB (Cassandra, HDFS) |

---

## 🧠 알아두면 좋은 심화 이론

### EC2 Hibernate vs Stop

- **Hibernate**: RAM 상태를 EBS에 저장 → 부팅 빠름. C5·M5 등 지원.
- **Stop**: 일반적인 OS shutdown.

### Nitro System

- 가상화 오버헤드 ↓, EBS·VPC·SR-IOV 향상.
- 모든 최신 인스턴스(c5, m5, r5+)는 Nitro 기반.
- Nitro Enclaves: KMS와 연동된 격리된 환경에서 민감 처리.

### Cross-Reference

- **Week 7**: ECS Capacity Provider(Spot 통합)
- **Week 12**: Savings Plans 깊이 학습
- **Week 14**: Multi-AZ·DR 패턴

---

## 🏗️ 아키텍처 다이어그램 — ALB + ASG + Spot 혼합

```
Route 53
   |
   v
ALB (Multi-AZ, HTTPS)
   |
   +-- Target Group 1 (On-Demand)
   |     ASG: 4-10 인스턴스, m6i.large
   |     Target Tracking CPU=60%
   |     Lifecycle Hook → S3 로그 적재
   |
   +-- Target Group 2 (Spot)
         ASG: 0-20 인스턴스, c6i.large Spot
         혼합 인스턴스 정책 (capacity-optimized)
         Spot Interruption → 종료 전 2분
```

---

## ⭐ 핵심 포인트

1. ⭐ **유연 비용 절감 = Compute Savings Plans** (RI보다 유연)
2. ⭐ **gp3가 gp2 대체** — IOPS/Throughput 독립 조절, 20% 저렴
3. ⭐ **ALB=L7·gRPC·WebSocket / NLB=L4·정적 IP·초저지연**
4. ⭐ **Target Tracking**이 가장 단순·권장 ASG 정책
5. ⭐ Spot 중단 알림(2분) → Lifecycle Hook으로 우아한 종료

---

## 💻 실제 예시 - ASG with Mixed Instances

```bash
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name web-asg \
  --mixed-instances-policy '{
    "LaunchTemplate": {
      "LaunchTemplateSpecification": {"LaunchTemplateName": "web-lt"},
      "Overrides": [
        {"InstanceType": "m6i.large"},
        {"InstanceType": "m5.large"},
        {"InstanceType": "m5a.large"}
      ]
    },
    "InstancesDistribution": {
      "OnDemandPercentageAboveBaseCapacity": 30,
      "SpotAllocationStrategy": "capacity-optimized"
    }
  }' \
  --min-size 2 --max-size 20 \
  --target-group-arns arn:aws:elasticloadbalancing:...
```

---

## 📝 연습 문제

**문제 1.** Windows BYOL 라이선스 적용 워크로드. 어떤 EC2 옵션?

A) On-Demand
B) Reserved Instance
C) Dedicated Host
D) Spot

**정답: C**
해설: BYOL은 소켓·코어 가시성이 필요해서 Dedicated Host.

---

**문제 2.** ML 훈련 워크로드, 비용 90% 절감 목표, 중단 시 재시작 가능. 적절한 옵션은?

A) On-Demand p4
B) RI 3년 p4
C) Spot p4 + Checkpoint
D) Savings Plans + p4

**정답: C**
해설: 중단 허용 + 최대 절감 = Spot + 체크포인트.

---

**문제 3.** 게임 매칭 서버, UDP, 정적 IP, 초저지연. 어떤 ELB?

A) ALB
B) NLB
C) CLB
D) GLB

**정답: B**
해설: UDP·정적 IP·초저지연 = NLB.

---

**문제 4.** Auto Scaling 그룹이 매일 9시 트래픽 폭증. 자동으로 미리 늘리고 싶다. 가장 적합한 정책은?

A) Target Tracking (CPU)
B) Predictive Scaling
C) Simple Scaling
D) Manual

**정답: B**
해설: 정기 패턴 = Predictive(ML 기반 예측).

---

**문제 5.** 오라클 RAC 같은 클러스터 DB를 EBS로 구성. 어떤 옵션?

A) gp3 single attach
B) io2 Multi-Attach + 클러스터 FS
C) st1 다중 EC2
D) Instance Store

**정답: B**
해설: Multi-Attach는 io1/io2만, 클러스터 FS와 함께.

---

**문제 6.** Spot 인스턴스에서 우아한 종료(graceful shutdown) 구현 방법?

A) Spot 중단 메타데이터 폴링 + Drain 로직
B) SIGKILL 처리
C) EBS Snapshot
D) Cooldown 길게

**정답: A**
해설: Spot 인터럽션 통지(2분) 메타데이터 폴링 또는 EventBridge로 사전 Drain.

---

## 📌 오늘의 요약

1. 유연한 비용 절감 = **Compute Savings Plans**
2. EBS = gp3 표준, 미션 크리티컬은 io2 Block Express, Multi-Attach는 io1/io2만
3. ALB(L7) / NLB(L4·정적 IP) / GLB(어플라이언스 체인)
4. ASG는 Target Tracking 우선, 정기 패턴은 Predictive
5. Spot은 Lifecycle Hook + 2분 중단 알림으로 우아한 종료
