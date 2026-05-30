const productsContainer = document.getElementById("products")
const productCount = document.getElementById("productCount")
const lightbox = document.getElementById("lightbox")
const lightboxImage = document.getElementById("lightboxImage")
const closeLightboxBtn = document.getElementById("closeLightbox")
const prevImageBtn = document.getElementById("prevImage")
const nextImageBtn = document.getElementById("nextImage")
const heroShowcase = document.getElementById("heroShowcase")
const productSearch = document.getElementById("productSearch")
const categoryFilter = document.getElementById("categoryFilter")
const statusFilter = document.getElementById("statusFilter")
const sortFilter = document.getElementById("sortFilter")

const CONTACT_CHANNELS = {
  phone: "tel:+886973424279",
  email: "katietran3011@gmail.com",
  line: "https://line.me/ti/p/TCVn7wKCCy",
  instagram: "https://www.instagram.com/katienrain__/?hl=en"
}

let lightboxImages = []
let lightboxIndex = 0
let searchTimer

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatCurrency(value){
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0)
}

function getProductPrices(product){
  const currentPrice = Number(product.price) || 0
  const originalPrice = Number(product.originalPrice) || currentPrice
  const parsedDiscount = Number(product.discount)
  const discount = Number.isFinite(parsedDiscount)
    ? parsedDiscount
    : (originalPrice > currentPrice ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0)

  return {
    currentPrice,
    originalPrice,
    discount: Math.max(0, Math.min(99, discount))
  }
}

function getProductImages(product){
  if(Array.isArray(product.images) && product.images.length){
    return product.images
  }

  if(product.image){
    return [product.image]
  }

  return ["https://via.placeholder.com/640x480?text=No+Image"]
}

function getBundlePromoText(product){
  const bundleDiscount = Number(product.bundleDiscountAmount) || 0
  const requiredProducts = Array.isArray(product.bundleRequiredProducts)
    ? product.bundleRequiredProducts
    : []
  const requiredNames = requiredProducts.map((item)=>item.name).filter(Boolean)

  if(bundleDiscount <= 0 || !requiredNames.length){
    return ""
  }

  return `Buy with ${requiredNames.join(", ")} to get ${formatCurrency(bundleDiscount)} off this item.`
}

function getStockLabel(product){
  const stock = Number(product.stock) || 0

  if(stock <= 0){
    return { text: "Sold out", className: "sold-out" }
  }

  if(stock <= 3){
    return { text: `${stock} left`, className: "low-stock" }
  }

  return { text: "In stock", className: "in-stock" }
}

function buildProductsUrl(){
  const params = new URLSearchParams()
  const query = productSearch?.value.trim()
  const category = categoryFilter?.value
  const status = statusFilter?.value
  const sort = sortFilter?.value || "featured"

  if(query){
    params.set("q", query)
  }

  if(category){
    params.set("category", category)
  }

  if(status){
    params.set("status", status)
  }

  if(sort){
    params.set("sort", sort)
  }

  const queryString = params.toString()
  return queryString ? `/products?${queryString}` : "/products"
}

function createInquiryHref(product, currentPrice){
  const subject = `Product inquiry: ${product.name || "Product"}`
  const lines = [
    "Hi, I am interested in this product:",
    "",
    `Name: ${product.name || "Product"}`,
    `Price: ${formatCurrency(currentPrice)}`,
    product.category ? `Category: ${product.category}` : "",
    `Shop: ${window.location.origin}/#productsSection`
  ].filter(Boolean)

  return `mailto:${CONTACT_CHANNELS.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`
}

function closeInquiryMenus(){
  document.querySelectorAll(".inquiry-menu.open").forEach((menu)=>{
    const toggle = menu.querySelector(".inquiry-btn")
    const panel = menu.querySelector(".inquiry-panel")
    const card = menu.closest(".product")

    menu.classList.remove("open")
    card?.classList.remove("contact-open")
    toggle?.setAttribute("aria-expanded", "false")
    if(panel){
      panel.hidden = true
    }
  })
}

function toggleInquiryMenu(menu, forceOpen){
  const toggle = menu.querySelector(".inquiry-btn")
  const panel = menu.querySelector(".inquiry-panel")
  const card = menu.closest(".product")
  const shouldOpen = forceOpen ?? !menu.classList.contains("open")

  closeInquiryMenus()

  if(!shouldOpen){
    return
  }

  menu.classList.add("open")
  card?.classList.add("contact-open")
  toggle?.setAttribute("aria-expanded", "true")
  if(panel){
    panel.hidden = false
  }
}

