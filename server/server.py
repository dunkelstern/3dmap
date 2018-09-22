import os
import json
import psycopg2
from psycopg2.extras import DictConnection

from shapely.geometry import MultiPolygon, Polygon, LineString, box
from shapely.geometry.collection import GeometryCollection
from shapely.wkb import loads, dumps
from shapely.ops import cascaded_union, polygonize_full
from shapely.affinity import translate

from pyproj import Proj

from flask import Flask, abort, make_response
app = Flask(__name__)

# load configuration
with open('config.json', 'r') as fp:
    config = json.load(fp)

# create DB connection
db = DictConnection(config['db'])

# serve index.html on main route, yeah I know this is ugly
@app.route("/")
def index():
    with open('static/html/index.html', 'r') as fp:
        return fp.read()

# serve street geometry (WKB)
@app.route("/streets/<float:x1>/<float:y1>/<float:x2>/<float:y2>")
def render_streets(x1, y1, x2, y2):
    cursor = db.cursor()

    # types of roads to load and their width in meters
    typ_buf = [
        # ( ('pedestrian', 'footway', 'path'), 3),
        ( ('residential', 'living_street', 'unclassified', 'road'), 8.5 ),
        ( ('tertiary', 'tertiary_link'), 9.5 ),
        ( ('secondary', 'secondary_link', 'trunk', 'trunk_link'), 15.5 ),
        ( ('primary', 'primary_link'), 20 ),
        ( ('motorway', 'motorway_link'), 30 ),
    ]

    # we need to project some values into the DB projection
    p = Proj(init='EPSG:3857')

    px1, py1 = p(x1, y1)
    px2, py2 = p(x2, y2)
    bounding = box(px1, py1, px2, py2)
    px, py = p(x1, y2)

    # fetch street geometry
    result_polys = []
    for types, width in typ_buf:
        cursor.execute(
            """
                SELECT * 
                FROM osm_roads
                WHERE 
                    geometry && ST_Transform(ST_MakeEnvelope(%s, %s, %s, %s, 4326), 3857)
                    AND ({tp})
            """.format(
                tp=" OR ".join([f'"type" = \'{n}\'' for n in types])
            ),
            (x1, y1, x2, y2)
        )

        polys = []
        for item in cursor:
            geo = loads(item['geometry'], hex=True).buffer(width / 2.0, resolution=2, join_style=2)
            polys.append(geo)

        # fuse all street polygons of this layer to avoid flicker and intersect with bounding box
        poly = cascaded_union(polys).intersection(bounding)

        # now translate everything so it starts at 0,0 (to be able to tile-load data later)
        poly = translate(poly, -px, -py, 0)

        result_polys.append(poly)

    # nothing found -> 404
    if len(result_polys) == 0:
        abort(404)

    # combine everything into a collection and dump WKB to the response
    collection = GeometryCollection(result_polys)
    response = make_response(dumps(collection), 200)
    response.headers['Content-Type'] = 'application/octet-stream'
    return response


# Serve Building polygons
@app.route("/buildings/<float:x1>/<float:y1>/<float:x2>/<float:y2>")
def render_buildings(x1, y1, x2, y2):
    cursor = db.cursor()

    # fetch ground polygons, they will be extruded on the client
    cursor.execute(
        """
            SELECT geometry 
            FROM osm_buildings
            WHERE 
                geometry && ST_Transform(ST_MakeEnvelope(%s, %s, %s, %s, 4326), 3857)
        """,
        (x1, y1, x2, y2)
    )

    p = Proj(init='EPSG:3857')
    px, py = p(x1, y2)

    px1, py1 = p(x1, y1)
    px2, py2 = p(x2, y2)
    bounding = box(px1, py1, px2, py2)

    # load the geometry, intersect with bounding box and translate to origin
    # to be able to tile load in the client later on
    polys = []
    for item in cursor:
        geo = loads(item['geometry'], hex=True).intersection(bounding)
        geo = translate(geo, -px, -py, 0)
        polys.append(geo)
    
    # join everything into a collection and dump WKB to the response
    collection = GeometryCollection(polys)
    response = make_response(dumps(collection), 200)
    response.headers['Content-Type'] = 'application/octet-stream'
    return response


# when running this script directly execute gunicorn to serve
if __name__ == "__main__":
    os.execlp(
        "gunicorn",
        "gunicorn",
        "server:app",
        "--timeout",
        "120",
        "--bind",
        "127.0.0.1:8080"
    )