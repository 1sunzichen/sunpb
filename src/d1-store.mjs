import { lessons } from './curriculum.mjs';
export class D1Store {
  constructor(db) { this.db = db; }
  getBySession(hash) { return this.db.prepare('SELECT * FROM students WHERE session_hash = ?').bind(hash).first(); }
  async createUser(user) { await this.db.prepare('INSERT INTO students (id,session_hash,nickname,created_at) VALUES (?,?,?,?)').bind(user.id,user.session_hash,user.nickname,user.created_at).run(); return user; }
  async renameUser(id, nickname) { await this.db.prepare('UPDATE students SET nickname = ? WHERE id = ?').bind(nickname,id).run(); return this.db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first(); }
  async getProgress(id) { return (await this.db.prepare('SELECT question_id,lesson_id,correct,attempts FROM progress WHERE user_id = ?').bind(id).all()).results; }
  async recordAnswer(id, lesson, q, correct) {
    await this.db.prepare(`INSERT INTO progress (user_id,question_id,lesson_id,correct,attempts,updated_at) VALUES (?,?,?,?,1,?)
      ON CONFLICT(user_id,question_id) DO UPDATE SET correct = MAX(progress.correct,excluded.correct), attempts = progress.attempts+1, updated_at = excluded.updated_at`)
      .bind(id,q.id,lesson.id,correct?1:0,new Date().toISOString()).run();
  }
  async leaderboard() {
    const expected = lessons.map(l=>`WHEN '${l.id}' THEN ${l.questions.length}`).join(' ');
    const result = await this.db.prepare(`WITH completed AS (
      SELECT user_id,COUNT(*) AS total FROM (
        SELECT user_id,lesson_id FROM progress WHERE correct=1 GROUP BY user_id,lesson_id
        HAVING COUNT(*) = CASE lesson_id ${expected} ELSE -1 END
      ) GROUP BY user_id
    ) SELECT s.id,s.nickname,s.created_at,COALESCE(SUM(p.correct),0)*10+COALESCE(c.total,0)*20 AS score,
      COALESCE(c.total,0) AS completed FROM students s LEFT JOIN progress p ON p.user_id=s.id
      LEFT JOIN completed c ON c.user_id=s.id GROUP BY s.id HAVING score>0 ORDER BY score DESC,s.created_at ASC,s.id ASC`).all();
    return result.results.map(({created_at,...row},i)=>({...row,rank:i+1}));
  }
}
