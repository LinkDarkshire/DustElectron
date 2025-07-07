const { spawn } = require('child_process');
const SocksProxyAgent = require('socks-proxy-agent');
const fetch = require('node-fetch');

class VPNProxyManager {
  constructor() {
    this.vpnProcess = null;
    this.proxyPort = 1080;
    this.proxyAgent = null;
    this.isConnected = false;
  }

  async startVPNWithProxy(ovpnConfigPath) {
    try {
      console.log('Starte VPN-Verbindung mit Konfiguration:', ovpnConfigPath);
      
      // OpenVPN mit SOCKS5 Proxy starten
      const args = [
        '--config', ovpnConfigPath,
        '--socks-proxy', `127.0.0.1:${this.proxyPort}`,
        '--route-nopull', // Wichtig: Verhindert Standard-Routing
        '--script-security', '2',
        '--verb', '3' // Verbose logging für Debugging
      ];

      this.vpnProcess = spawn('openvpn', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Logging für Debugging
      this.vpnProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`VPN stdout: ${output.trim()}`);
        
        // Prüfe auf erfolgreiche Verbindung
        if (output.includes('Initialization Sequence Completed') || 
            output.includes('CONNECTED,SUCCESS')) {
          this.isConnected = true;
        }
      });

      this.vpnProcess.stderr.on('data', (data) => {
        console.log(`VPN stderr: ${data.toString().trim()}`);
      });

      this.vpnProcess.on('error', (error) => {
        console.error('VPN Prozess Fehler:', error);
        this.isConnected = false;
        throw error;
      });

      this.vpnProcess.on('exit', (code, signal) => {
        console.log(`VPN Prozess beendet - Code: ${code}, Signal: ${signal}`);
        this.isConnected = false;
        this.proxyAgent = null;
      });
      
      // Warte auf Verbindung
      await this.waitForConnection();
      
      // Erstelle SOCKS5 Agent für HTTP-Requests
      this.proxyAgent = new SocksProxyAgent(`socks5://127.0.0.1:${this.proxyPort}`);
      
      console.log('VPN erfolgreich gestartet und SOCKS5 Proxy erstellt');
      return this.proxyAgent;
      
    } catch (error) {
      console.error('Fehler beim Starten des VPN:', error);
      this.cleanup();
      throw error;
    }
  }

  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('VPN-Verbindung Timeout nach 30 Sekunden'));
      }, 30000);

      const checkConnection = async () => {
        try {
          const success = await this.testConnection();
          if (success) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkConnection, 1000);
          }
        } catch (error) {
          // Verbindung noch nicht bereit, versuche erneut
          setTimeout(checkConnection, 1000);
        }
      };

      // Starte ersten Test nach 3 Sekunden
      setTimeout(checkConnection, 3000);
    });
  }

  async testConnection() {
    try {
      // Teste die SOCKS5-Verbindung
      const testAgent = new SocksProxyAgent(`socks5://127.0.0.1:${this.proxyPort}`);
      
      const response = await fetch('https://httpbin.org/ip', {
        agent: testAgent,
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        console.log('VPN-Verbindung erfolgreich getestet. IP:', data.origin);
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('VPN-Verbindungstest fehlgeschlagen:', error.message);
      return false;
    }
  }

  async stopVPN() {
    console.log('Stoppe VPN-Verbindung...');
    this.cleanup();
  }

  cleanup() {
    if (this.vpnProcess) {
      this.vpnProcess.kill('SIGTERM');
      this.vpnProcess = null;
    }
    this.proxyAgent = null;
    this.isConnected = false;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      hasProxy: !!this.proxyAgent,
      processRunning: !!this.vpnProcess
    };
  }
}

module.exports = VPNProxyManager;