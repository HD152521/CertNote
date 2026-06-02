# Day 33 - Fargate 패턴과 비용 최적화

📅 날짜: Week 7 (Day 3)
🎯 주제: 서버리스 컨테이너 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Fargate의 과금 모델과 Spot 통합 패턴을 안다
- Fargate 컨테이너의 콜드 스타트·이미지 캐시 동작을 이해한다
- Task Definition 사이징(cpu·memory) 표준 조합과 비용 영향을 파악한다
- Fargate vs Lambda vs EC2의 비용 분기점을 식별한다

---

## 🧩 사전 지식 (CS 기초)

- **Bin Packing vs 서버리스**: EC2는 노드 자원을 한 그릇에 여럿 담는다(Bin Packing). Fargate는 Task별 micro VM이라 더 단순하지만 단위 비용이 높다.
- **vCPU**: 가상 CPU 단위. Fargate는 0.25/0.5/1/2/4/8/16 vCPU를 지원.
- **Burstable vs Provisioned**: T 시리즈는 Burstable, Fargate는 Provisioned (요청한 만큼 지속).

---

## 📖 이론 내용

### 1. Fargate 과금 모델

- **vCPU·시간 + 메모리·시간** (초 단위 청구, 1분 최소)
- 리전별 단가 다름. 대략: 0.04 USD / vCPU-hour + 0.004 USD / GB-hour
- Spot은 ~70% 할인

### 2. Task Definition 사이징 조합

| CPU | Memory 범위 |
|-----|-------------|
| 0.25 vCPU | 0.5/1/2 GB |
| 0.5 vCPU | 1–4 GB |
| 1 vCPU | 2–8 GB |
| 2 vCPU | 4–16 GB |
| 4 vCPU | 8–30 GB |
| 8 vCPU | 16–60 GB |
| 16 vCPU | 32–120 GB |

CPU 단위로 메모리 옵션이 정해져 있다. 잘못된 조합은 등록 실패.

### 3. Fargate Spot

- Capacity Provider로 weight 지정해 혼합
- 중단 시 2분 SIGTERM → 짧은 워크로드는 잘 어울림
- Stateful·실시간엔 부적합

### 4. Ephemeral Storage

- 기본 20 GB → 최대 200 GB까지 설정 가능 (Linux)
- 추가 분만큼 추가 과금
- 큰 임시 파일·캐시가 필요한 워크로드에 활용

### 5. Image Pull 최적화

- Fargate는 노드 캐시가 없어 매 Task마다 ECR Pull
- 이미지 크기 줄이기 + ECR Pull Through Cache·VPC Endpoint 활용
- **SOCI(Seekable OCI)**: 큰 이미지를 lazy 로딩해 시작 시간 단축

### 6. Fargate vs Lambda vs EC2 비용 분기

| 워크로드 | Lambda 유리 | Fargate 유리 | EC2 유리 |
|---------|-------------|-------------|----------|
| 짧은 이벤트 처리 (< 5분) | ⭐ | | |
| 장시간 백그라운드 (시간) | | ⭐ | ⭐ |
| 트래픽 일정 24/7 | | | ⭐ (RI/SP) |
| 트래픽 가변·서버 관리 회피 | | ⭐ | |

대략적 기준: vCPU 평균 50% 이상 + 24/7 = EC2 RI/SP가 가장 싸고, 그 외엔 Fargate/Lambda 검토.

### 7. Graviton 지원

- Fargate ARM64(Graviton) 지원 — ~20% 저렴
- 이미지 multi-arch 빌드 필요

### 8. 시나리오 패턴

- **백오피스 API**: ECS Fargate + ALB + Fargate Spot 80%
- **이벤트 처리 짧음**: Lambda
- **트래픽 일정 + 무거운 워크로드**: ECS on EC2 + Savings Plans
- **장시간 ML 추론(GPU)**: ECS on EC2 GPU (Fargate GPU는 제한)

---

## 🧠 알아두면 좋은 심화 이론

### Compute Savings Plans

