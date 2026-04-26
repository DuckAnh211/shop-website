const router = require("express").Router()
const Product = require("../models/Product")
const asyncHandler = require("../utils/asyncHandler")
const { mapProduct } = require("../utils/productMapper")

router.get(
  "/",
  asyncHandler(async (req, res)=>{
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .populate("bundleRequiredProducts", "name")
    res.json(products.map(mapProduct))
  })
)

module.exports = router
