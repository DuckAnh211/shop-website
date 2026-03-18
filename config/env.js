const path = require("path")
const dotenv = require("dotenv")

dotenv.config({ path: path.join(__dirname, "..", ".env") })

function requireEnv(name, fallback){
  const value = process.env[name] ?? fallback
  if(value === undefined || value === null || String(value).trim() === ""){
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(value).trim()
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
  mongodbUri: requireEnv("MONGODB_URI"),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwtSecret: requireEnv("JWT_SECRET"),
  adminUsername: requireEnv("ADMIN_USERNAME"),
  adminPassword: requireEnv("ADMIN_PASSWORD"),
  cloudinary: {
    cloudName: requireEnv("CLOUDINARY_CLOUD_NAME"),
    apiKey: requireEnv("CLOUDINARY_API_KEY"),
    apiSecret: requireEnv("CLOUDINARY_API_SECRET"),
    folder: process.env.CLOUDINARY_FOLDER || "shop-website/products"
  }
}
