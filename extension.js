const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function runCLI(command, args = [], cwd) {
  return new Promise((resolve, reject) => {
    const cli = spawn(command, args, { cwd, shell: true });

    cli.stdout.on("data", (data) => {
      vscode.window.showInformationMessage(data.toString().trim());
      console.log(data.toString());
    });

    cli.stderr.on("data", (data) => {
      vscode.window.showErrorMessage(data.toString().trim());
      console.error(data.toString());
    });

    cli.on("close", (code) => {
      if (code === 0) resolve("✅ Push completed!");
      else reject(`Process exited with code ${code}`);
    });
  });
}

// Ensure swft CLI globally installed
function ensureCLIInstalled() {
  return new Promise((resolve, reject) => {
    const check = spawn("npm", ["list", "-g", "swft"], { shell: true });
    check.on("close", (code) => {
      if (code === 0) resolve(true);
      else {
        const install = spawn("npm", ["install", "-g", "swft"], { shell: true });
        install.stdout.on("data", (data) => console.log(data.toString()));
        install.stderr.on("data", (data) => console.error(data.toString()));
        install.on("close", (code2) => {
          if (code2 === 0) resolve(true);
          else reject("Failed to install swft globally.");
        });
      }
    });
  });
}

// Scan workspace folders and subfolders for git repos
async function getGitRepos() {
  const repos = [];

  if (!vscode.workspace.workspaceFolders) return repos;

  for (const ws of vscode.workspace.workspaceFolders) {
    const wsPath = ws.uri.fsPath;

    // Workspace folder itself
    if (fs.existsSync(path.join(wsPath, ".git"))) {
      repos.push({ name: ws.name, path: wsPath });
    }

    // Subfolders
    const subfolders = fs.readdirSync(wsPath).filter(f => fs.statSync(path.join(wsPath, f)).isDirectory());
    for (const sub of subfolders) {
      const subPath = path.join(wsPath, sub);
      if (fs.existsSync(path.join(subPath, ".git"))) {
        repos.push({ name: sub, path: subPath });
      }
    }
  }

  return repos;
}

function activate(context) {
  const pushButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  pushButton.text = "🚀 Push Code";
  pushButton.command = "gitpush.cli";
  pushButton.show();
  context.subscriptions.push(pushButton);

  let disposable = vscode.commands.registerCommand("gitpush.cli", async () => {
    try {
      await ensureCLIInstalled();

      // Step 0: Get git repos
      const gitRepos = await getGitRepos();
      if (gitRepos.length === 0) {
        vscode.window.showErrorMessage("No git repositories found in workspace or subfolders!");
        return;
      }

      // Step 1: Folder selection dropdown
      const choice = await vscode.window.showQuickPick(gitRepos.map(r => r.name), { placeHolder: "Select git repo to push" });
      if (!choice) return;
      const folder = gitRepos.find(r => r.name === choice).path;

      // Step 2: Commit message input
      const commitMsg = await vscode.window.showInputBox({
        prompt: "Enter commit message",
        placeHolder: "e.g. fix: login issue"
      });
      if (!commitMsg) {
        vscode.window.showWarningMessage("Commit message required!");
        return;
      }

      // Step 3: Run CLI push
      const safeMsg = commitMsg.replace(/"/g, '\\"');
      const output = await runCLI("swft", ["push", safeMsg], folder);
      vscode.window.showInformationMessage(output);

    } catch (err) {
      vscode.window.showErrorMessage("❌ CLI Push Failed: " + err);
      console.error(err);
    }
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
