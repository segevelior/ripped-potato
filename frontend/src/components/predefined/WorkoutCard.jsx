import React, { useState, useEffect } from 'react';
import { Clock, Bookmark, Star } from 'lucide-react';
import { getDisciplineClass } from '@/styles/designTokens';
import SwipeableCard from '@/components/common/SwipeableCard';

// Placeholder images based on workout type
const getWorkoutImage = (workout) => {
  const discipline = workout.primary_disciplines?.[0]?.toLowerCase() || 'strength';

  const imageMap = {
    running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=500&fit=crop',
    cycling: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&h=500&fit=crop',
    strength: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=500&fit=crop',
    climbing: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=500&fit=crop',
    hiit: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=500&fit=crop',
    cardio: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=500&fit=crop',
    mobility: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=500&fit=crop',
    calisthenics: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800&h=500&fit=crop',
  };

  return workout.image || imageMap[discipline] || imageMap.strength;
};

export default function WorkoutCard({ workout, onView, onBookmark, isBookmarked: initialBookmarked, onDelete, onEdit }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked || false);

  useEffect(() => {
    setBookmarked(initialBookmarked || false);
  }, [initialBookmarked]);

  const handleBookmarkClick = (e) => {
    e.stopPropagation();
    setBookmarked(!bookmarked);
    if (onBookmark) {
      onBookmark(workout, !bookmarked);
    }
  };

  const handleCardClick = () => {
    if (onView) {
      onView(workout);
    }
  };

  const primaryDiscipline = workout.primary_disciplines?.[0] || 'Workout';
  const rating = workout.ratings?.average || 0;
  const ratingCount = workout.ratings?.count || 0;

  const cardContent = (
    <div
      onClick={handleCardClick}
      className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group"
    >
      {/* Image Section */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={getWorkoutImage(workout)}
          alt={workout.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Bookmark Button */}
        <button
          onClick={handleBookmarkClick}
          className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors z-10"
        >
          <Bookmark
            className={`w-5 h-5 ${bookmarked ? 'fill-accent text-accent' : 'text-gray-600'}`}
          />
        </button>
      </div>

      {/* Content Section */}
      <div className="p-5">
        {/* Category Badge */}
        {primaryDiscipline && (
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white mb-2 ${getDisciplineClass(primaryDiscipline)}`}>
            {primaryDiscipline.charAt(0).toUpperCase() + primaryDiscipline.slice(1)}
          </span>
        )}

        {/* Workout Name */}
        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-accent transition-colors">
          {workout.name}
        </h3>

        {/* Rating */}
        {rating > 0 && (
          <div className="flex items-center gap-1 mb-3">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-4 h-4 ${i < Math.floor(rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                  }`}
              />
            ))}
            {ratingCount > 0 && (
              <span className="text-sm text-gray-500 ml-1">({ratingCount})</span>
            )}
          </div>
        )}

        {/* Metadata Row */}
        <div className="flex items-center gap-4 text-sm text-gray-500">
          {/* Duration */}
          {workout.estimated_duration && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span className="font-medium">{workout.estimated_duration} min</span>
            </div>
          )}

          {/* Difficulty */}
          {workout.difficulty_level && (
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${workout.difficulty_level.toLowerCase() === 'beginner' ? 'bg-green-500' :
                  workout.difficulty_level.toLowerCase() === 'intermediate' ? 'bg-orange-500' :
                    'bg-red-500'
                }`} />
              <span className="font-medium capitalize">{workout.difficulty_level}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // If onDelete or onEdit is provided, wrap with SwipeableCard for swipe actions
  if (onDelete || onEdit) {
    return (
      <SwipeableCard
        onDelete={onDelete ? () => onDelete(workout) : undefined}
        onEdit={onEdit ? () => onEdit(workout) : undefined}
        className="rounded-3xl"
      >
        {cardContent}
      </SwipeableCard>
    );
  }

  return cardContent;
}