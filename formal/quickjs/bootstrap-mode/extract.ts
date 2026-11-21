import assert from 'node:assert/strict';
import ts from 'typescript';

export interface BootstrapSite {
  filename: string;
  code: string;
  options: { type: 'global'; strict?: boolean };
}

/** Extract function expressions from the production AST and erase types directly.
 * No imported function's toString output or TSX-generated closure is evaluated. */
export function extractFactory(source: string, name: string): string {
  const file = ts.createSourceFile(name + '.ts', source, ts.ScriptTarget.ES2022, true);
  const matches = file.statements.filter(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.equal(matches.length, 1, 'Unique production factory declaration: ' + name);
  const node = matches[0];
  assert(node.body);
  const expression = ts.factory.createFunctionExpression(
    undefined,
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    node.body,
  );
  const printed = ts.createPrinter().printNode(ts.EmitHint.Expression, expression, file);
  const output = ts.transpileModule('const extracted = ' + printed + ';', {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      noEmitHelpers: true,
    },
    reportDiagnostics: true,
  });
  const errors =
    output.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error) ??
    [];
  assert.equal(
    errors.length,
    0,
    errors
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n'))
      .join('\n'),
  );
  const javascript = ts.createSourceFile(
    name + '.js',
    output.outputText,
    ts.ScriptTarget.ES2022,
    true,
  );
  // Compiler-added outer script strictness is not function source. Production
  // Function.toString also omits its containing module's strictness.
  const statements = javascript.statements.filter(
    (node) =>
      !(
        ts.isExpressionStatement(node) &&
        ts.isStringLiteral(node.expression) &&
        node.expression.text === 'use strict'
      ),
  );
  assert.equal(statements.length, 1, 'Type erasure adds no runtime helper statements');
  const statement = statements[0];
  assert(ts.isVariableStatement(statement));
  const value = statement.declarationList.declarations[0].initializer;
  assert(value && ts.isFunctionExpression(value));
  assert.equal(value.name?.text, name);
  return value.getText(javascript);
}

const expectedFactories = new Map([
  ['privacy:legacy-regexp', ['installGuestRegExpLegacy']],
  ['privacy:bindings', ['installGuestRuntime', 'allocateIdentity']],
  ['privacy:binary', ['installGuestBinary']],
]);

export function extractSites(
  source: string,
  factories: ReadonlyMap<string, string>,
): BootstrapSite[] {
  const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.ES2022, true);
  const sites: BootstrapSite[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'evalCode' &&
      node.arguments[1] &&
      ts.isStringLiteral(node.arguments[1])
    ) {
      const filename = node.arguments[1].text;
      const expected = expectedFactories.get(filename);
      if (expected) {
        assert.equal(node.arguments.length, 3, 'Privacy evaluation has explicit options');
        const template = node.arguments[0];
        assert(ts.isTemplateExpression(template));
        const names: string[] = [];
        let code = template.head.text;
        for (const span of template.templateSpans) {
          const call = span.expression;
          assert(ts.isCallExpression(call) && call.arguments.length === 0);
          assert(
            ts.isPropertyAccessExpression(call.expression) &&
              call.expression.name.text === 'toString',
          );
          const factory = call.expression.expression;
          assert(ts.isIdentifier(factory));
          names.push(factory.text);
          const extracted = factories.get(factory.text);
          assert(extracted, 'Every evaluated factory has a production AST extraction');
          code += extracted + span.literal.text;
        }
        assert.deepEqual(names, expected, 'Factory and allocator source correspondence');
        const options = node.arguments[2];
        assert(ts.isObjectLiteralExpression(options));
        const parsed: { type?: 'global'; strict?: boolean } = {};
        for (const property of options.properties) {
          assert(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name));
          if (property.name.text === 'type') {
            assert(
              ts.isStringLiteral(property.initializer) &&
                property.initializer.text === 'global',
            );
            parsed.type = 'global';
          } else {
            assert.equal(property.name.text, 'strict');
            assert.equal(property.initializer.kind, ts.SyntaxKind.TrueKeyword);
            parsed.strict = true;
          }
        }
        assert.equal(parsed.type, 'global');
        sites.push({
          filename,
          code,
          options: { type: 'global', ...(parsed.strict ? { strict: true } : {}) },
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.deepEqual(
    sites.map(({ filename }) => filename).sort(),
    [...expectedFactories.keys()].sort(),
  );
  return sites;
}

/** Remove the actual strict option only in temporary ASTs used by the control. */
export function omitStrictOptions(source: string): string {
  const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.ES2022, true);
  let changed = 0;
  const transformed = ts.transform(file, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'evalCode' &&
          node.arguments[1] &&
          ts.isStringLiteral(node.arguments[1]) &&
          expectedFactories.has(node.arguments[1].text)
        ) {
          const options = node.arguments[2];
          assert(ts.isObjectLiteralExpression(options));
          const properties = options.properties.filter((property) => {
            const remove =
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.name) &&
              property.name.text === 'strict';
            if (remove) changed++;
            return !remove;
          });
          return ts.factory.updateCallExpression(
            node,
            node.expression,
            node.typeArguments,
            [
              node.arguments[0],
              node.arguments[1],
              ts.factory.updateObjectLiteralExpression(options, properties),
            ],
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit) as ts.SourceFile;
    },
  ]);
  try {
    assert.equal(changed, 3, 'The control omits exactly three production strict options');
    return ts.createPrinter().printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
}

export function checkApplicationMode(source: string): void {
  const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.ES2022, true);
  let found = false;
  function visit(node: ts.Node) {
    if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'evaluate'
    ) {
      const mode = node.parameters.find(
        (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === 'mode',
      );
      assert(
        mode?.initializer &&
          ts.isStringLiteral(mode.initializer) &&
          mode.initializer.text === 'global',
      );
      function call(candidate: ts.Node) {
        if (
          ts.isCallExpression(candidate) &&
          ts.isPropertyAccessExpression(candidate.expression) &&
          candidate.expression.name.text === 'evalCode'
        ) {
          assert.equal(candidate.arguments.length, 3);
          const options = candidate.arguments[2];
          assert(
            ts.isObjectLiteralExpression(options) && options.properties.length === 1,
          );
          const type = options.properties[0];
          assert(
            ts.isPropertyAssignment(type) &&
              ts.isIdentifier(type.name) &&
              type.name.text === 'type',
          );
          assert(ts.isIdentifier(type.initializer) && type.initializer.text === 'mode');
          found = true;
        }
        ts.forEachChild(candidate, call);
      }
      ts.forEachChild(node, call);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert(
    found,
    'Application evaluate keeps caller-selected type without a forced strict flag',
  );
}
