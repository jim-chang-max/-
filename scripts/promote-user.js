require('dotenv').config({ quiet: true });

const { closePool } = require('../services/mysqlClient');
const {
  findUserByUsername,
  updateUserRole
} = require('../services/userStore');

async function main() {
  const username = String(process.argv[2] || '').trim();

  if (!username) {
    throw new Error('请提供用户名，例如：npm run user:promote -- zhangsan');
  }

  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error(`找不到用户：${username}`);
  }

  await updateUserRole(user.id, 'admin');
  console.log(`用户 ${username} 已设置为管理员。`);
}

main()
  .catch((error) => {
    console.error(`设置管理员失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
