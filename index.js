const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const User = require("./mongo");
const Sale = require("./sale");
const ejs = require("ejs");
const multer = require("multer");
const parseSalesCsv = require("./utils/parseSalesCsv");
const { sendPasswordResetEmail } = require("./utils/mailer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- CSRF (synchronizer token pattern) ----------
// The app uses cookie-based sessions, so any state-changing form is a CSRF
// target unless it proves the submission actually came from a page we
// rendered — a malicious site can make a browser fire a POST with the
// victim's cookies attached, but it can't read the token embedded in the
// form we served, so the request is neither read nor forgeable end-to-end.
function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  const provided = req.body && req.body._csrf;
  const expected = req.session.csrfToken;
  if (!provided || !expected) {
    return res.status(403).send("Invalid or expired form submission. Please refresh the page and try again.");
  }
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).send("Invalid or expired form submission. Please refresh the page and try again.");
  }
  next();
}

// ---------- Password policy ----------
function isPasswordStrong(password) {
  return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
const PASSWORD_POLICY_MESSAGE = "Password must be at least 8 characters and include a letter and a number.";

// ---------- Rate limiting on auth endpoints (brute force / abuse) ----------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts from this network. Please try again in a few minutes."
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many accounts created from this network. Please try again later."
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many password reset requests. Please try again later."
});

dotenv.config();
const app = express();

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

// Serve ONLY the actual public asset folders — never the whole src/ directory.
// It used to serve all of src/, which meant every page template (login.html,
// all-sales.html, profitAnalysis.html, ...) was directly fetchable by its raw
// filename, bypassing every requireAuth check below entirely (e.g. GET
// /all-sales.html returned the page with no login, even though GET /all-sales
// was protected). Templates are only reachable through res.render() now, via
// the explicit, auth-checked routes.
app.use("/styles", express.static(path.join(__dirname, "src", "styles")));
app.use("/script", express.static(path.join(__dirname, "src", "script")));
app.use("/images", express.static(path.join(__dirname, "src", "images")));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/login");
}

app.get("/api/category-summary/all-months", requireAuth, async (req, res) => {
  try {
    const sales = await Sale.find({ business: req.session.user.id }).lean();

    const monthlySummary = {};

    sales.forEach(({ date, category: productCategory, quantity, pricePerUnit, totalAmount, customerId }) => {
      const yearMonth = date.toISOString().slice(0, 7);

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


app.get("/export-sales", requireAuth, async (req, res) => {
  try {
    const sales = await Sale.find({ business: req.session.user.id }).sort({ date: 1 }).lean();
    const header = "Date,Product Category,Quantity,Price per Unit,Total Amount\n";
    const body = sales.map((s) => [
      s.date.toISOString().slice(0, 10),
      csvField(s.category),
      s.quantity,
      s.pricePerUnit,
      s.totalAmount
    ].join(",")).join("\n");

    res.setHeader("Content-Disposition", 'attachment; filename="sales-export.csv"');
    res.setHeader("Content-Type", "text/csv");
    res.send(header + body);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).send("Could not export sales.");
  }
});



app.post("/edit-sale/:id", requireAuth, requireCsrf, async (req, res) => {
  const { date, category, quantity, price } = req.body;
  const total = parseFloat(quantity) * parseFloat(price);

  try {
    // Scoping the filter by business (not just _id) is what stops one
    // business from editing another's sale by guessing/incrementing an id.
    const updated = await Sale.findOneAndUpdate(
      { _id: req.params.id, business: req.session.user.id },
      { date: new Date(date), category, quantity: parseFloat(quantity), pricePerUnit: parseFloat(price), totalAmount: total }
    );
    if (!updated) return res.status(404).send("Sale not found.");
    res.redirect("/all-sales");
  } catch (err) {
    res.status(400).send("Invalid sale id.");
  }
});


app.get("/edit-sale/:id", requireAuth, async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, business: req.session.user.id }).lean();
    if (!sale) return res.status(404).send("Sale not found.");

    res.render("edit-row.html", {
      id: sale._id.toString(),
      csrfToken: ensureCsrfToken(req),
      sale: {
        date: sale.date.toISOString().slice(0, 10),
        category: sale.category,
        quantity: sale.quantity,
        price: sale.pricePerUnit
      }
    });
  } catch (err) {
    res.status(400).send("Invalid sale id.");
  }
});


