import assert from "node:assert/strict";
import test from "node:test";
import { BookRole, PrincipalKind } from "@myos/shared";
import { currentBookId, isBookId, withBook } from "../../src/core/books/bookContext.js";
import { bookFromKey, isOwner } from "../../src/core/resourceBuilder/resourceBuilder.auth.js";

test("a book key names the one book it was minted for", () => {
  assert.equal(bookFromKey("myos_dibs_Zx9-abc_def"), "dibs");
  assert.equal(bookFromKey("myos_personal_abc"), "personal");
  assert.equal(bookFromKey("myos_NOT A BOOK_abc"), undefined);
  assert.equal(bookFromKey("eyJhbGciOi..."), undefined);
});

test("book ids are short lowercase slugs", () => {
  assert.ok(isBookId("dibs"));
  assert.ok(isBookId("personal-2"));
  assert.equal(isBookId("../personal"), false);
  assert.equal(isBookId("Dibs"), false);
});

test("the book follows the request and is gone outside it", async () => {
  await withBook("dibs", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(currentBookId(), "dibs");
  });
  assert.throws(() => currentBookId());
});

test("a member owns only the book they were resolved for; the system key owns every book", () => {
  const willy = { id: "w", kind: PrincipalKind.MEMBER, email: "willy@dibs-parking.com", bookId: "dibs", role: BookRole.MEMBER };
  const signedInOnly = { id: "w", kind: PrincipalKind.MEMBER, email: "willy@dibs-parking.com" };
  const system = { id: "system", kind: PrincipalKind.API_KEY };
  withBook("dibs", () => {
    assert.equal(isOwner(willy), true);
    assert.equal(isOwner(signedInOnly), false);
    assert.equal(isOwner(system), true);
  });
  withBook("personal", () => assert.equal(isOwner(willy), false));
  assert.equal(isOwner(willy), false);
});
