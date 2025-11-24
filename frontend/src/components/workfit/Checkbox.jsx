import { forwardRef } from "react";

const Checkbox = forwardRef(({
  label,
  className = "",
  ...props
}, ref) => {
  return (
    <label className={`flex items-center cursor-pointer ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="w-5 h-5 text-accent border-gray-300 rounded focus:ring-accent"
        style={{ accentColor: '#FF6B52' }}
        {...props}
      />
      {label && (
        <span className="ml-3 text-base text-gray-700">{label}</span>
      )}
    </label>
  );
});

Checkbox.displayName = "Checkbox";

export default Checkbox;
