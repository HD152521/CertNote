# Day 51 - SQS: Message Queue

📅 Date: July 26, 2026 (Sunday)  
🎯 Topic: Amazon SQS  
⏱️ Study Time: Approximately 90 minutes

---

## 🎯 Learning Objectives

- Understand the difference between SQS Standard and FIFO queues
- Configure key SQS parameters
- Implement asynchronous processing integrating Lambda and SQS

---

## 📖 Theory Content

### 1. What is Amazon SQS?

A fully managed message queue service that asynchronously delivers messages between services.

**Key Characteristics:**
- Fully managed, serverless
- Unlimited throughput
- At-Least-Once Delivery
- Maximum message size: 256 KB
- Default retention period: 4 days (maximum 14 days)

### 2. SQS Standard Queue vs FIFO Queue

| Characteristic | Standard Queue | FIFO Queue |
|--------|---------|---------|
| Order | No ordering guarantee | FIFO guarantee |
| Duplicates | Possible | Automatic deduplication |
| Throughput | Unlimited | 300 messages/sec (3000 with batching) |
| Price | Lower | Relatively higher |
| Use Case | High throughput | Financial transactions, order-critical |

### 3. SQS Key Parameters

```python
import boto3

sqs = boto3.client('sqs')

# Create queue
response = sqs.create_queue(
    QueueName='my-queue',
    Attributes={
        'VisibilityTimeout': '30',          # Message hiding time during processing (seconds)
        'MessageRetentionPeriod': '86400',  # Message retention period (seconds, 1 day)
        'ReceiveMessageWaitTimeSeconds': '20', # Long polling (maximum 20 seconds)
        'DelaySeconds': '0'                 # Message delivery delay (seconds)
    }
)

# Send message
sqs.send_message(
    QueueUrl=response['QueueUrl'],
    MessageBody='{"orderId": "O001", "amount": 50000}',
    DelaySeconds=5,  # Available after 5 seconds
    MessageAttributes={
        'OrderType': {
            'DataType': 'String',
            'StringValue': 'premium'
        }
    }
)

# Receive messages (long polling)
messages = sqs.receive_message(
    QueueUrl=response['QueueUrl'],
    MaxNumberOfMessages=10,  # Maximum 10
    WaitTimeSeconds=20       # 20 second long polling
)

# Delete message after processing
for message in messages.get('Messages', []):
    print(message['Body'])
    sqs.delete_message(
        QueueUrl=response['QueueUrl'],
        ReceiptHandle=message['ReceiptHandle']
    )
```

### 4. SQS Visibility Timeout

```
Message Processing Flow
================================

[Message in SQS Queue]
     |
     | Consumer receives
     v
[Message hidden (Visibility Timeout)]
  Processing... 30 seconds
     |
     +-- Success → Delete message
     |
     +-- Failure/Timeout exceeded → Message reappears in queue
```

**⭐ Default**: 30 seconds (0 seconds ~ 12 hours)

### 5. Dead Letter Queue (DLQ)

A queue that isolates messages that have repeatedly failed processing:

```python
# DLQ configuration
sqs.set_queue_attributes(
    QueueUrl='https://sqs.../main-queue',
    Attributes={
        'RedrivePolicy': '{"deadLetterTargetArn": "arn:aws:sqs:...:dlq", "maxReceiveCount": "3"}'
    }
)
```

**maxReceiveCount**: Messages moved to DLQ after specified failures

---

## 🧠 Advanced Theory Worth Knowing

### SQS Core Limits (Exam Frequency - Memorize Numbers)

| Item | Value |
|------|-----|
| Maximum message size | **256 KB** (2GB with S3 Extended Library) |
| Retention period | 60 seconds ~ **14 days** (default 4 days) |
| Visibility timeout | 0 seconds ~ **12 hours** (default 30 seconds) |
| Message delay | 0 seconds ~ 15 minutes (Delay Queue) |
| Message groups (FIFO) | Order guaranteed per message group |
| **Standard queue throughput** | **Unlimited** |
| **FIFO queue throughput** | 300 msg/s (3000 msg/s with batching), 70,000 msg/s in high-throughput mode |
| In-flight messages | Standard 120,000 / FIFO 20,000 |

### Short Polling vs Long Polling (Exam Frequently)

| Item | Short | Long |
|------|-------|------|
| WaitTimeSeconds | 0 (default) | 1~20 seconds |
| Empty responses | Frequent | Rare |
| API call cost | Higher | Lower |
| Recommendation | ❌ | ✅ |

> 💡 Recommended to set `ReceiveMessageWaitTimeSeconds=20` at queue level.

### Message Visibility Timeout Details

```
Receive message
   ↓ Visibility timeout starts (default 30 seconds)
Processing...
   ↓
   ┌─ Success → DeleteMessage → Permanently removed from queue
   ├─ Timeout exceeded → Reappears in queue
   └─ Can extend with ChangeMessageVisibility
```

> ⚠️ **Trap**: If processing time exceeds visibility timeout, **same message duplicate processing risk**. Lambda: recommend visibility timeout 6x or more than function timeout.

### FIFO Queue Additional Details (Exam Frequently)

