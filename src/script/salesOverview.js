document.addEventListener("DOMContentLoaded", () => {
  fetchSalesData();
});

let salesData = {
  totalRevenue: {},
  unitsSold: {},
  monthlyRevenue: {},
  monthlyUnits: {}
};

let fullRevenueData = {};
let selectedRevenueMonth = "all";
let selectedUnitsMonth = "all";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currencySymbol = "£";

const fetchSalesData = () => {
  fetch("/api/profit-analysis")
    .then(response => response.json())
    .then(data => {
      processSalesData(data);
      updateQuickStats();
      populateMonthSelectors();
      renderRevenueChart();
      renderUnitsChart();
    })
    .catch(error => console.error("Error fetching sales data:", error));
};

const processSalesData = (data) => {
  salesData.totalRevenue = {};
  salesData.unitsSold = {};
  salesData.monthlyRevenue = {};
  salesData.monthlyUnits = {};

  Object.entries(data).forEach(([date, metrics]) => {
    if (!date) return;
    const currentYear = new Date().getFullYear();
    const saleYear = new Date(date).getFullYear();
    if (saleYear > currentYear) return;


    const totalAmount = metrics["Total Amount"] || 0;
    const quantity = metrics["Quantity"] || 0;

    salesData.totalRevenue[date] = (salesData.totalRevenue[date] || 0) + totalAmount;
    salesData.unitsSold[date] = (salesData.unitsSold[date] || 0) + quantity;

    const monthKey = date.slice(0, 7);
    salesData.monthlyRevenue[monthKey] = (salesData.monthlyRevenue[monthKey] || 0) + totalAmount;
    salesData.monthlyUnits[monthKey] = (salesData.monthlyUnits[monthKey] || 0) + quantity;
  });

  fullRevenueData = { ...salesData.totalRevenue };
};

const updateQuickStats = () => {
  const months = Object.keys(salesData.monthlyRevenue).sort();

  const totalRevenueSum = Object.values(salesData.monthlyRevenue).reduce((a, b) => a + b, 0);
  const totalUnitsSum = Object.values(salesData.monthlyUnits).reduce((a, b) => a + b, 0);
  const aov = totalUnitsSum > 0 ? totalRevenueSum / totalUnitsSum : 0;

  const sortedRevenue = Object.entries(salesData.monthlyRevenue)
    .filter(([_, val]) => val > 0)
    .sort(([a], [b]) => new Date(a + "-01") - new Date(b + "-01"));

  const revenueGrowthRate = sortedRevenue.length >= 2
    ? ((sortedRevenue[sortedRevenue.length - 1][1] - sortedRevenue[0][1]) / sortedRevenue[0][1]) * 100
    : 0;

  const peakMonth = months.reduce((a, b) =>
    salesData.monthlyRevenue[a] > salesData.monthlyRevenue[b] ? a : b, "");

  document.getElementById("total-revenue").textContent = `£${totalRevenueSum.toFixed(2)}`;
  document.getElementById("growth-rate").textContent = `${revenueGrowthRate.toFixed(2)}%`;
  document.getElementById("units-sold").textContent = `${totalUnitsSum}`;
  document.getElementById("aov").textContent = `£${aov.toFixed(2)}`;
  document.getElementById("peak-month").textContent = peakMonth;
};

const populateMonthSelectors = () => {
  const uniqueMonths = new Set(Object.keys(fullRevenueData).map(date => date.slice(0, 7)));

  const revenueMonthSelector = document.createElement("select");
  revenueMonthSelector.id = "revenue-month-selector";
  revenueMonthSelector.classList.add("form-select", "mb-3");

  const revenueDefault = document.createElement("option");
  revenueDefault.value = "all";
  revenueDefault.textContent = "All Months";
  revenueMonthSelector.appendChild(revenueDefault);

  const unitsMonthSelector = document.createElement("select");
  unitsMonthSelector.id = "units-month-selector";
  unitsMonthSelector.classList.add("form-select", "mb-3");

  const unitsDefault = document.createElement("option");
  unitsDefault.value = "all";
  unitsDefault.textContent = "All Months";
  unitsMonthSelector.appendChild(unitsDefault);

  Array.from(uniqueMonths).sort().forEach(month => {
    const [year, monthNum] = month.split("-");
    const monthName = monthNames[parseInt(monthNum, 10) - 1];

    const revenueOption = document.createElement("option");
    revenueOption.value = month;
    revenueOption.textContent = `${monthName} ${year}`;
    revenueMonthSelector.appendChild(revenueOption);

    const unitsOption = document.createElement("option");
    unitsOption.value = month;
    unitsOption.textContent = `${monthName} ${year}`;
    unitsMonthSelector.appendChild(unitsOption);
  });

  revenueMonthSelector.addEventListener("change", (event) => {
    selectedRevenueMonth = event.target.value;
    renderRevenueChart();
  });

  unitsMonthSelector.addEventListener("change", (event) => {
    selectedUnitsMonth = event.target.value;
    renderUnitsChart();
  });

  const revenueSection = document.getElementById("revenue-chart").parentNode;
  revenueSection.insertBefore(revenueMonthSelector, revenueSection.firstChild);

  const unitsSection = document.getElementById("units-chart").parentNode;
  unitsSection.insertBefore(unitsMonthSelector, unitsSection.firstChild);
};

