# Day 4 - Media & Entertainment Streaming — PB-Scale Global CDN, Real-Time Analytics, Cost Efficiency

Media streaming: petabytes of video, billions of requests, zero margin for latency, razor-thin margins. Pro design: CloudFront edge + S3 Intelligent-Tiering (warm→cold after 30 days), EMR/Redshift for real-time analytics, Lambda for thumbnail generation, S3 event notifications.

Core: **Performance (latency<100ms) and Cost (margin<10%) compete. Win via archival automation and regional edge caching.**

Key mappings: (1) "PB-scale CDN, minimal origin requests" → **CloudFront + S3 Intelligent-Tiering**, (2) "Transcoding pipeline scalable" → **Lambda + SQS + S3**, (3) "Petabyte storage cost minimum" → **S3 Glacier transition after 90 days**, (4) "Real-time view analytics" → **Kinesis Firehose + S3 + Athena**, (5) "Predictive content delivery" → **CloudFront geolocation + Kinesis analytics**.

[6 EXERCISES: CloudFront origin behavior, S3 archival strategy, Lambda cold-start video processing, DynamoDB eventual consistency for analytics, Global Accelerator vs CloudFront, Kinesis vs SQS for streaming ingestion]

---

## 📝 연습 문제

**문제 1.** 수십억 요청 origin 최소화 → **CloudFront S3 Intelligent-Tiering**

**문제 2.** 바이럴 영상 업로드 썸네일→미디엄→HD 자동 생성 → **Lambda SQS Kinesis 파이프라인**

**문제 3.** PB 저장 비용 최소 → **S3 Glacier transition 90일**

**문제 4.** 실시간 시청 분석 집계 → **Kinesis Firehose + S3 + Athena**

**문제 5.** Regional CDN 성능 최적화 → **CloudFront geolocation + regional caching**

**문제 6.** 트래픽 스파이크 고정 비용 방지 → **Serverless autoscale vs provisioned**

---