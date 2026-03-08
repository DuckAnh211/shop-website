const router = require("express").Router()
const Product = require("../models/Product")

router.get("/", async (req,res)=>{

const products = await Product.find()

res.json(products)

})

module.exports = router