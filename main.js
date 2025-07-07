const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createMainWindow } = require('./modules/window-manager');
const { registerHandlers } = require('./modules/ipc-handlers');
const { ensureDirectories } = require('./modules/file-manager');
const NetworkManager = require('./modules/network-manager');
const DLSiteClient = require('./platforms/dlsite-api');
const { initLogger, getLogger } = require('./modules/logger');

// Logger initialisieren
const logger = initLogger({
  logLevel: 'DEBUG',
  enableConsole: true,
  enableFile: true,
  enableStack: true
});

logger.logSystemEvent('APPLICATION_START', { 
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
  pid: process.pid
});

// Erstelle NetworkManager
let networkManager;
let dlsiteClient;

// Anwendung initialisieren
async function initializeApp() {
  logger.startTimer('app_initialization');
  
  try {
    logger.info('INIT', 'Beginne Anwendungsinitialisierung');
    
    // Sicherstellen, dass alle benötigten Verzeichnisse existieren
    logger.debug('INIT', 'Erstelle benötigte Verzeichnisse');
    await ensureDirectories();
    logger.debug('INIT', 'Verzeichnisse erfolgreich erstellt');
    
    // NetworkManager initialisieren
    logger.debug('INIT', 'Initialisiere NetworkManager');
    networkManager = new NetworkManager();
    logger.debug('INIT', 'NetworkManager erfolgreich initialisiert');
    
    // DLSiteClient initialisieren
    logger.debug('INIT', 'Initialisiere DLSiteClient');
    dlsiteClient = new DLSiteClient(networkManager);
    logger.debug('INIT', 'DLSiteClient erfolgreich initialisiert');
    
    // Hauptfenster erstellen
    logger.debug('INIT', 'Erstelle Hauptfenster');
    createMainWindow();
    logger.debug('INIT', 'Hauptfenster erfolgreich erstellt');

    // Optional: DevTools automatisch öffnen (nur in Development)
    if (process.env.NODE_ENV === 'development') {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.openDevTools();
        logger.debug('INIT', 'DevTools geöffnet (Development-Modus)');
      }
    }
    
    // IPC-Handler registrieren
    logger.debug('INIT', 'Registriere IPC-Handler');
    registerHandlers();
    logger.debug('INIT', 'IPC-Handler erfolgreich registriert');
    
    const initTime = logger.endTimer('app_initialization');
    logger.info('INIT', 'Anwendungsinitialisierung abgeschlossen', { 
      initTime: `${initTime.toFixed(2)}ms` 
    });
    
  } catch (error) {
    logger.endTimer('app_initialization');
    logger.fatal('INIT', 'Fehler bei der Anwendungsinitialisierung', null, error);
    throw error;
  }
}

// VPN aktivieren (optional)
async function enableVPNForApp() {
  logger.startTimer('vpn_activation');
  
  try {
    logger.info('VPN', 'Versuche VPN für DLSite zu aktivieren');
    
    const configPath = './config/nordvpn-config.ovpn';
    logger.debug('VPN', 'Verwende VPN-Konfiguration', { configPath });
    
    const success = await networkManager.enableVPN(configPath);
    const activationTime = logger.endTimer('vpn_activation');
    
    if (success) {
      logger.logVPNOperation('VPN für DLSite aktiviert', true, { 
        configPath,
        activationTime: `${activationTime.toFixed(2)}ms` 
      });
    } else {
      logger.logVPNOperation('VPN-Aktivierung fehlgeschlagen, verwende normale Verbindung', false, { 
        configPath,
        activationTime: `${activationTime.toFixed(2)}ms` 
      });
    }
    
    return success;
  } catch (error) {
    logger.endTimer('vpn_activation');
    logger.logVPNOperation('VPN-Aktivierung mit Fehler fehlgeschlagen', false, null);
    logger.error('VPN', 'Fehler bei VPN-Aktivierung', null, error);
    return false;
  }
}

// Anwendungs-Event-Handler
app.whenReady().then(async () => {
  logger.logSystemEvent('ELECTRON_READY');
  
  try {
    await initializeApp();
    
    // Optional: VPN aktivieren
    if (process.env.ENABLE_VPN === 'true') {
      await enableVPNForApp();
    }
    
    logger.logSystemEvent('APPLICATION_READY');
  } catch (error) {
    logger.fatal('SYSTEM', 'Fataler Fehler beim Anwendungsstart', null, error);
    app.quit();
  }
});

// Beende die App, wenn alle Fenster geschlossen sind (außer auf macOS)
app.on('window-all-closed', () => {
  logger.logSystemEvent('ALL_WINDOWS_CLOSED', { platform: process.platform });
  
  if (process.platform !== 'darwin') {
    logger.logSystemEvent('APPLICATION_QUIT');
    app.quit();
  }
});

app.on('activate', () => {
  logger.logSystemEvent('APPLICATION_ACTIVATE');
  
  // Auf macOS ist es üblich, ein neues Fenster zu erstellen, wenn auf das
  // Dock-Symbol geklickt wird und keine anderen Fenster offen sind
  if (BrowserWindow.getAllWindows().length === 0) {
    logger.debug('SYSTEM', 'Kein Fenster gefunden, erstelle neues Hauptfenster');
    createMainWindow();
  }
});

// Globale Fehlerbehandlung
process.on('uncaughtException', (error) => {
  logger.fatal('SYSTEM', 'Uncaught Exception', null, error);
  console.error('Uncaught Exception:', error);
  // Gib der App Zeit, den Log zu schreiben
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('SYSTEM', 'Unhandled Promise Rejection', { 
    reason: reason?.toString(),
    promise: promise?.toString() 
  });
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  logger.logSystemEvent('SIGINT_RECEIVED');
  gracefulShutdown();
});

process.on('SIGTERM', () => {
  logger.logSystemEvent('SIGTERM_RECEIVED');
  gracefulShutdown();
});

function gracefulShutdown() {
  logger.info('SYSTEM', 'Beginne graceful shutdown');
  
  try {
    // VPN deaktivieren falls aktiv
    if (networkManager) {
      networkManager.disableVPN();
      logger.info('SYSTEM', 'VPN deaktiviert');
    }
    
    // Logger-Statistiken ausgeben
    const stats = logger.getStats();
    logger.info('SYSTEM', 'Final Logger Statistics', stats);
    
    // Cleanup
    logger.cleanup();
    logger.logSystemEvent('APPLICATION_SHUTDOWN_COMPLETE');
    
  } catch (error) {
    logger.error('SYSTEM', 'Fehler beim Shutdown', null, error);
  } finally {
    process.exit(0);
  }
}

// Exportiere Logger für andere Module
module.exports = {
  logger: getLogger,
  networkManager: () => networkManager,
  dlsiteClient: () => dlsiteClient
};