- **Lambda + Fargate + EC2 모두 적용** (Compute SP)
- EC2 Instance SP는 EC2만
- Fargate 워크로드도 Compute SP로 1년/3년 약정 시 최대 50% 할인

### Application Auto Scaling

- ECS Service의 desired count를 CPU·메모리·SQS 큐 길이·custom 메트릭으로 자동 조정
- **Target Tracking**: CPU 70% 같은 목표값
- **Step Scaling**: 임계값별 단계 증감
- **Scheduled**: 시간 기반

---

## 🏗️ 아키텍처 — Fargate + Spot + Compute SP

```
[ALB]
   │
[ECS Service (Fargate)]
   │
   ├─ FARGATE (base 2, weight 1)         ← Compute SP 적용
   └─ FARGATE_SPOT (weight 4)            ← 70% 할인
        │
        └─ SIGTERM 핸들러로 graceful shutdown
```

---

## ⭐ 핵심 포인트

1. ⭐ vCPU·메모리 조합은 정해진 매트릭스만
2. ⭐ Fargate Spot 70% 할인, Capacity Provider 가중치
3. ⭐ Ephemeral Storage 기본 20GB → 200GB 가능 (추가 과금)
4. ⭐ Compute SP는 Lambda+Fargate+EC2 모두 커버
5. ⭐ Graviton Fargate ~20% 저렴
6. ⭐ Image Pull 캐시 없음 → SOCI·작은 이미지·Pull Through Cache

---

## 💻 실제 예시 - Application Auto Scaling

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/prod/myapp \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 50

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/prod/myapp \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 60.0,
    "PredefinedMetricSpecification": {"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}
  }'
```

---

## 📝 연습 문제

**문제 1.** 일정 패턴 트래픽·24/7 운영·대량 워커. 가장 저렴한 컨테이너 컴퓨트는?

A) Fargate On-Demand
B) Fargate Spot
C) ECS on EC2 + Compute Savings Plans
D) Lambda

**정답: C**
해설: 일정 24/7 + 대량 = EC2 + SP가 단가 가장 낮음.

---

**문제 2.** Fargate 콜드 스타트가 느린 이유와 개선책은?

A) 노드 캐시 없음 → SOCI·이미지 축소
B) ECS 컨트롤 플레인 느림
C) IAM 토큰 발급
D) Lambda VPC ENI

**정답: A**
해설: 노드 캐시 없어 매번 Pull. SOCI lazy loading·작은 이미지로 개선.

---

**문제 3.** Fargate 워크로드에도 적용되는 Savings Plans는?

A) EC2 Instance SP
B) Compute SP
C) RI
D) Standard RI

**정답: B**
해설: Compute SP만 Lambda+Fargate+EC2 모두 커버.

---

**문제 4.** Fargate Task에 추가 100GB 임시 스토리지가 필요하다.

A) EBS 볼륨 연결
B) Ephemeral Storage 100GB로 설정 (추가 과금)
C) EFS만 가능
D) Fargate는 임시 스토리지 확장 불가

**정답: B**
해설: 20GB 기본, 최대 200GB까지 ephemeral 설정 가능.

---

**문제 5.** Spot 중단에 대비해 graceful 종료를 구현하려면?

A) PreStop hook 무시
B) SIGTERM 핸들러 + stopTimeout 활용
C) ALB Deregistration Delay만
D) 즉시 종료

**정답: B**
해설: Spot은 2분 SIGTERM. 핸들러로 정리 + stopTimeout 늘림.

---

**문제 6.** Fargate ARM(Graviton)의 이점은?

A) 약 20% 저렴
B) GPU 무료
C) 윈도우 컨테이너 지원
D) 콜드 스타트 0

**정답: A**
해설: Graviton 인스턴스 ~20% 단가 절감.

---

## 📌 오늘의 요약

1. Fargate = 서버리스 데이터 플레인, 초 단위 과금
2. Spot 70%, Compute SP로 추가 할인
3. Ephemeral 20→200GB, Image Pull 최적화는 SOCI
4. Graviton ARM ~20% 절감
5. 24/7 일정 워크로드는 EC2 + SP가 단가 우위
