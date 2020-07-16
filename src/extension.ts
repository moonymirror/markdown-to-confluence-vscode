"use strict";

import * as vscode from "vscode";
import { markdownToAtlassianWikiMarkup } from "./index";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.md2confl.convert",
    function () {
      // Get the active text editor
      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const document = editor.document;

        // Get the all words
        const content = document.getText();
        const wikiMarkup = markdownToAtlassianWikiMarkup(content);
        // const escapedContents = encodeURIComponent(wikiMarkup);
        vscode.env.clipboard.writeText(wikiMarkup);
        ConvertedPanel.createOrShow(context.extensionPath, wikiMarkup);
      }
    }
  );

  context.subscriptions.push(disposable);

  if (vscode.window.registerWebviewPanelSerializer) {
    // Make sure we register a serializer in activation event
    vscode.window.registerWebviewPanelSerializer(ConvertedPanel.viewType, {
      async deserializeWebviewPanel(
        webviewPanel: vscode.WebviewPanel,
        state: any
      ) {
        console.log(`Got state: ${state}`);
        ConvertedPanel.revive(webviewPanel, context.extensionPath);
      },
    });
  }
}

/**
 * Manages converted webview panels
 */
class ConvertedPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: ConvertedPanel | undefined;

  public static readonly viewType = "md2conful";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private _disposables: vscode.Disposable[] = [];
  private _contents: string;

  public static createOrShow(extensionPath: string, contents: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (ConvertedPanel.currentPanel) {
      ConvertedPanel.currentPanel._contents = contents;
      ConvertedPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      ConvertedPanel.viewType,
      "Markdown to Confluence",
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `media` directory.
        // localResourceRoots: [
        //   vscode.Uri.file(path.join(extensionPath, "media")),
        // ],
      }
    );

    ConvertedPanel.currentPanel = new ConvertedPanel(
      panel,
      extensionPath,
      contents
    );
  }

  public static revive(panel: vscode.WebviewPanel, extensionPath: string) {
    ConvertedPanel.currentPanel = new ConvertedPanel(panel, extensionPath, "");
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionPath: string,
    contents: string
  ) {
    this._panel = panel;
    this._extensionPath = extensionPath;
    this._contents = contents;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      (e) => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "alert":
            vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public doRefactor() {
    // Send a message to the webview webview.
    // You can send any JSON serializable data.
    // this._panel.webview.postMessage({ command: "refactor" });
  }

  public dispose() {
    ConvertedPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._updateForCat(webview);
  }

  private _updateForCat(webview: vscode.Webview) {
    this._panel.title = "Markdown to Confluence";
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Local path to main script run in the webview
    // const scriptPathOnDisk = vscode.Uri.file(
    // 	path.join(this._extensionPath, 'media', 'main.js')
    // );

    // // And the uri we use to load this script in the webview
    // const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Markdown to Confluence</title>
            </head>
            <body>
                <p><pre><code id="result">${this._contents}</code></pre></p>
            </body>
            </html>`;
  }
}

function getPlainHtml() {
  // Get the active text editor
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const document = editor.document;

    // Get the all words
    const content = document.getText();
    const wikiMarkup = markdownToAtlassianWikiMarkup(content);
    return wikiMarkup;
  }
  return "";
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
