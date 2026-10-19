# Demo Script — Rwanda Compass

## 2-Minute Walkthrough for Judges

### Opening (0:00–0:15)
- Show the hero page: "Put the next franc where need is greatest"
- Point out: 30 districts, live data, public sources
- Click "See the map"

### Map & Ranking (0:15–0:45)
- Choropleth map with darker red = more deprived
- Hover a district → tooltip shows rank, need score, top gaps
- Click a district → drawer opens with full profile
- Show deprivation composition chart (district vs national median)
- Toggle province filter → map and ranking update together

### Need Score Builder (0:45–1:15)
- Move a slider (e.g., Health facilities weight from 1.0 to 5.0)
- Ranking updates live — districts reorder
- Click "Poverty-first" preset → weights change, ranking shifts
- Show URL sync: `?w=poverty_rate:4,...` — shareable

### Typologies (1:15–1:35)
- K-Means clusters: districts with similar deprivation patterns
- PCA scatter: dots close together = similar profiles
- Silhouette score shows grouping quality
- Click a group → see member districts

### Drivers & Predict (1:35–2:00)
- Pick "Poverty rate" as outcome → see which indicators travel with it
- Switch to "Predict what-if" mode
- Pick a district, move a slider (e.g., electricity access)
- Prediction updates live with LOO R²/MAE trust report
- Show "clipped to observed range" honesty feature

### Budget Simulator (2:00–2:15)
- Enter envelope (e.g., 25,000 RWF M)
- Adjust floor slider → allocation updates
- Show exact-sum table with CSV export
- Top-5 districts get X% of budget

### Closing (2:15–2:30)
- "Every number traces to a public NISR source"
- Show /data page: indicator catalog, provenance, methodology
- AI-use disclosure
- "Built for Rwanda's planners"
