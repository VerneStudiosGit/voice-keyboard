import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from './config';

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const config = loadConfig();

  const openai = new OpenAI({
    apiKey: config.apiKey,
    maxRetries: 3,
  });

  const tmpPath = path.join(os.tmpdir(), `voice-kb-${Date.now()}.webm`);

  try {
    fs.writeFileSync(tmpPath, audioBuffer);

    const options: any = {
      file: fs.createReadStream(tmpPath),
      model: 'whisper-1',
    };

    if (config.language !== 'auto') {
      options.language = config.language;
    }

    const transcription = await openai.audio.transcriptions.create(options);
    return transcription.text;
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  }
}
