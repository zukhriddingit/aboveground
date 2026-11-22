import * as T from "three";
import type { TLine } from "@/types/tverse";
import { LINE_COLORS } from "@/lib/theme";
import { part, tint } from "./riderGeometry";
import { CAR_FLOOR } from "./rideRoute";

// A cutaway car with open centre doors, low sills and a full-height cab at either end.
// Built in the rider's units so the deck, grip and shoes stay registered at every zoom.
export class TripCar {
  readonly root = new T.Group();
  private readonly trim = tint();
  private readonly fittings = tint();
  // The short boarding bridge extends through the open doorway at a platform.
  readonly ramp = part("trip-car-ramp", this.fittings, b => {
    b.box("#7d8788", 1.33, .145, 0, .733, .035, .89, 0, -.448);
    b.box("#ecbd65", 1.645, .009, 0, .075, .016, .89);
  });
  private line?: TLine;

  constructor() {
    this.root.visible = false;
    this.root.add(this.ramp, part("trip-car-line", this.trim, b => {
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          b.box("#ffffff", side * 1.01, .59, end * 1.63, .09, .34, 2.03);
          b.box("#ffffff", 0, .70, end * 2.63, 2.07, .54, .10);
        }
      }
    }), part("trip-car-cabin", this.fittings, b => {
      b.box("#637078", 0, CAR_FLOOR - .09, 0, 2.04, .18, 5.33);
      b.box("#343940", 0, .119, 0, 1.68, .16, 4.75);
      // The far window band and the cab shoulders retain the silhouette of a railcar.
      b.box("#bfc8ca", -1.005, 1.98, 0, .093, .094, 5.18);
      for (const z of [-2.0, -1.35, -.67, .67, 1.35, 2.0]) {
        b.box("#aeb7b6", -1.006, 1.45, z, .064, 1.02, .05);
      }
      for (const end of [-1, 1]) {
        b.box("#f0eadd", 0, .98, end * 2.64, 2.08, .16, .09);
        b.box("#273d49", 0, 1.48, end * 2.65, 1.83, .87, .055);
        b.box("#ddd9cf", 0, 2.05, end * 2.29, 2.16, .145, .89);
        b.box("#232d32", 0, 1.95, end * 2.67, 1.1, .13, .06);
        b.box("#364651", 0, .48, end * 2.713, 2.08, .092, .07);
        b.box("#e3e4d9", 0, 1.46, end * 2.683, .048, .91, .036);
        for (const side of [-1, 1]) {
          b.tube("#15232a", .018, [[side * .24, 1.085, end * 2.7], [side * .52, 1.23, end * 2.7], [side * .70, 1.28, end * 2.7]]);
        }
        b.box("#edba7c", 0, 1.95, end * 2.71, .55, .042, .012);
        for (const side of [-1, 1]) {
          b.oval("#fff0c7", side * .78, .73, end * 2.703, .09, .068, .018);
          for (const axle of [1.4, 2.06]) {
            b.oval("#272c30", side * .91, .155, end * axle, .092, .155, .156);
            b.oval("#7b8180", side * .991, .155, end * axle, .017, .071, .071);
          }
          b.box("#687479", side * 1.005, .65, end * 2.20, .11, .75, .78);
          b.box("#324956", side * 1.01, 1.4, end * 2.22, .077, .87, .72);
          b.box("#cdd3ce", side * 1.013, 1.42, end * 1.846, .09, 1.00, .044);
          b.box("#d8d7cc", side * 1.005, 1.4, end * 2.58, .09, 1.2, .085);
          b.box("#deddd2", side * 1.012, .833, end * 1.63, .101, .14, 2.03);
          b.box("#303b42", side * 1.012, .93, end * 1.63, .11, .046, 2.03);
          b.box("#c4cbc8", side * .929, 1.33, end * .76, .038, 1.91, .042);
          b.box("#e4b657", side * .945, .335, end * .2, .124, .018, .8);
        }
        b.box("#536976", 0, .65, end * 1.98, 1.66, .16, .55);
        b.box("#637c86", 0, .91, end * 2.27, 1.67, .56, .12);
      }
      b.box("#aeb7b8", 0, 2.27, 0, .044, .055, 4.45);
      for (const end of [-1, 1]) b.box("#aeb7b8", 0, 2.13, end * 2.06, .055, .26, .055);
      // Rider faces the open side (+X). The loop's low point coincides with the right palm.
      b.tube("#c5b082", .017, [[0, 2.272, .29], [.14, 2.272, .29], [.14, 2.24, .29]]);
      b.tube("#664937", .018, [[.14, 2.25, .29], [.14, 2.19, .23], [.14, CAR_FLOOR + 1.835, .29], [.14, 2.19, .35], [.14, 2.25, .29]]);
    }));
  }
  setLine(line: TLine) {
    if (line !== this.line) this.trim.color.set(LINE_COLORS[line]);
    this.line = line;
  }
  dispose() {
    this.root.removeFromParent();
    this.trim.dispose();
    this.fittings.dispose();
  }
}
