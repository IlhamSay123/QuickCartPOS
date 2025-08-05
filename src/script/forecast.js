let forecastType = "next"; // default

document.addEventListener("DOMContentLoaded", () => {
  console.log(" Forecast script loaded");
  fetchAndRenderForecast();
});

function fetchAndRenderForecast() {
  fetch(`http://127.0.0.1:5001/api/predict-revenue?target=${forecastType}`)
    .then(res => res.json())
    .then(data => {
      console.log("API response:", data);

      const revenue = data.predicted_revenue;
      const tipEl = document.getElementById("forecast-tip");
      const amountEl = document.getElementById("forecast-amount");
      const statsEl = document.getElementById("model-stats");
      const confEl = document.getElementById("confidence-range");

      if (revenue !== undefined && amountEl && tipEl) {
        amountEl.textContent = `£${Number(revenue).toLocaleString()}`;
        if (revenue > 40000) {
          tipEl.textContent = "Sales are projected to grow — consider investing in marketing or seasonal inventory.";
        } else if (revenue > 25000) {
          tipEl.textContent = "Revenue is stable. Review slow-moving categories and optimize promotions.";
        } else {
          tipEl.textContent = "Sales may decline — explore bundle offers or customer engagement strategies.";
        }
      }

      if (statsEl && data.r2_score !== undefined && data.rmse !== undefined) {
        statsEl.textContent = `R² Score: ${data.r2_score}, RMSE: £${Math.round(data.rmse).toLocaleString()}`;
      }

      if (confEl && data.confidence_band) {
        const [low, high] = data.confidence_band;
        confEl.textContent = `£${Math.round(low).toLocaleString()} – £${Math.round(high).toLocaleString()}`;
      }

      if (data.chart_data) {
        renderForecastChart(data.chart_data, data.confidence_band);
      } else {
        console.warn(" Missing chart_data in response.");
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
