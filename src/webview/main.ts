// Declare VS Code API interface
declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

interface TimeEntry {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationHours: number;
  category?: string;
  description: string;
  billable: boolean;
  invoiced: boolean;
  invoiceNumber?: string;
}

interface TimesheetData {
  $schema?: string;
  version: string;
  project: string;
  client?: string;
  currency: string;
  hourlyRate: number;
  notes?: string;
  entries: TimeEntry[];
}

const vscode = acquireVsCodeApi();

let timesheet: TimesheetData = {
  version: '1.0',
  project: 'Loading...',
  client: '',
  currency: 'USD',
  hourlyRate: 75,
  entries: []
};

let currentFilter: 'all' | 'unbilled' | 'invoiced' | 'billable' = 'all';
let searchQuery = '';
let editingEntryId: string | null = null;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();

  // Notify extension that webview is ready to receive data
  vscode.postMessage({ type: 'ready' });
});

// Handle messages from the extension host
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'update':
      if (message.data) {
        timesheet = message.data;
        render();
      }
      break;
  }
});

function setupEventListeners() {
  // Add Entry Button
  document.getElementById('btn-add-entry')?.addEventListener('click', () => {
    openEntryModal();
  });

  // Settings Button
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    openSettingsModal();
  });

  // Export Button
  document.getElementById('btn-export')?.addEventListener('click', () => {
    openExportModal();
  });

  // Search input
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
    renderTable();
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      const target = e.currentTarget as HTMLElement;
      target.classList.add('active');
      currentFilter = (target.dataset.filter || 'all') as any;
      renderTable();
    });
  });

  // Entry Form Auto-Calculation from Start/End time
  const startTimeInput = document.getElementById('entry-start') as HTMLInputElement;
  const endTimeInput = document.getElementById('entry-end') as HTMLInputElement;
  const durationInput = document.getElementById('entry-duration') as HTMLInputElement;

  const updateCalculatedDuration = () => {
    const s = startTimeInput?.value;
    const e = endTimeInput?.value;
    if (s && e) {
      const [sh, sm] = s.split(':').map(Number);
      let [eh, em] = e.split(':').map(Number);
      if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff < 0) {
          diff += 24 * 60;
        }
        if (diff > 0) {
          durationInput.value = (Math.round((diff / 60) * 100) / 100).toString();
        }
      }
    }
  };

  startTimeInput?.addEventListener('change', updateCalculatedDuration);
  endTimeInput?.addEventListener('change', updateCalculatedDuration);
  startTimeInput?.addEventListener('input', updateCalculatedDuration);
  endTimeInput?.addEventListener('input', updateCalculatedDuration);

  // Auto-complete time (e.g. 10:-- -> 10:00) when pressing Tab or blurring
  function attachTimeInputAutoFormat(
    input: HTMLInputElement,
    nextInputId?: string,
    prevInputId?: string
  ) {
    let hourBuffer = '';
    let minuteBuffer = '';
    let activeSection: 'hour' | 'minute' = 'hour';

    const syncFromValue = () => {
      if (input.value && input.value.includes(':')) {
        const parts = input.value.split(':');
        hourBuffer = parts[0];
        minuteBuffer = parts[1];
      } else {
        hourBuffer = '';
        minuteBuffer = '';
      }
      activeSection = 'hour';
    };

    input.addEventListener('focus', syncFromValue);

    const applyAutoCompletion = (shouldNavigateNext = false, shouldNavigatePrev = false) => {
      if (input.value && input.value.includes(':') && input.value.length === 5) {
        if (shouldNavigateNext && nextInputId) {
          document.getElementById(nextInputId)?.focus();
        } else if (shouldNavigatePrev && prevInputId) {
          document.getElementById(prevInputId)?.focus();
        }
        return;
      }

      if (hourBuffer !== '') {
        const h = parseInt(hourBuffer, 10);
        if (!isNaN(h) && h >= 0 && h <= 23) {
          const formattedHour = String(h).padStart(2, '0');
          let formattedMinute = '00';
          if (minuteBuffer.length === 1) {
            formattedMinute = minuteBuffer + '0';
          } else if (minuteBuffer.length >= 2) {
            const m = parseInt(minuteBuffer.slice(0, 2), 10);
            if (!isNaN(m) && m >= 0 && m <= 59) {
              formattedMinute = String(m).padStart(2, '0');
            }
          }

          const formatted = `${formattedHour}:${formattedMinute}`;
          input.value = formatted;
          hourBuffer = formattedHour;
          minuteBuffer = formattedMinute;

          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      if (shouldNavigateNext && nextInputId) {
        document.getElementById(nextInputId)?.focus();
      } else if (shouldNavigatePrev && prevInputId) {
        document.getElementById(prevInputId)?.focus();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key >= '0' && e.key <= '9') {
        if (activeSection === 'hour') {
          if (hourBuffer.length >= 2) {
            hourBuffer = e.key;
          } else {
            hourBuffer += e.key;
          }

          if (hourBuffer.length === 2 || parseInt(hourBuffer, 10) > 2) {
            activeSection = 'minute';
            minuteBuffer = '';
          }
        } else {
          if (minuteBuffer.length >= 2) {
            minuteBuffer = e.key;
          } else {
            minuteBuffer += e.key;
          }
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (activeSection === 'minute') {
          if (minuteBuffer.length > 0) {
            minuteBuffer = minuteBuffer.slice(0, -1);
          } else {
            activeSection = 'hour';
            minuteBuffer = '';
          }
        } else {
          hourBuffer = hourBuffer.slice(0, -1);
        }
      } else if (e.key === ':' || e.key === 'ArrowRight') {
        activeSection = 'minute';
      } else if (e.key === 'ArrowLeft') {
        activeSection = 'hour';
      } else if (e.key === 'Tab') {
        if (!e.shiftKey) {
          if (hourBuffer !== '' && (minuteBuffer === '' || input.value === '')) {
            e.preventDefault();
            applyAutoCompletion(true, false);
          }
        } else {
          if (hourBuffer !== '' && input.value === '') {
            e.preventDefault();
            applyAutoCompletion(false, true);
          }
        }
      } else if (e.key === 'Enter') {
        if (hourBuffer !== '' && (minuteBuffer === '' || input.value === '')) {
          applyAutoCompletion(false, false);
        }
      }
    });

    input.addEventListener('blur', () => {
      applyAutoCompletion(false, false);
    });
  }

  if (startTimeInput) {
    attachTimeInputAutoFormat(startTimeInput, 'entry-end', 'entry-category');
  }
  if (endTimeInput) {
    attachTimeInputAutoFormat(endTimeInput, 'entry-duration', 'entry-start');
  }

  // Entry Form Submit
  document.getElementById('entry-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveEntryFromModal();
  });

  // Settings Form Submit
  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettingsFromModal();
  });

  // Modal Closers
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Export buttons
  document.getElementById('btn-export-html')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'export', format: 'html' });
    closeAllModals();
  });
  document.getElementById('btn-export-md')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'export', format: 'md' });
    closeAllModals();
  });
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'export', format: 'csv' });
    closeAllModals();
  });
}

