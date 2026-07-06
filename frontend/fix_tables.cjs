const fs = require('fs');

const files = [
  'CategoriaManager.jsx',
  'ClienteManager.jsx',
  'InventarioDashboard.jsx',
  'ProductoManager.jsx',
  'RolManager.jsx',
  'UsuarioManager.jsx',
  'src/components/CajaManager.jsx',
  'src/components/BitacoraManager.jsx'
];

files.forEach(file => {
  let filepath = 'c:/Users/diego/Desktop/Sistemas de Informacion/PROGRAMAS/SISTEMA_DE_INFORMACION_I/frontend/' + file;
  let content = fs.readFileSync(filepath, 'utf8');

  content = content.replace(/<table className="([^"]*)"/g, (match, p1) => {
    let classes = p1.split(' ');
    if (!classes.includes('whitespace-nowrap')) {
      classes.push('whitespace-nowrap');
    }
    return `<table className="${classes.join(' ')}"`
  });

  content = content.replace(/<div className="overflow-x-auto">/g, '<div className="overflow-x-auto max-w-full rounded-xl border border-slate-200">');
  content = content.replace(/<div className="mt-4 overflow-x-auto">/g, '<div className="mt-4 overflow-x-auto max-w-full rounded-xl border border-slate-200">');

  fs.writeFileSync(filepath, content);
});
console.log('Done');
