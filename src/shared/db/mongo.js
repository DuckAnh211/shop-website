const mongoose = require("mongoose")
const env = require("../config/env")

let connectionPromise

async function connectDatabase(){
  env.requireConfigured(env.mongodbUri, "MONGODB_URI")

  if(mongoose.connection.readyState === 1){
    return mongoose.connection
  }

  if(connectionPromise){
    return connectionPromise
  }

  connectionPromise = mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10000
  }).catch((error)=>{
    connectionPromise = null
    throw error
  })

  return connectionPromise
}

function isDatabaseConnected(){
  return mongoose.connection.readyState === 1
}

module.exports = {
  connectDatabase,
  isDatabaseConnected
}
