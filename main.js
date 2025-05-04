const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Hauptfenster-Referenz global halten, um GC zu verhindern
let mainWindow;

// Pfad zum Spieleverzeichnis
const userDataPath = app.getPath('userData');
const gamesDirectoryPath = path.join(userDataPath, 'games');

// Stellen Sie sicher, dass das Spieleverzeichnis existiert
if (!fs.existsSync(gamesDirectoryPath)) {
  fs.mkdirSync(gamesDirectoryPath, { recursive: true });
}

function createWindow() {
  // Browser-Fenster erstellen
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Dust Game Manager",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1b2838'
  });

  // index.html laden
  mainWindow.loadFile('index.html');

  // Öffne die DevTools während der Entwicklung
  // mainWindow.webContents.openDevTools();

  // Emittiert, wenn das Fenster geschlossen wird
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Wenn Electron fertig mit der Initialisierung ist
app.whenReady().then(createWindow);

// Beende die App, wenn alle Fenster geschlossen sind (außer auf macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // Auf macOS ist es üblich, ein neues Fenster zu erstellen, wenn auf das
  // Dock-Symbol geklickt wird und keine anderen Fenster offen sind
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Kommunikation mit dem Renderer-Prozess

// Scanne nach dustgrain-Dateien und gib alle gefundenen Spiele zurück
ipcMain.handle('scan-games', async () => {
  return scanForDustgrains();
});

// Füge ein neues Spiel hinzu
ipcMain.handle('add-game', async (event, gameInfo) => {
  try {
    const options = {
      title: 'Spieleverzeichnis auswählen',
      properties: ['openDirectory']
    };
    
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, options);
    
    if (canceled || filePaths.length === 0) {
      return { success: false, message: "Auswahl abgebrochen" };
    }
    
    const selectedDir = filePaths[0];
    const dirName = path.basename(selectedDir);
    
    // Suche nach ausführbaren Dateien
    let executablePath = '';
    try {
      const files = fs.readdirSync(selectedDir);
      const executables = files.filter(file => 
        file.endsWith('.exe') || file.endsWith('.bat') || file.endsWith('.cmd') || 
        (process.platform === 'darwin' && file.endsWith('.app')) ||
        (process.platform === 'linux' && !file.includes('.'))
      );
      
      if (executables.length > 0) {
        executablePath = executables[0];
      }
    } catch (err) {
      console.error("Fehler beim Lesen des Verzeichnisses:", err);
    }
    
    // Zielverzeichnis erstellen
    const gameDir = path.join(gamesDirectoryPath, dirName);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }
    
    // Dustgrain-Datei erstellen
    const dustgrain = {
      title: gameInfo.title || dirName,
      executable: executablePath,
      executablePath: selectedDir,
      version: gameInfo.version || "1.0",
      genre: gameInfo.genre || "Sonstiges",
      releaseDate: gameInfo.releaseDate || new Date().toISOString().split('T')[0],
      developer: gameInfo.developer || "Unbekannt",
      publisher: gameInfo.publisher || "Unbekannt",
      description: gameInfo.description || "",
      source: gameInfo.source || "Lokal",
      tags: gameInfo.tags || [],
      coverImage: gameInfo.coverImage || "",
      screenshots: gameInfo.screenshots || [],
      lastPlayed: null,
      playTime: 0,
      installed: true,
      installDate: new Date().toISOString(),
      dustVersion: "1.0"
    };
    
    // Speichern der dustgrain-Datei
    const dustgrainPath = path.join(gameDir, 'dustgrain.json');
    fs.writeFileSync(dustgrainPath, JSON.stringify(dustgrain, null, 2));
    
    return { 
      success: true, 
      dustgrain,
      message: `Spiel "${dustgrain.title}" erfolgreich hinzugefügt.`
    };
  } catch (error) {
    console.error("Fehler beim Hinzufügen des Spiels:", error);
    return { 
      success: false, 
      message: `Fehler: ${error.message || "Unbekannter Fehler"}`
    };
  }
});

// Ein Spiel starten
ipcMain.handle('launch-game', async (event, gameDirectory) => {
  try {
    const gamePath = path.join(gamesDirectoryPath, gameDirectory);
    const dustgrainPath = path.join(gamePath, 'dustgrain.json');
    
    if (!fs.existsSync(dustgrainPath)) {
      return { 
        success: false, 
        message: "Dustgrain-Datei nicht gefunden"
      };
    }
    
    const data = fs.readFileSync(dustgrainPath, 'utf8');
    const gameInfo = JSON.parse(data);
    
    if (!gameInfo.executable || !gameInfo.executablePath) {
      return { 
        success: false, 
        message: "Keine ausführbare Datei für dieses Spiel definiert"
      };
    }
    
    // Aktualisiere lastPlayed
    gameInfo.lastPlayed = new Date().toISOString();
    fs.writeFileSync(dustgrainPath, JSON.stringify(gameInfo, null, 2));
    
    // Starte das Spiel
    const { spawn } = require('child_process');
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
});

// Ein Spiel löschen
ipcMain.handle('delete-game', async (event, gameDirectory) => {
  try {
    const gamePath = path.join(gamesDirectoryPath, gameDirectory);
    
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
});

// Ein Spiel aktualisieren
ipcMain.handle('update-game', async (event, gameDirectory, updates) => {
  try {
    const gamePath = path.join(gamesDirectoryPath, gameDirectory);
    const dustgrainPath = path.join(gamePath, 'dustgrain.json');
    
    if (!fs.existsSync(dustgrainPath)) {
      return { 
        success: false, 
        message: "Dustgrain-Datei nicht gefunden" 
      };
    }
    
    const data = fs.readFileSync(dustgrainPath, 'utf8');
    const gameInfo = JSON.parse(data);
    
    // Aktualisiere die Felder
    const updatedInfo = { ...gameInfo, ...updates };
    
    // Speichere die aktualisierte Datei
    fs.writeFileSync(dustgrainPath, JSON.stringify(updatedInfo, null, 2));
    
    return { 
      success: true, 
      dustgrain: updatedInfo,
      message: "Spiel erfolgreich aktualisiert" 
    };
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Spiels:", error);
    return { 
      success: false, 
      message: `Fehler: ${error.message || "Unbekannter Fehler"}` 
    };
  }
});

// Hilfsfunktion zum Scannen nach dustgrain-Dateien
function scanForDustgrains() {
  const games = [];
  
  try {
    // Durchsuche das Verzeichnis nach Ordnern
    if (!fs.existsSync(gamesDirectoryPath)) {
      return games;
    }
    
    const gameDirectories = fs.readdirSync(gamesDirectoryPath)
      .filter(file => {
        const fullPath = path.join(gamesDirectoryPath, file);
        return fs.statSync(fullPath).isDirectory();
      });
    
    // Suche in jedem Ordner nach dustgrain.json
    for (const dir of gameDirectories) {
      const dustgrainPath = path.join(gamesDirectoryPath, dir, 'dustgrain.json');
      
      if (fs.existsSync(dustgrainPath)) {
        try {
          const data = fs.readFileSync(dustgrainPath, 'utf8');
          const gameInfo = JSON.parse(data);
          
          // Füge Verzeichnisinformationen hinzu
          gameInfo.directory = dir;
          
          games.push(gameInfo);
        } catch (err) {
          console.error(`Fehler beim Lesen von ${dustgrainPath}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Fehler beim Scannen nach dustgrain-Dateien:', err);
  }
  
  return games;
}