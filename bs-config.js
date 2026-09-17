module.exports = {
  files: ['./**/*.{html,htm,css,js}'],
  watchOptions: { ignored: 'node_modules' },
  server: { baseDir: '.' },
  host: '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  injectChanges: false,
};
