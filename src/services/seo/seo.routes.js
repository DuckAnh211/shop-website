const mongoose = require("mongoose")
const seoRouter = require("express").Router()
const env = require("../../shared/config/env")
const asyncHandler = require("../../shared/http/async-handler")
const { connectDatabase } = require("../../shared/db/mongo")
const Product = require("../catalog/product.model")
const { createSlug } = require("../catalog/product.helpers")
const { mapProduct } = require("../catalog/product.mapper")

const SHOP_NAME = "KaWo Crotchet"
const SHOP_EMAIL = "katietran3011@gmail.com"
const SHOP_PHONE = "+886973424279"
const LINE_URL = "https://line.me/ti/p/TCVn7wKCCy"
const INSTAGRAM_URL = "https://www.instagram.com/katienrain__/?hl=en"

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function escapeXml(value){
  return escapeHtml(value)
}

function toSafeJson(value){
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

function stripHtml(value){
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function truncateText(value, maxLength = 155){
  const text = stripHtml(value)
  if(text.length <= maxLength){
    return text
  }

  return `${text.slice(0, maxLength - 1).trim()}...`
}

function absoluteUrl(pathname = "/"){
  const path = String(pathname || "/")
  if(/^https?:\/\//i.test(path)){
    return path
  }

  return `${env.siteUrl}${path.startsWith("/") ? path : `/${path}`}`
}

function getProductPath(product){
  const slug = product.slug || createSlug(product.name || product._id)
  return `/shop/${encodeURIComponent(slug)}`
}

function getProductImages(product){
  const images = Array.isArray(product.images) ? product.images.filter(Boolean) : []
  return images.length ? images : ["/images/yarn-ball.png"]
}

function getPrimaryOffer(product){
  if(Number(product.priceVnd) > 0 || Number(product.price) > 0){
    return {
      price: Number(product.priceVnd || product.price) || 0,
      originalPrice: Number(product.originalPriceVnd || product.originalPrice) || 0,
      currency: "VND",
      locale: "vi-VN"
    }
  }

  return {
    price: Number(product.priceTwd) || 0,
    originalPrice: Number(product.originalPriceTwd) || 0,
    currency: "TWD",
    locale: "zh-TW"
  }
}

function formatMoney(value, currency, locale){
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value) || 0)
}

function createInquiryHref(product, canonicalUrl){
  const offer = getPrimaryOffer(product)
  const subject = `Product inquiry: ${product.name || "Product"}`
  const lines = [
    "Hi, I am interested in this product:",
    "",
    `Name: ${product.name || "Product"}`,
    offer.price > 0 ? `Price: ${formatMoney(offer.price, offer.currency, offer.locale)}` : "",
    product.category ? `Category: ${product.category}` : "",
    `Product page: ${canonicalUrl}`
  ].filter(Boolean)

  return `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`
}

function renderJsonLd(product, canonicalUrl, description, imageUrls){
  const offer = getPrimaryOffer(product)
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    image: imageUrls,
    brand: {
      "@type": "Brand",
      name: SHOP_NAME
    },
    category: product.category || "Handmade crochet",
    sku: String(product._id || product.slug || product.name),
    url: canonicalUrl,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: offer.currency,
      price: offer.price,
      availability: Number(product.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: SHOP_NAME,
        telephone: SHOP_PHONE,
        email: SHOP_EMAIL
      }
    }
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl("/")
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Products",
        item: absoluteUrl("/#productsSection")
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: canonicalUrl
      }
    ]
  }

  return toSafeJson([productJsonLd, breadcrumbJsonLd])
}

