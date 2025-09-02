const mongoose = require('mongoose');

const documentVersionSchema = new mongoose.Schema({
  mediaId: {
    type: String,
    required: true,
    index: true
  },
  version: {
    type: Number,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  changes: [{
    type: {
      type: String,
      enum: ['insert', 'delete', 'format'],
      required: true
    },
    position: {
      type: Number,
      required: true
    },
    text: String,
    format: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  editedBy: {
    type: String,
    required: true
  },
  editorName: {
    type: String,
    default: 'Unknown User'
  },
  editedAt: {
    type: Date,
    default: Date.now
  },
  commitMessage: {
    type: String,
    default: 'Document updated'
  }
});

documentVersionSchema.index({ mediaId: 1, version: 1 });

module.exports = mongoose.model('DocumentVersion', documentVersionSchema);
