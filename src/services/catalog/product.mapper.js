const { createSlug } = require("./product.helpers")

function normalizeImage(image){
  if(!image){
    return null
  }

  if(typeof image === "string"){
    return { url: image, publicId: "" }
  }

  return {
    url: image.url || "",
    publicId: image.publicId || ""
  }
}

function normalizeBundleProduct(product){
  if(!product){
    return null
  }

  if(typeof product === "string"){
    return { _id: product, name: "" }
  }

  const id = product._id || product
  return {
    _id: String(id),
    name: product.name || ""
  }
}

function mapProduct(productDocument){
  const product = productDocument.toObject ? productDocument.toObject() : productDocument
  const normalizedImages = Array.isArray(product.images)
    ? product.images.map(normalizeImage).filter((image)=>image && image.url)
    : []

  const fallbackImage = normalizeImage(product.image)
  const images = normalizedImages.length ? normalizedImages : (fallbackImage?.url ? [fallbackImage] : [])
  const tags = Array.isArray(product.tags)
    ? product.tags.map((tag)=>String(tag).trim()).filter(Boolean)
    : []

  return {
    ...product,
    slug: product.slug || createSlug(product.name || product._id),
    category: product.category || "Uncategorized",
    tags,
    price: Number(product.priceVnd) > 0 ? Number(product.priceVnd) : Number(product.price) || 0,
    originalPrice: Number(product.originalPriceVnd) > 0
      ? Number(product.originalPriceVnd)
      : Number(product.originalPrice) || Number(product.priceVnd) || Number(product.price) || 0,
    priceVnd: Number(product.priceVnd) || 0,
    originalPriceVnd: Number(product.originalPriceVnd) || 0,
    priceTwd: Number(product.priceTwd) || 0,
    originalPriceTwd: Number(product.originalPriceTwd) || 0,
    stock: Math.max(0, Number(product.stock) || 0),
    isPublished: product.isPublished !== false,
    isFeatured: Boolean(product.isFeatured),
    image: images[0]?.url || "",
    images: images.map((item)=>item.url),
    imageObjects: images,
    bundleDiscountAmount: Number(product.bundleDiscountAmount) || 0,
    bundleDiscountAmountVnd: Number(product.bundleDiscountAmountVnd) || 0,
    bundleDiscountAmountTwd: Number(product.bundleDiscountAmountTwd) || 0,
    bundleRequiredProducts: Array.isArray(product.bundleRequiredProducts)
      ? product.bundleRequiredProducts.map(normalizeBundleProduct).filter(Boolean)
      : []
  }
}

module.exports = {
  mapProduct
}
