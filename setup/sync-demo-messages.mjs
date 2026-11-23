import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const file = new URL('../data/demo-user.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const log = new Map(data.chatlog.map((entry) => [entry.id, entry]));
const write = process.argv.includes('--write');

// The two export formats use different spellings of UTC. Keep precision beyond
// milliseconds so two exchanges within the same millisecond remain distinct.
function timeKey(timestamp) {
  const iso = timestamp.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) throw new Error('Invalid demo message timestamp.');
  const fraction = iso.match(/\.(\d+)/)?.[1] ?? '';
  return time + '/' + fraction.slice(3).replace(/0+$/, '');
}

let differences = 0;
for (const window of data.chatWindows) {
  const sources = new Map();
  for (const id of window.chat_ids) {
    const source = log.get(id);
    if (!source) throw new Error('A demo window refers to a missing chat entry.');
    const time = timeKey(source.timestamp);
    if (sources.has(time)) throw new Error('Ambiguous message time within a demo window.');
    sources.set(time, source);
  }
  for (const copy of window.chat_data) {
    const source = sources.get(timeKey(copy.timestamp));
    if (!source) throw new Error('A saved message has no matching source in its window.');
    for (const field of ['human_message', 'llm_message']) {
      if (copy[field] !== source[field]) {
        differences++;
        copy[field] = source[field];
      }
    }
  }
}

if (differences && !write) {
  throw new Error('Saved demo messages differ from the chat log. Review the intended masking in both copies, then run pnpm demo:sync.');
}
if (differences && write) {
  // Preserve the text encoding used by the exported study data.
  const json = JSON.stringify(data, null, 2).replace(/[\u007f-\uffff]/g, (unit) =>
    '\\u' + unit.charCodeAt(0).toString(16).padStart(4, '0'));
  const pending = new URL('./.demo-' + randomUUID() + '.tmp', file);
  try {
    await writeFile(pending, json, { flag: 'wx' });
    await rename(pending, file);
  } finally {
    await rm(pending, { force: true });
  }
}
