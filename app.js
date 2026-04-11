const DATA_FILES = {
  countries: './neighbor_countries_ru.geojson',
  states: './sudan_adm1_ru.geojson'
};

const INTRA_STATE_COUNTS = {
  Gezira: 1290,
  'Blue Nile': 207732,
  'Central Darfur': 683187,
  'East Darfur': 161888,
  Gedaref: 1915,
  Kassala: 6540,
  Khartoum: 212984,
  'North Darfur': 1634376,
  'North Kordofan': 78237,
  Northern: 4876,
  'Red Sea': 24595,
  'River Nile': 9834,
  Sennar: 4346,
  'South Darfur': 1662885,
  'South Kordofan': 293535,
  'West Darfur': 257247,
  'West Kordofan': 304126,
  'White Nile': 18627,
  'Abyei PCA': null
};

const state = {
  hoveredState: null,
  lockedState: null,
  stateGeoJSON: null,
  maxCount: 0
};

const statusEl = document.getElementById('status');
const legendMax = document.getElementById('legendMax');
const hoverTooltip = document.getElementById('hoverTooltip');
const infoPanel = document.getElementById('infoPanel');
const infoToggle = document.getElementById('infoToggle');

let map;

function setStatus(message, hide = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-hidden', hide);
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function normalizeValue(value, maxValue) {
  if (!value || value <= 0 || !maxValue) return 0;
  return value / maxValue;
}

function enrichStates(statesGeoJSON) {
  const maxCount = Math.max(
    ...Object.values(INTRA_STATE_COUNTS).filter((value) => typeof value === 'number')
  );

  const enriched = {
    ...statesGeoJSON,
    features: statesGeoJSON.features.map((feature, index) => {
      const intraCount = INTRA_STATE_COUNTS[feature.properties.state_en] ?? null;
      return {
        ...feature,
        id: index,
        properties: {
          ...feature.properties,
          intra_count: intraCount,
          intra_norm: typeof intraCount === 'number' ? normalizeValue(intraCount, maxCount) : -1,
          has_data: typeof intraCount === 'number'
        }
      };
    })
  };

  return { enriched, maxCount };
}

function buildGeoBounds(geojson) {
  const bounds = new maplibregl.LngLatBounds();
  geojson.features.forEach((feature) => {
    const geom = feature.geometry;
    const parts = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    parts.forEach((poly) => {
      poly.forEach((ring) => {
        ring.forEach(([lng, lat]) => bounds.extend([lng, lat]));
      });
    });
  });
  return bounds;
}

function createMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#0a0a0b' }
        }
      ]
    },
    attributionControl: false,
    dragRotate: false,
    touchZoomRotate: true
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
}

function installSources(countriesGeoJSON, statesGeoJSON) {
  map.addSource('countries', {
    type: 'geojson',
    data: countriesGeoJSON
  });

  map.addSource('states', {
    type: 'geojson',
    data: statesGeoJSON
  });
}

function installLayers() {
  map.addLayer({
    id: 'countries-fill',
    type: 'fill',
    source: 'countries',
    paint: {
      'fill-color': [
        'case',
        ['==', ['get', 'country_en'], 'Sudan'], '#0d1013',
        '#111317'
      ],
      'fill-opacity': 1
    }
  });

  map.addLayer({
    id: 'countries-outline',
    type: 'line',
    source: 'countries',
    paint: {
      'line-color': 'rgba(255,255,255,0.14)',
      'line-width': 1.1
    }
  });

  map.addLayer({
    id: 'countries-label',
    type: 'symbol',
    source: 'countries',
    layout: {
      'text-field': ['get', 'country_ru'],
      'text-font': ['Open Sans Semibold'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3, 10,
        5, 12,
        7, 14
      ],
      'text-allow-overlap': false,
      'text-ignore-placement': false
    },
    paint: {
      'text-color': 'rgba(168,176,187,0.58)',
      'text-halo-color': 'rgba(10,10,11,0.86)',
      'text-halo-width': 1.2
    }
  });

  map.addLayer({
    id: 'states-fill',
    type: 'fill',
    source: 'states',
    paint: {
      'fill-color': [
        'case',
        ['<', ['get', 'intra_norm'], 0], '#16181c',
        [
          'interpolate',
          ['linear'],
          ['get', 'intra_norm'],
          0, '#c9dce5',
          0.08, '#b6d5e2',
          0.18, '#9acde3',
          0.32, '#7bc8e8',
          0.50, '#4FC3F7',
          0.72, '#35a9dc',
          1, '#1f6f96'
        ]
      ],
      'fill-opacity': 0.95
    }
  });

  map.addLayer({
    id: 'states-active',
    type: 'fill',
    source: 'states',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.12)',
        ['boolean', ['feature-state', 'hovered'], false], 'rgba(255,255,255,0.08)',
        'rgba(0,0,0,0)'
      ],
      'fill-opacity': 1
    }
  });

  map.addLayer({
    id: 'states-outline',
    type: 'line',
    source: 'states',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.72)',
        ['boolean', ['feature-state', 'hovered'], false], 'rgba(255,255,255,0.44)',
        'rgba(255,255,255,0.18)'
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 2.1,
        ['boolean', ['feature-state', 'hovered'], false], 1.7,
        1.15
      ]
    }
  });

  map.addLayer({
    id: 'states-label',
    type: 'symbol',
    source: 'states',
    layout: {
      'text-field': ['get', 'state_ru'],
      'text-font': ['Open Sans Semibold'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4, 10,
        6, 12,
        8, 14
      ],
      'text-allow-overlap': false,
      'text-ignore-placement': false
    },
    paint: {
      'text-color': 'rgba(235,242,249,0.94)',
      'text-halo-color': 'rgba(10,10,11,0.94)',
      'text-halo-width': 1.6
    }
  });
}

