"use client";

import type { Position } from "../../shared/types";

// PLACEHOLDER ART. Simple SVG wrestlers that show the current position of the
// match. The poses are drawn from basic shapes so final illustrations or
// animations (e.g. Rive/Lottie) can replace <NeutralScene>/<RefereeScene>
// later without touching any game logic.

type Wrestler = {
  name: string;
  position: Position;
  color: string;
};

type Props = {
  me: Wrestler | null;
  opponent: Wrestler | null;
  height: number;
};

const SKIN = "#f1c9a5";
const LIMB_WIDTH = 5;

function Limb({ points, color = SKIN, width = LIMB_WIDTH }: { points: string; color?: string; width?: number }) {
  return <polyline points={points} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />;
}

/** Standing in neutral stance, facing right. Feet rest on y = 70. */
function StanceFigure({ color }: { color: string }) {
  return (
    <g>
      <Limb points="62,48 52,58 46,69" />
      <Limb points="62,48 72,57 70,69" />
      <Limb points="62,48 72,32" color={color} width={10} />
      <Limb points="70,35 78,44" />
      <Limb points="72,34 82,40 87,46" />
      <circle cx={78} cy={26} r={6.5} fill={SKIN} />
    </g>
  );
}

/** Bottom wrestler on hands and knees, facing right. */
function BottomFigure({ color }: { color: string }) {
  return (
    <g>
      <Limb points="88,47 84,68 70,69" />
      <Limb points="88,47 92,68 78,69" />
      <Limb points="88,47 122,45" color={color} width={11} />
      <Limb points="119,47 121,69" />
      <Limb points="114,47 112,69" />
      <circle cx={130} cy={43} r={6.5} fill={SKIN} />
    </g>
  );
}

/** Top wrestler kneeling beside the bottom wrestler, arm around the waist. */
function TopFigure({ color }: { color: string }) {
  return (
    <g>
      <Limb points="94,46 84,58 78,69" />
      <Limb points="94,46 102,60 100,69" />
      <Limb points="94,46 103,29" color={color} width={10} />
      <Limb points="101,33 108,42 114,45" />
      <Limb points="99,34 94,42 90,45" />
      <circle cx={106} cy={23} r={6.5} fill={SKIN} />
    </g>
  );
}

function NeutralScene({ left, right }: { left: Wrestler; right: Wrestler }) {
  return (
    <g>
      <StanceFigure color={left.color} />
      {/* Mirror the second wrestler so they face each other. */}
      <g transform="translate(200,0) scale(-1,1)">
        <StanceFigure color={right.color} />
      </g>
    </g>
  );
}

function RefereeScene({ top, bottom }: { top: Wrestler; bottom: Wrestler }) {
  return (
    <g>
      <BottomFigure color={bottom.color} />
      <TopFigure color={top.color} />
    </g>
  );
}

export default function WrestlingMat({ me, opponent, height }: Props) {
  if (!me || !opponent) return null;

  const top = me.position === "TOP" ? me : opponent.position === "TOP" ? opponent : null;
  const bottom = me.position === "BOTTOM" ? me : opponent.position === "BOTTOM" ? opponent : null;
  const isReferee = Boolean(top && bottom && top !== bottom);

  const caption = isReferee ? `${top!.name} on top` : "Neutral";
  // Changing the key replays the fade-in whenever the position changes.
  const sceneKey = isReferee ? `ref-${top!.name}` : "neutral";

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 2 }} aria-label={`Wrestling mat: ${caption}`}>
      <svg viewBox="0 0 200 80" style={{ height, width: "auto", maxWidth: "100%", overflow: "visible" }} role="img">
        {/* The mat: outer circle and center starting circle. */}
        <ellipse cx={100} cy={64} rx={96} ry={14} fill="rgba(18, 73, 148, 0.85)" stroke="rgba(255,255,255,0.35)" />
        <ellipse cx={100} cy={64} rx={40} ry={6} fill="rgba(196, 38, 38, 0.75)" />
        <g key={sceneKey} style={{ animation: "grappleSceneIn 350ms ease-out" }}>
          {isReferee ? <RefereeScene top={top!} bottom={bottom!} /> : <NeutralScene left={me} right={opponent} />}
        </g>
      </svg>
      <div style={{ fontSize: 12, opacity: 0.9 }}>{caption}</div>
    </div>
  );
}
