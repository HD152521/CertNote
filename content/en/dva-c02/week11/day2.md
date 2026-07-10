# Day 52 - SNS: Publish/Subscribe Pattern

📅 Date: July 27, 2026 (Monday)  
🎯 Topic: Amazon SNS  
⏱️ Study Time: Approximately 90 minutes

---

## 🎯 Learning Objectives

- Understand SNS publish/subscribe pattern
- Integrate SNS and SQS using fanout pattern
- Implement selective message delivery with SNS filter policies

---

## 📖 Theory Content

### 1. What is Amazon SNS?

A fully managed notification service where publishers send messages that are immediately delivered to all subscribers.

**SNS vs SQS:**
- **SNS**: Push model, deliver to all subscribers simultaneously
- **SQS**: Pull model, single consumer receives

**SNS Subscription Targets:**
- Email/SMS
- HTTP/HTTPS endpoints
- Lambda functions
- SQS queues
- Kinesis Data Firehose
- AWS mobile apps (Mobile Push)

### 2. SNS Basic Usage

```python
import boto3

sns = boto3.client('sns')

# Create topic
response = sns.create_topic(Name='OrderNotifications')
topic_arn = response['TopicArn']

# Add email subscription
sns.subscribe(
    TopicArn=topic_arn,
    Protocol='email',
    Endpoint='admin@example.com'
)

# Add SQS queue subscription
sns.subscribe(
    TopicArn=topic_arn,
    Protocol='sqs',
    Endpoint='arn:aws:sqs:ap-northeast-2:123456789:order-queue'
)

# Add Lambda subscription
sns.subscribe(
    TopicArn=topic_arn,
    Protocol='lambda',
    Endpoint='arn:aws:lambda:ap-northeast-2:123456789:function:process-order'
)

# Publish message
sns.publish(
    TopicArn=topic_arn,
    Message='{"orderId": "O001", "status": "created"}',
    Subject='New order created',
    MessageAttributes={
        'orderType': {
            'DataType': 'String',
            'StringValue': 'premium'
        }
    }
)
```

### 3. SNS Fanout Pattern (Fanout)

```
Fanout Pattern (SNS + SQS)
================================

[S3 Event] → [SNS Topic]
                  |
          +-------+-------+
          |       |       |
       [SQS1]  [SQS2]  [SQS3]
     (Image   (Data    (Alert
      Resize)  Analysis) Send)
          |
          v
      [Lambda]

S3 bucket can only set one event target directly
→ Deliver to multiple SQS via SNS (fanout)
```

### 4. SNS Filter Policy

Deliver messages to specific subscribers only:

```python
# Deliver premium orders only to specific SQS
sns.set_subscription_attributes(
    SubscriptionArn='arn:aws:sns:...',
    AttributeName='FilterPolicy',
    AttributeValue='{"orderType": ["premium"]}'
)

# Standard orders only to standard order SQS
sns.set_subscription_attributes(
    SubscriptionArn='arn:aws:sns:...:standard-queue',
    AttributeName='FilterPolicy',
    AttributeValue='{"orderType": ["standard"]}'
)
```

### 5. SNS FIFO Topic

```python
# Create SNS FIFO topic (use with SQS FIFO queue)
response = sns.create_topic(
    Name='orders.fifo',
    Attributes={
        'FifoTopic': 'true',
        'ContentBasedDeduplication': 'true'
    }
)
```

**FIFO Topic Characteristics:**
- Order guarantee
- Deduplication
- Can only subscribe SQS FIFO queues

---

## 🧠 Advanced Theory Worth Knowing

### SNS Core Limits (Exam Occasionally)

| Item | Value |
|------|-----|
| Topics per account/region | 100,000 |
| Subscribers per topic | 12,500,000 |
| Message size | **256 KB** (same as SQS) |
| SNS Extended Client | Maximum 2GB (via S3) |
| Message retention | **None** (lost on delivery failure) |
| Publish throughput | Unlimited (FIFO 300 msg/s) |

### SNS Subscription Protocols (Exam Frequently)

| Protocol | Target |
|----------|------|
| **HTTPS** | Webhook (auto retry policy applied) |
| **HTTP** | Webhook (no TLS, not recommended) |
| **Email** | Email (subject and body) |
| **Email-JSON** | Email (JSON format) |
| **SMS** | Mobile SMS |
| **SQS** | Queue delivery |
| **Lambda** | Direct function invocation |
| **Mobile Push** | APNs, GCM, FCM, ADM, Baidu |
| **Kinesis Data Firehose** | S3, Redshift, OpenSearch |

### Retry Policy (HTTPS Subscription)

```json
{
  "deliveryPolicy": {
    "numRetries": 50,
    "numNoDelayRetries": 3,
    "minDelayTarget": 20,
    "maxDelayTarget": 600
  }
}
```

