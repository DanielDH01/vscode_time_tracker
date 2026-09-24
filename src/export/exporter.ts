import { TimesheetData, computeSummary, formatDuration } from '../models/timesheet';

export function exportToMarkdown(data: TimesheetData): string {
  const summary = computeSummary(data);
  const currency = data.currency || 'USD';
  const rate = data.hourlyRate || 0;

  const lines: string[] = [];
  lines.push(`# Timesheet & Invoice Report: ${data.project}`);
  if (data.client) {
    lines.push(`**Client:** ${data.client}`);
  }
  lines.push(`**Hourly Rate:** ${rate.toFixed(2)} ${currency}/h`);
  lines.push(`**Generated:** ${new Date().toLocaleDateString()}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('| Metric | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Total Time** | ${formatDuration(summary.totalHours)} (${summary.totalHours} hrs) |`);
  lines.push(`| **Billable Time** | ${formatDuration(summary.billableHours)} (${summary.billableHours} hrs) |`);
  lines.push(`| **Non-Billable Time** | ${formatDuration(summary.nonBillableHours)} (${summary.nonBillableHours} hrs) |`);
  lines.push(`| **Total Billable Amount** | **${summary.totalAmount.toFixed(2)} ${currency}** |`);
  lines.push(`| **Unbilled / Pending** | ${summary.unbilledAmount.toFixed(2)} ${currency} |`);
  lines.push(`| **Already Invoiced** | ${summary.invoicedAmount.toFixed(2)} ${currency} |`);
  lines.push('');

  if (data.notes) {
    lines.push('## Project Notes');
    lines.push(data.notes);
    lines.push('');
  }

  lines.push('## Detailed Entries');
  lines.push('| Date | Category | Description | Time Range | Duration | Rate | Amount | Status |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  const sortedEntries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));

  for (const e of sortedEntries) {
    const range = (e.startTime || e.endTime) ? `${e.startTime || ''} - ${e.endTime || ''}` : '-';
    const amount = e.billable ? `${(e.durationHours * rate).toFixed(2)} ${currency}` : 'Non-billable';
    const status = e.invoiced ? '✅ Invoiced' : (e.billable ? '⏳ Unbilled' : '⚪ Free');
    const safeDesc = e.description.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const safeCat = (e.category || 'General').replace(/\|/g, '\\|');

    lines.push(`| ${e.date} | ${safeCat} | ${safeDesc} | ${range} | ${e.durationHours}h (${formatDuration(e.durationHours)}) | ${rate.toFixed(2)} | ${amount} | ${status} |`);
  }

  lines.push('');
  return lines.join('\n');
}

export function exportToCSV(data: TimesheetData): string {
  const rate = data.hourlyRate || 0;
  const currency = data.currency || 'USD';

  const rows: string[][] = [
    ['Date', 'Category', 'Description', 'Start Time', 'End Time', 'Hours', 'Rate', 'Total (' + currency + ')', 'Billable', 'Invoiced', 'Invoice Ref']
  ];

  const sortedEntries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));

  for (const e of sortedEntries) {
    const total = e.billable ? (e.durationHours * rate).toFixed(2) : '0.00';
    rows.push([
      e.date,
      e.category || '',
      `"${e.description.replace(/"/g, '""')}"`,
      e.startTime || '',
      e.endTime || '',
      e.durationHours.toFixed(2),
      rate.toFixed(2),
      total,
      e.billable ? 'Yes' : 'No',
      e.invoiced ? 'Yes' : 'No',
      e.invoiceNumber || ''
    ]);
  }

  return rows.map(r => r.join(',')).join('\n');
}

