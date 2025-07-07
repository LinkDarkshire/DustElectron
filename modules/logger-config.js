/**
 * Logger-Konfigurationsdatei für Dust Game Manager
 */

const path = require('path');

// Produktions-Konfiguration
const productionConfig = {
  logLevel: 'INFO',
  enableConsole: false,
  enableFile: true,
  enableStack: false,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  logDir: path.join(process.cwd(), 'logs')
};

// Entwicklungs-Konfiguration
const developmentConfig = {
  logLevel: 'DEBUG',
  enableConsole: true,
  enableFile: true,
  enableStack: true,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 3,
  logDir: path.join(process.cwd(), 'logs')
};

// Test-Konfiguration
const testConfig = {
  logLevel: 'ERROR',
  enableConsole: false,
  enableFile: false,
  enableStack: true,
  maxFileSize: 1 * 1024 * 1024, // 1MB
  maxFiles: 2,
  logDir: path.join(process.cwd(), 'test-logs')
};

// Bestimme Umgebung
const environment = process.env.NODE_ENV || 'production';

let config;
switch (environment) {
  case 'development':
    config = developmentConfig;
    break;
  case 'test':
    config = testConfig;
    break;
  default:
    config = productionConfig;
}

// Umgebungsvariablen können Konfiguration überschreiben
if (process.env.DUST_LOG_LEVEL) {
  config.logLevel = process.env.DUST_LOG_LEVEL.toUpperCase();
}

if (process.env.DUST_LOG_CONSOLE) {
  config.enableConsole = process.env.DUST_LOG_CONSOLE === 'true';
}

if (process.env.DUST_LOG_FILE) {
  config.enableFile = process.env.DUST_LOG_FILE === 'true';
}

if (process.env.DUST_LOG_DIR) {
  config.logDir = process.env.DUST_LOG_DIR;
}

module.exports = config;

/**
 * INTEGRATIONS-ANLEITUNG
 * ======================
 * 
 * 1. Speichere das Logger-System als modules/logger.js
 * 2. Speichere diese Konfiguration als modules/logger-config.js
 * 3. Erstelle modules/logger/index.js mit folgendem Inhalt:
 */

/*
// modules/logger/index.js
const { DustLogger, initLogger, getLogger } = require('./logger');
const config = require('./logger-config');

// Initialisiere Logger mit Konfiguration
const logger = initLogger(config);

module.exports = {
  DustLogger,
  initLogger,
  getLogger,
  config
};
*/

/**
 * 4. Integriere in bestehende Module:
 * 
 * Ersetze am Anfang jeder Datei:
 * const { getLogger } = require('./logger');
 * const logger = getLogger();
 * 
 * 5. Umgebungsvariablen für verschiedene Konfigurationen:
 * 
 * Windows (cmd):
 * set NODE_ENV=development
 * set DUST_LOG_LEVEL=DEBUG
 * set DUST_LOG_CONSOLE=true
 * 
 * Linux/macOS (bash):
 * export NODE_ENV=development
 * export DUST_LOG_LEVEL=DEBUG
 * export DUST_LOG_CONSOLE=true
 * 
 * 6. Package.json Scripts erweitern:
 */

/*
{
  "scripts": {
    "start": "electron .",
    "start:dev": "NODE_ENV=development DUST_LOG_LEVEL=DEBUG DUST_LOG_CONSOLE=true electron .",
    "start:debug": "NODE_ENV=development DUST_LOG_LEVEL=TRACE DUST_LOG_CONSOLE=true electron . --enable-logging",
    "start:prod": "NODE_ENV=production DUST_LOG_LEVEL=INFO DUST_LOG_CONSOLE=false electron .",
    "logs:view": "tail -f logs/dust-main.log",
    "logs:errors": "tail -f logs/dust-error.log",
    "logs:api": "tail -f logs/dust-api.log",
    "logs:cleanup": "rm -rf logs/*.log*"
  }
}
*/

