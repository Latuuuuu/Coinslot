import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DISCORD_TOKEN: 'token',
  DISCORD_APP_ID: '123456789012345678',
  GUILD_ID: '223456789012345678',
  LEDGER_CHANNEL_ID: '323456789012345678',
  OWNER_USER_ID: '423456789012345678',
};

describe('loadConfig', () => {
  it('applies defaults when optional values are missing or empty', () => {
    const config = loadConfig({ ...base, UPTIME_KUMA_PUSH_URL: '', TIMEZONE: '' });
    expect(config.timezone).toBe('Asia/Taipei');
    expect(config.reminderTime).toEqual({ hour: 22, minute: 0 });
    expect(config.weeklyReport).toEqual({ weekday: 7, hour: 21, minute: 0 });
    expect(config.dbPath).toBe('./data/coinslot.db');
    expect(config.uptimeKumaPushUrl).toBeUndefined();
  });

  it('parses custom schedules', () => {
    const config = loadConfig({ ...base, REMINDER_TIME: '21:30', WEEKLY_REPORT: 'MON 08:05' });
    expect(config.reminderTime).toEqual({ hour: 21, minute: 30 });
    expect(config.weeklyReport).toEqual({ weekday: 1, hour: 8, minute: 5 });
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ ...base, REMINDER_TIME: '25:00' })).toThrow(/REMINDER_TIME/);
    expect(() => loadConfig({ ...base, WEEKLY_REPORT: 'sunday 9pm' })).toThrow(/WEEKLY_REPORT/);
    expect(() => loadConfig({ ...base, TIMEZONE: 'Mars/Base' })).toThrow(/TIMEZONE/);
    expect(() => loadConfig({ ...base, OWNER_USER_ID: 'me' })).toThrow(/OWNER_USER_ID/);
    expect(() => loadConfig({ ...base, DISCORD_TOKEN: undefined })).toThrow(/DISCORD_TOKEN/);
  });
});

describe('MONTHLY_REPORT', () => {
  it('defaults to the 1st at 21:00 and parses custom values', () => {
    expect(loadConfig(base).monthlyReport).toEqual({ day: 1, hour: 21, minute: 0 });
    expect(loadConfig({ ...base, MONTHLY_REPORT: '28 09:30' }).monthlyReport).toEqual({
      day: 28,
      hour: 9,
      minute: 30,
    });
  });

  it('rejects days that do not exist in every month', () => {
    expect(() => loadConfig({ ...base, MONTHLY_REPORT: '31 21:00' })).toThrow(/MONTHLY_REPORT/);
    expect(() => loadConfig({ ...base, MONTHLY_REPORT: '0 21:00' })).toThrow(/MONTHLY_REPORT/);
    expect(() => loadConfig({ ...base, MONTHLY_REPORT: '21:00' })).toThrow(/MONTHLY_REPORT/);
  });
});
