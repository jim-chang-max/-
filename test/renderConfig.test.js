const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Render 配置使用 JSON 演示模式、随机会话密钥和就绪检查', () => {
  const content = fs.readFileSync(
    path.resolve(__dirname, '..', 'render.yaml'),
    'utf8'
  );

  assert.match(content, /name:\s+"-lisan"/);
  assert.match(content, /runtime:\s+node/);
  assert.match(content, /buildCommand:\s+npm ci --omit=dev/);
  assert.match(content, /healthCheckPath:\s+\/api\/health\/ready/);
  assert.match(content, /key:\s+STORAGE_DRIVER\s+value:\s+json/s);
  assert.match(content, /key:\s+SESSION_SECRET\s+generateValue:\s+true/s);
});
