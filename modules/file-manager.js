const fs = require('fs');
const path = require('path');
const appConfig = require('../config/app-config');

/**
 * Stellt sicher, dass alle benötigten Verzeichnisse existieren
 */
async function ensureDirectories() {
  // Spieleverzeichnis erstellen, falls es nicht existiert
  if (!fs.existsSync(appConfig.gamesDirectoryPath)) {
    fs.mkdirSync(appConfig.gamesDirectoryPath, { recursive: true });
  }
  
  // Plattform-Icons-Verzeichnis erstellen, falls es nicht existiert
  const platformsDir = path.join(process.cwd(), 'assets', 'platforms');
  if (!fs.existsSync(platformsDir)) {
    fs.mkdirSync(platformsDir, { recursive: true });
  }
}

/**
 * Liest den Inhalt einer dustgrain.json-Datei
 * @param {string} gameDirectory - Das Spieleverzeichnis
 * @returns {Object|null} Die Spieleinformationen oder null bei Fehler
 */
function readDustgrain(gameDirectory) {
  try {
    const dustgrainPath = path.join(appConfig.gamesDirectoryPath, gameDirectory, 'dustgrain.json');
    
    if (!fs.existsSync(dustgrainPath)) {
      return null;
    }
    
    const data = fs.readFileSync(dustgrainPath, 'utf8');
    const gameInfo = JSON.parse(data);
    
    // Verzeichnisinformationen hinzufügen
    gameInfo.directory = gameDirectory;
    
    return gameInfo;
  } catch (error) {
    console.error(`Fehler beim Lesen von ${gameDirectory}/dustgrain.json:`, error);
    return null;
  }
}

/**
 * Speichert eine dustgrain.json-Datei
 * @param {string} gameDirectory - Das Spieleverzeichnis
 * @param {Object} gameInfo - Die zu speichernden Spielinformationen
 * @returns {boolean} True bei Erfolg, False bei Fehler
 */
function writeDustgrain(gameDirectory, gameInfo) {
  try {
    const gameDir = path.join(appConfig.gamesDirectoryPath, gameDirectory);
    
    // Verzeichnis erstellen, falls es nicht existiert
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }
    
    const dustgrainPath = path.join(gameDir, 'dustgrain.json');
    fs.writeFileSync(dustgrainPath, JSON.stringify(gameInfo, null, 2));
    
    return true;
  } catch (error) {
    console.error(`Fehler beim Schreiben von ${gameDirectory}/dustgrain.json:`, error);
    return false;
  }
}

/**
 * Sucht ausführbare Dateien in einem Verzeichnis
 * @param {string} directory - Das zu durchsuchende Verzeichnis
 * @returns {string[]} Liste der gefundenen ausführbaren Dateien
 */
function findExecutables(directory) {
  try {
    if (!fs.existsSync(directory)) {
      return [];
    }
    
    const files = fs.readdirSync(directory);
    const platform = process.platform;
    let execExtensions = [];
    
    // Plattformspezifische Erweiterungen auswählen
    if (appConfig.executableTypes[platform]) {
      execExtensions = appConfig.executableTypes[platform];
    } else {
      // Fallback: Alle bekannten ausführbaren Dateitypen
      execExtensions = [
        ...appConfig.executableTypes.win32,
        ...appConfig.executableTypes.darwin,
        ...appConfig.executableTypes.linux
      ];
    }
    
    // Filter auf Basis der Dateierweiterungen
    return files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return execExtensions.includes(ext) || 
             (platform === 'linux' && ext === '' && !file.includes('.'));
    });
  } catch (error) {
    console.error(`Fehler beim Suchen nach ausführbaren Dateien in ${directory}:`, error);
    return [];
  }
}

module.exports = {
  ensureDirectories,
  readDustgrain,
  writeDustgrain,
  findExecutables
};