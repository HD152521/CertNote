# Day 1 - Domains 1 & 2 Integration: Data Engineering + EDA

## 📌 Key Takeaways

- Domain 1 (20%) + Domain 2 (24%) = **about 44% of the exam**. This is the front part of the pipeline that "turns raw source data into clean, trainable features."
- Ingestion is the four Kinesis siblings, storage and querying is S3/Athena/Redshift, and transformation is Glue/EMR. The deciding axis is always **management burden vs control**.
- Encoding and scaling are decided by the **model type**. Distance-based and gradient-based models require scaling; tree-based models make it practically meaningless.
- Every fit (scaler, encoder, imputer, SMOTE) happens **only on the training set, after the split**. Breaking this rule is data leakage.
- EDA is not admiring plots but **gathering the basis for the next preprocessing decision**. Skewness → log transform, outliers → winsorizing, correlation above 0.95 → remove multicollinearity.

## Flow Map: Until the Data Becomes Trainable

```text
[Raw source data]
   │
   ├─ 1) Ingestion / loading (Domain 1)
   │     Real-time stream → Kinesis (Data Streams / Firehose)
   │     Batch loading    → S3 + Glue catalog
   │     Relational / migration → DMS, DataSync
   │
   ├─ 2) Storage (Domain 1)
   │     Data lake = S3 (the de facto standard)
   │     Query     = Athena (serverless), Redshift (warehouse)
   │
   ├─ 3) Transformation / ETL (Domain 1)
   │     Glue (serverless Spark) / EMR (large-scale cluster)
   │
   ├─ 4) Cleaning (Domain 2)
   │     Missing values, outliers, deduplication, type correction
   │
   ├─ 5) Feature engineering (Domain 2)
   │     Encoding, scaling, binning, dimensionality reduction (PCA)
   │
   └─ 6) Visualization / EDA (Domain 2)
         Explore distributions, correlations, outliers → QuickSight, scatter plots/histograms
```

## Exam Weight by Domain and Typical Question Forms

| Domain | Typical question type | Typical question |
|---|---|---|
| 1 Data Engineering (20%) | Service selection | "To load a stream into S3 with minimal operational burden?" |
| 1 Data Engineering (20%) | Architecture combination | "How do you connect ingestion → storage → query?" |
| 1 Data Engineering (20%) | Migration/transfer | "To move an on-premises DB/files to AWS?" |
| 2 Exploratory Data Analysis (24%) | Preprocessing technique selection | "Encoding for a high-cardinality categorical?" |
| 2 Exploratory Data Analysis (24%) | Preprocessing order | "What is the order of split, imputation, and scaling?" |
| 2 Exploratory Data Analysis (24%) | Leakage identification | "Why is only the offline score high?" |
| 2 Exploratory Data Analysis (24%) | Chart interpretation | "What do you do after seeing this histogram?" |
| 2 Exploratory Data Analysis (24%) | Imbalance handling | "Positives are 0.5% yet accuracy is 99%" |

## Domain 1: Ingestion and Streaming (The Four Kinesis Services)

Streaming questions almost always come down to distinguishing the roles of the four Kinesis siblings.

| Service | Core role | Clue words |
|------|------|------|
| Kinesis Data Streams | Real-time ingestion, custom consumers, shard management | Millisecond latency, multiple consumers, reprocessing |
| Kinesis Data Firehose | Fully managed delivery (S3/Redshift/OpenSearch) | Serverless, buffered delivery, transformation |
| Kinesis Data Analytics | Real-time analysis on streams with SQL/Flink | Real-time aggregation, window queries |
| Kinesis Video Streams | Video stream ingestion | Camera, video |

> 💡 **Related Theory**: Streams vs Firehose is decided by "who bears the management burden." Streams manages shard capacity, consumers, and retention directly, making it the most flexible but with a heavy operational burden. Firehose has no shard concept: you only set the buffer size and time, and it delivers automatically to S3/Redshift, so it is the answer when words like "fully managed / serverless / minimal operations" appear. Answer instantly: "custom processing / milliseconds / reprocessing" is Streams, and "just drop it into S3" is Firehose.

