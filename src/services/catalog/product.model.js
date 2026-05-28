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
    slug: { type: String, default: "", trim: true, index: true },
    category: { type: String, default: "Uncategorized", trim: true, index: true },
    tags: { type: [String], default: [], index: true },
    price: { type: Number, default: 0, min: 0 },
    originalPrice: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 99 },
    bundleDiscountAmount: { type: Number, default: 0, min: 0 },
    bundleRequiredProducts: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: []
    },
    stock: { type: Number, default: 0, min: 0 },
    isPublished: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
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
