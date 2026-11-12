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

**Question 4.** What is the most accurate description of the essential difference between Standard and Express workflows?

A) Standard: up to 1 year, exactly-once, billed per state transition; Express: 5 minutes, at-least-once, billed per invocation + execution time
B) The same engine, only the price differs
C) Express can handle human approval
D) Standard supports only synchronous invocation

**Answer: A**
Explanation: The difference in pricing model is decisive. For short, high-frequency workloads (IoT, API backends), Standard causes costs to explode and Express is reasonable. For long, low-frequency workloads (deployments, including human approval), Express would violate the 5-minute limit and Standard is suitable. Exactly-once vs. at-least-once is decisive in scenarios such as payments where duplicates are forbidden. C is reversed (Express does not support TaskToken), and D is reversed (Standard is asynchronous only).

---

**Question 5.** What is the standard pattern in Step Functions for waiting for a response from an external system (a Slack bot, human approval)?

A) Wait state + polling
B) The `.waitForTaskToken` integration pattern + the external system calls SendTaskSuccess/Failure
C) Infinite Lambda polling
D) Repeating a Choice state

**Answer: B**
Explanation: TaskToken is an implementation of the capability-based security pattern (Henry Levy, 1984). SF issues a token and pauses the workflow (cost is nearly zero); when the external system calls SendTaskSuccess(output) or SendTaskFailure(error) with the token, the workflow resumes immediately. It can wait up to 1 year, and TimeoutSeconds can end it automatically. A is inefficient, C makes costs explode, and D means something different. On the exam, "human approval" and "external system response" are almost always TaskToken.

---

**Question 6.** A workflow has many nodes that only invoke Lambda, and operational complexity is high. What is the most effective improvement?

A) Change all the Lambda functions to ECS tasks
B) Call 200+ services directly with AWS SDK service integrations (`arn:aws:states:::aws-sdk:<service>:<action>`) — remove Lambda
C) Change Standard to Express
D) Replace Step Functions with EventBridge

**Answer: B**
Explanation: The AWS SDK service integration, launched in 2021, removes the pattern of creating a Lambda function just to make a single SDK call. ASL can directly call more than 200 AWS services such as CloudFormation, CodeDeploy, DynamoDB, S3, and SNS. As in a media company case, reducing 12 Lambda functions to 3 eliminated cold starts and shortened P99 latency. IAM permissions must be stated explicitly on the state machine execution role. A is more complex, C is unrelated, and D is wrong because EventBridge handles only simple flows.

---

**Question 7.** You must ETL 50 million S3 objects while tolerating a 1% failure rate. What is the most suitable pattern?

A) Standard Map (40 concurrent limit)
B) Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) EventBridge → 50 million Lambda invocations
D) 50 million ECS Fargate tasks

**Answer: B**
Explanation: Distributed Map (2022) is the exact answer. ItemReader automatically splits the S3 objects, ItemBatcher groups them efficiently, child workflows run as Express to be short and cheap, MaxConcurrency goes up to 10,000, and ToleratedFailurePercentage tolerates partial failure. As in an advertising company case, it can replace a Spark cluster. A is impossible for 50 million because of the concurrency limit of 40, C causes throttling and cost explosion, and D has high operational burden and startup latency.

---

**Question 8.** What is the backoff calculation formula for an ASL Retry?

A) A constant interval every time
B) `interval × backoffRate^(attempt-1)` + optional jitter; moves to Catch when MaxAttempts is exceeded
C) Infinite retries
D) Automatically moves to the Lambda DLQ

**Answer: B**
Explanation: Exponential backoff plus jitter is the standard for preventing a thundering herd (AWS Architecture Blog, 2015). For example, with `IntervalSeconds: 2, BackoffRate: 2.0, MaxAttempts: 6`, the intervals are 2 → 4 → 8 → 16 → 32 → 64 seconds. Turning on `JitterStrategy: FULL` (2023+) adds random spread to each interval. When all Retry policies fail, the Catch block receives it and branches. A is simply wrong, C is wrong because a limit always exists, and D is wrong because the SQS DLQ is a separate mechanism.

---

**Question 9.** "For a production deployment, a three-step approval of the security team → the DevOps team → automatic deployment, with a 7-day timeout at each step and a Slack notification." What is a suitable workflow design?

A) Three CodePipeline ManualApprovalActions
B) Standard workflow + `.waitForTaskToken` three times + SNS→Slack notification + TimeoutSeconds: 604800
C) Express workflow
D) EventBridge Schedule

**Answer: B**
Explanation: Only Standard supports TaskToken; Express does not. A 7-day timeout is a strength of Standard (it violates Express's 5-minute limit). Approval is done with a Slack interactive message → Lambda → SendTaskSuccess(token, output). CodePipeline ManualApprovalAction (A) can also do human approval, but (1) the Slack notification and authentication flow is complex, (2) the 7-day wait cost and UX are unsuitable, and (3) branching and rollback are weaker than in SF. SF expresses notification and approval workflows more flexibly.

---

**Question 10.** Multi-step business logic with an average 300 ms synchronous response is needed as an API Gateway backend. What is a suitable pattern?

A) Standard workflow + StartExecution
B) Express workflow + StartSyncExecution + API Gateway AWS service integration
C) Inline all the logic in one Lambda function
D) Step Functions is not suitable

**Answer: B**
Explanation: Express + StartSyncExecution (2019) is the standard synchronous workflow pattern. When multi-step logic that finishes within 5 minutes (validation → authentication → processing → recording) is expressed as a workflow, visualization, retries, and error handling are automatic. Standard is asynchronous only and unsuitable for an API backend (A). Inlining in Lambda (C) is fine for simple cases but lacks multi-step handling, retries, and visualization. D says SF is not suitable, but SF is exactly the answer to this scenario.

---

**Question 11.** In a multi-Region deployment (USE1 → EUW1 → APN2), when the alarm at the EUW1 stage fires, the Regions deployed so far must be rolled back in reverse order. How is this expressed in ASL?

A) Use a Retry block
B) Accumulate deploymentIds with a ResultPath for each Region + check the alarm with a Choice + on failure chain RollbackEUW1 → RollbackUSE1 in order
C) Use Parallel
D) Use Map

**Answer: B**
Explanation: Sequential multi-Region deployment with reverse-order rollback is a classic Step Functions pattern. Accumulate the deploymentId in each DeployTask's `ResultPath: $.use1Deploy` style, and branch from the Choice into the Rollback chain when the alarm fires. Rollback is a reverse-order chain (`Next: RollbackUSE1`). Parallel (C) runs concurrently, so it does not guarantee sequence; Map (D) is for repeating the same task and unsuitable; Retry (A) retries a single task. This is one of the most frequently tested SF patterns on the exam.
