const express = require("express")
const path = require("path")
const cors = require("cors")
const { connectDatabase } = require("./config/db")
const env = require("./config/env")
const adminRoutes = require("./routes/admin")
const productRoutes = require("./routes/products")
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler")

const app = express()

app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
    credentials: false
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get("/health", async (req, res)=>{
  await connectDatabase()
  res.json({ status: "ok" })
})

app.use("/admin", adminRoutes)
app.use("/products", productRoutes)

const publicDirectory = path.join(__dirname, "public")
app.use(express.static(publicDirectory))

app.get("/admin", (req, res)=>{
  res.sendFile(path.join(publicDirectory, "admin.html"))
})

app.use((req, res, next)=>{
  if(req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/admin") || req.path.startsWith("/products") || req.path === "/health"){
    next()
    return
  }

  res.sendFile(path.join(publicDirectory, "index.html"))
})

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = {
  app,
  connectDatabase
}
