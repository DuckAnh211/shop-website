const mongoose = require("mongoose")
const { createSlug } = require("./product.helpers")

function parseNumber(value, fallback = 0){
  if(value === undefined || value === null || String(value).trim() === ""){
    return fallback
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function computeDiscount(price, originalPrice, discount){
  let safeDiscount = Number(discount)

  if(discount === undefined || discount === null || String(discount).trim() === "" || !Number.isFinite(safeDiscount)){
    if(originalPrice > 0 && originalPrice > price){
      safeDiscount = Math.round(((originalPrice - price) / originalPrice) * 100)
    }else{
      safeDiscount = 0
    }
  }

  return Math.max(0, Math.min(99, safeDiscount))
}

function pickPrimaryPrice(vndPrice, twdPrice, legacyPrice){
  if(vndPrice > 0){
    return vndPrice
  }

  if(twdPrice > 0){
    return twdPrice
  }

  return legacyPrice
}

function parseBoolean(value, fallback = false){
  if(value === undefined || value === null || String(value).trim() === ""){
    return Boolean(fallback)
  }

  if(typeof value === "boolean"){
    return value
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase())
}

function parseStringList(value){
  if(!value){
    return []
  }

  const rawValues = Array.isArray(value)
    ? value
    : String(value).split(",")

  return [...new Set(
    rawValues
      .map((item)=>String(item).trim())
      .filter(Boolean)
  )]
}

function parseProductIds(value){
  return parseStringList(value).filter((item)=>mongoose.Types.ObjectId.isValid(item))
}

function validateAndBuildProductInput(payload, fallbackValues = {}){
  const name = String(payload.name ?? fallbackValues.name ?? "").trim()
  const description = String(payload.description ?? fallbackValues.description ?? "").trim()
  const category = String(payload.category ?? fallbackValues.category ?? "Uncategorized").trim() || "Uncategorized"
  const tags = parseStringList(payload.tags ?? fallbackValues.tags)
  const priceVnd = parseNumber(payload.priceVnd, parseNumber(fallbackValues.priceVnd, 0))
  const originalPriceVnd = parseNumber(
    payload.originalPriceVnd,
    parseNumber(fallbackValues.originalPriceVnd, priceVnd)
  )
  const priceTwd = parseNumber(payload.priceTwd, parseNumber(fallbackValues.priceTwd, 0))
  const originalPriceTwd = parseNumber(
    payload.originalPriceTwd,
    parseNumber(fallbackValues.originalPriceTwd, priceTwd)
  )
  const legacyPrice = parseNumber(payload.price, parseNumber(fallbackValues.price, 0))
  const legacyOriginalPrice = parseNumber(payload.originalPrice, parseNumber(fallbackValues.originalPrice, legacyPrice))
  const price = pickPrimaryPrice(priceVnd, priceTwd, legacyPrice)
  const originalPrice = pickPrimaryPrice(originalPriceVnd, originalPriceTwd, legacyOriginalPrice || price)
  const discount = computeDiscount(price, originalPrice, payload.discount ?? fallbackValues.discount)
  const bundleDiscountAmountVnd = parseNumber(
    payload.bundleDiscountAmountVnd,
    parseNumber(fallbackValues.bundleDiscountAmountVnd, 0)
  )
  const bundleDiscountAmountTwd = parseNumber(
    payload.bundleDiscountAmountTwd,
    parseNumber(fallbackValues.bundleDiscountAmountTwd, 0)
  )
  const bundleDiscountAmount = bundleDiscountAmountVnd > 0
    ? bundleDiscountAmountVnd
    : (bundleDiscountAmountTwd > 0
      ? bundleDiscountAmountTwd
      : parseNumber(payload.bundleDiscountAmount, parseNumber(fallbackValues.bundleDiscountAmount, 0)))
  const bundleRequiredProducts = parseProductIds(
    payload.bundleRequiredProducts ?? fallbackValues.bundleRequiredProducts
  )
  const stock = Math.max(0, Math.floor(parseNumber(payload.stock, parseNumber(fallbackValues.stock, 0))))
  const isPublished = parseBoolean(payload.isPublished, fallbackValues.isPublished !== false)
  const isFeatured = parseBoolean(payload.isFeatured, fallbackValues.isFeatured === true)
  const slug = createSlug(payload.slug || fallbackValues.slug || name)

  if(!name){
    const error = new Error("Product name is required.")
    error.statusCode = 400
    throw error
  }

  if(price < 0 || originalPrice < 0 || priceVnd < 0 || originalPriceVnd < 0 || priceTwd < 0 || originalPriceTwd < 0){
    const error = new Error("Prices must be zero or greater.")
    error.statusCode = 400
    throw error
  }

  if(priceVnd <= 0 && priceTwd <= 0 && legacyPrice <= 0){
    const error = new Error("Enter at least one selling price.")
    error.statusCode = 400
    throw error
  }

  if(originalPrice > 0 && price > originalPrice){
    const error = new Error("Selling price cannot be greater than original price.")
    error.statusCode = 400
    throw error
  }

  if(originalPriceVnd > 0 && priceVnd > originalPriceVnd){
    const error = new Error("VND selling price cannot be greater than VND original price.")
    error.statusCode = 400
    throw error
  }

  if(originalPriceTwd > 0 && priceTwd > originalPriceTwd){
    const error = new Error("TWD selling price cannot be greater than TWD original price.")
    error.statusCode = 400
    throw error
  }

  if(bundleDiscountAmount < 0 || bundleDiscountAmountVnd < 0 || bundleDiscountAmountTwd < 0){
    const error = new Error("Bundle discount amount must be zero or greater.")
    error.statusCode = 400
    throw error
  }

  if(bundleDiscountAmountVnd > priceVnd || bundleDiscountAmountTwd > priceTwd || bundleDiscountAmount > price){
    const error = new Error("Bundle discount amount cannot be greater than selling price.")
    error.statusCode = 400
    throw error
  }

  if(bundleDiscountAmount > 0 && !bundleRequiredProducts.length){
    const error = new Error("Choose at least one product for the bundle discount.")
    error.statusCode = 400
    throw error
  }

  return {
    name,
    slug,
    description,
    category,
    tags,
    price,
    originalPrice,
    priceVnd,
    originalPriceVnd,
    priceTwd,
    originalPriceTwd,
    discount,
    bundleDiscountAmount,
    bundleDiscountAmountVnd,
    bundleDiscountAmountTwd,
    bundleRequiredProducts,
    stock,
    isPublished,
    isFeatured
  }
}

module.exports = {
  validateAndBuildProductInput
}
