// pm2 config for the droplet. Deploy: git pull && pm2 restart ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'perpradar-web',
      script: 'server.js',
      env: { HOST: '0.0.0.0', PORT: '4800' },
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'perpradar-scheduler',
      script: 'scripts/scheduler.js',
      env: { POLL_MIN: '15', DIGEST_UTC_HOUR: '13' },
      max_restarts: 20,
      restart_delay: 10000,
    },
  ],
};
