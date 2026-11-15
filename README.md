# Grapple
The Grapple card game turned in to an online multiplayer game

## iOS app (experimental, `exp/ios_port` branch)

The iOS app wraps the same frontend with [Capacitor](https://capacitorjs.com). It talks to the same Socket.IO server as the website.

- `npm run build:mobile`: static export of the frontend into `out/`
- `npm run ios:sync`: build and copy it into the Xcode project in `ios/`
- `npm run ios:open`: open in Xcode (Mac only)

No Mac? The **iOS build** GitHub Action (`.github/workflows/ios-build.yml`) builds an unsigned `Grapple.ipa` on a GitHub-hosted Mac on every push to `exp/ios_port`. Download it from the run's artifacts and install it on your iPhone from Windows with [Sideloadly](https://sideloadly.io). The fastest way to check layout is to open the website in Safari on your iPhone, which uses the same engine.

Game links are now `/game?id=123456` (old `/game/123456` links redirect on the website).

### Testing on your phone over Wi-Fi

1. Run `npm run dev:all` on your PC.
2. Find your PC's local IP (`ipconfig` on Windows, the "IPv4 Address" such as `192.168.1.42`).
3. On your phone, on the same Wi-Fi, open `http://192.168.1.42:3000` in Safari.

The app automatically connects to the socket server on port 3001 of the same machine. On Windows, allow Node.js through the firewall on **Private** networks when prompted.
