import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";
const schema = execFileSync("cargo", ["run", "--offline", "--quiet", "-p", "pulse-api", "--", "openapi"], {
  cwd: new URL("../../../", import.meta.url), encoding: "utf8",
});
const result = await openapiTS(JSON.parse(schema));
writeFileSync(new URL("../lib/generated-api.ts", import.meta.url), astToString(result));