app.get("/all-sales", requireAuth, async (req, res) => {
  const sales = await Sale.find({ business: req.session.user.id }).sort({ date: -1 }).lean();
  const headers = ["Date", "Product Category", "Quantity", "Price per Unit", "Total Amount"];
  const rows = sales.map((s) => ({
    id: s._id.toString(),
    values: [s.date.toISOString().slice(0, 10), s.category, s.quantity, s.pricePerUnit, s.totalAmount]
  }));

  res.render("all-sales.html", { headers, rows, csrfToken: ensureCsrfToken(req) });
});

// POST, not GET — a GET request that deletes data can be triggered by
// anything that makes the browser load a URL (an <img> tag on another site,
// a link preview, a prefetch), with the victim's session cookie attached
// automatically. requireCsrf on top closes the same hole for POST too.
app.post("/delete-sale/:id", requireAuth, requireCsrf, async (req, res) => {
  try {
    const deleted = await Sale.findOneAndDelete({ _id: req.params.id, business: req.session.user.id });
    if (!deleted) return res.status(404).send("Sale not found.");
    res.redirect("/all-sales");
  } catch (err) {
    res.status(400).send("Invalid sale id.");
  }
});


app.post("/add-sale", requireAuth, requireCsrf, async (req, res) => {
  const { date, category, quantity, price, age } = req.body;
    if (!date || !category || !quantity || price === '' || isNaN(parseFloat(price))) {
    return res.status(400).send("Missing or invalid sale fields.");
  }

  const qty = parseFloat(quantity);
  const pricePerUnit = parseFloat(price);

  try {
    // Mongo hands out a real unique _id per document — no more scanning the
    // whole dataset for "the last transaction ID" (and no more races doing it).
    await Sale.create({
      business: req.session.user.id,
      date: new Date(date),
      category,
      quantity: qty,
      pricePerUnit,
      totalAmount: qty * pricePerUnit,
      ...(age ? { age: parseInt(age) } : {})
    });
    res.redirect("/add-sale"); //Stay on the same page
  } catch (err) {
    console.error("Error saving sale:", err);
    res.status(500).send("Error saving data.");
  }
});





