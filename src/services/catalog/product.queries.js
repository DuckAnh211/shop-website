const { escapeRegExp } = require("./product.helpers")

function buildProductFilter(query, options = {}){
  const filter = {}

  if(!options.includeUnpublished){
    filter.isPublished = { $ne: false }
  }

  if(query.q){
    const searchPattern = new RegExp(escapeRegExp(query.q), "i")
    filter.$or = [
      { name: searchPattern },
      { description: searchPattern },
      { category: searchPattern },
      { tags: searchPattern }
    ]
  }

  if(query.category){
    filter.category = new RegExp(`^${escapeRegExp(query.category)}$`, "i")
  }

  if(query.tag){
    filter.tags = new RegExp(`^${escapeRegExp(query.tag)}$`, "i")
  }

  if(query.status === "in-stock"){
    filter.stock = { $gt: 0 }
  }

  if(query.status === "sale"){
    filter.discount = { $gt: 0 }
  }

  if(query.status === "featured"){
    filter.isFeatured = true
  }

  return filter
}

function buildProductSort(sort){
  switch(sort){
    case "price-asc":
      return { price: 1, createdAt: -1 }
    case "price-desc":
      return { price: -1, createdAt: -1 }
    case "discount":
      return { discount: -1, createdAt: -1 }
    case "featured":
      return { isFeatured: -1, createdAt: -1 }
    case "name":
      return { name: 1 }
    case "newest":
    default:
      return { createdAt: -1 }
  }
}

function parseLimit(value, fallback = 100){
  const parsedValue = Number(value)
  if(!Number.isFinite(parsedValue) || parsedValue <= 0){
    return fallback
  }

  return Math.min(Math.floor(parsedValue), 200)
}

module.exports = {
  buildProductFilter,
  buildProductSort,
  parseLimit
}
