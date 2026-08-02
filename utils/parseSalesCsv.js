const { Readable } = require("stream");
const csv = require("csv-parser");

// Real businesses export sales history from wherever they currently track it
// (a spreadsheet, Square, Shopify, ...) — their column names won't match ours
// exactly. This maps a handful of common header spellings onto our schema
// instead of requiring an exact template.
const HEADER_ALIASES = {
  date: ["date", "sale date", "transaction date"],
  category: ["category", "product category", "product", "item"],
  quantity: ["quantity", "qty", "units"],
  pricePerUnit: ["price per unit", "unit price", "price", "unitprice"],
  totalAmount: ["total amount", "total", "amount", "revenue"],
  customerId: ["customer id", "customer", "customerid"],
  gender: ["gender"],
  age: ["age"],
};

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildFieldMap(rawHeaders) {
  const map = {}; // our field name -> raw header key as it appears in the parsed row
  for (const rawHeader of rawHeaders) {
    const normalized = normalizeHeader(rawHeader);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized) && !map[field]) {
        map[field] = rawHeader;
      }
    }
  }
  return map;
}

// Parses an uploaded CSV buffer into { rows, skipped, fieldMap }.
// `rows` are ready to insert as Sale documents (business is attached by the caller).
// `skipped` counts rows missing a required field, so the caller can report a summary.
function parseSalesCsv(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let skipped = 0;
    let fieldMap = null;
    let headersSeen = false;

    Readable.from(buffer)
      .pipe(csv())
      .on("headers", (rawHeaders) => {
        headersSeen = true;
        fieldMap = buildFieldMap(rawHeaders);
      })
      .on("data", (raw) => {
        if (!fieldMap) return;

        const get = (field) => (fieldMap[field] ? raw[fieldMap[field]] : undefined);

        const dateRaw = get("date");
        const category = (get("category") || "").trim();
        const quantity = parseFloat(get("quantity"));
        const pricePerUnit = parseFloat(get("pricePerUnit"));
        let totalAmount = parseFloat(get("totalAmount"));

        const date = dateRaw ? new Date(dateRaw) : null;

        if (!date || isNaN(date.getTime()) || !category || isNaN(quantity) || isNaN(pricePerUnit)) {
          skipped++;
          return;
        }

        if (isNaN(totalAmount)) totalAmount = quantity * pricePerUnit;

        const row = { date, category, quantity, pricePerUnit, totalAmount };

        const customerId = get("customerId");
        const gender = get("gender");
        const age = parseInt(get("age"));
        if (customerId) row.customerId = String(customerId).trim();
        if (gender) row.gender = String(gender).trim();
        if (!isNaN(age)) row.age = age;

        rows.push(row);
      })
      .on("end", () => {
        if (!headersSeen) return reject(new Error("File appears to be empty."));
        if (!fieldMap.date || !fieldMap.category || !fieldMap.quantity || !fieldMap.pricePerUnit) {
          return reject(new Error(
            "Couldn't find Date/Category/Quantity/Price columns in this file's header row."
          ));
        }
        resolve({ rows, skipped, fieldMap });
      })
      .on("error", reject);
  });
}

module.exports = parseSalesCsv;
