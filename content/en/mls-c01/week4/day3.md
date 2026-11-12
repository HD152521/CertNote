# Day 3 - Data Visualization: Distributions, Correlations, QuickSight, and Drawing Insights

## 📌 Key Takeaways

- **The question decides the chart**. For distributions use histograms, box plots and violin plots; for relationships use scatter plots, correlation heatmaps and pair plots.
- **Anscombe's quartet**: the same statistical summary can hide completely different shapes → never trust summary values alone; always plot.
- **Pearson captures only linear relationships**. Check monotonic nonlinear relationships with Spearman and general dependence with mutual information.
- **QuickSight** is a serverless BI service. Remember SPICE (in-memory engine), ML Insights (anomaly detection, forecasting, automatic narratives) and Q (natural-language queries).
- The goal of visualization is not the picture but the **follow-up action**: skew → log transform, strong correlation → handle multicollinearity.

## Chart Selection: The Question Decides the Chart

Once cleaning and dimensionality work are done, the next job is **understanding the data by eye**. Good visualization reveals the distribution shape, outliers, relationships and clusters that summary statistics hide. MLS-C01 Domain 2 asks both "which chart for which question" and "which AWS service for visualization and BI."

| Analysis goal | Suitable chart |
|-----------|-------------|
| Distribution of a single numeric variable | Histogram, KDE, box plot, violin |
| Frequency by category | Bar chart |
| Relationship between two numeric variables | Scatter plot, hexbin |
| Correlation among several variables | Correlation heatmap, pair plot |
| Trend over time | Line chart |
| Composition relative to the whole | Stacked bar |

Before choosing a chart, first ask "what question am I trying to answer right now?" The wrong chart hides or distorts patterns.

### Misunderstandings Created by the Wrong Chart

| Situation | Wrong choice | What goes wrong | Right choice |
|---|---|---|---|
| You want to see the distribution of a numeric variable | Pie chart | The distribution shape, tails and outliers all vanish | Histogram + box plot |
| Composition across 20 categories | Pie chart | Slices are cut too fine to compare | Sorted bar chart |
| Relationship between two variables | Two line charts | Only each variable's trend shows; the relationship does not | Scatter plot |
| A scatter plot with hundreds of thousands of points | Scatter plot as is | Overplotting smears the points and density is invisible | Hexbin or sampling |
| Comparing distributions across categories | Per-category mean bars | Means can be equal while distributions differ | Violin / box plot |

> ⚠️ **Pitfall**: The same data can give the opposite impression depending on how the axes are set. If a bar chart's y-axis starts at a non-zero value, a trivial difference looks dramatic, and overlaying different units on a dual axis makes a nonexistent correlation appear. Whether reading or making a chart, **check the axis range first**.

**Anscombe's quartet** shows datasets whose summary statistics (mean, variance, correlation) are identical but whose shapes are entirely different. The four datasets have nearly the same means, variances, correlations and regression lines, but as scatter plots one is linear, one is curved, and in one a single outlier drags the whole fit. The lesson is "don't trust summary statistics alone; always visualize," and this is why visualization is indispensable in EDA.

## Distribution Visualization

```python
import seaborn as sns
import matplotlib.pyplot as plt

fig, axes = plt.subplots(1, 3, figsize=(15, 4))
sns.histplot(df["income"], kde=True, ax=axes[0])   # shape + density
sns.boxplot(x=df["income"], ax=axes[1])             # quartiles, outliers
sns.violinplot(x=df["region"], y=df["income"], ax=axes[2])  # distribution by category
```

- **Histogram/KDE**: see the distribution shape (skew, number of peaks)
- **Box plot**: quickly catches the median, quartiles and IQR-based outliers
- **Violin**: box plot + density. Strong for comparing distributions across categories

For a skewed distribution, apply a log transform and plot again to check whether it moves closer to normal.

```
 Normal (symmetric)  Right-skewed (right tail)  Bimodal            Outliers present
   ▁▃▅█▅▃▁           ▂█▆▄▃▂▁▁▁▁            ▃█▄▁▁▄█▃          ▂▅█▅▂       ·  ·
 mean ≈ median       mean > median          two peaks          extreme values in the tail
 → use as is         → log(1+x) transform   → hidden segments  → check IQR · domain
```

