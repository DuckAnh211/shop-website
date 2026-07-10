const mongoose = require("mongoose")
const router = require("express").Router
const Product = require("./product.model")
const asyncHandler = require("../../shared/http/async-handler")
const { connectDatabase } = require("../../shared/db/mongo")
const upload = require("../media/upload.middleware")
const { uploadImages, deleteImages } = require("../media/media.service")
const { authenticateAdmin } = require("../../shared/auth/admin-auth")
const { mapProduct } = require("./product.mapper")
const { validateAndBuildProductInput } = require("./product.validation")
const { buildProductFilter, buildProductSort, parseLimit } = require("./product.queries")

const publicProductRouter = router()
const adminProductRouter = router()

const ensureCatalogDatabase = asyncHandler(async (req, res, next)=>{
  await connectDatabase()
  next()
})

function populateBundleNames(query){
  return query.populate("bundleRequiredProducts", "name slug")
}

publicProductRouter.use(ensureCatalogDatabase)
adminProductRouter.use(ensureCatalogDatabase)

publicProductRouter.get(
  "/",
  asyncHandler(async (req, res)=>{
    const products = await populateBundleNames(
      Product.find(buildProductFilter(req.query))
        .sort(buildProductSort(req.query.sort))
        .limit(parseLimit(req.query.limit))
    )

    res.json(products.map(mapProduct))
  })
)

publicProductRouter.get(
  "/meta/categories",
  asyncHandler(async (req, res)=>{
    const categories = await Product.distinct("category", { isPublished: { $ne: false } })
    res.json(
      categories
        .map((category)=>String(category || "").trim())
        .filter(Boolean)
        .sort((first, second)=>first.localeCompare(second))
    )
  })
)

publicProductRouter.get(
  "/:identifier",
  asyncHandler(async (req, res)=>{
    const identifier = String(req.params.identifier || "").trim()
    const productFilter = mongoose.Types.ObjectId.isValid(identifier)
      ? { _id: identifier, isPublished: { $ne: false } }
      : { slug: identifier, isPublished: { $ne: false } }
    const product = await populateBundleNames(Product.findOne(productFilter))

    if(!product){
      return res.status(404).json({ message: "Product not found." })
    }

    res.json(mapProduct(product))
  })
)

adminProductRouter.get(
  "/products",
  authenticateAdmin,
  asyncHandler(async (req, res)=>{
    const products = await populateBundleNames(
      Product.find(buildProductFilter(req.query, { includeUnpublished: true }))
        .sort(buildProductSort(req.query.sort))
        .limit(parseLimit(req.query.limit))
    )

    res.json(products.map(mapProduct))
  })
)

adminProductRouter.post(
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

adminProductRouter.put(
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

    Object.assign(existingProduct, {
      ...productInput,
      bundleRequiredProducts: productInput.bundleRequiredProducts.filter(
        (productId)=>String(productId) !== String(existingProduct._id)
      ),
      images: nextImages,
      image: nextImages[0] || null
    })

    await existingProduct.save()

    res.json({
      message: "Product updated successfully.",
      product: mapProduct(existingProduct)
    })
  })
)

adminProductRouter.delete(
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

module.exports = {
  publicProductRouter,
  adminProductRouter
}
