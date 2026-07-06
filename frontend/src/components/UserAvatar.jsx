const COLORES = [
  'bg-fuchsia-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-indigo-500',
];

function colorFromName(name) {
  let hash = 0;
  for (const ch of name || '') {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return COLORES[hash % COLORES.length];
}

const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

export default function UserAvatar({ username, size = 'md', className = '' }) {
  const inicial = (username || '?').charAt(0).toUpperCase();
  const color = colorFromName(username);
  const tamano = SIZES[size] || SIZES.md;

  return (
    <div
      className={`${tamano} ${color} flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow ring-2 ring-white ${className}`}
      title={username || ''}
    >
      {inicial}
    </div>
  );
}
