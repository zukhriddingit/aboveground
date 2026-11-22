/** What FixTheTModal hands every mini-game. There's no timer and no way to lose: finish at your own pace. */
export interface MiniGameProps {
  /** The repair is done (the game shows its own finish card first). */
  onWin: () => void;
  /** Back to the delay card. */
  onExit: () => void;
  /** Station name for the HUD, e.g. "Boylston". */
  place?: string;
}
