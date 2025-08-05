const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const csv = require("csv-parser");
const User = require("./mongo");
const ejs = require("ejs");
const loadDataset = require("./utils/loadDataset");
const datasetPath = path.join(__dirname, "data", "retail_sales_dataset.csv");

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;


module.exports = app;
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("Connected to MongoDB");
}).catch((err) => {
  console.error("Error connecting to MongoDB:", err);
});

app.engine("html", ejs.renderFile);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
const MongoStore = require('connect-mongo');

app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  }
}));

app.use(express.static(path.join(__dirname, "src")));

app.get("/api/category-summary/all-months", async (req, res) => {
  try {
    const filePath = datasetPath;
    const data = await loadDataset(filePath);

    const monthlySummary = {};

    data.forEach(({ yearMonth, productCategory, quantity, pricePerUnit, totalAmount, customerId, date }) => {
      if (!date) return;
      const currentYear = new Date().getFullYear();
      const saleYear = new Date(date).getFullYear();
      if (saleYear > currentYear) return;

      if (!monthlySummary[yearMonth]) monthlySummary[yearMonth] = {};
      if (!monthlySummary[yearMonth][productCategory]) {
        monthlySummary[yearMonth][productCategory] = {
          "Total Revenue": 0,
          "Total Units Sold": 0,
          "Avg Price Total": 0,
          "Avg Price Count": 0,
          "Customers": new Set()
        };
      }

      const entry = monthlySummary[yearMonth][productCategory];
      entry["Total Revenue"] += totalAmount;
      entry["Total Units Sold"] += quantity;
      entry["Avg Price Total"] += pricePerUnit;
      entry["Avg Price Count"] += 1;
      entry["Customers"].add(customerId);
    });

    const response = {};
    for (const [month, cats] of Object.entries(monthlySummary)) {
      response[month] = {};
      for (const [category, metrics] of Object.entries(cats)) {
        response[month][category] = {
          "Total Revenue": parseFloat(metrics["Total Revenue"].toFixed(2)),
          "Total Units Sold": metrics["Total Units Sold"],
          "Avg Price per Unit": parseFloat((metrics["Avg Price Total"] / metrics["Avg Price Count"]).toFixed(2)),
          "Unique Customers": metrics["Customers"].size
        };
      }
    }

    res.json(response);
  } catch (err) {
    console.error("Error loading monthly summary:", err);
    res.status(500).send("Error processing monthly data.");
  }
});


app.get("/export-sales", (req, res) => {
  res.download(datasetPath, "retail_sales_dataset.csv", (err) => {
    if (err) {
      console.error("Download error:", err);
      res.status(500).send("Could not download the file.");
    }
  });
});



app.post("/edit-sale/:index", (req, res) => {
  const index = parseInt(req.params.index);
  const { date, category, quantity, price } = req.body;
  const total = parseFloat(quantity) * parseFloat(price);

  const lines = fs.readFileSync(datasetPath, "utf-8").trim().split("\n");
  const original = lines[index].split(",");
  const updated = [
    original[0], date, original[2], original[3], original[4],
    category, quantity, price, total
  ];

  lines[index] = updated.join(",");
  fs.writeFileSync(datasetPath, lines.join("\n"));
  res.redirect("/all-sales");
});


app.get("/edit-sale/:index", (req, res) => {
  const index = parseInt(req.params.index);
  const lines = fs.readFileSync(datasetPath, "utf-8").trim().split("\n");

  if (index <= 0 || index >= lines.length) return res.status(400).send("Invalid index");

  const row = lines[index].split(",");
  const sale = {
    date: row[1],
    category: row[5],
    quantity: row[6],
    price: row[7]
  };

  res.render("edit-row.html", { index, sale });
});


app.get("/all-sales", (req, res) => {
  const lines = fs.readFileSync(datasetPath, "utf-8").trim().split("\n");
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",");
    return { id: index + 1, values };
  });

  res.render("all-sales.html", { headers, rows });
});