function render() {
  renderHeader();
  renderSummary();
  renderTable();
}

function renderHeader() {
  const titleEl = document.getElementById('header-project-title');
  if (titleEl) {
    titleEl.textContent = timesheet.project || 'Untitled Project';
  }

  const clientEl = document.getElementById('header-client-name');
  if (clientEl) {
    clientEl.textContent = timesheet.client ? `Client: ${timesheet.client}` : 'No Client Specified';
  }

  const rateEl = document.getElementById('header-rate');
  if (rateEl) {
    const rate = timesheet.hourlyRate || 0;
    const cur = timesheet.currency || 'USD';
    rateEl.textContent = `Rate: ${rate.toFixed(2)} ${cur}/h`;
  }
}

function renderSummary() {
  const rate = timesheet.hourlyRate || 0;
  const cur = timesheet.currency || 'USD';

  let totalHours = 0;
  let billableHours = 0;
  let unbilledHours = 0;
  let invoicedHours = 0;

  for (const entry of timesheet.entries) {
    const dur = entry.durationHours || 0;
    totalHours += dur;
    if (entry.billable) {
      billableHours += dur;
      if (entry.invoiced) {
        invoicedHours += dur;
      } else {
        unbilledHours += dur;
      }
    }
  }

  const totalAmount = billableHours * rate;
  const unbilledAmount = unbilledHours * rate;
  const invoicedAmount = invoicedHours * rate;

  setCard('metric-total-hours', `${totalHours.toFixed(2)} hrs`, formatHumanDuration(totalHours));
  setCard('metric-billable-hours', `${billableHours.toFixed(2)} hrs`, `${Math.round((billableHours / (totalHours || 1)) * 100)}% of total`);
  setCard('metric-total-amount', `${totalAmount.toFixed(2)} ${cur}`, `${billableHours.toFixed(2)} billable hrs`);
  setCard('metric-unbilled-amount', `${unbilledAmount.toFixed(2)} ${cur}`, `${unbilledHours.toFixed(2)} unbilled hrs`);
}

