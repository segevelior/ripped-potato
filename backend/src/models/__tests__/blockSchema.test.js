/**
 * Typed session blocks: legacy {name, exercises} blocks stay valid and read
 * as straight_sets, structured fields validate, junk is rejected.
 */
const mongoose = require('mongoose');
const SessionTemplate = require('../SessionTemplate');
const { BLOCK_TYPES } = SessionTemplate;

const baseTemplate = (blocks) => new SessionTemplate({
  name: 'Test Session',
  estimated_duration: 45,
  difficulty_level: 'beginner',
  blocks,
});

const exercise = {
  exercise_id: new mongoose.Types.ObjectId(),
  exercise_name: 'Push Up',
  volume: '3x10',
  rest: '60s',
};

describe('SessionTemplate blockSchema typed fields', () => {
  test('legacy typeless block validates and defaults to straight_sets / 1 round', () => {
    const doc = baseTemplate([{ name: 'Main Block', exercises: [exercise] }]);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.blocks[0].type).toBe('straight_sets');
    expect(doc.blocks[0].rounds).toBe(1);
    expect(doc.blocks[0].work_seconds).toBeUndefined();
  });

  test('every declared block type validates', () => {
    for (const type of BLOCK_TYPES) {
      const doc = baseTemplate([{ name: 'B', type, exercises: [exercise] }]);
      expect(doc.validateSync()).toBeUndefined();
    }
  });

  test('tabata block carries rounds/work/rest', () => {
    const doc = baseTemplate([{
      name: 'Bike Tabata',
      type: 'tabata',
      rounds: 8,
      work_seconds: 20,
      rest_seconds: 10,
      instructions: 'All-out effort on the work intervals',
      exercises: [exercise],
    }]);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.blocks[0].rounds).toBe(8);
    expect(doc.blocks[0].work_seconds).toBe(20);
    expect(doc.blocks[0].rest_seconds).toBe(10);
  });

  test('unknown block type fails validation', () => {
    const doc = baseTemplate([{ name: 'B', type: 'supersets', exercises: [exercise] }]);
    const err = doc.validateSync();
    expect(Object.keys(err.errors).some((k) => k.includes('blocks.0.type'))).toBe(true);
  });

  test('rounds below 1 fails validation', () => {
    const doc = baseTemplate([{ name: 'B', type: 'circuit', rounds: 0, exercises: [exercise] }]);
    const err = doc.validateSync();
    expect(Object.keys(err.errors).some((k) => k.includes('blocks.0.rounds'))).toBe(true);
  });

  test('rest_seconds of 0 is allowed (back-to-back intervals)', () => {
    const doc = baseTemplate([{ name: 'B', type: 'interval', rounds: 3, rest_seconds: 0, exercises: [exercise] }]);
    expect(doc.validateSync()).toBeUndefined();
  });
});
