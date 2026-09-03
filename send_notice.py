import socket
import struct
import urllib.request
import json

def send_rcon(host, port, password, cmd):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(4)
    s.connect((host, port))
    
    # Auth packet (type 3)
    auth_pkg = struct.pack("<iii", len(password) + 10, 1, 3) + password.encode("utf-8") + b"\x00\x00"
    s.sendall(auth_pkg)
    resp = s.recv(4096)
    
    # Cmd packet (type 2)
    cmd_pkg = struct.pack("<iii", len(cmd) + 10, 2, 2) + cmd.encode("utf-8") + b"\x00\x00"
    s.sendall(cmd_pkg)
    resp = s.recv(4096)
    s.close()
    return resp[12:-2].decode("utf-8", errors="ignore")

# 1. Full Screen Title Banner in-game
res1 = send_rcon("127.0.0.1", 11691, "discopanel_451a2727", 'title @a title {"text":"⚠️ MIGRATION NOTICE","color":"gold","bold":true}')
res2 = send_rcon("127.0.0.1", 11691, "discopanel_451a2727", 'title @a subtitle {"text":"Scheduled Migration at 4:00 PM (1h remaining)","color":"yellow"}')
res3 = send_rcon("127.0.0.1", 11691, "discopanel_451a2727", 'say [PETABLOCKS] Server Migration at 4:00 PM. Zero progress will be lost!')
print("In-Game Title Broadcast:", res1, res2, res3)

# 2. Discord Console Alerts Channel
webhook_url = "https://discord.com/api/webhooks/1544837178029244539/IZIb70pWUHS_-cHKLucoofToYTkhpzhiRnEULCtrv2gSe7zLPXbJsznlaEX1FJOUd0By"
payload = {
    "username": "Server Console",
    "avatar_url": "https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png",
    "embeds": [{
        "title": "📢 In-Game Broadcast: 1 Hour Migration Notice",
        "description": "Notice broadcast to all connected players on Create 2 SMP:\n\n`[PETABLOCKS] Scheduled node migration at 4:00 PM (1 hour remaining). All progress will be saved!`",
        "color": 0xf59e0b,
        "fields": [
            {"name": "Migration Target", "value": "PETABLOCKS-MCS2 (`10.20.110.119`)", "inline": True},
            {"name": "Expected Cutover", "value": "4:00 PM (15:00 UTC)", "inline": True}
        ],
        "footer": {"text": "PETABLOCKS Console • create-2"}
    }]
}
req = urllib.request.Request(webhook_url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    print("Discord Console Alert Status:", resp.status)
