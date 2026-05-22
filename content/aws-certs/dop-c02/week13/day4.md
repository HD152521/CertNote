# Day 4 - Resilience Hub + Fault Injection Simulator

📅 날짜: Week 13 (Day 4)
🎯 주제: 복원력 평가 + 카오스 엔지니어링
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Resilience Hub로 RTO/RPO 측정·검증
- FIS Experiment Template과 Action
- 자동 정기 카오스 실행 + Stop Condition
- Chaos Engineering 원칙

---

## 🧩 사전 지식 (CS 기초)

- **Resilience**: 장애 후 복구 능력.
- **Chaos Engineering**: 의도된 장애 주입으로 시스템 검증 (Netflix Chaos Monkey).
- **Blast Radius**: 카오스 실험의 영향 범위.
- **Stop Condition**: 실험 중단 트리거 (안전망).

---

## 📖 이론 내용

### 1. AWS Resilience Hub

- 워크로드(앱)를 등록 → 분석
- 사용 가능한 정책: RTO/RPO 목표 설정
- 권장 개선안 + 비용 영향
- FIS와 통합 — 자동 카오스 실험
- 정기 보고서

```bash
aws resiliencehub create-app --name checkout-app \
  --policy-arn arn:aws:resiliencehub:...:resiliency-policy/tier1
```

### 2. FIS (Fault Injection Simulator)

지원 fault:
- **EC2**: Stop, Terminate, Reboot, API Throttle, CPU/Memory stress
- **ECS/EKS**: Task/Pod kill, Container stress
- **RDS**: Failover, Restart
- **Network**: 패킷 손실, latency, DNS 오류 (SSM Agent 기반)
- **API Throttling**: 특정 AWS API에 throttle 주입

### 3. Experiment Template

```bash
aws fis create-experiment-template \
  --tags Name=ec2-cpu-stress \
  --description "30% EC2 CPU stress for 5 min" \
  --role-arn arn:aws:iam::...:role/FISRole \
  --targets '{
    "myInstances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": {"Environment":"prod"},
      "selectionMode": "PERCENT(30)"
    }
  }' \
  --actions '{
    "cpuStress": {
      "actionId": "aws:ssm:send-command",
      "parameters": {
        "documentArn":"arn:aws:ssm:::document/AWSFIS-Run-CPU-Stress",
        "duration":"PT5M"
      },
      "targets": {"Instances":"myInstances"}
    }
  }' \
  --stop-conditions '[{
    "source":"aws:cloudwatch:alarm",
    "value":"arn:aws:cloudwatch:...:alarm:P99Latency"
  }]'
```

### 4. Stop Conditions

실험 중 알람 발생 시 즉시 중단 — 운영 영향 최소화.
- CloudWatch Alarm
- 사용자 정의 (Lambda → CloudWatch)

### 5. Targets 선택

- **ResourceArns**: 명시
- **ResourceTags**: 태그 매칭
- **SelectionMode**: ALL / COUNT(N) / PERCENT(N%)

### 6. 정기 카오스 실행

EventBridge Scheduler로 매주 한 번 자동:
```
Scheduler (cron) → Lambda → fis:StartExperiment
```

결과 → CloudWatch / Resilience Hub.

### 7. Chaos Engineering 원칙

1. **Hypothesis**: 시스템이 X 장애를 견딘다는 가설
2. **Steady State**: 정상 지표 (성공률 99%)
3. **Small Blast Radius** 시작 → 확대
4. **Production-like environment** (Staging부터)
5. **Stop Conditions** 항상
6. **Automate + Learn**

---

## 🧠 알아두면 좋은 심화 이론

### Application Recovery Controller (ARC) + FIS

- ARC Routing Control 전환을 FIS Action으로
- DR 페일오버 자동 검증

### Multi-AZ Power Failure Simulation

```bash
# AZ-a의 모든 인스턴스 동시 중지
aws fis ... --action 'aws:network:disrupt-connectivity' ...
```

