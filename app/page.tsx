"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function Home() {
  const router = useRouter();
  const socket = useMemo(() => io("http://localhost:3001", { transports: ["websocket"] }), []);

  const [gameCode, setGameCode] = useState("");

  useEffect(() => {
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  function createGame() {
    socket.once("game:state", (state: any) => {
      router.push(`/game/${state.id}`);
    });
    socket.emit("game:create");
  }

  function joinGame() {
    if (!gameCode.trim()) return;
    router.push(`/game/${gameCode.trim()}`);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Grapple Notes</h1>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button onClick={createGame}>Create Game</button>
        <input value={gameCode} onChange={(e) => setGameCode(e.target.value)} placeholder="Enter game id" />
        <button onClick={joinGame}>Join</button>
      </div>
    </div>
  );
}
