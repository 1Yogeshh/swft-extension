const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Run CLI command
function runCLI(command, args = [], cwd) {
  return new Promise((resolve, reject) => {
    const cli = spawn(command, args, { cwd });

    let output = "";
    cli.stdout.on("data", (data) => {
      output += data.toString();
      console.log(data.toString());
    });

    cli.stderr.on("data", (data) => {
      console.error(data.toString()); // sirf console
    });

    cli.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(`Process exited with code ${code}`);
    });
  });
}

async function ensureSwftBackground() {
  try {
    await runCLI("npm", ["list", "-g", "swft"]);
    console.log("✅ swft CLI already installed");
  } catch {
    console.log("⚡ Installing swft CLI in background...");
    try {
      await runCLI("npm", ["install", "-g", "swft"]);
      console.log("✅ swft CLI installed successfully");
    } catch (err) {
      console.error("❌ Failed to install swft CLI:", err);
    }
  }
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
    const subfolders = fs
      .readdirSync(wsPath)
      .filter((f) => fs.statSync(path.join(wsPath, f)).isDirectory());
    for (const sub of subfolders) {
      const subPath = path.join(wsPath, sub);
      if (fs.existsSync(path.join(subPath, ".git"))) {
        repos.push({ name: sub, path: subPath });
      }
    }
  }

  return repos;
}

// Get current git branch
async function getCurrentBranch(repoPath) {
  return await runCLI("git", ["branch", "--show-current"], repoPath);
}

function activate(context) {
  const pushButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  pushButton.text = "🚀 Push Code";
  pushButton.command = "gitpush.cli";
  pushButton.show();
  context.subscriptions.push(pushButton);

  ensureSwftBackground();

  let disposable = vscode.commands.registerCommand("gitpush.cli", async () => {
    try {
      // await ensureCLIInstalled();

      // Step 0: Get git repositories
      const gitRepos = await getGitRepos();
      if (gitRepos.length === 0) {
        vscode.window.showErrorMessage("No git repositories found!");
        return;
      }

      // Step 1: Repo selection (only if multiple)
      let folder;
      if (gitRepos.length === 1) {
        folder = gitRepos[0].path;
      } else {
        const choice = await vscode.window.showQuickPick(
          gitRepos.map((r) => r.name),
          { placeHolder: "Select git repo to push" }
        );
        if (!choice) return;
        folder = gitRepos.find((r) => r.name === choice).path;
      }

      // Step 2: Commit message
      const commitMsg = await vscode.window.showInputBox({
        prompt: "Enter commit message",
        placeHolder: "e.g. fix: login issue",
      });
      if (!commitMsg) {
        vscode.window.showWarningMessage("Commit message required!");
        return;
      }

      function escapeMessage(msg) {
        return msg.replace(/(["'$`\\])/g, "\\$1");
      }
      const safeMsg = escapeMessage(commitMsg);

      // Step 3: Get current branch
      const currentBranch = await getCurrentBranch(folder);

      // Optional: show branch dropdown (only current branch)
      const branchChoice = await vscode.window.showQuickPick([currentBranch], { placeHolder: "Current branch (push will be done here)" });
      if (!branchChoice) return;

      // Step 4: Run git commands
      await runCLI("git", ["add", "."], folder);
      vscode.window.showInformationMessage(`✅ Adding all changes...`);
      const status = await runCLI("git", ["status"], folder);
      if (status.includes("nothing to commit")) {
        vscode.window.showInformationMessage("No changes to commit.");
        return;
      }

      await runCLI("git", ["commit", "-m", safeMsg], folder);
      vscode.window.showInformationMessage(`✅ Committed: "${commitMsg}"`);

      await runCLI("git", ["push", "origin", branchChoice], folder);

      vscode.window.showInformationMessage(`✅ Code pushed to ${branchChoice}`);
    } catch (err) {
      vscode.window.showErrorMessage("❌ Push Failed: " + err);
      console.error(err);
    }
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
