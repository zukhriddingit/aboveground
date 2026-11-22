// Fix the T (Member 4): delay simulation, 3D repair effects, the delay card and mini-games.
export { FixTheTModal, POINTS_PER_FIX, formatElapsed, type FixTheTModalProps } from "./FixTheTModal";
export { FixTheTMap, type FixTheTMapProps } from "./FixTheTMap";
export { FixTheTScene, type RepairCallbacks } from "./FixTheTScene";
export type { TunnelView } from "./TunnelView";
export { IncidentTag } from "./IncidentTag";
export { zoomScale } from "./trackGeo";
export { IncidentSim, RIDERS_PER_TRAIN, type FeedSource, type Incident, type IncidentStats } from "./incidentSim";
export { useWorldFeed, triggerDelay, type WorldFeed } from "./useWorldFeed";
export { canPlay, demoAlert, gameFor, shortName, translateForGame, translateLocally, DEMO_RAW_TEXT } from "./alertTranslator";
export { faultForGame, faultPlace, type FaultKind } from "./faults";
export { WireMatchGame } from "./WireMatchGame";
export { TrackWeldGame } from "./TrackWeldGame";
export { ClosureMarkers } from "./ClosureMarkers";
export { useLiveMbta, type ClosureSite, type LiveMbta } from "./useLiveMbta";
export {
  causeLabel,
  countdownLabel,
  effectLabel,
  featuredStationFor,
  scenarioFor,
  whenLabel,
  type Arrival,
  type LiveAlert,
  type MbtaStation,
  type StationIndex,
} from "./mbtaV3";
export type { GameKind } from "./alertTranslator";
