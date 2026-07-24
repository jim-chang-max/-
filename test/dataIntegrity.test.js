const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRelationalIntegrity } = require('../services/dataIntegrity');

test('关系完整性检查汇总孤立记录并拒绝非法标识符', async () => {
  const connection = {
    async query() {
      return [[{ orphan_count: 2 }]];
    }
  };
  const result = await checkRelationalIntegrity({
    connection,
    relationships: [{
      id: 'test.relationship',
      childTable: 'child_table',
      childColumn: 'parent_id',
      parentTable: 'parent_table',
      parentColumn: 'id'
    }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.orphanCount, 2);

  await assert.rejects(
    checkRelationalIntegrity({
      connection,
      relationships: [{
        id: 'unsafe',
        childTable: 'child_table; DROP TABLE users',
        childColumn: 'parent_id',
        parentTable: 'users',
        parentColumn: 'id'
      }]
    }),
    /非法数据库标识符/
  );
});
