'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language = 'typescript',
  filename,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');

  return (
    <div className={cn('relative group rounded-lg overflow-hidden', className)}>
      {/* Header with language/filename */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d1117] border-b border-border">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs text-text-muted font-mono">{filename}</span>
          )}
          {!filename && language && (
            <span className="text-xs text-text-muted uppercase">{language}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto bg-[#0d1117]">
        <pre className="p-4 text-sm font-mono text-text-secondary">
          {showLineNumbers ? (
            <code>
              {lines.map((line, i) => (
                <div key={i} className="table-row">
                  <span className="table-cell pr-4 text-text-muted select-none text-right w-8">
                    {i + 1}
                  </span>
                  <span className="table-cell">{line || ' '}</span>
                </div>
              ))}
            </code>
          ) : (
            <code>{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
}

interface InlineCodeProps {
  children: React.ReactNode;
  className?: string;
}

export function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={cn(
        'px-1.5 py-0.5 rounded bg-elevated text-coral-400 font-mono text-sm',
        className
      )}
    >
      {children}
    </code>
  );
}
