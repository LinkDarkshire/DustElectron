const path = require('path');
const fs = require('fs');
const appConfig = require('../config/app-config');
const DLSiteClient = require('../platforms/dlsite-api');
const NetworkManager = require('./network-manager');
const { getLogger } = require('./logger');

// Global NetworkManager instance
let networkManager = null;

/**
 * Initialize NetworkManager if not already done
 * @returns {NetworkManager} - NetworkManager instance
 */
function getNetworkManager() {
  if (!networkManager) {
    networkManager = new NetworkManager();
    const logger = getLogger();
    logger.info('NETWORK_INIT', 'NetworkManager initialized for platform operations');
  }
  return networkManager;
}

/**
 * Retrieves game details from DLSite
 * @param {Event} event - The IPC Event
 * @param {string} dlsiteId - The DLSite ID
 * @param {string} category - The DLSite category
 * @param {number} internalId - Optional internal ID for asset naming
 * @returns {Object} The game details
 */
async function fetchDLSiteGameDetails(event, dlsiteId, category = 'maniax', internalId = null) {
  try {
    const logger = getLogger();
    logger.info('DLSITE_FETCH', 'Searching for DLSite game', {
      dlsiteId,
      category,
      internalId
    });
    
    // Initialize DLSite Client with NetworkManager
    const networkMgr = getNetworkManager();
    const dlsiteClient = new DLSiteClient(networkMgr);
    
    // Retrieve game information (with optional internal ID)
    const gameInfo = await dlsiteClient.getGameInfo(dlsiteId, category, internalId);
    
    logger.info('DLSITE_FETCH', 'DLSite game found successfully', {
      dlsiteId,
      title: gameInfo.title
    });
    
    return gameInfo;
  } catch (error) {
    const logger = getLogger();
    logger.error('DLSITE_FETCH', 'Error retrieving DLSite game details', {
      dlsiteId,
      category,
      error: error.message
    });
    
    // Fallback: return minimal information
    return {
      title: `DLSite Game ${dlsiteId}`,
      developer: "Unknown Developer",
      publisher: "DLSite",
      genre: "Visual Novel",
      description: `A game from DLSite with ID ${dlsiteId}`,
      coverImage: "",
      source: "DLSite",
      dlsiteId: dlsiteId
    };
  }
}

/**
 * Retrieves game details from Steam
 * @param {Event} event - The IPC Event
 * @param {string} appId - The Steam App ID
 * @returns {Object} The game details
 */
async function fetchSteamGameDetails(event, appId) {
  try {
    const logger = getLogger();
    logger.info('STEAM_FETCH', 'Searching for Steam game', { appId });
    
    // TODO: Implement Steam API Client
    // const steamClient = new SteamClient();
    // const gameInfo = await steamClient.getGameInfo(appId);
    
    // Temporary implementation:
    const gameInfo = {
      title: `Steam Game ${appId}`,
      developer: "Unknown Developer",
      publisher: "Steam",
      genre: "Other",
      description: `A game from Steam with ID ${appId}`,
      coverImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      source: "Steam",
      steamAppId: appId
    };
    
    logger.info('STEAM_FETCH', 'Steam game found', {
      appId,
      title: gameInfo.title
    });
    
    return gameInfo;
  } catch (error) {
    const logger = getLogger();
    logger.error('STEAM_FETCH', 'Error retrieving Steam game details', {
      appId,
      error: error.message
    });
    
    // Fallback: return minimal information
    return {
      title: `Steam Game ${appId}`,
      developer: "Unknown Developer",
      publisher: "Steam",
      genre: "Other",
      description: `A game from Steam with ID ${appId}`,
      coverImage: "",
      source: "Steam",
      steamAppId: appId
    };
  }
}

/**
 * Retrieves game details from Itch.io
 * @param {Event} event - The IPC Event
 * @param {string} url - The Itch.io URL
 * @returns {Object} The game details
 */
