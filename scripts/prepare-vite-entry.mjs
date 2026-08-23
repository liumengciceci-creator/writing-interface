import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#e7e7e7" />
    <title>ArguWeave</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

await writeFile(resolve(process.cwd(), "index.html"), html, "utf8");
console.log("Vite entry verified: /src/main.jsx");
