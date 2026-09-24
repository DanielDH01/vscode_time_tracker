# VS Code Time Tracker & Invoicing

A lightweight, developer-first time tracking and invoicing extension for Visual Studio Code. Keep an exact record of every hour you spend on a project in a version-controlled, human-readable file (`*.timetrack`), calculate earnings, and generate professional customer invoices in seconds.

---

## ✨ Features

- **Custom `.timetrack` Project File**: Dedicated JSON-based format registered with VS Code schemas for instant autocompletion, type-safety, and git tracking.
- **Modern Visual Editor**: Clicking any `*.timetrack` file opens a clean GUI dashboard inside VS Code:
  - Metric summary cards: Total Hours, Billable Hours, Total Cost, Unbilled / Pending.
  - Filter by status: All, Unbilled, Invoiced, or Billable only.
  - Quick Search: Instantly filter by task description, category, or invoice number.
  - Add / Edit / Delete time entries with auto-calculated duration from start/end times.
  - 1-click status toggling (toggle Billable / Invoiced directly from badges).
- **Status Bar Live Timer**:
  - Click `$(play) Start Time Tracker` in the bottom status bar.
  - Type in your task and optional category.
  - The status bar displays real-time elapsed time `$(watch) 01:23:45 - Task Name`.
  - When finished, click Stop to review and automatically append the entry to your `.timetrack` file.
- **Client Invoicing & Export**:
  - 🌐 **HTML Invoice**: A clean, printable invoice with professional layout, summary totals, itemized time logs, and print-to-PDF button.
  - 📝 **Markdown Report**: Formatted tables ready to paste into GitHub PRs, issues, or emails.
  - 📊 **CSV Spreadsheet**: Comma-separated breakdown ready for Excel, Google Sheets, or accounting software.
- **Dual Mode (Visual + Raw Text)**:
  - Default: Visual Editor.
  - Power users: Right click -> *Open With...* -> *Text Editor* to edit the JSON directly with schema validation.

---

## 🚀 Getting Started

### 1. Create a Timesheet File
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
```
Time Tracker: Create New Timesheet
```
Provide:
- **Project Name** (e.g. `Client Portal Redesign`)
- **Customer / Client Name** (e.g. `Acme Corp`)
- **Hourly Rate** (e.g. `85`)
- **Currency** (e.g. `USD`, `EUR`, `GBP`)
- **Filename** (defaults to `timesheet.timetrack`)

A new `.timetrack` file will be created in your workspace root and opened automatically in the Visual Editor.

### 2. Track Your Time
You have three easy ways to log hours:
1. **Live Timer**: Click the **Start Time Tracker** button in the VS Code status bar (or run `Time Tracker: Start Tracking Time`). When you're done, click the timer to stop and save.
2. **Visual Editor**: Click **➕ Add Entry** in the `.timetrack` editor tab. Fill in your task description, duration, and billable status.
3. **Command Palette**: Run `Time Tracker: Add Manual Time Entry` from anywhere in VS Code.

### 3. Generate Invoices
When you are ready to bill your customer:
1. Open your `.timetrack` file.
2. Click **📄 Export Invoice** in the top bar (or run `Time Tracker: Export Timesheet / Invoice`).
3. Select your format:
   - **HTML Invoice**: Opens in your browser with a **Print / Save as PDF** button.
   - **Markdown**: Generates an invoice table ready for documentation.
   - **CSV**: Creates a spreadsheet file for your accounting system.

---

## 📁 File Format Specification (`*.timetrack`)

A `.timetrack` file is a clean, structured JSON document:

```json
{
  "$schema": "./src/schemas/timetrack.schema.json",
  "version": "1.0",
  "project": "Client Portal Development",
  "client": "Acme Innovations Ltd",
  "currency": "EUR",
  "hourlyRate": 85,
  "notes": "Net 30 payment terms.",
  "entries": [
    {
      "id": "tt_init_01",
      "date": "2026-09-24",
      "startTime": "09:00",
      "endTime": "12:00",
      "durationHours": 3.0,
      "category": "Development",
      "description": "Implemented OAuth2 authentication and user sessions",
      "billable": true,
      "invoiced": false
    }
  ]
}
```

### Schema Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `project` | string | Name of the project |
| `client` | string | Client / Customer name |
| `currency` | string | Currency code (e.g., `USD`, `EUR`, `GBP`) |
| `hourlyRate` | number | Default hourly rate for entries |
| `notes` | string | Invoice terms or project notes |
| `entries` | array | List of logged time entries |

### Entry Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | Unique entry ID |
| `date` | string | Date in `YYYY-MM-DD` |
| `startTime` | string | Optional start time (`HH:MM`) |
| `endTime` | string | Optional end time (`HH:MM`) |
| `durationHours` | number | Duration in decimal hours (e.g., `1.5` = 1 hr 30 mins) |
| `category` | string | Category / tag (e.g., `Development`, `Meeting`, `Bugfix`) |
| `description` | string | Work summary |
| `billable` | boolean | Whether this entry is billable |
| `invoiced` | boolean | Marks whether already billed |
| `invoiceNumber` | string | Optional invoice reference ID |

---

## ⚙️ Configuration Settings

Open your VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for `Time Tracker`:

- `timetracker.defaultHourlyRate`: Default hourly rate when creating new timesheet files (default: `75`).
- `timetracker.defaultCurrency`: Default currency code (default: `USD`).
- `timetracker.defaultTimesheetFile`: Default timesheet filename used for live timer logs (default: `timesheet.timetrack`).

---

## ⌨️ Commands

| Command | Title |
| :--- | :--- |
| `timetracker.createTimesheet` | Time Tracker: Create New Timesheet |
| `timetracker.startTimer` | Time Tracker: Start Tracking Time |
| `timetracker.stopTimer` | Time Tracker: Stop Tracking Time & Save |
| `timetracker.addEntry` | Time Tracker: Add Manual Time Entry |
| `timetracker.exportInvoice` | Time Tracker: Export Timesheet / Invoice |

---

## 🛠️ Development & Building

To run or build the extension from source:
```bash
npm install
npm run build      # Bundles extension and webview with esbuild
npm test           # Runs automated test suite
```

Press `F5` in VS Code to launch the Extension Development Host window.
