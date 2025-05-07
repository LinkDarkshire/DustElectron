const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createMainWindow } = require('./modules/window-manager');
const { registerHandlers } = require('./modules/ipc-handlers');
const { ensureDirectories } = require('./modules/file-manager');

// Anwendung initialisieren
async function initializeApp() {
  // Sicherstellen, dass alle benötigten Verzeichnisse existieren
  await ensureDirectories();
  
  // Hauptfenster erstellen
  createMainWindow();
  
  // IPC-Handler registrieren
  registerHandlers();
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