export function exportToHTML(data: TimesheetData): string {
  const summary = computeSummary(data);
  const currency = data.currency || 'USD';
  const rate = data.hourlyRate || 0;
  const sortedEntries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice Timesheet - ${escapeHtml(data.project)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #333;
      background: #fdfdfd;
    }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #eaeaea;
      padding-bottom: 24px;
      margin-bottom: 30px;
    }
    .title h1 {
      margin: 0 0 6px 0;
      font-size: 26px;
      color: #111;
    }
    .title p {
      margin: 4px 0;
      color: #666;
    }
    .meta-box {
      text-align: right;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-billable { background: #e6f4ea; color: #137333; }
    .badge-invoiced { background: #e8f0fe; color: #1a73e8; }
    .badge-unbilled { background: #fef7e0; color: #b06000; }
    .badge-nonbillable { background: #f1f3f4; color: #5f6368; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .summary-card .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #718096;
      margin-bottom: 6px;
    }
    .summary-card .value {
      font-size: 22px;
      font-weight: 700;
      color: #1a202c;
    }
    .summary-card.highlight {
      border-left: 4px solid #3182ce;
      background: #ebf8ff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    th {
      background: #f7fafc;
      padding: 12px 14px;
      text-align: left;
      font-size: 13px;
      color: #4a5568;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #edf2f7;
      font-size: 13px;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .text-right {
      text-align: right;
    }
    .desc-cell {
      max-width: 400px;
      word-break: break-word;
    }
    .notes-box {
      background: #f7fafc;
      border-left: 4px solid #a0aec0;
      padding: 14px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #4a5568;
      white-space: pre-wrap;
    }
    .print-btn {
      display: inline-block;
      margin-bottom: 20px;
      padding: 8px 16px;
      background: #3182ce;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .print-btn { display: none; }
      .summary-card { box-shadow: none; border: 1px solid #ccc; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>

  <div class="header">
    <div class="title">
      <h1>${escapeHtml(data.project)}</h1>
      <p><strong>Customer:</strong> ${escapeHtml(data.client || 'N/A')}</p>
      <p><strong>Billing Rate:</strong> ${rate.toFixed(2)} ${currency}/hr</p>
    </div>
    <div class="meta-box">
      <h2>TIMESHEET INVOICE</h2>
      <p>Date: ${new Date().toLocaleDateString()}</p>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Total Hours</div>
      <div class="value">${summary.totalHours} hrs</div>
      <small style="color: #718096;">${formatDuration(summary.totalHours)}</small>
    </div>
    <div class="summary-card">
      <div class="label">Billable Hours</div>
      <div class="value">${summary.billableHours} hrs</div>
      <small style="color: #718096;">${formatDuration(summary.billableHours)}</small>
    </div>
    <div class="summary-card highlight">
      <div class="label">Total Billable Amount</div>
      <div class="value">${summary.totalAmount.toFixed(2)} ${currency}</div>
    </div>
    <div class="summary-card">
      <div class="label">Pending / Unbilled</div>
      <div class="value" style="color: #b06000;">${summary.unbilledAmount.toFixed(2)} ${currency}</div>
    </div>
  </div>

  ${data.notes ? `<h3>Notes</h3><div class="notes-box">${escapeHtml(data.notes)}</div>` : ''}

  <h3>Itemized Time Log</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Description</th>
        <th>Time</th>
        <th class="text-right">Hours</th>
        <th class="text-right">Amount</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${sortedEntries.map(e => {
        const time = (e.startTime || e.endTime) ? `${e.startTime || ''} - ${e.endTime || ''}` : '-';
        const amt = e.billable ? `${(e.durationHours * rate).toFixed(2)} ${currency}` : '-';
        const badge = e.invoiced
          ? '<span class="badge badge-invoiced">Invoiced</span>'
          : (e.billable ? '<span class="badge badge-unbilled">Unbilled</span>' : '<span class="badge badge-nonbillable">Non-billable</span>');

        return `
          <tr>
            <td><strong>${escapeHtml(e.date)}</strong></td>
            <td>${escapeHtml(e.category || 'General')}</td>
            <td class="desc-cell">${escapeHtml(e.description)}</td>
            <td><small>${escapeHtml(time)}</small></td>
            <td class="text-right"><strong>${e.durationHours}</strong></td>
            <td class="text-right">${amt}</td>
            <td>${badge}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  if (!text) {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
