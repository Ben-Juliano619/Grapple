import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grapple – Privacy Policy",
};

// Linked from the App Store listing (required by Apple). Keep this in sync
// with what the app actually does with data.
// TODO before submitting: replace CONTACT_EMAIL with a real support address.
const CONTACT_EMAIL = "support@grapplewrestlingcardgame.com";
const LAST_UPDATED = "November 15, 2026";

const sectionStyle = { display: "grid", gap: 8 } as const;

export default function PrivacyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f9",
        color: "#1d1d1f",
        fontFamily: "system-ui",
        padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
        WebkitUserSelect: "text",
        userSelect: "text",
      }}
    >
      <main style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 20, lineHeight: 1.55 }}>
        <header>
          <h1 style={{ margin: 0 }}>Grapple Privacy Policy</h1>
          <p style={{ margin: "4px 0 0", color: "#555" }}>Last updated {LAST_UPDATED}</p>
        </header>

        <section style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 20 }}>The short version</h2>
          <p style={{ margin: 0 }}>
            Grapple doesn&apos;t require an account, doesn&apos;t show ads, and doesn&apos;t track you. We don&apos;t sell or share
            any data.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 20 }}>What the game uses</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            <li>
              <strong>Player name:</strong> the nickname you type is shown to the other player in your game. It&apos;s kept in
              the game server&apos;s memory only while the game exists and is deleted when the game ends or goes idle.
            </li>
            <li>
              <strong>Game session ID:</strong> a random ID stored on your device so you can reconnect to a game if your
              connection drops. It isn&apos;t linked to your identity.
            </li>
            <li>
              <strong>Saved name:</strong> your last nickname is remembered on your device so you don&apos;t have to retype it.
            </li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 20 }}>What we don&apos;t collect</h2>
          <p style={{ margin: 0 }}>
            No email, phone number, contacts, location, photos, advertising identifiers or analytics. Game results are not
            stored after a game ends.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Children</h2>
          <p style={{ margin: 0 }}>Grapple doesn&apos;t knowingly collect personal information from anyone, including children.</p>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Contact &amp; support</h2>
          <p style={{ margin: 0 }}>
            Questions or problems? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <p style={{ margin: 0 }}>
          <a href="/">← Back to Grapple</a>
        </p>
      </main>
    </div>
  );
}
