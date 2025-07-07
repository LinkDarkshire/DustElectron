const { ipcRenderer } = require('electron');

// Hauptklasse für die Dust-Anwendung
class DustApp {
  constructor() {
    this.games = [];
    this.currentView = 'grid';
    this.currentPage = 'library';
    this.filters = {
      search: '',
      genre: 'all',
      source: 'all'
    };

    console.log('DustApp wird initialisiert...');

    this.initEventListeners();
    this.loadGames();
    this.initVPNWidget(); // Am Ende aufrufen
  }
  
  // Event-Listener initialisieren
  initEventListeners() {
    console.log('Event Listeners werden initialisiert...');
    
    // Navigation
    document.querySelectorAll('.nav-button').forEach(button => {
      button.addEventListener('click', () => {
        this.changePage(button.dataset.page);
      });
    });

    // Suchfeld
    const searchInput = document.querySelector('.search-bar');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }
    
    // "Spiel hinzufügen" Button
    const addGameBtn = document.getElementById('add-game-btn');
    if (addGameBtn) {
      addGameBtn.addEventListener('click', () => {
        console.log('Spiel hinzufügen Button geklickt');
        this.showAddGameModal();
      });
    }
    
    console.log('Alle Event Listeners installiert');
  }

  // VPN Widget initialisieren
  initVPNWidget() {
    console.log('VPN Widget wird initialisiert...');
    
    this.vpnStatus = 'disconnected';
    this.selectedVPNConfig = null;
    this.vpnConfigs = [];
    
    // Event Listeners für VPN-Steuerung
    const vpnToggleBtn = document.getElementById('vpn-toggle-btn');
    const vpnConfigBtn = document.getElementById('vpn-config-btn');
    
    if (vpnToggleBtn) {
      vpnToggleBtn.addEventListener('click', () => {
        console.log('VPN Toggle Button geklickt');
        if (this.vpnStatus === 'connected') {
          this.disconnectVPN();
        } else if (this.vpnStatus === 'disconnected') {
          this.connectVPN();
        }
      });
    }
    
    if (vpnConfigBtn) {
      vpnConfigBtn.addEventListener('click', () => {
        console.log('VPN Config Button geklickt');
        this.showVPNConfigModal();
      });
    }
    
    // Lade verfügbare VPN-Konfigurationen
    this.loadVPNConfigs();
    
    console.log('VPN Widget initialisiert');

        // Suchfeld
    const searchInput = document.querySelector('.search-bar');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }
    
    // Ansicht ändern (Grid/Liste)
    const viewToggleBtn = document.getElementById('view-toggle');
    if (viewToggleBtn) {
      viewToggleBtn.addEventListener('click', () => {
        this.toggleView();
      });
    }
    
    // Filter für Genre
    const genreFilter = document.getElementById('genre-filter');
    if (genreFilter) {
      genreFilter.addEventListener('change', (e) => {
        this.filters.genre = e.target.value;
        this.applyFilters();
      });
    }
    
    // Filter für Quelle
    const sourceFilter = document.getElementById('source-filter');
    if (sourceFilter) {
      sourceFilter.addEventListener('change', (e) => {
        this.filters.source = e.target.value;
        this.applyFilters();
      });
    }
    
    // "Spiel hinzufügen" Button
    const addGameBtn = document.getElementById('add-game-btn');
    if (addGameBtn) {
      addGameBtn.addEventListener('click', () => {
        this.showAddGameModal();
      });
    }
    
    // Spiel-Kontextmenü
    document.addEventListener('contextmenu', (e) => {
      const gameCard = e.target.closest('.game-card');
      if (gameCard) {
        e.preventDefault();
        this.showGameContextMenu(gameCard, e.pageX, e.pageY);
      }
    });
    
    // Klick außerhalb des Kontextmenüs schließt es
    document.addEventListener('click', () => {
      const contextMenu = document.getElementById('context-menu');
      if (contextMenu) {
        contextMenu.remove();
      }
    });
    
    // Spiel starten beim Doppelklick auf ein Spiel
    document.addEventListener('dblclick', (e) => {
      const gameCard = e.target.closest('.game-card');
      if (gameCard) {
        const directory = gameCard.dataset.directory;
        this.launchGame(directory);
      }
    });
  }

  // VPN Status aktualisieren
  updateVPNStatus(status, message = '') {
    this.vpnStatus = status;
    
    const statusLight = document.getElementById('vpn-status-light');
    const statusText = document.getElementById('vpn-status-text');
    const toggleBtn = document.getElementById('vpn-toggle-btn');
    
    if (!statusLight || !statusText || !toggleBtn) {
      console.warn('VPN UI Elemente nicht gefunden');
      return;
    }
    
    // Entferne alle Status-Klassen
    statusLight.classList.remove('connected', 'connecting');
    toggleBtn.classList.remove('connected', 'connecting');
    
    switch (status) {
      case 'connected':
        statusLight.classList.add('connected');
        statusText.textContent = 'Connected';
        toggleBtn.classList.add('connected');
        toggleBtn.innerHTML = '<i class="fas fa-power-off"></i><span>Disconnect</span>';
        toggleBtn.disabled = false;
        break;
        
      case 'connecting':
        statusLight.classList.add('connecting');
        statusText.textContent = 'Connecting...';
        toggleBtn.classList.add('connecting');
        toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Connecting...</span>';
        toggleBtn.disabled = true;
        break;
        
      case 'disconnected':
      default:
        statusText.textContent = message || 'Disconnected';
        toggleBtn.innerHTML = '<i class="fas fa-power-off"></i><span>Connect VPN</span>';
        toggleBtn.disabled = !this.selectedVPNConfig;
        break;
    }
  }

  // VPN verbinden
  async connectVPN() {
    if (!this.selectedVPNConfig) {
      this.showNotification('Bitte wähle zuerst eine VPN-Konfiguration aus', 'error');
      return;
    }
    
    try {
      this.updateVPNStatus('connecting');
      
      const result = await ipcRenderer.invoke('enable-vpn', this.selectedVPNConfig);
      
      if (result.success) {
        this.updateVPNStatus('connected');
        this.showNotification('VPN erfolgreich verbunden', 'success');
      } else {
        this.updateVPNStatus('disconnected', 'Connection failed');
        this.showNotification(`VPN-Verbindung fehlgeschlagen: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('VPN-Verbindungsfehler:', error);
      this.updateVPNStatus('disconnected', 'Connection failed');
      this.showNotification('VPN-Verbindung fehlgeschlagen', 'error');
    }
  }
  // VPN trennen
  async disconnectVPN() {
    try {
      this.updateVPNStatus('connecting');
      
      const result = await ipcRenderer.invoke('disable-vpn');
      
      if (result.success) {
        this.updateVPNStatus('disconnected');
        this.showNotification('VPN getrennt', 'info');
      } else {
        this.updateVPNStatus('connected');
        this.showNotification(`Fehler beim Trennen: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('VPN-Trennungsfehler:', error);
      this.updateVPNStatus('connected');
      this.showNotification('Fehler beim Trennen der VPN-Verbindung', 'error');
    }
  }

async checkVPNStatus() {
  try {
    const status = await ipcRenderer.invoke('get-vpn-status');
    
    // Status nur aktualisieren, wenn er sich geändert hat
    if (status.connected && this.vpnStatus !== 'connected') {
      this.updateVPNStatus('connected');
    } else if (!status.connected && this.vpnStatus === 'connected') {
      this.updateVPNStatus('disconnected', 'Connection lost');
      this.showNotification('VPN-Verbindung verloren', 'error');
    }
  } catch (error) {
    console.error('Fehler beim Prüfen des VPN-Status:', error);
  }
}

  // VPN Konfigurationen laden
  async loadVPNConfigs() {
    try {
      const configs = await ipcRenderer.invoke('get-vpn-configs');
      this.vpnConfigs = configs;
      
      console.log('VPN Konfigurationen geladen:', configs);
      
      if (this.vpnConfigs.length > 0 && !this.selectedVPNConfig) {
        this.selectedVPNConfig = this.vpnConfigs[0].path;
        this.updateVPNStatus('disconnected');
      }
    } catch (error) {
      console.error('Fehler beim Laden der VPN-Konfigurationen:', error);
    }
  }

showVPNConfigModal() {
  console.log('Zeige VPN Config Modal');

  const modal = document.createElement('div');
  modal.className = 'modal vpn-config-modal';
  modal.id = 'vpn-config-modal';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>VPN Konfiguration</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <h3>Verfügbare Konfigurationen:</h3>
        <div id="config-list">
          ${this.vpnConfigs.length === 0 ? 
            '<p>Keine VPN-Konfigurationen gefunden.</p>' : 
            this.vpnConfigs.map(config => `
              <div class="config-file-item">
                <span class="config-file-name">${config.name}</span>
                <div class="config-file-actions">
                  <button class="select-config-btn" data-path="${config.path}">
                    ${this.selectedVPNConfig === config.path ? 'Ausgewählt' : 'Auswählen'}
                  </button>
                </div>
              </div>
            `).join('')
          }
        </div>
        <div class="form-actions">
          <button class="secondary-button" id="add-config-btn">
            <i class="fas fa-plus"></i> Konfiguration hinzufügen
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Modal schließen
  modal.querySelector('.close-modal').addEventListener('click', () => {
    modal.remove();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Konfiguration auswählen
  modal.querySelectorAll('.select-config-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const configPath = btn.dataset.path;
      this.selectedVPNConfig = configPath;
      this.updateVPNStatus('disconnected');
      this.showNotification('VPN-Konfiguration ausgewählt', 'success');
      modal.remove();
    });
  });
  
  // Neue Konfiguration hinzufügen
  const addConfigBtn = modal.querySelector('#add-config-btn');
  if (addConfigBtn) {
    addConfigBtn.addEventListener('click', async () => {
      try {
        const result = await ipcRenderer.invoke('select-vpn-config');
        if (result.success) {
          this.loadVPNConfigs();
          this.showNotification('VPN-Konfiguration hinzugefügt', 'success');
          modal.remove();
        }
      } catch (error) {
        console.error('Fehler beim Hinzufügen der VPN-Konfiguration:', error);
        this.showNotification('Fehler beim Hinzufügen der Konfiguration', 'error');
      }
    });
  }
}
  
  // Seite wechseln
  changePage(pageName) {
    this.currentPage = pageName;
    
    // UI aktualisieren
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(pageName).classList.add('active');
    
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`.nav-button[data-page="${pageName}"]`).classList.add('active');
    
    // Inhalte aktualisieren basierend auf der Seite
    if (pageName === 'library') {
      this.loadGames();
    }
  }
  
  // Ansicht zwischen Grid und Liste umschalten
  toggleView() {
    const container = document.querySelector('.game-grid');
    const viewToggleBtn = document.getElementById('view-toggle');
    
    if (this.currentView === 'grid') {
      this.currentView = 'list';
      container.classList.remove('game-grid');
      container.classList.add('game-list');
      viewToggleBtn.innerHTML = '<i class="fas fa-th-large"></i>';
      viewToggleBtn.title = "Grid-Ansicht";
    } else {
      this.currentView = 'grid';
      container.classList.remove('game-list');
      container.classList.add('game-grid');
      viewToggleBtn.innerHTML = '<i class="fas fa-list"></i>';
      viewToggleBtn.title = "Listen-Ansicht";
    }
    
    this.renderGames(this.games);
  }
  
  // Spiele von IPC laden
  async loadGames() {
    try {
      this.games = await ipcRenderer.invoke('scan-games');
      
      // Genres für Filter extrahieren
      this.updateGenreFilter();
      
      // Quellen für Filter extrahieren
      this.updateSourceFilter();
      
      // Spiele rendern
      this.applyFilters();
    } catch (error) {
      console.error('Fehler beim Laden der Spiele:', error);
      this.showNotification('Fehler beim Laden der Spiele', 'error');
    }
  }
  // Spiel-Details anzeigen
