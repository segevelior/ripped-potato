import React from 'react';

const FilterOptions = [
  { value: 'all', label: 'All Exercises', icon: null },
  { value: 'common', label: 'Common', icon: '🌐' },
  { value: 'private', label: 'My Exercises', icon: '🔒' },
  { value: 'modified', label: 'Customized', icon: '✏️' },
  { value: 'favorites', label: 'Favorites', icon: '⭐' }
];

export default function ExerciseFilters({ activeFilter, onFilterChange, counts = {} }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FilterOptions.map(filter => (
        <button
          key={filter.value}
          onClick={() => onFilterChange(filter.value)}
          className={`
            inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
            border transition-all duration-200
            ${activeFilter === filter.value
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }
          `}
        >
          {filter.icon && <span className="text-base">{filter.icon}</span>}
          <span>{filter.label}</span>
          {counts[filter.value] !== undefined && (
            <span className={`
              ml-1 px-2 py-0.5 text-xs rounded-full
              ${activeFilter === filter.value
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600'
              }
            `}>
              {counts[filter.value]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}