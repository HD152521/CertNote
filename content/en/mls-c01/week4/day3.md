# Day 3 - Data Visualization: Distribution, Correlation, QuickSight, Insights

After cleaning and dimensionality work, comes **understanding data visually**. Good visualizations reveal distribution shape, outliers, relationships, and clusters that summary statistics hide. MLS-C01 Domain 2 asks both "which chart answers which question?" and "which AWS service handles visualization and BI?"

Today, we cover **distribution visualization**, **relationship and correlation visualization**, AWS's BI service **Amazon QuickSight**, and **analytical insights** derived from it.

## Chart Selection: Question Determines Chart

| Analysis Goal | Appropriate Chart |
|-----------|-------------|
| Single numeric distribution | Histogram, KDE, boxplot, violin |
| Category frequencies | Bar chart |
| Two numeric relationship | Scatter, hexbin |
| Multiple variable correlation | Correlation heatmap, pairplot |
| Trend over time | Line graph |
| Part-to-whole composition | Stacked bar |

Before choosing, ask yourself "what question am I answering?" Wrong charts hide or distort patterns.

> 💡 **Key Theory**: **Anscombe's quartet** demonstrates datasets with identical summary stats (mean, variance, correlation) but entirely different shapes. Four datasets share nearly identical mean, variance, correlation, and regression line, yet scatter plots show one linear, one curved, one dominated by a single outlier. The lesson: "don't trust summary stats alone—always visualize"—why EDA requires visualization.

## Distribution Visualization

```python
import seaborn as sns
import matplotlib.pyplot as plt

fig, axes = plt.subplots(1, 3, figsize=(15, 4))
sns.histplot(df["income"], kde=True, ax=axes[0])   # shape + density
sns.boxplot(x=df["income"], ax=axes[1])             # quartiles, outliers
sns.violinplot(x=df["region"], y=df["income"], ax=axes[2])  # distribution by category
```

- **Histogram/KDE**: See distribution shape (skew, peaks)
- **Boxplot**: Quickly spot median, quartiles, outliers via IQR
- **Violin**: Boxplot + density; strong for comparing distributions across categories

For skewed distributions, apply log transformation and re-plot to check normality.

## Relationship and Correlation Visualization

```python
# Correlation heatmap: linear relationships at a glance
corr = df.select_dtypes("number").corr()
sns.heatmap(corr, annot=True, cmap="coolwarm", center=0)

# Pairplot: variable pair relationships + diagonal distributions
sns.pairplot(df, hue="target", vars=["age", "income", "score"])
```

- Correlation heatmap simultaneously spots multicollinearity candidates (high |r|) and target relationships
- Pairplot reveals nonlinear relationships, clusters, and outliers in variable pairs

> 💡 **Key Theory**: Pearson correlation **captures linear relationships only**. Perfect curved relationship (e.g., y = x²) may yield Pearson r near 0. Monotonic but nonlinear relationships are better captured by **Spearman rank correlation**; general dependence by **mutual information**. So don't assume "low correlation = no relationship"—check scatter plots for shape.

## Amazon QuickSight

QuickSight is AWS's **serverless BI service** for creating and sharing dashboards and visualizations.

| Feature | Description |
|------|------|
| SPICE | In-memory compute engine for fast aggregation and visualization |
| Data sources | Direct connection to S3, Athena, Redshift, RDS, Aurora, etc. |
| ML Insights | Anomaly detection, forecasting, automated narratives |
| Q | Natural language queries ("last month sales by region") generate visuals |
| Serverless | No infrastructure management, pay-as-you-go |

QuickSight suits **operational dashboards and business reporting**. For pre-training EDA exploration, notebooks (matplotlib/seaborn) or SageMaker Data Wrangler are closer to workflow.

> 💡 **Key Theory**: QuickSight's **ML Insights** uses built-in ML to auto-detect anomalies in time series, provide Random Cut Forest-based forecasts, and explain changes in natural language. Analysts don't write models—they get ML insights inside BI dashboards. In exams, "business users without code want anomaly/forecast dashboards" signals QuickSight ML Insights.

## AWS Visualization and Analytics Tool Comparison

| Tool | Location | Primary Use |
|------|------|---------|
| matplotlib/seaborn | SageMaker notebook | Code-based EDA, free-form customization |
| SageMaker Data Wrangler | SageMaker Studio | Visual data prep + distribution/correlation reports |
| Amazon QuickSight | Standalone BI service | Dashboards, business reporting, ML Insights |
| Athena + QuickSight | S3 direct query | Serverless SQL analysis → visualization |

## Deriving Analytical Insights

Visualization's goal is not the picture but **actionable insight**.

- Skewed distribution → Consider log transformation or robust model
- Strong correlation pair in heatmap → Address multicollinearity
- Boxplot outliers → Confirm whether measurement error or real signal
- Distribution differences across categories → That category may be good feature
- Time series anomaly → Data collection issue or real event

## Summary

- Choose chart by question; visualize, don't trust summary alone (Anscombe)
- Distribution: histogram, boxplot, violin / Relationships: scatter, correlation heatmap, pairplot
- Pearson is linear-only; nonlinearity needs Spearman or mutual information
- QuickSight: serverless BI, SPICE, ML Insights, Q (natural language)

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