## Domain 1: Storage and ETL

| Requirement | Service |
|------|------|
| Central data lake storage | S3 |
| Serverless SQL queries over S3 | Athena |
| Large-scale structured analytics warehouse | Redshift |
| Serverless Spark ETL + catalog | Glue |
| Control of a large-scale Hadoop/Spark cluster | EMR |
| On-premises DB → AWS migration | DMS |
| Synchronized transfer of large files | DataSync |

Glue vs EMR is another case of "operational control vs convenience." Glue is serverless, so it provides ETL jobs and a Data Catalog (metadata) without launching a cluster, and is strong for "serverless ETL, automatic schema inference." EMR is used when you launch a cluster yourself and want fine control over the Spark version, libraries, and the Hadoop ecosystem. "Managed / serverless / quick start" = Glue; "fine-grained cluster tuning / existing Hadoop jobs" = EMR.

## Domain 2: Data Cleaning

| Problem | Technique |
|------|------|
| Missing values (few, MCAR) | Delete rows or impute with mean/median |
| Missing values (many, with a pattern) | KNN/model-based imputation, add a missing-flag feature |
| Numeric outliers | Detect with IQR/Z-score, then winsorize or remove |
| Class imbalance | SMOTE (oversampling), undersampling, weights |
| Duplicates / format errors | Deduplicate, standardize types and units |

> ⚠️ **Pitfall**: Scalers, encoders, imputers, and SMOTE are **fit only on the training set after the split**, and only `transform` is applied to the validation and test sets. Fitting on the entire data leaks test information into training (data leakage), inflating only the offline score and collapsing in production. A stem like "cross-validation score is excellent but production performance is terrible" is, in most cases, a question about leakage.

## Domain 2: Feature Engineering and Encoding

| Data / goal | Technique |
|------|------|
| Unordered categorical | One-Hot Encoding |
| Ordered categorical | Ordinal/Label Encoding |
| High-cardinality categorical | Embeddings, target/frequency encoding |
| Scale differences for distance/gradient-based models | Standardization (StandardScaler), normalization (MinMax) |
| Bucketing continuous values | Binning |
| Too many dimensions, multicollinearity | PCA (principal component analysis) |
| Text | TF-IDF, BoW, embeddings |

The distinction between "models that need" and "models that don't need" scaling falls within the exam scope. Distance-based (KNN, K-Means, SVM) and gradient-descent-based (linear/logistic regression, neural networks) models are sensitive to feature scale, so standardization is almost mandatory. Tree-based models (decision tree, random forest, XGBoost), on the other hand, have split criteria that are invariant to scale, so scaling is practically meaningless. An option like "it's XGBoost but scaling is mandatory" is a trap.

## Domain 2: What Do You Look For in Visualizations

| Chart | What it shows |
|------|------|
| Histogram/density | Single-variable distribution, skewness |
| Box plot | Outliers, quartile spread |
| Scatter plot | Relationship between two variables, clusters and outliers |
| Correlation heatmap | Multicollinearity, correlation between features |
| Line chart | Time-series trend and seasonality |

The purpose of EDA is not "a nice-looking picture" but "gathering the basis for preprocessing and modeling decisions." If the histogram shows strong skewness you decide on a log transform, if the box plot shows outliers you decide on winsorizing, and if the correlation heatmap shows two features at 0.95 or higher you decide to remove multicollinearity (drop one or use PCA). Visualization questions reduce to "what do you see in this picture and what do you do next?"

## Exam Clue Keyword → Answer Translation Table (Domain 1)

