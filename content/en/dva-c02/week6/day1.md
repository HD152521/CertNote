# Day 1 - DynamoDB: The Philosophy of NoSQL and the Mathematics of Partition Design

When developers experienced with relational databases first learn DynamoDB, they are shocked by two things. First, there is no JOIN. Second, you must decide how you will query the data first, then design the table accordingly — the exact opposite order from RDBMS. In this day, we understand why Amazon created Dynamo (the predecessor of DynamoDB) in 2007, how the core idea of partitioning and consistency model work internally. With this principle understood, DVA-C02 DynamoDB problems solve themselves without memorization.

## The Background of the Dynamo Paper — Amazon's Challenge in 2007

In October 2007, senior engineers at Amazon presented "Dynamo: Amazon's Highly Available Key-value Store" at the ACM SOSP academic conference. This paper became one of the most influential in distributed systems history.

Amazon's problem at the time was this. Relational databases like MySQL use locks for transactions, scale horizontally with difficulty, and particularly struggle to handle hundreds of thousands of TPS during peak traffic (Black Friday, Christmas). Amazon's Chief Scientist Werner Vogels analyzed: "Many of Amazon's services use PRIMARY KEY in over 95% of queries, and complex JOINs are rarely needed." What if we abandoned JOINs and built a storage optimized for horizontal scaling?

The Dynamo paper designed a Key-Value store by combining distributed systems concepts: Consistent Hashing, Vector Clocks, Gossip Protocol, and Eventual Consistency. This became the theoretical foundation of DynamoDB.

> 💡 **Related theory**: The Dynamo paper is a prime example of a practical interpretation of the CAP Theorem (Brewer, 2000). The CAP Theorem states that a distributed system can guarantee only two of three: Consistency, Availability, and Partition Tolerance. Amazon's Dynamo chose AP (Availability + Partition Tolerance) and sacrificed Consistency, adopting "eventual consistency." DynamoDB builds on this foundation while optionally providing Strong Consistency.

## DynamoDB vs RDBMS — Paradigm Shift

| Concept | RDBMS | DynamoDB |
|---------|-------|----------|
| Storage unit | Row | Item |
| Organization | Tables, schemas | Tables, partitions |
| Schema | Fixed (DDL required) | Flexible (free outside PK) |
| Query method | SQL, arbitrary columns | PK-based only efficient |
| Scaling | Vertical (bigger server) | Horizontal (add partitions) |
| Transactions | Native ACID | TransactWrite/Get (2× cost) |
| JOIN | Freely available | None (app layer) |
| Indexes | Create freely | LSI(5), GSI(20) limited |
| Scaling ceiling | TB level (single server) | PB level (auto-partitioned) |

RDBMS asks "How do we store the data?" first, then queries it in various ways later. DynamoDB is the reverse — decide "How will we query it?" first, then design the PK and indexes accordingly. This paradigm shift is the first hurdle in learning DynamoDB.

> 📚 **Case study**: In 2019, Airbnb migrated some data layers of its search service from MySQL to DynamoDB. The reason was simple — in key-value patterns like search result caching and user preference storage, MySQL's lock contention became a performance bottleneck. After switching to DynamoDB, p99 latency dropped from 200ms to 10ms. However, complex queries and sorting stayed on Elasticsearch — a case study of understanding DynamoDB's limitations and using it appropriately.

## Partitioning Mechanism — SHA-256 Hash and Partition Determination

When DynamoDB receives a PK value, it internally calculates a SHA-256 hash and uses that hash value to determine which partition the data resides in. The same PK value always goes to the same partition.

```
Partition Key → SHA-256 Hash → Partition determination in hash space
                               → Storage in corresponding partition node

Example:
"user001" → hash(user001) = 0x7a3f... → Partition 5
"user002" → hash(user002) = 0x1b2c... → Partition 2
"user003" → hash(user003) = 0x9d4a... → Partition 5 (coincidentally same)
```

