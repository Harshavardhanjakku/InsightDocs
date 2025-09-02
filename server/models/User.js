const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  keycloak_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
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

userSchema.index({ keycloak_id: 1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);
