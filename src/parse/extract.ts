import * as ts from "./compiler";
import type {
  BodyKind,
  CallKind,
  CallableFact,
  ClassFact,
  Facts,
  FunctionFact,
  HeritageRef,
  InterfaceFact,
  LooseStatement,
  MethodFact,
  ParameterFact,
  SourceLanguage,
  Span,
  TypeAliasFact,
} from "../types";

type CallableNode =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

interface ExtractContext {
  sourceFile: ts.SourceFile;
  facts: Facts;
  classStack: ClassFact[];
  functionStack: string[];
  exportedNames: Set<string>;
}

interface StatementCounts {
  behavioral: number;
  structural: number;
  cyclomatic: number;
}

export function nonBlankLineCount(sourceText: string): number {
  if (!sourceText) return 0;
  let count = 0;
  for (const line of sourceText.split(/\r?\n/)) {
    if (line.trim().length > 0) count += 1;
  }
  return count;
}

export function spansOverlap(left: Span, right: Span): boolean {
  return left.start < right.end && left.end > right.start;
}

export function extractFacts(sourceText: string, fileName: string, languageId: string): Facts {
  const kind = scriptKind(fileName, languageId);
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const ctx: ExtractContext = {
    sourceFile,
    facts: emptyFacts(fileName, languageOf(languageId, fileName)),
    classStack: [],
    functionStack: [],
    exportedNames: new Set(),
  };

  visit(ctx, sourceFile);
  collectLooseStatements(ctx);
  applyExportedNames(ctx);
  resolveLocalCalls(ctx);
  ctx.facts.linesOfCode = nonBlankLineCount(sourceText);
  assignStructureCounts(ctx.facts);
  return ctx.facts;
}

export function enclosingCallableSpan(facts: Facts, position: number): Span | undefined {
  const spans = [
    ...facts.functions.map((fn) => fn.span),
    ...facts.classes.flatMap((cls) => cls.methods.map((method) => method.span)),
  ].filter((span) => span.start <= position && position < span.end);
  spans.sort((left, right) => left.end - left.start - (right.end - right.start));
  return spans[0];
}

export function filterFacts(facts: Facts, sourceText: string, range: Span): Facts {
  const overlaps = (span: Span) => spansOverlap(span, range);
  const classes = facts.classes.filter((cls) => overlaps(cls.span)).map((cls) => {
    const methods = cls.methods.filter((method) => overlaps(method.span));
    const constructorIncluded = methods.some((method) => method.kind === "constructor");
    return {
      ...cls,
      methods,
      constructorParameters: constructorIncluded ? cls.constructorParameters : [],
    };
  });

  const filtered: Facts = {
    ...facts,
    linesOfCode: nonBlankLineCount(sourceText.slice(range.start, range.end)),
    interfaces: facts.interfaces.filter((item) => overlaps(item.span)),
    classes,
    functions: facts.functions.filter((fn) => overlaps(fn.span)),
    typeAliases: facts.typeAliases.filter((alias) => overlaps(alias.span)),
    callSites: facts.callSites.filter((call) => overlaps(call.span)),
    constructions: facts.constructions.filter((construction) => overlaps(construction.span)),
    instantiations: facts.instantiations.filter((instantiation) => overlaps(instantiation.span)),
    references: facts.references.filter((reference) => overlaps(reference.span)),
    moduleStatements: facts.moduleStatements.filter(overlaps),
    looseStatements: facts.looseStatements.filter((statement) => overlaps(statement.span)),
    structuralStatements: 0,
    behavioralStatements: 0,
  };
  assignStructureCounts(filtered);
  return filtered;
}

function assignStructureCounts(facts: Facts): void {
  let structural = facts.interfaces.length + facts.typeAliases.length + facts.moduleStatements.length;
  let behavioral = 0;
  for (const statement of facts.looseStatements) {
    structural += statement.structural;
    behavioral += statement.behavioral;
  }
  for (const fn of facts.functions) {
    structural += fn.structuralStatements;
    behavioral += fn.behavioralStatements;
  }
  for (const cls of facts.classes) {
    structural += cls.constructorParameters.filter((parameter) => parameter.parameterProperty).length;
    for (const method of cls.methods) {
      structural += method.structuralStatements;
      behavioral += method.behavioralStatements;
    }
  }
  facts.structuralStatements = structural;
  facts.behavioralStatements = behavioral;
}

