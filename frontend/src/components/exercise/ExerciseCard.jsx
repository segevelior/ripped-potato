import React, { useState, useEffect } from 'react';
import { Dumbbell, Target, Star, Activity } from 'lucide-react';
import { getDisciplineClass } from '@/styles/designTokens';

const getDifficultyColor = (level) => {
  switch (level?.toLowerCase()) {
    case 'beginner': return 'bg-green-500';
    case 'intermediate': return 'bg-orange-500';
    case 'advanced': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

export default function ExerciseCard({ exercise, onClick, onToggleFavorite }) {
  const [isFavorite, setIsFavorite] = useState(exercise.userMetadata?.isFavorite || false);

  useEffect(() => {
    setIsFavorite(exercise.userMetadata?.isFavorite || false);
  }, [exercise.userMetadata?.isFavorite]);

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    const newStatus = !isFavorite;
    setIsFavorite(newStatus);
    if (onToggleFavorite) {
      onToggleFavorite(exercise);
    }
  };

  const primaryMuscle = exercise.muscles?.[0] || 'Full Body';
  const discipline = exercise.discipline?.[0] || 'Fitness';
  const hasImage = !!exercise.image;

  return (
    <div
      onClick={() => onClick(exercise)}
      className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group h-full flex flex-col border border-gray-100"
    >
      {/* Image Section - Only render if image exists */}
      {hasImage && (
        <div className="relative h-48 overflow-hidden shrink-0">
          <img
            src={exercise.image}
            alt={exercise.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />

          {/* Badge Overlay */}
          <div className="absolute bottom-4 left-4">
            <span className={`px-3 py-1 rounded-full text-xs font-bold text-white capitalize ${getDisciplineClass(discipline)}`}>
              {discipline}
            </span>
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="p-5 flex flex-col flex-1 relative">
        {/* Favorite Button - Position depends on image presence */}
        <button
          onClick={handleFavoriteClick}
          className={`absolute ${hasImage ? '-top-5 right-4' : 'top-4 right-4'} w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors z-10 border border-gray-100`}
        >
          <Star
            className={`w-5 h-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`}
          />
        </button>

        <div className="flex-1 pt-2">
          {!hasImage && (
            <div className="mb-2">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white capitalize ${getDisciplineClass(discipline)}`}>
                {discipline}
              </span>
            </div>
          )}

          <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-[#FE755D] transition-colors pr-8">
            {exercise.name}
          </h3>

          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Target className="w-4 h-4 text-gray-400" />
            <span className="capitalize">{primaryMuscle.replace('_', ' ')}</span>
          </div>
        </div>

        {/* Footer Metadata */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
          {/* Difficulty */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getDifficultyColor(exercise.difficulty)}`} />
            <span className="text-xs font-medium text-gray-500 capitalize">
              {exercise.difficulty || 'General'}
            </span>
          </div>

          {/* Equipment Icon (if any) */}
          {exercise.equipment?.length > 0 && (
            <div className="flex items-center gap-1.5 text-gray-400" title={exercise.equipment.join(', ')}>
              <Dumbbell className="w-4 h-4" />
              <span className="text-xs font-medium">{exercise.equipment.length}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