function renderProductPage(product){
  const canonicalUrl = absoluteUrl(getProductPath(product))
  const description = truncateText(
    product.description || `Handmade crochet piece from ${SHOP_NAME}, available with custom yarn colors and thoughtful finishing details.`
  )
  const images = getProductImages(product)
  const imageUrls = images.map(absoluteUrl)
  const primaryImage = imageUrls[0]
  const offer = getPrimaryOffer(product)
  const priceText = offer.price > 0 ? formatMoney(offer.price, offer.currency, offer.locale) : "Contact for price"
  const originalPriceText = offer.originalPrice > offer.price
    ? formatMoney(offer.originalPrice, offer.currency, offer.locale)
    : ""
  const stockText = Number(product.stock) > 0 ? "In stock" : "Sold out"
  const tags = Array.isArray(product.tags) ? product.tags.filter(Boolean).slice(0, 8) : []
  const title = `${product.name} | ${SHOP_NAME}`
  const inquiryHref = createInquiryHref(product, canonicalUrl)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<meta property="og:site_name" content="${SHOP_NAME}">
<meta property="og:type" content="product">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:image" content="${escapeHtml(primaryImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(primaryImage)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/secondary-pages.css">
<script type="application/ld+json">${renderJsonLd(product, canonicalUrl, description, imageUrls)}</script>
</head>
<body class="contact-page product-detail-page">
<div class="page-orb left" aria-hidden="true"></div>
<div class="page-orb right" aria-hidden="true"></div>
<div class="page-shell">
  <header class="topbar">
    <a class="brand-lockup" href="/" aria-label="${SHOP_NAME} home">
      <span class="brand-mark yarn-logo" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle cx="23" cy="24" r="14"/><path d="M12 20c8 1 17 5 23 12M15 13c2 9 9 18 20 22M10 27c8-4 18-5 27-1M23 38c8 0 13 3 16 7"/></svg>
      </span>
      <span class="brand">${SHOP_NAME}<small>Handcrafted Collection</small></span>
    </a>
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/contact.html">Contact</a>
      <a href="/login.html">Login</a>
    </nav>
  </header>

  <main class="product-detail">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span>/</span>
      <a href="/#productsSection">Products</a>
      <span>/</span>
      <span>${escapeHtml(product.name)}</span>
    </nav>

    <article class="product-detail-grid">
      <section class="product-gallery" aria-label="${escapeHtml(product.name)} product images">
        <img class="product-hero-image" src="${escapeHtml(primaryImage)}" alt="${escapeHtml(`${product.name} handmade crochet product`)}" width="900" height="900" fetchpriority="high">
        ${imageUrls.length > 1 ? `<div class="product-gallery-strip">
          ${imageUrls.slice(1, 5).map((image, index)=>`<img src="${escapeHtml(image)}" alt="${escapeHtml(`${product.name} detail image ${index + 2}`)}" width="220" height="220" loading="lazy">`).join("")}
        </div>` : ""}
      </section>

      <section class="product-detail-copy">
        <span class="page-eyebrow">${escapeHtml(product.category || "Handmade crochet")}</span>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="product-lead">${escapeHtml(description)}</p>
        <div class="product-price-row">
          <strong>${escapeHtml(priceText)}</strong>
          ${originalPriceText ? `<span>${escapeHtml(originalPriceText)}</span>` : ""}
        </div>
        <p class="product-availability">${escapeHtml(stockText)}${Number(product.stock) > 0 ? `, ${Number(product.stock)} available` : ""}</p>
        ${tags.length ? `<div class="product-tags">${tags.map((tag)=>`<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <p class="product-custom-note">Yarn colors, accents, and finishing details can be customized before ordering.</p>
        <div class="product-contact-actions">
          <a class="primary-action" href="${escapeHtml(inquiryHref)}">Ask by email</a>
          <a href="tel:${SHOP_PHONE.replace(/\s+/g, "")}">Phone</a>
          <a href="${LINE_URL}" target="_blank" rel="noreferrer">Line</a>
          <a href="${INSTAGRAM_URL}" target="_blank" rel="noreferrer">Instagram</a>
        </div>
      </section>
    </article>
  </main>
</div>
</body>
</html>`
}

seoRouter.get("/robots.txt", (req, res)=>{
  res.type("text/plain")
  res.send([
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin.html",
    "Disallow: /login.html",
    "Disallow: /products",
    "Disallow: /health",
    "Disallow: /ready",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    ""
  ].join("\n"))
})

seoRouter.get(
  "/sitemap.xml",
  asyncHandler(async (req, res)=>{
    await connectDatabase()
    const products = await Product.find({ isPublished: { $ne: false } }, "name slug isFeatured updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .limit(5000)

    const urls = [
      { loc: absoluteUrl("/"), changefreq: "daily", priority: "1.0" },
      { loc: absoluteUrl("/contact.html"), changefreq: "monthly", priority: "0.7" },
      ...products.map((product)=>({
        loc: absoluteUrl(getProductPath(product)),
        lastmod: (product.updatedAt || product.createdAt || new Date()).toISOString(),
        changefreq: "weekly",
        priority: product.isFeatured ? "0.9" : "0.8"
      }))
    ]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url)=>`  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : ""}
    <changefreq>${escapeXml(url.changefreq)}</changefreq>
    <priority>${escapeXml(url.priority)}</priority>
  </url>`).join("\n")}
</urlset>
`

    res.type("application/xml")
    res.send(xml)
  })
)

seoRouter.get(
  "/shop/:identifier",
  asyncHandler(async (req, res)=>{
    await connectDatabase()
    const identifier = String(req.params.identifier || "").trim()
    const productFilter = mongoose.Types.ObjectId.isValid(identifier)
      ? { _id: identifier, isPublished: { $ne: false } }
      : { slug: identifier, isPublished: { $ne: false } }
    const product = await Product.findOne(productFilter).populate("bundleRequiredProducts", "name slug")

    if(!product){
      res.status(404).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>Product not found | ${SHOP_NAME}</title></head><body><main><h1>Product not found</h1><p>This handmade piece is no longer available.</p><p><a href="/">Back to ${SHOP_NAME}</a></p></main></body></html>`)
      return
    }

    res.type("html").send(renderProductPage(mapProduct(product)))
  })
)

module.exports = seoRouter
