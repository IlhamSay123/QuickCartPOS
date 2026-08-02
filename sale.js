const mongoose = require("mongoose");

// Every sale belongs to exactly one business (currently: one User = one
// business — see index.js for how routes enforce this on every read/write).
const SaleSchema = new mongoose.Schema({
  business: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date: { type: Date, required: true },
  category: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  pricePerUnit: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  // Carried over from CSV imports when present; not collected by the manual
  // add-sale form, so optional.
  customerId: { type: String },
  gender: { type: String },
  age: { type: Number },
}, { timestamps: true });

SaleSchema.index({ business: 1, date: 1 });

module.exports = mongoose.model("Sale", SaleSchema);
