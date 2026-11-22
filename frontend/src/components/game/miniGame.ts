import type { TLine } from "@/types/tverse";

/** What FixTheTModal hands every mini-game. There's no timer and no way to lose: finish at your own pace. */
export interface MiniGameProps {
  /** The repair is done (the game shows its own finish card first). */
  onWin: () => void;
  /** Back to the delay card. */
  onExit: () => void;
  /** Station name for the HUD, e.g. "Boylston". */
  place?: string;
  /** Station id and line, for games whose job depends on the station (an elevator only below the street). */
  stationId?: string;
  line?: TLine;
}
