const Document = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const UserPresence = require('../models/UserPresence');
const OT = require('./operationalTransform');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { getPresignedUrl } = require('../config/minio');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const Minio = require('minio');

class CollaborationService {
  constructor() {
    this.activeDocuments = new Map(); // mediaId -> { content, version, operations, lastSaved }
    this.userSessions = new Map(); // socketId -> { userId, mediaId, username }
    this.ot = new OT(); // Initialize operational transform
    // Initialize MinIO client as fallback
    this.minioClient = new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin'
    });
  }

  // Extract text content from document file
  async extractDocumentContent(mediaId) {
    try {
      console.log('🚀 === EXTRACT DOCUMENT CONTENT DEBUG START ===');
      console.log('📋 Media ID:', mediaId);
      
      // Get media record from media files array (shared from simple-server)
      const media = global.mediaFiles ? global.mediaFiles.find(m => m.id === mediaId) : null;

      if (!media) {
        console.log('❌ Media not found in global mediaFiles');
        console.log('📋 Available media files:', global.mediaFiles?.map(m => ({ id: m.id, title: m.title, type: m.type })) || 'None');
        return '';
      }
      
      console.log('✅ Found media record:', { 
        id: media.id, 
        type: media.type, 
        objectName: media.objectName,
        size: media.size 
      });
      
      // Try to get content directly from MinIO first
      console.log('🔍 Step 1: Trying MinIO direct access...');
      const minioContent = await this.getMinioFileContent(media.objectName);
      if (minioContent && minioContent.trim().length > 0) {
        console.log('✅ MinIO content retrieved successfully, length:', minioContent.length);
        return minioContent;
      }
      
      console.log('✅ Found media record:', { 
        id: media.id, 
        type: media.type, 
        objectName: media.objectName,
        size: media.size 
      });
      
      // Find the actual file path
      console.log('🔍 Step 1: Finding actual file path...');
      const filePath = this.findActualFilePath(media.objectName);
      
      if (!filePath) {
        console.log('❌ File not found in any storage location');
        console.log('❌ Object name:', media.objectName);
        
        // Try MinIO fallback
        console.log('🔍 Trying MinIO fallback method...');
        const minioContent = await this.getMinioFileContent(media.objectName);
        if (minioContent) {
          return minioContent;
        }
        
        return '';
      }
      
      console.log('✅ File path found:', filePath);
      
      // Handle different file types
      console.log('🔍 Step 2: Processing file type:', media.type);
      
      if (media.type === 'text/plain' || media.type === 'text/markdown') {
        console.log('📄 Processing text file...');
        const content = fs.readFileSync(filePath, 'utf8');
        console.log('✅ Text content loaded, length:', content.length);
        console.log('📄 Content preview:', content.substring(0, 100) + '...');
        return content || '';
      } else if (media.type.includes('word') || media.type.includes('document') || media.type.includes('docx')) {
        console.log('📄 Processing Word document...');
        
        // Try multiple methods for DOCX extraction
        let content = null;
        
        // Method 1: Try XML parsing from directory
        console.log('🔍 Method 1: Trying XML parsing...');
        content = await this.extractDocxContentFromXml(filePath);
        if (content) {
          console.log('✅ XML parsing successful, content length:', content.length);
          return content;
        }
        
        // Method 2: Try to find .docx file in directory
        console.log('🔍 Method 2: Looking for .docx file...');
        const docxFile = this.findDocxFile(filePath);
        if (docxFile) {
          console.log('✅ Found DOCX file:', docxFile);
          content = await this.extractDocxContentFromFile(docxFile);
          if (content) {
            console.log('✅ DOCX file extraction successful, content length:', content.length);
            return content;
          }
        }
        
        // Method 3: Try MinIO fallback
        console.log('🔍 Method 3: Trying MinIO fallback...');
        content = await this.getMinioFileContent(media.objectName);
        if (content) {
          console.log('✅ MinIO fallback successful, content length:', content.length);
          return content;
        }
        
        // Method 4: Try to read directory as ZIP and extract
        console.log('🔍 Method 4: Trying ZIP extraction...');
        content = await this.extractDocxContentFromZip(filePath);
        if (content) {
          console.log('✅ ZIP extraction successful, content length:', content.length);
          return content;
        }
        
        console.log('❌ All DOCX extraction methods failed');
        return '';
      } else {
        console.log('📄 Processing other file type...');
        // For other file types
        return '';
      }
      
    } catch (error) {
      console.error('❌ ERROR in extractDocumentContent:', error);
      console.error('❌ Error stack:', error.stack);
      return '';
    } finally {
      console.log('🚀 === EXTRACT DOCUMENT CONTENT DEBUG END ===');
    }
  }

  // Method 1: Extract content from DOCX XML files
  async extractDocxContentFromXml(directoryPath) {
    try {
      console.log('🔍 Extracting content from DOCX XML files...');
      
      // Check for word/document.xml
      const documentXmlPath = path.join(directoryPath, 'word', 'document.xml');
      if (fs.existsSync(documentXmlPath)) {
        console.log('✅ Found document.xml, reading content...');
        const xmlContent = fs.readFileSync(documentXmlPath, 'utf8');
        
        // Simple XML parsing to extract text
        const textContent = this.parseDocxXml(xmlContent);
        if (textContent && textContent.trim().length > 0) {
          console.log('✅ XML parsing successful, content length:', textContent.length);
          return textContent;
        }
      }
      
      // Check for alternative XML files
      const files = fs.readdirSync(directoryPath);
      for (const file of files) {
        if (file.endsWith('.xml')) {
          const xmlPath = path.join(directoryPath, file);
          console.log(`🔍 Trying XML file: ${file}`);
          
          try {
            const xmlContent = fs.readFileSync(xmlPath, 'utf8');
            const textContent = this.parseDocxXml(xmlContent);
            if (textContent && textContent.trim().length > 0) {
              console.log(`✅ XML parsing successful from ${file}, content length:`, textContent.length);
              return textContent;
            }
          } catch (xmlError) {
            console.log(`⚠️ Failed to parse ${file}:`, xmlError.message);
          }
        }
      }
      
      console.log('❌ No valid XML content found');
      return null;
    } catch (error) {
      console.error('❌ Error in XML extraction:', error.message);
      return null;
    }
  }

  // Method 2: Extract content from .docx file using mammoth
  async extractDocxContentFromFile(docxFilePath) {
    try {
      console.log('🔍 Using mammoth to extract text from DOCX file...');
      const result = await mammoth.extractRawText({ path: docxFilePath });
      
      if (result.value && result.value.trim().length > 0) {
        console.log('✅ Mammoth extraction successful, content length:', result.value.length);
        console.log('📄 Content preview:', result.value.substring(0, 100) + '...');
        return result.value;
      } else {
        console.log('⚠️ Mammoth extracted empty content');
        return null;
      }
    } catch (error) {
      console.log('❌ Mammoth extraction failed:', error.message);
      return null;
    }
  }

  // Method 3: Get content directly from MinIO
  async getMinioFileContent(objectName) {
    try {
      console.log('🔍 Getting file content from MinIO...');
      console.log('📋 Object name:', objectName);
      
      // Try multiple bucket names in case of different storage configurations
      const buckets = ['insightdocs', 'documents', 'files'];
      let content = null;
      
      for (const bucket of buckets) {
        try {
          console.log(`🔍 Trying bucket: ${bucket}`);
          const stream = await this.minioClient.getObject(bucket, objectName);
          const chunks = [];
          
          content = await new Promise((resolve, reject) => {
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
              try {
                const buffer = Buffer.concat(chunks);
                console.log(`✅ MinIO content retrieved from bucket ${bucket}, buffer size:`, buffer.length);
                
                // For DOCX files, try to extract text using mammoth
                if (objectName.endsWith('.docx') || objectName.includes('docx')) {
                  console.log('📄 Processing DOCX from MinIO buffer...');
                  this.extractDocxFromBuffer(buffer).then(textContent => {
                    if (textContent && textContent.trim().length > 0) {
                      console.log('✅ DOCX extraction successful, content length:', textContent.length);
                      resolve(textContent);
                    } else {
                      console.log('⚠️ DOCX extraction failed, trying text extraction');
                      const textContent = this.extractTextFromBuffer(buffer);
                      resolve(textContent);
                    }
                  }).catch(error => {
                    console.log('❌ DOCX extraction error:', error.message);
                    const textContent = this.extractTextFromBuffer(buffer);
                    resolve(textContent);
                  });
                } else {
                  // For other file types, try text extraction
                  const textContent = this.extractTextFromBuffer(buffer);
                  if (textContent) {
                    console.log('✅ Text extraction from buffer successful, content length:', textContent.length);
                    resolve(textContent);
                  } else {
                    console.log('⚠️ Text extraction from buffer failed');
                    resolve(null);
                  }
                }
              } catch (error) {
                console.error('❌ Error processing MinIO buffer:', error.message);
                resolve(null);
              }
            });
            stream.on('error', (error) => {
              console.error(`❌ MinIO stream error for bucket ${bucket}:`, error.message);
              resolve(null);
            });
          });
          
          if (content) {
            console.log(`✅ Successfully retrieved content from bucket ${bucket}`);
            return content;
          }
        } catch (bucketError) {
          console.log(`⚠️ Failed to access bucket ${bucket}:`, bucketError.message);
          continue;
        }
      }
      
      console.log('❌ Failed to retrieve content from any bucket');
      return null;
    } catch (error) {
      console.error('❌ MinIO error:', error.message);
      return null;
    }
  }

  // Method 4: Try ZIP extraction (DOCX is essentially a ZIP file)
  async extractDocxContentFromZip(directoryPath) {
    try {
      console.log('🔍 Trying ZIP extraction method...');
      
      // Look for ZIP-related files or try to read as archive
      const files = fs.readdirSync(directoryPath);
      console.log('📋 Files in directory for ZIP extraction:', files);
      
      // Check if we have the main content files
      const hasWordFolder = files.includes('word');
      const hasContentTypes = files.includes('[Content_Types].xml');
      
      if (hasWordFolder && hasContentTypes) {
        console.log('✅ Found DOCX structure, attempting content extraction...');
        
        // Try to read the main document content
        const wordPath = path.join(directoryPath, 'word');
        const wordFiles = fs.readdirSync(wordPath);
        console.log('📋 Word folder contents:', wordFiles);
        
        // Look for document.xml or other content files
        for (const file of wordFiles) {
          if (file === 'document.xml' || file.includes('document')) {
            const docPath = path.join(wordPath, file);
            try {
              const content = fs.readFileSync(docPath, 'utf8');
              const textContent = this.parseDocxXml(content);
              if (textContent && textContent.trim().length > 0) {
                console.log(`✅ ZIP extraction successful from ${file}, content length:`, textContent.length);
                return textContent;
              }
            } catch (readError) {
              console.log(`⚠️ Failed to read ${file}:`, readError.message);
            }
          }
        }
      }
      
      console.log('❌ ZIP extraction method failed');
      return null;
    } catch (error) {
      console.error('❌ Error in ZIP extraction:', error.message);
      return null;
    }
  }

  // IMPROVED METHOD: Extract text content from buffer
  extractTextFromBuffer(buffer) {
    try {
      console.log('🔍 Extracting text content from buffer...');
      
      // Try different encodings
      const encodings = ['utf8', 'utf16le', 'latin1', 'ascii'];
      
      for (const encoding of encodings) {
        try {
          const text = buffer.toString(encoding);
          if (text && text.trim().length > 0) {
            console.log(`✅ Text extraction successful with ${encoding} encoding, content length:`, text.length);
            return text;
          }
        } catch (encodingError) {
          console.log(`⚠️ Failed to decode with ${encoding}:`, encodingError.message);
          continue;
        }
      }
      
      console.log('❌ Text extraction failed with all encodings');
      return null;
    } catch (error) {
      console.error('❌ Text buffer extraction error:', error.message);
      return null;
    }
  }

  // Extract DOCX content from buffer using mammoth
  async extractDocxFromBuffer(buffer) {
    try {
      console.log('🔍 Extracting DOCX content from buffer using mammoth...');
      
      // Create a temporary file to use with mammoth
      const tempPath = path.join(__dirname, '..', 'temp', `temp_${Date.now()}.docx`);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Write buffer to temp file
      fs.writeFileSync(tempPath, buffer);
      
      try {
        // Extract text using mammoth
        const result = await mammoth.extractRawText({ path: tempPath });
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
        
        if (result.value && result.value.trim().length > 0) {
          console.log('✅ Mammoth extraction successful, content length:', result.value.length);
          return result.value;
        } else {
          console.log('⚠️ Mammoth extracted empty content');
          return null;
        }
      } catch (mammothError) {
        // Clean up temp file on error
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        throw mammothError;
      }
    } catch (error) {
      console.error('❌ Error extracting DOCX from buffer:', error.message);
      return null;
    }
  }

  // Parse DOCX XML content
  parseDocxXml(xmlContent) {
    try {
      console.log('🔍 Parsing DOCX XML content...');
      
      // Simple XML parsing to extract text content
      // Remove XML tags and extract text
      let textContent = xmlContent
        .replace(/<[^>]+>/g, ' ') // Remove XML tags
        .replace(/&lt;/g, '<')     // Decode HTML entities
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim();
      
      // Remove any remaining XML artifacts
      textContent = textContent.replace(/xmlns[^=]*="[^"]*"/g, '');
      textContent = textContent.replace(/xmlns[^=]*='[^']*'/g, '');
      
      if (textContent && textContent.trim().length > 0) {
        console.log('✅ XML parsing successful, extracted text length:', textContent.length);
        console.log('📄 Text preview:', textContent.substring(0, 100) + '...');
        return textContent;
      } else {
        console.log('⚠️ XML parsing resulted in empty content');
        return null;
      }
    } catch (error) {
      console.error('❌ Error parsing DOCX XML:', error.message);
      return null;
    }
  }

  // Helper method to find the actual .docx file in a directory
  findDocxFile(directoryPath) {
    try {
      console.log('🔍 Looking for DOCX file in directory:', directoryPath);
      
      // List all files in the directory
      const files = fs.readdirSync(directoryPath);
      console.log('📋 Files in directory:', files);
      
      // Look for files with .docx extension
      const docxFiles = files.filter(file => file.endsWith('.docx'));
      console.log('📄 DOCX files found:', docxFiles);
      
      if (docxFiles.length > 0) {
        const docxPath = path.join(directoryPath, docxFiles[0]);
        console.log('✅ Returning DOCX file path:', docxPath);
        return docxPath;
      }
      
      // If no .docx file found, return null
      console.log('❌ No .docx file found in directory');
      return null;
    } catch (error) {
      console.error('❌ Error finding DOCX file:', error.message);
      return null;
    }
  }

  // IMPROVED METHOD: Find actual file path with better search
  findActualFilePath(objectName) {
    try {
      console.log('🔍 Finding actual file path for:', objectName);
      
      // Define possible storage locations
      const storageLocations = [
        path.join(__dirname, '../minio-data'),
        path.join(__dirname, '../minio-local/data'),
        path.join(__dirname, '../minio-win/data'),
        path.join(__dirname, '../minio-win/minio-win/data'),
        path.join(__dirname, '../../minio-data'),
        path.join(__dirname, '../../minio-local/data'),
        path.join(__dirname, '../../minio-win/data')
      ];
      
      for (const location of storageLocations) {
        if (fs.existsSync(location)) {
          console.log(`🔍 Searching in: ${location}`);
          
          // Search recursively for the file
          const foundPath = this.findFileRecursively(location, objectName);
          if (foundPath) {
            console.log(`✅ Found file at: ${foundPath}`);
            return foundPath;
          }
        }
      }
      
      console.log('❌ File not found in any storage location');
      return null;
    } catch (error) {
      console.error('❌ Error finding file path:', error.message);
      return null;
    }
  }

  // NEW METHOD: Recursively search for file
  findFileRecursively(directory, targetFileName) {
    try {
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const fullPath = path.join(directory, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Check if this directory matches the object name (for extracted DOCX)
          if (item === targetFileName || item.includes(targetFileName.replace('.docx', ''))) {
            console.log(`✅ Found matching directory: ${fullPath}`);
            return fullPath;
          }
          
          // Recursively search subdirectories
          const found = this.findFileRecursively(fullPath, targetFileName);
          if (found) return found;
        } else if (stat.isFile()) {
          // Check if file matches the object name
          if (item === targetFileName || item.includes(targetFileName.replace('.docx', ''))) {
            console.log(`✅ Found matching file: ${fullPath}`);
            return fullPath;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.log(`⚠️ Error searching directory ${directory}:`, error.message);
      return null;
    }
  }

  // NEW METHOD: Apply operation with operational transform
  async applyOperation(mediaId, operation, userId) {
    try {
      console.log(`🔧 Applying operation for document ${mediaId} from user ${userId}`);
      
      // Validate operation
      if (!operation || !operation.type || typeof operation.position !== 'number') {
        console.log(`⚠️ Invalid operation received:`, operation);
        return null;
      }
      
      const document = this.activeDocuments.get(mediaId);
      if (!document) {
        console.log(`❌ Document ${mediaId} not found in active documents`);
        return null;
      }
      
      // Validate operation against current content
      if (operation.position > document.content.length) {
        console.log(`⚠️ Operation position ${operation.position} exceeds content length ${document.content.length}`);
        return null;
      }
      
      // Apply operational transform
      const transformedOperation = this.ot.transform(operation, document.operations);
      
      // Update document content
      const newContent = this.applyOperationToContent(document.content, transformedOperation);
      
      // Update document state
      document.content = newContent;
      document.operations.push(transformedOperation);
      document.version++;
      document.lastSaved = Date.now();
      
      console.log(`✅ Operation applied successfully, new version: ${document.version}`);
      
      return {
        content: newContent,
        operation: transformedOperation,
        version: document.version
      };
    } catch (error) {
      console.error('❌ Error applying operation:', error.message);
      return null;
    }
  }

  // NEW METHOD: Apply operation to content
  applyOperationToContent(content, operation) {
    try {
      let newContent = content;
      
      switch (operation.type) {
        case 'insert':
          newContent = content.slice(0, operation.position) + 
                      operation.text + 
                      content.slice(operation.position);
          break;
        case 'delete':
          newContent = content.slice(0, operation.position) + 
                      content.slice(operation.position + operation.length);
          break;
        case 'replace':
          newContent = content.slice(0, operation.position) + 
                      operation.text + 
                      content.slice(operation.position + operation.length);
          break;
        default:
          console.log(`⚠️ Unknown operation type: ${operation.type}`);
          return content;
      }
      
      return newContent;
    } catch (error) {
      console.error('❌ Error applying operation to content:', error.message);
      return content;
    }
  }

  // NEW METHOD: Save document change to database
  async saveDocumentChange(mediaId, content, version, userId, saveType = 'auto') {
    try {
      console.log(`💾 Saving document change for ${mediaId}, version: ${version}, save type: ${saveType}`);
      
      // Update active document
      const document = this.activeDocuments.get(mediaId);
      if (document) {
        document.content = content;
        document.version = version;
        document.lastSaved = Date.now();
      }
      
      // Save to database
      const query = `
        INSERT INTO document_versions (media_id, content, version, created_by, save_type, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (media_id, version) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          save_type = EXCLUDED.save_type,
          updated_at = NOW()
      `;
      
      await pool.query(query, [mediaId, content, version, userId, saveType]);
      
      // Update media table with latest content
      const updateQuery = `
        UPDATE media 
        SET content = $1, updated_at = NOW()
        WHERE id = $2
      `;
      
      await pool.query(updateQuery, [content, mediaId]);
      
      console.log(`✅ Document change saved successfully for ${mediaId}`);
      
      return {
        mediaId,
        version,
        timestamp: Date.now(),
        saveType
      };
    } catch (error) {
      console.error('❌ Error saving document change:', error.message);
      return null;
    }
  }

  // IMPROVED METHOD: Initialize document with better content loading
  async initializeDocument(mediaId, userId, username) {
    try {
      console.log(`🚀 Initializing document ${mediaId} for user ${username}`);
      
      // Check if document is already active
      if (this.activeDocuments.has(mediaId)) {
        console.log(`✅ Document ${mediaId} already active`);
        const document = this.activeDocuments.get(mediaId);
        return {
          content: document.content,
          version: document.version,
          activeUsers: await this.getActiveUsers(mediaId)
        };
      }
      
      // Extract document content
      console.log(`📄 Extracting content for document ${mediaId}`);
      const content = await this.extractDocumentContent(mediaId);
      
      if (!content || content.trim().length === 0) {
        console.log(`⚠️ No content extracted for document ${mediaId}, using placeholder`);
        const placeholderContent = 'Start typing to begin collaboration...';
        
        // Initialize with placeholder
        this.activeDocuments.set(mediaId, {
          content: placeholderContent,
          version: 1,
          operations: [],
          lastSaved: Date.now(),
          activeUsers: new Set()
        });
        
        return {
          content: placeholderContent,
          version: 1,
          activeUsers: []
        };
      }
      
      // Get version from database
      const versionQuery = `
        SELECT MAX(version) as max_version 
        FROM document_versions 
        WHERE media_id = $1
      `;
      
      const versionResult = await pool.query(versionQuery, [mediaId]);
      const version = (versionResult.rows[0]?.max_version || 0) + 1;
      
      // Initialize document
      this.activeDocuments.set(mediaId, {
        content: content,
        version: version,
        operations: [],
        lastSaved: Date.now(),
        activeUsers: new Set()
      });
      
      console.log(`✅ Document ${mediaId} initialized with content length: ${content.length}, version: ${version}`);
      
      return {
        content: content,
        version: version,
        activeUsers: []
      };
    } catch (error) {
      console.error(`❌ Error initializing document ${mediaId}:`, error.message);
      
      // Return fallback content
      return {
        content: 'Document content will be loaded here. Please start typing to begin collaboration.',
        version: 1,
        activeUsers: []
      };
    }
  }

  // Join document collaboration session
  async joinDocument(socketId, userId, username, mediaId, cursor = { position: 0 }) {
    try {
      console.log(`👤 User ${username} joining document ${mediaId}`);
      
      // Add to session tracking
      this.userSessions.set(socketId, { userId, mediaId, username });

      // Get current document state from active documents
      const document = this.activeDocuments.get(mediaId);
      
      // Get active users from sessions
      const activeUsers = [];
      for (const [sessionSocketId, session] of this.userSessions.entries()) {
        if (session.mediaId === mediaId) {
          activeUsers.push({
            userId: session.userId,
            username: session.username,
            color: this.getUserColor(session.userId),
            cursor: { position: 0 },
            isTyping: false
          });
        }
      }

      console.log(`👤 User ${username} joined document ${mediaId}. Document content length:`, document?.content?.length || 0);

      return {
        document,
        activeUsers: activeUsers
      };
    } catch (error) {
      console.error('Error joining document:', error);
      throw error;
    }
  }

  // Leave document collaboration session
  async leaveDocument(socketId) {
    try {
      const session = this.userSessions.get(socketId);
      if (session) {
        await UserPresence.deleteOne({ socketId });
        this.userSessions.delete(socketId);
        console.log(`👤 User ${session.username} left document ${session.mediaId}`);
      }
    } catch (error) {
      console.error('Error leaving document:', error);
    }
  }

  // Handle document change
  async handleChange(mediaId, userId, operation) {
    try {
      let docState = this.activeDocuments.get(mediaId);
      
      // If document is not initialized, initialize it first
      if (!docState) {
        console.log(`📄 Initializing document ${mediaId} for collaboration`);
        const document = await Document.findOne({ mediaId });
        
        if (!document) {
          // Create a new document if it doesn't exist
          const mediaResult = await pool.query(
            'SELECT file_path, type FROM media WHERE id = $1',
            [mediaId]
          );
          
          if (mediaResult.rows.length > 0) {
            const content = await this.extractDocumentContent(mediaId);
            const newDocument = new Document({
              mediaId,
              organizationId: 'org-1756521690181', // Default org for now
              title: 'Collaborative Document',
              content: content,
              createdBy: userId,
              version: 1
            });
            await newDocument.save();
            
            docState = {
              content: content,
              version: 1,
              operations: [],
              lastSaved: Date.now()
            };
            this.activeDocuments.set(mediaId, docState);
          } else {
            throw new Error('Media not found');
          }
        } else {
          // Initialize with existing document
          docState = {
            content: document.content || '',
            version: document.version || 1,
            operations: [],
            lastSaved: Date.now()
          };
          this.activeDocuments.set(mediaId, docState);
        }
      }

      // Validate operation
      if (!OT.validateOperation(operation)) {
        console.error('Invalid operation received:', operation);
        throw new Error('Invalid operation');
      }

      // Transform operation against pending operations
      const transformedOp = OT.transformPendingOperations(operation, docState.operations);
      
      // Apply operation to document
      const oldContent = docState.content;
      docState.content = OT.applyOperation(docState.content, transformedOp);
      docState.version++;
      docState.operations.push(transformedOp);
      docState.lastSaved = Date.now();

      console.log(`📝 Document ${mediaId} updated:`, {
        operation: transformedOp.type,
        oldLength: oldContent.length,
        newLength: docState.content.length,
        version: docState.version
      });

      // Save to database periodically
      if (docState.operations.length >= 5) {
        await this.saveDocument(mediaId);
      }

      return {
        operation: transformedOp,
        content: docState.content,
        version: docState.version
      };
    } catch (error) {
      console.error('Error handling change:', error);
      throw error;
    }
  }

  // Update user cursor
  async updateCursor(socketId, cursor) {
    try {
      await UserPresence.updateOne(
        { socketId },
        { 
          cursor,
          lastActivity: new Date()
        }
      );
    } catch (error) {
      console.error('Error updating cursor:', error);
    }
  }

  // Update typing status
  async updateTypingStatus(socketId, isTyping) {
    try {
      await UserPresence.updateOne(
        { socketId },
        { 
          isTyping,
          lastActivity: new Date()
        }
      );
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  }

  // Save document to database and MinIO
  async saveDocument(mediaId, userId = null, changeSummary = null) {
    try {
      const docState = this.activeDocuments.get(mediaId);
      if (!docState) {
        console.log(`❌ No active document state found for ${mediaId}`);
        return null;
      }

      console.log(`💾 Saving document ${mediaId}, version ${docState.version}`);

      // Get user info for version history
      let editorId = userId || 'unknown';
      let editorName = 'Unknown User';
      
      // Try to get user info from global users array
      if (global.users) {
        const user = global.users.find(u => u.id === editorId);
        if (user) {
          editorName = user.username;
        }
      }

      // Create version history entry using mock database
      const versionId = `version-${Date.now()}`;
      const versionData = {
        id: versionId,
        mediaId,
        version: docState.version,
        content: docState.content,
        changes: docState.operations,
        editedBy: editorId,
        editorName: editorName,
        editedAt: new Date(),
        commitMessage: changeSummary || `Version ${docState.version} - ${docState.operations.length} changes by ${editorName}`
      };

      // Save to mock database
      await pool.query(`
        INSERT INTO document_versions (id, media_id, content, version, created_by, save_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (media_id, version) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          save_type = EXCLUDED.save_type,
          updated_at = NOW()
      `, [versionId, mediaId, docState.content, docState.version, editorId, 'manual']);

      // Update media table with latest content
      await pool.query(`
        UPDATE media 
        SET content = $1, updated_at = NOW()
        WHERE id = $2
      `, [docState.content, mediaId]);

      // Clear operations after saving
      docState.operations = [];
      docState.lastSaved = Date.now();

      console.log(`✅ Document ${mediaId} saved, version ${docState.version} by ${editorName}`);
      
      return {
        versionId: versionId,
        version: docState.version,
        editedBy: editorId,
        editorName: editorName,
        editedAt: versionData.editedAt,
        commitMessage: versionData.commitMessage
      };
    } catch (error) {
      console.error('Error saving document:', error);
      throw error;
    }
  }

  // Get document version history
  async getVersionHistory(mediaId) {
    try {
      const query = `
        SELECT * FROM document_versions 
        WHERE media_id = $1 
        ORDER BY version DESC 
        LIMIT 50
      `;
      
      const result = await pool.query(query, [mediaId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting version history:', error);
      return [];
    }
  }

  // Rollback to specific version
  async rollbackToVersion(mediaId, targetVersion) {
    try {
      const query = `
        SELECT * FROM document_versions 
        WHERE media_id = $1 AND version = $2
      `;
      
      const result = await pool.query(query, [mediaId, targetVersion]);
      
      if (result.rows.length === 0) {
        throw new Error('Version not found');
      }
      
      const version = result.rows[0];
      
      // Update active document state
      const docState = this.activeDocuments.get(mediaId);
      if (docState) {
        docState.content = version.content;
        docState.version = targetVersion + 1;
        docState.operations = [];
        docState.lastSaved = Date.now();
      }
      
      // Update media table
      await pool.query(`
        UPDATE media 
        SET content = $1, updated_at = NOW()
        WHERE id = $2
      `, [version.content, mediaId]);
      
      console.log(`✅ Document ${mediaId} rolled back to version ${targetVersion}`);
      
      return {
        content: version.content,
        version: targetVersion + 1
      };
    } catch (error) {
      console.error('Error rolling back version:', error);
      throw error;
    }
  }

  // Get user color for cursor
  getUserColor(userId) {
    const colors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
    ];
    const index = userId.charCodeAt(userId.length - 1) % colors.length;
    return colors[index];
  }

  // Save content back to MinIO
  async saveContentToMinIO(mediaId, content, versionId) {
    try {
      console.log('🔍 Saving content to MinIO...');
      
      // Get media record to find the original object name
      const media = global.mediaFiles ? global.mediaFiles.find(m => m.id === mediaId) : null;
      if (!media) {
        throw new Error('Media record not found');
      }
      
      // Create a new DOCX file from the content
      const docxBuffer = await this.createDocxFromContent(content);
      
      // Create a temporary object name for atomic save
      const tempObjectName = `${media.objectName}.tmp.${Date.now()}`;
      
      // Upload to temporary location first
      await this.minioClient.putObject('insightdocs', tempObjectName, docxBuffer, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'x-amz-meta-version-id': versionId.toString(),
        'x-amz-meta-saved-at': new Date().toISOString(),
        'x-amz-meta-content-length': content.length.toString()
      });
      
      // Now move/rename to the original location (atomic operation)
      await this.minioClient.copyObject('insightdocs', tempObjectName, 'insightdocs', media.objectName);
      
      // Delete the temporary object
      await this.minioClient.removeObject('insightdocs', tempObjectName);
      
      console.log('✅ Content successfully saved to MinIO:', media.objectName);
    } catch (error) {
      console.error('❌ Error saving content to MinIO:', error);
      throw error;
    }
  }

  // Create DOCX file from content
  async createDocxFromContent(content) {
    try {
      // For now, create a simple text file that can be opened as DOCX
      // In a production environment, you'd want to use a proper DOCX library
      const textContent = content || 'Empty document';
      
      // Create a simple DOCX structure (this is a basic implementation)
      // In production, use a library like docx or officegen
      const buffer = Buffer.from(textContent, 'utf8');
      
      return buffer;
    } catch (error) {
      console.error('❌ Error creating DOCX from content:', error);
      throw error;
    }
  }

  // Get active users for document
  async getActiveUsers(mediaId) {
    try {
      // Get active users from sessions
      const activeUsers = [];
      for (const [sessionSocketId, session] of this.userSessions.entries()) {
        if (session.mediaId === mediaId) {
          activeUsers.push({
            userId: session.userId,
            username: session.username,
            color: this.getUserColor(session.userId),
            cursor: { position: 0 },
            isTyping: false,
            lastActivity: new Date()
          });
        }
      }
      return activeUsers;
    } catch (error) {
      console.error('Error getting active users:', error);
      return [];
    }
  }

  // Cleanup inactive sessions
  async cleanupInactiveSessions() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const inactiveUsers = await UserPresence.find({
        lastActivity: { $lt: fiveMinutesAgo }
      });

      for (const user of inactiveUsers) {
        this.userSessions.delete(user.socketId);
        await UserPresence.deleteOne({ _id: user._id });
      }

      console.log(`🧹 Cleaned up ${inactiveUsers.length} inactive sessions`);
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
    }
  }

  // NEW METHOD: Apply operation with operational transform
  async applyOperation(mediaId, operation, userId) {
    try {
      console.log(`🔧 Applying operation for document ${mediaId} from user ${userId}`);
      
      // Validate operation
      if (!operation || !operation.type || typeof operation.position !== 'number') {
        console.log(`⚠️ Invalid operation received:`, operation);
        return null;
      }
      
      const document = this.activeDocuments.get(mediaId);
      if (!document) {
        console.log(`❌ Document ${mediaId} not found in active documents`);
        return null;
      }
      
      // Validate operation against current content
      if (operation.position > document.content.length) {
        console.log(`⚠️ Operation position ${operation.position} exceeds content length ${document.content.length}`);
        return null;
      }
      
      // Apply operational transform
      const transformedOperation = this.ot.transform(operation, document.operations);
      
      // Update document content
      const newContent = this.applyOperationToContent(document.content, transformedOperation);
      
      // Update document state
      document.content = newContent;
      document.operations.push(transformedOperation);
      document.version++;
      document.lastSaved = Date.now();
      
      console.log(`✅ Operation applied successfully, new version: ${document.version}`);
      
      return {
        content: newContent,
        operation: transformedOperation,
        version: document.version
      };
    } catch (error) {
      console.error('❌ Error applying operation:', error.message);
      return null;
    }
  }

  // NEW METHOD: Apply operation to content
  applyOperationToContent(content, operation) {
    try {
      let newContent = content;
      
      switch (operation.type) {
        case 'insert':
          newContent = content.slice(0, operation.position) + 
                      operation.text + 
                      content.slice(operation.position);
          break;
        case 'delete':
          newContent = content.slice(0, operation.position) + 
                      content.slice(operation.position + operation.length);
          break;
        case 'replace':
          newContent = content.slice(0, operation.position) + 
                      operation.text + 
                      content.slice(operation.position + operation.length);
          break;
        default:
          console.log(`⚠️ Unknown operation type: ${operation.type}`);
          return content;
      }
      
      return newContent;
    } catch (error) {
      console.error('❌ Error applying operation to content:', error.message);
      return content;
    }
  }

  // NEW METHOD: Save document change to database
  async saveDocumentChange(mediaId, content, version, userId, saveType = 'auto') {
    try {
      console.log(`💾 Saving document change for ${mediaId}, version: ${version}, save type: ${saveType}`);
      
      // Update active document
      const document = this.activeDocuments.get(mediaId);
      if (document) {
        document.content = content;
        document.version = version;
        document.lastSaved = Date.now();
      }
      
      // Save to database
      const query = `
        INSERT INTO document_versions (media_id, content, version, created_by, save_type, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (media_id, version) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          save_type = EXCLUDED.save_type,
          updated_at = NOW()
      `;
      
      await pool.query(query, [mediaId, content, version, userId, saveType]);
      
      // Update media table with latest content
      const updateQuery = `
        UPDATE media 
        SET content = $1, updated_at = NOW()
        WHERE id = $2
      `;
      
      await pool.query(updateQuery, [content, mediaId]);
      
      console.log(`✅ Document change saved successfully for ${mediaId}`);
      
      return {
        mediaId,
        version,
        timestamp: Date.now(),
        saveType
      };
    } catch (error) {
      console.error('❌ Error saving document change:', error.message);
      return null;
    }
  }

  // IMPROVED METHOD: Initialize document with better content loading
  async initializeDocument(mediaId, userId, username) {
    try {
      console.log(`🚀 Initializing document ${mediaId} for user ${username}`);
      
      // Check if document is already active
      if (this.activeDocuments.has(mediaId)) {
        console.log(`✅ Document ${mediaId} already active`);
        const document = this.activeDocuments.get(mediaId);
        return {
          content: document.content,
          version: document.version,
          activeUsers: await this.getActiveUsers(mediaId)
        };
      }
      
      // Extract document content
      console.log(`📄 Extracting content for document ${mediaId}`);
      const content = await this.extractDocumentContent(mediaId);
      
      if (!content || content.trim().length === 0) {
        console.log(`⚠️ No content extracted for document ${mediaId}, using placeholder`);
        const placeholderContent = 'Start typing to begin collaboration...';
        
        // Initialize with placeholder
        this.activeDocuments.set(mediaId, {
          content: placeholderContent,
          version: 1,
          operations: [],
          lastSaved: Date.now(),
          activeUsers: new Set()
        });
        
        return {
          content: placeholderContent,
          version: 1,
          activeUsers: []
        };
      }
      
      // Get version from database
      const versionQuery = `
        SELECT MAX(version) as max_version 
        FROM document_versions 
        WHERE media_id = $1
      `;
      
      const versionResult = await pool.query(versionQuery, [mediaId]);
      const version = (versionResult.rows[0]?.max_version || 0) + 1;
      
      // Initialize document
      this.activeDocuments.set(mediaId, {
        content: content,
        version: version,
        operations: [],
        lastSaved: Date.now(),
        activeUsers: new Set()
      });
      
      console.log(`✅ Document ${mediaId} initialized with content length: ${content.length}, version: ${version}`);
      
      return {
        content: content,
        version: version,
        activeUsers: []
      };
    } catch (error) {
      console.error(`❌ Error initializing document ${mediaId}:`, error.message);
      
      // Return fallback content
      return {
        content: 'Document content will be loaded here. Please start typing to begin collaboration.',
        version: 1,
        activeUsers: []
      };
    }
  }
}

module.exports = new CollaborationService();
