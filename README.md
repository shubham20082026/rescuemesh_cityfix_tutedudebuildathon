# RescueMesh

### Flood Road-Closure and Hospital-Accessibility Simulator

**Developed by Shubham Parmar**

RescueMesh explores how hypothetical flood-related road closures affect access to hospitals. It identifies disconnected localities, calculates the nearest reachable hospital and compares individual road repairs by their potential to restore access.

The project focuses on a practical question:

> If one closed road could be reopened, which connection would restore the most access to care?

The Bengaluru edition includes an OpenStreetMap data-building pipeline targeting **Bellandur, Sarjapur Road and Marathahalli**, together with an interactive dashboard for exploring disruptions.

> **Current status:** The data-driven dashboard and local data builder are implemented. The supplied dataset is an empty placeholder and requires a successful local build. Live OSM acquisition has not been verified end to end. Leaflet mapping, budgeted multi-road optimization and sourced waterlogging scenarios remain planned.

---

## The Problem

A road closure can affect more than the vehicles travelling along it. It may disconnect a locality from nearby hospitals or force a substantially longer journey.

Understanding these consequences requires looking at the road network as a whole:

- Which localities still have a route to a hospital?
- Which become disconnected?
- How does hospital availability change accessibility?
- Which individual road restoration produces the largest improvement?
- What assumptions influence the recommendation?

RescueMesh provides an inspectable simulation of these questions. It is a demonstration project, not an operational emergency-navigation service.

## Project Objectives

- Represent selected roads as a weighted graph.
- Simulate road closures and hospital unavailability.
- Calculate shortest routes to available hospitals.
- Measure locality coverage and illustrative demand coverage.
- Rank individual road-restoration candidates.
- Make data sources, snapping assumptions and model limitations visible.
- Support reproducible scenarios through JSON import and export.

## Implemented Features

### Interactive Dashboard

- Dark-themed interface with Overview, Analysis and Project notes.
- Clickable road segments for closing and reopening connections.
- Keyboard road editor.
- Locality selection and route highlighting.
- Hospital availability controls.
- Disconnected-locality indicators.
- Map zoom controls.
- Activity log.
- Undo and reset.

The current visualization renders **projected road geometry using SVG**. It does not yet use a Leaflet basemap.

### Accessibility Analysis

The dashboard reports:

| Metric | Meaning |
|---|---|
| Reachable localities | Localities with an open route to an enabled hospital |
| Disconnected demand weight | Illustrative weight assigned to localities without a route |
| Average road distance | Mean shortest road distance among reachable localities |
| Demand-weight coverage | Share of total illustrative weight with hospital access |

Distances are displayed in **kilometres**, not estimated travel minutes.

### Single-Road Restoration Ranking

For each closed road, RescueMesh tests the effect of reopening that road while keeping other closures and hospital settings unchanged.

Users can prioritize:

- Newly reachable localities.
- Newly reachable illustrative demand weight.

The dashboard provides a ranked list, repair previews and an action to apply a selected restoration.

> These recommendations evaluate individual roads. They do not establish an optimal combination of multiple repairs.

### Scenario Management

- Export the current scenario as JSON.
- Import a compatible scenario.
- Save scenario state locally when browser storage is available.
- Undo recent changes.
- Reset roads and hospitals to the baseline.
- Export a Markdown impact report.

Scenarios include a dataset identifier. A scenario from a different road dataset is rejected rather than applying its road IDs to unrelated segments.

### Data Provenance

The data pipeline retains:

- OSM feature IDs and source links.
- Hospital and locality names.
- Feature coordinates.
- Snapped graph-node identifiers.
- Feature-to-junction snap distances.
- Dataset retrieval timestamp.
- Road classes and length methodology.
- Dataset fingerprint.

The Analysis view exposes feature sources and snap distances for inspection.

---

## Current Implementation Status

| Component | Status |
|---|---|
| Data-driven graph engine | Implemented |
| Multi-source shortest-path routing | Implemented and tested on synthetic fixtures |
| Road closure and hospital controls | Implemented |
| Single-road restoration ranking | Implemented |
| Scenario import/export and undo/reset | Implemented |
| Markdown impact-report export | Implemented |
| Local OSM data builder | Implemented; live download path unverified |
| Embedded Bengaluru dataset | Not included; local build required |
| SVG network visualization | Implemented |
| Leaflet map with OSM tiles | Planned |
| Budgeted multi-road optimizer | Planned |
| Cited waterlogging-hotspot scenarios | Planned |
| Full browser/mobile verification | Pending |

