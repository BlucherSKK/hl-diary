import { session, scheduleSave } from '../state';
import type { DiaryEvent } from '../types';
import { nanoid, unixNow, fmtTime, esc } from '../utils';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const DEFAULT_COLORS = ['#7c6dff','#ff5555','#50fa7b','#f1fa8c','#ff79c6','#8be9fd','#ffb86c'];

function startOfMonday(year: number, month: number): number {
  // Returns the date of the Monday that starts the grid row containing the 1st
  const d = new Date(year, month, 1);
  const dow = (d.getDay() + 6) % 7; // 0=Mon
  d.setDate(1 - dow);
  return d.getDate() < 0 ? 1 : d.getTime();
}

/** Get [year, month, day] from a unix timestamp (local time). */
function ymd(ts: number): [number, number, number] {
  const d = new Date(ts * 1000);
  return [d.getFullYear(), d.getMonth(), d.getDate()];
}

/** Return unix timestamp (seconds) at midnight local time for the given date. */
function localMidnight(year: number, month: number, day: number): number {
  return new Date(year, month, day).getTime() / 1000;
}

export function renderCalendar(container: HTMLElement): void {
  if (!session) return;
  const data = session.data;

  let viewYear  = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedDay: [number, number, number] | null = null;

  function render() {
    container.innerHTML = '';
    container.className = 'cal-root';

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'cal-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'cal-nav';
    prevBtn.textContent = '←';
    prevBtn.onclick = () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      selectedDay = null;
      render();
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'cal-nav';
    nextBtn.textContent = '→';
    nextBtn.onclick = () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      selectedDay = null;
      render();
    };

    const monthLabel = document.createElement('span');
    monthLabel.className = 'cal-month-label';
    monthLabel.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

    header.appendChild(prevBtn);
    header.appendChild(monthLabel);
    header.appendChild(nextBtn);
    container.appendChild(header);

    // ── Body: grid + side panel ──────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'cal-body';
    container.appendChild(body);

    // Grid area
    const gridWrap = document.createElement('div');
    gridWrap.className = 'cal-grid-wrap';
    body.appendChild(gridWrap);

    // Day-of-week headers
    const dowRow = document.createElement('div');
    dowRow.className = 'cal-dow-row';
    DAYS.forEach(d => {
      const cell = document.createElement('div');
      cell.className = 'cal-dow';
      cell.textContent = d;
      dowRow.appendChild(cell);
    });
    gridWrap.appendChild(dowRow);

    // Calculate grid
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay  = new Date(viewYear, viewMonth + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
    const daysInMonth = lastDay.getDate();

    // Build event map: date key → events
    const eventMap = new Map<string, DiaryEvent[]>();
    for (const ev of data.events) {
      const [y, m, d] = ymd(ev.timestamp);
      const key = `${y}-${m}-${d}`;
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key)!.push(ev);
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    const grid = document.createElement('div');
    grid.className = 'cal-grid';

    // Filler cells before month start
    for (let i = 0; i < startDow; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell cal-cell--filler';
      grid.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${viewYear}-${viewMonth}-${day}`;
      const events = eventMap.get(key) || [];
      const isToday = key === todayKey;
      const isSelected = selectedDay
        && selectedDay[0] === viewYear
        && selectedDay[1] === viewMonth
        && selectedDay[2] === day;

      const cell = document.createElement('div');
      cell.className = 'cal-cell' +
        (isToday ? ' cal-cell--today' : '') +
        (isSelected ? ' cal-cell--selected' : '');

      const num = document.createElement('span');
      num.className = 'cal-day-num';
      num.textContent = String(day);
      cell.appendChild(num);

      if (events.length > 0) {
        const dots = document.createElement('div');
        dots.className = 'cal-dots';
        events.slice(0, 4).forEach(ev => {
          const dot = document.createElement('span');
          dot.className = 'cal-dot';
          dot.style.background = ev.color;
          dots.appendChild(dot);
        });
        if (events.length > 4) {
          const more = document.createElement('span');
          more.className = 'cal-dot-more';
          more.textContent = `+${events.length - 4}`;
          dots.appendChild(more);
        }
        cell.appendChild(dots);
      }

      cell.addEventListener('click', () => {
        selectedDay = [viewYear, viewMonth, day];
        render();
      });

      grid.appendChild(cell);
    }
    gridWrap.appendChild(grid);

    // ── Side panel ───────────────────────────────────────────────────────────
    if (selectedDay) {
      const [sy, sm, sd] = selectedDay;
      const key = `${sy}-${sm}-${sd}`;
      const dayEvents = (eventMap.get(key) || []).sort((a, b) => a.timestamp - b.timestamp);

      const panel = document.createElement('div');
      panel.className = 'cal-panel';
      body.appendChild(panel);

      const panelTitle = document.createElement('div');
      panelTitle.className = 'cal-panel-title';
      panelTitle.textContent = `${MONTHS[sm]} ${sd}, ${sy}`;
      panel.appendChild(panelTitle);

      // Existing events
      const eventList = document.createElement('div');
      eventList.className = 'cal-event-list';
      panel.appendChild(eventList);

      function renderEventList() {
        eventList.innerHTML = '';
        if (dayEvents.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'cal-empty';
          empty.textContent = 'No events';
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
          del.title = 'Delete event';
          del.onclick = () => {
            const idx = data.events.indexOf(ev);
            if (idx >= 0) {
              data.events.splice(idx, 1);
              dayEvents.splice(dayEvents.indexOf(ev), 1);
              scheduleSave();
              renderEventList();
            }
          };

          row.appendChild(dot);
          row.appendChild(info);
          row.appendChild(del);
          eventList.appendChild(row);
        });
      }
      renderEventList();

      // Add event form
      const form = document.createElement('div');
      form.className = 'cal-add-form';
      form.innerHTML = `
        <div class="cal-form-title">Add event</div>
        <input class="cal-input" id="ev-title" type="text" placeholder="Event title" maxlength="80" />
        <div class="cal-form-row">
          <input class="cal-input cal-input--time" id="ev-time" type="time" value="${
            String(new Date().getHours()).padStart(2,'0') + ':' + String(new Date().getMinutes()).padStart(2,'0')
          }" />
          <div class="cal-colors" id="ev-colors"></div>
        </div>
        <button class="cal-add-btn" id="ev-add">Add event</button>
      `;
      panel.appendChild(form);

      let selectedColor = DEFAULT_COLORS[0];
      const colorPicker = form.querySelector<HTMLElement>('#ev-colors')!;
      DEFAULT_COLORS.forEach((c, i) => {
        const swatch = document.createElement('button');
        swatch.className = 'cal-swatch' + (i === 0 ? ' active' : '');
        swatch.style.background = c;
        swatch.onclick = () => {
          colorPicker.querySelectorAll('.cal-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          selectedColor = c;
        };
        colorPicker.appendChild(swatch);
      });

      const addBtn = form.querySelector<HTMLButtonElement>('#ev-add')!;
      const titleInput = form.querySelector<HTMLInputElement>('#ev-title')!;
      const timeInput  = form.querySelector<HTMLInputElement>('#ev-time')!;

      addBtn.addEventListener('click', () => {
        const title = titleInput.value.trim();
        if (!title) { titleInput.focus(); return; }

        const [hours, minutes] = timeInput.value.split(':').map(Number);
        const ts = Math.floor(new Date(sy, sm, sd, hours || 0, minutes || 0).getTime() / 1000);

        const ev: DiaryEvent = { id: nanoid(), title, timestamp: ts, color: selectedColor };
        data.events.push(ev);
        dayEvents.push(ev);
        dayEvents.sort((a, b) => a.timestamp - b.timestamp);
        scheduleSave();

        titleInput.value = '';
        renderEventList();
        titleInput.focus();
      });

      titleInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBtn.click();
      });
    }
  }

  render();
}
