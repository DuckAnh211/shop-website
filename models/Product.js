const mongoose = require("mongoose")

const ProductImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: "", trim: true }
  },
  { _id: false }
)

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0, min: 0 },
    originalPrice: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 99 },
    image: {
      type: ProductImageSchema,
      default: null
    },
    images: {
      type: [ProductImageSchema],
      default: []
    },
    description: { type: String, default: "", trim: true }
  },
  { timestamps: true }
)

module.exports = mongoose.models.Product || mongoose.model("Product", ProductSchema)
