/**
 * no-hooks-after-return
 *
 * Custom ESLint rule that catches the #1 cause of
 * "Rendered more hooks than during the previous render":
 *
 *   function Component() {
 *     const a = useA();
 *     if (loading) return <Spinner />;   // ← early return
 *     const b = useB();                  // ← BANNED: hook after early return
 *   }
 *
 * Rules of Hooks (the official plugin) catches hooks inside `if (...) {
 * useX() }` blocks but does NOT catch hooks called *after* a sibling
 * early `return`/`throw` at the top level of a component body. That gap
 * is exactly what produced the PodReport / JobDetail crashes.
 *
 * This rule walks every function whose name starts with an uppercase
 * letter (component) or `use` (custom hook), tracks whether any
 * top-level statement before the current one contained an unconditional
 * `return` or `throw`, and reports any hook call that follows it.
 *
 * Heuristics:
 *  - A hook is any `CallExpression` whose callee name matches /^use[A-Z]/.
 *  - An "unconditional exit" is a `ReturnStatement`/`ThrowStatement`
 *    that lives directly inside an `IfStatement` / `else` branch /
 *    block at the function's top level. We treat any `IfStatement`
 *    whose consequent ends in return/throw as an early-return guard.
 *  - We only walk the *direct* body of the component/hook — nested
 *    function declarations, arrow callbacks (effects, memos, event
 *    handlers) are ignored because hooks inside them are already
 *    forbidden by `react-hooks/rules-of-hooks`.
 */

"use strict";

const HOOK_NAME_RE = /^use[A-Z0-9]/;

function isHookCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") return HOOK_NAME_RE.test(callee.name);
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    return HOOK_NAME_RE.test(callee.property.name);
  }
  return false;
}

/** True if the given function name is a component or custom hook. */
function isComponentOrHook(name) {
  if (!name) return false;
  return /^[A-Z]/.test(name) || HOOK_NAME_RE.test(name);
}

/** True if the statement is `return ...;` or `throw ...;`. */
function isExitStatement(stmt) {
  return stmt && (stmt.type === "ReturnStatement" || stmt.type === "ThrowStatement");
}

/**
 * True if the given statement contains an unconditional early exit at
 * its top level. Handles:
 *   if (x) return ...;
 *   if (x) { return ...; }
 *   if (x) { ...; throw new Error(); }
 *   return ...;
 *   throw ...;
 */
function statementContainsEarlyExit(stmt) {
  if (!stmt) return false;
  if (isExitStatement(stmt)) return true;

  if (stmt.type === "IfStatement") {
    const consequentExits = blockEndsWithExit(stmt.consequent);
    return consequentExits;
  }

  return false;
}

function blockEndsWithExit(node) {
  if (!node) return false;
  if (isExitStatement(node)) return true;
  if (node.type === "BlockStatement") {
    for (const s of node.body) {
      if (isExitStatement(s)) return true;
    }
  }
  return false;
}

/** Walk a function body looking for hooks declared after an early exit. */
function checkBody(context, body) {
  if (!body || body.type !== "BlockStatement") return;
  let sawEarlyExit = false;
  let firstExitNode = null;

  for (const stmt of body.body) {
    if (sawEarlyExit) {
      // Look for hook calls inside this statement (top-level only —
      // nested functions are out of scope).
      collectTopLevelHookCalls(stmt).forEach((hook) => {
        context.report({
          node: hook,
          messageId: "hookAfterReturn",
          data: {
            hook:
              hook.callee.type === "Identifier"
                ? hook.callee.name
                : hook.callee.property?.name ?? "useX",
          },
        });
      });
    }
    if (statementContainsEarlyExit(stmt)) {
      sawEarlyExit = true;
      firstExitNode ??= stmt;
    }
  }
}

/**
 * Return every hook call that is "top-level" with respect to the
 * containing component — i.e. NOT inside a nested function/arrow.
 * Variable declarations like `const x = useX()` and bare `useX();`
 * expression statements are both covered.
 */
function collectTopLevelHookCalls(stmt) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    // Stop descending into nested functions — hooks inside them are
    // a different problem class handled by rules-of-hooks.
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      return;
    }
    if (node.type === "CallExpression" && isHookCall(node)) {
      found.push(node);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc" || key === "range") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === "string") visit(child);
    }
  }
  visit(stmt);
  return found;
}

function getFunctionName(node) {
  if (node.id?.name) return node.id.name;
  // const Foo = () => {...}  /  const useFoo = function () {...}
  if (node.parent?.type === "VariableDeclarator" && node.parent.id?.name) {
    return node.parent.id.name;
  }
  return null;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow React hook calls that appear after an early return/throw inside a component or custom hook (prevents 'Rendered more hooks than during the previous render').",
    },
    messages: {
      hookAfterReturn:
        "React Hook \"{{hook}}\" is called after an early return. Move it above every conditional `return`/`throw` so the hook order is stable across renders.",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      const name = getFunctionName(node);
      if (!isComponentOrHook(name)) return;
      checkBody(context, node.body);
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression(node) {
        // Arrow functions only count when assigned to a Component/hook name.
        if (node.body?.type !== "BlockStatement") return;
        check(node);
      },
    };
  },
};
