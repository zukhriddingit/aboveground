// Branch gaps, next usable train, planned-closure wayfinder. See components/quickcheck/README.md.
export { useBranchGaps, withTransitData, type BranchGapsResult, type UseBranchGapsOptions } from "./useBranchGaps";
export { computeBranchGaps, branchOf, branchShort, branchLine, type StationBranchInfo } from "./branchGaps";
export { fetchPredictions, type Prediction } from "./predictions";
export {
  SCHEDULED_HEADWAYS,
  STATION_BRANCHES,
  DIRECTION_LABELS,
  scheduledHeadway,
  isBranchGap,
  isPeak,
  type BranchId,
  type Headway,
} from "./headways";
export { mockBranchInfo, MOCK_PLANNED_CLOSURES, plannedClosureFor } from "./mockTransit";
export {
  BranchGapBadge,
  branchLabel,
  BranchGapList,
  NextUsableBadge,
  ClosureCard,
  type BranchGapBadgeProps,
  type BranchGapListProps,
  type NextUsableBadgeProps,
  type ClosureCardProps,
} from "./TransitBadges";
