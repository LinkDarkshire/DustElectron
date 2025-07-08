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

/**
 * Scans for installed games
 * @returns {Array} List of found games
 */
async function scanGames() {
  const games = [];
  
  try {
    const logger = getLogger();
    logger.info('GAME_SCAN', 'Starting scan for installed games');
    
    // Search directory for folders
    if (!fs.existsSync(appConfig.gamesDirectoryPath)) {
      logger.warn('GAME_SCAN', 'Games directory does not exist', {
        path: appConfig.gamesDirectoryPath
      });
      return games;
    }
    
    const gameDirectories = fs.readdirSync(appConfig.gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(appConfig.gamesDirectoryPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    logger.info('GAME_SCAN', `Found ${gameDirectories.length} game directories`);
    
    // Search each folder for dustgrain.json
    for (const dir of gameDirectories) {
      const gameInfo = fileManager.readDustgrain(dir);
      if (gameInfo) {
        games.push(gameInfo);
      }
    }
    
    logger.info('GAME_SCAN', 'Scan completed', {
      gamesFound: games.length,
      directories: gameDirectories.length
    });
  } catch (err) {
    const logger = getLogger();
    logger.error('GAME_SCAN', 'Error scanning for dustgrain files', { error: err.message });
  }
  
  return games;
}

/**
 * Allows selection of a game folder
 * @param {Event} event - The IPC Event
 * @param {string} platform - The game platform
 * @param {string} importType - The import type (single or folder)
 * @returns {Object} The result of folder selection
 */
async function selectGameFolder(event, platform, importType) {
  try {
    const logger = getLogger();
    logger.info('SELECT_FOLDER', 'Starting folder selection', {
      platform,
      importType
    });
    
    const options = {
      title: importType === 'single' ? 'Select game directory' : 'Select folder with multiple games',
      properties: ['openDirectory']
    };
    
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), options);
    
    if (canceled || filePaths.length === 0) {
      return { success: false, message: "Selection cancelled" };
    }
    
    const selectedDir = filePaths[0];
    const dirName = path.basename(selectedDir);
    
    logger.info('SELECT_FOLDER', 'Folder selected', {
      selectedDir,
      dirName,
      platform,
      importType
    });
    
    // Search for executable files
    const executableFiles = fileManager.findExecutables(selectedDir);
    const executable = executableFiles.length > 0 ? executableFiles[0] : '';
    
    // Try to extract ID from folder name if it's DLSite or Steam
    let gameDetails = {};
    
    if (platform === 'dlsite') {
      // Search for RJ/RE numbers in path
      const rjMatch = selectedDir.match(/RJ\d+/i);
      const reMatch = selectedDir.match(/RE\d+/i);
      const dlsiteId = rjMatch ? rjMatch[0].toUpperCase() : (reMatch ? reMatch[0].toUpperCase() : null);
      
      if (dlsiteId) {
        logger.info('DLSITE_DETECTION', 'DLSite ID found in path', { dlsiteId });
        
        try {
          // Get current game list to determine next internal ID
          const existingGames = await scanGames();
          const nextId = existingGames.length + 1;
          
          // Initialize DLSite Client with NetworkManager
          const networkManager = platformManager.getNetworkManager();
          const dlsiteClient = new DLSiteClient(networkManager);
          
          // Retrieve game information with internal ID for proper image naming
          const dlsiteInfo = await dlsiteClient.getGameInfo(dlsiteId, 'maniax', nextId);
          
          gameDetails = {
            ...dlsiteInfo,
            dlsiteId: dlsiteId,
            source: 'DLSite'
          };
          
          logger.info('DLSITE_DETECTION', 'DLSite game information retrieved', {
            dlsiteId,
            title: dlsiteInfo.title
          });
        } catch (error) {
          logger.warn('DLSITE_DETECTION', 'Error retrieving DLSite information', {
            dlsiteId,
            error: error.message
          });
          // Return basic information
          gameDetails = {
            title: `DLSite Game ${dlsiteId}`,
            dlsiteId: dlsiteId,
            source: 'DLSite',
            developer: 'Unknown Developer',
            publisher: 'DLSite',
            genre: 'Visual Novel'
          };
        }
      }
    } else if (platform === 'steam') {
      // Search for Steam App ID in path or steam_appid.txt file
      let steamAppId = null;
      
      // Search for steam_appid.txt
      const steamAppIdPath = path.join(selectedDir, 'steam_appid.txt');
      if (fs.existsSync(steamAppIdPath)) {
        try {
          steamAppId = fs.readFileSync(steamAppIdPath, 'utf8').trim();
        } catch (error) {
          logger.warn('STEAM_DETECTION', 'Error reading steam_appid.txt', {
            path: steamAppIdPath,
            error: error.message
          });
        }
      }
      
      if (steamAppId) {
        logger.info('STEAM_DETECTION', 'Steam App ID found', { steamAppId });
        
        try {
          // Steam information can be retrieved here
          
          gameDetails = {
            title: dirName,
            steamAppId: steamAppId,
            source: 'Steam',
            developer: 'Unknown Developer',
            publisher: 'Steam',
            genre: 'Game'
          };
        } catch (error) {
          logger.warn('STEAM_DETECTION', 'Error retrieving Steam information', {
            steamAppId,
            error: error.message
          });
          gameDetails = {
            title: dirName,
            steamAppId: steamAppId,
            source: 'Steam',
            developer: 'Unknown Developer',
            publisher: 'Steam',
            genre: 'Game'
          };
        }
      }
    }
    
    const result = { 
      success: true, 
      selectedFolder: selectedDir,
      executable: executable,
      executableList: executableFiles,
      gameDetails: gameDetails
    };
    
    logger.info('SELECT_FOLDER', 'Folder selection completed successfully', {
      success: true,
      selectedFolder: selectedDir,
      executable,
      executableList: executableFiles,
      gameDetails: {
        id: gameDetails.id,
        title: gameDetails.title,
        developer: gameDetails.developer,
        source: gameDetails.source
      }
    });
    
    return result;
  } catch (error) {
    const logger = getLogger();
    logger.error('SELECT_FOLDER', 'Error during folder selection', { error: error.message });
    return { 
      success: false, 
      message: `Error: ${error.message || "Unknown error"}`
    };
  }
}

