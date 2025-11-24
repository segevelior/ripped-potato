import { forwardRef } from "react";

const Input = forwardRef(({
  label,
  error,
  icon: Icon,
  rightIcon: RightIcon,
  onRightIconClick,
  className = "",
  containerClassName = "",
  ...props
}, ref) => {
  const baseStyles = "w-full px-4 py-4 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-base bg-gray-50";
  const errorStyles = error ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500" : "border-gray-200";
  const iconPadding = Icon ? "pl-12" : "";
  const rightIconPadding = RightIcon ? "pr-14" : "";

  return (
    <div className={`${containerClassName}`}>
      {label && (
        <label className="block text-base font-bold text-gray-900 mb-3">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        )}
        <input
          ref={ref}
          className={`${baseStyles} ${errorStyles} ${iconPadding} ${rightIconPadding} ${className}`}
          {...props}
        />
        {RightIcon && (
          <button
            type="button"
            onClick={onRightIconClick}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <RightIcon className="w-5 h-5" />
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
});

Input.displayName = "Input";

export default Input;
