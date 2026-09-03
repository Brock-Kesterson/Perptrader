# PerpRadar — deploy

Runs on the **same DigitalOcean droplet as the trading dashboard** (see that project's
`DEPLOY.md` for the box facts: `ssh brock@100.120.90.98` over Tailscale, non-root `brock`,
pm2 already installed + `pm2 startup` systemd unit already set).

PerpRadar is isolated from the trading bot: its own repo, its own pm2 apps, its own port
(**4800**, vs the dashboard's 4700), no shared state, no exchange credentials at all
(public data only).

## First-time setup on the droplet

```bash
# 1. Create a GitHub repo (private is fine) and push from Windows:
#    git remote add origin git@github.com:Brock-Kesterson/perpradar.git
#    git push -u origin main
# The droplet already has the read-only deploy key ~/.ssh/github_deploy — either
# reuse it (add PerpRadar as a second repo in ~/.ssh/config) or make a new one.

ssh brock@100.120.90.98
cd ~
git clone git@github.com:Brock-Kesterson/perpradar.git
cd perpradar
node -v                      # already v20+ from the trading-dashboard setup

# 2. Prime one snapshot so the site isn't empty on first load
npm run poll

# 3. Start both processes under pm2
pm2 start ecosystem.config.js
pm2 save                     # persists across reboot (startup unit already exists)
pm2 status                   # expect perpradar-web + perpradar-scheduler online
```

## Public access — LIVE at https://perpradarhq.com (set up 2026-09-03)

- Domain `perpradarhq.com` (Porkbun, ~$11/yr, auto-renews). DNS: two `A` records
  (`@` and `www`) → `137.184.119.237`.
- DO Cloud Firewall: inbound **80** and **443** open to all IPv4/IPv6.
- `ufw`: `sudo ufw allow "Nginx Full"` + `sudo ufw allow in on tailscale0 to any port 4800`
  (Tailscale still reaches the app directly on 4800).
- **nginx** reverse proxy: `/etc/nginx/sites-available/perpradar` → `127.0.0.1:4800`
  (config also committed at `deploy/nginx-perpradar.conf` for reference).
- **TLS**: Let's Encrypt via `certbot --nginx` (`-d perpradarhq.com -d www.perpradarhq.com
  --redirect`). Auto-renews via certbot's systemd timer. Cert at
  `/etc/letsencrypt/live/perpradarhq.com/`.
- `PERPRADAR_URL=https://perpradarhq.com` is set in `ecosystem.config.js` (both apps) so
  canonical tags / sitemap / digest + alert links use the real domain.

To change the nginx config later: edit `/etc/nginx/sites-available/perpradar`,
`sudo nginx -t && sudo systemctl reload nginx`.

## Deploy a change

From Windows: `git add -A && git commit && git push`, then:

```bash
ssh brock@100.120.90.98 "cd ~/perpradar && git pull && pm2 restart ecosystem.config.js"
```

`npm ci` only needed once there actually are dependencies (there are none yet).

## Health checks

- `curl http://100.120.90.98:4800/health` → `{"ok":true,"hasSnapshot":true}`
- `pm2 logs perpradar-scheduler --lines 20` → a `[poll] … rows -> … coins` line every 15 min
- Digest file appears at `~/perpradar/data/digests/YYYY-MM-DD.md` after 13:00 UTC
- Consider adding this scheduler to the existing healthchecks.io account as a second check
  (the scheduler could `curl` a ping URL at the end of each `cycle()` — not wired yet).

## Backups

`data/` holds snapshots + `subscribers.json`. Add to the droplet's nightly backup cron
(the trading-dashboard one at 06:15 UTC) — `subscribers.json` especially is not
reproducible.
