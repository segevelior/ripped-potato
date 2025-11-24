import { forwardRef } from "react";

const Link = forwardRef(({
  children,
  variant = "accent",
  size = "base",
  className = "",
  ...props
}, ref) => {
  const variants = {
    accent: "text-accent hover:text-accent-dark",
    primary: "text-primary hover:text-gray-700",
    secondary: "text-text-secondary hover:text-text-primary"
  };

  const sizes = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg"
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`font-semibold transition-colors ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

Link.displayName = "Link";

export default Link;
