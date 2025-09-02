'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import keycloak from '../lib/keycloak';
import API from '../lib/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrganization, setCurrentOrganization] = useState(null);

  // Get or create user in database
  const getCurrentUser = async () => {
    if (!keycloak?.authenticated) return null;
    try {
      const keycloakId = keycloak.tokenParsed?.sub;
      const userResponse = await API.get(`/users?keycloak_id=${keycloakId}`);
      
      if (userResponse.data.length === 0) {
        // Create new user
        const newUser = await API.post('/users', {
          keycloak_id: keycloakId,
          username: keycloak.tokenParsed?.preferred_username || 'Unknown',
          email: keycloak.tokenParsed?.email || '',
          role: 'user'
        });
              return { 
        id: newUser.data.userId, 
        keycloak_id: keycloakId,
        username: keycloak.tokenParsed?.preferred_username || 'Unknown', 
        email: keycloak.tokenParsed?.email || '',
        organizationId: newUser.data.organizationId
      };
      }
      
      const user = userResponse.data[0];
      return { 
        id: user.id, 
        keycloak_id: user.keycloak_id,
        username: user.username, 
        email: user.email 
      };
    } catch (err) {
      console.error("Error getting current user:", err);
      return null;
    }
  };

  // Fetch user organizations
  const fetchOrganizations = async (userId) => {
    if (!userId) return;
    try {
      const response = await API.get(`/organizations/user/${userId}`);
      setOrganizations(response.data);
      if (response.data.length > 0) {
        setCurrentOrganization(response.data[0]);
      }
    } catch (err) {
      console.error("Error fetching organizations:", err);
    }
  };

  // Initialize authentication
  useEffect(() => {
    keycloak
      .init({
        onLoad: "check-sso",
        checkLoginIframe: false,
      })
      .then(async (authenticated) => {
        setIsAuthenticated(authenticated);
        
        if (authenticated) {
          // Store token in localStorage for API calls
          localStorage.setItem('token', keycloak.token);
          
          // Set up token refresh
          keycloak.onTokenExpired = () => {
            keycloak.updateToken(70).then((refreshed) => {
              if (refreshed) {
                localStorage.setItem('token', keycloak.token);
              }
            });
          };

          // Get user data
          const userData = await getCurrentUser();
          setUser(userData);
          
          if (userData?.id) {
            await fetchOrganizations(userData.id);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Keycloak init failed:", err);
        setLoading(false);
      });
  }, []);

  const login = () => {
    keycloak.login();
  };

  const logout = async () => {
    try {
      // Logout from all sessions
      await API.post('/auth/logout-all');
    } catch (err) {
      console.error("Error during logout:", err);
    } finally {
      localStorage.removeItem('token');
      keycloak.logout();
    }
  };

  const refreshUserData = async () => {
    if (isAuthenticated && user?.id) {
      await fetchOrganizations(user.id);
    }
  };

  const value = {
    isAuthenticated,
    loading,
    user,
    organizations,
    currentOrganization,
    setCurrentOrganization,
    login,
    logout,
    refreshUserData,
    keycloak
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
