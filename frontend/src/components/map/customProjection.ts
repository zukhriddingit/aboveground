import type { CustomRenderMethodInput } from "maplibre-gl";

export type CustomFrame = CustomRenderMethodInput | ArrayLike<number>;

/** With Mercator selected, both engines map normalized MercatorCoordinate XYZ to clip space. */
export function mercatorToClip(frame: CustomFrame): ArrayLike<number> {
  return "defaultProjectionData" in frame ? frame.defaultProjectionData.mainMatrix : frame;
}