### EKS Chaos

- FIS EKS Action: Pod kill
- Chaos Mesh / Litmus 등 외부 도구도 결합 가능

### Game Day vs Chaos Engineering

| Game Day | Chaos Engineering |
|----------|---------------------|
| 일회성 이벤트 | 정기 자동 |
| 사람 주도 | 자동화 |
| 학습 위주 | 검증 + 학습 |
| 분기/연 | 일/주 |

### 관련 서비스 Cross-Reference

- **DR 4 전략** → Week 13 Day 3
- **EventBridge** → Week 12 Day 1
- **CloudWatch Alarm** → Week 10 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
FIS Experiment Lifecycle
==================================================

  EventBridge Scheduler (weekly)
        │
        ▼
  Lambda → fis:StartExperiment
        │
        ▼
  FIS Experiment Template
   ├─ Targets (tag-based, 30%)
   ├─ Actions (CPU stress, latency)
   ├─ Stop Conditions (CW Alarms)
   └─ Duration

        │
        ▼
  System under stress
   ├─ Auto-healing kicks in (ASG, ECS, etc.)
   ├─ Alarms monitor
   └─ If P99 > threshold → Stop Condition triggers

        │
        ▼
  Report
   ├─ Resilience Hub assessment update
   ├─ Slack notification
   └─ Lessons added to Runbook
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Resilience Hub로 RTO/RPO 측정·검증·권고
2. ⭐ FIS = AWS 네이티브 카오스 엔지니어링
3. ⭐ Stop Condition으로 안전망
4. ⭐ Target 선택 모드: ALL / COUNT(N) / PERCENT(N%)
5. ⭐ EventBridge Scheduler + FIS로 정기 카오스 자동화

---

## 💻 실제 예시

```bash
# FIS Role 생성 (생략)

# Experiment Template (위 예시)
aws fis create-experiment-template --cli-input-json file://template.json

# 시작
aws fis start-experiment --experiment-template-id EXT-abc

# Resilience Hub
aws resiliencehub create-resiliency-policy --policy-name Tier1 \
  --policy '{
    "Hardware":{"rtoInSecs":300,"rpoInSecs":60},
    "Software":{"rtoInSecs":300,"rpoInSecs":60},
    "AZ":{"rtoInSecs":600,"rpoInSecs":120},
    "Region":{"rtoInSecs":3600,"rpoInSecs":600}
  }' \
  --tier MissionCritical

aws resiliencehub publish-app-version --app-arn ...
aws resiliencehub start-app-assessment --app-arn ... --assessment-name weekly
```

---

## 📝 연습 문제

**1.** "EC2 30%에 CPU stress 5분" FIS?  A) Target PERCENT(30) + Action AWSFIS-Run-CPU-Stress  **정답: A**

**2.** "실험 중 P99 폭증 시 자동 중단"?  A) Stop Condition (CloudWatch Alarm)  **정답: A**

**3.** Resilience Hub의 핵심?  A) RTO/RPO 측정 + 권고 + FIS 통합  **정답: A**

**4.** 정기 카오스 자동화?  A) EventBridge Scheduler + Lambda + fis:StartExperiment  **정답: A**

**5.** Chaos Engineering 원칙?  A) Hypothesis + Steady State + Small Blast + Stop Condition + Automate  **정답: A**

**6.** DR 페일오버 자동 검증?  A) Route 53 ARC + FIS  **정답: A**

**7.** Game Day vs Chaos?  A) Game Day는 일회성 이벤트, Chaos는 정기 자동  **정답: A**

---

## 📌 오늘의 요약

1. Resilience Hub로 RTO/RPO 측정·권고
2. FIS = AWS 네이티브 카오스 엔지니어링
3. Stop Condition 안전망
4. Target ALL/COUNT/PERCENT
5. 정기 카오스 = Scheduler + Lambda + FIS
