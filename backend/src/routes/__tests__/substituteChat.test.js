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

describe('POST /exercises/substitute/chat', () => {
  it('400s when message is missing', async () => {
    const res = await request(app).post('/exercises/substitute/chat').send({ history: [] });
    expect(res.status).toBe(400);
    expect(aiCalls).toHaveLength(0);
  });

  it('400s when message is blank', async () => {
    const res = await request(app).post('/exercises/substitute/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(aiCalls).toHaveLength(0);
  });

  it('forwards the request and returns the AI service response verbatim', async () => {
    const payload = { reply: 'Try chin-ups.', options: [], fallback: false };
    aiResponder = () => ({ payload });

    const res = await request(app)
      .post('/exercises/substitute/chat')
      .set('Authorization', 'Bearer token-123')
      .send({ exercise_id: 'bbbbbbbbbbbbbbbbbbbbbbbb', message: 'I want variety', history: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(aiCalls).toHaveLength(1);
    expect(aiCalls[0].path).toBe('/api/v1/exercises/substitute/chat');
    expect(aiCalls[0].headers.authorization).toBe('Bearer token-123');
    expect(aiCalls[0].body.message).toBe('I want variety');
  });

  it('slices history to the last 8 messages before forwarding', async () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));

    await request(app)
      .post('/exercises/substitute/chat')
      .send({ message: 'and now?', history });

    expect(aiCalls[0].body.history).toHaveLength(8);
    expect(aiCalls[0].body.history[0].content).toBe('msg 4');
  });

  it('drops a non-array history instead of forwarding it', async () => {
    await request(app)
      .post('/exercises/substitute/chat')
      .send({ message: 'hello', history: 'not-an-array' });

    expect(aiCalls[0].body.history).toEqual([]);
  });

  it('500s with the error envelope when the AI service fails', async () => {
    aiResponder = () => ({ status: 500, payload: { detail: 'boom' } });

    const res = await request(app)
      .post('/exercises/substitute/chat')
      .send({ message: 'hello' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
