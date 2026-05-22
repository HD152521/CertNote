# Day 3 - Lambda 자동 복구 패턴 - Auto-Healing

📅 날짜: Week 12 (Day 3)
🎯 주제: 사람 개입 없는 자동 복구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Alarm → EventBridge → Lambda 복구 흐름
- 자동 복구 일반 패턴 (재시작, 스케일, 격리, 페일오버)
- 자동 복구의 안전망 (Circuit Breaker, Cooldown, 알림 백업)
- Auto Healing in ASG/ECS/EKS

---

## 🧩 사전 지식 (CS 기초)

- **MTTR (Mean Time to Restore)**: 복구 시간. 자동화의 1차 목표.
- **Auto-healing**: 시스템이 스스로 복구.
- **Cooldown**: 같은 액션 반복 방지.
- **Circuit Breaker**: 반복 실패 시 자동 중단.

---

## 📖 이론 내용

### 1. 복구 패턴 종류

| 패턴 | 예 |
|------|-----|
| 재시작 | EC2 Reboot, ECS Task Force Restart, Lambda 다시 호출 |
| 격리 | SG 변경, ALB 디레지스터, ASG instance protection 해제 |
| 페일오버 | Route 53 health check, RDS Multi-AZ |
| 스케일 | ASG/Application Auto Scaling 즉시 desired count 증가 |
| 자원 교체 | ASG ReplaceUnhealthy, ECS Service ForceNewDeployment |
| 회로 차단 | 외부 의존 호출 일시 중단 |

### 2. ASG Auto-Healing

```bash
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name myapp \
  --health-check-type ELB \
  --health-check-grace-period 300
```

- ELB 헬스체크 사용
- Grace Period: 새 인스턴스 부팅 후 헬스체크 무시
- Unhealthy 발견 → 자동 종료 + 새 인스턴스

### 3. EC2 Auto Recovery (인프라 장애)

- CloudWatch Alarm `StatusCheckFailed_System` → EC2 Recover Action
- 하부 하드웨어 장애 시 자동 마이그레이션
- ENI/IP/EBS 유지

```bash
aws cloudwatch put-metric-alarm --alarm-name EC2Recover \
  --metric-name StatusCheckFailed_System \
  --namespace AWS/EC2 --statistic Maximum --period 60 \
  --evaluation-periods 2 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=InstanceId,Value=i-xxx \
  --alarm-actions arn:aws:automate:ap-northeast-2:ec2:recover
```

### 4. ECS Auto-Healing

- Task Definition healthCheck → 실패 시 자동 교체
- ECS Service Auto Scaling
- ECS Deployment Circuit Breaker (Week 6 Day 2)

### 5. Lambda 자동 복구 패턴 — 대표 예

```python
def handler(event, context):
    # CW Alarm event
    detail = event['detail']
    instance_id = detail['dimensions']['InstanceId']
    state = detail['state']['value']
    if state != 'ALARM':
        return
    # 격리
    ec2 = boto3.client('ec2')
    ec2.modify_instance_attribute(
        InstanceId=instance_id,
        Groups=['sg-quarantine']
    )
    # 알림
    sns.publish(TopicArn=os.environ['ALERT_TOPIC'],
                Subject=f'Quarantined {instance_id}',
                Message=str(detail))
    # 티켓
    create_jira_incident(instance_id, detail)
```

### 6. Safe Auto-Healing 원칙

| 원칙 | 구현 |
|------|------|
| Idempotent | 같은 알람 반복 트리거에 안전 |
| Cooldown | 30분 내 같은 인스턴스 재격리 방지 (DynamoDB) |
| Bounded action | 한 번에 최대 N개 인스턴스만 |
| Audit trail | 모든 자동 작업을 CloudTrail/로그에 |
| Alert backup | 사람에게도 즉시 알림 |
| Disable switch | 자동화 일시 중단 플래그 (AppConfig) |

### 7. Route 53 + Health Check 자동 페일오버

- Primary/Secondary 레코드
- Health Check 실패 시 트래픽 자동 시프트
- 별도 리전, 별도 ALB로 DR

---

## 🧠 알아두면 좋은 심화 이론

### Step Functions 기반 복구 워크플로

복잡한 복구 (예: DB 페일오버 + 캐시 무효화 + Slack 알림 + 티켓 생성):
- Step Functions State Machine
- 각 단계 재시도/Catch
- 마지막에 모든 결과 보고