/**
 * 7. Logging-Kategorien und deren Verwendung:
 * 
 * SYSTEM - Anwendungsstart, Shutdown, globale Events
 * GAME_* - Alle spielbezogenen Operationen
 * DLSITE_* - DLSite API und Scraping
 * STEAM_* - Steam Integration
 * VPN_* - VPN-Operationen
 * NETWORK_* - Netzwerk-Requests
 * FILE_* - Dateisystem-Operationen
 * IPC_* - Inter-Process Communication
 * API_* - Allgemeine API-Aufrufe
 * PERFORMANCE - Performance-Messungen
 * 
 * 8. Beispiele für Logging in verschiedenen Situationen:
 */

// Einfache Information
// logger.info('GAME_SCAN', 'Beginne Spielscan');

// Mit zusätzlichen Daten
// logger.info('GAME_SCAN', 'Spielscan abgeschlossen', { gamesFound: 5, scanTime: '2.3s' });

// Fehler mit Exception
// logger.error('DLSITE_API', 'API-Aufruf fehlgeschlagen', { url, productId }, error);

// Performance-Messung
// logger.startTimer('expensive_operation');
// // ... Operation ...
// const time = logger.endTimer('expensive_operation');

// API-Aufruf
// logger.logAPICall('GET', 'https://api.example.com/data', headers, null, 200, '150ms');

// Spielaktion
// logger.logGameAction('LAUNCH_GAME', gameId, gameTitle, { executable: 'game.exe' });

/**
 * 9. Log-Analyse Tools (optional):
 * 
 * Installiere zusätzliche Tools für Log-Analyse:
 * npm install --save-dev winston-daily-rotate-file
 * 
 * Für erweiterte Log-Visualisierung:
 * npm install --save-dev bunyan
 * 
 * 10. Monitoring und Alerts (für erweiterte Nutzung):
 * 
 * Erstelle ein einfaches Monitoring-Script:
 */

/*
// scripts/log-monitor.js
const fs = require('fs');
const path = require('path');

const errorLogPath = path.join(__dirname, '../logs/dust-error.log');

fs.watchFile(errorLogPath, (curr, prev) => {
  if (curr.mtime > prev.mtime) {
    console.log('🚨 Neue Fehler in der Anwendung!');
    // Hier könnte eine Benachrichtigung gesendet werden
  }
});
*/

/**
 * 11. Log-Rotation und Cleanup:
 * 
 * Das Logger-System rotiert automatisch, aber für manuelle Bereinigung:
 */

// Cleanup-Script für alte Logs
const cleanupOldLogs = () => {
  const { getLogger } = require('./modules/logger');
  const logger = getLogger();
  
  logger.cleanup();
  logger.info('CLEANUP', 'Alte Log-Dateien bereinigt');
};

/**
 * 12. Debugging-Tipps:
 * 
 * - Verwende TRACE für sehr detaillierte Informationen
 * - DEBUG für Entwicklungs-Informationen
 * - INFO für normale Betriebsinformationen
 * - WARN für ungewöhnliche aber nicht kritische Situationen
 * - ERROR für Fehler die behandelt werden können
 * - FATAL für kritische Fehler die zum Programmabbruch führen
 * 
 * 13. Performance-Überwachung:
 * 
 * Das System bietet automatische Performance-Überwachung:
 * - Alle Timer werden automatisch geloggt
 * - API-Aufrufe werden mit Response-Zeit protokolliert
 * - Dateisystem-Operationen werden gemessen
 * 
 * 14. Produktionsbereitschaft:
 * 
 * Für die Produktion:
 * - Log-Level auf INFO oder WARN setzen
 * - Console-Logging deaktivieren
 * - File-Logging aktivieren
 * - Regelmäßige Log-Rotation sicherstellen
 * - Monitoring für ERROR/FATAL Logs einrichten
 */

module.exports = config;