from flask import Flask, jsonify, request
import pandas as pd
import joblib
import numpy as np
from flask_cors import CORS
import datetime
from sklearn.metrics import mean_squared_error, r2_score
import os

app = Flask(__name__)
CORS(app)

# Load trained model once
model = joblib.load("revenue_predictor.pkl")

@app.route("/api/predict-revenue", methods=["GET"])
def predict_next_month():
    try:
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        data_path = os.path.join(BASE_DIR, "..", "data", "retail_sales_dataset.csv")
        df = pd.read_csv(data_path)

        df["Date"] = pd.to_datetime(df["Date"])
        df = df[df["Date"].dt.year <= datetime.datetime.now().year]
        df["YearMonth"] = df["Date"].dt.to_period("M").dt.to_timestamp()

        # Aggregate to monthly totals
        monthly = df.groupby("YearMonth")["Total Amount"].sum().reset_index()
        monthly = monthly.sort_values("YearMonth").reset_index(drop=True)

        # Feature engineering
        monthly["month"] = monthly["YearMonth"].dt.month
        monthly["month_index"] = np.arange(1, len(monthly) + 1)
        monthly["prev_month_revenue"] = monthly["Total Amount"].shift(1)
        monthly["rolling_avg_3"] = monthly["Total Amount"].rolling(3).mean()
        monthly = monthly.dropna().reset_index(drop=True)

        # Forecast input
        last_row = monthly.iloc[-1]
        next_input = pd.DataFrame([{
            "month": (last_row["month"] % 12) + 1,
            "month_index": last_row["month_index"] + 1,
            "prev_month_revenue": last_row["Total Amount"],
            "rolling_avg_3": monthly["Total Amount"].tail(3).mean()
        }])

        # align input with training schema
        template = pd.DataFrame(columns=model.feature_names_in_)
        template.loc[0] = 0
        for col in next_input.columns:
            if col in template.columns:
                val = next_input.at[0, col]
                template.at[0, col] = float(val) if isinstance(val, float) else val

        next_input = template

        # Predict
        forecast = model.predict(next_input)[0]
        predicted = round(forecast, 2)
        lower = round(predicted * 0.9, 2)
        upper = round(predicted * 1.1, 2)

        # Evaluation
        X = monthly[["month", "month_index", "prev_month_revenue", "rolling_avg_3"]]
        y = monthly["Total Amount"]
        y_pred = model.predict(X)

        r2 = round(r2_score(y, y_pred), 3)
        rmse = round(np.sqrt(mean_squared_error(y, y_pred)), 2)

        # Chart
        labels = monthly["YearMonth"].dt.strftime("%B %Y").tolist()
        values = monthly["Total Amount"].tolist()
        labels.append("Next Month (Forecast)")
        values.append(predicted)

        return jsonify({
            "predicted_revenue": predicted,
            "confidence_band": [lower, upper],
            "r2_score": r2,
            "rmse": rmse,
            "chart_data": {
                "labels": labels,
                "values": values
            }
        })

    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5001)