- Name requires **`.fifo` suffix**
- **MessageDeduplicationId**: Remove duplicate messages within 5 minutes
- **ContentBasedDeduplication**: SHA-256 hash automatic dedup
- **MessageGroupId**: Same group guarantees order, different groups process in parallel

```python
sqs.send_message(
    QueueUrl='.../my-queue.fifo',
    MessageBody='order data',
    MessageGroupId='customer-123',           # Order guaranteed within group
    MessageDeduplicationId='order-001'       # 5 min dedup
)
```

### High-Throughput FIFO (High-Throughput FIFO)

- Standard FIFO: 300 msg/s
- High-throughput mode: **70,000 msg/s** (per group)
- Activation: `FifoThroughputLimit=perMessageGroupId` in queue attributes

### Delay Queue vs Message Delay vs Visibility Timeout

| Feature | Timing | Application |
|------|------|------|
| **Delay Queue** | At queue creation | All new messages |
| **Message Timer** | When sending message | Individual message |
| **Visibility Timeout** | After message received | Hide during processing |

### SQS Extended Client Library

- Messages over 256KB stored in **S3 + reference in queue** (maximum 2GB)
- Provided in Java/Python SDK
- Exam once: "Large message handling" → Extended Client

### SQS Permission Model

- **SQS Access Policy** (resource-based): Cross-account access, SNS subscription
- **IAM Policy**: Same account permissions

### SQS Encryption

- **SSE-SQS** (default): AWS managed
- **SSE-KMS**: Customer key (audit + rotation)
- Client-side encryption possible

### DLQ Details (Exam Very Frequent)

- DLQ must be **same type** (Standard ↔ Standard, FIFO ↔ FIFO)
- Retention period: Based on DLQ arrival time (queue retention calculated separately)
- **Redrive (Redrive)**: Resend messages from DLQ → original queue (AWS Console)

### Related Service Cross-Reference

- **SQS + Lambda** → [Week 3 Day 2] ESM
- **SQS + SNS Fanout** → [Day 2]
- **SQS Beanstalk Worker** → [Week 8 Day 4]
- **SQS + EventBridge Pipes** → [Week 10 Day 3]

---

## Architecture Diagram

```
SQS Asynchronous Processing Architecture
================================

[API Gateway + Lambda (Producer)]
          |
          | Send message
          v
[SQS Standard Queue]
          |
          | Receive (long polling)
          v
[Lambda (Consumer)]
          |
          +-- Processing success → Delete message
          |
          +-- 3 failures → [DLQ]
                             |
                             v
                      [Alert + Manual handling]

FIFO Queue Order Guarantee
================================

Producer → [msg1][msg2][msg3][msg4]
Consumer ← msg1 → Processing complete
Consumer ← msg2 → Processing complete
(Order guaranteed)
```

---

## ⭐ Key Points

1. ⭐ **Standard Queue**: No order/duplicate guarantee, unlimited throughput
2. ⭐ **FIFO Queue**: Order guarantee, deduplication, 300 messages/second
3. ⭐ **Visibility Timeout**: Hide message during processing, default 30 seconds
4. ⭐ **Long Polling**: WaitTimeSeconds=20, reduces empty responses, saves cost
5. ⭐ **DLQ**: Isolates when maxReceiveCount exceeded, failure message analysis

---

## 📝 연습 문제

**문제 1.** What is the throughput limit of an SQS FIFO queue?

A) 100 messages per second  
B) 300 messages per second  
C) Unlimited  
D) 1000 messages per second  

**정답: B** - FIFO queues can process 300 messages per second (3000 with batching).

---

**문제 2.** What setting prevents a message from being visible to other consumers while being processed?

A) MessageRetentionPeriod  
B) DelaySeconds  
C) VisibilityTimeout  
D) WaitTimeSeconds  

**정답: C** - VisibilityTimeout hides the message from other consumers for a specified duration after receipt.

---

**문제 3.** What is the best way to reduce costs and eliminate unnecessary empty responses in SQS?

A) Reduce message size  
B) Use long polling (WaitTimeSeconds)  
C) Reduce number of queues  
D) Increase message retention period  

**정답: B** - Long polling waits up to 20 seconds for messages, reducing empty responses and saving costs.

---

**문제 4.** What is the purpose of a DLQ?

A) Improve message delivery speed  
B) Isolate and analyze messages that have repeatedly failed processing  
C) Encrypt messages  
D) Improve throughput  

**정답: B** - DLQ isolates messages that have failed multiple times for later analysis.

---

**문제 5.** What queue type should be used when processing financial transaction messages in order?

A) Standard queue  
B) FIFO queue  
C) Priority queue  
D) Delay queue  

**정답: B** - Financial transactions require order guarantee, so FIFO queue must be used for FIFO ordering.

---

## 📌 Today's Summary

1. SQS: Fully managed message queue, maximum 256KB, default 4-day retention
2. Standard queue: Unlimited throughput, no order/duplicate guarantee
3. FIFO queue: Order guarantee, deduplication, 300 messages per second
4. VisibilityTimeout: Hide during processing, default 30 seconds, reappears on failure
5. DLQ: Isolates messages exceeding maxReceiveCount, for error analysis
