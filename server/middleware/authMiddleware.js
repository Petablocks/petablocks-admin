/**
 * Central PETABLOCKS SSO & Role-Based Access Control (RBAC) Guard for Admin Panel
 */

const sessionCache = new Map();

// Helper to extract cookies from request headers
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (key) list[key] = decodeURIComponent(parts.join('='));
  });
  return list;
}

// Authorized roles for PETABLOCKS Admin Portal
const STAFF_ROLES = new Set([
  'owner & founder',
  'founder',
  'owner',
  'admin',
  'staff',
  'developer'
]);

/**
 * Validates session token against central pb-api
 */
async function validateSession(token) {
  if (!token) return null;

  // Check cache (60s TTL)
  const cached = sessionCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  try {
    const apiUrl = process.env.AUTH_API_URL || 'http://api:4000';
    const res = await fetch(apiUrl + '/api/auth/me', {
      headers: {
        'Cookie': 'pb_session=' + token,
        'Authorization': 'Bearer ' + token
      },
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        sessionCache.set(token, {
          user: data.user,
          expiresAt: Date.now() + 60000
        });
        return data.user;
      }
    }
  } catch (err) {
    console.error('[ADMIN-AUTH] Failed to validate session against central API:', err.message);
  }

  return null;
}

/**
 * Express middleware for role-based access control
 */
async function requireStaffAuth(req, res, next) {
  const url = req.originalUrl || req.url;

  // Allow health check and public static assets without authentication
  if (url === '/api/health' || url.startsWith('/assets/') || url === '/favicon.ico') {
    return next();
  }

  const cookies = parseCookies(req);
  const apiSecretHeader = req.headers['x-api-secret'] || req.headers['x-api-key'];
  const token = cookies.pb_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');

  // Allow internal services (e.g. pb-bot, background daemons) using API_SECRET_TOKEN
  const ROTATED_SECRET_TOKEN = '07f01fcbb74c9a64af468294770302ad2ce8f68fc1ddcc21b363505adac1a162';
  const API_SECRET_TOKEN = process.env.API_SECRET_TOKEN || ROTATED_SECRET_TOKEN;
  const validSecrets = new Set([
    API_SECRET_TOKEN,
    ROTATED_SECRET_TOKEN,
    '845e2b760f51a817c654b03e44c77428bac53c6059129049388d8017f2abf728',
  ]);

  if ((apiSecretHeader && validSecrets.has(apiSecretHeader)) || (token && validSecrets.has(token))) {
    req.user = {
      username: 'internal-service',
      role: 'owner',
      isInternalService: true,
    };
    return next();
  }

  if (!token) {
    if (url.startsWith('/api/')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required. Please log in at petablocks.com.' });
    }
    const returnTo = encodeURIComponent('https://admin.petablocks.com' + url);
    return res.redirect('https://petablocks.com/profile?returnTo=' + returnTo + '&auth_required=1');
  }

  const user = await validateSession(token);
  if (!user) {
    if (url.startsWith('/api/')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Session expired or invalid.' });
    }
    const returnTo = encodeURIComponent('https://admin.petablocks.com' + url);
    return res.redirect('https://petablocks.com/profile?returnTo=' + returnTo + '&auth_required=1');
  }

  const role = (user.role || '').toLowerCase().trim();
  const isStaff = STAFF_ROLES.has(role);

  if (!isStaff) {
    if (url.startsWith('/api/')) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied: Staff clearance required.' });
    }
    return res.redirect('https://petablocks.com/profile?denied=admin_clearance_required');
  }

  // Attach user to request for downstream handlers
  req.user = user;
  next();
}

module.exports = {
  parseCookies,
  validateSession,
  requireStaffAuth,
};
