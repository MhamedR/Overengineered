import { API } from "typescript/unstable/sync";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import {
  type Decorator,
  type ModifierLike,
  type Node,
  type NodeArray,
  type ScriptKind,
  type ScriptTarget,
  type SourceFile,
  ScriptKind as ScriptKinds,
  isClassDeclaration,
  isClassExpression,
  isDecorator,
  isGetAccessorDeclaration,
  isSetAccessorDeclaration,
  isClassLikeDeclaration,
} from "typescript/unstable/ast";

export {
  ModifierFlags,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  isArrayTypeNode,
  isArrowFunction,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isCaseClause,
  isCatchClause,
  isClassDeclaration,
  isClassExpression,
  isConditionalExpression,
  isConstructorDeclaration,
  isConstructorTypeNode,
  isDebuggerStatement,
  isDecorator,
  isDoStatement,
  isEmptyStatement,
  isEnumDeclaration,
  isEnumMember,
  isExportDeclaration,
  isExpressionStatement,
  isExpressionWithTypeArguments,
  isForInStatement,
  isForOfStatement,
  isForStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isHeritageClause,
  isIdentifier,
  isIfStatement,
  isImportClause,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportSpecifier,
  isIntersectionTypeNode,
  isInterfaceDeclaration,
  isJsxAttribute,
  isLiteralTypeNode,
  isMethodDeclaration,
  isModuleDeclaration,
  isNamedExports,
  isNamespaceImport,
  isNewExpression,
  isNumericLiteral,
  isParameterDeclaration as isParameter,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isPropertyDeclaration,
  isQualifiedName,
  isReturnStatement,
  isSetAccessorDeclaration,
  isStringLiteral,
  isSwitchStatement,
  isThrowStatement,
  isTupleTypeNode,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeNode,
  isTypeOperatorNode,
  isTypeParameterDeclaration,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  isVariableStatement,
  isWhileStatement,
  isMethodSignatureDeclaration as isMethodSignature,
  isPropertySignatureDeclaration as isPropertySignature,
  type ArrowFunction,
  type CallExpression,
  type ClassDeclaration,
  type ConstructorDeclaration,
  type Expression,
  type ExpressionWithTypeArguments,
  type FunctionDeclaration,
  type FunctionExpression,
  type GetAccessorDeclaration,
  type HeritageClause,
  type Identifier,
  type InterfaceDeclaration,
  type MethodDeclaration,
  type Node,
  type NodeArray,
  type ParameterDeclaration,
  type PropertyName,
  type SetAccessorDeclaration,
  type SourceFile,
  type Statement,
  type TypeAliasDeclaration,
  type TypeNode,
  type TypeParameterDeclaration,
} from "typescript/unstable/ast";

export const isGetAccessor = isGetAccessorDeclaration;
export const isSetAccessor = isSetAccessorDeclaration;
export const isClassLike = isClassLikeDeclaration;

const filesystem = createVirtualFileSystem({});
let session: API | undefined;
let sequence = 0;

export function createSourceFile(
  fileName: string,
  text: string,
  _target?: ScriptTarget,
  _setParentNodes?: boolean,
  kind?: ScriptKind,
): SourceFile {
  const virtual = `/overengineered/${sequence++}${extensionFor(kind, fileName)}`;
  const writeFile = filesystem.writeFile;
  if (!writeFile) throw new Error("The TypeScript file system cannot store a source file.");
  writeFile(virtual, text);
  const api = (session ??= new API({ fs: filesystem }));
  const snapshot = api.updateSnapshot({ openFiles: [virtual] });
  try {
    const source = snapshot.getDefaultProjectForFile(virtual)?.program.getSourceFile(virtual);
    if (!source) throw new Error(`TypeScript could not parse ${fileName}.`);
    return source;
  } finally {
    snapshot.dispose();
    api.updateSnapshot({ closeFiles: [virtual] });
  }
}

export function forEachChild(node: Node, callback: (node: Node) => void): void {
  node.forEachChild(callback);
}

export function canHaveModifiers(node: Node): node is Node & { modifiers?: NodeArray<ModifierLike> } {
  return "modifiers" in node;
}

export function getModifiers(node: Node): NodeArray<ModifierLike> | undefined {
  return canHaveModifiers(node) ? node.modifiers : undefined;
}

export function canHaveDecorators(node: Node): boolean {
  return isClassDeclaration(node) || isClassExpression(node);
}

export function getDecorators(node: Node): readonly Decorator[] | undefined {
  const modifiers = getModifiers(node);
  const decorators = modifiers?.filter(isDecorator);
  return decorators && decorators.length > 0 ? decorators : undefined;
}

function extensionFor(kind: ScriptKind | undefined, fileName: string): string {
  if (kind === ScriptKinds.TSX) return ".tsx";
  if (kind === ScriptKinds.JSX) return ".jsx";
  if (kind === ScriptKinds.JS) return ".js";
  if (kind === ScriptKinds.TS) return ".ts";
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tsx")) return ".tsx";
  if (lower.endsWith(".jsx")) return ".jsx";
  if (lower.endsWith(".mjs")) return ".mjs";
  if (lower.endsWith(".cjs")) return ".cjs";
  if (/\.jsx?$/.test(lower)) return ".js";
  return ".ts";
}
