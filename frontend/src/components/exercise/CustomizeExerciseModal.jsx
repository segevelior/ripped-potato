import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function CustomizeExerciseModal({ exercise, isOpen, onClose, onSave }) {
  const [modifications, setModifications] = useState({
    name: exercise.userMetadata?.customName || '',
    description: exercise.userMetadata?.customDescription || '',
    personalNotes: exercise.userMetadata?.personalNotes || ''
  });
  
  const [metadata, setMetadata] = useState({
    isFavorite: exercise.userMetadata?.isFavorite || false,
    tags: exercise.userMetadata?.tags || []
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Only include fields that have been modified
    const changedModifications = {};
    if (modifications.name && modifications.name !== exercise.name) {
      changedModifications.name = modifications.name;
    }
    if (modifications.description && modifications.description !== exercise.description) {
      changedModifications.description = modifications.description;
    }
    if (modifications.personalNotes) {
      changedModifications.personalNotes = modifications.personalNotes;
    }
    
    onSave({
      modifications: changedModifications,
      metadata
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Customize Exercise
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              You're creating a personal version of this common exercise. 
              Only you will see these changes. The original exercise will remain unchanged for other users.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Name (optional)
              </label>
              <input
                type="text"
                value={modifications.name}
                onChange={(e) => setModifications({ ...modifications, name: e.target.value })}
                placeholder={exercise.name}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to keep the original name: "{exercise.name}"
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Description (optional)
              </label>
              <textarea
                value={modifications.description}
                onChange={(e) => setModifications({ ...modifications, description: e.target.value })}
                placeholder={exercise.description || "Add your own description"}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Personal Notes
              </label>
              <textarea
                value={modifications.personalNotes}
                onChange={(e) => setModifications({ ...modifications, personalNotes: e.target.value })}
                placeholder="Add notes for yourself (form cues, reminders, etc.)"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={metadata.isFavorite}
                  onChange={(e) => setMetadata({ ...metadata, isFavorite: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Mark as favorite ⭐
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Save Customization
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}