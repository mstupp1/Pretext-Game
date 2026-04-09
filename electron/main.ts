import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDevelopment = !app.isPackaged
const developmentServerUrl = 'http://localhost:5173'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function loadDevelopmentServer(window: BrowserWindow): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await window.loadURL(developmentServerUrl)
      return
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }

  throw lastError
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    title: 'Lexicon Crossing',
    width: 1280,
    height: 920,
    minWidth: 1040,
    minHeight: 760,
    center: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#17110d',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  if (isDevelopment) {
    await loadDevelopmentServer(window)
  } else {
    const indexPath = path.join(__dirname, '..', 'dist-desktop', 'index.html')
    await window.loadFile(indexPath)
  }

  return window
}

app.whenReady().then(async () => {
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })
}).catch((error: unknown) => {
  console.error('Failed to start Electron shell:', error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
