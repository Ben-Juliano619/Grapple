"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSocket } from "./lib/socket";
import { createNewGameSession, readGameSessionCookie } from "./lib/session";
import { getActiveGameId, resetGameSessionState } from "./lib/gameSessionState";

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();

  const [gameCode, setGameCode] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSessionReady, setIsSessionReady] = useState(false);

  useEffect(() => {
    let isActive = true;
    resetGameSessionState();
    const storedName = window.localStorage.getItem("grapple.playerName");
    if (storedName) {
      setPlayerName(storedName);
    }

    const validateSession = async () => {
      const existing = readGameSessionCookie();
      if (!existing) {
        if (isActive) {
          setIsSessionReady(true);
        }
        return;
      }

      try {
        const query = new URLSearchParams(existing);
        const response = await fetch(`http://localhost:3001/api/session/validate?${query.toString()}`);
        if (!response.ok) {
          resetGameSessionState({ clearSessionCookie: true });
          return;
        }

        const result = (await response.json()) as { ok: boolean; valid?: boolean };
        if (!isActive) return;
        if (!result.ok || !result.valid) {
          resetGameSessionState({ clearSessionCookie: true });
        }
      } catch {
        resetGameSessionState({ clearSessionCookie: true });
      } finally {
        if (isActive) {
          setIsSessionReady(true);
        }
      }
    };

    setIsSessionReady(false);
    void validateSession();

    return () => {
      isActive = false;
    };
  }, [pathname]);

  function createGame() {
    if (!isSessionReady) {
      setErrorMessage("Preparing session, please try again.");
      return;
    }

    const trimmedPlayerName = playerName.trim();
    if (!trimmedPlayerName) {
      setErrorMessage("Player name cannot be blank");
      return;
    }

    window.localStorage.setItem("grapple.playerName", trimmedPlayerName);
    setErrorMessage("");
    resetGameSessionState({ clearSessionCookie: true });
    const socket = getSocket();
    socket.emit(
      "game:create",
      null,
      (response: { ok: boolean; gameId?: string; error?: string }) => {
        if (response.ok && response.gameId) {
          createNewGameSession(response.gameId);
          router.push(`/game/${response.gameId}`);
          return;
        }
        resetGameSessionState({ clearSessionCookie: true });
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
    if (!isSessionReady) {
      setErrorMessage("Preparing session, please try again.");
      return;
    }

    setErrorMessage("");
    if (getActiveGameId()) {
      resetGameSessionState();
    }
    const socket = getSocket();
    const currentSession = readGameSessionCookie();
    const sessionId =
      currentSession?.gameId === trimmedCode ? currentSession.sessionId : createNewGameSession(trimmedCode).sessionId;
    socket.emit(
      "game:validateJoin",
      { gameId: trimmedCode, playerName: trimmedPlayerName, sessionId },
      (response: { ok: boolean; error?: string }) => {
        if (!response.ok) {
          resetGameSessionState({ clearSessionCookie: true });
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
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 3.4rem)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Grapple
          </h1>
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
            disabled={!isSessionReady}
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
            disabled={!isSessionReady}
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
