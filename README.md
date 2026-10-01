# Overengineered

Overengineered is a VS Code extension that points out code whose structure looks heavier than the problem it solves.

It reads TypeScript, JavaScript, HTML, and CSS. It measures concrete patterns such as an interface with one implementation, a chain of methods that only forward calls, wrappers that add nesting without content, or variables that only point to other variables. Then it opens a review panel with charts, evidence, and questions to ask. A finding is evidence to review. The extension does not decide that code is wrong, and it does not try to tell whether a person or a model wrote it.

Complexity is not the same as overengineering. A large function full of real decisions is complex. A small feature wrapped in five layers that each pass the call along is overengineered. Overengineered looks for the second case.

## Supported files

| Kind | Extensions | What is read |
| --- | --- | --- |
| Code | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | Classes, interfaces, functions, calls, and types |
| Markup | `.html`, `.htm` | Elements, plus every `<style>` block |
| Components | `.vue`, `.svelte` | The template and every `<style>` block, including `lang="scss"` and `lang="less"` |
| Stylesheets | `.css`, `.scss`, `.less` | Rules, declarations, custom properties, and SCSS and Less variables |

Scripts inside HTML, Vue, and Svelte files are skipped. Style blocks in other languages, such as Stylus or indented Sass, are skipped too.

## Quick start

1. Open a supported file.
2. Run one of the commands below from the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows and Linux), the editor context menu, or the Explorer context menu.
3. Read the Overengineered panel that opens beside the editor.

Analysis only runs when you run a command. Nothing is analyzed while you type.

## Commands

| Command | Where to find it | What it analyzes |
| --- | --- | --- |
| **Overengineered: Analyze Selection** | Command Palette, or **Analyze for Overengineering** in the editor context menu when text is selected | The selected code |
| **Overengineered: Analyze Function** | Command Palette or editor context menu in TypeScript and JavaScript | The function or method around the cursor |
| **Overengineered: Analyze File** | Command Palette or Explorer context menu | The whole file |

Some signals need more than a few lines. File fragmentation only runs for a whole-file analysis, and a selection that cuts through a class sees less than an analysis of the full file. In markup and stylesheets, a selection keeps the elements and rules that sit entirely inside it.

## The review panel

The panel is laid out from the overall estimate down to the individual findings.

### Summary

Three cards show the **concern** band, the **confidence** of the estimate, and the number of **complexity signals** found. Below them, the **concern estimate** gauge places the score from 0 to 100 on four bands:

| Band | Score |
| --- | --- |
| Low | 0–30 |
| Moderate | 31–60 |
| High | 61–80 |
| Very high | 81–100 |

The score estimates potential unnecessary complexity. It is not a code quality score.

When the workspace search did not finish, the panel says so, and both the estimate and the confidence stay lower.

### Overview charts

- **Signals by severity** is a donut chart with the share of high, medium, low, and info signals. The number in the center is the total.
- **Signals by type** is a bar chart with one row per kind of signal. Each bar is split by severity, so a row with one medium and two low findings shows both colors.

### Severity filter

The **Show severity** buttons above the charts filter the panel:

- **All** shows every signal.
- **High**, **Medium**, **Low**, and **Info** show only signal cards of that severity. The donut and bar charts keep their shape and dim every part that does not match, so the selected severity stands out against the full picture.

Each button shows how many signals it matches. A severity with no signals is disabled. The filter resets to **All** each time you run a new analysis.

### Code shape

This section appears for TypeScript and JavaScript.

- **Structure and behavior** splits the analyzed statements into two groups. Structural statements declare types, forward calls, or pass values through unchanged. Behavioral statements make decisions, loop, throw, or compute new values. A bar that is mostly structural means much of the code is scaffolding.
- **Measured against your settings** compares three measurements with your configured limits. A white tick marks the limit. The bar turns orange when the value goes past it.
  - **Constructor dependencies**: the most typed constructor dependencies on one class, compared with `maxDependencyCount`.
  - **Call depth**: the longest chain of local calls, compared with `maxCallDepth`.
  - **Pass-through layers**: the longest chain where each step only forwards its arguments, compared with `maxCallDepth`.

