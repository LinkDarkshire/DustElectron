const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getLogger } = require('../modules/logger');

/**
 * DLSite API Client for Electron with proper English language support
 * This class provides methods to retrieve information about games on DLSite
 */
class DLSiteClient {
  /**
   * Constructor
   * @param {Object} networkManager - Network manager instance for requests
   * @param {string} assetsPath - Path to assets folder (default: './assets/games')
   * @param {string} locale - Locale for API requests (default: 'en_US')
   */
  constructor(networkManager, assetsPath = './assets/games', locale = 'en_US') {
    this.locale = locale;
    this.assetsPath = assetsPath;
    this.networkManager = networkManager;

    // Set up headers with proper language support
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept-Language': this.locale === 'en_US' ? 'en-US,en;q=0.9' : locale,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br'
    };

    // Set up cookies with proper locale support
    this.cookies = {
      adultchecked: '1'
    };

    // Add locale cookie for English support
    if (this.locale === 'en_US') {
      this.cookies.locale = 'en_US';
    }

    // Ensure assets folder exists
    if (!fs.existsSync(this.assetsPath)) {
      fs.mkdirSync(this.assetsPath, { recursive: true });
    }

    // Cache for downloaded images
    this.imageCache = new Map();

    const logger = getLogger();
    logger.info('DLSITE_CLIENT', 'DLSite Client initialized', {
      locale: this.locale,
      assetsPath: this.assetsPath,
      hasNetworkManager: !!this.networkManager
    });
  }

  /**
   * Finds a DLSite product ID in a string
   * @param {string} str - String containing a DLSite ID
   * @returns {string} - Normalized DLSite ID
   */
  findProductId(str) {
    const match = str.match(/(?<!\w)[BRV]J\d+/i);
    if (match) {
      return match[0].toUpperCase();
    }
    throw new Error(`No valid DLSite product ID found: ${str}`);
  }

  /**
   * Converts cookies object to cookie header string
   * @private
   * @returns {string} - Cookie header string
   */
  _getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  /**
   * Checks if a URL is absolute and adds protocol/domain if necessary
   * @private
   * @param {string} url - URL to check
   * @returns {string} - Absolute URL
   */
  _ensureAbsoluteUrl(url) {
    if (!url) return null;

    if (url.startsWith('//')) {
      return `https:${url}`;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.startsWith('/')) {
        return `https://www.dlsite.com${url}`;
      } else {
        return `https://www.dlsite.com/${url}`;
      }
    }

    return url;
  }

  /**
   * Makes an HTTP request - with or without VPN
   * @private
   */
  async _makeRequest(url, options = {}) {
    if (this.networkManager) {
      return await this.networkManager.makeRequest(url, options);
    } else {
      const fetch = require('node-fetch');
      return await fetch(url, options);
    }
  }

  /**
   * Retrieves basic product information from DLSite AJAX API
   * @param {string} productId - DLSite product ID
   * @returns {Promise<Object>} - Product information
   */
  async getProductInfo(productId) {
    try {
      // Normalize product ID
      try {
        productId = this.findProductId(productId);
      } catch (error) {
        // If ID cannot be extracted, use it directly
      }

      const logger = getLogger();
      logger.info('DLSITE_API', 'Retrieving product information', { productId });

      const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${productId}&locale=${this.locale}`;

      const response = await this.networkManager.makeRequest(url, {
        headers: {
          ...this.headers,
          Cookie: this._getCookieHeader()
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (!data || !data[productId]) {
        throw new Error(`No product information found for: ${productId}`);
      }

      // Ensure all URLs are absolute
      const result = data[productId];
      if (result.work_image) {
        result.work_image = this._ensureAbsoluteUrl(result.work_image);
      }

      logger.info('DLSITE_API', 'Product information successfully retrieved', {
        productId,
        title: result.work_name,
        apiTime: 'completed'
      });

      return result;
    } catch (error) {
      const logger = getLogger();
      logger.error('DLSITE_API', 'Error retrieving product information', { productId, error: error.message });
      throw error;
    }
  }

  /**
   * Retrieves detailed product information from DLSite website with proper locale support
   * @param {string} productId - DLSite product ID
   * @param {string} category - DLSite category (default: 'maniax')
   * @returns {Promise<Object>} - Detailed product information
   */
  async getWorkDetails(productId, category = 'maniax') {
    try {
      const logger = getLogger();
      logger.info('DLSITE_SCRAPE', 'Retrieving detailed product information', {
        productId,
        category
      });

      // Build URLs with proper locale parameter for English content
      const baseUrls = [
        `https://www.dlsite.com/${category}/work/=/product_id/${productId}.html`,
        `https://www.dlsite.com/${category}/announce/=/product_id/${productId}.html`
      ];

      // Add locale parameter to URLs for English support
      const urls = baseUrls.map(url => {
        if (this.locale === 'en_US') {
          const separator = url.includes('?') ? '&' : '?';
          return `${url}${separator}locale=en_US`;
        }
        return url;
      });

      let html = null;
      let response = null;
      let finalUrl = null;

      // Try URLs in sequence until one succeeds
      for (const url of urls) {
        try {
          logger.debug('DLSITE_SCRAPE', `Trying URL: ${url}`);

          response = await this.networkManager.makeRequest(url, {
            headers: {
              ...this.headers,
              Cookie: this._getCookieHeader(),
              // Add explicit referer for better compatibility
              'Referer': `https://www.dlsite.com/${category}/`
            }
          });

          if (response.ok) {
            html = await response.text();
            finalUrl = url;
            logger.info('DLSITE_SCRAPE', 'Successful response received', {
              url: finalUrl,
              htmlLength: html.length,
              status: response.status
            });
            break;
          }
        } catch (error) {
          logger.warn('DLSITE_SCRAPE', `Error fetching ${url}`, { error: error.message });
        }
      }

      if (!html) {
        throw new Error(`Could not retrieve details for ${productId}`);
      }

      return this.parseWorkHTML(html, finalUrl);
    } catch (error) {
      const logger = getLogger();
      logger.error('DLSITE_SCRAPE', 'Error retrieving product details', {
        productId,
        category,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Parses HTML from a work page for detailed information with enhanced language support
   * @private
   * @param {string} html - HTML content of work page
   * @param {string} baseUrl - Base URL for relative links
   * @returns {Object} - Extracted information
   */
  parseWorkHTML(html, baseUrl) {
    const $ = cheerio.load(html);
    const details = {};

    const logger = getLogger();
    logger.info('DLSITE_API_PARSE', 'Starting HTML parsing for work details', {
      htmlLength: html.length,
      baseUrl
    });

    // Basic information
    details.work_name = $('#work_name').text().trim();
    logger.info('DLSITE_API_PARSE', 'Work name extracted', {
      work_name: details.work_name
    });

    // Circle/Maker name
    const makerName = $('span.maker_name a').text().trim();
    details.circle = makerName;
    logger.info('DLSITE_API_PARSE', 'Circle extracted', {
      circle: details.circle
    });

    // Cover image with multiple fallbacks
    let coverImg = $('#work_left .product-slider-data div img');
    if (!coverImg.length) {
      coverImg = $('.product_image img');
    }
    if (!coverImg.length) {
      coverImg = $('.work_image img');
    }

    if (coverImg.length) {
      let coverImageSrc = coverImg.first().attr('src') || coverImg.first().attr('data-src');
      details.coverImage = this._ensureAbsoluteUrl(coverImageSrc);
      logger.info('DLSITE_API_PARSE', 'Cover image extracted', {
        coverImage: details.coverImage
      });
    }

    // Parse structured data from work outline table - this is the correct approach
    $('#work_outline tr').each((i, row) => {
      const $row = $(row);
      const header = $row.find('th').text().trim();
      const $cell = $row.find('td');

      logger.debug('DLSITE_API_TABLE', 'Processing table row', {
        header,
        cellHtml: $cell.html()
      });

      // Map headers to field names with proper categorization
      const fieldMappings = {
        'Release date': 'release_date',
        '販売日': 'release_date',
        'Update information': 'update_date',
        'Voice Actor': 'voice_actor',
        '声優': 'voice_actor',
        'Age': 'age_rating',
        '年齢指定': 'age_rating',
        'Product format': 'product_format',
        '作品形式': 'product_format',
        'File format': 'file_format',
        'ファイル形式': 'file_format',
        'Supported languages': 'language',
        '対応言語': 'language',
        'File size': 'file_size',
        'ファイル容量': 'file_size',
        'Genre': 'genre',
        'ジャンル': 'genre'
      };

      const fieldName = fieldMappings[header];
      if (fieldName) {
        logger.info('DLSITE_API_TABLE', 'Processing mapped field', {
          header,
          fieldName
        });

        if (fieldName === 'product_format') {
          // Special handling for product format - only extract from THIS specific row
          const formatItems = [];

          // Look for spans with title attributes in this specific Product format row only
          $cell.find('span[title]').each((j, span) => {
            const title = $(span).attr('title');
            if (title && title.trim()) {
              const formatText = title.trim();
              formatItems.push(formatText);
              logger.info('DLSITE_API_FORMAT', 'Product format item extracted from Product format row', {
                formatText
              });
            }
          });

          // If no spans with titles, try link text from this row only
          if (formatItems.length === 0) {
            $cell.find('a').each((j, link) => {
              const linkText = $(link).text().trim();
              if (linkText && linkText !== '') {
                formatItems.push(linkText);
                logger.info('DLSITE_API_FORMAT', 'Product format from link text in Product format row', {
                  linkText
                });
              }
            });
          }

          details[fieldName] = formatItems;
          logger.info('DLSITE_API_FORMAT', 'Final product format result (from Product format row only)', {
            productFormat: formatItems,
            formatCount: formatItems.length
          });

        } else if (fieldName === 'voice_actor') {
          // Parse voice actors
          const voiceActors = [];
          $cell.find('a').each((j, link) => {
            const actorName = $(link).text().trim();
            if (actorName) {
              voiceActors.push(actorName);
            }
          });

          if (voiceActors.length === 0) {
            // Fallback to text parsing
            const cellText = $cell.text().trim();
            if (cellText) {
              voiceActors.push(...cellText.split(/[\/,、]/).map(s => s.trim()).filter(s => s));
            }
          }

          details[fieldName] = voiceActors;
          logger.info('DLSITE_API_TABLE', 'Voice actors extracted', {
            voiceActors
          });

        } else if (fieldName === 'genre') {
          // Parse genres from links
          const genres = [];
          $cell.find('a').each((j, link) => {
            const genreText = $(link).text().trim();
            if (genreText) {
              genres.push(genreText);
            }
          });
          details[fieldName] = genres;
          logger.info('DLSITE_API_TABLE', 'Genres extracted', {
            genres
          });

        } else if (fieldName === 'age_rating') {
          // Extract age rating from span title or text
          let ageRating = '';
          const $ageSpan = $cell.find('span[title]');
          if ($ageSpan.length) {
            ageRating = $ageSpan.attr('title') || $ageSpan.text().trim();
          } else {
            ageRating = $cell.text().trim();
          }
          details[fieldName] = ageRating;
          logger.info('DLSITE_API_TABLE', 'Age rating extracted', {
            ageRating
          });

        } else if (fieldName === 'file_format') {
          // Extract file format from span title or text
          let fileFormat = '';
          const $formatSpan = $cell.find('span[title]');
          if ($formatSpan.length) {
            fileFormat = $formatSpan.attr('title') || $formatSpan.text().trim();
          } else {
            fileFormat = $cell.text().trim();
          }
          details[fieldName] = fileFormat;
          logger.info('DLSITE_API_TABLE', 'File format extracted', {
            fileFormat
          });

        } else if (fieldName === 'language') {
          // Extract supported languages from span title or text
          let language = '';
          const $langSpan = $cell.find('span[title]');
          if ($langSpan.length) {
            language = $langSpan.attr('title') || $langSpan.text().trim();
          } else {
            language = $cell.text().trim();
          }
          details[fieldName] = language;
          logger.info('DLSITE_API_TABLE', 'Language extracted', {
            language
          });

        } else {
          // Simple text field - clean up the text
          let cellText = $cell.text().trim();

          // Clean up update information field specifically
          if (fieldName === 'update_date') {
            // Remove extra whitespace and "Update information" text
            cellText = cellText.replace(/\s+/g, ' ').replace(/\s*Update information\s*$/, '').trim();
          }

          details[fieldName] = cellText;
          logger.info('DLSITE_API_TABLE', 'Text field extracted', {
            fieldName,
            value: cellText
          });
        }
      }
    });

    // Convert product_format array to string for backward compatibility
    if (details.product_format && Array.isArray(details.product_format)) {
      details.product_format = details.product_format.join(', ');
    }

    // Get the actual game description from work_parts
    let description = '';
    const workPartsText = $('.work_parts').text();

    if (workPartsText.length > 100) {
      // Find character introduction section
      const characterMatch = workPartsText.match(/キャラクター紹介\s*(.*?)(?=エロステータス|エンディング|$)/s);
      if (characterMatch) {
        let characterInfo = characterMatch[1].trim();
        characterInfo = characterInfo.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
        description = characterInfo;
        logger.info('DLSITE_API_DESC', 'Character description extracted', {
          descriptionLength: description.length
        });
      }
    }

    // If no character description found, try alternative selectors
    if (!description) {
      const altDescSelectors = ['.work_parts_text', '.product_outline', '.work_article .work_parts_text'];

      for (const selector of altDescSelectors) {
        const descElement = $(selector);
        if (descElement.length) {
          let descText = descElement.text().trim().replace(/\s+/g, ' ').trim();

          if (descText && descText.length > 50) {
            description = descText;
            logger.info('DLSITE_API_DESC', 'Alternative description found', {
              selector,
              descriptionLength: description.length
            });
            break;
          }
        }
      }
    }

    details.description = description;

    // Sample images
    details.sample_images = [];
    $('.product-slider-data div, .work_sample img').each((i, elem) => {
      const src = $(elem).attr('data-src') || $(elem).attr('src');
      if (src && !src.includes('_img_main')) {
        const absoluteSrc = this._ensureAbsoluteUrl(src);
        if (absoluteSrc && !details.sample_images.includes(absoluteSrc)) {
          details.sample_images.push(absoluteSrc);
        }
      }
    });

    // Extract tags (same as genre for now)
    details.tags = [...(details.genre || [])];

    // Final summary
    logger.info('DLSITE_API_PARSE', 'HTML parsing completed successfully', {
      title: details.work_name,
      circle: details.circle,
      fieldsExtracted: Object.keys(details).length,
      productFormat: details.product_format,
      ageRating: details.age_rating,
      fileFormat: details.file_format,
      language: details.language,
      hasDescription: !!details.description,
      descriptionLength: (details.description || '').length,
      genreCount: (details.genre || []).length,
      tagCount: (details.tags || []).length,
      sampleImageCount: details.sample_images.length
    });

    return details;
  }

  /**
   * Generates a unique ID for a game
   * @param {string} productId - DLSite product ID
   * @param {number} internalId - Internal game ID (optional)
   * @returns {string} - Unique ID
   */
  generateGameId(productId, internalId = null) {
    if (!productId) {
      // Fallback if no product ID available
      const fallbackId = `dlsite_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const logger = getLogger();
      logger.warn('DLSITE_ID', 'No product ID available, generating fallback ID', {
        gameId: fallbackId
      });
      return fallbackId;
    }

    const prefix = internalId ? `${String(internalId).padStart(5, '0')}_` : '';
    return `${prefix}dlsite_${productId.toLowerCase()}`;
  }

  /**
   * Downloads an image and saves it to the assets folder
   * @param {string} imageUrl - Image URL
   * @param {string} productId - DLSite product ID
   * @param {number} internalId - Internal game ID (optional)
   * @returns {Promise<string>} - Local path to saved image
   */
  async downloadImage(imageUrl, productId, internalId = null) {
    try {
      const logger = getLogger();

      if (!imageUrl) {
        logger.warn('DLSITE_IMAGE', 'No image URL provided for download');
        return null;
      }

      logger.info('DLSITE_IMAGE', 'Starting image download', {
        imageUrl,
        productId,
        internalId
      });

      // Ensure ProductId is defined
      if (!productId || productId === 'undefined' || productId === 'null') {
        logger.warn('DLSITE_IMAGE', 'No valid product ID provided for image naming');
        // Try to extract ID from URL
        const idMatch = imageUrl.match(/[BRV]J\d{6,8}/i);
        if (idMatch) {
          productId = idMatch[0].toUpperCase();
          logger.info('DLSITE_IMAGE', 'Product ID extracted from URL', { productId });
        } else {
          productId = "unknown";
        }
      }

      // Ensure URL is absolute
      const absoluteUrl = this._ensureAbsoluteUrl(imageUrl);

      if (!absoluteUrl) {
        logger.warn('DLSITE_IMAGE', `Could not create absolute URL from ${imageUrl}`);
        return null;
      }

      // Check cache if image was already downloaded
      const cacheKey = absoluteUrl;
      if (this.imageCache.has(cacheKey)) {
        return this.imageCache.get(cacheKey);
      }

      const response = await this._makeRequest(absoluteUrl, {
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error during image download: ${response.status}`);
      }

      // Use hexadecimal number with 5 digits for internal ID
      let idPrefix;
      if (internalId) {
        idPrefix = internalId.toString(16).padStart(5, '0');
      } else {
        idPrefix = "00001"; // Default for first game
      }

      const extension = path.extname(absoluteUrl) || '.jpg';
      const fileName = `${idPrefix}_dlsite_${productId}${extension}`;
      const filePath = path.join(this.assetsPath, fileName);
      const webPath = `assets/games/${fileName}`.replace(/\\/g, '/');

      // Stream for saving the image
      const buffer = await response.buffer();
      fs.writeFileSync(filePath, buffer);

      logger.info('DLSITE_IMAGE', 'Image successfully downloaded', {
        absoluteUrl,
        filePath: webPath,
        webPath,
        fileSize: buffer.length
      });

      // Save path in cache
      this.imageCache.set(cacheKey, webPath);

      return webPath;
    } catch (error) {
      const logger = getLogger();
      logger.error('DLSITE_IMAGE', 'Error downloading image', {
        imageUrl,
        productId,
        error: error.message
      });
      return null;
    }
  }

  /**
     * Creates a game info object from combined API and HTML data
     * @param {Object} basicInfo - Basic information from AJAX API
     * @param {Object} details - Detailed information from HTML parsing
     * @param {number} internalId - Internal game ID (optional)
     * @returns {Promise<Object>} - Game information formatted for Dust Game Manager
     */
  async createGameInfo(basicInfo, details, internalId = null) {
    const logger = getLogger();

    // Ensure we have a valid product ID
    const productId = (basicInfo && basicInfo.product_id) ? basicInfo.product_id :
      (details && details.productId) ? details.productId : null;

    logger.info('DLSITE_PROCESS', 'Creating game info object', {
      productId,
      internalId,
      hasBasicInfo: !!basicInfo,
      hasDetails: !!details
    });

    // Generate unique ID for the game
    const gameId = this.generateGameId(productId, internalId);

    // Download image
    let coverImagePath = null;
    if (details && details.coverImage) {
      coverImagePath = await this.downloadImage(details.coverImage, productId, internalId);
    } else if (basicInfo && basicInfo.work_image) {
      coverImagePath = await this.downloadImage(basicInfo.work_image, productId, internalId);
    }

    // Process genres - filter out technical metadata
    const filteredGenres = (details && details.genre) ?
      details.genre.filter(genre => {
        // Filter out technical metadata that shouldn't be in genres
        const excludeFromGenres = [
          'R18', 'All-ages',
          'Role-playing', 'Visual Novel', 'Simulation', 'Adventure', 'Action', 'Strategy',
          'Voice', 'Music', 'Sound',
          'Application', 'HTML', 'Flash', 'Unity',
          'Japanese', 'English', 'Chinese', 'Korean',
          'Windows', 'Mac', 'Android', 'iOS'
        ];
        return !excludeFromGenres.includes(genre);
      }) : [];

    // Combine filtered genres with tags for more complete information
    const allTags = [...new Set([
      ...filteredGenres,
      ...(details && details.tags ? details.tags.filter(tag => !['R18', 'Application', 'Japanese', 'Role-playing', 'Voice'].includes(tag)) : [])
    ])];
    console.log('=== DEBUGGING DETAILS OBJECT ===');
    console.log('Complete details object:', details);
    console.log('details.product_format:', details.product_format);
    console.log('All keys in details:', Object.keys(details || {}));
    console.log('=== END DETAILS DEBUG ===');

    const gameInfo = {
      id: gameId,
      title: (details && details.work_name) || (basicInfo && basicInfo.work_name) || `DLSite Game ${productId}`,
      developer: (details && details.circle) || (basicInfo && basicInfo.maker_name) || "Unknown Developer",
      publisher: (details && details.publisher) || (details && details.circle) || (basicInfo && basicInfo.maker_name) || "DLSite",
      productFormat: (details && details.product_format) || "",
      ageRating: (details && details.age_rating) || (basicInfo && basicInfo.age_rating) || "R18",
      fileFormat: (details && details.file_format) || (basicInfo && basicInfo.file_format) || "Unknown",
      genre: filteredGenres.length > 0 ? filteredGenres[0] : "Visual Novel", // First actual genre, not technical metadata
      releaseDate: (details && details.release_date) || (basicInfo && basicInfo.regist_date) || "",
      updateDate: (details && details.update_date) || "",
      description: (details && details.description) || (basicInfo && basicInfo.description) || `A game from DLSite with ID ${productId}`,
      coverImage: coverImagePath || "",
      source: "DLSite",

      // Additional DLSite-specific information
      dlsiteId: productId,
      dlsiteUrl: `https://www.dlsite.com/maniax/work/=/product_id/${productId}.html`,
      dlsiteCircle: (details && details.circle) || (basicInfo && basicInfo.maker_name),
      dlsiteTags: allTags,
      dlsiteVoiceActors: (details && details.voice_actor) || [],
      dlsiteReleaseDate: (details && details.release_date) || (basicInfo && basicInfo.regist_date) || "",
      dlsiteUpdateDate: (details && details.update_date) || "",
      dlsiteFileSize: (details && details.file_size) || "",
      dlsiteAgeRating: (details && details.age_rating) || "",
      dlsiteProductFormat: (details && details.product_format) || "",
      dlsiteFileFormat: (details && details.file_format) || "",

      // Additional metadata
      language: (details && details.language) || "Japanese",
      authors: (details && details.author) || [],
      illustrators: (details && details.illustration) || [],
      scenario: (details && details.scenario) || [],

      // Genre list for search functionality
      genreList: filteredGenres,
      productFormat: (details && details.product_format) || ""
    };

    console.log('=== FINAL GAMEINFO PRODUCT FORMAT ===');
    console.log('Final productFormat value:', gameInfo.productFormat);
    console.log('=== END FINAL DEBUG ===');

    logger.info('DLSITE_PROCESS', 'Game info object created', {
      gameId,
      title: gameInfo.title,
      developer: gameInfo.developer,
      hasCoverImage: !!gameInfo.coverImage,
      tagCount: gameInfo.dlsiteTags.length,
      genreCount: gameInfo.genreList.length,
      releaseDate: gameInfo.dlsiteReleaseDate,
      updateDate: gameInfo.dlsiteUpdateDate,
      fileSize: gameInfo.dlsiteFileSize,
      ageRating: gameInfo.dlsiteAgeRating,
      productFormat: gameInfo.dlsiteProductFormat,
      voiceActorCount: gameInfo.dlsiteVoiceActors.length
    });

    console.log('=== FINAL GAMEINFO BEFORE RETURN ===');
    console.log('About to return gameInfo with productFormat:', gameInfo.productFormat);
    console.log('Complete final gameInfo:', gameInfo);
    console.log('=== END FINAL DEBUG ===');
    
    return gameInfo;
  }

  /**
   * Main method to retrieve all game information with proper English support
   * @param {string} productId - DLSite product ID
   * @param {string} category - DLSite category (default: 'maniax')
   * @param {number} internalId - Internal game ID (optional)
   * @returns {Promise<Object>} - Complete game information
   */
  async getGameInfo(productId, category = 'maniax', internalId = null) {
    try {
      const logger = getLogger();
      logger.info('DLSITE_MAIN', 'Starting complete information retrieval', {
        productId,
        category,
        internalId
      });

      // Retrieve basic info from API
      let basicInfo = null;
      try {
        basicInfo = await this.getProductInfo(productId);
        logger.info('DLSITE_MAIN', 'Basic information successfully retrieved', {
          productId,
          title: basicInfo.work_name
        });
      } catch (error) {
        logger.warn('DLSITE_MAIN', `Could not retrieve basic info for ${productId}`, { error: error.message });
        basicInfo = { product_id: productId };
      }

      // Retrieve detailed info from HTML
      let details = null;
      try {
        details = await this.getWorkDetails(productId, category);
        logger.info('DLSITE_MAIN', 'Detailed information successfully retrieved', {
          productId,
          title: details.work_name,
          fieldsCount: Object.keys(details).length
        });
      } catch (error) {
        logger.warn('DLSITE_MAIN', `Could not retrieve detailed info for ${productId}`, { error: error.message });
        details = { productId: productId };
      }

      // Combine both information sources
      const gameInfo = await this.createGameInfo(basicInfo, details, internalId);

      logger.info('DLSITE_MAIN', 'Complete information retrieval finished', {
        productId,
        gameId: gameInfo.id,
        title: gameInfo.title,
        success: true
      });

      return gameInfo;
    } catch (error) {
      const logger = getLogger();
      logger.error('DLSITE_MAIN', 'Error retrieving game information', {
        productId,
        category,
        internalId,
        error: error.message
      });

      // Create fallback object with generated ID
      const gameId = this.generateGameId(productId, internalId);
      return {
        id: gameId,
        error: true,
        message: `Error: ${error.message}`,
        title: `DLSite Game ${productId}`,
        developer: "Unknown Developer",
        publisher: "DLSite",
        genre: "Visual Novel",
        description: `A game from DLSite with ID ${productId}`,
        coverImage: "",
        source: "DLSite",
        dlsiteId: productId,
        dlsiteUrl: `https://www.dlsite.com/maniax/work/=/product_id/${productId}.html`
      };
    }
  }

  /**
   * Attempts to extract a DLSite ID from a folder path
   * @param {string} folderPath - Folder path to check
   * @returns {string|null} - Found DLSite ID or null
   */
  extractDLSiteIdFromPath(folderPath) {
    try {
      // Try to search in path and all subdirectories
      const match = folderPath.match(/[BRV]J\d{6,8}/i);
      if (match) {
        return match[0].toUpperCase();
      }

      // Try to check folder name
      const dirName = path.basename(folderPath);
      const dirMatch = dirName.match(/[BRV]J\d{6,8}/i);
      if (dirMatch) {
        return dirMatch[0].toUpperCase();
      }

      return null;
    } catch (error) {
      const logger = getLogger();
      logger.warn('DLSITE_EXTRACT', `Error extracting DLSite ID from path`, {
        folderPath,
        error: error.message
      });
      return null;
    }
  }
}

module.exports = DLSiteClient;