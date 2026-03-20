import { clipboard } from 'electron';
import { exec } from 'child_process';

export function typeText(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const previousClipboard = clipboard.readText();
    clipboard.writeText(text);

    const script = `tell application "System Events" to keystroke "v" using command down`;

    exec(`osascript -e '${script}'`, (err) => {
      setTimeout(() => {
        clipboard.writeText(previousClipboard);
      }, 500);

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