/**
 * Allows selection of an executable file
 * @param {Event} event - The IPC Event
 * @param {string} folderPath - The folder path
 * @returns {Object} The selection result
 */
async function selectExecutable(event, folderPath) {
  try {
    const logger = getLogger();
    logger.info('SELECT_EXECUTABLE', 'Starting executable selection', { folderPath });
    
    const options = {
      title: 'Select executable file',
      defaultPath: folderPath,
      properties: ['openFile'],
      filters: appConfig.fileFilters.executables
    };
    
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), options);
    
    if (canceled || filePaths.length === 0) {
      return {
        success: false,
        message: "Selection cancelled"
      };
    }
    
    // Extract relative path to executable file
    const selectedFile = path.relative(folderPath, filePaths[0]);
    
    logger.info('SELECT_EXECUTABLE', 'Executable selected', {
      folderPath,
      selectedFile
    });
    
    return {
      success: true,
      selectedFile: selectedFile,
      message: `Executable file selected: ${selectedFile}`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('SELECT_EXECUTABLE', 'Error selecting executable file', {
      folderPath,
      error: error.message
    });
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Adds a game with a specific path
 * @param {Event} event - The IPC Event
 * @param {Object} gameInfo - The game information
 * @param {string} gameFolder - The game folder
 * @param {string} executablePath - Path to executable file
 * @returns {Object} The result of adding
 */
async function addGameWithPath(event, gameInfo, gameFolder, executablePath) {
  try {
    const logger = getLogger();
    logger.info('ADD_GAME', 'Starting game addition', {
      gameFolder,
      executablePath,
      gameTitle: gameInfo.title
    });
    
    // Extract directory name from path
    const dirName = path.basename(gameFolder);
    
    // Get current game list to determine next ID
    const existingGames = await scanGames();
    const nextId = existingGames.length + 1;
    
    // Create dustgrain file with ALL DLSite-specific fields
    const dustgrain = {
      internalId: nextId, // Add internal ID
      title: gameInfo.title || dirName,
      executable: executablePath,
      executablePath: gameFolder,
      version: gameInfo.version || "1.0",
      genre: gameInfo.genre || "Other",
      releaseDate: gameInfo.releaseDate || gameInfo.dlsiteReleaseDate || new Date().toISOString().split('T')[0],
      developer: gameInfo.developer || "Unknown",
      publisher: gameInfo.publisher || "Unknown",
      description: gameInfo.description || "",
      source: gameInfo.source || "Local",
      tags: gameInfo.tags || gameInfo.dlsiteTags || [],
      coverImage: gameInfo.coverImage ? gameInfo.coverImage.replace(/\\/g, '/') : "",
      screenshots: gameInfo.screenshots || [],
      lastPlayed: null,
      playTime: 0,
      installed: true,
      installDate: new Date().toISOString(),
      
      // Platform-specific information
      steamAppId: gameInfo.steamAppId || null,
      dlsiteId: gameInfo.dlsiteId || null,
      dlsiteCategory: gameInfo.dlsiteCategory || null,
      dlsiteUrl: gameInfo.dlsiteUrl || null,
      dlsiteCircle: gameInfo.dlsiteCircle || null,
      dlsiteTags: gameInfo.dlsiteTags || [],
      dlsiteVoiceActors: gameInfo.dlsiteVoiceActors || [],
      dlsiteReleaseDate: gameInfo.dlsiteReleaseDate || "",
      dlsiteUpdateDate: gameInfo.dlsiteUpdateDate || "",
      dlsiteFileSize: gameInfo.dlsiteFileSize || "",
      dlsiteProductFormat: gameInfo.dlsiteProductFormat || [],
      dlsiteAgeRating: gameInfo.dlsiteAgeRating || "",
      dlsiteFileFormat: gameInfo.dlsiteFileFormat || "",
      itchioUrl: gameInfo.itchioUrl || null,
      
      // Additional metadata for DLSite games
      language: gameInfo.language || "Unknown",
      authors: gameInfo.authors || [],
      illustrators: gameInfo.illustrators || [],
      scenario: gameInfo.scenario || [],
      genreList: gameInfo.genreList || [],
      productFormat: gameInfo.productFormat || "",
      
      dustVersion: "1.0"
    };
    
    // Save dustgrain file
    const success = fileManager.writeDustgrain(dirName, dustgrain);
    
    if (success) {
      logger.info('ADD_GAME', 'Game added successfully', {
        gameId: nextId,
        gameTitle: dustgrain.title,
        directory: dirName
      });
      
      return { 
        success: true, 
        dustgrain,
        message: `Game "${dustgrain.title}" added successfully.`
      };
    } else {
      logger.error('ADD_GAME', 'Error saving game information', {
        gameTitle: dustgrain.title,
        directory: dirName
      });
      return { 
        success: false, 
        message: "Error saving game information"
      };
    }
  } catch (error) {
    const logger = getLogger();
    logger.error('ADD_GAME', 'Error adding game', {
      gameFolder,
      error: error.message
    });
    return { 
      success: false, 
      message: `Error: ${error.message || "Unknown error"}`
    };
  }
}

/**
 * Adds multiple games
 * @param {Event} event - The IPC Event
 * @param {Array} games - The list of games
 * @returns {Object} The result of adding
 */
async function addMultipleGames(event, games) {
  try {
    const logger = getLogger();
    logger.info('ADD_MULTIPLE_GAMES', 'Starting multiple game addition', {
      gameCount: games.length
    });
    
    let addedCount = 0;
    let errors = [];
    
    // Get current game count for ID assignment
    const existingGames = await scanGames();
    let nextId = existingGames.length + 1;
    
    for (const game of games) {
      try {
        // Create target directory
        const dirName = path.basename(game.directory);
        
        // If there's a DLSite ID, retrieve complete information
        if (game.dlsiteId) {
          try {
            const networkManager = platformManager.getNetworkManager();
            const dlsiteClient = new DLSiteClient(networkManager);
            const gameDetails = await dlsiteClient.getGameInfo(game.dlsiteId, 'maniax', nextId);
            
            // Override basic information with details
            Object.assign(game, gameDetails);
            
            logger.info('ADD_MULTIPLE_GAMES', 'DLSite details retrieved for game', {
              dlsiteId: game.dlsiteId,
              title: gameDetails.title
            });
          } catch (dlsiteError) {
            logger.warn('ADD_MULTIPLE_GAMES', 'Could not retrieve DLSite details', {
              dlsiteId: game.dlsiteId,
              error: dlsiteError.message
            });
            // Continue with basic information
          }
        }
        
        // Create dustgrain file with ALL DLSite fields
        const dustgrain = {
          internalId: nextId, // Add internal ID
          title: game.title || dirName,
          executable: game.executable || '',
          executablePath: game.directory,
          version: game.version || "1.0",
          genre: game.genre || "Other",
          releaseDate: game.releaseDate || game.dlsiteReleaseDate || new Date().toISOString().split('T')[0],
          developer: game.developer || "Unknown",
          publisher: game.publisher || "Unknown",
          description: game.description || "",
          source: game.source || "Local",
          tags: game.tags || game.dlsiteTags || [],
          coverImage: game.coverImage || "",
          screenshots: game.screenshots || [],
          lastPlayed: null,
          playTime: 0,
          installed: true,
          installDate: new Date().toISOString(),
          
          // Platform-specific information
          dlsiteId: game.dlsiteId || null,
          dlsiteCategory: game.dlsiteCategory || 'maniax',
          dlsiteUrl: game.dlsiteUrl || null,
          dlsiteCircle: game.dlsiteCircle || null,
          dlsiteTags: game.dlsiteTags || [],
          dlsiteVoiceActors: game.dlsiteVoiceActors || [],
          dlsiteReleaseDate: game.dlsiteReleaseDate || "",
          dlsiteUpdateDate: game.dlsiteUpdateDate || "",
          dlsiteFileSize: game.dlsiteFileSize || "",
          dlsiteProductFormat: game.dlsiteProductFormat || [],
          dlsiteAgeRating: game.dlsiteAgeRating || "",
          dlsiteFileFormat: game.dlsiteFileFormat || "",
          
          // Additional metadata
          language: game.language || "Unknown",
          authors: game.authors || [],
          illustrators: game.illustrators || [],
          scenario: game.scenario || [],
          genreList: game.genreList || [],
          productFormat: game.productFormat || "",
          
          dustVersion: "1.0"
        };
        
        // Save dustgrain file
        const success = fileManager.writeDustgrain(dirName, dustgrain);
        if (success) {
          addedCount++;
          nextId++; // Increment for next game
          logger.info('ADD_MULTIPLE_GAMES', 'Game added successfully', {
            title: dustgrain.title,
            directory: dirName
          });
        } else {
          errors.push(`${game.title || 'Unknown'}: Error saving game information`);
        }
      } catch (gameError) {
        logger.error('ADD_MULTIPLE_GAMES', 'Error adding individual game', {
          gameTitle: game.title || 'Unknown',
          error: gameError.message
        });
        errors.push(`${game.title || 'Unknown'}: ${gameError.message}`);
      }
    }
    
    logger.info('ADD_MULTIPLE_GAMES', 'Multiple game addition completed', {
      addedCount,
      errorCount: errors.length,
      totalGames: games.length
    });
    
    return {
      success: true,
      addedCount,
      errorCount: errors.length,
      errors,
      message: `${addedCount} games added successfully${errors.length > 0 ? `, ${errors.length} errors` : ''}`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('ADD_MULTIPLE_GAMES', 'Error adding multiple games', {
      gameCount: games.length,
      error: error.message
    });
    return {
      success: false,
      addedCount: 0,
      errorCount: 1,
      errors: [error.message],
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Updates a game
 * @param {Event} event - The IPC Event
 * @param {string} gameDirectory - The game directory
 * @param {Object} updates - The fields to update
 * @returns {Object} The result of update
 */
async function updateGame(event, gameDirectory, updates) {
  try {
    const logger = getLogger();
    logger.info('UPDATE_GAME', 'Starting game update', {
      gameDirectory,
      updateFields: Object.keys(updates)
    });
    
    // Read game information
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    
    if (!gameInfo) {
      return { 
        success: false, 
        message: "Dustgrain file not found" 
      };
    }
    
    // Update fields
    const updatedInfo = { ...gameInfo, ...updates };
    
    // Save updated file
    const success = fileManager.writeDustgrain(gameDirectory, updatedInfo);
    
    if (success) {
      logger.info('UPDATE_GAME', 'Game updated successfully', {
        gameDirectory,
        gameTitle: updatedInfo.title
      });
      return { 
        success: true, 
        dustgrain: updatedInfo,
        message: "Game updated successfully" 
      };
    } else {
      logger.error('UPDATE_GAME', 'Error saving updated game information', {
        gameDirectory
      });
      return { 
        success: false, 
        message: "Error saving updated game information" 
      };
    }
  } catch (error) {
    const logger = getLogger();
    logger.error('UPDATE_GAME', 'Error updating game', {
      gameDirectory,
      error: error.message
    });
    return { 
      success: false, 
      message: `Error: ${error.message || "Unknown error"}` 
    };
  }
}

/**
 * Deletes a game
 * @param {Event} event - The IPC Event
 * @param {string} gameDirectory - The game directory to delete
 * @returns {Object} The result of deletion
 */
async function deleteGame(event, gameDirectory) {
  try {
    const logger = getLogger();
    logger.info('DELETE_GAME', 'Starting game deletion', { gameDirectory });
    
    const gamePath = path.join(appConfig.gamesDirectoryPath, gameDirectory);
    
    if (!fs.existsSync(gamePath)) {
      return { 
        success: false, 
        message: "Game directory not found" 
      };
    }
    
    // Here only the reference in Dust is deleted, not the actual game
    fs.rmSync(gamePath, { recursive: true, force: true });
    
    logger.info('DELETE_GAME', 'Game deleted successfully', { gameDirectory });
    
    return { 
      success: true, 
      message: "Game successfully removed from Dust" 
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('DELETE_GAME', 'Error deleting game', {
      gameDirectory,
      error: error.message
    });
    return { 
      success: false, 
      message: `Error: ${error.message || "Unknown error"}` 
    };
  }
}

/**
 * Launches a game
 * @param {Event} event - The IPC Event
 * @param {string} gameDirectory - The game directory
 * @returns {Object} The result of launching
 */
async function launchGame(event, gameDirectory) {
  try {
    const logger = getLogger();
    logger.info('LAUNCH_GAME', 'Starting game launch', { gameDirectory });
    
    // Read game information
    const gameInfo = fileManager.readDustgrain(gameDirectory);
    
    if (!gameInfo) {
      return { 
        success: false, 
        message: "Dustgrain file not found"
      };
    }
    
    if (!gameInfo.executable || !gameInfo.executablePath) {
      return { 
        success: false, 
        message: "No executable file defined for this game"
      };
    }
    
    // Update lastPlayed
    gameInfo.lastPlayed = new Date().toISOString();
    const success = fileManager.writeDustgrain(gameDirectory, gameInfo);

    if (!success) {
      return { 
        success: false, 
        message: "Error updating game before launch"
      };
    }

    // Launch the game
    const fullPath = path.join(gameInfo.executablePath, gameInfo.executable);

    const child = spawn(fullPath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: gameInfo.executablePath
    });

    child.unref();

    logger.info('LAUNCH_GAME', 'Game launched successfully', {
      gameDirectory,
      gameTitle: gameInfo.title,
      executable: fullPath
    });

    return { 
      success: true, 
      message: `Game ${gameInfo.title} is starting...`
    };
  } catch (error) {
    const logger = getLogger();
    logger.error('LAUNCH_GAME', 'Error launching game', {
      gameDirectory,
      error: error.message
    });
    return { 
      success: false, 
      message: `Error: ${error.message || "Unknown error"}`
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