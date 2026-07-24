const crypto = require('crypto');

const LOCAL_SESSION_SECRET = 'discrete-math-review-local-secret';

function resolveSessionSecret(environment = process.env, randomBytes = crypto.randomBytes) {
  const configured = String(environment.SESSION_SECRET || '');
  if (configured) {
    return {
      value: configured,
      ephemeral: false,
      source: 'environment'
    };
  }

  const production = environment.NODE_ENV === 'production';
  const renderRuntime = String(environment.RENDER || '').toLowerCase() === 'true';

  if (production && renderRuntime) {
    return {
      value: randomBytes(32).toString('base64url'),
      ephemeral: true,
      source: 'render_runtime'
    };
  }

  if (production) {
    throw new Error('生产环境必须配置 SESSION_SECRET');
  }

  return {
    value: LOCAL_SESSION_SECRET,
    ephemeral: false,
    source: 'local_default'
  };
}

module.exports = {
  LOCAL_SESSION_SECRET,
  resolveSessionSecret
};
