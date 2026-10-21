// Substitui o placeholder do token de leitura (usado pelo auto-updater para
// baixar releases do repositório privado) no JS já compilado, logo antes de
// empacotar com o electron-builder. Isso garante que o token NUNCA fique
// salvo no código-fonte (.ts) nem no histórico do git — só no binário final.
const fs = require('node:fs');
const path = require('node:path');

const token = process.env.MRQ_UPDATE_TOKEN;
const mainJsPath = path.join(__dirname, '..', 'dist-electron', 'electron', 'main.js');

if (!token) {
  console.warn(
    '[inject-update-token] MRQ_UPDATE_TOKEN não definido no ambiente — o app será empacotado SEM capacidade de auto-atualização (placeholder mantido).'
  );
  process.exit(0);
}

if (!fs.existsSync(mainJsPath)) {
  console.error(`[inject-update-token] arquivo não encontrado: ${mainJsPath}`);
  process.exit(1);
}

let content = fs.readFileSync(mainJsPath, 'utf8');
const placeholder = '__MRQ_UPDATE_TOKEN__';
if (!content.includes(placeholder)) {
  console.warn('[inject-update-token] placeholder não encontrado (já substituído ou código mudou?)');
  process.exit(0);
}
content = content.split(placeholder).join(token);
fs.writeFileSync(mainJsPath, content, 'utf8');
console.log('[inject-update-token] token de atualização embutido com sucesso.');
