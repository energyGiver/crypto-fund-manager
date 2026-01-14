'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { apiClient } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState('0'); // 0 = full year, 1-12 = specific month
  const [network, setNetwork] = useState('ethereum');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const monthValue = parseInt(month);
      const { jobId } = await apiClient.createReport({
        address,
        year: parseInt(year),
        month: monthValue === 0 ? undefined : monthValue,
        network,
      });

      router.push(`/loading/${jobId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create report');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Cinematic background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900 via-black to-black">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
      </div>

      {/* Content - Central Column Layout */}
      <div className="relative flex justify-center">
        {/* Centered content container */}
        <div className="w-full px-6 md:px-10 py-16 sm:py-24" style={{ maxWidth: '1100px' }}>
          {/* Page Sections with Consistent Spacing */}
          <div className="space-y-16 md:space-y-20">

            {/* Section 1: Hero */}
            <section className="text-center space-y-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/10 border border-blue-600/20">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm text-blue-400 font-medium">On-chain Tax Calculator</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-tight">
              Calculate your
              <br />
              <span className="text-blue-500">crypto taxes</span>
              <br />
              in seconds
            </h1>

            <p className="text-xl text-zinc-400 leading-relaxed mx-auto">
              Automatic on-chain transaction analysis, FIFO cost basis calculation, and personalized tax-saving strategies.
            </p>

            <div className="flex flex-wrap justify-center gap-6 text-sm pt-4">
              <div className="flex items-center gap-2 text-zinc-400">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>10+ networks supported</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>FIFO cost basis</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Tax strategies included</span>
              </div>
            </div>
            </section>

            {/* Section 2: Get Started */}
            <section>
            <Card className="p-8 sm:p-10 border-0">
              <h2 className="text-2xl font-bold text-white mb-8">Get Started</h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-3">
                    Network
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setNetwork('ethereum')}
                      className={`px-4 py-3 rounded-lg border transition-all ${network === 'ethereum'
                        ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                        : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                    >
                      <div className="text-sm font-medium">Ethereum</div>
                      <div className="text-xs text-zinc-500">Mainnet</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetwork('mantle')}
                      className={`px-4 py-3 rounded-lg border transition-all ${network === 'mantle'
                        ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                        : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                    >
                      <div className="text-sm font-medium">Mantle</div>
                      <div className="text-xs text-zinc-500">Mainnet</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetwork('sepolia')}
                      className={`px-4 py-3 rounded-lg border transition-all ${network === 'sepolia'
                        ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                        : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                    >
                      <div className="text-sm font-medium">Sepolia</div>
                      <div className="text-xs text-zinc-500">Testnet</div>
                    </button>
                  </div>
                </div>

                <Input
                  label="Ethereum Address"
                  placeholder="0x..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  error={error}
                />

                <Input
                  label="Tax Year"
                  type="number"
                  min="2015"
                  max="2026"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-3">
                    Period
                  </label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="0">Full Year</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                >
                  Calculate Taxes
                </Button>
              </form>

              <div className="mt-8 pt-6 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 text-center">
                  Report generation typically takes 30-60 seconds
                </p>
              </div>
            </Card>

            {/* Feature cards */}
            <div className="grid sm:grid-cols-2 gap-4 mt-24 sm:mt-32 lg:mt-40">
              <Card hover className="p-5 border-0">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white mb-1">Automatic Classification</p>
                    <p className="text-xs text-zinc-500">Swaps, staking, airdrops & more</p>
                  </div>
                </div>
              </Card>

              <Card hover className="p-5 border-0">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white mb-1">Smart Strategies</p>
                    <p className="text-xs text-zinc-500">Loss harvesting & optimization</p>
                  </div>
                </div>
              </Card>
            </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
