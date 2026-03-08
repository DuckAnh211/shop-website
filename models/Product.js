const mongoose = require("mongoose")

const ProductSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		// `price` is kept for backward compatibility with existing records/UI.
		price: { type: Number, default: 0 },
		originalPrice: { type: Number, default: 0 },
		discount: { type: Number, default: 0 },
		image: { type: String, default: "" },
		images: { type: [String], default: [] },
		description: { type: String, default: "" }
	},
	{ timestamps: true }
)

module.exports = mongoose.model("Product", ProductSchema)