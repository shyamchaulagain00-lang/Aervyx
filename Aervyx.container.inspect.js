42, 0x42, 0x42, 0x42, 0x42]);
    const hasFilesMarker = filesPos >= 0;
    const hasZipLocal = zipLocal >= 0;
    const hasZipCentral = zipCentral >= 0;
    const hasTarUstar = tarUstar >= 0;
    const hasAsarFooter = asarFooterPos >= 0;

    if (hasFilesMarker && buf[0] === 0x7b) {
      out.detected = "asar-like JSON files tree or headerless JSON payload";
      try {
        const headLen = filesPos + filesMarker.length;
        const headChunk = buf.slice(0, headLen);
        const headJson = JSON.parse(headChunk.toString("utf8"));
        if (headJson && typeof headJson === "object" && headJson.files) {
          const flat = flattenTree(headJson.files);
          out.entries = flat;
          out.entryCount = flat.length;
          out.hasIndexHtml = flat.some((f) => /\/index\.html$/i.test(f));
          out.hasAssets = flat.some((f) => /\/assets\//i.test(f));
          out.hasMainCjs = flat.some((f) => /\/(dist-electron\/)?main\.cjs$/i.test(f) || /\/(dist-electron\/main)\.cjs$/i.test(f));
          out.hasPreloadCjs = flat.some((f) => /\/(dist-electron\/)?preload\.cjs$/i.test(f) || /\/(dist-electron\/preload)\.cjs$/i.test(f));
        } else {
          out.detected = "header JSON without files field";
        }
        out.sample = out.entries.slice(0, 120);
        return out;
      } catch (e) {
        out.error = "header JSON parse failed: " + String(e);
      }
    }

    if (hasZipCentral >= 0 && hasZipLocal >= 0) {
      out.detected = "zip";
      try {
        const flat = readZipEntries(absolutePath);
        out.entries = flat;
        out.entryCount = flat.length;
        out.hasIndexHtml = flat.some((f) => /\/index\.html$/i.test(f) || /\\index\.html$/i.test(f));
        out.hasAssets = flat.some((f) => /\/assets\//i.test(f) || /\\assets\\//i.test(f));
        out.hasMainCjs = flat.some((f) => /\/(dist-electron\/)?main\.cjs$/i.test(f) || /\/(dist-electron\/main)\.cjs$/i.test(f));
        out.hasPreloadCjs = flat.some((f) => /\/(dist-electron\/)?preload\.cjs$/i.test(f) || /\/(dist-electron\/preload)\.cjs$/i.test(f));
        out.sample = flat.slice(0, 120);
        return out;
      } catch (e) {
        out.error = "zip parse failed: " + String(e);
      }
    }

    if (hasTarUstar >= 0) {
      out.detected = "tar (POSIX ustar)";
      try {
        const flat = readTarEntries(absolutePath);
        out.entries = flat;
        out.entryCount = flat.length;
        out.hasIndexHtml = flat.some((f) => /\/index\.html$/i.test(f));
        out.hasAssets = flat.some((f) => /\/assets\//i.test(f));
        out.hasMainCjs = flat.some((f) => /\/(dist-electron\/)?main\.cjs$/i.test(f) || /\/(dist-electron\/main)\.cjs$/i.test(f));
        out.hasPreloadCjs = flat.some((f) => /\/(dist-electron\/)?preload\.cjs$/i.test(f) || /\/(dist-electron\/preload)\.cjs$/i.test(f));
        out.sample = flat.slice(0, 120);
        return out;
      } catch (e) {
        out.error = "tar parse failed: " + String(e);
      }
    }

    if (hasAsarFooter) {
      out.detected = "possible asar footer present";
      try {
        const index = unpackAsarIndex(buf);
        if (index && typeof index === "object") {
          const flat = flattenTree(index.files || index);
          out.entries = flat;
          out.entryCount = flat.length;
          out.hasIndexHtml = flat.some((f) => /\/index\.html$/i.test(f));
          out.hasAssets = flat.some((f) => /\/assets\//i.test(f));
          out.hasMainCjs = flat.some((f) => /\/(dist-electron\/)?main\.cjs$/i.test(f) || /\/(dist-electron\/main)\.cjs$/i.test(f));
          out.hasPreloadCjs = flat.some((f) => /\/(dist-electron\/)?preload\.cjs$/i.test(f) || /\/(dist-electron\/preload)\.cjs$/i.test(f));
          out.sample = flat.slice(0, 120);
          return out;
        }
        out.error = "asar footer index not parseable";
      } catch (e) {
        out.error = "asar footer parse failed: " + String(e);
      }
    }

    out.detected = "unknown/unrecognized container format";
    out.error = "no supported marker found";
  } catch (e) {
    out.error = String(e);
  }
  return out;
}

function main() {
  const root = process.cwd();
  const targets = [
    path.join(root, "release", "win-unpacked", "resources", "app.asar"),
    path.join(root, "release2", "win-unpacked", "resources", "app.asar"),
  ];

  console.log("workspace root:", root);
  console.log("target archives:");
  for (const t of targets) console.log(" -", t, "exists:", fs.existsSync(t));
  console.log("");

  for (const t of targets) {
    console.log("=".repeat(90));
    console.log("INSPECT:", t);
    const r = inspect(t);
    console.log(JSON.stringify(r, null, 2));
    if (r.sample.length) {
      console.log("\nSAMPLE ENTRIES:");
      console.log(r.sample.join("\n"));
    }
    console.log("");
  }
}

main();
