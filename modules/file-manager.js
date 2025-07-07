const fs = require('fs');
const path = require('path');
const appConfig = require('../config/app-config');
const { getLogger } = require('./logger');

const logger = getLogger();

/**
 * Stellt sicher, dass alle benötigten Verzeichnisse existieren
 */
async function ensureDirectories() {
  logger.startTimer('ensure_directories');
  logger.info('FILE_MANAGER', 'Beginne Verzeichnis-Erstellung');
  
  const directories = [
    {
      path: appConfig.gamesDirectoryPath,
      name: 'Spieleverzeichnis'
    },
    {
      path: path.join(process.cwd(), 'assets', 'platforms'),
      name: 'Plattform-Icons-Verzeichnis'
    },
    {
      path: path.join(process.cwd(), 'assets', 'games'),
      name: 'Spiele-Assets-Verzeichnis'
    },
    {
      path: path.join(process.cwd(), 'logs'),
      name: 'Log-Verzeichnis'
    }
  ];
  
  let createdCount = 0;
  let existingCount = 0;
  
  for (const dir of directories) {
    try {
      if (!fs.existsSync(dir.path)) {
        logger.debug('FILE_MANAGER', `Erstelle ${dir.name}`, { path: dir.path });
        fs.mkdirSync(dir.path, { recursive: true });
        logger.logFileOperation('CREATE_DIRECTORY', dir.path, true);
        createdCount++;
        logger.info('FILE_MANAGER', `${dir.name} erfolgreich erstellt`, { path: dir.path });
      } else {
        logger.debug('FILE_MANAGER', `${dir.name} bereits vorhanden`, { path: dir.path });
        existingCount++;
      }
    } catch (error) {
      logger.error('FILE_MANAGER', `Fehler beim Erstellen von ${dir.name}`, { path: dir.path }, error);
      logger.logFileOperation('CREATE_DIRECTORY', dir.path, false, error);
    }
  }
  
  const ensureTime = logger.endTimer('ensure_directories');
  
  logger.info('FILE_MANAGER', 'Verzeichnis-Erstellung abgeschlossen', {
    totalDirectories: directories.length,
    created: createdCount,
    existing: existingCount,
    ensureTime: `${ensureTime.toFixed(2)}ms`
  });
}

/**
 * Liest den Inhalt einer dustgrain.json-Datei
 * @param {string} gameDirectory - Das Spieleverzeichnis
 * @returns {Object|null} Die Spieleinformationen oder null bei Fehler
 */
