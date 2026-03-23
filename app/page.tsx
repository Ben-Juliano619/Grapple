"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSocket } from "./lib/socket";
import { buildApiUrl } from "./lib/network";
import { createNewGameSession, readGameSessionCookie } from "./lib/session";
import { getActiveGameId, resetGameSessionState } from "./lib/gameSessionState";
import "./page.css";

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
    if (storedName) setPlayerName(storedName);

    const validateSession = async () => {
      const existing = readGameSessionCookie();
      if (!existing) {
        if (isActive) setIsSessionReady(true);
        return;
      }

      try {
        const query = new URLSearchParams(existing);
        const response = await fetch(`${buildApiUrl("/api/session/validate")}?${query.toString()}`, {
          credentials: "include",
        });
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
        if (isActive) setIsSessionReady(true);
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
    socket.emit("game:create", null, (response: { ok: boolean; gameId?: string; error?: string }) => {
      if (response.ok && response.gameId) {
        createNewGameSession(response.gameId);
        router.push(`/game/${response.gameId}`);
        return;
      }
      resetGameSessionState({ clearSessionCookie: true });
      if (response.error) setErrorMessage(response.error);
    });
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
    if (getActiveGameId()) resetGameSessionState();
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
    <div className="home-page mobile-safe-page">
      <main className="home-card">
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 3.4rem)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Grapple
          </h1>
          <p style={{ margin: "8px 0 0", opacity: 0.9 }}>Deal. Wrestle. Outsmart. Win the mat.</p>
        </div>

        <div className="home-grid">
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player name"
            className="home-input"
          />
          <button onClick={createGame} disabled={!isSessionReady} className="home-button primary touch-target">
            Create Game
          </button>
        </div>

        <div className="home-grid" style={{ gap: 10 }}>
          <input
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value)}
            placeholder="Enter 6-digit game id"
            className="home-input"
          />
          <button onClick={joinGame} disabled={!isSessionReady} className="home-button secondary touch-target">
            Join Game
          </button>
        </div>

        {errorMessage ? <p style={{ color: "#ffd1d1", margin: 0 }}>{errorMessage}</p> : null}
      </main>
    </div>
  );
}
