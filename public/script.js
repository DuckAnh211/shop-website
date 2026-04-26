const productsContainer = document.getElementById("products")
const productCount = document.getElementById("productCount")
const lightbox = document.getElementById("lightbox")
const lightboxImage = document.getElementById("lightboxImage")
const closeLightboxBtn = document.getElementById("closeLightbox")
const prevImageBtn = document.getElementById("prevImage")
const nextImageBtn = document.getElementById("nextImage")

let lightboxImages = []
let lightboxIndex = 0

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

  const card = document.createElement("article")
  card.className = "product"
  card.style.animationDelay = `${index * 60}ms`

  card.innerHTML = `
    <div class="product-media">
      <img src="${images[0]}" alt="${product.name || "Product"}">
      ${discount > 0 ? `<span class="discount">-${discount}%</span>` : ""}
    </div>
    <div class="info">
      <h4>${product.name || "New Product"}</h4>
      <p class="description">${product.description || "Product description is being updated."}</p>
      <div class="thumbs"></div>
      <div class="prices">
        <span class="price">${formatCurrency(currentPrice)}</span>
        ${originalPrice > currentPrice ? `<span class="old-price">${formatCurrency(originalPrice)}</span>` : ""}
      </div>
      ${bundlePromoText ? `<p class="bundle-promo">${bundlePromoText}</p>` : ""}
      <button class="buy-btn" type="button">View details</button>
    </div>
  `

  const mainImage = card.querySelector(".product-media img")
  const thumbs = card.querySelector(".thumbs")
  const openViewer = ()=>{
    const selectedIndex = images.indexOf(mainImage.src)
    openLightbox(images, selectedIndex >= 0 ? selectedIndex : 0)
  }

  mainImage.addEventListener("click", openViewer)
  card.querySelector(".buy-btn").addEventListener("click", openViewer)

  images.forEach((image, imageIndex)=>{
    const thumbBtn = document.createElement("button")
    thumbBtn.type = "button"
    thumbBtn.className = `thumb${imageIndex === 0 ? " active" : ""}`
    thumbBtn.innerHTML = `<img src="${image}" alt="Image ${imageIndex + 1} of ${product.name || "product"}">`

    thumbBtn.addEventListener("click", ()=>{
      mainImage.src = image
      thumbs.querySelectorAll(".thumb").forEach((btn)=>btn.classList.remove("active"))
      thumbBtn.classList.add("active")
    })

    thumbBtn.addEventListener("dblclick", ()=>openLightbox(images, imageIndex))
    thumbs.appendChild(thumbBtn)
  })

  return card
}

async function loadProducts(){
  productsContainer.innerHTML = '<div class="status">Loading products...</div>'

  try{
    const response = await fetch("/products")
    if(!response.ok){
      throw new Error(`HTTP ${response.status}`)
    }

    const products = await response.json()
    productsContainer.innerHTML = ""
    if(productCount){
      productCount.textContent = String(products.length)
    }

    if(!products.length){
      productsContainer.innerHTML = '<div class="status">No products yet. Add one from the admin page.</div>'
      return
    }

    products.forEach((product, index)=>{
      productsContainer.appendChild(createProductCard(product, index))
    })
  }catch(error){
    productsContainer.innerHTML = '<div class="status">Unable to load products. Please try again.</div>'
  }
}

loadProducts()

closeLightboxBtn?.addEventListener("click", closeLightbox)
prevImageBtn?.addEventListener("click", ()=>showRelativeImage(-1))
nextImageBtn?.addEventListener("click", ()=>showRelativeImage(1))

lightbox?.addEventListener("click", (event)=>{
  if(event.target === lightbox){
    closeLightbox()
  }
})

lightboxImage?.addEventListener("click", onLightboxImageClick)

document.addEventListener("keydown", (event)=>{
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
