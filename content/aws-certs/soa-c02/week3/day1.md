# Day 1 - CloudWatch Alarms (Composite, Anomaly, M of N)

📅 날짜: Week 3 (Day 1)
🎯 주제: 알람의 상태 머신, 평가 모드, 노이즈 줄이는 운영 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Alarm의 3가지 상태와 평가 알고리즘을 이해한다
- Composite Alarm으로 알람 노이즈를 줄이는 방법을 익힌다
- M of N 평가, Treat Missing Data 옵션을 시나리오별로 활용한다

---

## 🧩 사전 지식 (CS 기초)

- **Finite State Machine**: 유한 상태를 가진 시스템. 알람은 OK / ALARM / INSUFFICIENT_DATA 3개 상태
- **Alert fatigue**: 알람 과다로 진짜 중요한 알람을 놓치는 현상. 운영팀의 적
- **False positive vs False negative**: 잘못된 알람 vs 놓친 사고. 둘 다 운영자 책임
- **Hysteresis**: 임계값 진동 방지. 동일 임계값이지만 진입/이탈 기준 다르게
- **Backoff·Debounce**: 잦은 트리거 방지를 위한 시간 지연

---

## 📖 이론 내용

### 1. CloudWatch Alarm의 3가지 상태

| 상태 | 의미 |
|------|------|
| **OK** | 메트릭이 임계값 안에 있음 |
| **ALARM** | 임계값 위반 |
| **INSUFFICIENT_DATA** | 데이터 부족 (메트릭 미수신, 최근 알람 생성 등) |

상태 전이마다 EventBridge 이벤트 발생 → Lambda·SNS·SSM Automation·Auto Scaling 트리거 가능.

### 2. 알람 평가 알고리즘 - M of N

핵심 개념: **"최근 N개 데이터 포인트 중 M개가 임계값 위반하면 ALARM"**

- `EvaluationPeriods` = N (관찰할 데이터 포인트 수)
- `DatapointsToAlarm` = M (그 중 몇 개가 위반해야 ALARM)
- `Period` = 한 데이터 포인트가 표현하는 시간 (초)

#### 예시
- Period 60초, EvaluationPeriods 5, DatapointsToAlarm 3
- → 최근 5분 중 3분이 임계값 위반 시 ALARM

#### 시험에서 자주 나오는 패턴
- `M = N`인 경우: "연속 N회 위반"
- `M < N`인 경우: 노이즈 견딤. 일시적 spike를 무시
- N이 클수록 반응 느림, M이 작을수록 노이즈에 민감

### 3. Treat Missing Data (시험 빈출)

메트릭 데이터가 없을 때 어떻게 처리할지:

| 옵션 | 동작 | 사용 사례 |
|------|------|-----------|
| **missing** (기본) | 누락 데이터 무시. 다른 데이터로 평가 | 일반적 |
| **notBreaching** | 누락 = 정상으로 간주 | 임시 idle 워크로드 |
| **breaching** | 누락 = 위반으로 간주 | 핵심 가용성 모니터링 |
| **ignore** | 알람 상태 변경 안 함 | 직전 상태 유지 |

> ⚠️ 함정: 기본값 `missing`은 데이터가 일정 시간 없으면 INSUFFICIENT_DATA로. EC2가 종료되면 메트릭이 안 들어와 알람이 INSUFFICIENT_DATA로 영원히 머무를 수 있음.

### 4. Composite Alarm (알람 조합)

#### 왜 필요한가
- 알람 노이즈 폭증: 한 사고에 EC2/RDS/ALB가 동시에 알람
- 같은 사고를 여러 채널로 알림 → Alert Fatigue

#### Composite Alarm 표현식
```
ALARM("EC2-CPU-High") AND ALARM("ALB-5xx-High")
ALARM("RDS-CPU-High") OR ALARM("RDS-Connections-High")
(ALARM("a") OR ALARM("b")) AND NOT ALARM("c")
```

#### Actions Suppressor
- 자식 알람의 액션은 발화하지 않고, Composite Alarm만 알림
- 진짜 중요한 알람만 사람에게 전달

### 5. 알람 액션 (Action)

알람 상태 변경 시 트리거 가능한 액션:

| 액션 | 설명 |
|------|------|
| **SNS Topic** | 이메일·SMS·Slack 등 알림 (가장 흔함) |
| **Auto Scaling Policy** | EC2 스케일 아웃/인 |
| **EC2 Action** | Stop·Terminate·Reboot·Recover |
| **SSM OpsItem** | OpsCenter에 운영 이슈 생성 |
| **SSM Incident Manager** | 인시던트 관리 워크플로 시작 |
| **Lambda** | (EventBridge 경유) 임의 동작 |

#### EC2 Auto Recovery
- 알람 액션 `recover` 사용 시 EC2가 인스턴스 상태 점검 실패 시 자동 복구
- 동일 AZ에서 새 호스트로 마이그레이션 (IP·EBS 유지)
- 메트릭: `StatusCheckFailed_System` (AWS 인프라 문제)
- 시험 함정: `StatusCheckFailed_Instance`는 게스트 OS 문제 → Recover X (재시작 필요)

