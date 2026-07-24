const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LOCAL_SESSION_SECRET,
  resolveSessionSecret
} = require('../services/sessionSecret');

test('优先使用明确配置的会话密钥', () => {
  const result = resolveSessionSecret({
    NODE_ENV: 'production',
    SESSION_SECRET: 'configured-secret'
  });

  assert.equal(result.value, 'configured-secret');
  assert.equal(result.ephemeral, false);
  assert.equal(result.source, 'environment');
});

test('Render 缺少密钥时生成不可预测的临时密钥以避免启动失败', () => {
  const bytes = Buffer.alloc(32, 7);
  const result = resolveSessionSecret(
    { NODE_ENV: 'production', RENDER: 'true' },
    () => bytes
  );

  assert.equal(result.value, bytes.toString('base64url'));
  assert.equal(result.ephemeral, true);
  assert.equal(result.source, 'render_runtime');
});

test('非 Render 生产环境仍拒绝缺少会话密钥的配置', () => {
  assert.throws(
    () => resolveSessionSecret({ NODE_ENV: 'production' }),
    /SESSION_SECRET/
  );
});

test('本地开发模式保留兼容的默认密钥', () => {
  const result = resolveSessionSecret({});
  assert.equal(result.value, LOCAL_SESSION_SECRET);
  assert.equal(result.ephemeral, false);
});
