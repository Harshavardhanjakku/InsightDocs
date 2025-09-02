const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  keycloak_org_id: {
    type: String,
    unique: true,
    sparse: true
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

organizationSchema.index({ name: 1 });
organizationSchema.index({ keycloak_org_id: 1 });

module.exports = mongoose.model('Organization', organizationSchema);
