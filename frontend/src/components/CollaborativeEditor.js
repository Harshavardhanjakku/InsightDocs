'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import dynamic from 'next/dynamic';
import { 
  extractDocumentContent, 
  cacheContent, 
  clearContentCache,
  getContentStats,
  debugLocalStorage 
} from '../utils/contentExtractor';

// Dynamically import Quill to avoid SSR issues
const Quill = dynamic(() => import('quill'), { ssr: false });

const CollaborativeEditor = ({ 
  mediaId, 
  userId, 
  username, 
  organizationId, 
  title, 
  createdBy,
  userRole = 'viewer', // 'viewer', 'reviewer', 'owner'
  initialContent = '', // Initial document content from backend
  permissions = null // User permissions for this document
}) => {
  const [socket, setSocket] = useState(null);
  const [quill, setQuill] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [version, setVersion] = useState(1);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [versionHistory, setVersionHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isQuillReady, setIsQuillReady] = useState(false);
  const [isDocumentLoading, setIsDocumentLoading] = useState(true);
  const [documentContent, setDocumentContent] = useState(initialContent);
  const [contentSource, setContentSource] = useState('none');  
  const editorRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const realTimeUpdateTimeoutRef = useRef(null);
  const cursorRefs = useRef(new Map());
  const lastContentRef = useRef(initialContent);

  // Check if we're on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Clear editor content when switching documents
  useEffect(() => {
    if (quill && isQuillReady) {
      // Clear editor content directly instead of calling function
      quill.setText('');
      lastContentRef.current = '';
      setDocumentContent('');
      console.log('🔄 Document changed, clearing editor content');
    }
  }, [mediaId, quill, isQuillReady]);

  // Fetch document content using the content extraction utility
  const fetchDocumentContent = useCallback(async (options = {}) => {
    if (!mediaId) return null;
    
    console.log('🔍 fetchDocumentContent called with mediaId:', mediaId);
    console.log('🔧 Options:', options);
    
    const result = await extractDocumentContent(mediaId, {
      useCache: true,
      useFilePreview: true,
      useMockDatabase: true,
      useWebSocket: false,
      ...options
    });
    
    console.log('📄 fetchDocumentContent result:', result);
    return result;
  }, [mediaId]);

  // Clear document content cache
  const clearDocumentCache = useCallback(() => {
    if (!mediaId) return;
    clearContentCache(mediaId);
  }, [mediaId]);

  // Clear editor content
  const clearEditorContent = useCallback(() => {
    if (quill) {
      quill.setText('');
      lastContentRef.current = '';
      setDocumentContent('');
      console.log('🗑️ Editor content cleared');
    }
  }, [quill]);

  // Refresh document content from server
  const refreshDocumentContent = useCallback(async () => {
    if (!mediaId || !quill) return;
    
    console.log('🔄 Refreshing document content from server...');
    clearDocumentCache(); // Clear cache to force fresh fetch
    
    const result = await fetchDocumentContent({ useCache: false }); // Force fresh fetch
    
    if (result && result.content && result.content.trim().length > 0) {
      try {
        const delta = quill.clipboard.convert(result.content);
        quill.setContents(delta);
        lastContentRef.current = result.content;
        setDocumentContent(result.content);
        
        if (result.hasRealContent) {
          console.log('✅ Document content refreshed successfully from:', result.source);
          showNotification(`Content refreshed from ${result.source}`, 'success');
          setContentSource(result.source);
        } else {
          console.log('⚠️ Only placeholder content available after refresh');
          showNotification('Only placeholder content available', 'info');
          setContentSource('placeholder');
        }
      } catch (error) {
        console.error('❌ Error refreshing content:', error);
        // Fallback to plain text
        quill.setText(result.content);
        lastContentRef.current = result.content;
        setDocumentContent(result.content);
        console.log('✅ Document content refreshed using fallback method');
      }
    }
  }, [mediaId, quill, fetchDocumentContent, clearDocumentCache]);

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!isClient) return;
    
    console.log('Initializing Socket.IO connection...');
    const newSocket = io('http://localhost:3001');
    
    newSocket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      setIsConnected(true);
    });
    
    newSocket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
      setIsConnected(false);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
      setIsConnected(false);
    });
    
    setSocket(newSocket);

    return () => {
      console.log('Cleaning up Socket.IO connection...');
      newSocket.disconnect();
    };
  }, [isClient]);

  // Initialize Quill editor
  useEffect(() => {
    if (!isClient || !editorRef.current) return;

    const initQuill = async () => {
      try {
        // Import Quill CSS
        await import('quill/dist/quill.snow.css');
        
        // Import Quill and cursors module
        const QuillModule = await import('quill');
        const QuillCursors = await import('quill-cursors');
        
        // Register cursors module
        console.log('Registering cursors module...');
        QuillModule.default.register('modules/cursors', QuillCursors.default);
        console.log('✅ Cursors module registered');

        const quillInstance = new QuillModule.default(editorRef.current, {
          theme: 'snow',
          modules: {
            toolbar: userRole !== 'viewer' ? [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['link', 'image'],
              ['clean']
            ] : false,
            cursors: true
          },
          readOnly: userRole === 'viewer',
          placeholder: '' // No placeholder text at all - only show real content
        });

                // Fetch and set document content immediately after Quill initialization
        const loadDocumentContent = async () => {
          const result = await fetchDocumentContent();
          
          if (result && result.content && result.content.trim().length > 0) {
            console.log('🚀 Setting fetched content in Quill editor...');
            console.log('📄 Content source:', result.source);
            console.log('📏 Content length:', result.content.length);
            
            try {
              const delta = quillInstance.clipboard.convert(result.content);
              quillInstance.setContents(delta);
              lastContentRef.current = result.content;
              setDocumentContent(result.content);
              setIsDocumentLoading(false);
              
              if (result.hasRealContent) {
                console.log('✅ Real document content loaded from:', result.source);
                setContentSource(result.source);
              } else {
                console.log('⚠️ Placeholder content loaded (no real content available)');
                setContentSource('placeholder');
              }
            } catch (error) {
              console.error('❌ Error setting fetched content:', error);
              // Fallback to plain text
              quillInstance.setText(result.content);
              lastContentRef.current = result.content;
              setDocumentContent(result.content);
              setIsDocumentLoading(false);
              console.log('✅ Document content loaded using fallback method');
            }
          } else {
            console.log('⚠️ No content fetched, waiting for WebSocket content...');
            setIsDocumentLoading(false);
          }
        };

        // Load content and then set Quill as ready
        await loadDocumentContent();
        
        setQuill(quillInstance);
        setIsQuillReady(true);
        console.log('✅ Quill editor initialized with content loaded');
        
        // Check if cursors module is available
        const cursorsModule = quillInstance.getModule('cursors');
        console.log('Cursors module available:', !!cursorsModule);
        if (cursorsModule) {
          console.log('Cursors module methods:', Object.getOwnPropertyNames(cursorsModule));
        }
      } catch (error) {
        console.error('Error initializing Quill:', error);
      }
    };

    initQuill();

    return () => {
      // Quill doesn't have a destroy method, just clean up the DOM
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      
      // Clear document cache when component unmounts
      if (mediaId) {
        const cacheKey = `doc_content_${mediaId}`;
        localStorage.removeItem(cacheKey);
        console.log('🗑️ Document content cache cleared on unmount');
      }
    };
  }, [isClient, userRole]);

  // Initialize editor with content when Quill is ready (only if no content already loaded)
  useEffect(() => {
    if (!quill || !isQuillReady || !isClient) return;

    console.log('🚀 === COLLABORATIVE EDITOR INIT DEBUG START ===');
    console.log('🔍 Current document content length:', documentContent?.length || 0);
    console.log('🔍 Initial content length:', initialContent?.length || 0);
    
    // Only set content if we don't already have content loaded
    if (!documentContent || documentContent.trim().length === 0) {
      if (initialContent && initialContent.trim().length > 0) {
        // Set the initial content in Quill editor
        try {
          console.log('🔍 Converting content to Quill delta...');
          const delta = quill.clipboard.convert(initialContent);
          console.log('✅ Delta created, setting content in Quill...');
          quill.setContents(delta);
          lastContentRef.current = initialContent;
          setDocumentContent(initialContent);
          setIsDocumentLoading(false);
          console.log('✅ Editor initialized with content from backend');
        } catch (error) {
          console.error('❌ Error setting initial content:', error);
          // Fallback to plain text
          console.log('🔍 Using fallback: plain text');
          try {
            quill.setText(initialContent);
            lastContentRef.current = initialContent;
            setDocumentContent(initialContent);
            setIsDocumentLoading(false);
            console.log('✅ Fallback text method successful');
          } catch (fallbackError) {
            console.error('❌ Fallback method also failed:', fallbackError);
            // Last resort: set empty content
            quill.setText('');
            lastContentRef.current = '';
            setDocumentContent('');
            setIsDocumentLoading(false);
            console.log('⚠️ Using empty content as last resort');
          }
        }
      } else {
        console.log('⚠️ No initial content, waiting for WebSocket or preview content...');
        setIsDocumentLoading(false);
      }
    } else {
      console.log('✅ Content already loaded, skipping initial content setup');
      setIsDocumentLoading(false);
    }
    
    console.log('🚀 === COLLABORATIVE EDITOR INIT DEBUG END ===');
  }, [quill, isQuillReady, initialContent, isClient, documentContent]);

  // Join document when socket and quill are ready
  useEffect(() => {
    if (!socket || !quill || !mediaId || !isClient || !isQuillReady) return;

    console.log('Joining document collaboration...', { mediaId, userId, username, organizationId });

    // Join document collaboration
    socket.emit('join-document', {
      mediaId,
      userId,
      username,
      organizationId,
      title,
      createdBy
    });

    // Handle document joined
    socket.on('document-joined', (data) => {
      console.log('📄 Document joined:', data);
      console.log('👥 Active users data:', data.activeUsers);
      console.log('📝 Initial content from props:', initialContent);
      setIsConnected(true);
      
      // Always try to load content from WebSocket first, then fallback to initialContent
      if (data.document && data.document.content && data.document.content.trim().length > 0) {
        console.log('Document content loaded from WebSocket, length:', data.document.content.length);
        console.log('📄 Content preview:', data.document.content.substring(0, 100) + '...');
        
        // Clear any existing placeholder text and set real content
        try {
          console.log('🔧 Applying WebSocket content to Quill editor...');
          console.log('📄 Content to apply:', data.document.content);
          console.log('📏 Content length:', data.document.content.length);
          
          const delta = quill.clipboard.convert(data.document.content);
          console.log('📄 Delta created:', delta);
          
          quill.setContents(delta);
          console.log('✅ setContents completed');
          
          // Update state
          lastContentRef.current = data.document.content;
          setDocumentContent(data.document.content);
          setVersion(data.document.version || 1);
          
          // Store in localStorage for future use
          cacheContent(mediaId, data.document.content);
          setContentSource('websocket');
          
          // Verify content was applied
          const currentContent = quill.getText();
          console.log('🔍 Current editor content after WebSocket load:', currentContent);
          console.log('🔍 Content length in editor:', currentContent.length);
          
          showNotification('Document loaded successfully', 'success');
        } catch (error) {
          console.error('Error setting WebSocket content:', error);
          console.log('🔧 Trying fallback method with setText...');
          
          // Fallback to plain text
          quill.setText(data.document.content);
          console.log('✅ setText completed');
          
          // Update state
          lastContentRef.current = data.document.content;
          setDocumentContent(data.document.content);
          
          // Store in localStorage
          cacheContent(mediaId, data.document.content);
          setContentSource('websocket');
          
          // Verify content was applied
          const currentContent = quill.getText();
          console.log('🔍 Current editor content after fallback:', currentContent);
          console.log('🔍 Content length in editor:', currentContent.length);
          
          showNotification('Document loaded successfully', 'success');
        }
      } else if (initialContent && initialContent.trim().length > 0) {
        console.log('Loading initial content from props, length:', initialContent.length);
        const delta = quill.clipboard.convert(initialContent);
        quill.setContents(delta);
        lastContentRef.current = initialContent;
        setDocumentContent(initialContent);
        showNotification('Document loaded from initial content', 'success');
      } else {
        console.log('No content available from WebSocket or props, trying content extraction utility...');
        
        // Use the content extraction utility as a fallback
        fetchDocumentContent().then(result => {
          if (result && result.content && result.content.trim().length > 0) {
            console.log('✅ Content fetched using extraction utility, source:', result.source, 'length:', result.content.length);
            
            try {
              const delta = quill.clipboard.convert(result.content);
              quill.setContents(delta);
              lastContentRef.current = result.content;
              setDocumentContent(result.content);
              
              if (result.hasRealContent) {
                showNotification(`Document loaded from ${result.source}`, 'success');
                setContentSource(result.source);
              } else {
                showNotification('Document loaded with placeholder content', 'info');
                setContentSource('placeholder');
              }
            } catch (error) {
              console.error('Error setting extracted content:', error);
              quill.setText(result.content);
              lastContentRef.current = result.content;
              setDocumentContent(result.content);
              
              if (result.hasRealContent) {
                showNotification(`Document loaded from ${result.source}`, 'success');
              } else {
                showNotification('Document loaded with placeholder content', 'info');
              }
            }
          } else {
            console.log('⚠️ No content available anywhere, editor will remain empty');
            quill.setText('');
            lastContentRef.current = '';
            setDocumentContent('');
          }
        }).catch(error => {
          console.error('Error fetching fallback content:', error);
          console.log('⚠️ No content available anywhere, editor will remain empty');
          quill.setText('');
          lastContentRef.current = '';
          setDocumentContent('');
        });
      }
      
      // Ensure unique users in activeUsers
      if (data.activeUsers && Array.isArray(data.activeUsers)) {
        const uniqueUsers = data.activeUsers.filter((user, index, self) => 
          index === self.findIndex(u => u.userId === user.userId)
        );
        console.log('📋 Setting active users from document-joined:', uniqueUsers);
        setActiveUsers(uniqueUsers);
      } else {
        console.log('⚠️ No active users data in document-joined event');
        setActiveUsers([]);
      }
      setIsDocumentLoading(false);
    });

    // Handle document updates
    socket.on('document-updated', (data) => {
      if (data.userId !== userId) {
        console.log('Received remote update:', data);
        
        // Apply remote changes
        try {
          const delta = quill.clipboard.convert(data.content);
          quill.setContents(delta);
          lastContentRef.current = data.content;
          setDocumentContent(data.content);
          setVersion(data.version);
          showNotification(`Document updated by ${data.username || 'another user'}`, 'info');
        } catch (error) {
          console.error('Error applying remote update:', error);
        }
      }
    });

    // Handle real-time text updates from other users
    socket.on('real-time-text-update', (data) => {
      if (data.userId !== userId) {
        try {
          const { content, operation, username } = data;
          
          console.log(`📝 Received real-time update from ${username}, content length: ${content.length}`);
          
          // Set flag to prevent local change detection during remote update
          window.isApplyingRemoteUpdate = true;
          
          // Apply the operation to the editor
          if (operation && operation.type && typeof operation.position === 'number') {
            console.log(`🔧 Applying operation:`, operation);
            applyRemoteOperation(operation);
          } else {
            // Fallback: set content directly
            console.log(`📝 Setting content directly, length: ${content.length}`);
            const currentContent = quill.getText();
            if (currentContent !== content) {
              quill.setText(content);
              lastContentRef.current = content;
              setDocumentContent(content);
            }
          }
          
          // Clear the flag after a short delay
          setTimeout(() => {
            window.isApplyingRemoteUpdate = false;
          }, 100);
          
          // Update typing indicator
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.add(username);
            return newSet;
          });
          
          // Clear typing indicator after delay
          setTimeout(() => {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(username);
              return newSet;
            });
          }, 2000);
          
        } catch (error) {
          console.error('Error handling real-time update:', error);
          window.isApplyingRemoteUpdate = false;
        }
      }
    });

    // Handle document saved events
    socket.on('document-saved', (data) => {
      try {
        const { username, version, saveType } = data;
        console.log(`💾 Document saved by ${username}, version: ${version}, type: ${saveType}`);
        
        // Update local version
        setVersion(version);
        
        // Show save notification
        if (saveType === 'manual') {
          // You can add a toast notification here
          console.log(`✅ Document saved successfully by ${username}`);
        }
      } catch (error) {
        console.error('Error handling document saved:', error);
      }
    });

    // Handle user typing events
    socket.on('user-typing', (data) => {
      try {
        const { username, isTyping } = data;
        
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          if (isTyping) {
            newSet.add(username);
          } else {
            newSet.delete(username);
          }
          return newSet;
        });
      } catch (error) {
        console.error('Error handling user typing:', error);
      }
    });

    // Handle user cursor updates
    socket.on('user-cursor-updated', (data) => {
      try {
        const { userId, username, cursor, color } = data;
        
        // Update cursor for remote user
        if (cursorRefs.current.has(userId)) {
          const cursorElement = cursorRefs.current.get(userId);
          cursorElement.style.left = `${cursor.x}px`;
          cursorElement.style.top = `${cursor.y}px`;
        } else {
          // Create new cursor element
          createRemoteCursor(userId, username, cursor, color);
        }
      } catch (error) {
        console.error('Error handling cursor update:', error);
      }
    });

    // Handle document rollback events
    socket.on('document-rollback', (data) => {
      try {
        const { document, targetVersion } = data;
        console.log(`🔄 Document rolled back to version ${targetVersion}`);
        
        // Update editor content
        if (quill && document.content) {
          quill.setText(document.content);
          setVersion(targetVersion + 1);
        }
      } catch (error) {
        console.error('Error handling document rollback:', error);
      }
    });

    // Handle user joined
    socket.on('user-joined', (user) => {
      console.log('👤 User joined:', user);
      setActiveUsers(prev => {
        // Check if user already exists
        const userExists = prev.some(existingUser => existingUser.userId === user.userId);
        if (userExists) {
          console.log('⚠️ User already exists in activeUsers:', user.userId);
          return prev;
        }
        console.log('✅ Adding new user to activeUsers:', user.userId);
        const newUsers = [...prev, user];
        console.log('📋 Updated activeUsers:', newUsers);
        return newUsers;
      });
      showUserJoinedNotification(user.username);
    });

    // Handle user left
    socket.on('user-left', (user) => {
      console.log('👤 User left:', user);
      setActiveUsers(prev => {
        const filteredUsers = prev.filter(u => u.userId !== user.userId);
        console.log('📋 Updated activeUsers after user left:', filteredUsers);
        return filteredUsers;
      });
      showUserLeftNotification(user.username);
    });

    // Handle cursor updates
    socket.on('user-cursor-updated', (data) => {
      updateRemoteCursor(data);
    });

    // Handle typing status
    socket.on('user-typing', (data) => {
      if (data.isTyping) {
        setTypingUsers(prev => new Set([...prev, data.username]));
      } else {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.username);
          return newSet;
        });
      }
    });

    // Handle version history
    socket.on('version-history', (data) => {
      console.log('📋 Version history received:', data.history);
      // Ensure unique versions by filtering duplicates
      const uniqueHistory = data.history.filter((version, index, self) => 
        index === self.findIndex(v => v.version === version.version && v.editedAt === version.editedAt)
      );
      console.log('✅ Unique version history:', uniqueHistory);
      setVersionHistory(uniqueHistory);
    });

    // Handle document saved
    socket.on('document-saved', (data) => {
      console.log('✅ Document saved:', data);
      showNotification(`Document saved successfully by ${data.editorName || 'Unknown'}`, 'success');
      
      // Update version history if we have the new version info
      if (data.versionId) {
        setVersionHistory(prev => {
          const newVersion = {
            _id: data.versionId,
            version: data.version,
            editedBy: data.editedBy,
            editorName: data.editorName,
            editedAt: data.editedAt,
            commitMessage: data.commitMessage
          };
          
          // Add new version to the beginning of the list
          return [newVersion, ...prev];
        });
      }
    });

    // Handle document rollback
    socket.on('document-rollback', (data) => {
      console.log('Document rolled back:', data);
      const delta = quill.clipboard.convert(data.document.content);
      quill.setContents(delta);
      lastContentRef.current = data.document.content;
      setDocumentContent(data.document.content);
      setVersion(data.document.version);
      showNotification('Document rolled back to version ' + data.targetVersion);
    });

    // Handle errors
    socket.on('error', (data) => {
      console.error('Socket error:', data);
      
      // Only show notification and disconnect for critical errors
      if (data && data.message && data.message.includes('critical')) {
        showNotification('Error: ' + data.message, 'error');
        setIsConnected(false);
      } else {
        // For non-critical errors, just log them
        console.log('Non-critical socket error:', data);
      }
    });

    // Handle document not found or access denied
    socket.on('document-access-denied', (data) => {
      console.error('Document access denied:', data);
      showNotification('Access denied: ' + data.message, 'error');
      setIsConnected(false);
    });

    return () => {
      socket.off('document-joined');
      socket.off('document-updated');
      socket.off('real-time-text-update');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('user-cursor-updated');
      socket.off('user-typing');
      socket.off('version-history');
      socket.off('document-saved');
      socket.off('document-rollback');
      socket.off('error');
      socket.off('document-access-denied');
    };
  }, [socket, quill, mediaId, userId, username, organizationId, title, createdBy, isClient, isQuillReady, initialContent]);

  // Handle Quill text changes
  useEffect(() => {
    if (!quill || !socket || userRole === 'viewer' || !isClient || !isQuillReady) return;

    const handleTextChange = (delta, oldDelta, source) => {
      if (source === 'user') {
        // Skip if we're currently applying a remote update
        if (window.isApplyingRemoteUpdate) {
          console.log('Skipping local text change - applying remote update');
          return;
        }
        
        console.log('Text change detected:', { delta, oldDelta, source });
        
        // Get current content
        const currentContent = quill.getText();
        
        // Only send if content actually changed
        if (currentContent !== lastContentRef.current) {
          // Create operation based on the change for real-time collaboration
          let operation = null;
          
          if (delta.ops && delta.ops.length > 0) {
            const op = delta.ops[0];
            if (op.insert) {
              operation = {
                id: Date.now().toString(),
                type: 'insert',
                position: quill.getSelection()?.index || 0,
                text: op.insert,
                timestamp: Date.now()
              };
            } else if (op.delete) {
              operation = {
                id: Date.now().toString(),
                type: 'delete',
                position: quill.getSelection()?.index || 0,
                length: op.delete,
                timestamp: Date.now()
              };
            }
          }
          
          // Send real-time text update to other users with debouncing
          if (realTimeUpdateTimeoutRef.current) {
            clearTimeout(realTimeUpdateTimeoutRef.current);
          }
          
          realTimeUpdateTimeoutRef.current = setTimeout(() => {
            console.log('Sending real-time text update, length:', currentContent.length, 'operation:', operation);
            socket.emit('real-time-text-update', {
              mediaId,
              userId,
              content: currentContent,
              timestamp: Date.now(),
              operation: operation
            });
          }, 100); // 100ms debounce
          
          // Update last content reference
          lastContentRef.current = currentContent;
          setDocumentContent(currentContent);
          
          // Update localStorage cache with new content
          const cacheKey = `doc_content_${mediaId}`;
          localStorage.setItem(cacheKey, currentContent);
          console.log('💾 Document content cache updated');
        }

        // Update typing status
        setIsTyping(true);
        socket.emit('typing-status', { isTyping: true });

        // Clear typing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Set typing timeout
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          socket.emit('typing-status', { isTyping: false });
        }, 1000);
      }
    };

    const handleSelectionChange = (range) => {
      if (range && socket) {
        socket.emit('cursor-update', {
          cursor: {
            position: range.index,
            selection: {
              start: range.index,
              end: range.index + (range.length || 0)
            }
          }
        });
      }
    };

    quill.on('text-change', handleTextChange);
    quill.on('selection-change', handleSelectionChange);

    return () => {
      quill.off('text-change', handleTextChange);
      quill.off('selection-change', handleSelectionChange);
      
      // Clear timeouts
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (realTimeUpdateTimeoutRef.current) {
        clearTimeout(realTimeUpdateTimeoutRef.current);
      }
    };
  }, [quill, socket, mediaId, userId, userRole, isClient, isQuillReady]);

  // Update remote cursor
  const updateRemoteCursor = useCallback((data) => {
    if (!quill || data.userId === userId || !isClient || !isQuillReady) return;

    console.log('🖱️ Updating remote cursor with data:', data);
    
    try {
      const cursorsModule = quill.getModule('cursors');
      if (!cursorsModule) {
        console.warn('Cursors module not available');
        return;
      }
      
      // Check if cursor data has the expected structure
      if (!data.cursor || !data.cursor.position) {
        console.warn('Invalid cursor data structure:', data);
        return;
      }

      // Remove existing cursor
      if (cursorRefs.current.has(data.userId)) {
        cursorsModule.removeCursor(data.userId);
        cursorRefs.current.delete(data.userId);
      }

      // Add new cursor
      console.log('Creating cursor for user:', data.userId, 'with data:', data);
      const cursor = cursorsModule.createCursor(data.userId, data.username, data.color);
      console.log('Cursor created:', cursor);
      
      if (cursor && typeof cursor.setPosition === 'function') {
        console.log('Setting cursor position:', data.cursor.position);
        cursor.setPosition(data.cursor.position);
        cursorRefs.current.set(data.userId, cursor);
      } else {
        console.warn('Cursor object is invalid or missing setPosition method:', cursor);
        console.log('Available cursor methods:', cursor ? Object.getOwnPropertyNames(cursor) : 'cursor is null/undefined');
      }
    } catch (error) {
      console.error('Error updating cursor:', error);
    }
  }, [quill, userId, isClient, isQuillReady]);

  // Save document
  const handleSave = () => {
    if (socket) {
      // Get current content for change summary
      const currentContent = quill ? quill.getText() : '';
      const contentLength = currentContent.length;
      
      // Create a simple change summary
      const changeSummary = `Document updated - ${contentLength} characters`;
      
      socket.emit('save-document', { 
        mediaId,
        changeSummary 
      });
      
      showNotification('Saving document...', 'info');
    } else {
      showNotification('Not connected to server', 'error');
    }
  };

  // Get version history
  const handleGetHistory = () => {
    if (socket) {
      socket.emit('get-version-history', { mediaId });
      setShowHistory(true);
    }
  };

  // Rollback to version
  const handleRollback = (targetVersion) => {
    if (socket && userRole !== 'viewer') {
      socket.emit('rollback-version', { mediaId, targetVersion });
      setShowHistory(false);
    }
  };

  // Notifications
  const showNotification = (message, type = 'info') => {
    // Simple notification - you can replace with a proper toast library
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Show notification in UI
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 ${
      type === 'error' ? 'bg-red-500 text-white' : 
      type === 'success' ? 'bg-green-500 text-white' : 
      'bg-blue-500 text-white'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  };

  const showUserJoinedNotification = (username) => {
    showNotification(`${username} joined the document`);
  };

  const showUserLeftNotification = (username) => {
    showNotification(`${username} left the document`);
  };

  // NEW METHOD: Apply remote operation to editor
  const applyRemoteOperation = (operation) => {
    try {
      if (!quill) return;
      
      const { type, position, text, length } = operation;
      
      switch (type) {
        case 'insert':
          quill.insertText(position, text);
          break;
        case 'delete':
          quill.deleteText(position, length);
          break;
        case 'replace':
          quill.deleteText(position, length);
          quill.insertText(position, text);
          break;
        default:
          console.log(`⚠️ Unknown operation type: ${type}`);
      }
    } catch (error) {
      console.error('Error applying remote operation:', error);
    }
  };

  // NEW METHOD: Create remote cursor element
  const createRemoteCursor = (userId, username, cursor, color) => {
    try {
      const cursorElement = document.createElement('div');
      cursorElement.className = 'remote-cursor';
      cursorElement.style.position = 'absolute';
      cursorElement.style.left = `${cursor.x}px`;
      cursorElement.style.top = `${cursor.y}px`;
      cursorElement.style.width = '2px';
      cursorElement.style.height = '20px';
      cursorElement.style.backgroundColor = color;
      cursorElement.style.zIndex = '1000';
      cursorElement.style.pointerEvents = 'none';
      
      // Add username label
      const label = document.createElement('div');
      label.className = 'cursor-label';
      label.textContent = username;
      label.style.position = 'absolute';
      label.style.top = '-20px';
      label.style.left = '0';
      label.style.backgroundColor = color;
      label.style.color = 'white';
      label.style.padding = '2px 6px';
      label.style.borderRadius = '3px';
      label.style.fontSize = '12px';
      label.style.whiteSpace = 'nowrap';
      
      cursorElement.appendChild(label);
      
      // Add to editor container
      if (editorRef.current) {
        editorRef.current.appendChild(cursorElement);
        cursorRefs.current.set(userId, cursorElement);
      }
    } catch (error) {
      console.error('Error creating remote cursor:', error);
    }
  };

  // Send real-time text updates
  const sendRealTimeUpdate = useCallback((content, operation = null) => {
    if (!socket || !isConnected) {
      console.log('Socket not connected, skipping real-time update');
      return;
    }
    
    try {
      socket.emit('real-time-text-update', {
        mediaId,
        userId,
        content,
        timestamp: Date.now(),
        operation
      });
    } catch (error) {
      console.error('Error sending real-time update:', error);
    }
  }, [socket, isConnected, mediaId, userId]);

  // Show loading state while client-side rendering
  if (!isClient) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </div>
        <div className="flex-1 bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading collaborative editor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
              {isDocumentLoading && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm text-blue-600">Loading document content...</span>
                </div>
              )}
              
              {/* Content source indicator */}
              {!isDocumentLoading && documentContent && documentContent.trim().length > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    Content from: <span className="font-medium text-blue-600">{contentSource}</span>
                  </span>
                </div>
              )}
              
              {/* No content indicator */}
              {!isDocumentLoading && (!documentContent || documentContent.trim().length === 0) && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">No content available</span>
                </div>
              )}
              {typingUsers.size > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="text-sm text-blue-600">
                    {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Active users */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">Active: {activeUsers.length}</span>
              {activeUsers.map((user, index) => (
                <div
                  key={`${user.userId}-${index}`}
                  className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-full"
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: user.color }}
                  ></div>
                  <span className="text-xs text-gray-700">{user.username}</span>
                  {typingUsers.has(user.username) && (
                    <span className="text-xs text-blue-600 animate-pulse">typing...</span>
                  )}
                </div>
              ))}
              {activeUsers.length === 0 && (
                <span className="text-xs text-gray-400">No other users</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={refreshDocumentContent}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                title="Refresh document content from server"
              >
                🔄 Refresh
              </button>
              
              <button
                onClick={() => {
                  const stats = getContentStats();
                  console.log('📊 Content Statistics:', stats);
                  showNotification(`Cache: ${stats.cachedDocuments} docs, ${Math.round(stats.totalContentSize / 1024)}KB total`, 'info');
                }}
                className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                title="Show content cache statistics"
              >
                📊 Stats
              </button>
              
              <button
                onClick={() => {
                  const debug = debugLocalStorage();
                  console.log('🔍 localStorage Debug:', debug);
                  showNotification('localStorage debug info logged to console', 'info');
                }}
                className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
                title="Debug localStorage content"
              >
                🔍 Debug
              </button>
              
              <button
                onClick={async () => {
                  console.log('🧪 Testing content extraction for mediaId:', mediaId);
                  const result = await extractDocumentContent(mediaId, {
                    useCache: true,
                    useFilePreview: false,
                    useMockDatabase: false,
                    useWebSocket: false
                  });
                  console.log('🧪 Test result:', result);
                  showNotification(`Test: ${result.source} - ${result.content?.substring(0, 50)}...`, 'info');
                  
                  // Also try to apply the content to the editor
                  if (result.content && quill) {
                    console.log('🧪 Applying test content to editor...');
                    try {
                      const delta = quill.clipboard.convert(result.content);
                      quill.setContents(delta);
                      lastContentRef.current = result.content;
                      setDocumentContent(result.content);
                      setContentSource(result.source);
                      console.log('✅ Test content applied to editor successfully');
                      showNotification('Test content applied to editor!', 'success');
                    } catch (error) {
                      console.error('❌ Error applying test content:', error);
                      showNotification('Error applying test content', 'error');
                    }
                  }
                }}
                className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                title="Test content extraction and apply to editor"
              >
                🧪 Test
              </button>
              
              <button
                onClick={async () => {
                  console.log('⚡ Force loading content for mediaId:', mediaId);
                  console.log('🔍 Quill instance available:', !!quill);
                  console.log('🔍 Editor ref available:', !!editorRef.current);
                  
                  if (quill) {
                    const result = await extractDocumentContent(mediaId, {
                      useCache: true,
                      useFilePreview: true,
                      useMockDatabase: true,
                      useWebSocket: false
                    });
                    
                    if (result.content) {
                      console.log('⚡ Force loading content:', result.content);
                      console.log('📏 Content length:', result.content.length);
                      console.log('🔍 Content type:', typeof result.content);
                      
                      try {
                        // Try multiple methods to set content
                        console.log('🔧 Method 1: Using clipboard.convert and setContents...');
                        const delta = quill.clipboard.convert(result.content);
                        console.log('📄 Delta created:', delta);
                        quill.setContents(delta);
                        console.log('✅ setContents completed');
                        
                        // Update state
                        lastContentRef.current = result.content;
                        setDocumentContent(result.content);
                        setContentSource(result.source);
                        setIsDocumentLoading(false);
                        
                        // Verify content was set
                        const currentContent = quill.getText();
                        console.log('🔍 Current editor content after setContents:', currentContent);
                        console.log('🔍 Content length in editor:', currentContent.length);
                        
                        console.log('✅ Content force loaded successfully');
                        showNotification(`Content loaded from ${result.source}!`, 'success');
                      } catch (error) {
                        console.error('❌ Error with setContents method:', error);
                        
                        // Try fallback method
                        try {
                          console.log('🔧 Method 2: Using setText fallback...');
                          quill.setText(result.content);
                          console.log('✅ setText completed');
                          
                          // Update state
                          lastContentRef.current = result.content;
                          setDocumentContent(result.content);
                          setContentSource(result.source);
                          setIsDocumentLoading(false);
                          
                          // Verify content was set
                          const currentContent = quill.getText();
                          console.log('🔍 Current editor content after setText:', currentContent);
                          console.log('🔍 Content length in editor:', currentContent.length);
                          
                          showNotification(`Content loaded using fallback method!`, 'success');
                        } catch (fallbackError) {
                          console.error('❌ Error with setText fallback:', fallbackError);
                          showNotification('All content loading methods failed', 'error');
                        }
                      }
                    } else {
                      console.log('⚠️ No content in result:', result);
                      showNotification('No content found to load', 'warning');
                    }
                  } else {
                    console.log('❌ Quill instance not available');
                    showNotification('Editor not ready', 'error');
                  }
                }}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                title="Force load content from all sources"
              >
                ⚡ Force Load
              </button>
              
              <button
                onClick={() => {
                  console.log('🔍 === EDITOR STATE CHECK ===');
                  console.log('🔍 Quill instance:', quill);
                  console.log('🔍 Editor ref:', editorRef.current);
                  console.log('🔍 isQuillReady:', isQuillReady);
                  console.log('🔍 isDocumentLoading:', isDocumentLoading);
                  console.log('🔍 documentContent length:', documentContent?.length);
                  console.log('🔍 contentSource:', contentSource);
                  
                  if (quill) {
                    try {
                      const text = quill.getText();
                      const html = quill.root.innerHTML;
                      const contents = quill.getContents();
                      
                      console.log('🔍 Quill.getText():', text);
                      console.log('🔍 Quill.getText() length:', text.length);
                      console.log('🔍 Quill.root.innerHTML:', html);
                      console.log('🔍 Quill.getContents():', contents);
                      
                      showNotification(`Editor text: "${text.substring(0, 50)}..." (${text.length} chars)`, 'info');
                    } catch (error) {
                      console.error('❌ Error checking Quill state:', error);
                      showNotification('Error checking editor state', 'error');
                    }
                  } else {
                    console.log('❌ Quill instance not available');
                    showNotification('Editor not ready', 'error');
                  }
                  console.log('🔍 === END EDITOR STATE CHECK ===');
                }}
                className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                title="Check current editor state"
              >
                🔍 Check Editor
              </button>
              
              <button
                onClick={async () => {
                  console.log('🔄 Reinitializing Quill editor...');
                  if (editorRef.current) {
                    // Clear the editor
                    editorRef.current.innerHTML = '';
                    
                    // Reinitialize Quill
                    try {
                      await import('quill/dist/quill.snow.css');
                      const QuillModule = await import('quill');
                      const QuillCursors = await import('quill-cursors');
                      
                      QuillModule.default.register('modules/cursors', QuillCursors.default);
                      
                      const newQuill = new QuillModule.default(editorRef.current, {
                        theme: 'snow',
                        modules: {
                          toolbar: userRole !== 'viewer' ? [
                            [{ 'header': [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline'],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            ['link', 'image'],
                            ['clean']
                          ] : false,
                          cursors: true
                        },
                        readOnly: userRole === 'viewer',
                        placeholder: ''
                      });
                      
                      setQuill(newQuill);
                      setIsQuillReady(true);
                      console.log('✅ Quill reinitialized successfully');
                      showNotification('Editor reinitialized!', 'success');
                      
                      // Try to load content again
                      if (documentContent) {
                        console.log('🔄 Loading existing content into reinitialized editor...');
                        try {
                          newQuill.setText(documentContent);
                          console.log('✅ Content loaded into reinitialized editor');
                        } catch (error) {
                          console.error('❌ Error loading content into reinitialized editor:', error);
                        }
                      }
                    } catch (error) {
                      console.error('❌ Error reinitializing Quill:', error);
                      showNotification('Failed to reinitialize editor', 'error');
                    }
                  }
                }}
                className="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700"
                title="Reinitialize Quill editor"
              >
                🔄 Reinit
              </button>
              
              <button
                onClick={() => {
                  console.log('🔄 Syncing Quill editor with current state...');
                  if (quill && documentContent) {
                    try {
                      console.log('📄 Syncing content:', documentContent);
                      console.log('📏 Content length:', documentContent.length);
                      
                      // Try setContents first
                      try {
                        const delta = quill.clipboard.convert(documentContent);
                        quill.setContents(delta);
                        console.log('✅ setContents sync completed');
                      } catch (setContentsError) {
                        console.log('⚠️ setContents failed, trying setText...');
                        quill.setText(documentContent);
                        console.log('✅ setText sync completed');
                      }
                      
                      // Verify sync
                      const currentContent = quill.getText();
                      console.log('🔍 Editor content after sync:', currentContent);
                      console.log('🔍 Content length in editor:', currentContent.length);
                      
                      if (currentContent === documentContent) {
                        console.log('✅ Sync successful - content matches');
                        showNotification('Editor synced successfully!', 'success');
                      } else {
                        console.log('⚠️ Sync failed - content mismatch');
                        showNotification('Sync failed - content mismatch', 'warning');
                      }
                    } catch (error) {
                      console.error('❌ Error syncing editor:', error);
                      showNotification('Error syncing editor', 'error');
                    }
                  } else {
                    console.log('❌ Cannot sync: quill or documentContent not available');
                    showNotification('Cannot sync - editor not ready', 'error');
                  }
                }}
                className="px-3 py-1 bg-pink-600 text-white text-sm rounded hover:bg-pink-700"
                title="Sync Quill editor with current state"
              >
                🔄 Sync
              </button>
              
              {userRole !== 'viewer' && (
                <button
                  onClick={handleSave}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Save
                </button>
              )}
              <button
                onClick={handleGetHistory}
                className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
              >
                History
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Content Display */}
      <div className="bg-gray-100 p-2 border-t">
        <div className="text-xs text-gray-600">
          <strong>Debug Info:</strong> 
          Content Length: {documentContent?.length || 0} | 
          Source: {contentSource} | 
          Loading: {isDocumentLoading ? 'Yes' : 'No'} |
          Quill Ready: {isQuillReady ? 'Yes' : 'No'}
        </div>
        {documentContent && (
          <div className="text-xs text-gray-800 mt-1 p-2 bg-white border rounded">
            <strong>Content Preview:</strong> {documentContent.substring(0, 100)}...
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 bg-white relative">
        <div ref={editorRef} className="h-full" />
        
        {/* Empty state message */}
        {!isDocumentLoading && (!documentContent || documentContent.trim().length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-lg font-medium">No document content</p>
              <p className="text-sm">Content will appear here when loaded</p>
            </div>
          </div>
        )}
      </div>

      {/* Version History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Version History</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2">
              {versionHistory.map((version, index) => (
                <div
                  key={`${version.version}-${version.editedAt}-${index}`}
                  className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">Version {version.version}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(version.editedAt).toLocaleString()}
                    </div>
                    <div className="text-sm text-blue-600 font-medium">
                      By: {version.editorName || 'Unknown User'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {version.commitMessage}
                    </div>
                  </div>
                  {userRole !== 'viewer' && (
                    <button
                      onClick={() => handleRollback(version.version)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      Rollback
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaborativeEditor;