import { ExternalLink } from 'lucide-react';
import { cn, formatAddress, getBasescanTxUrl } from '@/lib/utils';

interface TxLinkProps {
  txHash: string;
  chars?: number;
  className?: string;
  testnet?: boolean;
  showIcon?: boolean;
}

export function TxLink({
  txHash,
  chars = 6,
  className,
  testnet = false,
  showIcon = true,
}: TxLinkProps) {
  const url = getBasescanTxUrl(txHash, testnet);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-sm',
        'text-cyan-400 hover:text-cyan-300 transition-colors',
        'hover:underline underline-offset-2',
        className
      )}
    >
      <span>{formatAddress(txHash, chars)}</span>
      {showIcon && <ExternalLink className="h-3.5 w-3.5" />}
    </a>
  );
}
