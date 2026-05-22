# Day 46 - CloudWatch: 지표, 로그, 알람

📅 날짜: 2026년 7월 19일 (일요일)  
🎯 주제: Amazon CloudWatch  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch 지표와 사용자 정의 지표를 이해한다
- CloudWatch Logs로 애플리케이션 로그를 관리한다
- CloudWatch 알람으로 자동화된 대응을 구현한다

---

## 📖 이론 내용

### 1. CloudWatch 지표 (Metrics)

AWS 서비스가 자동으로 보내는 성능 지표입니다.

**EC2 기본 지표:**
- `CPUUtilization`: CPU 사용률
- `NetworkIn/Out`: 네트워크 트래픽
- `StatusCheckFailed`: 인스턴스 상태 확인

**⭐ EC2 기본 지표에 포함되지 않는 것:**
- 메모리 사용률 (RAM)
- 디스크 사용량 (Disk Space)
→ CloudWatch Agent 설치 필요

```bash
# CloudWatch Agent 설치 (Amazon Linux 2)
sudo yum install amazon-cloudwatch-agent

# 설정 파일 생성
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard

# 에이전트 시작
sudo systemctl start amazon-cloudwatch-agent
```

### 2. 사용자 정의 지표 (Custom Metrics)

```python
import boto3

cloudwatch = boto3.client('cloudwatch')

# 사용자 정의 지표 전송
cloudwatch.put_metric_data(
    Namespace='MyApplication',
    MetricData=[
        {
            'MetricName': 'ActiveUsers',
            'Value': 150,
            'Unit': 'Count',
            'Dimensions': [
                {
                    'Name': 'Environment',
                    'Value': 'Production'
                }
            ]
        }
    ]
)
```

**기본 해상도**: 1분  
**고해상도 (High Resolution)**: 1초 (스토리지 비용 추가)

### 3. CloudWatch Logs

```python
import boto3
import time

logs = boto3.client('logs')

# 로그 그룹 생성
logs.create_log_group(logGroupName='/myapp/application')

# 로그 보존 기간 설정 (일)
logs.put_retention_policy(
    logGroupName='/myapp/application',
    retentionInDays=30
)

# 로그 이벤트 전송
logs.put_log_events(
    logGroupName='/myapp/application',
    logStreamName='instance-1',
    logEvents=[
        {
            'timestamp': int(time.time() * 1000),
            'message': 'ERROR: Database connection failed'
        }
    ]
)
```

**CloudWatch Logs Insights:**
```sql
-- 에러 로그 조회
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 20
```

### 4. CloudWatch 알람

```python
# CPU 사용률 80% 초과 시 알람
cloudwatch.put_metric_alarm(
    AlarmName='HighCPU',
    MetricName='CPUUtilization',
    Namespace='AWS/EC2',
    Period=300,        # 5분
    EvaluationPeriods=2,  # 연속 2회
    Threshold=80.0,
    ComparisonOperator='GreaterThanThreshold',
    AlarmActions=['arn:aws:sns:...'],  # SNS 알림
    Dimensions=[{'Name': 'InstanceId', 'Value': 'i-1234567890'}]
)
```

**알람 상태:**
- `OK`: 정상
- `ALARM`: 임계값 초과
- `INSUFFICIENT_DATA`: 데이터 부족

**알람 액션:**
- SNS 알림
- Auto Scaling 정책 실행
- EC2 인스턴스 중지/재시작
- Systems Manager OpsCenter 생성

---

## 🧠 알아두면 좋은 심화 이론

### CloudWatch 지표 핵심 정리 (시험 빈출)

| 항목 | 기본 | 고해상도 |
|------|------|----------|
| 해상도 | **1분** | **1초** |
| 보존 | 15일~15개월 (자동 단계 축소) | - |
| 보존 단계 | 1분→3시간, 5분→15일, 1시간→63일, 끝까지 15개월 | - |
| 비용 | 무료 (EC2 기본 지표) | 추가 |

### EC2 기본 지표에 없는 것 (시험 자주 출제)

❌ **메모리 사용률** (RAM)
❌ **디스크 사용량** (Used Space)
❌ **프로세스 정보**

→ **CloudWatch Agent** 설치 필수.

