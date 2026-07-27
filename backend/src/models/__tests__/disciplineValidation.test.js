/**
 * Discipline vocabulary enforcement on Exercise / SessionTemplate:
 * known legacy synonyms are normalized by the schema setter, anything still
 * off-vocab after normalization fails validation.
 */
const Exercise = require('../Exercise');
const SessionTemplate = require('../SessionTemplate');

describe('Exercise.discipline canonical enforcement', () => {
  test('legacy synonyms normalize instead of rejecting', () => {
    const doc = new Exercise({
      name: 'Deadlift', muscles: ['back'],
      discipline: ['Powerlifting', 'Strength Training', 'endurance'],
    });
    expect([...doc.discipline]).toEqual(['strength', 'cardio']);
    const err = doc.validateSync();
    expect(err?.errors && Object.keys(err.errors).some((k) => k.startsWith('discipline'))).toBeFalsy();
  });

  test('case-folds to canonical', () => {
    const doc = new Exercise({ name: 'Cat-Cow', muscles: ['back'], discipline: ['Mobility'] });
    expect([...doc.discipline]).toEqual(['mobility']);
  });

  test('unmappable legacy values fail validation', () => {
    const doc = new Exercise({ name: 'Old Doc', muscles: ['full_body'], discipline: ['warm_up'] });
    const err = doc.validateSync();
    expect(Object.keys(err.errors).some((k) => k.startsWith('discipline'))).toBe(true);
  });
});

describe('SessionTemplate.primary_disciplines canonical enforcement', () => {
  test('legacy synonyms normalize', () => {
    const doc = new SessionTemplate({ primary_disciplines: ['Conditioning', 'Calisthenics'] });
    expect([...doc.primary_disciplines]).toEqual(['cardio', 'calisthenics']);
    const err = doc.validateSync();
    expect(err?.errors && Object.keys(err.errors).some((k) => k.startsWith('primary_disciplines'))).toBeFalsy();
  });

  test('off-vocab values fail validation', () => {
    const doc = new SessionTemplate({ primary_disciplines: ['General Fitness'] });
    const err = doc.validateSync();
    expect(Object.keys(err.errors).some((k) => k.startsWith('primary_disciplines'))).toBe(true);
  });
});