async function fetchItchioGameDetails(event, url) {
  try {
    const logger = getLogger();
    logger.info('ITCHIO_FETCH', 'Searching for Itch.io game', { url });
    
    // TODO: Implement Itch.io API Client
    // const itchioClient = new ItchIOClient();
    // const gameInfo = await itchioClient.getGameInfo(url);
    
    // Temporary implementation:
    const gameInfo = {
      title: "Itch.io Game",
      developer: "Unknown Developer",
      publisher: "Itch.io",
      genre: "Indie",
      description: `A game from Itch.io with URL ${url}`,
      coverImage: "",
      source: "Itch.io",
      itchioUrl: url
    };
    
    logger.info('ITCHIO_FETCH', 'Itch.io game found', {
      url,
      title: gameInfo.title
    });
    
    return gameInfo;
  } catch (error) {
    const logger = getLogger();
    logger.error('ITCHIO_FETCH', 'Error retrieving Itch.io game details', {
      url,
      error: error.message
    });
    
    // Fallback: return minimal information
    return {
      title: "Itch.io Game",
      developer: "Unknown Developer",
      publisher: "Itch.io",
      genre: "Indie",
      description: `A game from Itch.io with URL ${url}`,
      coverImage: "",
      source: "Itch.io",
      itchioUrl: url
    };
  }
}

/**
 * Scans a folder for games based on platform
 * @param {Event} event - The IPC Event
 * @param {string} folderPath - The folder to scan
 * @param {string} platform - The game platform
 * @returns {Object} The scan result
 */
