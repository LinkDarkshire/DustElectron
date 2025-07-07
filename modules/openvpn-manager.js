// openvpn-manager.js - Verbesserte OpenVPN Integration für Dust GM
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const fetch = require('node-fetch');
const SocksProxyAgent = require('socks-proxy-agent');

class OpenVPNManager {
  constructor() {
    this.vpnProcess = null;
    this.isConnected = false;
    this.connectionStatus = 'disconnected';
    this.socksProxy = null;
    this.proxyPort = 1080;
    this.authFilePath = null;
    this.logBuffer = [];
    this.maxLogLines = 1000;
    
    // Platform-spezifische OpenVPN Pfade
    this.openVpnPaths = this.getOpenVpnPaths();
  }

  getOpenVpnPaths() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return [
        path.join(process.resourcesPath, 'openvpn', 'bin', 'openvpn.exe'),
        'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
        'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
        path.join(__dirname, '..', 'bin', 'openvpn.exe')
      ];
    } else if (platform === 'darwin') {
      return [
        '/usr/local/bin/openvpn',
        '/opt/homebrew/bin/openvpn',
        '/Applications/Tunnelblick.app/Contents/Resources/openvpn/openvpn-2.5.8/openvpn'
      ];
    } else {
      return [
        '/usr/sbin/openvpn',
        '/usr/bin/openvpn',
        '/usr/local/bin/openvpn'
      ];
    }
  }

  async findOpenVpnExecutable() {
    for (const vpnPath of this.openVpnPaths) {
      try {
        await fs.access(vpnPath);
        console.log(`OpenVPN gefunden: ${vpnPath}`);
        return vpnPath;
      } catch (error) {
        // Datei nicht gefunden, weiter suchen
        continue;
      }
    }
    
    throw new Error('OpenVPN executable nicht gefunden. Bitte installieren Sie OpenVPN.');
  }

  async createAuthFile(username, password) {
    if (!username || !password) {
      throw new Error('Benutzername und Passwort sind erforderlich');
    }

    const authDir = path.join(app.getPath('userData'), 'vpn');
    await fs.mkdir(authDir, { recursive: true });
    
    this.authFilePath = path.join(authDir, 'auth.txt');
    const authContent = `${username}\n${password}`;
    
    await fs.writeFile(this.authFilePath, authContent, { mode: 0o600 });
    return this.authFilePath;
  }

  async cleanupAuthFile() {
    if (this.authFilePath) {
      try {
        await fs.unlink(this.authFilePath);
        this.authFilePath = null;
      } catch (error) {
        console.warn('Konnte Auth-Datei nicht löschen:', error);
      }
    }
  }

  parseOpenVpnConfig(configPath) {
    // Hier könnte man die .ovpn Datei parsen um spezielle Einstellungen zu extrahieren
    // Für jetzt nehmen wir an, dass die Konfiguration korrekt ist
    return {
      configPath,
      needsAuth: true // Könnte aus der Config-Datei ermittelt werden
    };
  }

  async connectToVPN(configPath, username = null, password = null) {
    try {
      if (this.isConnected) {
        throw new Error('VPN ist bereits verbunden');
      }

      this.connectionStatus = 'connecting';
      
      // Finde OpenVPN executable
      const openvpnPath = await this.findOpenVpnExecutable();
      
      // Parse Config
      const config = this.parseOpenVpnConfig(configPath);
      
      // Erstelle Auth-Datei wenn nötig
      if (config.needsAuth && username && password) {
        await this.createAuthFile(username, password);
      }

      // Baue OpenVPN Argumente
      const args = await this.buildOpenVpnArgs(configPath);
      
      console.log(`Starte OpenVPN: ${openvpnPath} ${args.join(' ')}`);
      
      // Starte OpenVPN Prozess
      this.vpnProcess = spawn(openvpnPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      // Setup Event Handlers
      this.setupProcessHandlers();
      
      // Warte auf Verbindung
      await this.waitForConnection();
      
      // Setup SOCKS Proxy falls verfügbar
      await this.setupSocksProxy();
      
      this.isConnected = true;
      this.connectionStatus = 'connected';
      
      console.log('VPN erfolgreich verbunden');
      return true;

    } catch (error) {
      console.error('VPN Verbindung fehlgeschlagen:', error);
      this.connectionStatus = 'error';
      await this.disconnect();
      throw error;
    }
  }

  async buildOpenVpnArgs(configPath) {
    const args = [
      '--config', configPath,
      '--verb', '3',
      '--script-security', '2',
      '--disable-occ', // Disable options consistency check
      '--pull-filter', 'ignore', 'redirect-gateway' // Verhindert komplette Umleitung
    ];

    // Auth-Datei hinzufügen wenn vorhanden
    if (this.authFilePath) {
      args.push('--auth-user-pass', this.authFilePath);
    }

    // Platform-spezifische Argumente
    if (process.platform === 'win32') {
      args.push('--dev-type', 'tun');
    }

    return args;
  }

  setupProcessHandlers() {
    if (!this.vpnProcess) return;

    this.vpnProcess.stdout.on('data', (data) => {
      const output = data.toString();
      this.addToLog('STDOUT', output);
      this.parseOpenVpnOutput(output);
    });

    this.vpnProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.addToLog('STDERR', output);
      this.parseOpenVpnOutput(output);
    });

    this.vpnProcess.on('error', (error) => {
      console.error('VPN Prozess Fehler:', error);
      this.connectionStatus = 'error';
      this.isConnected = false;
    });

    this.vpnProcess.on('exit', (code, signal) => {
      console.log(`VPN Prozess beendet - Code: ${code}, Signal: ${signal}`);
      this.connectionStatus = 'disconnected';
      this.isConnected = false;
      this.cleanup();
    });
  }

  parseOpenVpnOutput(output) {
    // Parse verschiedene OpenVPN Status-Nachrichten
    if (output.includes('Initialization Sequence Completed')) {
      this.connectionStatus = 'connected';
      this.isConnected = true;
    } else if (output.includes('CONNECTED,SUCCESS')) {
      this.connectionStatus = 'connected';
      this.isConnected = true;
    } else if (output.includes('AUTH_FAILED')) {
      this.connectionStatus = 'auth_failed';
    } else if (output.includes('RECONNECTING')) {
      this.connectionStatus = 'reconnecting';
    } else if (output.includes('Connection refused')) {
      this.connectionStatus = 'connection_refused';
    }
  }

  addToLog(type, message) {
    const timestamp = new Date().toISOString();
    this.logBuffer.push(`[${timestamp}] ${type}: ${message.trim()}`);
    
    // Begrenze Log-Buffer
    if (this.logBuffer.length > this.maxLogLines) {
      this.logBuffer = this.logBuffer.slice(-this.maxLogLines);
    }
  }

  async waitForConnection(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('VPN-Verbindung Timeout'));
      }, timeoutMs);

      const checkInterval = setInterval(() => {
        if (this.connectionStatus === 'connected') {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        } else if (this.connectionStatus === 'error' || 
                   this.connectionStatus === 'auth_failed' ||
                   this.connectionStatus === 'connection_refused') {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          reject(new Error(`VPN-Verbindung fehlgeschlagen: ${this.connectionStatus}`));
        }
      }, 1000);
    });
  }

  async setupSocksProxy() {
    try {
      // Teste ob SOCKS Proxy verfügbar ist
      this.socksProxy = new SocksProxyAgent(`socks5://127.0.0.1:${this.proxyPort}`);
      
      // Teste Verbindung
      const response = await fetch('https://httpbin.org/ip', {
        agent: this.socksProxy,
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('SOCKS Proxy aktiv. VPN IP:', data.origin);
      } else {
        this.socksProxy = null;
      }
    } catch (error) {
      console.log('SOCKS Proxy nicht verfügbar:', error.message);
      this.socksProxy = null;
    }
  }

  async disconnect() {
    try {
      this.connectionStatus = 'disconnecting';
      
      if (this.vpnProcess) {
        // Graceful shutdown versuchen
        this.vpnProcess.kill('SIGTERM');
        
        // Nach 5 Sekunden forciert beenden
        setTimeout(() => {
          if (this.vpnProcess) {
            this.vpnProcess.kill('SIGKILL');
          }
        }, 5000);
      }
      
      await this.cleanup();
      
      this.connectionStatus = 'disconnected';
      this.isConnected = false;
      
      console.log('VPN getrennt');
      return true;
      
    } catch (error) {
      console.error('Fehler beim Trennen der VPN-Verbindung:', error);
      return false;
    }
  }

  async cleanup() {
    this.vpnProcess = null;
    this.socksProxy = null;
    await this.cleanupAuthFile();
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      status: this.connectionStatus,
      hasSocksProxy: !!this.socksProxy,
      processRunning: !!this.vpnProcess,
      logs: this.logBuffer.slice(-50) // Letzte 50 Log-Einträge
    };
  }

  getLogs() {
    return this.logBuffer;
  }

  // Für HTTP Requests über VPN
  getProxyAgent() {
    return this.socksProxy;
  }

  async makeVpnRequest(url, options = {}) {
    if (this.socksProxy) {
      options.agent = this.socksProxy;
      console.log(`Request über VPN: ${url}`);
    } else {
      console.log(`Request ohne VPN (Proxy nicht verfügbar): ${url}`);
    }
    
    return fetch(url, options);
  }
}

module.exports = OpenVPNManager;