function readDustgrain(gameDirectory) {
  logger.startTimer(`read_dustgrain_${gameDirectory}`);
  logger.debug('FILE_MANAGER', 'Lese dustgrain.json', { gameDirectory });
  
  try {
    const dustgrainPath = path.join(appConfig.gamesDirectoryPath, gameDirectory, 'dustgrain.json');
    
    logger.trace('FILE_MANAGER', 'Prüfe dustgrain.json Existenz', { 
      dustgrainPath,
      exists: fs.existsSync(dustgrainPath) 
    });
    
    if (!fs.existsSync(dustgrainPath)) {
      logger.debug('FILE_MANAGER', 'dustgrain.json nicht gefunden', { 
        gameDirectory,
        dustgrainPath 
      });
      return null;
    }
    
    logger.debug('FILE_MANAGER', 'Lese dustgrain.json Datei', { dustgrainPath });
    const data = fs.readFileSync(dustgrainPath, 'utf8');
    
    logger.trace('FILE_MANAGER', 'dustgrain.json Datei gelesen', { 
      gameDirectory,
      dataLength: data.length 
    });
    
    const gameInfo = JSON.parse(data);
    
    // Validiere grundlegende Struktur
    if (!gameInfo || typeof gameInfo !== 'object') {
      throw new Error('Ungültige dustgrain.json Struktur');
    }
    
    // Verzeichnisinformationen hinzufügen
    gameInfo.directory = gameDirectory;
    
    const readTime = logger.endTimer(`read_dustgrain_${gameDirectory}`);
    
    logger.debug('FILE_MANAGER', 'dustgrain.json erfolgreich gelesen', { 
      gameDirectory,
      title: gameInfo.title,
      internalId: gameInfo.internalId,
      source: gameInfo.source,
      readTime: `${readTime.toFixed(2)}ms`,
      fieldsCount: Object.keys(gameInfo).length
    });
    
    logger.logFileOperation('READ_FILE', dustgrainPath, true);
    
    return gameInfo;
  } catch (error) {
    logger.endTimer(`read_dustgrain_${gameDirectory}`);
    logger.error('FILE_MANAGER', `Fehler beim Lesen von ${gameDirectory}/dustgrain.json`, { 
      gameDirectory 
    }, error);
    
    const dustgrainPath = path.join(appConfig.gamesDirectoryPath, gameDirectory, 'dustgrain.json');
    logger.logFileOperation('READ_FILE', dustgrainPath, false, error);
    
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
  logger.startTimer(`write_dustgrain_${gameDirectory}`);
  logger.debug('FILE_MANAGER', 'Schreibe dustgrain.json', { 
    gameDirectory,
    title: gameInfo.title,
    internalId: gameInfo.internalId 
  });
  
  try {
    // Validiere Eingabeparameter
    if (!gameDirectory || typeof gameDirectory !== 'string') {
      throw new Error('Ungültiger gameDirectory Parameter');
    }
    
    if (!gameInfo || typeof gameInfo !== 'object') {
      throw new Error('Ungültige gameInfo Parameter');
    }
    
    const gameDir = path.join(appConfig.gamesDirectoryPath, gameDirectory);
    
    logger.trace('FILE_MANAGER', 'Prüfe/erstelle Spielverzeichnis', { 
      gameDir,
      exists: fs.existsSync(gameDir) 
    });
    
    // Verzeichnis erstellen, falls es nicht existiert
    if (!fs.existsSync(gameDir)) {
      logger.debug('FILE_MANAGER', 'Erstelle Spielverzeichnis', { gameDir });
      fs.mkdirSync(gameDir, { recursive: true });
      logger.logFileOperation('CREATE_DIRECTORY', gameDir, true);
    }
    
    // Erstelle Backup der existierenden Datei
    const dustgrainPath = path.join(gameDir, 'dustgrain.json');
    if (fs.existsSync(dustgrainPath)) {
      const backupPath = path.join(gameDir, `dustgrain.json.backup.${Date.now()}`);
      try {
        fs.copyFileSync(dustgrainPath, backupPath);
        logger.debug('FILE_MANAGER', 'Backup der existierenden dustgrain.json erstellt', { 
          original: dustgrainPath,
          backup: backupPath 
        });
      } catch (backupError) {
        logger.warn('FILE_MANAGER', 'Konnte kein Backup erstellen', { dustgrainPath }, backupError);
      }
    }
    
    // Füge Metadaten hinzu
    const enrichedGameInfo = {
      ...gameInfo,
      lastModified: new Date().toISOString(),
      dustVersion: gameInfo.dustVersion || "1.0"
    };
    
    logger.trace('FILE_MANAGER', 'Schreibe JSON-Daten', { 
      dustgrainPath,
      fieldsCount: Object.keys(enrichedGameInfo).length 
    });
    
    // Schreibe die Datei mit Pretty-Print für bessere Lesbarkeit
    const jsonData = JSON.stringify(enrichedGameInfo, null, 2);
    fs.writeFileSync(dustgrainPath, jsonData, 'utf8');
    
    const writeTime = logger.endTimer(`write_dustgrain_${gameDirectory}`);
    
    logger.info('FILE_MANAGER', 'dustgrain.json erfolgreich geschrieben', { 
      gameDirectory,
      dustgrainPath,
      title: enrichedGameInfo.title,
      fileSize: jsonData.length,
      writeTime: `${writeTime.toFixed(2)}ms` 
    });
    
    logger.logFileOperation('WRITE_FILE', dustgrainPath, true);
    
    return true;
  } catch (error) {
    logger.endTimer(`write_dustgrain_${gameDirectory}`);
    logger.error('FILE_MANAGER', `Fehler beim Schreiben von ${gameDirectory}/dustgrain.json`, { 
      gameDirectory,
      title: gameInfo?.title 
    }, error);
    
    const dustgrainPath = path.join(appConfig.gamesDirectoryPath, gameDirectory, 'dustgrain.json');
    logger.logFileOperation('WRITE_FILE', dustgrainPath, false, error);
    
    return false;
  }
}

/**
 * Sucht ausführbare Dateien in einem Verzeichnis
 * @param {string} directory - Das zu durchsuchende Verzeichnis
 * @returns {string[]} Liste der gefundenen ausführbaren Dateien
 */
function findExecutables(directory) {
  logger.startTimer(`find_executables_${path.basename(directory)}`);
  logger.debug('FILE_MANAGER', 'Suche ausführbare Dateien', { directory });
  
  try {
    if (!fs.existsSync(directory)) {
      logger.warn('FILE_MANAGER', 'Verzeichnis existiert nicht', { directory });
      return [];
    }
    
    logger.trace('FILE_MANAGER', 'Lese Verzeichnisinhalt', { directory });
    const files = fs.readdirSync(directory);
    const platform = process.platform;
    let execExtensions = [];
    
    logger.debug('FILE_MANAGER', 'Erkannte Plattform', { platform });
    
    // Plattformspezifische Erweiterungen auswählen
    if (appConfig.executableTypes && appConfig.executableTypes[platform]) {
      execExtensions = appConfig.executableTypes[platform];
      logger.debug('FILE_MANAGER', 'Plattformspezifische Erweiterungen geladen', { 
        platform,
        extensions: execExtensions 
      });
    } else {
      // Fallback: Alle bekannten ausführbaren Dateitypen
      if (appConfig.executableTypes) {
        execExtensions = [
          ...(appConfig.executableTypes.win32 || []),
          ...(appConfig.executableTypes.darwin || []),
          ...(appConfig.executableTypes.linux || [])
        ];
        logger.debug('FILE_MANAGER', 'Fallback-Erweiterungen verwendet', { 
          platform,
          extensions: execExtensions 
        });
      } else {
        // Hardcore Fallback
        execExtensions = ['.exe', '.app', '.deb', '.run', ''];
        logger.warn('FILE_MANAGER', 'Keine Konfiguration gefunden, verwende Hardcore-Fallback', { 
          extensions: execExtensions 
        });
      }
    }
    
    logger.trace('FILE_MANAGER', 'Filtere Dateien nach Erweiterungen', { 
      totalFiles: files.length,
      extensions: execExtensions 
    });
    
    // Filter auf Basis der Dateierweiterungen
    const executableFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      const isExecutable = execExtensions.includes(ext) || 
                          (platform === 'linux' && ext === '' && !file.includes('.'));
      
      if (isExecutable) {
        logger.trace('FILE_MANAGER', 'Ausführbare Datei gefunden', { 
          file,
          extension: ext,
          platform 
        });
      }
      
      return isExecutable;
    });
    
    const searchTime = logger.endTimer(`find_executables_${path.basename(directory)}`);
    
    logger.info('FILE_MANAGER', 'Suche nach ausführbaren Dateien abgeschlossen', { 
      directory,
      totalFiles: files.length,
      executableFiles: executableFiles.length,
      executables: executableFiles,
      searchTime: `${searchTime.toFixed(2)}ms` 
    });
    
    return executableFiles;
  } catch (error) {
    logger.endTimer(`find_executables_${path.basename(directory)}`);
    logger.error('FILE_MANAGER', `Fehler beim Suchen nach ausführbaren Dateien in ${directory}`, { 
      directory 
    }, error);
    return [];
  }
}

