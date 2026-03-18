const { app, connectDatabase } = require("../app")

module.exports = async (req, res) => {
  await connectDatabase()
  return app(req, res)
}
