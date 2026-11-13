# Day 1 - Batch Ingestion: S3 Upload, DataSync, Transfer Family, Snow

## 📌 Key Takeaways

- **Small, one-off → S3 CLI/SDK**. For large files use multipart upload, and clean up incomplete parts with the Lifecycle `AbortIncompleteMultipartUpload`.
- **Large volume, recurring, verification needed → DataSync**. Scheduled incremental sync + checksum integrity verification + metadata preservation.
- **External partners push over SFTP/FTPS → Transfer Family**. Keep the clients and authentication as they are, and swap only the backend to S3.
- **Petabyte scale, slow line, one-time → Snow family**. It is physical shipping, so it does not occupy your network line.
- Being able to tell the boundaries between these four options by keywords is the foundation of the DEA-C01 ingestion domain.

## S3 Is the Landing Zone of the Data Lake

- Batch ingestion is a method of collecting data "in set units (files, tables, time windows) and bringing it all at once." Nightly loads that don't need real-time, on-premises migrations, and bulk transfers belong here.
- AWS provides different tools depending on the volume and location of the data and the network situation. The four we cover today are S3 upload patterns, DataSync, Transfer Family, and the Snow family.
- In most AWS analytics pipelines, S3 is where data first arrives. That is because it has practically unlimited capacity, 11 9's durability, and is a common store that Athena, Glue, Redshift Spectrum, and EMR can all read directly.
- So it is not far off to simplify "batch ingestion = getting files safely into S3 by whatever means."
- For small files, a simple PutObject is enough.
- For large files (hundreds of MB or more) you should use **Multipart Upload**. The file is split into parts and transferred in parallel, and if one part fails, only that part needs to be resent, making large transfers fast and robust.

```bash
# Small file: simple upload
aws s3 cp sales-2026-06.csv s3://my-data-lake/raw/sales/

# Large file: the CLI automatically switches to multipart above the threshold (default 8MB)
aws s3 cp huge-dataset.parquet s3://my-data-lake/raw/events/ \
    --expected-size 5368709120

# Tune multipart threshold/concurrency (accelerate bulk transfers)
aws configure set s3.multipart_threshold 64MB
aws configure set s3.max_concurrent_requests 20
```

> 💡 **Related Theory**: If you start a multipart upload and never complete it (CompleteMultipartUpload), the uploaded parts remain in S3 and generate invisible storage cost. To prevent this, the best practice is to set `AbortIncompleteMultipartUpload` in an S3 Lifecycle rule so incomplete parts are automatically deleted after N days. It may be tested as an "unexplained S3 cost increase" scenario.

You can also generate an event the moment data arrives in S3 to trigger downstream processing.

- **S3 Event Notification**: sends object-creation events to Lambda, SQS, SNS, or EventBridge.
- Adding prefix/suffix filters makes an event-driven batch such as "run the Glue job as soon as a file arrives."

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

## DataSync: Automating Bulk File Transfer Between On-Premises and AWS

- **AWS DataSync** is a managed transfer service that automates and accelerates moving several TB of data piled up on on-premises NAS and file servers to S3, EFS, and FSx.
- You place an agent (VM) on-premises, and it transfers data between there and AWS with multiple threads.
- It **verifies integrity with checksums** during and after the transfer.
- The core value is not a one-time copy but **repeatable scheduled sync**. You schedule it to transfer only changed files incrementally every night, building a continuous feed pipeline from on-premises to the data lake.

```bash
aws datasync create-task \
    --source-location-arn arn:aws:datasync:...:location/loc-onprem-nas \
    --destination-location-arn arn:aws:datasync:...:location/loc-s3-lake \
    --options '{"VerifyMode":"POINT_IN_TIME_CONSISTENT","PreserveDeletedFiles":"PRESERVE"}' \
    --schedule '{"ScheduleExpression":"cron(0 2 * * ? *)"}'
```

> 💡 **Related Theory**: The distinction between DataSync and a plain S3 CLI upload is an exam point. For one-time small volumes, the CLI/SDK is enough, but if you need (1) large volume (TB+), (2) a recurring schedule, (3) integrity verification, and (4) preservation of metadata (permissions, timestamps), DataSync is the answer. DataSync uses network bandwidth, so it suits cases with a sufficient line; if the line is insufficient or the volume is petabyte scale, move on to the Snow family.

## Transfer Family: Bringing Existing SFTP/FTPS Workflows to S3

- Many enterprise and partner systems still exchange files over **SFTP/FTPS/FTP**.
- **AWS Transfer Family** is a managed gateway that keeps these legacy protocols but swaps the storage to S3. External partners upload via SFTP as usual, but the files are stored directly in an S3 bucket (or EFS).
- The key point is that "the partner's client and authentication method stay as they are, and only the backend is replaced with S3."
- You can connect existing EDI and B2B file exchanges to the data lake without code changes.

```bash
aws transfer create-server \
    --protocols SFTP \
    --endpoint-type VPC \
    --identity-provider-type SERVICE_MANAGED \
    --domain S3
```

The direction and the actor differ.

- DataSync: bulk sync that I pull/push into AWS myself
- Transfer Family: a gateway where outside parties push in using a fixed protocol (receive)

## Snow Family: When the Network Is Not the Answer

- If the data is petabyte scale, or the transfer line is so slow that moving it over the internet would take months, the answer is the **Snow family**, where you load data on physical devices and ship them to AWS.

| Service | Capacity | Use |
|--------|------|------|
| Snowcone | ~8TB (SSD) | Small, edge, mobile environments |
| Snowball Edge | ~80TB | Large-scale migration, edge computing |
| Snowmobile | ~100PB | (Effectively discontinued) very large data center moves |

