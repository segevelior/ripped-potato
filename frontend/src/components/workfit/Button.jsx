import { Loader2 } from "lucide-react";
import { forwardRef } from "react";

const Button = forwardRef(({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  disabled = false,
  icon,
  className = "",
  ...props
}, ref) => {
  const baseStyles = "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-offset-2";

  const variants = {
    primary: "bg-primary text-white hover:bg-gray-800 focus:ring-primary",
    secondary: "bg-secondary text-white hover:bg-indigo-700 focus:ring-secondary",
    accent: "bg-accent text-white hover:bg-accent-dark focus:ring-accent",
    outline: "border-2 border-gray-200 bg-white text-gray-900 hover:bg-gray-50 focus:ring-gray-300",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300",
    link: "bg-transparent text-accent hover:text-accent-dark underline-offset-4 hover:underline"
  };

  const sizes = {
    sm: "px-4 py-2 text-sm rounded-lg",
    md: "px-6 py-3 text-base rounded-xl",
    lg: "px-8 py-4 text-lg rounded-2xl"
  };

  const widthClass = fullWidth ? "w-full" : "";

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {!isLoading && icon && icon}
      {children}
    </button>
  );
});

Button.displayName = "Button";

export default Button;
