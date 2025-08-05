document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/category-summary/all-months")
    .then(res => res.json())
    .then(monthlyData => {
      createMonthDropdown(monthlyData);
      const months = Object.keys(monthlyData).sort();
      renderForMonth(months[0], monthlyData);
    })
    .catch(err => console.error("Error loading data:", err));
});

const currencySymbol = "£";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatMonthLabel(key) {
  const [year, monthNum] = key.split("-");
  const monthName = monthNames[parseInt(monthNum, 10) - 1];
  return `${monthName} ${year}`;
}

function createMonthDropdown(data) {
  const container = document.createElement("section");
  container.className = "chart-container";
  container.innerHTML = `
    <label for="month-select"><strong>Select Month:</strong></label>
    <select id="month-select" style="margin-left:10px;"></select>
  `;
  document.querySelector("main").appendChild(container);

  const dropdown = document.getElementById("month-select");
  const months = Object.keys(data).sort();
  months.forEach(month => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatMonthLabel(month); // ✅ formatted label
    dropdown.appendChild(option);
  });

  dropdown.addEventListener("change", () => {
    document.querySelectorAll(".dynamic-section").forEach(el => el.remove());
    renderForMonth(dropdown.value, data);
  });
}

function renderForMonth(month, dataByMonth) {
  const data = dataByMonth[month];
  displayHighlightBoxes(data, month);
  renderCharts(data, month);
}

function displayHighlightBoxes(data, month) {
  const container = document.createElement("section");
  container.className = "analysis-boxes dynamic-section";

  let topCategory = "";
  let maxRevenue = 0;
  let totalRevenue = 0;

  for (const [category, metrics] of Object.entries(data)) {
    if (metrics["Total Revenue"] > maxRevenue) {
      maxRevenue = metrics["Total Revenue"];
      topCategory = category;
    }
    totalRevenue += metrics["Total Revenue"];
  }

  container.innerHTML = `
    <div class="analysis-box">
      <h3>${formatMonthLabel(month)} – Top Category</h3>
      <p>${topCategory}</p>
    </div>
    <div class="analysis-box">
      <h3>${formatMonthLabel(month)} – Total Revenue</h3>
      <p>${currencySymbol}${totalRevenue.toLocaleString()}</p>
    </div>
    <div class="analysis-box">
      <h3>Avg Revenue </h3>
      <p>${currencySymbol}${(totalRevenue / Object.keys(data).length).toFixed(2)}</p>
    </div>
  `;

  document.querySelector("main").appendChild(container);
}

function renderCharts(data, month) {
  const labels = Object.keys(data);
  const revenue = labels.map(cat => data[cat]["Total Revenue"]);
  const units = labels.map(cat => data[cat]["Total Units Sold"]);
  const prices = labels.map(cat => data[cat]["Avg Price per Unit"]);
  const customers = labels.map(cat => data[cat]["Unique Customers"]);

  renderBarChart(`${formatMonthLabel(month)} – Revenue`, `revenue-chart-${month}`, labels, revenue, "Revenue", true);
  renderBarChart(`${formatMonthLabel(month)} – Units Sold`, `units-chart-${month}`, labels, units, "Units Sold");
  renderBarChart(`${formatMonthLabel(month)} – Avg Price`, `price-chart-${month}`, labels, prices, "Avg Price", true);
  renderPieChart(`${formatMonthLabel(month)} – Unique Customers`, `customers-pie-${month}`, labels, customers);
}

function renderBarChart(title, canvasId, labels, data, yLabel = "", usePound = false) {
  const section = document.createElement("section");
  section.className = "chart-container dynamic-section";
  section.innerHTML = `
    <h2>${title}</h2>
    <canvas id="${canvasId}"></canvas>
  `;
  document.querySelector("main").appendChild(section);

  const ctx = document.getElementById(canvasId).getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: yLabel,
        data,
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        borderColor: "rgba(54, 162, 235, 1)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: yLabel }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = context.raw;
              return usePound ? `${currencySymbol}${value.toLocaleString()}` : value;
            }
          }
        }
      }
    }
  });
}

function renderPieChart(title, canvasId, labels, data) {
  const section = document.createElement("section");
  section.className = "chart-container dynamic-section";
  section.innerHTML = `
    <h2>${title}</h2>
    <canvas id="${canvasId}"></canvas>
  `;
  document.querySelector("main").appendChild(section);

  const ctx = document.getElementById(canvasId).getContext("2d");
  new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          'rgba(255, 99, 132, 0.6)',
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 206, 86, 0.6)'
        ],
        borderColor: "#fff",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}
