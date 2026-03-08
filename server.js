const express = require("express")
const mongoose = require("mongoose")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const Product = require("./models/Product")

const app = express()
const Admin = mongoose.model("Admin",{

username:String,
password:String

})
app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.post("/admin/login", async(req,res)=>{

const {username,password} = req.body

const admin = await Admin.findOne({username,password})

if(admin){

res.json({success:true})

}else{

res.json({success:false})

}

})

// cho frontend truy cập ảnh
app.use("/uploads", express.static("uploads"))

// cho frontend truy cập file html
app.use(express.static(path.join(__dirname,"public")))


// KẾT NỐI DATABASE
mongoose.connect("mongodb://127.0.0.1:27017/shop")
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err))


// CẤU HÌNH UPLOAD
const storage = multer.diskStorage({

destination:(req,file,cb)=>{
cb(null,"uploads")
},

filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname)
}

})

const upload = multer({storage})

async function removeUploadedFiles(fileNames){
const uniqueNames = [...new Set((fileNames || []).filter(Boolean))]

await Promise.all(uniqueNames.map(async(fileName)=>{
try{
await fs.promises.unlink(path.join(__dirname,"uploads",fileName))
}catch(err){
if(err.code !== "ENOENT"){
console.error("Cannot remove file",fileName,err.message)
}
}
}))
}


// ADMIN THÊM SẢN PHẨM
app.post("/admin/add-product", upload.array("images", 10), async(req,res)=>{

try{

if(!req.files || !req.files.length){
return res.status(400).json({message:"Vui long chon it nhat 1 anh san pham"})
}

const parsedPrice = Number(req.body.price)
const parsedOriginalPrice = Number(req.body.originalPrice)
const safePrice = Number.isFinite(parsedPrice) ? parsedPrice : 0
const safeOriginalPrice = Number.isFinite(parsedOriginalPrice) ? parsedOriginalPrice : safePrice
let safeDiscount = Number(req.body.discount)

if(!Number.isFinite(safeDiscount)){
if(safeOriginalPrice > 0 && safeOriginalPrice > safePrice){
safeDiscount = Math.round(((safeOriginalPrice - safePrice) / safeOriginalPrice) * 100)
}else{
safeDiscount = 0
}
}

safeDiscount = Math.max(0, Math.min(99, safeDiscount))

const uploadedImages = req.files.map(file=>file.filename)

const product = new Product({

name:(req.body.name || "").trim(),
price:safePrice,
originalPrice:safeOriginalPrice,
discount:safeDiscount,
description:(req.body.description || "").trim(),
image:uploadedImages[0] || "",
images:uploadedImages

})

await product.save()

res.json({message:"Product added", product})

}catch(err){

res.status(500).json(err)

}

})


// API LẤY DANH SÁCH SẢN PHẨM
app.get("/products", async(req,res)=>{

const products = await Product.find()

res.json(products)

})


// SERVER
app.listen(3000,()=>{
console.log("Server running at http://localhost:3000")
})

app.put("/admin/products/:id", upload.array("images", 10), async(req,res)=>{
try{
const existingProduct = await Product.findById(req.params.id)
if(!existingProduct){
await removeUploadedFiles((req.files || []).map(file=>file.filename))
return res.status(404).json({message:"Khong tim thay san pham"})
}

const parsedPrice = Number(req.body.price)
const parsedOriginalPrice = Number(req.body.originalPrice)
const safePrice = Number.isFinite(parsedPrice) ? parsedPrice : existingProduct.price
const safeOriginalPrice = Number.isFinite(parsedOriginalPrice) ? parsedOriginalPrice : (existingProduct.originalPrice || safePrice)

let safeDiscount = Number(req.body.discount)
if(!Number.isFinite(safeDiscount)){
if(safeOriginalPrice > 0 && safeOriginalPrice > safePrice){
safeDiscount = Math.round(((safeOriginalPrice - safePrice) / safeOriginalPrice) * 100)
}else{
safeDiscount = 0
}
}
safeDiscount = Math.max(0, Math.min(99, safeDiscount))

const oldImages = (existingProduct.images && existingProduct.images.length)
? existingProduct.images
: (existingProduct.image ? [existingProduct.image] : [])

const newImages = (req.files || []).map(file=>file.filename)
const nextImages = newImages.length ? newImages : oldImages

if(newImages.length){
await removeUploadedFiles(oldImages)
}

existingProduct.name = (req.body.name || existingProduct.name || "").trim()
existingProduct.price = safePrice
existingProduct.originalPrice = safeOriginalPrice
existingProduct.discount = safeDiscount
existingProduct.description = (req.body.description || existingProduct.description || "").trim()
existingProduct.images = nextImages
existingProduct.image = nextImages[0] || ""

await existingProduct.save()
res.json({message:"Product updated", product:existingProduct})
}catch(err){
res.status(500).json({message:"Cap nhat san pham that bai"})
}
})

app.delete("/admin/products/:id", async(req,res)=>{
try{
const existingProduct = await Product.findById(req.params.id)
if(!existingProduct){
return res.status(404).json({message:"Khong tim thay san pham"})
}

const productImages = (existingProduct.images && existingProduct.images.length)
? existingProduct.images
: (existingProduct.image ? [existingProduct.image] : [])

await existingProduct.deleteOne()
await removeUploadedFiles(productImages)

res.json({message:"Product deleted"})
}catch(err){
res.status(500).json({message:"Xoa san pham that bai"})
}
})