/**
 * Validiert eine dustgrain.json Datei
 * @param {Object} gameInfo - Die zu validierende Spielinformation
 * @returns {Object} Validierungsergebnis mit success und errors
 */
function validateDustgrain(gameInfo) {
  logger.debug('FILE_MANAGER', 'Validiere dustgrain.json', { 
    title: gameInfo?.title,
    hasInfo: !!gameInfo 
  });
  
  const errors = [];
  const warnings = [];
  
  // Pflichtfelder prüfen
  const requiredFields = ['title', 'executablePath'];
  requiredFields.forEach(field => {
    if (!gameInfo[field]) {
      errors.push(`Pflichtfeld fehlt: ${field}`);
    }
  });
  
  // Optionale aber empfohlene Felder
  const recommendedFields = ['developer', 'genre', 'description'];
  recommendedFields.forEach(field => {
    if (!gameInfo[field]) {
      warnings.push(`Empfohlenes Feld fehlt: ${field}`);
    }
  });
  
  // Datentyp-Validierung
  if (gameInfo.internalId && typeof gameInfo.internalId !== 'number') {
    errors.push('internalId muss eine Zahl sein');
  }
  
  if (gameInfo.tags && !Array.isArray(gameInfo.tags)) {
    errors.push('tags muss ein Array sein');
  }
  
  if (gameInfo.playTime && typeof gameInfo.playTime !== 'number') {
    errors.push('playTime muss eine Zahl sein');
  }
  
  const isValid = errors.length === 0;
  
  logger.debug('FILE_MANAGER', 'Dustgrain-Validierung abgeschlossen', { 
    title: gameInfo?.title,
    isValid,
    errorCount: errors.length,
    warningCount: warnings.length 
  });
  
  return {
    success: isValid,
    errors,
    warnings
  };
}