| Clue in the stem | Answer | Reason |
|---|---|---|
| "Millisecond latency, multiple consumers each read and reprocess" | **Kinesis Data Streams** | Direct control of shards and retention, supports multiple consumers |
| "Minimal operational burden, buffered delivery to S3/Redshift" | **Kinesis Data Firehose** | Fully managed delivery, only buffer size and time to set |
| "Real-time aggregation and window queries on a stream" | **Kinesis Data Analytics** | Applies SQL/Flink to the stream |
| "Ingest and play back camera video" | **Kinesis Video Streams** | Video-specific ingestion |
| "Ad hoc query of S3 with standard SQL without provisioning a cluster" | **Athena** | Serverless query, billed only for data scanned |
| "Complex joins and BI reports on large-scale structured data" | **Redshift** | Columnar warehouse |
| "Query raw data in S3 together with the warehouse without loading" | **Redshift Spectrum** | Directly queries S3 external tables from Redshift |
| "Serverless Spark ETL, automatic schema inference and metadata" | **Glue** (crawler + Data Catalog) | Provides ETL and a catalog without a cluster |
| "Fine control of the Spark version and Hadoop ecosystem, migrating existing Hadoop jobs" | **EMR** | You operate the cluster directly |
| "Migrate an on-premises relational DB with minimal downtime" | **DMS** | Dedicated to DB migration, supports continuous replication |
| "Synchronize large files from an on-premises file server to S3" | **DataSync** | Dedicated to file transfer and synchronization |
| "Visually clean and profile data without code" | **Glue DataBrew** | No-code data preparation |
| "Training and inference share and reuse the same feature definitions" | **SageMaker Feature Store** | Unifies feature storage and retrieval |
| "Share with non-technical users as a dashboard" | **QuickSight** | BI visualization service |

## Exam Clue Keyword → Answer Translation Table (Domain 2)

| Clue in the stem | Answer | Reason |
|---|---|---|
| "Unordered categories like color or city" | **One-Hot Encoding** | Doesn't create an arbitrary magnitude relationship |
| "Ordered categories like S/A/B grades" | **Ordinal / Label Encoding** | Preserves the order information as integers |
| "Thousands of distinct values like a user ID" | **Embeddings or target/frequency encoding** | One-Hot would explode the dimensions |
| "Before training KNN, SVM, or a neural network" | **Standardization (StandardScaler)** | Distance and gradients are sensitive to scale |
| "It's XGBoost but standardization is mandatory" | **Wrong option** | Trees' split criteria are invariant to scale |
| "Strong right skew with a long right tail" | **Log transform** | Makes the distribution closer to symmetric |
| "Two features have a correlation of 0.96" | **Remove multicollinearity (drop or PCA)** | Redundant information destabilizes coefficients |
| "Positive class is 0.5% yet accuracy is 99%" | **Resampling/class weights + switch the metric to F1/AUPRC** | Accuracy is meaningless under imbalance |
| "The minority class has very few samples in absolute terms" | **SMOTE (oversampling)** | Synthesizes the minority without discarding data |
| "The majority class is excessively large and training is slow" | **Undersampling** | Reduces the majority for balance and speed |
| "Correct the imbalance without touching the data" | **Class weights (e.g., `scale_pos_weight`)** | Adjusts the penalty in the loss function |
| "The distribution is skewed but outliers must be caught" | **IQR (box plot) criterion** | Needs no distribution assumption |
| "Extreme values of a near-normal variable" | **Z-score criterion (e.g., \|z\| > 3)** | The normality assumption holds |
| "Missing values are few and scattered randomly" | **Delete rows or impute with mean/median** | Good effect for the cost |
| "Whether a value is missing looks like information itself" | **Missing-flag feature + model-based/KNN imputation** | Doesn't throw away the missingness pattern |
| "Turn free text into numeric features" | **BoW / TF-IDF / embeddings** | Text vectorization |

## Confusing Pairs Comparison Tables

### Streams vs Firehose vs Data Analytics

| Item | Data Streams | Firehose | Data Analytics |
|---|---|---|---|
| Role | Real-time ingestion and retention | Delivery to a destination | Real-time analysis on streams |
| What you manage | Shards, consumers, retention | Only buffer size and time | Queries, applications |
| Multiple consumers / reprocessing | Possible | Not suitable | Uses Streams/Firehose as the source |
| Typical clue | Milliseconds, custom consumers | Fully managed, drop it into S3 | Window aggregation, SQL/Flink |

### Glue vs EMR

| Item | Glue | EMR |
|---|---|---|
| Form | Serverless Spark | A cluster you launch yourself |
| Strength | Quick start, Data Catalog and crawlers | Control of versions, libraries, Hadoop ecosystem |
| Typical clue | Serverless ETL, automatic schema inference | Fine-grained tuning, existing Hadoop jobs |

