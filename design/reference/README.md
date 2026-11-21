# Station references

Modelling references for the 3D stations (`frontend/public/models/stations/*.glb`).

- `<stationId>/*.jpg`: real exterior photos of each station from Wikimedia Commons (git-ignored; authors and licences in `CREDITS.md`). Re-download with the URLs there.
- `osm_stations.json`: real geometry within 230 m of each station from OpenStreetMap (© OpenStreetMap contributors, ODbL):
  - `entrances`: subway entrance nodes;
  - `buildings`: headhouse/canopy footprints (`building=train_station|roof|transportation`, with any `height`/`roof:shape`/`material` tags);
  - `platforms`: surface platform outlines;
  - `tracks`: light-rail centrelines.
  Coordinates are `[lng, lat]`.
