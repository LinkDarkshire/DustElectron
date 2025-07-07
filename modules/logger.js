/**
 * Comprehensive Logging System für Dust Game Manager
 * Bietet detailliertes Logging für alle Anwendungsabläufe
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

class DustLogger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'INFO';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.enableTimestamp = options.enableTimestamp !== false;
    this.enableStack = options.enableStack === true;
    
    // Log-Verzeichnis erstellen
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    
    // Log-Dateien
    this.logFiles = {
      main: path.join(this.logDir, 'dust-main.log'),
      error: path.join(this.logDir, 'dust-error.log'),
      api: path.join(this.logDir, 'dust-api.log'),
      game: path.join(this.logDir, 'dust-game.log'),
      network: path.join(this.logDir, 'dust-network.log'),
      performance: path.join(this.logDir, 'dust-performance.log')
    };
    
    // Log-Level Hierarchie
    this.levels = {
      TRACE: 0,
      DEBUG: 1,
      INFO: 2,
      WARN: 3,
      ERROR: 4,
      FATAL: 5
    };
    
    // Performance-Tracking
    this.performanceTimers = new Map();
    
    // Statistiken
    this.stats = {
      total: 0,
      byLevel: {},
      byCategory: {}
    };
    
    this.log('INFO', 'SYSTEM', 'DustLogger initialisiert', { 
      logLevel: this.logLevel,
      logDir: this.logDir 
    });
  }
  
  /**
   * Stellt sicher, dass das Log-Verzeichnis existiert
   */
  ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des Log-Verzeichnisses:', error);
    }
  }
  
  /**
   * Überprüft die Dateigröße und rotiert bei Bedarf
   */
  rotateLogFile(filepath) {
    try {
      if (!fs.existsSync(filepath)) return;
      
      const stats = fs.statSync(filepath);
      if (stats.size > this.maxFileSize) {
        // Rotiere die Dateien
        for (let i = this.maxFiles - 1; i > 0; i--) {
          const oldFile = `${filepath}.${i}`;
          const newFile = `${filepath}.${i + 1}`;
          
          if (fs.existsSync(oldFile)) {
            if (i === this.maxFiles - 1) {
              fs.unlinkSync(oldFile); // Lösche älteste Datei
            } else {
              fs.renameSync(oldFile, newFile);
            }
          }
        }
        
        // Benenne aktuelle Datei um
        fs.renameSync(filepath, `${filepath}.1`);
      }
    } catch (error) {
      console.error('Fehler bei der Log-Rotation:', error);
    }
  }
  
  /**
   * Formatiert eine Log-Nachricht
   */
  formatMessage(level, category, message, data = null, error = null) {
    const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
    const pid = process.pid;
    
    let formattedMessage = `[${timestamp}] [${level}] [${category}] [PID:${pid}] ${message}`;
    
    if (data && Object.keys(data).length > 0) {
      formattedMessage += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }
    
    if (error) {
      formattedMessage += `\n  Error: ${error.message}`;
      if (this.enableStack && error.stack) {
        formattedMessage += `\n  Stack: ${error.stack}`;
      }
    }
    
    return formattedMessage;
  }
  
  /**
   * Hauptmethode zum Loggen
   */
  log(level, category, message, data = null, error = null) {
    // Prüfe Log-Level
    if (this.levels[level] < this.levels[this.logLevel]) {
      return;
    }
    
    const formattedMessage = this.formatMessage(level, category, message, data, error);
    
    // Statistiken aktualisieren
    this.updateStats(level, category);
    
    // Console-Ausgabe
    if (this.enableConsole) {
      this.outputToConsole(level, formattedMessage);
    }
    
    // Datei-Ausgabe
    if (this.enableFile) {
      this.outputToFile(level, category, formattedMessage);
    }
  }
  
  /**
   * Aktualisiert die Logging-Statistiken
   */
  updateStats(level, category) {
    this.stats.total++;
    this.stats.byLevel[level] = (this.stats.byLevel[level] || 0) + 1;
    this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1;
  }
  
  /**
   * Ausgabe auf der Konsole
   */
  outputToConsole(level, message) {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        console.error(message);
        break;
      case 'WARN':
        console.warn(message);
        break;
      case 'DEBUG':
      case 'TRACE':
        console.debug(message);
        break;
      default:
        console.log(message);
    }
  }
  
  /**
   * Ausgabe in Datei
   */
  outputToFile(level, category, message) {
    try {
      // Hauptlog-Datei
      this.writeToFile(this.logFiles.main, message);
      
      // Spezifische Log-Dateien
      if (level === 'ERROR' || level === 'FATAL') {
        this.writeToFile(this.logFiles.error, message);
      }
      
      if (category.includes('API') || category.includes('DLSITE') || category.includes('STEAM')) {
        this.writeToFile(this.logFiles.api, message);
      }
      
      if (category.includes('GAME') || category.includes('LAUNCH') || category.includes('SCAN')) {
        this.writeToFile(this.logFiles.game, message);
      }
      
      if (category.includes('NETWORK') || category.includes('VPN') || category.includes('REQUEST')) {
        this.writeToFile(this.logFiles.network, message);
      }
      
      if (category.includes('PERFORMANCE') || category.includes('TIMER')) {
        this.writeToFile(this.logFiles.performance, message);
      }
    } catch (error) {
      console.error('Fehler beim Schreiben in Log-Datei:', error);
    }
  }
  
  /**
   * Schreibt in eine spezifische Datei
   */
  writeToFile(filepath, message) {
    this.rotateLogFile(filepath);
    fs.appendFileSync(filepath, message + '\n', 'utf8');
  }
  
  // Convenience-Methoden für verschiedene Log-Level
  trace(category, message, data = null) {
    this.log('TRACE', category, message, data);
  }
  
  debug(category, message, data = null) {
    this.log('DEBUG', category, message, data);
  }
  
  info(category, message, data = null) {
    this.log('INFO', category, message, data);
  }
  
  warn(category, message, data = null) {
    this.log('WARN', category, message, data);
  }
  
  error(category, message, data = null, error = null) {
    this.log('ERROR', category, message, data, error);
  }
  
  fatal(category, message, data = null, error = null) {
    this.log('FATAL', category, message, data, error);
  }
  
  // Spezielle Logging-Methoden
  
  /**
   * Loggt API-Aufrufe
   */
  logAPICall(method, url, headers = null, body = null, responseStatus = null, responseTime = null) {
    this.info('API_CALL', `${method} ${url}`, {
      headers: headers,
      body: body,
      responseStatus: responseStatus,
      responseTime: responseTime
    });
  }
  
  /**
   * Loggt API-Antworten
   */
  logAPIResponse(url, status, data = null, error = null) {
    if (error) {
      this.error('API_RESPONSE', `Fehler bei ${url}`, { status, data }, error);
    } else {
      this.info('API_RESPONSE', `Antwort von ${url}`, { 
        status, 
        dataSize: data ? JSON.stringify(data).length : 0 
      });
    }
  }
  
  /**
   * Loggt Spielaktionen
   */
  logGameAction(action, gameId, gameTitle = null, data = null) {
    this.info('GAME_ACTION', `${action}: ${gameTitle || gameId}`, {
      gameId,
      gameTitle,
      action,
      ...data
    });
  }
  
  /**
   * Loggt Netzwerk-Operationen
   */
  logNetworkOperation(operation, details = null) {
    this.info('NETWORK', operation, details);
  }
  
  /**
   * Loggt VPN-Operationen
   */
  logVPNOperation(operation, success = null, details = null) {
    const level = success === false ? 'ERROR' : 'INFO';
    this.log(level, 'VPN', operation, details);
  }
  
  /**
   * Startet einen Performance-Timer
   */
  startTimer(name, category = 'PERFORMANCE') {
    const startTime = process.hrtime.bigint();
    this.performanceTimers.set(name, { startTime, category });
    this.debug('TIMER_START', `Timer gestartet: ${name}`);
  }
  
  /**
   * Stoppt einen Performance-Timer und loggt die Zeit
   */
  endTimer(name, additionalData = null) {
    const timerData = this.performanceTimers.get(name);
    if (!timerData) {
      this.warn('TIMER_END', `Timer nicht gefunden: ${name}`);
      return null;
    }
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - timerData.startTime) / 1000000; // Convert to milliseconds
    
    this.performanceTimers.delete(name);
    
    this.info('PERFORMANCE', `Timer beendet: ${name}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...additionalData
    });
    
    return duration;
  }
  
  /**
   * Loggt Systemereignisse
   */
  logSystemEvent(event, details = null) {
    this.info('SYSTEM', event, details);
  }
  
  /**
   * Loggt Dateisystemoperationen
   */
  logFileOperation(operation, filepath, success = true, error = null) {
    const level = success ? 'DEBUG' : 'ERROR';
    this.log(level, 'FILE_SYSTEM', `${operation}: ${filepath}`, null, error);
  }
  
  /**
   * Loggt IPC-Kommunikation
   */
  logIPC(channel, direction, data = null) {
    this.debug('IPC', `${direction} ${channel}`, data);
  }
  
  /**
   * Gibt die aktuellen Statistiken zurück
   */
  getStats() {
    return {
      ...this.stats,
      activeTimers: this.performanceTimers.size,
      logFiles: Object.keys(this.logFiles).map(key => ({
        name: key,
        path: this.logFiles[key],
        exists: fs.existsSync(this.logFiles[key]),
        size: fs.existsSync(this.logFiles[key]) ? fs.statSync(this.logFiles[key]).size : 0
      }))
    };
  }
  
  /**
   * Exportiert Logs als JSON
   */
  exportLogs(category = null, level = null, since = null) {
    // Diese Methode würde die Log-Dateien parsen und als JSON zurückgeben
    // Hier ist ein Grundgerüst - eine vollständige Implementierung würde
    // die Log-Dateien lesen und nach den Kriterien filtern
    this.info('EXPORT', 'Log-Export angefordert', { category, level, since });
  }
  
  /**
   * Bereinigt alte Log-Dateien
   */
  cleanup() {
    try {
      Object.values(this.logFiles).forEach(filepath => {
        for (let i = this.maxFiles; i <= this.maxFiles + 5; i++) {
          const oldFile = `${filepath}.${i}`;
          if (fs.existsSync(oldFile)) {
            fs.unlinkSync(oldFile);
            this.debug('CLEANUP', `Alte Log-Datei gelöscht: ${oldFile}`);
          }
        }
      });
    } catch (error) {
      this.error('CLEANUP', 'Fehler bei der Log-Bereinigung', null, error);
    }
  }
}

// Globaler Logger (Singleton)
let globalLogger = null;

/**
 * Initialisiert den globalen Logger
 */
function initLogger(options = {}) {
  if (!globalLogger) {
    globalLogger = new DustLogger(options);
  }
  return globalLogger;
}

/**
 * Gibt den globalen Logger zurück
 */
function getLogger() {
  if (!globalLogger) {
    globalLogger = new DustLogger();
  }
  return globalLogger;
}

module.exports = {
  DustLogger,
  initLogger,
  getLogger
};