app.get("/api/profit-analysis", requireAuth, async (req, res) => {
  try {
    const sales = await Sale.find({ business: req.session.user.id }).lean();

    const summary = {};

    sales.forEach(({ date, totalAmount, quantity, pricePerUnit }) => {
      const dateKey = date.toISOString().slice(0, 10);

      if (!summary[dateKey]) {
        summary[dateKey] = {
          "Total Amount": 0,
          "Quantity": 0,
          "Price per Unit": 0
        };
      }

      summary[dateKey]["Total Amount"] += totalAmount;
      summary[dateKey]["Quantity"] += quantity;
      summary[dateKey]["Price per Unit"] += pricePerUnit;
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

app.get("/register", (req, res) => res.render("register.html", { csrfToken: ensureCsrfToken(req) }));
app.get("/login", (req, res) => res.render("login.html", { csrfToken: ensureCsrfToken(req) }));
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.post("/register", registerLimiter, requireCsrf, async (req, res) => {
  const { name, email, password } = req.body;
  if (!isPasswordStrong(password)) {
    return res.status(400).send(`<h3>${PASSWORD_POLICY_MESSAGE}</h3>`);
  }
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

// bcrypt hash of a random, never-used string — compared against when no user
// is found, purely so a login attempt against a nonexistent email takes
// about as long as one against a real email. Without this, the response
// timing itself would tell an attacker which emails are registered.
const DUMMY_PASSWORD_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Ffg/g6vfN.Bva0m6ZgD5C.5YWZ5Sq";

app.post("/login", loginLimiter, requireCsrf, async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    // The password was never actually checked here before — any password
    // logged in as long as the email existed. Comparing against the stored
    // bcrypt hash is the entire point of hashing it on registration.
    const passwordMatches = await bcrypt.compare(String(password || ""), user ? user.password : DUMMY_PASSWORD_HASH);

    if (user && passwordMatches) {
      const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, { expiresIn: "1h" });
      // `id` is what every Sale query below scopes on — one User = one business tenant.
      req.session.user = { id: user._id.toString(), name: user.name, email: user.email, token };
      res.redirect("/");
    } else {
      res.status(401).send("<h3>Invalid Email or Password.</h3>");
    }
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).send("<h3>Something went wrong. Try again later.</h3>");
  }
});

// ---------- Forgot / reset password ----------
app.get("/forgot-password", (req, res) => {
  res.render("forgot-password.html", { csrfToken: ensureCsrfToken(req), sent: false });
});

app.post("/forgot-password", forgotPasswordLimiter, requireCsrf, async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      user.resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      const resetUrl = `${req.protocol}://${req.get("host")}/reset-password/${rawToken}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }
    // Same response whether or not the email is registered — otherwise this
    // endpoint becomes a way to check which emails have an account here.
  } catch (err) {
    console.error("Forgot-password error:", err);
  }
  res.render("forgot-password.html", { csrfToken: ensureCsrfToken(req), sent: true });
});

app.get("/reset-password/:token", async (req, res) => {
  const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
  const user = await User.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpiry: { $gt: new Date() }
  });
  res.render("reset-password.html", {
    csrfToken: ensureCsrfToken(req),
    invalid: !user,
    error: null,
    token: req.params.token
  });
});

app.post("/reset-password/:token", requireCsrf, async (req, res) => {
  const { password } = req.body;
  const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
  try {
    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiry: { $gt: new Date() }
    });
    if (!user) {
      return res.render("reset-password.html", {
        csrfToken: ensureCsrfToken(req), invalid: true, error: null, token: req.params.token
      });
    }
    if (!isPasswordStrong(password)) {
      return res.render("reset-password.html", {
        csrfToken: ensureCsrfToken(req), invalid: false, error: PASSWORD_POLICY_MESSAGE, token: req.params.token
      });
    }
    user.password = password; // pre-save hook rehashes
    user.resetTokenHash = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Reset-password error:", err);
    res.status(500).send("<h3>Something went wrong. Try again later.</h3>");
  }
});

app.get("/api/category-performance", requireAuth, async (req, res) => {
  try {
    const sales = await Sale.find({ business: req.session.user.id }).lean();
    const categoryRevenue = {};
    sales.forEach(({ category, totalAmount }) => {
      categoryRevenue[category] = (categoryRevenue[category] || 0) + (totalAmount || 0);
    });
    res.json(categoryRevenue);
  } catch (err) {
    console.error("Category analysis error:", err);
    res.status(500).send("Error processing category data.");
  }
});


app.get("/forecast", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("forecast.html");
});

// Proxies the AI/predict-server.py service instead of having the browser call
// it directly at a hardcoded http://127.0.0.1:5001. That address only ever
// resolves to "whoever's browser loaded the page" — it silently breaks the
// forecast for anyone once this app is deployed anywhere but your own laptop.
// Routing through here also means forecast data now goes through the same
// requireAuth check as everything else, and lets FORECAST_SERVICE_URL point
// at wherever that service actually runs relative to this server (the "ai"
// service name in Docker, 127.0.0.1 for local dev).
const FORECAST_SERVICE_URL = process.env.FORECAST_SERVICE_URL || "http://127.0.0.1:5001";

app.get("/api/forecast", requireAuth, async (req, res) => {
  try {
    // The model trains fresh per request on THIS business's own sales — no
    // shared/pre-trained model, no other business's data involved. Aggregate
    // to monthly totals here since that's the timescale the model reasons at.
    const sales = await Sale.find({ business: req.session.user.id }).lean();
    const monthlyMap = {};
    sales.forEach((s) => {
      const ym = s.date.toISOString().slice(0, 7);
      monthlyMap[ym] = (monthlyMap[ym] || 0) + s.totalAmount;
    });
    const monthly = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

    const upstream = await fetch(`${FORECAST_SERVICE_URL}/api/predict-revenue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Forecast proxy error:", err);
    res.status(502).json({ error: "Forecast service unavailable." });
  }
});

// These used to only be reachable via the raw static file (e.g. GET
// /salesOverview.html), which is why they had no auth check at all — see the
// static-serving fix above. The dashboard nav links now point here instead.
app.get("/salesOverview", requireAuth, (req, res) => res.render("salesOverview.html"));
app.get("/categoryPerformance", requireAuth, (req, res) => res.render("categoryPerformance.html"));
app.get("/order-insights", requireAuth, (req, res) => res.render("order-insights.html"));
app.get("/profitAnalysis", requireAuth, (req, res) => res.render("profitAnalysis.html"));
// About/Contact show no account data, so these stay public.
app.get("/about", (req, res) => res.render("about.html"));
app.get("/contact", (req, res) => res.render("contact.html"));

app.get("/add-sale", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("add-sale.html", { csrfToken: ensureCsrfToken(req) });
});

