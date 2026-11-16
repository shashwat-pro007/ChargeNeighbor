import { createApp } from './app.js';
import { config } from './config.js';

for (const message of config.warnings) console.warn(`[config] ${message}`);
if (config.failures.length > 0) {
  for (const message of config.failures) console.error(`[config] ${message}`);
  process.exit(1);
}

const app = createApp();

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`\nChargeNeighbor API listening on http://localhost:${config.port}`);
  console.log(`  env            ${config.env}`);
  console.log(`  database       ${config.dbFile}`);
  console.log(`  payments       ${config.paymentsMode}`);
  console.log(
    `  test login     ${config.testLogin.enabled ? `ON (fixed OTP for ${config.testLogin.numbers.join(', ') || config.testLogin.prefixes.join(', ')}${config.testLogin.prefixes.length ? '*' : ''})` : 'off'}`,
  );
  if (config.testLogin.enabled) {
    console.log('  ^ disable with TEST_LOGIN_ENABLED=false before real users arrive.\n');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Set PORT to something else.`);
  } else {
    console.error('Server failed to start:', error);
  }
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received, closing server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
