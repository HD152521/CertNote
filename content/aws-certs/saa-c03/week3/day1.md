# Day 11 - EC2 인스턴스 유형 & 구매 옵션

📅 날짜: Week 3 (Day 1)
🎯 주제: EC2 컴퓨팅의 종류와 비용 모델
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EC2 인스턴스 패밀리(C/M/R/G/I/T)를 워크로드별로 선택할 수 있다
- On-Demand / Reserved / Savings Plan / Spot / Dedicated 차이를 안다
- Placement Group의 3가지 모드와 사용 사례를 구분한다

---

## 🧩 사전 지식 (CS 기초)

- **CPU / RAM / I/O / 네트워크**: 워크로드의 병목 자원이 다 다르다.
- **Burstable CPU**: 평소 baseline 낮고 가끔 spike 허용. T 계열.
- **하이퍼바이저(Nitro)**: AWS의 경량 하이퍼바이저. 베어메탈에 가까운 성능.
- **상각(Amortization)**: 1년/3년 약정으로 미리 깎아주는 모델 = RI / SP.

---

## 📖 이론 내용

### 1. 인스턴스 패밀리 (Family)

| 패밀리 | 키워드 | 워크로드 |
|--------|--------|----------|
| **T**(t3/t4g) | Burstable | 변동 부하 웹/마이크로서비스 |
| **M**(m5/m6i) | General | 균형형, 디폴트 선택 |
| **C**(c5/c6i/c7g) | Compute | CPU-바운드, 인코딩, ML 추론 |
| **R**(r5/r6i/x2) | Memory | 인메모리 DB, 캐시, 분석 |
| **I**(i3/i4i) | Storage | 로컬 NVMe SSD, NoSQL |
| **D**(d3/d3en) | Dense HDD | Hadoop, 데이터 웨어하우스 |
| **G/P**(g5/p4d) | GPU | ML 학습/추론, 그래픽 |
| **Inf/Trn** | AWS Chip | 추론(Inferentia) / 학습(Trainium) |
| **A**(a1, g) | ARM (Graviton) | 가성비 ↑ |

> 💡 표기 해석: `c7g.xlarge` → C 패밀리, 7세대, **g**=Graviton(ARM), xlarge=크기. `i` 접미사 = Intel, `a` = AMD.

### 2. 구매 옵션 (시험 빈출)

| 옵션 | 약정 | 할인 | 특징 |
|------|------|------|------|
| **On-Demand** | 없음 | 0% | 가장 비쌈, 자유 |
| **Reserved (RI)** | 1y/3y | ~72% | 인스턴스 타입 고정 |
| **Savings Plans (Compute)** | 1y/3y | ~66% | 패밀리/리전 자유 |
| **Savings Plans (EC2 Instance)** | 1y/3y | ~72% | 패밀리 고정, 크기 자유 |
| **Spot** | 즉시 | ~90% | 언제든 종료 가능, 2분 통지 |
| **Dedicated Host** | 약정 | - | 물리 서버 점유, BYOL 라이선스 |
| **Dedicated Instance** | 약정 | - | 단독 호스트, 호스트 가시성 없음 |
| **Capacity Reservation** | - | - | 용량 확보(할인 X) |

### 3. Spot 인스턴스 패턴

- **Stateless / Fault-tolerant**만 적합 (배치, 빅데이터, CI/CD, 컨테이너).
- **Spot Fleet / EC2 Fleet**: 여러 인스턴스 타입 / AZ에 분산 → 가용성 ↑.
- **Spot Block**(중단됨, 신규 X) 대신 **Capacity Reservation + On-Demand**.
- 종료 시 2분 알림 → graceful shutdown 가능.

### 4. Placement Group

| 모드 | 설명 | 사용 사례 |
|------|------|-----------|
| **Cluster** | 한 AZ에 가까이 배치, 최고 네트워크 | HPC, 저지연 클러스터 |
| **Spread** | AZ당 최대 7개, 다른 하드웨어 | 미션 크리티컬 소수 인스턴스 |
| **Partition** | 파티션 단위 분리(HDFS, Cassandra) | 분산 빅데이터 |

### 5. AMI / 사용자 데이터 / 메타데이터

- **AMI**: 부팅 이미지. AWS / Marketplace / 커스텀.
- **User Data**: 부팅 시 1회 실행 스크립트.
- **Instance Metadata Service (IMDSv2)**: 토큰 기반 → SSRF 방어. v1은 가능한 끄기.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Graviton** | ARM 기반, 가격 대비 성능 ~40% | 비용 최적화 + 호환 가능 시 추천 |
| **Hibernation** | RAM을 EBS에 저장하여 빠른 재개 | 라이선스/캐시 워밍 시 |
| **EC2 Auto Recovery** | StatusCheckFailed_System 시 자동 복구 | HA |
| **Termination Protection** | 실수 종료 방지 | 운영 보호 |
| **Shutdown Behavior** | stop vs terminate | OS shutdown 시 동작 |

