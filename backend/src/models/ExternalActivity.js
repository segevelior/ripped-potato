const mongoose = require('mongoose');

const externalActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Source identification
  source: {
    type: String,
    enum: ['strava', 'garmin', 'manual'],
    required: true,
    index: true
  },
  externalId: {
    type: String,
    required: true
  },

  // Core activity data
  name: {
    type: String,
    required: true
  },
  description: String,
  sportType: {
    type: String,
    required: true,
    index: true
  },

  // Timing
  startDate: {
    type: Date,
    required: true,
    index: true
  },
  timezone: String,
  movingTime: Number,     // seconds
  elapsedTime: Number,    // seconds

  // Distance & Elevation
  distance: Number,       // meters
  elevationGain: Number,  // meters
  elevationHigh: Number,  // meters
  elevationLow: Number,   // meters

  // Heart Rate
  avgHeartRate: Number,
  maxHeartRate: Number,

  // Speed (m/s)
  avgSpeed: Number,
  maxSpeed: Number,

  // Power (watts)
  avgPower: Number,
  maxPower: Number,
  normalizedPower: Number,

  // Cadence
  avgCadence: Number,

  // Energy
  calories: Number,
  kilojoules: Number,

  // Location
  city: String,
  state: String,
  country: String,

  // Strava social
  kudosCount: Number,
  achievementCount: Number,

  // Equipment
  gearId: String,
  gearName: String,
  deviceName: String,

  // Links
  stravaUrl: String,

  // Visibility
  isPrivate: {
    type: Boolean,
    default: false
  },

  // Sync metadata
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },

  // Store raw response for future use
  rawData: {
    type: mongoose.Schema.Types.Mixed
  }

}, { timestamps: true });

// Compound indexes for common queries
externalActivitySchema.index({ userId: 1, startDate: -1 });
externalActivitySchema.index({ userId: 1, sportType: 1 });
externalActivitySchema.index({ source: 1, externalId: 1 }, { unique: true });
externalActivitySchema.index({ userId: 1, source: 1, startDate: -1 });

// Virtual for duration in minutes
externalActivitySchema.virtual('movingTimeMinutes').get(function() {
  return this.movingTime ? Math.round(this.movingTime / 60) : null;
});

// Virtual for distance in km
externalActivitySchema.virtual('distanceKm').get(function() {
  return this.distance ? (this.distance / 1000).toFixed(2) : null;
});

// Virtual for pace (min/km) - for running activities
externalActivitySchema.virtual('paceMinPerKm').get(function() {
  if (!this.distance || !this.movingTime) return null;
  const kmDistance = this.distance / 1000;
  const minutes = this.movingTime / 60;
  return (minutes / kmDistance).toFixed(2);
});

// Static: Get activities by date range
externalActivitySchema.statics.getByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    startDate: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ startDate: -1 });
};

// Static: Get user stats for period
externalActivitySchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        startDate: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$sportType',
        count: { $sum: 1 },
        totalMovingTime: { $sum: '$movingTime' },
        totalDistance: { $sum: '$distance' },
        totalElevation: { $sum: '$elevationGain' },
        totalCalories: { $sum: '$calories' },
        avgHeartRate: { $avg: '$avgHeartRate' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return stats;
};

// Static: Check for existing activity (dedup)
externalActivitySchema.statics.findBySourceAndExternalId = function(source, externalId) {
  return this.findOne({ source, externalId });
};

// Static: Get recent activities for AI context
externalActivitySchema.statics.getRecentForContext = async function(userId, limit = 20) {
  return this.find({ userId })
    .sort({ startDate: -1 })
    .limit(limit)
    .select('name sportType startDate movingTime distance elevationGain avgHeartRate calories city')
    .lean();
};

// Ensure virtuals are included in JSON
externalActivitySchema.set('toJSON', { virtuals: true });
externalActivitySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ExternalActivity', externalActivitySchema);
