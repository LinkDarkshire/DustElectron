const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getLogger } = require('../modules/logger');

const logger = getLogger();

/**
 * DLSite API Client für Electron mit umfassendem Logging
 * Diese Klasse bietet Methoden zum Abrufen von Informationen über Spiele auf DLSite
 */
class DLSiteClient {
  /**
   * Konstruktor
   * @param {string} locale - Locale für die API-Anfragen (Standard: 'en_US')
   * @param {string} assetsPath - Pfad zum Assets-Ordner (Standard: './assets/games')
   */
  constructor(networkManager, assetsPath = './assets/games', locale = 'en_US') {
    this.locale = locale;
    this.assetsPath = assetsPath;
    this.networkManager = networkManager;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept-Language': locale
    };
    this.cookies = {
      adultchecked: '1'
    };
    
    logger.info('DLSITE_CLIENT', 'DLSite Client initialisiert', {
      locale: this.locale,
      assetsPath: this.assetsPath,
      hasNetworkManager: !!this.networkManager
    });
    
    // Stelle sicher, dass der Assets-Ordner existiert
    if (!fs.existsSync(this.assetsPath)) {
      logger.debug('DLSITE_CLIENT', 'Erstelle Assets-Ordner', { path: this.assetsPath });
      fs.mkdirSync(this.assetsPath, { recursive: true });
      logger.logFileOperation('CREATE_DIRECTORY', this.assetsPath, true);
    } else {
      logger.debug('DLSITE_CLIENT', 'Assets-Ordner bereits vorhanden', { path: this.assetsPath });
    }
    
