// tests/evals/cases/ev15_missing_authz.js
// Eval case ev15 (train): missing authorisation check before sensitive operation (security).
// Expected: security finding, high severity, on the delete line.
export async function deleteAccount(db, req) {
  const userId = req.params.id;
  await db.query('DELETE FROM accounts WHERE id = $1', [userId]);
}
