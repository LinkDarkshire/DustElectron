const { app } = require('electron');
const path = require('path');

module.exports = {
  // Anwendungsverzeichnisse
  userDataPath: app.getPath('userData'),
  gamesDirectoryPath: path.join(app.getPath('userData'), 'games'),
  
  // Fenstereinstellungen
  windowSettings: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Dust Game Manager",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1b2838'
  },
  
  // Unterstützte Plattformen
  supportedPlatforms: [
    { id: 'steam', name: 'Steam', icon: 'assets/platforms/steam.png' },
    { id: 'itchio', name: 'Itch.io', icon: 'assets/platforms/itchio.png' },
    { id: 'dlsite', name: 'DLSite', icon: 'assets/platforms/dlsite.png' },
    { id: 'other', name: 'Andere', icon: 'assets/platforms/other.png' }
  ],
  
  // Ausführbare Dateitypen nach Betriebssystem
  executableTypes: {
    win32: ['.exe', '.bat', '.cmd'],
    darwin: ['.app', '.command', '.sh'],
    linux: ['.sh', '.x86', '.x86_64'],
    all: []  // Alle Dateien (kein Filter)
  },
  
  // Dateiformate für den Dateiauswahldialog
  fileFilters: {
    executables: [
      { name: 'Ausführbare Dateien', extensions: ['exe', 'bat', 'cmd', 'app', 'sh'] },
      { name: 'Alle Dateien', extensions: ['*'] }
    ]
  }
};