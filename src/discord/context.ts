import type { Config } from '../config.js';
import type { Ledger } from '../core/ledger.js';

export interface AppContext {
  config: Config;
  ledger: Ledger;
}
