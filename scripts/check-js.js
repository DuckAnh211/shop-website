const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const ignoredDirectories = new Set([".git", "node_modules", ".vercel"])
const files = []

function collectJavaScriptFiles(directory){
  for(const entry of fs.readdirSync(directory, { withFileTypes: true })){
    if(entry.isDirectory()){
      if(!ignoredDirectories.has(entry.name)){
        collectJavaScriptFiles(path.join(directory, entry.name))
      }
      continue
    }

    if(entry.isFile() && entry.name.endsWith(".js")){
      files.push(path.join(directory, entry.name))
    }
  }
}

collectJavaScriptFiles(root)

for(const file of files){
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  })

  if(result.status !== 0){
    process.exit(result.status || 1)
  }
}

console.log(`Checked ${files.length} JavaScript files.`)
