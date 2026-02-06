'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiEndpointProps {
  method: HttpMethod;
  path: string;
  description: string;
  parameters?: Parameter[];
  requestBody?: string;
  responseBody?: string;
  example?: {
    curl?: string;
    response?: string;
  };
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  POST: 'bg-coral-500/20 text-coral-400 border-coral-500/30',
  PUT: 'bg-warning/20 text-warning border-warning/30',
  PATCH: 'bg-warning/20 text-warning border-warning/30',
  DELETE: 'bg-error/20 text-error border-error/30',
};

export function ApiEndpoint({
  method,
  path,
  description,
  parameters,
  requestBody,
  responseBody,
  example,
}: ApiEndpointProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-elevated transition-colors"
      >
        <span
          className={cn(
            'px-2 py-1 text-xs font-bold rounded border',
            methodColors[method]
          )}
        >
          {method}
        </span>
        <code className="font-mono text-sm text-text-primary flex-1 text-left">
          {path}
        </code>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyPath();
          }}
          className="p-1 text-text-muted hover:text-text-primary"
        >
          {copiedPath ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4 bg-background">
          {/* Description */}
          <p className="text-text-secondary">{description}</p>

          {/* Parameters table */}
          {parameters && parameters.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-2">
                Parameters
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-text-muted font-medium">
                        Name
                      </th>
                      <th className="text-left py-2 px-3 text-text-muted font-medium">
                        Type
                      </th>
                      <th className="text-left py-2 px-3 text-text-muted font-medium">
                        Required
                      </th>
                      <th className="text-left py-2 px-3 text-text-muted font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parameters.map((param) => (
                      <tr key={param.name} className="border-b border-border/50">
                        <td className="py-2 px-3 font-mono text-coral-400">
                          {param.name}
                        </td>
                        <td className="py-2 px-3 font-mono text-cyan-400">
                          {param.type}
                        </td>
                        <td className="py-2 px-3">
                          {param.required ? (
                            <span className="text-coral-400">Yes</span>
                          ) : (
                            <span className="text-text-muted">No</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-text-secondary">
                          {param.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Request body */}
          {requestBody && (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-2">
                Request Body
              </h4>
              <CodeBlock code={requestBody} language="json" />
            </div>
          )}

          {/* Response body */}
          {responseBody && (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-2">
                Response
              </h4>
              <CodeBlock code={responseBody} language="json" />
            </div>
          )}

          {/* Example */}
          {example?.curl && (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-2">
                Example
              </h4>
              <CodeBlock code={example.curl} language="bash" />
            </div>
          )}

          {example?.response && (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-2">
                Example Response
              </h4>
              <CodeBlock code={example.response} language="json" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
