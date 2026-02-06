'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { formatUSD } from '@/lib/utils';

interface Protocol {
  protocolId: string;
  name: string;
  balanceUSD: number;
  totalSpent: number;
  sponsorshipCount: number;
  tier: 'bronze' | 'silver' | 'gold';
  createdAt: string;
}

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchProtocols() {
      try {
        const res = await fetch('/api/protocol');
        if (res.ok) {
          const data = await res.json();
          setProtocols(data.protocols ?? []);
        }
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
      }
    }

    fetchProtocols();
  }, []);

  const filteredProtocols = protocols.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.protocolId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-text-primary">Protocols</h1>
            <p className="text-text-secondary mt-1">
              Manage registered protocols and their sponsorship budgets
            </p>
          </div>
          <Link href="/protocols/register">
            <Button>
              <Plus className="h-4 w-4" />
              Register Protocol
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search protocols..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Protocols table */}
        {loading ? (
          <SkeletonTable rows={5} />
        ) : filteredProtocols.length === 0 ? (
          <div className="card-agentic">
            <EmptyState
              title="No protocols found"
              description={
                search
                  ? 'Try adjusting your search query'
                  : 'Register your first protocol to get started'
              }
            >
              {!search && (
                <Link href="/protocols/register">
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    Register Protocol
                  </Button>
                </Link>
              )}
            </EmptyState>
          </div>
        ) : (
          <div className="card-agentic overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead className="text-right">Sponsorships</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProtocols.map((protocol) => (
                  <TableRow key={protocol.protocolId}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-text-primary">{protocol.name}</div>
                        <div className="text-sm text-text-muted">{protocol.protocolId}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={protocol.tier}>{protocol.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatUSD(protocol.balanceUSD)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-text-secondary">
                      {formatUSD(protocol.totalSpent)}
                    </TableCell>
                    <TableCell className="text-right text-text-secondary">
                      {protocol.sponsorshipCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/protocols/${protocol.protocolId}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