showGameDetails(gameInfo) {
  // Bestehende Detail-Ansicht entfernen, falls vorhanden
  const existingDetails = document.getElementById('game-details-panel');
  if (existingDetails) {
    existingDetails.remove();
  }

  // Detail-Panel erstellen
  const detailsPanel = document.createElement('div');
  detailsPanel.id = 'game-details-panel';
  detailsPanel.className = 'game-details-panel';
  
  // Formatiere Tags als String
  let tagsHtml = '';
  if (gameInfo.dlsiteTags && gameInfo.dlsiteTags.length > 0) {
    tagsHtml = `
      <div class="detail-group">
        <h4>Tags</h4>
        <div class="tag-list">
          ${gameInfo.dlsiteTags.map(tag => `<span class="game-tag">${tag}</span>`).join('')}
        </div>
      </div>
    `;
  }
  
  // Formatiere Voice Actors als String
  let voiceActorsHtml = '';
  if (gameInfo.dlsiteVoiceActors && gameInfo.dlsiteVoiceActors.length > 0) {
    voiceActorsHtml = `
      <div class="detail-group">
        <h4>Sprecher</h4>
        <p>${gameInfo.dlsiteVoiceActors.join(', ')}</p>
      </div>
    `;
  }
  
  // Formatiere Autoren als String
  let authorsHtml = '';
  if (gameInfo.authors && gameInfo.authors.length > 0) {
    authorsHtml = `
      <div class="detail-group">
        <h4>Autoren</h4>
        <p>${gameInfo.authors.join(', ')}</p>
      </div>
    `;
  }
  
  // Formatiere Illustratoren als String
  let illustratorsHtml = '';
  if (gameInfo.illustrators && gameInfo.illustrators.length > 0) {
    illustratorsHtml = `
      <div class="detail-group">
        <h4>Illustrationen</h4>
        <p>${gameInfo.illustrators.join(', ')}</p>
      </div>
    `;
  }
  
  // Formatiere Szenario-Autoren als String
  let scenarioHtml = '';
  if (gameInfo.scenario && gameInfo.scenario.length > 0) {
    scenarioHtml = `
      <div class="detail-group">
        <h4>Szenario</h4>
        <p>${gameInfo.scenario.join(', ')}</p>
      </div>
    `;
  }
  
  // Platzhalterbild verwenden, wenn kein Cover vorhanden ist
  const coverImage = gameInfo.coverImage && gameInfo.coverImage.trim() !== '' 
    ? gameInfo.coverImage 
    : 'assets/placeholder.png';
  
  detailsPanel.innerHTML = `
    <div class="details-header">
      <h2>${gameInfo.title}</h2>
      <button class="toggle-details-btn" title="Details ausblenden">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="details-content">
      <div class="details-main-info">
        <div class="details-cover">
          <img src="${coverImage}" alt="${gameInfo.title}">
        </div>
        <div class="details-primary-info">
          <div class="detail-group">
            <h4>Entwickler</h4>
            <p>${gameInfo.developer || 'Unbekannt'}</p>
          </div>
          <div class="detail-group">
            <h4>Publisher</h4>
            <p>${gameInfo.publisher || 'Unbekannt'}</p>
          </div>
          <div class="detail-group">
            <h4>Genre</h4>
            <p>${gameInfo.genre || 'Unbekannt'}</p>
          </div>
          <div class="detail-group">
            <h4>Sprache</h4>
            <p>${gameInfo.language || 'Unbekannt'}</p>
          </div>
          <div class="detail-group">
            <h4>Dateigröße</h4>
            <p>${gameInfo.dlsiteFileSize || 'Unbekannt'}</p>
          </div>
          <div class="detail-group">
            <h4>Erscheinungsdatum</h4>
            <p>${gameInfo.dlsiteReleaseDate || 'Unbekannt'}</p>
          </div>
        </div>
      </div>
      
      <div class="details-description">
        <h4>Beschreibung</h4>
        <p>${gameInfo.description || 'Keine Beschreibung verfügbar'}</p>
      </div>
      
      ${tagsHtml}
      ${voiceActorsHtml}
      ${authorsHtml}
      ${illustratorsHtml}
      ${scenarioHtml}
      
      <div class="detail-group">
        <h4>Quelle</h4>
        <p>${gameInfo.source || 'Unbekannt'}</p>
        ${gameInfo.dlsiteUrl ? `<a href="${gameInfo.dlsiteUrl}" target="_blank" class="store-link">Im DLSite-Shop öffnen</a>` : ''}
      </div>
      
      <div class="details-actions">
        <button class="primary-button play-game-btn" data-directory="${gameInfo.directory}">
          <i class="fas fa-play"></i> Spielen
        </button>
        <button class="secondary-button edit-game-btn" data-directory="${gameInfo.directory}">
          <i class="fas fa-edit"></i> Bearbeiten
        </button>
      </div>
    </div>
  `;
  
  document.getElementById('content').appendChild(detailsPanel);
  
  // Event-Listener für das Schließen der Detail-Ansicht
  detailsPanel.querySelector('.toggle-details-btn').addEventListener('click', () => {
    detailsPanel.remove();
  });
  
  // Event-Listener für "Spielen"-Button
  detailsPanel.querySelector('.play-game-btn').addEventListener('click', () => {
    this.launchGame(gameInfo.directory);
  });
  
  // Event-Listener für "Bearbeiten"-Button
  detailsPanel.querySelector('.edit-game-btn').addEventListener('click', () => {
    this.showEditGameModal(gameInfo);
  });
  
  // Event-Listener für den Shop-Link, falls vorhanden
  const storeLink = detailsPanel.querySelector('.store-link');
  if (storeLink) {
    storeLink.addEventListener('click', (e) => {
      e.preventDefault();
      const { shell } = require('electron');
      shell.openExternal(storeLink.href);
    });
  }
}
  // Genre-Filter aktualisieren
  updateGenreFilter() {
    const genreFilter = document.getElementById('genre-filter');
    if (!genreFilter) return;
    
    // Aktuelle Auswahl speichern
    const currentSelection = genreFilter.value;
    
    // Alle Genres extrahieren
    const genres = new Set(['all']);
    this.games.forEach(game => {
      if (game.genre) {
        genres.add(game.genre);
      }
    });
    
    // Filter-Optionen aktualisieren
    genreFilter.innerHTML = '';
    
    genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre === 'all' ? 'Alle Genres' : genre;
      genreFilter.appendChild(option);
    });
    
    // Vorherige Auswahl wiederherstellen
    genreFilter.value = currentSelection;
  }
  
  // Quellen-Filter aktualisieren
  updateSourceFilter() {
    const sourceFilter = document.getElementById('source-filter');
    if (!sourceFilter) return;
    
    // Aktuelle Auswahl speichern
    const currentSelection = sourceFilter.value;
    
    // Alle Quellen extrahieren
    const sources = new Set(['all']);
    this.games.forEach(game => {
      if (game.source) {
        sources.add(game.source);
      }
    });
    
    // Filter-Optionen aktualisieren
    sourceFilter.innerHTML = '';
    
    sources.forEach(source => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source === 'all' ? 'Alle Quellen' : source;
      sourceFilter.appendChild(option);
    });
    
    // Vorherige Auswahl wiederherstellen
    sourceFilter.value = currentSelection;
  }
  
  // Filter anwenden
  applyFilters() {
    let filteredGames = [...this.games];
    
    // Textsuche
    if (this.filters.search) {
      filteredGames = filteredGames.filter(game => 
        game.title.toLowerCase().includes(this.filters.search) ||
        (game.developer && game.developer.toLowerCase().includes(this.filters.search)) ||
        (game.description && game.description.toLowerCase().includes(this.filters.search))
      );
    }
    
    // Genre-Filter
    if (this.filters.genre && this.filters.genre !== 'all') {
      filteredGames = filteredGames.filter(game => 
        game.genre === this.filters.genre
      );
    }
    
    // Quellen-Filter
    if (this.filters.source && this.filters.source !== 'all') {
      filteredGames = filteredGames.filter(game => 
        game.source === this.filters.source
      );
    }
    
    this.renderGames(filteredGames);
  }
  
  // Spiele rendern
  renderGames(gamesToRender) {
    const container = document.querySelector(this.currentView === 'grid' ? '.game-grid' : '.game-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (gamesToRender.length === 0) {
      container.innerHTML = `
        <div class="empty-library">
          <i class="fas fa-ghost"></i>
          <p>Keine Spiele gefunden</p>
          <button id="empty-add-game" class="primary-button">
            <i class="fas fa-plus"></i> Spiel hinzufügen
          </button>
        </div>
      `;
      
      const emptyAddBtn = document.getElementById('empty-add-game');
      if (emptyAddBtn) {
        emptyAddBtn.addEventListener('click', () => this.showAddGameModal());
      }
      return;
    }
    
    // Sortieren nach Titel
    gamesToRender.sort((a, b) => a.title.localeCompare(b.title));
    
    gamesToRender.forEach(game => {
      const gameElement = this.createGameElement(game);
      container.appendChild(gameElement);
    });
  }
  
  // Ein Spielelement erstellen
  createGameElement(game) {
    const element = document.createElement('div');
    element.className = this.currentView === 'grid' ? 'game-card' : 'game-card list-view';
    element.dataset.directory = game.directory;
    
    // Formatierung für das zuletzt gespielte Datum
  let lastPlayedText = 'Noch nie gespielt';
  if (game.lastPlayed) {
    const lastPlayed = new Date(game.lastPlayed);
    const now = new Date();
    const diffDays = Math.floor((now - lastPlayed) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      lastPlayedText = 'Heute gespielt';
    } else if (diffDays === 1) {
      lastPlayedText = 'Gestern gespielt';
    } else {
      lastPlayedText = `Vor ${diffDays} Tagen gespielt`;
    }
  }
  
  // Spielzeit formatieren
  let playTimeText = 'Keine Spielzeit';
  if (game.playTime && game.playTime > 0) {
    if (game.playTime < 60) {
      playTimeText = `${game.playTime} Minuten`;
    } else {
      const hours = Math.floor(game.playTime / 60);
      const minutes = game.playTime % 60;
      playTimeText = `${hours} Std. ${minutes} Min.`;
    }
  }
  
  // Platzhalterbild verwenden, wenn kein Cover vorhanden ist
  const coverImage = game.coverImage && game.coverImage.trim() !== '' 
    ? game.coverImage 
    : 'assets/placeholder.png';

    console.log(`Spiel ${game.title}, Cover-Pfad: ${coverImage}`);
  
  element.innerHTML = `
    <div class="game-image" style="background-image: url('${coverImage}')">
      <div class="game-actions">
        <button class="play-btn" title="Spielen" data-directory="${game.directory}">
          <i class="fas fa-play"></i>
        </button>
        <button class="info-btn" title="Details anzeigen" data-directory="${game.directory}">
          <i class="fas fa-info-circle"></i>
        </button>
      </div>
    </div>
    <div class="game-info">
      <h3 class="game-title">${game.title}</h3>
      <div class="game-details">
        <span class="game-developer">${game.developer || 'Unbekannter Entwickler'}</span>
        <span class="game-genre">${game.genre || 'Sonstiges'}</span>
      </div>
      <div class="game-meta">
        <span class="game-last-played" title="${lastPlayedText}">
          <i class="fas fa-clock"></i> ${lastPlayedText}
        </span>
        <span class="game-playtime" title="${playTimeText}">
          <i class="fas fa-hourglass-half"></i> ${playTimeText}
        </span>
      </div>
    </div>
  `;
  
  // Event-Listener für den Play-Button
  const playBtn = element.querySelector('.play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.launchGame(game.directory);
    });
  }
  
  // Event-Listener für den Info-Button
  const infoBtn = element.querySelector('.info-btn');
  if (infoBtn) {
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showGameDetails(game);
    });
  }
  
  // Event-Listener für Klick auf das Spiel
  element.addEventListener('click', () => {
    this.showGameDetails(game);
  });
  
  return element;
}
  
  // Spiel starten
  async launchGame(directory) {
    try {
      const result = await ipcRenderer.invoke('launch-game', directory);
      
      if (result.success) {
        this.showNotification(result.message, 'success');
      } else {
        this.showNotification(result.message, 'error');
      }
    } catch (error) {
      console.error('Fehler beim Starten des Spiels:', error);
      this.showNotification('Fehler beim Starten des Spiels', 'error');
    }
  }
  
  // Kontextmenü für ein Spiel anzeigen
  showGameContextMenu(gameCard, x, y) {
    const directory = gameCard.dataset.directory;
    const gameInfo = this.games.find(game => game.directory === directory);
    
    if (!gameInfo) return;
    
    // Altes Kontextmenü entfernen, falls vorhanden
    const oldMenu = document.getElementById('context-menu');
    if (oldMenu) {
      oldMenu.remove();
    }
    
    // Neues Kontextmenü erstellen
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    menu.innerHTML = `
      <div class="menu-item" id="ctx-play"><i class="fas fa-play"></i> Spielen</div>
      <div class="menu-item" id="ctx-edit"><i class="fas fa-edit"></i> Bearbeiten</div>
      <div class="menu-item" id="ctx-folder"><i class="fas fa-folder-open"></i> Ordner öffnen</div>
      <div class="menu-item danger" id="ctx-delete"><i class="fas fa-trash"></i> Entfernen</div>
    `;
    
    document.body.appendChild(menu);
    
    // Event-Listener für Menüaktionen
    document.getElementById('ctx-play').addEventListener('click', () => {
      this.launchGame(directory);
      menu.remove();
    });
    
    document.getElementById('ctx-edit').addEventListener('click', () => {
      this.showEditGameModal(gameInfo);
      menu.remove();
    });
    
    document.getElementById('ctx-folder').addEventListener('click', () => {
      // Ordner im Datei-Explorer öffnen
      if (gameInfo.executablePath) {
        const { shell } = require('electron');
        shell.openPath(gameInfo.executablePath);
      } else {
        this.showNotification('Pfad nicht gefunden', 'error');
      }
      menu.remove();
    });
    
    document.getElementById('ctx-delete').addEventListener('click', () => {
      this.confirmDeleteGame(directory, gameInfo.title);
      menu.remove();
    });
  }
  
