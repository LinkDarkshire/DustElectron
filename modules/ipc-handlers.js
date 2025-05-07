const { ipcMain } = require('electron');
const gameManager = require('./game-manager');
const platformManager = require('./platform-manager');

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
}

module.exports = {
  registerHandlers
};