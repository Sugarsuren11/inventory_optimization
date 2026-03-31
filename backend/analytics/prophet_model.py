from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from prophet import Prophet


def build_prophet_demand_forecast(sales: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
	monthly = (
		sales.groupby("Month", as_index=False)["Quantity"]
		.sum()
		.rename(columns={"Month": "ds", "Quantity": "y"})
		.sort_values("ds")
	)

	if monthly.empty:
		return [], {"current_month": 0, "next_month_prediction": 0, "growth_pct": 0.0, "mape": 0.0}

	monthly["ds"] = pd.to_datetime(monthly["ds"] + "-01", errors="coerce")
	monthly = monthly.dropna(subset=["ds"]).reset_index(drop=True)

	if monthly.empty:
		return [], {"current_month": 0, "next_month_prediction": 0, "growth_pct": 0.0, "mape": 0.0}

	# Prophet-д хамгийн багадаа хэдэн цэг хэрэгтэй тул түүх богино үед аюулгүй persistence таамаглал буцаана.
	if len(monthly) < 3:
		current_month = int(monthly["y"].iloc[-1])
		chart = [
			{
				"month": row["ds"].strftime("%Y-%m"),
				"actual": int(row["y"]),
				"predicted": None,
				"lower": None,
				"upper": None,
			}
			for _, row in monthly.iterrows()
		]
		for step in range(1, 5):
			next_period = monthly["ds"].iloc[-1] + pd.DateOffset(months=step)
			chart.append(
				{
					"month": next_period.strftime("%Y-%m"),
					"actual": None,
					"predicted": current_month,
					"lower": round(current_month * 0.9),
					"upper": round(current_month * 1.1),
				}
			)

		summary = {
			"current_month": current_month,
			"next_month_prediction": current_month,
			"growth_pct": 0.0,
			"mape": 0.0,
		}
		return chart, summary

	model = Prophet(
		yearly_seasonality=True,
		weekly_seasonality=False,
		daily_seasonality=False,
		interval_width=0.95,
	)
	model.fit(monthly[["ds", "y"]])

	future = model.make_future_dataframe(periods=4, freq="MS", include_history=True)
	forecast = model.predict(future)

	joined = forecast.merge(monthly[["ds", "y"]], on="ds", how="left").sort_values("ds")

	history_months = joined[joined["y"].notna()].tail(6)
	future_months = joined[joined["y"].isna()].head(4)

	chart: list[dict[str, Any]] = []
	for _, row in history_months.iterrows():
		chart.append(
			{
				"month": row["ds"].strftime("%Y-%m"),
				"actual": int(round(float(row["y"]))),
				"predicted": None,
				"lower": None,
				"upper": None,
			}
		)

	for _, row in future_months.iterrows():
		chart.append(
			{
				"month": row["ds"].strftime("%Y-%m"),
				"actual": None,
				"predicted": int(round(max(0.0, float(row["yhat"])))),
				"lower": int(round(max(0.0, float(row["yhat_lower"])))),
				"upper": int(round(max(0.0, float(row["yhat_upper"])))),
			}
		)

	in_sample = joined[joined["y"].notna()].tail(6).copy()
	if not in_sample.empty:
		y_true = in_sample["y"].to_numpy(dtype=float)
		y_pred = np.maximum(in_sample["yhat"].to_numpy(dtype=float), 0.0)
		mape = float((np.abs((y_true - y_pred) / np.maximum(y_true, 1))).mean() * 100)
	else:
		mape = 0.0

	current_month = int(round(float(monthly["y"].iloc[-1])))
	next_month_prediction = (
		int(round(max(0.0, float(future_months.iloc[0]["yhat"]))))
		if not future_months.empty
		else current_month
	)
	growth_pct = ((next_month_prediction - current_month) / max(current_month, 1)) * 100

	summary = {
		"current_month": current_month,
		"next_month_prediction": next_month_prediction,
		"growth_pct": round(growth_pct, 1),
		"mape": round(mape, 1),
	}
	return chart, summary
