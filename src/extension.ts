import * as vscode from 'vscode';
import * as path from 'path';
import { TimeTrackEditorProvider } from './editor/TimeTrackEditorProvider';
import { TimerController } from './timer/TimerController';
import {
  createEmptyTimesheet,
  generateEntryId,
  getTodayDateString,
  getCurrentTimeString,
  parseTimesheet,
  TimeEntry
} from './models/timesheet';
import { exportToCSV, exportToHTML, exportToMarkdown } from './export/exporter';

export function activate(context: vscode.ExtensionContext) {
  // 1. Register Custom Editor Provider for *.timetrack files
  context.subscriptions.push(TimeTrackEditorProvider.register(context));

  // 2. Initialize Status Bar Timer Controller
  const timerController = new TimerController(context);

  // 3. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('timetracker.toggleTimer', () => {
      timerController.toggleTimer();
    }),

    vscode.commands.registerCommand('timetracker.startTimer', () => {
      timerController.startTimer();
    }),

    vscode.commands.registerCommand('timetracker.stopTimer', () => {
      timerController.stopTimer();
    }),

    vscode.commands.registerCommand('timetracker.createTimesheet', async () => {
      await createTimesheetCommand();
    }),

    vscode.commands.registerCommand('timetracker.addEntry', async () => {
      await addEntryCommand(timerController);
    }),

    vscode.commands.registerCommand('timetracker.exportInvoice', async () => {
      await exportInvoiceCommand(timerController);
    })
  );
}

async function createTimesheetCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Please open a project workspace folder first.');
    return;
  }

  const projectName = await vscode.window.showInputBox({
    prompt: 'Enter Project Name',
    value: workspaceFolder.name || 'My Project'
  });
  if (!projectName) return;

  const clientName = await vscode.window.showInputBox({
    prompt: 'Enter Client / Customer Name (Optional)',
    placeHolder: 'e.g. Acme Corp'
  });

  const config = vscode.workspace.getConfiguration('timetracker');
  const defaultRate = config.get<number>('defaultHourlyRate', 75);
  const defaultCurrency = config.get<string>('defaultCurrency', 'USD');

  const hourlyRateStr = await vscode.window.showInputBox({
    prompt: 'Enter Hourly Rate',
    value: defaultRate.toString()
  });
  const hourlyRate = parseFloat(hourlyRateStr || '') || defaultRate;

  const currency = await vscode.window.showInputBox({
    prompt: 'Enter Currency Code (e.g. USD, EUR, GBP)',
    value: defaultCurrency
  });

  const fileName = await vscode.window.showInputBox({
    prompt: 'Timesheet Filename',
    value: 'timesheet.timetrack'
  });
  if (!fileName) return;

  const cleanFileName = fileName.endsWith('.timetrack') ? fileName : `${fileName}.timetrack`;
  const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, cleanFileName));

  const timesheetData = createEmptyTimesheet(
    projectName,
    clientName || '',
    hourlyRate,
    currency || defaultCurrency
  );

  const jsonContent = JSON.stringify(timesheetData, null, 2);
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(jsonContent, 'utf8'));

  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(`Created new timesheet: ${cleanFileName}`);
}

async function addEntryCommand(timerController: TimerController): Promise<void> {
  const fileUri = await timerController.getTargetTimesheetUri();
  if (!fileUri) return;

  const desc = await vscode.window.showInputBox({
    prompt: 'Task description',
    placeHolder: 'What did you work on?'
  });
  if (!desc) return;

  const category = await vscode.window.showInputBox({
    prompt: 'Category / Tag',
    value: 'Development'
  });

  const durationStr = await vscode.window.showInputBox({
    prompt: 'Duration in decimal hours (e.g. 1.5 for 1h 30m)',
    value: '1.0'
  });
  const duration = parseFloat(durationStr || '') || 1.0;

  const billablePick = await vscode.window.showQuickPick(
    [
      { label: 'Yes - Billable', billable: true },
      { label: 'No - Non-Billable', billable: false }
    ],
    { placeHolder: 'Is this entry billable to the client?' }
  );
  const billable = billablePick ? billablePick.billable : true;

  const entry: TimeEntry = {
    id: generateEntryId(),
    date: getTodayDateString(),
    startTime: getCurrentTimeString(),
    durationHours: duration,
    category: category || 'General',
    description: desc,
    billable,
    invoiced: false
  };

  await timerController.saveEntryToTimesheet(entry);
}

async function exportInvoiceCommand(timerController: TimerController): Promise<void> {
  const fileUri = await timerController.getTargetTimesheetUri();
  if (!fileUri) return;

  const formatPick = await vscode.window.showQuickPick(
    [
      { label: '🌐 HTML Invoice', format: 'html', description: 'Printable invoice with professional styling' },
      { label: '📝 Markdown Report', format: 'md', description: 'Structured markdown table' },
      { label: '📊 CSV Spreadsheet', format: 'csv', description: 'Excel & accounting compatible' }
    ],
    { placeHolder: 'Select export format' }
  );
  if (!formatPick) return;

  const fileBytes = await vscode.workspace.fs.readFile(fileUri);
  const { data } = parseTimesheet(Buffer.from(fileBytes).toString('utf8'));

  let content = '';
  let ext = '';
  let filterName = '';

  switch (formatPick.format) {
    case 'html':
      content = exportToHTML(data);
      ext = '.html';
      filterName = 'HTML Invoice';
      break;
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
  }

  const dir = path.dirname(fileUri.fsPath);
  const baseName = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
  const defaultUri = vscode.Uri.file(path.join(dir, `${baseName}-invoice${ext}`));

  const targetUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { [filterName]: [ext.replace('.', '')] }
  });

  if (targetUri) {
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
    const action = await vscode.window.showInformationMessage(
      `Saved ${formatPick.label} to ${path.basename(targetUri.fsPath)}`,
      'Open File'
    );
    if (action === 'Open File') {
      if (formatPick.format === 'html') {
        await vscode.env.openExternal(targetUri);
      } else {
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc);
      }
    }
  }
}

export function deactivate() {}