### 6. Anomaly Detection 알람 (Week 2 Day 4 복습)

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "API-Latency-Anomaly" \
  --metrics '[
    {"Id":"m1","MetricStat":{"Metric":{"Namespace":"AWS/ApiGateway","MetricName":"Latency"},"Period":300,"Stat":"Average"}},
    {"Id":"ad1","Expression":"ANOMALY_DETECTION_BAND(m1, 2)"}
  ]' \
  --threshold-metric-id ad1 \
  --comparison-operator GreaterThanUpperThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2
```

- `GreaterThanUpperThreshold`: 밴드 위로 벗어남만 (느려졌을 때만 알람)
- 2 of 3: 노이즈 견딤

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Metric Math Alarm** | `errors/requests*100` 같은 식으로 알람 | 에러율 알람 표준 패턴 |
| **High Resolution Alarm** | 10초 또는 30초 평가 | 분당 $0.30 |
| **Alarm History** | 상태 변경 이력 (최대 2주) | 사후 분석 |
| **Cross-Region Alarm** | 다른 리전 메트릭은 직접 불가 → 메트릭 복사 또는 EventBridge | 함정 |
| **Alarm Limit** | 계정당 5,000개 (요청 시 증가) | 거버넌스 고려 |

> ⚠️ **함정 1**: 알람은 같은 리전 메트릭만 평가 가능. Cross-Region은 EventBridge 또는 메트릭 스트림으로 복사 필요.
>
> ⚠️ **함정 2**: 알람 생성 직후 INSUFFICIENT_DATA 상태로 시작. 첫 데이터 도착까지 알람 동작 X.
>
> 💡 **암기 팁**: M of N + Treat Missing Data + Composite Alarm 3종 세트가 노이즈 줄이기 핵심.

### 관련 서비스 Cross-Reference

- **Alarms → Week 3 Day 2** (Dashboard에 알람 위젯)
- **Alarms → Week 5 SSM** (알람 → SSM Automation으로 자동 복구)
- **Alarms → Week 9 GuardDuty** (보안 알람)
- **Alarms → Week 11 Budgets** (비용 알람도 비슷한 메커니즘)

---

## 🏗️ 아키텍처 다이어그램

```
알람 상태 머신 + 액션
==========================================================

      [메트릭 데이터 도착]
              │
              ▼
      ┌──────────────┐
      │  평가 엔진   │  ← Period, M of N, Threshold 적용
      └──────┬───────┘
             │
   ┌─────────┼─────────┬─────────────┐
   ▼         ▼         ▼             ▼
  [OK]   [ALARM]  [INSUFFICIENT]  (상태 변경 시 액션)
                                       │
              ┌──────────────────┬────┴───────┬────────────┐
              ▼                  ▼            ▼            ▼
            [SNS]          [Auto Scaling]  [EC2 Action]  [SSM/Lambda]
              │
   이메일·SMS·Slack·PagerDuty
```

```
Composite Alarm 노이즈 감소 패턴
==========================================================

  자식 알람 (액션 Suppress):
   - High-CPU
   - High-Memory
   - High-Disk-IO
   - ALB-5xx
                  │
                  ▼
       ┌──────────────────────┐
       │  Composite Alarm     │
       │  (High-CPU AND       │
       │   ALB-5xx) OR ...    │
       └────────┬─────────────┘
                ▼
            [SNS → PagerDuty]
       (진짜 사고일 때만 사람 깨움)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **M of N 평가** — `EvaluationPeriods` 중 `DatapointsToAlarm` 개 위반 시 ALARM
2. ⭐ **Treat Missing Data**: missing(기본) / notBreaching / breaching / ignore
3. ⭐ **EC2 Auto Recovery는 `StatusCheckFailed_System`만** — Instance 체크는 재시작 필요
4. ⭐ **Composite Alarm으로 노이즈 감소** — 부모만 알림, 자식 액션은 suppress
5. ⭐ **알람은 같은 리전만** — Cross-Region은 메트릭 스트림 또는 EventBridge

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. 기본 알람 - CPU 80% 3 of 5 평가
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-HighCPU" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 60 \
  --statistic Average \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 5 \
  --datapoints-to-alarm 3 \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:123:ops-alerts

# 2. EC2 Auto Recovery 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-StatusCheck-System-Recover" \
  --metric-name StatusCheckFailed_System \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 60 \
  --statistic Maximum \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions "arn:aws:automate:ap-northeast-2:ec2:recover"

# 3. Metric Math 에러율 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "ALB-ErrorRate-High" \
  --metrics '[
    {"Id":"e","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB","MetricName":"HTTPCode_Target_5XX_Count","Dimensions":[{"Name":"LoadBalancer","Value":"app/my-alb/abc"}]},"Period":60,"Stat":"Sum"},"ReturnData":false},
    {"Id":"r","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB","MetricName":"RequestCount","Dimensions":[{"Name":"LoadBalancer","Value":"app/my-alb/abc"}]},"Period":60,"Stat":"Sum"},"ReturnData":false},
    {"Id":"er","Expression":"e/r*100","Label":"Error Rate","ReturnData":true}
  ]' \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2

