const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * DLSite API Client für Electron
 * Diese Klasse bietet Methoden zum Abrufen von Informationen über Spiele auf DLSite
 */
class DLSiteClient {
  /**
   * Konstruktor
   * @param {string} locale - Locale für die API-Anfragen (Standard: 'en_US')
   * @param {string} assetsPath - Pfad zum Assets-Ordner (Standard: './assets/games')
   */
  constructor(locale = 'en_US', assetsPath = './assets/games') {
    this.locale = locale;
    this.assetsPath = assetsPath;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept-Language': locale
    };
    this.cookies = {
      adultchecked: '1'
    };
    
    // Stelle sicher, dass der Assets-Ordner existiert
    if (!fs.existsSync(this.assetsPath)) {
      fs.mkdirSync(this.assetsPath, { recursive: true });
    }
    
    // Cache für heruntergeladene Bilder
    this.imageCache = new Map();
  }

  /**
   * Findet eine DLSite Produkt-ID in einem String
   * @param {string} str - String, der eine DLSite-ID enthält
   * @returns {string} - Normalisierte DLSite-ID
   */
  findProductId(str) {
    const match = str.match(/(?<!\w)[BRV]J\d+/i);
    if (match) {
      return match[0].toUpperCase();
    }
    throw new Error(`Keine gültige DLSite-Produkt-ID gefunden: ${str}`);
  }

  /**
   * Konvertiert Cookies-Objekt in Cookie-Header-String
   * @private
   * @returns {string} - Cookie-Header-String
   */
  _getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  /**
   * Prüft, ob eine URL absolut ist und fügt ggf. das Protokoll und die Domain hinzu
   * @private
   * @param {string} url - Die zu prüfende URL
   * @returns {string} - Absolute URL
   */
  _ensureAbsoluteUrl(url) {
    if (!url) return null;
    
    if (url.startsWith('//')) {
      // URLs, die mit // beginnen, fehlt nur das Protokoll
      return `https:${url}`;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Relative URLs erhalten das Standard-Protokoll und die Domain
      if (url.startsWith('/')) {
        return `https://www.dlsite.com${url}`;
      } else {
        return `https://www.dlsite.com/${url}`;
      }
    }
    
    return url;
  }

  /**
   * Ruft grundlegende Produktinformationen vom DLSite AJAX-API ab
   * @param {string} productId - DLSite Produkt-ID
   * @returns {Promise<Object>} - Produktinformationen
   */
  async getProductInfo(productId) {
    try {
      // Normalisiere die Produkt-ID
      try {
        productId = this.findProductId(productId);
      } catch (error) {
        // Wenn die ID nicht extrahiert werden kann, verwende sie direkt
      }

      const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${productId}&locale=${this.locale}`;
      
      const response = await fetch(url, {
        headers: {
          ...this.headers,
          Cookie: this._getCookieHeader()
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP Fehler: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || !data[productId]) {
        throw new Error(`Keine Produktinformationen gefunden für: ${productId}`);
      }
      
      // Stelle sicher, dass alle URLs absolut sind
      const result = data[productId];
      if (result.work_image) {
        result.work_image = this._ensureAbsoluteUrl(result.work_image);
      }
      
      return result;
    } catch (error) {
      console.error('Fehler beim Abrufen der Produktinformationen:', error);
      throw error;
    }
  }

  /**
   * Ruft detaillierte Produktinformationen von der DLSite-Webseite ab
   * @param {string} productId - DLSite Produkt-ID
   * @param {string} category - DLSite-Kategorie (Standard: 'maniax')
   * @returns {Promise<Object>} - Detaillierte Produktinformationen
   */
  async getWorkDetails(productId, category = 'maniax') {
    try {
      const urls = [
        `https://www.dlsite.com/${category}/work/=/product_id/${productId}.html`,
        `https://www.dlsite.com/${category}/announce/=/product_id/${productId}.html`
      ];

      let html = null;
      let response = null;
      let finalUrl = null;

      // Versuche URLs nacheinander, bis eine erfolgreich ist
      for (const url of urls) {
        try {
          response = await fetch(url, {
            headers: {
              ...this.headers,
              Cookie: this._getCookieHeader()
            }
          });

          if (response.ok) {
            html = await response.text();
            finalUrl = url;
            break;
          }
        } catch (error) {
          console.warn(`Fehler beim Abrufen von ${url}:`, error);
        }
      }

      if (!html) {
        throw new Error(`Konnte keine Details für ${productId} abrufen`);
      }

      return this.parseWorkHTML(html, finalUrl);
    } catch (error) {
      console.error('Fehler beim Abrufen der Produktdetails:', error);
      throw error;
    }
  }

  /**
   * Parst HTML einer Werk-Seite für detaillierte Informationen
   * @private
   * @param {string} html - HTML-Inhalt der Werk-Seite
   * @param {string} baseUrl - Basis-URL für relative Links
   * @returns {Object} - Extrahierte Informationen
   */
  parseWorkHTML(html, baseUrl) {
    const $ = cheerio.load(html);
    const details = {};
    
    // Grundlegende Informationen
    details.work_name = $('#work_name').text().trim();
    
    // Circle/Hersteller-Name
    const makerName = $('span.maker_name a').text().trim();
    details.circle = makerName;
    
    // Beschreibung
    details.description = $('#work_outline').text().trim();

    // Genre
    details.genre = [];
    $('.main_genre a').each((i, elem) => {
      details.genre.push($(elem).text().trim());
    });

    // Cover-Bild
    const coverImg = $('#work_left .product-slider-data div img');
    if (coverImg.length) {
      let coverImageSrc = coverImg.attr('src');
      details.coverImage = this._ensureAbsoluteUrl(coverImageSrc);
    }

    // Szenario, Illustrationen, Sprecher, usw.
    $('#work_outline tr, #work_maker tr').each((i, elem) => {
      const header = $(elem).find('th').text().trim();
      const value = $(elem).find('td');

      // Mapping von japanischen/englischen Headers zu Feldnamen
      const headerMap = {
        '作者': 'author',
        'Author': 'author',
        'サークル名': 'circle',
        'Circle': 'circle',
        'ブランド名': 'brand',
        'Brand': 'brand',
        '出版社名': 'publisher',
        'Publisher': 'publisher',
        '言語': 'language',
        'Language': 'language',
        'シナリオ': 'scenario',
        'Scenario': 'scenario',
        'イラスト': 'illustration',
        'Illustration': 'illustration',
        '声優': 'voice_actor',
        'Voice Actor': 'voice_actor',
        'ジャンル': 'genre',
        'Genre': 'genre',
        '販売日': 'release_date',
        'Release Date': 'release_date',
        'ファイル容量': 'file_size',
        'File Size': 'file_size'
      };

      if (headerMap[header]) {
        const field = headerMap[header];
        
        // Für Felder, die Listen sind
        if (['author', 'scenario', 'illustration', 'voice_actor', 'genre'].includes(field)) {
          details[field] = [];
          value.find('a').each((j, link) => {
            details[field].push($(link).text().trim());
          });
        } else {
          // Für einfache Textfelder
          details[field] = value.text().trim();
        }
      }
    });

    // Sample-Bilder
    details.sample_images = [];
    $('.product-slider-data div').each((i, elem) => {
      const src = $(elem).attr('data-src');
      if (src && !src.includes('_img_main')) {
        details.sample_images.push(this._ensureAbsoluteUrl(src));
      }
    });

    // Tags extrahieren (zusätzlich zu Genre)
    details.tags = [];
    $('.work_genre a').each((i, elem) => {
      details.tags.push($(elem).text().trim());
    });

    return details;
  }

  /**
   * Generiert eine eindeutige ID für ein Spiel
   * @param {string} productId - DLSite Produkt-ID
   * @param {number} internalId - Interne ID des Spiels (optional)
   * @returns {string} - Eindeutige ID
   */
  generateGameId(productId, internalId = null) {
    if (!productId) {
      // Fallback für den Fall, dass keine Produkt-ID vorhanden ist
      return `dlsite_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    
    const prefix = internalId ? `${String(internalId).padStart(5, '0')}_` : '';
    return `${prefix}dlsite_${productId.toLowerCase()}`;
  }

  /**
   * Lädt ein Bild herunter und speichert es im Assets-Ordner
   * @param {string} imageUrl - URL des Bildes
   * @param {string} productId - DLSite Produkt-ID
   * @param {number} internalId - Interne ID des Spiels (optional)
   * @returns {Promise<string>} - Lokaler Pfad zum gespeicherten Bild
   */
  async downloadImage(imageUrl, productId, internalId = null) {
    try {
      if (!imageUrl) {
        console.warn('Keine Bild-URL zum Herunterladen angegeben');
        return null;
      }
      
      // Loggen der Eingabeparameter für Debugging
      console.log(`downloadImage aufgerufen mit: imageUrl=${imageUrl}, productId=${productId}, internalId=${internalId}`);
      
      // Stelle sicher, dass die ProductId definiert ist
      if (!productId || productId === 'undefined' || productId === 'null') {
        console.warn('Keine gültige Produkt-ID für die Bildbenennung angegeben');
        // Versuche die ID aus der URL zu extrahieren
        const idMatch = imageUrl.match(/[BRV]J\d{6,8}/i);
        if (idMatch) {
          productId = idMatch[0].toUpperCase();
          console.log(`Produkt-ID aus URL extrahiert: ${productId}`);
        } else {
          productId = "unknown";
        }
      }
      
      // Stelle sicher, dass die URL absolut ist
      const absoluteUrl = this._ensureAbsoluteUrl(imageUrl);
      
      if (!absoluteUrl) {
        console.warn(`Konnte keine absolute URL aus ${imageUrl} erstellen`);
        return null;
      }
      
      // Prüfe Cache, ob das Bild bereits heruntergeladen wurde
      const cacheKey = absoluteUrl;
      if (this.imageCache.has(cacheKey)) {
        return this.imageCache.get(cacheKey);
      }
      
      console.log(`Versuche Bild herunterzuladen: ${absoluteUrl}`);
      
      const response = await fetch(absoluteUrl, {
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`HTTP Fehler beim Bilddownload: ${response.status}`);
      }
      
      // Verwende eine Hexadezimalzahl mit 5 Stellen für die interne ID
      // Wenn keine interne ID angegeben wurde, verwende 00001 für das erste Spiel
      let idPrefix;
      if (internalId) {
        idPrefix = internalId.toString(16).padStart(5, '0'); // Hexadezimal mit 5 Stellen
      } else {
        // Simuliere interne ID 1 wenn keine angegeben
        idPrefix = "00001";
      }
      
      const extension = path.extname(absoluteUrl) || '.jpg';
      const fileName = `${idPrefix}_dlsite_${productId}${extension}`;
      const filePath = path.join(this.assetsPath, fileName);
      console.log(`Speichere Bild unter: ${filePath}`);
      const webPath = `assets/games/${fileName}`.replace(/\\/g, '/');
      console.log(`Web-Pfad für Bild: ${webPath}`);
      
      // Stream zum Speichern des Bildes
      const buffer = await response.buffer();
      fs.writeFileSync(filePath, buffer);
      
      console.log(`Bild erfolgreich gespeichert unter: ${filePath}`);
      
      // Speichere Pfad im Cache
      this.imageCache.set(cacheKey, filePath);
      
      return `assets/games/${fileName}`.replace(/\\/g, '/');
    } catch (error) {
      console.error('Fehler beim Herunterladen des Bildes:', error);
      return null;
    }
  }

  /**
   * Erstellt ein Game-Info-Objekt aus den kombinierten API- und HTML-Daten
   * @param {Object} basicInfo - Grundlegende Informationen vom AJAX-API
   * @param {Object} details - Detaillierte Informationen vom HTML-Parsing
   * @param {number} internalId - Interne ID des Spiels (optional)
   * @returns {Promise<Object>} - Für den Dust Game Manager formatierte Spielinformationen
   */
  async createGameInfo(basicInfo, details, internalId = null) {
    // Stelle sicher, dass wir eine gültige Produkt-ID haben
    const productId = (basicInfo && basicInfo.product_id) ? basicInfo.product_id : 
                    (details && details.productId) ? details.productId : null;
    
    console.log(`createGameInfo mit productId=${productId}, internalId=${internalId}`);
    
    // Generiere eine eindeutige ID für das Spiel
    const gameId = this.generateGameId(productId, internalId);
    
    // Bild herunterladen
    let coverImagePath = null;
    if (details.coverImage) {
      coverImagePath = await this.downloadImage(details.coverImage, productId, internalId);
    } else if (basicInfo && basicInfo.work_image) {
      coverImagePath = await this.downloadImage(basicInfo.work_image, productId, internalId);
    }
    
    // Kombiniere Tags und Genres für vollständigere Informationen
    const allTags = [...new Set([
      ...(details.genre || []),
      ...(details.tags || [])
    ])];
    
    return {
      id: gameId,
      title: details.work_name || (basicInfo ? basicInfo.work_name : null) || `DLSite Game ${productId}`,
      developer: details.circle || (basicInfo ? basicInfo.maker_name : null) || "Unbekannter Entwickler",
      publisher: details.publisher || details.circle || (basicInfo ? basicInfo.maker_name : null) || "DLSite",
      genre: details.genre && details.genre.length > 0 ? details.genre[0] : "Visual Novel",
      description: details.description || (basicInfo ? basicInfo.description : null) || `Ein Spiel von DLSite mit der ID ${productId}`,
      coverImage: coverImagePath || "", // Lokaler Pfad statt URL
      source: "DLSite",
      // Weitere DLSite-spezifische Informationen
      dlsiteId: productId,
      dlsiteUrl: `https://www.dlsite.com/maniax/work/=/product_id/${productId}.html`,
      dlsiteCircle: details.circle || (basicInfo ? basicInfo.maker_name : null),
      dlsiteTags: allTags,
      dlsiteVoiceActors: details.voice_actor || [],
      dlsiteReleaseDate: details.release_date || (basicInfo ? basicInfo.regist_date : null) || "",
      dlsiteFileSize: details.file_size || "",
      // Weitere Metadaten
      language: details.language || "Japanisch",
      authors: details.author || [],
      illustrators: details.illustration || [],
      scenario: details.scenario || []
    };
  }

  /**
   * Hauptmethode zum Abrufen aller Spielinformationen
   * @param {string} productId - DLSite Produkt-ID
   * @param {string} category - DLSite-Kategorie (Standard: 'maniax')
   * @param {number} internalId - Interne ID des Spiels (optional)
   * @returns {Promise<Object>} - Vollständige Spielinformationen
   */
  async getGameInfo(productId, category = 'maniax', internalId = null) {
    try {
      // Grundlegende Infos vom API abrufen
      let basicInfo = null;
      try {
        basicInfo = await this.getProductInfo(productId);
      } catch (error) {
        console.warn(`Konnte keine grundlegenden Infos für ${productId} abrufen:`, error);
        // Erstelle ein minimales basicInfo-Objekt
        basicInfo = { product_id: productId };
      }
      
      // Detaillierte Infos vom HTML abrufen
      let details = null;
      try {
        details = await this.getWorkDetails(productId, category);
      } catch (error) {
        console.warn(`Konnte keine detaillierten Infos für ${productId} abrufen:`, error);
        // Erstelle ein minimales details-Objekt
        details = { productId: productId };
      }
      
      // Beide Informationsquellen kombinieren
      const gameInfo = await this.createGameInfo(basicInfo, details, internalId);
      
      return gameInfo;
    } catch (error) {
      console.error('Fehler beim Abrufen der Spielinformationen:', error);
      // Erstelle ein Fallback-Objekt mit einer generierten ID
      const gameId = this.generateGameId(productId, internalId);
      return {
        id: gameId,
        error: true,
        message: `Fehler: ${error.message}`,
        title: `DLSite Game ${productId}`,
        developer: "Unknown Developer",
        publisher: "DLSite",
        genre: "Visual Novel",
        description: `Ein Spiel von DLSite mit der ID ${productId}`,
        coverImage: "",
        source: "DLSite",
        dlsiteId: productId,
        dlsiteUrl: `https://www.dlsite.com/maniax/work/=/product_id/${productId}.html`
      };
    }
  }
  
  /**
   * Versucht, eine DLSite-ID aus einem Ordnerpfad zu extrahieren
   * @param {string} folderPath - Der zu prüfende Ordnerpfad
   * @returns {string|null} - Die gefundene DLSite-ID oder null
   */
  extractDLSiteIdFromPath(folderPath) {
    try {
      // Versuche im Pfad und allen Unterverzeichnissen zu suchen
      const match = folderPath.match(/[BRV]J\d{6,8}/i);
      if (match) {
        return match[0].toUpperCase();
      }
      
      // Versuche den Ordnernamen zu prüfen
      const dirName = path.basename(folderPath);
      const dirMatch = dirName.match(/[BRV]J\d{6,8}/i);
      if (dirMatch) {
        return dirMatch[0].toUpperCase();
      }
      
      return null;
    } catch (error) {
      console.warn(`Fehler beim Extrahieren der DLSite-ID aus dem Pfad: ${error.message}`);
      return null;
    }
  }
}

module.exports = DLSiteClient;