function emptyFacts(fileName: string, language: SourceLanguage): Facts {
  return {
    fileName,
    language,
    linesOfCode: 0,
    interfaces: [],
    classes: [],
    functions: [],
    typeAliases: [],
    callSites: [],
    constructions: [],
    instantiations: [],
    references: [],
    moduleStatements: [],
    looseStatements: [],
    structuralStatements: 0,
    behavioralStatements: 0,
  };
}

function visit(ctx: ExtractContext, node: ts.Node): void {
  if (ts.isClassDeclaration(node)) {
    const name = classDeclarationName(node);
    if (!name) {
      ts.forEachChild(node, (child) => visit(ctx, child));
      return;
    }
    const fact = createClass(ctx, node, name);
    ctx.facts.classes.push(fact);
    ctx.classStack.push(fact);
    ts.forEachChild(node, (child) => visit(ctx, child));
    ctx.classStack.pop();
    return;
  }

  if (isCallable(node)) {
    const name = functionName(node, ctx.sourceFile);
    if (name) {
      recordCallable(ctx, node, name);
      return;
    }
  }

  if (ts.isInterfaceDeclaration(node)) {
    ctx.facts.interfaces.push(createInterface(ctx, node));
    ts.forEachChild(node, (child) => visit(ctx, child));
    return;
  }

  if (ts.isTypeAliasDeclaration(node)) {
    ctx.facts.typeAliases.push(createTypeAlias(ctx, node));
    ts.forEachChild(node, (child) => visit(ctx, child));
    return;
  }

  recordLoose(ctx, node);
  ts.forEachChild(node, (child) => visit(ctx, child));
}

function recordCallable(ctx: ExtractContext, node: CallableNode, name: string): void {
  const base = createCallableFact(ctx, node, name);
  const classFact = ctx.classStack.at(-1);
  const kind = methodKind(node);
  const id = classFact && kind && isClassMember(node) ? `${classFact.name}.${name}` : name;

  if (classFact && kind && isClassMember(node)) {
    const method: MethodFact = { ...base, kind };
    classFact.methods.push(method);
    if (kind === "constructor") classFact.constructorParameters = method.params;
  } else {
    ctx.facts.functions.push(base satisfies FunctionFact);
  }

  ctx.functionStack.push(id);
  ts.forEachChild(node, (child) => visit(ctx, child));
  ctx.functionStack.pop();
}

function createClass(ctx: ExtractContext, node: ts.ClassDeclaration, name: string): ClassFact {
  const heritage = readHeritage(node.heritageClauses, ctx.sourceFile);
  return {
    name,
    typeParameters: typeParameterNames(node),
    implements: heritage.implements,
    extends: heritage.extends[0],
    abstract: hasModifier(node, ts.SyntaxKind.AbstractKeyword),
    decorators: decoratorNames(ctx, node),
    constructorParameters: [],
    methods: [],
    span: spanOf(ctx, node),
    exported: hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword),
  };
}

function createInterface(ctx: ExtractContext, node: ts.InterfaceDeclaration): InterfaceFact {
  const heritage = readHeritage(node.heritageClauses, ctx.sourceFile);
  return {
    name: node.name.text,
    typeParameters: typeParameterNames(node),
    members: node.members.flatMap((member) => {
      if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) return [];
      const name = propertyNameText(member.name, ctx.sourceFile);
      return name ? [name] : [];
    }),
    extends: heritage.extends,
    span: spanOf(ctx, node),
    exported: hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword),
  };
}

function createTypeAlias(ctx: ExtractContext, node: ts.TypeAliasDeclaration): TypeAliasFact {
  return {
    name: node.name.text,
    typeParameters: typeParameterNames(node),
    span: spanOf(ctx, node),
    exported: hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword),
  };
}

function createCallableFact(ctx: ExtractContext, node: CallableNode, name: string): CallableFact {
  const params = node.parameters.map((parameter) => parameterFact(ctx, parameter));
  const names = params.map((parameter) => parameter.name);
  const classification = classifyBody(node, names, ctx.sourceFile);
  const measured = measureCallable(node, names, ctx.sourceFile);
  return {
    name,
    params,
    typeParameters: typeParameterNames(node),
    body: classification.kind,
    ...(classification.callee ? { callee: classification.callee } : {}),
    behavioralStatements: measured.behavioral,
    structuralStatements: measured.structural,
    cyclomaticComplexity: measured.cyclomatic,
    span: spanOf(ctx, node),
    exported: callableExported(node),
  };
}

