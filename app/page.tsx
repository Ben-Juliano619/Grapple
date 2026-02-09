"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [gameId, setGameId] = useState("");

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Grapple</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          onClick={() => {
            // temp: just navigate to a dummy id for now
            // later: you’ll call server "game:create" and redirect to returned id
            router.push(`/game/${crypto.randomUUID()}`);
          }}
        >
          Create Game
        </button>

        <input
          placeholder="Enter game id"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
        />
        <button onClick={() => router.push(`/game/${gameId}`)}>Join</button>
      </div>
    </div>
  );
}
