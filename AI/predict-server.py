import os
from flask import Flask, jsonify, request
import pandas as pd
import numpy as np
from flask_cors import CORS
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score

app = Flask(__name__)
CORS(app)

# There is no pre-trained model anymore — a model trained once on a fixed
# dataset (the old approach) would be predicting one business's revenue using
# patterns learned from a completely different, unrelated dataset, which is
# meaningless. Instead this fits a fresh, tiny regression on whatever monthly
# totals the caller sends for THIS business, on every request. Node (index.js
# /api/forecast) aggregates that business's own Mongo sales into monthly
# totals and POSTs them here — this service never touches a database itself.

MIN_MONTHS_FOR_TREND = 2       # need at least 2 points to fit any line at all
MIN_MONTHS_FOR_FULL_MODEL = 4  # enough for lag/rolling-average features to mean anything


@app.route("/api/predict-revenue", methods=["POST"])
def predict_next_month():
    try:
        body = request.get_json(force=True, silent=True) or {}
        monthly = body.get("monthly", [])

        if len(monthly) < MIN_MONTHS_FOR_TREND:
            # Not a server error — this is the expected state for a brand-new
            # business. 200 so the frontend renders a message, not an error state.
            return jsonify({
                "error": "not_enough_data",
                "message": "Need at least 2 months of sales history to forecast — "
                            "log or import more sales first.",
                "months_available": len(monthly)
            }), 200

        df = pd.DataFrame(monthly)
        df["total"] = df["total"].astype(float)
        df = df.sort_values("month").reset_index(drop=True)
        df["month_index"] = np.arange(1, len(df) + 1)

        if len(df) >= MIN_MONTHS_FOR_FULL_MODEL:
            # Enough history: lag + rolling-average features.
            df["prev_revenue"] = df["total"].shift(1)
            df["rolling_avg_3"] = df["total"].rolling(3, min_periods=1).mean()
            train = df.dropna(subset=["prev_revenue"]).reset_index(drop=True)

            feature_cols = ["month_index", "prev_revenue", "rolling_avg_3"]
            X = train[feature_cols]
            y = train["total"]
            model = LinearRegression().fit(X, y)

            last = df.iloc[-1]
            next_row = pd.DataFrame([{
                "month_index": last["month_index"] + 1,
                "prev_revenue": last["total"],
                "rolling_avg_3": df["total"].tail(3).mean()
            }])[feature_cols]

            predicted = float(model.predict(next_row)[0])
            y_pred = model.predict(X)
        else:
            # Sparse history (2-3 months): a straight trend line over month
            # index. Lag/rolling features would just overfit on this few points.
            X = df[["month_index"]]
            y = df["total"]
            model = LinearRegression().fit(X, y)

            next_index = pd.DataFrame([[df["month_index"].max() + 1]], columns=["month_index"])
            predicted = float(model.predict(next_index)[0])
            y_pred = model.predict(X)

        predicted = max(predicted, 0)  # a revenue forecast shouldn't go negative
        lower = round(predicted * 0.9, 2)
        upper = round(predicted * 1.1, 2)
        predicted = round(predicted, 2)

        # r2 needs at least 2 residual degrees of freedom to mean anything
        r2 = round(r2_score(y, y_pred), 3) if len(y) > 2 else None
        rmse = round(float(np.sqrt(mean_squared_error(y, y_pred))), 2) if len(y) > 1 else None

        labels = df["month"].tolist() + ["Next Month (Forecast)"]
        values = df["total"].tolist() + [predicted]

        return jsonify({
            "predicted_revenue": predicted,
            "confidence_band": [lower, upper],
            "r2_score": r2,
            "rmse": rmse,
            "months_used": len(df),
            "chart_data": {
                "labels": labels,
                "values": values
            }
        })

    except Exception as e:
        print("Forecast error:", e)
        return jsonify({"error": "forecast_failed", "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # Render (and most PaaS hosts) assign the port dynamically via $PORT —
    # 5001 is just the local-dev default when nothing else is set.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)))