function renderHeroShowcase(products){
  if(!heroShowcase || !Array.isArray(products) || !products.length){
    return
  }

  const featured = products.find((product)=>product.isFeatured && getProductImages(product).length)
    || products.find((product)=>getProductImages(product).length)
    || products[0]
  const images = getProductImages(featured).slice(0, 4)
  const mainImage = images[0]

  heroShowcase.innerHTML = `
    <img class="showcase-main" src="${mainImage}" alt="${escapeHtml(featured.name || "Featured handmade product")}">
    <div class="showcase-thumbs">
      ${images.slice(1, 4).map((image, index)=>`<img src="${image}" alt="Featured product preview ${index + 2}">`).join("")}
    </div>
    <div class="showcase-caption">
      <strong>${escapeHtml(featured.name || "Featured handmade pick")}</strong>
      <span>${featured.isFeatured ? "Featured" : "Just added"}</span>
    </div>
  `
}

function openLightbox(images, startIndex){
  lightboxImages = images
  lightboxIndex = startIndex
  lightboxImage.src = lightboxImages[lightboxIndex]
  lightbox.classList.add("open")
  lightbox.setAttribute("aria-hidden", "false")
}

function closeLightbox(){
  lightbox.classList.remove("open")
  lightbox.setAttribute("aria-hidden", "true")
  lightboxImage.src = ""
  lightboxImages = []
  lightboxIndex = 0
}

function showRelativeImage(step){
  if(!lightboxImages.length){
    return
  }

  lightboxIndex = (lightboxIndex + step + lightboxImages.length) % lightboxImages.length
  lightboxImage.src = lightboxImages[lightboxIndex]
}

function onLightboxImageClick(event){
  if(lightboxImages.length <= 1){
    return
  }

  const rect = lightboxImage.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  showRelativeImage(clickX < rect.width / 2 ? -1 : 1)
}

