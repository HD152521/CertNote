# Day 4 - X-Ray and CloudWatch for Serverless Observability

## X-Ray: Distributed Tracing

X-Ray traces requests across distributed services, showing latency, errors, and dependencies. For Lambda calling DynamoDB, S3, and other services, X-Ray visualizes complete request flow.

Enable X-Ray on Lambda:
```bash
aws lambda update-function-configuration \
  --function-name myapp \
  --tracing-config Mode=Active
```

Add X-Ray SDK to function:
```python
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

patch_all()  # Auto-instrument AWS SDK calls

@xray_recorder.capture('process_order')
def process_order(order_id):
    # X-Ray auto-traces all AWS SDK calls
    s3_client.get_object(Bucket='orders', Key=order_id)
    dynamodb.put_item(TableName='orders', Item={'id': order_id})
    # Custom segment for detailed timing
    return {'status': 'processed'}
```

X-Ray Daemon required in VPC or Lambda execution environment. For Lambda, X-Ray Daemon included; no setup needed.

> 💡 **Use Case**: Payment processing Lambda slow. X-Ray reveals Secrets Manager call taking 800ms; DynamoDB 100ms; S3 50ms. Optimize Secrets Manager caching → 3x faster.

## CloudWatch Logs for Lambda

Lambda automatically sends stdout/stderr to CloudWatch Logs group `/aws/lambda/function-name`.

Query with Logs Insights:
```
fields @timestamp, @message, error_code
| filter error_code != 0
| stats count() by error_code
```

Set alarms on error metrics:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name lambda-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 60 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

> 📚 **Case**: Lambda function produces 1000 lines per invocation. CloudWatch Logs storage costs $0.50/GB/month. Archive old logs to S3 via Kinesis Firehose → cost reduction to $0.023/GB/month.

## CloudWatch Metrics and Custom Metrics

Lambda auto-publishes Duration, Errors, Throttles, ConcurrentExecutions. Publish custom metrics:
```python
import boto3

cloudwatch = boto3.client('cloudwatch')

cloudwatch.put_metric_data(
    Namespace='MyApp',
    MetricData=[{
        'MetricName': 'OrderProcessedTime',
        'Value': 250,
        'Unit': 'Milliseconds'
    }]
)
```

Dashboard example:
```bash
# Query Deployment Frequency (DORA metric)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=myapp \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --period 86400 \
  --statistics Sum
```

---

## 📝 연습 문제

**문제 1.** Lambda가 여러 AWS 서비스를 호출하는데 느리다면 병목지점 파악 방법은?

A) Lambda 로그에서 수동 검색  
B) CloudWatch Metrics의 Duration만 확인  
C) X-Ray로 각 서비스별 지연 시간 시각화  
D) 모든 서비스를 EC2로 마이그레이션  

**정답: C**
해설: X-Ray는 분산 추적으로 각 AWS 서비스 호출의 정확한 지연 시간을 보여준다. S3, DynamoDB, Secrets Manager 중 어느 것이 느린지 즉시 식별 가능.

---

**문제 2.** Lambda 함수의 에러율이 5%에서 10%로 증가하면 자동 알림을 보내려면?

A) CloudWatch 로그 구독 필터만 사용  
B) CloudWatch Metric Alarm로 Errors/Invocations 비율 모니터링  
C) 수동으로 로그 검사  
D) Lambda 비활성화  

**정답: B**
해설: CloudWatch Metric Alarm이 에러율 임계값 초과 시 자동 트리거한다. SNS 또는 Lambda로 알림 전달.

---

**문제 3.** Lambda 함수 비용이 높은 원인을 파악하는 방법은?

A) AWS Billing Console 확인  
B) CloudWatch Logs Insights로 Invocations, Duration, Memory 분석 후 Cost Explorer 검증  
C) 추측  
D) Lambda 삭제  

**정답: B**
해설: Invocations, Duration, Memory 사용량 통계로 비용 요인 특정. Duration만 해도 MB-second 계산 가능. 비용 최적화 전략 수립.

---
