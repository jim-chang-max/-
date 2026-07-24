const os = require('os');

function isUsableAddress(address) {
  return (
    address.family === 'IPv4' &&
    !address.internal &&
    !address.address.startsWith('169.254.')
  );
}

function localIpv4Addresses() {
  const addresses = [];
  for (const items of Object.values(os.networkInterfaces())) {
    for (const item of items || []) {
      if (isUsableAddress(item)) {
        addresses.push(item.address);
      }
    }
  }
  return [...new Set(addresses)].sort();
}

function accessUrls(port, host = '0.0.0.0') {
  const urls = [`http://localhost:${port}`];
  if (host === '0.0.0.0' || host === '::') {
    localIpv4Addresses().forEach((address) => {
      urls.push(`http://${address}:${port}`);
    });
  } else if (!['127.0.0.1', 'localhost'].includes(host)) {
    urls.push(`http://${host}:${port}`);
  }
  return [...new Set(urls)];
}

module.exports = {
  accessUrls,
  localIpv4Addresses
};
