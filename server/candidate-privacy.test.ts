import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

process.env.DATABASE_URL ||= "postgres://hirepass_test:hirepass_test@127.0.0.1:1/hirepass_test";

let pool: typeof import("./db").pool;
let eraseCandidatePii: typeof import("./candidate-privacy").eraseCandidatePii;
let originalConnect: typeof pool.connect;

before(async () => {
  ({ pool } = await import("./db"));
  ({ eraseCandidatePii } = await import("./candidate-privacy"));
  originalConnect = pool.connect;
});

afterEach(() => { pool.connect = originalConnect; });

describe("candidate privacy erasure", () => {
  it("anonymises PII and free text while preserving application and audit rows", async () => {
    const statements: string[] = [];
    const client = {
      query: async (query: string) => {
        statements.push(query.replace(/\s+/g, " ").trim());
        if (query.includes("select id, name, cv_file_path")) return { rows: [{ id: 42, name: "Named Candidate", cv_file_path: null }] };
        if (query.includes("select cd.file_path")) return { rows: [] };
        return { rows: [], rowCount: 1 };
      },
      release: () => undefined,
    };
    pool.connect = (async () => client) as any;

    assert.equal(await eraseCandidatePii(42), true);
    const sql = statements.join("\n").toLowerCase();
    assert.match(sql, /is_anonymized = true/);
    assert.match(sql, /update candidate_links set is_active = false/);
    assert.match(sql, /update notifications set title = 'candidate update'/);
    assert.match(sql, /delete from candidate_messages/);
    assert.match(sql, /update pass_candidates set ai_brief = null/);
    assert.equal(sql.includes("delete from pass_candidates"), false);
    assert.equal(sql.includes("delete from activity_log"), false);
    assert.match(sql, /commit/);
  });
});
