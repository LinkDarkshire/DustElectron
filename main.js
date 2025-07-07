const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createMainWindow } = require('./modules/window-manager');
const { registerHandlers } = require('./modules/ipc-handlers');
const { ensureDirectories } = require('./modules/file-manager');
const NetworkManager = require('./modules/network-manager');
const DLSiteClient = require('./platforms/dlsite-api');

// Erstelle NetworkManager
const networkManager = new NetworkManager();

// Erstelle DLSiteClient mit NetworkManager
const dlsiteClient = new DLSiteClient(networkManager);

// Anwendung initialisieren
async function initializeApp() {
  // Sicherstellen, dass alle benötigten Verzeichnisse existieren
  await ensureDirectories();
  
  // Hauptfenster erstellen
  createMainWindow();

  //const mainWindow = BrowserWindow.getAllWindows()[0];
  //mainWindow.webContents.openDevTools(); // DevTools automatisch öffnen
  
  // IPC-Handler registrieren
  registerHandlers();
}

// VPN aktivieren (optional)
async function enableVPNForApp() {
  const success = await networkManager.enableVPN('./config/nordvpn-config.ovpn');
  if (success) {
    console.log('VPN für DLSite aktiviert');
  } else {
    console.log('VPN-Aktivierung fehlgeschlagen, verwende normale Verbindung');
  }
}

// Wenn Electron fertig mit der Initialisierung ist
app.whenReady().then(initializeApp);

// Beende die App, wenn alle Fenster geschlossen sind (außer auf macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // Auf macOS ist es üblich, ein neues Fenster zu erstellen, wenn auf das
  // Dock-Symbol geklickt wird und keine anderen Fenster offen sind
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});