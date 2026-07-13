# Day 1 - Batch Ingestion: S3 Upload, DataSync, Transfer Family, Snow

The first button you press in data engineering is always "where and how do we fetch the data?" No matter how sophisticated your analysis pipeline is, if raw data doesn't flow in reliably, everything stops. Week 2 splits ingestion into batch and streaming, and today we focus on batch ingestion.

Batch ingestion means "collecting data in fixed units (files, tables, time periods) and bringing it all at once." This covers overnight loads when real-time performance isn't required, on-premises migrations, and large bulk transfers. AWS provides different tools depending on data volume, location, and network conditions. Today's four approaches are S3 upload patterns, DataSync, Transfer Family, and the Snow family.

## S3 Is the Data Lake's Landing Zone

In most AWS analytics pipelines, S3 is where data first arrives. S3 offers virtually unlimited capacity, 11 9's durability, and is a common storage that Athena, Glue, Redshift Spectrum, and EMR can all read directly. So it's accurate to simplify batch ingestion to "reliably getting files into S3 by any means."

Small files work fine with simple PutObject, but large files (hundreds of MB or more) need **Multipart Upload**. The file is split into chunks that upload in parallel, and if one chunk fails, only that chunk needs retransmission — making large transfers both faster and more robust.

```bash
# Small files: simple upload
aws s3 cp sales-2026-06.csv s3://my-data-lake/raw/sales/

# Large files: CLI automatically switches to multipart when exceeding threshold (default 8MB)
aws s3 cp huge-dataset.parquet s3://my-data-lake/raw/events/ \
    --expected-size 5368709120

# Tune multipart threshold / concurrency (accelerate bulk transfers)
aws configure set s3.multipart_threshold 64MB
aws configure set s3.max_concurrent_requests 20
```

> 💡 **Related theory**: If you start a multipart upload but never complete it (CompleteMultipartUpload), the uploaded chunks remain in S3, silently generating storage costs. To prevent this, it's a best practice to set `AbortIncompleteMultipartUpload` in your S3 Lifecycle rules to auto-delete incomplete chunks after N days. The exam frequently asks about this as an "unexplained S3 cost spike" scenario.

The moment data arrives in S3, you can trigger downstream events. **S3 Event Notification** sends object creation events to Lambda, SQS, SNS, or EventBridge, letting you build event-driven batches like "run a Glue job as soon as a file arrives."

```json
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "arn:aws:lambda:ap-northeast-2:123456789012:function:trigger-glue-job",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": { "FilterRules": [{ "Name": "prefix", "Value": "raw/sales/" }] }
      }
    }
  ]
}
```

## DataSync: Automating Large File Transfers Between On-Premises and AWS

Moving terabytes of data from on-premises NAS or file servers to S3, EFS, or FSx would be a nightmare to do manually. **AWS DataSync** is a managed transfer service that automates and accelerates this work. You place an agent (VM) on-premises, it transfers data to AWS using multiple threads, and **validates integrity with checksums** during and after transfer.

DataSync's core value isn't one-time copying — it's **repeatable scheduled synchronization**. You can schedule it to transfer only changed files incrementally every night, creating a sustained pipeline from on-premises to your data lake.

```bash
aws datasync create-task \
    --source-location-arn arn:aws:datasync:...:location/loc-onprem-nas \
    --destination-location-arn arn:aws:datasync:...:location/loc-s3-lake \
    --options '{"VerifyMode":"POINT_IN_TIME_CONSISTENT","PreserveDeletedFiles":"PRESERVE"}' \
    --schedule '{"ScheduleExpression":"cron(0 2 * * ? *)"}'
```

> 💡 **Related theory**: The distinction between DataSync and plain S3 CLI uploads is a key exam point. For small, one-time transfers, CLI/SDK is fine; but if you need ① large volume (TB+), ② scheduled repetition, ③ integrity verification, and ④ metadata preservation (permissions, timestamps), DataSync is the right answer. DataSync uses network bandwidth, so it works best when you have sufficient bandwidth; if bandwidth is limited or you're dealing with petabytes, you move to the Snow family.

## Transfer Family: Bringing Legacy SFTP/FTPS Workflows to S3

Many enterprises and partner systems still exchange files over **SFTP/FTPS/FTP**. When you want to keep this legacy protocol working while only changing the storage backend to S3, you use **AWS Transfer Family**. External partners upload files as usual via SFTP, but those files actually land directly in your S3 bucket (or EFS).

The key insight is "keep the partner's client and authentication methods unchanged, swap only the backend to S3." You can wire existing EDI and B2B file exchanges to your data lake without any code changes.

```bash
aws transfer create-server \
    --protocols SFTP \
    --endpoint-type VPC \
    --identity-provider-type SERVICE_MANAGED \
    --domain S3
```

If DataSync is "me pulling/pushing bulk data into AWS with scheduled synchronization," Transfer Family is "an external party pushing data via a standard protocol into a gateway." The direction and initiative are different.

## Snow Family: When the Network Can't Do It

