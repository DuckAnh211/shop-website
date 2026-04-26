const router = require("express").Router()
const Product = require("../models/Product")
const env = require("../config/env")
const asyncHandler = require("../utils/asyncHandler")
const upload = require("../services/uploadService")
const { uploadImages, deleteImages } = require("../services/cloudinaryService")
const { authenticateAdmin, createAdminToken } = require("../middleware/auth")
const { mapProduct } = require("../utils/productMapper")
const { validateAndBuildProductInput } = require("../utils/productValidation")

router.post(
  "/login",
  asyncHandler(async (req, res)=>{
    const username = String(req.body.username || "").trim()
    const password = String(req.body.password || "")

    if(username !== env.adminUsername || password !== env.adminPassword){
      return res.status(401).json({ message: "Invalid username or password." })
    }

    return res.json({
      success: true,
      token: createAdminToken()
    })
  })
)

router.post(
  "/add-product",
  authenticateAdmin,
  upload.array("images", 10),
  asyncHandler(async (req, res)=>{
    if(!req.files || !req.files.length){
      return res.status(400).json({ message: "Please upload at least one product image." })
    }

    const productInput = validateAndBuildProductInput(req.body)
    const uploadedImages = await uploadImages(req.files)

    const product = await Product.create({
      ...productInput,
      image: uploadedImages[0],
      images: uploadedImages
    })

    res.status(201).json({
      message: "Product added successfully.",
      product: mapProduct(product)
    })
  })
)

router.put(
  "/products/:id",
  authenticateAdmin,
  upload.array("images", 10),
  asyncHandler(async (req, res)=>{
    const existingProduct = await Product.findById(req.params.id)
    if(!existingProduct){
      return res.status(404).json({ message: "Product not found." })
    }

    const productInput = validateAndBuildProductInput(req.body, existingProduct)
    let nextImages = existingProduct.images || []

    if(req.files && req.files.length){
      const uploadedImages = await uploadImages(req.files)
      await deleteImages(existingProduct.images)
      nextImages = uploadedImages
    }

    existingProduct.name = productInput.name
    existingProduct.description = productInput.description
    existingProduct.price = productInput.price
    existingProduct.originalPrice = productInput.originalPrice
    existingProduct.discount = productInput.discount
    existingProduct.bundleDiscountPercent = productInput.bundleDiscountPercent
    existingProduct.bundleRequiredProducts = productInput.bundleRequiredProducts.filter(
      (productId)=>String(productId) !== String(existingProduct._id)
    )
    existingProduct.images = nextImages
    existingProduct.image = nextImages[0] || null

    await existingProduct.save()

    res.json({
      message: "Product updated successfully.",
      product: mapProduct(existingProduct)
    })
  })
)

router.delete(
  "/products/:id",
  authenticateAdmin,
  asyncHandler(async (req, res)=>{
    const existingProduct = await Product.findById(req.params.id)
    if(!existingProduct){
      return res.status(404).json({ message: "Product not found." })
    }

    await deleteImages(existingProduct.images)
    await Product.updateMany(
      { bundleRequiredProducts: existingProduct._id },
      { $pull: { bundleRequiredProducts: existingProduct._id } }
    )
    await existingProduct.deleteOne()

    res.json({ message: "Product deleted successfully." })
  })
)

module.exports = router
