'use strict';

/*
 * The settings window. The app (MainForm.cs) owns the settings: this page shows them, sends every change as a
 * message, and redraws from the settings the app sends back. Nothing is stored here.
 *
 * App -> page: init, settings, status, frame, cityResults, system
 * Page -> app: ready, set {key, value}, searchCity {id, name}, autostart {value}, admin {value}
 */

const host = window.chrome && window.chrome.webview;
const send = message => host && host.postMessage(message);
const $ = id => document.getElementById(id);

let model = null;     // the init message: themes, fonts, views, cities, limits
let settings = null;  // the latest settings from the app

host && host.addEventListener('message', event => receive(event.data));
document.addEventListener('DOMContentLoaded', () => send({ type: 'ready' }));

function receive(message) {
  switch (message.type) {
    case 'init':
      model = message;
      settings = message.settings;
      build();
      sync();
      syncSystem(message.system);
      break;
    case 'settings':
      settings = message.settings;
      sync();
      break;
    case 'status':
      showStatus(message.state, message.text);
      break;
    case 'frame':
      $('preview').src = message.png;
      showTrail(message.view);
      break;
    case 'cityResults':
      showCityResults(message);
      break;
    case 'system':
      syncSystem(message);
      break;
    case 'designThumbs':
      for (const thumb of message.thumbs) {
        const img = document.querySelector('img[data-design="' + thumb.id + '"]');
        if (img) img.src = thumb.image;
      }
      break;
  }
}

function set(key, value) {
  settings[key] = value;
  send({ type: 'set', key, value });
}

/* ------------------------------ helpers ------------------------------ */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

/**
 * A row of role="radio" buttons with one tab stop and arrow-key navigation (WAI-ARIA radio group pattern).
 * Returns a function that marks the selected value.
 */
