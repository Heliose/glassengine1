/* ------------------------------------------------------------------ *
 * Small control widgets bound to state paths. Every widget returns an
 * element with a `.refresh()` that re-reads the store, and registers
 * itself with the given registry so the whole deck can refresh at once.
 * ------------------------------------------------------------------ */

export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const fmtDefault = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

export function makeControls(app, registry) {
  const bind = (widget, path) => {
    widget.dataset.path = path;
    registry.push(widget);
    return widget;
  };

  function slider({ label, path, min = 0, max = 1, step = 0.001, format = fmtDefault, unit = '', hint = '' }) {
    const row = el('div', 'ctl ctl-slider');
    row.innerHTML = `<div class="ctl-top"><span class="ctl-label" title="${hint}">${label}</span><span class="ctl-val mono"></span></div>`;
    const input = el('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    row.appendChild(input);
    const val = row.querySelector('.ctl-val');
    const paint = (v) => {
      const k = (v - min) / (max - min);
      input.style.setProperty('--k', `${(k * 100).toFixed(2)}%`);
      val.textContent = format(v) + unit;
    };
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      paint(v);
      app.set(path, v, { live: true });
    });
    input.addEventListener('change', () => app.set(path, parseFloat(input.value), { commit: true }));
    input.addEventListener('dblclick', () => {
      const d = app.defaultOf(path);
      if (d == null) return;
      input.value = d; paint(d); app.set(path, d, { commit: true });
    });
    row.refresh = () => {
      const v = app.get(path);
      if (v == null) return;
      input.value = v;
      paint(v);
    };
    row.refresh();
    return bind(row, path);
  }

  function color({ label, path }) {
    const row = el('div', 'ctl ctl-color');
    row.innerHTML = `<span class="ctl-label">${label}</span><label class="chip"><input type="color"><span class="sw"></span><span class="hex mono"></span></label>`;
    const input = row.querySelector('input'), sw = row.querySelector('.sw'), hex = row.querySelector('.hex');
    input.addEventListener('input', () => {
      sw.style.background = input.value; hex.textContent = input.value;
      app.set(path, input.value, { live: true });
    });
    input.addEventListener('change', () => app.set(path, input.value, { commit: true }));
    row.refresh = () => {
      const v = app.get(path);
      if (!v) return;
      input.value = v; sw.style.background = v; hex.textContent = v;
    };
    row.refresh();
    return bind(row, path);
  }

  function toggle({ label, path, hint = '' }) {
    const row = el('div', 'ctl ctl-toggle');
    row.innerHTML = `<span class="ctl-label" title="${hint}">${label}</span><button class="switch" role="switch" aria-label="${label}"><i></i></button>`;
    const b = row.querySelector('button');
    b.addEventListener('click', () => app.set(path, !app.get(path), { commit: true }));
    row.refresh = () => {
      const v = !!app.get(path);
      b.classList.toggle('on', v);
      b.setAttribute('aria-checked', v);
    };
    row.refresh();
    return bind(row, path);
  }

  /** Segmented control for a few options, or a <select> for many. */
  function select({ label, path, options, wrap = false, parse = (v) => v }) {
    const row = el('div', `ctl ctl-select${wrap ? ' wrap' : ''}`);
    row.innerHTML = `<span class="ctl-label">${label}</span>`;
    if (options.length <= 6 || wrap) {
      const seg = el('div', 'seg');
      for (const o of options) {
        const b = el('button', 'seg-b', o.label);
        b.dataset.id = String(o.id);
        b.title = o.hint || '';
        b.addEventListener('click', () => app.set(path, parse(o.id), { commit: true }));
        seg.appendChild(b);
      }
      row.appendChild(seg);
      row.refresh = () => {
        const v = String(app.get(path));
        for (const b of seg.children) b.classList.toggle('on', b.dataset.id === v);
      };
    } else {
      const s = el('select');
      for (const o of options) {
        const opt = el('option', null, o.label);
        opt.value = String(o.id);
        s.appendChild(opt);
      }
      s.addEventListener('change', () => app.set(path, parse(s.value), { commit: true }));
      row.appendChild(s);
      row.refresh = () => (s.value = String(app.get(path)));
    }
    row.refresh();
    return bind(row, path);
  }

  function button({ label, onClick, cls = '' }) {
    const b = el('button', `btn ${cls}`, label);
    b.addEventListener('click', onClick);
    return b;
  }

  function folder(title, kids, { open = false, id = '' } = {}) {
    const s = el('section', `fold${open ? ' open' : ''}`);
    if (id) s.id = id;
    s.innerHTML = `<button class="fold-head" aria-expanded="${open}"><span>${title}</span><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button><div class="fold-body"></div>`;
    const body = s.querySelector('.fold-body');
    for (const k of kids) if (k) body.appendChild(k);
    s.querySelector('.fold-head').addEventListener('click', () => {
      const o = s.classList.toggle('open');
      s.querySelector('.fold-head').setAttribute('aria-expanded', o);
    });
    s.body = body;
    return s;
  }

  const note = (text) => el('p', 'ctl-note', text);
  const divider = () => el('div', 'ctl-div');

  return { slider, color, toggle, select, button, folder, note, divider };
}
