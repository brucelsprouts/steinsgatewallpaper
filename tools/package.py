"""Zip the wallpaper folder for Lively (files at the zip root): python tools/package.py"""
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'wallpaper'
out = root / 'dist' / 'divergence-meter.zip'
out.parent.mkdir(exist_ok=True)

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob('*')):
        if f.is_file():
            z.write(f, f.relative_to(src).as_posix())

print(f'wrote {out} ({out.stat().st_size // 1024} KB)')
