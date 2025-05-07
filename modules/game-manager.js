const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getMainWindow } = require('./window-manager');
const appConfig = require('../config/app-config');
const fileManager = require('./file-manager');
const platformManager = require('./platform-manager');
const DLSiteClient = require('../platforms/dlsite-api');

/**
 * Scannt nach installierten Spielen
 * @returns {Array} Liste der gefundenen Spiele
 */
async function scanGames() {
  const games = [];
  
  try {
    // Durchsuche das Verzeichnis nach Ordnern
    if (!fs.existsSync(appConfig.gamesDirectoryPath)) {
      return games;
    }
    
    const gameDirectories = fs.readdirSync(appConfig.gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(appConfig.gamesDirectoryPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Suche in jedem Ordner nach dustgrain.json
    for (const dir of gameDirectories) {
      const gameInfo = fileManager.readDustgrain(dir);
      if (gameInfo) {
        games.push(gameInfo);
      }
    }
  } catch (err) {
    console.error('Fehler beim Scannen nach dustgrain-Dateien:', err);
  }
  
  return games;
}

/**
 * Erlaubt die Auswahl eines Spielordners
 * @param {Event} event - Das IPC Event
 * @param {string} platform - Die Spieleplattform
 * @param {string} importType - Der Importtyp (single oder folder)
 * @returns {Object} Das Ergebnis der Ordnerauswahl
 */
async function selectGameFolder(event, platform, importType) {
  try {
    const options = {
      title: importType === 'single' ? 'Spieleverzeichnis auswählen' : 'Ordner mit mehreren Spielen auswählen',
      properties: ['openDirectory']
    };
    
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), options);
    
    if (canceled || filePaths.length === 0) {
      return { success: false, message: "Auswahl abgebrochen" };
    }
    
    const selectedDir = filePaths[0];
    const dirName = path.basename(selectedDir);
    
    // Suche nach ausführbaren Dateien
    const executableFiles = fileManager.findExecutables(selectedDir);
    const executable = executableFiles.length > 0 ? executableFiles[0] : '';
    
    // Versuche, ID aus dem Ordnernamen zu extrahieren, falls es sich um DLSite oder Steam handelt
    let gameDetails = {};
    
    if (platform === 'dlsite') {
      // Suche nach RJ/RE-Nummern im Pfad
      const rjMatch = selectedDir.match(/RJ\d+/i);
      const reMatch = selectedDir.match(/RE\d+/i);
      const dlsiteId = rjMatch ? rjMatch[0].toUpperCase() : (reMatch ? reMatch[0].toUpperCase() : null);
      
      if (dlsiteId) {
        console.log(`DLSite ID im Pfad gefunden: ${dlsiteId}`);
        
        try {
          // DLSite-Client initialisieren
          const dlsiteClient = new DLSiteClient();
          
          // Spielinformationen abrufen
          const dlsiteInfo = await dlsiteClient.getGameInfo(dlsiteId, 'maniax');
          
          gameDetails = {
            ...dlsiteInfo,
            dlsiteId: dlsiteId,
            source: 'DLSite'
          };
        } catch (error) {
          console.warn(`Fehler beim Abrufen der DLSite-Informationen: ${error.message}`);
          // Grundlegende Informationen zurückgeben
          gameDetails = {
            title: `DLSite Game ${dlsiteId}`,
            dlsiteId: dlsiteId,
            source: 'DLSite'
          };
        }
      }
    } else if (platform === 'steam') {
      // Suche nach Steam-App-ID im Pfad oder in der steam_appid.txt Datei
      let steamAppId = null;
      
      // Suche nach steam_appid.txt
      const steamAppIdPath = path.join(selectedDir, 'steam_appid.txt');
      if (fs.existsSync(steamAppIdPath)) {
        try {
          steamAppId = fs.readFileSync(steamAppIdPath, 'utf8').trim();
        } catch (error) {
          console.warn(`Fehler beim Lesen der steam_appid.txt: ${error.message}`);
        }
      }
      
      if (steamAppId) {
        console.log(`Steam App ID gefunden: ${steamAppId}`);
        
        try {
          // Steam-Informationen abrufen können hier eingefügt werden
          
          gameDetails = {
            title: dirName,
            steamAppId: steamAppId,
            source: 'Steam'
          };
        } catch (error) {
          console.warn(`Fehler beim Abrufen der Steam-Informationen: ${error.message}`);
          gameDetails = {
            title: dirName,
            steamAppId: steamAppId,
            source: 'Steam'
          };
        }
      }
    }
    
    return { 
      success: true, 
      selectedFolder: selectedDir,
      executable: executable,
      executableList: executableFiles,
      gameDetails: gameDetails
    };
  } catch (error) {
    console.error("Fehler bei der Ordnerauswahl:", error);
    return { 
      success: false, 
      message: `Fehler: ${error.message || "Unbekannter Fehler"}`
    };
  }
}