app.get("/delete-sale/:index", (req, res) => {
  const index = parseInt(req.params.index);
  const lines = fs.readFileSync(datasetPath, "utf-8").trim().split("\n");
  if (index <= 0 || index >= lines.length) return res.status(400).send("Invalid index");

  lines.splice(index, 1); 
  fs.writeFileSync(datasetPath, lines.join("\n"));
  res.redirect("/all-sales");
});


app.post("/edit-last-sale", (req, res) => {
  const { date, category, quantity, price } = req.body;
  const total = parseFloat(quantity) * parseFloat(price);

  const lines = fs.readFileSync(datasetPath, "utf-8").trim().split("\n");
  lines.pop(); 
  const newRow = `${Math.floor(Math.random()*1000000)},${date},USER001,Other,25,${category},${quantity},${price},${total}`;
  lines.push(newRow);
  fs.writeFileSync(datasetPath, lines.join("\n"));

  res.redirect("/forecast");
});

app.post("/add-sale", (req, res) => {
  const { date, category, quantity, price, age } = req.body;
    if (!date || !category || !quantity || price === '' || isNaN(parseFloat(price))) {
    return res.status(400).send("Missing or invalid sale fields.");
  }

  const total = parseFloat(quantity) * parseFloat(price);

  // Load existing data
  const lines = fs.readFileSync(datasetPath, "utf-8").trim().split("\n");

  // Find the last valid row (skip headers)
  const lastLine = lines[lines.length - 1].split(",");

  // Get last transaction ID
  const lastTransactionId = parseInt(lastLine[0]);
  const newTransactionId = lastTransactionId + 1;

  // Get last Customer ID
  let lastCustomerId = "CUST000";
  for (let i = lines.length - 1; i >= 1; i--) {
    const custId = lines[i].split(",")[2];
    if (custId.startsWith("CUST")) {
      lastCustomerId = custId;
      break;
    }
  }

  const nextCustNum = parseInt(lastCustomerId.replace("CUST", "")) + 1;
  const newCustId = `CUST${String(nextCustNum).padStart(3, "0")}`;

  // Handle optional age
  const validAge = age ? parseInt(age) : 0;

  // Construct the new row
  const newRow = `${newTransactionId},${date},${newCustId},Other,${validAge},${category},${quantity},${price},${total}`;

  // Ensure newline formatting is preserved before appending
  const fileContent = fs.readFileSync(datasetPath, "utf-8");
  const needsNewline = fileContent[fileContent.length - 1] !== "\n";

  const lineToWrite = `${needsNewline ? "\n" : ""}${newRow}\n`;

  fs.appendFile(datasetPath, lineToWrite, (err) => {
    if (err) {
      console.error("Error saving sale:", err);
      return res.status(500).send("Error saving data.");
    }
    res.redirect("/add-sale"); //Stay on the same page
  });
});





app.get("/api/profit-analysis", async (req, res) => {
  try {
    const filePath = datasetPath;
    const data = await loadDataset(filePath);

    const summary = {};

    data.forEach((row) => {
      const { date, totalAmount, quantity, pricePerUnit } = row;
      if (!date) return;
      const saleYear = new Date(date).getFullYear();
      const currentYear = new Date().getFullYear();
      if (saleYear > currentYear) return;

      if (!summary[date]) {
        summary[date] = {
          "Total Amount": 0,
          "Quantity": 0,
          "Price per Unit": 0
        };
      }

      summary[date]["Total Amount"] += totalAmount;
      summary[date]["Quantity"] += quantity;
      summary[date]["Price per Unit"] += pricePerUnit;
    });

    res.json(summary);
  } catch (error) {
    console.error("Error loading dataset:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("index.html", { user: req.session.user });
});

app.get("/register", (req, res) => res.render("register.html"));
app.get("/login", (req, res) => res.render("login.html"));
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).send("<h3>User Already Exists. Try another email.</h3>");
    }
    const user = new User({ name, email, password });
    await user.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).send("<h3>Something went wrong. Try again later.</h3>");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, { expiresIn: "1h" });
      req.session.user = { name: user.name, email: user.email, token };
      res.redirect("/");
    } else {
      res.status(401).send("<h3>Invalid Email or Password.</h3>");
    }
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).send("<h3>Something went wrong. Try again later.</h3>");
  }
});

