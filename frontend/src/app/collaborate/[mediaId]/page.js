'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import API from '@/lib/api';
import CollaborativeEditor from '@/components/CollaborativeEditor';

export default function CollaboratePage({ params }) {
  const [mediaId, setMediaId] = useState(null);
  
  // Handle async params
  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setMediaId(resolvedParams.mediaId);
    };
    getParams();
  }, [params]);
  const { user, currentOrganization, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  
  // State management with multiple approaches
  const [media, setMedia] = useState(null);
  const [documentContent, setDocumentContent] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [error, setError] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  
  // Enhanced state management
  const [isDataReady, setIsDataReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  const [retryDelay] = useState(1000); // 1 second
  
  // Loading states for different operations
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [isCollaborationLoading, setIsCollaborationLoading] = useState(false);
  const [isPermissionLoading, setIsPermissionLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !loading) {
      router.push('/');
    }
  }, [isAuthenticated, loading, router]);

  // Enhanced data readiness check with multiple approaches
  useEffect(() => {
    // Wait for authentication to be ready
    if (loading) {
      console.log('⏳ Waiting for authentication to be ready...');
      return;
    }
    
    // Approach 1: Wait for all required data
    if (currentOrganization && user && !isDataReady) {
      console.log('✅ All required data available, setting ready state');
      setIsDataReady(true);
    }
    
    // Approach 2: Timeout fallback to prevent infinite waiting
    const timeoutId = setTimeout(() => {
      if (!isDataReady && retryCount < maxRetries) {
        console.log(`⏰ Timeout reached, retry ${retryCount + 1}/${maxRetries}`);
        setRetryCount(prev => prev + 1);
      }
    }, 5000); // 5 second timeout
    
    return () => clearTimeout(timeoutId);
  }, [currentOrganization, user, isDataReady, retryCount, maxRetries]);

  // Retry mechanism with exponential backoff
  useEffect(() => {
    if (retryCount > 0 && retryCount <= maxRetries) {
      const timer = setTimeout(() => {
        console.log(`🔄 Retry attempt ${retryCount}/${maxRetries}`);
        setIsDataReady(false); // Reset to trigger reload
      }, retryDelay * retryCount);
      
      return () => clearTimeout(timer);
    }
  }, [retryCount, maxRetries, retryDelay]);

  // Main document loading function with multiple fallback approaches
  const loadCollaborateDoc = useCallback(async () => {
    try {
      console.log('🚀 === COLLABORATE PAGE DEBUG START ===');
      console.log('📋 Input parameters:', { mediaId, organizationId: currentOrganization?.id, userId: user?.id });
      
      if (!mediaId || !currentOrganization || !user) {
        console.log('❌ Missing required data:', { 
          hasMediaId: !!mediaId, 
          hasOrg: !!currentOrganization, 
          hasUser: !!user 
        });
        return;
      }

      console.log('🔍 Loading collaborate document:', { mediaId, organizationId: currentOrganization.id, userId: user.id });

      // Approach 1: Try current organization first
      let mediaItem = null;
      let targetOrganizationId = currentOrganization.id;
      
      console.log('🔍 Step 1: Checking current organization for document...');
      
      try {
        setIsMediaLoading(true);
        console.log('📡 API Call: GET /media/org/${currentOrganization.id}');
        const mediaResponse = await API.get(`/media/org/${currentOrganization.id}`);
        console.log('✅ Media response received:', mediaResponse.data);
        
        mediaItem = mediaResponse.data.find(item => item.id === mediaId);
        if (mediaItem) {
          console.log('✅ Found document in current organization:', mediaItem);
        } else {
          console.log('❌ Document not found in current organization');
        }
      } catch (error) {
        console.log('❌ Error checking current organization:', error);
        console.log('Document not found in current organization, checking other organizations...');
      } finally {
        setIsMediaLoading(false);
      }
      
      // Approach 2: Check other organizations if not found
      if (!mediaItem) {
        console.log('🔍 Step 2: Document not in current org, checking other organizations...');
        try {
          setIsPermissionLoading(true);
          // Get all organizations the user is a member of
          console.log('📡 API Call: GET /users/${user.id}/organizations');
          const membershipsResponse = await API.get(`/users/${user.id}/organizations`);
          
          // Handle multiple response formats
          let memberships = [];
          if (membershipsResponse.data?.data) {
            memberships = membershipsResponse.data.data; // Nested format
          } else if (Array.isArray(membershipsResponse.data)) {
            memberships = membershipsResponse.data; // Direct array format
          } else if (membershipsResponse.data && typeof membershipsResponse.data === 'object') {
            // Try to extract from object
            memberships = Object.values(membershipsResponse.data);
          }
          
          console.log('📋 User memberships received:', memberships);
          
          if (!Array.isArray(memberships)) {
            console.log('❌ Memberships is not an array, converting...');
            memberships = Array.isArray(memberships) ? memberships : [memberships];
          }
          
          // Check each organization for the document
          for (const membership of memberships) {
            if (!membership || !membership.organization_id) {
              console.log('⚠️ Invalid membership data:', membership);
              continue;
            }
            
            console.log(`🔍 Checking organization: ${membership.organization_id}`);
            try {
              console.log(`📡 API Call: GET /media/org/${membership.organization_id}`);
              const mediaResponse = await API.get(`/media/org/${membership.organization_id}`);
              console.log(`✅ Media response for org ${membership.organization_id}:`, mediaResponse.data);
              
              const foundMedia = mediaResponse.data.find(item => item.id === mediaId);
              if (foundMedia) {
                mediaItem = foundMedia;
                targetOrganizationId = membership.organization_id;
                console.log(`✅ Found document in organization: ${membership.organization_id}`, foundMedia);
                break;
              } else {
                console.log(`❌ Document not found in organization: ${membership.organization_id}`);
              }
            } catch (error) {
              console.log(`❌ Could not access organization ${membership.organization_id}:`, error.message);
            }
          }
        } catch (error) {
          console.log('❌ Could not get user memberships:', error.message);
        } finally {
          setIsPermissionLoading(false);
        }
      }
      
      if (!mediaItem) {
        console.log('❌ FINAL RESULT: Document not found in any organization');
        setError('Document not found or access denied');
        return;
      }

      console.log('✅ FINAL RESULT: Document found:', mediaItem);
      console.log('🎯 Target organization ID:', targetOrganizationId);
      setMedia(mediaItem);

      // Approach 3: Load document content for collaboration
      console.log('🔍 Step 3: Loading document content for collaboration...');
      console.log(`📡 API Call: GET /api/docs/${mediaId}/collaborate`);
      
      try {
        setIsCollaborationLoading(true);
        const collaborateResponse = await API.get(`/api/docs/${mediaId}/collaborate`, {
          params: {
            userId: user.id,
            organizationId: targetOrganizationId
          }
        });

        console.log('✅ Collaborate API response received:', collaborateResponse.data);

        if (collaborateResponse.data.success) {
          console.log('✅ Collaboration data loaded successfully');
          console.log('📄 Document content length:', collaborateResponse.data.document?.content?.length || 0);
          console.log('🔐 User role:', collaborateResponse.data.permissions?.role);
          
          setDocumentContent(collaborateResponse.data.document);
          setPermissions(collaborateResponse.data.permissions);
          setUserRole(collaborateResponse.data.permissions.role);
        } else {
          console.log('❌ Collaboration API returned success: false');
          setError('Failed to load document for collaboration');
        }
      } catch (error) {
        console.error('❌ Error loading collaboration data:', error);
        setError('Failed to load document for collaboration');
      } finally {
        setIsCollaborationLoading(false);
      }

      console.log('🚀 === COLLABORATE PAGE DEBUG END ===');

    } catch (err) {
      console.error('❌ ERROR in loadCollaborateDoc:', err);
      console.error('❌ Error response:', err.response);
      console.error('❌ Error status:', err.response?.status);
      console.error('❌ Error data:', err.response?.data);
      
      if (err.response?.status === 404) {
        setError('Document not found or access denied');
      } else if (err.response?.status === 403) {
        setError('Access denied to this document');
      } else {
        setError('Failed to load document for collaboration');
      }
    } finally {
      setPageLoading(false);
    }
  }, [mediaId, currentOrganization, user]);

  // Load document when data is ready
  useEffect(() => {
    if (isDataReady) {
      loadCollaborateDoc();
    }
  }, [isDataReady, loadCollaborateDoc]);

  // Loading state management
  const isLoading = pageLoading || isMediaLoading || isCollaborationLoading || isPermissionLoading;
  
  // Show loading while authentication is being checked
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Checking Authentication</h1>
          <p className="text-gray-600">Please wait while we verify your login status...</p>
        </div>
      </div>
    );
  }

  // Error handling with retry option
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          
          {/* Retry button */}
          {retryCount < maxRetries && (
            <button
              onClick={() => {
                setError(null);
                setRetryCount(prev => prev + 1);
                setIsDataReady(false);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 mr-3"
            >
              Retry ({maxRetries - retryCount} left)
            </button>
          )}
          
          <button
            onClick={() => router.back()}
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Loading state with progress indicators
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Loading Document</h1>
          <p className="text-gray-600 mb-4">Please wait while we prepare your collaboration session...</p>
          
          {/* Progress indicators */}
          <div className="space-y-2">
            <div className={`flex items-center ${isMediaLoading ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-3 h-3 rounded-full mr-2 ${isMediaLoading ? 'bg-blue-600 animate-pulse' : 'bg-gray-300'}`}></div>
              {isMediaLoading ? 'Loading media...' : 'Media loaded'}
            </div>
            <div className={`flex items-center ${isPermissionLoading ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-3 h-3 rounded-full mr-2 ${isPermissionLoading ? 'bg-blue-600 animate-pulse' : 'bg-gray-300'}`}></div>
              {isPermissionLoading ? 'Checking permissions...' : 'Permissions verified'}
            </div>
            <div className={`flex items-center ${isCollaborationLoading ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-3 h-3 rounded-full mr-2 ${isCollaborationLoading ? 'bg-blue-600 animate-pulse' : 'bg-gray-300'}`}></div>
              {isCollaborationLoading ? 'Initializing collaboration...' : 'Collaboration ready'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main collaboration interface
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{media?.title || 'Collaborative Document'}</h1>
              <p className="text-sm text-gray-500">
                Role: {userRole || 'Unknown'} • Organization: {currentOrganization?.name || 'Unknown'}
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
            >
              Back to Documents
            </button>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {documentContent && permissions ? (
          <CollaborativeEditor
            mediaId={mediaId}
            initialContent={documentContent.content}
            permissions={permissions}
            userRole={userRole}
            organizationId={currentOrganization?.id}
            userId={user?.id}
            username={user?.username}
          />
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📄</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Document Not Ready</h2>
            <p className="text-gray-600">The document is still being prepared for collaboration.</p>
          </div>
        )}
      </div>
    </div>
  );
}
