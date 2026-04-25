// 漢字マスター - IndexedDB Database Layer
class JapaneseDB {
  constructor() {
    this.dbName = 'kanjiMasterDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('progress')) {
          const ps = db.createObjectStore('progress', { keyPath: 'id' });
          ps.createIndex('category', 'category', { unique: false });
          ps.createIndex('lastReview', 'lastReview', { unique: false });
        }
        if (!db.objectStoreNames.contains('customVocab')) {
          const cv = db.createObjectStore('customVocab', { keyPath: 'id', autoIncrement: true });
          cv.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('lessonProgress')) {
          db.createObjectStore('lessonProgress', { keyPath: 'lessonId' });
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

  async updateCharacterProgress(charId, category, correct) {
    let prog = await this.getProgress(charId) || {
      id: charId, category, correctCount: 0, wrongCount: 0,
      level: 0, lastReview: null, nextReview: null, streak: 0
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
