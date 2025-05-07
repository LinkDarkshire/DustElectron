const path = require('path');
const fs = require('fs');
const appConfig = require('../config/app-config');
const DLSiteClient = require('../platforms/dlsite-api');
// Diese Clients müssen noch implementiert werden
// const SteamClient = require('../platforms/steam-api');
// const ItchIOClient = require('../platforms/itchio-api');

/**
 * Ruft Spieldetails von DLSite ab
 * @param {Event} event - Das IPC Event
 * @param {string} dlsiteId - Die DLSite-ID
 * @param {string} category - Die DLSite-Kategorie
 * @param {number} internalId - Optionale interne ID für die Benennung von Assets
 * @returns {Object} Die Spieldetails
 */
async function fetchDLSiteGameDetails(event, dlsiteId, category = 'maniax', internalId = null) {
    try {
      console.log(`Suche DLSite-Spiel mit ID: ${dlsiteId}, Kategorie: ${category}, Interne ID: ${internalId}`);
      
      // Initialisiere den DLSite Client
      const dlsiteClient = new DLSiteClient();
      
      // Spielinformationen abrufen (mit optionaler interner ID)
      const gameInfo = await dlsiteClient.getGameInfo(dlsiteId, category, internalId);
      
      console.log(`DLSite-Spiel gefunden: ${gameInfo.title}`);
      
      return gameInfo;
    } catch (error) {
      console.error('Fehler beim Abrufen der DLSite-Spieldetails:', error);
      
      // Fehlerfall: Minimale Informationen zurückgeben
      return {
        title: `DLSite Game ${dlsiteId}`,
        developer: "Unbekannter Entwickler",
        publisher: "DLSite",
        genre: "Visual Novel",
        description: `Ein Spiel von DLSite mit der ID ${dlsiteId}`,
        coverImage: "",
        source: "DLSite",
        dlsiteId: dlsiteId
      };
    }
  }

/**
 * Ruft Spieldetails von Steam ab
 * @param {Event} event - Das IPC Event
 * @param {string} appId - Die Steam App-ID
 * @returns {Object} Die Spieldetails
 */
async function fetchSteamGameDetails(event, appId) {
  try {
    console.log(`Suche Steam-Spiel mit ID: ${appId}`);
    
    // TODO: Steam-API-Client implementieren
    // const steamClient = new SteamClient();
    // const gameInfo = await steamClient.getGameInfo(appId);
    
    // Vorläufige Implementierung:
    const gameInfo = {
      title: `Steam Game ${appId}`,
      developer: "Unbekannter Entwickler",
      publisher: "Steam",
      genre: "Sonstiges",
      description: `Ein Spiel von Steam mit der ID ${appId}`,
      coverImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      source: "Steam",
      steamAppId: appId
    };
    
    console.log(`Steam-Spiel gefunden: ${gameInfo.title}`);
    
    return gameInfo;
  } catch (error) {
    console.error('Fehler beim Abrufen der Steam-Spieldetails:', error);
    
    // Fehlerfall: Minimale Informationen zurückgeben
    return {
      title: `Steam Game ${appId}`,
      developer: "Unbekannter Entwickler",
      publisher: "Steam",
      genre: "Sonstiges",
      description: `Ein Spiel von Steam mit der ID ${appId}`,
      coverImage: "",
      source: "Steam",
      steamAppId: appId
    };
  }
}

/**
 * Ruft Spieldetails von Itch.io ab
 * @param {Event} event - Das IPC Event
 * @param {string} url - Die Itch.io-URL
 * @returns {Object} Die Spieldetails
 */
async function fetchItchioGameDetails(event, url) {
  try {
    console.log(`Suche Itch.io-Spiel mit URL: ${url}`);
    
    // TODO: Itch.io-API-Client implementieren
    // const itchioClient = new ItchIOClient();
    // const gameInfo = await itchioClient.getGameInfo(url);
    
    // Vorläufige Implementierung:
    const gameInfo = {
      title: "Itch.io Game",
      developer: "Unbekannter Entwickler",
      publisher: "Itch.io",
      genre: "Indie",
      description: `Ein Spiel von Itch.io mit der URL ${url}`,
      coverImage: "",
      source: "Itch.io",
      itchioUrl: url
    };
    
    console.log(`Itch.io-Spiel gefunden: ${gameInfo.title}`);
    
    return gameInfo;
  } catch (error) {
    console.error('Fehler beim Abrufen der Itch.io-Spieldetails:', error);
    
    // Fehlerfall: Minimale Informationen zurückgeben
    return {
      title: "Itch.io Game",
      developer: "Unbekannter Entwickler",
      publisher: "Itch.io",
      genre: "Indie",
      description: `Ein Spiel von Itch.io mit der URL ${url}`,
      coverImage: "",
      source: "Itch.io",
      itchioUrl: url
    };
  }
}

