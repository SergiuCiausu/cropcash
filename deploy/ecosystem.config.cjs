// pm2 process file for the API on the VPS (docs/12-deploy.md).
// Start:   pm2 start deploy/ecosystem.config.cjs && pm2 save
// Update:  git pull && npm ci && npm run build -w @cropcash/api && pm2 reload cropcash-api
module.exports = {
  apps: [
    {
      name: 'cropcash-api',
      cwd: `${__dirname}/../apps/api`,
      script: 'dist/server.js',
      // Secrets stay in the repo-root .env on the server (never in git).
      node_args: '--env-file=../../.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
