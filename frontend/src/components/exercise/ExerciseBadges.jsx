import React from 'react';

const BadgeTypes = {
  COMMON: { icon: '🌐', text: 'Common', className: 'bg-blue-100 text-blue-800' },
  PRIVATE: { icon: '🔒', text: 'Private', className: 'bg-gray-100 text-gray-700' },
  MODIFIED: { icon: '✏️', text: 'Modified', className: 'bg-orange-100 text-orange-800' },
  FAVORITE: { icon: '⭐', text: '', className: 'bg-yellow-100 text-yellow-700' }
};

export default function ExerciseBadges({ exercise }) {
  const badges = [];
  
  // Determine which badges to show
  if (exercise.isCommon && !exercise.isModified) {
    badges.push(BadgeTypes.COMMON);
  } else if (!exercise.isCommon) {
    badges.push(BadgeTypes.PRIVATE);
  }
  
  if (exercise.isModified) {
    badges.push(BadgeTypes.MODIFIED);
  }
  
  if (exercise.userMetadata?.isFavorite) {
    badges.push(BadgeTypes.FAVORITE);
  }
  
  if (badges.length === 0) return null;
  
  return (
    <div className="flex gap-1">
      {badges.map((badge, index) => (
        <span
          key={index}
          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${badge.className}`}
        >
          <span>{badge.icon}</span>
          {badge.text && <span>{badge.text}</span>}
        </span>
      ))}
    </div>
  );
}