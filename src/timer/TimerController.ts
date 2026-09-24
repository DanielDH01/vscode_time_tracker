import * as vscode from 'vscode';
import * as path from 'path';
import {
  generateEntryId,
  getTodayDateString,
  getCurrentTimeString,
  parseTimesheet,
  createEmptyTimesheet,
  TimeEntry,
  formatDuration
} from '../models/timesheet';

export class TimerController {
  private statusBarItem: vscode.StatusBarItem;
  private intervalTimer: NodeJS.Timeout | null = null;
  private startTime: Date | null = null;
  private taskDescription = '';
  private taskCategory = 'Development';

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'timetracker.toggleTimer';
    this.context.subscriptions.push(this.statusBarItem);
    this.updateStatusBar();
    this.statusBarItem.show();
  }

  public isTracking(): boolean {
    return this.startTime !== null;
  }

  public async toggleTimer(): Promise<void> {
    if (this.isTracking()) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(debug-stop) Stop & Log Entry', action: 'stop' },
          { label: '$(close) Cancel Timer (Discard)', action: 'cancel' }
        ],
        { placeHolder: `Tracking: "${this.taskDescription}" - Choose action` }
      );
      if (choice?.action === 'stop') {
        await this.stopTimer();
      } else if (choice?.action === 'cancel') {
        this.cancelTimer();
      }
    } else {
      await this.startTimer();
    }
  }

  public async startTimer(): Promise<void> {
    if (this.isTracking()) {
      vscode.window.showWarningMessage(`Already tracking: "${this.taskDescription}". Stop or cancel first.`);
      return;
    }

    const desc = await vscode.window.showInputBox({
      prompt: 'Enter task description to track',
      placeHolder: 'e.g. Implement user authentication flow'
    });

    if (!desc || desc.trim() === '') {
      return;
    }

    const category = await vscode.window.showInputBox({
      prompt: 'Category / Tag (Optional)',
      value: 'Development',
      placeHolder: 'e.g. Development, Bugfix, Meeting, Code Review'
    });

    this.taskDescription = desc.trim();
    this.taskCategory = (category && category.trim()) || 'Development';
    this.startTime = new Date();

    this.intervalTimer = setInterval(() => {
      this.updateStatusBar();
    }, 1000);

    this.updateStatusBar();
    vscode.window.showInformationMessage(`⏱️ Started tracking: "${this.taskDescription}"`);
  }

  public async stopTimer(): Promise<void> {
    if (!this.startTime) {
      vscode.window.showWarningMessage('No active timer running.');
      return;
    }

    const endTime = new Date();
    const elapsedMs = endTime.getTime() - this.startTime.getTime();
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / (1000 * 60)));
    const durationHours = Math.max(0.02, Math.round((elapsedMinutes / 60) * 100) / 100);

    const sH = String(this.startTime.getHours()).padStart(2, '0');
    const sM = String(this.startTime.getMinutes()).padStart(2, '0');
    const eH = String(endTime.getHours()).padStart(2, '0');
    const eM = String(endTime.getMinutes()).padStart(2, '0');

    const startTimeStr = `${sH}:${sM}`;
    const endTimeStr = `${eH}:${eM}`;

    // Prompt user to verify/edit hours or description
    const confirmedHoursStr = await vscode.window.showInputBox({
      prompt: `Confirm duration in hours (elapsed: ${formatDuration(durationHours)})`,
      value: durationHours.toString()
    });

    if (!confirmedHoursStr) {
      return; // Cancelled
    }

    const finalHours = parseFloat(confirmedHoursStr) || durationHours;

    const entry: TimeEntry = {
      id: generateEntryId(),
      date: getTodayDateString(),
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationHours: finalHours,
      category: this.taskCategory,
      description: this.taskDescription,
      billable: true,
      invoiced: false
    };

    this.resetTimer();

    await this.saveEntryToTimesheet(entry);
  }

  public cancelTimer(): void {
    this.resetTimer();
    vscode.window.showInformationMessage('Timer discarded.');
  }

  private resetTimer(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.startTime = null;
    this.taskDescription = '';
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    if (this.isTracking() && this.startTime) {
      const elapsedSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      const hours = Math.floor(elapsedSeconds / 3600);
      const minutes = Math.floor((elapsedSeconds % 3600) / 60);
      const seconds = elapsedSeconds % 60;

      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      this.statusBarItem.text = `$(watch) ${timeStr} - ${this.taskDescription}`;
      this.statusBarItem.tooltip = `Active Time Tracker\nTask: ${this.taskDescription}\nCategory: ${this.taskCategory}\nClick to stop or cancel`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.text = '$(play) Start Time Tracker';
      this.statusBarItem.tooltip = 'Click to start tracking time for a task';
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  public async saveEntryToTimesheet(entry: TimeEntry): Promise<void> {
    const fileUri = await this.getTargetTimesheetUri();
    if (!fileUri) {
      return;
    }

    try {
      let content = '';
      try {
        const fileBytes = await vscode.workspace.fs.readFile(fileUri);
        content = Buffer.from(fileBytes).toString('utf8');
      } catch {
        // File doesn't exist yet, create default
        const config = vscode.workspace.getConfiguration('timetracker');
        const defaultRate = config.get<number>('defaultHourlyRate', 75);
        const defaultCur = config.get<string>('defaultCurrency', 'USD');
        const projName = vscode.workspace.workspaceFolders?.[0]?.name || 'My Project';
        const empty = createEmptyTimesheet(projName, '', defaultRate, defaultCur);
        content = JSON.stringify(empty, null, 2);
      }

      const { data } = parseTimesheet(content);
      data.entries.push(entry);

      const formatted = JSON.stringify(data, null, 2);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(formatted, 'utf8'));

      const action = await vscode.window.showInformationMessage(
        `Logged ${entry.durationHours}h (${formatDuration(entry.durationHours)}) to ${path.basename(fileUri.fsPath)}`,
        'Open Timesheet'
      );

      if (action === 'Open Timesheet') {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to save time entry: ${err.message}`);
    }
  }

  public async getTargetTimesheetUri(): Promise<vscode.Uri | null> {
    // 1. Check if the active editor is a .timetrack file
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc && activeDoc.uri.fsPath.endsWith('.timetrack')) {
      return activeDoc.uri;
    }

    // 2. Search workspace for existing .timetrack files
    const foundFiles = await vscode.workspace.findFiles('**/*.timetrack', '**/node_modules/**', 10);
    if (foundFiles.length === 1) {
      return foundFiles[0];
    } else if (foundFiles.length > 1) {
      const picks = foundFiles.map(f => ({
        label: path.basename(f.fsPath),
        description: vscode.workspace.asRelativePath(f),
        uri: f
      }));
      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select the timesheet file to log this entry to'
      });
      return selected ? selected.uri : null;
    }

    // 3. Fallback: prompt to create one in workspace root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open. Open a folder to save your timesheet.');
      return null;
    }

    const config = vscode.workspace.getConfiguration('timetracker');
    const defaultName = config.get<string>('defaultTimesheetFile', 'timesheet.timetrack');
    return vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, defaultName));
  }
}
