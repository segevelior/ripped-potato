import { useState, useEffect } from 'react';
import { Exercise } from '../api';

function Exercises() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const data = await Exercise.list();
      setExercises(data);
    } catch (err) {
      console.error('Error fetching exercises:', err);
      setError(err.message || 'Failed to load exercises');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await Exercise.delete(id);
      await fetchExercises(); // Refresh the list
      alert('Exercise deleted successfully');
    } catch (err) {
      console.error('Error deleting exercise:', err);
      alert('Failed to delete exercise');
    }
  };

  if (loading) {
    return <div className="p-8">Loading exercises...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600">Error: {error}</p>
        <button 
          onClick={fetchExercises}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Exercises</h1>
        <a 
          href="/exercises/create"
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Create Exercise
        </a>
      </div>

      {exercises.length === 0 ? (
        <p className="text-gray-500">No exercises found. Create your first exercise!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exercises.map((exercise) => (
            <div 
              key={exercise.id}
              className="p-4 border rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-2">{exercise.name}</h3>
              
              {exercise.description && (
                <p className="text-gray-600 mb-3 text-sm">{exercise.description}</p>
              )}

              <div className="space-y-2 text-sm">
                {exercise.muscles && exercise.muscles.length > 0 && (
                  <div>
                    <span className="font-medium">Muscles: </span>
                    <span className="text-gray-600">{exercise.muscles.join(', ')}</span>
                  </div>
                )}

                {exercise.discipline && exercise.discipline.length > 0 && (
                  <div>
                    <span className="font-medium">Discipline: </span>
                    <span className="text-gray-600">{exercise.discipline.join(', ')}</span>
                  </div>
                )}

                {exercise.equipment && exercise.equipment.length > 0 && (
                  <div>
                    <span className="font-medium">Equipment: </span>
                    <span className="text-gray-600">{exercise.equipment.join(', ')}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <a 
                  href={`/exercises/edit/${exercise.id}`}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  Edit
                </a>
                <button 
                  onClick={() => handleDelete(exercise.id, exercise.name)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Exercises; 