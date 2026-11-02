jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    req.user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'user' };
    next();
  },
  optionalAuth: (req, res, next) => next()
}));
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

const express = require('express');
const request = require('supertest');
const http = require('http');

// A real local HTTP server standing in for the AI coach service — the proxy
// reads AI_SERVICE_URL at module load, so the router is required only after
// the fake server has a port.
let app;
let fakeAi;
const aiCalls = [];
let aiResponder = null; // () => ({ status, payload })

beforeAll((done) => {
  fakeAi = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      aiCalls.push({ path: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      const { status = 200, payload = { reply: 'ok', options: [] } } = aiResponder ? aiResponder() : {};
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  fakeAi.listen(0, '127.0.0.1', () => {
    process.env.AI_SERVICE_URL = `http://127.0.0.1:${fakeAi.address().port}`;
    const router = require('../ai');
    app = express();
    app.use(express.json());
    app.use('/', router);
    done();
  });
});

afterAll((done) => {
  // Drop kept-alive proxy connections so close() can finish.
  fakeAi.closeAllConnections?.();
  fakeAi.close(() => done());
});

beforeEach(() => {
  aiCalls.length = 0;
  aiResponder = null;
});

describe('POST /exercises/describe', () => {
  it('400s when text is missing or blank', async () => {
    expect((await request(app).post('/exercises/describe').send({})).status).toBe(400);
    expect((await request(app).post('/exercises/describe').send({ text: '  ' })).status).toBe(400);
    expect(aiCalls).toHaveLength(0);
  });

  it('400s on oversized text', async () => {
    const res = await request(app).post('/exercises/describe').send({ text: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(aiCalls).toHaveLength(0);
  });

  it('forwards text + auth and returns the AI response verbatim', async () => {
    const payload = { status: 'matched', name: 'Bench Press', exercise_id: 'b'.repeat(24), sets: [] };
    aiResponder = () => ({ payload });

    const res = await request(app)
      .post('/exercises/describe')
      .set('Authorization', 'Bearer token-123')
      .send({ text: 'bench 3x8', extra: 'dropped' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(aiCalls[0].path).toBe('/api/v1/exercises/describe');
    expect(aiCalls[0].headers.authorization).toBe('Bearer token-123');
    expect(aiCalls[0].body).toEqual({ text: 'bench 3x8' });
  });

  it('500s with the error envelope when the AI service fails', async () => {
    aiResponder = () => ({ status: 500, payload: { detail: 'boom' } });
    const res = await request(app).post('/exercises/describe').send({ text: 'bench 3x8' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /exercises/describe/commit', () => {
  it('400s when name is missing', async () => {
    const res = await request(app).post('/exercises/describe/commit').send({ muscles: ['chest'] });
    expect(res.status).toBe(400);
    expect(aiCalls).toHaveLength(0);
  });

  it('forwards a trimmed name and only string list entries', async () => {
    aiResponder = () => ({ payload: { exercise_id: 'c'.repeat(24), name: 'Zercher Carry' } });

    const res = await request(app)
      .post('/exercises/describe/commit')
      .send({ name: '  Zercher Carry ', muscles: ['abs', 7, null], discipline: 'strength' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Zercher Carry');
    expect(aiCalls[0].path).toBe('/api/v1/exercises/describe/commit');
    expect(aiCalls[0].body).toEqual({ name: 'Zercher Carry', muscles: ['abs'], discipline: [], equipment: [] });
  });
});