### Athena vs Redshift vs Redshift Spectrum

| Item | Athena | Redshift | Redshift Spectrum |
|---|---|---|---|
| Data location | S3 | Data loaded into the cluster | S3 (external tables) |
| Provisioning | None (serverless) | Cluster required | Redshift cluster required |
| Suited for | Ad hoc queries, intermittent analysis | Repeated large-scale BI, complex joins | Joining raw S3 data together without loading |

### DMS vs DataSync

| Item | DMS | DataSync |
|---|---|---|
| Target | Databases | File and object storage |
| Typical use | On-premises DB → RDS/Redshift/S3 migration | On-premises NFS/SMB → S3/EFS/FSx transfer |
| Typical clue | Minimal-downtime DB migration | Large file synchronization |

### One-Hot vs Label (Ordinal) vs Target Encoding

| Item | One-Hot | Label / Ordinal | Target |
|---|---|---|---|
| Premise | No order | Has order | Very high cardinality |
| Dimensions | Grows by the number of categories | Stays 1 column | Stays 1 column |
| Risk | Dimension explosion at high cardinality | Creates an order that doesn't exist | Target information leakage — compute only on the training set |

### Standardization vs Normalization

| Item | Standardization (Z-score) | Normalization (Min-Max) |
|---|---|---|
| Result | Mean 0, standard deviation 1 | Generally a 0-1 range |
| Range | Not fixed | Fixed |
| Outliers | Relatively less sensitive | Dragged by min and max, greatly distorted |
| Commonly used for | Linear/logistic regression, SVM, PCA | Image pixels, neural network inputs |

### Oversampling vs Undersampling vs Class Weights

| Item | Oversampling (SMOTE) | Undersampling | Class weights |
|---|---|---|---|
| What it does | Synthesizes and increases the minority class | Reduces the majority class | Big penalty on minority-class errors in the loss |
| Data loss | None | Yes | None |
| Side effects | Overfitting risk, longer training time | Information loss | None (hyperparameter tuning needed) |
| Caution | Apply **only to the training set after the split** | Beware of damaging the diversity of the majority class | Best viewed together with threshold adjustment |

### IQR vs Z-score Outlier Detection

| Item | IQR | Z-score |
|---|---|---|
| Decision criterion | Below Q1 − 1.5×IQR, above Q3 + 1.5×IQR | More than some multiple of the standard deviation from the mean (e.g., \|z\| > 3) |
| Distribution assumption | None | Assumes near-normal distribution |
| Skewed distributions | Robust | Easily distorted |
| Effect of outliers | Quartiles are insensitive to outliers | The mean and standard deviation themselves get contaminated |

## Self-Check Questions

1. Multiple consumers must reprocess the same stream with millisecond latency? → **Kinesis Data Streams**
2. Automatically load a stream into S3 with no operations? → **Kinesis Data Firehose**
3. SQL-query an S3 data lake serverlessly? → **Athena**
4. Serverless Spark ETL and automatic schema inference (catalog)? → **Glue**
5. Is standardization mandatory before training XGBoost? → **No (trees are scale-invariant)**
6. Encoding for an unordered categorical (color)? → **One-Hot Encoding**
7. Response when two features have a correlation of 0.97? → **Remove multicollinearity (drop or PCA)**
8. The common transform for a strongly right-skewed distribution? → **Log transform**
9. What arises if you fit a scaler on the entire data? → **Data leakage (fit only on the training set after the split)**
10. Services for on-premises DB migration and large file transfer? → **DMS / DataSync**
11. To join raw S3 data from a Redshift cluster without loading? → **Redshift Spectrum**
12. Positives are 0.5% yet accuracy is 99%. How do you change the metric? → **F1 / AUPRC (precision-recall based)**
13. Outlier criterion for a heavily skewed variable? → **IQR (box plot)**

## 📖 Glossary