Per-partition limits:
- Storage: Max 10GB
- Throughput: Max 3,000 RCU + 1,000 WCU

If items exceed 10GB or throughput limits are reached, AWS automatically splits the partition. This split is automatic but can take several minutes, during which throttling may occur.

> 🔍 **Going deeper**: DynamoDB's partitioning uses a variant of Consistent Hashing. The key property of consistent hashing is that when nodes (partitions) are added or removed, the amount of data that needs to be rebalanced is minimized. Regular hashing (`key % N`) requires rebalancing almost all data when N changes, but consistent hashing moves only 1/N of the data. This is why DynamoDB can smoothly handle partition additions even at PB scale.

## The Hot Partition Problem — The Price of Poor PK Design

The most common DynamoDB design mistake is using low-cardinality values as partition keys. Cardinality means the number of unique values.

```
Bad PK examples:
  status: "PENDING"/"COMPLETED"/"FAILED"     → Only 3 partitions exist
  country: "KR"/"US"/"JP"                   → Hundreds of partitions
  date: "2026-06-26"                         → All writes today concentrate in one partition
  boolean: true/false                         → Only 2 partitions

Good PK examples:
  userId: UUID                               → Millions of unique values
  orderId: UUID                              → Millions of unique values
  deviceId: Device serial number             → Even distribution
```

Using date as PK is particularly dangerous. If you use today's date as PK ("2026-06-26"), all writes today concentrate in one partition. When this partition exceeds the 1,000 WCU limit, `ProvisionedThroughputExceededException` is raised.

| Anti-pattern | Problem | Improvement |
|---------|------|---------|
| PK = date | Today's writes concentrate in one partition | PK = `date#shard_number` (e.g., `2026-06-26#3`) |
| PK = status code | Only 3~5 partitions exist | PK = userId, GSI PK = status |
| PK = sequential ID | Sequential IDs show bias even after hashing | PK = UUID |
| PK = category | Popular categories concentrate | PK = `category#uuid` |

> ⚠️ **Trap**: Many test-takers know "DynamoDB handles hot partitions automatically with Adaptive Capacity." Adaptive Capacity redistributes spare capacity from other partitions to the hot partition. But this is only a temporary buffer. If the entire table WCU is exceeded, Adaptive Capacity cannot help. The root solution is always PK design.

## DynamoDB's Complete Data Types

DynamoDB supports three categories of data types.

**Scalar types**: Single values
- `S` - String: `"hello"`, `"2026-06-26T00:00:00Z"` (dates stored as ISO 8601 strings)
- `N` - Number: `42`, `3.14`, `1234567890123` (integers, decimals, large numbers all supported)
- `B` - Binary: Base64-encoded binary data (image thumbnails, serialized data)
- `BOOL` - Boolean: `true`, `false`
- `NULL` - Null: `true` (explicitly represent missing value)

**Set types**: Unordered, duplicate-free collections of same type
- `SS` - String Set: `{"apple", "banana", "cherry"}`
- `NS` - Number Set: `{1, 2, 3, 4, 5}`
- `BS` - Binary Set: Binary collection

**Document types**: Nested structures
- `M` - Map: `{"key1": {"S": "value"}, "key2": {"N": "42"}}` — nested JSON objects
- `L` - List: `[{"S": "hello"}, {"N": "42"}, {"BOOL": true}]` — mixed-type array

Maximum item size is **400KB**. For large data like images and videos, the standard pattern is to store them in S3 and keep only the S3 URL or key in DynamoDB.

> 💡 **Related theory**: DynamoDB's Map (`M`) type is conceptually identical to JSON. In fact, DynamoDB's data model is JSON encoded in binary form internally (internally similar to CBOR). When you run `aws dynamodb get-item --output json`, DynamoDB returns a JSON response with type annotations. There is theoretically no limit to nesting depth of Map types, but the entire item must fit within 400KB.

## Read Consistency Models — Distributed Systems Trade-offs

