const router = require("express").Router()
const env = require("../../shared/config/env")
const asyncHandler = require("../../shared/http/async-handler")
const { createAdminToken } = require("../../shared/auth/admin-auth")

router.post(
  "/login",
  asyncHandler(async (req, res)=>{
    const username = String(req.body.username || "").trim()
    const password = String(req.body.password || "")

    if(username !== env.adminUsername || password !== env.adminPassword){
      return res.status(401).json({ message: "Invalid username or password." })
    }

    return res.json({
      success: true,
      token: createAdminToken()
    })
  })
)

module.exports = router
