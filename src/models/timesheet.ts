export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  durationHours: number; // e.g. 1.5
  category?: string;
  description: string;
  billable: boolean;
  invoiced: boolean;
  invoiceNumber?: string;
}

export type RoundingInterval = 'none' | '5m' | '6m' | '15m' | '30m' | '1h';
export type RoundingDirection = 'up' | 'nearest';

export interface RoundingConfig {
  enabled: boolean;
  interval: RoundingInterval;
  direction: RoundingDirection;
}

export interface FreelancerProfile {
  businessName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  kvkNumber?: string;
  vatNumber?: string; // BTW-id
  vatRate?: number; // e.g. 21
  iban?: string;
  bic?: string;
  logo?: string; // data URI base64 or URL
  paymentTermsDays?: number;
}

export interface TimesheetData {
  $schema?: string;
  version: string;
  project: string;
  client?: string;
  currency: string;
  hourlyRate: number;
  notes?: string;
  rounding?: RoundingConfig;
  profile?: FreelancerProfile;
  entries: TimeEntry[];
}

export interface TimesheetSummary {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  totalAmount: number; // Subtotal excl. VAT
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  unbilledAmount: number;
  invoicedAmount: number;
  entryCount: number;
}

export function generateEntryId(): string {
  return `tt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDuration(hours: number): string {
  if (isNaN(hours) || hours <= 0) {
    return '0m';
  }
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

export function parseDurationInput(input: string): number | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim().toLowerCase();

  // If decimal number like "1.5" or "2"
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const val = parseFloat(trimmed);
    return val > 0 ? Math.round(val * 100) / 100 : null;
  }

  // If "1h 30m", "1h30m", "2h", "45m"
  const hoursMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/);
  const minutesMatch = trimmed.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);

  if (hoursMatch || minutesMatch) {
    const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
    const total = hours + minutes / 60;
    return total > 0 ? Math.round(total * 100) / 100 : null;
  }

  // If "1:30" (HH:MM)
  const colonMatch = trimmed.match(/^(\d+):([0-5]\d)$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    const total = hours + minutes / 60;
    return total > 0 ? Math.round(total * 100) / 100 : null;
  }

  return null;
}

export function calculateDurationFromTimes(startTime: string, endTime: string): number | null {
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  if (startParts.length !== 2 || endParts.length !== 2) {
    return null;
  }
  const [sH, sM] = startParts;
  const [eH, eM] = endParts;
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) {
    return null;
  }
  let startMinutes = sH * 60 + sM;
  let endMinutes = eH * 60 + eM;
  if (endMinutes < startMinutes) {
    // Overnight roll-over
    endMinutes += 24 * 60;
  }
  const diffMinutes = endMinutes - startMinutes;
  if (diffMinutes <= 0) {
    return null;
  }
  return Math.round((diffMinutes / 60) * 100) / 100;
}

export function applyRounding(hours: number, config?: RoundingConfig): number {
  if (isNaN(hours) || hours <= 0 || !config || !config.enabled || config.interval === 'none') {
    return Math.round(hours * 100) / 100;
  }

  let stepMinutes = 15;
  switch (config.interval) {
    case '5m': stepMinutes = 5; break;
    case '6m': stepMinutes = 6; break;
    case '15m': stepMinutes = 15; break;
    case '30m': stepMinutes = 30; break;
    case '1h': stepMinutes = 60; break;
  }

  const totalMinutes = hours * 60;
  let roundedMinutes: number;

  if (config.direction === 'nearest') {
    roundedMinutes = Math.round(totalMinutes / stepMinutes) * stepMinutes;
  } else {
    // Default 'up' (ceil)
    roundedMinutes = Math.ceil(totalMinutes / stepMinutes) * stepMinutes;
  }

  // Ensure positive hours get at least one step when rounded up
  if (roundedMinutes <= 0 && hours > 0) {
    roundedMinutes = stepMinutes;
  }

  return Math.round((roundedMinutes / 60) * 100) / 100;
}

export function computeSummary(data: TimesheetData): TimesheetSummary {
  const rate = data.hourlyRate || 0;
  let totalHours = 0;
  let billableHours = 0;
  let nonBillableHours = 0;
  let invoicedAmount = 0;
  let unbilledAmount = 0;

  for (const entry of data.entries) {
    const dur = entry.durationHours || 0;
    totalHours += dur;
    if (entry.billable) {
      billableHours += dur;
      const amt = dur * rate;
      if (entry.invoiced) {
        invoicedAmount += amt;
      } else {
        unbilledAmount += amt;
      }
    } else {
      nonBillableHours += dur;
    }
  }

  const totalAmount = Math.round(billableHours * rate * 100) / 100;
  const vatRate = typeof data.profile?.vatRate === 'number' ? data.profile.vatRate : 0;
  const vatAmount = Math.round(totalAmount * (vatRate / 100) * 100) / 100;
  const totalWithVat = Math.round((totalAmount + vatAmount) * 100) / 100;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    billableHours: Math.round(billableHours * 100) / 100,
    nonBillableHours: Math.round(nonBillableHours * 100) / 100,
    totalAmount,
    vatRate,
    vatAmount,
    totalWithVat,
    unbilledAmount: Math.round(unbilledAmount * 100) / 100,
    invoicedAmount: Math.round(invoicedAmount * 100) / 100,
    entryCount: data.entries.length
  };
}

export function createEmptyTimesheet(
  projectName = 'My Project',
  clientName = 'Client Name',
  hourlyRate = 75,
  currency = 'USD'
): TimesheetData {
  return {
    $schema: './src/schemas/timetrack.schema.json',
    version: '1.0',
    project: projectName,
    client: clientName,
    currency: currency.toUpperCase(),
    hourlyRate: hourlyRate,
    notes: 'Hourly work logged for client invoicing.',
    rounding: {
      enabled: false,
      interval: '15m',
      direction: 'up'
    },
    entries: []
  };
}

export function parseTimesheet(text: string): { valid: boolean; data: TimesheetData; errors?: string[] } {
  try {
    const parsed = JSON.parse(text);
    const errors: string[] = [];

    if (typeof parsed !== 'object' || parsed === null) {
      return { valid: false, data: createEmptyTimesheet(), errors: ['Root value must be an object'] };
    }

    if (!parsed.project || typeof parsed.project !== 'string') {
      errors.push('Missing or invalid "project" property');
    }

    if (!Array.isArray(parsed.entries)) {
      parsed.entries = [];
    } else {
      // Validate entries
      parsed.entries = parsed.entries.map((entry: any, index: number) => {
        if (!entry.id) {
          entry.id = `entry_${index}_${Date.now().toString(36)}`;
        }
        if (!entry.date) {
          entry.date = getTodayDateString();
        }
        if (typeof entry.durationHours !== 'number') {
          entry.durationHours = 0;
        }
        if (typeof entry.description !== 'string') {
          entry.description = '';
        }
        if (typeof entry.billable !== 'boolean') {
          entry.billable = true;
        }
        if (typeof entry.invoiced !== 'boolean') {
          entry.invoiced = false;
        }
        return entry as TimeEntry;
      });
    }

    const data: TimesheetData = {
      $schema: parsed.$schema,
      version: parsed.version || '1.0',
      project: parsed.project || 'Untitled Project',
      client: parsed.client || '',
      currency: parsed.currency || 'USD',
      hourlyRate: typeof parsed.hourlyRate === 'number' ? parsed.hourlyRate : 0,
      notes: parsed.notes || '',
      rounding: parsed.rounding ? {
        enabled: Boolean(parsed.rounding.enabled),
        interval: parsed.rounding.interval || '15m',
        direction: parsed.rounding.direction || 'up'
      } : undefined,
      profile: parsed.profile ? {
        businessName: parsed.profile.businessName || '',
        fullName: parsed.profile.fullName || '',
        email: parsed.profile.email || '',
        phone: parsed.profile.phone || '',
        address: parsed.profile.address || '',
        kvkNumber: parsed.profile.kvkNumber || '',
        vatNumber: parsed.profile.vatNumber || '',
        vatRate: typeof parsed.profile.vatRate === 'number' ? parsed.profile.vatRate : 0,
        iban: parsed.profile.iban || '',
        bic: parsed.profile.bic || '',
        logo: parsed.profile.logo || '',
        paymentTermsDays: typeof parsed.profile.paymentTermsDays === 'number' ? parsed.profile.paymentTermsDays : 14
      } : undefined,
      entries: parsed.entries
    };

    return { valid: errors.length === 0, data, errors: errors.length > 0 ? errors : undefined };
  } catch (err: any) {
    return {
      valid: false,
      data: createEmptyTimesheet(),
      errors: [`JSON parse error: ${err.message}`]
    };
  }
}

export function formatIncompleteTime(hourBuffer: string, minuteBuffer = ''): string | null {
  if (!hourBuffer) {
    return null;
  }
  const h = parseInt(hourBuffer, 10);
  if (isNaN(h) || h < 0 || h > 23) {
    return null;
  }
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
  return `${formattedHour}:${formattedMinute}`;
}