- After you receive the device, fill it with data, and ship it back, AWS loads it into S3.
- It is protected with 256-bit encryption in transit.

The break-even point of "line vs physical shipping" is a function of data volume and bandwidth. Sending roughly 10TB over a 100Mbps line takes about 12 days. Sending the same data by Snowball takes about one week round-trip shipping and doesn't occupy the line. On the exam, when you see the keywords "slow line + large volume + one-time migration," the answer is almost always the Snow family. Conversely, "continuous, recurring sync + sufficient line" means DataSync.

## 📖 Glossary

- **Batch ingestion**: A method of collecting data by file, table, or time unit and bringing it all at once. Used for jobs like nightly loads that don't need to be real-time.
- **Data lake**: A large store that keeps even the raw, pre-cleaned data as is. On AWS, S3 usually plays this role.
- **Multipart upload**: A method of splitting a large file into parts and uploading them simultaneously. If one fails, only that part needs to be resent.
- **AbortIncompleteMultipartUpload**: An S3 Lifecycle setting that automatically deletes leftover upload parts that were never completed after a number of days. If you don't set it, invisible charges accumulate.
- **11 9's durability**: 99.999999999%. The S3 durability figure meaning stored objects are effectively never lost.
- **S3 Event Notification**: A feature that sends a notification to Lambda, SQS, SNS, or EventBridge when an object is created in a bucket. Used to automatically run the next task using file arrival as the signal.
- **Incremental transfer**: A method of sending only what changed since last time instead of resending everything.
- **Checksum**: A short fingerprint value computed from data. Comparing the values before and after sending confirms the file was not corrupted.
- **SFTP/FTPS**: Long-standing standard protocols for exchanging files securely. Still widely used for business-to-business file exchange.
- **On-premises**: An environment of your own server rooms and equipment that the company owns and operates directly, rather than the cloud.

## 📝 Practice Questions

**Question 1.** You need to automatically sync only the changes of 30TB of data on an on-premises NAS to S3 every night, with transfer integrity verification and file metadata preservation. What is the most appropriate service?

A) AWS DataSync scheduled task  
B) Ship an AWS Snowball Edge every day  
C) Run a plain S3 CLI upload script with cron  
D) AWS Transfer Family SFTP server  

**Answer: A**  
Explanation: This is a classic DataSync scenario that requires large volume, a recurring schedule, integrity verification, and metadata preservation all together. A CLI script is fragile because you must implement incremental transfer, verification, and metadata preservation yourself, and Snowball is for one-time bulk migration so daily shipping is unrealistic. Transfer Family is a gateway that outside parties push into over a protocol, so the direction doesn't fit.

---

**Question 2.** External partner companies have long transferred files with SFTP clients. You want to keep this workflow as is while storing the received files directly in the S3 data lake. What is the way to minimize code changes?

A) Ask partners to call PutObject directly with the AWS SDK  
B) Create an SFTP server with AWS Transfer Family and specify S3 as the backend  
C) Install a DataSync agent at the partner companies  
D) Ship a Snowcone to the partner companies  

**Answer: B**  
Explanation: Transfer Family is a managed gateway that keeps the existing SFTP/FTPS/FTP authentication and clients and replaces only the backend storage with S3/EFS. There are no changes on the partner side. Calling the SDK directly requires a complete overhaul of the partners' systems, and DataSync/Snow are not receiving patterns where outside parties push in over a standard protocol.

---

**Question 3.** From a data center with only a 100Mbps line, you must migrate an 80TB archive to AWS S3 as a one-time job. What is the fastest method that does not occupy the line?

A) Incremental transfer with DataSync every night  
B) Run S3 multipart uploads in parallel  
C) Load the data onto AWS Snowball Edge devices and ship them  
D) SFTP upload through Transfer Family  

**Answer: C**  
Explanation: Slow line + large volume (80TB) + one-time migration is the textbook Snow family scenario. Sending 80TB at 100Mbps would theoretically take dozens of days, occupying the line the whole time. Snowball Edge handles 80TB-class capacity by physical shipping and completes in about one week regardless of the line. DataSync, multipart, and SFTP all use the same slow line.

---

**Question 4.** The S3 billing statement shows a steady, unidentified storage charge that doesn't correspond to any visible object. It started right after automating large file uploads. What is the most likely cause and solution?

A) Versioning is turned on - disable versioning  
B) Replication rule error - disable replication  
C) Wrong storage class - move to Glacier  
D) Incomplete multipart upload parts remain - set AbortIncompleteMultipartUpload in a Lifecycle rule  

**Answer: D**  
Explanation: If a multipart upload is not completed, the uploaded parts don't appear in the object list but are billed as storage. The standard solution is to add AbortIncompleteMultipartUpload to a Lifecycle rule so they are cleaned up automatically after N days. Versions, storage classes, and replication all show up as objects, so they are not the cause of "invisible" cost.

---

**Question 5.** You want to build an event-driven batch that automatically runs a Glue transform job as soon as a file arrives in the S3 raw/sales/ path. What is the most appropriate method?

A) Use S3 Event Notification with a prefix filter to trigger Lambda, which runs the Glue job  
B) Set up a cron that polls the Glue job every minute  
C) Connect Glue to a DataSync task  
D) Load directly into Redshift from a Transfer Family event  

**Answer: A**  
Explanation: S3 Event Notification sends ObjectCreated events with prefix/suffix filters to Lambda, SQS, SNS, or EventBridge to build an event-driven pipeline. A raw/sales/ prefix filter can trigger only on that path. Polling every minute is delayed and inefficient, and DataSync/Transfer Family are not meant to trigger Glue jobs directly.

---
