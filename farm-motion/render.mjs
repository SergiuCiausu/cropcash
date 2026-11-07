// npm run build: renders all four loops, then packs them into landing-variations/img/cards.
import { execSync } from "node:child_process";

for (const id of ["margin", "bills", "costs", "reserve"]) {
  execSync(`npx remotion render src/index.jsx ${id} out/${id} --sequence --image-format=png --scale=2 --log=error`, { stdio: "inherit" });
}
execSync("python pack.py", { stdio: "inherit" });