### Markup and style shape

This section appears for HTML, Vue, Svelte, CSS, SCSS, and Less. Each chart only shows when the scope has something to measure.

- **Wrappers and content** splits the elements into empty wrappers and everything else. An empty wrapper is a `div` or `span` with no attributes and no text of its own.
- **Measured against your settings** compares the deepest element with `maxNestingDepth`.
- **Declarations using !important** splits declarations into those with `!important` and the rest.

### Detected signals

Each signal card has:

- a colored **severity** badge and a matching left border,
- the kind of signal and the names involved,
- a **signal confidence** bar,
- **Evidence**: what was measured,
- **Interpretation**: what the evidence may mean,
- **Why this may still be reasonable**: common, legitimate reasons for the same shape.

Click a signal card, its title, or a name such as `recordLoose` to open that declaration in the editor and select it. When a signal names more than one symbol, each name opens its own location.

Below the cards, **Suggested questions** collects the questions worth asking about this code, such as "Is another implementation expected?"

The panel ends with the full list of raw **metrics**.

## Signals

### TypeScript and JavaScript

| Signal | What it looks for | What keeps it quiet or lowers it |
| --- | --- | --- |
| One-implementation interface | An interface implemented by exactly one class | A second implementation anywhere in the project, including a test double. Severity drops for exported interfaces, `index` files, `ports` folders, and framework decorators such as `@Injectable`. |
| Single-use abstraction | A class, interface, or function referenced exactly once | Exported declarations, React components in TSX and JSX files, and references from other files |
| Forwarding method | A method whose only statement passes its arguments to `this.dependency.method(...)` | Changed arguments, extra statements, calls to `console` or to the same object. Severity drops when the method implements an interface, since it may be an adapter. |
| Single-product factory | A `Factory` class or a `create*`, `make*`, or `build*` function that constructs one type | A factory that constructs two or more types. Confidence drops when the product's interface has another implementation. |
| Single strategy | A `Strategy` interface or class with one implementation | A second strategy |
| Many constructor dependencies | A constructor with more typed dependencies than `maxDependencyCount` | Primitive values, inline option objects, function types, and untyped JavaScript parameters do not count. Framework classes stay at medium until the count is very high. |
| Deep call chain | A local call chain longer than `maxCallDepth` | Chains whose steps do their own work stay at low severity |
| Fragmented layer files | Four or more small sibling files that share a name and split it across at least three of Factory, Builder, Strategy, Service, and Repository | Unrelated files, files with real behavior, fewer than four files, and any analysis smaller than a whole file |
| Unvarying type parameters | A generic whose explicit type arguments are always the same | A second set of type arguments anywhere in the project, or no explicit instantiations at all |
| Structure over behavior | A file where structural statements outweigh behavioral ones by more than three to one and behavior is very small | Code with real branching or computation |

Generated files (`*.generated.*`), declaration files (`*.d.ts`), and test files (`*.test.*`, `*.spec.*`) are never flagged. Test files are still read, so a mock in a test counts as a second implementation.

### HTML, CSS, and components

