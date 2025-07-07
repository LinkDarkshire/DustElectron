const { ipcMain, dialog } = require('electron');
const gameManager = require('./game-manager');
const platformManager = require('./platform-manager');
const path = require('path');
const fs = require('fs');
const NetworkManager = require('./network-manager');

// Globale NetworkManager Instanz
let networkManager = null;

function initNetworkManager() {
  if (!networkManager) {
    networkManager = new NetworkManager();
  }
  return networkManager;
}

/**
 * Registriert alle IPC-Handler für die Anwendung
 */
function registerHandlers() {
  // Spielverwaltungs-Handler
  ipcMain.handle('scan-games', gameManager.scanGames);
  ipcMain.handle('add-game-with-path', gameManager.addGameWithPath);
  ipcMain.handle('add-multiple-games', gameManager.addMultipleGames);
  ipcMain.handle('update-game', gameManager.updateGame);
  ipcMain.handle('delete-game', gameManager.deleteGame);
  ipcMain.handle('launch-game', gameManager.launchGame);
  ipcMain.handle('select-game-folder', gameManager.selectGameFolder);
  ipcMain.handle('select-executable', gameManager.selectExecutable);
  
  // Plattformspezifische Handler
  ipcMain.handle('scan-folder-for-games', platformManager.scanFolderForGames);
  
  // DLSite-spezifische Handler
  ipcMain.handle('fetch-dlsite-game-details', platformManager.fetchDLSiteGameDetails);
  
  // Steam-spezifische Handler
  ipcMain.handle('fetch-steam-game-details', platformManager.fetchSteamGameDetails);
  
  // Itch.io-spezifische Handler
  ipcMain.handle('fetch-itchio-game-details', platformManager.fetchItchioGameDetails);

  // VPN-Handler
  registerVPNHandlers();
}

function registerVPNHandlers() {
  // VPN aktivieren
  ipcMain.handle('enable-vpn', async (event, configPath) => {
    try {
      const manager = initNetworkManager();
      const success = await manager.enableVPN(configPath);
      
      return {
        success: success,
        message: success ? 'VPN erfolgreich aktiviert' : 'VPN-Aktivierung fehlgeschlagen'
      };
    } catch (error) {
      console.error('Fehler beim Aktivieren des VPN:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });

  // VPN deaktivieren
  ipcMain.handle('disable-vpn', async (event) => {
    try {
      const manager = initNetworkManager();
      const success = await manager.disableVPN();
      
      return {
        success: success,
        message: success ? 'VPN erfolgreich deaktiviert' : 'VPN-Deaktivierung fehlgeschlagen'
      };
    } catch (error) {
      console.error('Fehler beim Deaktivieren des VPN:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });

  // VPN-Status abrufen
  ipcMain.handle('get-vpn-status', async (event) => {
    try {
      const manager = initNetworkManager();
      return manager.getVPNStatus();
    } catch (error) {
      console.error('Fehler beim Abrufen des VPN-Status:', error);
      return {
        enabled: false,
        isConnected: false
      };
    }
  });

  // VPN-Konfigurationen abrufen
  ipcMain.handle('get-vpn-configs', async (event) => {
    try {
      // Suche nach .ovpn Dateien im config Ordner
      const configDir = path.join(__dirname, '../config/vpn');
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        return [];
      }
      
      const files = fs.readdirSync(configDir);
      const ovpnFiles = files.filter(file => file.endsWith('.ovpn'));
      
      return ovpnFiles.map(file => ({
        name: path.basename(file, '.ovpn'),
        path: path.join(configDir, file)
      }));
    } catch (error) {
      console.error('Fehler beim Abrufen der VPN-Konfigurationen:', error);
      return [];
    }
  });

  // VPN-Konfiguration auswählen (Dateiauswahl-Dialog)
  ipcMain.handle('select-vpn-config', async (event) => {
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
        return { success: false, message: 'Auswahl abgebrochen' };
      }
      
      const sourcePath = result.filePaths[0];
      const configDir = path.join(__dirname, '../config/vpn');
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const fileName = path.basename(sourcePath);
      const targetPath = path.join(configDir, fileName);
      
      // Datei kopieren
      fs.copyFileSync(sourcePath, targetPath);
      
      return {
        success: true,
        message: 'VPN-Konfiguration hinzugefügt',
        configPath: targetPath
      };
    } catch (error) {
      console.error('Fehler beim Hinzufügen der VPN-Konfiguration:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
}

// NetworkManager für andere Module exportieren
function getNetworkManager() {
  return initNetworkManager();
}

module.exports = {
  registerHandlers,
  getNetworkManager
};