/**
 * no-hooks-after-return — see eslint-local-rules/index.js for full doc.
 *
 * Catches the gap left by react-hooks/rules-of-hooks: hooks declared
 * AFTER an early `return`/`throw` at the top level of a component or
 * custom hook. This is the exact pattern that produced PodReport's
 * "Rendered more hooks than during the previous render" crash.
 */

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

function isComponentOrHook(name) {
  if (!name) return false;
  return /^[A-Z]/.test(name) || HOOK_NAME_RE.test(name);
}

function isExitStatement(stmt) {
  return stmt && (stmt.type === "ReturnStatement" || stmt.type === "ThrowStatement");
}

function blockEndsWithExit(node) {
  if (!node) return false;
  if (isExitStatement(node)) return true;
  if (node.type === "BlockStatement") {
    for (const s of node.body) if (isExitStatement(s)) return true;
  }
  return false;
}

function statementContainsEarlyExit(stmt) {
  if (!stmt) return false;
  if (isExitStatement(stmt)) return true;
  if (stmt.type === "IfStatement") return blockEndsWithExit(stmt.consequent);
  return false;
}

function collectTopLevelHookCalls(stmt) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) return;
    if (node.type === "CallExpression" && isHookCall(node)) found.push(node);
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
  if (node.parent?.type === "VariableDeclarator" && node.parent.id?.name) {
    return node.parent.id.name;
  }
  return null;
}

function checkBody(context, body) {
  if (!body || body.type !== "BlockStatement") return;
  let sawEarlyExit = false;
  for (const stmt of body.body) {
    if (sawEarlyExit) {
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
    if (statementContainsEarlyExit(stmt)) sawEarlyExit = true;
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow React hook calls that appear after an early return/throw inside a component or custom hook.",
    },
    messages: {
      hookAfterReturn:
        'React Hook "{{hook}}" is called after an early return. Move it above every conditional `return`/`throw` so the hook order is stable across renders.',
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
        if (node.body?.type !== "BlockStatement") return;
        check(node);
      },
    };
  },
};
