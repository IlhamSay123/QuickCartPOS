const fs = require("fs");
const csv = require("csv-parser");

const loadDataset = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];

    if (!fs.existsSync(filePath)) {
      console.error("File not found:", filePath);
      return resolve([]);
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const transactionId = row["Transaction ID"];
          const date = row["Date"];
          const customerId = row["Customer ID"];
          const gender = row["Gender"];
          const age = parseInt(row["Age"]) || 0;
          const productCategory = row["Product Category"];
          const quantity = parseFloat(row["Quantity"]) || 0;
          const pricePerUnit = parseFloat(row["Price per Unit"]) || 0;
          const totalAmount = parseFloat(row["Total Amount"]) || 0;

          if (!date || isNaN(pricePerUnit) || isNaN(totalAmount)) return;

          const currentYear = new Date().getFullYear();
          const saleYear = new Date(date).getFullYear();
          if (saleYear > currentYear) return; // dynamically exclude future years

          const yearMonth = date.split("-").slice(0, 2).join("-");

          results.push({
            transactionId,
            date,
            customerId,
            gender,
            age,
            productCategory,
            quantity,
            pricePerUnit,
            totalAmount,
            yearMonth
          });
        } catch (error) {
          console.error("Error processing row:", row, error);
        }
      })
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
};

module.exports = loadDataset;