- Default 50 retries, 1 hour total
- On failure → SNS DLQ (similar to Lambda Destinations)

### Message Filtering Details (Exam Scenarios)

```json
{
  "store": ["seoul", "busan"],
  "event": [{ "anything-but": "test_event" }],
  "price": [{ "numeric": [">", 100] }],
  "size": [{ "exists": true }]
}
```

- Message body filtering (2022~): `subscriptionAttributes.FilterPolicyScope=MessageBody`
- Default filters MessageAttributes only

### SNS FIFO + SQS FIFO Integration

```
[Producer FIFO] → SNS FIFO Topic → SQS FIFO Queue 1
                                 → SQS FIFO Queue 2
                                 (Consumer uses same group ID)
```

- Order and deduplication guaranteed at both ends
- Use message group ID

### SNS Mobile Push (Exam Occasionally)

| Platform | Service |
|--------|--------|
| iOS | **APNs** (Apple Push Notification) |
| Android | **GCM/FCM** (Firebase) |
| Amazon | **ADM** |
| Windows | WNS (deprecated) |

- Register device token with SNS → generates endpoint ARN

### SNS Data Protection Policy (PII Masking)

- Auto-detect and mask credit cards, SSN from messages
- Rarely appears in exam (with Macie)

### SNS Pricing

- Publishing 1 million: $0.50 (HTTPS), $2.00 (SMS varies by country)
- SQS subscription: Free
- Email/Lambda invocation: Separate costs

### Related Service Cross-Reference

- **SNS + SQS Fanout** → [Day 1]
- **SNS + Lambda** → Asynchronous invocation
- **SNS + Mobile Push** → Mobile app notifications
- **SNS + CloudWatch Alarms** → Alarm notifications
- **SNS Topic Encryption** → KMS

---

## Architecture Diagram

```
SNS Fanout Architecture
================================

[Order Service]
     |
     | Order created event
     v
[SNS Topic: OrderEvents]
     |
     +---[FilterPolicy: premium]---> [SQS: premium-orders]
     |                                      |
     |                                      v
     |                               [Lambda: VIP processing]
     |
     +---[FilterPolicy: standard]--> [SQS: standard-orders]
     |                                      |
     |                                      v
     |                               [Lambda: Standard processing]
     |
     +---> [Email subscription] (Admin notification)
     |
     +---> [Lambda: Inventory update]
```

---

## ⭐ Key Points

1. ⭐ **SNS**: Push model, deliver to all subscribers simultaneously
2. ⭐ **Fanout**: S3→SNS→multiple SQS, single event processed by multiple consumers
3. ⭐ **Filter Policy**: Selective message delivery based on specific attributes
4. ⭐ **SNS+SQS**: SNS immediate delivery, SQS reliable asynchronous processing
5. ⭐ **Message Retention**: SNS non-retained (lost on failure), SQS retained

---

## 📝 연습 문제

**문제 1.** When multiple Lambda functions need to process one event simultaneously?

A) Use SQS alone  
B) SNS fanout (SNS → multiple SQS → multiple Lambda)  
C) Use EventBridge alone  
D) Use Kinesis  

**정답: B** - Fanout pattern delivers message from SNS to multiple SQS simultaneously for independent processing.

---

**문제 2.** To deliver messages with specific attribute values only to certain subscribers?

A) SNS access policy  
B) SNS filter policy  
C) SQS queue policy  
D) Lambda environment variables  

**정답: B** - SNS filter policy delivers messages to specific subscribers based on message attributes.

---

**문제 3.** What is the most significant difference between SNS and SQS?

A) Price difference  
B) SNS is Push (immediate delivery), SQS is Pull (consumer receives)  
C) Security difference  
D) Region restriction  

**정답: B** - SNS pushes to all subscribers immediately, while SQS requires consumers to pull messages.

---

**문제 4.** When S3 events need to be delivered to multiple Lambda functions simultaneously?

A) S3 event → Lambda directly (multiple configurations)  
B) S3 event → SNS → multiple Lambda/SQS  
C) Use CloudWatch Events  
D) Not possible  

**정답: B** - S3 can only set one event target directly, so SNS is used in between for fanout.

---

**문제 5.** What is the default behavior when SNS fails to deliver a message to Lambda?

A) Auto-move to SQS  
B) Retry then lose message  
C) Auto-move to DLQ  
D) Email notification  

**정답: B** - SNS retries then loses the message on failure by default. Must set Lambda DLQ or Destinations.

---

## 📌 Today's Summary

1. SNS: Fully managed pub/sub, Push model, immediate delivery
2. Fanout: SNS → multiple SQS, single event processes by multiple consumers in parallel
3. Filter policy: Selective delivery based on message attributes
4. SNS FIFO: Order guarantee, deduplication, only SQS FIFO can subscribe
5. SNS vs SQS: SNS is Push/immediate/non-retained, SQS is Pull/retained
