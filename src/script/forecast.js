document.addEventListener("DOMContentLoaded", () => {
  fetchAndRenderForecast();
});

function fetchAndRenderForecast() {
  // Same-origin, through the Node backend — see /api/forecast in index.js.
  // The model there trains fresh on this business's own sales every request.
  fetch(`/api/forecast`)
    .then(res => res.json())
    .then(data => {
      const tipEl = document.getElementById("forecast-tip");
      const amountEl = document.getElementById("forecast-amount");
      const statsEl = document.getElementById("model-stats");
      const confEl = document.getElementById("confidence-range");

      if (data.error === "not_enough_data") {
        amountEl.textContent = "Not enough data yet";
        tipEl.textContent = data.message || "Log or import more sales to unlock forecasting.";
        statsEl.textContent = `${data.months_available || 0} month(s) of history so far — need at least 2.`;
        confEl.textContent = "—";
        return;
      }

      if (data.error) {
        amountEl.textContent = "Unavailable";
        tipEl.textContent = "Couldn't generate a forecast right now — try again shortly.";
        return;
      }

      const revenue = data.predicted_revenue;
      if (revenue !== undefined && amountEl && tipEl) {
        amountEl.textContent = `£${Number(revenue).toLocaleString()}`;

        // Compare against THIS business's own trailing average, not fixed
        // £ thresholds — a fixed cutoff tuned for one dataset's scale would
        // tell nearly every small business "sales may decline" regardless of
        // how they're actually doing, just because their revenue is smaller.
        const history = ((data.chart_data && data.chart_data.values) || []).slice(0, -1);
        const avg = history.length ? history.reduce((a, b) => a + b, 0) / history.length : revenue;
        const changePct = avg > 0 ? ((revenue - avg) / avg) * 100 : 0;

        if (changePct > 10) {
          tipEl.textContent = "Sales are projected to grow — consider investing in marketing or seasonal inventory.";
        } else if (changePct > -10) {
          tipEl.textContent = "Revenue is stable. Review slow-moving categories and optimize promotions.";
        } else {
          tipEl.textContent = "Sales may decline — explore bundle offers or customer engagement strategies.";
        }
      }

      if (statsEl) {
        const r2Text = data.r2_score !== null && data.r2_score !== undefined ? data.r2_score : "N/A";
        const rmseText = data.rmse !== null && data.rmse !== undefined ? `£${Math.round(data.rmse).toLocaleString()}` : "N/A";
        statsEl.textContent = `R² Score: ${r2Text}, RMSE: ${rmseText} (based on ${data.months_used || "?"} months of your data)`;
      }

      if (confEl && data.confidence_band) {
        const [low, high] = data.confidence_band;
        confEl.textContent = `£${Math.round(low).toLocaleString()} – £${Math.round(high).toLocaleString()}`;
      }

      if (data.chart_data) {
        renderForecastChart(data.chart_data, data.confidence_band);
      }
    })
    .catch(err => {
      console.error("Forecast fetch error:", err);
      document.getElementById("forecast-amount").textContent = "Unavailable";
      document.getElementById("forecast-tip").textContent = "Unable to generate tips at this time.";
    });
}

function renderForecastChart(data, confidenceBand) {
  const canvas = document.getElementById("forecast-chart");
  const ctx = canvas.getContext("2d");

  const lastIndex = data.values.length - 1;
  const lowerBound = data.values.map((_, i) => i === lastIndex ? confidenceBand[0] : null);
  const upperBound = data.values.map((_, i) => i === lastIndex ? confidenceBand[1] : null);

  if (!window.forecastChart) {
    window.forecastChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Forecast",
            data: data.values,
            backgroundColor: "rgba(54, 162, 235, 0.2)",
            borderColor: "rgba(54, 162, 235, 1)",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true
          },
          {
            label: "Confidence Upper",
            data: upperBound,
            borderColor: "rgba(255, 165, 0, 0.6)",
            borderDash: [6, 6],
            pointRadius: 0,
            fill: false
          },
          {
            label: "Confidence Lower",
            data: lowerBound,
            borderColor: "rgba(255, 165, 0, 0.6)",
            borderDash: [6, 6],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#222",
            callbacks: {
              label: context => `£${context.raw.toLocaleString()}`
            }
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: "Revenue (£)",
              color: "#333",
              font: { size: 14 }
            },
            ticks: {
              callback: value => `£${value.toLocaleString()}`,
              color: "#444",
              font: { size: 12 }
            }
          },
          x: {
            title: {
              display: true,
              text: "Month",
              color: "#333",
              font: { size: 14 }
            },
            ticks: {
              color: "#444",
              font: { size: 12 }
            }
          }
        }
      }
    });
  } else {
    const chart = window.forecastChart;
    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.values;
    chart.data.datasets[1].data = upperBound;
    chart.data.datasets[2].data = lowerBound;
    chart.update();
  }
}
