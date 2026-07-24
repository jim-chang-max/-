const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requireAdmin,
  requireAuthenticated
} = require('../middleware/auth');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
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

test('个人数据接口拒绝未登录用户', async () => {
  const response = responseRecorder();
  let nextCalled = false;

  await requireAuthenticated(
    { session: {} },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('题库管理接口拒绝普通学生', async () => {
  const response = responseRecorder();
  let nextCalled = false;

  await requireAdmin(
    { currentUser: { id: 'student-1', role: 'student' } },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('管理员可以进入题库管理接口', async () => {
  const response = responseRecorder();
  let nextCalled = false;

  await requireAdmin(
    { currentUser: { id: 'admin-1', role: 'admin' } },
    response,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(nextCalled, true);
});
