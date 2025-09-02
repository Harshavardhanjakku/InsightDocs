const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  mediaId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  version: {
    type: Number,
    default: 1
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

documentSchema.index({ mediaId: 1, version: 1 });

module.exports = mongoose.model('Document', documentSchema);
