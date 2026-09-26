import { IANAZone } from 'luxon';
import { z } from 'zod';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface WeeklySchedule extends TimeOfDay {
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  weekday: number;
}

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord snowflake ID');

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM (24h)')
  .transform((value): TimeOfDay => {
    const [hour, minute] = value.split(':').map(Number) as [number, number];
    return { hour, minute };
  });

const weeklySchedule = z
  .string()
  .regex(
    new RegExp(`^(${WEEKDAYS.join('|')}) ([01]\\d|2[0-3]):[0-5]\\d$`),
    'must be "DAY HH:MM", e.g. "SUN 21:00"',
  )
  .transform((value): WeeklySchedule => {
    const [day, time] = value.split(' ') as [(typeof WEEKDAYS)[number], string];
    const [hour, minute] = time.split(':').map(Number) as [number, number];
    return { weekday: WEEKDAYS.indexOf(day) + 1, hour, minute };
  });

// Treat empty strings (e.g. `UPTIME_KUMA_PUSH_URL=`) as unset.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: snowflake,
  GUILD_ID: snowflake,
  LEDGER_CHANNEL_ID: snowflake,
  OWNER_USER_ID: snowflake,
  TIMEZONE: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine((tz) => IANAZone.isValidZone(tz), 'must be a valid IANA time zone')
      .default('Asia/Taipei'),
  ),
  REMINDER_TIME: z.preprocess(emptyToUndefined, timeOfDay.default({ hour: 22, minute: 0 })),
  WEEKLY_REPORT: z.preprocess(
    emptyToUndefined,
    weeklySchedule.default({ weekday: 7, hour: 21, minute: 0 }),
  ),
  DB_PATH: z.preprocess(emptyToUndefined, z.string().default('./data/coinslot.db')),
  UPTIME_KUMA_PUSH_URL: z.preprocess(emptyToUndefined, z.url().optional()),
});

export interface Config {
  discordToken: string;
  discordAppId: string;
  guildId: string;
  ledgerChannelId: string;
  ownerUserId: string;
  timezone: string;
  reminderTime: TimeOfDay;
  weeklyReport: WeeklySchedule;
  dbPath: string;
  uptimeKumaPushUrl: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = result.data;
  return {
    discordToken: e.DISCORD_TOKEN,
    discordAppId: e.DISCORD_APP_ID,
    guildId: e.GUILD_ID,
    ledgerChannelId: e.LEDGER_CHANNEL_ID,
    ownerUserId: e.OWNER_USER_ID,
    timezone: e.TIMEZONE,
    reminderTime: e.REMINDER_TIME,
    weeklyReport: e.WEEKLY_REPORT,
    dbPath: e.DB_PATH,
    uptimeKumaPushUrl: e.UPTIME_KUMA_PUSH_URL,
  };
}
