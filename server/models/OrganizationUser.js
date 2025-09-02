const mongoose = require('mongoose');

const organizationUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['owner', 'reviewer', 'viewer'],
    default: 'viewer'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

// Compound index to ensure unique user-organization relationships
organizationUserSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
organizationUserSchema.index({ organizationId: 1, role: 1 });

module.exports = mongoose.model('OrganizationUser', organizationUserSchema);
