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

**Question 7.** An OTT service wants to transcode uploaded VOD source files into multiple qualities (ABR), apply DRM, and output HLS/DASH. Which service is most appropriate?
A) MediaLive
B) MediaConvert
C) MediaPackage
D) MediaConnect

**Answer: B**

Explanation: **MediaConvert** is a file-based (VOD) batch transcoding service that encodes one source into multiple bitrates (ABR) and applies HLS/DASH packaging and DRM. MediaLive in A is for **live** real-time encoding. MediaPackage in C handles packaging, DRM, and JIT but does not transcode itself (it packages the encoder output). MediaConnect in D transports live input. Trap: "VOD multi-bitrate transcoding" is MediaConvert, and "live encoding" is MediaLive.

---

**Question 8.** A live feed from a stadium camera must be transmitted securely to AWS over the public internet with packet loss recovery. Which service and protocol are most appropriate?
A) MediaConvert
B) MediaConnect (SRT/Zixi/RIST)
C) MediaLive
D) MediaPackage

**Answer: B**

Explanation: **MediaConnect** is a service dedicated to secure transport of live video, and it uses protocols such as **SRT, Zixi, and RIST** to recover from packet loss on the public internet and deliver reliably. Input redundancy also prepares for failures on the transport path. A is VOD transcoding, C is live encoding, and D is packaging, so none of them has transport as its main role. Trap: "secure live transport over a public network (SRT)" is MediaConnect.

---

**Question 9.** In a live sports broadcast, viewing must not be interrupted even if an encoder (pipeline) fails. Which configuration is most appropriate?
A) Two MediaConvert instances
B) MediaLive redundant pipelines
C) CloudFront with multiple origins
D) S3 Cross-Region Replication

**Answer: B**

Explanation: **MediaLive** runs two independent pipelines at the same time and provides **pipeline redundancy**, so that if one fails the other continues the output without interruption. Live cannot be retried, so redundancy at the encoding stage is the key to uninterrupted service. MediaConvert in A is not for live. C is about origin availability and does not directly solve an encoder failure. D is VOD storage replication. Trap: "uninterrupted service even when live encoding fails" is MediaLive pipeline redundancy.

---

**Question 10.** 5 million concurrent viewers request a new live segment at the same moment, and the load on the origin (MediaPackage) surges. What is the most appropriate way to minimize origin requests?
A) CloudFront Price Class 100
B) CloudFront Origin Shield (request collapsing)
C) A larger origin instance
D) Add Signed URLs

**Answer: B**

Explanation: If many edges hit the origin individually, hundreds of requests for the same segment reach the origin. **Origin Shield** is an intermediate cache layer between the edges and the origin that gathers misses from all edges in one place and uses **request collapsing** so that only a single request reaches the origin. It protects the origin from the thundering herd. A only excludes regions (cost) and does not reduce origin load. C is inefficient and not a root fix. D is access authorization, not load reduction. Trap: "further reducing origin load and protecting against simultaneous surges" is Origin Shield.

---

**Question 11.** You want only paying subscribers to access a stream made up of hundreds of segments. You want to authorize at the session level instead of signing every URL individually. What is the most appropriate method?
A) CloudFront public + WAF
B) CloudFront Signed Cookies + OAC
C) Signed URLs on each segment
D) Cognito alone

**Answer: B**

Explanation: Video consists of hundreds of segments, so **Signed Cookies**, which authorize access to many files at once at the session level, are more suitable than Signed URLs, which sign each file. OAC blocks direct access to S3/the origin so that traffic goes only through CloudFront. Signed URLs in C are for individual files and are inefficient for hundreds of segments. A has no authorization, and Cognito alone in D cannot directly implement authorization for CloudFront content access. Trap: "many segments, session-level authorization" is Signed Cookies.

---

**Question 12.** You want to collect viewing events in real time and immediately reflect the content a user just watched in recommendations. Which combination is most appropriate?
A) S3 + Athena batch
B) Kinesis Data Streams + Amazon Personalize (real-time event tracker)
C) DynamoDB alone
D) Glue + QuickSight

**Answer: B**

Explanation: Real-time personalization streams the viewing events with **Kinesis Data Streams** and uses the **Personalize event tracker** to reflect real-time events, so that GetRecommendations immediately incorporates the content just watched. A and D are batch analytics, so there is no immediate reflection. DDB alone in C has no recommendation model. Trap: "recommend immediately after the video just watched" is Kinesis + Personalize real-time.

---

**Question 13.** The access pattern of a 50 PB VOD catalog is unpredictable (popular content sometimes suddenly comes back). You want to optimize storage cost automatically, with no restore delay when content comes back. Which is the most appropriate choice?
A) All S3 Standard
B) S3 Intelligent-Tiering
C) Manual Lifecycle moves to Glacier
D) S3 One Zone-IA

**Answer: B**

Explanation: **S3 Intelligent-Tiering** monitors access patterns per object, automatically demotes unused objects to cheaper tiers, and automatically promotes them back to faster tiers when access increases. It optimizes cost without restore delay for unpredictable patterns. A is too expensive. Manual Glacier moves in C cause a restore delay of minutes to hours when content comes back, hurting the viewing experience. D is a single AZ with lower durability and availability, so it is unsuitable for the catalog source. Trap: "unpredictable pattern, automatic optimization with no restore delay" is Intelligent-Tiering.

---
---