function radioGroup(container, options, onPick, render) {
  container.replaceChildren();
  const buttons = options.map((option, index) => {
    const button = el('button', { role: 'radio', 'aria-checked': 'false', tabindex: '-1' });
    render(button, option);
    button.addEventListener('click', () => onPick(option.value));
    button.addEventListener('keydown', event => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = buttons[(index + step + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
    container.append(button);
    return button;
  });
  return selected => {
    buttons.forEach((button, index) => {
      const on = options[index].value === selected;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
  };
}

function bindSwitch(button, onToggle) {
  button.addEventListener('click', () => onToggle(button.getAttribute('aria-checked') !== 'true'));
}

function setSwitch(button, on) {
  button.setAttribute('aria-checked', String(!!on));
}

/* ------------------------------ build ------------------------------ */

let markSeconds, markTheme, markFont;
const viewSwitches = new Map();
const worldSelects = [];

function build() {
  // Views
  const views = $('views');
  views.replaceChildren();
  for (const view of model.views) {
    const sw = el('button', { class: 'switch', role: 'switch', 'aria-label': view.name });
    bindSwitch(sw, on => {
      const next = model.views.map(v => v.id).filter(id => (id === view.id ? on : settings.views.includes(id)));
      if (next.length === 0) return; // at least one view stays on
      set('views', next);
      sync();
    });
    viewSwitches.set(view.id, sw);
    views.append(el('div', { class: 'row' }, [
      el('span', { class: 'row-text' }, [
        el('span', { class: 'row-title', text: view.name }),
        el('span', { class: 'row-desc', text: view.description })
      ]),
      sw
    ]));
  }

  markSeconds = radioGroup($('seconds'), model.secondsChoices.map(s => ({ value: s, label: `${s}s` })),
    value => { set('viewSeconds', value); markSeconds(value); },
    (button, option) => { button.textContent = option.label; });

  // Themes: a chip painted with the theme's own background and accent
  markTheme = radioGroup($('themes'), model.themes.map(t => ({ ...t, value: t.id })),
    value => { set('theme', value); markTheme(value); },
    (button, theme) => {
      button.className = 'swatch';
      button.setAttribute('aria-label', theme.name);
      const stops = theme.stops.join(', ');
      button.append(
        el('span', {
          class: 'swatch-chip',
          style: { background: `linear-gradient(${theme.angle}deg, ${stops})`, '--chip-accent': theme.accent }
        }),
        el('span', { class: 'swatch-name', text: theme.name })
      );
      button.querySelector('.swatch-chip').style.setProperty('--chip-accent', theme.accent);
    });

  // Clock fonts: each button shows the digits in its own font
  markFont = radioGroup($('fonts'), model.fonts.map(f => ({ ...f, value: f.id })),
    value => { set('font', value); markFont(value); },
    (button, font) => {
      button.textContent = '12:30';
      button.title = font.name;
      button.setAttribute('aria-label', font.name);
      button.style.fontFamily = `"${font.family}", sans-serif`;
      button.style.fontStyle = font.italic ? 'italic' : 'normal';
      button.style.fontWeight = String(font.weight);
    });

  // Brightness: live label, changes sent at most every 120 ms while dragging
  const range = $('brightness');
  let pending = null;
  range.addEventListener('input', () => {
    showBrightness(+range.value);
    if (pending) return;
    pending = setTimeout(() => { pending = null; set('brightness', +range.value); }, 120);
  });
  range.addEventListener('change', () => set('brightness', +range.value));

  bindSwitch($('use24h'), on => { set('use24h', on); sync(); });
  bindSwitch($('autostart'), on => { setSwitch($('autostart'), on); send({ type: 'autostart', value: on }); });
  bindSwitch($('admin'), on => { setSwitch($('admin'), on); send({ type: 'admin', value: on }); });

  // World clocks: three selects, "None" first
  const world = $('world');
  world.replaceChildren();
  worldSelects.length = 0;
  for (let slot = 0; slot < model.worldMax; slot++) {
    const select = el('select', { class: 'select', 'aria-label': `World clock ${slot + 1}` }, [
      el('option', { value: '', text: 'None' }),
      ...model.worldCities.map(c => el('option', { value: c.timeZoneId, text: c.label }))
    ]);
    select.addEventListener('change', () => {
      set('worldClocks', worldSelects.map(s => s.value).filter(Boolean));
      sync();
    });
    worldSelects.push(select);
    world.append(select);
  }

  buildDesigns();
  buildCitySearch();
}

/* ------------------------------ sync from settings ------------------------------ */

function sync() {
  if (!model || !settings) return;
  for (const [id, sw] of viewSwitches) {
    const on = settings.views.includes(id);
    setSwitch(sw, on);
    // the last view on cannot be switched off: it stays fully visible, and says why
    const last = on && settings.views.length === 1;
    sw.title = last ? 'At least one view stays on' : '';
    sw.setAttribute('aria-disabled', String(last));
  }
  markSeconds(settings.viewSeconds);
  markTheme(settings.theme);
  markFont(settings.font);
  // never move a control the user is dragging: the app's answer can be a step behind the pointer
  if (document.activeElement !== $('brightness')) $('brightness').value = settings.brightness;
  showBrightness(+$('brightness').value);
  setSwitch($('use24h'), settings.use24h);
  syncDesign();

  worldSelects.forEach((select, slot) => {
    select.value = settings.worldClocks[slot] || '';
    select.classList.toggle('empty', !select.value);
  });

  const current = $('city-current');
  current.replaceChildren();
  if (settings.weatherCity) {
    const city = settings.weatherCity;
    current.append('Showing the weather for ', el('strong', { text: city.name }), city.region ? `, ${city.region}` : '');
  } else {
    current.textContent = 'No city chosen yet. The weather view is skipped until you pick one.';
  }
}

function showBrightness(value) {
  $('brightness-value').textContent = `${value}%`;
  $('brightness').style.setProperty('--fill', `${value}%`);
}

function syncSystem(system) {
  if (!system) return;
  setSwitch($('autostart'), system.autostart);
  setSwitch($('admin'), system.admin);
  $('admin-desc').textContent = system.admin && system.elevated
    ? 'On. AuraTime is running as administrator and reads the CPU sensors.'
    : system.admin
      ? 'On, but Windows did not grant administrator rights this time.'
      : 'Needs administrator rights. Windows asks once, then AuraTime restarts.';
}

/* ------------------------------ system design ------------------------------ */

let markDesign;
const colorInputs = { accent: 'color-accent', secondary: 'color-secondary', alert: 'color-alert' };

function buildDesigns() {
  markDesign = radioGroup($('designs'), model.designs.map(d => ({ ...d, value: d.id })),
    value => { set('systemDesign', value); syncDesign(); },
    (button, design) => {
      button.className = 'design';
      button.setAttribute('aria-label', design.name + '. ' + design.description);
      button.append(
        el('img', { class: 'design-thumb', alt: '', width: '480', height: '320', 'data-design': design.id }),
        el('span', { class: 'design-name', text: design.name }));
    });

  for (const [key, id] of Object.entries(colorInputs)) {
    $(id).addEventListener('input', () => queueStyle({ [key]: $(id).value.toUpperCase() }));
  }
  const alertTemp = $('alert-temp');
  alertTemp.min = model.alertTempRange.min;
  alertTemp.max = model.alertTempRange.max;
  alertTemp.addEventListener('input', () => queueStyle({ alertTemp: +alertTemp.value }));
  $('reset-colors').addEventListener('click', resetStyle);
}

const styleOf = design => (settings.designs && settings.designs[design]) || {};

/** The colours the user changed for the design on show, sent once they stop (a colour picker fires on every drag). */
let styleTimer = null;
function queueStyle(patch) {
  const design = settings.systemDesign;
  const merged = { ...styleOf(design), ...patch };
  settings.designs = { ...settings.designs, [design]: merged };
  showAlertTemp(+$('alert-temp').value);
  $('reset-colors').disabled = false;
  clearTimeout(styleTimer);
  styleTimer = setTimeout(() => send({ type: 'set', key: 'designStyle', value: { design, ...merged } }), 150);
}

function resetStyle() {
  clearTimeout(styleTimer);
  const design = settings.systemDesign;
  const designs = { ...settings.designs };
  delete designs[design];
  settings.designs = designs;
  send({ type: 'set', key: 'designStyle', value: { design, accent: null, secondary: null, alert: null, alertTemp: null } });
  syncDesign();
}

function showAlertTemp(value) {
  const range = $('alert-temp');
  $('alert-temp-value').textContent = value + ' °C';
  range.style.setProperty('--fill', ((value - range.min) / (range.max - range.min)) * 100 + '%');
}

function syncDesign() {
  if (!model || !settings) return;
  markDesign(settings.systemDesign);
  const info = model.designs.find(d => d.id === settings.systemDesign);
  $('design-desc').textContent = info ? info.description : '';

  const own = styleOf(settings.systemDesign);
  const defaults = settings.styleDefaults;
  for (const [key, id] of Object.entries(colorInputs)) {
    const input = $(id);
    if (document.activeElement !== input) input.value = (own[key] || defaults[key]).toLowerCase();
  }
  const range = $('alert-temp');
  if (document.activeElement !== range) range.value = own.alertTemp != null ? own.alertTemp : defaults.alertTemp;
  showAlertTemp(+range.value);
  $('reset-colors').disabled = !Object.values(own).some(v => v != null);
}

/* ------------------------------ status and preview ------------------------------ */

function showStatus(state, text) {
  $('status').dataset.state = state;
  $('status-text').textContent = text;
}

let trailFor = '';
function showTrail(current) {
  const key = `${settings ? settings.views.join() : ''}|${current}`;
  if (key === trailFor || !model || !settings) return;
  trailFor = key;
  const trail = $('trail');
  trail.replaceChildren(...settings.views.map(id => {
    const view = model.views.find(v => v.id === id);
    return el('li', { 'aria-current': String(id === current), text: view ? view.short : id });
  }));
}

/* ------------------------------ city search ------------------------------ */

let searchId = 0;
let results = [];
let active = -1;

function buildCitySearch() {
  const input = $('city');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const name = input.value.trim();
    if (name.length < 2) { closeResults(); return; }
    timer = setTimeout(() => send({ type: 'searchCity', id: ++searchId, name }), 350);
  });

  input.addEventListener('keydown', event => {
    const list = $('city-results');
    if (event.key === 'Escape') { closeResults(); return; }
    if (list.hidden || results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      markActive();
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      pick(results[active]);
    }
  });

  input.addEventListener('blur', () => setTimeout(closeResults, 150));
}

function showCityResults(message) {
  if (message.id !== searchId) return; // an older search answered late
  const list = $('city-results');
  results = message.cities || [];
  active = results.length ? 0 : -1;
  list.replaceChildren();
  if (message.error) {
    list.append(el('li', { class: 'result-empty', text: message.error }));
  } else if (results.length === 0) {
    list.append(el('li', { class: 'result-empty', text: 'No matching place.' }));
  }
  results.forEach((city, index) => {
    list.append(el('li', {
      id: `city-${index}`,
      role: 'option',
      'aria-selected': 'false',
      onmousedown: event => { event.preventDefault(); pick(city); },
      onmousemove: () => { active = index; markActive(); }
    }, [
      el('span', { class: 'result-name', text: city.name }),
      el('span', { class: 'result-region', text: city.region || '' })
    ]));
  });
  list.hidden = false;
  $('city').setAttribute('aria-expanded', 'true');
  markActive();
}

function markActive() {
  [...$('city-results').querySelectorAll('[role="option"]')].forEach((item, index) => {
    item.setAttribute('aria-selected', String(index === active));
  });
  $('city').setAttribute('aria-activedescendant', active >= 0 ? `city-${active}` : '');
}

function pick(city) {
  set('weatherCity', city);
  $('city').value = '';
  closeResults();
  sync();
}

function closeResults() {
  $('city-results').hidden = true;
  $('city').setAttribute('aria-expanded', 'false');
  results = [];
  active = -1;
}
