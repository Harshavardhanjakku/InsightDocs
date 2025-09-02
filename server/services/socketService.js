const { Server } = require('socket.io');
const collaborationService = require('./collaborationService');
const pool = require('../config/db');

// Import media files from simple-server
let mediaFiles = [];
let organizationUsers = [];
let organizationInvites = [];

class SocketService {
  constructor() {
    this.io = null;
  }

  // Method to set media files from simple-server
  setMediaFiles(files) {
    mediaFiles = files;
  }

  // Method to set organization data from simple-server
  setOrganizationData(users, invites) {
    organizationUsers = users;
    organizationInvites = invites;
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.setupEventHandlers();
    console.log('✅ Socket.IO server initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 User connected: ${socket.id}`);

      // Join document collaboration
      socket.on('join-document', async (data) => {
        try {
          const { mediaId, userId, username, organizationId, title, createdBy } = data;
          
          console.log(`🔍 User ${username} (${userId}) trying to join document ${mediaId} in org ${organizationId}`);
          console.log(`📋 Join document data:`, { mediaId, userId, username, organizationId, title, createdBy });
          
          // Check if user has access to this document using database instead of global array
          let hasAccess = false;
          let userRole = 'viewer';
          let targetOrganizationId = organizationId;
          
          // First check if document exists in user's current organization
          const mediaFile = mediaFiles.find(m => m.id === mediaId && m.organization_id === organizationId);
          
          if (mediaFile) {
            hasAccess = true;
            console.log(`✅ User ${username} has direct access to document in their organization`);
            
            // Get user's role in their organization
            const orgUser = organizationUsers.find(ou => 
              ou.organization_id === organizationId && 
              ou.user_id === userId
            );
            userRole = orgUser?.role || 'viewer';
          } else {
            // Check if user is invited to collaborate on this document from another organization
            const mediaFileOther = mediaFiles.find(m => m.id === mediaId);
            
            if (mediaFileOther) {
              // Check for invitation
              const invite = organizationInvites.find(inv => 
                inv.invited_user_id === userId && 
                inv.organization_id === mediaFileOther.organization_id &&
                inv.status === 'accepted'
              );
              
              if (invite) {
                hasAccess = true;
                userRole = invite.role || 'viewer';
                targetOrganizationId = mediaFileOther.organization_id;
                console.log(`✅ User ${username} has access via invitation with role: ${userRole}`);
              } else {
                console.log(`❌ User ${username} not invited to organization ${mediaFileOther.organization_id}`);
              }
            }
          }
          
          if (!hasAccess) {
            console.log(`❌ Access denied for user ${username} to document ${mediaId}`);
            socket.emit('document-access-denied', { 
              message: 'Document not found or access denied' 
            });
            return;
          }
          
          console.log(`✅ User ${username} has access to document ${mediaId}`);
          
          // Initialize document if needed
          const documentData = await collaborationService.initializeDocument(mediaId, userId, username);
          
          // Join document session
          const result = await collaborationService.joinDocument(socket.id, userId, username, mediaId);
          
          // Join socket room
          socket.join(mediaId);
          
          // Send current document state with proper content
          socket.emit('document-joined', {
            document: {
              content: documentData.content || '',
              version: documentData.version || 1
            },
            activeUsers: documentData.activeUsers || []
          });
          
          // Notify other users
          socket.to(mediaId).emit('user-joined', {
            userId,
            username,
            color: collaborationService.getUserColor(userId)
          });
          
          console.log(`👥 User ${username} joined document ${mediaId}`);
        } catch (error) {
          console.error('Error joining document:', error);
          socket.emit('error', { message: 'Failed to join document: ' + error.message });
        }
      });

      // Handle real-time text updates
      socket.on('real-time-text-update', async (data) => {
        try {
          const { mediaId, userId, content, timestamp, operation } = data;
          
          // Get user session to include username
          const session = collaborationService.userSessions.get(socket.id);
          if (!session) {
            console.error('No user session found for socket:', socket.id);
            return;
          }
          
          console.log(`📝 Real-time text update from user ${session.username} in document ${mediaId}, content length: ${content.length}`);
          
          // Check if we have a valid operation
          if (operation && operation.type && typeof operation.position === 'number') {
            // Apply operational transform to handle concurrent edits
            const transformedOperation = await collaborationService.applyOperation(mediaId, operation, userId);
            
            if (transformedOperation) {
              // Broadcast transformed operation to all other users in the document
              socket.to(mediaId).emit('real-time-text-update', {
                mediaId,
                userId,
                content: transformedOperation.content,
                timestamp,
                username: session.username,
                operation: transformedOperation.operation
              });
              
              console.log(`✅ Transformed real-time text update broadcasted for document ${mediaId}`);
            } else {
              console.log(`⚠️ Operation transformation failed for document ${mediaId}`);
              // Fallback: broadcast content directly without operation
              socket.to(mediaId).emit('real-time-text-update', {
                mediaId,
                userId,
                content: content,
                timestamp,
                username: session.username
              });
            }
          } else {
            // No valid operation, just broadcast content directly
            console.log(`📝 Broadcasting content directly (no operation) for document ${mediaId}`);
            socket.to(mediaId).emit('real-time-text-update', {
              mediaId,
              userId,
              content: content,
              timestamp,
              username: session.username
            });
          }
        } catch (error) {
          console.error('Error handling real-time text update:', error);
          // Don't emit error to client, just log it
          // socket.emit('error', { message: 'Failed to process real-time update: ' + error.message });
        }
      });

      // Handle document changes (for saving and version control)
      socket.on('document-change', async (data) => {
        try {
          const { mediaId, userId, content, version, saveType = 'auto' } = data;
          
          // Get user session to include username
          const session = collaborationService.userSessions.get(socket.id);
          if (!session) {
            console.error('No user session found for socket:', socket.id);
            return;
          }
          
          console.log(`💾 Document change from user ${session.username} in document ${mediaId}, save type: ${saveType}`);
          
          // Save document change to database
          const savedDocument = await collaborationService.saveDocumentChange(mediaId, content, version, userId, saveType);
          
          if (savedDocument) {
            // Broadcast document saved event to all users in the document
            this.io.to(mediaId).emit('document-saved', {
              mediaId,
              userId,
              username: session.username,
              version: savedDocument.version,
              timestamp: savedDocument.timestamp,
              saveType
            });
            
            console.log(`✅ Document change saved and broadcasted for document ${mediaId}`);
          } else {
            console.log(`⚠️ Document change save failed for document ${mediaId}`);
            socket.emit('error', { message: 'Failed to save document change' });
          }
        } catch (error) {
          console.error('Error handling document change:', error);
          socket.emit('error', { message: 'Failed to save document: ' + error.message });
        }
      });

      // Update cursor position
      socket.on('cursor-update', async (data) => {
        try {
          const { cursor } = data;
          await collaborationService.updateCursor(socket.id, cursor);
          
          // Broadcast cursor update to other users
          const session = collaborationService.userSessions.get(socket.id);
          if (session) {
            socket.to(session.mediaId).emit('user-cursor-updated', {
              userId: session.userId,
              username: session.username,
              cursor,
              color: collaborationService.getUserColor(session.userId)
            });
          }
        } catch (error) {
          console.error('Error updating cursor:', error);
        }
      });

      // Update typing status
      socket.on('typing-status', async (data) => {
        try {
          const { isTyping } = data;
          await collaborationService.updateTypingStatus(socket.id, isTyping);
          
          // Broadcast typing status to other users
          const session = collaborationService.userSessions.get(socket.id);
          if (session) {
            socket.to(session.mediaId).emit('user-typing', {
              userId: session.userId,
              username: session.username,
              isTyping
            });
          }
        } catch (error) {
          console.error('Error updating typing status:', error);
        }
      });

      // Request version history
      socket.on('get-version-history', async (data) => {
        try {
          const { mediaId } = data;
          const history = await collaborationService.getVersionHistory(mediaId);
          socket.emit('version-history', { history });
        } catch (error) {
          console.error('Error getting version history:', error);
          socket.emit('error', { message: 'Failed to get version history' });
        }
      });

      // Rollback to version
      socket.on('rollback-version', async (data) => {
        try {
          const { mediaId, targetVersion } = data;
          const document = await collaborationService.rollbackToVersion(mediaId, targetVersion);
          
          // Broadcast rollback to all users
          this.io.to(mediaId).emit('document-rollback', {
            document,
            targetVersion
          });
        } catch (error) {
          console.error('Error rolling back version:', error);
          socket.emit('error', { message: 'Failed to rollback version: ' + error.message });
        }
      });

      // Save document
      socket.on('save-document', async (data) => {
        try {
          const { mediaId, changeSummary } = data;
          
          // Get user session to include user info
          const session = collaborationService.userSessions.get(socket.id);
          if (!session) {
            console.error('No user session found for socket:', socket.id);
            socket.emit('error', { message: 'No active session found' });
            return;
          }
          
          console.log(`💾 User ${session.username} saving document ${mediaId}`);
          
          // Save document with author information
          const saveResult = await collaborationService.saveDocument(mediaId, session.userId, changeSummary);
          
          // Broadcast save to all users in the document
          socket.to(mediaId).emit('document-saved', {
            mediaId,
            versionId: saveResult.versionId,
            version: saveResult.version,
            editedBy: saveResult.editedBy,
            editorName: saveResult.editorName,
            editedAt: saveResult.editedAt,
            commitMessage: saveResult.commitMessage
          });
          
          // Send confirmation to the user who saved
          socket.emit('document-saved', {
            mediaId,
            versionId: saveResult.versionId,
            version: saveResult.version,
            editedBy: saveResult.editedBy,
            editorName: saveResult.editorName,
            editedAt: saveResult.editedAt,
            commitMessage: saveResult.commitMessage
          });
          
          console.log(`✅ Document ${mediaId} saved by ${session.username}, version ${saveResult.version}`);
        } catch (error) {
          console.error('Error saving document:', error);
          socket.emit('error', { message: 'Failed to save document: ' + error.message });
        }
      });

      // Get active users
      socket.on('get-active-users', async (data) => {
        try {
          const { mediaId } = data;
          const users = await collaborationService.getActiveUsers(mediaId);
          socket.emit('active-users', { users });
        } catch (error) {
          console.error('Error getting active users:', error);
        }
      });

      // Disconnect handling
      socket.on('disconnect', async () => {
        try {
          await collaborationService.leaveDocument(socket.id);
          
          const session = collaborationService.userSessions.get(socket.id);
          if (session) {
            socket.to(session.mediaId).emit('user-left', {
              userId: session.userId,
              username: session.username
            });
          }
          
          console.log(`🔌 User disconnected: ${socket.id}`);
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      });
    });

    // Periodic cleanup of inactive sessions
    setInterval(async () => {
      await collaborationService.cleanupInactiveSessions();
    }, 60000); // Every minute
  }

  // Broadcast to all users in a document
  broadcastToDocument(mediaId, event, data) {
    if (this.io) {
      this.io.to(mediaId).emit(event, data);
    }
  }

  // Get active connections count
  getActiveConnections() {
    return this.io ? this.io.engine.clientsCount : 0;
  }
}

module.exports = new SocketService();
