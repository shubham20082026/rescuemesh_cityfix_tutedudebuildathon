#!/usr/bin/env python3
"""Build a real OSM dataset and embed it into RescueMesh.html.
Requires Python 3.10+ and: python -m pip install -r requirements.txt
No fabricated coordinates and no synthetic fallback on download failure.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys

SCHEMA = 'rescuemesh-data/v2'
CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']
ANCHOR_GROUPS = [
    ('Bellandur', ['Bellandur, Bengaluru, Karnataka, India',
                   'Bellandur, Bangalore, Karnataka, India']),
    ('Marathahalli', ['Marathahalli, Bengaluru, Karnataka, India',
                     'Marathahalli, Bangalore, Karnataka, India']),
]
CORRIDOR_QUERIES = ['Kaikondrahalli, Bengaluru, Karnataka, India',
                    'Kaikondrahalli, Bangalore, Karnataka, India',
                    'Sarjapur Road, Bellandur, Bengaluru, Karnataka, India']
MARKER = re.compile(r'(<script id="rescuemesh-data" type="application/json">).*?(</script>)', re.S)


def haversine(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    dlat, dlon = b-a, math.radians(lon2-lon1)
    value = math.sin(dlat/2)**2 + math.cos(a)*math.cos(b)*math.sin(dlon/2)**2
    return 6371009 * 2 * math.asin(min(1, math.sqrt(max(0, value))))


def expand_bbox(bbox, km):
    west, south, east, north = bbox
    dy = km / 111.195
    dx = dy / math.cos(math.radians((south+north)/2))
    return west-dx, south-dy, east+dx, north+dy


def nearest(point, nodes):
    candidates = ((haversine(point['lat'], point['lon'], n['lat'], n['lon']), n['id']) for n in nodes)
    distance, node_id = min(candidates)
    return node_id, round(distance, 2)


def clean_name(value):
    return value.strip() if isinstance(value, str) else ''


def osm_points(gdf):
    """Keep points; derive approximate centres of polygons in a metric CRS."""
    import geopandas as gpd
    usable = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    if usable.empty:
        return []
    projected = usable.to_crs(usable.estimate_utm_crs())
    centres = gpd.GeoSeries(projected.geometry.centroid, crs=projected.crs).to_crs(4326)
    points = []
    for key, row in usable.iterrows():
        name = clean_name(row.get('name:en')) or clean_name(row.get('name'))
        if not name:
            continue
        p = centres.loc[key]
        element_type, osmid = str(key[0]), str(key[1])
        points.append({'name': name, 'lat': round(float(p.y), 7), 'lon': round(float(p.x), 7),
                       'osm_type': element_type, 'osm_id': osmid,
                       'source_url': f'https://www.openstreetmap.org/{element_type}/{osmid}',
                       'position_method': 'OSM point' if row.geometry.geom_type == 'Point' else 'approximate projected geometry centroid'})
    return points


def dedupe(points):
    result = []
    for p in sorted(points, key=lambda p: (p['name'].casefold(), p['osm_type'], p['osm_id'])):
        if any(p['name'].casefold() == old['name'].casefold() and
               haversine(p['lat'], p['lon'], old['lat'], old['lon']) < 200 for old in result):
            continue
        result.append(p)
    return result


def spatial_sample(points, count):
    """Deterministic broad spatial coverage; this is not a population sample."""
    remaining = sorted(points, key=lambda p: (p['name'].casefold(), p['osm_id']))
    chosen = []
    for name in ['bellandur', 'marathahalli']:
        p = next((p for p in remaining if name in p['name'].casefold()), None)
        if p:
            chosen.append(p)
            remaining.remove(p)
    if not chosen and remaining:
        chosen.append(remaining.pop(0))
    while remaining and len(chosen) < count:
        p = max(remaining, key=lambda p: min(haversine(p['lat'],p['lon'],q['lat'],q['lon']) for q in chosen))
        chosen.append(p)
        remaining.remove(p)
    return sorted(chosen, key=lambda p: (p['name'].casefold(), p['osm_id']))


def validate_data(data):
    if data.get('schema') != SCHEMA or data.get('status') != 'ready':
        raise ValueError('Expected a ready rescuemesh-data/v2 dataset.')
    nodes, edges = data['nodes'], data['edges']
    if not 2 <= len(nodes) <= 400 or not 1 <= len(edges) <= 5000:
        raise ValueError('Dataset must have 2–400 simplified nodes and at least one edge.')
    ids = {n['id'] for n in nodes}
    if len(ids) != len(nodes) or any(not isinstance(n['id'], str) for n in nodes):
        raise ValueError('Duplicate node IDs.')
    for n in nodes:
        if not (-90 <= n['lat'] <= 90 and -180 <= n['lon'] <= 180):
            raise ValueError('Invalid coordinates.')
    if [e['id'] for e in edges] != list(range(len(edges))):
        raise ValueError('Road IDs must be contiguous from zero.')
    for e in edges:
        if e['a'] not in ids or e['b'] not in ids or not math.isfinite(e['weight']) or e['weight'] <= 0:
            raise ValueError('Invalid road endpoint or length.')
        if len(e['geometry']) < 2 or any(len(p) != 2 or not (-90 <= p[0] <= 90 and -180 <= p[1] <= 180) for p in e['geometry']):
            raise ValueError('Road geometry is missing or invalid.')
    if not 8 <= len(data['hospitals']) <= 15 or not 8 <= len(data['demand']) <= 12:
        raise ValueError('Need 8–15 named hospitals and 8–12 named localities; no padding with invented features.')
    for group in ('hospitals', 'demand'):
        if len({p['id'] for p in data[group]}) != len(data[group]):
            raise ValueError(f'Duplicate {group} IDs.')
        for p in data[group]:
            if p['node'] not in ids or not p['name'] or not re.fullmatch(r'https://www\.openstreetmap\.org/(node|way|relation)/[0-9]+', p['source_url']):
                raise ValueError('Invalid facility/locality reference.')
            if not (-90 <= p['lat'] <= 90 and -180 <= p['lon'] <= 180) or p['snap_m'] < 0:
                raise ValueError('Invalid snapped feature.')
    if any(not math.isfinite(d['population']) or d['population'] <= 0 for d in data['demand']):
        raise ValueError('Invalid illustrative demand weight.')
    if not isinstance(data.get('dataset_id'),str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',data['dataset_id']):
        raise ValueError('Dataset identity is missing.')


def embed(data, html_path):
    validate_data(data)
    source = html_path.read_text(encoding='utf-8')
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).replace('<', '\\u003c')
    updated, count = MARKER.subn(lambda m: m[1]+payload+m[2], source)
    if count != 1:
        raise ValueError('HTML must contain exactly one rescuemesh-data JSON placeholder. Use the supplied Stage 1 HTML.')
    # Replace only after validation and successful template matching.
    temporary = html_path.with_suffix('.html.tmp')
    temporary.write_text(updated, encoding='utf-8')
    temporary.replace(html_path)


def resolve_anchors(geocode):
    """Retry unmatched names; never suppress connection or service errors."""
    anchors, warnings = [], []

    def lookup(query):
        try:
            lat, lon = geocode(query)
        except Exception as exc:
            if 'could not geocode' not in str(exc).lower():
                raise
            warnings.append(f'No Nominatim match: {query}')
            return None
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f'Invalid geocoder coordinates for {query}')
        return {'query': query, 'lat': lat, 'lon': lon, 'source': 'OSM Nominatim search'}

    for label, queries in ANCHOR_GROUPS:
        for query in queries:
            point = lookup(query)
            if point is not None:
                anchors.append(point)
                break
        else:
            raise ValueError(f'Nominatim could not resolve {label}. Supply independently verified --bbox WEST SOUTH EAST NORTH to skip geocoding.')

    for query in CORRIDOR_QUERIES:
        point = lookup(query)
        if point is None:
            continue
        distances = [haversine(point['lat'], point['lon'], p['lat'], p['lon']) for p in anchors]
        if max(distances) > 12000 or min(distances) < 50:
            warnings.append(f'Ignored ambiguous or duplicate corridor anchor: {query}')
            continue
        anchors.append(point)
        break
    else:
        warnings.append('Sarjapur corridor anchor unresolved. Bounds use Bellandur and Marathahalli only; full corridor coverage is not assured. Inspect the bounds or supply a verified --bbox.')
    for warning in warnings:
        print('WARNING:', warning)
    return anchors, warnings


def fetch(args):
    try:
        import osmnx as ox
        import networkx as nx
    except ImportError as exc:
        raise RuntimeError('Install dependencies: python -m pip install -r requirements.txt') from exc
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(Path(__file__).parent / 'osm_cache')
    ox.settings.requests_timeout = 180
    ox.settings.log_console = True
    if args.user_agent:
        ox.settings.http_user_agent = args.user_agent
    if args.bbox:
        bbox = tuple(args.bbox)
        anchors = []
        geocoding_warnings = []
    else:
        anchors, geocoding_warnings = resolve_anchors(ox.geocoder.geocode)
        bbox = expand_bbox((min(p['lon'] for p in anchors), min(p['lat'] for p in anchors),
                            max(p['lon'] for p in anchors), max(p['lat'] for p in anchors)), args.margin_km)
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError('Invalid --bbox; order is WEST SOUTH EAST NORTH.')
    if haversine(south, west, north, east) > 14000:
        raise ValueError('Study-area diagonal exceeds 14 km. Check geocoding or pass a verified smaller --bbox. Whole-city queries are intentionally refused.')
    print('Resolved study bounds (W,S,E,N):', bbox)
    custom_filter = '["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]["area"!="yes"]["access"!~"^(private|no)$"]'
    graph = ox.graph.graph_from_bbox(bbox, network_type='drive', custom_filter=custom_filter,
                                     simplify=True, retain_all=True, truncate_by_edge=False)
    # OSMnx sums pre-simplification segment lengths. Never recompute endpoint
    # straight-line distances after simplification: that would lose road curvature.
    graph = ox.convert.to_undirected(graph)
    if not 2 <= len(graph) <= 400:
        raise ValueError(f'Simplified graph has {len(graph)} nodes (target 2–400). Refine --bbox or --margin-km; no nodes were silently deleted.')
    nodes = [{'id': str(node), 'lat': round(float(d['y']),7), 'lon': round(float(d['x']),7),
              'name': f'OSM junction {node}', 'population': 0}
             for node, d in sorted(graph.nodes(data=True), key=lambda pair: str(pair[0]))]
    edges = []
    for u, v, key, d in sorted(graph.edges(keys=True, data=True), key=lambda e:(str(e[0]),str(e[1]),str(e[2]))):
        if u == v:
            continue  # positive self-loops cannot improve a shortest path
        coords = list(d['geometry'].coords) if 'geometry' in d else [(graph.nodes[u]['x'],graph.nodes[u]['y']),(graph.nodes[v]['x'],graph.nodes[v]['y'])]
        road_names = d.get('name', 'Unnamed OSM road')
        if isinstance(road_names, list): road_names = ' / '.join(sorted(map(str,road_names)))
        osmids = d.get('osmid', [])
        if not isinstance(osmids,list): osmids=[osmids]
        edges.append({'id':len(edges),'a':str(u),'b':str(v),'weight':round(float(d['length']),3),
                      'name':str(road_names),'highway':d.get('highway'), 'osm_way_ids':list(map(str,osmids)),
                      'geometry':[[round(float(y),7),round(float(x),7)] for x,y in coords]})
    nearby = expand_bbox(bbox, args.hospital_buffer_km)
    hospitals = dedupe(osm_points(ox.features.features_from_bbox(nearby, tags={'amenity':'hospital','healthcare':'hospital'})))
    for p in hospitals: p['node'], p['snap_m'] = nearest(p,nodes)
    hospitals = sorted((p for p in hospitals if p['snap_m'] <= args.max_snap_m), key=lambda p:(p['snap_m'],p['name']))[:args.hospitals]
    if len(hospitals)<8:
        raise ValueError(f'Only {len(hospitals)} named hospital features pass the snap threshold. Inspect OSM coverage, then adjust --hospital-buffer-km or --max-snap-m deliberately. No hospitals invented.')
    for i,p in enumerate(hospitals): p['id']=f'H{i+1}'
    localities = dedupe(osm_points(ox.features.features_from_bbox(bbox, tags={'place':['suburb','neighbourhood','quarter','locality','village']})))
    localities = [p for p in localities if west<=p['lon']<=east and south<=p['lat']<=north]
    for p in localities: p['node'], p['snap_m'] = nearest(p,nodes)
    localities = spatial_sample([p for p in localities if p['snap_m']<=args.max_snap_m],args.localities)
    if len(localities)<8:
        raise ValueError(f'Only {len(localities)} named OSM localities pass the filter. Adjust the verified study bounds; no names or coordinates invented.')
    weights = [1200,1800,1500,2200,900,1600,1100,2000,1400,1300,1700,1000]
    for i,p in enumerate(localities): p.update(id=f'D{i+1}',population=weights[i],population_source='Illustrative weight only; not census population')
    data = {'schema':SCHEMA, 'status':'ready', 'nodes':nodes,'edges':edges,'hospitals':hospitals,'demand':localities,
            'meta':{'study_area':'Bellandur / Sarjapur Road / Marathahalli, Bengaluru','bbox':list(bbox),
                    'retrieved_at':datetime.now(timezone.utc).isoformat(), 'anchors':anchors,
                    'geocoding_warnings':geocoding_warnings,
                    'road_classes':CLASSES,'length_unit':'metres','length_method':'OSMnx summed great-circle segment lengths before topology simplification',
                    'osmnx_version':ox.__version__,'components':nx.number_connected_components(graph),
                    'road_direction':'undirected abstraction; OSM one-way restrictions ignored',
                    'snap_limit_m':args.max_snap_m, 'access_legs':'Not routed or included in distances',
                    'population':'Illustrative weights only, assigned deterministically; not population estimates',
                    'hospitals':'OSM hospital tags; existence, emergency services and operating status unverified',
                    'attribution':'© OpenStreetMap contributors; ODbL 1.0',
                    'sources':['https://www.openstreetmap.org/copyright','https://overpass-api.de/','https://nominatim.org/','https://osmnx.readthedocs.io/en/stable/user-reference.html'],
                    'limitations':['Only five road classes; residential/service roads and *_link ramps excluded',
                                   'Clipped study area may remove external routes','Nearest-node snaps may cross barriers',
                                   'Distinct hospitals and localities can share one snapped road node',
                                   'No live flood, traffic, elevation, capacity or emergency accuracy model']}}
    content = json.dumps({k:data[k] for k in ['nodes','edges','hospitals','demand']},sort_keys=True,separators=(',',':'),ensure_ascii=False)
    data['dataset_id']='osm-'+hashlib.sha256(content.encode()).hexdigest()[:20]
    validate_data(data)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bbox',nargs=4,type=float,metavar=('WEST','SOUTH','EAST','NORTH'))
    parser.add_argument('--margin-km',type=float,default=.6)
    parser.add_argument('--hospital-buffer-km',type=float,default=1)
    parser.add_argument('--max-snap-m',type=float,default=1500)
    parser.add_argument('--hospitals',type=int,choices=range(8,16),default=12)
    parser.add_argument('--localities',type=int,choices=range(8,13),default=10)
    parser.add_argument('--user-agent',help='Optional descriptive HTTP user agent, e.g. RescueMesh/2.0 contact:YOUR_EMAIL')
    parser.add_argument('--output',type=Path,default=Path(__file__).with_name('data.json'))
    parser.add_argument('--html',type=Path,default=Path(__file__).with_name('RescueMesh.html'))
    parser.add_argument('--embed-only',type=Path,help='Validate and embed an existing data.json; no OSMnx or network needed')
    args=parser.parse_args()
    if any(not math.isfinite(v) or v<0 for v in [args.margin_km,args.hospital_buffer_km,args.max_snap_m]):
        parser.error('Buffers and snap threshold must be finite, nonnegative numbers.')
    try:
        data=json.loads(args.embed_only.read_text(encoding='utf-8')) if args.embed_only else fetch(args)
        validate_data(data)
        # Validate template before writing either deliverable.
        if len(MARKER.findall(args.html.read_text(encoding='utf-8'))) != 1:
            raise ValueError('Missing or duplicate HTML data placeholder.')
        if not args.embed_only:
            temp=args.output.with_suffix('.json.tmp')
            temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
            temp.replace(args.output)
        embed(data,args.html)
        print(f"SUCCESS: {len(data['nodes'])} nodes, {len(data['edges'])} roads, {len(data['hospitals'])} hospitals, {len(data['demand'])} localities.")
        print('Dataset:',data['dataset_id'],'\nStandalone HTML:',args.html.resolve())
        print('Inspect names, snap distances and the study boundary before presenting. This is not validated emergency routing.')
        return 0
    except Exception as exc:
        print(f'BUILD FAILED: {exc}\nNo synthetic replacement data was generated. Fix the reported dependency/network/data issue and rerun.',file=sys.stderr)
        return 1

if __name__=='__main__':
    raise SystemExit(main())