/**
 * Ermöglicht die Auswahl einer ausführbaren Datei
 * @param {Event} event - Das IPC Event
 * @param {string} folderPath - Der Ordnerpfad
 * @returns {Object} Das Ergebnis der Auswahl
 */
async function selectExecutable(event, folderPath) {
  try {
    const options = {
      title: 'Ausführbare Datei auswählen',
      defaultPath: folderPath,
      properties: ['openFile'],
      filters: appConfig.fileFilters.executables
    };
    
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), options);
    
    if (canceled || filePaths.length === 0) {
      return {
        success: false,
        message: "Auswahl abgebrochen"
      };
    }
    
    // Extrahiere den relativen Pfad zur ausführbaren Datei
    const selectedFile = path.relative(folderPath, filePaths[0]);
    
    return {
      success: true,
      selectedFile: selectedFile,
      message: `Ausführbare Datei ausgewählt: ${selectedFile}`
    };
  } catch (error) {
    console.error('Fehler bei der Auswahl der ausführbaren Datei:', error);
    return {
      success: false,
      message: `Fehler: ${error.message}`
    };
  }
}

/**
 * Fügt ein Spiel mit einem bestimmten Pfad hinzu
 * @param {Event} event - Das IPC Event
 * @param {Object} gameInfo - Die Spielinformationen
 * @param {string} gameFolder - Der Spielordner
 * @param {string} executablePath - Pfad zur ausführbaren Datei
 * @returns {Object} Das Ergebnis des Hinzufügens
 */
async function addGameWithPath(event, gameInfo, gameFolder, executablePath) {
    try {
      // Verzeichnisnamen aus dem Pfad extrahieren
      const dirName = path.basename(gameFolder);
      
      // Aktuelle Spielliste abrufen, um nächste ID zu bestimmen
      const existingGames = await scanGames();
      const nextId = existingGames.length + 1;
      
      // Dustgrain-Datei erstellen
      const dustgrain = {
        internalId: nextId, // Interne ID hinzufügen
        title: gameInfo.title || dirName,
        executable: executablePath,
        executablePath: gameFolder,
        version: gameInfo.version || "1.0",
        genre: gameInfo.genre || "Sonstiges",
        releaseDate: gameInfo.releaseDate || new Date().toISOString().split('T')[0],
        developer: gameInfo.developer || "Unbekannt",
        publisher: gameInfo.publisher || "Unbekannt",
        description: gameInfo.description || "",
        source: gameInfo.source || "Lokal",
        tags: gameInfo.tags || [],
        coverImage: gameInfo.coverImage ? gameInfo.coverImage.replace(/\\/g, '/') : "",
        screenshots: gameInfo.screenshots || [],
        lastPlayed: null,
        playTime: 0,
        installed: true,
        installDate: new Date().toISOString(),
        
        // Plattformspezifische Informationen
        steamAppId: gameInfo.steamAppId || null,
        dlsiteId: gameInfo.dlsiteId || null,
        dlsiteCategory: gameInfo.dlsiteCategory || null,
        itchioUrl: gameInfo.itchioUrl || null,
        
        dustVersion: "1.0"
      };
      
      // Speichern der dustgrain-Datei
      const success = fileManager.writeDustgrain(dirName, dustgrain);
      
      if (success) {
        return { 
          success: true, 
          dustgrain,
          message: `Spiel "${dustgrain.title}" erfolgreich hinzugefügt.`
        };
      } else {
        return { 
          success: false, 
          message: "Fehler beim Speichern der Spielinformationen"
        };
      }
    } catch (error) {
      console.error("Fehler beim Hinzufügen des Spiels:", error);
      return { 
        success: false, 
        message: `Fehler: ${error.message || "Unbekannter Fehler"}`
      };
    }
  }

