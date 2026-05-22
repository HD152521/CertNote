# Day 19 - EKS Anywhere, ECS Anywhere, 하이브리드 컨테이너

📅 날짜: Week 4 (Day 4)
🎯 주제: 컨테이너를 온프레미스로 — Anywhere 시리즈
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EKS·ECS Anywhere 동작 원리를 안다
- Outposts 컨테이너와 Anywhere 시리즈의 차이를 안다
- 하이브리드 컨테이너 시나리오 정답을 선택할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **Container Orchestration**: 컨테이너 스케줄링·복구·서비스 디스커버리.
- **Control Plane vs Data Plane**: 제어 평면(스케줄러) vs 데이터 평면(워커 노드).
- **CNCF Kubernetes Distribution**: 표준 호환 K8s 배포판.

---

## 📖 이론 내용

### 1. EKS Anywhere

- **EKS 호환 Kubernetes를 고객 하드웨어에 배포·운영**
- AWS가 만든 K8s distribution (EKS-D)
- 베어메탈·vSphere·Snow·Nutanix·CloudStack 지원
- **AWS 계정 연결 선택적** (Air-gapped 가능)
- Control Plane은 고객 자체 운영 (EKS와 다름)

**EKS vs EKS Anywhere**:
| | EKS | EKS Anywhere |
|---|-----|--------------|
| Control Plane | AWS Managed | 고객 자체 |
| 워커 | EC2/Fargate | 고객 하드웨어 |
| 위치 | AWS 리전 | 고객 DC |
| 인터넷 | 필수 | 선택 |

### 2. ECS Anywhere

- ECS 클러스터에 **온프레미스 서버를 External 노드로 등록**
- Control Plane = AWS ECS (관리됨)
- Data Plane = 고객 서버 (SSM Agent + ECS Agent)
- 정기적인 AWS 연결 필요

**EKS Anywhere vs ECS Anywhere**:
| | EKS Anywhere | ECS Anywhere |
|---|--------------|---------------|
| Control Plane | 고객 자체 | AWS Managed |
| Air-Gap | 가능 | 불가 (AWS 연결 필요) |
| 표준 | Upstream K8s | ECS 독자 |
| 사용 사례 | 자체 K8s 운영팀 | AWS 통합·간단 |

### 3. EKS on Outposts

- EKS Control Plane을 Outposts에서 (Local Cluster) 또는 리전에서 (Extended Cluster)
- AWS Managed
- 데이터센터에 강한 통합 + AWS 운영

### 4. 선택 가이드

| 시나리오 | 답 |
|---------|-----|
| 데이터 주권 + 강한 AWS 통합 | EKS on Outposts |
| 자체 K8s 운영팀·air-gapped | EKS Anywhere |
| ECS 사용 중 + 온프레미스 일부 통합 | ECS Anywhere |
| 컨테이너 + 다양한 OS·HW + AWS 외부 강하게 | EKS Anywhere |

### 5. 운영 통합 — EKS Connector·SSM

- **EKS Connector**: 외부 K8s 클러스터(EKS Anywhere, GKE, AKS, On-Prem)를 AWS 콘솔에서 가시화
- **SSM Fleet Manager**: 온프레미스 서버를 AWS에서 패치·인벤토리·접속

---

## 🧠 알아두면 좋은 심화 이론

### Bottlerocket

- AWS 컨테이너 전용 경량 OS
- EKS·ECS·Fargate에서 사용
- 보안·롤백·자동 업데이트

### Cross-Reference

- **Week 7**: ECS·EKS·Fargate 심화
- **Day 16**: Outposts

---

## 🏗️ 아키텍처 다이어그램 — ECS Anywhere

```
AWS Region
  └── ECS Control Plane (관리됨)
            │
            │  SSM Hybrid Activation
            ▼
On-Premises Data Center
  ┌────────────────────────┐
  │ External Instances     │
  │  SSM Agent + ECS Agent │
  │  Task 실행 (Docker)    │
  └────────────────────────┘
  ┌────────────────────────┐
  │ External Instances ... │
  └────────────────────────┘
```

---

## ⭐ 핵심 포인트

1. ⭐ **EKS Anywhere = 자체 K8s, air-gapped 가능**
2. ⭐ **ECS Anywhere = AWS Control Plane + 온프레 노드**
3. ⭐ EKS on Outposts = AWS Managed + 데이터센터 위치
4. ⭐ EKS Connector로 외부 K8s도 콘솔 가시화
5. ⭐ SSM Hybrid로 온프레미스 인스턴스 등록·패치

---

## 💻 실제 예시 - ECS Anywhere 등록

```bash
# Hybrid Activation 생성
aws ssm create-activation \
  --iam-role ecs-anywhere-role \
  --registration-limit 10 --description "OnPrem ECS Nodes"

# 온프레미스 서버에서 SSM Agent 설치 + activate
sudo amazon-ssm-agent -register \
  -code <activation-code> -id <activation-id> \
  -region ap-northeast-2

# ECS Agent 설치 후 클러스터에 join
```

---

## 📝 연습 문제

**문제 1.** 인터넷 없는 격리 환경, 자체 K8s 운영. Best?

A) ECS Anywhere (AWS 연결 필수)
B) EKS Anywhere (Air-gapped 가능)
C) EKS on Outposts (Service Link 필요)
D) Fargate

**정답: B**
해설: Air-gapped 가능한 것은 EKS Anywhere.

---

**문제 2.** ECS 클러스터에 일부 온프레 노드 추가. Best?

A) EKS Anywhere
B) ECS Anywhere
C) EKS on Outposts
D) Direct Connect

**정답: B**
해설: ECS Anywhere가 외부 노드 등록 표준.

---

**문제 3.** 데이터센터에 AWS Managed K8s. Best?

A) EKS Anywhere
B) ECS Anywhere
C) EKS on Outposts
D) Self-managed K8s

**정답: C**
해설: AWS Managed + 데이터센터 = EKS on Outposts.

---

**문제 4.** 외부 K8s(EKS Anywhere, GKE, On-prem)를 단일 AWS 콘솔에서 가시화. Best?

A) Kubernetes Dashboard
B) EKS Connector
C) Rancher
D) Prometheus

**정답: B**
해설: EKS Connector가 외부 K8s 가시화.

---

**문제 5.** ECS Anywhere의 Control Plane은?

A) 고객 자체
B) AWS Managed
C) Outposts
D) 선택 가능

**정답: B**
해설: ECS Anywhere는 AWS Managed Control Plane.

---

**문제 6.** EKS Anywhere의 Control Plane은?

A) AWS Managed
B) 고객 자체 (베어메탈/vSphere 등)
C) Fargate
D) Lambda

**정답: B**
해설: EKS Anywhere는 고객이 Control Plane 운영.

---

## 📌 오늘의 요약

1. EKS Anywhere = 자체 K8s, air-gapped 가능
2. ECS Anywhere = AWS Managed CP + 온프레 노드 + AWS 연결 필요
3. EKS on Outposts = AWS Managed + 데이터센터
4. EKS Connector로 외부 K8s 콘솔 가시화
5. 자체 운영팀 강함 → EKS Anywhere, AWS 통합 중심 → ECS Anywhere
