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

function mapProduct(productDocument){
  const product = productDocument.toObject ? productDocument.toObject() : productDocument
  const normalizedImages = Array.isArray(product.images)
    ? product.images.map(normalizeImage).filter((image)=>image && image.url)
    : []

  const fallbackImage = normalizeImage(product.image)
  const images = normalizedImages.length ? normalizedImages : (fallbackImage?.url ? [fallbackImage] : [])

  return {
    ...product,
    image: images[0]?.url || "",
    images: images.map((item)=>item.url),
    imageObjects: images
  }
}

module.exports = {
  mapProduct
}
