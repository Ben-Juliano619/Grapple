import { Suspense } from "react";
import GameClient from "./GameClient";

// The game id comes from the query string (/game?id=123456) rather than a
// dynamic route segment so the frontend can be statically exported and
// bundled into the native iOS app.
export default function GamePage() {
  return (
    <Suspense fallback={null}>
      <GameClient />
    </Suspense>
  );
}