### Distribution Diagnosis → Preprocessing Prescription

| What you see in the chart | Diagnosis | Follow-up preprocessing |
|---|---|---|
| Long right tail | Right skew | Log transform such as `log(1+x)`, or use a tree-family model |
| Two or more peaks | Mixed subgroups | Add a segment variable, or split into per-group models |
| Extreme values outside the box plot | Outlier candidates | Check whether it is a measurement error or a real signal, then remove, winsorize or use a robust model |
| Values are nearly all one kind | Constant / quasi-constant column | Remove the column (no information) |
| Scales differ by tens of times across variables | Scale imbalance | Standardization (mandatory before PCA, KNN, neural networks) |
| Class bars are 99:1 | Class imbalance | Day 4's resampling, class weights, PR-AUC |

> ⚠️ **Pitfall**: Changing a histogram's **number of bins** can make the same data look entirely different. With too few bins, peaks are smeared; with too many, noise looks like peaks. If the shape is ambiguous, vary the bin count or plot a KDE alongside.

## Relationship and Correlation Visualization

```python
# Correlation heatmap: linear relationships at a glance
corr = df.select_dtypes("number").corr()
sns.heatmap(corr, annot=True, cmap="coolwarm", center=0)

# Pair plot: pairwise relationships + diagonal distributions
sns.pairplot(df, hue="target", vars=["age", "income", "score"])
```

- A correlation heatmap simultaneously reveals multicollinearity candidates (pairs with large |r|) and relationships with the target
- A pair plot reveals nonlinear relationships, clusters and outliers between variable pairs

### Comparison of Correlation and Dependence Metrics

| Metric | Relationship captured | When to use | Limitation |
|---|---|---|---|
| Pearson correlation | Linear | Default check, searching for multicollinearity candidates | Comes out near 0 for curved relationships |
| Spearman rank correlation | Monotonic | Nonlinear but with a consistent direction | Cannot catch non-monotonic (U-shaped) relationships |
| Mutual information | General dependence | When you do not know the form of the relationship | Hard to interpret in absolute terms, and costly to compute |
| Scatter plot (by eye) | Every form | Always alongside | Hard to inspect one by one when there are many variable pairs |

Pearson correlation **captures only linear relationships**. Even a perfect curved relationship (e.g., y = x²) can give a Pearson r near 0. **Spearman rank correlation** better catches relationships that are monotonic but nonlinear, and **mutual information** better catches general dependence. So do not conclude "low correlation = no relationship"; confirm the shape with a scatter plot.

A large |r| in a correlation heatmap does not immediately imply causation. Two variables moving together can be due to a common third cause or a time trend. Visualization is a tool for generating hypotheses, not for proving causation.

### Three Distribution Charts: When to Use Which

| Chart | What it shows best | What it misses | When to use |
|---|---|---|---|
| Histogram/KDE | Shape (skew, number of peaks) | Exact quartiles and outlier boundaries | When first looking at a variable |
| Box plot | Median, quartiles, extreme values beyond the IQR | Whether there are two peaks | When judging outliers |
| Violin | Differences in distribution shape by category | The exact positions of individual extreme values | When checking whether a category is a good feature |

## Amazon QuickSight

QuickSight is AWS's **serverless BI service** for building and sharing dashboards and visualizations.

| Feature | Description |
|------|------|
| SPICE | In-memory compute engine for fast aggregation and visualization |
| Data sources | Connects directly to S3, Athena, Redshift, RDS, Aurora, etc. |
| ML Insights | Anomaly detection, forecasting, automatic narratives |
| Q | Generates visualizations from natural-language queries ("sales by region last month") |
| Serverless | No infrastructure management, pay for what you use |

QuickSight suits **operational dashboards and business reporting**. For pre-training EDA exploration, a notebook (matplotlib/seaborn) or SageMaker Data Wrangler is closer to the workflow.

QuickSight's **ML Insights** automatically detects anomalies in time series with built-in ML, provides forecasts based on Random Cut Forest, and explains changes in natural language. Analysts get ML insights inside the BI dashboard without writing a model themselves. On the exam, a question saying "business users who do not write code want an anomaly detection and forecasting dashboard" points to QuickSight ML Insights.

