// pm2 config for the droplet.
// Deploy: git pull --ff-only && pm2 restart ecosystem.config.js --update-env
const PUBLIC_URL = 'https://perpradarhq.com';

module.exports = {
  apps: [
    {
      name: 'perpradar-web',
      script: 'server.js',
      env: { HOST: '0.0.0.0', PORT: '4800', PERPRADAR_URL: PUBLIC_URL },
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'perpradar-scheduler',
      script: 'scripts/scheduler.js',
      env: { POLL_MIN: '15', DIGEST_UTC_HOUR: '13', PERPRADAR_URL: PUBLIC_URL },
      max_restarts: 20,
      restart_delay: 10000,
    },
  ],
};
