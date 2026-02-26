const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function (context) {
  if (process.platform !== "darwin") return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(appPath)) return;

  console.log(`Cleaning resource forks from: ${appPath}`);
  execSync(`xattr -cr "${appPath}"`, { stdio: "ignore" });
  execSync(`dot_clean "${appPath}"`, { stdio: "ignore" });
};
