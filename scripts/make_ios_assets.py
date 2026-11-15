"""Regenerate the iOS app icon and launch screen from the Grapple logo.

Run from the repo root:  python3 scripts/make_ios_assets.py
Then:                    npm run ios:sync
"""
from PIL import Image

LOGO = "public/img/logos/blue_logo.jpeg"
BLUE = (3, 28, 146)  # the logo's background color
ICON = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
SPLASHES = [
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png",
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png",
]


def centered(canvas_size: int, logo_width: int) -> Image.Image:
    logo = Image.open(LOGO).convert("RGB")
    scale = logo_width / logo.width
    logo = logo.resize((logo_width, round(logo.height * scale)), Image.LANCZOS)
    # App Store icons must be opaque: plain RGB, no alpha channel.
    canvas = Image.new("RGB", (canvas_size, canvas_size), BLUE)
    canvas.paste(logo, ((canvas_size - logo.width) // 2, (canvas_size - logo.height) // 2))
    return canvas


centered(1024, 1000).save(ICON, optimize=True)
splash = centered(2732, 1100)
for path in SPLASHES:
    splash.save(path, optimize=True)
print("icon + launch screen written")
