// shared/types.ts
export type Position = "NEUTRAL" | "TOP" | "BOTTOM";

export type CardKind =
  | "TOP"
  | "BOTTOM"
  | "NEUTRAL"
  | "COUNTER"
  | "BONUS"
  | "BLOODTIME"
  | "STALLING"
  | "OUT_OF_BOUNDS"
  | "PENALTY"
  | "END_OF_PERIOD"
  | "ATTEMPT_TAKEDOWN"
  | "PIN"
  | "TRIPOD"
  | "SITOUT";

export type Card = {
  id: string;          // unique per physical card instance
  name: string;        // e.g. "Single Leg Takedown"
  kind: CardKind;
  color: string;       // for UI
  points?: number;     // if you want scoring cards
  meta?: {
    // used for “After a takedown, bottom needs appropriate move to escape”
    requiresEscapeMove?: string[]; // list of move tags that can respond
    doesNotChangePosition?: boolean; // for tripod/sitout
  };
};