function recordLoose(ctx: ExtractContext, node: ts.Node): void {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
    ctx.facts.moduleStatements.push(spanOf(ctx, node));
  }
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const element of node.exportClause.elements) {
      ctx.exportedNames.add((element.propertyName ?? element.name).text);
    }
  }
  if (ts.isCallExpression(node) && !(node.parent && ts.isDecorator(node.parent))) {
    ctx.facts.callSites.push({
      caller: currentCaller(ctx),
      callee: node.expression.getText(ctx.sourceFile),
      calleeName: calleeName(node.expression, ctx.sourceFile),
      kind: callKind(node.expression),
      span: spanOf(ctx, node),
    });
    recordInstantiation(ctx, node.expression, node.typeArguments, node);
  }
  if (ts.isNewExpression(node)) {
    ctx.facts.constructions.push({
      caller: currentCaller(ctx),
      typeName: ts.isIdentifier(node.expression) ? node.expression.text : node.expression.getText(ctx.sourceFile),
      span: spanOf(ctx, node),
    });
    recordInstantiation(ctx, node.expression, node.typeArguments, node);
  }
  if (ts.isTypeReferenceNode(node)) recordInstantiation(ctx, node.typeName, node.typeArguments, node);
  if (ts.isExpressionWithTypeArguments(node)) recordInstantiation(ctx, node.expression, node.typeArguments, node);
  if (ts.isIdentifier(node) && !isSkippedIdentifier(node)) {
    ctx.facts.references.push({
      name: node.text,
      span: spanOf(ctx, node),
      inTypePosition: isInTypePosition(node),
    });
  }
}

function recordInstantiation(
  ctx: ExtractContext,
  nameNode: ts.Node,
  typeArguments: ts.NodeArray<ts.TypeNode> | undefined,
  owner: ts.Node,
): void {
  if (!typeArguments?.length) return;
  ctx.facts.instantiations.push({
    name: ts.isIdentifier(nameNode) ? nameNode.text : nameNode.getText(ctx.sourceFile),
    typeArguments: typeArguments.map((argument) => argument.getText(ctx.sourceFile)),
    span: spanOf(ctx, owner),
  });
}

function collectLooseStatements(ctx: ExtractContext): void {
  for (const statement of ctx.sourceFile.statements) {
    if (ts.isEmptyStatement(statement) || isSkippedTopLevel(statement)) continue;
    const measured = measureNode(statement, [], ctx.sourceFile, 0);
    const loose: LooseStatement = { span: spanOf(ctx, statement), ...measured };
    ctx.facts.looseStatements.push(loose);
  }
}

function applyExportedNames(ctx: ExtractContext): void {
  for (const item of [...ctx.facts.interfaces, ...ctx.facts.classes, ...ctx.facts.functions, ...ctx.facts.typeAliases]) {
    if (ctx.exportedNames.has(item.name)) item.exported = true;
  }
}

function resolveLocalCalls(ctx: ExtractContext): void {
  const functions = new Set(ctx.facts.functions.map((fn) => fn.name));
  const methods = new Map<string, Set<string>>();
  for (const cls of ctx.facts.classes) methods.set(cls.name, new Set(cls.methods.map((method) => method.name)));

  for (const call of ctx.facts.callSites) {
    if (call.kind === "bare" && functions.has(call.calleeName)) {
      call.localTarget = call.calleeName;
    } else if (call.kind === "this-method" && call.caller.includes(".")) {
      const className = call.caller.slice(0, call.caller.indexOf("."));
      if (methods.get(className)?.has(call.calleeName)) call.localTarget = `${className}.${call.calleeName}`;
    }
  }
}

function currentCaller(ctx: ExtractContext): string {
  return ctx.functionStack.at(-1) ?? "<file>";
}

function spanOf(ctx: ExtractContext, node: ts.Node): Span {
  return { start: node.getStart(ctx.sourceFile), end: node.end };
}

function classDeclarationName(node: ts.ClassDeclaration): string | undefined {
  if (node.name) return node.name.text;
  if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) return "default";
  return undefined;
}

