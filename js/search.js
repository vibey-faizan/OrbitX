/**
 * Accessible planet search (ARIA combobox + listbox).
 * Matches names first, then aliases and categories ("red planet", "ice giant").
 */
import { escapeHTML } from './utils.js';

function score(body, query) {
  const name = body.name.toLowerCase();
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.includes(query)) return 60;
  if (body.aliases?.some((alias) => alias.includes(query))) return 40;
  if (body.category.toLowerCase().includes(query)) return 20;
  return 0;
}

export function initSearch({ input, listbox, status, bodies, onSelect }) {
  let results = [];
  let activeIndex = -1;

  const setExpanded = (expanded) => {
    input.setAttribute('aria-expanded', String(expanded));
    listbox.hidden = !expanded;
    if (!expanded) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    results = query
      ? bodies
        .map((body) => ({ body, score: score(body, query) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.body)
      : bodies;
    activeIndex = results.length ? 0 : -1;

    if (!results.length) {
      listbox.innerHTML = `<li class="search-empty" role="presentation">No matches for “${escapeHTML(input.value.trim())}”. Try “Mars”, “ringed” or “ice giant”.</li>`;
      status.textContent = 'No results';
    } else {
      listbox.innerHTML = results.map((body, i) => `
        <li id="search-option-${body.id}" class="search-option" role="option" data-id="${body.id}" aria-selected="${i === activeIndex}">
          <span class="search-dot" style="--dot:${body.color}" aria-hidden="true"></span>
          <span class="search-name">${body.name}</span>
          <span class="search-meta">${body.category}</span>
        </li>`).join('');
      status.textContent = `${results.length} result${results.length === 1 ? '' : 's'} available`;
    }
    updateActive();
    setExpanded(true);
  };

  const updateActive = () => {
    listbox.querySelectorAll('[role="option"]').forEach((option, i) => {
      const active = i === activeIndex;
      option.setAttribute('aria-selected', String(active));
      if (active) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const choose = (id) => {
    const body = bodies.find((b) => b.id === id);
    if (!body) return;
    input.value = '';
    setExpanded(false);
    input.blur();
    onSelect(body.id);
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('keydown', (event) => {
    const open = !listbox.hidden;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) render();
        else if (results.length) { activeIndex = (activeIndex + 1) % results.length; updateActive(); }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open && results.length) { activeIndex = (activeIndex - 1 + results.length) % results.length; updateActive(); }
        break;
      case 'Enter':
        if (open && activeIndex >= 0) {
          event.preventDefault();
          choose(results[activeIndex].id);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setExpanded(false);
        } else if (input.value) {
          input.value = '';
        } else {
          input.blur();
        }
        break;
      case 'Tab':
        setExpanded(false);
        break;
      default:
        break;
    }
  });

  // mousedown keeps focus in the input so the click registers before blur.
  listbox.addEventListener('mousedown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) choose(option.dataset.id);
  });
  input.addEventListener('blur', () => setTimeout(() => setExpanded(false), 120));

  return {
    focus() {
      input.focus();
    },
  };
}
