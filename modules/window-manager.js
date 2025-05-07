const { BrowserWindow } = require('electron');
const path = require('path');
const appConfig = require('../config/app-config');

// Hauptfenster-Referenz global halten, um GC zu verhindern
let mainWindow = null;

/**
 * Erstellt das Hauptfenster der Anwendung
 * @returns {BrowserWindow} Das erstellte Hauptfenster
 */
function createMainWindow() {
  // Browser-Fenster erstellen
  mainWindow = new BrowserWindow(appConfig.windowSettings);

  // index.html laden
  mainWindow.loadFile('index.html');

  // Öffne die DevTools während der Entwicklung
  // mainWindow.webContents.openDevTools();

  // Emittiert, wenn das Fenster geschlossen wird
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  return mainWindow;
}

/**
 * Gibt das aktuelle Hauptfenster zurück
 * @returns {BrowserWindow|null} Das Hauptfenster oder null, wenn keines existiert
 */
function getMainWindow() {
  return mainWindow;
}

module.exports = {
  createMainWindow,
  getMainWindow
};