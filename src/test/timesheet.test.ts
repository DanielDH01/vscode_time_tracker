import * as assert from 'assert';
import { describe, it } from 'node:test';
import {
  parseDurationInput,
  calculateDurationFromTimes,
  formatDuration,
  computeSummary,
  createEmptyTimesheet,
  parseTimesheet,
  TimeEntry,
  TimesheetData
} from '../models/timesheet';
import { exportToCSV, exportToHTML, exportToMarkdown } from '../export/exporter';

describe('Timesheet Models & Helpers', () => {
  it('should parse duration strings accurately', () => {
    assert.strictEqual(parseDurationInput('1.5'), 1.5);
    assert.strictEqual(parseDurationInput('2'), 2);
    assert.strictEqual(parseDurationInput('1h 30m'), 1.5);
    assert.strictEqual(parseDurationInput('45m'), 0.75);
    assert.strictEqual(parseDurationInput('2h'), 2);
    assert.strictEqual(parseDurationInput('1:30'), 1.5);
    assert.strictEqual(parseDurationInput('0:45'), 0.75);
    assert.strictEqual(parseDurationInput('invalid'), null);
  });

  it('should calculate duration between start and end times', () => {
    assert.strictEqual(calculateDurationFromTimes('09:00', '10:30'), 1.5);
    assert.strictEqual(calculateDurationFromTimes('13:00', '14:15'), 1.25);
    assert.strictEqual(calculateDurationFromTimes('23:00', '01:00'), 2.0); // Overnight
  });

  it('should format duration into readable string', () => {
    assert.strictEqual(formatDuration(1.5), '1h 30m');
    assert.strictEqual(formatDuration(2.0), '2h');
    assert.strictEqual(formatDuration(0.75), '45m');
    assert.strictEqual(formatDuration(0), '0m');
  });

  it('should compute financial summary accurately', () => {
    const data: TimesheetData = {
      version: '1.0',
      project: 'Acme Test',
      currency: 'USD',
      hourlyRate: 100,
      entries: [
        {
          id: '1',
          date: '2026-09-24',
          durationHours: 2.0,
          description: 'Task 1',
          billable: true,
          invoiced: true
        },
        {
          id: '2',
          date: '2026-09-24',
          durationHours: 3.0,
          description: 'Task 2',
          billable: true,
          invoiced: false
        },
        {
          id: '3',
          date: '2026-09-24',
          durationHours: 1.0,
          description: 'Internal task',
          billable: false,
          invoiced: false
        }
      ]
    };

    const summary = computeSummary(data);
    assert.strictEqual(summary.totalHours, 6.0);
    assert.strictEqual(summary.billableHours, 5.0);
    assert.strictEqual(summary.nonBillableHours, 1.0);
    assert.strictEqual(summary.totalAmount, 500.0);
    assert.strictEqual(summary.invoicedAmount, 200.0);
    assert.strictEqual(summary.unbilledAmount, 300.0);
  });

  it('should parse timesheet json safely', () => {
    const raw = JSON.stringify({
      project: 'App Dev',
      hourlyRate: 80,
      entries: [
        { id: 'e1', date: '2026-09-24', durationHours: 1.5, description: 'Coding' }
      ]
    });

    const result = parseTimesheet(raw);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.data.project, 'App Dev');
    assert.strictEqual(result.data.entries.length, 1);
    assert.strictEqual(result.data.entries[0].billable, true);
  });

  it('should export clean Markdown, CSV, and HTML invoice', () => {
    const data: TimesheetData = {
      version: '1.0',
      project: 'Client Project',
      client: 'Acme Corp',
      currency: 'EUR',
      hourlyRate: 50,
      entries: [
        {
          id: 'e1',
          date: '2026-09-24',
          durationHours: 2.0,
          description: 'Feature work',
          billable: true,
          invoiced: false
        }
      ]
    };

    const md = exportToMarkdown(data);
    assert.ok(md.includes('# Timesheet & Invoice Report: Client Project'));
    assert.ok(md.includes('100.00 EUR'));

    const csv = exportToCSV(data);
    assert.ok(csv.includes('Date,Category,Description'));
    assert.ok(csv.includes('"Feature work"'));
    assert.ok(csv.includes('100.00'));

    const html = exportToHTML(data);
    assert.ok(html.includes('Client Project'));
    assert.ok(html.includes('Acme Corp'));
    assert.ok(html.includes('100.00 EUR'));
  });
});
