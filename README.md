# vscode-ng-tooling

Opinionated extra angular tooling for vscode.

Find it on the [marketplace](https://marketplace.visualstudio.com/items?itemName=mrahhal.vscode-ng-tooling).

## Motive

Managing importing of declarations and states in angular is a pain to do. This extension finds all modules in the app and creates a "{module}.index.ts" file that properly imports all declarations and states in your app. Which means you only need to import a single declarations/states symbol in the module. Just rerun the generate command whenever you add a new index.

[TODO: explain better what it actually does]

## Features

- Generates module index files. Recursively finds index.ts files and imports the "*_DECLARATIONS" and ui-router "*_STATES" inside of them.
- Generates svg index files and metadata.
- Generates samples index files and metadata.

## Usage

- "Ng Tooling: Generate index files" command: Regenerates all "{module}.index.ts" files and svgs/samples metadata if specified in config.
- "Ng Tooling: Scaffold component folder" context menu item on folders: Creates a new component folder with component/html/scss/index files.

## Config

Add "vscode-ng-tooling.json" file to the root of your project.

```jsonc
{
  "indent": "\t", // Optional. Default is two spaces.
  "svgsPath": "src/app/shared/svg", // Optional. Default is null.
  "samplesPath": "src/app/samples" // Optional. Default is null.
}
```

## Samples

Samples are in the `samples/` directory.
