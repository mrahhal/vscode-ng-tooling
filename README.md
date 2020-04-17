# vscode-ng-tooling

Opinionated extra angular tooling for vscode.

## Features

- Generates module index files. Recursively finds index.ts files and imports the "*_DECLARATIONS" and ui-router "*_STATES" inside of them.
- Generates svg index files and metadata.
- Generates samples index files and metadata.

## Config

Add "vscode-ng-tooling.json" file to the root of your project.

```json
{
  "svgsPath": "src/app/shared/svg", // Optional
  "samplesPath": "src/app/samples" // Optional
}
```
