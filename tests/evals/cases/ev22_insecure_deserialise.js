// tests/evals/cases/ev22_insecure_deserialise.js
// Eval case ev22 (HELD-OUT): unsafe deserialisation via node:vm with user input (security).
// Expected: security finding, critical severity, on the vm.runInNewContext line.
import vm from 'node:vm';

export function safeEval(userCode) {
  const context = { result: null };
  vm.createContext(context);
  vm.runInNewContext(userCode, context);
  return context.result;
}
