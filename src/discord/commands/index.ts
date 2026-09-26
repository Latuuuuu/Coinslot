import { exportCommand } from './export.js';
import { logCommand } from './log.js';
import { todayCommand } from './today.js';
import type { Command } from './types.js';
import { undoCommand } from './undo.js';
import { weekCommand } from './week.js';

export const commands: readonly Command[] = [
  logCommand,
  undoCommand,
  todayCommand,
  weekCommand,
  exportCommand,
];

export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
