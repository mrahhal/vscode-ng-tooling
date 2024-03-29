import * as Case from 'case';
import * as fs from 'fs';
import * as _ from 'lodash';
import { EOL } from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import * as util from 'util';
import * as vscode from 'vscode';

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const appendFile = util.promisify(fs.appendFile);
const exists = util.promisify(fs.exists);

interface Config {
  svgsPath: string | null;
  samplesPath: string | null;
  indent: string;
}

let config: Config = {
  svgsPath: null,
  samplesPath: null,
  indent: '  ',
};

async function loadConfig(context: vscode.ExtensionContext) {
  const rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const file = path.join(rootPath, 'vscode-ng-tooling.json');
  if (await exists(file)) {
    const content = (await readFile(file)).toString();
    config = { ...config, ...JSON.parse(content) };
  }
}

interface IndexFile {
  path: string;
  relativePath: string;

  declarations?: string;
  states?: string;
}

interface Symbol {
  path: string;
  name: string;
  as: string | null;
  type: string;
}

interface SvgFile {
  fileName: string;
  svgs: { name: string; selector: string }[];
}

interface ModuleFileContext {
  file: vscode.Uri;
  dir: string;
  relativeDir: string;
  basename: string;
  name: string;
  excludes: ModuleFileContext[];
}

function getModuleFileContext(moduleFile: vscode.Uri): ModuleFileContext {
  const dir = path.dirname(moduleFile.fsPath);
  const relativeDir = vscode.workspace.asRelativePath(dir);
  const basename = path.basename(moduleFile.fsPath);
  const name = basename.substring(0, basename.indexOf('.'));

  return {
    file: moduleFile,
    dir,
    relativeDir,
    basename,
    name,
    excludes: [],
  };
}

function groupBy<T, TKey>(list: T[], keyGetter: (e: T) => TKey): { key: TKey; list: T[] }[] {
  const map = new Map<any, T[]>();
  list.forEach((item) => {
    const key = keyGetter(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [item]);
    } else {
      collection.push(item);
    }
  });
  const a: { key: TKey; list: T[] }[] = [];
  for (const x of map) {
    const key = x[0];
    const list = x[1];
    a.push({ key, list });
  }
  return a;
}

function createNewFileText() {
  return `/*${EOL}` +
    ` * This file is generated by vscode-ng-tooling. Don't edit by hand.${EOL}` +
    ` */${EOL}${EOL}`;
}

class Uniquer {
  private _map: { [key: string]: number } = {};

  getCounter(key: string) {
    if (this._map[key] === undefined) {
      this._map[key] = 1;
      return null;
    } else {
      this._map[key] += 1;
      return this._map[key];
    }
  }
}

class Runner {
  constructor(
    private _progress: vscode.Progress<{ message?: string; increment?: number }>,
    private _token: vscode.CancellationToken,
  ) { }

  private get _cancelled() { return this._token.isCancellationRequested; }

  // Can't be called more than once at the same time.
  async run() {
    this._progress.report({ increment: 0 });

    const operations = [
      this.generateSvgsMetadata.bind(this),
      this.generateSamplesMetadata.bind(this),
      this.generateModuleIndexFiles.bind(this),
    ];

    for (const operation of operations) {
      if (this._cancelled) { return; }
      await operation();
    }

    this._reportProgress({ message: 'Done!' });
  }

  private _reportProgress({ message, increment }: { message?: string; increment?: number }) {
    this._progress.report({ message, increment });
  }

  private async generateSvgsMetadata() {
    if (!config.svgsPath) {
      return;
    }

    this._reportProgress({ message: 'Svgs' });

    let resultText = createNewFileText();

    const rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const svgsPath = path.join(rootPath, config.svgsPath);
    const generatedSvgIndexFile = path.join(svgsPath, `index.ts`);
    const generatedSvgInfoFile = path.join(svgsPath, `component-map.ts`);
    const svgWorkspaceFiles = await vscode.workspace.findFiles(`${config.svgsPath}/*.ts`, 'index.ts');

    let svgFiles: SvgFile[] = [];
    for (const svgWorkspaceFile of svgWorkspaceFiles) {
      const basename = path.basename(svgWorkspaceFile.fsPath);
      const fileName = basename.substring(0, basename.length - '.ts'.length);
      const content = (await readFile(svgWorkspaceFile.fsPath)).toString();
      const tsf = ts.createSourceFile(
        svgWorkspaceFile.fsPath,
        content,
        ts.ScriptTarget.Latest,
      );
      const child = tsf.getChildren()[0];
      const classes = child.getChildren().filter(n => n.kind === ts.SyntaxKind.ClassDeclaration) as ts.ClassDeclaration[];

      const svgFile: SvgFile = { fileName, svgs: [] };
      svgFiles.push(svgFile);
      for (const c of classes.filter(x => x.name!.text.startsWith('Svg'))) {
        const name = c.name!.text;
        const assignment = ((c.decorators![0].expression as ts.CallExpression).arguments[0] as ts.ObjectLiteralExpression)
          .properties.find(x => (x.name as ts.Identifier).text === 'selector') as ts.PropertyAssignment;
        const selector = (assignment.initializer as ts.LiteralExpression).text;
        svgFile.svgs.push({ name, selector });
      }

      svgFile.svgs = _.orderBy(svgFile.svgs, x => x.name);
    }
    svgFiles = _.orderBy(svgFiles.filter(x => x.svgs.length), x => x.fileName);

    for (const svgFile of svgFiles) {
      const text = svgFile.svgs.map(x => `${x.name}`).join(', ');

      resultText += `import { ${text} } from './${svgFile.fileName}';${EOL}`;
    }

    resultText += `${EOL}export const SVG_DECLARATIONS: any[] = [${EOL}`;
    for (const svgFile of svgFiles) {
      for (const svg of svgFile.svgs) {
        resultText += `${config.indent}${svg.name},${EOL}`;
      }
    }
    resultText += `];${EOL}`;

    await writeFile(generatedSvgIndexFile, resultText);

    if (this._cancelled) { return; }

    resultText = createNewFileText();
    for (const svgFile of svgFiles.filter(x => x.fileName !== 'icon')) {
      const text = svgFile.svgs.map(x => `${x.name}`).join(', ');

      resultText += `import { ${text} } from './${svgFile.fileName}';${EOL}`;
    }

    resultText += `${EOL}export const SVG_NAME_TO_COMPONENT_MAP: { [prop: string]: any } = {${EOL}`;
    for (const svgFile of svgFiles.filter(x => x.fileName !== 'icon')) {
      for (const svg of svgFile.svgs) {
        const name = svg.selector.substring('svg-'.length);
        resultText += `${config.indent}'${name}': ${svg.name},${EOL}`;
      }
    }
    resultText += `};${EOL}`;

    resultText += `${EOL}export const SVG_NAMES = Object.keys(SVG_NAME_TO_COMPONENT_MAP);${EOL}`;

    await writeFile(generatedSvgInfoFile, resultText);
  }

  private async generateSamplesMetadata() {
    if (!config.samplesPath) {
      return;
    }

    this._reportProgress({ message: 'Samples', increment: 25 });

    let resultText = createNewFileText();

    const rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const samplesPath = path.join(rootPath, config.samplesPath);
    const generatedSamplesMetadataFile = path.join(samplesPath, `metadata.ts`);
    const files = await readdir(samplesPath);
    const samples: string[] = [];

    for (const file of files) {
      if ((await stat(path.join(samplesPath, file))).isDirectory()) {
        if (file === 'shared') { continue; }

        samples.push(file);
      }
    }

    if (this._cancelled) { return; }

    resultText += `export const SAMPLES = [${EOL}`;
    for (const sample of samples) {
      resultText += `${config.indent}{ state: '${sample}', name: '${Case.title(sample)}' },${EOL}`;
    }
    resultText += `];${EOL}`;

    await writeFile(generatedSamplesMetadataFile, resultText);
  }

