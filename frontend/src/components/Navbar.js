'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API from '../lib/api';
import { 
  UserCircleIcon, 
  ChevronDownIcon, 
  BuildingOfficeIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  BellIcon
} from '@heroicons/react/24/outline';

export default function Navbar() {
  const { isAuthenticated, user, organizations, currentOrganization, setCurrentOrganization, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOrgMenu, setShowOrgMenu] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Load pending invites
  const loadPendingInvites = async () => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const response = await API.get(`/org-invites/pending/${user.id}`);
      setPendingInvites(response.data);
    } catch (error) {
      console.error('Error loading pending invites:', error);
    }
  };

  useEffect(() => {
    loadPendingInvites();
    // Refresh invites every 30 seconds
    const interval = setInterval(loadPendingInvites, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/accept/${inviteId}`);
      alert('✅ Organization invite accepted!');
      loadPendingInvites();
    } catch (error) {
      alert('❌ Failed to accept invite: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      await API.post(`/org-invites/reject/${inviteId}`);
      alert('❌ Organization invite rejected!');
      loadPendingInvites();
    } catch (error) {
      alert('❌ Failed to reject invite: ' + (error.response?.data?.error || error.message));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-blue-200/50 shadow-xl">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">I</span>
              </div>
              <span className="text-xl font-bold text-gray-800 tracking-wide">InsightDocs</span>
            </div>
          </div>

          {/* Organization Selector */}
          <div className="flex items-center gap-4">
            {organizations.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowOrgMenu(!showOrgMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/60 hover:bg-white/80 rounded-xl border border-blue-200/50 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-700">
                    {currentOrganization?.name || 'Select Organization'}
                  </span>
                  <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                </button>

                {showOrgMenu && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-2xl border border-blue-200/50 shadow-2xl backdrop-blur-xl z-50">
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Your Organizations
                      </h3>
                      <div className="space-y-2">
                        {organizations.map((org) => (
                          <button
                            key={org.id}
                            onClick={() => {
                              setCurrentOrganization(org);
                              setShowOrgMenu(false);
                            }}
                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 ${
                              currentOrganization?.id === org.id
                                ? 'bg-blue-50 border border-blue-200'
                                : 'hover:bg-gray-50 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <BuildingOfficeIcon className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="text-left">
                                <div className="font-semibold text-gray-800">{org.name}</div>
                                <div className="text-sm text-gray-500">
                                  {org.role} • {org.member_count} members
                                </div>
                              </div>
                            </div>
                            {currentOrganization?.id === org.id && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowInvites(!showInvites)}
                className="relative p-2 text-gray-600 hover:text-gray-800 transition-all duration-200 group"
                aria-label="Organization Invitations"
              >
                <BellIcon className="w-6 h-6 group-hover:scale-110 transition-transform duration-200" />
                {pendingInvites.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold shadow-md">
                    {pendingInvites.length}
                  </span>
                )}
              </button>

              {/* Invites Dropdown */}
              {showInvites && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl border border-blue-200/50 shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-gray-800 tracking-wide">
                        Organization Invites
                      </h3>
                      <button
                        onClick={() => setShowInvites(false)}
                        className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:rotate-90"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {pendingInvites.length === 0 ? (
                      <div className="text-center py-10">
                        <BellIcon className="w-12 h-12 text-blue-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No pending invites</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {pendingInvites.map((invite) => (
                          <div
                            key={invite.id}
                            className="bg-blue-50/60 rounded-xl p-4 border border-blue-200/30 hover:border-blue-400/50 transition-all duration-300"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-sm text-gray-600">
                                  <span className="font-medium text-gray-800">
                                    {invite.invited_by_username}
                                  </span>{" "}
                                  invited you to join
                                </p>
                                <p className="text-base font-semibold text-blue-600 mt-1">
                                  {invite.organization_name}
                                </p>
                                {invite.message && (
                                  <p className="text-sm text-gray-500 italic mt-2 border-l-2 border-blue-300 pl-3">
                                    {invite.message}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                onClick={() => handleAcceptInvite(invite.id)}
                                className="px-4 py-2 rounded-md text-sm font-medium bg-green-500/80 hover:bg-green-500 text-white transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleRejectInvite(invite.id)}
                                className="px-4 py-2 rounded-md text-sm font-medium bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-4 py-2 bg-white/60 hover:bg-white/80 rounded-xl border border-blue-200/50 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <UserCircleIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800">{user?.username}</div>
                  <div className="text-sm text-gray-500">{user?.email}</div>
                </div>
                <ChevronDownIcon className="w-4 h-4 text-gray-500" />
              </button>

              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl border border-blue-200/50 shadow-2xl backdrop-blur-xl z-50">
                  <div className="p-4">
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <div className="font-semibold text-gray-800">{user?.username}</div>
                      <div className="text-sm text-gray-500">{user?.email}</div>
                    </div>
                    
                    <div className="space-y-2">
                      <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-xl transition-all duration-200">
                        <Cog6ToothIcon className="w-5 h-5 text-gray-500" />
                        <span className="text-gray-700">Settings</span>
                      </button>
                      
                      <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-red-50 rounded-xl transition-all duration-200 text-red-600"
                      >
                        <ArrowRightOnRectangleIcon className="w-5 h-5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop for menus */}
      {(showUserMenu || showOrgMenu || showInvites) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowUserMenu(false);
            setShowOrgMenu(false);
            setShowInvites(false);
          }}
        />
      )}
    </nav>
  );
}
