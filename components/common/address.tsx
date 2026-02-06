'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn, formatAddress, copyToClipboard } from '@/lib/utils';

interface AddressProps {
  address: string;
  chars?: number;
  className?: string;
  copyable?: boolean;
}

export function Address({ address, chars = 4, className, copyable = true }: AddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-sm',
        'bg-elevated px-2 py-0.5 rounded',
        className
      )}
    >
      <span className="text-text-primary">{formatAddress(address, chars)}</span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="text-text-muted hover:text-cyan-400 transition-colors"
          title="Copy address"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </span>
  );
}
