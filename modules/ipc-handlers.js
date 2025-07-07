const { ipcMain, dialog } = require('electron');
const gameManager = require('./game-manager');
const platformManager = require('./platform-manager');
const path = require('path');
const fs = require('fs');
const NetworkManager = require('./network-manager');
const { getLogger } = require('./logger');

const logger = getLogger();

// Globale NetworkManager Instanz
let networkManager = null;

function initNetworkManager() {
  if (!networkManager) {
    logger.debug('IPC_NETWORK', 'Initialisiere NetworkManager');
    networkManager = new NetworkManager();
    logger.info('IPC_NETWORK', 'NetworkManager erfolgreich initialisiert');
  }
  return networkManager;
}

/**
 * Wrapper-Funktion für IPC-Handler mit Logging
 */
function createLoggedHandler(handlerName, handlerFunction) {
  return async (event, ...args) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    logger.startTimer(`ipc_${handlerName}_${requestId}`);
    
    logger.logIPC(handlerName, 'RECEIVE', { 
      requestId,
      argsCount: args.length,
      args: args.length <= 3 ? args : `[${args.length} arguments]` 
    });
    
    try {
      const result = await handlerFunction(event, ...args);
      
      const handlerTime = logger.endTimer(`ipc_${handlerName}_${requestId}`);
      
      logger.logIPC(handlerName, 'SEND_SUCCESS', { 
        requestId,
        success: result?.success !== false,
        handlerTime: `${handlerTime.toFixed(2)}ms`,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : 'primitive'
      });
      
      return result;
    } catch (error) {
      logger.endTimer(`ipc_${handlerName}_${requestId}`);
      
      logger.error('IPC_HANDLER', `Fehler in Handler ${handlerName}`, { 
        requestId,
        handlerName,
        argsCount: args.length 
      }, error);
      
      logger.logIPC(handlerName, 'SEND_ERROR', { 
        requestId,
        error: error.message 
      });
      
      // Gebe strukturierten Fehler zurück
      return {
        success: false,
        error: true,
        message: `Handler-Fehler: ${error.message}`,
        handlerName
      };
    }
  };
}

/**
 * Registriert alle IPC-Handler für die Anwendung
 */
function registerHandlers() {
  logger.info('IPC_REGISTER', 'Beginne Registrierung der IPC-Handler');
  
  // Spielverwaltungs-Handler
  const gameHandlers = {
    'scan-games': gameManager.scanGames,
    'add-game-with-path': gameManager.addGameWithPath,
    'add-multiple-games': gameManager.addMultipleGames,
    'update-game': gameManager.updateGame,
    'delete-game': gameManager.deleteGame,
    'launch-game': gameManager.launchGame,
    'select-game-folder': gameManager.selectGameFolder,
    'select-executable': gameManager.selectExecutable
  };
  
  logger.debug('IPC_REGISTER', 'Registriere Game-Management-Handler', { 
    handlers: Object.keys(gameHandlers) 
  });
  
  Object.entries(gameHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, createLoggedHandler(channel, handler));
  });
  
  // Plattformspezifische Handler
  const platformHandlers = {
    'scan-folder-for-games': platformManager.scanFolderForGames,
    'fetch-dlsite-game-details': platformManager.fetchDLSiteGameDetails,
    'fetch-steam-game-details': platformManager.fetchSteamGameDetails,
    'fetch-itchio-game-details': platformManager.fetchItchioGameDetails
  };
  
  logger.debug('IPC_REGISTER', 'Registriere Platform-Handler', { 
    handlers: Object.keys(platformHandlers) 
  });
  
  Object.entries(platformHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, createLoggedHandler(channel, handler));
  });
  
  // VPN-Handler
  registerVPNHandlers();
  
  // System-Handler
  registerSystemHandlers();
  
  logger.info('IPC_REGISTER', 'Alle IPC-Handler erfolgreich registriert', { 
    gameHandlers: Object.keys(gameHandlers).length,
    platformHandlers: Object.keys(platformHandlers).length,
    totalHandlers: Object.keys(gameHandlers).length + Object.keys(platformHandlers).length + 6 // +6 für VPN + System
  });
}

