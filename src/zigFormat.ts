import * as vscode from 'vscode';
import { Range, StatusBarItem, TextEdit, OutputChannel, EndOfLine } from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

export class ZigFormatProvider implements vscode.DocumentFormattingEditProvider {
    private _channel: OutputChannel;

    constructor(logChannel: OutputChannel) {
        this._channel = logChannel;
    }

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options?: vscode.FormattingOptions,
        token?: vscode.CancellationToken,
    ): Thenable<TextEdit[]> {
        return zigFormat(document, token, this._channel)
            .then((edits) => {
                return edits;
            })
            .catch((reason) => {
                let config = vscode.workspace.getConfiguration('zig');

                this._channel.clear();
                this._channel.appendLine(reason.toString().replace(/<stdin>/gm, document.fileName));
                if (config.get<boolean>("revealOutputChannelOnFormattingError")) {
                    this._channel.show(true)
                }
                return null;
            });
    }
}

// Same as full document formatter for now
export class ZigRangeFormatProvider implements vscode.DocumentRangeFormattingEditProvider {
    private _channel: OutputChannel;

    constructor(logChannel: OutputChannel) {
        this._channel = logChannel;
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options?: vscode.FormattingOptions,
        token?: vscode.CancellationToken,
    ): Thenable<TextEdit[]> {

        return zigFormat(document, token, this._channel)
            .then((edits) => {
                return edits;
            })
            .catch((reason) => {
                let config = vscode.workspace.getConfiguration('zig');

                this._channel.clear();
                this._channel.appendLine(reason.toString().replace(/<stdin>/gm, document.fileName));
                if (config.get<boolean>("revealOutputChannelOnFormattingError")) {
                    this._channel.show(true)
                }
                return null;
            });
    }
}



const options = {
    cmdArguments: ['fmt', '--stdin', '--color', 'off'],
    notFoundText: 'Could not find zig. Please add zig to your PATH or specify a custom path to the zig binary in your settings.',
};

function runFormatter(document: vscode.TextDocument, token: vscode.CancellationToken, logger: OutputChannel, resolve: Function, reject: Function, zigPath: string) {
    let cwd = path.dirname(document.uri.fsPath);

    let stdout = '';
    let stderr = '';
        
    // Use spawn instead of exec to avoid maxBufferExceeded error
    const p = cp.spawn(zigPath, options.cmdArguments, { cwd, });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (data) => (stdout += data));
    p.stderr.on('data', (data) => (stderr += data));

    p.on('error', (err) => {
        if (err && (<any>err).code === 'ENOENT') {
            reject(options.notFoundText);
        } else {
            reject(err);
        }
    });
    token.onCancellationRequested(() => !p.killed && p.pid && process.kill(p.pid));

    p.on('close', (code) => {
        if (code !== 0) {
            reject(stderr);
            return;
        }
        logger.clear();
        
        // Via: https://github.com/golang/vscode-go/blob/64ad2e0842f20f56649330cdd437ebd368bc9421/src/goFormat.ts#L102-L107
        // Return the complete file content in the edit.
        // VS Code will calculate minimal edits to be applied
        const fileStart = new vscode.Position(0, 0);
        const fileEnd = document.lineAt(document.lineCount - 1).range.end;

        resolve([
            new TextEdit(new vscode.Range(fileStart, fileEnd), stdout),
        ]);
    });

    p.stdin.end(document.getText());
}

function zigFormat(document: vscode.TextDocument, token: vscode.CancellationToken, logger: OutputChannel) {
    const config = vscode.workspace.getConfiguration('zig');
    const zigPath = config.get<string>('zigPath') || 'zig';
        
    return new Promise<vscode.TextEdit[]>((resolve, reject) => {
        runFormatter(document, token, logger, resolve, reject, zigPath);
    });
}
