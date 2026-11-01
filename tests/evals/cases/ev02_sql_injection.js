// tests/evals/cases/ev02_sql_injection.js
// Eval case ev02 (train): violates STD-002 (parameterised queries).
// Expected: security finding citing STD-002, high or critical severity, on the query line.
export async function getUserByName(db, name) {
  const result = await db.query(`SELECT * FROM users WHERE username = '${name}'`);
  return result.rows[0];
}
