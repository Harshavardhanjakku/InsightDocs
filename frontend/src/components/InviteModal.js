'use client';

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API from '../lib/api';
import { 
  XMarkIcon, 
  UserPlusIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';

export default function InviteModal({ isOpen, onClose, organization }) {
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteMessage, setInviteMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSendInvite = async (e) => {
    e.preventDefault();
    
    if (!inviteEmail.trim()) {
      setMessage('❌ Please enter an email address');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      console.log('🔍 Searching for user with email:', inviteEmail);
      
      // First, find the user by email
      const userResponse = await API.get(`/users?search=${encodeURIComponent(inviteEmail)}`);
      console.log('📋 User search response:', userResponse.data);
      
      if (userResponse.data.length === 0) {
        setMessage('❌ User not found. Please make sure the user has registered with this email.');
        setLoading(false);
        return;
      }

      const invitedUser = userResponse.data[0];
      console.log('✅ Found user:', invitedUser);
      
      // Send the invitation
      const inviteData = {
        invited_user_id: invitedUser.keycloak_id,
        invited_by: user.keycloak_id,
        message: inviteMessage.trim() || null,
        role: inviteRole
      };
      
      console.log('📤 Sending invitation with data:', inviteData);
      
      await API.post('/org-invites/send', inviteData);

      setMessage('✅ Invitation sent successfully!');
      setInviteEmail('');
      setInviteMessage('');
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setMessage('');
      }, 2000);

    } catch (error) {
      console.error('❌ Invitation error:', error);
      console.error('❌ Error response:', error.response?.data);
      
      if (error.response?.data?.error) {
        setMessage('❌ Failed to send invitation: ' + error.response.data.error);
      } else {
        setMessage('❌ Failed to send invitation: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white/95 rounded-3xl border border-blue-200/50 shadow-2xl backdrop-blur-xl max-w-md w-full">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-blue-200/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200">
              <UserPlusIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800 tracking-wide">Invite Member</h3>
              <p className="text-gray-600">Send invitation to join {organization?.name}</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 transition-all border border-gray-200 hover:border-gray-300"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          <form onSubmit={handleSendInvite} className="space-y-6">
            {/* Email Input */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-3 tracking-wider">
                EMAIL ADDRESS
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter user's email address..."
                  className="w-full pl-10 pr-4 py-3 bg-white border border-blue-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-3 tracking-wider">
                ROLE
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setInviteRole('viewer')}
                  className={`p-3 rounded-xl border transition-all font-semibold ${
                    inviteRole === 'viewer'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-bold">Viewer</div>
                    <div className="text-xs opacity-75">View & Review</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setInviteRole('reviewer')}
                  className={`p-3 rounded-xl border transition-all font-semibold ${
                    inviteRole === 'reviewer'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-bold">Reviewer</div>
                    <div className="text-xs opacity-75">Review & Comment</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-3 tracking-wider">
                MESSAGE (OPTIONAL)
              </label>
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Add a personal message to your invitation..."
                rows={3}
                className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Message Display */}
            {message && (
              <div className={`p-4 rounded-xl font-semibold text-center ${
                message.includes('✅') 
                  ? 'bg-green-100 text-green-700 border border-green-300' 
                  : 'bg-red-100 text-red-700 border border-red-300'
              }`}>
                {message}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all font-bold border border-gray-200 hover:border-gray-300 tracking-wider"
              >
                CANCEL
              </button>
              
              <button
                type="submit"
                disabled={loading || !inviteEmail.trim()}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed border border-blue-400 tracking-wider flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    SENDING...
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="w-5 h-5" />
                    SEND INVITE
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