function isCallable(node: ts.Node): node is CallableNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function isClassMember(node: ts.Node): boolean {
  if (
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  ) {
    return ts.isClassLike(node.parent);
  }
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isPropertyDeclaration(node.parent)) {
    return ts.isClassLike(node.parent.parent);
  }
  return false;
}

function methodKind(node: CallableNode): MethodFact["kind"] | undefined {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isGetAccessor(node)) return "getter";
  if (ts.isSetAccessor(node)) return "setter";
  if (ts.isMethodDeclaration(node)) return "method";
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent && ts.isPropertyDeclaration(node.parent)) {
    return "method";
  }
  return undefined;
}

function functionName(node: CallableNode, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isFunctionExpression(node)) &&
    node.name
  ) {
    return propertyNameText(node.name, sourceFile);
  }
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) {
    return ts.isIdentifier(node.parent.name) ? node.parent.name.text : propertyNameText(node.parent.name, sourceFile);
  }
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isPropertyDeclaration(node.parent)) {
    return propertyNameText(node.parent.name, sourceFile);
  }
  return undefined;
}

function propertyNameText(name: ts.PropertyName | ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(sourceFile);
}

function callableExported(node: ts.Node): boolean {
  if (hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword)) return true;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) {
    const statement = node.parent.parent?.parent;
    if (statement && ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) return true;
  }
  return false;
}

function typeParameterNames(node: { typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> }): string[] {
  return node.typeParameters?.map((parameter) => parameter.name.text) ?? [];
}

function parameterFact(ctx: ExtractContext, parameter: ts.ParameterDeclaration): ParameterFact {
  return {
    name: ts.isIdentifier(parameter.name) ? parameter.name.text : parameter.name.getText(ctx.sourceFile),
    ...(parameter.type ? { typeText: parameter.type.getText(ctx.sourceFile) } : {}),
    countsAsDependency: parameter.type ? countsAsDependency(parameter.type) : false,
    parameterProperty: isParameterProperty(parameter),
  };
}

function isParameterProperty(parameter: ts.ParameterDeclaration): boolean {
  return (
    hasModifier(parameter, ts.SyntaxKind.PublicKeyword) ||
    hasModifier(parameter, ts.SyntaxKind.PrivateKeyword) ||
    hasModifier(parameter, ts.SyntaxKind.ProtectedKeyword) ||
    hasModifier(parameter, ts.SyntaxKind.ReadonlyKeyword)
  );
}

function countsAsDependency(typeNode: ts.TypeNode): boolean {
  if (ts.isTypeLiteralNode(typeNode) || ts.isFunctionTypeNode(typeNode) || ts.isConstructorTypeNode(typeNode)) return false;
  if (ts.isParenthesizedTypeNode(typeNode)) return countsAsDependency(typeNode.type);
  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.some((part) => countsAsDependency(part));
  }
  return !isPrimitiveType(typeNode);
}

function isPrimitiveType(typeNode: ts.TypeNode): boolean {
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.BigIntKeyword:
    case ts.SyntaxKind.SymbolKeyword:
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.NeverKeyword:
    case ts.SyntaxKind.ObjectKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.NullKeyword:
      return true;
    default:
      break;
  }
  if (ts.isLiteralTypeNode(typeNode)) return true;
  if (ts.isParenthesizedTypeNode(typeNode)) return isPrimitiveType(typeNode.type);
  if (ts.isUnionTypeNode(typeNode)) return typeNode.types.every((part) => isPrimitiveType(part));
  if (ts.isArrayTypeNode(typeNode)) return isPrimitiveType(typeNode.elementType);
  if (ts.isTypeOperatorNode(typeNode) && typeNode.operator === ts.SyntaxKind.ReadonlyKeyword) {
    return isPrimitiveType(typeNode.type);
  }
  if (ts.isTupleTypeNode(typeNode)) {
    return typeNode.elements.every((element) => ts.isTypeNode(element) && isPrimitiveType(element));
  }
  return false;
}

