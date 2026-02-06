'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function RegisterProtocolPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    protocolId: '',
    name: '',
    tier: 'bronze' as 'bronze' | 'silver' | 'gold',
    initialBalanceUSD: 0,
  });
  const [contracts, setContracts] = useState<string[]>([]);
  const [newContract, setNewContract] = useState('');

  const handleAddContract = () => {
    const address = newContract.trim();
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address) && !contracts.includes(address)) {
      setContracts([...contracts, address]);
      setNewContract('');
    }
  };

  const handleRemoveContract = (address: string) => {
    setContracts(contracts.filter((c) => c !== address));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/protocol/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          whitelistedContracts: contracts,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      router.push(`/protocols/${data.protocolId}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Back link */}
        <Link
          href="/protocols"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-cyan-400 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Protocols
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Register Protocol</CardTitle>
            <CardDescription>
              Add your protocol to Aegis to enable gas sponsorship for your users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Protocol ID */}
              <div className="space-y-2">
                <Label htmlFor="protocolId">Protocol ID</Label>
                <Input
                  id="protocolId"
                  placeholder="my-protocol"
                  value={formData.protocolId}
                  onChange={(e) =>
                    setFormData({ ...formData, protocolId: e.target.value.toLowerCase() })
                  }
                  pattern="^[a-zA-Z0-9_-]+$"
                  required
                />
                <p className="text-xs text-text-muted">
                  Unique identifier (letters, numbers, hyphens, underscores only)
                </p>
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="My Protocol"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {/* Tier */}
              <div className="space-y-2">
                <Label htmlFor="tier">Tier</Label>
                <Select
                  id="tier"
                  value={formData.tier}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tier: e.target.value as 'bronze' | 'silver' | 'gold',
                    })
                  }
                >
                  <SelectOption value="bronze">Bronze - Basic sponsorship</SelectOption>
                  <SelectOption value="silver">Silver - Priority sponsorship</SelectOption>
                  <SelectOption value="gold">Gold - Premium sponsorship</SelectOption>
                </Select>
              </div>

              {/* Initial Balance */}
              <div className="space-y-2">
                <Label htmlFor="balance">Initial Balance (USD)</Label>
                <Input
                  id="balance"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={formData.initialBalanceUSD || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, initialBalanceUSD: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-text-muted">
                  Optional initial deposit. You can top up later.
                </p>
              </div>

              {/* Whitelisted Contracts */}
              <div className="space-y-2">
                <Label>Whitelisted Contracts</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="0x..."
                    value={newContract}
                    onChange={(e) => setNewContract(e.target.value)}
                    pattern="^0x[a-fA-F0-9]{40}$"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddContract}
                    disabled={!newContract.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {contracts.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {contracts.map((address) => (
                      <div
                        key={address}
                        className="flex items-center justify-between bg-elevated rounded-lg px-3 py-2"
                      >
                        <code className="text-sm text-text-secondary">{address}</code>
                        <button
                          type="button"
                          onClick={() => handleRemoveContract(address)}
                          className="text-text-muted hover:text-error transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-text-muted">
                  Add contract addresses that should be eligible for sponsorship.
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="p-4 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-4">
                <Button type="submit" loading={loading} className="flex-1">
                  Register Protocol
                </Button>
                <Link href="/protocols">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