// Bulk historical import — day-one usage of the manual add-sale form alone
// leaves a new business with zero history and a useless forecast, so this is
// how they bring in what they're already tracking elsewhere (a spreadsheet,
// an export from whatever POS/accounting tool they use today, etc).
app.get("/import-sales", requireAuth, (req, res) => {
  res.render("import-sales.html", { csrfToken: ensureCsrfToken(req), error: null, imported: null, skipped: null });
});

app.post("/import-sales", requireAuth, upload.single("file"), requireCsrf, async (req, res) => {
  if (!req.file) {
    return res.render("import-sales.html", {
      csrfToken: ensureCsrfToken(req), error: "No file selected.", imported: null, skipped: null
    });
  }
  try {
    const { rows, skipped } = await parseSalesCsv(req.file.buffer);
    if (rows.length > 0) {
      const docs = rows.map((r) => ({ ...r, business: req.session.user.id }));
      await Sale.insertMany(docs);
    }
    res.render("import-sales.html", { csrfToken: ensureCsrfToken(req), error: null, imported: rows.length, skipped });
  } catch (err) {
    console.error("Import error:", err);
    res.render("import-sales.html", {
      csrfToken: ensureCsrfToken(req),
      error: err.message || "Couldn't process that file.",
      imported: null,
      skipped: null
    });
  }
});


app.get("/api/category-summary", requireAuth, async (req, res) => {
  try {
    const sales = await Sale.find({ business: req.session.user.id }).lean();
    const categorySummary = {};

    sales.forEach(({ category, quantity, pricePerUnit, totalAmount, customerId }) => {
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
      data.totalRevenue += totalAmount || 0;
      data.totalUnits += quantity || 0;
      data.totalPrice += pricePerUnit || 0;
      data.priceCount += 1;
      if (customerId) data.customers.add(customerId);
    });

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
  } catch (err) {
    console.error("Error reading sales:", err);
    res.status(500).send("Error processing dataset.");
  }
});

app.get("/api/order-insights", requireAuth, async (req, res) => {
  const results = {
    ordersPerMonth: {},
    quantityDistribution: [],
    amountDistribution: []
  };

  try {
    const sales = await Sale.find({ business: req.session.user.id }).lean();

    sales.forEach(({ date, quantity, totalAmount }) => {
      const yearMonth = date.toISOString().slice(0, 7);
      results.ordersPerMonth[yearMonth] = (results.ordersPerMonth[yearMonth] || 0) + 1;
      results.quantityDistribution.push(quantity);
      results.amountDistribution.push(totalAmount);
    });

    res.json(results);
  } catch (err) {
    console.error("Insight load error:", err);
    res.status(500).json({ error: "Failed to compute insights." });
  }
});


app.get("*", (req, res) => res.status(404).render("404.html"));

// No app.listen() here — this module only builds the app. server.js is the
// single entry point that actually starts listening (also what Docker runs).

