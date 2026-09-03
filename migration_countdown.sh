#!/bin/bash
# Target: 4:00 PM local (15:00 UTC)
# Epoch for 2026-09-03 15:00:00 UTC
TARGET_EPOCH=1788447600
WEBHOOK_URL="https://discord.com/api/webhooks/1544837178029244539/IZIb70pWUHS_-cHKLucoofToYTkhpzhiRnEULCtrv2gSe7zLPXbJsznlaEX1FJOUd0By"

echo "[COUNTDOWN] Migration countdown started at $(date). Target: 16:00:00 local (15:00:00 UTC)"

announce() {
    MSG="$1"
    TITLE_SUB="$2"

    # 1. In-game standard chat broadcast
    docker exec petablocks-create-2 rcon-cli "say $MSG" 2>/dev/null

    # 2. In-game on-screen large banner if subtitle provided
    if [ -n "$TITLE_SUB" ]; then
        docker exec petablocks-create-2 rcon-cli "title @a times 10 60 20" 2>/dev/null
        docker exec petablocks-create-2 rcon-cli "title @a title {\"text\":\"⚠️ MIGRATION NOTICE\",\"color\":\"gold\",\"bold\":true}" 2>/dev/null
        docker exec petablocks-create-2 rcon-cli "title @a subtitle {\"text\":\"$TITLE_SUB\",\"color\":\"yellow\"}" 2>/dev/null
    fi

    # 3. Mirror directly into Discord Server Console Channel
    curl -s -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" -X POST -d "{\"username\":\"Server Console\",\"avatar_url\":\"https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png\",\"embeds\":[{\"title\":\"📢 Migration Broadcast\",\"description\":\"$MSG\",\"color\":16107019,\"footer\":{\"text\":\"PETABLOCKS Console • create-2\"}}]}" "$WEBHOOK_URL" >/dev/null 2>&1

    echo "[$(date '+%H:%M:%S')] Broadcast delivered: $MSG"
}

DONE_10M=0
DONE_5M=0
DONE_2M=0
DONE_1M=0
DONE_30S=0

while true; do
    NOW=$(date +%s)
    DIFF=$((TARGET_EPOCH - NOW))

    if [ $DIFF -le 600 ] && [ $DONE_10M -eq 0 ]; then
        announce "[PETABLOCKS] ⚠️ Server migration to dedicated hardware in 10 minutes!" "Migration in 10 minutes"
        DONE_10M=1
    fi

    if [ $DIFF -le 300 ] && [ $DONE_5M -eq 0 ]; then
        announce "[PETABLOCKS] ⚠️ Server migration in 5 minutes! Safe logout recommended." "Migration in 5 minutes (Safe Logout)"
        DONE_5M=1
    fi

    if [ $DIFF -le 120 ] && [ $DONE_2M -eq 0 ]; then
        announce "[PETABLOCKS] ⚠️ Server migration in 2 minutes! Please dismount vehicles and trains." "Migration in 2 minutes (Dismount Trains)"
        DONE_2M=1
    fi

    if [ $DIFF -le 60 ] && [ $DONE_1M -eq 0 ]; then
        announce "[PETABLOCKS] ⚠️ Server migration in 1 minute! Final world save commencing..." "Final World Save Commencing (1 min)"
        docker exec petablocks-create-2 rcon-cli "save-all" 2>/dev/null
        DONE_1M=1
    fi

    if [ $DIFF -le 30 ] && [ $DONE_30S -eq 0 ]; then
        announce "[PETABLOCKS] 🚨 Server migration in 30 SECONDS! Server will restart on dedicated node." "Migration in 30 SECONDS"
        DONE_30S=1
        break
    fi

    sleep 3
done

echo "[COUNTDOWN] Countdown complete. Ready for 4:00 PM migration cutover!"