/**
 * Fügt mehrere Spiele hinzu
 * @param {Event} event - Das IPC Event
 * @param {Array} games - Die Liste der Spiele
 * @returns {Object} Das Ergebnis des Hinzufügens
 */
async function addMultipleGames(event, games) {
  try {
    let addedCount = 0;
    let errors = [];
    
    for (const game of games) {
      try {
        // Zielverzeichnis erstellen
        const dirName = path.basename(game.directory);
        
        // Wenn es eine DLSite-ID gibt, vollständige Informationen abrufen
        if (game.dlsiteId) {
          try {
            const dlsiteClient = new DLSiteClient();
            const gameDetails = await dlsiteClient.getGameInfo(game.dlsiteId, 'maniax');
            
            // Grundlegende Informationen mit Details überschreiben
            Object.assign(game, gameDetails);
          } catch (dlsiteError) {
            console.warn(`Konnte keine DLSite-Details für ${game.dlsiteId} abrufen:`, dlsiteError);
            // Weiter mit grundlegenden Informationen
          }
        }
        
        // Dustgrain-Datei erstellen
        const dustgrain = {
          title: game.title || dirName,
          executable: game.executable || '',
          executablePath: game.directory,
          version: game.version || "1.0",
          genre: game.genre || "Sonstiges",
          releaseDate: game.releaseDate || new Date().toISOString().split('T')[0],
          developer: game.developer || "Unbekannt",
          publisher: game.publisher || "Unbekannt",
          description: game.description || "",
          source: game.source || "Lokal",
          tags: game.tags || [],
          coverImage: game.coverImage || "",
          screenshots: game.screenshots || [],
          lastPlayed: null,
          playTime: 0,
          installed: true,
          installDate: new Date().toISOString(),
          
          // Plattformspezifische Informationen
          dlsiteId: game.dlsiteId || null,
          dlsiteCategory: game.dlsiteCategory || 'maniax',
          
          dustVersion: "1.0"
        };
        
        // Speichern der dustgrain-Datei
        const success = fileManager.writeDustgrain(dirName, dustgrain);
        if (success) {
          addedCount++;
        } else {
          errors.push(`${game.title || 'Unbekannt'}: Fehler beim Speichern der Spielinformationen`);
        }
      } catch (gameError) {
        console.error(`Fehler beim Hinzufügen des Spiels ${game.title || 'Unbekannt'}:`, gameError);
        errors.push(`${game.title || 'Unbekannt'}: ${gameError.message}`);
      }
    }
    
    return {
      success: true,
      addedCount,
      errorCount: errors.length,
      errors,
      message: `${addedCount} Spiele erfolgreich hinzugefügt${errors.length > 0 ? `, ${errors.length} Fehler` : ''}`
    };
  } catch (error) {
    console.error('Fehler beim Hinzufügen mehrerer Spiele:', error);
    return {
      success: false,
      addedCount: 0,
      errorCount: 1,
      errors: [error.message],
      message: `Fehler: ${error.message}`
    };
  }
}

