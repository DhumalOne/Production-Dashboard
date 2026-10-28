#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 server (Oracle Cloud). Run as the default user:
#   bash deploy/server-setup.sh
# Installs Docker, opens ports 80/443 in the server's own firewall, turns on automatic security
# updates, sets India time, and schedules the nightly backup.
set -euo pipefail

sudo timedatectl set-timezone Asia/Kolkata

sudo apt-get update -q
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq ca-certificates curl unattended-upgrades iptables-persistent fail2ban

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
sudo systemctl enable --now docker

# Oracle's Ubuntu images reject everything except SSH in iptables, even when the cloud security list allows
# it. Allow web traffic ahead of the final REJECT rule, and keep it across reboots.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Security updates install themselves; reboots stay manual.
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

# Nightly database backup at 02:30 India time (after the sync agent's 02:00 full refresh has started).
app_dir="$(cd "$(dirname "$0")" && pwd)"
( crontab -l 2>/dev/null | grep -v dhumal-backup; echo "30 2 * * * $app_dir/backup.sh >> $app_dir/backups/backup.log 2>&1 # dhumal-backup" ) | crontab -
mkdir -p "$app_dir/backups"

echo "Server ready. Log out and back in once so Docker works without sudo."
