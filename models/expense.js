const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    // walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    description: String,
    paymentMethod: { type: String, enum: ["Cash", "Card", "UPI", "Bank"], required: true },
    date: { type: Date, required: true },
    notes: String,
    tags: [String],
    attachmentUrl: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