# 4. Composite Alarm
aws cloudwatch put-composite-alarm \
  --alarm-name "Service-Degraded" \
  --alarm-rule 'ALARM("ALB-5xx-High") AND (ALARM("EC2-HighCPU") OR ALARM("RDS-Connections-High"))' \
  --actions-enabled \
  --alarm-actions arn:aws:sns:ap-northeast-2:123:pagerduty

# 5. Anomaly Detection 알람
aws cloudwatch put-anomaly-detector \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=order-service \
  --stat Sum

aws cloudwatch put-metric-alarm \
  --alarm-name "Lambda-Anomaly" \
  --metrics '[
    {"Id":"m1","MetricStat":{"Metric":{"Namespace":"AWS/Lambda","MetricName":"Invocations","Dimensions":[{"Name":"FunctionName","Value":"order-service"}]},"Period":300,"Stat":"Sum"}},
    {"Id":"ad1","Expression":"ANOMALY_DETECTION_BAND(m1, 2)"}
  ]' \
  --threshold-metric-id ad1 \
  --comparison-operator LessThanLowerOrGreaterThanUpperThreshold \
  --evaluation-periods 2
```

---

## 📝 연습 문제

**문제 1.** 운영팀이 한 시간에 한 번씩 5초 동안 CPU spike가 정상 운영 중에도 발생한다. 알람이 매번 울려서 피곤하다. 어떻게 설정해야 하나?

A) Threshold를 낮춘다
B) DatapointsToAlarm을 1로
C) EvaluationPeriods=5, DatapointsToAlarm=4 같은 M of N 사용 (일시적 spike 무시)
D) Period를 줄인다

**정답: C**
해설: M of N으로 일시적 noise 견딤. 5분 중 4분 위반 시에만 알람 → 잠시 spike는 무시. Composite Alarm도 함께 고려.

---

**문제 2.** EC2 인스턴스 종료 후에도 알람이 INSUFFICIENT_DATA로 영원히 머무른다. 어떻게 정리하나?

A) Treat Missing Data를 `breaching`으로 변경
B) Treat Missing Data를 `notBreaching`으로 → 정상 처리되거나, 알람을 삭제 또는 인스턴스 ID 제거 시 자동 정리되도록 Tag 기반 관리
C) 무시
D) 알람 자체를 IGNORE

**정답: B**
해설: 인스턴스가 사라지면 메트릭도 안 옴. `notBreaching`이면 OK 상태로 머무름. 자동화 측면에선 Tag 기반 동적 알람 관리(Lambda나 IaC)가 정석.

---

**문제 3.** 다음 중 EC2 Auto Recovery 알람으로 처리 가능한 시나리오는?

A) 게스트 OS의 메모리 누수
B) 호스트 머신(AWS 측) 하드웨어 장애 — `StatusCheckFailed_System`
C) 애플리케이션 데드락
D) 디스크 가득 참

**정답: B**
해설: Auto Recovery는 AWS 측 호스트 장애만. 게스트 OS·앱 문제는 재시작/SSM Automation으로 대응. 두 체크의 의미:
- `StatusCheckFailed_System`: AWS 인프라 문제 → Recover
- `StatusCheckFailed_Instance`: 게스트 문제 → 재부팅 필요

---

**문제 4.** 회사의 한 사고에서 EC2·RDS·ALB 모두 알람 → 15개의 PagerDuty 알림이 동시에 발생했다. 노이즈를 줄이려면?

A) 알람들의 임계값을 모두 올린다
B) 자식 알람들의 액션을 disable, Composite Alarm으로 묶어 부모만 PagerDuty로 전송
C) 알람을 줄인다
D) 사람 한 명만 받게 한다

**정답: B**
해설: Composite Alarm의 핵심 사용 사례. Actions Suppressor로 자식 액션을 비활성하고, AND/OR로 조합한 부모 알람만 사람에게 통지.

---

**문제 5.** Anomaly Detection 알람으로 "평소보다 응답시간이 느려진 경우"만 알림하려 한다. 올바른 ComparisonOperator는?

A) GreaterThanThreshold
B) LessThanLowerOrGreaterThanUpperThreshold
C) GreaterThanUpperThreshold
D) LessThanLowerThreshold

**정답: C**
해설: 응답시간은 "더 빠른" 건 문제 X, "더 느린" 것만 문제. 그래서 밴드 상한 초과만 알람 → `GreaterThanUpperThreshold`. 양방향 모두 알람할 거면 `LessThanLowerOrGreaterThanUpperThreshold`.

---

## 📌 오늘의 요약

1. 알람 상태 3가지: OK / ALARM / INSUFFICIENT_DATA. 전이 시 액션 발화
2. M of N 평가로 노이즈 견딤. EvaluationPeriods × Period가 반응 시간 결정
3. Treat Missing Data 4옵션 — `notBreaching`이 idle 워크로드/종료된 인스턴스에 유용
4. EC2 Auto Recovery는 `StatusCheckFailed_System`만 — 호스트 장애에 자동 복구
5. Composite Alarm으로 알람 노이즈 감소 — 자식 액션 suppress + 부모만 사람 알림
