/**
 * app.js — Satellite Tracker
 * ---------------------------------------------------------------
 * Loads TLE catalogs (per category, see data.js / data/tle/*.json),
 * propagates every satellite's position in real time using SGP4/SDP4
 * (via satellite.js), and renders them as live markers on a Leaflet
 * map. Includes category filtering, name search, adjustable time
 * speed (1x/30x/300x/3000x) with pause, and a detail panel with an
 * optional ground-track (orbit path) overlay for the selected object.
 *
 * No build step required — open index.html through any static file
 * server (or GitHub Pages) and it just works.
 * ---------------------------------------------------------------
 */

(function () {
  "use strict";

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    satellites: [],           // flat list of every loaded satellite object
    categories: {},           // key -> { def, enabled, count, layerGroup }
    playing: true,
    speed: 1,
    simTime: new Date(),      // current simulated UTC time
    searchTerm: "",
    selected: null,           // currently selected satellite object (or null)
    groundTrackLayer: null,
  };

  const TICK_MS = 1000;       // wall-clock ms between simulation steps

  // ------------------------------------------------------------------
  // DOM references
  // ------------------------------------------------------------------
  const el = {
    categoryList: document.getElementById("categoryList"),
    loadingNotice: document.getElementById("loadingNotice"),
    searchInput: document.getElementById("searchInput"),
    playPauseBtn: document.getElementById("playPauseBtn"),
    speedGroup: document.getElementById("speedGroup"),
    resetTimeBtn: document.getElementById("resetTimeBtn"),
    clockValue: document.getElementById("clockValue"),
    satCountBadge: document.getElementById("satCountBadge"),
    infoPanel: document.getElementById("infoPanel"),
    closeInfoBtn: document.getElementById("closeInfoBtn"),
    infoName: document.getElementById("infoName"),
    infoCategory: document.getElementById("infoCategory"),
    infoNorad: document.getElementById("infoNorad"),
    infoLat: document.getElementById("infoLat"),
    infoLon: document.getElementById("infoLon"),
    infoAlt: document.getElementById("infoAlt"),
    infoVel: document.getElementById("infoVel"),
    infoPeriod: document.getElementById("infoPeriod"),
    infoIncl: document.getElementById("infoIncl"),
    groundTrackToggle: document.getElementById("groundTrackToggle"),
  };

  // ------------------------------------------------------------------
  // Map setup
  // ------------------------------------------------------------------
  const map = L.map("map", {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 8,
    zoomControl: true,
  }).setView([20, 0], 2);

  // Esri's "World Dark Gray Base" — free, keyless raster tiles.
  // (Switched from CARTO's dark_all tiles, which started requiring a
  // paid/free-tier API key in Aug 2026 and show an "API KEY REQUIRED"
  // watermark otherwise — see https://carto.com/basemaps/apikey/)
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 16,
    }
  ).addTo(map);

  const canvasRenderer = L.canvas({ padding: 0.5 });

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function normalizeLon(lonDeg) {
    let l = lonDeg % 360;
    if (l > 180) l -= 360;
    if (l < -180) l += 360;
    return l;
  }

  function parseMeanMotionRevPerDay(tle2) {
    // Columns 53-63 (1-indexed) => 0-indexed 52:63
    return parseFloat(tle2.substring(52, 63));
  }

  function parseInclinationDeg(tle2) {
    // Columns 9-16 (1-indexed) => 0-indexed 8:16
    return parseFloat(tle2.substring(8, 16));
  }

  function fmtNum(v, decimals, suffix) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return v.toFixed(decimals) + (suffix || "");
  }

  function fmtPeriod(minutes) {
    if (!minutes || Number.isNaN(minutes)) return "—";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }

  function fmtClock(date) {
    return date.toISOString().replace("T", "  ").replace(/\.\d+Z$/, " UTC");
  }

  // Splits a lat/lon polyline into segments wherever it crosses the
  // antimeridian, so Leaflet doesn't draw a long horizontal artifact
  // line across the whole map.
  function splitAntimeridian(points) {
    const segments = [];
    let current = [];
    for (let i = 0; i < points.length; i++) {
      const [lat, lon] = points[i];
      if (current.length > 0) {
        const prevLon = current[current.length - 1][1];
        if (Math.abs(lon - prevLon) > 180) {
          segments.push(current);
          current = [];
        }
      }
      current.push([lat, lon]);
    }
    if (current.length > 0) segments.push(current);
    return segments;
  }

  // ------------------------------------------------------------------
  // Category sidebar
  // ------------------------------------------------------------------
  function buildCategorySidebar() {
    CATEGORIES.forEach((def) => {
      state.categories[def.key] = {
        def,
        enabled: true,
        count: 0,
        layerGroup: L.layerGroup().addTo(map),
      };

      const li = document.createElement("li");
      li.dataset.key = def.key;
      li.innerHTML = `
        <span class="swatch" style="background:${def.color}"></span>
        <span class="cat-name">${def.label}</span>
        <span class="cat-count" id="count-${def.key}">0</span>
      `;
      li.addEventListener("click", () => toggleCategory(def.key));
      el.categoryList.appendChild(li);
    });
  }

  function toggleCategory(key) {
    const cat = state.categories[key];
    cat.enabled = !cat.enabled;
    const li = el.categoryList.querySelector(`li[data-key="${key}"]`);
    li.classList.toggle("disabled", !cat.enabled);
    refreshVisibility();
  }

  function updateCategoryCounts() {
    Object.values(state.categories).forEach((cat) => (cat.count = 0));
    let totalVisible = 0;
    state.satellites.forEach((sat) => {
      if (sat.visible) {
        state.categories[sat.categoryKey].count++;
        totalVisible++;
      }
    });
    Object.keys(state.categories).forEach((key) => {
      const countEl = document.getElementById(`count-${key}`);
      if (countEl) countEl.textContent = state.categories[key].count;
    });
    el.satCountBadge.textContent = `${totalVisible} satelitů zobrazeno`;
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------
  function loadCategory(def) {
    return fetch(def.file, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const list = (json.satellites || [])
          .map((raw) => buildSatelliteObject(raw, def))
          .filter(Boolean);
        return list;
      })
      .catch((err) => {
        console.warn(`Nepodařilo se načíst kategorii "${def.key}":`, err);
        return [];
      });
  }

  function buildSatelliteObject(raw, def) {
    let satrec;
    try {
      satrec = satellite.twoline2satrec(raw.tle1, raw.tle2);
    } catch (e) {
      return null;
    }
    if (!satrec || satrec.error) return null;

    const periodMin = 1440 / parseMeanMotionRevPerDay(raw.tle2);
    const inclDeg = parseInclinationDeg(raw.tle2);

    const marker = L.circleMarker([0, 0], {
      renderer: canvasRenderer,
      radius: 3.5,
      weight: 1,
      color: "#0b0f1a",
      fillColor: def.color,
      fillOpacity: 0.95,
      className: "sat-icon",
    });

    const satObj = {
      id: raw.noradId,
      name: raw.name,
      categoryKey: def.key,
      color: def.color,
      satrec,
      periodMin,
      inclDeg,
      marker,
      visible: true,
      lastLat: null,
      lastLon: null,
      lastAlt: null,
      lastVel: null,
    };

    marker.bindTooltip(raw.name, { direction: "top", offset: [0, -4] });
    marker.on("click", () => selectSatellite(satObj));

    return satObj;
  }

  function loadAllData() {
    const promises = CATEGORIES.map((def) => loadCategory(def));
    return Promise.all(promises).then((results) => {
      results.forEach((list, idx) => {
        const def = CATEGORIES[idx];
        list.forEach((sat) => {
          state.satellites.push(sat);
          state.categories[def.key].layerGroup.addLayer(sat.marker);
        });
      });
      el.loadingNotice.classList.add("hidden");
      if (state.satellites.length === 0) {
        el.loadingNotice.classList.remove("hidden");
        el.loadingNotice.textContent =
          "⚠️ Nepodařilo se načíst žádná data. Pokud prohlížíte soubor přímo (file://), spusťte prosím lokální server (viz README.md) — prohlížeče blokují načítání JSON přes file://.";
      }
    });
  }

  // ------------------------------------------------------------------
  // Simulation loop
  // ------------------------------------------------------------------
  function tick() {
    if (state.playing) {
      state.simTime = new Date(state.simTime.getTime() + TICK_MS * state.speed);
    }
    updatePositions();
    el.clockValue.textContent = fmtClock(state.simTime);
    if (state.selected) updateInfoPanel(state.selected);
  }

  function updatePositions() {
    const gmst = satellite.gstime(state.simTime);
    state.satellites.forEach((sat) => {
      const pv = satellite.propagate(sat.satrec, state.simTime);
      if (!pv || !pv.position) {
        sat.visible = false;
        sat.marker.setStyle({ opacity: 0, fillOpacity: 0 });
        return;
      }
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = normalizeLon(satellite.degreesLong(geo.longitude));
      const alt = geo.height;
      const v = pv.velocity;
      const vel = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

      sat.lastLat = lat;
      sat.lastLon = lon;
      sat.lastAlt = alt;
      sat.lastVel = vel;

      const catEnabled = state.categories[sat.categoryKey].enabled;
      const matchesSearch =
        state.searchTerm === "" ||
        sat.name.toLowerCase().includes(state.searchTerm);
      sat.visible = catEnabled && matchesSearch;

      sat.marker.setLatLng([lat, lon]);
      sat.marker.setStyle({ opacity: sat.visible ? 1 : 0, fillOpacity: sat.visible ? 0.95 : 0 });
    });
    updateCategoryCounts();
  }

  // ------------------------------------------------------------------
  // Selection / info panel / ground track
  // ------------------------------------------------------------------
  function selectSatellite(sat) {
    state.selected = sat;
    el.infoPanel.classList.remove("hidden");
    updateInfoPanel(sat);
    if (el.groundTrackToggle.checked) drawGroundTrack(sat);
  }

  function updateInfoPanel(sat) {
    el.infoName.textContent = sat.name;
    el.infoCategory.textContent = state.categories[sat.categoryKey].def.label;
    el.infoCategory.style.color = sat.color;
    el.infoNorad.textContent = sat.id;
    el.infoLat.textContent = fmtNum(sat.lastLat, 3, "°");
    el.infoLon.textContent = fmtNum(sat.lastLon, 3, "°");
    el.infoAlt.textContent = fmtNum(sat.lastAlt, 1, " km");
    el.infoVel.textContent = fmtNum(sat.lastVel, 2, " km/s");
    el.infoPeriod.textContent = fmtPeriod(sat.periodMin);
    el.infoIncl.textContent = fmtNum(sat.inclDeg, 2, "°");
  }

  function drawGroundTrack(sat) {
    clearGroundTrack();
    const steps = 80;
    const periodMs = sat.periodMin * 60 * 1000;
    const startMs = state.simTime.getTime() - periodMs / 2;
    const points = [];

    for (let i = 0; i <= steps; i++) {
      const t = new Date(startMs + (periodMs * i) / steps);
      const gmst = satellite.gstime(t);
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv || !pv.position) continue;
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      points.push([
        satellite.degreesLat(geo.latitude),
        normalizeLon(satellite.degreesLong(geo.longitude)),
      ]);
    }

    const segments = splitAntimeridian(points);
    state.groundTrackLayer = L.polyline(segments, {
      color: sat.color,
      weight: 1.5,
      opacity: 0.8,
      dashArray: "4 4",
      renderer: canvasRenderer,
    }).addTo(map);
  }

  function clearGroundTrack() {
    if (state.groundTrackLayer) {
      map.removeLayer(state.groundTrackLayer);
      state.groundTrackLayer = null;
    }
  }

  function deselect() {
    state.selected = null;
    el.infoPanel.classList.add("hidden");
    clearGroundTrack();
  }

  // ------------------------------------------------------------------
  // Visibility refresh (category toggle / search)
  // ------------------------------------------------------------------
  function refreshVisibility() {
    state.satellites.forEach((sat) => {
      const catEnabled = state.categories[sat.categoryKey].enabled;
      const matchesSearch =
        state.searchTerm === "" ||
        sat.name.toLowerCase().includes(state.searchTerm);
      sat.visible = catEnabled && matchesSearch;
      sat.marker.setStyle({ opacity: sat.visible ? 1 : 0, fillOpacity: sat.visible ? 0.95 : 0 });
    });
    updateCategoryCounts();
  }

  // ------------------------------------------------------------------
  // UI event wiring
  // ------------------------------------------------------------------
  function wireControls() {
    el.searchInput.addEventListener("input", (e) => {
      state.searchTerm = e.target.value.trim().toLowerCase();
      refreshVisibility();
    });

    el.playPauseBtn.addEventListener("click", () => {
      state.playing = !state.playing;
      el.playPauseBtn.textContent = state.playing ? "⏸" : "▶";
    });

    el.speedGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".speed-btn");
      if (!btn) return;
      state.speed = parseInt(btn.dataset.speed, 10);
      el.speedGroup
        .querySelectorAll(".speed-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
    });

    el.resetTimeBtn.addEventListener("click", () => {
      state.simTime = new Date();
      state.speed = 1;
      state.playing = true;
      el.playPauseBtn.textContent = "⏸";
      el.speedGroup.querySelectorAll(".speed-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.speed === "1");
      });
    });

    el.closeInfoBtn.addEventListener("click", deselect);

    el.groundTrackToggle.addEventListener("change", () => {
      if (!state.selected) return;
      if (el.groundTrackToggle.checked) {
        drawGroundTrack(state.selected);
      } else {
        clearGroundTrack();
      }
    });

    map.on("click", (e) => {
      // Clicking empty map area (not a marker) closes the info panel.
      if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.closest(".leaflet-interactive")) return;
      deselect();
    });
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function init() {
    buildCategorySidebar();
    wireControls();
    loadAllData().then(() => {
      updatePositions();
      el.clockValue.textContent = fmtClock(state.simTime);
      setInterval(tick, TICK_MS);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
