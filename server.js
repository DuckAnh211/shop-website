const { app, connectDatabase } = require("./app")
const env = require("./src/shared/config/env")

async function startServer(){
  app.listen(env.port, ()=>{
    console.log(`Server running at http://localhost:${env.port}`)
  })

  connectDatabase()
    .then(()=>console.log("Database connected."))
    .catch((error)=>{
      console.error("Database connection failed. Server remains online for static pages.", error.message)
    })
}

startServer().catch((error)=>{
  console.error("Failed to start server", error)
  process.exit(1)
})
