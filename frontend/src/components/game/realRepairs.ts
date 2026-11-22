// How long each kind of repair really takes on the T, shown after a mini-game instead of points.
// Every figure is from the linked source; keep them that way when editing.
import type { GameKind } from "./alertTranslator";

export interface RealRepair {
  /** Short answer for the chip. */
  typical: string;
  /** What the job involves and how long it takes. */
  detail: string;
  /** Real MBTA cases, most typical first. */
  examples: string[];
  sources: Array<{ label: string; url: string }>;
}

export const REAL_REPAIRS: Record<GameKind, RealRepair> = {
  WIRE_MATCH: {
    typical: "Minutes to hours",
    detail:
      "On the T's old relay-based signals, crews often have to walk the line to find the fault in person. About 30% of MBTA delays come from aging signals; the $295 million Red and Orange Line replacement is due to finish in December 2026.",
    examples: [
      "June 5, 2025: a signal problem at JFK/UMass delayed Red Line trains for about three hours.",
      "June 11, 2019: a derailment near JFK/UMass wrecked the signals there. Crews rebuilt signal bungalows and nearly 20 miles of signal cable, and regular Red Line service took 106 days to come back.",
      "November 2026: the central Green Line tunnel closed for nine days to lay 12.5 miles of new signal cable, replacing signals over 100 years old. Copley's new signals are due in early March 2027.",
    ],
    sources: [
      { label: "WBUR, Oct 2025", url: "https://www.wbur.org/news/2025/10/03/mbta-signal-system-red-orange-line-updates-boston" },
      { label: "Boston Globe, Jun 2025", url: "https://www.bostonglobe.com/2025/06/05/metro/red-line-d-line-medford-somerville-signal-problems/" },
      { label: "MBTA, Sep 2019", url: "https://www.mbta.com/news/2019-09-25/completion-red-line-signal-repairs" },
      { label: "MBTA, Nov 2026", url: "https://www.mbta.com/news/2026-11-16/mbta-continues-successfully-advance-green-line-modernization-investments-makes" },
    ],
  },
  TRACK_WELD: {
    typical: "About 45 minutes a weld",
    detail:
      "A two-person crew needs a little under 45 minutes for one thermite weld; the molten steel itself pours after 25 to 35 seconds in the crucible. Fixing a broken rail usually means two welds in an overnight window.",
    examples: [
      "Clearing every MBTA slow zone took 14 months: 221 days of work and 23 planned closures replaced over 250,000 feet of rail and lifted more than 220 speed restrictions by December 2024.",
    ],
    sources: [
      { label: "Railway Age, May 2023", url: "https://www.railwayage.com/mw/welding-physics-and-cwr/" },
      { label: "MBTA Track Improvement Program", url: "https://www.mbta.com/projects/track-improvement-program" },
    ],
  },
  SWITCH_THROW: {
    typical: "Usually fixed overnight",
    detail: "A failed switch at a junction stops every train that needs it. Crews repair it on site while shuttle buses cover the gap.",
    examples: [
      "Jan. 26, 2023: a signal and switch failure at Copley Junction stranded three trains around 9 p.m.; the switch was repaired and service resumed at 12:30 a.m., about three and a half hours later.",
      "After the 2019 derailment, switch operations at Columbia Junction near JFK/UMass stayed limited until new signals were finished in April 2026, almost seven years later.",
    ],
    sources: [
      { label: "Boston.com, Jan 2023", url: "https://www.boston.com/news/local-news/2023/01/27/green-line-shutdown-mbta-riders-sent-walking-through-tunnels/" },
      { label: "MBTA, Apr 2026", url: "https://www.mbta.com/news/2026-04-08/mbta-completes-major-signal-modernization-columbia-junction-weeks-ahead-schedule" },
    ],
  },
  BREAKER_SEQUENCE: {
    typical: "A few hours",
    detail:
      "Before anyone can touch a downed wire or a damaged feeder, the power is cut and the area made safe. Then the Power Department repairs it and brings sections back one at a time.",
    examples: ["May 7, 2026: a downed cable on the Green Line D branch put shuttle buses on from 5:47 a.m. until regular service resumed at 10:39 a.m."],
    sources: [{ label: "Boston Globe, May 2026", url: "https://www.bostonglobe.com/2026/05/07/metro/green-line-d-shuttle-buses/" }],
  },
  RESCUE_COUPLE: {
    typical: "30 minutes to 2 hours",
    detail:
      "Usually the train behind couples on and pushes the dead one to the next station or a yard, after riders are let off. Delays linger for a while after it's gone.",
    examples: [
      "Dec. 16, 2025: a disabled Red Line train was reported at Harvard just before 7:30 a.m., removed from service by 8:45, and the leftover delays cleared about 30 minutes later.",
    ],
    sources: [{ label: "Boston Globe, Dec 2025", url: "https://www.bostonglobe.com/2025/12/16/metro/mbta-red-line-orange-line-delays/" }],
  },
  ICE_THAW: {
    typical: "Minutes, or days in a big storm",
    detail:
      "Most switches have heaters that can be turned on remotely; when one fails, crews clear the points with brooms, scrapers and blowers. A record storm is another story.",
    examples: [
      "Winter 2015: up to 8 inches of ice coated rails, the MBTA suspended all service on Jan. 27, Feb. 9 to 10 and Feb. 15, and subway lines were disrupted for weeks.",
    ],
    sources: [
      { label: "MBTA, Impacts of Winter 2015", url: "https://onlinepubs.trb.org/onlinepubs/conferences/2015/LRT/McClellan.pdf" },
      { label: "Boston Globe, Feb 2015", url: "https://www.bostonglobe.com/metro/2015/02/03/record-amounts-snow-compounds-problems-for-already-battered-transit-system/lB69Adr1JmzUxS60U1OpaN/story.html" },
    ],
  },
};
