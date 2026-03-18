function parseNumber(value, fallback = 0){
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function computeDiscount(price, originalPrice, discount){
  let safeDiscount = Number(discount)

  if(!Number.isFinite(safeDiscount)){
    if(originalPrice > 0 && originalPrice > price){
      safeDiscount = Math.round(((originalPrice - price) / originalPrice) * 100)
    }else{
      safeDiscount = 0
    }
  }

  return Math.max(0, Math.min(99, safeDiscount))
}

function validateAndBuildProductInput(payload, fallbackValues = {}){
  const name = String(payload.name ?? fallbackValues.name ?? "").trim()
  const description = String(payload.description ?? fallbackValues.description ?? "").trim()
  const price = parseNumber(payload.price, parseNumber(fallbackValues.price, 0))
  const originalPrice = parseNumber(payload.originalPrice, parseNumber(fallbackValues.originalPrice, price))
  const discount = computeDiscount(price, originalPrice, payload.discount ?? fallbackValues.discount)

  if(!name){
    const error = new Error("Product name is required.")
    error.statusCode = 400
    throw error
  }

  if(price < 0 || originalPrice < 0){
    const error = new Error("Prices must be zero or greater.")
    error.statusCode = 400
    throw error
  }

  if(originalPrice > 0 && price > originalPrice){
    const error = new Error("Selling price cannot be greater than original price.")
    error.statusCode = 400
    throw error
  }

  return {
    name,
    description,
    price,
    originalPrice,
    discount
  }
}

module.exports = {
  validateAndBuildProductInput
}
