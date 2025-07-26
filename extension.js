const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

class Dependency extends vscode.TreeItem {
  constructor(
    label,
    currentVersion,
    wantedVersion,
    latestVersion,
    isMajorUpdate
  ) {
    super(
      isMajorUpdate ? `⚠️ ${label}` : label,
      vscode.TreeItemCollapsibleState.None
    );
    this.currentVersion = currentVersion;
    this.wantedVersion = wantedVersion;
    this.latestVersion = latestVersion;
    this.tooltip =
      `Installed: ${this.currentVersion}\n` +
      `Wanted (package.json): ${this.wantedVersion}\n` +
      `Latest (npm registry): ${this.latestVersion}` +
      (isMajorUpdate ? `\n⚠️ Major update available` : "");
    this.description =
      `Installed: ${this.currentVersion} → Wanted: ${this.wantedVersion}, Latest: ${this.latestVersion}` +
      (isMajorUpdate ? " ⚠️ Major update!" : "");
    this.contextValue = "outdatedDependency";
    this.isMajorUpdate = isMajorUpdate;
    this.dependencyName = label;
  }
}

class OutdatedDependenciesProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.outdatedList = []; // store for updateAll (optional fallback)
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element) return [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showInformationMessage(
        "Open a Node.js project to check outdated dependencies."
      );
      return [];
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const packageJsonPath = path.join(rootPath, "package.json");
    const nodeModulesPath = path.join(rootPath, "node_modules");

    if (!fs.existsSync(packageJsonPath)) {
      vscode.window.showInformationMessage(
        "No package.json found in workspace."
      );
      return [];
    }

    if (!fs.existsSync(nodeModulesPath)) {
      vscode.window.showWarningMessage(
        "Run `npm install` before checking outdated packages."
      );
      return [];
    }

    vscode.window.setStatusBarMessage(
      "Node.js Updater: Checking for outdated dependencies..."
    );

    return new Promise((resolve) => {
      exec("npm outdated --json", { cwd: rootPath }, (error, stdout) => {
        vscode.window.setStatusBarMessage("");

        if (error && !stdout) {
          vscode.window.showErrorMessage(
            "npm outdated failed. Make sure Node.js is installed."
          );
          return resolve([]);
        }

        if (!stdout || stdout.trim() === "{}") {
          vscode.window.showInformationMessage(
            "Nothing to update — All dependencies are up-to-date 🎉"
          );
          this.outdatedList = [];
          return resolve([]);
        }

        try {
          const outdated = JSON.parse(stdout);
          const majorUpdates = [];
          const dependencies = Object.keys(outdated).map((depName) => {
            const dep = outdated[depName];
            const isMajorUpdate =
              dep.latest.split(".")[0] !== dep.wanted.split(".")[0];

            if (isMajorUpdate) majorUpdates.push(depName);

            return new Dependency(
              depName,
              dep.current,
              dep.wanted,
              dep.latest,
              isMajorUpdate
            );
          });

          this.outdatedList = Object.keys(outdated); // store for updateAll

          if (majorUpdates.length > 0) {
            vscode.window.showInformationMessage(
              `⚠️ Major updates available for: ${majorUpdates.join(", ")}.`
            );
          }

          resolve(dependencies);
        } catch (parseError) {
          vscode.window.showErrorMessage(
            `Failed to parse npm outdated output. ${parseError.message}`
          );
          resolve([]);
        }
      });
    });
  }

  // ✅ New method: fetches dependencies fresh (for updateAll)
  async fetchOutdatedDependencies() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];

    const rootPath = workspaceFolders[0].uri.fsPath;

    return new Promise((resolve) => {
      exec("npm outdated --json", { cwd: rootPath }, (error, stdout) => {
        if (error && !stdout) return resolve([]);

        if (!stdout) return resolve([]);

        try {
          const outdated = JSON.parse(stdout);
          return resolve(Object.keys(outdated));
        } catch {
          return resolve([]);
        }
      });
    });
  }
}

