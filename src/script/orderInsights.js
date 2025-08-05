document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/order-insights")
    .then(res => res.json())
    .then(data => {
      allOrdersRaw = data.ordersPerMonth;
      createYearFilterDropdown(data.ordersPerMonth);
      renderOrdersPerMonthChart("all");  // default
      renderQuantityHistogram(data.quantityDistribution, "Quantity per Sale", "quantity-chart");
      renderHistogram(data.amountDistribution, "Spend per Sale", "amount-chart", "£", "amount-bin");
    });
});


const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// 📈 Orders per Month Chart
let allOrdersRaw = {};  // stores original data for filtering

function renderOrdersPerMonthChart(year = "all") {
  const ctx = document.getElementById("orders-chart").getContext("2d");
  const rawKeys = Object.keys(allOrdersRaw).sort();

  // Filter based on selected year
  const filteredKeys = year === "all"
    ? rawKeys
    : rawKeys.filter(k => k.startsWith(year));

  const labels = filteredKeys.map(key => {
    const [y, m] = key.split("-");
    return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
  });

  const values = filteredKeys.map(k => allOrdersRaw[k]);

  // Destroy previous chart
  if (window.orders_chart) window.orders_chart.destroy();

  window.orders_chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Orders per Month",
        data: values,
        borderColor: "rgba(75, 192, 192, 1)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: "Month" },
          ticks: { maxRotation: 45, minRotation: 30 }
        },
        y: { beginAtZero: true }
      }
    }
  });
}

function createYearFilterDropdown(data) {
  const container = document.createElement("div");
  container.className = "form-group mb-3";
  container.innerHTML = `
    <label><strong>Filter by Year:</strong></label>
    <select id="year-filter" class="form-select mt-1" style="max-width: 200px;">
      <option value="all">All Years</option>
    </select>
  `;
  document.getElementById("orders-chart").parentNode.prepend(container);

  const yearSet = new Set(Object.keys(data).map(k => k.split("-")[0]));
  const dropdown = document.getElementById("year-filter");

  Array.from(yearSet).sort().forEach(yr => {
    const opt = document.createElement("option");
    opt.value = yr;
    opt.textContent = yr;
    dropdown.appendChild(opt);
  });

  dropdown.addEventListener("change", () => {
    renderOrdersPerMonthChart(dropdown.value);
  });
}



// 📊 Spend per Sale Histogram with Bin Selector
function renderHistogram(values, title, canvasId, unit, binControlId) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const binSelector = document.getElementById(binControlId);
  const binSize = parseInt(binSelector.value || 1);

  const min = Math.floor(Math.min(...values) / binSize) * binSize;
  const max = Math.ceil(Math.max(...values) / binSize) * binSize;

  const bins = {};
  for (let i = min; i <= max; i += binSize) {
    bins[i] = 0;
  }

  values.forEach(v => {
    const bucket = Math.floor(v / binSize) * binSize;
    bins[bucket] = (bins[bucket] || 0) + 1;
  });

  const labels = Object.keys(bins).sort((a, b) => a - b).map(v => `${unit}${v}`);
  const counts = labels.map(label => bins[parseInt(label.replace(unit, ""))]);

  if (window[canvasId + "_chart"]) {
    window[canvasId + "_chart"].destroy();
  }

  window[canvasId + "_chart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: title,
        data: counts,
        backgroundColor: "rgba(153, 102, 255, 0.6)"
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: title },
          ticks: { autoSkip: true, maxRotation: 0, font: { size: 12 } }
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    }
  });

  binSelector.onchange = () => {
    renderHistogram(values, title, canvasId, unit, binControlId);
  };
}

// Quantity per Sale Histogram
function renderQuantityHistogram(values, title, canvasId) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  const bins = {};
  values.forEach(v => {
    const qty = Math.round(v);
    bins[qty] = (bins[qty] || 0) + 1;
  });

  const labels = Object.keys(bins).sort((a, b) => a - b);
  const counts = labels.map(k => bins[k]);

  if (window[canvasId + "_chart"]) {
    window[canvasId + "_chart"].destroy();
  }

  window[canvasId + "_chart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: title,
        data: counts,
        backgroundColor: "rgba(255, 159, 64, 0.6)"
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: "Quantity" },
          ticks: { stepSize: 1 }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Number of Orders" }
        }
      }
    }
  });
}
