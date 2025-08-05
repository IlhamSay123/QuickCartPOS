document.addEventListener("DOMContentLoaded", () => {
  fetchSalesData(); // Load and display the data on page load
});

const currencySymbol = "£";

let salesData = {
  pricePerUnit: {},
  totalAmount: {},
  unitsSold: {} // Calculated from total amount and price per unit
};

// Process data to extract all sales metrics by year-month
const processData = (data) => {
  console.log("Processing Data:", data);

  Object.entries(data).forEach(([yearMonth, metrics]) => {
    const pricePerUnit = metrics["Price per Unit"] || 0;
    const totalAmount = metrics["Total Amount"] || 0;

    salesData.pricePerUnit[yearMonth] = pricePerUnit;
    salesData.totalAmount[yearMonth] = totalAmount;
    // Calculate units sold by dividing total amount by price per unit
    salesData.unitsSold[yearMonth] = pricePerUnit > 0 ? Math.round(totalAmount / pricePerUnit) : 0;
  });

  console.log("Processed Sales Data:", salesData);
  updateAnalytics();
};

// Fetch sales data from the backend API
const fetchSalesData = () => {
  fetch("/api/profit-analysis")
    .then((response) => {
      console.log("API Response Status:", response.status);
      return response.json();
    })
    .then((data) => {
      console.log("Fetched Data:", data);
      processData(data);
      updateAllCharts();
    })
    .catch((error) => console.error("Error fetching sales data:", error));
};

// Update all charts
const updateAllCharts = () => {
  updateRevenueChart();
  updatePriceChart();
  updateUnitsSoldChart();
};

// Render the total revenue chart
const updateRevenueChart = () => {
  const ctx = document.getElementById("profit-chart").getContext("2d");
  const sortedData = Object.entries(salesData.totalAmount).sort(([a], [b]) => new Date(a) - new Date(b));

  const chartConfig = createChartConfig(
    sortedData.map(([date]) => date),
    sortedData.map(([, amount]) => amount),
    "Total Revenue",
    "rgba(75, 192, 192, 0.2)",
    "rgba(75, 192, 192, 1)"
  );

  if (window.revenueChart) window.revenueChart.destroy();
  window.revenueChart = new Chart(ctx, chartConfig);
};

// Render the price per unit chart
const updatePriceChart = () => {
  const ctx = document.getElementById("price-chart").getContext("2d");
  const sortedData = Object.entries(salesData.pricePerUnit).sort(([a], [b]) => new Date(a) - new Date(b));

  const chartConfig = createChartConfig(
    sortedData.map(([date]) => date),
    sortedData.map(([, price]) => price),
    "Average Price per Unit",
    "rgba(255, 99, 132, 0.2)",
    "rgba(255, 99, 132, 1)"
  );

  if (window.priceChart) window.priceChart.destroy();
  window.priceChart = new Chart(ctx, chartConfig);
};

// Render the units sold chart
const updateUnitsSoldChart = () => {
  const ctx = document.getElementById("total-chart").getContext("2d");
  const sortedData = Object.entries(salesData.unitsSold).sort(([a], [b]) => new Date(a) - new Date(b));

  const chartConfig = createChartConfig(
    sortedData.map(([date]) => date),
    sortedData.map(([, units]) => units),
    "Units Sold",
    "rgba(54, 162, 235, 0.2)",
    "rgba(54, 162, 235, 1)",
    false // Do not use currency symbol
  );

  if (window.unitsChart) window.unitsChart.destroy();
  window.unitsChart = new Chart(ctx, chartConfig);
};

// Helper function to create chart configuration
const createChartConfig = (labels, data, label, backgroundColor, borderColor, useCurrency = true) => {
  return {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: label,
          data: data,
          backgroundColor: backgroundColor,
          borderColor: borderColor,
          borderWidth: 2,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: function (context) {
              const value = context.raw;
              return `${context.dataset.label}: ${useCurrency ? currencySymbol : ""}${value.toFixed(2)}`;
            }
          }
        },
      },
      scales: {
        x: { title: { display: true, text: "Year-Month" } },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: useCurrency ? `${label} (${currencySymbol})` : label,
          }
        },
      },
    },
  };
};

// Update summary values
const updateAnalytics = () => {
  const totalRevenue = Object.values(salesData.totalAmount).reduce((sum, val) => sum + val, 0);
  const totalUnitsSold = Object.values(salesData.unitsSold).reduce((sum, val) => sum + val, 0);
  const averagePrice = totalUnitsSold > 0 ? totalRevenue / totalUnitsSold : 0;

  document.getElementById("total-profit").textContent = `${currencySymbol}${totalRevenue.toFixed(2)}`;
  document.getElementById("top-category").textContent = `${totalUnitsSold.toLocaleString()} units`;
  document.getElementById("top-age-group").textContent = `${currencySymbol}${averagePrice.toFixed(2)}`;
};