function setCard(id: string, value: string, sub: string) {
  const card = document.getElementById(id);
  if (!card) return;
  const valEl = card.querySelector('.card-value');
  const subEl = card.querySelector('.card-sub');
  if (valEl) valEl.textContent = value;
  if (subEl) subEl.textContent = sub;
}

function renderTable() {
  const tbody = document.getElementById('entries-tbody');
  const emptyState = document.getElementById('empty-state');
  if (!tbody || !emptyState) return;

  const rate = timesheet.hourlyRate || 0;
  const cur = timesheet.currency || 'USD';

  let filtered = timesheet.entries.filter(entry => {
    // Filter chip check
    if (currentFilter === 'unbilled' && (!entry.billable || entry.invoiced)) return false;
    if (currentFilter === 'invoiced' && !entry.invoiced) return false;
    if (currentFilter === 'billable' && !entry.billable) return false;

    // Search query check
    if (searchQuery) {
      const q = searchQuery;
      const matchDesc = entry.description.toLowerCase().includes(q);
      const matchCat = (entry.category || '').toLowerCase().includes(q);
      const matchDate = entry.date.toLowerCase().includes(q);
      const matchInv = (entry.invoiceNumber || '').toLowerCase().includes(q);
      return matchDesc || matchCat || matchDate || matchInv;
    }

    return true;
  });

  // Sort descending by date, then id
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';

    for (const entry of filtered) {
      const tr = document.createElement('tr');

      const timeRange = (entry.startTime || entry.endTime)
        ? `${entry.startTime || ''} - ${entry.endTime || ''}`
        : '—';

      const lineTotal = entry.billable ? `${(entry.durationHours * rate).toFixed(2)} ${cur}` : '—';

      const billableBadge = entry.billable
        ? `<span class="badge badge-unbilled billable-toggle" data-id="${entry.id}" title="Click to toggle billable">Billable</span>`
        : `<span class="badge badge-nonbillable billable-toggle" data-id="${entry.id}" title="Click to toggle billable">Non-Billable</span>`;

      const invoicedBadge = entry.invoiced
        ? `<span class="badge badge-invoiced invoiced-toggle" data-id="${entry.id}" title="Click to toggle invoiced status">Invoiced</span>`
        : `<span class="badge badge-unbilled invoiced-toggle" data-id="${entry.id}" title="Click to toggle invoiced status">Pending</span>`;

      tr.innerHTML = `
        <td><strong>${escapeHtml(entry.date)}</strong></td>
        <td><span class="badge-cat">${escapeHtml(entry.category || 'General')}</span></td>
        <td style="max-width: 320px;">
          <div>${escapeHtml(entry.description)}</div>
          ${entry.invoiceNumber ? `<small style="color:var(--text-muted)">Invoice: ${escapeHtml(entry.invoiceNumber)}</small>` : ''}
        </td>
        <td><small style="color:var(--text-muted)">${escapeHtml(timeRange)}</small></td>
        <td><strong>${entry.durationHours}h</strong> <small style="color:var(--text-muted)">(${formatHumanDuration(entry.durationHours)})</small></td>
        <td><strong>${lineTotal}</strong></td>
        <td>${entry.billable ? invoicedBadge : billableBadge}</td>
        <td class="actions-col">
          <button class="btn btn-secondary btn-icon btn-edit" data-id="${entry.id}" title="Edit Entry">✏️ Edit</button>
          <button class="btn btn-secondary btn-icon btn-danger btn-delete" data-id="${entry.id}" title="Delete Entry">🗑️</button>
        </td>
      `;

      tbody.appendChild(tr);
    }

    // Attach click events on table rows
    tbody.querySelectorAll('.invoiced-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        toggleInvoiced(id!);
      });
    });

    tbody.querySelectorAll('.billable-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        toggleBillable(id!);
      });
    });

    tbody.querySelectorAll('.btn-edit').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        const entry = timesheet.entries.find(x => x.id === id);
        if (entry) {
          openEntryModal(entry);
        }
      });
    });

    tbody.querySelectorAll('.btn-delete').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        deleteEntry(id!);
      });
    });
  }
}