/**
 * Bereinigt verwaiste dustgrain.json Dateien
 * @returns {Object} Bereinigungsergebnis
 */
function cleanupOrphanedDustgrains() {
  logger.startTimer('cleanup_orphaned_dustgrains');
  logger.info('FILE_MANAGER', 'Beginne Bereinigung verwaister dustgrain-Dateien');
  
  try {
    if (!fs.existsSync(appConfig.gamesDirectoryPath)) {
      logger.warn('FILE_MANAGER', 'Spieleverzeichnis existiert nicht', { 
        path: appConfig.gamesDirectoryPath 
      });
      return { success: false, message: 'Spieleverzeichnis nicht gefunden' };
    }
    
    const gameDirectories = fs.readdirSync(appConfig.gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(appConfig.gamesDirectoryPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    let cleanedCount = 0;
    let errorCount = 0;
    const cleanedDirs = [];
    
    for (const dir of gameDirectories) {
      try {
        const dustgrainPath = path.join(appConfig.gamesDirectoryPath, dir, 'dustgrain.json');
        
        if (fs.existsSync(dustgrainPath)) {
          const gameInfo = readDustgrain(dir);
          
          if (!gameInfo) {
            logger.warn('FILE_MANAGER', 'Ungültige dustgrain.json gefunden', { dir });
            continue;
          }
          
          // Prüfe ob die ausführbare Datei noch existiert
          if (gameInfo.executablePath && gameInfo.executable) {
            const execPath = path.join(gameInfo.executablePath, gameInfo.executable);
            
            if (!fs.existsSync(execPath)) {
              logger.info('FILE_MANAGER', 'Verwaiste dustgrain.json gefunden - ausführbare Datei existiert nicht', { 
                dir,
                execPath 
              });
              
              // Lösche das Verzeichnis
              fs.rmSync(path.join(appConfig.gamesDirectoryPath, dir), { recursive: true, force: true });
              cleanedCount++;
              cleanedDirs.push(dir);
              
              logger.logFileOperation('DELETE_DIRECTORY', path.join(appConfig.gamesDirectoryPath, dir), true);
            }
          }
        }
      } catch (error) {
        logger.error('FILE_MANAGER', `Fehler beim Bereinigen von ${dir}`, { dir }, error);
        errorCount++;
      }
    }
    
    const cleanupTime = logger.endTimer('cleanup_orphaned_dustgrains');
    
    logger.info('FILE_MANAGER', 'Bereinigung verwaister dustgrain-Dateien abgeschlossen', { 
      totalDirectories: gameDirectories.length,
      cleanedCount,
      errorCount,
      cleanedDirs,
      cleanupTime: `${cleanupTime.toFixed(2)}ms` 
    });
    
    return {
      success: true,
      cleanedCount,
      errorCount,
      cleanedDirectories: cleanedDirs,
      message: `${cleanedCount} verwaiste Einträge bereinigt`
    };
  } catch (error) {
    logger.endTimer('cleanup_orphaned_dustgrains');
    logger.error('FILE_MANAGER', 'Fehler bei der Bereinigung verwaister dustgrain-Dateien', null, error);
    
    return {
      success: false,
      message: `Fehler bei der Bereinigung: ${error.message}`
    };
  }
}

/**
 * Erstellt eine Sicherungskopie aller dustgrain-Dateien
 * @param {string} backupPath - Pfad für die Sicherung
 * @returns {Object} Sicherungsergebnis
 */
function backupAllDustgrains(backupPath) {
  logger.startTimer('backup_all_dustgrains');
  logger.info('FILE_MANAGER', 'Beginne Sicherung aller dustgrain-Dateien', { backupPath });
  
  try {
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
      logger.logFileOperation('CREATE_DIRECTORY', backupPath, true);
    }
    
    const gameDirectories = fs.readdirSync(appConfig.gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(appConfig.gamesDirectoryPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    let backedUpCount = 0;
    let errorCount = 0;
    
    for (const dir of gameDirectories) {
      try {
        const dustgrainPath = path.join(appConfig.gamesDirectoryPath, dir, 'dustgrain.json');
        
        if (fs.existsSync(dustgrainPath)) {
          const backupFilePath = path.join(backupPath, `${dir}_dustgrain.json`);
          fs.copyFileSync(dustgrainPath, backupFilePath);
          backedUpCount++;
          
          logger.logFileOperation('COPY_FILE', `${dustgrainPath} -> ${backupFilePath}`, true);
        }
      } catch (error) {
        logger.error('FILE_MANAGER', `Fehler beim Sichern von ${dir}`, { dir }, error);
        errorCount++;
      }
    }
    
    const backupTime = logger.endTimer('backup_all_dustgrains');
    
    logger.info('FILE_MANAGER', 'Sicherung aller dustgrain-Dateien abgeschlossen', { 
      backupPath,
      totalDirectories: gameDirectories.length,
      backedUpCount,
      errorCount,
      backupTime: `${backupTime.toFixed(2)}ms` 
    });
    
    return {
      success: true,
      backedUpCount,
      errorCount,
      message: `${backedUpCount} dustgrain-Dateien gesichert`
    };
  } catch (error) {
    logger.endTimer('backup_all_dustgrains');
    logger.error('FILE_MANAGER', 'Fehler bei der Sicherung', { backupPath }, error);
    
    return {
      success: false,
      message: `Fehler bei der Sicherung: ${error.message}`
    };
  }
}

/**
 * Gibt Statistiken über alle dustgrain-Dateien zurück
 * @returns {Object} Statistiken
 */
function getDustgrainStats() {
  logger.debug('FILE_MANAGER', 'Sammle dustgrain-Statistiken');
  
  try {
    if (!fs.existsSync(appConfig.gamesDirectoryPath)) {
      return { totalGames: 0, validGames: 0, invalidGames: 0, sources: {} };
    }
    
    const gameDirectories = fs.readdirSync(appConfig.gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(appConfig.gamesDirectoryPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    let validGames = 0;
    let invalidGames = 0;
    const sources = {};
    const genres = {};
    
    for (const dir of gameDirectories) {
      try {
        const gameInfo = readDustgrain(dir);
        
        if (gameInfo) {
          validGames++;
          
          // Quellen zählen
          const source = gameInfo.source || 'Unknown';
          sources[source] = (sources[source] || 0) + 1;
          
          // Genres zählen
          const genre = gameInfo.genre || 'Unknown';
          genres[genre] = (genres[genre] || 0) + 1;
        } else {
          invalidGames++;
        }
      } catch (error) {
        invalidGames++;
        logger.trace('FILE_MANAGER', `Fehler beim Lesen von ${dir} für Statistiken`, { dir });
      }
    }
    
    const stats = {
      totalGames: validGames + invalidGames,
      validGames,
      invalidGames,
      sources,
      genres,
      directories: gameDirectories.length
    };
    
    logger.debug('FILE_MANAGER', 'dustgrain-Statistiken gesammelt', stats);
    
    return stats;
  } catch (error) {
    logger.error('FILE_MANAGER', 'Fehler beim Sammeln der dustgrain-Statistiken', null, error);
    
    return {
      totalGames: 0,
      validGames: 0,
      invalidGames: 0,
      sources: {},
      genres: {},
      error: error.message
    };
  }
}

module.exports = {
  ensureDirectories,
  readDustgrain,
  writeDustgrain,
  findExecutables,
  validateDustgrain,
  cleanupOrphanedDustgrains,
  backupAllDustgrains,
  getDustgrainStats
};