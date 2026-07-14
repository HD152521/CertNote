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

## 📝 연습 문제

**문제 1.** 코드를 작성하지 않는 비즈니스 사용자가 매출 데이터의 대시보드에서 자동 이상 탐지와 예측을 보고 싶어 한다. 가장 적절한 AWS 서비스는?

A) SageMaker 노트북의 matplotlib  
B) Amazon QuickSight(ML Insights)  
C) AWS Glue  
D) Amazon Comprehend  

**정답: B**  
해설: QuickSight ML Insights는 코드 없이 대시보드 안에서 이상 탐지·예측·자동 내러티브를 제공하므로 비즈니스 사용자에게 적합하다. matplotlib(A)는 코드 기반 EDA, Glue(C)는 ETL, Comprehend(D)는 NLP 서비스다.

---

**문제 2.** 두 변수의 피어슨 상관계수가 0에 가깝지만 산점도에서는 뚜렷한 U자형 곡선이 보인다. 올바른 해석은?

A) 두 변수는 어떤 관계도 없다  
B) 상관계수가 0이면 항상 독립이다  
C) 피어슨은 선형 관계만 잡으므로 비선형 관계가 존재할 수 있다  
D) 데이터에 오류가 있어 분석을 중단해야 한다  

**정답: C**  
해설: 피어슨 상관은 선형 관계만 측정하므로 U자형 같은 비선형 관계는 0에 가깝게 나올 수 있다 — 그래서 산점도 확인이 중요하다. 따라서 관계 없음(A)·독립 단정(B)은 틀리고, 곡선 관계는 오류가 아니므로 중단(D)도 부적절하다.

---

**문제 3.** 단일 수치 변수의 분포 모양(치우침, 봉우리 수)과 이상치를 동시에 직관적으로 보고 싶다. 가장 적절한 조합은?

A) 막대그래프와 파이차트  
B) 선 그래프와 누적 막대  
C) 상관 히트맵  
D) 히스토그램(KDE)과 박스플롯  

**정답: D**  
해설: 히스토그램/KDE는 분포 모양을, 박스플롯은 사분위와 이상치를 보여 주어 단일 수치 변수 분석에 최적이다. 막대·파이(A)는 범주 빈도용, 선·누적 막대(B)는 추세·구성용, 상관 히트맵(C)은 변수 간 관계용이다.

---

**문제 4.** "통계 요약만 믿지 말고 반드시 시각화하라"는 교훈을 가장 잘 보여 주는 사례는?

A) 중심극한정리  
B) 앤스컴의 사중주(Anscombe's quartet)  
C) 베이즈 정리  
D) 차원의 저주  

**정답: B**  
해설: 앤스컴의 사중주는 평균·분산·상관·회귀선이 거의 같지만 산점도 모양은 전혀 다른 네 데이터셋으로, 시각화의 필요성을 보여 준다. 중심극한정리(A)·베이즈 정리(C)·차원의 저주(D)는 다른 개념이다.

---

**문제 5.** S3에 저장된 대용량 데이터를 SQL로 질의한 뒤 서버리스로 시각화 대시보드를 만들려 한다. 가장 적절한 조합은?

A) Athena로 S3를 질의하고 QuickSight로 시각화  
B) EC2에 직접 데이터베이스를 설치  
C) SageMaker 학습 작업으로 시각화  
D) Lambda로 차트 이미지를 생성  

**정답: A**  
해설: Athena는 S3 데이터를 서버리스 SQL로 질의하고, QuickSight가 그 결과를 대시보드로 시각화하는 표준 서버리스 분석 조합이다. EC2 DB(B)는 서버리스가 아니고, SageMaker 학습(C)·Lambda 이미지(D)는 BI 대시보드 용도가 아니다.

---
