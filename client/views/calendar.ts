import { session, scheduleSave } from '../state';
import type { DiaryEvent } from '../types';
import { nanoid, fmtTime, esc } from '../utils';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS = ['January','February','March','April','May','June',
'July','August','September','October','November','December'];
const COLORS = ['#5B8DB8','#AA3333','#3A7A3A','#8A6A20','#7A4A8A','#3A6A6A','#AA6633'];

function ymd(ts: number): [number, number, number] {
  const d = new Date(ts * 1000);
  return [d.getFullYear(), d.getMonth(), d.getDate()];
}

export function renderCalendar(container: HTMLElement): void {
  if (!session) return;
  const data = session.data;

  let viewYear  = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  function buildEventMap() {
    const map = new Map<string, DiaryEvent[]>();
    for (const ev of data.events) {
      const [y, m, d] = ymd(ev.timestamp);
      const key = `${y}-${m}-${d}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }

  function openDialog(sy: number, sm: number, sd: number) {
    container.querySelector('.cal-dialog-overlay')?.remove();

    const eventMap = buildEventMap();
    const key = `${sy}-${sm}-${sd}`;
    const dayEvents = (eventMap.get(key) || []).sort((a, b) => a.timestamp - b.timestamp);

    const overlay = document.createElement('div');
    overlay.className = 'cal-dialog-overlay';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); render(); }
    });

    const dialog = document.createElement('div');
    dialog.className = 'cal-dialog cde-window';

    /* Title bar */
    const titlebar = document.createElement('div');
    titlebar.className = 'cal-dialog-titlebar';

    const closeBtn = document.createElement('span');
    closeBtn.className = 'cal-dialog-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => { overlay.remove(); render(); });

    const titleText = document.createElement('span');
    titleText.className = 'cde-titlebar-title';
    titleText.textContent = `${MONTHS[sm]} ${sd}, ${sy}`;

    titlebar.appendChild(closeBtn);
    titlebar.appendChild(titleText);
    dialog.appendChild(titlebar);

    /* Body */
    const body = document.createElement('div');
    body.className = 'cal-dialog-body';
    dialog.appendChild(body);

    /* Event list */
    const eventList = document.createElement('div');
    eventList.className = 'cal-event-list';
    body.appendChild(eventList);

    function renderList() {
      eventList.innerHTML = '';
      if (dayEvents.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cal-empty';
        empty.textContent = 'No events for this day.';
        eventList.appendChild(empty);
        return;
      }
      dayEvents.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'cal-event-row';

        const dot = document.createElement('span');
        dot.className = 'cal-event-dot';
        dot.style.background = ev.color;

        const info = document.createElement('div');
        info.className = 'cal-event-info';

        const title = document.createElement('span');
        title.className = 'cal-event-title';
        title.textContent = ev.title;

        const time = document.createElement('span');
        time.className = 'cal-event-time';
        time.textContent = fmtTime(ev.timestamp);

        info.appendChild(title);
        info.appendChild(time);

        const del = document.createElement('button');
        del.className = 'cal-event-del';
        del.textContent = '×';
        del.title = 'Delete';
      del.onclick = () => {
        const idx = data.events.indexOf(ev);
        if (idx >= 0) data.events.splice(idx, 1);
        dayEvents.splice(dayEvents.indexOf(ev), 1);
        scheduleSave();
        renderList();
        render();
      };

      row.appendChild(dot);
      row.appendChild(info);
      row.appendChild(del);
      eventList.appendChild(row);
      });
    }
    renderList();

    /* Add form */
    const form = document.createElement('div');
    form.className = 'cal-add-form';

    const formTitle = document.createElement('div');
    formTitle.className = 'cal-form-title';
    formTitle.textContent = 'Add Event';
    form.appendChild(formTitle);

    const titleIn = document.createElement('input');
    titleIn.className = 'cal-input';
    titleIn.type = 'text';
    titleIn.placeholder = 'Event title';
    titleIn.maxLength = 80;
    form.appendChild(titleIn);

    const rowEl = document.createElement('div');
    rowEl.className = 'cal-form-row';

    const now = new Date();
    const timeIn = document.createElement('input');
    timeIn.className = 'cal-input cal-input--time';
    timeIn.type = 'time';
    timeIn.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const colorPicker = document.createElement('div');
    colorPicker.className = 'cal-colors';

    let selectedColor = COLORS[0];
    COLORS.forEach((c, i) => {
      const sw = document.createElement('button');
      sw.className = 'cal-swatch' + (i === 0 ? ' active' : '');
      sw.style.background = c;
      sw.title = c;
      sw.onclick = () => {
        colorPicker.querySelectorAll('.cal-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        selectedColor = c;
      };
      colorPicker.appendChild(sw);
    });

    rowEl.appendChild(timeIn);
    rowEl.appendChild(colorPicker);
    form.appendChild(rowEl);

    const addBtn = document.createElement('button');
    addBtn.className = 'cal-add-btn';
    addBtn.textContent = 'Add';
    form.appendChild(addBtn);

    addBtn.addEventListener('click', () => {
      const title = titleIn.value.trim();
      if (!title) { titleIn.focus(); return; }
      const [h, m] = timeIn.value.split(':').map(Number);
      const ts = Math.floor(new Date(sy, sm, sd, h || 0, m || 0).getTime() / 1000);
      const ev: DiaryEvent = { id: nanoid(), title, timestamp: ts, color: selectedColor };
      data.events.push(ev);
      dayEvents.push(ev);
      dayEvents.sort((a, b) => a.timestamp - b.timestamp);
      scheduleSave();
      titleIn.value = '';
      renderList();
      render(); // refresh dots on grid
    });

    titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });

    body.appendChild(form);
    overlay.appendChild(dialog);
    container.appendChild(overlay);
    setTimeout(() => titleIn.focus(), 50);
  }

  function render() {
    container.innerHTML = '';
    container.className = 'cal-root';
    container.style.position = 'relative';

    /* ── Header ─────────────────────────────────────────────────────────── */
    const header = document.createElement('div');
    header.className = 'cal-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'cal-nav';
    prevBtn.textContent = '◁';
    prevBtn.title = 'Previous month';
    prevBtn.onclick = () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'cal-nav';
    nextBtn.textContent = '▷';
    nextBtn.title = 'Next month';
    nextBtn.onclick = () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    };

    const label = document.createElement('span');
    label.className = 'cal-month-label';
    label.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

    header.appendChild(prevBtn);
    header.appendChild(label);
    header.appendChild(nextBtn);
    container.appendChild(header);

    /* ── Grid wrap ───────────────────────────────────────────────────────── */
    const gridWrap = document.createElement('div');
    gridWrap.className = 'cal-grid-wrap';
    container.appendChild(gridWrap);

    /* Day-of-week row */
    const dowRow = document.createElement('div');
    dowRow.className = 'cal-dow-row';
    DAYS.forEach(d => {
      const cell = document.createElement('div');
      cell.className = 'cal-dow';
      cell.textContent = d;
      dowRow.appendChild(cell);
    });
    gridWrap.appendChild(dowRow);

    /* Calculate grid dimensions */
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startDow = (firstDay.getDay() + 6) % 7; // 0 = Monday
    const numRows = Math.ceil((startDow + daysInMonth) / 7);

    const eventMap = buildEventMap();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    /* Grid */
    const grid = document.createElement('div');
    grid.className = 'cal-grid';
    grid.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;
    gridWrap.appendChild(grid);

    /* Filler cells */
    for (let i = 0; i < startDow; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell cal-cell--filler';
      grid.appendChild(cell);
    }

    /* Day cells */
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${viewYear}-${viewMonth}-${day}`;
      const events = eventMap.get(key) || [];
      const isToday = key === todayKey;

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (isToday ? ' cal-cell--today' : '');

      const num = document.createElement('span');
      num.className = 'cal-day-num';
      num.textContent = String(day);
      cell.appendChild(num);

      /* Show up to 5 events sorted by time, then "+N more" */
      const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
      const showChips = sorted.slice(0, 5);
      const overflow = sorted.length - showChips.length;

      showChips.forEach(ev => {
        const chip = document.createElement('div');
        chip.className = 'cal-event-chip';
        chip.style.background = ev.color;
        chip.title = ev.title;
        chip.textContent = `${fmtTime(ev.timestamp)} ${ev.title}`;
        cell.appendChild(chip);
      });

      if (overflow > 0) {
        const more = document.createElement('div');
        more.className = 'cal-dot-more';
        more.textContent = `+${overflow} more`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => openDialog(viewYear, viewMonth, day));
      grid.appendChild(cell);
    }
  }

  render();
}
