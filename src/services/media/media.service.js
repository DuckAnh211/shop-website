const crypto = require("crypto")
const { DeleteObjectsCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3")
const env = require("../../shared/config/env")

const s3 = new S3Client({
  region: env.aws.region
})

function trimSlashes(value){
  return String(value || "").replace(/^\/+|\/+$/g, "")
}

function sanitizeFileName(value){
  return String(value || "image")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
}

function createObjectKey(originalName){
  const prefix = trimSlashes(env.aws.s3.keyPrefix)
  const fileName = sanitizeFileName(originalName)
  const key = `${Date.now()}-${crypto.randomUUID()}-${fileName}`

  return prefix ? `${prefix}/${key}` : key
}

function requireS3Bucket(){
  return env.requireConfigured(env.aws.s3.bucket, "AWS_S3_BUCKET")
}

function createPublicUrl(key){
  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  const baseUrl = String(env.aws.s3.publicBaseUrl || "").replace(/\/+$/g, "")

  if(baseUrl){
    return `${baseUrl}/${encodedKey}`
  }

  return `https://${requireS3Bucket()}.s3.${env.aws.region}.amazonaws.com/${encodedKey}`
}

async function uploadFile(file){
  const bucket = requireS3Bucket()
  const key = createObjectKey(file.originalname)

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream",
    CacheControl: "public, max-age=31536000, immutable"
  }))

  return {
    url: createPublicUrl(key),
    publicId: key
  }
}

async function uploadImages(files){
  return Promise.all((files || []).map(uploadFile))
}

async function deleteImages(images){
  const keys = (images || [])
    .map((image)=>typeof image === "string" ? "" : image.publicId)
    .filter(Boolean)

  if(!keys.length){
    return
  }

  const bucket = requireS3Bucket()

  await s3.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: keys.map((key)=>({ Key: key })),
      Quiet: true
    }
  }))
}

module.exports = {
  uploadImages,
  deleteImages
}