DynamoDB synchronously replicates data across **at least 3 AZs**. The write completion response returns when at least 2 of 3 AZs (quorum) successfully complete the write.

Because of this distributed replication, the point-in-time read cannot guarantee the latest data.

**Eventually Consistent Read**:
DynamoDB reads from any arbitrary node. If the recently written data has not yet propagated to other nodes, it may return an older version. Cost: 0.5 RCU per 4KB. Default.

**Strongly Consistent Read**:
DynamoDB reads from the "leader" node that guarantees the latest data. Always returns data after the latest write. Cost: 1 RCU per 4KB (2× eventually consistent). Requires `ConsistentRead: true` parameter.

**Transactional Read**:
Atomically read multiple items. Cost: 2 RCU per 4KB. Uses `TransactGetItems` API.

| Read type | Cost | Latest data guaranteed | GSI support |
|----------|------|---------------|---------|
| Eventually Consistent | 0.5 RCU/4KB | ❌ (almost always latest) | ✅ |
| Strongly Consistent | 1 RCU/4KB | ✅ | ❌ (base table + LSI only) |
| Transactional | 2 RCU/4KB | ✅ | ❌ |

> ⚠️ **Trap**: **GSI does not support Strongly Consistent reads.** Only Eventually Consistent is possible. This is because GSI is replicated asynchronously — even after writes complete on the base table, there is a short delay before reflecting in the GSI. If you need strong consistency, you must use the base table or LSI.

## DynamoDB Expression System — The Role of 5 Expression Types

DynamoDB handles conditions, updates, and filters with Expressions instead of SQL. It's crucial not to confuse the 5 expression types.

```python
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Orders')

# 1. KeyConditionExpression — Query partition key (required) + sort key (optional) condition
response = table.query(
    KeyConditionExpression=Key('userId').eq('U001') & 
                           Key('orderDate').between('2026-01-01', '2026-06-30')
)

# 2. FilterExpression — Client-side filtering after read (RCU still consumed!)
response = table.query(
    KeyConditionExpression=Key('userId').eq('U001'),
    FilterExpression=Attr('status').eq('COMPLETED')  # No RCU savings
)

# 3. UpdateExpression — Modify item attributes
table.update_item(
    Key={'userId': 'U001', 'orderDate': '2026-06-26'},
    UpdateExpression='SET #s = :status, updatedAt = :ts ADD orderCount :one',
    ExpressionAttributeNames={'#s': 'status'},   # Escape reserved words
    ExpressionAttributeValues={':status': 'SHIPPED', ':ts': '2026-06-26T10:00:00Z', ':one': 1}
)

# 4. ConditionExpression — Conditional write (ConditionalCheckFailedException on mismatch)
table.put_item(
    Item={'userId': 'U001', 'email': 'kim@example.com'},
    ConditionExpression=Attr('userId').not_exists()  # Prevent duplicates
)

# 5. ProjectionExpression — Select attributes to return (reduces network cost, RCU based on entire item)
response = table.get_item(
    Key={'userId': 'U001'},
    ProjectionExpression='email, #n',
    ExpressionAttributeNames={'#n': 'name'}
)
```

> ⚠️ **Trap**: `FilterExpression` filters **after** reading items. That is, DynamoDB first reads all items matching the partition key condition (consuming RCU), then FilterExpression removes some. If the result is 10 items but 1,000 were read, RCU is billed on 1,000 items. To reduce RCU, design a GSI to search with KeyConditionExpression instead of FilterExpression.

## Adaptive Capacity and Burst Capacity

Both handle short-term throughput overages, but in different ways.

**Burst Capacity**: Accumulates unused RCU/WCU up to 5 minutes worth, then uses them during sudden traffic spikes. Automatic, no configuration needed.

**Adaptive Capacity**: When one partition in a table becomes a hot partition, redistributes spare capacity from other partitions to it. Improved to "instant" mode since 2018 — previously took minutes.

