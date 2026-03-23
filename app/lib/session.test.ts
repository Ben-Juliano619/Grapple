import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createNewGameSession, ensureSessionForGame, readGameSessionCookie } from "./session";
import { resetGameSessionState, setActiveGameId, getActiveGameId } from "./gameSessionState";

type MockDocument = {
  cookie: string;
};

function createMockDocument(): MockDocument {
  let cookieStore = new Map<string, string>();

  return {
    get cookie() {
      return Array.from(cookieStore.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    },
    set cookie(value: string) {
      const [keyValue, ...rawAttributes] = value.split(";");
      const [rawKey, rawVal = ""] = keyValue.split("=");
      const key = rawKey.trim();
      const attributes = rawAttributes.map((part) => part.trim().toLowerCase());
      const maxAge = attributes.find((part) => part.startsWith("max-age="));

      if (maxAge === "max-age=0") {
        cookieStore.delete(key);
        return;
      }

      cookieStore.set(key, rawVal);
    },
  };
}

beforeEach(() => {
  const mockDocument = createMockDocument();
  (global as { document: MockDocument }).document = mockDocument;

  const store = new Map<string, string>();
  const sessionStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  (global as { window: { sessionStorage: Storage } }).window = {
    sessionStorage,
  };
});

test("returning home clears stale cookie/session state", () => {
  createNewGameSession("111111");
  setActiveGameId("111111");

  let socketResetCalls = 0;
  resetGameSessionState({
    clearSessionCookie: true,
    resetSocketConnection: () => {
      socketResetCalls += 1;
    },
  });

  assert.equal(socketResetCalls, 1);
  assert.equal(readGameSessionCookie(), null);
  assert.equal(getActiveGameId(), null);
});

test("valid reconnect session is preserved for same game", () => {
  const created = createNewGameSession("222222");
  const reused = ensureSessionForGame("222222");

  assert.equal(reused, created.sessionId);
  assert.equal(readGameSessionCookie()?.gameId, "222222");
});

test("switching to another game replaces old session cookie", () => {
  const original = createNewGameSession("333333");
  const replaced = ensureSessionForGame("444444");
  const cookie = readGameSessionCookie();

  assert.notEqual(replaced, original.sessionId);
  assert.equal(cookie?.gameId, "444444");
  assert.equal(cookie?.sessionId, replaced);
});
