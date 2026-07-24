const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clearRateLimitBuckets,
  createRateLimiter,
  securityHeaders
} = require('../middleware/security');

function responseStub() {
  const headers = new Map();
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('安全中间件设置浏览器安全响应头', () => {
  const response = responseStub();
  let nextCalled = false;

  securityHeaders({}, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
});

test('限流器在超过额度后返回 429', () => {
  clearRateLimitBuckets();
  const limiter = createRateLimiter({
    prefix: 'unit-test',
    windowMs: 60000,
    max: 2,
    methods: ['POST']
  });
  const request = {
    method: 'POST',
    ip: '127.0.0.10',
    socket: {}
  };
  let passed = 0;

  const first = responseStub();
  limiter(request, first, () => { passed += 1; });
  const second = responseStub();
  limiter(request, second, () => { passed += 1; });
  const third = responseStub();
  limiter(request, third, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(third.statusCode, 429);
  assert.equal(third.headers.get('ratelimit-remaining'), '0');
  assert.ok(Number(third.headers.get('retry-after')) > 0);
  assert.match(third.body.message, /请求过于频繁/);
  clearRateLimitBuckets();
});

test('限流器忽略未配置的方法', () => {
  clearRateLimitBuckets();
  const limiter = createRateLimiter({
    prefix: 'method-test',
    windowMs: 60000,
    max: 1,
    methods: ['POST']
  });
  const response = responseStub();
  let passed = false;

  limiter({ method: 'GET', ip: '127.0.0.11' }, response, () => {
    passed = true;
  });

  assert.equal(passed, true);
  assert.equal(response.headers.has('ratelimit-limit'), false);
});
