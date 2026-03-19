const fs = require("fs");
const p = "proxy.ts";
let s = fs.readFileSync(p, "utf8");

const from = `    const checkUrl = new URL("/api/subscription", req.url);`;
const to = `    const checkUrl = new URL("/api/subscription", req.url);
    checkUrl.searchParams.set("scope", "status_check");`;

s = s.replace(from, to);
fs.writeFileSync(p, s);
console.log("proxy updated");
