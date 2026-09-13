const productsContainer = document.getElementById("products")
const productCount = document.getElementById("productCount")
const lightbox = document.getElementById("lightbox")
const lightboxImage = document.getElementById("lightboxImage")
const closeLightboxBtn = document.getElementById("closeLightbox")
const prevImageBtn = document.getElementById("prevImage")
const nextImageBtn = document.getElementById("nextImage")
const lightboxTitle = document.getElementById("lightboxTitle")
const lightboxCount = document.getElementById("lightboxCount")
const lightboxThumbs = document.getElementById("lightboxThumbs")
const lightboxHint = document.getElementById("lightboxHint")
const lightboxStage = document.getElementById("lightboxStage")
const heroShowcase = document.getElementById("heroShowcase")
const productSearch = document.getElementById("productSearch")
const categoryFilter = document.getElementById("categoryFilter")
const statusFilter = document.getElementById("statusFilter")
const sortFilter = document.getElementById("sortFilter")
const scrollProgress = document.getElementById("scrollProgress")
const topbar = document.querySelector(".topbar")
const hero = document.querySelector(".hero")
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
const yarnChase = document.getElementById("yarnChase")
const chaseCat = document.getElementById("chaseCat")
const chaseYarn = document.getElementById("chaseYarn")
const chaseYarnImage = document.getElementById("chaseYarnImage")
const chaseToggle = document.getElementById("chaseToggle")

const CONTACT_CHANNELS = {
  phone: "tel:+886973424279",
  email: "katietran3011@gmail.com",
  line: "https://line.me/ti/p/TCVn7wKCCy",
  instagram: "https://www.instagram.com/katienrain__/?hl=en"
}

let lightboxImages = []
let lightboxIndex = 0
let searchTimer
let productsRequest
let productsRequestId = 0
let lightboxTrigger
const resetFilters = document.getElementById("resetFilters")
const filterSummary = document.getElementById("filterSummary")
const productCountLabel = document.getElementById("productCountLabel")

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function createSlug(value){
  return String(value || "product")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product"
}

function getProductUrl(product){
  return `/shop/${encodeURIComponent(product.slug || createSlug(product.name || product._id || "product"))}`
}

function formatCurrency(value, currency = "VND", locale = "vi-VN"){
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "VND" ? 0 : 0,
    maximumFractionDigits: currency === "VND" ? 0 : 0
  }).format(Number(value) || 0)
}