> ⚠️ **함정**: "EC2 OS 수준 지표" → CloudWatch Agent. "디스크 IO 읽기/쓰기 횟수"(`DiskReadOps`)는 기본 지표.

### Detailed Monitoring (시험 가끔)

| 옵션 | 빈도 |
|------|------|
| **Basic** (기본) | 5분 |
| **Detailed Monitoring** | **1분** (추가 비용) |

> ⚠️ **함정**: EC2 기본 모니터링은 **5분 단위**. 1분 단위로 보려면 Detailed Monitoring 활성화 (인스턴스당 추가 비용).

### CloudWatch Logs 디테일

| 단위 | 설명 |
|------|------|
| **Log Group** | 보존 기간 설정 단위 |
| **Log Stream** | 인스턴스/리소스별 로그 흐름 |
| **Log Event** | 개별 로그 라인 |

| 항목 | 값 |
|------|-----|
| 기본 보존 | **무기한 (영구)** |
| 설정 가능 | 1일~10년 (또는 무기한) |
| 암호화 | KMS 옵션 |
| 단일 PutLogEvents 크기 | 1MB |

### Logs Insights 핵심 쿼리 (시험 가끔)

```sql
fields @timestamp, @message
| filter @message like /ERROR/
| stats count(*) by bin(5m)
| sort @timestamp desc
| limit 20
```

- 모든 로그 그룹 동시 쿼리 가능
- 최대 60분 쿼리 시간

### Logs Subscription Filter

- 실시간 로그 → Lambda·Kinesis·Firehose로 스트리밍
- 사용: 로그 → Elasticsearch·OpenSearch·S3

```
CloudWatch Logs → Subscription Filter → Lambda → 변환·전송
                                      → Kinesis Data Firehose → S3/Splunk
```

### CloudWatch Alarm 디테일 (시험 빈출)

| 항목 | 값 |
|------|-----|
| 평가 기간 | 1~24개 데이터 포인트 |
| 데이터 포인트 누락 처리 | missing / notBreaching / breaching / ignore |
| 복합 알람 | 여러 알람을 AND/OR 조합 |
| 알람 액션 | SNS, AutoScaling, EC2 동작, Systems Manager |
| Composite Alarm | 알람들의 조합 (Alarm storm 방지) |

### 통계 함수 (시험 가끔)

| 함수 | 의미 |
|------|------|
| Average | 평균 |
| Sum | 합계 |
| Minimum / Maximum | 최소·최대 |
| SampleCount | 데이터 포인트 수 |
| **p99, p95, p50** | 백분위수 (지연 시간 분석에 유용) |

> 💡 시험 시나리오: "API 지연 95%가 1초 이내 보장" → `p95 < 1000ms` 알람.

### EMF (Embedded Metric Format) - Lambda 최적화

```python
import json

print(json.dumps({
    "_aws": {
        "Timestamp": 1721000000000,
        "CloudWatchMetrics": [{
            "Namespace": "MyApp",
            "Dimensions": [["Environment"]],
            "Metrics": [{"Name": "OrderCount", "Unit": "Count"}]
        }]
    },
    "Environment": "prod",
    "OrderCount": 5
}))
```

- 로그에 JSON 출력 → CloudWatch가 자동으로 지표 추출
- `PutMetricData` API 호출 없이 지표 생성 (비용 ↓, 빠름)
- AWS Lambda Powertools가 이를 자동 처리

### CloudWatch Logs Insights vs Athena (시험 가끔)

| 항목 | Logs Insights | Athena |
|------|---------------|--------|
| 대상 | CloudWatch Logs | S3 |
| 쿼리 언어 | 자체 문법 | 표준 SQL |
| 비용 | 스캔 GB | 스캔 GB |
| 사용 | 실시간 로그 분석 | 아카이브·대용량 분석 |

### CloudWatch 비용 함정 (실무)

- **Custom Metrics**: 지표당 $0.30/월 → 차원 폭증 시 비용 폭증
- **Logs**: 수집 $0.50/GB, 저장 $0.03/GB/월
- **Logs Insights**: 스캔 $0.005/GB
- **알람**: 표준 $0.10/월, 고해상도 $0.30/월

### 관련 서비스 Cross-Reference