app.get("/api/category-performance", (req, res) => {
  const categoryRevenue = {};

  fs.createReadStream(datasetPath)
    .pipe(csv())
    .on("data", (row) => {
      const date = row["Date"];
      if (!date) return;
      const saleYear = new Date(date).getFullYear();
      const currentYear = new Date().getFullYear();
      if (saleYear > currentYear) return;

      const category = row["Product Category"];
      const amount = parseFloat(row["Total Amount"]) || 0;
      if (!categoryRevenue[category]) categoryRevenue[category] = 0;
      categoryRevenue[category] += amount;
    })
    .on("end", () => res.json(categoryRevenue))
    .on("error", (err) => {
      console.error("Category analysis error:", err);
      res.status(500).send("Error processing category data.");
    });
});


app.get("/forecast", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("forecast.html");
});

app.get("/add-sale", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("add-sale.html");
});


app.get("/api/category-summary", (req, res) => {
  const categorySummary = {};

  fs.createReadStream(datasetPath)
    .pipe(csv())
    .on("data", (row) => {
      const date = row["Date"];
      if (!date) return;
      const saleYear = new Date(date).getFullYear();
      const currentYear = new Date().getFullYear();
      if (saleYear > currentYear) return;

      const category = row["Product Category"];
      const quantity = parseFloat(row["Quantity"]) || 0;
      const price = parseFloat(row["Price per Unit"]) || 0;
      const amount = parseFloat(row["Total Amount"]) || 0;
      const customer = row["Customer ID"];

      if (!category) return;

      if (!categorySummary[category]) {
        categorySummary[category] = {
          totalRevenue: 0,
          totalUnits: 0,
          totalPrice: 0,
          priceCount: 0,
          customers: new Set()
        };
      }

      const data = categorySummary[category];
      data.totalRevenue += amount;
      data.totalUnits += quantity;
      data.totalPrice += price;
      data.priceCount += 1;
      data.customers.add(customer);
    })
    .on("end", () => {
      const finalSummary = {};
      for (const [category, data] of Object.entries(categorySummary)) {
        finalSummary[category] = {
          "Total Revenue": parseFloat(data.totalRevenue.toFixed(2)),
          "Total Units Sold": data.totalUnits,
          "Avg Price per Unit": parseFloat((data.totalPrice / data.priceCount).toFixed(2)),
          "Unique Customers": data.customers.size
        };
      }
      res.json(finalSummary);
    })
    .on("error", (err) => {
      console.error("Error reading CSV:", err);
      res.status(500).send("Error processing dataset.");
    });
});

app.get("/api/order-insights", async (req, res) => {
  const filePath = "./data/retail_sales_dataset.csv";
  const results = {
    ordersPerMonth: {},
    quantityDistribution: [],
    amountDistribution: []
  };

  try {
    const data = await loadDataset(filePath);

    data.forEach(row => {
      const date = row.date;
      const quantity = row.quantity;
      const total = row.totalAmount;

      if (!date) return;

      const yearMonth = date.slice(0, 7);
      results.ordersPerMonth[yearMonth] = (results.ordersPerMonth[yearMonth] || 0) + 1;
      results.quantityDistribution.push(quantity);
      results.amountDistribution.push(total);
    });

    res.json(results);
  } catch (err) {
    console.error("Insight load error:", err);
    res.status(500).json({ error: "Failed to compute insights." });
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.get("*", (req, res) => res.status(404).render("404.html"));

