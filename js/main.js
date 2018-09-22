const Buffer = require('buffer').Buffer;
const wkx = require('wkx');
const THREE = require('three');
const OrbitControls = require('three-orbitcontrols');

// Initialize interactive renderer with coordinates (lon, lat)
const osmRenderer = function (x1, y1, x2, y2) {
    this.x1 = x1;
    this.x2 = x2;
    this.y1 = y1;
    this.y2 = y2;

    this.scene = this.createScene();

    // Renderer, antialiased
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Perspective camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2500);
    this.camera.position.set(0, 300, 100);
    
    // controls
    this.controls = new OrbitControls( this.camera, this.renderer.domElement );
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.addEventListener('change', () => this.render());

    document.body.appendChild(this.renderer.domElement);
    window.addEventListener('resize', this.onWindowResize, false);
}

// Fix camera on window resize
// BUG: this does not work as `this` is the window
osmRenderer.prototype.onWindowResize = function () {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize( window.innerWidth, window.innerHeight );
}

// Render with vsync
osmRenderer.prototype.render = function () {
    requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
}

// Create ThreeJS shape from wkx polygon
osmRenderer.prototype.shapeFromPoly = function (polygon) {
    const shape = new THREE.Shape(); // new shape

    // the shape is the exterior ring
    for (point of polygon.exteriorRing) {
        if (point === polygon.exteriorRing[0]) {
            shape.moveTo(point.x, point.y);
        } else {
            shape.lineTo(point.x, point.y);
        }
    }

    // and has a number of holes (interior rings)
    for (ring of polygon.interiorRings) {
        const hole = new THREE.Path();
        for (point of ring) {
            if (point === ring[0]) {
                hole.moveTo(point.x, point.y);
            } else {
                hole.lineTo(point.x, point.y);
            }    
        }
        shape.holes.push(hole);
    }

    return shape;
}

// create an extruded mesh from a shape
osmRenderer.prototype.extrude = function (shape, settings, material) {
    const geometry = new THREE.ExtrudeBufferGeometry(shape, settings);
    const mesh = new THREE.Mesh(geometry, material);

    // as we create the mesh in X-Y direction we have to rotate it
    // to lay it in the X-Y plane to fly over it
    mesh.rotation.set(Math.PI / 2, Math.PI, 0);
    mesh.position.set(1600, 0, -800);

    return mesh;
}

// create a flat polygon from a shape without extruding it
osmRenderer.prototype.flat = function (shape, material) {
    const geometry = new THREE.ShapeBufferGeometry(shape);
    const mesh = new THREE.Mesh(geometry, material);

    // as we create the mesh in X-Y direction we have to rotate it
    // to lay it in the X-Y plane to fly over it
    mesh.rotation.set(Math.PI / 2, Math.PI, 0);
    mesh.position.set(1600, 0, -800);

    return mesh;
}

// Create a new scene
osmRenderer.prototype.createScene = function () {
    // Scene, grey background, fog
    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0xf0f0f0 );
    scene.fog = new THREE.FogExp2(0xf0f0f0, 0.001);

    // lights
    let light = new THREE.DirectionalLight( 0xffffff );
    light.position.set( 1, 1, 1 );
    scene.add( light );
    
    light = new THREE.DirectionalLight( 0x888822 );
    light.position.set( - 1, - 1, - 1 );
    scene.add( light );
            
    light = new THREE.AmbientLight( 0x222222 );
    scene.add( light );

    return scene;
}

// Main function. This makes the requests to load the WKB data from
// the server and generates geometry from it.
osmRenderer.prototype.run = function () {
    const buildingsMaterial = new THREE.MeshPhongMaterial( { color: 0xc0c080, flatShading: true } );
    const streetsMaterial = new THREE.MeshPhongMaterial( { color: 0xc0c0c0, flatShading: true } );
    const extrudeSettings = { depth: 15, steps: 1, bevelEnabled: false };

    // the two geometry requests
    const buildingsRequest = new Request(`/buildings/${this.x1}/${this.y1}/${this.x2}/${this.y2}`);
    const streetsRequest = new Request(`/streets/${this.x1}/${this.y1}/${this.x2}/${this.y2}`);

    // reset the scene
    this.scene = this.createScene();

    // buildings
    const buildings = fetch(buildingsRequest)
        .then(response => response.arrayBuffer())
        .then((blob) => wkx.Geometry.parse(new Buffer(blob)))
        .then((parsed) => {

            // add a building for each polygon in the GeometryCollection
            for (obj of parsed.geometries) {
                if (!(obj instanceof wkx.Polygon)) {
                    console.log('Skipping object, not a polygon', obj);
                    continue;
                }
        
                const shape = this.shapeFromPoly(obj);
                const mesh = this.extrude(shape, extrudeSettings, buildingsMaterial);

                this.scene.add(mesh);
            }
        })
        .catch((err) => console.error(err));

    // streets
    const streets = fetch(streetsRequest)
        .then(response => response.arrayBuffer())
        .then((blob) => wkx.Geometry.parse(new Buffer(blob)))
        .then((parsed) => {

            // add a street polygon for each polygon or multipolygon in the collection
            for (obj of parsed.geometries) {
                if (!(obj instanceof wkx.Polygon) && !(obj instanceof wkx.MultiPolygon)) {
                    console.log('Skipping object, not a polygon', obj);
                    continue;
                }
        
                // polygons just get added
                if (obj instanceof wkx.Polygon) {
                    const shape = this.shapeFromPoly(obj);
                    const mesh = this.flat(shape, streetsMaterial);

                    this.scene.add(mesh);    
                }

                // and multi-polygons get iterated over
                if (obj instanceof wkx.MultiPolygon) {
                    for (poly of obj.polygons) {
                        const shape = this.shapeFromPoly(poly);
                        const mesh = this.flat(shape, streetsMaterial);

                        this.scene.add(mesh);
                    }    
                }

            }
        })
        .catch((err) => console.error(err));

    // wait for all async loads to finish and render a frame
    Promise.all([buildings, streets])
        .then(() => this.render());
}

module.exports = osmRenderer;

// Example: This renders a part of Augsburg, Germany, make sure that the area
// is contained in the DB before trying (else you get a grey window)
const osm = new osmRenderer(10.878281, 48.378979, 10.898172, 48.371667);
osm.run();
