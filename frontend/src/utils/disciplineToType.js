// Maps a discipline name to a valid workout type accepted by the backend
// (e.g. yoga/stretching normalize to flexibility). Shared by the calendar
// session-selection modal and chat action buttons.
export const disciplineToType = {
  'calisthenics': 'calisthenics',
  'strength': 'strength',
  'cardio': 'cardio',
  'hiit': 'hiit',
  'yoga': 'flexibility',
  'stretching': 'flexibility',
  'flexibility': 'flexibility',
  'mobility': 'mobility',
  'recovery': 'recovery',
  'hybrid': 'hybrid'
};