function registerVPNHandlers() {
  logger.debug('IPC_REGISTER', 'Registriere VPN-Handler');
  
  // VPN aktivieren
  ipcMain.handle('enable-vpn', createLoggedHandler('enable-vpn', async (event, configPath) => {
    logger.info('VPN_HANDLER', 'VPN-Aktivierung angefordert', { configPath });
    
    try {
      const manager = initNetworkManager();
      const success = await manager.enableVPN(configPath);
      
      const result = {
        success: success,
        message: success ? 'VPN erfolgreich aktiviert' : 'VPN-Aktivierung fehlgeschlagen'
      };
      
      logger.logVPNOperation('VPN_ENABLE_REQUEST', success, { 
        configPath,
        result: result.message 
      });
      
      return result;
    } catch (error) {
      logger.error('VPN_HANDLER', 'Fehler beim Aktivieren des VPN', { configPath }, error);
      return {
        success: false,
        message: error.message
      };
    }
  }));

  // VPN deaktivieren
  ipcMain.handle('disable-vpn', createLoggedHandler('disable-vpn', async (event) => {
    logger.info('VPN_HANDLER', 'VPN-Deaktivierung angefordert');
    
    try {
      const manager = initNetworkManager();
      const success = await manager.disableVPN();
      
      const result = {
        success: success,
        message: success ? 'VPN erfolgreich deaktiviert' : 'VPN-Deaktivierung fehlgeschlagen'
      };
      
      logger.logVPNOperation('VPN_DISABLE_REQUEST', success, { 
        result: result.message 
      });
      
      return result;
    } catch (error) {
      logger.error('VPN_HANDLER', 'Fehler beim Deaktivieren des VPN', null, error);
      return {
        success: false,
        message: error.message
      };
    }
  }));

  // VPN-Status abrufen
  ipcMain.handle('get-vpn-status', createLoggedHandler('get-vpn-status', async (event) => {
    logger.debug('VPN_HANDLER', 'VPN-Status angefordert');
    
    try {
      const manager = initNetworkManager();
      const status = manager.getVPNStatus();
      
      logger.debug('VPN_HANDLER', 'VPN-Status abgerufen', status);
      
      return status;
    } catch (error) {
      logger.error('VPN_HANDLER', 'Fehler beim Abrufen des VPN-Status', null, error);
      return {
        enabled: false,
        isConnected: false,
        error: error.message
      };
    }
  }));

  // VPN-Konfigurationen abrufen
  ipcMain.handle('get-vpn-configs', createLoggedHandler('get-vpn-configs', async (event) => {
    logger.debug('VPN_HANDLER', 'VPN-Konfigurationen angefordert');
    
    try {
      // Suche nach .ovpn Dateien im config Ordner
      const configDir = path.join(__dirname, '../config/vpn');
      
      logger.debug('VPN_HANDLER', 'Suche VPN-Konfigurationen', { configDir });
      
      if (!fs.existsSync(configDir)) {
        logger.info('VPN_HANDLER', 'VPN-Konfigurationsverzeichnis existiert nicht, erstelle es');
        fs.mkdirSync(configDir, { recursive: true });
        logger.logFileOperation('CREATE_DIRECTORY', configDir, true);
        return [];
      }
      
      const files = fs.readdirSync(configDir);
      const ovpnFiles = files.filter(file => file.endsWith('.ovpn'));
      
      const configs = ovpnFiles.map(file => ({
        name: path.basename(file, '.ovpn'),
        path: path.join(configDir, file)
      }));
      
      logger.info('VPN_HANDLER', 'VPN-Konfigurationen gefunden', { 
        configDir,
        totalFiles: files.length,
        ovpnFiles: ovpnFiles.length,
        configs: configs.map(c => c.name) 
      });
      
      return configs;
    } catch (error) {
      logger.error('VPN_HANDLER', 'Fehler beim Abrufen der VPN-Konfigurationen', null, error);
      return [];
    }
  }));

  // VPN-Konfiguration auswählen (Dateiauswahl-Dialog)
  ipcMain.handle('select-vpn-config', createLoggedHandler('select-vpn-config', async (event) => {
    logger.info('VPN_HANDLER', 'VPN-Konfiguration Auswahl-Dialog angefordert');
    
    try {
      const result = await dialog.showOpenDialog({
        title: 'VPN-Konfigurationsdatei auswählen',
        filters: [
          { name: 'OpenVPN Config', extensions: ['ovpn'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (result.canceled) {
        logger.info('VPN_HANDLER', 'VPN-Konfiguration Auswahl abgebrochen');
        return { success: false, message: 'Auswahl abgebrochen' };
      }
      
      const sourcePath = result.filePaths[0];
      const configDir = path.join(__dirname, '../config/vpn');
      
      logger.debug('VPN_HANDLER', 'VPN-Konfiguration ausgewählt', { 
        sourcePath,
        configDir 
      });
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        logger.logFileOperation('CREATE_DIRECTORY', configDir, true);
      }
      
      const fileName = path.basename(sourcePath);
      const targetPath = path.join(configDir, fileName);
      
      // Datei kopieren
      fs.copyFileSync(sourcePath, targetPath);
      logger.logFileOperation('COPY_FILE', `${sourcePath} -> ${targetPath}`, true);
      
      logger.info('VPN_HANDLER', 'VPN-Konfiguration erfolgreich hinzugefügt', { 
        sourcePath,
        targetPath,
        fileName 
      });
      
      return {
        success: true,
        message: 'VPN-Konfiguration hinzugefügt',
        configPath: targetPath
      };
    } catch (error) {
      logger.error('VPN_HANDLER', 'Fehler beim Hinzufügen der VPN-Konfiguration', null, error);
      return {
        success: false,
        message: error.message
      };
    }
  }));
  
  logger.debug('IPC_REGISTER', 'VPN-Handler erfolgreich registriert');
}

function registerSystemHandlers() {
  logger.debug('IPC_REGISTER', 'Registriere System-Handler');
  
  // Logger-Statistiken abrufen
  ipcMain.handle('get-logger-stats', createLoggedHandler('get-logger-stats', async (event) => {
    logger.debug('SYSTEM_HANDLER', 'Logger-Statistiken angefordert');
    
    try {
      const stats = logger.getStats();
      
      logger.debug('SYSTEM_HANDLER', 'Logger-Statistiken abgerufen', { 
        totalLogs: stats.total,
        logFiles: stats.logFiles?.length || 0 
      });
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      logger.error('SYSTEM_HANDLER', 'Fehler beim Abrufen der Logger-Statistiken', null, error);
      return {
        success: false,
        message: error.message
      };
    }
  }));
  
  // Log-Level ändern
  ipcMain.handle('set-log-level', createLoggedHandler('set-log-level', async (event, level) => {
    logger.info('SYSTEM_HANDLER', 'Log-Level Änderung angefordert', { 
      currentLevel: logger.logLevel,
      newLevel: level 
    });
    
    try {
      const oldLevel = logger.logLevel;
      logger.logLevel = level;
      
      logger.info('SYSTEM_HANDLER', 'Log-Level erfolgreich geändert', { 
        oldLevel,
        newLevel: level 
      });
      
      return {
        success: true,
        message: `Log-Level von ${oldLevel} auf ${level} geändert`,
        oldLevel,
        newLevel: level
      };
    } catch (error) {
      logger.error('SYSTEM_HANDLER', 'Fehler beim Ändern des Log-Levels', { level }, error);
      return {
        success: false,
        message: error.message
      };
    }
  }));
  
  // System-Informationen abrufen
  ipcMain.handle('get-system-info', createLoggedHandler('get-system-info', async (event) => {
    logger.debug('SYSTEM_HANDLER', 'System-Informationen angefordert');
    
    try {
      const systemInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        cwd: process.cwd()
      };
      
      logger.debug('SYSTEM_HANDLER', 'System-Informationen gesammelt', systemInfo);
      
      return {
        success: true,
        systemInfo
      };
    } catch (error) {
      logger.error('SYSTEM_HANDLER', 'Fehler beim Abrufen der System-Informationen', null, error);
      return {
        success: false,
        message: error.message
      };
    }
  }));
  
  logger.debug('IPC_REGISTER', 'System-Handler erfolgreich registriert');
}

// NetworkManager für andere Module exportieren
function getNetworkManager() {
  return initNetworkManager();
}

// Handler-Statistiken verfolgen
const handlerStats = {
  calls: new Map(),
  errors: new Map(),
  totalCalls: 0,
  totalErrors: 0
};

// Statistiken verfolgen
function trackHandlerCall(handlerName, success = true) {
  handlerStats.totalCalls++;
  
  if (!handlerStats.calls.has(handlerName)) {
    handlerStats.calls.set(handlerName, 0);
  }
  handlerStats.calls.set(handlerName, handlerStats.calls.get(handlerName) + 1);
  
  if (!success) {
    handlerStats.totalErrors++;
    
    if (!handlerStats.errors.has(handlerName)) {
      handlerStats.errors.set(handlerName, 0);
    }
    handlerStats.errors.set(handlerName, handlerStats.errors.get(handlerName) + 1);
  }
}

// Handler-Statistiken abrufen
function getHandlerStats() {
  return {
    ...handlerStats,
    calls: Object.fromEntries(handlerStats.calls),
    errors: Object.fromEntries(handlerStats.errors),
    successRate: handlerStats.totalCalls > 0 ? 
      ((handlerStats.totalCalls - handlerStats.totalErrors) / handlerStats.totalCalls * 100).toFixed(2) + '%' : 
      '0%'
  };
}

module.exports = {
  registerHandlers,
  getNetworkManager,
  getHandlerStats
};