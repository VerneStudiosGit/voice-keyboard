import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface TextFilter {
  id: string;
  enabled: boolean;
  type: 'translate' | 'custom-prompt';
  targetLanguage?: string;    // for translate filter
  prompt?: string;            // for custom-prompt filter
}

export interface AppConfig {
  apiKey: string;
  language: string;
  filters: TextFilter[];
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

const defaults: AppConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  language: 'es',
  filters: [],
};

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return { ...defaults, ...data };
    }
  } catch {
    // ignore
  }
  return { ...defaults };
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const merged = { ...current, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