Both are temporary buffers; fundamental solution is design:
- Burst: Handles short peaks but sustained overages throttle
- Adaptive Capacity: Relieves hot partitions but cannot exceed total table throughput limit

## DynamoDB Local — Local Development Environment

DynamoDB Local is a DynamoDB emulator written in Java that runs locally via Docker or JAR. You can develop and integration-test DynamoDB without an actual AWS account.

```bash
# Run DynamoDB Local with Docker
docker run -p 8000:8000 amazon/dynamodb-local

# Connect SDK to local endpoint
import boto3
dynamodb = boto3.resource(
    'dynamodb',
    endpoint_url='http://localhost:8000',
    region_name='us-east-1',
    aws_access_key_id='dummy',
    aws_secret_access_key='dummy'
)
```

Warning: DynamoDB Local is not identical to actual DynamoDB. Performance characteristics, throughput limits, and some new features are not simulated. Suitable for integration tests but actual DynamoDB should be used for performance testing.

The DynamoDB philosophy we examined today — partition hashing, consistency models, expression system — forms the foundation for all remaining DynamoDB topics. In the next day, we explore how to design LSI/GSI on this foundation and why Single-Table Design became the standard pattern for DynamoDB.

## 📝 연습 문제

**문제 1.** When a boto3 client is created with `s3 = boto3.client('s3')`, how is the region determined?

A) It is always fixed to us-east-1
B) It searches the `AWS_REGION` environment variable → `AWS_DEFAULT_REGION` → the default profile in `~/.aws/config`, in that order
C) The nearest region is automatically selected
D) S3 is a global service, so the region is irrelevant

**정답: B**
해설: If no region is specified, boto3 searches environment variables and configuration files according to a priority order. The exact order is: (1) `region_name` in the client constructor, (2) the `AWS_REGION` environment variable, (3) the `AWS_DEFAULT_REGION` environment variable, (4) the `region` value of the active profile in `~/.aws/config`. If none of these yield a region, it raises `NoRegionError`. S3 bucket names live in a global namespace, but the data is stored in a specific region, so a region specification is required (exceptionally, the `s3.amazonaws.com` global endpoint also exists, but since 2020 region-aware endpoints have been recommended).

---

**문제 2.** A company is using IAM roles on EC2 instances via IMDSv1. The security team has demanded that IMDSv2 be enforced to defend against SSRF attacks. What is the most accurate action?

A) Remove the IAM role
B) Set the instance metadata options to `HttpTokens=required`
C) Move the instance to a different region
D) Block 169.254.169.254 in the Security Group

**정답: B**
해설: Setting `MetadataOptions.HttpTokens=required` rejects any request that has not obtained a token via PUT. Since SSRF attackers can typically only issue GETs, metadata access is blocked. A would prevent the application from using IAM permissions, C is unrelated to the IMDSv1 problem, and D fails because 169.254.169.254 is a link-local address and cannot be controlled by SGs (SGs operate only on ENIs). Additionally, setting `HttpPutResponseHopLimit=1` can also block metadata access from container networks.

---

**문제 3.** How is the AZ in which a Lambda function runs determined?

A) The developer specifies the AZ in the function definition
B) AWS automatically selects among available AZs and the developer has no control
C) A Lambda attached to a VPC runs in the AZs of the specified subnets, while a non-VPC Lambda is distributed internally by AWS
D) It always runs in the first AZ of the region

**정답: C**
해설: Lambda has no option to directly specify an AZ at function creation. A Lambda unrelated to any VPC (the default) is automatically distributed across the AWS-managed multi-AZ Lambda environment. A Lambda attached to a VPC (via `VpcConfig`) runs in the AZs of the subnets where its ENIs were created, so **you must specify subnets in multiple AZs to survive a single-AZ failure**. If you specify only a single-AZ subnet, Lambda invocations fail when that AZ goes down. Before 2019, VPC Lambda cold starts took 10+ seconds due to ENI creation, but with the introduction of Hyperplane ENIs in September 2019, the ENI is created only on the first invocation and reused thereafter.

