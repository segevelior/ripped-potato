import React, { useState } from "react";
import { X, Dumbbell, Target, Zap, Timer, Info, Activity, TrendingUp, AlertCircle, Star } from "lucide-react";

const intensityColors = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  max: "bg-red-100 text-red-800"
};

const loadColors = {
  bodyweight: "bg-blue-100 text-blue-800",
  light: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  heavy: "bg-red-100 text-red-800"
};

const difficultyColors = {
  beginner: "bg-green-100 text-green-800 border-green-300",
  intermediate: "bg-yellow-100 text-yellow-800 border-yellow-300",
  advanced: "bg-red-100 text-red-800 border-red-300"
};

export default function ExerciseDetailModal({ exercise, onClose, onEdit, onToggleFavorite }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!exercise) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-3xl font-bold text-gray-900">
                  {exercise.name}
                </h2>
                <button
                  onClick={() => onToggleFavorite(exercise)}
                  className={`p-2 rounded-lg transition-colors ${
                    exercise.userMetadata?.isFavorite 
                      ? 'text-yellow-500 hover:text-yellow-600 bg-yellow-50' 
                      : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-50'
                  }`}
                  title="Toggle favorite"
                >
                  <Star className="w-6 h-6" fill={exercise.userMetadata?.isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              
              {/* Always show description, even if it's empty */}
              <div className="mb-4">
                {exercise.description ? (
                  <p className="text-lg text-gray-700 leading-relaxed">
                    {exercise.description}
                  </p>
                ) : (
                  <p className="text-lg text-gray-500 italic">
                    No description available for this exercise.
                  </p>
                )}
              </div>
              
              {/* Key Attributes */}
              <div className="flex flex-wrap gap-2">
                {/* Exercise Type Badges */}
                {exercise.isCommon && !exercise.isModified && (
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    Common Exercise
                  </span>
                )}
                {exercise.isModified && (
                  <span className="px-3 py-1.5 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                    Customized
                  </span>
                )}
                {!exercise.isCommon && (
                  <span className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                    Private Exercise
                  </span>
                )}
                
                {/* Difficulty */}
                {exercise.difficulty && (
                  <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${difficultyColors[exercise.difficulty]}`}>
                    {exercise.difficulty.charAt(0).toUpperCase() + exercise.difficulty.slice(1)}
                  </span>
                )}
              </div>
            </div>
            
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/50 transition-colors">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex">
            {["overview", "instructions", "details"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === tab
                    ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Exercise Description Box - Prominent display */}
              {exercise.description && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <h3 className="font-bold text-lg text-gray-900 mb-2 flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-600" />
                    Exercise Details
                  </h3>
                  <p className="text-gray-800 leading-relaxed text-base">
                    {exercise.description}
                  </p>
                </div>
              )}

              {/* Muscle Groups */}
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-600" />
                  Target Muscles
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {exercise.muscles && exercise.muscles.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Primary Muscles</h4>
                      <div className="flex flex-wrap gap-2">
                        {exercise.muscles.map((muscle, i) => (
                          <span key={i} className="px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                            {muscle.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Secondary Muscles</h4>
                      <div className="flex flex-wrap gap-2">
                        {exercise.secondaryMuscles.map((muscle, i) => (
                          <span key={i} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm">
                            {muscle.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Equipment & Disciplines */}
              <div className="grid md:grid-cols-2 gap-6">
                {exercise.equipment && exercise.equipment.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                      <Dumbbell className="w-5 h-5 text-purple-600" />
                      Equipment Required
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {exercise.equipment.map((eq, i) => (
                        <span key={i} className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {exercise.discipline && exercise.discipline.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-indigo-600" />
                      Disciplines
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {exercise.discipline.map((disc, i) => (
                        <span key={i} className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                          {disc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Strain Information */}
              {exercise.strain && (
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-orange-600" />
                    Exercise Strain & Volume
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {exercise.strain.intensity && (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Intensity</div>
                          <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-medium ${intensityColors[exercise.strain.intensity]}`}>
                            {exercise.strain.intensity}
                          </span>
                        </div>
                      )}
                      {exercise.strain.load && (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Load Type</div>
                          <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-medium ${loadColors[exercise.strain.load]}`}>
                            {exercise.strain.load}
                          </span>
                        </div>
                      )}
                      {exercise.strain.duration_type && (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Measured By</div>
                          <span className="inline-block px-3 py-1.5 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                            {exercise.strain.duration_type}
                          </span>
                        </div>
                      )}
                      {exercise.strain.typical_volume && (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Typical Volume</div>
                          <span className="inline-block px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                            {exercise.strain.typical_volume}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Progression Information */}
              {exercise.progression_group && (
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    Progression Path
                  </h3>
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Progression Group</div>
                        <div className="font-semibold text-gray-900">{exercise.progression_group}</div>
                      </div>
                      {exercise.progression_level && (
                        <div className="text-right">
                          <div className="text-sm text-gray-600 mb-1">Current Level</div>
                          <div className="text-2xl font-bold text-green-600">Level {exercise.progression_level}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "instructions" && (
            <div className="space-y-6">
              {/* Instructions */}
              {exercise.instructions && exercise.instructions.length > 0 && (
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-600" />
                    How to Perform
                  </h3>
                  <ol className="space-y-3">
                    {exercise.instructions.map((instruction, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center font-semibold text-sm">
                          {i + 1}
                        </span>
                        <p className="text-gray-700 leading-relaxed pt-1">{instruction}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Tips */}
              {exercise.tips && exercise.tips.length > 0 && (
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    Pro Tips
                  </h3>
                  <div className="bg-yellow-50 rounded-xl p-4 space-y-2">
                    {exercise.tips.map((tip, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-yellow-600 mt-0.5">•</span>
                        <p className="text-gray-700">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Mistakes */}
              {exercise.commonMistakes && exercise.commonMistakes.length > 0 && (
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                    <X className="w-5 h-5 text-red-600" />
                    Common Mistakes to Avoid
                  </h3>
                  <div className="bg-red-50 rounded-xl p-4 space-y-2">
                    {exercise.commonMistakes.map((mistake, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-red-600 mt-0.5">✕</span>
                        <p className="text-gray-700">{mistake}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "details" && (
            <div className="space-y-6">
              {/* User Metadata */}
              {exercise.userMetadata && (
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-3">Your Stats</h3>
                  <div className="bg-blue-50 rounded-xl p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {exercise.userMetadata.timesCompleted !== undefined && (
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Times Completed</div>
                          <div className="text-2xl font-bold text-blue-600">{exercise.userMetadata.timesCompleted}</div>
                        </div>
                      )}
                      {exercise.userMetadata.personalRecord && (
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Personal Record</div>
                          <div className="text-xl font-bold text-green-600">{exercise.userMetadata.personalRecord}</div>
                        </div>
                      )}
                      {exercise.userMetadata.lastPerformed && (
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Last Performed</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {new Date(exercise.userMetadata.lastPerformed).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Metadata */}
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-3">Additional Information</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {exercise.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Created</span>
                      <span className="font-medium">{new Date(exercise.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  {exercise.updatedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Updated</span>
                      <span className="font-medium">{new Date(exercise.updatedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Exercise ID</span>
                    <span className="font-mono text-xs">{exercise.id}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-100 bg-white">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {exercise.isModified && "This is a customized version of a common exercise"}
              {!exercise.isCommon && "This is your private exercise"}
              {exercise.isCommon && !exercise.isModified && "This is a common exercise available to all users"}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onEdit(exercise);
                  onClose();
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {exercise.isCommon && !exercise.isModified ? 'Customize' : 'Edit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}