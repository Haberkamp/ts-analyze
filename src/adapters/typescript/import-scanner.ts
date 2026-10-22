import fs from "node:fs";
import ts from "typescript";

import type { ImportScanner, ScannedFile } from "../../application/ports.js";
import type { ImportKind, ImportReference, ManualReviewItem } from "../../domain/model.js";

/** Finds module references with the TypeScript parser, so comments and strings never count. */
export class TypeScriptImportScanner implements ImportScanner {
  scan(file: string): ScannedFile {
    const sourceFile = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const imports: ImportReference[] = [];
    const manualReview: ManualReviewItem[] = [];
    const lineOf = (node: ts.Node): number =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const add = (node: ts.Node, specifier: string, kind: ImportKind): void => {
      imports.push({ specifier, kind, line: lineOf(node) });
    };

    // Explicit stack instead of recursion: generated or minified files can nest very deeply.
    const pending: ts.Node[] = [sourceFile];
    for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        add(node, node.moduleSpecifier.text, "static");
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        add(node, node.moduleSpecifier.text, "static");
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        add(node, node.moduleReference.expression.text, "require");
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        add(node, node.argument.literal.text, "type");
      } else if (ts.isCallExpression(node)) {
        const kind = moduleCallKind(node);
        const [argument] = node.arguments;
        if (kind !== undefined && argument !== undefined) {
          if (ts.isStringLiteralLike(argument)) {
            add(node, argument.text, kind);
          } else {
            manualReview.push({
              file,
              line: lineOf(node),
              reason: kind === "require" ? "non-literal require" : "non-literal dynamic import",
              detail: node.getText(sourceFile),
            });
          }
        }
      }

      const children: ts.Node[] = [];
      ts.forEachChild(node, (child) => {
        children.push(child);
      });
      pending.push(...children.reverse());
    }

    return { imports, manualReview };
  }
}

function moduleCallKind(node: ts.CallExpression): "require" | "dynamic" | undefined {
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
    return "require";
  }
  return node.expression.kind === ts.SyntaxKind.ImportKeyword ? "dynamic" : undefined;
}
