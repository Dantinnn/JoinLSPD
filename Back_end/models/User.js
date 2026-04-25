import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  discriminator: {
    type: String,
    default: '0'
  },
  avatar: {
    type: String,
    default: null
  },
  email: {
    type: String,
    default: null
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  profile: {
    bio: {
      type: String,
      default: '',
      maxlength: 500
    },
    rank: {
      type: String,
      default: 'Civil',
      enum: ['Civil', 'Oficial', 'Sargento', 'Tenente', 'Capitão', 'Comandante']
    },
    badge: {
      type: String,
      default: null
    },
    experience: {
      type: Number,
      default: 0
    },
    achievements: [{
      type: String
    }],
    preferences: {
      theme: {
        type: String,
        default: 'light',
        enum: ['light', 'dark']
      },
      notifications: {
        type: Boolean,
        default: true
      }
    }
  },
  applications: [{
    applicationId: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Índices para melhor performance
userSchema.index({ discordId: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'applications.status': 1 });

export default mongoose.model('User', userSchema);