function readHeritage(
  clauses: ts.NodeArray<ts.HeritageClause> | undefined,
  sourceFile: ts.SourceFile,
): { extends: HeritageRef[]; implements: HeritageRef[] } {
  const result = { extends: [] as HeritageRef[], implements: [] as HeritageRef[] };
  for (const clause of clauses ?? []) {
    const bucket = clause.token === ts.SyntaxKind.ImplementsKeyword ? result.implements : result.extends;
    for (const typeNode of clause.types) bucket.push(toHeritageRef(typeNode, sourceFile));
  }
  return result;
}

function toHeritageRef(node: ts.ExpressionWithTypeArguments, sourceFile: ts.SourceFile): HeritageRef {
  return {
    name: ts.isIdentifier(node.expression) ? node.expression.text : node.expression.getText(sourceFile),
    typeArguments: [...(node.typeArguments ?? [])].map((argument) => argument.getText(sourceFile)),
  };
}

function decoratorNames(ctx: ExtractContext, node: ts.ClassDeclaration): string[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).map((decorator) => {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression)) {
      return ts.isIdentifier(expression.expression) ? expression.expression.text : expression.expression.getText(ctx.sourceFile);
    }
    if (ts.isIdentifier(expression)) return expression.text;
    return expression.getText(ctx.sourceFile);
  });
}

function classifyBody(node: CallableNode, params: string[], sourceFile: ts.SourceFile): { kind: BodyKind; callee?: string } {
  const body = node.body;
  if (!body) return { kind: "empty" };
  if (!ts.isBlock(body)) return classifyExpression(body, params, sourceFile);
  const statements = body.statements.filter((statement) => statement.kind !== ts.SyntaxKind.EmptyStatement);
  if (statements.length === 0) return { kind: "empty" };
  if (statements.length !== 1) return { kind: "other" };
  const only = statements[0];
  if (ts.isReturnStatement(only)) return classifyExpression(only.expression, params, sourceFile);
  if (ts.isExpressionStatement(only) && ts.isCallExpression(unwrap(only.expression))) {
    const call = unwrap(only.expression) as ts.CallExpression;
    return {
      kind: forwardsArguments(call.arguments, params) ? "forward-call" : "transformed-call",
      callee: call.expression.getText(sourceFile),
    };
  }
  return { kind: "other" };
}

function classifyExpression(
  expression: ts.Expression | undefined,
  params: string[],
  sourceFile: ts.SourceFile,
): { kind: BodyKind; callee?: string } {
  if (!expression) return { kind: "empty" };
  const value = unwrap(expression);
  if (ts.isIdentifier(value)) return { kind: "return-identifier", callee: value.text };
  if (ts.isNewExpression(value)) {
    return {
      kind: "return-new",
      callee: ts.isIdentifier(value.expression) ? value.expression.text : value.expression.getText(sourceFile),
    };
  }
  if (ts.isCallExpression(value)) {
    return {
      kind: forwardsArguments(value.arguments, params) ? "forward-call" : "transformed-call",
      callee: value.expression.getText(sourceFile),
    };
  }
  return { kind: "other" };
}

function forwardsArguments(args: ts.NodeArray<ts.Expression>, params: string[]): boolean {
  if (args.length !== params.length) return false;
  return args.every((argument, index) => {
    const name = forwardedName(argument);
    return name !== undefined && name.length > 0 && name === params[index];
  });
}

