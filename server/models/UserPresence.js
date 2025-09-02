const mongoose = require('mongoose');

const userPresenceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  mediaId: {
    type: String,
    required: true,
    index: true
  },
  socketId: {
    type: String,
    required: true
  },
  cursor: {
    position: {
      type: Number,
      default: 0
    },
    selection: {
      start: Number,
      end: Number
    }
  },
  color: {
    type: String,
    default: '#3B82F6'
  },
  isTyping: {
    type: Boolean,
    default: false
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
});

userPresenceSchema.index({ mediaId: 1, userId: 1 });
userPresenceSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 300 }); // Auto-cleanup after 5 minutes

module.exports = mongoose.model('UserPresence', userPresenceSchema);
