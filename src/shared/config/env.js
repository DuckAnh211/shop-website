const path = require("path")
const dotenv = require("dotenv")

dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env"), quiet: true })

const port = Number(process.env.PORT) || 3000

function readEnv(name, fallback = ""){
  const value = process.env[name] ?? fallback
  return String(value).trim()
}

function requireConfigured(value, name){
  if(String(value || "").trim()){
    return String(value).trim()
  }

  const error = new Error(`Missing required environment variable: ${name}`)
  error.statusCode = 503
  throw error
}

function normalizeSiteUrl(value){
  const trimmedValue = String(value || "").trim()
  if(!trimmedValue || trimmedValue === "*"){
    return ""
  }

  return trimmedValue.replace(/\/+$/, "")
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  siteUrl: normalizeSiteUrl(process.env.SITE_URL || process.env.PUBLIC_SITE_URL) || `http://localhost:${port}`,
  mongodbUri: readEnv("MONGODB_URI"),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwtSecret: readEnv("JWT_SECRET"),
  adminUsername: readEnv("ADMIN_USERNAME"),
  adminPassword: readEnv("ADMIN_PASSWORD"),
  requireConfigured,
  aws: {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-1",
    s3: {
      bucket: readEnv("AWS_S3_BUCKET"),
      keyPrefix: process.env.AWS_S3_KEY_PREFIX || "shop-website/products",
      publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || ""
    }
  }
}
