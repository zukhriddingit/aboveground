// Quick-Check: 1-tap "Waze for the T" rider reports. See README.md in this folder.
export { QuickCheckBar, type QuickCheckBarProps } from "./QuickCheckBar";
export { StaleEtaBadge, type StaleEtaBadgeProps } from "./StaleEtaBadge";
export { useStationSignals, mockRiderReports, type StationSignalsResult, type UseStationSignalsOptions } from "./useStationSignals";
export {
  submitQuickReport,
  flushPending,
  setForcedOffline,
  useQuickState,
  getClientId,
  cooldownLeft,
  PENDING_KEY,
  type PendingReport,
  type QuickDraft,
  type QuickState,
  type SubmitResult,
} from "./quickStore";
export { computeStationSignals, mergeSignals, emptySignals } from "./signals";
export { QUICK_KINDS, QUICK_KIND_KEYS, QUICK_GROUPS, QUICK_POINTS, QUICK_COOLDOWN_MS } from "./kinds";
export * as quickCheckApi from "./api";
