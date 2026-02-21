"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { getOrCreateSessionId } from "./lib/session";

export default function Home() {
  const router = useRouter();
  const socket = useMemo(() => io("http://localhost:3001", { transports: ["websocket"] }), []);

  const [gameCode, setGameCode] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const storedName = window.localStorage.getItem("grapple.playerName");
    if (storedName) {
      setPlayerName(storedName);
    }
    getOrCreateSessionId();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  function createGame() {
    const trimmedPlayerName = playerName.trim();
    if (!trimmedPlayerName) {
      setErrorMessage("Player name cannot be blank");
      return;
    }

    window.localStorage.setItem("grapple.playerName", trimmedPlayerName);
    setErrorMessage("");
    socket.emit(
      "game:create",
      null,
      (response: { ok: boolean; gameId?: string; error?: string }) => {
        if (response.ok && response.gameId) {
          router.push(`/game/${response.gameId}`);
          return;
        }
        if (response.error) {
          setErrorMessage(response.error);
        }
      },
    );
  }

  function joinGame() {
    const trimmedCode = gameCode.trim();
    const trimmedPlayerName = playerName.trim();
    if (!trimmedCode) {
      setErrorMessage("Enter a game id to join.");
      return;
    }

    if (!trimmedPlayerName) {
      setErrorMessage("Player name cannot be blank");
      return;
    }

    setErrorMessage("");
    const sessionId = getOrCreateSessionId();
    socket.emit(
      "game:validateJoin",
      { gameId: trimmedCode, playerName: trimmedPlayerName, sessionId },
      (response: { ok: boolean; error?: string }) => {
        if (!response.ok) {
          setErrorMessage(response.error ?? "Unable to join game");
          return;
        }

        window.localStorage.setItem("grapple.playerName", trimmedPlayerName);
        router.push(`/game/${trimmedCode}`);
      },
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "clamp(16px, 3vw, 36px)",
        fontFamily: "system-ui",
        background:
          "radial-gradient(circle at center, #922 0%, #7d1f1f 30%, #4a1111 68%, #240808 100%)",
      }}
    >
      <main
        style={{
          width: "min(92vw, 640px)",
          borderRadius: 26,
          border: "2px solid rgba(255,255,255,0.25)",
          background:
            "linear-gradient(145deg, rgba(35, 5, 8, 0.95), rgba(80, 14, 18, 0.95)), repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 10px)",
          boxShadow: "0 30px 60px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.12)",
          padding: "clamp(20px, 4vw, 38px)",
          color: "#fff",
          display: "grid",
          gap: 18,
          textAlign: "center",
        }}
      >
        <div>
          <Image
            src="/img/logos/black_text_logo.jpeg"
            alt="Grapple logo"
            width={640}
            height={180}
            style={{ width: "min(100%, 440px)", height: "auto", margin: "0 auto" }}
            priority
          />
          <p style={{ margin: "8px 0 0", opacity: 0.9 }}>Deal. Wrestle. Outsmart. Win the mat.</p>
        </div>

        <div style={{ display: "grid", gap: 12, width: "100%" }}>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player name"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          />
          <button
            onClick={createGame}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #fff",
              background: "#f8f8f8",
              color: "#320a0a",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create Game
          </button>

          <details
            style={{
              border: "1px solid rgba(255,255,255,0.28)",
              borderRadius: 10,
              background: "rgba(255,255,255,0.08)",
              padding: "10px 12px",
              textAlign: "left",
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Game Options</summary>
            <div style={{ marginTop: 10, display: "grid", gap: 8, opacity: 0.85 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" disabled />
                Enable advanced rules (coming soon)
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" disabled />
                Team mode (coming soon)
              </label>
              <small>Stub only for now — options will be wired up in a future update.</small>
            </div>
          </details>
        </div>

        <div style={{ display: "grid", gap: 10, width: "100%" }}>
          <input
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value)}
            placeholder="Enter 6-digit game id"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          />
          <button
            onClick={joinGame}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.8)",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Join Game
          </button>
        </div>

        {errorMessage ? <p style={{ color: "#ffd1d1", margin: 0 }}>{errorMessage}</p> : null}
      </main>
    </div>
  );
}