function forwardedName(expression: ts.Expression): string | undefined {
  const value = unwrap(expression);
  return ts.isIdentifier(value) ? value.text : undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function measureCallable(node: CallableNode, params: string[], sourceFile: ts.SourceFile): StatementCounts {
  const body = node.body;
  if (!body) return { behavioral: 0, structural: 0, cyclomatic: 1 };
  if (!ts.isBlock(body)) {
    const counts = measureNode(body, params, sourceFile, 1);
    const classified = classifyExpression(body, params, sourceFile);
    if (classified.kind === "forward-call" || classified.kind === "return-identifier") counts.structural += 1;
    else counts.behavioral += 1;
    return counts;
  }
  return measureNode(body, params, sourceFile, 1);
}

function measureNode(root: ts.Node, params: string[], sourceFile: ts.SourceFile, cyclomaticBase: number): StatementCounts {
  const counts: StatementCounts = { behavioral: 0, structural: 0, cyclomatic: cyclomaticBase };

  function walk(node: ts.Node, activeParams: string[]): void {
    if (node !== root && isCallable(node) && functionName(node, sourceFile)) return;
    const childParams = node !== root && isCallable(node) ? node.parameters.map(parameterName) : activeParams;

    if (
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      counts.behavioral += 1;
      counts.cyclomatic += 1;
    } else if (ts.isSwitchStatement(node)) {
      counts.behavioral += 1;
    } else if (ts.isCaseClause(node)) {
      counts.cyclomatic += 1;
    } else if (ts.isCatchClause(node)) {
      counts.behavioral += 1;
      counts.cyclomatic += 1;
    } else if (ts.isThrowStatement(node) || ts.isDebuggerStatement(node)) {
      counts.behavioral += 1;
    } else if (ts.isExpressionStatement(node)) {
      const expression = unwrap(node.expression);
      if (ts.isCallExpression(expression) && forwardsArguments(expression.arguments, activeParams)) counts.structural += 1;
      else counts.behavioral += 1;
    } else if (ts.isReturnStatement(node)) {
      const kind = classifyExpression(node.expression, activeParams, sourceFile).kind;
      if (kind === "forward-call" || kind === "return-identifier") counts.structural += 1;
      else if (kind !== "empty") counts.behavioral += 1;
    } else if (ts.isVariableStatement(node)) {
      const typeOnly = node.declarationList.declarations.every((declaration) => declaration.initializer === undefined);
      if (typeOnly) counts.structural += 1;
      else counts.behavioral += 1;
    }

    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (
        operator === ts.SyntaxKind.AmpersandAmpersandToken ||
        operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        counts.cyclomatic += 1;
      }
    }
    if (ts.isConditionalExpression(node)) counts.cyclomatic += 1;
    ts.forEachChild(node, (child) => walk(child, childParams));
  }

  walk(root, params);
  return counts;
}

function parameterName(parameter: ts.ParameterDeclaration): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : "";
}

function isSkippedTopLevel(statement: ts.Statement): boolean {
  return (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isImportDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    isRecordedVariableStatement(statement)
  );
}

function isRecordedVariableStatement(statement: ts.Statement): boolean {
  if (!ts.isVariableStatement(statement)) return false;
  return statement.declarationList.declarations.every((declaration) => {
    if (!declaration.initializer || !isCallable(declaration.initializer)) return false;
    return functionName(declaration.initializer, statement.getSourceFile()) !== undefined;
  });
}

function isSkippedIdentifier(node: ts.Identifier): boolean {
  if (isDeclarationName(node) || isPropertyAccessName(node)) return true;
  return Boolean(node.parent && ts.isJsxAttribute(node.parent) && node.parent.name === node);
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isTypeParameterDeclaration(parent)) return parent.name === node;
  if (
    ts.isInterfaceDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isModuleDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isGetAccessor(parent) ||
    ts.isSetAccessor(parent) ||
    ts.isFunctionExpression(parent) ||
    ts.isClassExpression(parent)
  ) {
    return "name" in parent && parent.name === node;
  }
  if (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) return parent.name === node;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return parent.name === node;
  if (ts.isImportEqualsDeclaration(parent) || ts.isEnumMember(parent)) return parent.name === node;
  return false;
}

function isPropertyAccessName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  return false;
}

function isInTypePosition(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current) || ts.isHeritageClause(current)) return true;
    if (
      ts.isParameter(current) ||
      isCallable(current) ||
      ts.isExpressionStatement(current) ||
      ts.isCallExpression(current) ||
      ts.isNewExpression(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function callKind(expression: ts.Expression): CallKind {
  if (ts.isIdentifier(expression)) return "bare";
  if (ts.isPropertyAccessExpression(expression) && expression.expression.kind === ts.SyntaxKind.ThisKeyword) return "this-method";
  return "other";
}

function calleeName(expression: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText(sourceFile);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

function scriptKind(fileName: string, languageId: string): ts.ScriptKind {
  const lower = fileName.toLowerCase();
  if (languageId === "typescriptreact" || lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (languageId === "javascriptreact" || lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (languageId.startsWith("javascript") || /\.(c|m)?js$/.test(lower)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function languageOf(languageId: string, fileName: string): SourceLanguage {
  if (languageId.startsWith("javascript")) return "javascript";
  if (/\.(jsx|cjs|mjs|js)$/.test(fileName.toLowerCase())) return "javascript";
  return "typescript";
}
