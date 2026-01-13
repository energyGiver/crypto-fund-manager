import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <div
      className={`
        bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6
        ${hover ? 'hover:border-zinc-700 hover:bg-zinc-900/70 transition-all duration-300' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
