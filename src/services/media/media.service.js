const { Readable } = require("stream")
const cloudinary = require("../../shared/config/cloudinary")
const env = require("../../shared/config/env")

function uploadBuffer(buffer, originalName){
  return new Promise((resolve, reject)=>{
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: env.cloudinary.folder,
        resource_type: "image",
        public_id: `${Date.now()}-${String(originalName || "image").replace(/[^a-zA-Z0-9-_]/g, "-")}`
      },
      (error, result)=>{
        if(error){
          reject(error)
          return
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id
        })
      }
    )

    Readable.from(buffer).pipe(uploadStream)
  })
}

async function uploadImages(files){
  return Promise.all((files || []).map((file)=>uploadBuffer(file.buffer, file.originalname)))
}

async function deleteImages(images){
  const publicIds = (images || [])
    .map((image)=>typeof image === "string" ? "" : image.publicId)
    .filter(Boolean)

  if(!publicIds.length){
    return
  }

  await cloudinary.api.delete_resources(publicIds)
}

module.exports = {
  uploadImages,
  deleteImages
}