/**
 * Aktualisiert ein Spiel
 * @param {Event} event - Das IPC Event
 * @param {string} gameDirectory - Das Spieleverzeichnis
 * @param {Object} updates - Die zu aktualisierenden Felder
 * @returns {Object} Das Ergebnis der Aktualisierung
 */
async function updateGame(event, gameDirectory, updates) {
  try {
    // Spielinformationen lesen
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    
    if (!gameInfo) {
      return { 
        success: false, 
        message: "Dustgrain-Datei nicht gefunden" 
      };
    }
    
    // Aktualisiere die Felder
    const updatedInfo = { ...gameInfo, ...updates };
    
    // Speichere die aktualisierte Datei
    const success = fileManager.writeDustgrain(gameDirectory, updatedInfo);
    
    if (success) {
      return { 
        success: true, 
        dustgrain: updatedInfo,
        message: "Spiel erfolgreich aktualisiert" 
      };
    } else {
      return { 
        success: false, 
        message: "Fehler beim Speichern der aktualisierten Spielinformationen" 
      };
    }
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Spiels:", error);
    return { 
      success: false, 
      message: `Fehler: ${error.message || "Unbekannter Fehler"}` 
    };
  }
}

/**
 * Löscht ein Spiel
 * @param {Event} event - Das IPC Event
 * @param {string} gameDirectory - Das zu löschende Spieleverzeichnis
 * @returns {Object} Das Ergebnis des Löschens
 */
async function deleteGame(event, gameDirectory) {
  try {
    const gamePath = path.join(appConfig.gamesDirectoryPath, gameDirectory);
    
    if (!fs.existsSync(gamePath)) {
      return { 
        success: false, 
        message: "Spielverzeichnis nicht gefunden" 
      };
    }
    
    // Hier wird nur der Verweis in Dust gelöscht, nicht das eigentliche Spiel
    fs.rmdirSync(gamePath, { recursive: true });
    
    return { 
      success: true, 
      message: "Spiel erfolgreich aus Dust entfernt" 
    };
  } catch (error) {
    console.error("Fehler beim Löschen des Spiels:", error);
    return { 
      success: false, 
      message: `Fehler: ${error.message || "Unbekannter Fehler"}` 
    };
  }
}

/**
 * Startet ein Spiel
 * @param {Event} event - Das IPC Event
 * @param {string} gameDirectory - Das Spieleverzeichnis
 * @returns {Object} Das Ergebnis des Startens
 */
async function launchGame(event, gameDirectory) {
  try {
    // Spielinformationen lesen
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    
    if (!gameInfo) {
      return { 
        success: false, 
        message: "Dustgrain-Datei nicht gefunden"
      };
    }
    
    if (!gameInfo.executable || !gameInfo.executablePath) {
      return { 
        success: false, 
        message: "Keine ausführbare Datei für dieses Spiel definiert"
      };
    }
    
// Aktualisiere lastPlayed
gameInfo.lastPlayed = new Date().toISOString();
const success = fileManager.writeDustgrain(gameDirectory, gameInfo);

if (!success) {
  return { 
    success: false, 
    message: "Fehler beim Aktualisieren des Spiels vor dem Start"
  };
}

// Starte das Spiel
const fullPath = path.join(gameInfo.executablePath, gameInfo.executable);

const child = spawn(fullPath, [], {
  detached: true,
  stdio: 'ignore',
  cwd: gameInfo.executablePath
});

child.unref();

return { 
  success: true, 
  message: `Spiel ${gameInfo.title} wird gestartet...`
};
} catch (error) {
console.error("Fehler beim Starten des Spiels:", error);
return { 
  success: false, 
  message: `Fehler: ${error.message || "Unbekannter Fehler"}`
};
}
}

module.exports = {
scanGames,
selectGameFolder,
selectExecutable,
addGameWithPath,
addMultipleGames,
updateGame,
deleteGame,
launchGame
};