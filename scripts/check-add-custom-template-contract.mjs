import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sidebarSource = fs.readFileSync(
  path.join(projectRoot, "src/components/Sidebar.jsx"),
  "utf8"
);
const appSource = fs.readFileSync(
  path.join(projectRoot, "src/App.jsx"),
  "utf8"
);

const checks = [
  {
    name: "自定义模块列表不再按旧版中文名称静默过滤",
    pass:
      sidebarSource.includes("...customTemplates.map(") &&
      !sidebarSource.includes('"过渡",\n          "结论",'),
  },
  {
    name: "自定义模块使用唯一 ID 作为 React 列表键",
    pass: sidebarSource.includes("? `custom-${item.id}`"),
  },
  {
    name: "新增模块完整保存名称和初始文字字段",
    pass:
      appSource.includes("template.label ||\n          template.type") &&
      appSource.includes('template.text ||\n          ""'),
  },
];

const failedChecks = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}: ${check.name}`);
}

if (failedChecks.length > 0) {
  process.exitCode = 1;
} else {
  console.log("新增自定义模块契约检查通过。");
}
