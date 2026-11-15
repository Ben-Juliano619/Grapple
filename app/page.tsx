"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { getSocket, resolveSocketUrl } from "./lib/socket";
import styles from "./home.module.css";
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
        const response = await fetch(`${resolveSocketUrl()}/api/session/validate?${query.toString()}`);
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
    startNewGame("game:create");
  }

  function createPracticeGame() {
    startNewGame("game:createPractice");
  }

  function startNewGame(eventName: "game:create" | "game:createPractice") {
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
      eventName,
      null,
      (response: { ok: boolean; gameId?: string; error?: string }) => {
        if (response.ok && response.gameId) {
          createNewGameSession(response.gameId);
          router.push(`/game?id=${encodeURIComponent(response.gameId)}`);
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
        router.push(`/game?id=${encodeURIComponent(trimmedCode)}`);
      },
    );
  }

  return (
    <div className={styles.screen}>
      <main className={styles.panel}>
        <Image className={styles.logo} src="/img/logos/blue_logo.jpeg" alt="Grapple Wrestling card game" width={637} height={560} priority />

        <div className={styles.form}>
          <input
            className={styles.input}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="nickname"
            maxLength={20}
          />
          <button className={`${styles.btn} ${styles.primary}`} onClick={createGame} disabled={!isSessionReady}>
            Play a Friend
          </button>
          <button className={`${styles.btn} ${styles.light}`} onClick={createPracticeGame} disabled={!isSessionReady}>
            Practice vs Computer
          </button>

          <div className={styles.divider}>Have a code?</div>
          <div className={styles.joinRow}>
            <input
              className={`${styles.input} ${styles.codeInput}`}
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Game code"
              aria-label="Game code"
              inputMode="numeric"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") joinGame();
              }}
            />
            <button className={styles.btn} onClick={joinGame} disabled={!isSessionReady}>
              Join
            </button>
          </div>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </div>

        <a className={styles.footer} href="/privacy/">
          Privacy Policy
        </a>
      </main>
    </div>
  );
}