// "Spiel hinzufügen" Modal anzeigen
showAddGameModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'add-game-modal';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Spiel hinzufügen</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="add-game-step" id="step-platform">
          <h3>Schritt 1: Plattform auswählen</h3>
          <div class="platform-selection">
            <div class="platform-card" data-platform="steam">
              <img src="assets/platforms/steam.png" alt="Steam" class="platform-icon">
              <span>Steam</span>
            </div>
            <div class="platform-card" data-platform="itchio">
              <img src="assets/platforms/itchio.png" alt="Itch.io" class="platform-icon">
              <span>Itch.io</span>
            </div>
            <div class="platform-card" data-platform="dlsite">
              <img src="assets/platforms/dlsite.png" alt="DLSite" class="platform-icon">
              <span>DLSite</span>
            </div>
            <div class="platform-card" data-platform="other">
              <img src="assets/platforms/other.png" alt="Other" class="platform-icon">
              <span>Andere</span>
            </div>
          </div>
        </div>
        
        <div class="add-game-step" id="step-import-type" style="display: none;">
          <h3>Schritt 2: Importmethode wählen</h3>
          <div class="import-type-selection">
            <button class="import-type-btn" data-type="single">
              <i class="fas fa-gamepad"></i>
              <span>Einzelnes Spiel</span>
            </button>
            <button class="import-type-btn" data-type="folder">
              <i class="fas fa-folder"></i>
              <span>Kompletter Ordner</span>
            </button>
          </div>
          <button class="secondary-button back-btn">Zurück</button>
        </div>
        
        <!-- Hier die Reihenfolge der Schritte ändern -->
        <div class="add-game-step" id="step-select-folder" style="display: none;">
          <h3>Spielordner auswählen</h3>
          <p>
            Wähle den Ordner aus, in dem sich das Spiel befindet. 
            <span class="platform-specific-text" id="folder-help-text"></span>
          </p>
          <div class="form-actions">
            <button class="secondary-button back-btn">Zurück</button>
            <button class="primary-button select-folder-btn">Ordner auswählen</button>
          </div>
        </div>
        
        <!-- DLSite ID Formular wird nur angezeigt, wenn keine ID im Pfad gefunden wurde -->
        <div class="add-game-step" id="step-dlsite-id" style="display: none;">
          <h3>DLSite Produkt-ID eingeben</h3>
          <div class="form-group">
            <label for="dlsite-id">DLSite ID (RJ/RE-Nummer):</label>
            <input type="text" id="dlsite-id" placeholder="z.B. RJ01347095">
            <p class="help-text">
              Die RJ/RE-Nummer findest du in der URL eines Produkts auf DLSite.
              Format: RJxxxxxxxx für japanische oder RExxxxxxxx für englische Titel.
            </p>
          </div>
          <div class="form-group">
            <label for="dlsite-category">DLSite Kategorie:</label>
            <select id="dlsite-category">
              <option value="maniax" selected>Maniax</option>
              <!-- Weitere Kategorien können später hinzugefügt werden -->
            </select>
          </div>
          <div class="form-actions">
            <button class="secondary-button back-btn">Zurück</button>
            <button class="primary-button confirm-dlsite-id">Suchen</button>
          </div>
        </div>
        
        <!-- Restliche Schritte unverändert -->
        <!-- ... -->
      </div>
    <!-- Spiel-Details und Ausführbare Datei auswählen -->