function updateFeatureStates() {
  if (!state.stateGeoJSON) return;

  state.stateGeoJSON.features.forEach((feature) => {
    const stateName = feature.properties.state_en;
    map.setFeatureState(
      { source: 'states', id: feature.id },
      {
        hovered: state.hoveredState === stateName && state.lockedState !== stateName,
        selected: state.lockedState === stateName
      }
    );
  });
}

function getStateFeatureAtPoint(point) {
  const features = map.queryRenderedFeatures(point, {
    layers: ['states-fill']
  });
  return features[0] || null;
}

function showTooltip(feature, point) {
  if (!feature) {
    hoverTooltip.classList.add('is-hidden');
    hoverTooltip.textContent = '';
    return;
  }

  const count = feature.properties.intra_count;
  hoverTooltip.textContent = typeof count === 'number' ? formatNumber(count) : 'нет данных';
  hoverTooltip.style.left = `${point.x}px`;
  hoverTooltip.style.top = `${point.y}px`;
  hoverTooltip.classList.remove('is-hidden');
}

function installInteractions() {
  map.on('mousemove', (event) => {
    if (state.lockedState) return;

    const feature = getStateFeatureAtPoint(event.point);

    if (!feature) {
      state.hoveredState = null;
      updateFeatureStates();
      showTooltip(null, event.point);
      map.getCanvas().style.cursor = '';
      return;
    }

    state.hoveredState = feature.properties.state_en;
    updateFeatureStates();
    showTooltip(feature, event.point);
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'states-fill', () => {
    if (state.lockedState) return;
    state.hoveredState = null;
    updateFeatureStates();
    showTooltip(null);
    map.getCanvas().style.cursor = '';
  });

  map.on('click', (event) => {
    const feature = getStateFeatureAtPoint(event.point);

    if (!feature) {
      state.lockedState = null;
      state.hoveredState = null;
      updateFeatureStates();
      showTooltip(null);
      map.getCanvas().style.cursor = '';
      return;
    }

    const clickedState = feature.properties.state_en;
    state.lockedState = state.lockedState === clickedState ? null : clickedState;
    state.hoveredState = state.lockedState ? clickedState : null;
    updateFeatureStates();

    if (state.lockedState) {
      showTooltip(feature, event.point);
      map.getCanvas().style.cursor = 'pointer';
    } else {
      showTooltip(null);
      map.getCanvas().style.cursor = '';
    }
  });
}

function installInfoPanelControls() {
  if (!infoToggle) return;
  infoToggle.addEventListener('click', () => {
    const collapsed = infoPanel.classList.toggle('is-collapsed');
    infoToggle.textContent = collapsed ? 'Показать' : 'Скрыть';
    infoToggle.setAttribute('aria-expanded', String(!collapsed));
  });
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
}

async function init() {
  setStatus('Загрузка данных…');

  const [countriesGeoJSON, rawStatesGeoJSON] = await Promise.all([
    fetchJSON(DATA_FILES.countries),
    fetchJSON(DATA_FILES.states)
  ]);

  const { enriched, maxCount } = enrichStates(rawStatesGeoJSON);
  state.stateGeoJSON = enriched;
  state.maxCount = maxCount;
  legendMax.textContent = formatNumber(maxCount);

  createMap();

  map.on('load', () => {
    installSources(countriesGeoJSON, enriched);
    installLayers();
    installInteractions();
    installInfoPanelControls();

    const bounds = buildGeoBounds(countriesGeoJSON);
    map.fitBounds(bounds, {
      padding: { top: 64, right: 84, bottom: 64, left: 84 },
      duration: 0,
      maxZoom: 5.85
    });

    updateFeatureStates();
    setStatus('Готово', true);
  });
}

window.addEventListener('resize', () => {
  if (map) map.resize();
});

init().catch((error) => {
  console.error(error);
  setStatus('Не удалось загрузить данные');
});
