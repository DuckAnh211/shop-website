const mongoose = require("mongoose")
const env = require("../config/env")

let connectionPromise

async function connectDatabase(){
  if(connectionPromise){
    return connectionPromise
  }

  connectionPromise = mongoose.connect(env.mongodbUri)
  return connectionPromise
}

module.exports = { connectDatabase }