## Comparison of AWS Visualization and Analysis Tools

| Tool | Location | Main use |
|------|------|---------|
| matplotlib/seaborn | SageMaker notebook | Code-based EDA, free customization |
| SageMaker Data Wrangler | SageMaker Studio | Visual data preparation + distribution/correlation reports |
| Amazon QuickSight | Standalone BI service | Dashboards, business reporting, ML Insights |
| Athena + QuickSight | Direct queries on S3 | Serverless SQL analysis → visualization |

### Situation → Tool Choice

| Situation | Tool to pick | Reason |
|---|---|---|
| A data scientist freely explores distributions and correlations before training | SageMaker notebook + seaborn | You can plot anything with code |
| You want distribution and correlation reports while preprocessing without code | SageMaker Data Wrangler | Reports are built into the visual preparation flow |
| A sales dashboard that business users view every day | Amazon QuickSight | Serverless BI, centered on sharing and subscriptions |
| Anomaly detection and forecasting on a dashboard without code | QuickSight ML Insights | Built-in ML for anomaly detection, forecasting and automatic narratives |
| You want to ask in natural language and get a chart | QuickSight Q | Generates visualizations from natural-language queries |
| Scan large data in S3 with SQL and visualize it | Athena + QuickSight | Serverless query → serverless BI |
| The dashboard is slow and you want faster aggregation | Load into SPICE | In-memory compute engine |

## Drawing Analytical Insights

The goal of visualization is not the picture but an **actionable insight**.

| Observation | Insight | Next action |
|---|---|---|
| Skewed distribution | May violate linear-model assumptions | Consider a log transform or a robust model |
| Strongly correlated pairs in the heatmap | Multicollinearity candidates | Check VIF, then remove, use PCA or Ridge |
| Outliers in the box plot | Measurement error or a real signal | Identify the cause, then decide the handling policy |
| Large distribution differences by category | That category may be a good feature | Adopt it as a feature, consider interaction terms |
| Sudden change points in a time series | Collection problem or a real event | Check the data pipeline and the domain |
| Class bars extremely skewed | Class imbalance | Connect to Day 4's countermeasures |

### EDA Visualization Order

Deciding in advance what to plot first reduces what you miss.

```
[Secure the training set — visualization is done on the training set only]
        │
  ① One variable at a time: histogram / box plot
        └→ Find skew · outliers · constant columns
        │
  ② Target distribution: class bars or histogram
        └→ Check for imbalance (connects to Day 4)
        │
  ③ Variable ↔ target: per-category violin / scatter plot
        └→ Find good feature candidates
        │
  ④ Variable ↔ variable: correlation heatmap / pair plot
        └→ Find multicollinearity candidates (connects to Day 2)
        │
  ⑤ If there is a time axis: line chart
        └→ Check trends · seasonality · change points
        │
  ⑥ Turn the findings into preprocessing decisions (transform · remove · add features)
```

Visualization is also an act of looking into the data. **If you decide preprocessing by looking at plots that include the test set**, it becomes human-mediated leakage. The principle is to do distribution checks, outlier judgments and correlation checks on the training set only, and never open the test set until the final evaluation.

## Question Clue → Answer Mapping

| Clue in the question | Answer to choose | Reason |
|---|---|---|
| "Business users who can't write code, anomaly detection and forecasting dashboard" | QuickSight ML Insights | ML inside the dashboard without code |
| "Want to ask in natural language and get a chart" | QuickSight Q | Natural-language query feature |
| "Query S3 data with SQL and visualize serverlessly" | Athena + QuickSight | The standard serverless analytics combination |
| "Correlation coefficient is 0 but the scatter plot is U-shaped" | Pearson measures only linear | Use a separate metric for nonlinear relationships |
| "A case showing you should not trust summary statistics alone" | Anscombe's quartet | Same summary values, different shapes |
| "The shape and outliers of a single numeric variable together" | Histogram (KDE) + box plot | Shape + quartiles and outliers |
| "Distribution and correlation reports before training, without code" | SageMaker Data Wrangler | A visual data-preparation tool |
| "Dashboard aggregation is slow" | SPICE | In-memory compute engine |

The next post looks at how to actually deal with the **class imbalance** that visualization reveals.

## 📖 Glossary

