const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getMainWindow } = require('./window-manager');
const appConfig = require('../config/app-config');
const fileManager = require('./file-manager');
const platformManager = require('./platform-manager');
const DLSiteClient = require('../platforms/dlsite-api');
const { getLogger } = require('./logger');

const logger = getLogger();

/**
 * Scannt nach installierten Spielen
 * @returns {Array} Liste der gefundenen Spiele
 */
async function scanGames() {
  logger.startTimer('scan_games');
  logger.info('GAME_SCAN', 'Beginne Scan nach installierten Spielen');
  
  const games = [];
  
  try {
    // Prüfe ob Spieleverzeichnis existiert
    if (!fs.existsSync(appConfig.gamesDirectoryPath)) {
      logger.warn('GAME_SCAN', 'Spieleverzeichnis existiert nicht', { 
        path: appConfig.gamesDirectoryPath 
      });
      return games;
    }
    
    logger.debug('GAME_SCAN', 'Lese Spieleverzeichnis', { 
      path: appConfig.gamesDirectoryPath 
    });
    
    // Durchsuche das Verzeichnis nach Ordnern
    const gameDirectories = fs.readdirSync(appConfig.gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(appConfig.gamesDirectoryPath, file);
        const isDirectory = fs.statSync(fullPath).isDirectory();
        
        if (isDirectory) {
          logger.trace('GAME_SCAN', 'Verzeichnis gefunden', { directory: file });
        }
        
        return isDirectory;
      });
    
    logger.info('GAME_SCAN', `${gameDirectories.length} Spieleverzeichnisse gefunden`);
    
    // Suche in jedem Ordner nach dustgrain.json
    for (const dir of gameDirectories) {
      logger.debug('GAME_SCAN', `Prüfe Verzeichnis: ${dir}`);
      
      try {
        const gameInfo = fileManager.readDustgrain(dir);
        if (gameInfo) {
          games.push(gameInfo);
          logger.debug('GAME_SCAN', 'Spiel gefunden', { 
            directory: dir,
            title: gameInfo.title,
            id: gameInfo.internalId 
          });
        } else {
          logger.debug('GAME_SCAN', 'Keine dustgrain.json gefunden', { directory: dir });
        }
      } catch (error) {
        logger.error('GAME_SCAN', `Fehler beim Lesen von ${dir}`, { directory: dir }, error);
      }
    }
    
    const scanTime = logger.endTimer('scan_games');
    logger.info('GAME_SCAN', 'Scan abgeschlossen', { 
      gamesFound: games.length,
      scanTime: `${scanTime.toFixed(2)}ms`,
      directories: gameDirectories.length 
    });
    
  } catch (err) {
    logger.endTimer('scan_games');
    logger.error('GAME_SCAN', 'Fehler beim Scannen nach dustgrain-Dateien', null, err);
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
  logger.startTimer('select_game_folder');
  logger.logIPC('select-game-folder', 'RECEIVE', { platform, importType });
  
  try {
    const options = {
      title: importType === 'single' ? 'Spieleverzeichnis auswählen' : 'Ordner mit mehreren Spielen auswählen',
      properties: ['openDirectory']
    };
    
    logger.debug('SELECT_FOLDER', 'Öffne Ordnerauswahl-Dialog', { options });
    
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), options);
    
    if (canceled || filePaths.length === 0) {
      logger.info('SELECT_FOLDER', 'Ordnerauswahl abgebrochen vom Benutzer');
      return { success: false, message: "Auswahl abgebrochen" };
    }
    
    const selectedDir = filePaths[0];
    const dirName = path.basename(selectedDir);
    
    logger.info('SELECT_FOLDER', 'Ordner ausgewählt', { 
      selectedDir,
      dirName,
      platform,
      importType 
    });
    
    // Suche nach ausführbaren Dateien
    logger.debug('SELECT_FOLDER', 'Suche nach ausführbaren Dateien');
    const executableFiles = fileManager.findExecutables(selectedDir);
    const executable = executableFiles.length > 0 ? executableFiles[0] : '';
    
    logger.debug('SELECT_FOLDER', 'Ausführbare Dateien gefunden', { 
      count: executableFiles.length,
      files: executableFiles,
      selectedExecutable: executable 
    });
    
    // Versuche, ID aus dem Ordnernamen zu extrahieren, falls es sich um DLSite oder Steam handelt
    let gameDetails = {};
    
    if (platform === 'dlsite') {
      logger.debug('DLSITE_DETECTION', 'Suche nach DLSite-ID im Pfad');
      
      // Suche nach RJ/RE-Nummern im Pfad
      const rjMatch = selectedDir.match(/RJ\d+/i);
      const reMatch = selectedDir.match(/RE\d+/i);
      const dlsiteId = rjMatch ? rjMatch[0].toUpperCase() : (reMatch ? reMatch[0].toUpperCase() : null);
      
      if (dlsiteId) {
        logger.info('DLSITE_DETECTION', `DLSite ID im Pfad gefunden: ${dlsiteId}`);
        
        try {
          // DLSite-Client initialisieren
          const dlsiteClient = new DLSiteClient();
          
          logger.startTimer('dlsite_info_fetch');
          logger.debug('DLSITE_API', 'Rufe Spielinformationen ab', { dlsiteId });
          
          // Spielinformationen abrufen
          const dlsiteInfo = await dlsiteClient.getGameInfo(dlsiteId, 'maniax');
          
          const fetchTime = logger.endTimer('dlsite_info_fetch');
          logger.info('DLSITE_API', 'Spielinformationen erfolgreich abgerufen', { 
            dlsiteId,
            title: dlsiteInfo.title,
            fetchTime: `${fetchTime.toFixed(2)}ms` 
          });
          
          gameDetails = {
            ...dlsiteInfo,
            dlsiteId: dlsiteId,
            source: 'DLSite'
          };
        } catch (error) {
          logger.error('DLSITE_API', `Fehler beim Abrufen der DLSite-Informationen`, { dlsiteId }, error);
          // Grundlegende Informationen zurückgeben
          gameDetails = {
            title: `DLSite Game ${dlsiteId}`,
            dlsiteId: dlsiteId,
            source: 'DLSite'
          };
        }
      } else {
        logger.debug('DLSITE_DETECTION', 'Keine DLSite-ID im Pfad gefunden');
      }
    } else if (platform === 'steam') {
      logger.debug('STEAM_DETECTION', 'Suche nach Steam-App-ID');
      
      // Suche nach Steam-App-ID im Pfad oder in der steam_appid.txt Datei
      let steamAppId = null;
      
      // Suche nach steam_appid.txt
      const steamAppIdPath = path.join(selectedDir, 'steam_appid.txt');
      if (fs.existsSync(steamAppIdPath)) {
        try {
          steamAppId = fs.readFileSync(steamAppIdPath, 'utf8').trim();
          logger.info('STEAM_DETECTION', 'Steam App ID aus steam_appid.txt gelesen', { 
            steamAppId,
            filePath: steamAppIdPath 
          });
        } catch (error) {
          logger.error('STEAM_DETECTION', `Fehler beim Lesen der steam_appid.txt`, { 
            filePath: steamAppIdPath 
          }, error);
        }
      } else {
        logger.debug('STEAM_DETECTION', 'steam_appid.txt nicht gefunden');
      }
      
      if (steamAppId) {
        logger.info('STEAM_DETECTION', `Steam App ID gefunden: ${steamAppId}`);
        
        try {
          // Steam-Informationen abrufen können hier eingefügt werden
          
          gameDetails = {
            title: dirName,
            steamAppId: steamAppId,
            source: 'Steam'
          };
        } catch (error) {
          logger.error('STEAM_API', `Fehler beim Abrufen der Steam-Informationen`, { steamAppId }, error);
          gameDetails = {
            title: dirName,
            steamAppId: steamAppId,
            source: 'Steam'
          };
        }
      } else {
        logger.debug('STEAM_DETECTION', 'Keine Steam App ID gefunden');
      }
    }
    
    const selectionTime = logger.endTimer('select_game_folder');
    
    const result = { 
      success: true, 
      selectedFolder: selectedDir,
      executable: executable,
      executableList: executableFiles,
      gameDetails: gameDetails
    };
    
    logger.info('SELECT_FOLDER', 'Ordnerauswahl erfolgreich abgeschlossen', { 
      ...result,
      selectionTime: `${selectionTime.toFixed(2)}ms` 
    });
    
    return result;
  } catch (error) {
    logger.endTimer('select_game_folder');
    logger.error('SELECT_FOLDER', "Fehler bei der Ordnerauswahl", null, error);
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
  logger.startTimer('select_executable');
  logger.logIPC('select-executable', 'RECEIVE', { folderPath });
  
  try {
    const options = {
      title: 'Ausführbare Datei auswählen',
      defaultPath: folderPath,
      properties: ['openFile'],
      filters: appConfig.fileFilters.executables
    };
    
    logger.debug('SELECT_EXECUTABLE', 'Öffne Dateiauswahl-Dialog', { options });
    
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), options);
    
    if (canceled || filePaths.length === 0) {
      logger.info('SELECT_EXECUTABLE', 'Dateiauswahl abgebrochen vom Benutzer');
      return {
        success: false,
        message: "Auswahl abgebrochen"
      };
    }
    
    // Extrahiere den relativen Pfad zur ausführbaren Datei
    const selectedFile = path.relative(folderPath, filePaths[0]);
    
    const selectionTime = logger.endTimer('select_executable');
    
    logger.info('SELECT_EXECUTABLE', 'Ausführbare Datei ausgewählt', { 
      selectedFile,
      fullPath: filePaths[0],
      relativePath: selectedFile,
      selectionTime: `${selectionTime.toFixed(2)}ms` 
    });
    
    return {
      success: true,
      selectedFile: selectedFile,
      message: `Ausführbare Datei ausgewählt: ${selectedFile}`
    };
  } catch (error) {
    logger.endTimer('select_executable');
    logger.error('SELECT_EXECUTABLE', 'Fehler bei der Auswahl der ausführbaren Datei', { folderPath }, error);
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
  logger.startTimer('add_game');
  logger.logIPC('add-game-with-path', 'RECEIVE', { 
    gameTitle: gameInfo.title,
    gameFolder,
    executablePath 
  });
  
  try {
    // Verzeichnisnamen aus dem Pfad extrahieren
    const dirName = path.basename(gameFolder);
    
    logger.debug('ADD_GAME', 'Verarbeite Spielinformationen', { 
      dirName,
      gameFolder,
      executablePath,
      gameInfo: {
        title: gameInfo.title,
        source: gameInfo.source,
        dlsiteId: gameInfo.dlsiteId
      }
    });
    
    // Aktuelle Spielliste abrufen, um nächste ID zu bestimmen
    const existingGames = await scanGames();
    const nextId = existingGames.length + 1;
    
    logger.debug('ADD_GAME', 'ID-Generierung', { 
      existingGamesCount: existingGames.length,
      nextId 
    });
    
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
    
    logger.debug('ADD_GAME', 'Dustgrain-Objekt erstellt', { 
      id: dustgrain.internalId,
      title: dustgrain.title,
      source: dustgrain.source,
      dustgrainKeys: Object.keys(dustgrain) 
    });
    
    // Speichern der dustgrain-Datei
    logger.debug('ADD_GAME', 'Speichere dustgrain-Datei', { dirName });
    const success = fileManager.writeDustgrain(dirName, dustgrain);
    
    const addTime = logger.endTimer('add_game');
    
    if (success) {
      logger.logGameAction('ADD_GAME_SUCCESS', dustgrain.internalId, dustgrain.title, { 
        directory: dirName,
        addTime: `${addTime.toFixed(2)}ms` 
      });
      
      return { 
        success: true, 
        dustgrain,
        message: `Spiel "${dustgrain.title}" erfolgreich hinzugefügt.`
      };
    } else {
      logger.error('ADD_GAME', 'Fehler beim Speichern der Spielinformationen', { 
        dirName,
        addTime: `${addTime.toFixed(2)}ms` 
      });
      
      return { 
        success: false, 
        message: "Fehler beim Speichern der Spielinformationen"
      };
    }
  } catch (error) {
    logger.endTimer('add_game');
    logger.error('ADD_GAME', "Fehler beim Hinzufügen des Spiels", { 
      gameTitle: gameInfo.title,
      gameFolder,
      executablePath 
    }, error);
    
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
  logger.startTimer('add_multiple_games');
  logger.logIPC('add-multiple-games', 'RECEIVE', { gamesCount: games.length });
  
  try {
    let addedCount = 0;
    let errors = [];
    
    logger.info('ADD_MULTIPLE', `Beginne Hinzufügen von ${games.length} Spielen`);
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      logger.debug('ADD_MULTIPLE', `Verarbeite Spiel ${i + 1}/${games.length}`, { 
        title: game.title,
        directory: game.directory 
      });
      
      try {
        // Zielverzeichnis erstellen
        const dirName = path.basename(game.directory);
        
        // Wenn es eine DLSite-ID gibt, vollständige Informationen abrufen
        if (game.dlsiteId) {
          logger.debug('ADD_MULTIPLE', 'Rufe DLSite-Details ab', { dlsiteId: game.dlsiteId });
          
          try {
            const dlsiteClient = new DLSiteClient();
            const gameDetails = await dlsiteClient.getGameInfo(game.dlsiteId, 'maniax');
            
            // Grundlegende Informationen mit Details überschreiben
            Object.assign(game, gameDetails);
            
            logger.debug('ADD_MULTIPLE', 'DLSite-Details erfolgreich abgerufen', { 
              dlsiteId: game.dlsiteId,
              title: gameDetails.title 
            });
          } catch (dlsiteError) {
            logger.warn('ADD_MULTIPLE', `Konnte keine DLSite-Details für ${game.dlsiteId} abrufen`, { 
              dlsiteId: game.dlsiteId 
            }, dlsiteError);
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
        
        logger.debug('ADD_MULTIPLE', 'Speichere Spiel', { 
          dirName,
          title: dustgrain.title 
        });
        
        // Speichern der dustgrain-Datei
        const success = fileManager.writeDustgrain(dirName, dustgrain);
        if (success) {
          addedCount++;
          logger.debug('ADD_MULTIPLE', 'Spiel erfolgreich hinzugefügt', { 
            dirName,
            title: dustgrain.title 
          });
        } else {
          const errorMsg = `${game.title || 'Unbekannt'}: Fehler beim Speichern der Spielinformationen`;
          errors.push(errorMsg);
          logger.error('ADD_MULTIPLE', errorMsg, { dirName });
        }
      } catch (gameError) {
        const errorMsg = `${game.title || 'Unbekannt'}: ${gameError.message}`;
        errors.push(errorMsg);
        logger.error('ADD_MULTIPLE', `Fehler beim Hinzufügen des Spiels ${game.title || 'Unbekannt'}`, { 
          directory: game.directory 
        }, gameError);
      }
    }
    
    const addTime = logger.endTimer('add_multiple_games');
    
    logger.info('ADD_MULTIPLE', 'Mehrfach-Hinzufügen abgeschlossen', { 
      totalGames: games.length,
      addedCount,
      errorCount: errors.length,
      addTime: `${addTime.toFixed(2)}ms` 
    });
    
    return {
      success: true,
      addedCount,
      errorCount: errors.length,
      errors,
      message: `${addedCount} Spiele erfolgreich hinzugefügt${errors.length > 0 ? `, ${errors.length} Fehler` : ''}`
    };
  } catch (error) {
    logger.endTimer('add_multiple_games');
    logger.error('ADD_MULTIPLE', 'Fehler beim Hinzufügen mehrerer Spiele', { gamesCount: games.length }, error);
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
  logger.startTimer('update_game');
  logger.logIPC('update-game', 'RECEIVE', { gameDirectory, updateFields: Object.keys(updates) });
  
  try {
    logger.debug('UPDATE_GAME', 'Lade aktuelle Spielinformationen', { gameDirectory });
    
    // Spielinformationen lesen
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    
    if (!gameInfo) {
      logger.warn('UPDATE_GAME', 'Dustgrain-Datei nicht gefunden', { gameDirectory });
      return { 
        success: false, 
        message: "Dustgrain-Datei nicht gefunden" 
      };
    }
    
    logger.debug('UPDATE_GAME', 'Aktuelle Spielinfo geladen', { 
      gameDirectory,
      currentTitle: gameInfo.title,
      currentId: gameInfo.internalId 
    });
    
    // Aktualisiere die Felder
    const updatedInfo = { ...gameInfo, ...updates };
    
    logger.debug('UPDATE_GAME', 'Wende Updates an', { 
      gameDirectory,
      updates,
      updatedTitle: updatedInfo.title 
    });
    
    // Speichere die aktualisierte Datei
    const success = fileManager.writeDustgrain(gameDirectory, updatedInfo);
    
    const updateTime = logger.endTimer('update_game');
    
    if (success) {
      logger.logGameAction('UPDATE_GAME_SUCCESS', updatedInfo.internalId, updatedInfo.title, { 
        gameDirectory,
        updateFields: Object.keys(updates),
        updateTime: `${updateTime.toFixed(2)}ms` 
      });
      
      return { 
        success: true, 
        dustgrain: updatedInfo,
        message: "Spiel erfolgreich aktualisiert" 
      };
    } else {
      logger.error('UPDATE_GAME', 'Fehler beim Speichern der aktualisierten Spielinformationen', { 
        gameDirectory,
        updateTime: `${updateTime.toFixed(2)}ms` 
      });
      
      return { 
        success: false, 
        message: "Fehler beim Speichern der aktualisierten Spielinformationen" 
      };
    }
  } catch (error) {
    logger.endTimer('update_game');
    logger.error('UPDATE_GAME', "Fehler beim Aktualisieren des Spiels", { 
      gameDirectory,
      updates 
    }, error);
    
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
  logger.startTimer('delete_game');
  logger.logIPC('delete-game', 'RECEIVE', { gameDirectory });
  
  try {
    const gamePath = path.join(appConfig.gamesDirectoryPath, gameDirectory);
    
    logger.debug('DELETE_GAME', 'Prüfe Spielverzeichnis', { 
      gameDirectory,
      fullPath: gamePath 
    });
    
    if (!fs.existsSync(gamePath)) {
      logger.warn('DELETE_GAME', 'Spielverzeichnis nicht gefunden', { 
        gameDirectory,
        fullPath: gamePath 
      });
      
      return { 
        success: false, 
        message: "Spielverzeichnis nicht gefunden" 
      };
    }
    
    // Lade Spielinformationen vor dem Löschen für Logging
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    const gameTitle = gameInfo ? gameInfo.title : gameDirectory;
    const gameId = gameInfo ? gameInfo.internalId : null;
    
    logger.debug('DELETE_GAME', 'Beginne Löschvorgang', { 
      gameDirectory,
      gameTitle,
      gameId 
    });
    
    // Hier wird nur der Verweis in Dust gelöscht, nicht das eigentliche Spiel
    fs.rmSync(gamePath, { recursive: true, force: true });
    
    const deleteTime = logger.endTimer('delete_game');
    
    logger.logGameAction('DELETE_GAME_SUCCESS', gameId, gameTitle, { 
      gameDirectory,
      deleteTime: `${deleteTime.toFixed(2)}ms` 
    });
    
    return { 
      success: true, 
      message: "Spiel erfolgreich aus Dust entfernt" 
    };
  } catch (error) {
    logger.endTimer('delete_game');
    logger.error('DELETE_GAME', "Fehler beim Löschen des Spiels", { gameDirectory }, error);
    
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
  logger.startTimer('launch_game');
  logger.logIPC('launch-game', 'RECEIVE', { gameDirectory });
  
  try {
    logger.debug('LAUNCH_GAME', 'Lade Spielinformationen', { gameDirectory });
    
    // Spielinformationen lesen
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    
    if (!gameInfo) {
      logger.error('LAUNCH_GAME', 'Dustgrain-Datei nicht gefunden', { gameDirectory });
      return { 
        success: false, 
        message: "Dustgrain-Datei nicht gefunden"
      };
    }
    
    logger.debug('LAUNCH_GAME', 'Spielinformationen geladen', { 
      gameDirectory,
      title: gameInfo.title,
      executable: gameInfo.executable,
      executablePath: gameInfo.executablePath 
    });
    
    if (!gameInfo.executable || !gameInfo.executablePath) {
      logger.error('LAUNCH_GAME', 'Keine ausführbare Datei definiert', { 
        gameDirectory,
        title: gameInfo.title,
        executable: gameInfo.executable,
        executablePath: gameInfo.executablePath 
      });
      
      return { 
        success: false, 
        message: "Keine ausführbare Datei für dieses Spiel definiert"
      };
    }
    
    // Aktualisiere lastPlayed
    logger.debug('LAUNCH_GAME', 'Aktualisiere lastPlayed Zeitstempel');
    gameInfo.lastPlayed = new Date().toISOString();
    const success = fileManager.writeDustgrain(gameDirectory, gameInfo);
    
    if (!success) {
      logger.error('LAUNCH_GAME', 'Fehler beim Aktualisieren des Spiels vor dem Start', { 
        gameDirectory,
        title: gameInfo.title 
      });
      
      return { 
        success: false, 
        message: "Fehler beim Aktualisieren des Spiels vor dem Start"
      };
    }
    
    // Starte das Spiel
    const fullPath = path.join(gameInfo.executablePath, gameInfo.executable);
    
    logger.info('LAUNCH_GAME', 'Starte Spiel', { 
      gameDirectory,
      title: gameInfo.title,
      executable: gameInfo.executable,
      fullPath,
      workingDirectory: gameInfo.executablePath 
    });
    
    const child = spawn(fullPath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: gameInfo.executablePath
    });
    
    child.unref();
    
    const launchTime = logger.endTimer('launch_game');
    
    logger.logGameAction('LAUNCH_GAME_SUCCESS', gameInfo.internalId, gameInfo.title, { 
      gameDirectory,
      executable: gameInfo.executable,
      launchTime: `${launchTime.toFixed(2)}ms`,
      pid: child.pid 
    });
    
    return { 
      success: true, 
      message: `Spiel ${gameInfo.title} wird gestartet...`
    };
  } catch (error) {
    logger.endTimer('launch_game');
    logger.error('LAUNCH_GAME', "Fehler beim Starten des Spiels", { gameDirectory }, error);
    
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