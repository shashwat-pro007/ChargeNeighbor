import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config, SERVER_ROOT } from './config.js';
import { bookingRules, cancellation, listingRules } from './config/policies.js';
import { LOGIN_ID_PATTERN, PASSWORD_MAX, PASSWORD_MIN } from './lib/credentials.js';
import { loadUser } from './lib/auth.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import listingsRoutes, { ALLOWED_CONNECTORS } from './routes/listings.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import hostRoutes from './routes/host.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';
import policiesRoutes from './routes/policies.routes.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { generalLimiter, noStore, sameOriginGuard } from './middleware/guards.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Permissions-Policy', 'geolocation=(self)');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sameOriginGuard);
  app.use(loadUser);

  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: '7d',
      fallthrough: true,
      index: false,
    }),
  );

  const api = express.Router();
  api.use(generalLimiter);

  api.get('/health', (_req, res) => {
    res.json({ ok: true, env: config.env, time: new Date().toISOString() });
  });

  /** Public runtime configuration the interface needs to render honestly. */
  api.get('/meta', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      appName: 'ChargeNeighbor',
      currency: config.currency,
      platformFeePercent: config.platformFeePercent,
      paymentsMode: config.paymentsMode,
      timezone: config.defaultTimezone,
      connectors: ALLOWED_CONNECTORS,
      minLeadMinutes: config.minLeadMinutes,
      slotStepMinutes: config.slotStepMinutes,
      cancellation,
      bookingRules,
      listingRules,
      credentials: {
        passwordMin: PASSWORD_MIN,
        passwordMax: PASSWORD_MAX,
        loginIdPattern: LOGIN_ID_PATTERN.source,
      },
      testLogin: {
        enabled: config.testLogin.enabled,
        // Only meaningful together with the allowlisted test numbers.
        otp: config.testLogin.enabled ? config.testLogin.otp : null,
        numbers: config.testLogin.enabled ? config.testLogin.numbers : [],
        prefixes: config.testLogin.enabled ? config.testLogin.prefixes : [],
      },
    });
  });

  api.use('/auth', noStore, authRoutes);
  api.use('/policies', policiesRoutes);
  api.use('/listings', listingsRoutes);
  api.use('/bookings', bookingsRoutes);
  api.use('/me', usersRoutes);
  api.use('/host', hostRoutes);
  api.use('/reports', reportsRoutes);
  api.use('/admin', adminRoutes);

  api.use(apiNotFound);
  app.use('/api/v1', api);

  // Anything else under /api is an error, never the SPA shell.
  app.use('/api', apiNotFound);

  // Serve the built React app when it exists (production single-process mode).
  const clientDist = path.resolve(SERVER_ROOT, '../client/dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
