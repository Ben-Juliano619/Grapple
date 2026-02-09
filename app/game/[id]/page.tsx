"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

export default function GamePage() {
  const params = useParams();
  const gameId = params.id as string;

  const [state, setState] = useState<any>(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected:", socket.id);
    });

    socket.on("game:state", (gameState) => {
      setState(gameState);
    });

    socket.emit("game:join", {
      gameId,
      playerName: "Ben"
    });

    return () => {
      socket.off("game:state");
    };
  }, [gameId]);

  return (
    <div style={{ padding: 30 }}>
      <h1>Game ID: {gameId}</h1>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