---

**문제 4.** Between Global Accelerator and CloudFront, which fits the following scenario? "We must provide an MQTT-based IoT messaging service to users worldwide."

A) CloudFront (suitable for accelerating all global traffic)
B) Global Accelerator (TCP/UDP acceleration; MQTT is TCP-based)
C) Route 53 Geolocation (geography-based distribution)
D) Direct Connect (dedicated lines for all users)

**정답: B**
해설: CloudFront is centered on HTTP/HTTPS L7 caching, so it cannot handle MQTT (TCP 1883/8883). Route 53 Geolocation only branches DNS responses without accelerating the traffic itself, and failover takes minutes due to DNS TTL. Direct Connect is a dedicated line between a specific site and AWS, so it doesn't fit global user distribution. Global Accelerator pulls traffic to the nearest edge via BGP Anycast and forwards it over the AWS backbone, guaranteeing consistent latency for both TCP and UDP. Since two static IPs are guaranteed, it is also well suited for hardcoding IPs into IoT device firmware.

---

**문제 5.** A developer created an S3 bucket in us-east-1, but SDK calls from ap-northeast-2 have latency exceeding 200ms. What is the most appropriate improvement?

A) Move the S3 bucket from us-east-1 to ap-northeast-2 (impossible)
B) Create another bucket with the same name in ap-northeast-2 (impossible; globally unique)
C) Create a replica in ap-northeast-2 with S3 Cross-Region Replication and have clients access the bucket in the nearer region
D) Enable S3 Transfer Acceleration, which automatically selects the nearest region

**정답: C**
해설: An S3 bucket's region is fixed at creation and cannot be moved, and names are globally unique so the same name cannot be created in another region. You can create a differently named replica with CRR (Cross-Region Replication), or use **Multi-Region Access Points** (launched December 2020) to have a single global endpoint automatically route to the nearest regional bucket. D's S3 Transfer Acceleration routes through CloudFront edges onto the backbone, so latency improves, but it is not "automatic region selection". It also adds $0.04 per GB on uploads.

---

**문제 6.** Which of the following is NOT in the "customer responsibility" area?

A) SQL injection vulnerabilities in Lambda function code
B) MySQL engine security patches on an RDS instance
C) S3 bucket policy configuration
D) Guest OS patching on EC2

**정답: B**
해설: RDS is PaaS, so patching the DB engine is AWS's responsibility. However, the customer can choose when patches are applied via the maintenance window. A is a code vulnerability, always the customer's responsibility. C is IAM/resource policy, always the customer's responsibility. D: since EC2 is IaaS, OS patching is the customer's responsibility (conversely, if you move the same workload to ECS Fargate, even container host OS patching shifts to AWS). Memorize this pattern as "the higher the abstraction level, the higher the responsibility boundary moves" and you can solve all the variations on the exam.

---

**문제 7.** You are connecting PrivateLink to a partner via VPC peering. Both accounts placed subnets in `ap-northeast-2a`, yet traffic flows cross-AZ. What is the cause and the fix?

A) It is an AWS bug and you should open a support ticket
B) `ZoneName` maps to different physical AZs per account, so you must compare and match using `ZoneId` (`apne2-az1`, etc.)
C) VPC peering always operates cross-AZ
D) The regions must be made the same (they already are)

**정답: B**
해설: AWS deliberately shuffles the AZ mapping per account to prevent load concentration from "everyone creating in a first". Account A's `ap-northeast-2a` (`apne2-az1`) and Account B's `ap-northeast-2a` (`apne2-az3`) are physically different AZs. Check the ZoneId with `aws ec2 describe-availability-zones` and place subnets in the same ZoneId to land in the same physical AZ. Cross-AZ data transfer costs $0.01 per GB ($0.02 round-trip) and accumulates quickly with high-volume traffic, so recognizing this trap matters in practice.
