import { ReactNode } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "sm" | "md";
  variant?: "primary" | "outline";
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  className = "",
  disabled = false,
  loading = false,
  ...rest
}) => {
  // Size Classes
  const sizeClasses = {
    sm: "px-4 py-3 text-sm",
    md: "px-5 py-3.5 text-sm",
  };

  // Variant Classes - explicit text for visibility in light and dark
  const variantClasses = {
    primary:
      "bg-primary-500 text-white shadow-theme-xs hover:bg-primary-600 disabled:bg-primary-300 disabled:opacity-60 dark:bg-primary-500 dark:text-white dark:hover:bg-primary-400 dark:disabled:bg-primary-700",
    outline:
      "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100",
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${
        disabled || loading ? "cursor-not-allowed opacity-70" : ""
      }`}
      disabled={disabled || loading}
      {...rest}
    >
      {startIcon && !loading && <span className="flex items-center">{startIcon}</span>}
      <span className="inline-flex items-center gap-2">
        {loading && (
          <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin"></span>
        )}
        {children}
      </span>
      {endIcon && !loading && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