- **Data lake**: A central repository that gathers structured and unstructured data as is, without processing. On AWS this effectively means S3.
- **Shard**: The unit of throughput in Kinesis Data Streams. Adding shards increases throughput, and consumers read per shard.
- **Data Catalog**: A metadata ledger recording what data is where, with what schema. Glue crawlers fill it automatically.
- **Cardinality**: The number of distinct values a categorical variable can take. Thousands to millions, as with user IDs, is high cardinality.
- **Data leakage**: Information that should be unknowable at training time seeping in through features or preprocessing. It inflates only the offline score.
- **Multicollinearity**: A state where two or more features carry nearly the same information and are strongly correlated with each other. It destabilizes the coefficients of linear models.
- **Skewness**: The degree to which a distribution leans to one side. A long right tail is right skew, and a log transform is the common response.
- **Winsorizing**: Treatment that clips outliers to the upper and lower boundary values instead of discarding them. It preserves the sample count.
- **AUPRC**: The area under the precision-recall curve. In heavily imbalanced problems with very rare positives, it is a more trustworthy metric than accuracy or ROC-AUC.

---

## 📝 Practice Questions

**Question 1.** Thousands of IoT sensors send tens of thousands of events per second, and multiple independent applications read the same stream at their own different speeds and must also reprocess historical data. Which ingestion service is MOST appropriate?

A) Kinesis Data Firehose  
B) SQS standard queue  
C) Glue batch job  
D) Kinesis Data Streams  

**Answer: D**  
Explanation: When multiple consumers read independently and reprocessing within the retention period is required, Data Streams, which gives direct control over shards and the retention period, is the correct answer. Firehose (A) is a fully managed delivery service and is unsuitable for multiple custom consumers and reprocessing, SQS (B) deletes messages on consumption and is weak for reprocessing and multiple consumers, and Glue (C) is batch ETL.

---

**Question 2.** While minimizing operational burden, you want to buffer streaming data for 1 minute and deliver it to S3, with only simple format conversion before delivery. Which is MOST appropriate?

A) Kinesis Data Streams + custom Lambda consumer + direct S3 writes  
B) Always-on EMR cluster  
C) Kinesis Data Firehose  
D) Run a Redshift COPY script with cron  

**Answer: C**  
Explanation: Firehose is the fully managed service that automatically delivers to S3 once you set only the buffer size and interval, and also supports transformation. Streams + a custom consumer (A) increases operational burden, an always-on EMR cluster (B) is excessive in cost and management, and cron COPY (D) is not managed.

---

**Question 3.** You are reviewing preprocessing before training a decision-tree-based XGBoost model. Which of the following tasks has the LEAST effect and therefore the lowest priority?

A) Standardize all numeric features (StandardScaler)  
B) Impute missing values appropriately  
C) Target-encode high-cardinality categorical features  
D) Correct rows with obvious label errors  

**Answer: A**  
Explanation: Tree-based models have split criteria that are invariant to feature scale, so standardization has almost no effect. Handling missing values (B), encoding categorical features (C), and correcting labels (D) directly affect performance even in tree models.

---

**Question 4.** In EDA, the Pearson correlation coefficient of two features is 0.96. Which of the following is NOT an appropriate response for reducing multicollinearity?

A) Remove the feature with less information of the two  
B) Reduce the two features to a single principal component with PCA  
C) Keep both features as they are and apply One-Hot encoding  
D) Keep only the more interpretable one based on domain knowledge  

**Answer: C**  
Explanation: One-Hot encoding is a technique for handling categorical variables, is unrelated to multicollinearity in numeric features, and does not solve the problem. Feature removal (A), PCA reduction (B), and interpretability-based selection (D) are all valid responses to multicollinearity.

---

**Question 5.** A data analyst wants to run ad hoc queries with standard SQL on logs stored in an S3 data lake without provisioning a cluster. Which service is MOST appropriate?

A) Amazon Redshift  
B) Amazon EMR  
C) Amazon RDS  
D) Amazon Athena  

**Answer: D**  
Explanation: Athena is a serverless service that queries S3 data with standard SQL, so it is optimal for ad hoc analysis without a cluster. Redshift (A) is a warehouse that is provisioned in advance, EMR (B) is cluster-based, and RDS (C) is a relational database for transactions and is unsuitable for querying S3 directly.

---