- **CloudWatch Agent** → EC2 메모리·디스크, on-premise도 가능
- **EMF + Lambda Powertools** → [Week 3]
- **EventBridge ↔ CloudWatch Events** → 동일 서비스 (리브랜딩)
- **Container Insights** → [Day 4]
- **Subscription Filter ↔ OpenSearch** → 로그 분석 파이프라인

---

## 아키텍처 다이어그램

```
CloudWatch 모니터링 아키텍처
================================

[EC2 / Lambda / RDS / 기타 서비스]
          |
          | 지표 자동 전송 (1분마다)
          v
[CloudWatch]
  [지표 (Metrics)]
  [로그 (Logs)]
          |
          +-- 임계값 초과
          v
[CloudWatch 알람]
          |
          +---> [SNS] → 이메일/SMS 알림
          +---> [Auto Scaling] 스케일 아웃
          +---> [EC2 Action] 재시작/중지

사용자 정의 지표 + CloudWatch Agent
================================

EC2 인스턴스:
  [CloudWatch Agent]
    - 메모리 사용률 (기본 미포함)
    - 디스크 사용량 (기본 미포함)
    - 애플리케이션 로그
          |
          v
  [CloudWatch Metrics/Logs]
```

---

## ⭐ 핵심 포인트

1. ⭐ **EC2 메모리/디스크**: 기본 지표 아님, CloudWatch Agent 필요
2. ⭐ **고해상도 지표**: 1초 해상도, 추가 비용 발생
3. ⭐ **로그 보존 기간**: 기본 무기한, 비용 절감을 위해 설정 권장
4. ⭐ **Logs Insights**: SQL 유사 쿼리로 로그 분석
5. ⭐ **알람 상태**: OK, ALARM, INSUFFICIENT_DATA 3가지

---

## 📝 연습 문제

**문제 1.** EC2의 메모리 사용률을 CloudWatch로 모니터링하려면?

A) EC2 기본 지표로 자동 수집  
B) CloudWatch Agent 설치 필요  
C) CloudTrail 활성화  
D) VPC Flow Logs 활성화  

**정답: B** - EC2 메모리 사용률은 기본 지표가 아닙니다. CloudWatch Agent를 설치해야 수집됩니다.

---

**문제 2.** CloudWatch 알람에서 INSUFFICIENT_DATA 상태는?

A) 알람이 울리는 상태  
B) 정상 상태  
C) 지표 데이터가 부족하여 평가 불가  
D) 알람이 비활성화된 상태  

**정답: C** - INSUFFICIENT_DATA는 지표 데이터가 부족하거나 수집이 시작되지 않아 알람을 평가할 수 없는 상태입니다.

---

**문제 3.** CloudWatch Logs에서 특정 패턴의 로그를 빠르게 분석하려면?

A) CloudWatch 지표 필터  
B) CloudWatch Logs Insights  
C) CloudTrail  
D) S3 Select  

**정답: B** - CloudWatch Logs Insights는 SQL 유사 쿼리 언어로 로그를 빠르게 분석할 수 있습니다.

---

**문제 4.** 사용자 정의 지표의 기본 해상도는?

A) 1초  
B) 1분  
C) 5분  
D) 1시간  

**정답: B** - CloudWatch 사용자 정의 지표의 기본 해상도는 1분입니다. 1초 해상도는 고해상도 지표를 사용해야 합니다.

---

**문제 5.** CPU 사용률이 80%를 넘을 때 자동으로 Auto Scaling을 트리거하려면?

A) CloudTrail 알람  
B) CloudWatch 알람 → Auto Scaling 정책 연결  
C) EventBridge 직접 연결  
D) Lambda로 직접 구현  

**정답: B** - CloudWatch 알람에 Auto Scaling 정책을 연결하면 CPU 임계값 초과 시 자동으로 스케일 아웃됩니다.

---

## 📌 오늘의 요약

1. CloudWatch 지표: AWS 서비스 자동 수집, EC2 메모리/디스크는 Agent 필요
2. 사용자 정의 지표: put_metric_data API, 1분 또는 1초 해상도
3. CloudWatch Logs: 로그 그룹/스트림, 보존 기간 설정, Logs Insights
4. CloudWatch 알람: OK/ALARM/INSUFFICIENT_DATA, SNS/Auto Scaling 액션
5. CloudWatch Agent: EC2에서 메모리/디스크/애플리케이션 로그 수집
