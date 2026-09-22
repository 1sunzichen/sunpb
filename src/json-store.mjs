import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { summarize } from './curriculum.mjs';

// One server process owns the file. Serial writes plus atomic replacement avoid lost updates.
export class JsonStore {
  constructor(file) { this.file = file; this.queue = Promise.resolve(); }
  async load() {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, users: [], progress: [] }; throw error; }
  }
  change(fn) {
    const work = this.queue.then(async () => {
      const data = await this.load();
      const result = fn(data);
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(this.file + '.tmp', this.file);
      return result;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  async read(fn) { await this.queue; return fn(await this.load()); }
  getBySession(hash) { return this.read(d => d.users.find(u => u.session_hash === hash)); }
  createUser(user) { return this.change(d => { d.users.push(user); return user; }); }
  renameUser(id, nickname) { return this.change(d => { const user = d.users.find(u => u.id === id); user.nickname = nickname; return user; }); }
  getProgress(id) { return this.read(d => d.progress.filter(p => p.user_id === id)); }
  recordAnswer(id, lesson, q, correct) {
    return this.change(d => {
      let item = d.progress.find(p => p.user_id === id && p.question_id === q.id);
      if (!item) { item = { user_id: id, lesson_id: lesson.id, question_id: q.id, correct: false, attempts: 0 }; d.progress.push(item); }
      item.correct = item.correct || correct;
      item.attempts += 1;
      item.updated_at = new Date().toISOString();
    });
  }
  leaderboard() {
    return this.read(d => d.users.map(u => ({ id: u.id, nickname: u.nickname, created_at: u.created_at, ...summarize(d.progress.filter(p => p.user_id === u.id)) }))
      .filter(u => u.score > 0).sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map(({ id, nickname, score, completed }, i) => ({ id, nickname, score, completed: completed.length, rank: i + 1 })));
  }
}