## Technology Stack

| Layer | Technology |
|---|---|
| Dashboard | HTML, CSS and vanilla JavaScript |
| Network visualization | SVG |
| Routing | Heap-based multi-source Dijkstra |
| Data acquisition and preparation | Python and OSMnx |
| Geographic data | OpenStreetMap |
| Geographic queries | Overpass API and Nominatim |
| Scenario storage | JSON and browser local storage |
| Automated checks | Node.js test runner and Python unittest |
| Windows launcher | Batch script |

The generated standalone HTML has no runtime framework or API dependency. Python and internet access are needed to build the geographic dataset.

---

## Getting Started

### Requirements

- Python **3.10 or newer**.
- Internet access for dependency installation and the initial OSM data build.
- A modern browser.
- Node.js if you want to run the JavaScript tests.

### Option 1: Windows Launcher

Place these files together:

- `launch.bat`
- `RescueMesh.html`
- `build_data.py`
- `requirements.txt`

Double-click:

```bat
launch.bat
```

The launcher:

1. Checks for a compatible Python installation.
2. Reuses an existing valid `data.json` when available.
3. Otherwise creates a local `.venv` environment.
4. Installs the data-builder dependencies.
5. Runs the OSM data builder.
6. Opens the HTML after a successful build.

If setup fails, the launcher keeps the error visible.

**The launcher has not been execution-tested on Windows.**

### Option 2: Manual Setup

From the project directory:

```bash
python -m pip install -r requirements.txt
python build_data.py
```

After the builder reports success, open:

```text
RescueMesh.html
```

The script writes `data.json` and embeds it into the HTML. Reopen the HTML after rebuilding the dataset.

### Load an Existing Dataset

Use **Load generated data.json** in the dashboard to select a compatible local file.

This loads the dataset for the current browser session without modifying the HTML.

To embed an existing dataset permanently:

```bash
python build_data.py --embed-only data.json
```

Embedding an existing dataset does not require another OSM download.

---

## Data Sources

### Roads

The builder requests these OSM highway classes:

- `motorway`
- `trunk`
- `primary`
- `secondary`
- `tertiary`

Private/no-access ways and area-tagged ways are excluded.

The current filter also excludes residential roads, service roads and `*_link` ramps. Consequently, this is a **selected road-class model**, not a complete driving network.

### Hospitals

Hospital candidates come from named OSM features tagged:

- `amenity=hospital`
- `healthcare=hospital`

The builder targets 12 hospitals and requires between **8 and 15**.

Each hospital retains its source coordinates and is snapped to the nearest graph junction. Hospitals sharing a junction retain separate availability controls.

OSM hospital tags do not verify emergency services, current operating status or capacity.

### Localities

Demand locations come from named OSM place features, including suburbs, neighbourhoods, quarters, localities and villages.

The builder targets 10 localities and requires between **8 and 12**.

Point features retain their coordinates. Polygon features use approximate centres calculated in a projected coordinate system.

### Illustrative Demand Weights

Localities receive deterministic illustrative weights.

These values are:

- Not census populations.
- Not estimated resident counts.
- Not observed emergency demand.
- Used only to demonstrate weighted accessibility analysis.

### Source References

