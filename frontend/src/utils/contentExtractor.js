// Content extraction utility functions
import API from '../lib/api';

// Priority order for content sources:
// 1. localStorage cache (fastest)
// 2. FilePreview API (most reliable)
// 3. Mock database (if available)
// 4. WebSocket content (real-time)
// 5. Last resort placeholder

/**
 * Extract document content from localStorage cache
 */
export const getCachedContent = (mediaId) => {
  try {
    // Try multiple cache key formats to match different mediaId formats
    const possibleKeys = [
      `doc_content_${mediaId}`,
      `doc_content_media-${mediaId}`,
      `doc_content_media-${mediaId}-966` // Your actual key format
    ];
    
    for (const cacheKey of possibleKeys) {
      const cachedContent = localStorage.getItem(cacheKey);
      if (cachedContent && cachedContent.trim().length > 0) {
        console.log('📦 Using cached content from localStorage, key:', cacheKey, 'length:', cachedContent.length);
        return cachedContent;
      }
    }
    
    // If no exact match, try to find any key that contains the mediaId
    const keys = Object.keys(localStorage);
    const matchingKey = keys.find(key => 
      key.startsWith('doc_content_') && key.includes(mediaId.toString())
    );
    
    if (matchingKey) {
      const cachedContent = localStorage.getItem(matchingKey);
      if (cachedContent && cachedContent.trim().length > 0) {
        console.log('📦 Using cached content from localStorage, fuzzy match key:', matchingKey, 'length:', cachedContent.length);
        return cachedContent;
      }
    }
    
    console.log('⚠️ No cached content found for mediaId:', mediaId);
    return null;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return null;
  }
};

/**
 * Cache document content to localStorage
 */
export const cacheContent = (mediaId, content) => {
  try {
    if (content && content.trim().length > 0) {
      // Use a consistent cache key format
      const cacheKey = `doc_content_${mediaId}`;
      localStorage.setItem(cacheKey, content);
      console.log('💾 Content cached to localStorage, key:', cacheKey, 'length:', content.length);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error caching to localStorage:', error);
    return false;
  }
};

/**
 * Extract document content from FilePreview API
 */
export const getFilePreviewContent = async (mediaId) => {
  try {
    console.log('🔍 Fetching content from FilePreview API for mediaId:', mediaId);
    const response = await API.get(`/media/${mediaId}/preview`);
    const previewData = response.data;
    
    if (previewData && previewData.content && previewData.content.trim().length > 0) {
      console.log('✅ FilePreview content fetched successfully, length:', previewData.content.length);
      console.log('📄 Content preview:', previewData.content.substring(0, 100) + '...');
      
      // Cache the content for future use
      cacheContent(mediaId, previewData.content);
      
      return previewData.content;
    } else {
      console.log('⚠️ No content in FilePreview data');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching FilePreview content:', error);
    return null;
  }
};

/**
 * Extract document content from mock database (if available)
 */
export const getMockDatabaseContent = async (mediaId) => {
  try {
    // Try to get content from mock database endpoints
    const endpoints = [
      `/api/documents/${mediaId}`,
      `/api/media/${mediaId}/content`,
      `/documents/${mediaId}/content`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await API.get(endpoint);
        if (response.data && response.data.content && response.data.content.trim().length > 0) {
          console.log('✅ Mock database content fetched from:', endpoint, 'length:', response.data.content.length);
          return response.data.content;
        }
      } catch (endpointError) {
        // Continue to next endpoint
        continue;
      }
    }
    
    console.log('⚠️ No content found in mock database');
    return null;
  } catch (error) {
    console.error('❌ Error fetching from mock database:', error);
    return null;
  }
};

/**
 * Main content extraction function with priority-based fallbacks
 */
export const extractDocumentContent = async (mediaId, options = {}) => {
  const {
    useCache = true,
    useFilePreview = true,
    useMockDatabase = true,
    useWebSocket = false,
    webSocketContent = null
  } = options;
  
  console.log('🚀 === CONTENT EXTRACTION START ===');
  console.log('📋 Media ID:', mediaId);
  console.log('🔧 Options:', options);
  
  let content = null;
  let source = 'none';
  
  // Priority 1: WebSocket content (if available and requested)
  if (useWebSocket && webSocketContent && webSocketContent.trim().length > 0) {
    content = webSocketContent;
    source = 'websocket';
    console.log('✅ Using WebSocket content, length:', content.length);
  }
  
  // Priority 2: localStorage cache (if enabled)
  if (!content && useCache) {
    content = getCachedContent(mediaId);
    if (content) source = 'localStorage';
  }
  
  // Priority 3: FilePreview API (if enabled)
  if (!content && useFilePreview) {
    content = await getFilePreviewContent(mediaId);
    if (content) source = 'filePreview';
  }
  
  // Priority 4: Mock database (if enabled)
  if (!content && useMockDatabase) {
    content = await getMockDatabaseContent(mediaId);
    if (content) source = 'mockDatabase';
  }
  
  // Priority 5: Last resort placeholder (only if no content found anywhere)
  if (!content) {
    console.log('⚠️ No content found from any source, using last resort placeholder');
    content = 'Start typing to begin collaboration...';
    source = 'placeholder';
  }
  
  console.log('✅ Content extraction complete');
  console.log('📄 Source:', source);
  console.log('📏 Length:', content.length);
  console.log('🚀 === CONTENT EXTRACTION END ===');
  
  return {
    content,
    source,
    hasRealContent: source !== 'placeholder'
  };
};

/**
 * Clear content cache for a specific document
 */
export const clearContentCache = (mediaId) => {
  try {
    const cacheKey = `doc_content_${mediaId}`;
    localStorage.removeItem(cacheKey);
    console.log('🗑️ Content cache cleared for mediaId:', mediaId);
    return true;
  } catch (error) {
    console.error('Error clearing content cache:', error);
    return false;
  }
};

/**
 * Get content statistics (cache size, etc.)
 */
export const getContentStats = () => {
  try {
    const keys = Object.keys(localStorage);
    const contentKeys = keys.filter(key => key.startsWith('doc_content_'));
    const totalSize = contentKeys.reduce((size, key) => {
      const content = localStorage.getItem(key);
      return size + (content ? content.length : 0);
    }, 0);
    
    return {
      cachedDocuments: contentKeys.length,
      totalContentSize: totalSize,
      averageSize: contentKeys.length > 0 ? Math.round(totalSize / contentKeys.length) : 0
    };
  } catch (error) {
    console.error('Error getting content stats:', error);
    return { cachedDocuments: 0, totalContentSize: 0, averageSize: 0 };
  }
};

/**
 * Debug function to show all localStorage content keys
 */
export const debugLocalStorage = () => {
  try {
    const keys = Object.keys(localStorage);
    const contentKeys = keys.filter(key => key.startsWith('doc_content_'));
    
    console.log('🔍 === LOCALSTORAGE DEBUG ===');
    console.log('📋 All localStorage keys:', keys);
    console.log('📄 Content keys:', contentKeys);
    
    contentKeys.forEach(key => {
      const content = localStorage.getItem(key);
      console.log(`📝 ${key}:`, content ? content.substring(0, 100) + '...' : 'null');
    });
    
    console.log('🔍 === END DEBUG ===');
    
    return {
      allKeys: keys,
      contentKeys: contentKeys,
      contentDetails: contentKeys.map(key => ({
        key,
        content: localStorage.getItem(key),
        length: localStorage.getItem(key)?.length || 0
      }))
    };
  } catch (error) {
    console.error('Error debugging localStorage:', error);
    return null;
  }
}; 