const mongoose = require('mongoose');

const metricsSchema = new mongoose.Schema({
  heartRate: {
    average: Number,
    max: Number,
    min: Number,
    zones: {
      zone1: Number, // minutes in each HR zone
      zone2: Number,
      zone3: Number,
      zone4: Number,
      zone5: Number
    }
  },
  pace: Number, // minutes per km
  speed: Number, // km/h
  elevation: {
    gain: Number, // meters gained
    loss: Number, // meters lost
    max: Number, // max elevation
    min: Number  // min elevation
  },
  calories: Number,
  power: {
    average: Number, // watts
    max: Number,
    normalized: Number
  },
  cadence: {
    average: Number, // steps/min or RPM
    max: Number
  },
  temperature: Number, // celsius
  splits: [{ // for running/cycling splits
    distance: Number, // meters
    time: Number, // seconds
    pace: Number,
    elevation: Number
  }]
}, { _id: false });

const externalActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  activityType: {
    type: String,
    required: true,
    enum: [
      'running', 'cycling', 'swimming', 'walking', 'hiking',
      'rowing', 'skiing', 'climbing', 'yoga', 'pilates',
      'crossfit', 'martial_arts', 'dancing', 'basketball',
      'football', 'tennis', 'golf', 'other'
    ],
    index: true
  },
  name: String, // activity name/title
  description: String,
  source: {
    type: String,
    enum: ['manual', 'strava', 'garmin', 'fitbit', 'apple_health', 'google_fit', 'polar', 'suunto'],
    required: true,
    index: true
  },
  externalId: String, // ID from external service
  externalUrl: String, // link to activity on external platform
  duration: {
    type: Number,
    required: true // in seconds
  },
  distance: Number, // in meters
  metrics: metricsSchema,
  muscleStrain: {
    chest: { type: Number, default: 0 },
    back: { type: Number, default: 0 },
    shoulders: { type: Number, default: 0 },
    arms: { type: Number, default: 0 },
    legs: { type: Number, default: 0 },
    core: { type: Number, default: 0 }
  },
  location: {
    name: String, // "Central Park, NYC"
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    country: String,
    city: String
  },
  weather: {
    temperature: Number, // celsius
    humidity: Number, // percentage
    windSpeed: Number, // km/h
    conditions: String // "sunny", "rainy", etc.
  },
  equipment: {
    shoes: String,
    bike: String,
    gear: [String]
  },
  notes: String,
  photos: [String], // URLs to photos
  isRace: {
    type: Boolean,
    default: false
  },
  raceDetails: {
    name: String,
    distance: String,
    placement: Number,
    totalParticipants: Number,
    category: String
  },
  privacy: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'private'
  },
  syncStatus: {
    lastSynced: Date,
    syncErrors: [String],
    needsUpdate: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
externalActivitySchema.index({ userId: 1, date: -1 });
externalActivitySchema.index({ userId: 1, activityType: 1 });
externalActivitySchema.index({ date: -1, activityType: 1 });
externalActivitySchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true });

// Virtual for duration in minutes
externalActivitySchema.virtual('durationMinutes').get(function() {
  return Math.round(this.duration / 60);
});

// Virtual for average pace (if applicable)
externalActivitySchema.virtual('averagePace').get(function() {
  if (this.distance && this.duration && ['running', 'walking', 'hiking'].includes(this.activityType)) {
    const kmDistance = this.distance / 1000;
    const hours = this.duration / 3600;
    return kmDistance / hours; // km/h
  }
  return null;
});

// Virtual for total strain
externalActivitySchema.virtual('totalStrain').get(function() {
  return Object.values(this.muscleStrain).reduce((sum, strain) => sum + strain, 0);
});

// Static method to get user's activities by date range
externalActivitySchema.statics.getByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

// Static method to get user's activity stats
externalActivitySchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$activityType',
        count: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        totalDistance: { $sum: '$distance' },
        avgCalories: { $avg: '$metrics.calories' }
      }
    }
  ]);
  
  return stats;
};

// Static method to check for duplicates
externalActivitySchema.statics.findDuplicate = function(source, externalId, userId, date) {
  const query = { userId, date };
  
  if (source !== 'manual' && externalId) {
    query.source = source;
    query.externalId = externalId;
  }
  
  return this.findOne(query);
};

// Method to calculate estimated calories if not provided
externalActivitySchema.methods.estimateCalories = function(userWeight = 70) {
  if (this.metrics && this.metrics.calories) {
    return this.metrics.calories;
  }
  
  // MET values for different activities
  const metValues = {
    running: 10,
    cycling: 8,
    swimming: 8,
    walking: 3.5,
    hiking: 6,
    rowing: 7,
    yoga: 3,
    pilates: 3,
    crossfit: 8,
    basketball: 8,
    tennis: 7,
    dancing: 5,
    other: 5
  };
  
  const met = metValues[this.activityType] || 5;
  const hours = this.duration / 3600;
  
  // Calories = MET × weight(kg) × time(hours)
  return Math.round(met * userWeight * hours);
};

// Method to sync with external service
externalActivitySchema.methods.markForSync = function() {
  this.syncStatus.needsUpdate = true;
  return this.save();
};

module.exports = mongoose.model('ExternalActivity', externalActivitySchema);