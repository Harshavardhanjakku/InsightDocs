'use client';

import { useEffect, useState } from 'react';
import ProtectedLayout from '../../components/ProtectedLayout';
import { useAuth } from '../../contexts/AuthContext';
import InviteModal from '../../components/InviteModal';
import FilePreview from '../../components/FilePreview';
import API from '../../lib/api';
import { 
  UserGroupIcon, 
  BuildingOfficeIcon, 
  UserIcon,
  EnvelopeIcon,
  CalendarIcon,
  ShieldCheckIcon,
  PlusIcon,
  UsersIcon,
  ChartBarIcon,
  ArrowUpOnSquareIcon
} from '@heroicons/react/24/outline';

export default function Dashboard() {
  const { user, organizations, currentOrganization } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [media, setMedia] = useState([]);
  const [renamingId, setRenamingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [previewMediaId, setPreviewMediaId] = useState(null);

  // Load organization media when org changes
  useEffect(() => {
    const load = async () => {
      if (!currentOrganization?.id) return;
      try {
        const res = await API.get(`/media/org/${currentOrganization.id}`);
        setMedia(res.data || []);
      } catch (e) {
        console.error('Failed to load org media', e);
      }
    };
    load();
  }, [currentOrganization?.id]);

  const handleUpload = async () => {
    if (!file || !title || !user?.id) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title);
      form.append('type', 'document');
      form.append('uploaded_by', user.id);

      // Use fetch to avoid global JSON header
      const token = localStorage.getItem('token');
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/media/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!resp.ok) {
        let errText = 'Upload failed';
        try {
          const j = await resp.json();
          errText = j?.error || j?.detail || errText;
        } catch (_) {}
        throw new Error(errText);
      }
      const data = await resp.json();
      setTitle('');
      setFile(null);
      // Prepend new item
      setMedia((prev) => [data.media, ...prev]);
    } catch (e) {
      console.error('Upload error', e);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const startRename = (item) => {
    setRenamingId(item.id);
    setNewTitle(item.title);
  };

  const submitRename = async (id) => {
    try {
      const res = await API.patch(`/media/${id}`, { title: newTitle });
      const updated = res.data?.media?.[0] || null;
      setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, title: updated?.title || newTitle } : m)));
      setRenamingId(null);
      setNewTitle('');
    } catch (e) {
      console.error('Rename failed', e);
      alert('Rename failed');
    }
  };

  const stats = [
    {
      title: 'Total Organizations',
      value: organizations.length,
      icon: BuildingOfficeIcon,
      color: 'blue',
      description: 'Organizations you belong to'
    },
    {
      title: 'Current Role',
      value: currentOrganization?.role || 'N/A',
      icon: ShieldCheckIcon,
      color: 'green',
      description: 'Your role in current organization'
    },
    {
      title: 'Member Count',
      value: currentOrganization?.member_count || 0,
      icon: UsersIcon,
      color: 'purple',
      description: 'Members in current organization'
    },
    {
      title: 'Active Projects',
      value: '0',
      icon: ChartBarIcon,
      color: 'orange',
      description: 'Active projects in organization'
    }
  ];

  const quickActions = [
    {
      title: 'Invite Member',
      description: 'Send invitation to join organization',
      icon: PlusIcon,
      action: () => setShowInviteModal(true),
      color: 'blue'
    },
    {
      title: 'View Members',
      description: 'See all organization members',
      icon: UsersIcon,
      action: () => alert('View Members feature coming soon!'),
      color: 'green'
    },
    {
      title: 'Organization Settings',
      description: 'Manage organization settings',
      icon: BuildingOfficeIcon,
      action: () => alert('Organization Settings feature coming soon!'),
      color: 'purple'
    }
  ];

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 text-blue-700',
      green: 'bg-green-50 border-green-200 text-green-700',
      purple: 'bg-purple-50 border-purple-200 text-purple-700',
      orange: 'bg-orange-50 border-orange-200 text-orange-700'
    };
    return colors[color] || colors.blue;
  };

  const getIconColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-600',
      green: 'bg-green-100 text-green-600',
      purple: 'bg-purple-100 text-purple-600',
      orange: 'bg-orange-100 text-orange-600'
    };
    return colors[color] || colors.blue;
  };

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Dashboard</h1>
            <p className="text-gray-600">Welcome back, {user?.username}! Here's what's happening with your organizations.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => (
              <div key={index} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-blue-200/50 shadow-xl p-6 hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      {stat.title}
                    </p>
                    <p className="text-3xl font-bold text-gray-800 mb-1">
                      {stat.value}
                    </p>
                    <p className="text-sm text-gray-600">
                      {stat.description}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getIconColorClasses(stat.color)}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Current Organization */}
            <div className="lg:col-span-2">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-blue-200/50 shadow-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Current Organization</h2>
                  {currentOrganization && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getColorClasses(currentOrganization.role === 'owner' ? 'green' : 'blue')}`}>
                      {currentOrganization.role}
                    </span>
                  )}
                </div>

                {currentOrganization ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-blue-50/50 rounded-xl border border-blue-200/30">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800">{currentOrganization.name}</h3>
                        <p className="text-gray-600">
                          {currentOrganization.member_count} members • Created {new Date(currentOrganization.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Upload to Organization (MinIO-backed) */}
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-300">
                      <h3 className="text-md font-semibold text-gray-900 mb-3">Upload document to organization</h3>
                      <div className="flex flex-col md:flex-row items-start md:items-end gap-3">
                        <input
                          type="text"
                          placeholder="Title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full md:w-1/3 border-2 border-blue-400 focus:border-blue-600 rounded-lg px-3 py-2 bg-white text-gray-900 placeholder:text-gray-500"
                        />
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          className="w-full md:w-1/3 text-gray-900"
                        />
                        <button
                          disabled={uploading || !file || !title}
                          onClick={handleUpload}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition
                            ${uploading || !file || !title ? 'bg-blue-300 cursor-not-allowed' : 'bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 focus:ring-blue-600'}`}
                        >
                          {uploading ? (
                            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                          ) : (
                            <ArrowUpOnSquareIcon className="h-5 w-5" />
                          )}
                          <span>{uploading ? 'Uploading…' : 'Upload to org'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Organization Media List */}
                    <div className="mt-4">
                      <h3 className="text-md font-semibold text-gray-800 mb-3">Organization media</h3>
                      <div className="space-y-3">
                        {media.length === 0 && (
                          <div className="text-sm text-gray-700">No media yet.</div>
                        )}
                        {media.map((item) => (
                          <div key={item.id} className="p-3 bg-white rounded-lg border border-gray-300 flex items-center justify-between gap-3 shadow-sm">
                            <div className="min-w-0">
                              {renamingId === item.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    className="border-2 border-blue-400 focus:border-blue-600 rounded px-2 py-1 text-gray-900"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                  />
                                  <button className="text-sm text-blue-700 font-semibold" onClick={() => submitRename(item.id)}>Save</button>
                                  <button className="text-sm text-gray-500" onClick={() => setRenamingId(null)}>Cancel</button>
                                </div>
                              ) : (
                                <div className="truncate">
                                  <div className="font-semibold text-gray-900 truncate">{item.title}</div>
                                  <div className="text-xs text-gray-600">Uploaded by {item.uploaded_by_username || 'user'}</div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <button 
                                onClick={() => setPreviewMediaId(item.id)}
                                className="text-sm text-purple-700 font-semibold hover:underline"
                              >
                                Preview
                              </button>
                              {item.url && (
                                <a className="text-sm text-blue-700 font-semibold hover:underline" href={item.url} target="_blank" rel="noreferrer">Open</a>
                              )}
                              <a 
                                href={`/collaborate/${item.id}`}
                                className="text-sm text-green-700 font-semibold hover:underline"
                              >
                                Collaborate
                              </a>
                              {renamingId !== item.id && (
                                <button className="text-sm text-gray-700" onClick={() => startRename(item)}>Rename</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      {quickActions.map((action, index) => (
                        <button
                          key={index}
                          onClick={action.action}
                          className="p-4 bg-white/60 hover:bg-white/80 rounded-xl border border-blue-200/50 transition-all duration-200 hover:shadow-lg text-left group"
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${getIconColorClasses(action.color)} group-hover:scale-110 transition-transform`}>
                            <action.icon className="w-5 h-5" />
                          </div>
                          <h4 className="font-semibold text-gray-800 mb-1">{action.title}</h4>
                          <p className="text-sm text-gray-600">{action.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">No Organization Selected</h3>
                    <p className="text-gray-500">Select an organization from the dropdown above to view details.</p>
                  </div>
                )}
              </div>
            </div>

            {/* User Info */}
            <div className="lg:col-span-1">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-blue-200/50 shadow-xl p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Your Profile</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-blue-50/50 rounded-xl border border-blue-200/30">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{user?.username}</h3>
                      <p className="text-gray-600">{user?.email}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-lg">
                      <span className="text-sm text-gray-600">Member Since</span>
                      <span className="text-sm font-semibold text-gray-800">
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-lg">
                      <span className="text-sm text-gray-600">Organizations</span>
                      <span className="text-sm font-semibold text-gray-800">{organizations.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invite Modal */}
        <InviteModal 
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          organization={currentOrganization}
        />

        {/* File Preview Modal */}
        {previewMediaId && (
          <FilePreview 
            mediaId={previewMediaId}
            onClose={() => setPreviewMediaId(null)}
          />
        )}
      </div>
    </ProtectedLayout>
  );
}
