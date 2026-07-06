const fs = require('fs');
const files = [
  'ProductoManager.jsx',
  'RolManager.jsx',
  'UsuarioManager.jsx',
  'src/components/CajaManager.jsx',
  'src/components/BitacoraManager.jsx'
];
files.forEach(file => {
  let filepath = 'c:/Users/diego/Desktop/Sistemas de Informacion/PROGRAMAS/SISTEMA_DE_INFORMACION_I/frontend/' + file;
  let content = fs.readFileSync(filepath, 'utf8');
  content = content.replace(/<div className="overflow-x-auto rounded-xl border border-slate-200">/g, '<div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">');
  fs.writeFileSync(filepath, content);
});
console.log('Done 2');
