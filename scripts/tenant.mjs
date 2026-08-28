// 조직(테넌트) 선택 공통 처리
// 같은 코드로 조직마다 다른 문서 폴더·하위 URL 포털을 빌드하기 위한 도우미다.
//
//   node scripts/build.mjs                          -> docs/      + site/          (세일링스톤)
//   node scripts/build.mjs --tenant docs-sovereigns -> docs-sovereigns/ + site/sovereigns/
//
// 인자를 생략하면 예전과 완전히 동일하게 동작한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// tenant.json이 없을 때 쓰는 값 (기존 세일링스톤 포털의 문구 그대로)
const DEFAULTS = {
  id: "sailingstone",
  base: "",
  siteTitle: "세일링스톤 세일즈 그룹 문서 시스템",
  eyebrow: "Sailingstone Sales Group",
  heroLine1: "세일링스톤 세일즈 그룹",
  heroLine2: "문서 시스템.",
  heroDesc: "회사소개서부터 제안서까지 - 언제나 최신 버전으로 열람하고 PDF로 받아가세요.",
  gateTitle: "세일링스톤 <b>세일즈 그룹</b><br>문서 시스템",
  footerMark: "SAILINGSTONE",
};

// argv에서 --tenant/-t 만 걷어내고 나머지 인자(문서 ID 등)는 그대로 돌려준다.
export function resolveTenant(argv = process.argv.slice(2)) {
  let dir = "docs";
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant" || a === "-t") dir = argv[++i] || dir;
    else if (a.startsWith("--tenant=")) dir = a.slice("--tenant=".length);
    else rest.push(a);
  }
  dir = dir.replace(/[\/]+$/, "");

  const docsDir = path.join(ROOT, dir);
  if (!fs.existsSync(docsDir)) {
    console.error(`조직 폴더가 없습니다: ${dir}/`);
    process.exit(1);
  }
  const cfg = path.join(docsDir, "tenant.json");
  const tenant = { ...DEFAULTS, ...(fs.existsSync(cfg) ? JSON.parse(fs.readFileSync(cfg, "utf8")) : {}) };
  const siteDir = path.join(ROOT, "site", tenant.base || "");

  return { dir, docsDir, siteDir, tenant, rest };
}
