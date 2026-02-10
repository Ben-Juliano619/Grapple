import { CardKind } from "./types";

export type CardDefinition = {
  name: string;
  kind: CardKind;
  color: string;
  image: string;
  count: number;
  meta?: {
    doesNotChangePosition?: boolean;
    endsGame?: boolean;
  };
};

export const cardBackImage = "/img/cards/card-back.svg";

export const rulesCards = [
  "/img/rules/rules-1.svg",
  "/img/rules/rules-2.svg",
  "/img/rules/rules-3.svg",
];

export const cardDefinitions: CardDefinition[] = [
  {
    name: "End of Period",
    kind: "END_OF_PERIOD",
    color: "#7a3db5",
    image: "/img/cards/end-of-period.svg",
    count: 2,
  },
  {
    name: "Out of Bounds",
    kind: "OUT_OF_BOUNDS",
    color: "#808080",
    image: "/img/cards/out-of-bounds.svg",
    count: 2,
  },
  {
    name: "Blood Time",
    kind: "BLOODTIME",
    color: "#d0021b",
    image: "/img/cards/blood-time.svg",
    count: 2,
  },
  {
    name: "Penalty Card",
    kind: "PENALTY",
    color: "#74c045",
    image: "/img/cards/penalty-card.svg",
    count: 2,
  },
  {
    name: "Stalling",
    kind: "STALLING",
    color: "#d19b00",
    image: "/img/cards/stalling.svg",
    count: 2,
  },
  {
    name: "Attempted Takedown",
    kind: "ATTEMPT_TAKEDOWN",
    color: "#111111",
    image: "/img/cards/attempted-takedown.svg",
    count: 2,
    meta: { doesNotChangePosition: true },
  },
  {
    name: "Ankle Pick to Back",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/ankle-pick-to-back.svg",
    count: 1,
  },
  {
    name: "Duck Under",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/duck-under.svg",
    count: 1,
  },
  {
    name: "Double Leg Takedown",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/double-leg-takedown.svg",
    count: 3,
  },
  {
    name: "Fireman's Carry to Opponent's Back",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/firemans-carry-to-opponents-back.svg",
    count: 1,
  },
  {
    name: "Head Lock to Pin!",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/head-lock-to-pin.svg",
    count: 1,
    meta: { endsGame: true },
  },
  {
    name: "Hip Toss",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/hip-toss.svg",
    count: 1,
  },
  {
    name: "Single Leg Takedown",
    kind: "NEUTRAL",
    color: "#111111",
    image: "/img/cards/single-leg-takedown.svg",
    count: 3,
  },
  {
    name: "Top Double Leg Takedown",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/top-double-leg-takedown.svg",
    count: 2,
  },
  {
    name: "Far Side Cradle",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/far-side-cradle.svg",
    count: 1,
  },
  {
    name: "Far Arm Chop",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/far-arm-chop.svg",
    count: 1,
  },
  {
    name: "Near Side Cradle",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/near-side-cradle.svg",
    count: 1,
  },
  {
    name: "Pump Handle Tilt",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/pump-handle-tilt.svg",
    count: 1,
  },
  {
    name: "Inside Wrist Half to Pin!",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/inside-wrist-half-to-pin.svg",
    count: 2,
    meta: { endsGame: true },
  },
  {
    name: "Turk Cradle to Pin!",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/turk-cradle-to-pin.svg",
    count: 1,
    meta: { endsGame: true },
  },
  {
    name: "Spiral Ride to Opponent's Back",
    kind: "TOP",
    color: "#1e6fd0",
    image: "/img/cards/spiral-ride-to-opponents-back.svg",
    count: 1,
  },
  {
    name: "Elbow Roll Chest-to-Chest Pin!",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/elbow-roll-chest-to-chest-pin.svg",
    count: 1,
    meta: { endsGame: true },
  },
  {
    name: "Granby Roll",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/granby-roll.svg",
    count: 2,
  },
  {
    name: "Inside Switch",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/inside-switch.svg",
    count: 2,
  },
  {
    name: "Outside Switch",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/outside-switch.svg",
    count: 1,
  },
  {
    name: "Sit Out (No Change)",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/sit-out-no-change.svg",
    count: 2,
    meta: { doesNotChangePosition: true },
  },
  {
    name: "Sit Out Tri-Pod Duckout",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/sit-out-tripod-duckout.svg",
    count: 1,
  },
  {
    name: "Stand Up",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/stand-up.svg",
    count: 3,
  },
  {
    name: "Sit Out Tri-Pod Peterson",
    kind: "BOTTOM",
    color: "#28a745",
    image: "/img/cards/sit-out-tripod-peterson.svg",
    count: 1,
  },
  {
    name: "Whizzer",
    kind: "COUNTER",
    color: "#f08a24",
    image: "/img/cards/counter-whizzer.svg",
    count: 2,
  },
  {
    name: "Sprawl",
    kind: "COUNTER",
    color: "#f08a24",
    image: "/img/cards/counter-sprawl.svg",
    count: 2,
  },
];
