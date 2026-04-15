import OpenAI from 'openai';
import { loadConfig, TextFilter } from './config';

async function applyTranslateFilter(text: string, filter: TextFilter, openai: OpenAI): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a translator. Translate the following text to ${filter.targetLanguage}. Return ONLY the translated text, nothing else.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content?.trim() || text;
}

async function applyCustomPromptFilter(text: string, filter: TextFilter, openai: OpenAI): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: filter.prompt || 'Return the text as-is.',
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content?.trim() || text;
}

export async function applyFilters(text: string): Promise<string> {
  const config = loadConfig();
  const enabledFilters = config.filters.filter((f) => f.enabled);

  if (enabledFilters.length === 0) return text;

  const openai = new OpenAI({ apiKey: config.apiKey, maxRetries: 3 });
  let result = text;

  for (const filter of enabledFilters) {
    if (filter.type === 'translate' && filter.targetLanguage) {
      result = await applyTranslateFilter(result, filter, openai);
    } else if (filter.type === 'custom-prompt' && filter.prompt) {
      result = await applyCustomPromptFilter(result, filter, openai);
    }
  }

  return result;
}
