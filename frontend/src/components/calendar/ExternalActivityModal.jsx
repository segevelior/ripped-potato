import React from "react";
import { X, Clock, MapPin, Heart, Zap, TrendingUp, Award, ExternalLink, Activity, Bike, Dumbbell, Waves, Mountain, Footprints } from "lucide-react";
import { format } from "date-fns";

// Sport type icons and colors
const SPORT_CONFIG = {
  Run: { icon: Footprints, color: 'bg-green-500', bgLight: 'bg-green-50', text: 'text-green-700' },
  TrailRun: { icon: Mountain, color: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-700' },
  Ride: { icon: Bike, color: 'bg-orange-500', bgLight: 'bg-orange-50', text: 'text-orange-700' },
  VirtualRide: { icon: Bike, color: 'bg-orange-400', bgLight: 'bg-orange-50', text: 'text-orange-600' },
  Swim: { icon: Waves, color: 'bg-blue-500', bgLight: 'bg-blue-50', text: 'text-blue-700' },
  WeightTraining: { icon: Dumbbell, color: 'bg-purple-500', bgLight: 'bg-purple-50', text: 'text-purple-700' },
  Workout: { icon: Activity, color: 'bg-rose-500', bgLight: 'bg-rose-50', text: 'text-rose-700' },
  Yoga: { icon: Activity, color: 'bg-teal-500', bgLight: 'bg-teal-50', text: 'text-teal-700' },
  Hike: { icon: Mountain, color: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-700' },
  Walk: { icon: Footprints, color: 'bg-sky-500', bgLight: 'bg-sky-50', text: 'text-sky-700' },
  default: { icon: Activity, color: 'bg-gray-500', bgLight: 'bg-gray-50', text: 'text-gray-700' }
};

const getSportConfig = (sportType) => {
  return SPORT_CONFIG[sportType] || SPORT_CONFIG.default;
};

// Format duration from seconds to readable string
const formatDuration = (seconds) => {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Format distance from meters
const formatDistance = (meters) => {
  if (!meters) return null;
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

// Format pace (min/km) from speed (m/s)
const formatPace = (speedMs) => {
  if (!speedMs) return null;
  const paceSecondsPerKm = 1000 / speedMs;
  const paceMinutes = Math.floor(paceSecondsPerKm / 60);
  const paceSeconds = Math.round(paceSecondsPerKm % 60);
  return `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')} /km`;
};

// Format speed from m/s to km/h
const formatSpeed = (speedMs) => {
  if (!speedMs) return null;
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
};

// Stat card component
const StatCard = ({ icon: Icon, label, value, unit, color = 'text-gray-600' }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-900">
        {value}
        {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
};

export default function ExternalActivityModal({ activity, onClose }) {
  if (!activity) return null;

  const sportConfig = getSportConfig(activity.sportType);
  const SportIcon = sportConfig.icon;

  const activityDate = new Date(activity.startDate);
  const hasLocation = activity.city || activity.country;
  const isRunning = ['Run', 'TrailRun', 'Walk', 'Hike'].includes(activity.sportType);
  const isCycling = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide'].includes(activity.sportType);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className={`relative ${sportConfig.bgLight} p-6`}>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>

          {/* Sport type badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${sportConfig.color} text-white text-sm font-medium mb-3`}>
            <SportIcon className="w-4 h-4" />
            {activity.sportType}
          </div>

          {/* Activity name */}
          <h2 className="text-xl font-bold text-gray-900 mb-2 pr-8">
            {activity.name}
          </h2>

          {/* Date and location */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">
              {format(activityDate, 'EEEE, MMM d, yyyy')}
            </span>
            <span className="text-gray-400">
              {format(activityDate, 'h:mm a')}
            </span>
            {hasLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {[activity.city, activity.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Source badge */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">via</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-full text-xs font-medium text-gray-700 shadow-sm">
              {activity.source === 'strava' && (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="#FC4C02">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
                </svg>
              )}
              {activity.source.charAt(0).toUpperCase() + activity.source.slice(1)}
            </span>
            {activity.deviceName && (
              <span className="text-xs text-gray-400">• {activity.deviceName}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Primary metrics */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Clock}
              label="Duration"
              value={formatDuration(activity.movingTime)}
            />
            {activity.distance > 0 && (
              <StatCard
                icon={TrendingUp}
                label="Distance"
                value={formatDistance(activity.distance)}
              />
            )}
          </div>

          {/* Heart rate section */}
          {(activity.avgHeartRate || activity.maxHeartRate) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                Heart Rate
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {activity.avgHeartRate && (
                  <StatCard
                    icon={Heart}
                    label="Average"
                    value={Math.round(activity.avgHeartRate)}
                    unit="bpm"
                    color="text-red-500"
                  />
                )}
                {activity.maxHeartRate && (
                  <StatCard
                    icon={Heart}
                    label="Max"
                    value={Math.round(activity.maxHeartRate)}
                    unit="bpm"
                    color="text-red-600"
                  />
                )}
              </div>
            </div>
          )}

          {/* Speed/Pace section */}
          {(activity.avgSpeed || activity.maxSpeed) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                {isRunning ? 'Pace' : 'Speed'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {activity.avgSpeed && (
                  <StatCard
                    icon={Zap}
                    label="Average"
                    value={isRunning ? formatPace(activity.avgSpeed) : formatSpeed(activity.avgSpeed)}
                    color="text-yellow-600"
                  />
                )}
                {activity.maxSpeed && (
                  <StatCard
                    icon={Zap}
                    label="Max"
                    value={isRunning ? formatPace(activity.maxSpeed) : formatSpeed(activity.maxSpeed)}
                    color="text-yellow-600"
                  />
                )}
              </div>
            </div>
          )}

          {/* Power section (cycling) */}
          {(activity.avgPower || activity.normalizedPower) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-500" />
                Power
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {activity.avgPower && (
                  <StatCard
                    icon={Zap}
                    label="Average"
                    value={Math.round(activity.avgPower)}
                    unit="W"
                    color="text-purple-600"
                  />
                )}
                {activity.normalizedPower && (
                  <StatCard
                    icon={Zap}
                    label="Normalized"
                    value={Math.round(activity.normalizedPower)}
                    unit="W"
                    color="text-purple-600"
                  />
                )}
              </div>
            </div>
          )}

          {/* Additional metrics */}
          <div className="grid grid-cols-2 gap-3">
            {activity.elevationGain > 0 && (
              <StatCard
                icon={Mountain}
                label="Elevation"
                value={Math.round(activity.elevationGain)}
                unit="m"
                color="text-emerald-600"
              />
            )}
            {activity.calories > 0 && (
              <StatCard
                icon={Zap}
                label="Calories"
                value={Math.round(activity.calories)}
                unit="kcal"
                color="text-orange-500"
              />
            )}
            {activity.avgCadence && (
              <StatCard
                icon={Activity}
                label="Cadence"
                value={Math.round(activity.avgCadence)}
                unit={isRunning ? 'spm' : 'rpm'}
                color="text-blue-500"
              />
            )}
          </div>

          {/* Strava social */}
          {(activity.kudosCount > 0 || activity.achievementCount > 0) && (
            <div className="flex items-center gap-4 pt-2">
              {activity.kudosCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <span className="text-orange-500">👏</span>
                  {activity.kudosCount} kudos
                </div>
              )}
              {activity.achievementCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Award className="w-4 h-4 text-yellow-500" />
                  {activity.achievementCount} achievements
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {activity.description && (
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <p className="text-sm text-gray-600">{activity.description}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-white">
          {activity.stravaUrl && (
            <a
              href={activity.stravaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-[#FC4C02] hover:bg-[#e04502] text-white rounded-xl font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on Strava
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
