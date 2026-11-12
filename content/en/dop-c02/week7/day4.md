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

## 📝 Practice Questions

**Question 1.** If Lambda calls several AWS services and is slow, how do you identify the bottleneck?

A) Search manually in the Lambda logs  
B) Check only Duration in CloudWatch metrics  
C) Visualize the latency of each service with X-Ray  
D) Migrate all services to EC2  

**Answer: C**
Explanation: X-Ray shows the exact latency of each AWS service call through distributed tracing. You can immediately identify which of S3, DynamoDB, or Secrets Manager is slow.

---

**Question 2.** How do you send an automatic alert when the error rate of a Lambda function rises from 5% to 10%?

A) Use only a CloudWatch Logs subscription filter  
B) Monitor the Errors/Invocations ratio with a CloudWatch metric alarm  
C) Inspect the logs manually  
D) Disable Lambda  

**Answer: B**
Explanation: A CloudWatch metric alarm triggers automatically when the error rate exceeds the threshold. The notification is delivered through SNS or Lambda.

---

**Question 3.** How do you identify the cause of high Lambda function costs?

A) Check the AWS Billing console  
B) Analyze Invocations, Duration, and Memory with CloudWatch Logs Insights, then verify with Cost Explorer  
C) Guess  
D) Delete Lambda  

**Answer: B**
Explanation: Identify the cost drivers using statistics on Invocations, Duration, and Memory usage. Duration alone is enough to calculate MB-seconds. Then establish a cost optimization strategy.

---