function getProductPrices(product){
  const hasVndPrice = Number(product.priceVnd) > 0 || (Number(product.priceTwd) <= 0 && Number(product.price) > 0)
  const currentPrice = hasVndPrice ? Number(product.priceVnd || product.price) || 0 : 0
  const originalPrice = hasVndPrice ? Number(product.originalPriceVnd || product.originalPrice) || currentPrice : 0
  const currentPriceTwd = Number(product.priceTwd) || 0
  const originalPriceTwd = Number(product.originalPriceTwd) || currentPriceTwd
  const parsedDiscount = Number(product.discount)
  const discountBasePrice = currentPrice || currentPriceTwd
  const discountBaseOriginalPrice = originalPrice || originalPriceTwd
  const discount = Number.isFinite(parsedDiscount)
    ? parsedDiscount
    : (discountBaseOriginalPrice > discountBasePrice ? Math.round(((discountBaseOriginalPrice - discountBasePrice) / discountBaseOriginalPrice) * 100) : 0)

  return {
    currentPrice,
    originalPrice,
    currentPriceTwd,
    originalPriceTwd,
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

  return ["/images/yarn-ball.png"]
}

function getBundlePromoText(product){
  const bundleDiscountVnd = Number(product.bundleDiscountAmountVnd || product.bundleDiscountAmount) || 0
  const bundleDiscountTwd = Number(product.bundleDiscountAmountTwd) || 0
  const requiredProducts = Array.isArray(product.bundleRequiredProducts)
    ? product.bundleRequiredProducts
    : []
  const requiredNames = requiredProducts.map((item)=>item.name).filter(Boolean)

  if((bundleDiscountVnd <= 0 && bundleDiscountTwd <= 0) || !requiredNames.length){
    return ""
  }

  const discountParts = [
    bundleDiscountVnd > 0 ? formatCurrency(bundleDiscountVnd, "VND", "vi-VN") : "",
    bundleDiscountTwd > 0 ? formatCurrency(bundleDiscountTwd, "TWD", "zh-TW") : ""
  ].filter(Boolean)

  return `Buy with ${requiredNames.join(", ")} to get ${discountParts.join(" / ")} off this item.`
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
    currentPrice ? `Vietnam price: ${formatCurrency(currentPrice, "VND", "vi-VN")}` : "",
    product.priceTwd ? `Taiwan price: ${formatCurrency(product.priceTwd, "TWD", "zh-TW")}` : "",
    product.category ? `Category: ${product.category}` : "",
    "Custom style/color requests are welcome.",
    `Shop: ${window.location.origin}${getProductUrl(product)}`
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
    <img class="showcase-main" src="${escapeHtml(mainImage)}" alt="${escapeHtml(featured.name || "Featured handmade product")}" fetchpriority="high" decoding="async">
    <div class="showcase-thumbs">
      ${images.slice(1, 4).map((image, index)=>`
        <button class="showcase-thumb" type="button" data-image="${escapeHtml(image)}" aria-label="Show featured product image ${index + 2}">
          <img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">
        </button>
      `).join("")}
    </div>
    <div class="showcase-caption">
      <div><small>${featured.isFeatured ? "A STUDIO FAVORITE" : "FROM THE STUDIO"}</small><strong>${escapeHtml(featured.name || "Featured handmade pick")}</strong></div>
      <a href="${escapeHtml(getProductUrl(featured))}" aria-label="View ${escapeHtml(featured.name || "featured product")}">↗</a>
    </div>
  `
}

function openLightbox(images, startIndex = 0, productName = "Handmade crochet piece"){
  if(!Array.isArray(images) || !images.length) return
  lightboxTrigger = document.activeElement
  lightboxImages = images
  lightboxIndex = Math.max(0, Math.min(startIndex, images.length - 1))
  lightboxTitle.textContent = productName
  lightboxThumbs.replaceChildren()
  const multipleImages = images.length > 1
  prevImageBtn.hidden = !multipleImages
  nextImageBtn.hidden = !multipleImages
  lightboxThumbs.hidden = !multipleImages
  lightboxHint.hidden = !multipleImages
  lightboxStage.classList.toggle("single-image", !multipleImages)
  if(multipleImages){
    images.forEach((source, index)=>{
      const button = document.createElement("button")
      button.type = "button"
      button.className = "lightbox-thumb"
      button.setAttribute("aria-label", `View image ${index + 1} of ${productName}`)
      const thumbnail = document.createElement("img")
      thumbnail.src = source
      thumbnail.alt = ""
      thumbnail.draggable = false
      button.appendChild(thumbnail)
      button.addEventListener("click", ()=>{
        lightboxIndex = index
        updateLightboxImage()
      })
      lightboxThumbs.appendChild(button)
    })
  }
  lightbox.classList.add("open")
  lightbox.setAttribute("aria-hidden", "false")
  updateLightboxImage()
  document.body.classList.add("lightbox-open")
  document.querySelector(".page-shell").inert = true
  prevImageBtn.disabled = images.length < 2
  nextImageBtn.disabled = images.length < 2
  closeLightboxBtn.focus()
}

function updateLightboxImage(){
  delete lightboxImage.dataset.fallback
  lightboxImage.src = lightboxImages[lightboxIndex]
  lightboxImage.alt = `${lightboxTitle.textContent}, image ${lightboxIndex + 1} of ${lightboxImages.length}`
  lightboxCount.textContent = `${String(lightboxIndex + 1).padStart(2, "0")} / ${String(lightboxImages.length).padStart(2, "0")}`
  lightboxThumbs.querySelectorAll("button").forEach((button, index)=>{
    button.setAttribute("aria-pressed", String(index === lightboxIndex))
  })
  const activeThumb = lightboxThumbs.children[lightboxIndex]
  if(activeThumb){
    lightboxThumbs.scrollTo?.({ left: activeThumb.offsetLeft - lightboxThumbs.clientWidth / 2 + activeThumb.clientWidth / 2, behavior: reduceMotion ? "instant" : "smooth" })
  }
}

function closeLightbox(){
  if(!lightbox.classList.contains("open")) return
  lightbox.classList.remove("open")
  lightbox.setAttribute("aria-hidden", "true")
  lightboxImage.removeAttribute("src")
  lightboxThumbs.replaceChildren()
  document.body.classList.remove("lightbox-open")
  document.querySelector(".page-shell").inert = false
  lightboxTrigger?.focus()
  lightboxImages = []
  lightboxIndex = 0
}

function showRelativeImage(step){
  if(lightboxImages.length < 2){
    return
  }

  lightboxIndex = (lightboxIndex + step + lightboxImages.length) % lightboxImages.length
  updateLightboxImage()
}

function createProductCard(product, index){
  const { currentPrice, originalPrice, currentPriceTwd, originalPriceTwd, discount } = getProductPrices(product)
  const images = getProductImages(product)
  const bundlePromoText = getBundlePromoText(product)
  const stockLabel = getStockLabel(product)
  const tags = Array.isArray(product.tags) ? product.tags.slice(0, 3) : []
  const productUrl = getProductUrl(product)
  const productName = product.name || "New Product"
  let selectedImageIndex = 0

  const card = document.createElement("article")
  card.className = "product"
  card.style.animationDelay = `${Math.min(index * 70, 560)}ms`

  card.innerHTML = `
    <div class="product-media">
      <img src="${escapeHtml(images[0])}" alt="${escapeHtml(`${productName} handmade crochet piece by KaWo Crotchet`)}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async"${index === 0 ? ' fetchpriority="high"' : ""}>
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
      <h4><a href="${escapeHtml(productUrl)}">${escapeHtml(productName)}</a></h4>
      <p class="description">${escapeHtml(product.description || "Product description is being updated.")}</p>
      <p class="custom-note">Yarn colors and finishing details can be customized on request.</p>
      <div class="thumbs"></div>
      ${tags.length ? `<div class="tag-list">${tags.map((tag)=>`<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="prices">
        ${currentPrice > 0 ? `<span class="price">${formatCurrency(currentPrice, "VND", "vi-VN")}</span>` : ""}
        ${originalPrice > currentPrice ? `<span class="old-price">${formatCurrency(originalPrice, "VND", "vi-VN")}</span>` : ""}
        ${currentPriceTwd > 0 ? `<span class="price twd">${formatCurrency(currentPriceTwd, "TWD", "zh-TW")}</span>` : ""}
        ${originalPriceTwd > currentPriceTwd ? `<span class="old-price">${formatCurrency(originalPriceTwd, "TWD", "zh-TW")}</span>` : ""}
      </div>
      ${bundlePromoText ? `<p class="bundle-promo">${escapeHtml(bundlePromoText)}</p>` : ""}
      <div class="product-actions">
        <a class="buy-btn" href="${escapeHtml(productUrl)}">View details</a>
        <div class="inquiry-menu">
          <button class="inquiry-btn" type="button" aria-expanded="false">Ask to buy</button>
          <div class="inquiry-panel" role="menu" hidden>
            <a href="${CONTACT_CHANNELS.phone}" role="menuitem">Phone</a>
            <a href="${escapeHtml(createInquiryHref(product, currentPrice))}" role="menuitem">Email</a>
            <a href="${CONTACT_CHANNELS.line}" target="_blank" rel="noreferrer" role="menuitem">Line</a>
            <a href="${CONTACT_CHANNELS.instagram}" target="_blank" rel="noreferrer" role="menuitem">Instagram</a>
          </div>
        </div>
      </div>
    </div>
  `

  const mainImage = card.querySelector(".product-media img")
  const thumbs = card.querySelector(".thumbs")
  const openViewer = ()=>openLightbox(images, selectedImageIndex, productName)

  mainImage.addEventListener("click", openViewer)
  mainImage.tabIndex = 0
  mainImage.setAttribute("role", "button")
  mainImage.setAttribute("aria-label", `Enlarge ${productName}`)
  mainImage.addEventListener("keydown", (event)=>{
    if(event.key === "Enter" || event.key === " "){
      event.preventDefault()
      openViewer()
    }
  })

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
    thumbBtn.setAttribute("aria-label", `Show image ${imageIndex + 1} of ${productName}`)
    thumbBtn.setAttribute("aria-pressed", String(imageIndex === 0))
    thumbBtn.innerHTML = `<img src="${escapeHtml(image)}" alt="Image ${imageIndex + 1} of ${escapeHtml(product.name || "product")}" loading="lazy" decoding="async">`

    thumbBtn.addEventListener("click", ()=>{
      selectedImageIndex = imageIndex
      mainImage.src = image
      thumbs.querySelectorAll(".thumb").forEach((btn)=>{
        btn.classList.remove("active")
        btn.setAttribute("aria-pressed", "false")
      })
      thumbBtn.classList.add("active")
      thumbBtn.setAttribute("aria-pressed", "true")
    })

    thumbBtn.addEventListener("dblclick", ()=>openLightbox(images, imageIndex, productName))
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
    selectProductCategory(currentCategory)
  }catch(error){
    // Keep an explicitly selected collection usable if category metadata is unavailable.
    const currentCategory = categoryFilter.value
    categoryFilter.innerHTML = '<option value="">All categories</option>'
    selectProductCategory(currentCategory)
  }
}

function selectProductCategory(category){
  if(category && !Array.from(categoryFilter.options).some((option)=>option.value === category)){
    const option = document.createElement("option")
    option.value = category
    option.textContent = category
    categoryFilter.appendChild(option)
  }
  categoryFilter.value = category
}

document.querySelectorAll("[data-category-link]").forEach((link)=>{
  link.addEventListener("click", (event)=>{
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    productSearch.value = ""
    statusFilter.value = ""
    sortFilter.value = "featured"
    selectProductCategory(link.dataset.categoryLink)
    loadProducts()
    document.getElementById("productsSection").scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" })
    productSearch.focus({ preventScroll: true })
  })
})

async function loadProducts(){
  window.clearTimeout(searchTimer)
  productsRequest?.abort()
  productsRequest = new AbortController()
  const requestId = ++productsRequestId
  const hasFilters = Boolean(productSearch?.value.trim() || categoryFilter?.value || statusFilter?.value || sortFilter?.value !== "featured")
  resetFilters.hidden = !hasFilters
  filterSummary.textContent = hasFilters ? "A little closer to your perfect piece." : "Little things, made with a lot of love."
  productsContainer.setAttribute("aria-busy", "true")
  productCount.textContent = "…"
  productCountLabel.textContent = "finding lovely things"
  productsContainer.innerHTML = '<div class="skeleton" aria-hidden="true"></div>'.repeat(3)

  try{
    const response = await fetch(buildProductsUrl(), { signal: productsRequest.signal })
    if(!response.ok){
      throw new Error(`HTTP ${response.status}`)
    }

    const products = await response.json()
    if(requestId !== productsRequestId) return
    if(!Array.isArray(products)) throw new Error("Invalid catalog response")
    productsContainer.innerHTML = ""
    if(productCount){
      productCount.textContent = String(products.length)
      productCountLabel.textContent = products.length === 1 ? "piece to explore" : "pieces to explore"
    }

    if(!products.length){
      productsContainer.innerHTML = hasFilters
        ? '<div class="status"><strong>No little treasures found. Yet.</strong><p>Try another search or clear your filters to explore the collection.</p><button class="status-action" type="button" data-catalog-action="reset">Clear filters</button></div>'
        : '<div class="status"><strong>Something lovely is on its way.</strong><p>New pieces will appear here. In the meantime, we’d love to hear your ideas.</p><a class="status-action" href="contact.html">Ask about a custom piece ↗</a></div>'
      return
    }

    if(!heroShowcase.dataset.loaded){
      renderHeroShowcase(products)
      heroShowcase.dataset.loaded = "true"
    }

    products.forEach((product, index)=>{
      productsContainer.appendChild(createProductCard(product, index))
    })
  }catch(error){
    if(error.name === "AbortError" || requestId !== productsRequestId) return
    productCount.textContent = ""
    productCountLabel.textContent = "Collection temporarily unavailable"
    productsContainer.innerHTML = '<div class="status"><strong>A little pause at the studio.</strong><p>We couldn’t load the collection. Please try again, or <a href="contact.html">get in touch</a> for help finding your piece.</p><button class="status-action" type="button" data-catalog-action="retry">Try again</button></div>'
  }finally{
    if(requestId === productsRequestId) productsContainer.setAttribute("aria-busy", "false")
  }
}

function clearProductFilters(){
  productSearch.value = ""
  categoryFilter.value = ""
  statusFilter.value = ""
  sortFilter.value = "featured"
  productSearch.focus()
  loadProducts()
}

resetFilters?.addEventListener("click", clearProductFilters)
productsContainer.addEventListener("click", (event)=>{
  const action = event.target.closest("[data-catalog-action]")?.dataset.catalogAction
  if(action === "reset") clearProductFilters()
  if(action === "retry") loadProducts()
})

document.addEventListener("error", (event)=>{
  const image = event.target
  if(image.tagName === "IMG" && !image.dataset.fallback){
    image.dataset.fallback = "true"
    image.src = "/images/yarn-ball.png"
  }
}, true)

function scheduleProductsReload(){
  window.clearTimeout(searchTimer)
  productsRequest?.abort()
  productsRequestId++
  searchTimer = window.setTimeout(loadProducts, 250)
}

const initialSearchParams = new URLSearchParams(window.location.search)
if(productSearch && initialSearchParams.has("q")){
  productSearch.value = initialSearchParams.get("q").trim()
}
if(categoryFilter && initialSearchParams.has("category")){
  selectProductCategory(initialSearchParams.get("category").trim())
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

let lightboxTouchStart
lightboxStage?.addEventListener("touchstart", (event)=>{
  lightboxTouchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
}, { passive: true })
lightboxStage?.addEventListener("touchend", (event)=>{
  if(!lightboxTouchStart || !event.changedTouches.length) return
  const dx = event.changedTouches[0].clientX - lightboxTouchStart.x
  const dy = event.changedTouches[0].clientY - lightboxTouchStart.y
  if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && lightboxImages.length > 1){
    showRelativeImage(dx < 0 ? 1 : -1)
  }
  lightboxTouchStart = null
}, { passive: true })
lightboxStage?.addEventListener("touchcancel", ()=>{ lightboxTouchStart = null }, { passive: true })

heroShowcase?.addEventListener("click", (event)=>{
  const thumb = event.target.closest(".showcase-thumb")
  const mainImage = heroShowcase.querySelector(".showcase-main")
  if(!thumb || !mainImage){
    return
  }

  heroShowcase.classList.add("is-switching")
  window.setTimeout(()=>{
    mainImage.src = thumb.dataset.image
    heroShowcase.classList.remove("is-switching")
  }, reduceMotion ? 0 : 180)
})

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

  if(event.key === "Tab"){
    const buttons = Array.from(lightbox.querySelectorAll("button:not(:disabled):not([hidden])"))
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if(event.shiftKey && document.activeElement === first){
      event.preventDefault()
      last.focus()
    }else if(!event.shiftKey && document.activeElement === last){
      event.preventDefault()
      first.focus()
    }
  }

  if(event.key === "ArrowLeft"){
    event.preventDefault()
    showRelativeImage(-1)
  }

  if(event.key === "ArrowRight"){
    event.preventDefault()
    showRelativeImage(1)
  }
})

const revealItems = document.querySelectorAll("[data-reveal]")

revealItems.forEach((item)=>{
  const rect = item.getBoundingClientRect()
  if(rect.top < window.innerHeight && rect.bottom > 0){
    item.classList.add("is-visible")
  }
})

document.documentElement.classList.add("reveal-enabled")

if("IntersectionObserver" in window){
  const revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach((entry)=>{
      if(entry.isIntersecting){
        entry.target.classList.add("is-visible")
        revealObserver.unobserve(entry.target)
      }
    })
  }, {
    rootMargin: "0px 0px -5% 0px",
    threshold: 0
  })

  revealItems.forEach((item)=>revealObserver.observe(item))

  // Never leave content hidden if an embedded browser fails to dispatch intersections.
  window.setTimeout(()=>{
    revealItems.forEach((item)=>item.classList.add("is-visible"))
    revealObserver.disconnect()
  }, 1800)
}else{
  revealItems.forEach((item)=>item.classList.add("is-visible"))
}

let scrollFrame

function updateScrollEffects(){
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  const progress = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0
  scrollProgress?.style.setProperty("transform", `scaleX(${progress})`)
  topbar?.classList.toggle("is-scrolled", window.scrollY > 24)
  scrollFrame = null
}

window.addEventListener("scroll", ()=>{
  if(scrollFrame){
    return
  }

  scrollFrame = window.requestAnimationFrame(updateScrollEffects)
}, { passive: true })

updateScrollEffects()

function readChasePreference(){
  try { return localStorage.getItem("kawoYarnChaseVisible") === "true" }
  catch { return false }
}

function setupYarnChase(){
  if(!yarnChase || !chaseCat || !chaseYarn || !chaseYarnImage || !chaseToggle || reduceMotion){
    return
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)")
  // Directional frames from the MIT-licensed adryd325/oneko.js sprite sheet.
  const spriteSets = {
    idle: [[-3, -3]],
    N: [[-1, -2], [-1, -3]],
    NE: [[0, -2], [0, -3]],
    E: [[-3, 0], [-3, -1]],
    SE: [[-5, -1], [-5, -2]],
    S: [[-6, -3], [-7, -2]],
    SW: [[-5, -3], [-6, -1]],
    W: [[-4, -2], [-4, -3]],
    NW: [[-1, 0], [-1, -1]]
  }
  const state = {
    targetX: window.innerWidth * 0.68,
    targetY: window.innerHeight * 0.7,
    yarnX: window.innerWidth * 0.68,
    yarnY: window.innerHeight * 0.7,
    previousYarnX: window.innerWidth * 0.68,
    previousYarnY: window.innerHeight * 0.7,
    yarnRotation: 0,
    catX: window.innerWidth * 0.2,
    catY: window.innerHeight * 0.72,
    lastInputAt: performance.now(),
    nextAutoMoveAt: 0,
    lastFrameAt: performance.now(),
    lastSpriteAt: 0,
    spriteFrame: 0,
    draggingPointerId: null,
    visible: readChasePreference()
  }

  function setSprite(name){
    const frames = spriteSets[name] || spriteSets.idle
    const sprite = frames[state.spriteFrame % frames.length]
    chaseCat.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`
  }

  function getDirection(deltaX, deltaY){
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI
    if(angle >= -22.5 && angle < 22.5) return "E"
    if(angle >= 22.5 && angle < 67.5) return "SE"
    if(angle >= 67.5 && angle < 112.5) return "S"
    if(angle >= 112.5 && angle < 157.5) return "SW"
    if(angle >= 157.5 || angle < -157.5) return "W"
    if(angle >= -157.5 && angle < -112.5) return "NW"
    if(angle >= -112.5 && angle < -67.5) return "N"
    return "NE"
  }

  function clampTarget(x, y){
    state.targetX = Math.max(28, Math.min(window.innerWidth - 60, x))
    state.targetY = Math.max(76, Math.min(window.innerHeight - 68, y))
  }

  function setRandomTarget(now){
    const marginX = Math.min(70, window.innerWidth * 0.12)
    const topMargin = Math.min(130, window.innerHeight * 0.2)
    clampTarget(
      marginX + Math.random() * Math.max(80, window.innerWidth - marginX * 2),
      topMargin + Math.random() * Math.max(100, window.innerHeight - topMargin - 90)
    )
    state.nextAutoMoveAt = now + 1400 + Math.random() * 1700
  }

  function applyVisibility(){
    yarnChase.classList.toggle("is-hidden", !state.visible)
    chaseToggle.setAttribute("aria-pressed", String(state.visible))
    chaseToggle.setAttribute("aria-label", state.visible ? "Hide cat and yarn animation" : "Show cat and yarn animation")
    chaseToggle.querySelector("b").textContent = state.visible ? "Hide cat" : "Show cat"
  }

  function handlePointer(event){
    if(!state.visible){
      return
    }

    if(event.type === "pointerdown"){
      state.draggingPointerId = event.pointerId
    }

    if(event.pointerType === "mouse" || state.draggingPointerId === event.pointerId){
      clampTarget(event.clientX, event.clientY)
      state.lastInputAt = performance.now()
      state.nextAutoMoveAt = 0
    }
  }

  function animate(now){
    const elapsed = Math.min((now - state.lastFrameAt) / 16.67, 2.5)
    state.lastFrameAt = now

    if(state.visible){
      const isCoarse = coarsePointer.matches
      const idleDelay = isCoarse ? 1800 : 2600
      if(now - state.lastInputAt > idleDelay && (!state.nextAutoMoveAt || now >= state.nextAutoMoveAt)){
        setRandomTarget(now)
      }

      const yarnEase = isCoarse ? 0.055 : 0.11
      state.previousYarnX = state.yarnX
      state.previousYarnY = state.yarnY
      state.yarnX += (state.targetX - state.yarnX) * yarnEase * elapsed
      state.yarnY += (state.targetY - state.yarnY) * yarnEase * elapsed
      const yarnMoveX = state.yarnX - state.previousYarnX
      const yarnMoveY = state.yarnY - state.previousYarnY
      const yarnTravel = Math.hypot(yarnMoveX, yarnMoveY)
      if(yarnTravel > 0.02){
        const rollDirection = Math.abs(yarnMoveX) > 0.04 ? Math.sign(yarnMoveX) : Math.sign(yarnMoveY) || 1
        state.yarnRotation += yarnTravel * 2.2 * rollDirection
      }

      const deltaX = state.yarnX - (state.catX + 16)
      const deltaY = state.yarnY - (state.catY + 16)
      const distance = Math.hypot(deltaX, deltaY)
      const stopDistance = isCoarse ? 70 : 76
      const isRunning = distance > stopDistance

      if(isRunning){
        const speed = Math.min(9.5, Math.max(2.1, distance * 0.04)) * elapsed
        state.catX += deltaX / distance * speed
        state.catY += deltaY / distance * speed
      }

      if(now - state.lastSpriteAt > 100){
        state.lastSpriteAt = now
        state.spriteFrame += 1
        setSprite(isRunning ? getDirection(deltaX, deltaY) : "idle")
      }

      const catScale = isCoarse ? 1.35 : 1.5
      chaseCat.style.translate = `${state.catX}px ${state.catY}px`
      chaseCat.style.scale = String(catScale)
      chaseYarn.style.transform = `translate3d(${state.yarnX - 34}px, ${state.yarnY - 34}px, 0)`
      chaseYarnImage.style.transform = `rotate(${state.yarnRotation}deg)`
    }

    window.requestAnimationFrame(animate)
  }

  document.addEventListener("pointermove", handlePointer, { passive: true })
  document.addEventListener("pointerdown", handlePointer, { passive: true })
  document.addEventListener("pointerup", (event)=>{
    if(state.draggingPointerId === event.pointerId){
      state.draggingPointerId = null
    }
  }, { passive: true })
  document.addEventListener("pointercancel", (event)=>{
    if(state.draggingPointerId === event.pointerId){
      state.draggingPointerId = null
    }
  }, { passive: true })

  window.addEventListener("resize", ()=>{
    clampTarget(state.targetX, state.targetY)
    state.catX = Math.max(0, Math.min(window.innerWidth - 32, state.catX))
    state.catY = Math.max(60, Math.min(window.innerHeight - 42, state.catY))
  }, { passive: true })

  chaseToggle.addEventListener("click", ()=>{
    state.visible = !state.visible
    try { localStorage.setItem("kawoYarnChaseVisible", String(state.visible)) } catch { /* Preference storage is optional. */ }
    if(state.visible){
      state.lastInputAt = performance.now()
    }
    applyVisibility()
  })

  applyVisibility()
  setSprite("idle")
  window.requestAnimationFrame(animate)
}

setupYarnChase()
