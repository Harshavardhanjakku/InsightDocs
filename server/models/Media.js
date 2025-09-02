const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['document', 'image', 'video', 'audio'],
    default: 'document'
  },
  objectName: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  orgId: {
    type: String,
    required: true,
    index: true
  },
  uploaded_by: {
    type: String,
    required: true,
    index: true
  },
  uploaded_at: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

mediaSchema.index({ orgId: 1, uploaded_at: -1 });
mediaSchema.index({ uploaded_by: 1, uploaded_at: -1 });
mediaSchema.index({ objectName: 1 });

module.exports = mongoose.model('Media', mediaSchema);
