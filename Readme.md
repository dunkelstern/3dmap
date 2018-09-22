OpenStreetMap to ThreeJS renderer for WebGL enabled Browsers

## How to run the example

This is the quick and dirty version to run the example, if you want to do more than that you'll have to read and understand the code.

What you will need:

- Python 3.7
- Node 10.0 + Yarn
- Postgresql 9.6 or higher
- Imposm3

1. Get Python 3.7 via `pyenv`
2. Create a virtualenv and install the dependencies with `pipenv`
3. Load node dependencies with `yarn`
4. Import OSM data with `imposm3`
5. Build the Bundle
6. Run the server

### Getting python

1. Install `pyenv`
```bash
$ git clone https://github.com/pyenv/pyenv.git ~/.pyenv
$ echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bash_profile
$ echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bash_profile
$ echo -e 'if command -v pyenv 1>/dev/null 2>&1; then\n  eval "$(pyenv init -)"\nfi' >> ~/.bash_profile
```
2. Restart your shell: `exec bash`
3. Install Python 3.7: `pyenv install 3.7.0`
4. Make it the active python: `pyenv local 3.7.0`
5. Install `pipenv`: `pip install pipenv`

### Installing python dependencies

1. Switch to the git checkout
2. Run `pipenv sync`
3. Run `pipenv shell` to get a shell into the virtualenv

### Node dependencies

1. Switch to the git checkout
2. Run `yarn --pure-lockfile`

### Import OSM data

1. Get a version of [imposm3](https://github.com/omniscale/imposm3)
2. Create a new DB on your Postgres installation: 
```bash
$ sudo -u postgres psql
>>> CREATE DATABASE osm;
>>> CREATE ROLE osm WITH LOGIN PASSWORD 'password';
>>> ALTER DATABASE osm OWNER TO osm;
>>> \c osm
>>> CREATE EXTENSION postgis;
>>> \q
```
3. Get a OpenStreetMap data extract (for example from [Geofabrik](http://download.geofabrik.de/))
4. Import into the DB:
```bash
$ imposm import -connection postgis://osm:password@localhost/osm -mapping import/imposm_mapping.yml -read /path/to/osm.pbf -write -deployproduction -optimize
```

**ATTENTION:** Importing the data will take a while and will take much disk space, better start with a small region!

### Build the bundle

1. Install `browserify`: `npm install -g browserify`
2. Build the bundle: `npm run build`

If you want to change the area that is rendered you'll have to edit `js/main.js` (scroll to the bottom) and change the following line:
```js
const osm = new osmRenderer(10.878281, 48.378979, 10.898172, 48.371667); // order is lat, lon -> lat, lon
```

### Run the server

1. Switch to the git checkout
2. Activate the venv: `pipenv shell`
3. Go to the `server/` dir
4. Edit the `config.json` to point to the correct DB
5. Run `python -O server.py`
6. Open a Browser and go to http://localhost:8080/
