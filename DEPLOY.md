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

## Expose port 4800

Same model as the dashboard's 4700:

```bash
sudo ufw allow in on tailscale0 to any port 4800    # Tailscale-only
```

Do **not** add a DO Cloud Firewall inbound rule for 4800 — keeping it off the public
internet is the point. Reach it at `http://100.120.90.98:4800` over Tailscale.

When there's a real domain + public launch, put nginx in front (TLS via certbot) and
open 80/443 in the DO Cloud Firewall — that's a separate step, noted here so it's not
forgotten.

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
