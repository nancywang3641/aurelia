// ----------------------------------------------------------------
// [檔案] core/void/city_shell.js (V1.0 - 視差城市第一街區・渲染核心)
// 職責：資料驅動的城市畫面（底圖/動態房屋/點擊熱區/資訊面板/日夜實體素材切換）。
//       移植自 參考資料/city_module_package/prototype/city-shell.js，公開 API 不變。
// 鐵律：不依賴 OS_DB / SillyTavern context / 大廳內部函式——正式資料與路由全走 city_adapter.js。
//       日夜=整套 runtime 圖片替換（_night 後綴），禁止 CSS 染色或 brightness 濾鏡。
//       本檔「不進」index.js 啟動清單：由 city_adapter.js 延遲注入（第一次進城才載）。
// ----------------------------------------------------------------
(function cityShellModule(global) {
  'use strict';

  const DESIGN = Object.freeze({ width: 1536, height: 1024 });
  const THEME_ASSETS = Object.freeze({
    day: Object.freeze({ base: 'city_base_fixed.webp' }),
    night: Object.freeze({ base: 'city_base_fixed_night.webp' }),
  });
  const STATUS_LABELS = Object.freeze({
    locked: '尚未解鎖',
    available: '可邀請入住',
    reserved: '已保留',
    moving: '搬入中',
    occupied: '已入住',
  });

  const LAYOUT = Object.freeze({
    landmarks: [
      { id: 'book_cafe_gate', name: '書咖入口', bounds: { x: 205, y: 28, width: 430, height: 305 }, destination: 'book_cafe' },
      { id: 'exchange', name: '交易所', bounds: { x: 1040, y: 315, width: 365, height: 282 }, destination: 'exchange' },
    ],
    plots: [
      { id: 'player_plot', name: '玩家住宅地', plotType: 'player-home', bounds: { x: 130, y: 585, width: 505, height: 300 }, placement: { x: 145, y: 624, width: 455, height: 266 } },
      { id: 'npc_plot_01', name: '鄰居地塊 01', plotType: 'npc-home', bounds: { x: 115, y: 345, width: 285, height: 195 }, placement: { x: 130, y: 346, width: 240, height: 184 } },
      { id: 'npc_plot_02', name: '鄰居地塊 02', plotType: 'npc-home', bounds: { x: 1000, y: 82, width: 275, height: 220 }, placement: { x: 1035, y: 99, width: 180, height: 193 } },
      { id: 'npc_plot_03', name: '鄰居地塊 03', plotType: 'npc-home', bounds: { x: 900, y: 645, width: 270, height: 225 }, placement: { x: 925, y: 699, width: 210, height: 166 } },
      { id: 'npc_plot_04', name: '鄰居地塊 04', plotType: 'npc-home', bounds: { x: 1180, y: 645, width: 270, height: 225 }, placement: { x: 1200, y: 702, width: 210, height: 163 } },
    ],
  });

  // interior*: 三種室內狀態（入住版/空屋底板/全空殼），只在真正進屋時載入——本輪只接資料，進屋路由後續實作
  const BUILDINGS = Object.freeze({
    player_house_lv1: { id: 'player_house_lv1', name: '玩家住所・初階', category: 'player-home', asset: 'player_house_lv1.webp', nightAsset: 'player_house_lv1_night.webp', interiorAsset: 'interiors/player_home_interior.webp', emptyInteriorAsset: 'interiors/player_home_interior_empty.webp', bareInteriorAsset: 'interiors/player_home_interior_bare.webp' },
    npc_house_01: { id: 'npc_house_01', name: '弧光家庭宅', category: 'npc-home', asset: 'npc_house_01.webp', nightAsset: 'npc_house_01_night.webp', interiorAsset: 'interiors/npc_house_01_interior.webp', emptyInteriorAsset: 'interiors/npc_house_01_interior_empty.webp', bareInteriorAsset: 'interiors/npc_house_01_interior_bare.webp' },
    npc_house_02: { id: 'npc_house_02', name: '垂直靜居', category: 'npc-home', asset: 'npc_house_02.webp', nightAsset: 'npc_house_02_night.webp', interiorAsset: 'interiors/npc_house_02_interior.webp', emptyInteriorAsset: 'interiors/npc_house_02_interior_empty.webp', bareInteriorAsset: 'interiors/npc_house_02_interior_bare.webp' },
    npc_house_03: { id: 'npc_house_03', name: '雙模組創作宅', category: 'npc-home', asset: 'npc_house_03.webp', nightAsset: 'npc_house_03_night.webp', interiorAsset: 'interiors/npc_house_03_interior.webp', emptyInteriorAsset: 'interiors/npc_house_03_interior_empty.webp', bareInteriorAsset: 'interiors/npc_house_03_interior_bare.webp' },
    npc_house_04: { id: 'npc_house_04', name: '玻璃溫室宅', category: 'npc-home', asset: 'npc_house_04.webp', nightAsset: 'npc_house_04_night.webp', interiorAsset: 'interiors/npc_house_04_interior.webp', emptyInteriorAsset: 'interiors/npc_house_04_interior_empty.webp', bareInteriorAsset: 'interiors/npc_house_04_interior_bare.webp' },
  });

  let activeController = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function percentage(value, axis) {
    const total = axis === 'x' ? DESIGN.width : DESIGN.height;
    return `${(value / total) * 100}%`;
  }

  function normalizeState(input) {
    const state = clone(input || {});
    state.version = 1;
    state.districtId ||= 'parallax_city_district_01';
    state.theme = state.theme === 'night' ? 'night' : 'day';
    state.plots ||= {};
    state.npcLocations ||= [];

    for (const plot of LAYOUT.plots) {
      state.plots[plot.id] ||= {
        status: plot.plotType === 'player-home' ? 'occupied' : 'locked',
        buildingId: plot.plotType === 'player-home' ? 'player_house_lv1' : null,
        ownerId: plot.plotType === 'player-home' ? 'player' : null,
        ownerName: plot.plotType === 'player-home' ? '玩家' : null,
      };
    }
    return state;
  }

  class CityShellController {
    constructor(container, state, options) {
      if (!(container instanceof Element)) throw new TypeError('CityShell.mount 需要有效的容器元素');
      this.container = container;
      // landmarkOverrides: { [landmarkId]: { name, desc, destination } }——adapter 把地標接上正式名稱與路由
      this.options = Object.assign({ assetBase: './', onStateChange: null, onNavigate: null, landmarkOverrides: null }, options);
      this.state = normalizeState(state);
      this.abort = new AbortController();
      this.selected = null;
      this.root = null;
    }

    mount() {
      this.container.replaceChildren();
      this.root = document.createElement('section');
      this.root.className = 'city-shell';
      this.root.setAttribute('aria-label', '視差城市第一街區');
      this.root.innerHTML = [
        '<div class="city-shell__buildings" aria-hidden="true"></div>',
        '<div class="city-shell__hotspots"></div>',
        '<aside class="city-shell__panel" hidden>',
        '  <small></small>',
        '  <h2></h2>',
        '  <p></p>',
        '  <button class="city-shell__go" type="button" hidden>前往</button>',
        '</aside>',
      ].join('');
      this.container.append(this.root);
      this.root.querySelector('.city-shell__go').addEventListener('click', () => {
        if (!this.selected?.destination) return;
        const target = clone(this.selected);
        this.root.dispatchEvent(new CustomEvent('city:navigate', { bubbles: true, detail: target }));
        if (typeof this.options.onNavigate === 'function') this.options.onNavigate(target);
      }, { signal: this.abort.signal });
      this.render();
      return this;
    }

    landmarkInfo(landmark) {
      const ov = this.options.landmarkOverrides?.[landmark.id] || {};
      return {
        name: ov.name || landmark.name,
        desc: ov.desc || '固定地標',
        destination: ov.destination !== undefined ? ov.destination : landmark.destination,
      };
    }

    render() {
      if (!this.root) return;
      this.root.classList.toggle('is-night', this.state.theme === 'night');
      this.root.dataset.theme = this.state.theme;
      this.root.style.backgroundImage = `url("${this.options.assetBase}${THEME_ASSETS[this.state.theme].base}")`;
      this.renderBuildings();
      this.renderHotspots();
      this.renderPanel();
    }

    renderBuildings() {
      const layer = this.root.querySelector('.city-shell__buildings');
      layer.replaceChildren();
      for (const plot of LAYOUT.plots) {
        const plotState = this.state.plots[plot.id];
        if (!plotState || plotState.status !== 'occupied' || !plotState.buildingId) continue;
        const building = BUILDINGS[plotState.buildingId];
        if (!building || building.category !== plot.plotType) continue;

        const img = document.createElement('img');
        img.className = 'city-shell__building';
        img.alt = '';
        img.decoding = 'async';
        img.loading = 'lazy';
        const asset = this.state.theme === 'night' ? building.nightAsset : building.asset;
        img.src = `${this.options.assetBase}${asset || building.asset}`;
        img.style.left = percentage(plot.placement.x, 'x');
        img.style.top = percentage(plot.placement.y, 'y');
        img.style.width = percentage(plot.placement.width, 'x');
        layer.append(img);
      }
    }

    renderHotspots() {
      const layer = this.root.querySelector('.city-shell__hotspots');
      layer.replaceChildren();

      for (const landmark of LAYOUT.landmarks) {
        const info = this.landmarkInfo(landmark);
        layer.append(this.createHotspot({
          kind: 'landmark',
          id: landmark.id,
          name: info.name,
          bounds: landmark.bounds,
          status: 'fixed',
          detail: info.desc,
          destination: info.destination,
        }));
      }

      for (const plot of LAYOUT.plots) {
        const plotState = this.state.plots[plot.id];
        const building = plotState.buildingId ? BUILDINGS[plotState.buildingId] : null;
        const owner = plotState.ownerName ? `・${plotState.ownerName}` : '';
        layer.append(this.createHotspot({
          kind: 'plot',
          id: plot.id,
          name: plot.name,
          bounds: plot.bounds,
          status: plotState.status,
          detail: `${STATUS_LABELS[plotState.status] || plotState.status}${owner}${building ? `・${building.name}` : ''}`,
        }));
      }
    }

    createHotspot(item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'city-shell__hotspot';
      button.dataset.kind = item.kind;
      button.dataset.id = item.id;
      button.dataset.status = item.status;
      button.setAttribute('aria-label', `${item.name}，${item.detail}`);
      button.style.left = percentage(item.bounds.x, 'x');
      button.style.top = percentage(item.bounds.y, 'y');
      button.style.width = percentage(item.bounds.width, 'x');
      button.style.height = percentage(item.bounds.height, 'y');
      button.innerHTML = `<span class="city-shell__chip">${item.name}</span>`;
      button.classList.toggle('is-selected', this.selected?.id === item.id);
      button.addEventListener('click', () => {
        this.selected = item;
        this.render();
        this.root.dispatchEvent(new CustomEvent('city:select', { bubbles: true, detail: clone(item) }));
      }, { signal: this.abort.signal });
      return button;
    }

    renderPanel() {
      const panel = this.root.querySelector('.city-shell__panel');
      panel.hidden = !this.selected;
      if (!this.selected) return;
      panel.querySelector('small').textContent = this.selected.kind === 'plot' ? '城市地塊' : '地標';
      panel.querySelector('h2').textContent = this.selected.name;
      panel.querySelector('p').textContent = this.selected.detail;
      const go = panel.querySelector('.city-shell__go');
      go.hidden = !(this.selected.destination && typeof this.options.onNavigate === 'function');
    }

    setState(nextState) {
      this.state = normalizeState(nextState);
      this.state.updatedAt = new Date().toISOString();
      this.selected = null;
      this.render();
      this.emitStateChange();
    }

    setPlotStatus(plotId, status, patch) {
      if (!STATUS_LABELS[status]) throw new RangeError(`未知地塊狀態：${status}`);
      if (!this.state.plots[plotId]) throw new RangeError(`找不到地塊：${plotId}`);
      Object.assign(this.state.plots[plotId], patch || {}, { status });
      if (status !== 'occupied') this.state.plots[plotId].buildingId = null;
      this.touch();
    }

    placeBuilding(plotId, buildingId, owner) {
      const plot = LAYOUT.plots.find((item) => item.id === plotId);
      const building = BUILDINGS[buildingId];
      if (!plot) throw new RangeError(`找不到地塊：${plotId}`);
      if (!building) throw new RangeError(`找不到建築：${buildingId}`);
      if (building.category !== plot.plotType) throw new TypeError(`${buildingId} 不相容 ${plot.plotType}`);
      this.state.plots[plotId] = {
        status: 'occupied',
        buildingId,
        ownerId: owner?.id || null,
        ownerName: owner?.name || null,
      };
      this.touch();
    }

    setNpcLocation(npcId, locationId) {
      const now = new Date().toISOString();
      const existing = this.state.npcLocations.find((item) => item.npcId === npcId);
      if (existing) Object.assign(existing, { locationId, updatedAt: now });
      else this.state.npcLocations.push({ npcId, locationId, updatedAt: now });
      this.touch();
    }

    setTheme(theme) {
      this.state.theme = theme === 'night' ? 'night' : 'day';
      this.touch();
    }

    getState() {
      return clone(this.state);
    }

    touch() {
      this.state.updatedAt = new Date().toISOString();
      this.render();
      this.emitStateChange();
    }

    emitStateChange() {
      const state = this.getState();
      if (typeof this.options.onStateChange === 'function') this.options.onStateChange(state);
      this.root?.dispatchEvent(new CustomEvent('city:state-change', { bubbles: true, detail: state }));
    }

    destroy() {
      this.abort.abort();
      this.root?.remove();
      this.root = null;
      this.container.replaceChildren();
    }
  }

  const CityShell = {
    mount(container, state, options) {
      activeController?.destroy();
      activeController = new CityShellController(container, state, options).mount();
      return activeController;
    },
    setState(state) { activeController?.setState(state); },
    setPlotStatus(plotId, status, patch) { activeController?.setPlotStatus(plotId, status, patch); },
    placeBuilding(plotId, buildingId, owner) { activeController?.placeBuilding(plotId, buildingId, owner); },
    setNpcLocation(npcId, locationId) { activeController?.setNpcLocation(npcId, locationId); },
    setTheme(theme) { activeController?.setTheme(theme); },
    getState() { return activeController?.getState() || null; },
    destroy() {
      activeController?.destroy();
      activeController = null;
    },
    constants: Object.freeze({ DESIGN, THEME_ASSETS, LAYOUT, BUILDINGS }),
  };

  global.CityShell = CityShell;
}(window));