function createProductCard(product, index){
  const { currentPrice, originalPrice, discount } = getProductPrices(product)
  const images = getProductImages(product)
  const bundlePromoText = getBundlePromoText(product)
  const stockLabel = getStockLabel(product)
  const tags = Array.isArray(product.tags) ? product.tags.slice(0, 3) : []
  let selectedImageIndex = 0

  const card = document.createElement("article")
  card.className = "product"
  card.style.animationDelay = `${index * 60}ms`

  card.innerHTML = `
    <div class="product-media">
      <img src="${images[0]}" alt="${escapeHtml(product.name || "Product")}">
      <div class="product-flags">
        ${product.isFeatured ? '<span class="flag featured">Featured</span>' : ""}
        ${discount > 0 ? `<span class="flag discount">-${discount}%</span>` : ""}
        <span class="flag stock ${stockLabel.className}">${stockLabel.text}</span>
      </div>
    </div>
    <div class="info">
      <div class="product-meta">
        <span>${escapeHtml(product.category || "Uncategorized")}</span>
      </div>
      <h4>${escapeHtml(product.name || "New Product")}</h4>
      <p class="description">${escapeHtml(product.description || "Product description is being updated.")}</p>
      <div class="thumbs"></div>
      ${tags.length ? `<div class="tag-list">${tags.map((tag)=>`<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="prices">
        <span class="price">${formatCurrency(currentPrice)}</span>
        ${originalPrice > currentPrice ? `<span class="old-price">${formatCurrency(originalPrice)}</span>` : ""}
      </div>
      ${bundlePromoText ? `<p class="bundle-promo">${escapeHtml(bundlePromoText)}</p>` : ""}
      <div class="product-actions">
        <button class="buy-btn" type="button">View details</button>
        <div class="inquiry-menu">
          <button class="inquiry-btn" type="button" aria-expanded="false">Ask to buy</button>
          <div class="inquiry-panel" role="menu" hidden>
            <a href="${CONTACT_CHANNELS.phone}" role="menuitem">Phone</a>
            <a href="${createInquiryHref(product, currentPrice)}" role="menuitem">Email</a>
            <a href="${CONTACT_CHANNELS.line}" target="_blank" rel="noreferrer" role="menuitem">Line</a>
            <a href="${CONTACT_CHANNELS.instagram}" target="_blank" rel="noreferrer" role="menuitem">Instagram</a>
          </div>
        </div>
      </div>
    </div>
  `

  const mainImage = card.querySelector(".product-media img")
  const thumbs = card.querySelector(".thumbs")
  const openViewer = ()=>openLightbox(images, selectedImageIndex)

  mainImage.addEventListener("click", openViewer)
  card.querySelector(".buy-btn").addEventListener("click", openViewer)

  const inquiryMenu = card.querySelector(".inquiry-menu")
  const inquiryToggle = card.querySelector(".inquiry-btn")
  const inquiryPanel = card.querySelector(".inquiry-panel")

  inquiryToggle.addEventListener("click", (event)=>{
    event.stopPropagation()
    toggleInquiryMenu(inquiryMenu)
  })

  inquiryPanel.addEventListener("click", (event)=>{
    event.stopPropagation()
    if(event.target.closest("a")){
      closeInquiryMenus()
    }
  })

  images.forEach((image, imageIndex)=>{
    const thumbBtn = document.createElement("button")
    thumbBtn.type = "button"
    thumbBtn.className = `thumb${imageIndex === 0 ? " active" : ""}`
    thumbBtn.innerHTML = `<img src="${image}" alt="Image ${imageIndex + 1} of ${escapeHtml(product.name || "product")}">`

    thumbBtn.addEventListener("click", ()=>{
      selectedImageIndex = imageIndex
      mainImage.src = image
      thumbs.querySelectorAll(".thumb").forEach((btn)=>btn.classList.remove("active"))
      thumbBtn.classList.add("active")
    })

    thumbBtn.addEventListener("dblclick", ()=>openLightbox(images, imageIndex))
    thumbs.appendChild(thumbBtn)
  })

  return card
}

async function loadCategories(){
  if(!categoryFilter){
    return
  }

  try{
    const response = await fetch("/products/meta/categories")
    if(!response.ok){
      throw new Error(`HTTP ${response.status}`)
    }

    const categories = await response.json()
    const currentCategory = categoryFilter.value
    categoryFilter.innerHTML = '<option value="">All categories</option>'
    categories.forEach((category)=>{
      const option = document.createElement("option")
      option.value = category
      option.textContent = category
      categoryFilter.appendChild(option)
    })
    categoryFilter.value = currentCategory
  }catch(error){
    categoryFilter.innerHTML = '<option value="">All categories</option>'
  }
}

async function loadProducts(){
  productsContainer.innerHTML = '<div class="status">Loading products...</div>'

  try{
    const response = await fetch(buildProductsUrl())
    if(!response.ok){
      throw new Error(`HTTP ${response.status}`)
    }

    const products = await response.json()
    productsContainer.innerHTML = ""
    if(productCount){
      productCount.textContent = String(products.length)
    }

    if(!products.length){
      productsContainer.innerHTML = '<div class="status">No products match the current filters.</div>'
      return
    }

    renderHeroShowcase(products)

    products.forEach((product, index)=>{
      productsContainer.appendChild(createProductCard(product, index))
    })
  }catch(error){
    productsContainer.innerHTML = '<div class="status">Unable to load products. Please try again.</div>'
  }
}

function scheduleProductsReload(){
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(loadProducts, 250)
}

loadCategories()
loadProducts()

productSearch?.addEventListener("input", scheduleProductsReload)
categoryFilter?.addEventListener("change", loadProducts)
statusFilter?.addEventListener("change", loadProducts)
sortFilter?.addEventListener("change", loadProducts)

closeLightboxBtn?.addEventListener("click", closeLightbox)
prevImageBtn?.addEventListener("click", ()=>showRelativeImage(-1))
nextImageBtn?.addEventListener("click", ()=>showRelativeImage(1))

lightbox?.addEventListener("click", (event)=>{
  if(event.target === lightbox){
    closeLightbox()
  }
})

lightboxImage?.addEventListener("click", onLightboxImageClick)

document.addEventListener("click", (event)=>{
  if(!event.target.closest(".inquiry-menu")){
    closeInquiryMenus()
  }
})

document.addEventListener("keydown", (event)=>{
  if(event.key === "Escape"){
    closeInquiryMenus()
  }

  if(!lightbox?.classList.contains("open")){
    return
  }

  if(event.key === "Escape"){
    closeLightbox()
  }

  if(event.key === "ArrowLeft"){
    showRelativeImage(-1)
  }

  if(event.key === "ArrowRight"){
    showRelativeImage(1)
  }
})

const revealItems = document.querySelectorAll("[data-reveal]")

if("IntersectionObserver" in window){
  const revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach((entry)=>{
      if(entry.isIntersecting){
        entry.target.classList.add("is-visible")
        revealObserver.unobserve(entry.target)
      }
    })
  }, {
    threshold: 0.15
  })

  revealItems.forEach((item)=>revealObserver.observe(item))
}else{
  revealItems.forEach((item)=>item.classList.add("is-visible"))
}
