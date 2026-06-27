'use client';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  minWidth?: string;
}

export function Button({ variant = 'primary', loading, children, className = '', minWidth, ...props }: ButtonProps) {
  const variants = {
    primary:   'btn-primary',
    secondary: 'btn-secondary',
    danger:    'btn-danger',
    ghost:     'btn-ghost',
  };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      style={minWidth ? { minWidth, ...props.style } : props.style}
      className={`btn ${variants[variant]} ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {children}
        </span>
      ) : children}
    </button>
  );
}