async function scanFolderForGames(event, folderPath, platform) {
  try {
    const logger = getLogger();
    logger.info('FOLDER_SCAN', 'Starting folder scan', {
      folderPath,
      platform
    });
    
    let result = {
      success: false,
      games: [],
      message: "No games found"
    };
    
    // Apply different scan logic based on platform
    switch (platform.toLowerCase()) {
      case 'dlsite':
        return await scanFolderForDLSiteGames(folderPath);
      case 'steam':
        return await scanFolderForSteamGames(folderPath);
      case 'itchio':
        return await scanFolderForItchioGames(folderPath);
      default:
        // Generic scan for "other" platforms
        return await scanFolderForGenericGames(folderPath);
    }
  } catch (error) {
    const logger = getLogger();
    logger.error('FOLDER_SCAN', 'Error scanning folder for games', {
      folderPath,
      platform,
      error: error.message
    });
    
    return {
      success: false,
      games: [],
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Scans a folder for DLSite games
 * @param {string} folderPath - The folder to scan
 * @returns {Object} The scan result
 */
async function scanFolderForDLSiteGames(folderPath) {
  try {
    const logger = getLogger();
    logger.info('DLSITE_SCAN', 'Starting DLSite folder scan', { folderPath });
    
    // List all directories in the selected folder
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Result list for found games
    const foundGames = [];
    
    // DLSite Client for API requests with NetworkManager
    const networkMgr = getNetworkManager();
    const dlsiteClient = new DLSiteClient(networkMgr);
    
    // Try to find a DLSite game in each subdirectory
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // First try to extract DLSite ID directly from path
        let dlsiteId = dlsiteClient.extractDLSiteIdFromPath(dirPath);
        
        // If no ID found in path, try to find it in directory name
        if (!dlsiteId) {
          try {
            dlsiteId = dlsiteClient.findProductId(dir);
          } catch (idError) {
            // No DLSite ID found in directory name
            // Search for executable file
            const files = fs.readdirSync(dirPath);
            const executables = files.filter(file => 
              file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
              (process.platform === 'darwin' && file.endsWith('.app')) ||
              (process.platform === 'linux' && !file.includes('.'))
            );
            
            // If executables found, check their names for DLSite IDs
            for (const exe of executables) {
              try {
                dlsiteId = dlsiteClient.findProductId(exe);
                if (dlsiteId) break;
              } catch (exeIdError) {
                // Ignore and continue
              }
            }
          }
        }
        
        // If a DLSite ID was found
        if (dlsiteId) {
          logger.info('DLSITE_SCAN', 'DLSite ID found in directory', {
            directory: dir,
            dlsiteId
          });
          
          // Search for executable files
          const files = fs.readdirSync(dirPath);
          const executables = files.filter(file => 
            file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
            (process.platform === 'darwin' && file.endsWith('.app')) ||
            (process.platform === 'linux' && !file.includes('.'))
          );
          
          // Choose first executable file or empty if none found
          const executable = executables.length > 0 ? executables[0] : '';
          
          // Try to get basic information via DLSite API
          try {
            // Get minimal info from API (no full details fetch to minimize scan time)
            const basicInfo = await dlsiteClient.getProductInfo(dlsiteId);
            
            foundGames.push({
              title: basicInfo.work_name || `DLSite Game ${dlsiteId}`,
              developer: basicInfo.maker_name || "Unknown Developer",
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
            logger.warn('DLSITE_SCAN', 'Could not retrieve API details for game', {
              dlsiteId,
              error: apiError.message
            });
            
            // Fallback to minimal information
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
        logger.warn('DLSITE_SCAN', 'Error scanning directory', {
          directory: dir,
          error: dirError.message
        });
      }
    }
    
    logger.info('DLSITE_SCAN', 'DLSite folder scan completed', {
      folderPath,
      gamesFound: foundGames.length
    });
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} DLSite games found`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('DLSITE_SCAN', 'Error scanning folder for DLSite games', {
      folderPath,
      error: error.message
    });
    
    return {
      success: false,
      games: [],
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Scans a folder for Steam games
 * @param {string} folderPath - The folder to scan
 * @returns {Object} The scan result
 */
async function scanFolderForSteamGames(folderPath) {
  try {
    const logger = getLogger();
    logger.info('STEAM_SCAN', 'Starting Steam folder scan', { folderPath });
    
    // List all directories in the selected folder
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Result list for found games
    const foundGames = [];
    
    // Try to find a Steam game in each subdirectory
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // Search for steam_api.dll or steam_api64.dll to determine if it's a Steam game
        const files = fs.readdirSync(dirPath);
        const isSteamGame = files.some(file => 
          file === 'steam_api.dll' || file === 'steam_api64.dll' || file === 'steam_appid.txt'
        );
        
        if (isSteamGame) {
          logger.info('STEAM_SCAN', 'Steam game found in directory', { directory: dir });
          
          // Try to find Steam App ID
          let steamAppId = null;
          
          // Check if steam_appid.txt exists
          if (files.includes('steam_appid.txt')) {
            try {
              const appIdContent = fs.readFileSync(path.join(dirPath, 'steam_appid.txt'), 'utf8');
              steamAppId = appIdContent.trim();
            } catch (readError) {
              logger.warn('STEAM_SCAN', 'Could not read steam_appid.txt', {
                directory: dir,
                error: readError.message
              });
            }
          }
          
          // Search for executable files
          const executables = files.filter(file => 
            file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
            (process.platform === 'darwin' && file.endsWith('.app')) ||
            (process.platform === 'linux' && !file.includes('.'))
          );
          
          // Choose first executable file or empty if none found
          const executable = executables.length > 0 ? executables[0] : '';
          
          // Basic information
          const gameInfo = {
            title: dir, // Directory name as default title
            directory: dirPath,
            executable: executable,
            executablePath: dirPath,
            genre: 'Other',
            source: 'Steam',
            steamAppId: steamAppId,
            installed: true
          };
          
          // If Steam App ID is available, try to get more information
          if (steamAppId) {
            try {
              // TODO: Retrieve Steam details
              // const steamClient = new SteamClient();
              // const details = await steamClient.getGameInfo(steamAppId);
              // Object.assign(gameInfo, details);
              
              logger.info('STEAM_SCAN', 'Steam App ID found', {
                directory: dir,
                steamAppId
              });
            } catch (steamError) {
              logger.warn('STEAM_SCAN', 'Could not retrieve Steam details', {
                steamAppId,
                error: steamError.message
              });
            }
          }
          
          foundGames.push(gameInfo);
        }
      } catch (dirError) {
        logger.warn('STEAM_SCAN', 'Error scanning directory', {
          directory: dir,
          error: dirError.message
        });
      }
    }
    
    logger.info('STEAM_SCAN', 'Steam folder scan completed', {
      folderPath,
      gamesFound: foundGames.length
    });
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} Steam games found`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('STEAM_SCAN', 'Error scanning folder for Steam games', {
      folderPath,
      error: error.message
    });
    
    return {
      success: false,
      games: [],
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Scans a folder for Itch.io games
 * @param {string} folderPath - The folder to scan
 * @returns {Object} The scan result
 */
async function scanFolderForItchioGames(folderPath) {
  try {
    const logger = getLogger();
    logger.info('ITCHIO_SCAN', 'Starting Itch.io folder scan', { folderPath });
    
    // List all directories in the selected folder
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Result list for found games
    const foundGames = [];
    
    // Try to find an Itch.io game in each subdirectory
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // Search for .itch file which Itch.io games normally contain
        const files = fs.readdirSync(dirPath);
        const isItchioGame = files.some(file => file === '.itch' || dir.toLowerCase().includes('itch.io'));
        
        if (isItchioGame) {
          logger.info('ITCHIO_SCAN', 'Itch.io game found in directory', { directory: dir });
          
          // Search for executable files
          const executables = files.filter(file => 
            file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
            (process.platform === 'darwin' && file.endsWith('.app')) ||
            (process.platform === 'linux' && !file.includes('.'))
          );
          
          // Choose first executable file or empty if none found
          const executable = executables.length > 0 ? executables[0] : '';
          
          // Extract itch.io URL if possible
          let itchioUrl = null;
          
          // Try to read .itch file to find URL
          if (files.includes('.itch')) {
            try {
              const itchContent = fs.readFileSync(path.join(dirPath, '.itch'), 'utf8');
              const urlMatch = itchContent.match(/https?:\/\/[^\s"]+itch\.io\/[^\s"]+/);
              if (urlMatch) {
                itchioUrl = urlMatch[0];
              }
            } catch (readError) {
              logger.warn('ITCHIO_SCAN', 'Could not read .itch file', {
                directory: dir,
                error: readError.message
              });
            }
          }
          
          foundGames.push({
            title: dir, // Directory name as default title
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
        logger.warn('ITCHIO_SCAN', 'Error scanning directory', {
          directory: dir,
          error: dirError.message
        });
      }
    }
    
    logger.info('ITCHIO_SCAN', 'Itch.io folder scan completed', {
      folderPath,
      gamesFound: foundGames.length
    });
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} Itch.io games found`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('ITCHIO_SCAN', 'Error scanning folder for Itch.io games', {
      folderPath,
      error: error.message
    });
    
    return {
      success: false,
      games: [],
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Scans a folder for generic games
 * @param {string} folderPath - The folder to scan
 * @returns {Object} The scan result
 */
async function scanFolderForGenericGames(folderPath) {
  try {
    const logger = getLogger();
    logger.info('GENERIC_SCAN', 'Starting generic folder scan', { folderPath });
    
    // List all directories in the selected folder
    const directories = fs.readdirSync(folderPath)
      .filter(file => {
        const fullPath = path.join(folderPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Result list for found games
    const foundGames = [];
    
    // Treat each subdirectory as potential game
    for (const dir of directories) {
      try {
        const dirPath = path.join(folderPath, dir);
        
        // Search for executable files
        const files = fs.readdirSync(dirPath);
        const executables = files.filter(file => 
          file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
          (process.platform === 'darwin' && file.endsWith('.app')) ||
          (process.platform === 'linux' && !file.includes('.'))
        );
        
        // If executable files found, treat as game
        if (executables.length > 0) {
          logger.info('GENERIC_SCAN', 'Potential game found in directory', { directory: dir });
          
          // Choose first executable file
          const executable = executables[0];
          
          foundGames.push({
            title: dir, // Directory name as default title
            directory: dirPath,
            executable: executable,
            executablePath: dirPath,
            genre: 'Other',
            source: 'Other',
            installed: true
          });
        }
      } catch (dirError) {
        logger.warn('GENERIC_SCAN', 'Error scanning directory', {
          directory: dir,
          error: dirError.message
        });
      }
    }
    
    logger.info('GENERIC_SCAN', 'Generic folder scan completed', {
      folderPath,
      gamesFound: foundGames.length
    });
    
    return {
      success: true,
      games: foundGames,
      message: `${foundGames.length} games found`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('GENERIC_SCAN', 'Error scanning folder for generic games', {
      folderPath,
      error: error.message
    });
    
    return {
      success: false,
      games: [],
      message: `Error: ${error.message}`
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
  scanFolderForGenericGames,
  getNetworkManager
};