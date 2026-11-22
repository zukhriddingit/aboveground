// HUD (Member 4): rider badge + Transit Rank, map controls and layers, dock, incident banner, data badge,
// toasts, live alerts, next trains. Shared look: `@/lib/ui`; rider name: `@/lib/riderProfile`.
export { GameHUD, type GameHUDProps } from "./GameHUD";
export { RiderProfilePopover } from "./RiderProfilePopover";
export { DemoBar } from "./DemoBar";
export { MapControls, type MapControlsProps } from "./MapControls";
export { DEFAULT_LAYERS, LAYER_INFO, LAYER_ORDER, TELEMETRY_INFO, type MapLayerKey, type ViewMode } from "./layers";
export { TelemetryCard, type TelemetryStat } from "./TelemetryCard";
export { IncidentBanner } from "./IncidentBanner";
export { SourceBadge } from "./SourceBadge";
export { ToastStack, useToasts, type Toast, type ToastTone } from "./Toasts";
export { HatIcon } from "./HatIcon";
export { LineBullet, TRoundel, routeLetter } from "./LineBullet";
export { Switch } from "./Switch";
export { useProgress, HAT_INFO, HAT_ORDER, type GainResult, type Progress, type ProgressApi, type XpGain } from "./useProgress";
export { RANKS, XP_REWARDS, hatUnlockedBetween, nextRank, rankFor, rankOfLevel, rankProgress, type Rank, type RankLevel } from "./ranks";
export { useTicker } from "./useTicker";
export { LiveAlertsButton, LiveAlertsPanel, type LiveAlertsPanelProps } from "./LiveAlerts";
export { NextTrains } from "./NextTrains";
