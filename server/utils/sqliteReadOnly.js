let DatabaseCtor;
let openReadOnlyDatabase;

try {
  const { DatabaseSync } = await import('node:sqlite');
  DatabaseCtor = DatabaseSync;
  openReadOnlyDatabase = (filename) => new DatabaseCtor(filename, { readOnly: true });
} catch {
  try {
    const mod = await import('better-sqlite3');
    DatabaseCtor = mod.default ?? mod;
    openReadOnlyDatabase = (filename) => new DatabaseCtor(filename, { readonly: true, fileMustExist: true });
  } catch (error) {
    throw new Error(
      'No SQLite driver available. Use Node.js v22+ (node:sqlite) or install the optional dependency better-sqlite3.',
      { cause: error }
    );
  }
}

export function openSqliteReadOnly(filename) {
  const db = openReadOnlyDatabase(filename);

  return {
    all: async (sql, params) => {
      const stmt = db.prepare(sql);
      if (params === undefined) return stmt.all();
      return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
    },
    get: async (sql, params) => {
      const stmt = db.prepare(sql);
      if (params === undefined) return stmt.get();
      return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
    },
    close: async () => {
      db.close();
    }
  };
}
