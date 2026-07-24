require('dotenv').config({ quiet: true });

const { accessUrls } = require('../services/networkInfo');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

console.log('网站可用地址：');
accessUrls(port, host).forEach((url) => console.log(`- ${url}`));
