import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  payment_id: Number,
  date: String,
  amount: Number,
  status: String,
  buyer_id: Number,
  items: Array,
});

export default mongoose.model("Order", orderSchema);