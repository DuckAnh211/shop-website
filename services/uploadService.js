const multer = require("multer")

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 5 * 1024 * 1024
  },
  fileFilter(req, file, cb){
    if(!file.mimetype || !file.mimetype.startsWith("image/")){
      cb(new Error("Only image uploads are allowed."))
      return
    }

    cb(null, true)
  }
})

module.exports = upload