> ⚠️ **함정**: "Spot이 갑자기 종료되면?" → 2분 알림이 있고, 워크로드는 Stateless여야 함. "데이터베이스 Spot" 같은 함정 등장.

> 💡 **암기 팁**: 약정 없는 가성비 = SP Compute > SP EC2 > RI. 어떤 시나리오에서 "유연성과 절감 둘 다" → **Compute SP**.

### 관련 서비스 Cross-Reference

- Auto Scaling → Day 4
- ALB → Day 3
- EBS / EFS → Day 2
- Cost 최적화 → Week 10

---

## 🏗️ 아키텍처 다이어그램

```
[ 비용 vs 유연성 그래프 ]

   비용 (저)
     │
     │ Spot ☆
     │
     │ SP Compute
     │ RI/SP-EC2
     │
     │ On-Demand
     │
     └─────────────── 유연성 (높음 ↑)

[ Placement Group 비교 ]

   Cluster:   [●●●●●] (한 AZ, 옆자리)  → 저지연
   Spread:    [●] AZ-a  [●] AZ-b  [●] AZ-c   → 격리
   Partition: [●●●] P1 | [●●●] P2 | [●●●] P3 → HDFS형
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **워크로드 → 패밀리**: 메모리=R, CPU=C, GPU=G/P, 스토리지=I/D, 디폴트=M, 변동=T.
2. ⭐ **Spot은 stateless 작업만**. 데이터베이스에 Spot 답 보이면 ❌.
3. ⭐ **SP Compute가 가장 유연**. SP EC2/RI는 더 큰 할인 + 덜 유연.
4. ⭐ **Cluster = 저지연 HPC / Spread = 격리 / Partition = 빅데이터 파티션**.
5. ⭐ **IMDSv2** 권장 — SSRF 방어. v1은 끄기.

---

## 💻 실제 예시 - AWS CLI

```bash
# 사용 가능한 인스턴스 타입 보기
aws ec2 describe-instance-types \
  --query 'InstanceTypes[?VCpuInfo.DefaultVCpus==`8`].[InstanceType,MemoryInfo.SizeInMiB]' \
  --output table

# Spot 인스턴스 한 번에 띄우기 (EC2 Fleet)
aws ec2 create-fleet --launch-template-configs file://lt.json \
  --target-capacity-specification TotalTargetCapacity=5,DefaultTargetCapacityType=spot \
  --type instant

# Placement Group (Cluster)
aws ec2 create-placement-group --group-name hpc-pg --strategy cluster

# Capacity Reservation
aws ec2 create-capacity-reservation \
  --instance-type m6i.large --instance-platform "Linux/UNIX" \
  --availability-zone ap-northeast-2a --instance-count 10
```

---

## 📝 연습 문제

**문제 1.** 인메모리 분석 워크로드(대용량 RAM 요구). 패밀리는?

A) C B) M C) R D) I

**정답: C**.

---

**문제 2.** 야간 ETL 배치(중단 허용)를 최대한 저렴하게:

A) On-Demand B) RI 3y C) Spot D) Dedicated Host

**정답: C**.

---

**문제 3.** HPC 클러스터 노드 간 최저 지연이 필요:

A) Cluster Placement Group B) Spread C) Partition D) Multi-AZ

**정답: A**.

---

**문제 4.** 3년 약정 + 패밀리/리전 자유롭게 변경 가능한 최대 할인:

A) RI B) Savings Plans Compute C) Savings Plans EC2 D) Spot

**정답: B**.

---

**문제 5.** EC2 SSRF 공격 방어를 위해 메타데이터 서비스 설정은?

A) v1 강제 B) v2 강제(토큰 기반) C) 완전 비활성 D) v1+v2 모두 허용

**정답: B**.

---

## 📌 오늘의 요약

1. 패밀리 선택은 워크로드의 병목 자원을 본다 (C/M/R/I/G).
2. 구매 옵션: 유연성 ↔ 할인의 trade-off. Compute SP가 균형.
3. Spot은 stateless 워크로드만.
4. Placement Group은 Cluster/Spread/Partition 3가지.
5. IMDSv2 + Graviton + Capacity Reservation 같은 신상 기능 챙기기.
