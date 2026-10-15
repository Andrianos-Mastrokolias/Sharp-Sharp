
from pathlib import Path
from PIL import Image
import shutil

# Change this only if your textures are stored elsewhere.
TEXTURES_DIR = Path("public/assets/textures")

MAX_SIZE = 1024

# Backup location outside the Vite public folder,
# so backups are not included in the production build.
BACKUP_DIR = Path("texture_backups")

def format_mb(size):
    return f"{size / (1024 * 1024):.2f} MB"

if not TEXTURES_DIR.exists():
    raise SystemExit(
        f"Texture folder not found: {TEXTURES_DIR}"
    )

normal_maps = [
    path
    for path in TEXTURES_DIR.rglob("*.png")
    if (
        "normal" in path.stem.lower()
        or "_nor_gl" in path.stem.lower()
        or "_nor_dx" in path.stem.lower()
    )
]

if not normal_maps:
    raise SystemExit(
        "No normal-map PNGs found. "
        "Check the texture folder and filenames."
    )

print(f"Found {len(normal_maps)} normal maps.\n")

original_total = 0
optimised_total = 0

for path in normal_maps:
    relative_path = path.relative_to(TEXTURES_DIR)
    backup_path = BACKUP_DIR / relative_path

    backup_path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    shutil.copy2(path, backup_path)

    original_size = path.stat().st_size

    with Image.open(path) as source:
        image = source.copy()

    original_dimensions = image.size

    # Resize only when larger than 1024 pixels.
    image.thumbnail(
        (MAX_SIZE, MAX_SIZE),
        Image.Resampling.LANCZOS
    )

    # Save as PNG to preserve the original filename,
    # lossless format and texture-loading code.
    image.save(
        path,
        format="PNG",
        optimize=True,
        compress_level=9
    )

    new_size = path.stat().st_size

    original_total += original_size
    optimised_total += new_size

    print(relative_path)
    print(
        f"  {original_dimensions}"
        f" -> {image.size}"
    )
    print(
        f"  {format_mb(original_size)}"
        f" -> {format_mb(new_size)}"
    )
    print()

print("=" * 45)
print("TOTAL ORIGINAL:", format_mb(original_total))
print("TOTAL OPTIMISED:", format_mb(optimised_total))

if original_total:
    reduction = (
        1 - optimised_total / original_total
    ) * 100
    print(f"SIZE REDUCTION: {reduction:.1f}%")

print("\nBackups saved in:", BACKUP_DIR.resolve())
