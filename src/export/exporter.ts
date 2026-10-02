import { TimesheetData, computeSummary, formatDuration } from '../models/timesheet';

export function exportToMarkdown(data: TimesheetData): string {
  const summary = computeSummary(data);
  const currency = data.currency || 'USD';
  const rate = data.hourlyRate || 0;
  const profile = data.profile;

  const lines: string[] = [];
  lines.push(`# Timesheet & Invoice Report: ${data.project}`);
  if (profile?.businessName || profile?.fullName) {
    lines.push(`**From:** ${profile.businessName || profile.fullName}`);
    if (profile.vatNumber) lines.push(`**VAT / BTW:** ${profile.vatNumber}`);
    if (profile.kvkNumber) lines.push(`**KvK:** ${profile.kvkNumber}`);
    if (profile.iban) lines.push(`**IBAN:** ${profile.iban}`);
  }
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
  lines.push(`| **Subtotal (excl. VAT)** | **${summary.totalAmount.toFixed(2)} ${currency}** |`);
  if (summary.vatRate > 0) {
    lines.push(`| **VAT / BTW (${summary.vatRate}%)** | ${summary.vatAmount.toFixed(2)} ${currency} |`);
    lines.push(`| **Total (incl. VAT)** | **${summary.totalWithVat.toFixed(2)} ${currency}** |`);
  }
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
  const profile = data.profile;
  const sortedEntries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));

  const issueDate = new Date();
  const paymentDays = profile?.paymentTermsDays ?? 14;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + paymentDays);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${escapeHtml(data.project)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #333;
      background: #fdfdfd;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #eaeaea;
      padding-bottom: 24px;
      margin-bottom: 30px;
      flex-wrap: wrap;
      gap: 20px;
    }
    .company-logo {
      max-height: 70px;
      max-width: 220px;
      object-fit: contain;
      margin-bottom: 12px;
      display: block;
    }
    .business-info h2 {
      margin: 0 0 6px 0;
      font-size: 20px;
      color: #111;
    }
    .business-info p {
      margin: 2px 0;
      font-size: 13px;
      color: #555;
    }
    .invoice-meta-box {
      text-align: right;
      min-width: 220px;
    }
    .invoice-meta-box h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      color: #1a73e8;
      letter-spacing: 0.5px;
    }
    .invoice-meta-box p {
      margin: 3px 0;
      font-size: 13px;
      color: #555;
    }
    .client-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .client-card h3 {
      margin: 0 0 6px 0;
      font-size: 14px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .client-card .name {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .client-card p {
      margin: 2px 0;
      font-size: 13px;
      color: #475569;
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
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
      margin-bottom: 24px;
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

    /* Financial Total Box */
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    .totals-table {
      width: 320px;
      border-collapse: collapse;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .totals-table td {
      padding: 8px 14px;
      border-bottom: 1px solid #edf2f7;
    }
    .totals-table tr.grand-total td {
      font-size: 16px;
      font-weight: 700;
      background: #f8fafc;
      border-top: 2px solid #cbd5e1;
      color: #0f172a;
    }

    .payment-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 4px solid #22c55e;
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #166534;
    }
    .payment-box h4 {
      margin: 0 0 6px 0;
      font-size: 14px;
      color: #14532d;
    }
    .payment-box p {
      margin: 3px 0;
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
      padding: 10px 20px;
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }
    .print-btn:hover {
      background: #1557b0;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .print-btn { display: none; }
      .summary-card { box-shadow: none; border: 1px solid #ccc; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="header">
    <div class="business-info">
      ${profile?.logo ? `<img src="${profile.logo}" alt="Logo" class="company-logo">` : ''}
      <h2>${escapeHtml(profile?.businessName || profile?.fullName || 'Freelance Developer')}</h2>
      ${profile?.fullName && profile.businessName ? `<p><strong>Contact:</strong> ${escapeHtml(profile.fullName)}</p>` : ''}
      ${profile?.address ? `<p>${escapeHtml(profile.address).replace(/\n/g, '<br>')}</p>` : ''}
      ${profile?.email ? `<p>Email: ${escapeHtml(profile.email)}</p>` : ''}
      ${profile?.phone ? `<p>Phone: ${escapeHtml(profile.phone)}</p>` : ''}
      ${profile?.kvkNumber ? `<p>KvK: ${escapeHtml(profile.kvkNumber)}</p>` : ''}
      ${profile?.vatNumber ? `<p>BTW / VAT ID: ${escapeHtml(profile.vatNumber)}</p>` : ''}
    </div>

    <div class="invoice-meta-box">
      <h1>FACTUUR / INVOICE</h1>
      <p><strong>Date:</strong> ${issueDate.toLocaleDateString()}</p>
      <p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()} (${paymentDays} days)</p>
      <p><strong>Rate:</strong> ${rate.toFixed(2)} ${currency}/h</p>
    </div>
  </div>

  <div class="client-card">
    <h3>Bill To:</h3>
    <div class="name">${escapeHtml(data.client || 'Client Name')}</div>
    <p><strong>Project:</strong> ${escapeHtml(data.project)}</p>
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
    <div class="summary-card">
      <div class="label">Subtotal (excl. VAT)</div>
      <div class="value">${summary.totalAmount.toFixed(2)} ${currency}</div>
    </div>
    <div class="summary-card highlight">
      <div class="label">Total Due (incl. VAT)</div>
      <div class="value">${summary.totalWithVat.toFixed(2)} ${currency}</div>
    </div>
  </div>

  ${data.notes ? `<h3>Notes & Terms</h3><div class="notes-box">${escapeHtml(data.notes)}</div>` : ''}

  <h3>Itemized Time Log</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Description</th>
        <th>Time Range</th>
        <th class="text-right">Hours</th>
        <th class="text-right">Rate</th>
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
            <td class="text-right">${rate.toFixed(2)}</td>
            <td class="text-right"><strong>${amt}</strong></td>
            <td>${badge}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="totals-wrapper">
    <table class="totals-table">
      <tbody>
        <tr>
          <td>Subtotal (excl. BTW / VAT):</td>
          <td class="text-right">${summary.totalAmount.toFixed(2)} ${currency}</td>
        </tr>
        ${summary.vatRate > 0 ? `
          <tr>
            <td>BTW / VAT (${summary.vatRate}%):</td>
            <td class="text-right">${summary.vatAmount.toFixed(2)} ${currency}</td>
          </tr>
        ` : ''}
        <tr class="grand-total">
          <td>Total Amount Due:</td>
          <td class="text-right">${summary.totalWithVat.toFixed(2)} ${currency}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${profile?.iban ? `
    <div class="payment-box">
      <h4>Payment Instructions / Betaalgegevens</h4>
      <p>Please transfer the total amount of <strong>${summary.totalWithVat.toFixed(2)} ${currency}</strong> within <strong>${paymentDays} days</strong> (before ${dueDate.toLocaleDateString()}).</p>
      <p><strong>Bank (IBAN):</strong> ${escapeHtml(profile.iban)} ${profile.bic ? `(BIC: ${escapeHtml(profile.bic)})` : ''}</p>
      <p><strong>Account Holder:</strong> ${escapeHtml(profile.businessName || profile.fullName || '')}</p>
      <p><strong>Reference:</strong> ${escapeHtml(data.project)} - Invoice ${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}</p>
    </div>
  ` : ''}
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