    // Cache für heruntergeladene Bilder
    this.imageCache = new Map();
    logger.debug('DLSITE_CLIENT', 'Image-Cache initialisiert');
  }

  /**
   * Findet eine DLSite Produkt-ID in einem String
   * @param {string} str - String, der eine DLSite-ID enthält
   * @returns {string} - Normalisierte DLSite-ID
   */
  findProductId(str) {
    logger.debug('DLSITE_PARSE', 'Suche Produkt-ID in String', { input: str });
    
    const match = str.match(/(?<!\w)[BRV]J\d+/i);
    if (match) {
      const productId = match[0].toUpperCase();
      logger.debug('DLSITE_PARSE', 'Produkt-ID gefunden', { 
        input: str,
        productId: productId 
      });
      return productId;
    }
    
    logger.error('DLSITE_PARSE', 'Keine gültige DLSite-Produkt-ID gefunden', { input: str });
    throw new Error(`Keine gültige DLSite-Produkt-ID gefunden: ${str}`);
  }

  /**
   * Konvertiert Cookies-Objekt in Cookie-Header-String
   * @private
   * @returns {string} - Cookie-Header-String
   */
  _getCookieHeader() {
    const cookieHeader = Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    logger.trace('DLSITE_REQUEST', 'Cookie-Header erstellt', { 
      cookies: this.cookies,
      header: cookieHeader 
    });
    
    return cookieHeader;
  }

  /**
   * Prüft, ob eine URL absolut ist und fügt ggf. das Protokoll und die Domain hinzu
   * @private
   * @param {string} url - Die zu prüfende URL
   * @returns {string} - Absolute URL
   */
  _ensureAbsoluteUrl(url) {
    if (!url) {
      logger.debug('DLSITE_URL', 'Leere URL übergeben');
      return null;
    }
    
    let absoluteUrl = url;
    
    if (url.startsWith('//')) {
      // URLs, die mit // beginnen, fehlt nur das Protokoll
      absoluteUrl = `https:${url}`;
      logger.debug('DLSITE_URL', 'Protokoll zu URL hinzugefügt', { 
        original: url,
        absolute: absoluteUrl 
      });
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Relative URLs erhalten das Standard-Protokoll und die Domain
      if (url.startsWith('/')) {
        absoluteUrl = `https://www.dlsite.com${url}`;
      } else {
        absoluteUrl = `https://www.dlsite.com/${url}`;
      }
      logger.debug('DLSITE_URL', 'Domain zu relativer URL hinzugefügt', { 
        original: url,
        absolute: absoluteUrl 
      });
    } else {
      logger.trace('DLSITE_URL', 'URL bereits absolut', { url });
    }
    
    return absoluteUrl;
  }

  /**
   * Macht einen HTTP-Request - mit oder ohne VPN
   * @private
   */
  async _makeRequest(url, options = {}) {
    logger.startTimer(`request_${url}`);
    
    const requestId = crypto.randomBytes(4).toString('hex');
    logger.debug('DLSITE_REQUEST', 'Beginne HTTP-Request', { 
      requestId,
      url,
      method: options.method || 'GET',
      hasHeaders: !!options.headers,
      hasNetworkManager: !!this.networkManager 
    });
    
    try {
      let response;
      
      if (this.networkManager) {
        logger.debug('DLSITE_REQUEST', 'Verwende NetworkManager', { requestId });
        response = await this.networkManager.makeRequest(url, options);
      } else {
        // Fallback auf normales fetch wenn kein NetworkManager vorhanden
        logger.debug('DLSITE_REQUEST', 'Verwende direktes fetch (Fallback)', { requestId });
        const fetch = require('node-fetch');
        response = await fetch(url, options);
      }
      
      const requestTime = logger.endTimer(`request_${url}`);
      
      logger.logAPICall(
        options.method || 'GET',
        url,
        options.headers,
        options.body,
        response.status,
        `${requestTime.toFixed(2)}ms`
      );
      
      if (!response.ok) {
        logger.error('DLSITE_REQUEST', 'HTTP-Request fehlgeschlagen', { 
          requestId,
          url,
          status: response.status,
          statusText: response.statusText 
        });
      } else {
        logger.debug('DLSITE_REQUEST', 'HTTP-Request erfolgreich', { 
          requestId,
          url,
          status: response.status,
          contentType: response.headers.get('content-type') 
        });
      }
      
      return response;
    } catch (error) {
      logger.endTimer(`request_${url}`);
      logger.error('DLSITE_REQUEST', 'HTTP-Request Fehler', { 
        requestId,
        url 
      }, error);
      throw error;
    }
  }

  /**
   * Ruft grundlegende Produktinformationen vom DLSite AJAX-API ab
   * @param {string} productId - DLSite Produkt-ID
   * @returns {Promise<Object>} - Produktinformationen
   */
  async getProductInfo(productId) {
    logger.startTimer('get_product_info');
    logger.info('DLSITE_API', 'Rufe Produktinformationen ab', { productId });
    
    try {
      // Normalisiere die Produkt-ID
      let normalizedProductId = productId;
      try {
        normalizedProductId = this.findProductId(productId);
        logger.debug('DLSITE_API', 'Produkt-ID normalisiert', { 
          original: productId,
          normalized: normalizedProductId 
        });
      } catch (error) {
        // Wenn die ID nicht extrahiert werden kann, verwende sie direkt
        logger.warn('DLSITE_API', 'Konnte Produkt-ID nicht normalisieren, verwende Original', { 
          original: productId 
        });
      }

      const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${normalizedProductId}&locale=${this.locale}`;
      
      logger.debug('DLSITE_API', 'Sende API-Request', { 
        url,
        productId: normalizedProductId,
        locale: this.locale 
      });
      
      const response = await this._makeRequest(url, {
        headers: {
          ...this.headers,
          Cookie: this._getCookieHeader()
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP Fehler: ${response.status}`);
      }

      const data = await response.json();
      
      logger.debug('DLSITE_API', 'API-Antwort erhalten', { 
        productId: normalizedProductId,
        hasData: !!data,
        hasProductData: !!(data && data[normalizedProductId]) 
      });
      
      if (!data || !data[normalizedProductId]) {
        throw new Error(`Keine Produktinformationen gefunden für: ${normalizedProductId}`);
      }
      
      // Stelle sicher, dass alle URLs absolut sind
      const result = data[normalizedProductId];
      if (result.work_image) {
        const originalImage = result.work_image;
        result.work_image = this._ensureAbsoluteUrl(result.work_image);
        logger.debug('DLSITE_API', 'Bild-URL verarbeitet', { 
          original: originalImage,
          absolute: result.work_image 
        });
      }
      
      const apiTime = logger.endTimer('get_product_info');
      
      logger.info('DLSITE_API', 'Produktinformationen erfolgreich abgerufen', { 
        productId: normalizedProductId,
        title: result.work_name,
        maker: result.maker_name,
        apiTime: `${apiTime.toFixed(2)}ms` 
      });
      
      return result;
    } catch (error) {
      logger.endTimer('get_product_info');
      logger.error('DLSITE_API', 'Fehler beim Abrufen der Produktinformationen', { productId }, error);
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
    logger.startTimer('get_work_details');
    logger.info('DLSITE_SCRAPE', 'Rufe detaillierte Produktinformationen ab', { 
      productId,
      category 
    });
    
    try {
      const urls = [
        `https://www.dlsite.com/${category}/work/=/product_id/${productId}.html`,
        `https://www.dlsite.com/${category}/announce/=/product_id/${productId}.html`
      ];

      logger.debug('DLSITE_SCRAPE', 'Versuche URLs', { urls });

      let html = null;
      let response = null;
      let finalUrl = null;

      // Versuche URLs nacheinander, bis eine erfolgreich ist
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        logger.debug('DLSITE_SCRAPE', `Versuche URL ${i + 1}/${urls.length}`, { url });
        
        try {
          response = await this._makeRequest(url, {
            headers: {
              ...this.headers,
              Cookie: this._getCookieHeader()
            }
          });

          if (response.ok) {
            html = await response.text();
            finalUrl = url;
            logger.info('DLSITE_SCRAPE', 'Erfolgreiche Antwort erhalten', { 
              url,
              htmlLength: html.length,
              status: response.status 
            });
            break;
          } else {
            logger.warn('DLSITE_SCRAPE', 'URL nicht erfolgreich', { 
              url,
              status: response.status 
            });
          }
        } catch (error) {
          logger.warn('DLSITE_SCRAPE', `Fehler beim Abrufen von ${url}`, { url }, error);
        }
      }

      if (!html) {
        throw new Error(`Konnte keine Details für ${productId} abrufen`);
      }

      logger.debug('DLSITE_SCRAPE', 'Beginne HTML-Parsing', { 
        htmlLength: html.length,
        finalUrl 
      });
      
      const parseResult = this.parseWorkHTML(html, finalUrl);
      
      const detailsTime = logger.endTimer('get_work_details');
      
      logger.info('DLSITE_SCRAPE', 'Detaillierte Informationen erfolgreich geparst', { 
        productId,
        title: parseResult.work_name,
        detailsTime: `${detailsTime.toFixed(2)}ms`,
        fieldsExtracted: Object.keys(parseResult).length 
      });
      
      return parseResult;
    } catch (error) {
      logger.endTimer('get_work_details');
      logger.error('DLSITE_SCRAPE', 'Fehler beim Abrufen der Produktdetails', { 
        productId,
        category 
      }, error);
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
    logger.startTimer('parse_work_html');
    logger.debug('DLSITE_PARSE', 'Beginne HTML-Parsing', { 
      htmlLength: html.length,
      baseUrl 
    });
    
    const $ = cheerio.load(html);
    const details = {};
    
    // Grundlegende Informationen
    details.work_name = $('#work_name').text().trim();
    logger.debug('DLSITE_PARSE', 'Titel extrahiert', { title: details.work_name });
    
    // Circle/Hersteller-Name
    const makerName = $('span.maker_name a').text().trim();
    details.circle = makerName;
    logger.debug('DLSITE_PARSE', 'Circle extrahiert', { circle: details.circle });
    
    // Beschreibung
    details.description = $('#work_outline').text().trim();
    logger.debug('DLSITE_PARSE', 'Beschreibung extrahiert', { 
      descriptionLength: details.description.length 
    });

    // Genre
    details.genre = [];
    $('.main_genre a').each((i, elem) => {
      details.genre.push($(elem).text().trim());
    });
    logger.debug('DLSITE_PARSE', 'Genres extrahiert', { 
      genreCount: details.genre.length,
      genres: details.genre 
    });

    // Cover-Bild
    const coverImg = $('#work_left .product-slider-data div img');
    if (coverImg.length) {
      let coverImageSrc = coverImg.attr('src');
      details.coverImage = this._ensureAbsoluteUrl(coverImageSrc);
      logger.debug('DLSITE_PARSE', 'Cover-Bild extrahiert', { 
        originalSrc: coverImageSrc,
        absoluteUrl: details.coverImage 
      });
    } else {
      logger.debug('DLSITE_PARSE', 'Kein Cover-Bild gefunden');
    }

    // Szenario, Illustrationen, Sprecher, usw.
    let fieldsExtracted = 0;
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
        fieldsExtracted++;
        
        // Für Felder, die Listen sind
        if (['author', 'scenario', 'illustration', 'voice_actor', 'genre'].includes(field)) {
          details[field] = [];
          value.find('a').each((j, link) => {
            details[field].push($(link).text().trim());
          });
          logger.trace('DLSITE_PARSE', `Liste-Feld extrahiert: ${field}`, { 
            field,
            count: details[field].length,
            values: details[field] 
          });
        } else {
          // Für einfache Textfelder
          details[field] = value.text().trim();
          logger.trace('DLSITE_PARSE', `Text-Feld extrahiert: ${field}`, { 
            field,
            value: details[field] 
          });
        }
      }
    });

    logger.debug('DLSITE_PARSE', 'Metadata-Felder extrahiert', { fieldsExtracted });

    // Sample-Bilder
    details.sample_images = [];
    $('.product-slider-data div').each((i, elem) => {
      const src = $(elem).attr('data-src');
      if (src && !src.includes('_img_main')) {
        const absoluteSrc = this._ensureAbsoluteUrl(src);
        details.sample_images.push(absoluteSrc);
      }
    });
    
    logger.debug('DLSITE_PARSE', 'Sample-Bilder extrahiert', { 
      sampleCount: details.sample_images.length 
    });

    // Tags extrahieren (zusätzlich zu Genre)
    details.tags = [];
    $('.work_genre a').each((i, elem) => {
      details.tags.push($(elem).text().trim());
    });
    
    logger.debug('DLSITE_PARSE', 'Tags extrahiert', { 
      tagCount: details.tags.length,
      tags: details.tags 
    });

    const parseTime = logger.endTimer('parse_work_html');
    
    logger.debug('DLSITE_PARSE', 'HTML-Parsing abgeschlossen', { 
      parseTime: `${parseTime.toFixed(2)}ms`,
      totalFields: Object.keys(details).length,
      fieldsExtracted 
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
    let gameId;
    
    if (!productId) {
      // Fallback für den Fall, dass keine Produkt-ID vorhanden ist
      gameId = `dlsite_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      logger.warn('DLSITE_ID', 'Keine Produkt-ID vorhanden, generiere Fallback-ID', { gameId });
    } else {
      const prefix = internalId ? `${String(internalId).padStart(5, '0')}_` : '';
      gameId = `${prefix}dlsite_${productId.toLowerCase()}`;
      logger.debug('DLSITE_ID', 'Game-ID generiert', { 
        productId,
        internalId,
        gameId 
      });
    }
    
    return gameId;
  }

  /**
   * Lädt ein Bild herunter und speichert es im Assets-Ordner
   * @param {string} imageUrl - URL des Bildes
   * @param {string} productId - DLSite Produkt-ID
   * @param {number} internalId - Interne ID des Spiels (optional)
   * @returns {Promise<string>} - Lokaler Pfad zum gespeicherten Bild
   */
  async downloadImage(imageUrl, productId, internalId = null) {
    logger.startTimer('download_image');
    
    try {
      if (!imageUrl) {
        logger.warn('DLSITE_IMAGE', 'Keine Bild-URL zum Herunterladen angegeben');
        return null;
      }
      
      // Loggen der Eingabeparameter für Debugging
      logger.info('DLSITE_IMAGE', 'Beginne Bild-Download', { 
        imageUrl,
        productId,
        internalId 
      });
      
      // Stelle sicher, dass die ProductId definiert ist
      if (!productId || productId === 'undefined' || productId === 'null') {
        logger.warn('DLSITE_IMAGE', 'Keine gültige Produkt-ID für die Bildbenennung angegeben');
        // Versuche die ID aus der URL zu extrahieren
        const idMatch = imageUrl.match(/[BRV]J\d{6,8}/i);
        if (idMatch) {
          productId = idMatch[0].toUpperCase();
          logger.info('DLSITE_IMAGE', 'Produkt-ID aus URL extrahiert', { productId });
        } else {
          productId = "unknown";
          logger.warn('DLSITE_IMAGE', 'Konnte keine Produkt-ID extrahieren, verwende "unknown"');
        }
      }
      
      // Stelle sicher, dass die URL absolut ist
      const absoluteUrl = this._ensureAbsoluteUrl(imageUrl);
      
      if (!absoluteUrl) {
        logger.warn('DLSITE_IMAGE', `Konnte keine absolute URL aus ${imageUrl} erstellen`);
        return null;
      }
      
      // Prüfe Cache, ob das Bild bereits heruntergeladen wurde
      const cacheKey = absoluteUrl;
      if (this.imageCache.has(cacheKey)) {
        const cachedPath = this.imageCache.get(cacheKey);
        logger.debug('DLSITE_IMAGE', 'Bild aus Cache zurückgegeben', { 
          cacheKey,
          cachedPath 
        });
        return cachedPath;
      }
      
      logger.debug('DLSITE_IMAGE', 'Lade Bild herunter', { absoluteUrl });
      
      const response = await this._makeRequest(absoluteUrl, {
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
      const webPath = `assets/games/${fileName}`.replace(/\\/g, '/');
      
      logger.debug('DLSITE_IMAGE', 'Speichere Bild lokal', { 
        fileName,
        filePath,
        webPath 
      });
      
      // Stream zum Speichern des Bildes
      const buffer = await response.buffer();
      fs.writeFileSync(filePath, buffer);
      
      logger.logFileOperation('WRITE_FILE', filePath, true);
      
      const downloadTime = logger.endTimer('download_image');
      
      logger.info('DLSITE_IMAGE', 'Bild erfolgreich heruntergeladen', { 
        absoluteUrl,
        filePath,
        webPath,
        fileSize: buffer.length,
        downloadTime: `${downloadTime.toFixed(2)}ms` 
      });
      
      // Speichere Pfad im Cache
      this.imageCache.set(cacheKey, webPath);
      
      return webPath;
    } catch (error) {
      logger.endTimer('download_image');
      logger.error('DLSITE_IMAGE', 'Fehler beim Herunterladen des Bildes', { 
        imageUrl,
        productId,
        internalId 
      }, error);
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
    logger.startTimer('create_game_info');
    
    // Stelle sicher, dass wir eine gültige Produkt-ID haben
    const productId = (basicInfo && basicInfo.product_id) ? basicInfo.product_id : 
                    (details && details.productId) ? details.productId : null;
    
    logger.info('DLSITE_PROCESS', 'Erstelle Game-Info-Objekt', { 
      productId,
      internalId,
      hasBasicInfo: !!basicInfo,
      hasDetails: !!details 
    });
    
    // Generiere eine eindeutige ID für das Spiel
    const gameId = this.generateGameId(productId, internalId);
    
    // Bild herunterladen
    let coverImagePath = null;
    if (details && details.coverImage) {
      logger.debug('DLSITE_PROCESS', 'Lade Cover-Bild aus Details', { 
        coverImage: details.coverImage 
      });
      coverImagePath = await this.downloadImage(details.coverImage, productId, internalId);
    } else if (basicInfo && basicInfo.work_image) {
      logger.debug('DLSITE_PROCESS', 'Lade Cover-Bild aus Basic-Info', { 
        workImage: basicInfo.work_image 
      });
      coverImagePath = await this.downloadImage(basicInfo.work_image, productId, internalId);
    } else {
      logger.debug('DLSITE_PROCESS', 'Kein Cover-Bild verfügbar');
    }
    
    // Kombiniere Tags und Genres für vollständigere Informationen
    const allTags = [...new Set([
      ...(details && details.genre ? details.genre : []),
      ...(details && details.tags ? details.tags : [])
    ])];
    
    logger.debug('DLSITE_PROCESS', 'Tags und Genres kombiniert', { 
      genreCount: details && details.genre ? details.genre.length : 0,
      tagCount: details && details.tags ? details.tags.length : 0,
      combinedCount: allTags.length 
    });
    
    const gameInfo = {
      id: gameId,
      title: (details && details.work_name) || (basicInfo && basicInfo.work_name) || `DLSite Game ${productId}`,
      developer: (details && details.circle) || (basicInfo && basicInfo.maker_name) || "Unbekannter Entwickler",
      publisher: (details && details.publisher) || (details && details.circle) || (basicInfo && basicInfo.maker_name) || "DLSite",
      genre: (details && details.genre && details.genre.length > 0) ? details.genre[0] : "Visual Novel",
      description: (details && details.description) || (basicInfo && basicInfo.description) || `Ein Spiel von DLSite mit der ID ${productId}`,
      coverImage: coverImagePath || "", // Lokaler Pfad statt URL
      source: "DLSite",
      // Weitere DLSite-spezifische Informationen
      dlsiteId: productId,
      dlsiteUrl: `https://www.dlsite.com/maniax/work/=/product_id/${productId}.html`,
      dlsiteCircle: (details && details.circle) || (basicInfo && basicInfo.maker_name),
      dlsiteTags: allTags,
      dlsiteVoiceActors: (details && details.voice_actor) || [],
      dlsiteReleaseDate: (details && details.release_date) || (basicInfo && basicInfo.regist_date) || "",
      dlsiteFileSize: (details && details.file_size) || "",
      // Weitere Metadaten
      language: (details && details.language) || "Japanisch",
      authors: (details && details.author) || [],
      illustrators: (details && details.illustration) || [],
      scenario: (details && details.scenario) || []
    };
    
    const createTime = logger.endTimer('create_game_info');
    
    logger.info('DLSITE_PROCESS', 'Game-Info-Objekt erstellt', { 
      gameId: gameInfo.id,
      title: gameInfo.title,
      developer: gameInfo.developer,
      hasCoverImage: !!gameInfo.coverImage,
      tagCount: gameInfo.dlsiteTags.length,
      createTime: `${createTime.toFixed(2)}ms` 
    });
    
    return gameInfo;
  }

  /**
   * Hauptmethode zum Abrufen aller Spielinformationen
   * @param {string} productId - DLSite Produkt-ID
   * @param {string} category - DLSite-Kategorie (Standard: 'maniax')
   * @param {number} internalId - Interne ID des Spiels (optional)
   * @returns {Promise<Object>} - Vollständige Spielinformationen
   */
  async getGameInfo(productId, category = 'maniax', internalId = null) {
    logger.startTimer('get_game_info_complete');
    logger.info('DLSITE_MAIN', 'Beginne vollständigen Informationsabruf', { 
      productId,
      category,
      internalId 
    });
    
    try {
      // Grundlegende Infos vom API abrufen
      let basicInfo = null;
      try {
        logger.debug('DLSITE_MAIN', 'Rufe grundlegende Informationen ab');
        basicInfo = await this.getProductInfo(productId);
        logger.info('DLSITE_MAIN', 'Grundlegende Informationen erfolgreich abgerufen', { 
          productId,
          title: basicInfo.work_name 
        });
      } catch (error) {
        logger.warn('DLSITE_MAIN', `Konnte keine grundlegenden Infos für ${productId} abrufen`, { 
          productId 
        }, error);
        // Erstelle ein minimales basicInfo-Objekt
        basicInfo = { product_id: productId };
      }
      
      // Detaillierte Infos vom HTML abrufen
      let details = null;
      try {
        logger.debug('DLSITE_MAIN', 'Rufe detaillierte Informationen ab');
        details = await this.getWorkDetails(productId, category);
        logger.info('DLSITE_MAIN', 'Detaillierte Informationen erfolgreich abgerufen', { 
          productId,
          title: details.work_name,
          fieldsCount: Object.keys(details).length 
        });
      } catch (error) {
        logger.warn('DLSITE_MAIN', `Konnte keine detaillierten Infos für ${productId} abrufen`, { 
          productId,
          category 
        }, error);
        // Erstelle ein minimales details-Objekt
        details = { productId: productId };
      }
      
      // Beide Informationsquellen kombinieren
      logger.debug('DLSITE_MAIN', 'Kombiniere Informationsquellen');
      const gameInfo = await this.createGameInfo(basicInfo, details, internalId);
      
      const totalTime = logger.endTimer('get_game_info_complete');
      
      logger.info('DLSITE_MAIN', 'Vollständiger Informationsabruf abgeschlossen', { 
        productId,
        gameId: gameInfo.id,
        title: gameInfo.title,
        totalTime: `${totalTime.toFixed(2)}ms`,
        success: !gameInfo.error 
      });
      
      return gameInfo;
    } catch (error) {
      logger.endTimer('get_game_info_complete');
      logger.error('DLSITE_MAIN', 'Fehler beim Abrufen der Spielinformationen', { 
        productId,
        category,
        internalId 
      }, error);
      
      // Erstelle ein Fallback-Objekt mit einer generierten ID
      const gameId = this.generateGameId(productId, internalId);
      const fallbackInfo = {
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
      
      logger.info('DLSITE_MAIN', 'Fallback-Informationen erstellt', { 
        productId,
        gameId: fallbackInfo.id 
      });
      
      return fallbackInfo;
    }
  }
  
  /**
   * Versucht, eine DLSite-ID aus einem Ordnerpfad zu extrahieren
   * @param {string} folderPath - Der zu prüfende Ordnerpfad
   * @returns {string|null} - Die gefundene DLSite-ID oder null
   */
  extractDLSiteIdFromPath(folderPath) {
    logger.debug('DLSITE_EXTRACT', 'Extrahiere DLSite-ID aus Pfad', { folderPath });
    
    try {
      // Versuche im Pfad und allen Unterverzeichnissen zu suchen
      const match = folderPath.match(/[BRV]J\d{6,8}/i);
      if (match) {
        const extractedId = match[0].toUpperCase();
        logger.info('DLSITE_EXTRACT', 'DLSite-ID aus Pfad extrahiert', { 
          folderPath,
          extractedId 
        });
        return extractedId;
      }
      
      // Versuche den Ordnernamen zu prüfen
      const dirName = path.basename(folderPath);
      const dirMatch = dirName.match(/[BRV]J\d{6,8}/i);
      if (dirMatch) {
        const extractedId = dirMatch[0].toUpperCase();
        logger.info('DLSITE_EXTRACT', 'DLSite-ID aus Ordnername extrahiert', { 
          folderPath,
          dirName,
          extractedId 
        });
        return extractedId;
      }
      
      logger.debug('DLSITE_EXTRACT', 'Keine DLSite-ID im Pfad gefunden', { folderPath });
      return null;
    } catch (error) {
      logger.error('DLSITE_EXTRACT', `Fehler beim Extrahieren der DLSite-ID aus dem Pfad`, { 
        folderPath 
      }, error);
      return null;
    }
  }

  /**
   * Gibt Cache-Statistiken zurück
   */
  getCacheStats() {
    const stats = {
      imageCacheSize: this.imageCache.size,
      imageCacheEntries: Array.from(this.imageCache.keys()),
      assetsPath: this.assetsPath,
      locale: this.locale
    };
    
    logger.debug('DLSITE_CACHE', 'Cache-Statistiken abgerufen', stats);
    return stats;
  }

  /**
   * Leert den Image-Cache
   */
  clearImageCache() {
    const previousSize = this.imageCache.size;
    this.imageCache.clear();
    
    logger.info('DLSITE_CACHE', 'Image-Cache geleert', { 
      previousSize,
      currentSize: this.imageCache.size 
    });
  }

  /**
   * Validiert eine DLSite-Produkt-ID
   * @param {string} productId - Die zu validierende Produkt-ID
   * @returns {boolean} - True wenn gültig, false andernfalls
   */
  isValidProductId(productId) {
    const isValid = /^[BRV]J\d{6,8}$/i.test(productId);
    
    logger.debug('DLSITE_VALIDATE', 'Produkt-ID Validierung', { 
      productId,
      isValid 
    });
    
    return isValid;
  }

  /**
   * Bereinigt temporäre Dateien und Cache
   */
  cleanup() {
    logger.info('DLSITE_CLEANUP', 'Beginne Cleanup');
    
    try {
      this.clearImageCache();
      
      // Prüfe auf verwaiste Bilddateien
      if (fs.existsSync(this.assetsPath)) {
        const files = fs.readdirSync(this.assetsPath);
        const dlsiteFiles = files.filter(f => f.includes('_dlsite_'));
        
        logger.debug('DLSITE_CLEANUP', 'DLSite-Dateien gefunden', { 
          totalFiles: files.length,
          dlsiteFiles: dlsiteFiles.length 
        });
      }
      
      logger.info('DLSITE_CLEANUP', 'Cleanup abgeschlossen');
    } catch (error) {
      logger.error('DLSITE_CLEANUP', 'Fehler beim Cleanup', null, error);
    }
  }
}

module.exports = DLSiteClient;