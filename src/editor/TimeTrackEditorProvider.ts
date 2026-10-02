import * as vscode from 'vscode';
import * as path from 'path';
import { parseTimesheet, TimesheetData } from '../models/timesheet';
import { exportToCSV, exportToHTML, exportToMarkdown } from '../export/exporter';

export class TimeTrackEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'timetrack.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TimeTrackEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(TimeTrackEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: false
    });
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'dist'))
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let isInternalUpdate = false;

    const updateWebview = () => {
      const text = document.getText();
      const { data } = parseTimesheet(text);

      if (!data.profile) {
        const savedProfile = this.context.globalState.get<any>('timetracker.freelancerProfile');
        if (savedProfile) {
          data.profile = savedProfile;
        }
      }

      webviewPanel.webview.postMessage({
        type: 'update',
        data
      });
    };

    // Listen for changes in the text document (e.g. undo/redo or external edits)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        if (!isInternalUpdate) {
          updateWebview();
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // Handle messages received from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          updateWebview();
          break;

        case 'save': {
          const newData: TimesheetData = message.data;
          if (newData.profile) {
            await this.context.globalState.update('timetracker.freelancerProfile', newData.profile);
          }
          const formatted = JSON.stringify(newData, null, 2);
          isInternalUpdate = true;
          await this.updateTextDocument(document, formatted);
          isInternalUpdate = false;
          break;
        }

        case 'export': {
          await this.handleExport(document, message.format);
          break;
        }
      }
    });
  }

  private async updateTextDocument(document: vscode.TextDocument, content: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, content);
    await vscode.workspace.applyEdit(edit);
  }

  private async handleExport(document: vscode.TextDocument, format: 'md' | 'csv' | 'html'): Promise<void> {
    const { data } = parseTimesheet(document.getText());
    const docPath = document.uri.fsPath;
    const dir = path.dirname(docPath);
    const baseName = path.basename(docPath, path.extname(docPath));

    let content = '';
    let ext = '';
    let filterName = '';

    switch (format) {
      case 'md':
        content = exportToMarkdown(data);
        ext = '.md';
        filterName = 'Markdown Files';
        break;
      case 'csv':
        content = exportToCSV(data);
        ext = '.csv';
        filterName = 'CSV Files';
        break;
      case 'html':
        content = exportToHTML(data);
        ext = '.html';
        filterName = 'HTML Invoice';
        break;
    }

    const defaultUri = vscode.Uri.file(path.join(dir, `${baseName}-invoice${ext}`));
    const targetUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { [filterName]: [ext.replace('.', '')] }
    });

    if (targetUri) {
      await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
      const openChoice = await vscode.window.showInformationMessage(
        `Exported invoice to ${path.basename(targetUri.fsPath)}`,
        'Open File'
      );
      if (openChoice === 'Open File') {
        if (format === 'html') {
          await vscode.env.openExternal(targetUri);
        } else {
          const doc = await vscode.workspace.openTextDocument(targetUri);
          await vscode.window.showTextDocument(doc);
        }
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview.css'))
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Time Tracker</title>
</head>
<body>
  <!-- Header -->
  <header class="app-header">
    <div class="header-info">
      <h1 id="header-project-title">Timesheet</h1>
      <div class="meta-row">
        <span id="header-client-name">Loading...</span>
        <span id="header-rate">Rate: —</span>
      </div>
    </div>
    <div class="header-actions">
      <button id="btn-profile" class="btn btn-secondary">🏢 Factuurprofiel</button>
      <button id="btn-settings" class="btn btn-secondary">⚙️ Settings</button>
      <button id="btn-export" class="btn btn-secondary">📄 Export Invoice</button>
      <button id="btn-add-entry" class="btn">➕ Add Entry</button>
    </div>
  </header>

  <!-- Metric Summary Cards -->
  <section class="summary-grid">
    <div class="card" id="metric-total-hours">
      <div class="card-title">Total Hours</div>
      <div class="card-value">0h</div>
      <div class="card-sub">0m</div>
    </div>
    <div class="card" id="metric-billable-hours">
      <div class="card-title">Billable Hours</div>
      <div class="card-value">0h</div>
      <div class="card-sub">0%</div>
    </div>
    <div class="card highlight" id="metric-total-amount">
      <div class="card-title">Total Billable</div>
      <div class="card-value">0.00</div>
      <div class="card-sub">0 hrs</div>
    </div>
    <div class="card" id="metric-unbilled-amount">
      <div class="card-title">Pending Unbilled</div>
      <div class="card-value">0.00</div>
      <div class="card-sub">0 hrs</div>
    </div>
  </section>

  <!-- Toolbar with Filters & Search -->
  <div class="toolbar">
    <div class="filters-group">
      <button class="filter-chip active" data-filter="all">All</button>
      <button class="filter-chip" data-filter="unbilled">Unbilled</button>
      <button class="filter-chip" data-filter="invoiced">Invoiced</button>
      <button class="filter-chip" data-filter="billable">Billable Only</button>
    </div>
    <div>
      <input type="text" id="search-input" class="search-input" placeholder="Search entries, categories, tags...">
    </div>
  </div>

  <!-- Entries Table -->
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Category</th>
          <th>Description</th>
          <th>Time Range</th>
          <th>Duration</th>
          <th>Amount</th>
          <th>Status</th>
          <th class="actions-col">Actions</th>
        </tr>
      </thead>
      <tbody id="entries-tbody">
      </tbody>
    </table>
    <div id="empty-state" class="empty-state">
      <p>No time entries found.</p>
    </div>
  </div>

  <!-- Entry Modal (Add / Edit) -->
  <div class="modal-overlay" id="entry-modal">
    <div class="modal">
      <div class="modal-header">
        <h2 id="modal-entry-title">Add Time Entry</h2>
        <button class="close-btn modal-close">&times;</button>
      </div>
      <form id="entry-form" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label for="entry-date">Date</label>
            <input type="date" id="entry-date" required>
          </div>
          <div class="form-group">
            <label for="entry-category">Category / Tag</label>
            <input type="text" id="entry-category" placeholder="e.g. Development, Meeting, Bugfix">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="entry-start">Start Time (Optional)</label>
            <input type="time" id="entry-start">
          </div>
          <div class="form-group">
            <label for="entry-end">End Time (Optional)</label>
            <input type="time" id="entry-end">
          </div>
          <div class="form-group">
            <label for="entry-duration">Duration (Hours) *</label>
            <input type="number" id="entry-duration" step="any" min="0" required>
          </div>
        </div>

        <div class="form-group">
          <label for="entry-desc">Description of Work *</label>
          <textarea id="entry-desc" rows="3" placeholder="What tasks or features were completed?" required></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="entry-billable" checked>
              Billable to customer
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="entry-invoiced">
              Already invoiced
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="entry-invnumber">Invoice Reference / Number (Optional)</label>
          <input type="text" id="entry-invnumber" placeholder="e.g. INV-2026-001">
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn">Save Entry</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Project Settings Modal -->
  <div class="modal-overlay" id="settings-modal">
    <div class="modal">
      <div class="modal-header">
        <h2>Project & Invoicing Settings</h2>
        <button class="close-btn modal-close">&times;</button>
      </div>
      <form id="settings-form" novalidate>
        <div class="form-group">
          <label for="settings-project">Project Name *</label>
          <input type="text" id="settings-project" required>
        </div>
        <div class="form-group">
          <label for="settings-client">Customer / Client Name</label>
          <input type="text" id="settings-client" placeholder="e.g. Acme Corp">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="settings-rate">Hourly Rate *</label>
            <input type="number" id="settings-rate" step="any" min="0" required>
          </div>
          <div class="form-group">
            <label for="settings-currency">Currency Code</label>
            <input type="text" id="settings-currency" placeholder="USD, EUR, GBP" required>
          </div>
        </div>
        <div class="form-group">
          <label for="settings-notes">Invoice Notes / Terms</label>
          <textarea id="settings-notes" rows="3" placeholder="Payment terms, bank details, or project scope notes..."></textarea>
        </div>

        <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-color);">
          <label style="font-weight: 600; margin-bottom: 8px;">⏱️ Slimme Afronding (Billing Rules)</label>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="settings-rounding-enabled">
              Automatische uren-afronding toepassen
            </label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="settings-rounding-interval">Afronden op</label>
              <select id="settings-rounding-interval">
                <option value="15m">15 minuten (0.25u) - Aanbevolen</option>
                <option value="30m">30 minuten (0.5u)</option>
                <option value="6m">6 minuten (0.1u)</option>
                <option value="5m">5 minuten (0.08u)</option>
                <option value="1h">1 heel uur (1.0u)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="settings-rounding-direction">Methode</label>
              <select id="settings-rounding-direction">
                <option value="up">Altijd naar boven afronden (Ceil)</option>
                <option value="nearest">Naar dichtstbijzijnde afronden</option>
              </select>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn">Save Settings</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Freelancer Profile Modal -->
  <div class="modal-overlay" id="profile-modal">
    <div class="modal" style="max-width: 580px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>🏢 Freelancer Factuurprofiel</h2>
        <button class="close-btn modal-close">&times;</button>
      </div>
      <p style="color: var(--text-muted); margin-bottom: 16px;">
        Stel je bedrijfslogo en factuurgegevens in. Deze worden automatisch op je geëxporteerde facturen geplaatst.
      </p>
      <form id="profile-form" novalidate>
        <!-- Logo Section -->
        <div class="form-group" style="background: var(--vscode-editor-background); padding: 12px; border-radius: 6px; border: 1px dashed var(--border-color); margin-bottom: 16px;">
          <label style="font-weight: 600;">Bedrijfslogo</label>
          <div style="display: flex; gap: 16px; align-items: center; margin-top: 8px;">
            <div id="profile-logo-container" style="width: 80px; height: 50px; background: #fff; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border-color);">
              <img id="profile-logo-img" src="" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain; display: none;">
              <span id="profile-logo-empty" style="color: #999; font-size: 11px;">Geen logo</span>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
              <input type="file" id="profile-logo-file" accept="image/*" style="font-size: 11px;">
              <button type="button" id="btn-remove-logo" class="btn btn-secondary btn-icon" style="align-self: flex-start; display: none;">Logo verwijderen</button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="profile-bizname">Bedrijfsnaam *</label>
            <input type="text" id="profile-bizname" placeholder="bijv. Daniel Software Development" required>
          </div>
          <div class="form-group">
            <label for="profile-fullname">Jouw Naam</label>
            <input type="text" id="profile-fullname" placeholder="bijv. Daniel D.">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="profile-email">E-mailadres</label>
            <input type="text" id="profile-email" placeholder="facturatie@bedrijf.nl">
          </div>
          <div class="form-group">
            <label for="profile-phone">Telefoonnummer</label>
            <input type="text" id="profile-phone" placeholder="+31 6 12345678">
          </div>
        </div>

        <div class="form-group">
          <label for="profile-address">Adres & Vestiging</label>
          <textarea id="profile-address" rows="2" placeholder="Straatnaam 123&#10;1234 AB Amsterdam, Nederland"></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="profile-kvk">KvK-nummer</label>
            <input type="text" id="profile-kvk" placeholder="12345678">
          </div>
          <div class="form-group">
            <label for="profile-vat">BTW-identificatienummer</label>
            <input type="text" id="profile-vat" placeholder="NL123456789B01">
          </div>
          <div class="form-group" style="max-width: 110px;">
            <label for="profile-vatrate">BTW %</label>
            <input type="number" id="profile-vatrate" step="1" min="0" value="21">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="profile-iban">IBAN Rekeningnummer</label>
            <input type="text" id="profile-iban" placeholder="NL99 BANK 0123 4567 89">
          </div>
          <div class="form-group" style="max-width: 140px;">
            <label for="profile-bic">BIC / Swift (Optioneel)</label>
            <input type="text" id="profile-bic" placeholder="BANKNL2A">
          </div>
          <div class="form-group" style="max-width: 120px;">
            <label for="profile-paydays">Betaaltermijn (Dagen)</label>
            <input type="number" id="profile-paydays" min="1" value="14">
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-close">Annuleren</button>
          <button type="submit" class="btn">Profiel Opslaan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Export Invoice Modal -->
  <div class="modal-overlay" id="export-modal">
    <div class="modal">
      <div class="modal-header">
        <h2>Export Timesheet / Invoice</h2>
        <button class="close-btn modal-close">&times;</button>
      </div>
      <p style="color: var(--text-muted); margin-bottom: 20px;">
        Choose the format to export your logged hours, billing breakdown, and customer invoice summary:
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button id="btn-export-html" class="btn" style="justify-content: flex-start;">
          🌐 <strong>HTML Invoice</strong> &mdash; Printable, ready-to-bill invoice with professional styling
        </button>
        <button id="btn-export-md" class="btn btn-secondary" style="justify-content: flex-start;">
          📝 <strong>Markdown Report</strong> &mdash; Structured table format for PRs, issues, or email
        </button>
        <button id="btn-export-csv" class="btn btn-secondary" style="justify-content: flex-start;">
          📊 <strong>CSV Spreadsheet</strong> &mdash; Compatible with Excel, Numbers, and accounting software
        </button>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-close">Close</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
