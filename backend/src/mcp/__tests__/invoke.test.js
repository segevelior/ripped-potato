const { body } = require('express-validator');
const { callController, toToolResult, runTool } = require('../invoke');
const { validationResult } = require('express-validator');

describe('MCP controller bridge (invoke.js)', () => {
  test('captures a success response and its status code', async () => {
    const handler = (req, res) => res.status(200).json({ success: true, data: { id: 'w1' } });
    const result = await callController(handler, { user: { _id: 'u1' } });
    expect(result).toEqual({ statusCode: 200, payload: { success: true, data: { id: 'w1' } } });

    const tool = toToolResult(result);
    expect(tool.isError).toBeFalsy();
    expect(JSON.parse(tool.content[0].text)).toEqual({ id: 'w1' });
  });

  test('chainable res.status(201).json(...) preserves the status', async () => {
    const handler = (req, res) => res.status(201).json({ success: true, data: { created: true } });
    const result = await callController(handler, {});
    expect(result.statusCode).toBe(201);
  });

  test('maps a 4xx { success:false } response to a tool error', async () => {
    const handler = (req, res) => res.status(404).json({ success: false, message: 'Workout not found' });
    const tool = toToolResult(await callController(handler, {}));
    expect(tool.isError).toBe(true);
    expect(tool.content[0].text).toBe('Error: Workout not found');
  });

  test('treats { success:false } as an error even on a 200 status', async () => {
    const handler = (req, res) => res.status(200).json({ success: false, message: 'nope' });
    const tool = toToolResult(await callController(handler, {}));
    expect(tool.isError).toBe(true);
  });

  test('runs express-validator chains against the same req the handler reads', async () => {
    // Handler mimics real controllers: reads validationResult(req).
    const handler = (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
      }
      return res.status(201).json({ success: true, data: { ok: true } });
    };
    const validators = [body('title').trim().isLength({ min: 2 }).withMessage('title too short')];

    // Invalid input → validators populate req, handler returns 400.
    const bad = toToolResult(await callController(handler, { body: { title: 'x' } }, validators));
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain('title too short');

    // Valid input → handler returns success.
    const good = toToolResult(await callController(handler, { body: { title: 'Leg day' } }, validators));
    expect(good.isError).toBeFalsy();
  });

  test('captures a thrown controller error as a 500 tool error', async () => {
    const handler = () => { throw new Error('boom'); };
    const result = await callController(handler, {});
    expect(result.statusCode).toBe(500);
    const tool = toToolResult(result);
    expect(tool.isError).toBe(true);
    expect(tool.content[0].text).toContain('boom');
  });

  test('captures async controller rejections as a 500', async () => {
    const handler = async () => { await Promise.resolve(); throw new Error('async boom'); };
    const result = await callController(handler, {});
    expect(result.statusCode).toBe(500);
  });

  test('runTool applies a transform to the success data', async () => {
    const handler = (req, res) => res.status(200).json({ success: true, data: { exercises: [{ _id: 'e1', extra: 'drop' }] } });
    const tool = await runTool(handler, {}, {
      transform: (d) => ({ exercises: d.exercises.map((e) => ({ _id: e._id })) })
    });
    expect(JSON.parse(tool.content[0].text)).toEqual({ exercises: [{ _id: 'e1' }] });
  });

  test('joins express-validator error messages in the tool error', async () => {
    const payload = { success: false, errors: [{ msg: 'a bad' }, { msg: 'b bad' }] };
    const tool = toToolResult({ statusCode: 400, payload });
    expect(tool.content[0].text).toBe('Error: a bad; b bad');
  });
});
