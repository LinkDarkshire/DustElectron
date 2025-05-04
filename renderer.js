const { ipcRenderer } = require('electron');

// Hauptklasse für die Dust-Anwendung
class DustApp {
  constructor() {
    this.games = [];
    this.currentView = 'grid'; // Grid oder List Ansicht
    this.currentPage = 'library';
    this.filters = {
      search: '',
      genre: 'all',
      source: 'all'
    };
    
    this.initEventListeners();
    this.loadGames();
  }
  
  // Event-Listener initialisieren
  initEventListeners() {
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
    
    element.innerHTML = `
      <div class="game-image" style="background-image: url('${coverImage}')">
        <div class="game-actions">
          <button class="play-btn" title="Spielen" data-directory="${game.directory}">
            <i class="fas fa-play"></i>
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
        
        <div class="add-game-step" id="step-steam-id" style="display: none;">
          <h3>Steam App-ID eingeben</h3>
          <div class="form-group">
            <label for="steam-app-id">Steam App-ID:</label>
            <input type="text" id="steam-app-id" placeholder="z.B. 730 für CS:GO">
            <p class="help-text">
              Die Steam App-ID findest du in der URL eines Spiels auf Steam oder mit SteamDB.
              <a href="https://steamdb.info/" target="_blank">SteamDB öffnen</a>
            </p>
          </div>
          <div class="form-actions">
            <button class="secondary-button back-btn">Zurück</button>
            <button class="primary-button confirm-steam-id">Suchen</button>
          </div>
        </div>
        
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
        
        <div class="add-game-step" id="step-itchio-url" style="display: none;">
          <h3>Itch.io URL eingeben</h3>
          <div class="form-group">
            <label for="itchio-url">Itch.io Spiel-URL:</label>
            <input type="text" id="itchio-url" placeholder="z.B. https://developer.itch.io/game">
            <p class="help-text">
              Gib die vollständige URL zur Spielseite auf Itch.io ein.
            </p>
          </div>
          <div class="form-actions">
            <button class="secondary-button back-btn">Zurück</button>
            <button class="primary-button confirm-itchio-url">Suchen</button>
          </div>
        </div>
        
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
        
        <div class="add-game-step" id="step-game-details" style="display: none;">
          <h3>Spieldetails überprüfen</h3>
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
              <input type="text" id="game-source" readonly>
            </div>
            <div class="form-group">
              <label for="game-version">Version</label>
              <input type="text" id="game-version">
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
              <label for="game-cover-url">Cover URL</label>
              <input type="text" id="game-cover-url">
              <div class="cover-preview">
                <img id="cover-preview-img" src="assets/placeholder.png" alt="Cover Vorschau">
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="secondary-button back-btn">Zurück</button>
              <button type="submit" class="primary-button">Spiel hinzufügen</button>
            </div>
          </form>
        </div>
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
      
      // Je nach Plattform und Importtyp weitergehen
      if (this.selectedImportType === 'single') {
        // Bei einzelnem Spiel nach ID/URL fragen
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
            // Bei "Andere" direkt zum Ordner-Auswahl
            document.getElementById('step-select-folder').style.display = 'block';
            document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der das Spiel enthält.';
            break;
        }
      } else {
        // Bei Ordner-Import direkt zum Ordner-Auswahl
        document.getElementById('step-select-folder').style.display = 'block';
        
        // Unterschiedliche Hilfetexte je nach Plattform
        switch (this.selectedPlatform) {
          case 'steam':
            document.getElementById('folder-help-text').textContent = 'Wähle den Steam-Bibliotheksordner (z.B. steamapps/common).';
            break;
          case 'dlsite':
            document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der deine DLSite-Spiele enthält.';
            break;
          case 'itchio':
            document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der deine Itch.io-Spiele enthält.';
            break;
          default:
            document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der mehrere Spiele enthält.';
            break;
        }
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
        
        // Zum Ordner-Auswahl-Schritt
        document.getElementById('step-dlsite-id').style.display = 'none';
        document.getElementById('step-select-folder').style.display = 'block';
        document.getElementById('folder-help-text').textContent = 'Wähle den Ordner, der das DLSite-Spiel enthält.';
        
        // Spieldetails speichern für später
        this.pendingGameDetails = {
          ...gameDetails,
          source: 'DLSite',
          dlsiteId: dlsiteId,
          dlsiteCategory: dlsiteCategory
        };
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
        
        // Zum Spieldetails-Schritt
        document.getElementById('step-select-folder').style.display = 'none';
        document.getElementById('step-game-details').style.display = 'block';
        
        // Formular mit Details füllen
        this.fillGameDetailsForm(result.gameDetails || this.pendingGameDetails || {});
        
        // Spielverzeichnis speichern
        this.selectedGameFolder = result.selectedFolder;
        this.selectedExecutable = result.executable || '';
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
      
      // Plattformspezifische Details
      steamAppId: this.pendingGameDetails?.steamAppId,
      dlsiteId: this.pendingGameDetails?.dlsiteId,
      dlsiteCategory: this.pendingGameDetails?.dlsiteCategory,
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
    // IPC-Aufruf zum Abrufen der DLSite-Spieldetails
    return await ipcRenderer.invoke('fetch-dlsite-game-details', dlsiteId, category);
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