- [OpenStreetMap](https://www.openstreetmap.org/)
- [OpenStreetMap attribution and copyright](https://www.openstreetmap.org/copyright)
- [Overpass API](https://overpass-api.de/)
- [Nominatim](https://nominatim.org/)
- [OSMnx documentation](https://osmnx.readthedocs.io/en/stable/)

Geographic data attribution: **© OpenStreetMap contributors**.

---

## How It Works

### 1. Define the Study Area

The default builder resolves named queries for Bellandur, Marathahalli and Sarjapur Road in Bellandur.

The study bounds are derived from those results. Independently verified bounds can also be supplied through:

```text
--bbox WEST SOUTH EAST NORTH
```

The builder refuses study areas with a diagonal exceeding 14 km to avoid unintentionally downloading the whole city.

### 2. Build and Simplify the Road Graph

Road junctions become graph nodes. Road segments become weighted edges.

OSMnx simplifies intermediate shape nodes into junction-to-junction segments while retaining road geometry and summed segment lengths.

Lengths remain in metres internally. The builder does not replace curved-road length with straight-line distance between segment endpoints.

The intended graph size is at most **400 simplified junctions**.

Disconnected components and parallel segments are retained. Roads are treated as undirected, so one-way restrictions are not enforced.

### 3. Snap Hospitals and Localities

Each feature is assigned to the nearest simplified junction using great-circle distance.

The original coordinates and snap distance are retained for inspection.

**A snap is not a verified access road.** It may cross a physical barrier or omit a long approach road. Snap distances are therefore shown separately and excluded from the reported road kilometres.

### 4. Calculate Hospital Accessibility

A multi-source Dijkstra calculation starts from all enabled hospital junctions.

For each locality, the engine determines:

- Whether a hospital is reachable.
- Which hospital is reached by the shortest modeled route.
- The road distance.
- The sequence of road segments.

Disabling a hospital removes it as a destination. Its road junction remains traversable.

### 5. Evaluate Individual Repairs

For every closed road:

1. Copy the current closure set.
2. Reopen that road in the copy.
3. Recompute accessibility.
4. Measure newly reachable localities and demand weight.
5. Measure distance savings for localities already reachable before the repair.
6. Rank the candidate.

Tie-breaking uses locality count where applicable, distance savings and finally road ID.

Distance savings and newly restored access are measured separately. This avoids mixing newly reachable localities into a distance comparison with a different baseline.

---

## Known Optimization Limitation

Single-road ranking can miss a valuable combination of repairs.

Consider:

| Locality | Illustrative weight | Repairs required to reconnect |
|---|---:|---:|
| A | 5,000 | 2 |
| B | 100 | 1 |

Each individual road leading to A may have zero immediate benefit because the second road remains closed. A greedy approach therefore reconnects B first.

With a budget of two repairs:

- Sequential single-road ranking can reconnect only weight **100**.
- Restoring both roads leading to A can reconnect weight **5,000**.

This failure has been reproduced in a regression test.

**It is not fixed in the current version.**

The planned upgrade is a budgeted combination search that uses exhaustive evaluation when the search space is manageable and an explicitly approximate lookahead strategy for larger cases.

---

## Validation

### Completed Automated Checks

**19 automated checks passed:**

| Test group | Checks | Coverage |
|---|---:|---|
| Engine | 7 | Validation, routing, shared-junction hospitals, repair ranking, scenario identity and chain failure |
| Application state | 5 | Placeholder startup, dataset loading, controls, imports and escaped feature names |
| Python helpers | 7 | Distance calculations, snapping, bounds, deduplication, sampling and safe embedding |

JavaScript syntax and Python compilation checks also passed.

### Independent Shortest-Path Comparison

The routing engine was checked against an independently implemented Floyd–Warshall algorithm on randomized synthetic closure and hospital-outage states.

| Result | Count |
|---|---:|
| Randomized states checked | 500 |
| Matching shortest-path results | 500 |
| Failures | 0 |

These results validate the tested shortest-path calculations.

They do **not** establish:

- Real-world routing accuracy.
- Completeness of Bengaluru OSM data.
- Correctness of a budgeted optimizer.
- Browser rendering or mobile compatibility.

### Verification Still Pending

- Successful live OSM data acquisition.
- Inspection of actual generated Bengaluru features and snaps.
- Full Playwright/Chromium interaction tests.
- Browser download behavior.
- Mobile layout and accessibility verification.
- Windows launcher execution.
- Budgeted optimizer comparison against exhaustive search.

The application-state tests use a minimal DOM test double, not a real browser.

### Run the Tests

```bash
node --test tests/*.test.cjs
python -m unittest discover -s tests -p "test_*.py"
```

Synthetic test fixtures are isolated from the application dataset and are never presented as Bengaluru features.

---

## Project Files

| File | Purpose |
|---|---|
| `RescueMesh.html` | Standalone dashboard with embedded dataset placeholder |
| `launch.bat` | Windows setup and launch helper |
| `build_data.py` | OSM acquisition, data preparation, validation and embedding |
| `requirements.txt` | Python data-builder dependencies |
| `data.json` | Placeholder initially; geographic dataset after a successful build |
| `engine.js` | Graph validation, shortest paths, routes and single-road ranking |
| `app.js` | Dashboard state and interactions |
| `styles.css` | Interface styling |
| `index.template.html` | HTML source template |
| `build_html.py` | Rebuilds the standalone HTML from source |
| `tests/` | Automated checks and synthetic test fixtures |

To rebuild the HTML after editing the frontend source:

```bash
python build_html.py
```

This embeds the current `data.json`. Ensure it contains the intended dataset before rebuilding.

## Troubleshooting

### The HTML Shows Setup Instructions

The embedded dataset is still empty.

Run:

```bash
python build_data.py
```

Then reopen the HTML, or load a successfully generated `data.json` through the dashboard.

### The Data Download Fails

Check the reported error and internet connection. Public OSM services may be unavailable or rate-limited.

The builder caches responses in `osm_cache`. It does not generate substitute geographic data when a request fails.

### The Graph Has More Than 400 Junctions

Refine the verified study bounds or reduce the margin.

The builder rejects oversized graphs instead of silently removing arbitrary roads.

### Too Few Hospitals or Localities Are Found

Inspect the study bounds, OSM coverage and snapping threshold.

The builder requires the minimum counts rather than padding the dataset with invented features.

### A Scenario Import Is Rejected

The scenario may belong to the old synthetic graph or a different generated dataset.

Export a new scenario from the currently loaded dataset. Road identifiers are not interchangeable between datasets.

### Local Saving Does Not Work

Browser storage behavior can vary when opening local HTML files.

Use JSON export as a portable scenario backup.

---

## Limitations

- No live flood observations or predictions.
- No traffic, elevation or inundation model.
- No hospital capacity model.
- No verification of emergency-service availability.
- Illustrative demand weights rather than actual population data.
- Approximate locality centres and nearest-junction snaps.
- No validated routing for the snap connections.
- Undirected roads that ignore one-way and turn restrictions.
- Selected road classes that omit potentially important connections.
- Study boundaries that may remove routes outside the extract.
- Hospital selection capped and biased toward shorter snap distances.
- Single-step repair ranking that can miss beneficial combinations.

The average road distance includes only reachable localities. It can decrease after a closure if distant localities become disconnected. Coverage should therefore be interpreted alongside distance.

## Roadmap

- [ ] Complete and inspect a real Bengaluru dataset build.
- [ ] Add a pinned Leaflet map with OSM tiles.
- [ ] Implement budgeted multi-road repair search.
- [ ] Compare optimizer results against exhaustive search.
- [ ] Add publicly sourced waterlogging-hotspot scenarios.
- [ ] Label hotspot scenarios as illustrative rather than predictive.
- [ ] Complete desktop and mobile browser testing.
- [ ] Improve access-road and facility verification.
- [ ] Validate assumptions with relevant local stakeholders.

## Author

**Shubham Parmar**

RescueMesh is a Buildathon project exploring graph-based hospital accessibility under hypothetical flood-related road disruptions.

## Built for TuteDude Buildathon

Problem statement

CityFix: Building better cities

WHAT TO DO
Pick a real problem in your city (traffic, waste, safety, public services…) and build a working solution for it. Any technology is allowed. Go beyond just reporting issues: fresh ideas score higher.

WHAT TO SUBMIT
• A working product (live link or demo)
• Brand kit and landing page
• Launch film (60–90 sec) and an explainer video with a demo (2–3 min)
• Social posts on new Instagram and X accounts, with #TutedudeBuildathon and #BuildForMyCity
• Documentation and source code

SUBMISSION TIPS
• Start fresh on Day 1: all work must be done in the 7 days.
• The team leader submits once, on the team page.
• Check that every link opens for the judges.
• Submit as soon as your project is ready, any time before Sat, 28 Nov, 11:59 PM. Late entries don't count.


## Attribution and Disclaimer

Geographic data is sourced through OpenStreetMap services. Retain **© OpenStreetMap contributors** attribution and review the applicable ODbL terms when redistributing generated geographic data.

RescueMesh has no government affiliation and makes no claim of operational deployment, field validation or real-world emergency accuracy.

**Do not use this project for emergency navigation or operational rescue decisions.**
