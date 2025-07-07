// network-manager.js - Aktualisierte Version für Dust GM
const fetch = require('node-fetch');
const OpenVPNManager = require('./openvpn-manager');

class NetworkManager {
  constructor() {
    this.vpnManager = new OpenVPNManager();
    this.useVPN = false;
    this.requestQueue = [];
    this.maxRetries = 3;
  }

  async enableVPN(configPath, username = null, password = null) {
    try {
      console.log('Aktiviere VPN für Dust GM...');
      
      await this.vpnManager.connectToVPN(configPath, username, password);
      this.useVPN = true;
      
      console.log('VPN erfolgreich aktiviert - nur für Dust GM Traffic');
      return { success: true, message: 'VPN verbunden' };
      
    } catch (error) {
      console.error('VPN Verbindung fehlgeschlagen:', error);
      this.useVPN = false;
      
      return { 
        success: false, 
        message: error.message || 'VPN Verbindung fehlgeschlagen',
        error: error.message
      };
    }
  }

  async disableVPN() {
    try {
      console.log('Deaktiviere VPN...');
      
      const success = await this.vpnManager.disconnect();
      this.useVPN = false;
      
      if (success) {
        console.log('VPN erfolgreich deaktiviert');
        return { success: true, message: 'VPN getrennt' };
      } else {
        return { success: false, message: 'Fehler beim Trennen der VPN-Verbindung' };
      }
      
    } catch (error) {
      console.error('Fehler beim Deaktivieren des VPN:', error);
      return { 
        success: false, 
        message: 'Fehler beim Deaktivieren des VPN',
        error: error.message
      };
    }
  }

  async makeRequest(url, options = {}, retryCount = 0) {
    try {
      // Verwende VPN-Proxy wenn aktiviert und verfügbar
      if (this.useVPN && this.vpnManager.getProxyAgent()) {
        options.agent = this.vpnManager.getProxyAgent();
        console.log(`Request über VPN: ${url}`);
      } else if (this.useVPN) {
        console.log(`Request über VPN (ohne SOCKS Proxy): ${url}`);
      } else {
        console.log(`Request ohne VPN: ${url}`);
      }
      
      // Standard Timeout setzen falls nicht vorhanden
      if (!options.timeout) {
        options.timeout = 30000; // 30 Sekunden
      }
      
      const response = await fetch(url, options);
      
      // Log Response Status
      console.log(`Response: ${response.status} ${response.statusText}`);
      
      return response;
      
    } catch (error) {
      console.error(`Request fehlgeschlagen (Versuch ${retryCount + 1}):`, error.message);
      
      // Retry Logic für temporäre Netzwerkfehler
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        console.log(`Wiederhole Request in 2 Sekunden...`);
        await this.delay(2000);
        return this.makeRequest(url, options, retryCount + 1);
      }
      
      throw error;
    }
  }

  shouldRetry(error) {
    // Bestimme ob ein Retry sinnvoll ist basierend auf dem Fehlertyp
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'socket hang up'
    ];
    
    return retryableErrors.some(err => 
      error.message.includes(err) || error.code === err
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Spezielle Methode für DLSite Requests
  async makeDLSiteRequest(url, options = {}) {
    // DLSite-spezifische Headers
    const dlsiteOptions = {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers
      }
    };
    
    return this.makeRequest(url, dlsiteOptions);
  }

  // Batch Requests für mehrere URLs
  async makeBatchRequests(requests, concurrency = 3) {
    const results = [];
    const executing = [];
    
    for (const request of requests) {
      const promise = this.makeRequest(request.url, request.options)
        .then(response => ({ 
          url: request.url, 
          response, 
          success: true 
        }))
        .catch(error => ({ 
          url: request.url, 
          error: error.message, 
          success: false 
        }));
        
      results.push(promise);
      
      if (requests.indexOf(request) >= concurrency) {
        executing.push(promise);
        
        if (executing.length >= concurrency) {
          await Promise.race(executing);
          executing.splice(executing.findIndex(p => p === promise), 1);
        }
      }
    }
    
    return Promise.all(results);
  }

  getVPNStatus() {
    const status = this.vpnManager.getStatus();
    return {
      enabled: this.useVPN,
      connected: status.isConnected,
      status: status.status,
      hasSocksProxy: status.hasSocksProxy,
      processRunning: status.processRunning,
      logs: status.logs
    };
  }

  isVPNEnabled() {
    return this.useVPN && this.vpnManager.getStatus().isConnected;
  }

  getVPNLogs() {
    return this.vpnManager.getLogs();
  }

  // Test VPN Verbindung
  async testVPNConnection() {
    if (!this.isVPNEnabled()) {
      return {
        success: false,
        message: 'VPN ist nicht aktiviert'
      };
    }
    
    try {
      const response = await this.makeRequest('https://httpbin.org/ip', {
        timeout: 10000
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: 'VPN-Verbindung funktioniert',
          vpnIP: data.origin
        };
      } else {
        return {
          success: false,
          message: 'VPN-Test fehlgeschlagen'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'VPN-Test Fehler: ' + error.message
      };
    }
  }

  // Download-Methode mit Progress-Tracking
  async downloadFile(url, options = {}, progressCallback = null) {
    try {
      const response = await this.makeRequest(url, {
        ...options,
        timeout: 60000 // Längerer Timeout für Downloads
      });
      
      if (!response.ok) {
        throw new Error(`Download fehlgeschlagen: ${response.status}`);
      }
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : null;
      let downloaded = 0;
      
      const chunks = [];
      
      return new Promise((resolve, reject) => {
        response.body.on('data', (chunk) => {
          chunks.push(chunk);
          downloaded += chunk.length;
          
          if (progressCallback && total) {
            progressCallback({
              downloaded,
              total,
              percentage: Math.round((downloaded / total) * 100)
            });
          }
        });
        
        response.body.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        
        response.body.on('error', reject);
      });
      
    } catch (error) {
      console.error('Download Fehler:', error);
      throw error;
    }
  }
}

module.exports = NetworkManager;