"""Offline builder helper tests; not an OSM download/integration test."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder', ROOT/'build_data.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class BuilderTests(unittest.TestCase):
    def test_haversine(self):
        self.assertEqual(b.haversine(0,0,0,0),0)
        self.assertAlmostEqual(b.haversine(0,0,0,1),111195.08,places=1)
    def test_nearest(self):
        nodes=[{'id':'a','lat':0,'lon':0},{'id':'b','lat':0,'lon':1}]
        self.assertEqual(b.nearest({'lat':0,'lon':0},nodes),('a',0))
    def test_bbox(self):
        box=b.expand_bbox((0,0,.01,.01),1)
        self.assertLess(box[0],0);self.assertGreater(box[2],.01)
    def test_dedupe(self):
        p={'name':'Test','lat':0,'lon':0,'osm_type':'node','osm_id':'1'}
        self.assertEqual(len(b.dedupe([p,{**p,'osm_id':'2'}])),1)
    def test_spatial_sample(self):
        ps=[{'name':f'Test {i}','lat':0,'lon':i/100,'osm_id':str(i)} for i in range(12)]
        self.assertEqual(len(b.spatial_sample(ps,10)),10)
        self.assertEqual(b.spatial_sample(ps,10),b.spatial_sample(ps,10))
    def test_placeholder_rejected(self):
        with self.assertRaises(ValueError):b.validate_data(json.loads((ROOT/'data.json').read_text()))
    def test_embed_safe_and_no_other_html_changed(self):
        # Test-only equatorial coordinates, not actual Bengaluru data.
        nodes=[{'id':str(i),'lat':0,'lon':i/100} for i in range(8)]
        d={'schema':b.SCHEMA,'status':'ready','dataset_id':'TEST-ONLY','nodes':nodes,
           'edges':[{'id':0,'a':'0','b':'1','weight':100,'geometry':[[0,0],[0,.01]]}],
           'hospitals':[{'id':f'H{i}','name':'</script><script>BAD</script>','node':'0','lat':0,'lon':0,'snap_m':0,'source_url':f'https://www.openstreetmap.org/node/{i+1}'} for i in range(8)],
           'demand':[{'id':f'D{i}','name':'Test','node':str(i),'lat':0,'lon':i/100,'snap_m':0,'population':100,'source_url':f'https://www.openstreetmap.org/node/{i+21}'} for i in range(8)]}
        template='<h1>Keep</h1><script id="rescuemesh-data" type="application/json">{}</script><p>Keep too</p>'
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'test.html';path.write_text(template)
            b.embed(d,path);out=path.read_text()
            self.assertEqual(out.count('</script>'),1)
            self.assertTrue(out.startswith('<h1>Keep</h1>'));self.assertTrue(out.endswith('<p>Keep too</p>'))
            body=b.MARKER.search(out).group(0).split('>',1)[1].rsplit('</script>',1)[0]
            self.assertEqual(json.loads(body),d)
            path.write_text('<p>No placeholder</p>')
            with self.assertRaises(ValueError):b.embed(d,path)
            self.assertEqual(path.read_text(),'<p>No placeholder</p>')

if __name__=='__main__':unittest.main()