function openEntryModal(entry?: TimeEntry) {
  const modal = document.getElementById('entry-modal');
  const title = document.getElementById('modal-entry-title');
  if (!modal || !title) return;

  editingEntryId = entry ? entry.id : null;
  title.textContent = entry ? 'Edit Time Entry' : 'Add Time Entry';

  const dateInput = document.getElementById('entry-date') as HTMLInputElement;
  const startInput = document.getElementById('entry-start') as HTMLInputElement;
  const endInput = document.getElementById('entry-end') as HTMLInputElement;
  const durationInput = document.getElementById('entry-duration') as HTMLInputElement;
  const categoryInput = document.getElementById('entry-category') as HTMLInputElement;
  const descInput = document.getElementById('entry-desc') as HTMLTextAreaElement;
  const billableInput = document.getElementById('entry-billable') as HTMLInputElement;
  const invoicedInput = document.getElementById('entry-invoiced') as HTMLInputElement;
  const invNumberInput = document.getElementById('entry-invnumber') as HTMLInputElement;

  if (entry) {
    dateInput.value = entry.date;
    startInput.value = entry.startTime || '';
    endInput.value = entry.endTime || '';
    durationInput.value = entry.durationHours.toString();
    categoryInput.value = entry.category || 'Development';
    descInput.value = entry.description;
    billableInput.checked = entry.billable;
    invoicedInput.checked = entry.invoiced;
    invNumberInput.value = entry.invoiceNumber || '';
  } else {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    startInput.value = '';
    endInput.value = '';
    durationInput.value = '1.0';
    categoryInput.value = 'Development';
    descInput.value = '';
    billableInput.checked = true;
    invoicedInput.checked = false;
    invNumberInput.value = '';
  }

  modal.classList.add('open');
}

