#!/bin/bash
#
# SwiftBar / xbar plugin — menu-bar controller for the Reddit poster agent.
# Refreshes every 5s (encoded in the filename: reddit-agent.5s.sh).
#
# Install:
#   1) brew install --cask swiftbar   (or download from https://swiftbar.app)
#   2) On first launch, SwiftBar asks for a Plugins folder — pick/remember it.
#   3) Copy this file into that folder and make it executable:
#        cp reddit-agent.5s.sh <PluginsFolder>/
#        chmod +x <PluginsFolder>/reddit-agent.5s.sh
#   4) SwiftBar → Refresh. A 🟢/🔴 "RA" appears in your menu bar.
#
# <xbar.title>Reddit Poster Agent</xbar.title>
# <xbar.desc>Start/stop/monitor the local Reddit posting agent (pm2).</xbar.desc>

PM2="/Users/sayeed/.local/node-v22.15.0-darwin-arm64/bin/pm2"
NODE="/Users/sayeed/.local/node-v22.15.0-darwin-arm64/bin/node"
LOG="$HOME/.pm2/logs/reddit-agent-out.log"
TOOL_URL="http://localhost:3005/apps/reddit-visibility"

# --- Read the agent's pm2 status as "state|pid|restarts" ---
INFO=$("$PM2" jlist 2>/dev/null | "$NODE" -e '
  let s="";
  process.stdin.on("data",d=>s+=d).on("end",()=>{
    try {
      const p = JSON.parse(s).find(x => x.name === "reddit-agent");
      if (!p) return console.log("stopped||");
      console.log((p.pm2_env.status||"?") + "|" + (p.pid||"") + "|" + (p.pm2_env.restart_time||0));
    } catch (e) { console.log("unknown||"); }
  });
' 2>/dev/null)

STATE=$(echo "$INFO" | cut -d'|' -f1)
PID=$(echo "$INFO" | cut -d'|' -f2)
RESTARTS=$(echo "$INFO" | cut -d'|' -f3)

# --- Is AdsPower running? (posts only go out when it's open) ---
if pgrep -if "AdsPower" >/dev/null 2>&1; then AP="open"; else AP="CLOSED"; fi

# --- Menu bar title ---
if [ "$STATE" = "online" ]; then
  echo "🟢 RA"
else
  echo "🔴 RA"
fi

echo "---"

if [ "$STATE" = "online" ]; then
  echo "Agent: online (pid $PID) | color=green"
else
  echo "Agent: $STATE | color=red"
fi

if [ "$AP" = "open" ]; then
  echo "AdsPower: open | color=green"
else
  echo "AdsPower: CLOSED — posts will queue | color=orange"
fi

echo "Restarts: ${RESTARTS:-0}"
echo "---"
echo "▶ Start / Restart | bash=\"$PM2\" param1=restart param2=reddit-agent terminal=false refresh=true"
echo "⏸ Stop | bash=\"$PM2\" param1=stop param2=reddit-agent terminal=false refresh=true"
echo "📜 View logs | bash=/usr/bin/open param1=$LOG terminal=false"
echo "🌐 Open the tool | href=$TOOL_URL"
echo "↻ Refresh | refresh=true"