/**
 * Scannt einen Ordner nach Spielen basierend auf der Plattform
 * @param {Event} event - Das IPC Event
 * @param {string} folderPath - Der zu scannende Ordner
 * @param {string} platform - Die Spieleplattform
 * @returns {Object} Das Ergebnis des Scans
 */
async function scanFolderForGames(event, folderPath, platform) {
  try {
    console.log(`Scanne Ordner nach ${platform}-Spielen: ${folderPath}`);
    
    let result = {
      success: false,
      games: [],
      message: "Keine Spiele gefunden"
    };
    
    // Je nach Plattform unterschiedliche Scan-Logik anwenden
    switch (platform.toLowerCase()) {
      case 'dlsite':
        return await scanFolderForDLSiteGames(folderPath);
      case 'steam':
        return await scanFolderForSteamGames(folderPath);
      case 'itchio':
        return await scanFolderForItchioGames(folderPath);
      default:
        // Generischer Scan für "andere" Plattformen
        return await scanFolderForGenericGames(folderPath);
    }
  } catch (error) {
    console.error(`Fehler beim Scannen des Ordners nach ${platform}-Spielen:`, error);
    return {
      success: false,
      games: [],
      message: `Fehler: ${error.message}`
    };
  }
}

/**
 * Scannt einen Ordner nach DLSite-Spielen
 * @param {string} folderPath - Der zu scannende Ordner
 * @returns {Object} Das Ergebnis des Scans
 */
async function scanFolderForDLSiteGames(folderPath) {
    try {
      // Liste aller Verzeichnisse im ausgewählten Ordner
      const directories = fs.readdirSync(folderPath)
        .filter(file => {
          const fullPath = path.join(folderPath, file);
          return fs.statSync(fullPath).isDirectory();
        });
      
      // Ergebnisliste für gefundene Spiele
      const foundGames = [];
      
      // DLSite-Client für die API-Anfragen
      const dlsiteClient = new DLSiteClient();
      
      // Versuche in jedem Unterordner ein DLSite-Spiel zu finden
      for (const dir of directories) {
        try {
          const dirPath = path.join(folderPath, dir);
          
          // Versuche zuerst, eine DLSite-ID direkt aus dem Pfad zu extrahieren
          let dlsiteId = dlsiteClient.extractDLSiteIdFromPath(dirPath);
          
          // Wenn keine ID im Pfad gefunden wurde, versuche sie im Verzeichnisnamen zu finden
          if (!dlsiteId) {
            try {
              dlsiteId = dlsiteClient.findProductId(dir);
            } catch (idError) {
              // Keine DLSite-ID im Verzeichnisname gefunden
              // Suche nach einer ausführbaren Datei
              const files = fs.readdirSync(dirPath);
              const executables = files.filter(file => 
                file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
                (process.platform === 'darwin' && file.endsWith('.app')) ||
                (process.platform === 'linux' && !file.includes('.'))
              );
              
              // Wenn ausführbare Dateien gefunden wurden, prüfe deren Namen auf DLSite-IDs
              for (const exe of executables) {
                try {
                  dlsiteId = dlsiteClient.findProductId(exe);
                  if (dlsiteId) break;
                } catch (exeIdError) {
                  // Ignorieren und weitermachen
                }
              }
            }
          }
          
          // Wenn eine DLSite-ID gefunden wurde
          if (dlsiteId) {
            console.log(`DLSite-ID gefunden im Verzeichnis ${dir}: ${dlsiteId}`);
            
            // Suche nach ausführbaren Dateien
            const files = fs.readdirSync(dirPath);
            const executables = files.filter(file => 
              file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
              (process.platform === 'darwin' && file.endsWith('.app')) ||
              (process.platform === 'linux' && !file.includes('.'))
            );
            
            // Wähle die erste ausführbare Datei oder leer wenn keine gefunden wurde
            const executable = executables.length > 0 ? executables[0] : '';
            
            // Versuche, grundlegende Informationen über die DLSite-API zu erhalten
            try {
              // Hole Minimalinfos von der API (kein vollständiger Details-Abruf, um die Scan-Zeit zu minimieren)
              const basicInfo = await dlsiteClient.getProductInfo(dlsiteId);
              
              foundGames.push({
                title: basicInfo.work_name || `DLSite Game ${dlsiteId}`,
                developer: basicInfo.maker_name || "Unbekannter Entwickler",
                publisher: "DLSite",
                genre: "Visual Novel",
                dlsiteId: dlsiteId,
                directory: dirPath,
                executable: executable,
                executablePath: dirPath,
                source: 'DLSite',
                installed: true
              });
            } catch (apiError) {
              console.warn(`Konnte keine API-Details für ${dlsiteId} abrufen:`, apiError);
              
              // Fallback auf minimale Informationen
              foundGames.push({
                title: `DLSite Game ${dlsiteId}`,
                dlsiteId: dlsiteId,
                directory: dirPath,
                executable: executable,
                executablePath: dirPath,
                genre: 'Visual Novel',
                source: 'DLSite',
                installed: true
              });
            }
          }
        } catch (dirError) {
          console.warn(`Fehler beim Scannen des Verzeichnisses ${dir}:`, dirError);
        }
      }
      
      return {
        success: true,
        games: foundGames,
        message: `${foundGames.length} DLSite-Spiele gefunden`
      };
    } catch (error) {
      console.error('Fehler beim Scannen des Ordners nach DLSite-Spielen:', error);
      return {
        success: false,
        games: [],
        message: `Fehler: ${error.message}`
      };
    }
  }

