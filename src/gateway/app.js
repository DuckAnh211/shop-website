const express = require("express")
const path = require("path")
const cors = require("cors")
const env = require("../shared/config/env")
const { connectDatabase } = require("../shared/db/mongo")
const authRoutes = require("../services/auth/auth.routes")
const { publicProductRouter, adminProductRouter } = require("../services/catalog/product.routes")
const { notFoundHandler, errorHandler } = require("../shared/http/error-handler")

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
  res.json({
    status: "ok",
    services: ["gateway", "auth", "catalog", "media"]
  })
})

app.get("/ready", async (req, res)=>{
  await connectDatabase()
  res.json({
    status: "ready",
    services: ["gateway", "auth", "catalog", "media"]
  })
})

app.use("/admin", authRoutes)
app.use("/products", publicProductRouter)
app.use("/admin", adminProductRouter)

const publicDirectory = path.join(__dirname, "..", "..", "public")
app.use(express.static(publicDirectory))

app.get("/admin", (req, res)=>{
  res.sendFile(path.join(publicDirectory, "admin.html"))
})

app.use((req, res, next)=>{
  if(
    req.method !== "GET" ||
    req.path.startsWith("/api/") ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/products") ||
    req.path === "/health" ||
    req.path === "/ready"
  ){
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
