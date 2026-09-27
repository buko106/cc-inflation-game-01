// ブラウザ用のスクリプトを Node で読み込み、globalThis.IG を返す
const path = require('node:path');

for (const f of ['decimal', 'format', 'data', 'game']) {
  require(path.join(__dirname, '..', 'js', `${f}.js`));
}

module.exports = globalThis.IG;
