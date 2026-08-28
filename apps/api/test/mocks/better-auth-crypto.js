/**
 * better-auth/crypto ships ESM-only (.mjs) and Jest has no transform for it,
 * so any suite transitively importing ops.service.ts, admin-users.service.ts
 * or me.controller.ts fails to parse. jest.config moduleNameMapper redirects
 * the module to this CJS stub. Behaviour is deterministic and round-trips:
 * verifyPassword succeeds only against a hash produced by this same stub.
 */
async function hashPassword(password) {
  return `stub$${Buffer.from(String(password), 'utf8').toString('base64')}`;
}

async function verifyPassword({ hash, password }) {
  return hash === `stub$${Buffer.from(String(password), 'utf8').toString('base64')}`;
}

module.exports = { hashPassword, verifyPassword };