<div class="add-game-step" id="step-game-details" style="display: none;">
  <h3>Spielinformationen überprüfen</h3>
  <form id="add-game-form">
    <div class="form-group">
      <label for="game-title">Titel</label>
      <input type="text" id="game-title" required>
    </div>
    <div class="form-group">
      <label for="game-developer">Entwickler</label>
      <input type="text" id="game-developer">
    </div>
    <div class="form-group">
      <label for="game-publisher">Publisher</label>
      <input type="text" id="game-publisher">
    </div>
    <div class="form-group">
      <label for="game-genre">Genre</label>
      <input type="text" id="game-genre">
    </div>
    <div class="form-group">
      <label for="game-source">Quelle</label>
      <input type="text" id="game-source">
    </div>
    <div class="form-group">
      <label for="game-version">Version</label>
      <input type="text" id="game-version" value="1.0">
    </div>
    <div class="form-group">
      <label for="game-executable">Ausführbare Datei</label>
      <input type="text" id="game-executable" readonly>
    </div>
    <div class="form-group full-width">
      <label for="game-description">Beschreibung</label>
      <textarea id="game-description" rows="3"></textarea>
    </div>
    <div class="form-group">
      <label for="game-cover-url">Cover-Bild URL</label>
      <input type="text" id="game-cover-url">
      <div class="cover-preview">
        <img id="cover-preview-img" src="assets/placeholder.png" alt="Cover-Vorschau">
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="secondary-button back-btn">Zurück</button>
      <button type="submit" class="primary-button">Spiel hinzufügen</button>
    </div>
  </form>
