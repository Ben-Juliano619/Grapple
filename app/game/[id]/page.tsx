"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";

export default function GamePage() {
  const params = useParams();
  const gameId = params.id as string;

  const socket = useMemo(() => io("http://localhost:3001", { transports: ["websocket"] }), []);
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    socket.on("game:state", setState);
    socket.on("game:error", (e) => console.log("game:error", e));

    socket.emit("game:join", { gameId, playerName: "Ben" });

    return () => {
      socket.off("game:state", setState);
      socket.disconnect();
    };
  }, [socket, gameId]);

  socket.on("game:error", (msg) => console.log("game:error:", msg));

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Game: {gameId}</h2>
      <pre style={{ background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
        {state ? JSON.stringify(state, null, 2) : "Waiting for game state..."}
      </pre>
    </div>
  );
}
