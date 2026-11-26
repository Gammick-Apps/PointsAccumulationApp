const fs = require('fs');
const path = require('path');

const KEEP = new Set(['he.pak', 'en-US.pak']);

exports.default = async function afterPack(context) {
  const dir = path.join(context.appOutDir, 'locales');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!KEEP.has(file)) fs.unlinkSync(path.join(dir, file));
  }
};
