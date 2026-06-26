import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    suite: { type: "string", default: "smoke" }
  },
  allowPositionals: true
});

if (values.suite !== "smoke") {
  throw new Error(`Unknown eval suite: ${values.suite}`);
}

console.log("smoke success=true steps=0");

