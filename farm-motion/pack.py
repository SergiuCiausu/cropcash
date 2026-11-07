"""Packs Remotion's transparent PNG frames into 6-second looping WebP files, plus one still of each."""
import glob
import os
from PIL import Image

OUT = "../landing-variations/img/cards"
os.makedirs(OUT, exist_ok=True)
for name in ["margin", "bills", "costs", "reserve"]:
    paths = sorted(glob.glob(f"out/{name}/*.png"))
    frames = [Image.open(p).convert("RGBA") for p in paths]
    # 60 frames at 50 ms (20 fps) is 3 seconds of motion. Frame 40 is the finished card, and holding it
    # 3 more seconds makes each loop exactly 6 seconds at the same motion speed and almost the same size.
    durations = [50] * 60
    durations[40] += 3000
    picked = [frames[round(i * 1.5)] for i in range(60)]
    picked[0].save(f"{OUT}/{name}.webp", save_all=True, append_images=picked[1:], duration=durations, loop=0,
                   quality=74, method=6, alpha_quality=78, allow_mixed=True, minimize_size=True)
    frames[60].save(f"{OUT}/{name}-still.webp", quality=88, method=6, alpha_quality=95)
    print(name, os.path.getsize(f"{OUT}/{name}.webp") // 1024, "KB")
