SYNTHETIC TEST NETWORK — NOT BENGALURU DATA

1. Extract this ZIP.
2. Open the included RescueMesh.html. The test network loads automatically.
3. Close roads R2, R9 and R16: three localities become disconnected.
4. Reopen any one of those roads: access is restored.
5. Try hospital toggles, undo/reset and scenario export/import.

The older deployed app requires OSM source links and cannot honestly accept this synthetic dataset. This kit updates validation and disclosures rather than inventing OSM source links. To enable it on your deployed site, replace app.js, engine.js and data.json in your repository with these files, then rebuild/redeploy. The existing build.cjs and index.template.html work unchanged. All eight fictional hospitals share two junctions; disabling one facility does not disable its neighbours. All lengths, weights and coordinates are invented for testing. Single-road greedy limitations remain.
