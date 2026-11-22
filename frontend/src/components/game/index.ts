// Fix the T (Member 4): delay simulation, 3D repair effects, the delay card and mini-games.
// The delay card (FixTheTModal) and the 3D scene (FixTheTScene) are loaded on demand, so import
// them from their own files rather than from here.
export { formatElapsed } from "./format";
export { FixTheTMap, type FixTheTMapProps } from "./FixTheTMap";
export type { RepairCallbacks } from "./FixTheTScene";
export type { TunnelView } from "./TunnelView";
export { IncidentTag } from "./IncidentTag";
export { zoomScale } from "./trackGeo";
export { IncidentSim, RIDERS_PER_TRAIN, type FeedSource, type Incident, type IncidentStats } from "./incidentSim";
export { useWorldFeed, triggerDelay, type WorldFeed } from "./useWorldFeed";
export { canPlay, demoAlert, gameFor, shortName, translateForGame, translateLocally, DEMO_RAW_TEXT } from "./alertTranslator";
export { faultForGame, faultPlace, isSurfaceStation, type FaultKind } from "./faults";
export { ClosureMarkers } from "./ClosureMarkers";
export { LiveMarkers } from "./LiveMarkers";
export { describeEvent, useLiveMbta, type ClosureSite, type LiveEvent, type LiveMbta, type StoppedNear } from "./useLiveMbta";
export {
  causeLabel,
  closureScenario,
  countdownLabel,
  effectLabel,
  featuredStationFor,
  isServiceAlert,
  scenarioFor,
  whenLabel,
  type Arrival,
  type LiveAlert,
  type MbtaStation,
  type StationIndex,
} from "./mbtaV3";
export type { GameKind } from "./alertTranslator";
