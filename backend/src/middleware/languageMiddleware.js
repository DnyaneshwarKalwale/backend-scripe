/**
 * Language middleware
 * Detects user's language preference from headers or user settings
 */

/**
 * Detects the user's preferred language and adds it to the request object
 * Priority:
 * 1. Query parameter 'lang'
 * 2. 'Accept-Language' header
 * 3. User settings in database (if authenticated)
 * 4. Default to English
 */
const languageMiddleware = async (req, res, next) => {
  try {
    // Initialize with default language
    let language = 'english';
    
    // 1. Check query parameter
    if (req.query.lang) {
      const queryLang = req.query.lang.toLowerCase();
      if (['english', 'german', 'spanish', 'french'].includes(queryLang)) {
        language = queryLang;
      }
    } 
    // 2. Check Accept-Language header
    else if (req.headers['accept-language']) {
      const acceptLanguage = req.headers['accept-language'].split(',')[0].substring(0, 2).toLowerCase();
      
      // Map language codes to our supported languages
      switch (acceptLanguage) {
        case 'en':
          language = 'english';
          break;
        case 'de':
          language = 'german';
          break;
        case 'es':
          language = 'spanish';
          break;
        case 'fr':
          language = 'french';
          break;
        default:
          language = 'english';
      }
    }
    
    // 3. Check user settings if authenticated
    if (req.user && req.user.language) {
      language = req.user.language;
    }
    
    // Attach language to request object
    req.language = language;
    
    next();
  } catch (error) {
    // If there's an error, default to English and continue
    req.language = 'english';
    next();
  }
};

module.exports = { languageMiddleware }; 