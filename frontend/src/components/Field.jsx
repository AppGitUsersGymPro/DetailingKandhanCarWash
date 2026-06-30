export function Field({ label, required, error, children, hint }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-medium text-gray-300 mb-1.5">
          {label} {required && <span className="text-red-400">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
      {error && <span className="block text-xs text-red-400 mt-1">{error}</span>}
    </label>
  );
}

const baseInput = 'w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-accent focus:ring-1 focus:ring-accent transition-colors disabled:opacity-50';

export function Input({ className = '', ...rest }) {
  const handleWheel = rest.type === 'number' ? (e) => e.target.blur() : undefined;
  return <input className={`${baseInput} ${className}`} onWheel={handleWheel} {...rest} />;
}

export function Textarea({ className = '', rows = 3, ...rest }) {
  return <textarea rows={rows} className={`${baseInput} resize-y ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`${baseInput} ${className}`} {...rest}>
      {children}
    </select>
  );
}
