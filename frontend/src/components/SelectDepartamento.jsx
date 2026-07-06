import { CIUDADES_OPCIONES } from '../constants/departamentos';

export default function SelectDepartamento({
  value,
  onChange,
  name = 'ciudad',
  required = false,
  className = '',
  placeholder = 'Selecciona departamento',
}) {
  return (
    <select
      name={name}
      required={required}
      value={value}
      onChange={onChange}
      className={className || 'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-sky-500'}
    >
      <option value="">{placeholder}</option>
      {CIUDADES_OPCIONES.map((opcion) => (
        <option key={opcion} value={opcion}>
          {opcion}
        </option>
      ))}
    </select>
  );
}
