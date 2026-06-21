import WebSocket from 'ws';
import http from 'http';
import { TunnelClient } from './TunnelClient';

// Mock WebSocket
jest.mock('ws');
const MockedWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

describe('TunnelClient', () => {
  let mockWsInstance: any;
  let eventHandlers: Record<string, Function[]>;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    eventHandlers = {};
    mockWsInstance = {
      readyState: WebSocket.OPEN,
      binaryType: 'nodebuffer',
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn((event: string, handler: Function) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      }),
    };
    MockedWebSocket.mockImplementation(() => mockWsInstance);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function emit(event: string, ...args: any[]) {
    (eventHandlers[event] || []).forEach((h) => h(...args));
  }

  // ─── Frame Building ──────────────────────────────────

  it('builds a correct 13-byte frame header', () => {
    const client = new TunnelClient('https://cloud.example', 'token', 3100);
    // Access private method via any
    const frame = (client as any).buildFrame(2, 42, 0, 1, Buffer.from('hello'));
    expect(frame.length).toBe(13 + 5);
    expect(frame[0]).toBe(2);
    expect(frame.readUInt32BE(1)).toBe(42);
    expect(frame.readUInt32BE(5)).toBe(5);
    expect(frame.readUInt16BE(9)).toBe(0);
    expect(frame.readUInt16BE(11)).toBe(1);
    expect(frame.subarray(13).toString()).toBe('hello');
  });

  it('serializes headers with length prefix', () => {
    const client = new TunnelClient('https://cloud.example', 'token', 3100);
    const buf = (client as any).serializeHeaders(200, { 'content-type': 'application/json' });
    const metaLen = buf.readUInt32BE(0);
    const metaStr = buf.subarray(4, 4 + metaLen).toString('utf-8');
    const meta = JSON.parse(metaStr);
    expect(meta.status).toBe(200);
    expect(meta.headers['content-type']).toBe('application/json');
  });

  // ─── Connection ──────────────────────────────────────

  it('connects to wss:// when cloudUrl is https', async () => {
    const client = new TunnelClient('https://cloud.example', 'my-token', 3100);
    const connectPromise = client.connect();
    emit('open');
    await connectPromise;
    expect(MockedWebSocket).toHaveBeenCalledWith('wss://cloud.example/tunnel?token=my-token');
  });

  it('connects to ws:// when cloudUrl is http', async () => {
    const client = new TunnelClient('http://localhost:4000', 'token', 3100);
    const connectPromise = client.connect();
    emit('open');
    await connectPromise;
    expect(MockedWebSocket).toHaveBeenCalledWith('ws://localhost:4000/tunnel?token=token');
  });

  it('does not reconnect on intentional close', async () => {
    const client = new TunnelClient('https://cloud.example', 'token', 3100);
    const connectPromise = client.connect();
    emit('open');
    await connectPromise;

    client.close();
    emit('close');

    jest.advanceTimersByTime(60000);
    // Should only have been constructed once
    expect(MockedWebSocket).toHaveBeenCalledTimes(1);
  });

  // ─── Frame Handling ──────────────────────────────────

  it('responds to PING with PONG', async () => {
    const client = new TunnelClient('https://cloud.example', 'token', 3100);
    const connectPromise = client.connect();
    emit('open');
    await connectPromise;

    const pingFrame = Buffer.alloc(13);
    pingFrame[0] = 3; // PING
    pingFrame.writeUInt32BE(0, 1);
    pingFrame.writeUInt32BE(0, 5);
    pingFrame.writeUInt16BE(0, 9);
    pingFrame.writeUInt16BE(1, 11);

    emit('message', pingFrame);

    expect(mockWsInstance.send).toHaveBeenCalled();
    const sent = mockWsInstance.send.mock.calls[0][0] as Buffer;
    expect(sent[0]).toBe(4); // PONG
  });

  it('returns 400 for a malformed HTTP_REQ frame', async () => {
    const client = new TunnelClient('https://cloud.example', 'token', 3100);
    const connectPromise = client.connect();
    emit('open');
    await connectPromise;

    // Invalid JSON in payload
    const payload = Buffer.alloc(4);
    payload.writeUInt32BE(5, 0); // meta length = 5
    const badFrame = Buffer.concat([
      Buffer.from([1, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 1]), // type=1, reqId=0, payloadLen=9
      payload,
      Buffer.from('hello'), // not valid JSON
    ]);

    emit('message', badFrame);

    // Should have sent an HTTP_RES with status 400
    expect(mockWsInstance.send).toHaveBeenCalled();
    const sent = mockWsInstance.send.mock.calls[0][0] as Buffer;
    expect(sent[0]).toBe(2); // HTTP_RES
  });

  it('strips hop-by-hop headers from deserialized requests', async () => {
    jest.useRealTimers();
    const client = new TunnelClient('https://cloud.example', 'token', 3100);
    const meta = JSON.stringify({
      method: 'GET',
      path: '/api/circles',
      headers: { host: 'localhost:3100', connection: 'keep-alive', upgrade: 'websocket' },
    });
    const metaBuf = Buffer.from(meta, 'utf-8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(metaBuf.length, 0);
    const payload = Buffer.concat([lenBuf, metaBuf]);

    const frame = Buffer.concat([
      (client as any).buildFrame(1, 1, 0, 1, payload),
    ]);

    // Mock http.request to capture what headers are forwarded
    const mockReq = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };
    const mockRequestFn = jest.spyOn(http, 'request').mockImplementation((_opts: any, cb?: any) => {
      if (cb) {
        setImmediate(() => {
          const dataHandlers: Function[] = [];
          const endHandlers: Function[] = [];
          const mockRes = {
            statusCode: 200,
            headers: {},
            on: jest.fn((event: string, handler: Function) => {
              if (event === 'data') dataHandlers.push(handler);
              if (event === 'end') endHandlers.push(handler);
            }),
            emit: jest.fn((event: string, ...args: any[]) => {
              if (event === 'data') dataHandlers.forEach((h) => h(...args));
              if (event === 'end') endHandlers.forEach((h) => h(...args));
            }),
          };
          cb(mockRes);
          setImmediate(() => {
            mockRes.emit('end');
          });
        });
      }
      return mockReq as any;
    });

    const connectPromise = client.connect();
    emit('open');
    await connectPromise;
    emit('message', frame);

    // Wait for async http.request and response
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const callOpts = mockRequestFn.mock.calls[0][0] as any;
    expect(callOpts.headers).not.toHaveProperty('connection');
    expect(callOpts.headers).not.toHaveProperty('upgrade');
    expect(callOpts.headers).toHaveProperty('host');

    mockRequestFn.mockRestore();
  });
});
