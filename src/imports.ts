import ts from "typescript";

import type { ImportSpecifier, ManualReviewItem } from "./types.js";

export interface ImportExtractionResult {
  readonly imports: ImportSpecifier[];
  readonly manualReview: ManualReviewItem[];
}

export function extractImportSpecifiers(
  sourceFile: ts.SourceFile,
): ImportExtractionResult {
  const imports: ImportSpecifier[] = [];
  const manualReview: ManualReviewItem[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ kind: "esm", specifier: node.moduleSpecifier.text });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ kind: "re-export", specifier: node.moduleSpecifier.text });
    } else if (ts.isCallExpression(node)) {
      collectCallExpression(sourceFile, node, imports, manualReview);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { imports, manualReview };
}

function collectCallExpression(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  imports: ImportSpecifier[],
  manualReview: ManualReviewItem[],
): void {
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
    collectModuleCall(sourceFile, node, "require", imports, manualReview);
    return;
  }

  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    collectModuleCall(sourceFile, node, "dynamic-import", imports, manualReview);
  }
}

function collectModuleCall(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  kind: "require" | "dynamic-import",
  imports: ImportSpecifier[],
  manualReview: ManualReviewItem[],
): void {
  const [specifier] = node.arguments;

  if (specifier && ts.isStringLiteralLike(specifier)) {
    imports.push({ kind, specifier: specifier.text });
    return;
  }

  manualReview.push({
    file: sourceFile.fileName,
    reason: kind === "require" ? "non-literal require" : "non-literal dynamic import",
    detail: node.getText(sourceFile),
  });
}