  private async generateModuleIndexFiles() {
    this._reportProgress({ message: 'Modules', increment: 25 });

    const moduleFiles = await vscode.workspace.findFiles('**/*.module.ts', '{**/node_modules/**,**/app.module.ts}');
    const weight = 50 / moduleFiles.length;

    const moduleFileContexts = moduleFiles.map(moduleFile => getModuleFileContext(moduleFile));

    // Compute inner excludes
    for (const moduleFile1 of moduleFileContexts) {
      for (const moduleFile2 of moduleFileContexts) {
        if (moduleFile1 == moduleFile2) continue;

        if (moduleFile1.relativeDir.startsWith(moduleFile2.relativeDir)) {
          // moduleFile1 is nested inside moduleFile2
          // We'll add moduleFile1 to the excludes of moduleFile2
          moduleFile2.excludes.push(moduleFile1);
        }
      }
    }

    for (const moduleFileContext of moduleFileContexts) {
      if (this._cancelled) { return; }

      const { dir, relativeDir, basename, name } = moduleFileContext;

      this._reportProgress({ message: `Modules (${name})`, increment: weight });

      let resultText = createNewFileText();

      var exclude = '{' + moduleFileContext.excludes.map(c => c.relativeDir + '/**').join(',') + '}';
      const moduleIndexFiles = await vscode.workspace.findFiles(relativeDir + '/**/index.ts', exclude);
      if (!moduleIndexFiles.length) { continue; }

      let indexFiles: IndexFile[] = [];

      for (const moduleIndexFile of moduleIndexFiles) {
        const content = (await readFile(moduleIndexFile.fsPath)).toString();
        const tsf = ts.createSourceFile(
          moduleIndexFile.fsPath,
          content,
          ts.ScriptTarget.Latest,
        );
        const child = tsf.getChildren()[0];
        const variables = child.getChildren().filter(n => n.kind === ts.SyntaxKind.VariableStatement);

        const relativeDir = vscode.workspace.asRelativePath(dir);
        const path = vscode.workspace.asRelativePath(moduleIndexFile.fsPath);
        let relativePath = vscode.workspace.asRelativePath(path.substring(relativeDir.length + 1, path.length - '/index.ts'.length));
        if (relativePath === '/') {
          relativePath = 'index';
        }

        const indexFile: IndexFile = {
          path: moduleIndexFile.fsPath,
          relativePath,
        };
        indexFiles.push(indexFile);

        for (const variable of variables) {
          const declaration = (variable as ts.VariableStatement).declarationList.declarations[0];
          const text = (declaration.name as ts.Identifier).text;

          if (text.endsWith('DECLARATIONS')) {
            indexFile.declarations = text;
          } else if (text.endsWith('STATES')) {
            indexFile.states = text;
          }
        }
      }

      indexFiles = _.orderBy(indexFiles, x => x.path);

      const generatedIndexFile = path.join(dir, `${name}.index.ts`);

      const symbols: Symbol[] = [];

      const uniquer = new Uniquer();
      for (const indexFile of indexFiles) {
        const add = (type: string) => {
          if ((indexFile as any)[type]) {
            const name = (indexFile as any)[type];
            const counter = uniquer.getCounter(name);
            let as = null;
            if (counter !== null) {
              as = `${name}${counter}`;
            }
            symbols.push({ path: indexFile.relativePath, name, type, as });
          }
        };

        add('declarations');
        add('states');
      }

      for (const g of _.orderBy(groupBy(symbols, x => x.path), x => x.key)) {
        const path = g.key;
        const elements = _.orderBy(g.list, x => x.name);
        const text = elements.map(x => x.as ? `${x.name} as ${x.as}` : `${x.name}`).join(', ');

        resultText += `import { ${text} } from './${path}';${EOL}`;
      }

      for (const g of _.orderBy(groupBy(symbols, x => x.type), x => x.key)) {
        const type = g.key;
        const elements = _.orderBy(g.list, x => x.name);

        resultText += `${EOL}export const ${type}: any[] = [${EOL}`;
        const destructured = type === 'states' ? '...' : '';

        for (const element of elements) {
          resultText += `${config.indent}${destructured}${element.as ?? element.name},${EOL}`;
        }

        resultText += `];${EOL}`;
      }

      if (this._cancelled) { return; }

      await writeFile(generatedIndexFile, resultText);
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  await loadConfig(context);

  context.subscriptions.push(vscode.commands.registerCommand(
    'ngTooling.scaffold',
    (uri?: vscode.Uri) => runScaffoldCommand(context, uri)));

  context.subscriptions.push(vscode.commands.registerCommand(
    'ngTooling.generate',
    () => runGenerateCommand(context)));
}

async function runGenerateCommand(context: vscode.ExtensionContext) {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Generating index files',
    cancellable: true,
  }, async (progress, token) => {
    token.onCancellationRequested(() => {
      console.log('User canceled the generate operation.');
    });

    const runner = new Runner(progress, token);
    return runner.run();
  });
}

async function runScaffoldCommand(context: vscode.ExtensionContext, uri?: vscode.Uri) {
  if (!uri) {
    return;
  }

  const value = await vscode.window.showInputBox({
    prompt: 'Folder name',
  });
  if (!value) {
    return;
  }

  const folder = path.join(uri.fsPath, value);
  await mkdir(folder);

  const f1 = path.join(folder, `${value}.component.ts`);
  const f2 = path.join(folder, `${value}.html`);
  const f3 = path.join(folder, `${value}.scss`);
  const f4 = path.join(folder, `index.ts`);
  const files = [f2, f3];

  for (const file of files) {
    await appendFile(file, '');
  }

  await appendFile(f1,
    `import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';

@Component({
${config.indent}selector: '${value}',
${config.indent}templateUrl: './${value}.html',
${config.indent}styleUrls: ['./${value}.scss'],
${config.indent}encapsulation: ViewEncapsulation.None,
${config.indent}changeDetection: ChangeDetectionStrategy.OnPush,
${config.indent}host: {
${config.indent}${config.indent}'class': '${value}',
${config.indent}},
})
export class ${Case.pascal(value)}Component implements OnInit {
${config.indent}constructor() { }

${config.indent}ngOnInit() { }
}
`);

  await appendFile(f4,
    `import { ${Case.pascal(value)}Component } from './${value}.component';

export const ${Case.constant(value)}_DECLARATIONS: any[] = [
${config.indent}${Case.pascal(value)}Component,
];
`);

  const textDocument = await vscode.workspace.openTextDocument(f1);
  if (textDocument) {
    vscode.window.showTextDocument(textDocument);
  }
}

export function deactivate() { }
