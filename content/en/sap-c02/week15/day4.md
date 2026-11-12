# Day 4 - Media & Entertainment Streaming — PB-Scale Global CDN, Real-Time Analytics, Cost Efficiency

Media streaming: petabytes of video, billions of requests, zero margin for latency, razor-thin margins. Pro design: CloudFront edge + S3 Intelligent-Tiering (warm→cold after 30 days), EMR/Redshift for real-time analytics, Lambda for thumbnail generation, S3 event notifications.

Core: **Performance (latency<100ms) and Cost (margin<10%) compete. Win via archival automation and regional edge caching.**

Key mappings: (1) "PB-scale CDN, minimal origin requests" → **CloudFront + S3 Intelligent-Tiering**, (2) "Transcoding pipeline scalable" → **Lambda + SQS + S3**, (3) "Petabyte storage cost minimum" → **S3 Glacier transition after 90 days**, (4) "Real-time view analytics" → **Kinesis Firehose + S3 + Athena**, (5) "Predictive content delivery" → **CloudFront geolocation + Kinesis analytics**.

[6 EXERCISES: CloudFront origin behavior, S3 archival strategy, Lambda cold-start video processing, DynamoDB eventual consistency for analytics, Global Accelerator vs CloudFront, Kinesis vs SQS for streaming ingestion]

---

## 📝 Practice Questions

**Question 1.** Minimize origin requests for billions of requests → **CloudFront S3 Intelligent-Tiering**

**Question 2.** Automatically generate thumbnail → medium → HD for viral video uploads → **Lambda SQS Kinesis pipeline**

**Question 3.** Minimize PB storage cost → **S3 Glacier transition after 90 days**

**Question 4.** Real-time viewing analytics aggregation → **Kinesis Firehose + S3 + Athena**

**Question 5.** Optimize regional CDN performance → **CloudFront geolocation + regional caching**

**Question 6.** Avoid fixed costs during traffic spikes → **Serverless autoscale vs provisioned**

---