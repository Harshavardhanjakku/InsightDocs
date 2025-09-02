const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  invitedUserId: {
    type: String,
    required: true,
    index: true
  },
  invitedBy: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'reviewer', 'viewer'],
    default: 'viewer'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  message: {
    type: String,
    default: ''
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

invitationSchema.index({ organizationId: 1, status: 1 });
invitationSchema.index({ invitedUserId: 1, status: 1 });
invitationSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Invitation', invitationSchema);
