// Renders an HTML file to a PNG at phone size: npx electron scripts/render-html.cjs in.html out.png [w] [h]
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('render-html.cjs')) + 1)
const [input, output, w = '390', h = '844'] = args
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false })
  await win.loadFile(input)
  await new Promise((r) => setTimeout(r, 300))
  fs.writeFileSync(output, (await win.webContents.capturePage()).toPNG())
  app.exit(0)
})
setTimeout(() => app.exit(1), 15000)
