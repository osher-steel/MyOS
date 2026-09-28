// Drives defineResource end to end over HTTP with an in-memory repo, so the
// auth → validate → hooks → envelope pipeline is proven without Firestore.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { z } from "zod";
import { ServiceNotFoundError } from "../../src/core/errors/errors.js";
import { defineListQuery } from "../../src/core/firestore/firestoreQuery.js";
import { defineResource } from "../../src/core/resourceBuilder/resourceBuilder.js";
import type { DomainInner, WriteChange } from "../../src/core/resourceBuilder/resourceBuilder.types.js";

process.env.MYOS_API_KEY = "myos_test_key";

type Note = { id: string; title: string; createdAt: Date };

class MemoryRepo {
  private rows = new Map<string, Note>();
  private seq = 0;

  async get(id: string): Promise<Note> {
    const row = this.rows.get(id);
    if (!row) throw new ServiceNotFoundError("note not found");
    return row;
  }
  async list() {
    return { data: [...this.rows.values()], cursor: undefined, total: undefined };
  }
  async create(record: Omit<Note, "id">, id?: string): Promise<Note> {
    const row = { ...record, id: id ?? `n${++this.seq}` };
    this.rows.set(row.id, row);
    return row;
  }
  async patch(id: string, patch: Partial<Note>): Promise<Note> {
    const row = await this.get(id);
    const next = { ...row, ...patch };
    this.rows.set(id, next);
    return next;
  }
  async delete(id: string): Promise<void> {
    await this.get(id);
    this.rows.delete(id);
  }
}

const createSchema = z.object({ title: z.string().trim().min(1) }).strict();
const recordSchema = createSchema.extend({ createdAt: z.date() });
const patchSchema = createSchema.partial().strict();
const query = defineListQuery([{ key: "title", type: "stringFilter", sortable: true }] as const);

const writes: WriteChange[] = [];

const noteDomain: DomainInner = {
  resourceName: "note",
  repo: new MemoryRepo() as never,
  schemas: { query: query.schema, create: createSchema, patch: patchSchema, record: recordSchema },
  buildCreateRecord: (input) => ({ ...(input as object), createdAt: new Date() }),
  afterWrite: async (change) => {
    writes.push(change);
  },
};

const note = defineResource({
  inner: noteDomain,
  endpoints: {
    get: { permission: "none" },
    list: { permission: "none" },
    create: { permission: "owner" },
    patch: { permission: "owner" },
    delete: { permission: "owner" },
  },
  actions: {
    shout: {
      method: "post",
      path: "/:id/shout",
      permission: "owner",
      run: async ({ existing }) => ({ body: { data: (existing as Note).title.toUpperCase() } }),
    },
  },
});

const app = express();
app.set("query parser", "extended");
app.use(express.json());
app.use("/notes", note.router);

let server: Server;
let base: string;
const OWNER = { Authorization: "Bearer myos_test_key" };

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(() => server.close());

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: res.status === 204 ? undefined : await res.json() };
}

test("create is refused without the owner and succeeds with the API key", async () => {
  const anon = await call("POST", "/notes", { title: "x" });
  assert.equal(anon.status, 403);
  assert.deepEqual(anon.body, { error: "Forbidden", code: "forbidden" });

  const wrongKey = await call("POST", "/notes", { title: "x" }, { Authorization: "Bearer myos_nope" });
  assert.equal(wrongKey.status, 403);

  const created = await call("POST", "/notes", { title: "Groceries" }, OWNER);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.title, "Groceries");
  assert.ok(created.body.data.id);
});

test("validation failures use the shared error envelope", async () => {
  const res = await call("POST", "/notes", { title: "", extra: 1 }, OWNER);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "validation_error");
  assert.equal(res.body.error, "Invalid note payload.");
  assert.ok(res.body.details.fieldErrors.title);
});

test("list validates query params and get returns 404 through processError", async () => {
  const bad = await call("GET", "/notes?bogus=1");
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "validation_error");

  const ok = await call("GET", "/notes?title[prefix]=Gro");
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body.data));

  const missing = await call("GET", "/notes/nope");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "note not found", code: "not_found" });
});

test("patch, actions and delete run through the same pipeline", async () => {
  const created = await call("POST", "/notes", { title: "Rent" }, OWNER);
  const id = created.body.data.id as string;

  const patched = await call("PATCH", `/notes/${id}`, { title: "Rent + utilities" }, OWNER);
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.title, "Rent + utilities");

  const shouted = await call("POST", `/notes/${id}/shout`, undefined, OWNER);
  assert.equal(shouted.status, 200);
  assert.equal(shouted.body.data, "RENT + UTILITIES");

  const deleted = await call("DELETE", `/notes/${id}`, undefined, OWNER);
  assert.equal(deleted.status, 204);

  const gone = await call("GET", `/notes/${id}`);
  assert.equal(gone.status, 404);
});

test("afterWrite sees before and after for create, patch and delete", async () => {
  writes.length = 0;
  const created = await call("POST", "/notes", { title: "Rent" }, OWNER);
  const id = created.body.data.id as string;
  await call("PATCH", `/notes/${id}`, { title: "Rent due" }, OWNER);
  await call("DELETE", `/notes/${id}`, undefined, OWNER);

  const titles = (note: unknown) => (note as Note | null)?.title ?? null;
  assert.deepEqual(
    writes.map((change) => [change.id, titles(change.before), titles(change.after)]),
    [
      [id, null, "Rent"],
      [id, "Rent", "Rent due"],
      [id, "Rent due", null],
    ],
  );
});