const renderRevenueChart = () => {
  const ctx = document.getElementById("revenue-chart").getContext("2d");

  if (window.revenueChart) window.revenueChart.destroy();

  let labels = [];
  let dataPoints = [];

  if (selectedRevenueMonth === "all") {
    const monthlyTotals = {};
    Object.entries(salesData.totalRevenue).forEach(([date, amount]) => {
      const monthKey = date.slice(0, 7);
      if (!monthlyTotals[monthKey]) monthlyTotals[monthKey] = 0;
      monthlyTotals[monthKey] += amount;
    });

    const sortedMonthly = Object.entries(monthlyTotals).sort(([a], [b]) => new Date(a + "-01") - new Date(b + "-01"));
    labels = sortedMonthly.map(([month]) => {
      const [year, monthNum] = month.split("-");
      return `${monthNames[parseInt(monthNum, 10) - 1]} ${year}`;
    });
    dataPoints = sortedMonthly.map(([, value]) => value);
  } else {
    const filtered = Object.entries(salesData.totalRevenue)
      .filter(([date]) => date.startsWith(selectedRevenueMonth))
      .sort(([a], [b]) => new Date(a) - new Date(b));

    labels = filtered.map(([date]) => date.split("-")[2]);
    dataPoints = filtered.map(([, amount]) => amount);
  }

  window.revenueChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Total Revenue",
        data: dataPoints,
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        borderColor: "rgba(75, 192, 192, 1)",
        borderWidth: 2,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Revenue (£)" }
        },
        x: {
          title: { display: true, text: selectedRevenueMonth === "all" ? "Month" : "Day" }
        }
      }
    }
  });
};

const renderUnitsChart = () => {
  const ctx = document.getElementById("units-chart").getContext("2d");

  if (window.unitsChart) window.unitsChart.destroy();

  let labels = [];
  let dataPoints = [];

  if (selectedUnitsMonth === "all") {
    const monthlyTotals = {};
    Object.entries(salesData.unitsSold).forEach(([date, units]) => {
      const monthKey = date.slice(0, 7);
      if (!monthlyTotals[monthKey]) monthlyTotals[monthKey] = 0;
      monthlyTotals[monthKey] += units;
    });

    const sortedMonthly = Object.entries(monthlyTotals).sort(([a], [b]) => new Date(a + "-01") - new Date(b + "-01"));
    labels = sortedMonthly.map(([month]) => {
      const [year, monthNum] = month.split("-");
      return `${monthNames[parseInt(monthNum, 10) - 1]} ${year}`;
    });
    dataPoints = sortedMonthly.map(([, value]) => value);
  } else {
    const filtered = Object.entries(salesData.unitsSold)
      .filter(([date]) => date.startsWith(selectedUnitsMonth))
      .sort(([a], [b]) => new Date(a) - new Date(b));

    labels = filtered.map(([date]) => date.split("-")[2]);
    dataPoints = filtered.map(([, units]) => units);
  }

  window.unitsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Units Sold",
        data: dataPoints,
        backgroundColor: "rgba(153, 102, 255, 0.2)",
        borderColor: "rgba(153, 102, 255, 1)",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Units" }
        },
        x: {
          title: { display: true, text: selectedUnitsMonth === "all" ? "Month" : "Day" }
        }
      }
    }
  });
};