function saveEntryFromModal() {
  const dateInput = document.getElementById('entry-date') as HTMLInputElement;
  const startInput = document.getElementById('entry-start') as HTMLInputElement;
  const endInput = document.getElementById('entry-end') as HTMLInputElement;
  const durationInput = document.getElementById('entry-duration') as HTMLInputElement;
  const categoryInput = document.getElementById('entry-category') as HTMLInputElement;
  const descInput = document.getElementById('entry-desc') as HTMLTextAreaElement;
  const billableInput = document.getElementById('entry-billable') as HTMLInputElement;
  const invoicedInput = document.getElementById('entry-invoiced') as HTMLInputElement;
  const invNumberInput = document.getElementById('entry-invnumber') as HTMLInputElement;

  const durationVal = parseFloat(durationInput.value) || 0;
  if (durationVal <= 0) {
    alert('Duration must be greater than 0');
    return;
  }

  if (editingEntryId) {
    // Update existing
    const idx = timesheet.entries.findIndex(e => e.id === editingEntryId);
    if (idx !== -1) {
      timesheet.entries[idx] = {
        ...timesheet.entries[idx],
        date: dateInput.value,
        startTime: startInput.value || undefined,
        endTime: endInput.value || undefined,
        durationHours: durationVal,
        category: categoryInput.value.trim() || 'General',
        description: descInput.value.trim(),
        billable: billableInput.checked,
        invoiced: invoicedInput.checked,
        invoiceNumber: invNumberInput.value.trim() || undefined
      };
    }
  } else {
    // Add new
    const newEntry: TimeEntry = {
      id: `tt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      date: dateInput.value,
      startTime: startInput.value || undefined,
      endTime: endInput.value || undefined,
      durationHours: durationVal,
      category: categoryInput.value.trim() || 'General',
      description: descInput.value.trim(),
      billable: billableInput.checked,
      invoiced: invoicedInput.checked,
      invoiceNumber: invNumberInput.value.trim() || undefined
    };
    timesheet.entries.push(newEntry);
  }

  closeAllModals();
  commitChanges();
}

function deleteEntry(id: string) {
  timesheet.entries = timesheet.entries.filter(e => e.id !== id);
  commitChanges();
}

function toggleInvoiced(id: string) {
  const entry = timesheet.entries.find(e => e.id === id);
  if (entry) {
    entry.invoiced = !entry.invoiced;
    commitChanges();
  }
}

function toggleBillable(id: string) {
  const entry = timesheet.entries.find(e => e.id === id);
  if (entry) {
    entry.billable = !entry.billable;
    commitChanges();
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const projectInput = document.getElementById('settings-project') as HTMLInputElement;
  const clientInput = document.getElementById('settings-client') as HTMLInputElement;
  const rateInput = document.getElementById('settings-rate') as HTMLInputElement;
  const currencyInput = document.getElementById('settings-currency') as HTMLInputElement;
  const notesInput = document.getElementById('settings-notes') as HTMLTextAreaElement;

  projectInput.value = timesheet.project || '';
  clientInput.value = timesheet.client || '';
  rateInput.value = (timesheet.hourlyRate || 0).toString();
  currencyInput.value = timesheet.currency || 'USD';
  notesInput.value = timesheet.notes || '';

  modal.classList.add('open');
}

function saveSettingsFromModal() {
  const projectInput = document.getElementById('settings-project') as HTMLInputElement;
  const clientInput = document.getElementById('settings-client') as HTMLInputElement;
  const rateInput = document.getElementById('settings-rate') as HTMLInputElement;
  const currencyInput = document.getElementById('settings-currency') as HTMLInputElement;
  const notesInput = document.getElementById('settings-notes') as HTMLTextAreaElement;

  timesheet.project = projectInput.value.trim() || 'Untitled Project';
  timesheet.client = clientInput.value.trim();
  timesheet.hourlyRate = parseFloat(rateInput.value) || 0;
  timesheet.currency = currencyInput.value.trim().toUpperCase() || 'USD';
  timesheet.notes = notesInput.value.trim();

  closeAllModals();
  commitChanges();
}

function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) {
    modal.classList.add('open');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('open');
  });
  editingEntryId = null;
}

function commitChanges() {
  render();
  vscode.postMessage({
    type: 'save',
    data: timesheet
  });
}

function formatHumanDuration(hours: number): string {
  if (isNaN(hours) || hours <= 0) return '0m';
  const totalM = Math.round(hours * 60);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
