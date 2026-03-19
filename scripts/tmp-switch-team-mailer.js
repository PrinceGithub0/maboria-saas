const fs = require("fs");
const p = "app/api/team/route.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace('import { sendSupportMail } from "@/lib/email/mailer";', 'import { sendInfoMail } from "@/lib/email/mailer";');
s = s.replace('    await sendSupportMail({', '    await sendInfoMail({');
fs.writeFileSync(p, s);
console.log("team mailer switched");