If data is petabyte-scale or transfer lines are so slow that moving it over the internet would take months, there's the **Snow family** — you load data into physical hardware and ship it to AWS.

| Service | Capacity | Use Case |
|--------|----------|----------|
| Snowcone | ~8TB (SSD) | Small-scale, edge, mobile environments |
| Snowball Edge | ~80TB | Large migrations, edge computing |
| Snowmobile | ~100PB | (Effectively EOL) Very large data center migration |

You receive the device, load data into it, ship it back, and AWS loads it into S3. During transit, data is protected by 256-bit encryption.

> 💡 **Related theory**: The break-even between "transferring over the network" vs "physical shipment" is a function of data volume and bandwidth. Roughly, sending 10TB over a 100Mbps line takes about 12 days. The same data via Snowball takes about a week for round-trip shipping and doesn't tie up your connection at all. In exams, when you see "slow connection + large volume + one-time migration," it's almost always Snow family. Conversely, "ongoing repeating sync + sufficient bandwidth" points to DataSync.

## Summary: What to Use When

- **Small volume, one-time → S3 CLI/SDK** (with multipart + Lifecycle abort rule)
- **Large volume, repeating, verification needed → DataSync** (scheduled incremental sync)
- **External partners push via SFTP/FTPS → Transfer Family**
- **Petabyte-scale, slow connection, one-time → Snow family**

The ability to distinguish these four options by keyword is fundamental to the ingestion domain of DEA-C01.

## 📝 Practice Problems

**Problem 1.** You need to automatically sync 30TB of data from an on-premises NAS to S3 every night, transferring only changes, with integrity verification and file metadata preservation required. Which service is most appropriate?

A) AWS DataSync scheduled task  
B) AWS Snowball Edge shipped daily  
C) S3 simple CLI upload script run by cron  
D) AWS Transfer Family SFTP server  

**Answer: A**  
Explanation: This is a textbook DataSync scenario: large volume, repeating schedule, integrity verification, and metadata preservation all required. A CLI script would need to implement incremental transfer, verification, and metadata preservation manually, making it fragile. Snowball is for one-time large migrations, not daily shipments. Transfer Family is a gateway where external parties push via a protocol — wrong direction here.

---

**Problem 2.** External partner companies have long sent files via SFTP client. You want to maintain this workflow while having received files land directly in your S3 data lake. What approach minimizes code changes?

A) Ask partners to call AWS SDK PutObject directly  
B) Create an SFTP server with AWS Transfer Family and set the backend to S3  
C) Install DataSync agent at the partner site  
D) Ship Snowcone device to the partner  

**Answer: B**  
Explanation: Transfer Family is a managed gateway that keeps existing SFTP/FTPS/FTP authentication and client unchanged while swapping only the backend storage to S3/EFS. No changes needed on the partner side. Direct SDK calls require a complete overhaul of partner systems, and DataSync/Snow don't support the inbound push pattern via standard protocols.

---

**Problem 3.** You have only a 100Mbps connection at a data center and must perform a one-time migration of 80TB of archive to AWS S3. What's the fastest method that doesn't tie up your connection?

A) DataSync with nightly incremental transfers  
B) S3 multipart upload with parallel execution  
C) AWS Snowball Edge device: load data and ship  
D) Transfer Family SFTP upload  

**Answer: C**  
Explanation: Slow connection + large volume (80TB) + one-time migration is the textbook Snow family scenario. Sending 80TB over 100Mbps theoretically takes tens of days and monopolizes your line the whole time. Snowball Edge handles 80TB by physical shipment, completing in about a week without touching your connection. DataSync, multipart, and SFTP all use the same slow connection.

---

**Problem 4.** Your S3 cost invoice shows steady storage charges for objects you can't identify in any bucket. They started after you automated large file uploads. What's the most likely cause and solution?

A) Versioning is enabled — disable versioning  
B) Replication rule error — disable replication  
C) Wrong storage class — switch to Glacier  
D) Incomplete multipart upload chunks remain — set AbortIncompleteMultipartUpload in Lifecycle  

**Answer: D**  
Explanation: If multipart uploads don't complete, the chunks remain in S3, invisible in object listings but still charged for storage. The standard fix is to add AbortIncompleteMultipartUpload in your Lifecycle rule to auto-clean after N days. Versioning, storage class, and replication all create visible objects, so they wouldn't cause "invisible" charges.

---

**Problem 5.** You want to build an event-driven batch pipeline that automatically runs a Glue transformation as soon as files arrive in S3 raw/sales/. Which approach is most appropriate?

A) S3 Event Notification with prefix filter to trigger Lambda, which invokes the Glue job  
B) Set Glue job to poll every 1 minute via cron  
C) Connect Glue job to DataSync task  
D) Use Transfer Family events to feed directly to Redshift  

**Answer: A**  
Explanation: S3 Event Notification sends ObjectCreated events with prefix/suffix filters to Lambda, SQS, SNS, or EventBridge, enabling true event-driven pipelines. You can filter to raw/sales/ specifically. 1-minute polling is inefficient and high-latency, and DataSync/Transfer Family aren't designed to trigger Glue jobs directly.

---
