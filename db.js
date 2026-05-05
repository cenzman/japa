// 漢字マスター - IndexedDB Database Layer (v2 — SM-2 SRS)
class JapaneseDB {
  constructor() {
    this.dbName = 'kanjiMasterDB';
    this.dbVersion = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const oldVersion = e.oldVersion;
        if (oldVersion < 1) {
          const ps = db.createObjectStore('progress', { keyPath: 'id' });
          ps.createIndex('category', 'category', { unique: false });
          ps.createIndex('lastReview', 'lastReview', { unique: false });
          const cv = db.createObjectStore('customVocab', { keyPath: 'id', autoIncrement: true });
          cv.createIndex('category', 'category', { unique: false });
          db.createObjectStore('stats', { keyPath: 'id' });
          db.createObjectStore('lessonProgress', { keyPath: 'lessonId' });
        }
        if (oldVersion < 2) {
          // Add dueDate index for efficient SRS queries
          const tx = e.target.transaction;
          const ps = tx.objectStore('progress');
          if (!ps.indexNames.contains('dueDate')) {
            ps.createIndex('dueDate', 'dueDate', { unique: false });
          }
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  _tx(store, mode = 'readonly') {
    const tx = this.db.transaction(store, mode);
    return tx.objectStore(store);
  }

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Progress CRUD
  async getProgress(id) {
    return this._req(this._tx('progress').get(id));
  }

  async getAllProgress() {
    return this._req(this._tx('progress').getAll());
  }

  async saveProgress(data) {
    return this._req(this._tx('progress', 'readwrite').put(data));
  }

  // Legacy — kept for quiz/lesson compatibility
  async updateCharacterProgress(charId, category, correct) {
    let prog = await this.getProgress(charId) || {
      id: charId, category, correctCount: 0, wrongCount: 0,
      level: 0, lastReview: null, nextReview: null, streak: 0,
      // SM-2 fields
      easeFactor: 2.5, interval: 0, repetitions: 0, dueDate: null, srsState: 'new'
    };
    if (correct) {
      prog.correctCount++;
      prog.streak++;
      prog.level = Math.min(5, prog.level + 1);
    } else {
      prog.wrongCount++;
      prog.streak = 0;
      prog.level = Math.max(0, prog.level - 1);
    }
    prog.lastReview = Date.now();
    // SRS intervals: 1h, 4h, 1d, 3d, 7d, 30d
    const intervals = [3600000, 14400000, 86400000, 259200000, 604800000, 2592000000];
    prog.nextReview = Date.now() + (intervals[prog.level] || intervals[5]);
    await this.saveProgress(prog);
    return prog;
  }

  // ============================================================
  // SM-2 Spaced Repetition Algorithm
  // ============================================================

  /**
   * Update a card using the SM-2 algorithm.
   * @param {string} charId  - progress record key (e.g. "hiragana_あ")
   * @param {string} category - hiragana | katakana | kanji
   * @param {number} quality  - 1=Again, 2=Hard, 3=Good, 4=Easy
   */
  async updateSRS(charId, category, quality) {
    let prog = await this.getProgress(charId) || {
      id: charId, category,
      correctCount: 0, wrongCount: 0, level: 0, streak: 0,
      // SM-2 fields
      easeFactor: 2.5, interval: 0, repetitions: 0,
      dueDate: null, lastReview: null, nextReview: null,
      srsState: 'new' // new | learning | review
    };

    // Track stats for backward compat
    if (quality >= 3) {
      prog.correctCount = (prog.correctCount || 0) + 1;
      prog.streak = (prog.streak || 0) + 1;
    } else {
      prog.wrongCount = (prog.wrongCount || 0) + 1;
      prog.streak = 0;
    }

    const result = this._computeSM2(prog, quality);
    prog.easeFactor = result.easeFactor;
    prog.interval = result.interval;
    prog.repetitions = result.repetitions;
    prog.srsState = result.srsState;
    prog.dueDate = Date.now() + result.interval * 86400000; // interval is in days
    prog.lastReview = Date.now();
    prog.nextReview = prog.dueDate;
    prog.level = Math.min(5, Math.floor(prog.repetitions));

    await this.saveProgress(prog);
    return prog;
  }

  /**
   * Core SM-2 computation. Returns new { easeFactor, interval, repetitions, srsState }.
   * interval is in fractional days.
   */
  _computeSM2(prog, quality) {
    let ef = prog.easeFactor || 2.5;
    let interval = prog.interval || 0;
    let reps = prog.repetitions || 0;

    if (quality === 1) {
      // AGAIN — reset
      reps = 0;
      interval = 1 / 1440; // ~1 minute in days
      // Ease penalty
      ef = Math.max(1.3, ef - 0.2);
      return { easeFactor: ef, interval, repetitions: reps, srsState: 'learning' };
    }

    if (quality === 2) {
      // HARD — small progression, ease penalty
      ef = Math.max(1.3, ef - 0.15);
      if (reps === 0) {
        interval = 10 / 1440; // 10 minutes
        reps = 1;
      } else if (reps === 1) {
        interval = 1; // 1 day
        reps = 2;
      } else {
        interval = Math.max(1, interval * 1.2);
        reps++;
      }
      return { easeFactor: ef, interval, repetitions: reps, srsState: reps <= 1 ? 'learning' : 'review' };
    }

    if (quality === 3) {
      // GOOD — standard SM-2 progression
      if (reps === 0) {
        interval = 10 / 1440; // 10 minutes
        reps = 1;
      } else if (reps === 1) {
        interval = 1; // 1 day
        reps = 2;
      } else if (reps === 2) {
        interval = 6; // 6 days
        reps = 3;
      } else {
        interval = interval * ef;
        reps++;
      }
      return { easeFactor: ef, interval, repetitions: reps, srsState: reps <= 1 ? 'learning' : 'review' };
    }

    // quality === 4 — EASY: bonus multiplier + ease boost
    ef = ef + 0.15;
    if (reps === 0) {
      interval = 4; // skip learning, straight to 4 days
      reps = 3;
    } else if (reps === 1) {
      interval = 4;
      reps = 3;
    } else {
      interval = interval * ef * 1.3;
      reps++;
    }
    return { easeFactor: ef, interval, repetitions: reps, srsState: 'review' };
  }

  /**
   * Preview what each grade button would produce for a card.
   * Returns { 1: intervalStr, 2: intervalStr, 3: intervalStr, 4: intervalStr }
   */
  computeNextIntervals(prog) {
    const result = {};
    for (let q = 1; q <= 4; q++) {
      const sm = this._computeSM2(prog || { easeFactor: 2.5, interval: 0, repetitions: 0 }, q);
      result[q] = this._formatInterval(sm.interval);
    }
    return result;
  }

  _formatInterval(days) {
    if (days < 1 / 1440) return '< 1m';
    if (days < 1 / 60) return Math.round(days * 1440) + 'm';
    if (days < 1 / 24) return Math.round(days * 1440) + 'm';
    if (days < 1) return Math.round(days * 24) + 'h';
    if (days < 30) return Math.round(days) + 'd';
    if (days < 365) return Math.round(days / 30 * 10) / 10 + 'mo';
    return Math.round(days / 365 * 10) / 10 + 'y';
  }

  /**
   * Get all cards due for review in a category.
   * @param {string} category - hiragana | katakana | kanji | null for all
   * @returns {Promise<Array>} progress records with dueDate <= now
   */
  async getDueCards(category) {
    const all = await this.getAllProgress();
    const now = Date.now();
    return all.filter(p => {
      if (category && p.category !== category) return false;
      return p.dueDate && p.dueDate <= now && p.srsState !== 'new';
    });
  }

  /**
   * Get card IDs that the user has never studied (no progress record).
   * @param {string} category
   * @param {Array} allChars - full character list for the category
   * @param {number} limit - max new cards to return
   * @returns {Promise<Array>} character objects not yet in progress
   */
  async getNewCards(category, allChars, limit = 20) {
    const all = await this.getAllProgress();
    const studied = new Set(all.filter(p => p.category === category).map(p => p.id));
    const newCards = allChars.filter(c => !studied.has(category + '_' + c.char));
    return newCards.slice(0, limit);
  }

  /**
   * Get learning cards (recently failed, short intervals).
   */
  async getLearningCards(category) {
    const all = await this.getAllProgress();
    const now = Date.now();
    return all.filter(p => {
      if (category && p.category !== category) return false;
      return p.srsState === 'learning' && p.dueDate && p.dueDate <= now;
    });
  }

  /**
   * Get counts for dashboard: { newCount, learningCount, reviewCount }
   */
  async getDueCounts(category, allChars) {
    const all = await this.getAllProgress();
    const now = Date.now();
    const catProgress = category ? all.filter(p => p.category === category) : all;
    const studied = new Set(catProgress.map(p => p.id));

    let newCount = 0;
    if (allChars) {
      newCount = allChars.filter(c => !studied.has(category + '_' + c.char)).length;
    }

    let learningCount = 0;
    let reviewCount = 0;
    catProgress.forEach(p => {
      if (!p.dueDate || p.dueDate > now) return;
      if (p.srsState === 'learning') learningCount++;
      else reviewCount++;
    });

    return { newCount, learningCount, reviewCount };
  }

  // Custom Vocabulary
  async addCustomVocab(vocab) {
    vocab.createdAt = Date.now();
    return this._req(this._tx('customVocab', 'readwrite').add(vocab));
  }

  async getAllCustomVocab() {
    return this._req(this._tx('customVocab').getAll());
  }

  async deleteCustomVocab(id) {
    return this._req(this._tx('customVocab', 'readwrite').delete(id));
  }

  // Stats
  async getStats() {
    let s = await this._req(this._tx('stats').get('global'));
    return s || { id: 'global', totalReviews: 0, totalCorrect: 0, streak: 0,
      lastStudy: null, bestStreak: 0, quizzesTaken: 0, quizBestScore: 0 };
  }

  async updateStats(correct) {
    const s = await this.getStats();
    s.totalReviews++;
    if (correct) s.totalCorrect++;
    const today = new Date().toDateString();
    const lastDay = s.lastStudy ? new Date(s.lastStudy).toDateString() : null;
    if (lastDay !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      s.streak = (lastDay === yesterday) ? s.streak + 1 : 1;
    }
    s.lastStudy = Date.now();
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    await this._req(this._tx('stats', 'readwrite').put(s));
    return s;
  }

  async updateQuizStats(score, total) {
    const s = await this.getStats();
    s.quizzesTaken++;
    const pct = Math.round((score / total) * 100);
    s.quizBestScore = Math.max(s.quizBestScore, pct);
    await this._req(this._tx('stats', 'readwrite').put(s));
    return s;
  }

  // Lesson progress
  async getLessonProgress(lessonId) {
    return this._req(this._tx('lessonProgress').get(lessonId));
  }

  async getAllLessonProgress() {
    return this._req(this._tx('lessonProgress').getAll());
  }

  async saveLessonProgress(lessonId, completed, score) {
    return this._req(this._tx('lessonProgress', 'readwrite').put({
      lessonId, completed, score, completedAt: completed ? Date.now() : null
    }));
  }

  // Export / Import
  async exportData() {
    const progress = await this.getAllProgress();
    const vocab = await this.getAllCustomVocab();
    const stats = await this.getStats();
    const lessons = await this.getAllLessonProgress();
    return JSON.stringify({ progress, vocab, stats, lessons, exportDate: new Date().toISOString() }, null, 2);
  }

  async importData(jsonStr) {
    const data = JSON.parse(jsonStr);
    const stores = ['progress', 'customVocab', 'stats', 'lessonProgress'];
    const tx = this.db.transaction(stores, 'readwrite');
    if (data.progress) data.progress.forEach(p => tx.objectStore('progress').put(p));
    if (data.vocab) data.vocab.forEach(v => tx.objectStore('customVocab').put(v));
    if (data.stats) tx.objectStore('stats').put(data.stats);
    if (data.lessons) data.lessons.forEach(l => tx.objectStore('lessonProgress').put(l));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAllData() {
    const stores = ['progress', 'customVocab', 'stats', 'lessonProgress'];
    const tx = this.db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}
