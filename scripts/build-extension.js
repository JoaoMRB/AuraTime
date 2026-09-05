const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const browserDist = path.join(rootDir, 'dist', 'aura-time', 'browser');
const extensionDist = path.join(rootDir, 'dist-extension');
const manifestSrc = path.join(rootDir, 'extension', 'manifest.json');

console.log('📦 Empacotando AuraTime como Extensão de Novo Separador...');

if (!fs.existsSync(browserDist)) {
  console.error('❌ Erro: O diretório dist/aura-time/browser não foi encontrado. Execute "npm run build" primeiro.');
  process.exit(1);
}

// Cria a pasta dist-extension
if (fs.existsSync(extensionDist)) {
  fs.rmSync(extensionDist, { recursive: true, force: true });
}
fs.mkdirSync(extensionDist, { recursive: true });

// Copia todos os ficheiros de dist/aura-time/browser para dist-extension
fs.cpSync(browserDist, extensionDist, { recursive: true });

// Copia o manifest.json
fs.copyFileSync(manifestSrc, path.join(extensionDist, 'manifest.json'));

// Se existir index.csr.html, renomear ou copiar como index.html caso necessário
const indexCsr = path.join(extensionDist, 'index.csr.html');
const indexHtml = path.join(extensionDist, 'index.html');
if (fs.existsSync(indexCsr) && !fs.existsSync(indexHtml)) {
  fs.copyFileSync(indexCsr, indexHtml);
}

console.log('✅ Extensão criada com sucesso na pasta: dist-extension/');
console.log('👉 Como testar:');
console.log('   1. Abra o navegador (Chrome, Edge ou Brave) e aceda a chrome://extensions');
console.log('   2. Ative o "Modo de programador" (Developer mode)');
console.log('   3. Clique em "Carregar expandida" (Load unpacked) e selecione a pasta: dist-extension');
console.log('   4. Abra um novo separador e desfrute do seu AuraTime Focus Hub!');
