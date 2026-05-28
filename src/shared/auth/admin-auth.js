const jwt = require("jsonwebtoken")
const env = require("../config/env")

function createAdminToken(){
  return jwt.sign({ role: "admin" }, env.jwtSecret, { expiresIn: "7d" })
}

function authenticateAdmin(req, res, next){
  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if(!token){
    return res.status(401).json({ message: "Admin authentication required." })
  }

  try{
    req.admin = jwt.verify(token, env.jwtSecret)
    next()
  }catch(error){
    return res.status(401).json({ message: "Invalid or expired admin token." })
  }
}

module.exports = {
  authenticateAdmin,
  createAdminToken
}