</div>

  `;
  
  document.body.appendChild(modal);
  
  // Modal-Interaktionen
  modal.querySelector('.close-modal').addEventListener('click', () => {
    modal.remove();
  });
  
  // Klick außerhalb des Modals schließt es
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Plattformauswahl
  const platformCards = modal.querySelectorAll('.platform-card');
  platformCards.forEach(card => {
    card.addEventListener('click', () => {
      const platform = card.dataset.platform;
      this.selectedPlatform = platform;
      
      // Nächsten Schritt anzeigen
      document.getElementById('step-platform').style.display = 'none';
      document.getElementById('step-import-type').style.display = 'block';
    });
  });
  
  // Import-Typ-Auswahl
  const importTypeButtons = modal.querySelectorAll('.import-type-btn');
  importTypeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const importType = button.dataset.type;
      this.selectedImportType = importType;
      
      // Zurück zum vorherigen Schritt
      document.getElementById('step-import-type').style.display = 'none';
      
      // Bei allen Plattformen direkt zum Ordner-Auswahl gehen
      document.getElementById('step-select-folder').style.display = 'block';
      
      // Unterschiedliche Hilfetexte je nach Plattform
      switch (this.selectedPlatform) {
        case 'steam':
          document.getElementById('folder-help-text').textContent = this.selectedImportType === 'single' 
            ? 'Wähle den Ordner, der das Steam-Spiel enthält.' 
            : 'Wähle den Steam-Bibliotheksordner (z.B. steamapps/common).';
          break;
        case 'dlsite':
          document.getElementById('folder-help-text').textContent = this.selectedImportType === 'single' 
            ? 'Wähle den Ordner, der das DLSite-Spiel enthält. Die RJ/RE-Nummer wird automatisch erkannt.' 
            : 'Wähle den Ordner, der deine DLSite-Spiele enthält.';
          break;
        case 'itchio':
          document.getElementById('folder-help-text').textContent = this.selectedImportType === 'single' 
            ? 'Wähle den Ordner, der das Itch.io-Spiel enthält.' 
            : 'Wähle den Ordner, der deine Itch.io-Spiele enthält.';
          break;
        default:
          document.getElementById('folder-help-text').textContent = this.selectedImportType === 'single' 
            ? 'Wähle den Ordner, der das Spiel enthält.' 
            : 'Wähle den Ordner, der mehrere Spiele enthält.';
          break;
      }
    });
  });
  
  // Steam-ID bestätigen
  const confirmSteamIdBtn = modal.querySelector('.confirm-steam-id');
  if (confirmSteamIdBtn) {
    confirmSteamIdBtn.addEventListener('click', async () => {
      const steamAppId = document.getElementById('steam-app-id').value.trim();
      if (!steamAppId) {
        this.showNotification('Bitte gib eine Steam App-ID ein', 'error');
        return;
      }
      
      try {
        // Spieldetails von Steam abrufen
        const gameDetails = await this.fetchSteamGameDetails(steamAppId);
        
        // Zum Ordner-Auswahl-Schritt
        document.getElementById('step-steam-id').style.display = 'none';
        document.getElementById('step-select-folder').style.display = 'block';
        document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der das Steam-Spiel enthält.';
        
        // Spieldetails speichern für später
        this.pendingGameDetails = {
          ...gameDetails,
          source: 'Steam',
          steamAppId: steamAppId
        };
      } catch (error) {
        this.showNotification('Fehler beim Abrufen der Steam-Spieldetails', 'error');
        console.error(error);
      }
    });
  }
  
 // DLSite-ID bestätigen
 const confirmDLSiteIdBtn = modal.querySelector('.confirm-dlsite-id');
 if (confirmDLSiteIdBtn) {
   confirmDLSiteIdBtn.addEventListener('click', async () => {
     const dlsiteId = document.getElementById('dlsite-id').value.trim();
     const dlsiteCategory = document.getElementById('dlsite-category').value;
     
     if (!dlsiteId) {
       this.showNotification('Bitte gib eine DLSite ID ein', 'error');
       return;
     }
     
     try {
       // Spieldetails von DLSite abrufen
       const gameDetails = await this.fetchDLSiteGameDetails(dlsiteId, dlsiteCategory);
       
       // Zum Game-Details-Schritt
       document.getElementById('step-dlsite-id').style.display = 'none';
       document.getElementById('step-game-details').style.display = 'block';
       
       // Spieldetails speichern für später
       this.pendingGameDetails = {
         ...gameDetails,
         source: 'DLSite',
         dlsiteId: dlsiteId,
         dlsiteCategory: dlsiteCategory
       };
       
       // Formular mit Details füllen
       this.fillGameDetailsForm(this.pendingGameDetails);
     } catch (error) {
       this.showNotification('Fehler beim Abrufen der DLSite-Spieldetails', 'error');
       console.error(error);
     }
   });
 }
  
  // Itch.io URL bestätigen
  const confirmItchIoUrlBtn = modal.querySelector('.confirm-itchio-url');
  if (confirmItchIoUrlBtn) {
    confirmItchIoUrlBtn.addEventListener('click', async () => {
      const itchioUrl = document.getElementById('itchio-url').value.trim();
      
      if (!itchioUrl) {
        this.showNotification('Bitte gib eine Itch.io URL ein', 'error');
        return;
      }
      
      try {
        // Spieldetails von Itch.io abrufen
        const gameDetails = await this.fetchItchIoGameDetails(itchioUrl);
        
        // Zum Ordner-Auswahl-Schritt
        document.getElementById('step-itchio-url').style.display = 'none';
        document.getElementById('step-select-folder').style.display = 'block';
        document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der das Itch.io-Spiel enthält.';
        
        // Spieldetails speichern für später
        this.pendingGameDetails = {
          ...gameDetails,
          source: 'Itch.io',
          itchioUrl: itchioUrl
        };
      } catch (error) {
        this.showNotification('Fehler beim Abrufen der Itch.io-Spieldetails', 'error');
        console.error(error);
      }
    });
  }
  
  // Ordner auswählen
  const selectFolderBtn = modal.querySelector('.select-folder-btn');
  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', async () => {
      try {
        const result = await this.selectGameFolder();
        
        if (!result.success) {
          this.showNotification(result.message || 'Ordnerauswahl abgebrochen', 'info');
          return;
        }
        
        // Spielverzeichnis speichern
        this.selectedGameFolder = result.selectedFolder;
        this.selectedExecutable = result.executable || '';
        
        // Für DLSite prüfen, ob wir eine ID gefunden haben
        if (this.selectedPlatform === 'dlsite') {
          if (result.gameDetails && result.gameDetails.dlsiteId) {
            // ID wurde im Pfad gefunden, direkt zum Spieldetails-Schritt
            document.getElementById('step-select-folder').style.display = 'none';
            document.getElementById('step-game-details').style.display = 'block';
            
            // Spieldetails speichern und Formular füllen
            this.pendingGameDetails = result.gameDetails;
            this.fillGameDetailsForm(this.pendingGameDetails);
          } else {
            // Keine ID gefunden, frage nach der ID
            document.getElementById('step-select-folder').style.display = 'none';
            document.getElementById('step-dlsite-id').style.display = 'block';
          }
        } else {
          // Für andere Plattformen direkt zum Spieldetails-Schritt
          document.getElementById('step-select-folder').style.display = 'none';
          document.getElementById('step-game-details').style.display = 'block';
          
          // Formular mit den gefundenen Details füllen
          this.fillGameDetailsForm(result.gameDetails || {});
        }
      } catch (error) {
        this.showNotification('Fehler bei der Ordnerauswahl', 'error');
        console.error(error);
      }
    });
  }
  
  // Zurück-Buttons
  const backButtons = modal.querySelectorAll('.back-btn');
  backButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const currentStep = e.target.closest('.add-game-step');
      currentStep.style.display = 'none';
      
      // Je nach aktuellem Schritt zurück zum passenden vorherigen Schritt
      if (currentStep.id === 'step-import-type') {
        document.getElementById('step-platform').style.display = 'block';
      } else if (['step-steam-id', 'step-dlsite-id', 'step-itchio-url'].includes(currentStep.id)) {
        document.getElementById('step-import-type').style.display = 'block';
      } else if (currentStep.id === 'step-select-folder') {
        if (this.selectedImportType === 'single') {
          // Zurück zur ID/URL-Eingabe
          switch (this.selectedPlatform) {
            case 'steam':
              document.getElementById('step-steam-id').style.display = 'block';
              break;
            case 'dlsite':
              document.getElementById('step-dlsite-id').style.display = 'block';
              break;
            case 'itchio':
              document.getElementById('step-itchio-url').style.display = 'block';
              break;
            default:
              document.getElementById('step-import-type').style.display = 'block';
              break;
          }
        } else {
          document.getElementById('step-import-type').style.display = 'block';
        }
      } else if (currentStep.id === 'step-game-details') {
        document.getElementById('step-select-folder').style.display = 'block';
      }
    });
  });
  
  // Cover-URL Änderung überwachen
  const coverUrlInput = document.getElementById('game-cover-url');
  const coverPreviewImg = document.getElementById('cover-preview-img');
  
  if (coverUrlInput && coverPreviewImg) {
    coverUrlInput.addEventListener('input', () => {
      const url = coverUrlInput.value.trim();
      if (url) {
        coverPreviewImg.src = url;
      } else {
        coverPreviewImg.src = 'assets/placeholder.png';
      }
    });
  }
  
  // Form-Submit-Handler
  const form = document.getElementById('add-game-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const gameInfo = {
      title: form.querySelector('#game-title').value,
      developer: form.querySelector('#game-developer').value,
      publisher: form.querySelector('#game-publisher').value,
      genre: form.querySelector('#game-genre').value,
      source: form.querySelector('#game-source').value,
      version: form.querySelector('#game-version').value,
      description: form.querySelector('#game-description').value,
      coverImage: form.querySelector('#game-cover-url').value,
      executable: form.querySelector('#game-executable').value,
      
      // Additional fields from pending game details
      language: this.pendingGameDetails?.language,
      releaseDate: this.pendingGameDetails?.dlsiteReleaseDate || this.pendingGameDetails?.releaseDate,
      
      // Arrays of additional information
      tags: this.pendingGameDetails?.dlsiteTags || this.pendingGameDetails?.tags,
      authors: this.pendingGameDetails?.authors,
      illustrators: this.pendingGameDetails?.illustrators,
      scenario: this.pendingGameDetails?.scenario,
      voiceActors: this.pendingGameDetails?.dlsiteVoiceActors,
      
      // Platform-specific details
      steamAppId: this.pendingGameDetails?.steamAppId,
      dlsiteId: this.pendingGameDetails?.dlsiteId,
      dlsiteCategory: this.pendingGameDetails?.dlsiteCategory,
      dlsiteCircle: this.pendingGameDetails?.dlsiteCircle,
      dlsiteFileSize: this.pendingGameDetails?.dlsiteFileSize,
      itchioUrl: this.pendingGameDetails?.itchioUrl
    };
    
    // Spiel über IPC hinzufügen
    try {
      const result = await ipcRenderer.invoke('add-game-with-path', gameInfo, this.selectedGameFolder, this.selectedExecutable);
      
      if (result.success) {
        this.showNotification(result.message, 'success');
        modal.remove();
        this.loadGames();  // Spieleliste aktualisieren
      } else {
        this.showNotification(result.message, 'error');
      }
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Spiels:', error);
      this.showNotification('Fehler beim Hinzufügen des Spiels', 'error');
    }
  });
}

// Hilfsfunktion: Spielordner auswählen
async selectGameFolder() {
  try {
    // IPC-Aufruf zum Öffnen des Dateiauswahldialogs
    const result = await ipcRenderer.invoke('select-game-folder', this.selectedPlatform, this.selectedImportType);
    return result;
  } catch (error) {
    console.error('Fehler bei der Ordnerauswahl:', error);
    throw error;
  }
}

// Hilfsfunktion: Spieldetails von Steam abrufen
async fetchSteamGameDetails(appId) {
  try {
    // IPC-Aufruf zum Abrufen der Steam-Spieldetails
    return await ipcRenderer.invoke('fetch-steam-game-details', appId);
  } catch (error) {
    console.error('Fehler beim Abrufen der Steam-Spieldetails:', error);
    throw error;
  }
}

// Hilfsfunktion: Spieldetails von DLSite abrufen
async fetchDLSiteGameDetails(dlsiteId, category = 'maniax') {
  try {
    // Nächste ID bestimmen (für die korrekte Bildbenennung)
    const games = await ipcRenderer.invoke('scan-games');
    const nextId = games.length + 1;
    
    // IPC-Aufruf zum Abrufen der DLSite-Spieldetails mit interner ID
    return await ipcRenderer.invoke('fetch-dlsite-game-details', dlsiteId, category, nextId);
  } catch (error) {
    console.error('Fehler beim Abrufen der DLSite-Spieldetails:', error);
    throw error;
  }
}

// Hilfsfunktion: Spieldetails von Itch.io abrufen
async fetchItchIoGameDetails(url) {
  try {
    // IPC-Aufruf zum Abrufen der Itch.io-Spieldetails
    return await ipcRenderer.invoke('fetch-itchio-game-details', url);
  } catch (error) {
    console.error('Fehler beim Abrufen der Itch.io-Spieldetails:', error);
    throw error;
  }
}

// Hilfsfunktion: Spieldetails-Formular ausfüllen
fillGameDetailsForm(details) {
  const form = document.getElementById('add-game-form');
  
  // Grundlegende Felder ausfüllen
  form.querySelector('#game-title').value = details.title || '';
  form.querySelector('#game-developer').value = details.developer || '';
  form.querySelector('#game-publisher').value = details.publisher || '';
  form.querySelector('#game-genre').value = details.genre || '';
  form.querySelector('#game-source').value = details.source || this.selectedPlatform || '';
  form.querySelector('#game-version').value = details.version || '1.0';
  form.querySelector('#game-description').value = details.description || '';
  form.querySelector('#game-executable').value = details.executable || this.selectedExecutable || '';
  
  // Cover-Bild
  if (details.coverImage) {
    form.querySelector('#game-cover-url').value = details.coverImage;
    document.getElementById('cover-preview-img').src = details.coverImage;
  }
}
  
  // "Spiel bearbeiten" Modal anzeigen
  showEditGameModal(gameInfo) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'edit-game-modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Spiel bearbeiten</h2>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <form id="edit-game-form">
            <div class="form-group">
              <label for="edit-game-title">Titel</label>
              <input type="text" id="edit-game-title" value="${gameInfo.title || ''}" required>
            </div>
            <div class="form-group">
              <label for="edit-game-developer">Entwickler</label>
              <input type="text" id="edit-game-developer" value="${gameInfo.developer || ''}">
            </div>
            <div class="form-group">
              <label for="edit-game-publisher">Publisher</label>
              <input type="text" id="edit-game-publisher" value="${gameInfo.publisher || ''}">
            </div>
            <div class="form-group">
              <label for="edit-game-genre">Genre</label>
              <input type="text" id="edit-game-genre" value="${gameInfo.genre || ''}">
            </div>
            <div class="form-group">
              <label for="edit-game-source">Quelle</label>
              <input type="text" id="edit-game-source" value="${gameInfo.source || ''}">
            </div>
            <div class="form-group">
              <label for="edit-game-version">Version</label>
              <input type="text" id="edit-game-version" value="${gameInfo.version || ''}">
            </div>
            <div class="form-group">
              <label for="edit-executable-path">Ausführbare Datei</label>
              <div class="executable-path">
                <input type="text" id="edit-executable-path" value="${gameInfo.executable || ''}" readonly>
                <button type="button" id="change-exe-btn" class="secondary-button">Ändern</button>
              </div>
            </div>
            <div class="form-group full-width">
              <label for="edit-game-description">Beschreibung</label>
              <textarea id="edit-game-description" rows="3">${gameInfo.description || ''}</textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="primary-button">Speichern</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Modal-Interaktionen
    modal.querySelector('.close-modal').addEventListener('click', () => {
      modal.remove();
    });
    
    // Klick außerhalb des Modals schließt es
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Form-Submit-Handler
    const form = document.getElementById('edit-game-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const updates = {
        title: form.querySelector('#edit-game-title').value,
        developer: form.querySelector('#edit-game-developer').value,
        publisher: form.querySelector('#edit-game-publisher').value,
        genre: form.querySelector('#edit-game-genre').value,
        source: form.querySelector('#edit-game-source').value,
        version: form.querySelector('#edit-game-version').value,
        description: form.querySelector('#edit-game-description').value
      };
      
      try {
        const result = await ipcRenderer.invoke('update-game', gameInfo.directory, updates);
        
        if (result.success) {
          this.showNotification(result.message, 'success');
          modal.remove();
          this.loadGames();  // Spieleliste aktualisieren
        } else {
          this.showNotification(result.message, 'error');
        }
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Spiels:', error);
        this.showNotification('Fehler beim Aktualisieren des Spiels', 'error');
      }
    });
  }
  
  // Bestätigung zum Löschen eines Spiels anzeigen
  confirmDeleteGame(directory, gameTitle) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'confirm-delete-modal';
    
    modal.innerHTML = `
      <div class="modal-content confirm-modal">
        <div class="modal-header">
          <h2>Spiel entfernen</h2>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p>Möchten Sie "${gameTitle}" wirklich aus Dust entfernen?</p>
          <p class="info-text">Das Spiel wird nur aus Dust entfernt, nicht von Ihrer Festplatte gelöscht.</p>
          <div class="form-actions">
            <button id="confirm-delete-btn" class="danger-button">Entfernen</button>
            <button id="cancel-delete-btn" class="secondary-button">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Modal-Interaktionen
    modal.querySelector('.close-modal').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.querySelector('#cancel-delete-btn').addEventListener('click', () => {
      modal.remove();
    });
    
    // Klick außerhalb des Modals schließt es
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Bestätigungs-Handler
    modal.querySelector('#confirm-delete-btn').addEventListener('click', async () => {
      try {
        const result = await ipcRenderer.invoke('delete-game', directory);
        
        if (result.success) {
          this.showNotification(result.message, 'success');
          this.loadGames();  // Spieleliste aktualisieren
        } else {
          this.showNotification(result.message, 'error');
        }
      } catch (error) {
        console.error('Fehler beim Löschen des Spiels:', error);
        this.showNotification('Fehler beim Löschen des Spiels', 'error');
      } finally {
        modal.remove();
      }
    });
  }
  
  // Benachrichtigung anzeigen
  showNotification(message, type = 'info') {
    // Bestehende Benachrichtigungen finden
    const existingNotifications = document.querySelectorAll('.notification');
    const offset = existingNotifications.length * 60;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.bottom = `${20 + offset}px`;
    
    notification.innerHTML = `
      <div class="notification-content">
        <span>${message}</span>
        <button class="close-notification">&times;</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animation hinzufügen
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Automatisch nach 5 Sekunden schließen
    const timeout = setTimeout(() => {
      closeNotification();
    }, 5000);
    
    // Schließen-Button
    const closeBtn = notification.querySelector('.close-notification');
    closeBtn.addEventListener('click', () => {
      clearTimeout(timeout);
      closeNotification();
    });
    
    // Funktion zum Schließen der Benachrichtigung
    function closeNotification() {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }
  }
}

// Warten, bis das DOM geladen ist, dann die App initialisieren
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DustApp();
});