/**
 * Scannt einen Ordner nach Steam-Spielen
 * @param {string} folderPath - Der zu scannende Ordner
 * @returns {Object} Das Ergebnis des Scans
 */
async function scanFolderForSteamGames(folderPath) {
  try {
    // Liste aller Verzeichnisse im ausgewählten Ordner
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Ergebnisliste für gefundene Spiele
    const foundGames = [];
    
    // Versuche in jedem Unterordner ein Steam-Spiel zu finden
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // Suche nach steam_api.dll oder steam_api64.dll, um festzustellen, ob es ein Steam-Spiel ist
        const files = fs.readdirSync(dirPath);
        const isSteamGame = files.some(file => 
          file === 'steam_api.dll' || file === 'steam_api64.dll' || file === 'steam_appid.txt'
        );
        
        if (isSteamGame) {
          console.log(`Steam-Spiel gefunden im Verzeichnis ${dir}`);
          
          // Versuche, die Steam App ID zu finden
          let steamAppId = null;
          
          // Prüfe, ob die steam_appid.txt vorhanden ist
          if (files.includes('steam_appid.txt')) {
            try {
              const appIdContent = fs.readFileSync(path.join(dirPath, 'steam_appid.txt'), 'utf8');
              steamAppId = appIdContent.trim();
            } catch (readError) {
              console.warn(`Konnte steam_appid.txt nicht lesen: ${readError.message}`);
            }
          }
          
          // Suche nach ausführbaren Dateien
          const executables = files.filter(file => 
            file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
            (process.platform === 'darwin' && file.endsWith('.app')) ||
            (process.platform === 'linux' && !file.includes('.'))
          );
          
          // Wähle die erste ausführbare Datei oder leer wenn keine gefunden wurde
          const executable = executables.length > 0 ? executables[0] : '';
          
          // Grundlegende Informationen
          const gameInfo = {
            title: dir, // Verzeichnisname als Standardtitel
            directory: dirPath,
            executable: executable,
            executablePath: dirPath,
            genre: 'Sonstiges',
            source: 'Steam',
            steamAppId: steamAppId,
            installed: true
          };
          
          // Wenn eine Steam App ID verfügbar ist, versuche weitere Informationen zu holen
          if (steamAppId) {
            try {
              // TODO: Steam-Details abrufen
              // const steamClient = new SteamClient();
              // const details = await steamClient.getGameInfo(steamAppId);
              // Object.assign(gameInfo, details);
              
              console.log(`Steam App ID gefunden: ${steamAppId}`);
            } catch (steamError) {
              console.warn(`Konnte keine Steam-Details für ${steamAppId} abrufen:`, steamError);
            }
          }
          
          foundGames.push(gameInfo);
        }
      } catch (dirError) {
        console.warn(`Fehler beim Scannen des Verzeichnisses ${dir}:`, dirError);
      }
    }
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} Steam-Spiele gefunden`
    };
  } catch (error) {
    console.error('Fehler beim Scannen des Ordners nach Steam-Spielen:', error);
    return {
      success: false,
      games: [],
      message: `Fehler: ${error.message}`
    };
  }
}

/**
 * Scannt einen Ordner nach Itch.io-Spielen
 * @param {string} folderPath - Der zu scannende Ordner
 * @returns {Object} Das Ergebnis des Scans
 */
async function scanFolderForItchioGames(folderPath) {
  try {
    // Liste aller Verzeichnisse im ausgewählten Ordner
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Ergebnisliste für gefundene Spiele
    const foundGames = [];
    
    // Versuche in jedem Unterordner ein Itch.io-Spiel zu finden
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // Suche nach der .itch-Datei, die Itch.io-Spiele normalerweise enthalten
        const files = fs.readdirSync(dirPath);
        const isItchioGame = files.some(file => file === '.itch' || dir.toLowerCase().includes('itch.io'));
        
        if (isItchioGame) {
          console.log(`Itch.io-Spiel gefunden im Verzeichnis ${dir}`);
          
          // Suche nach ausführbaren Dateien
          const executables = files.filter(file => 
            file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
            (process.platform === 'darwin' && file.endsWith('.app')) ||
            (process.platform === 'linux' && !file.includes('.'))
          );
          
          // Wähle die erste ausführbare Datei oder leer wenn keine gefunden wurde
          const executable = executables.length > 0 ? executables[0] : '';
          
          // Extrahiere itch.io URL wenn möglich
          let itchioUrl = null;
          
          // Versuche die .itch-Datei zu lesen, um die URL zu finden
          if (files.includes('.itch')) {
            try {
              const itchContent = fs.readFileSync(path.join(dirPath, '.itch'), 'utf8');
              const urlMatch = itchContent.match(/https?:\/\/[^\s"]+itch\.io\/[^\s"]+/);
              if (urlMatch) {
                itchioUrl = urlMatch[0];
              }
            } catch (readError) {
              console.warn(`Konnte .itch-Datei nicht lesen: ${readError.message}`);
            }
          }
          
          foundGames.push({
            title: dir, // Verzeichnisname als Standardtitel
            directory: dirPath,
            executable: executable,
            executablePath: dirPath,
            genre: 'Indie',
            source: 'Itch.io',
            itchioUrl: itchioUrl,
            installed: true
          });
        }
      } catch (dirError) {
        console.warn(`Fehler beim Scannen des Verzeichnisses ${dir}:`, dirError);
      }
    }
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} Itch.io-Spiele gefunden`
    };
  } catch (error) {
    console.error('Fehler beim Scannen des Ordners nach Itch.io-Spielen:', error);
    return {
      success: false,
      games: [],
      message: `Fehler: ${error.message}`
    };
  }
}

