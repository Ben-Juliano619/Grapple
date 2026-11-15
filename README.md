# Grapple
The Grapple card game turned in to an online multiplayer game

## iOS app (experimental, `exp/ios_port` branch)

The iOS app wraps the same frontend with [Capacitor](https://capacitorjs.com). It talks to the same Socket.IO server as the website.

- `npm run build:mobile`: static export of the frontend into `out/`
- `npm run ios:sync`: build and copy it into the Xcode project in `ios/`
- `npm run ios:open`: open in Xcode (Mac only)

No Mac? The **iOS build** GitHub Action (`.github/workflows/ios-build.yml`) builds an unsigned `Grapple.ipa` on a GitHub-hosted Mac on every push to `exp/ios_port`. Download it from the run's artifacts and install it on your iPhone from Windows with [Sideloadly](https://sideloadly.io). The fastest way to check layout is to open the website in Safari on your iPhone, which uses the same engine.

Game links are now `/game?id=123456` (old `/game/123456` links redirect on the website).
