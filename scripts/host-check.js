require('dotenv').config({ quiet: true });

const { runHostDiagnostics } = require('../services/hostDiagnostics');
const { closePool } = require('../services/mysqlClient');

const symbols = {
  pass: '[通过]',
  warn: '[提醒]',
  fail: '[失败]'
};

async function main() {
  const report = await runHostDiagnostics();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('离散数学复习网站主机诊断');
    console.log(`生成时间：${report.generatedAt}`);
    for (const item of report.checks) {
      console.log(`${symbols[item.status]} ${item.label}：${item.message}`);
    }
    console.log(
      `汇总：${report.summary.pass} 通过，${report.summary.warn} 提醒，` +
      `${report.summary.fail} 失败`
    );
    console.log(`访问地址：${report.accessUrls.join('，')}`);
  }

  if (report.summary.fail > 0) {
    process.exitCode = 1;
  } else if (process.argv.includes('--strict') && report.summary.warn > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`主机诊断失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
