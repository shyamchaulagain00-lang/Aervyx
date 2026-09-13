const fs = require("fs");
const path = require("path");

const root = process.cwd();
const asarFile = path.join(root, "release", "win-unpacked", "resources", "app.asar");

console.log("asarFile:", asarFile);
console.log("exists:", fs.existsSync(asarFile), "size:", fs.existsSync(asarFile) ? fs.statSync(asarFile).size : "n/a");

if (!fs.existsSync(asarFile)) {
  console.log("No app.asar found.");
  process.exit(0);
}

const buf = fs.readFileSync(asarFile);
const footerSize = 8;
const footerOffset = buf.length - footerSize;
const packedLenRaw = buf.slice(footerOffset, footerOffset + 4);
const packedLen = packedLenRaw.readUInt32LE(0);
const headerOffset = buf.length - footerSize - packedLen;

console.log("total size:", buf.length, "footer size:", footerSize, "packed index length:", packedLen, "headerOffset:", headerOffset);

let indexJson = null;
try {
  const packed = buf.slice(headerOffset, footerOffset);
  const unpacked = Buffer.alloc(packedLen);
  let offset = 0;
  for (let i = 0; i < packed.length; i++) {
    const b = packed[i];
    const fl = (b & 0x0f) + ((b & 0x40) ? 9 : 0);
    const v = b & 0x80 ? (b & 0x3f) << 8 | packed[i + 1] : b & 0x3f;
    if (v === 0) {
      unpacked.writeUInt8(0, offset++);
    } else {
      offset += unpacked.writeUIntBE(v, offset, fl);
    }
  }
  indexJson = JSON.parse(unpacked.toString("utf8"));
} catch (e) {
  console.log("could not decode asar index footer:", String(e));
  process.exit(1);
}

const entries = indexJson.files || indexJson;
const flat = [];
function collect(obj, prefix) {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    const p = prefix ? prefix + "/" + key : key;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      collect(v, p);
    } else {
      flat.push(p);
    }
  }
}
collect(entries, "");

console.log("entry count:", flat.length);
console.log("\nentries sample (first 320):");
console.log(flat.slice(0, 320).join("\n"));

const hasIndex = flat.some((f) => /\/index\.html$/i.test(f));
const hasAssets = flat.some((f) => /\/assets\//i.test(f));
const hasMain = flat.some((f) => /\.main\.cjs$/i.test(f) || /\/main\.cjs$/i.test(f) || /dist-electron\/main\.cjs$/i.test(f));
const hasPreload = flat.some((f) => /\/preload\.cjs$/i.test(f));

console.log("\nhas index.html:", hasIndex);
console.log("has assets/:", hasAssets);
console.log("has main.cjs:", hasMain);
console.log("has preload.cjs:", hasPreload);