function activate(context) {
  console.log("Nodejs Updater extension activated!");

  const outdatedDependenciesProvider = new OutdatedDependenciesProvider();

  vscode.window.registerTreeDataProvider(
    "outdatedDependencies",
    outdatedDependenciesProvider
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "nodejs-updater.refreshDependencies",
      () => {
        outdatedDependenciesProvider.refresh();
        vscode.window.showInformationMessage(
          "Refreshing Node.js outdated dependencies..."
        );
      }
    ),

    vscode.commands.registerCommand(
      "nodejs-updater.updateDependency",
      (dependency) => {
        const dependencyName = dependency?.dependencyName;
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!dependencyName || !rootPath) {
          vscode.window.showErrorMessage(
            "No dependency selected or no workspace open."
          );
          return;
        }

        vscode.window.showInformationMessage(
          `Updating ${dependencyName} to latest...`
        );
        vscode.window.setStatusBarMessage(
          `Updating ${dependencyName} to latest...`,
          5000
        );

        exec(
          `npm install ${dependencyName}@latest`,
          { cwd: rootPath },
          (error, stdout, stderr) => {
            vscode.window.setStatusBarMessage("");
            if (error) {
              vscode.window.showErrorMessage(
                `Failed to update ${dependencyName}: ${stderr}`
              );
            } else {
              vscode.window.showInformationMessage(
                `${dependencyName} updated to latest.`
              );
              outdatedDependenciesProvider.refresh();
            }
          }
        );
      }
    ),

    vscode.commands.registerCommand(
      "nodejs-updater.updateAllDependencies",
      async () => {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
          vscode.window.showErrorMessage("No workspace folder open.");
          return;
        }

        // 🔄 Ensure latest dependencies are fetched before checking outdatedList
        const deps = await outdatedDependenciesProvider.getChildren();

        const allDeps = outdatedDependenciesProvider.outdatedList;
        if (!allDeps || allDeps.length === 0) {
          vscode.window.showInformationMessage(
            "[Manual Update All] No outdated dependencies found."
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          "Are you sure you want to update all outdated dependencies to their latest versions?",
          { modal: true },
          "Yes, Update All"
        );

        if (confirm !== "Yes, Update All") {
          vscode.window.showInformationMessage("Update cancelled.");
          return;
        }

        vscode.window.setStatusBarMessage(
          "Node.js Updater: Updating all dependencies...",
          5000
        );

        const installCmd = `npm install ${allDeps
          .map((dep) => `${dep}@latest`)
          .join(" ")}`;

        exec(installCmd, { cwd: rootPath }, (error, stdout, stderr) => {
          vscode.window.setStatusBarMessage("");
          if (error) {
            vscode.window.showErrorMessage(
              `Failed to update all dependencies: ${stderr}`
            );
          } else {
            vscode.window.showInformationMessage(
              "✅ All dependencies updated successfully."
            );
            outdatedDependenciesProvider.refresh();
          }
        });
      }
    ),

    vscode.commands.registerCommand(
      "nodejs-updater.ignoreDependency",
      (dependency) => {
        vscode.window.showInformationMessage(
          `Ignoring ${dependency.label} (feature not available)`
        );
      }
    ),

    vscode.commands.registerCommand(
      "nodejs-updater.openChangelog",
      (dependency) => {
        const url = `https://www.npmjs.com/package/${dependency.dependencyName}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    ),

    vscode.commands.registerCommand("nodejs-updater.showHelp", () => {
      vscode.window.showInformationMessage(
        "ℹ️ Help:\n" +
          "- Installed: Version in node_modules\n" +
          "- Wanted: Matches version range in package.json\n" +
          "- Latest: Most recent version on npm\n" +
          "⚠️ Major updates may include breaking changes."
      );
    })
  );
}

function deactivate() {
  console.log("Nodejs Updater extension deactivated.");
}

module.exports = {
  activate,
  deactivate,
};