/**
 * Scannt einen Ordner nach generischen Spielen
 * @param {string} folderPath - Der zu scannende Ordner
 * @returns {Object} Das Ergebnis des Scans
 */
async function scanFolderForGenericGames(folderPath) {
  try {
    // Liste aller Verzeichnisse im ausgewählten Ordner
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Ergebnisliste für gefundene Spiele
    const foundGames = [];
    
    // Jeden Unterordner als potenzielles Spiel behandeln
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // Suche nach ausführbaren Dateien
        const files = fs.readdirSync(dirPath);
        const executables = files.filter(file => 
          file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
          (process.platform === 'darwin' && file.endsWith('.app')) ||
          (process.platform === 'linux' && !file.includes('.'))
        );
        
        // Wenn ausführbare Dateien gefunden wurden, behandle es als Spiel
        if (executables.length > 0) {
          console.log(`Potenzielles Spiel gefunden im Verzeichnis ${dir}`);
          
          // Wähle die erste ausführbare Datei
          const executable = executables[0];
          
          foundGames.push({
            title: dir, // Verzeichnisname als Standardtitel
            directory: dirPath,
            executable: executable,
            executablePath: dirPath,
            genre: 'Sonstiges',
            source: 'Andere',
            installed: true
          });
        }
      } catch (dirError) {
        console.warn(`Fehler beim Scannen des Verzeichnisses ${dir}:`, dirError);
      }
    }
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} Spiele gefunden`
    };
  } catch (error) {
    console.error('Fehler beim Scannen des Ordners nach generischen Spielen:', error);
    return {
      success: false,
      games: [],
      message: `Fehler: ${error.message}`
    };
  }
}

module.exports = {
  fetchDLSiteGameDetails,
  fetchSteamGameDetails,
  fetchItchioGameDetails,
  scanFolderForGames,
  scanFolderForDLSiteGames,
  scanFolderForSteamGames,
  scanFolderForItchioGames,
  scanFolderForGenericGames
};