- **EDA (Exploratory Data Analysis)**: The process of scanning the data's shape, relationships and anomalies with the eye and with statistics before building a model.
- **KDE (Kernel Density Estimation)**: A method that turns a histogram's steps into a smooth curve to show the distribution shape.
- **Box plot / IQR**: A chart that draws the median and quartiles as a box / the range between the first and third quartiles. Used as the criterion for judging outliers.
- **Violin plot**: A chart that overlays a density curve on a box plot. Good for comparing distributions across categories.
- **Hexbin**: A scatter-plot variant that expresses density with hexagonal cells instead when there are so many points that they smear together.
- **Anscombe's quartet**: Four datasets with nearly identical mean, variance and correlation but completely different scatter-plot shapes. A classic example of why visualization is needed.
- **Spearman rank correlation**: A correlation computed on ranks rather than the values themselves. Catches relationships that are monotonic but curved.
- **SPICE**: QuickSight's in-memory compute engine. Data is loaded in advance to make aggregation and visualization fast.
- **ML Insights**: QuickSight's automatic anomaly detection, forecasting and natural-language explanation feature inside dashboards.
- **QuickSight Q**: A feature that builds visualizations when you ask in natural language, such as "sales by region last month."

---

## 📝 Practice Questions

**Question 1.** A business user who does not write code wants to see automatic anomaly detection and forecasting on a sales data dashboard. Which AWS service is the MOST appropriate?

A) matplotlib in a SageMaker notebook  
B) Amazon QuickSight(ML Insights)  
C) AWS Glue  
D) Amazon Comprehend  

**Answer: B**  
Explanation: QuickSight ML Insights provides anomaly detection, forecasting, and auto-narratives inside the dashboard without code, so it suits business users. matplotlib (A) is code-based EDA, Glue (C) is ETL, and Comprehend (D) is an NLP service.

---

**Question 2.** The Pearson correlation coefficient of two variables is close to 0, but the scatter plot clearly shows a U-shaped curve. What is the correct interpretation?

A) The two variables have no relationship of any kind  
B) A correlation coefficient of 0 always means independence  
C) Pearson captures only linear relationships, so a nonlinear relationship may exist  
D) The data contains errors, so the analysis should be stopped  

**Answer: C**  
Explanation: Pearson correlation measures only linear relationships, so a nonlinear relationship such as a U shape can produce a value near 0 - which is why checking the scatter plot matters. Therefore "no relationship" (A) and asserting independence (B) are wrong, and a curved relationship is not an error, so stopping (D) is inappropriate.

---

**Question 3.** You want to intuitively see both the distribution shape (skew, number of peaks) and the outliers of a single numeric variable. Which combination is MOST appropriate?

A) Bar chart and pie chart  
B) Line chart and stacked bar chart  
C) Correlation heatmap  
D) Histogram (KDE) and box plot  

**Answer: D**  
Explanation: A histogram/KDE shows the distribution shape and a box plot shows the quartiles and outliers, making them ideal for analyzing a single numeric variable. Bar and pie charts (A) are for category frequencies, line and stacked bar charts (B) are for trends and composition, and a correlation heatmap (C) is for relationships between variables.

---

**Question 4.** Which example BEST illustrates the lesson "do not rely only on summary statistics; always visualize"?

A) Central limit theorem  
B) Anscombe's quartet  
C) Bayes' theorem  
D) Curse of dimensionality  

**Answer: B**  
Explanation: Anscombe's quartet consists of four datasets with nearly identical mean, variance, correlation, and regression line but completely different scatter plot shapes, demonstrating the need for visualization. The central limit theorem (A), Bayes' theorem (C), and the curse of dimensionality (D) are different concepts.

---

**Question 5.** You want to query large data stored in S3 with SQL and then build a serverless visualization dashboard. Which combination is MOST appropriate?

A) Query S3 with Athena and visualize with QuickSight  
B) Install a database directly on EC2  
C) Visualize with a SageMaker training job  
D) Generate chart images with Lambda  

**Answer: A**  
Explanation: Athena queries S3 data with serverless SQL, and QuickSight visualizes the results as a dashboard - the standard serverless analytics combination. An EC2 database (B) is not serverless, and SageMaker training (C) and Lambda images (D) are not meant for BI dashboards.

---
