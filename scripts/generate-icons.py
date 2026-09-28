"""Development-only generation of the app's original geometric install icon."""
from pathlib import Path
import math
import struct
import zlib
root = Path(__file__).resolve().parents[1] / 'public'
for size in (192, 512):
    def distance(x, y, a, b):
        dx, dy = b[0]-a[0], b[1]-a[1]
        t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)
    raw = bytearray()
    for py in range(size):
        raw.append(0)
        for px in range(size):
            covered = 0
            for ox, oy in ((.25,.25),(.75,.25),(.25,.75),(.75,.75)):
                x,y=(px+ox)*40/size,(py+oy)*40/size
                covered += min(distance(x,y,(11,21),(17,27)), distance(x,y,(17,27),(30,12))) <= 1.75 or math.hypot(x-28,y-28)<=2
            raw.extend(round(a+(b-a)*covered/4) for a,b in zip((24,63,53),(215,229,157)))
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    (root/f'icon-{size}.png').write_bytes(png)