### Game Day 검증

자동 복구 로직은 정기 검증 필요:
- FIS(Fault Injection Simulator)로 EC2/ECS/RDS 장애 주입
- 자동화가 의도대로 동작하는지 확인

### Lambda 자체 복구

Lambda 실패 시:
- Async invocation → DLQ (SQS) + EventBridge Retry
- Lambda Destinations → 성공/실패별 다른 타겟

### EC2 Instance Connect Endpoint

자동 복구 후 디버깅 — EICE를 통한 사설 SSH 접근.

### 관련 서비스 Cross-Reference

- **EventBridge** → Week 12 Day 1
- **SSM Automation** → Week 12 Day 2
- **FIS** → Week 13 Day 4
- **CloudWatch Alarm** → Week 10 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Auto-Healing Pipeline
==================================================

  Symptom Source
   ├─ CloudWatch Alarm (CPU, Memory, 5xx)
   ├─ GuardDuty Finding
   ├─ EC2 StatusCheck
   ├─ ALB Target Group health
   └─ Synthetics failure

         │
         ▼
   EventBridge Rule (pattern match)
         │
         ▼
   Decision
   ├─ Simple: Lambda → quick fix
   ├─ Complex: Step Functions
   ├─ Standard: SSM Automation Runbook
   └─ Critical: Incident Manager (Week 12 Day 4)

         │
         ▼
   Actions
   ├─ Reboot / Replace / Quarantine
   ├─ Scale out
   ├─ Failover (Route 53 / RDS)
   └─ Notify (SNS / Chatbot / PagerDuty)

         │
         ▼
   Verify (Lambda waits + health check)
         │
         ▼
   Postmortem note in OpsCenter / Jira
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ MTTR 단축의 정공법 = 자동 복구 (사람 알림은 백업)
2. ⭐ ASG ELB health check + Auto Replacement
3. ⭐ EC2 StatusCheckFailed_System → ec2:recover 액션
4. ⭐ Cooldown + Idempotent + Bounded Action으로 폭주 방지
5. ⭐ FIS로 자동화 정기 검증

---

## 💻 실제 예시 — EventBridge → Lambda → 자동 복구

```python
# Lambda
import boto3, os, time
ec2 = boto3.client('ec2')
dynamodb = boto3.resource('dynamodb')
cooldown = dynamodb.Table(os.environ['COOLDOWN_TABLE'])

def handler(event, context):
    detail = event['detail']
    instance_id = detail['resource']['instanceDetails']['instanceId']
    now = int(time.time())

    # Cooldown 검사
    last = cooldown.get_item(Key={'instanceId': instance_id}).get('Item')
    if last and now - last['lastAt'] < 1800:
        print('Cooldown active, skip')
        return

    # 격리
    ec2.modify_instance_attribute(InstanceId=instance_id, Groups=['sg-quarantine'])

    # Cooldown 기록
    cooldown.put_item(Item={'instanceId': instance_id, 'lastAt': now})

    # 백업 알림
    sns = boto3.client('sns')
    sns.publish(TopicArn=os.environ['ONCALL_TOPIC'],
                Subject=f'Quarantined {instance_id}',
                Message=str(detail))
```

---

## 📝 연습 문제

**1.** EC2 하드웨어 장애 자동 복구?  A) Alarm + ec2:recover action B) Lambda 매번  **정답: A**

**2.** 자동 복구 폭주 방지?  A) Cooldown(DynamoDB) + Idempotent + Bounded action  **정답: A**

**3.** ASG의 Auto-Healing?  A) Health Check Type=ELB + Grace Period B) Lambda  **정답: A**

**4.** "GuardDuty Critical → EC2 격리 + 알림 + 티켓"?  A) EventBridge → SSM Automation 또는 Lambda  **정답: A**

**5.** 자동화 검증?  A) FIS로 정기 장애 주입 + Game Day  **정답: A**

**6.** Lambda 비동기 실패 보존?  A) DLQ(SQS) + EventBridge Retry / Lambda Destinations  **정답: A**

**7.** "복구 단계가 분기·대기·재시도 복잡"?  A) Lambda B) Step Functions  **정답: B**

---

## 📌 오늘의 요약

1. 자동 복구로 MTTR 직접 단축
2. ASG ELB Health Check, EC2 ec2:recover
3. Cooldown + Idempotent + Bounded action 안전망
4. 복잡 복구는 Step Functions
5. FIS로 정기 검증