| Signal | What it looks for | What keeps it quiet or lowers it |
| --- | --- | --- |
| Empty wrapper chain | Two or more nested `div` or `span` elements that each wrap exactly one element and have no attributes or text. Three wrappers is medium, four or more is high. | A single wrapper, any attribute (class, id, role, `v-if`, `on:click`, and so on), text or template expressions such as `{{ }}` and `{#if}`, semantic elements such as `ul` or `section`, and wrappers with several children |
| Deep markup nesting | An element nested deeper than `maxNestingDepth` | `html`, `body`, and the Vue root `template` do not count. Elements inside `svg` and `math` are left out. Confidence is lower when no empty wrappers add to the depth. |
| Variable alias chain | Two or more variables in a row whose value is only another variable, such as `--cta-bg: var(--button-bg)` with `--button-bg: var(--color-primary)`. Works for custom properties, SCSS `$variables`, and Less `@variables`. | One alias, which often gives a token a semantic name. Values with a fallback or a calculation. Variables defined more than once, for example per theme. SCSS values marked `!default`. |
| Over-specific selectors | Selectors with five or more parts, two or more ids, or an id combined with two or more other parts, such as `#app .header h1`. Nested SCSS and Less rules are measured after nesting is resolved. | Short selectors, a single id with one class, anything inside `:where()`, and selectors built with interpolation such as `#{$root}` |
| Frequent !important | Five or more `!important` declarations. Ten or more that also make up a fifth of all declarations is medium. | Single-class utility rules where every declaration is `!important`, such as `.sr-only` or `.u-hide` |
| Repeated declaration block | Two or more rules with the same three or more declarations, in any order, inside the same at-rule. Three or more copies is medium. | Blocks of one or two declarations, different values, and copies that sit in different at-rules such as `@media print` |

Minified files (`*.min.css`, `*.min.html`), generated files (`*.generated.*`), and files inside `vendor` or `node_modules` folders are never flagged.

## Severity and confidence

**Severity** says how much a signal adds to the concern estimate: high, medium, low, or info. Info signals are shown but add nothing to the score.

**Confidence** says how sure the extension is that the evidence is complete. A signal reaches its full confidence, up to 75%, only when the workspace search finished. Without a complete search, confidence stays at 45% or lower for a file, and 40% or lower for a selection or function, because another implementation or reference may exist in a file that was not read.

Related signals are grouped before scoring. For example, an interface with one implementation, the factory that builds it, and the single-use class behind it describe one decision, so the strongest one counts in full and the others count partly. In markup, wrapper chains and deep nesting form one group, and over-specific selectors and frequent `!important` form another.

HTML and CSS signals are measured within the analyzed file, so their confidence does not depend on a workspace search. The variable alias chain keeps a lower confidence because another stylesheet may redefine one of the variables.

## Workspace search

For TypeScript and JavaScript, each command also reads up to 500 other TypeScript and JavaScript files in the workspace, skipping `node_modules`, `dist`, `out`, and `.git`. The search stops after about 2 seconds and skips files larger than about 1 MB.

- A finished search can clear a signal, for example when another file implements the same interface, or raise its confidence when nothing else was found.
- An unfinished search keeps confidence limited and the panel says so.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `overengineered.analysis.enabled` | `true` | Turns the analysis commands on or off |
| `overengineered.analysis.maxDependencyCount` | `5` | Typed constructor dependencies allowed before **Many constructor dependencies** is reported |
| `overengineered.analysis.maxCallDepth` | `4` | Call-chain length allowed before **Deep call chain** is reported |
| `overengineered.analysis.maxNestingDepth` | `12` | Element nesting depth allowed before **Deep markup nesting** is reported |
| `overengineered.analysis.singleImplementationSeverity` | `"medium"` | Severity of **One-implementation interface**: `info`, `low`, `medium`, or `high` |

The three limits also set the white tick in the **Measured against your settings** chart.

## Privacy

Analysis runs locally inside VS Code. This version does not send code anywhere and does not call an AI service. The review panel runs without scripts.

If an optional explanation model is added later, it will be off by default, it will send only the minimum relevant excerpt, and a setting will keep external analysis disabled.

## Development

```bash
npm install
npm test
npm run typecheck
npm run compile
```

Press F5 in VS Code to open an Extension Development Host with the extension loaded.

To build the Marketplace package in one step:

```bash
npm run build
```

This compiles the extension for production, fetches the TypeScript binaries, and writes `overengineered-<version>.vsix`. It bundles the TypeScript 7 compiler for macOS, Windows, and Linux on x64 and arm64, so the analysis works on each of them.
