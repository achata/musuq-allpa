const { createApp } = require('./app');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const server = createApp().listen(port, host, () => console.log(`campo: http://${host}:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
});
